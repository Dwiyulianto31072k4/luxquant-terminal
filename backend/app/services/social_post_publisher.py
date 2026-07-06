"""
LuxQuant Social Post Publisher

Publishes approved rows from social_posts. This module is intentionally separate
from draft generation so content still needs explicit admin approval before any
external platform call is made.
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

import requests
from sqlalchemy import text

from app.core.database import SessionLocal


CLAIM_TIMEOUT_MINUTES = int(os.environ.get("SOCIAL_POST_CLAIM_TIMEOUT_MINUTES", "30"))
DEFAULT_LIMIT = int(os.environ.get("SOCIAL_POST_PUBLISH_LIMIT", "5"))


@dataclass
class PublishResult:
    post_id: int
    platform: str
    status: str
    posted_url: Optional[str] = None
    error: Optional[str] = None


def _truncate_for_x(caption: str, hashtags: list[str], limit: int = 280) -> str:
    caption = (caption or "").strip()
    tags = " ".join(hashtags[:4]).strip()

    text_value = caption
    if tags and tags not in text_value:
        text_value = f"{text_value}\n\n{tags}" if text_value else tags

    if len(text_value) <= limit:
        return text_value

    suffix = f"\n\n{tags}" if tags else ""
    room = max(40, limit - len(suffix) - 1)
    return f"{caption[:room].rstrip()}...{suffix}"[:limit]


def _x_auth():
    try:
        from requests_oauthlib import OAuth1
    except ImportError as exc:
        raise RuntimeError("requests-oauthlib is required for X publishing") from exc

    ck = os.getenv("X_CONSUMER_KEY", "")
    cs = os.getenv("X_CONSUMER_SECRET", "")
    at = os.getenv("X_ACCESS_TOKEN", "")
    ats = os.getenv("X_ACCESS_TOKEN_SECRET", "")
    if not all([ck, cs, at, ats]):
        raise RuntimeError("X API credentials are missing")
    return OAuth1(ck, cs, at, ats)


def _upload_x_media(auth, image_path: Optional[str]) -> Optional[str]:
    if not image_path:
        return None
    path = Path(image_path)
    if not path.exists():
        raise RuntimeError(f"image file not found: {image_path}")

    with path.open("rb") as media:
        resp = requests.post(
            "https://upload.twitter.com/1.1/media/upload.json",
            auth=auth,
            files={"media": media},
            timeout=45,
        )
    if resp.status_code >= 400:
        raise RuntimeError(f"X media upload failed {resp.status_code}: {resp.text[:300]}")
    media_id = resp.json().get("media_id_string")
    if not media_id:
        raise RuntimeError("X media upload did not return media_id_string")
    return media_id


def _publish_x(row: dict) -> str:
    auth = _x_auth()
    media_id = _upload_x_media(auth, row.get("image_path"))
    tweet_text = _truncate_for_x(row.get("caption") or row.get("headline") or "", row.get("hashtags") or [])

    payload = {"text": tweet_text}
    if media_id:
        payload["media"] = {"media_ids": [media_id]}

    resp = requests.post(
        "https://api.twitter.com/2/tweets",
        auth=auth,
        json=payload,
        timeout=45,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"X tweet create failed {resp.status_code}: {resp.text[:300]}")

    tweet_id = resp.json().get("data", {}).get("id")
    if not tweet_id:
        raise RuntimeError("X tweet create did not return tweet id")
    handle = os.getenv("X_ACCOUNT_HANDLE", "luxquantcrypto").lstrip("@") or "luxquantcrypto"
    return f"https://x.com/{handle}/status/{tweet_id}"


def _publish_telegram(row: dict) -> str:
    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_SOCIAL_CHAT_ID", "") or os.getenv("TELEGRAM_CHANNEL_ID", "")
    if not token or not chat_id:
        raise RuntimeError("Telegram social bot token or chat id is missing")

    caption = (row.get("caption") or row.get("headline") or "").strip()
    image_path = row.get("image_path")

    if image_path and Path(image_path).exists():
        with Path(image_path).open("rb") as photo:
            resp = requests.post(
                f"https://api.telegram.org/bot{token}/sendPhoto",
                data={"chat_id": chat_id, "caption": caption[:1024]},
                files={"photo": photo},
                timeout=45,
            )
    else:
        resp = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": caption[:4096]},
            timeout=45,
        )

    if resp.status_code >= 400:
        raise RuntimeError(f"Telegram publish failed {resp.status_code}: {resp.text[:300]}")

    payload = resp.json()
    if not payload.get("ok"):
        raise RuntimeError(f"Telegram publish failed: {json.dumps(payload)[:300]}")
    message_id = payload.get("result", {}).get("message_id")
    return f"telegram:{chat_id}:{message_id}" if message_id else f"telegram:{chat_id}"


def publish_platform(row: dict) -> str:
    platform = (row.get("platform") or "").lower()
    if platform in {"x", "twitter"}:
        return _publish_x(row)
    if platform == "telegram":
        return _publish_telegram(row)
    raise RuntimeError(f"publisher for platform '{platform}' is not implemented")


def _claim_ready_posts(db, *, limit: int) -> list[dict]:
    rows = db.execute(text("""
        WITH picked AS (
            SELECT id
            FROM social_posts
            WHERE (
                    status = 'approved'
                    OR (status = 'publishing' AND updated_at < now() - (:claim_timeout * interval '1 minute'))
                )
              AND (scheduled_at IS NULL OR scheduled_at <= now())
            ORDER BY COALESCE(scheduled_at, created_at) ASC, id ASC
            LIMIT :limit
            FOR UPDATE SKIP LOCKED
        )
        UPDATE social_posts sp
        SET status = 'publishing',
            error_message = NULL,
            updated_at = now()
        FROM picked
        WHERE sp.id = picked.id
        RETURNING sp.id, sp.news_id, sp.platform, sp.headline, sp.caption,
                  sp.hashtags, sp.image_path, sp.source_url, sp.source_domain
    """), {
        "limit": limit,
        "claim_timeout": CLAIM_TIMEOUT_MINUTES,
    }).mappings().all()
    db.commit()
    return [dict(row) for row in rows]


def _mark_posted(db, post_id: int, posted_url: str) -> None:
    db.execute(text("""
        UPDATE social_posts
        SET status = 'posted',
            posted_at = now(),
            posted_url = :posted_url,
            error_message = NULL,
            updated_at = now()
        WHERE id = :id
    """), {"id": post_id, "posted_url": posted_url})
    db.commit()


def _mark_error(db, post_id: int, error: str) -> None:
    db.execute(text("""
        UPDATE social_posts
        SET status = 'error',
            error_message = :error,
            updated_at = now()
        WHERE id = :id
    """), {"id": post_id, "error": error[:1000]})
    db.commit()


def publish_ready_posts(*, limit: int = DEFAULT_LIMIT, dry_run: bool = False) -> list[dict]:
    db = SessionLocal()
    try:
        rows = _claim_ready_posts(db, limit=max(1, min(limit, 25)))
        results: list[PublishResult] = []

        for row in rows:
            post_id = int(row["id"])
            platform = row.get("platform") or ""

            if dry_run:
                db.execute(text("""
                    UPDATE social_posts
                    SET status = 'approved',
                        updated_at = now()
                    WHERE id = :id AND status = 'publishing'
                """), {"id": post_id})
                db.commit()
                results.append(PublishResult(post_id, platform, "dry_run"))
                continue

            try:
                posted_url = publish_platform(row)
                _mark_posted(db, post_id, posted_url)
                results.append(PublishResult(post_id, platform, "posted", posted_url=posted_url))
            except Exception as exc:
                error = f"{type(exc).__name__}: {exc}"
                _mark_error(db, post_id, error)
                results.append(PublishResult(post_id, platform, "error", error=error))

        return [r.__dict__ for r in results]
    finally:
        db.close()


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Publish approved LuxQuant social posts")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    result = publish_ready_posts(limit=args.limit, dry_run=args.dry_run)
    print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
