#!/usr/bin/env bash
# Stage ONLY ops/delivery files. Never `git add -A` (WIP + .asset-salt dirty).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git add \
  deploy.sh \
  nginx/nginx.conf \
  .github/workflows/ci.yml \
  scripts/cf-analytics-522.py \
  scripts/cf-edge-health.sh \
  scripts/cf-unstick.py \
  scripts/stage-ops.sh \
  frontend-react/src/App.jsx \
  frontend-react/src/utils/pollWhileVisible.js \
  frontend-react/src/utils/lazyWithRetry.js \
  frontend-react/src/components/ErrorBoundary.jsx \
  frontend-react/src/components/StatusPage.jsx \
  frontend-react/src/components/NotificationBell.jsx \
  frontend-react/src/components/MarketPulsePage.jsx \
  frontend-react/src/components/SignalsPage.jsx \
  frontend-react/src/components/chat/ChatLauncher.jsx \
  frontend-react/src/components/AdminWorkspacePage.jsx \
  frontend-react/src/components/terminal/SignalsAnalytics.jsx \
  frontend-react/src/components/admin/workspace/ChatTab.jsx \
  frontend-react/src/components/admin/workspace/EdgeHealthTab.jsx \
  frontend-react/src/components/admin/workspace/EdgeDeliveryCard.jsx \
  frontend-react/src/services/growthApi.js \
  backend/app/api/routes/growth.py
echo "Staged. Review:  git diff --cached --stat"
echo "Do NOT add: .asset-salt, FreeOnboarding, ConversionTab WIP, coins.generated"
echo "Commit:  git commit -m 'Harden Cloudflare delivery: no mass purge, SIN unstick, Delivery tab'"
