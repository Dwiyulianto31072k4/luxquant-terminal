#!/bin/bash
set -e

FRONTEND_PATH="/root/luxquant-terminal/frontend-react"
BACKEND_PATH="/root/luxquant-terminal/backend"
NGINX_WWW_PATH="/var/www/luxquantdata"
SERVICE_NAME="luxquant-backend"
HEALTH_URL="http://localhost:8002/health"

echo "==============================================="
echo "🚀 MEMULAI DEPLOYMENT LUXQUANT"
echo "==============================================="

# ============================================
# [1/5] Pull latest code
# ============================================
echo ""
echo "📥 [1/5] Menarik kode terbaru dari GitHub..."
cd /root/luxquant-terminal
git pull origin main

# ============================================
# [2/5] Build frontend
# ============================================
echo ""
echo "📦 [2/5] Membangun Frontend React..."
cd $FRONTEND_PATH
npm run build

echo "   → Deploying ke Nginx..."
rm -rf $NGINX_WWW_PATH/*
cp -r dist/* $NGINX_WWW_PATH/
chown -R www-data:www-data $NGINX_WWW_PATH

# ============================================
# [3/5] Restart backend via systemd
# ============================================
echo ""
echo "⚙️  [3/5] Restart Backend Python (FastAPI)..."
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
# [4/5] Verify worker count
# ============================================
echo ""
echo "🔍 [4/5] Verifikasi worker count..."
WORKER_COUNT=$(pgrep -f "uvicorn app.main:app" | wc -l)
PARENT_COUNT=$(pgrep -f "uvicorn app.main:app" -P 1 | wc -l)

echo "   → Parent process: $PARENT_COUNT (expected: 1)"
echo "   → Total uvicorn processes: $WORKER_COUNT (expected: 5 = 1 parent + 4 workers)"

if [ "$PARENT_COUNT" -ne 1 ]; then
    echo "   ⚠️  WARNING: Ada lebih dari 1 parent uvicorn!"
    ps aux | grep "uvicorn app.main" | grep -v grep
fi

# ============================================
# [5/5] Clear cache
# ============================================
echo ""
echo "🧹 [5/5] Membersihkan Cache Redis..."
redis-cli flushall > /dev/null
echo "   ✅ Redis cache cleared"

# ============================================
# Summary
# ============================================
echo ""
echo "==============================================="
echo "✅ DEPLOYMENT SELESAI!"
echo "==============================================="
echo ""
echo "📊 Status service:"
systemctl status $SERVICE_NAME --no-pager -l | head -10
echo ""
echo "💡 Useful commands:"
echo "   • Log real-time  : journalctl -u $SERVICE_NAME -f"
echo "   • Restart backend: systemctl restart $SERVICE_NAME"
echo "   • Status         : systemctl status $SERVICE_NAME"
echo ""
