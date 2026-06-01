#!/usr/bin/env python3
# backend/apply_batch3a_patches.py
"""
Batch 3a patcher (backend) — surfaces activity data on the user list.

Two idempotent, edit-preserving edits:

  1. schemas/user.py  : add last_active_at / total_sessions /
     last_feature_touched to AdminUserResponse so they ride along in the
     /users list response (serialization already uses model_validate +
     from_attributes, so no route change needed for the fields).

  2. api/routes/admin.py : re-point the existing `activity` filter from
     last_login_at -> last_active_at (any request, not just login), and
     add a `power_users` option (5+ distinct active days in the last 7,
     via a subquery on user_activity_events).

Run from backend/:
    python3 apply_batch3a_patches.py
or:
    python3 apply_batch3a_patches.py app
"""
import sys
import os

APP_DIR = sys.argv[1] if len(sys.argv) > 1 else "app"
SCHEMA = os.path.join(APP_DIR, "schemas", "user.py")
ADMIN = os.path.join(APP_DIR, "api", "routes", "admin.py")

# ── 1. schema fields (inserted before the "Display preferences" block) ──
SCHEMA_ANCHOR = """    last_login_at: Optional[datetime] = None
    first_login_at: Optional[datetime] = None
    login_count: Optional[int] = 0"""
SCHEMA_NEW = """    last_login_at: Optional[datetime] = None
    first_login_at: Optional[datetime] = None
    login_count: Optional[int] = 0

    # ─── Activity tracking (Growth dashboard) ───
    last_active_at: Optional[datetime] = None
    total_sessions: Optional[int] = 0
    last_feature_touched: Optional[str] = None"""

# ── 2a. activity filter: last_login_at -> last_active_at + power_users ──
FILTER_ANCHOR = """    # Activity filter
    if activity == "active_7d":
        query = query.filter(User.last_login_at >= now - timedelta(days=7))
    elif activity == "dormant_30d":
        query = query.filter(
            and_(
                User.last_login_at.isnot(None),
                User.last_login_at < now - timedelta(days=30),
            )
        )
    elif activity == "never_logged_in":
        query = query.filter(User.last_login_at.is_(None))"""

FILTER_NEW = """    # Activity filter (now keyed on last_active_at = any request, not just login)
    if activity == "active_7d":
        query = query.filter(User.last_active_at >= now - timedelta(days=7))
    elif activity == "dormant_30d":
        query = query.filter(
            and_(
                User.last_active_at.isnot(None),
                User.last_active_at < now - timedelta(days=30),
            )
        )
    elif activity == "never_logged_in":
        query = query.filter(User.last_active_at.is_(None))
    elif activity == "power_users":
        # 5+ distinct active days in the last 7, from the event log
        from app.models.activity import UserActivityEvent
        active_day = func.date(
            func.timezone('UTC', UserActivityEvent.occurred_at)
        )
        power_ids = (
            db.query(UserActivityEvent.user_id)
            .filter(UserActivityEvent.occurred_at >= now - timedelta(days=7))
            .group_by(UserActivityEvent.user_id)
            .having(func.count(func.distinct(active_day)) >= 5)
            .subquery()
        )
        query = query.filter(User.id.in_(power_ids))"""

# ── 2b. allow sorting by last_active_at too ──
SORT_ANCHOR = """        "last_login_at": User.last_login_at,
    }.get(sort_by, User.created_at)"""
SORT_NEW = """        "last_login_at": User.last_login_at,
        "last_active_at": User.last_active_at,
    }.get(sort_by, User.created_at)"""


def patch_file(path, label, edits):
    if not os.path.exists(path):
        print(f"✗ not found: {path}")
        return False
    src = open(path, encoding="utf-8").read()
    applied = []
    for name, anchor, new, skip_marker in edits:
        if skip_marker in src:
            print(f"• {label}: {name} already present — skipped")
            continue
        if anchor not in src:
            print(f"✗ {label}: anchor not found for {name}")
            return False
        src = src.replace(anchor, new, 1)
        applied.append(name)
    if applied:
        open(path, "w", encoding="utf-8").write(src)
        print(f"✓ {label}: {', '.join(applied)}")
    return True


def main():
    ok1 = patch_file(
        SCHEMA, "schemas/user.py",
        [("activity fields", SCHEMA_ANCHOR, SCHEMA_NEW, "last_active_at: Optional[datetime]")],
    )
    ok2 = patch_file(
        ADMIN, "api/routes/admin.py",
        [
            ("activity filter -> last_active_at + power_users", FILTER_ANCHOR, FILTER_NEW, 'activity == "power_users"'),
            ("sort by last_active_at", SORT_ANCHOR, SORT_NEW, '"last_active_at": User.last_active_at'),
        ],
    )
    return ok1 and ok2


if __name__ == "__main__":
    ok = main()
    print("─" * 40)
    print("✓ Batch 3a patches applied." if ok else "✗ Patch failed — see messages.")
    sys.exit(0 if ok else 1)
