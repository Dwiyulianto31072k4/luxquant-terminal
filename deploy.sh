#!/bin/bash
# --- KONFIGURASI ---
FRONTEND_PATH="/root/luxquant-terminal/frontend-react"
BACKEND_PATH="/root/luxquant-terminal/backend"
NGINX_WWW_PATH="/var/www/luxquantdata"
echo "==============================================="
echo "🚀 MEMULAI OTOMATISASI DEPLOYMENT LUXQUANT"
echo "==============================================="
# 1. AMBIL KODE TERBARU
echo "📥 [1/4] Menarik kode terbaru dari GitHub..."
cd /root/luxquant-terminal
git pull origin main
# 2. UPDATE FRONTEND
echo "📦 [2/4] Membangun (Build) Frontend React..."
cd $FRONTEND_PATH
npm run build
rm -rf $NGINX_WWW_PATH/*
cp -r dist/* $NGINX_WWW_PATH/
chown -R www-data:www-data $NGINX_WWW_PATH
# 3. UPDATE BACKEND
echo "⚙️  [3/4] Me-restart Backend Python (FastAPI)..."
# Force kill kalau masih hidup
cd $BACKEND_PATH
# Verifikasi backend jalan
if pgrep -f "uvicorn app.main:app" > /dev/null; then
    echo "✅ Backend berhasil start"
else
    echo "❌ Backend GAGAL start! Cek: tail backend.log"
fi
# 4. BERSIHKAN CACHE
echo "🧹 [4/4] Membersihkan Cache Redis..."
redis-cli flushall
echo "==============================================="
echo "✅ SEMUA SELESAI! Web sudah menggunakan kode terbaru."
echo "==============================================="
