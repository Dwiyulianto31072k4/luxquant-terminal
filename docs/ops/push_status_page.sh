#!/usr/bin/env bash
# ============================================================
# Push the Status Page feature (public /status + admin + auto-incidents).
# Adds ONLY the status-page files — nothing else in your working tree is
# touched, so unrelated untracked docs won't get swept into the commit.
# ============================================================
set -euo pipefail

# Always run from the repo root, regardless of where the script is called from.
cd "$(git rev-parse --show-toplevel)"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "▶ Repo:   $(pwd)"
echo "▶ Branch: $BRANCH"
echo

# The exact files this feature introduced / changed.
FILES=(
  "backend/app/main.py"
  "backend/app/api/routes/public_status.py"
  "frontend-react/src/App.jsx"
  "frontend-react/src/components/StatusPage.jsx"
  "frontend-react/src/components/StatusAdminPage.jsx"
  "frontend-react/src/components/AdminWorkspacePage.jsx"
  "frontend-react/src/components/admin/workspace/StatusTab.jsx"
  "STATUS_PAGE_PLAYBOOK.md"   # remove this line if you don't want the doc committed
)

echo "▶ Staging files:"
for f in "${FILES[@]}"; do
  if [[ -e "$f" ]]; then
    git add -- "$f"
    echo "   + $f"
  else
    echo "   ! missing, skipped: $f"
  fi
done
echo

echo "▶ Staged changes:"
git status --short -- "${FILES[@]}"
echo

# Nothing staged? Bail out cleanly.
if git diff --cached --quiet; then
  echo "✓ Nothing to commit — everything already up to date."
  exit 0
fi

COMMIT_MSG="feat(status): public status page + admin incident manager + auto-incidents

- Public /status page (no login, static-served, client-side probes so it
  still reports 'platform down' when the backend is unreachable)
- Backend /api/v1/status (+ /ping) — user-facing components only, no internal
  service/plumbing detail leaked
- Admin /admin/status — create/update incidents through the
  Investigating -> Identified -> Monitoring -> Resolved lifecycle (+ maintenance)
- Automatic incidents: auto-open after >2m unhealthy, auto-resolve after >2m
  recovered, brief blips ignored; incidents stored in a JSON file (survives DB
  outages), env-tunable"

echo "▶ Committing…"
git commit -m "$COMMIT_MSG"
echo

echo "> Pushing to origin/${BRANCH} ..."
git push origin "${BRANCH}"
echo
echo "OK. Next: rebuild frontend (npm run build in frontend-react) and"
echo "restart the backend service so the new routes load."
