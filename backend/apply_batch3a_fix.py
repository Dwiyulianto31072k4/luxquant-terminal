#!/usr/bin/env python3
# backend/apply_batch3a_fix.py
"""
Batch 3a FIX — the original 3a patcher inserted the activity fields into
UserResponse (first class with last_login_at/first_login_at/login_count)
instead of AdminUserResponse (the class the /admin/users endpoint
serializes with).

This fix:
  1. removes the misplaced activity block from UserResponse
     (anchored on UserResponse's unique "# Login tracking" comment)
  2. adds the activity block to AdminUserResponse
     (anchored on AdminUserResponse's unique "lifetime_credit_earned"
      line sitting directly before last_login_at — no comment between,
      which UserResponse does not have)

Idempotent: detects whether the fix is already in place and no-ops.

Run from backend/:
    python3 apply_batch3a_fix.py
"""
import sys
import os

SCHEMA = os.path.join(sys.argv[1] if len(sys.argv) > 1 else "app", "schemas", "user.py")

ACT_BLOCK = """
    # ─── Activity tracking (Growth dashboard) ───
    last_active_at: Optional[datetime] = None
    total_sessions: Optional[int] = 0
    last_feature_touched: Optional[str] = None"""

# ── 1. UserResponse: revert (remove the misplaced block) ──
# Unique because of the "# Login tracking" comment, present only in UserResponse.
USER_BROKEN = """    # Login tracking
    last_login_at: Optional[datetime] = None
    first_login_at: Optional[datetime] = None
    login_count: Optional[int] = 0
""" + ACT_BLOCK + """

    # Display preferences"""

USER_REVERTED = """    # Login tracking
    last_login_at: Optional[datetime] = None
    first_login_at: Optional[datetime] = None
    login_count: Optional[int] = 0

    # Display preferences"""

# ── 2. AdminUserResponse: add the block ──
# Unique because here lifetime_credit_earned sits DIRECTLY before
# last_login_at (no blank line / comment), unlike UserResponse.
ADMIN_ANCHOR = """    lifetime_credit_earned: Optional[float] = 0
    last_login_at: Optional[datetime] = None
    first_login_at: Optional[datetime] = None
    login_count: Optional[int] = 0

    # Display preferences"""

ADMIN_NEW = """    lifetime_credit_earned: Optional[float] = 0
    last_login_at: Optional[datetime] = None
    first_login_at: Optional[datetime] = None
    login_count: Optional[int] = 0
""" + ACT_BLOCK + """

    # Display preferences"""

# Marker that the fix is correctly in AdminUserResponse (lifetime context + activity)
ADMIN_DONE_MARKER = """    lifetime_credit_earned: Optional[float] = 0
    last_login_at: Optional[datetime] = None
    first_login_at: Optional[datetime] = None
    login_count: Optional[int] = 0
""" + ACT_BLOCK


def main():
    if not os.path.exists(SCHEMA):
        print(f"✗ not found: {SCHEMA}")
        return False
    src = open(SCHEMA, encoding="utf-8").read()

    admin_done = ADMIN_DONE_MARKER in src
    user_broken = USER_BROKEN in src

    if admin_done and not user_broken:
        print("• Already fixed (activity fields in AdminUserResponse, UserResponse clean) — no-op")
        return True

    changed = []

    # 1. revert UserResponse if it carries the misplaced block
    if user_broken:
        src = src.replace(USER_BROKEN, USER_REVERTED, 1)
        changed.append("removed misplaced block from UserResponse")

    # 2. add to AdminUserResponse if not already there
    if not admin_done:
        if ADMIN_ANCHOR not in src:
            print("✗ AdminUserResponse anchor not found — file shape unexpected. Aborting.")
            return False
        src = src.replace(ADMIN_ANCHOR, ADMIN_NEW, 1)
        changed.append("added activity block to AdminUserResponse")

    open(SCHEMA, "w", encoding="utf-8").write(src)
    print("✓ " + "; ".join(changed))
    return True


if __name__ == "__main__":
    ok = main()
    print("─" * 40)
    print("✓ Batch 3a-fix applied." if ok else "✗ Fix failed.")
    sys.exit(0 if ok else 1)
