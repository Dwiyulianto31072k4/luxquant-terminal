#!/usr/bin/env python3
# backend/apply_batch2a_patches.py
"""
Batch 2a patcher — mounts the growth analytics router in main.py.

Idempotent and edit-preserving. Run from backend/:
    python3 apply_batch2a_patches.py
or:
    python3 apply_batch2a_patches.py /path/to/backend/app
"""
import sys
import os

APP_DIR = sys.argv[1] if len(sys.argv) > 1 else "app"
MAIN_PY = os.path.join(APP_DIR, "main.py")

IMPORT_ANCHOR = "from app.api.routes import workspace, finance"
IMPORT_NEW = "from app.api.routes import workspace, finance, growth"

INCLUDE_ANCHOR = 'app.include_router(finance.router, tags=["finance"])'
INCLUDE_NEW = (
    'app.include_router(finance.router, tags=["finance"])\n'
    'app.include_router(growth.router, tags=["growth"])'
)


def main():
    if not os.path.exists(MAIN_PY):
        print(f"✗ not found: {MAIN_PY}")
        return False
    src = open(MAIN_PY, encoding="utf-8").read()

    if "growth.router" in src:
        print("• main.py already mounts growth.router — skipped")
        return True

    if IMPORT_ANCHOR not in src:
        print(f"✗ main.py: import anchor not found:\n    {IMPORT_ANCHOR}")
        return False
    if INCLUDE_ANCHOR not in src:
        print(f"✗ main.py: include anchor not found:\n    {INCLUDE_ANCHOR}")
        return False

    src = src.replace(IMPORT_ANCHOR, IMPORT_NEW, 1)
    src = src.replace(INCLUDE_ANCHOR, INCLUDE_NEW, 1)
    open(MAIN_PY, "w", encoding="utf-8").write(src)
    print("✓ main.py: imported + mounted growth.router")
    return True


if __name__ == "__main__":
    ok = main()
    print("─" * 40)
    print("✓ Batch 2a patch applied." if ok else "✗ Patch failed.")
    sys.exit(0 if ok else 1)
