#!/usr/bin/env python3
# frontend-react/apply_batch3c_patches.py
"""
Batch 3c patcher (frontend) — wire the Power Users filter into FilterPanel.

Idempotent + edit-preserving. One file, two edits:

  components/admin/FilterPanel.jsx
   1. Activity dropdown: add "Power users (5+ days/wk)" option
      (backend already supports activity=power_users from 3a), and
      relabel "Never logged in" -> "Never active" to match the new
      last_active_at semantics.
   2. Sort By dropdown: add "Last Active" (backend sort_by=last_active_at
      added in 3a).

Run from frontend-react/:
    python3 apply_batch3c_patches.py
"""
import sys
import os

ROOT = sys.argv[1] if len(sys.argv) > 1 else "src"
FP = os.path.join(ROOT, "components", "admin", "FilterPanel.jsx")

# ── 1. Activity dropdown options ──
ACTIVITY_ANCHOR = """                { value: null, label: 'All Activity' },
                { value: 'active_7d', label: 'Active (last 7d)' },
                { value: 'dormant_30d', label: 'Dormant (>30d)' },
                { value: 'never_logged_in', label: 'Never logged in' },"""

ACTIVITY_NEW = """                { value: null, label: 'All Activity' },
                { value: 'active_7d', label: 'Active (last 7d)' },
                { value: 'power_users', label: 'Power users (5+ days/wk)' },
                { value: 'dormant_30d', label: 'Dormant (>30d)' },
                { value: 'never_logged_in', label: 'Never active' },"""

# ── 2. Sort By dropdown options ──
SORT_ANCHOR = """                { value: 'created_at', label: 'Date Joined' },
                { value: 'last_login_at', label: 'Last Login' },
                { value: 'username', label: 'Username' },"""

SORT_NEW = """                { value: 'created_at', label: 'Date Joined' },
                { value: 'last_active_at', label: 'Last Active' },
                { value: 'last_login_at', label: 'Last Login' },
                { value: 'username', label: 'Username' },"""


def main():
    if not os.path.exists(FP):
        print(f"✗ not found: {FP}")
        return False
    src = open(FP, encoding="utf-8").read()
    applied = []

    edits = [
        ("Power users option + relabel", ACTIVITY_ANCHOR, ACTIVITY_NEW, "value: 'power_users'"),
        ("Last Active sort", SORT_ANCHOR, SORT_NEW, "value: 'last_active_at'"),
    ]
    for name, anchor, new, marker in edits:
        if marker in src:
            print(f"• {name} already present — skipped")
            continue
        if anchor not in src:
            print(f"✗ anchor not found for '{name}'. Aborting (no partial writes).")
            return False

    for name, anchor, new, marker in edits:
        if marker in src:
            continue
        src = src.replace(anchor, new, 1)
        applied.append(name)

    if applied:
        open(FP, "w", encoding="utf-8").write(src)
        print(f"✓ FilterPanel.jsx: {', '.join(applied)}")
    return True


if __name__ == "__main__":
    ok = main()
    print("─" * 40)
    print("✓ Batch 3c patch applied." if ok else "✗ Patch failed.")
    sys.exit(0 if ok else 1)
