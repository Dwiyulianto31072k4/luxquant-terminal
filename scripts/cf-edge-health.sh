#!/usr/bin/env bash
# Origin vs Cloudflare delivery check for luxquant.tw.
# This box reaches CF colo MRS, NOT Singapore (Andika). A 200 here is not
# proof SIN is healthy. Pair with a Singapore synthetic monitor.
#
# Cron (root):  */5 * * * * /root/luxquant-terminal/scripts/cf-edge-health.sh
set -uo pipefail

PUBLIC="https://luxquant.tw"
LOG="${LQ_EDGE_LOG:-/var/log/luxquant-edge-health.log}"
STAMP="${LQ_EDGE_STAMP:-/tmp/luxquant-edge-522}"
ROOT="${LQ_ROOT:-/root/luxquant-terminal}"

ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

log() {
  local line="$1"
  echo "$(ts) $line"
  echo "$(ts) $line" >> "$LOG" 2>/dev/null || true
}

html=$(curl -sS -m 10 -H "Host: luxquant.tw" http://127.0.0.1/index.html || true)
chunk=$(printf '%s' "$html" | python3 -c '
import re,sys
m=re.search(r"src=\"(/assets/js/index-[^\"]+)\"", sys.stdin.read())
print(m.group(1) if m else "")
' 2>/dev/null || true)

fail=0
origin_code() {
  curl -sS -m 12 -o /dev/null -w "%{http_code}" -H "Host: luxquant.tw" "$1" || echo 000
}
public_code() {
  curl -sS -m 25 -o /dev/null -w "%{http_code}" "$1" || echo 000
}

check() {
  local name="$1" origin_path="$2" public_url="$3"
  local oc pc
  oc=$(origin_code "$origin_path")
  pc=$(public_code "$public_url")
  if [ "$oc" = "200" ] && [ "$pc" = "200" ]; then
    log "OK  $name origin=$oc public=$pc"
    return 0
  fi
  log "FAIL $name origin=$oc public=$pc"
  if [ "$oc" = "200" ] && [ "$pc" = "522" ]; then
    log "522 $public_url  (origin 200 — purge this URL, do not salt/rebuild)"
    echo "$public_url" > "$STAMP" 2>/dev/null || true
  fi
  fail=1
}

check "html" "http://127.0.0.1/" "$PUBLIC/"
if [ -n "$chunk" ]; then
  check "chunk $chunk" "http://127.0.0.1$chunk" "$PUBLIC$chunk"
else
  log "WARN could not parse index chunk"
fi

# GraphQL 522 (no-op until token has Analytics:Read)
if [ -f "$ROOT/scripts/cf-analytics-522.py" ]; then
  python3 "$ROOT/scripts/cf-analytics-522.py" >> "$LOG" 2>&1 || true
fi

# Unstick SIN (and other colo) hashed assets: origin 200 + 522 → purge that URL.
if [ -f "$ROOT/scripts/cf-unstick.py" ]; then
  python3 "$ROOT/scripts/cf-unstick.py" >> "$LOG" 2>&1 || true
fi

if [ "$fail" -eq 0 ]; then
  rm -f "$STAMP" 2>/dev/null || true
  exit 0
fi
exit 1
