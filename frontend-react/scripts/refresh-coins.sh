#!/bin/bash
# Weekly: refresh coin track-record stats from the live DB, rebuild the coin
# pages, redeploy to nginx, and purge Cloudflare. Idempotent & low-priority.
set -e
FE=/root/luxquant-terminal/frontend-react
WWW=/var/www/luxquantdata
cd "$FE"
node scripts/gen-coins.mjs
nice -n 19 ionice -c3 npm run build >/dev/null 2>&1
cp -r dist/* "$WWW"/
find "$WWW"/assets -type f -mtime +3 -delete 2>/dev/null || true
chown -R www-data:www-data "$WWW"
if [ -f /root/.cloudflare_env ]; then
  source /root/.cloudflare_env
  curl -4 -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json" \
    --data "{\"purge_everything\":true}" >/dev/null 2>&1 || true
fi
echo "$(date -u +%FT%TZ) coins refreshed"
