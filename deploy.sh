#!/bin/bash
set -e

# ============================================
# LuxQuant + Cryptobot deployment script
# ============================================
# Usage:
#   ./deploy.sh             # deploy both (default)
#   ./deploy.sh both        # same as default
#   ./deploy.sh luxquant    # deploy LuxQuant only
#   ./deploy.sh cryptobot   # deploy Cryptobot only
# ============================================

MODE="${1:-both}"
case "$MODE" in
    luxquant|cryptobot|both) ;;
    *)
        echo "Unknown mode: $MODE"
        echo "Usage: $0 [luxquant|cryptobot|both]"
        exit 2
        ;;
esac

# ---------- LuxQuant paths ----------
LUXQUANT_PATH="/root/luxquant-terminal"
FRONTEND_PATH="$LUXQUANT_PATH/frontend-react"
NGINX_WWW_PATH="/var/www/luxquantdata"
LUXQUANT_SERVICE="luxquant-backend"
LUXQUANT_POLLER_SERVICE="${LUXQUANT_POLLER_SERVICE:-luxquant-poller.service}"
LUXQUANT_HEALTH_URL="http://localhost:8002/health"
LIQUIDATION_STREAM_SERVICE="luxquant-binance-liquidation-stream"
LIQUIDATION_STREAM_UNIT="$LUXQUANT_PATH/deployment/${LIQUIDATION_STREAM_SERVICE}.service"

# ---------- Cryptobot paths ----------
CRYPTOBOT_PATH="/root/cryptobot"
CRYPTOBOT_VENV="$CRYPTOBOT_PATH/venv/bin/python"
CRYPTOBOT_HEALTH_URL="http://127.0.0.1:8000/health"
# Order matters: API first (so health check can poll something), then workers.
# Watchdog is intentionally skipped — it's an on-demand recovery service that
# stays inactive until needed.
CRYPTOBOT_SERVICES=(
    "cryptobot-api"
    "cryptobot-signal-updates"
    "cryptobot-price-watch"
    "cryptobot-executor"
    "cryptobot-position-reconciler"
    "cryptobot-monitoring-alerts"
)

# Cloudflare purge (LuxQuant only — Cryptobot is API-only)
CF_ENV_FILE="/root/.cloudflare_env"

# ============================================================
# LuxQuant deployment
# ============================================================
deploy_luxquant() {
    echo "==============================================="
    echo "🚀 DEPLOYING LUXQUANT"
    echo "==============================================="

    # [1/6] Pull
    echo ""
    echo "📥 [1/6] Menarik kode terbaru dari GitHub..."
    cd "$LUXQUANT_PATH"
    DEPLOY_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    echo "   → Branch aktif: $DEPLOY_BRANCH"
    git pull origin "$DEPLOY_BRANCH"

    # [2/6] Build frontend
    echo ""
    echo "📦 [2/6] Membangun Frontend React..."
    cd "$FRONTEND_PATH"
    # Low CPU/IO priority so the build never starves the live gunicorn workers.
    # This box has few cores — a full-speed vite build was pegging every core for
    # ~20-40s and tripping WORKER TIMEOUT on the still-running workers during a
    # deploy. `nice`+`ionice` makes the build yield to gunicorn; it just finishes
    # a little slower and the deploy no longer causes a blip.
    nice -n 19 ionice -c3 npm run build
    echo "   → Deploying ke Nginx (keep old bundles so in-flight users don't break)..."
    mkdir -p "$NGINX_WWW_PATH"
    # Copy the fresh build OVER the existing files — this updates index.html and
    # adds the new hashed bundles, but does NOT delete the old hashed bundles.
    # A user who still has the previous index.html open can therefore keep
    # loading its (old) chunks instead of hitting a 404 → no broken login after
    # a deploy. Old bundles are pruned below once they're a few days stale.
    cp -r dist/* "$NGINX_WWW_PATH/"
    # Prune hashed asset files not touched in >3 days (well past any live
    # session), so old bundles don't pile up forever. index.html is at the root
    # and is always overwritten above, so it's never pruned.
    find "$NGINX_WWW_PATH/assets" -type f -mtime +3 -delete 2>/dev/null || true
    chown -R www-data:www-data "$NGINX_WWW_PATH"

    # [3/6] Backend replacement — only when backend code actually changed.
    #
    # Measured on this box (2 cores, 4 workers): a plain SIGHUP reload boots all
    # four new workers at once, the old four exit within a second, and app
    # startup takes ~12s under the import storm — an 11-SECOND WINDOW WITH ZERO
    # READY WORKERS. Requests arriving in it sit in the socket backlog; that is
    # the deploy-time latency spike. The old comment here claimed "never a
    # moment with zero live workers" — journalctl says otherwise:
    #   08:17:12 four new workers boot · 08:17:13 old four exit ·
    #   08:17:24 startup complete.
    #
    # Two fixes, both below:
    #   1. Skip the whole dance when backend/ did not change between the last
    #      deployed revision and HEAD. Most deploys are frontend-only and were
    #      paying the gap for nothing.
    #   2. When it did change, replace workers ONE AT A TIME: TTIN spawns a
    #      worker on the new code, we wait for its "Application startup
    #      complete", then TTOU retires the OLDEST worker (verified on this
    #      box: TTOU kills oldest, not newest). At least three ready workers
    #      exist at every moment.
    echo ""
    echo "⚙️  [3/6] Backend replacement (rolling, change-gated)..."

    BACKEND_STAMP="$LUXQUANT_PATH/.deploy-rev-backend"
    BACKEND_CHANGED=1
    if [ -f "$BACKEND_STAMP" ]; then
        last_rev=$(cat "$BACKEND_STAMP" 2>/dev/null || true)
        if git -C "$LUXQUANT_PATH" cat-file -e "${last_rev}^{commit}" 2>/dev/null; then
            if [ -z "$(git -C "$LUXQUANT_PATH" diff --name-only "$last_rev" HEAD -- backend/ | head -1)" ]; then
                BACKEND_CHANGED=0
            fi
        fi
    fi

    rolling_backend_reload() {
        local master n i before after newpid _w
        master=$(systemctl show "$LUXQUANT_SERVICE" -p MainPID --value 2>/dev/null || true)
        if [ -z "$master" ] || [ "$master" = "0" ]; then
            echo "   → Service not running — full start"
            systemctl restart "$LUXQUANT_SERVICE"
            return
        fi
        n=$(pgrep -cP "$master" 2>/dev/null || true)
        if [ -z "$n" ] || [ "$n" -lt 1 ]; then
            echo "   → No workers found — full restart"
            systemctl restart "$LUXQUANT_SERVICE"
            return
        fi
        echo "   → Rolling replace of $n workers (master $master)"
        for i in $(seq 1 "$n"); do
            before=$(pgrep -P "$master" 2>/dev/null | sort -n || true)
            kill -TTIN "$master"
            newpid=""
            for _w in $(seq 1 30); do
                sleep 1
                after=$(pgrep -P "$master" 2>/dev/null | sort -n || true)
                newpid=$(comm -13 <(printf "%s\n" "$before") <(printf "%s\n" "$after") | head -1 || true)
                [ -n "$newpid" ] && break
            done
            if [ -n "$newpid" ]; then
                # wait for the new worker's app to be READY before retiring one
                for _w in $(seq 1 45); do
                    if journalctl -u "$LUXQUANT_SERVICE" --since "3 minutes ago" 2>/dev/null \
                        | grep -q "\[$newpid\].*Application startup complete"; then
                        break
                    fi
                    sleep 1
                done
            fi
            kill -TTOU "$master"
            sleep 1
            echo "     · worker $i/$n replaced (new pid ${newpid:-unknown})"
        done
    }

    if [ "$BACKEND_CHANGED" = "1" ]; then
        rolling_backend_reload
        # Pollers run backend code too — same gate. Restart, not reload:
        # these are asyncio loops, SIGHUP means nothing to them. (This is
        # also what left worker code dormant for five days when it was
        # missing entirely.)
        if systemctl list-unit-files 2>/dev/null | grep -q "^${LUXQUANT_POLLER_SERVICE}"; then
            echo "   → Restarting pollers (${LUXQUANT_POLLER_SERVICE})..."
            systemctl restart "$LUXQUANT_POLLER_SERVICE" || echo "   ⚠️  poller restart failed"
        else
            echo "   ⏭️  ${LUXQUANT_POLLER_SERVICE} not installed — skipping"
        fi
    else
        echo "   ⏭️  backend/ unchanged since last deploy — API and pollers left running"
    fi

    echo "   → Waiting for backend to be ready..."
    for i in {1..30}; do
        sleep 1
        if curl -sf "$LUXQUANT_HEALTH_URL" > /dev/null 2>&1; then
            echo "   ✅ Backend siap (${i}s)"
            break
        fi
        if [ "$i" -eq 30 ]; then
            echo "   ❌ Backend GAGAL start dalam 30s!"
            echo "   📋 Logs terakhir:"
            journalctl -u "$LUXQUANT_SERVICE" -n 30 --no-pager
            exit 1
        fi
    done

    if [ -f "$LIQUIDATION_STREAM_UNIT" ]; then
        echo "   → Syncing Binance liquidation validation stream..."
        install -m 0644 \
            "$LIQUIDATION_STREAM_UNIT" \
            "/etc/systemd/system/${LIQUIDATION_STREAM_SERVICE}.service"
        systemctl daemon-reload
        systemctl enable "$LIQUIDATION_STREAM_SERVICE" > /dev/null
        systemctl restart "$LIQUIDATION_STREAM_SERVICE"
        if systemctl is-active --quiet "$LIQUIDATION_STREAM_SERVICE"; then
            echo "   ✅ Liquidation validation stream active"
        else
            echo "   ❌ Liquidation validation stream failed to start"
            journalctl -u "$LIQUIDATION_STREAM_SERVICE" -n 30 --no-pager
            exit 1
        fi
    fi

    # [4/6] Worker check
    echo ""
    echo "🔍 [4/6] Verifikasi worker count..."
    MASTER_PID=$(systemctl show -p MainPID --value "$LUXQUANT_SERVICE" 2>/dev/null || true)
    if [ -n "$MASTER_PID" ] && [ "$MASTER_PID" != "0" ]; then
        PARENT_COUNT=1
        # Gunicorn workers are direct children of the arbiter (master) PID.
        WORKER_COUNT=$(pgrep -P "$MASTER_PID" 2>/dev/null | wc -l | tr -d ' ')
    else
        PARENT_COUNT=0
        WORKER_COUNT=0
    fi
    echo "   → Master process: $PARENT_COUNT (expected: 1, PID=${MASTER_PID:-none})"
    echo "   → Worker count: $WORKER_COUNT (expected: 4)"
    if [ "$PARENT_COUNT" -ne 1 ]; then
        echo "   ⚠️  WARNING: gunicorn master tidak terdeteksi!"
        ps aux | grep "gunicorn app.main" | grep -v grep || true
    fi
    if [ "$WORKER_COUNT" -eq 0 ]; then
        echo "   ⚠️  WARNING: Worker tidak terdeteksi via pattern — cek manual: pgrep -P $MASTER_PID | xargs ps -o cmd= -p"
    fi

    # [5/6] Redis cache
    echo ""
    echo "🧹 [5/6] Cache Redis..."
    # NOTE: intentionally NOT running `redis-cli flushall` here. Flushing every
    # key on each deploy created a cold-cache storm — the signal/market caches
    # went empty and users got "Failed to load signals" until the poller rebuilt
    # them (~90s), and any Redis-held auth/session state was wiped mid-login.
    # Caches carry TTLs and the poller refreshes them on its own; the
    # cache-invalidator (LISTEN new_signal) handles targeted invalidation. If a
    # specific deploy really needs a manual flush, do it deliberately by hand.
    echo "   ⏭️  Skip flushall (caches self-refresh via TTL + poller + invalidator)"
    if [ -f "$LIQUIDATION_STREAM_UNIT" ]; then
        echo "   → Prewarming estimated liquidation forecast..."
        cd "$LUXQUANT_PATH/backend"
        # Low priority so this prewarm can't starve the freshly-reloaded gunicorn
        # workers (they've just booted and must send heartbeats; on a small box a
        # full-speed prewarm was tripping WORKER TIMEOUT on those new workers).
        if nice -n 19 ionice -c3 ./venv/bin/python -c \
            'import asyncio; from app.services.binance_liquidation_map import fetch_binance_estimated_heatmap; result = asyncio.run(fetch_binance_estimated_heatmap()); raise SystemExit(0 if result.available else 1)'; then
            echo "   ✅ Liquidation forecast prewarmed"
        else
            echo "   ⚠️  Forecast prewarm failed; Compass will retry on its next run"
        fi
    fi

    # [6/6] Cloudflare
    echo ""
    echo "☁️  [6/6] Purge Cloudflare cache..."
    if [ -f "$CF_ENV_FILE" ]; then
        # shellcheck source=/dev/null
        source "$CF_ENV_FILE"
    fi
    if [ -n "${CF_ZONE_ID:-}" ] && [ -n "${CF_API_TOKEN:-}" ]; then
        CF_RESULT=$(curl -4 -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
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

    echo ""
    echo "✅ LuxQuant deployment selesai."
    systemctl status "$LUXQUANT_SERVICE" --no-pager -l | head -10 || true
}

# ============================================================
# Cryptobot deployment
# ============================================================
deploy_cryptobot() {
    echo ""
    echo "==============================================="
    echo "🤖 DEPLOYING CRYPTOBOT"
    echo "==============================================="

    # [1/4] Pull
    echo ""
    echo "📥 [1/4] Menarik kode Cryptobot terbaru..."
    cd "$CRYPTOBOT_PATH"
    BEFORE_HASH=$(git rev-parse HEAD 2>/dev/null || echo "none")
    git pull origin luxquant-main
    AFTER_HASH=$(git rev-parse HEAD 2>/dev/null || echo "none")
    if [ "$BEFORE_HASH" = "$AFTER_HASH" ]; then
        echo "   ℹ️  Tidak ada perubahan kode (HEAD: ${AFTER_HASH:0:7}). Tetap restart untuk re-sync state."
        CODE_CHANGED=0
    else
        echo "   📌 ${BEFORE_HASH:0:7} → ${AFTER_HASH:0:7}"
        CODE_CHANGED=1
    fi

    # [2/4] Smoke test — hanya kalau ada perubahan kode
    echo ""
    if [ "$CODE_CHANGED" -eq 1 ]; then
        echo "🧪 [2/4] Smoke test (pytest)..."
        if "$CRYPTOBOT_VENV" -m pytest \
                tests/test_position_reconciliation.py \
                tests/test_portfolio_emergency.py \
                -q 2>&1 | tail -5; then
            echo "   ✅ Smoke test pass"
        else
            echo "   ❌ Smoke test FAIL — deployment dibatalkan, service tidak di-restart"
            exit 1
        fi
    else
        echo "🧪 [2/4] Smoke test di-skip (tidak ada perubahan kode)."
    fi

    # [3/4] Restart service satu per satu, verifikasi tiap step
    echo ""
    echo "♻️  [3/4] Restart Cryptobot services..."
    for SVC in "${CRYPTOBOT_SERVICES[@]}"; do
        printf "   → %-40s" "$SVC"
        systemctl restart "$SVC"
        # Poll is-active sampai active, max 15s — fail-fast kalau ada yang nyangkut.
        for i in {1..15}; do
            sleep 1
            STATE=$(systemctl is-active "$SVC" 2>/dev/null || true)
            if [ "$STATE" = "active" ]; then
                echo "✅ ${i}s"
                break
            fi
            if [ "$i" -eq 15 ]; then
                echo "❌ tidak active dalam 15s (state=$STATE)"
                echo "   📋 Logs terakhir:"
                journalctl -u "$SVC" -n 20 --no-pager
                exit 1
            fi
        done
    done

    # [4/4] API health check
    echo ""
    echo "🩺 [4/4] Verifikasi Cryptobot API health..."
    for i in {1..30}; do
        sleep 1
        if curl -sf "$CRYPTOBOT_HEALTH_URL" > /dev/null 2>&1; then
            echo "   ✅ Cryptobot API siap (${i}s)"
            # Tampilkan ringkasan health untuk audit visual
            curl -s "$CRYPTOBOT_HEALTH_URL" | head -c 300
            echo ""
            break
        fi
        if [ "$i" -eq 30 ]; then
            echo "   ❌ Cryptobot API GAGAL respond dalam 30s!"
            journalctl -u cryptobot-api -n 30 --no-pager
            exit 1
        fi
    done

    echo ""
    echo "✅ Cryptobot deployment selesai."
}

# ============================================================
# Main
# ============================================================
echo "Mode: $MODE"
echo ""

case "$MODE" in
    luxquant)
        deploy_luxquant
        ;;
    cryptobot)
        deploy_cryptobot
        ;;
    both)
        deploy_luxquant
        deploy_cryptobot
        ;;
esac

echo ""
echo "==============================================="
git -C "$LUXQUANT_PATH" rev-parse HEAD > "$LUXQUANT_PATH/.deploy-rev-backend" 2>/dev/null || true
    echo "🎉 DEPLOYMENT SELESAI ($MODE)"
echo "==============================================="
echo ""
echo "💡 Useful commands:"
echo "   • Log LuxQuant   : journalctl -u $LUXQUANT_SERVICE -f"
echo "   • Log Cryptobot  : journalctl -u cryptobot-api -f"
echo "   • Status all     : systemctl status $LUXQUANT_SERVICE 'cryptobot-*' --no-pager"
echo "   • Deploy partial : ./deploy.sh luxquant | cryptobot | both"
echo ""
