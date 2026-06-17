#!/usr/bin/env bash
# ============================================================
# deploy_reframe_local.sh — BAGIAN LOKAL
# Pindahkan apply_reframe_patch.sh ke backend, jalankan, verifikasi, commit, push.
# Smoke test TIDAK di sini (Bybit diblokir di lokal) — dilakukan di VPS.
#
# Jalankan dari ROOT repo (folder yang berisi 'backend/').
#   bash deploy_reframe_local.sh
# ============================================================
set -euo pipefail

# --- pastikan di root yang benar ---
if [ ! -d backend/app/services ]; then
  echo "ERROR: jalankan dari root repo (tidak menemukan backend/app/services)."
  echo "Sekarang di: $(pwd)"
  exit 1
fi

# --- pindahkan patch dari Downloads kalau ada ---
PATCH="backend/apply_reframe_patch.sh"
if [ -f "$HOME/Downloads/apply_reframe_patch.sh" ]; then
  mv "$HOME/Downloads/apply_reframe_patch.sh" "$PATCH"
  echo "OK: apply_reframe_patch.sh dipindah ke backend/"
elif [ -f "$PATCH" ]; then
  echo "OK: apply_reframe_patch.sh sudah ada di backend/"
else
  echo "ERROR: apply_reframe_patch.sh tidak ada di ~/Downloads maupun backend/."
  exit 1
fi

# --- jalankan patch (dari dalam backend) ---
echo "=================== MENJALANKAN PATCH ==================="
( cd backend && bash apply_reframe_patch.sh )

# --- cek apakah patch sukses (cari penanda) ---
echo "=================== VERIFIKASI ==================="
ok=1
grep -q '"secondary_7d": "72h"' backend/app/services/ledger_confidence.py || { echo "GAGAL: _HORIZON_MAP belum ter-reframe"; ok=0; }
grep -q 'apply_ledger_confidence(verdict' backend/app/services/ai_arena_v6_worker.py || { echo "GAGAL: clamp block belum masuk"; ok=0; }
grep -q 'treat as 72-HOUR swing' backend/app/services/ai_arena_v6_worker.py || { echo "GAGAL: prompt belum ter-reframe"; ok=0; }
if grep -q '("7d", verdict' backend/app/services/ai_arena_v6_persist.py; then echo "GAGAL: 7d masih dievaluasi di persist"; ok=0; fi

if [ "$ok" -ne 1 ]; then
  echo ">>> Ada yang gagal. Restore dengan backup .bak-reframe di backend/app/services/ dan lapor."
  exit 1
fi
echo "OK: semua penanda patch ditemukan."

# --- cek sintaks sekali lagi ---
python3 -c "import ast; [ast.parse(open('backend/app/services/'+f).read()) for f in ['ai_arena_v6_persist.py','ledger_confidence.py','ai_arena_v6_worker.py']]; print('SYNTAX OK')"

# --- git add + commit + push ---
echo "=================== GIT ==================="
git add backend/app/services/ai_arena_v6_persist.py \
        backend/app/services/ledger_confidence.py \
        backend/app/services/ai_arena_v6_worker.py
git status --short
echo "-----------------------------------------------------------"
echo "Akan commit 3 file di atas. Lanjut commit + push? (ketik 'yes')"
read -r ans
[ "$ans" = "yes" ] || { echo "Dibatalkan sebelum commit. File sudah ter-patch & ter-stage."; exit 0; }

git commit -m "Reframe horizons: 24h+72h projected, 7d/30d dropped, ledger-clamped confidence"
git push
echo
echo "============================================================"
echo "SELESAI BAGIAN LOKAL. Lanjut di VPS:"
echo "  ssh root@187.127.135.84"
echo "  cd ~/luxquant-terminal/backend && git pull"
echo "  source venv/bin/activate"
echo "  set -a; source .env; set +a"
echo "  python3 -c \"import asyncio; from app.services.ai_arena_v6_worker import run_smoke_test; asyncio.run(run_smoke_test())\""
echo "Cari di output: baris 'Confidence calibrated:' + verdict JSON valid (tanpa traceback)."
echo "JANGAN systemctl restart dulu — kumpulkan dgn fase lain, restart sekali."
echo "============================================================"
