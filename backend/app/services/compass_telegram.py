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


def build_caption(report: dict) -> str:
    """The read, in the order someone actually needs it.

    Direction and price first because that is the whole question; then where it
    is going and what would break it; then why it changed, which is the part
    that distinguishes a new report from the last one. Everything else lives in
    the PDF and on the page.
    """
    verdict = report.get("verdict") or {}
    tac = verdict.get("tactical_24h") or {}
    sc = verdict.get("scenario_contract") or {}
    ref = sc.get("reference_price") or report.get("btc_price")

    direction = str(tac.get("direction") or "—").lower()
    conf = tac.get("confidence")
    arrow = _ARROW.get(direction, "•")

    lines = [
        f"{arrow} <b>{direction.upper()}</b>"
        + (f" · {int(conf)}%" if isinstance(conf, (int, float)) else ""),
        f"BTC {_fmt_usd(ref)}",
    ]

    headline = verdict.get("headline")
    if headline:
        lines += ["", f"<i>{str(headline)[:180]}</i>"]

    touch = (sc.get("primary_touch") or {}).get("level")
    inval = (sc.get("invalidation") or {}).get("level")
    if touch or inval:
        lines.append("")
        if touch:
            lines.append(f"Target  {_fmt_usd(touch)}{_pct_from(touch, ref)}")
        if inval:
            lines.append(f"Invalid {_fmt_usd(inval)}{_pct_from(inval, ref)}")

    changed = verdict.get("what_changed")
    if changed:
        lines += ["", f"<b>What changed</b> — {str(changed)[:240]}"]

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

    caption = build_caption(report)
    data: dict[str, Any] = {
        "chat_id": CHAT_ID,
        "caption": caption,
        "parse_mode": "HTML",
    }
    if THREAD_ID:
        data["message_thread_id"] = THREAD_ID

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
    return {"sent": True, "message_id": payload["result"]["message_id"],
            "with_pdf": bool(pdf_path)}
