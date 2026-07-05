"""
DB connection watchdog — early warning before Postgres runs out of slots.

Runs every couple of minutes (systemd timer). Compares live connection count
against max_connections and:
  • logs OK / WARNING / CRITICAL to journald (always), and
  • optionally sends a Telegram alert on WARNING+ if creds are configured.

No new secrets required for the log path. To enable Telegram alerts, set in
backend/.env:
    DB_WATCHDOG_TG_TOKEN=<bot token>
    DB_WATCHDOG_TG_CHAT=<admin chat/channel id>
Thresholds (percent of max_connections) are tunable:
    DB_WATCHDOG_WARN_PCT=75
    DB_WATCHDOG_CRIT_PCT=90
"""
from __future__ import annotations

import json
import os
import urllib.request

from sqlalchemy import text

from app.core.database import engine

WARN_PCT = float(os.getenv("DB_WATCHDOG_WARN_PCT", "75"))
CRIT_PCT = float(os.getenv("DB_WATCHDOG_CRIT_PCT", "90"))
TG_TOKEN = os.getenv("DB_WATCHDOG_TG_TOKEN", "").strip()
TG_CHAT = os.getenv("DB_WATCHDOG_TG_CHAT", "").strip()


def _telegram(msg: str) -> None:
    if not (TG_TOKEN and TG_CHAT):
        return
    try:
        url = f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage"
        data = json.dumps({"chat_id": TG_CHAT, "text": msg}).encode()
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=8)  # noqa: S310 (trusted URL)
    except Exception as e:  # pragma: no cover
        print(f"[db-watchdog] telegram send failed: {e}", flush=True)


def main() -> int:
    try:
        with engine.connect() as c:
            total = int(c.execute(text("SELECT count(*) FROM pg_stat_activity")).scalar() or 0)
            active = int(c.execute(text("SELECT count(*) FROM pg_stat_activity WHERE state = 'active'")).scalar() or 0)
            idle_in_tx = int(c.execute(text("SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction'")).scalar() or 0)
            max_conn = int(c.execute(text("SHOW max_connections")).scalar())
    except Exception as e:
        print(f"[db-watchdog] check failed: {e}", flush=True)
        return 1
    finally:
        engine.dispose()  # short-lived process: release the one connection we used

    pct = round(100.0 * total / max_conn, 1) if max_conn else 0.0
    summary = f"{total}/{max_conn} ({pct:.0f}%) · active={active} · idle_in_tx={idle_in_tx}"

    if pct >= CRIT_PCT:
        msg = f"🔴 CRITICAL DB connections: {summary} — mendekati batas! Segera cek pg_stat_activity."
        print(f"[db-watchdog] {msg}", flush=True)
        _telegram(msg)
    elif pct >= WARN_PCT:
        msg = f"🟠 WARNING DB connections: {summary} — koneksi tinggi, pantau."
        print(f"[db-watchdog] {msg}", flush=True)
        _telegram(msg)
    else:
        print(f"[db-watchdog] OK: {summary}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
