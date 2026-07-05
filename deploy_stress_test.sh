#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# Deploy stress test — prove repeated deploys are safe.
# Runs ./deploy.sh N times back-to-back and after each one checks:
#   • deploy exit code (0 = ok)
#   • uptime probe: hammered /health during the deploy → OK vs FAIL count
#     (FAIL should be ~0 → no downtime during the rolling reload)
#   • signal_keys in Redis → must stay > 0  (proves cache is NOT wiped)
#   • db connections → must stay well under max
#   • NEW gunicorn WORKER TIMEOUT since the test started → must be 0
#
# Run on the VPS:  bash deploy_stress_test.sh [N]   (default N=3)
# ════════════════════════════════════════════════════════════════════════
set -uo pipefail

N="${1:-3}"
HEALTH="http://localhost:8002/health"
START_TS="$(date '+%Y-%m-%d %H:%M:%S')"
cd "$(dirname "$0")"

conns()   { sudo -u postgres psql -tAc "SELECT count(*) FROM pg_stat_activity" 2>/dev/null | tr -d ' '; }
sigkeys() { curl -s -m3 "$HEALTH" 2>/dev/null | grep -o '"signal_keys":[0-9]*' | cut -d: -f2; }
mktkeys() { curl -s -m3 "$HEALTH" 2>/dev/null | grep -o '"market_keys":[0-9]*' | cut -d: -f2; }
health()  { curl -sf -m3 "$HEALTH" >/dev/null 2>&1 && echo OK || echo DOWN; }
newtmo()  { journalctl -u luxquant-backend --since "$START_TS" --no-pager 2>/dev/null | grep -c "WORKER TIMEOUT"; }

echo "=== BASELINE ($START_TS) ==="
echo "   health=$(health)  signal_keys=$(sigkeys)  market_keys=$(mktkeys)  db_conns=$(conns)  poller=$(systemctl is-active luxquant-poller)"

for i in $(seq 1 "$N"); do
  echo ""
  echo "################  DEPLOY #$i / $N  ################"

  # Probe /health continuously in the background to catch any downtime.
  (
    ok=0; fail=0; end=$((SECONDS+55))
    while [ $SECONDS -lt $end ]; do
      if curl -sf -m2 "$HEALTH" >/dev/null 2>&1; then ok=$((ok+1)); else fail=$((fail+1)); fi
      sleep 0.3
    done
    echo "$ok $fail" > "/tmp/probe_$i.txt"
  ) &
  probe_pid=$!

  ./deploy.sh luxquant > "/tmp/deploy_$i.log" 2>&1
  rc=$?

  wait "$probe_pid" 2>/dev/null || true
  read -r pok pfail < "/tmp/probe_$i.txt" 2>/dev/null || { pok="?"; pfail="?"; }

  echo "   deploy exit code : $rc   $([ "$rc" -eq 0 ] && echo '✅' || echo '❌ CEK /tmp/deploy_'"$i"'.log')"
  echo "   uptime probe     : OK=$pok  FAIL=$pfail   $([ "${pfail:-1}" -eq 0 ] && echo '✅ nol downtime' || echo '⚠️ ada request gagal saat reload')"
  echo "   signal_keys      : $(sigkeys)   (harus > 0 = cache TIDAK dihapus)"
  echo "   market_keys      : $(mktkeys)"
  echo "   db_conns         : $(conns)"
  echo "   worker_timeout   : $(newtmo) baru sejak tes mulai (harus 0)"
done

echo ""
echo "════════════════  HASIL AKHIR  ════════════════"
TMO="$(newtmo)"; SK="$(sigkeys)"; DC="$(conns)"; H="$(health)"
echo "   WORKER TIMEOUT baru total : $TMO   $([ "$TMO" -eq 0 ] && echo '✅' || echo '❌')"
echo "   signal_keys sekarang      : $SK   $([ "${SK:-0}" -gt 0 ] && echo '✅ cache aman' || echo '❌ cache kosong!')"
echo "   db_conns sekarang         : $DC   $([ "${DC:-999}" -lt 140 ] && echo '✅' || echo '⚠️ tinggi')"
echo "   health                    : $H"
echo ""
if [ "$TMO" -eq 0 ] && [ "${SK:-0}" -gt 0 ] && [ "$H" = "OK" ]; then
  echo "   🎉 LULUS — deploy berkali-kali AMAN: nol timeout, cache utuh, backend sehat."
else
  echo "   ⚠️  ADA yang perlu dicek — lihat baris ❌/⚠️ di atas."
fi
