#!/usr/bin/env python3
# backend/apply_batch1_patches.py
"""
Batch 1 patcher — adds the 3 activity columns to the User model and
registers ActivityTrackerMiddleware in main.py.

Idempotent: safe to run more than once. Does NOT overwrite either file
wholesale, so any local edits you've made are preserved.

Usage (from the backend/ directory):
    python3 apply_batch1_patches.py
or with an explicit app root:
    python3 apply_batch1_patches.py /path/to/backend/app
"""
import sys
import os

APP_DIR = sys.argv[1] if len(sys.argv) > 1 else "app"

USER_MODEL = os.path.join(APP_DIR, "models", "user.py")
MAIN_PY = os.path.join(APP_DIR, "main.py")

USER_BLOCK = """    # ─── Activity tracking (Growth dashboard) ───
    # Updated passively by ActivityTrackerMiddleware (NOT login).
    last_active_at = Column(DateTime(timezone=True), nullable=True)
    total_sessions = Column(Integer, default=0, nullable=False)
    last_feature_touched = Column(String(50), nullable=True)

"""

USER_ANCHOR = "    # Timestamps\n    created_at = Column(DateTime(timezone=True), server_default=func.now())"

MAIN_IMPORT_ANCHOR = "from fastapi.middleware.cors import CORSMiddleware\n"
MAIN_IMPORT_LINE = "from app.middleware.activity_tracker import ActivityTrackerMiddleware\n"

CORS_BLOCK = """app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)"""

MIDDLEWARE_REG = """

# Passive activity tracking for the Growth dashboard (Batch 1).
# Reads Bearer JWT + URL, dedupes via Redis, writes async — never blocks.
app.add_middleware(ActivityTrackerMiddleware)"""


def patch_user():
    if not os.path.exists(USER_MODEL):
        print(f"✗ not found: {USER_MODEL}")
        return False
    src = open(USER_MODEL, encoding="utf-8").read()
    if "last_active_at" in src and "total_sessions" in src:
        print("• user.py already has activity columns — skipped")
        return True
    if USER_ANCHOR not in src:
        print("✗ user.py: could not find the '# Timestamps' anchor. "
              "Add the 3 columns manually before the Timestamps block.")
        return False
    src = src.replace(USER_ANCHOR, USER_BLOCK + USER_ANCHOR, 1)
    open(USER_MODEL, "w", encoding="utf-8").write(src)
    print("✓ user.py: added last_active_at, total_sessions, last_feature_touched")
    return True


def patch_main():
    if not os.path.exists(MAIN_PY):
        print(f"✗ not found: {MAIN_PY}")
        return False
    src = open(MAIN_PY, encoding="utf-8").read()
    changed = False

    if "ActivityTrackerMiddleware" not in src:
        if MAIN_IMPORT_ANCHOR not in src:
            print("✗ main.py: could not find the CORS import anchor.")
            return False
        src = src.replace(
            MAIN_IMPORT_ANCHOR,
            MAIN_IMPORT_ANCHOR + MAIN_IMPORT_LINE,
            1,
        )
        if CORS_BLOCK not in src:
            print("✗ main.py: could not find the CORS add_middleware block.")
            return False
        src = src.replace(CORS_BLOCK, CORS_BLOCK + MIDDLEWARE_REG, 1)
        open(MAIN_PY, "w", encoding="utf-8").write(src)
        print("✓ main.py: imported + registered ActivityTrackerMiddleware")
        changed = True
    else:
        print("• main.py already wires ActivityTrackerMiddleware — skipped")

    return True


if __name__ == "__main__":
    ok1 = patch_user()
    ok2 = patch_main()
    print("─" * 40)
    if ok1 and ok2:
        print("✓ Batch 1 patches applied. Now run the SQL migration + restart backend.")
    else:
        print("✗ One or more patches failed — see messages above.")
        sys.exit(1)
