#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
# LuxQuant — Pre-deploy audit untuk Telegram auth fix
# Jalankan dari root frontend (folder yang ada index.html & package.json):
#   bash audit-telegram-fix.sh
# ════════════════════════════════════════════════════════════════
set -uo pipefail

PASS=0
FAIL=0
WARN=0

ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠️  $1"; WARN=$((WARN+1)); }
hdr()  { echo ""; echo "── $1"; }

# Resolve paths (cari folder src)
SRC="src"
if [ ! -d "$SRC" ]; then
  echo "❌ Folder 'src' tidak ditemukan. Jalankan script ini dari root frontend-react."
  exit 1
fi

LOADER="$SRC/utils/telegramLoader.js"
AUTH="$SRC/context/AuthContext.jsx"
# ProfilePage bisa di /components atau /pages — cari otomatis
PROFILE=$(grep -rl "ProfilePage" "$SRC" --include="ProfilePage.jsx" 2>/dev/null | head -1)
INDEX="index.html"

echo "════════════════════════════════════════"
echo "  LuxQuant Telegram Fix — Pre-deploy Audit"
echo "════════════════════════════════════════"

# ── 1. File loader harus ada ──
hdr "1. telegramLoader.js"
if [ -f "$LOADER" ]; then
  ok "File ada: $LOADER"
  grep -q "export function ensureTelegram"   "$LOADER" && ok "ensureTelegram() di-export"   || bad "ensureTelegram() TIDAK ada / tidak di-export"
  grep -q "export function openTelegramAuth" "$LOADER" && ok "openTelegramAuth() di-export" || bad "openTelegramAuth() TIDAK ada / tidak di-export"
  grep -q "Telegram.Login.auth"              "$LOADER" && ok "Pakai Telegram.Login.auth"     || bad "Tidak memanggil Telegram.Login.auth"
  grep -q "bot_id"                           "$LOADER" && ok "bot_id dikirim ke auth()"       || bad "bot_id tidak ada di auth()"
else
  bad "File loader TIDAK ADA: $LOADER  → build akan gagal!"
fi

# ── 2. index.html ──
hdr "2. index.html"
if [ -f "$INDEX" ]; then
  if grep -q "telegram-widget.js" "$INDEX"; then
    ok "Script telegram-widget.js sudah di-load di index.html"
  else
    warn "telegram-widget.js TIDAK ada di index.html (loader masih bisa inject sendiri, tapi sebaiknya ada untuk preload cepat)"
  fi
else
  warn "index.html tidak ditemukan di root (cek lokasi)"
fi

# ── 3. AuthContext.jsx ──
hdr "3. AuthContext.jsx"
if [ -f "$AUTH" ]; then
  ok "File ada: $AUTH"
  grep -q "import { openTelegramAuth }" "$AUTH" && ok "Import openTelegramAuth"        || bad "Belum import openTelegramAuth"
  if grep -q "window.onTelegramAuth" "$AUTH"; then
    bad "Masih ada sisa 'window.onTelegramAuth' (kode lama belum kebuang)"
  else
    ok "Tidak ada lagi window.onTelegramAuth (bersih)"
  fi
  if grep -qE "buildOverlay|buildCard|ensureModalStyles" "$AUTH"; then
    bad "Masih ada helper modal lama (buildOverlay/buildCard/ensureModalStyles)"
  else
    ok "Helper modal lama sudah dihapus"
  fi
  if grep -q "telegram-widget.js" "$AUTH"; then
    bad "Masih ada inject telegram-widget.js di AuthContext (harusnya tidak)"
  else
    ok "Tidak ada inject script di AuthContext"
  fi
  grep -q "loginWithTelegram" "$AUTH" && ok "loginWithTelegram masih ada di value" || bad "loginWithTelegram HILANG"
  # Pastikan fungsi inti lain tidak ikut kehapus
  for fn in loginWithGoogle loginWithDiscord refreshVipStatus logout; do
    grep -q "$fn" "$AUTH" && ok "$fn utuh" || bad "$fn HILANG dari AuthContext"
  done
else
  bad "File AuthContext TIDAK ADA: $AUTH"
fi

# ── 4. ProfilePage.jsx ──
hdr "4. ProfilePage.jsx"
if [ -n "$PROFILE" ] && [ -f "$PROFILE" ]; then
  ok "File ada: $PROFILE"
  grep -q "openTelegramAuth" "$PROFILE" && ok "Pakai openTelegramAuth"           || bad "Belum pakai openTelegramAuth"
  grep -q "ensureTelegram"   "$PROFILE" && ok "Preload ensureTelegram dipasang"  || warn "Tidak ada preload ensureTelegram (opsional tapi disarankan)"
  if grep -q "window.onTelegramAuth" "$PROFILE"; then
    bad "Masih ada 'window.onTelegramAuth' (kode lama belum kebuang)"
  else
    ok "Tidak ada lagi window.onTelegramAuth (bersih)"
  fi
  if grep -qE "tg-widget-slot|tg-link-overlay" "$PROFILE"; then
    bad "Masih ada sisa overlay lama (tg-widget-slot / tg-link-overlay)"
  else
    ok "Overlay/widget-slot lama sudah dihapus"
  fi
  if grep -q "telegram-widget.js" "$PROFILE"; then
    bad "Masih ada inject telegram-widget.js di ProfilePage (harusnya tidak)"
  else
    ok "Tidak ada inject script di ProfilePage"
  fi
  grep -q "/profile/link-telegram" "$PROFILE" && ok "Endpoint /profile/link-telegram dipakai" || warn "Endpoint link-telegram tidak ketemu (cek manual)"
else
  bad "File ProfilePage TIDAK ditemukan"
fi

# ── 5. Cek sisa onTelegramAuth di SELURUH src ──
hdr "5. Sweep seluruh src/ untuk sisa kode lama"
LEFTOVER=$(grep -rl "window.onTelegramAuth" "$SRC" 2>/dev/null)
if [ -z "$LEFTOVER" ]; then
  ok "Tidak ada sisa window.onTelegramAuth di mana pun"
else
  bad "Masih ada window.onTelegramAuth di:"
  echo "$LEFTOVER" | sed 's/^/       /'
fi

# ── 6. Build test (paling menentukan) ──
hdr "6. Build test (vite build)"
if command -v npm >/dev/null 2>&1; then
  echo "  → Menjalankan 'npm run build' ..."
  if npm run build >/tmp/lq_build.log 2>&1; then
    ok "Build SUKSES (tidak ada import error / syntax error)"
  else
    bad "Build GAGAL — lihat 50 baris terakhir di bawah:"
    tail -n 50 /tmp/lq_build.log | sed 's/^/       /'
  fi
else
  warn "npm tidak ada di PATH, skip build test (WAJIB build manual sebelum deploy)"
fi

# ── Ringkasan ──
echo ""
echo "════════════════════════════════════════"
echo "  HASIL:  ✅ $PASS lulus   ⚠️  $WARN warning   ❌ $FAIL gagal"
echo "════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  echo "  ⛔ JANGAN deploy dulu — perbaiki yang ❌ di atas."
  exit 1
else
  echo "  🚀 Aman untuk push & deploy."
  echo ""
  echo "  Reminder non-blocking:"
  echo "    1. Revoke token bot di @BotFather (token ke-hardcode di telegram_auth.py)."
  echo "    2. Tes di Chrome dengan akun Telegram yang BELUM pernah login (hindari cache sesi)."
  exit 0
fi
