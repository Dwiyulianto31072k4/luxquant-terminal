"""Deliver the Compass alerts that already exist but never leave the server.

`compass_operational_health` does the hard part: it checks the units, Redis and
the age of the latest report, and packages the result as an `alerts` array. Its
only caller is an API route, so those alerts reach whoever happens to open the
admin page and nobody else. On 2026-09-09 that meant 23 consecutive failed runs
and 24 hours of a stale read, with the page correctly showing "Degraded" the
whole time and no one looking at it.

This worker reads the same function on a timer and sends what it finds to the
admins' Telegram. It computes nothing of its own — a second opinion about
health is a second thing to keep correct.

Quiet by design:
  • one message when the state turns bad, not one per check
  • a repeat only if it is still bad REPEAT_HOURS later
  • one message when it recovers, so silence always means healthy
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except Exception:
    pass

from sqlalchemy import text

from app.core.database import SessionLocal
from app.services.compass_operational_health import get_operational_health

REPEAT_HOURS = float(os.getenv("COMPASS_WATCHDOG_REPEAT_HOURS", "6"))
STATE = Path(os.getenv("COMPASS_WATCHDOG_STATE", "/opt/luxquant/state/compass-watchdog.json"))
WEB = (os.getenv("FRONTEND_URL") or "https://luxquant.tw").rstrip("/") + "/ai-arena"


def _log(msg: str) -> None:
    print(f"[compass-watchdog] {msg}", flush=True)


def _recipients(db) -> list[str]:
    """Admins who can actually receive a DM. No env var to drift out of date."""
    rows = db.execute(text("""
        SELECT DISTINCT telegram_id
        FROM users
        WHERE role IN ('admin', 'co_admin')
          AND telegram_id IS NOT NULL
    """)).fetchall()
    return [str(r[0]) for r in rows if r[0]]


def _send(token: str, chat_id: str, text_body: str) -> bool:
    try:
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=json.dumps({
                "chat_id": chat_id,
                "text": text_body,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            }).encode(),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=10)  # noqa: S310 (trusted URL)
        return True
    except Exception as e:
        # Never let a delivery failure take the timer down; the next run retries.
        _log(f"send to {chat_id} failed: {e}")
        return False


def _read_state() -> dict:
    try:
        return json.loads(STATE.read_text())
    except Exception:
        return {}


def _write_state(state: dict) -> None:
    try:
        STATE.parent.mkdir(parents=True, exist_ok=True)
        STATE.write_text(json.dumps(state))
    except Exception as e:
        _log(f"state write failed: {e}")


def _compose(health: dict) -> str:
    status = health.get("status", "unknown")
    alerts = health.get("alerts") or []
    latest = health.get("latest_report") or {}
    stamp = latest.get("timestamp") or "unknown"
    age = ""
    try:
        then = datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
        hours = (datetime.now(timezone.utc) - then).total_seconds() / 3600
        age = f" ({hours:.1f}h old)"
    except Exception:
        pass

    lines = [
        f"<b>AI Research {status.upper()}</b>",
        health.get("summary", ""),
        "",
        f"Latest report: {stamp}{age}",
    ]
    if alerts:
        lines.append("")
        for a in alerts[:8]:
            lines.append(f"• <b>{a.get('title')}</b> [{a.get('severity')}]")
            detail = (a.get("detail") or "").strip()
            if detail:
                lines.append(f"  {detail}")
    lines += ["", WEB]
    return "\n".join(lines)


def main() -> int:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    if not token:
        _log("TELEGRAM_BOT_TOKEN not set; nothing can be delivered")
        return 0

    db = SessionLocal()
    try:
        health = get_operational_health(db)
        status = health.get("status", "unknown")
        healthy = status == "healthy"

        state = _read_state()
        was_bad = bool(state.get("bad"))
        last_sent = state.get("sent_at")
        due = True
        if last_sent:
            try:
                due = datetime.now(timezone.utc) - datetime.fromisoformat(last_sent) >= timedelta(
                    hours=REPEAT_HOURS
                )
            except Exception:
                due = True

        if healthy and not was_bad:
            _log("healthy")
            return 0

        if healthy and was_bad:
            body = f"<b>AI Research recovered</b>\n{health.get('summary', '')}\n\n{WEB}"
        elif was_bad and not due:
            _log(f"{status}; already notified, next repeat in <{REPEAT_HOURS}h")
            return 0
        else:
            body = _compose(health)

        recipients = _recipients(db)
        if not recipients:
            _log("no admin has a telegram_id; alert has nowhere to go")
            return 0

        sent = sum(1 for chat in recipients if _send(token, chat, body))
        _log(f"{status}: notified {sent}/{len(recipients)}")
        _write_state(
            {}
            if healthy
            else {"bad": True, "status": status, "sent_at": datetime.now(timezone.utc).isoformat()}
        )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
