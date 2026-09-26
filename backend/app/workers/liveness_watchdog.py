"""Tell the admins when a worker's loop stops turning while systemd says "active".

Every worker listed in WORKERS calls `app.core.liveness.beat()` on each turn of
its loop. This oneshot (luxquant-liveness-watchdog.timer, every 5 minutes)
compares each beat's age with that worker's allowance and DMs the admins on
Telegram when a worker has stalled or its unit is down.

Quiet by design, like the Compass watchdog:
  • one message when a worker turns bad, not one per check
  • a reminder only if it is still bad REPEAT_HOURS later
  • one message when it recovers, so silence means healthy

A worker that has just (re)started gets its full allowance before a missing
beat counts, so a deploy never pages anyone.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except Exception:
    pass

from sqlalchemy import text

from app.core.database import SessionLocal
from app.core.liveness import last_beat

# name → (systemd unit, seconds of silence allowed). The allowance covers the
# worker's slowest healthy turn, not its poll interval: an enrichment batch can
# run for many minutes, a Shariah sweep calls an LLM.
WORKERS: dict[str, tuple[str, int]] = {
    "journey-worker": ("luxquant-journey-worker.service", 10 * 60),
    "enrichment-v3": ("luxquant-enrichment-v3.service", 30 * 60),
    "coin-metadata": ("luxquant-coin-metadata.service", 20 * 60),
    "shariah-screening": ("luxquant-shariah-screening.service", 60 * 60),
    "notif-producer": ("luxquant-notif-producer.service", 15 * 60),
    "btc-correlation": ("luxquant-btc-correlation-worker.service", 30 * 60),
    "tg-delivery": ("luxquant-tg-delivery.service", 20 * 60),
    "delisting": ("luxquant-delisting-worker.service", 30 * 60),
}

REPEAT_HOURS = float(os.getenv("LIVENESS_WATCHDOG_REPEAT_HOURS", "6"))
STATE = Path(os.getenv("LIVENESS_WATCHDOG_STATE", "/opt/luxquant/state/liveness-watchdog.json"))


def _log(msg: str) -> None:
    print(f"[liveness-watchdog] {msg}", flush=True)


def _unit(unit: str) -> tuple[str, float | None]:
    """(ActiveState, seconds since it entered that state) for a systemd unit."""
    try:
        out = subprocess.run(
            ["systemctl", "show", unit, "-p", "ActiveState", "-p", "ActiveEnterTimestampMonotonic"],
            capture_output=True, text=True, timeout=10,
        ).stdout
    except Exception:
        return "unknown", None
    props = dict(line.split("=", 1) for line in out.splitlines() if "=" in line)
    since = None
    try:
        # systemd stamps CLOCK_MONOTONIC in µs — the clock time.monotonic() reads,
        # so no wall-clock or timezone arithmetic is involved.
        entered = int(props.get("ActiveEnterTimestampMonotonic") or 0)
        if entered > 0:
            since = time.monotonic() - entered / 1e6
    except ValueError:
        since = None
    return props.get("ActiveState", "unknown"), since


def verdict(active_state: str, up_for: float | None, beat_age: float | None, allowance: int) -> str | None:
    """Why this worker is unhealthy, or None when it is fine."""
    if active_state != "active":
        return f"unit is {active_state}"
    if beat_age is not None and beat_age <= allowance:
        return None
    if up_for is not None and up_for < allowance:
        return None  # just (re)started: give it its full allowance first
    if beat_age is None:
        return "running, but its loop has never reported in"
    return f"running, but its loop has been silent for {int(beat_age // 60)} min"


def check(now: float | None = None) -> dict[str, str]:
    """name → reason for every unhealthy worker."""
    now = now or time.time()
    bad: dict[str, str] = {}
    for name, (unit, allowance) in WORKERS.items():
        state, up_for = _unit(unit)
        hb = last_beat(name)
        age = (now - float(hb["ts"])) if hb and hb.get("ts") else None
        reason = verdict(state, up_for, age, allowance)
        if reason:
            bad[name] = reason
    return bad


def _recipients() -> list[str]:
    db = SessionLocal()
    try:
        rows = db.execute(text(
            "SELECT DISTINCT telegram_id FROM users "
            "WHERE role = 'admin' AND is_active = true AND telegram_id IS NOT NULL"
        )).fetchall()
        return [str(r[0]) for r in rows if r[0]]
    finally:
        db.close()


def _send(token: str, chat_id: str, body: str) -> bool:
    try:
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=json.dumps({
                "chat_id": chat_id, "text": body,
                "parse_mode": "HTML", "disable_web_page_preview": True,
            }).encode(),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=10)  # noqa: S310 (fixed host)
        return True
    except Exception as e:
        _log(f"send to {chat_id} failed: {e}")
        return False


def plan(bad: dict[str, str], state: dict, now: float) -> tuple[list[str], list[str], dict]:
    """Which workers to report as newly bad (or due a reminder), which as
    recovered, and the state to keep."""
    alert, recovered, next_state = [], [], {}
    for name, reason in bad.items():
        prev = state.get(name) or {}
        due = not prev or now - float(prev.get("notified_at", 0)) >= REPEAT_HOURS * 3600
        if due:
            alert.append(name)
        next_state[name] = {
            "since": prev.get("since", now),
            "notified_at": now if due else prev.get("notified_at", now),
            "reason": reason,
        }
    recovered = [name for name in state if name not in bad]
    return alert, recovered, next_state


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


def main() -> int:
    now = time.time()
    bad = check(now)
    state = _read_state()
    alert, recovered, next_state = plan(bad, state, now)
    _log(f"{len(WORKERS) - len(bad)}/{len(WORKERS)} alive" + (f"; bad: {bad}" if bad else ""))

    lines = []
    if alert:
        lines.append("<b>Worker stalled</b>")
        for name in alert:
            unit = WORKERS[name][0]
            lines.append(f"• <b>{name}</b> — {bad[name]}\n  <code>systemctl restart {unit}</code>")
    if recovered:
        if lines:
            lines.append("")
        lines.append("<b>Recovered</b>: " + ", ".join(recovered))
    if lines:
        token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
        chats = _recipients() if token else []
        if not chats:
            _log("nobody to tell (no token or no admin with a telegram_id)")
        sent = sum(1 for c in chats if _send(token, c, "\n".join(lines)))
        _log(f"notified {sent}/{len(chats)}")
    _write_state(next_state)
    return 0


if __name__ == "__main__":
    sys.exit(main())
