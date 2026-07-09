#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# push.sh — stage, commit & push ALL local changes to origin
#
# Usage:
#   ./push.sh                 # uses the default commit message
#   ./push.sh "your message"  # custom commit message
# ════════════════════════════════════════════════════════════════
set -euo pipefail

# Always run from the repo root (the dir this script lives in)
cd "$(dirname "$0")"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# Default commit message (override by passing one as the first arg)
MSG="${1:-"fix(signals): strict base-token aware token search

- Search now matches the base token, not a raw substring of the pair
- 'MUSDT' -> exact pair match only (no more XLMUSDT / ATOMUSDT noise)
- 'M' -> prefix match on base token (M, MANA, MELANIA; not NMR / XLM)"}"

# Hanya file yang diubah untuk fix ini
FILES=(
  "frontend-react/src/components/SignalsPage.jsx"
)

echo "==> Repo:   $(pwd)"
echo "==> Branch: $BRANCH"
echo "==> File yang akan di-push:"
printf '    %s\n' "${FILES[@]}"

git add -- "${FILES[@]}"

# Bail out cleanly if there is nothing staged
if git diff --cached --quiet; then
  echo "==> Tidak ada perubahan pada file tsb. Berhenti."
  exit 0
fi

git commit -m "$MSG"
git push origin HEAD:main

echo "==> Done. Pushed to origin/main"
echo "==> Next: deploy with  ./deploy.sh luxquant"
