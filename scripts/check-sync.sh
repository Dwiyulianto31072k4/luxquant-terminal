#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# Apakah lokal, git, dan VPS membawa kode yang sama?
# ════════════════════════════════════════════════════════════════════
# KENAPA ADA:
#   Repo ini dan VPS-nya sama-sama menyimpan WIP yang belum ter-commit dan
#   sudah lama menggantung. Pada 2026-08-26, `git checkout -- backend/` di VPS
#   membuang dua baris di main.py — pendaftaran router X Tracker. Halamannya
#   tetap tampil, setiap panggilan 404, dan tidak ada yang gagal: berkas
#   route-nya sendiri selamat karena TIDAK terlacak git, jadi hanya
#   pendaftarannya yang mati. Ketahuan berjam-jam kemudian, dari layar.
#
#   Perbedaan satu baris di berkas terlacak tidak menimbulkan galat, tidak
#   muncul di log, dan tidak jatuh di health check. Ia hanya membuat produksi
#   menjalankan kode yang berbeda dari yang Anda baca.
#
# PAKAI:  bash scripts/check-sync.sh          (jalankan SEBELUM deploy)
# ════════════════════════════════════════════════════════════════════
set -uo pipefail

HOST="${LUXQUANT_HOST:-luxquant-vps}"
REMOTE="${LUXQUANT_PATH:-/root/luxquant-terminal}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# Dihitung lewat berkas, bukan variabel. `bad` dipanggil dari dalam
# `while read` di ujung pipeline, yang bash jalankan di SUBSHELL — sebuah
# MASALAH=$((MASALAH+1)) di sana tidak pernah terlihat dari luar, dan skrip
# ini melaporkan dua kesalahan lalu mengatakan "selaras".
: > "$TMP/masalah"

say() { printf "%s\n" "$*"; }
bad() { printf "  ✗ %s\n" "$*"; echo x >> "$TMP/masalah"; }
ok()  { printf "  ✓ %s\n" "$*"; }

say "── 1. Commit ──────────────────────────────────────────"
git fetch -q origin 2>/dev/null
L=$(git rev-parse HEAD)
R=$(git rev-parse origin/main)
V=$(ssh "$HOST" "cd $REMOTE && git rev-parse HEAD" 2>/dev/null)
[ "$L" = "$R" ] && ok "lokal = remote" || bad "lokal dan remote berbeda commit"
[ "$L" = "$V" ] && ok "lokal = VPS" || bad "VPS pada commit lain (${V:0:8} vs ${L:0:8})"

say ""
say "── 2. Isi berkas terlacak ─────────────────────────────"
# Hanya yang benar-benar dideploy. Berkas .bak sengaja diabaikan: keduanya
# menyimpannya dan tak satu pun dijalankan.
git ls-files backend/ frontend-react/src frontend-react/public database/ \
  | grep -vE '\.bak|node_modules' > "$TMP/files.txt"

while read -r f; do
  [ -f "$f" ] && printf "%s|%s\n" "$(md5 -q "$f" 2>/dev/null || md5sum "$f" | cut -d' ' -f1)" "$f"
done < "$TMP/files.txt" | sort -t'|' -k2 > "$TMP/local.md5"

scp -q "$TMP/files.txt" "$HOST:/tmp/_sync_files.txt"
ssh "$HOST" "cd $REMOTE && while read -r f; do
  if [ -f \"\$f\" ]; then printf '%s|%s\n' \"\$(md5sum \"\$f\" | cut -d' ' -f1)\" \"\$f\";
  else printf 'HILANG|%s\n' \"\$f\"; fi
done < /tmp/_sync_files.txt | sort -t'|' -k2" > "$TMP/vps.md5" 2>/dev/null

BEDA=$(python3 - "$TMP/local.md5" "$TMP/vps.md5" <<'PY'
import sys
def load(p):
    d={}
    for ln in open(p):
        if "|" in ln:
            h,f=ln.rstrip("\n").split("|",1); d[f]=h
    return d
a,b=load(sys.argv[1]),load(sys.argv[2])
for f in sorted(a):
    if f not in b:            print("TIDAK ADA DI VPS:", f)
    elif b[f]=="HILANG":      print("HILANG DI VPS   :", f)
    elif a[f]!=b[f]:          print("ISI BERBEDA     :", f)
PY
)
if [ -z "$BEDA" ]; then
  ok "$(wc -l < "$TMP/files.txt" | tr -d ' ') berkas terlacak identik"
else
  say "$BEDA" | while read -r l; do bad "$l"; done
fi

say ""
say "── 3. WIP belum ter-commit ────────────────────────────"
# Ini yang paling sering menggigit: kedua sisi punya WIP, dan hanya salah
# satunya yang punya perbaikan terbaru.
git status --porcelain | grep -E '^( M|\?\?)' | awk '{print $2}' | sort > "$TMP/wip_local"
ssh "$HOST" "cd $REMOTE && git status --porcelain | grep -E '^( M|\?\?)' | awk '{print \$2}' | sort" > "$TMP/wip_vps" 2>/dev/null
HANYA_L=$(comm -23 "$TMP/wip_local" "$TMP/wip_vps")
# Sampah yang wajar hanya ada di VPS: direktori cadangan, skrip diagnostik
# sekali-pakai, dan berkas .generated.js yang memang dibuat ulang di sana saat
# build. Dicocokkan di mana saja pada path, bukan hanya di awal — pola lama
# gagal menangkap "backend/check_tmp.py" dan melaporkannya selamanya.
ABAIKAN='(^backups/|check_tmp|\.generated\.js$)'
HANYA_V=$(comm -13 "$TMP/wip_local" "$TMP/wip_vps" | grep -vE "$ABAIKAN" || true)
[ -z "$HANYA_L" ] && [ -z "$HANYA_V" ] && ok "WIP kedua sisi sama"
[ -n "$HANYA_L" ] && say "$HANYA_L" | while read -r l; do bad "WIP hanya di LOKAL: $l"; done
[ -n "$HANYA_V" ] && say "$HANYA_V" | while read -r l; do bad "WIP hanya di VPS : $l"; done

say ""
MASALAH=$(wc -l < "$TMP/masalah" | tr -d ' ')
if [ "$MASALAH" -eq 0 ]; then
  say "SELARAS — aman untuk deploy."
else
  say "ADA $MASALAH MASALAH — periksa sebelum deploy."
  say "Jangan pernah membereskannya dengan 'git checkout -- <dir>' di VPS:"
  say "itu membuang WIP orang lain tanpa suara. Lihat dulu apa isinya."
fi
exit "$MASALAH"
