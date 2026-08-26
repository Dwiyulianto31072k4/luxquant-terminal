# backend/app/services/compass_telegram.py
"""
Post each new Compass read to the Telegram group, with its PDF attached.

Why the backend's own bot
-------------------------
Unlike the social-post path — where `@luxquant_ai_bot` owns the public channel
and the backend's bot is not an administrator — `LuxQuantTerminalBot` **is** an
administrator of the member group, checked 2026-08-26 via `getChatMember`. So
this uses `TELEGRAM_BOT_TOKEN` directly and needs no second credential.

The group is a forum, so the topic is addressed with `message_thread_id`. The
on-chain forwarder already posts this way to a different topic in the same
group; this is the same mechanism, not a new integration.

One message, not two
--------------------
The PDF is sent with the preview as its **caption**. A separate text message
followed by a document reads as two posts and doubles the notification count on
a group that already carries several feeds. Telegram caps a document caption at
1024 characters, which the builder respects.

Volume
------
Reports are event-driven and ran ~10/day through August, so this is roughly ten
posts a day at the default. `COMPASS_TG_MIN_INTERVAL_MINUTES` throttles that
without touching report generation — a skipped post is only a skipped post.
"""
from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any, Optional

import requests

logger = logging.getLogger(__name__)

API = "https://api.telegram.org"
CAPTION_LIMIT = 1024

ENABLED = os.getenv("COMPASS_TG_ENABLED", "true").lower() in ("1", "true", "yes", "on")
CHAT_ID = os.getenv("COMPASS_TG_CHAT_ID", "-1002670915863")
THREAD_ID = os.getenv("COMPASS_TG_THREAD_ID", "838645")
MIN_INTERVAL_MIN = float(os.getenv("COMPASS_TG_MIN_INTERVAL_MINUTES", "0"))

# Each report is its own systemd-timer run, so throttling has to survive the
# process. A file, for the same reason the circuit breaker uses one: it must
# work when the database path is what is broken.
_STATE = Path(os.getenv("COMPASS_TG_STATE", "/opt/luxquant/state/compass-tg-last.txt"))

WEB_URL = (os.getenv("FRONTEND_URL") or "https://luxquant.tw").rstrip("/") + "/ai-arena"

_ARROW = {"bullish": "↑", "bearish": "↓", "neutral": "→"}


def _fmt_usd(v: Any) -> str:
    try:
        return f"${float(v):,.0f}"
    except (TypeError, ValueError):
        return "—"


def _pct_from(level: Any, ref: Any) -> str:
    try:
        lv, rf = float(level), float(ref)
        if rf <= 0:
            return ""
        return f" ({(lv - rf) / rf * 100:+.2f}%)"
    except (TypeError, ValueError):
        return ""


def _throttled() -> bool:
    if MIN_INTERVAL_MIN <= 0:
        return False
    try:
        last = float(_STATE.read_text().strip())
    except (OSError, ValueError):
        return False
    return (time.time() - last) < MIN_INTERVAL_MIN * 60


def _mark_sent() -> None:
    try:
        _STATE.parent.mkdir(parents=True, exist_ok=True)
        _STATE.write_text(str(time.time()))
    except OSError:
        pass  # losing the throttle costs an extra post, not a report


def _lookup_previous() -> Optional[dict]:
    """The last read we posted, and what it said.

    Used for two things at once: the message to reply to, and the "was X"
    comparison. `ai_arena_reports.previous_report_id` exists but has never been
    populated — every row is NULL — so the predecessor is simply the most recent
    entry here. The chain is strictly sequential, which is what "supersedes"
    means in this pipeline.
    """
    try:
        from sqlalchemy import text

        from app.core.database import SessionLocal
    except Exception:
        return None

    db = SessionLocal()
    try:
        row = db.execute(text("""
            SELECT p.report_id, p.message_id, p.sent_at,
                   r.report_json::jsonb->'verdict'->'tactical_24h'->>'direction'  AS direction,
                   r.report_json::jsonb->'verdict'->'tactical_24h'->>'confidence' AS confidence
              FROM compass_tg_posts p
              LEFT JOIN ai_arena_reports r ON r.report_id = p.report_id
             ORDER BY p.sent_at DESC
             LIMIT 1
        """)).first()
        if not row:
            return None
        return {
            "report_id": row.report_id,
            "message_id": int(row.message_id),
            "sent_at": row.sent_at,
            "direction": (row.direction or "").lower() or None,
            "confidence": row.confidence,
        }
    except Exception as e:
        logger.warning("previous post lookup failed: %s", e)
        return None
    finally:
        db.close()


def _record(report_id: str, message_id: int) -> None:
    try:
        from sqlalchemy import text

        from app.core.database import SessionLocal
    except Exception:
        return
    db = SessionLocal()
    try:
        db.execute(text("""
            INSERT INTO compass_tg_posts (report_id, chat_id, thread_id, message_id)
            VALUES (:r, :c, :t, :m)
            ON CONFLICT (report_id) DO UPDATE SET message_id = EXCLUDED.message_id
        """), {"r": report_id, "c": str(CHAT_ID), "t": str(THREAD_ID or ""), "m": message_id})
        db.commit()
    except Exception as e:
        logger.warning("post record failed: %s", e)
        db.rollback()
    finally:
        db.close()


def _ago(then) -> str:
    try:
        from datetime import datetime, timezone

        secs = (datetime.now(timezone.utc) - then).total_seconds()
    except Exception:
        return ""
    if secs < 3600:
        return f"{max(1, round(secs / 60))}m ago"
    if secs < 86400:
        return f"{secs / 3600:.0f}h ago"
    return f"{secs / 86400:.0f}d ago"


def build_caption(report: dict, previous: Optional[dict] = None) -> str:
    """The read, in the order someone in a group chat actually needs it.

    A revision has a different job from a first post. Ten of these arrive a day
    and most only nudge a number, so the top line has to answer "is this new
    information?" before anything else — and when the direction actually flips,
    say so instead of leaving the reader to diff two posts by eye.

    Levels sit in a monospace block so the numbers line up; in a feed of prose
    that column is what makes the post scannable.
    """
    verdict = report.get("verdict") or {}
    tac = verdict.get("tactical_24h") or {}
    sc = verdict.get("scenario_contract") or {}
    ref = sc.get("reference_price") or report.get("btc_price")

    direction = str(tac.get("direction") or "—").lower()
    conf = tac.get("confidence")
    arrow = _ARROW.get(direction, "•")
    conf_txt = f" · {int(conf)}%" if isinstance(conf, (int, float)) else ""

    prev_dir = (previous or {}).get("direction")
    flipped = bool(prev_dir and prev_dir != direction)

    lines: list[str] = []
    if previous:
        when = _ago(previous.get("sent_at"))
        why = "direction changed" if flipped else "levels refreshed"
        lines.append(f"<b>UPDATED</b> · {why}")
        lines.append(f"<i>Replaces the read from {when}</i>")
        lines.append("")

    lines.append(f"{arrow} <b>{direction.upper()}</b>{conf_txt}")
    if flipped:
        pc = (previous or {}).get("confidence")
        pc_txt = f" · {pc}%" if pc else ""
        lines.append(f"<i>was {_ARROW.get(prev_dir, '•')} {prev_dir.upper()}{pc_txt}</i>")

    if verdict.get("headline"):
        lines += ["", f"<i>{str(verdict['headline'])[:170]}</i>"]

    touch = (sc.get("primary_touch") or {}).get("level")
    inval = (sc.get("invalidation") or {}).get("level")
    rows = [("Spot", ref, "")]
    if touch:
        rows.append(("Target", touch, _pct_from(touch, ref)))
    if inval:
        rows.append(("Invalid", inval, _pct_from(inval, ref)))
    if len(rows) > 1:
        block = "\n".join(
            f"{label:<8}{_fmt_usd(value):>10}{pct}" for label, value, pct in rows
        )
        lines += ["", f"<code>{block}</code>"]

    changed = verdict.get("what_changed")
    if changed:
        lines += ["", "<b>Why this changed</b>", str(changed)[:260]]

    lines += ["", f'<a href="{WEB_URL}">Open in LuxQuant →</a>']

    caption = "\n".join(lines)
    if len(caption) > CAPTION_LIMIT:
        caption = caption[: CAPTION_LIMIT - 1].rstrip() + "…"
    return caption


def send_report(report_id: str, report: dict, pdf_path: Optional[str] = None) -> dict:
    """Post one read. Never raises — a delivery problem must not fail a report."""
    if not ENABLED:
        return {"sent": False, "reason": "disabled"}
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if not token or not CHAT_ID:
        return {"sent": False, "reason": "no_credentials"}
    if _throttled():
        return {"sent": False, "reason": "throttled"}

    previous = _lookup_previous()
    caption = build_caption(report, previous)
    data: dict[str, Any] = {
        "chat_id": CHAT_ID,
        "caption": caption,
        "parse_mode": "HTML",
    }
    if THREAD_ID:
        data["message_thread_id"] = THREAD_ID
    if previous:
        # Reply to the read this one replaces, so the group can see the
        # revision rather than two unrelated posts. Telegram quotes the parent
        # inline, which makes the lineage readable without opening anything.
        data["reply_to_message_id"] = previous["message_id"]
        # If that message was deleted, still post: a broken reply target must
        # not swallow the report.
        data["allow_sending_without_reply"] = True

    try:
        if pdf_path and Path(pdf_path).exists():
            with Path(pdf_path).open("rb") as fh:
                r = requests.post(
                    f"{API}/bot{token}/sendDocument",
                    data=data,
                    files={"document": (f"{report_id}.pdf", fh, "application/pdf")},
                    timeout=60,
                )
        else:
            # Still post the read. A missing PDF is worth less than a silent gap.
            r = requests.post(
                f"{API}/bot{token}/sendMessage",
                data={**{k: v for k, v in data.items() if k != "caption"},
                      "text": caption,
                      "disable_web_page_preview": True},
                timeout=30,
            )
        payload = r.json()
    except (requests.RequestException, ValueError) as e:
        logger.warning("compass telegram send failed: %s", e)
        return {"sent": False, "reason": str(e)[:120]}

    if not payload.get("ok"):
        return {"sent": False, "reason": payload.get("description", "unknown")}

    _mark_sent()
    mid = payload["result"]["message_id"]
    _record(report_id, mid)
    return {"sent": True, "message_id": mid, "with_pdf": bool(pdf_path),
            "replied_to": (previous or {}).get("message_id")}
