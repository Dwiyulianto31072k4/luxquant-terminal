#!/usr/bin/env python3
"""
Patch notification_worker.py to add ON CONFLICT DO NOTHING
to all INSERT statements (defensive against race conditions).

Usage:
    cd ~/luxquant-terminal  # or ~/Downloads/luxquant-fullstack
    python3 backend/scripts/patch_notification_worker.py
"""

import os
import sys
from datetime import datetime


WORKER_PATH = "backend/app/services/notification_worker.py"


PATCHES = [
    {
        "name": "channel_message broadcast",
        "old": """VALUES (NULL, :type, :title, :body, :data, 'channel_message', :source_id, :created_at)
        \"\"\"), {""",
        "new": """VALUES (NULL, :type, :title, :body, :data, 'channel_message', :source_id, :created_at)
            ON CONFLICT DO NOTHING
        \"\"\"), {""",
    },
    {
        "name": "btcdom broadcast",
        "old": """VALUES (NULL, 'btcdom_call', :title, :body, :data, 'signal', :source_id, :created_at)
        \"\"\"), {""",
        "new": """VALUES (NULL, 'btcdom_call', :title, :body, :data, 'signal', :source_id, :created_at)
            ON CONFLICT DO NOTHING
        \"\"\"), {""",
    },
    {
        "name": "watchlist per-user",
        "old": """VALUES (:user_id, 'watchlist_update', :title, :body, :data, 'signal_update', :source_id, :created_at)
        \"\"\"), {""",
        "new": """VALUES (:user_id, 'watchlist_update', :title, :body, :data, 'signal_update', :source_id, :created_at)
            ON CONFLICT DO NOTHING
        \"\"\"), {""",
    },
]


def main():
    if not os.path.exists(WORKER_PATH):
        print(f"❌ File not found: {WORKER_PATH}")
        print("   Run from project root (luxquant-terminal or luxquant-fullstack)")
        sys.exit(1)

    with open(WORKER_PATH, "r") as f:
        src = f.read()

    # Backup
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{WORKER_PATH}.bak.{ts}"
    with open(backup_path, "w") as f:
        f.write(src)
    print(f"✅ Backup: {backup_path}")

    patched = []
    skipped = []

    for patch in PATCHES:
        if patch["old"] in src and patch["new"] not in src:
            src = src.replace(patch["old"], patch["new"], 1)
            patched.append(patch["name"])
        elif patch["new"] in src:
            skipped.append(patch["name"])
        else:
            print(f"⚠️  Pattern not found: {patch['name']}")

    with open(WORKER_PATH, "w") as f:
        f.write(src)

    if patched:
        print(f"✅ Patched: {', '.join(patched)}")
    if skipped:
        print(f"⏭️  Already patched: {', '.join(skipped)}")

    if not patched and not skipped:
        print("⚠️  No changes applied")
        sys.exit(1)

    print("")
    print("Next steps:")
    print("  1. On VPS: systemctl restart luxquant-backend")
    print("  2. Monitor: journalctl -u luxquant-backend -f")


if __name__ == "__main__":
    main()
