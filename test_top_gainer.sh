#!/bin/bash
# Test query top gainer baru via SSH ke VPS
set -e

VPS_USER="root"
VPS_HOST="187.127.135.84"
DAYS="${1:-7}"
LIMIT=10

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Top Gainer Query Test — Window: Last ${DAYS} days${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}[1/3] Existing endpoint (TP-based, current logic):${NC}"
echo ""
ssh ${VPS_USER}@${VPS_HOST} "curl -s 'http://localhost:8002/api/v1/signals/top-performers?days=${DAYS}&limit=${LIMIT}'" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
gainers = data.get('top_gainers', [])
print(f\"  Period: {data.get('period', 'N/A')}\")
print(f\"  Total TP hits: {data.get('total_tp_hits', 0)} | Unique pairs: {data.get('unique_pairs', 0)}\")
print()
print(f\"  {'#':<4}{'PAIR':<14}{'ENTRY':<14}{'TP_PRICE':<14}{'GAIN%':<12}{'TP_LVL':<8}{'CALLED':<8}\")
print(f\"  {'-'*74}\")
for i, g in enumerate(gainers, 1):
    pair = g['pair'][:12]
    entry = f\"\${g['entry']:.6f}\"[:13]
    tp = f\"\${g['tp_price']:.6f}\"[:13]
    gain = f\"+{g['gain_pct']:.2f}%\"[:11]
    lvl = (g.get('tp_level') or '').strip()[:6]
    cnt = f\"{g.get('signal_count', 1)}x\"
    print(f\"  {i:<4}{pair:<14}{entry:<14}{tp:<14}{gain:<12}{lvl:<8}{cnt:<8}\")
"
echo ""

echo -e "${YELLOW}[2/3] New query (PEAK-based, proposed):${NC}"
echo ""
ssh ${VPS_USER}@${VPS_HOST} "sudo -u postgres psql -d luxquant -t -A -F'|' << 'EOF'
WITH signals_in_window AS (
    SELECT s.signal_id, UPPER(s.pair) as pair, s.entry, s.peak_price, s.peak_at,
        s.created_at as signal_time
    FROM signals s
    WHERE s.entry > 0 AND s.pair IS NOT NULL AND s.peak_price IS NOT NULL
      AND (s.created_at::timestamptz >= NOW() - INTERVAL '${DAYS} days'
           OR s.peak_at >= NOW() - INTERVAL '${DAYS} days')
),
pair_stats AS (
    SELECT pair, MIN(signal_time) as first_signal_time,
        (ARRAY_AGG(entry ORDER BY signal_time ASC))[1] as first_entry,
        MAX(peak_price) as best_peak_price,
        (ARRAY_AGG(peak_at ORDER BY peak_price DESC NULLS LAST))[1] as best_peak_at,
        COUNT(DISTINCT signal_id) as signal_count
    FROM signals_in_window GROUP BY pair
)
SELECT pair, first_entry::text, best_peak_price::text,
    ROUND(((best_peak_price - first_entry) / NULLIF(first_entry, 0) * 100)::numeric, 2)::text,
    signal_count::text,
    to_char(first_signal_time::timestamptz, 'YYYY-MM-DD HH24:MI'),
    to_char(best_peak_at, 'YYYY-MM-DD HH24:MI')
FROM pair_stats
WHERE best_peak_price > first_entry AND first_entry > 0
ORDER BY ((best_peak_price - first_entry) / NULLIF(first_entry, 0)) DESC
LIMIT ${LIMIT};
EOF" | awk -F'|' '
BEGIN {
    printf "  %-4s%-14s%-16s%-16s%-12s%-9s%-18s%-18s\n", "#", "PAIR", "FIRST_ENTRY", "PEAK_PRICE", "GAIN%", "CALLED", "FIRST_CALL", "PEAK_AT"
    printf "  "; for(i=0; i<107; i++) printf "-"; printf "\n"
    n=0
}
NF >= 7 {
    n++
    pair=substr($1, 1, 12)
    entry="$" $2; if (length(entry) > 14) entry = substr(entry, 1, 14)
    peak="$" $3; if (length(peak) > 14) peak = substr(peak, 1, 14)
    gain="+" $4 "%"; if (length(gain) > 10) gain = substr(gain, 1, 10)
    cnt=$5 "x"
    printf "  %-4d%-14s%-16s%-16s%-12s%-9s%-18s%-18s\n", n, pair, entry, peak, gain, cnt, $6, $7
}
END { if (n == 0) print "  (no data)" }'
echo ""

echo -e "${YELLOW}[3/3] Spot check — RAVE in window:${NC}"
echo ""
ssh ${VPS_USER}@${VPS_HOST} "sudo -u postgres psql -d luxquant -c \"
SELECT pair, entry, peak_price, peak_pct, status,
    to_char(created_at::timestamptz, 'YYYY-MM-DD HH24:MI') as called,
    to_char(peak_at, 'YYYY-MM-DD HH24:MI') as peak_at
FROM signals
WHERE UPPER(pair) = 'RAVEUSDT'
  AND (created_at::timestamptz >= NOW() - INTERVAL '${DAYS} days'
       OR peak_at >= NOW() - INTERVAL '${DAYS} days')
ORDER BY created_at ASC;
\""

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Done. Compare [1] vs [2] above.${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
