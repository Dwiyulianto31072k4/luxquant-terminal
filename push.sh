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
MSG="${1:-"Login redesign + footer Ecosystem (DRC) + 3D icon polish

- Login: real NVIDIA/SAMSUNG/AMD coins (shared AssetCoins component)
- Login desktop: white MEXC card, connected More Options dropdown
- Login mobile: full-height layout, big headline + coins, terms pinned bottom
- LeftBrandPanel: static smaller iMac, redesigned market icons
- Terms modal aligned to login (maroon to black, white pill button)
- Footer Ecosystem: Daily Rekom Crypto tile (IG) + premium 3D pop hover
- Hero slider 11s auto-advance; FreeTier + PhoneMockup fixes"}"

echo "==> Repo:   $(pwd)"
echo "==> Branch: $BRANCH"
echo "==> Changes:"
git status --short

# Bail out cleanly if there is nothing to commit
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo "==> Nothing to commit. Working tree clean."
  exit 0
fi

git add -A
git commit -m "$MSG"
git push origin "$BRANCH"

echo "==> Done. Pushed to origin/$BRANCH"
echo "==> Next: deploy with  ./deploy.sh luxquant"
