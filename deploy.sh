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
MASTER_PID=$(pgrep -f "uvicorn app.main:app" | head -1)
WORKER_COUNT=$(pgrep -P "$MASTER_PID" | xargs -r ps -o cmd= -p | grep -c "multiprocessing-fork")
PARENT_COUNT=$([ -n "$MASTER_PID" ] && echo 1 || echo 0)

echo "   → Master process: $PARENT_COUNT (expected: 1, PID=$MASTER_PID)"
echo "   → Worker count: $WORKER_COUNT (expected: 4)"

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
