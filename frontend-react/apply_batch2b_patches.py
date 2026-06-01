#!/usr/bin/env python3
# frontend-react/apply_batch2b_patches.py
"""
Batch 2b patcher — registers the 6th "Activity" tab in AdminWorkspacePage.jsx.

Idempotent + edit-preserving. Makes 4 edits:
  1. import ActivityTab
  2. import ActivityIcon (added to the existing Icons import block)
  3. append the Activity tab to the TABS array
  4. render <ActivityTab /> in the tab-content switch

Run from frontend-react/:
    python3 apply_batch2b_patches.py
or:
    python3 apply_batch2b_patches.py src/components/AdminWorkspacePage.jsx
"""
import sys
import os

TARGET = (
    sys.argv[1]
    if len(sys.argv) > 1
    else os.path.join("src", "components", "AdminWorkspacePage.jsx")
)

# ── 1. import ActivityTab (after TodoTab import) ──
IMP_ANCHOR = "import { TodoTab } from './admin/workspace/TodoTab';"
IMP_NEW = (
    "import { TodoTab } from './admin/workspace/TodoTab';\n"
    "import { ActivityTab } from './admin/workspace/ActivityTab';"
)

# ── 2. import ActivityIcon (extend the Icons import block) ──
ICON_ANCHOR = "  CheckSquareIcon,\n} from './admin/Icons';"
ICON_NEW = "  CheckSquareIcon,\n  ActivityIcon,\n} from './admin/Icons';"

# ── 3. append Activity tab to TABS (after the todos entry's closing `},`) ──
TABS_ANCHOR = """  {
    id: 'todos',
    label: 'TODOs',
    description: 'Internal task board',
    Icon: CheckSquareIcon,
    accent: palette.orange[400],
  },
];"""
TABS_NEW = """  {
    id: 'todos',
    label: 'TODOs',
    description: 'Internal task board',
    Icon: CheckSquareIcon,
    accent: palette.orange[400],
  },
  {
    id: 'activity',
    label: 'Activity',
    description: 'Engagement & growth analytics',
    Icon: ActivityIcon,
    accent: palette.teal[400],
  },
];"""

# ── 4. render ActivityTab in the content switch (after todos line) ──
RENDER_ANCHOR = "        {activeTab === 'todos' && <TodoTab onRefreshStats={fetchStats} />}"
RENDER_NEW = (
    "        {activeTab === 'todos' && <TodoTab onRefreshStats={fetchStats} />}\n"
    "        {activeTab === 'activity' && <ActivityTab />}"
)


def patch():
    if not os.path.exists(TARGET):
        print(f"✗ not found: {TARGET}")
        return False
    src = open(TARGET, encoding="utf-8").read()

    if "ActivityTab" in src and "id: 'activity'" in src:
        print("• AdminWorkspacePage already has the Activity tab — skipped")
        return True

    edits = [
        ("import ActivityTab", IMP_ANCHOR, IMP_NEW),
        ("import ActivityIcon", ICON_ANCHOR, ICON_NEW),
        ("TABS entry", TABS_ANCHOR, TABS_NEW),
        ("content render", RENDER_ANCHOR, RENDER_NEW),
    ]
    for name, anchor, new in edits:
        if anchor not in src:
            print(f"✗ anchor not found for {name}. Aborting (no partial writes).")
            return False

    for _name, anchor, new in edits:
        src = src.replace(anchor, new, 1)

    open(TARGET, "w", encoding="utf-8").write(src)
    print("✓ AdminWorkspacePage.jsx: imported ActivityTab + ActivityIcon, "
          "added Activity tab + render")
    return True


if __name__ == "__main__":
    ok = patch()
    print("─" * 40)
    print("✓ Batch 2b patch applied." if ok else "✗ Patch failed.")
    sys.exit(0 if ok else 1)
