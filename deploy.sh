#!/bin/bash
set -e
FRONTEND_PATH="/root/luxquant-terminal/frontend-react"
BACKEND_PATH="/root/luxquant-terminal/backend"
NGINX_WWW_PATH="/var/www/luxquantdata"
SERVICE_NAME="luxquant-backend"
HEALTH_URL="http://localhost:8002/health"

# Cloudflare purge (optional) — set these in /root/.cloudflare_env:
#   CF_ZONE_ID="your_zone_id"
#   CF_API_TOKEN="your_api_token_with_cache_purge_permission"
CF_ENV_FILE="/root/.cloudflare_env"

echo "==============================================="
echo "🚀 MEMULAI DEPLOYMENT LUXQUANT"
echo "==============================================="

# ============================================
# [1/6] Pull latest code
# ============================================
echo ""
echo "📥 [1/6] Menarik kode terbaru dari GitHub..."
cd /root/luxquant-terminal
git pull origin main

# ============================================
# [2/6] Build frontend
# ============================================
echo ""
echo "📦 [2/6] Membangun Frontend React..."
cd $FRONTEND_PATH
npm run build
echo "   → Deploying ke Nginx..."
rm -rf $NGINX_WWW_PATH/*
cp -r dist/* $NGINX_WWW_PATH/
chown -R www-data:www-data $NGINX_WWW_PATH

# ============================================
# [3/6] Restart backend via systemd
# ============================================
echo ""
echo "⚙️  [3/6] Restart Backend Python (FastAPI)..."
systemctl restart $SERVICE_NAME
echo "   → Waiting for backend to be ready..."
for i in {1..30}; do
    sleep 1
    if curl -sf $HEALTH_URL > /dev/null 2>&1; then
        echo "   ✅ Backend siap (${i}s)"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "   ❌ Backend GAGAL start dalam 30s!"
        echo "   📋 Logs terakhir:"
        journalctl -u $SERVICE_NAME -n 30 --no-pager
        exit 1
    fi
done

# ============================================
# [4/6] Verify worker count (non-fatal)
# ============================================
echo ""
echo "🔍 [4/6] Verifikasi worker count..."
MASTER_PID=$(pgrep -f "uvicorn app.main:app" | head -1 || true)

if [ -n "$MASTER_PID" ]; then
    PARENT_COUNT=1
    WORKER_COUNT=$(pgrep -P "$MASTER_PID" 2>/dev/null | xargs -r ps -o cmd= -p 2>/dev/null | grep -c "multiprocessing" || true)
else
    PARENT_COUNT=0
    WORKER_COUNT=0
fi

echo "   → Master process: $PARENT_COUNT (expected: 1, PID=${MASTER_PID:-none})"
echo "   → Worker count: $WORKER_COUNT (expected: 4)"
if [ "$PARENT_COUNT" -ne 1 ]; then
    echo "   ⚠️  WARNING: Master uvicorn tidak terdeteksi / lebih dari 1!"
    ps aux | grep "uvicorn app.main" | grep -v grep || true
fi
if [ "$WORKER_COUNT" -eq 0 ]; then
    echo "   ⚠️  WARNING: Worker tidak terdeteksi via pattern — cek manual: pgrep -P $MASTER_PID | xargs ps -o cmd= -p"
fi

# ============================================
# [5/6] Clear Redis cache
# ============================================
echo ""
echo "🧹 [5/6] Membersihkan Cache Redis..."
redis-cli flushall > /dev/null
echo "   ✅ Redis cache cleared"

# ============================================
# [6/6] Purge Cloudflare cache (optional)
# ============================================
echo ""
echo "☁️  [6/6] Purge Cloudflare cache..."
if [ -f "$CF_ENV_FILE" ]; then
    # shellcheck source=/dev/null
    source "$CF_ENV_FILE"
fi
if [ -n "${CF_ZONE_ID:-}" ] && [ -n "${CF_API_TOKEN:-}" ]; then
    CF_RESULT=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
        -H "Authorization: Bearer ${CF_API_TOKEN}" \
        -H "Content-Type: application/json" \
        --data '{"purge_everything":true}' || true)
    if echo "$CF_RESULT" | grep -q '"success":true'; then
        echo "   ✅ Cloudflare cache purged"
    else
        echo "   ⚠️  Cloudflare purge GAGAL — purge manual di dashboard."
        echo "   Response: $CF_RESULT"
    fi
else
    echo "   ⏭️  Skip — CF_ZONE_ID/CF_API_TOKEN belum di-set di $CF_ENV_FILE"
    echo "   ⚠️  Jangan lupa purge manual di dashboard Cloudflare!"
fi

# ============================================
# Summary
# ============================================
echo ""
echo "==============================================="
echo "✅ DEPLOYMENT SELESAI!"
echo "==============================================="
echo ""
echo "📊 Status service:"
systemctl status $SERVICE_NAME --no-pager -l | head -10 || true
echo ""
echo "💡 Useful commands:"
echo "   • Log real-time  : journalctl -u $SERVICE_NAME -f"
echo "   • Restart backend: systemctl restart $SERVICE_NAME"
echo "   • Status         : systemctl status $SERVICE_NAME"
echo ""
