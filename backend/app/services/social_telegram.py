# backend/app/services/social_telegram.py
"""
Send one social-post draft to the public Telegram channel, on demand.

Why this is not `social_post_publisher._publish_telegram`
--------------------------------------------------------
That path publishes *approved* rows in a batch, keyed on `row["platform"]`, and
resolves its bot from `TELEGRAM_BOT_TOKEN`. Neither fits here:

  · Every social post is `platform='x'`. Sending one to Telegram is a second
    destination for the same draft, not a change of platform, so it must not
    touch the X pipeline's status.
  · **The backend's bot is not an administrator of the channel.** Checked
    2026-08-25: `getChatMember` returns "member list is inaccessible" for it,
    while `@luxquant_ai_bot` — the x-poster's bot — is `administrator` with
    `can_post_messages: true`. Sending with the wrong token fails at Telegram,
    not here.

Where the credentials come from
-------------------------------
Env first, so this can be pointed elsewhere later. Otherwise the x-poster's own
`.env`, read **from disk at call time**. Two reasons that is the right default
rather than a hack:

  · The backend takes its environment from a systemd `EnvironmentFile`, and
    `systemctl reload` does not re-read it — only `restart` does, which 502s the
    whole site. Reading the file avoids needing either.
  · That file is the single place the channel's token is maintained. Bot tokens
    here have been rotated before; following the file means this keeps working
    the moment the worker does, instead of silently posting with a dead token.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Optional

import requests

logger = logging.getLogger(__name__)

# Telegram's hard cap for a photo caption. Past it the post goes out as text
# with the poster as a large link preview above it, so it stays ONE message
# instead of an image with the writing bolted on underneath.
CAPTION_LIMIT = 1024
TEXT_LIMIT = 4096

# The worker that already posts to this channel, and therefore owns the token.
XPOSTER_ENV = Path(os.getenv("XPOSTER_ENV_PATH", "/root/luxquant-x-poster/.env"))

# Rendered posters are served from here, and the same directory is mounted
# publicly at /api/v1/social-post-images — which is what lets a long post go out
# as ONE message instead of a photo with the text bolted on underneath.
ASSETS_DIR = Path(os.getenv("SOCIAL_POST_ASSETS_DIR", "/opt/luxquant/social-posts"))
PUBLIC_BASE = (os.getenv("FRONTEND_URL") or "https://luxquant.tw").rstrip("/")

API = "https://api.telegram.org"


def _read_env_file(path: Path) -> dict:
    """Minimal KEY=VALUE reader. Deliberately not python-dotenv: this must never
    mutate the process environment, only look something up."""
    out: dict[str, str] = {}
    try:
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return out


def resolve_channel() -> tuple[Optional[str], Optional[str]]:
    """(bot token, chat id) for the public channel, or (None, None)."""
    token = os.getenv("TELEGRAM_SOCIAL_BOT_TOKEN") or ""
    chat = os.getenv("TELEGRAM_SOCIAL_CHAT_ID") or ""

    if not token or not chat:
        env = _read_env_file(XPOSTER_ENV)
        token = token or env.get("TG_BOT_TOKEN", "")
        chat = chat or env.get("TG_TARGET_CHANNEL", "")

    if chat and not chat.startswith("-") and not chat.startswith("@"):
        # `TG_TARGET_CHANNEL` is stored as a bare username.
        chat = f"@{chat}"
    return (token or None, chat or None)


def channel_status() -> dict:
    """What the UI needs to decide whether the button can work at all, without
    making the admin discover a missing token by pressing it."""
    token, chat = resolve_channel()
    if not token or not chat:
        return {"ready": False, "reason": "no_credentials"}
    try:
        r = requests.get(f"{API}/bot{token}/getChat", params={"chat_id": chat}, timeout=15)
        d = r.json()
        if not d.get("ok"):
            return {"ready": False, "reason": d.get("description", "unreachable")}
        res = d.get("result", {})
        return {
            "ready": True,
            "chat_id": res.get("id"),
            "title": res.get("title"),
            "username": res.get("username"),
        }
    except requests.RequestException as e:
        return {"ready": False, "reason": str(e)[:120]}


def public_image_url(image_path: Optional[str]) -> Optional[str]:
    """The poster's own https URL, or None if it is not under the served dir."""
    if not image_path:
        return None
    try:
        rel = os.path.relpath(image_path, ASSETS_DIR)
    except ValueError:
        return None
    if rel.startswith(".."):
        return None
    return f"{PUBLIC_BASE}/api/v1/social-post-images/{rel}"


def _api(token: str, method: str, **kw) -> dict:
    r = requests.post(f"{API}/bot{token}/{method}", timeout=60, **kw)
    try:
        payload = r.json()
    except ValueError:
        raise RuntimeError(f"Telegram {method} returned non-JSON ({r.status_code})")
    if not payload.get("ok"):
        raise RuntimeError(
            f"Telegram {method} failed: {payload.get('description') or json.dumps(payload)[:200]}"
        )
    return payload


def send_post(row: dict) -> dict:
    """Send one draft to the channel. Returns what was sent, for the audit row.

    Raises RuntimeError with Telegram's own wording on failure — an admin
    pressing a button deserves the real reason, not "something went wrong".
    """
    token, chat = resolve_channel()
    if not token or not chat:
        raise RuntimeError(
            "No Telegram channel credentials. Set TELEGRAM_SOCIAL_BOT_TOKEN and "
            "TELEGRAM_SOCIAL_CHAT_ID, or make sure the x-poster .env is readable."
        )

    text = (row.get("caption") or row.get("headline") or "").strip()
    if not text:
        raise RuntimeError("This post has no caption to send.")

    image_path = row.get("image_path")
    has_image = bool(image_path) and Path(image_path).exists()

    if not has_image:
        res = _api(token, "sendMessage", json={"chat_id": chat, "text": text[:TEXT_LIMIT]})
        mid = res["result"]["message_id"]
        return {"message_id": mid, "chat_id": chat, "with_image": False, "split": False}

    if len(text) <= CAPTION_LIMIT:
        with Path(image_path).open("rb") as fh:
            res = _api(
                token, "sendPhoto",
                data={"chat_id": chat, "caption": text},
                files={"photo": (Path(image_path).name, fh, "image/png")},
            )
        return {
            "message_id": res["result"]["message_id"],
            "chat_id": chat, "with_image": True, "split": False,
        }

    # ── Over the 1024-character caption cap ──────────────────────────────
    # A photo plus a reply is two messages, and it reads as two: the image
    # floats alone and the writing arrives quoting it. Instead, send the text —
    # which may run to 4096 — and let the poster ride above it as a large link
    # preview. One message, image on top, caption whole underneath.
    #
    # `url` does not have to appear in the text (Bot API 7.0), so nothing is
    # added to the copy to make this work.
    url = public_image_url(image_path)
    if url:
        try:
            res = _api(token, "sendMessage", json={
                "chat_id": chat,
                "text": text[:TEXT_LIMIT],
                "link_preview_options": {
                    "url": url,
                    "prefer_large_media": True,
                    "show_above_text": True,
                },
            })
            return {
                "message_id": res["result"]["message_id"],
                "chat_id": chat, "with_image": True, "split": False, "preview": True,
            }
        except RuntimeError as e:
            # Older Bot API, or a preview Telegram declined to build. Falling
            # through is better than failing: two messages beat none.
            logger.warning("link-preview send failed, falling back to photo+reply: %s", e)

    with Path(image_path).open("rb") as fh:
        photo = _api(
            token, "sendPhoto",
            data={"chat_id": chat},
            files={"photo": (Path(image_path).name, fh, "image/png")},
        )
    mid = photo["result"]["message_id"]
    _api(token, "sendMessage", json={
        "chat_id": chat,
        "text": text[:TEXT_LIMIT],
        "reply_to_message_id": mid,
        # If the photo were deleted between the two calls, still send the text
        # rather than lose the post entirely.
        "allow_sending_without_reply": True,
    })
    return {"message_id": mid, "chat_id": chat, "with_image": True, "split": True}


def message_url(chat_id, message_id) -> Optional[str]:
    """A t.me link, when the chat is public enough to have one."""
    if not message_id:
        return None
    s = str(chat_id)
    if s.startswith("@"):
        return f"https://t.me/{s[1:]}/{message_id}"
    if s.startswith("-100"):
        return f"https://t.me/c/{s[4:]}/{message_id}"
    return None
