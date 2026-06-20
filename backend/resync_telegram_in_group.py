#!/usr/bin/env python3
"""
Re-sync users.telegram_in_group flag against actual Telegram VIP membership.

Why: during the routing outage, getChatMember timed out -> _check_vip_membership
returned False -> telegram_in_group got set false for valid members. Now that
the proxy is in place, re-verify each telegram-linked user and correct the flag.

Usage:
  DRY RUN (no DB writes, just report):
    ./venv/bin/python resync_telegram_in_group.py
  COMMIT (apply updates):
    ./venv/bin/python resync_telegram_in_group.py --commit

Run from /root/luxquant-terminal/backend with env loaded:
  set -a && source .env && set +a && ./venv/bin/python resync_telegram_in_group.py
"""
import asyncio
import os
import sys
import time

from sqlalchemy import text
from app.core.database import SessionLocal
from app.api.routes.telegram_auth import _check_vip_membership

COMMIT = "--commit" in sys.argv
THROTTLE = 0.25  # seconds between Telegram calls (~4/sec, safe under rate limit)

async def main():
    db = SessionLocal()
    try:
        rows = db.execute(text("""
            SELECT id, telegram_id, telegram_username, role, telegram_in_group
            FROM users
            WHERE telegram_id IS NOT NULL
            ORDER BY id
        """)).fetchall()

        print(f"Mode: {'COMMIT' if COMMIT else 'DRY RUN'}")
        print(f"Total telegram-linked users: {len(rows)}\n")

        changed = []
        errors = 0
        checked = 0

        for r in rows:
            try:
                actual = await _check_vip_membership(r.telegram_id)
            except Exception as e:
                errors += 1
                print(f"  ERR  uid={r.id} tg={r.telegram_id} ({r.telegram_username}): {e}")
                await asyncio.sleep(THROTTLE)
                continue

            checked += 1
            current = bool(r.telegram_in_group)
            if actual != current:
                changed.append((r.id, r.telegram_id, r.telegram_username, r.role, current, actual))
                arrow = f"{current} -> {actual}"
                print(f"  CHANGE uid={r.id} tg={r.telegram_id} ({r.telegram_username}, {r.role}): {arrow}")

            await asyncio.sleep(THROTTLE)

        print(f"\nChecked: {checked} | Errors: {errors} | To change: {len(changed)}")

        # breakdown
        to_true  = [c for c in changed if c[5] is True]
        to_false = [c for c in changed if c[5] is False]
        print(f"  false->true (re-grant in_group): {len(to_true)}")
        print(f"  true->false (left/kicked):        {len(to_false)}")

        if COMMIT and changed:
            for (uid, tgid, uname, role, cur, act) in changed:
                db.execute(text(
                    "UPDATE users SET telegram_in_group = :v WHERE id = :id"
                ), {"v": act, "id": uid})
            db.commit()
            print(f"\nCOMMITTED {len(changed)} updates.")
        elif COMMIT:
            print("\nNothing to commit.")
        else:
            print("\nDRY RUN — no DB changes. Re-run with --commit to apply.")

    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
