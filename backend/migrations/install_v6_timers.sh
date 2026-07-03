#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
# LuxQuant AI Arena v6 — Systemd Timer Install Script
# ════════════════════════════════════════════════════════════════════════
# Installs 6 systemd units:
#   1. luxquant-arena-v6.service        (one-shot worker)
#   2. luxquant-arena-v6.timer          (4x/day at 00/06/12/18 UTC)
#   3. luxquant-arena-v6-evaluator.service (one-shot outcome evaluator)
#   4. luxquant-arena-v6-evaluator.timer   (hourly at minute 5)
#   5. luxquant-arena-v6-monitor.service   (cheap BTC change detector)
#   6. luxquant-arena-v6-monitor.timer     (every 2 minutes)
#
# Run as root from project root: bash backend/migrations/install_v6_timers.sh
# ════════════════════════════════════════════════════════════════════════

set -euo pipefail

REPO_DIR="/root/luxquant-terminal"
SOURCE_DIR="$REPO_DIR/backend/migrations/systemd"
TARGET_DIR="/etc/systemd/system"

if [[ $EUID -ne 0 ]]; then
    echo "ERROR: Must be run as root (sudo)"
    exit 1
fi

if [[ ! -d "$SOURCE_DIR" ]]; then
    echo "ERROR: Source dir not found: $SOURCE_DIR"
    echo "Make sure backend/migrations/systemd/ exists with the unit files."
    exit 1
fi

LOCK_RUNNER="$REPO_DIR/backend/migrations/run_compass_with_lock.sh"
if [[ ! -f "$LOCK_RUNNER" ]]; then
    echo "ERROR: Lock runner not found: $LOCK_RUNNER"
    exit 1
fi
chmod 755 "$LOCK_RUNNER"

echo "=== LuxQuant AI Arena v6 Timer Install ==="
echo

# ─────────────────────────────────────────────────────────────────────
# Copy unit files
# ─────────────────────────────────────────────────────────────────────
UNITS=(
    "luxquant-arena-v6.service"
    "luxquant-arena-v6.timer"
    "luxquant-arena-v6-evaluator.service"
    "luxquant-arena-v6-evaluator.timer"
    "luxquant-arena-v6-monitor.service"
    "luxquant-arena-v6-monitor.timer"
    "luxquant-compass-resolver.service"
    "luxquant-compass-resolver.timer"
    "luxquant-compass-reflection.service"
    "luxquant-compass-reflection.timer"
)

echo "[1/4] Copying unit files to $TARGET_DIR..."
for unit in "${UNITS[@]}"; do
    src="$SOURCE_DIR/$unit"
    dst="$TARGET_DIR/$unit"
    if [[ ! -f "$src" ]]; then
        echo "  ✗ Missing: $src"
        exit 1
    fi
    cp "$src" "$dst"
    chmod 644 "$dst"
    echo "  ✓ $unit"
done

# ─────────────────────────────────────────────────────────────────────
# Reload systemd & enable timers
# ─────────────────────────────────────────────────────────────────────
echo
echo "[2/4] Reloading systemd daemon..."
systemctl daemon-reload

echo
echo "[3/4] Enabling + starting timers..."
# NOTE: report generation is now EVENT-DRIVEN.
# The fixed 4x/day scheduled report timer (luxquant-arena-v6.timer) is intentionally
# NOT enabled — the 2-minute monitor triggers a fresh read only when the market
# materially changes (price/volatility move or a projection level touch).
# To re-enable the fixed schedule: systemctl enable --now luxquant-arena-v6.timer
systemctl disable luxquant-arena-v6.timer 2>/dev/null || true
systemctl stop luxquant-arena-v6.timer 2>/dev/null || true
systemctl enable luxquant-arena-v6-evaluator.timer
systemctl enable luxquant-arena-v6-monitor.timer
systemctl enable luxquant-compass-resolver.timer
systemctl enable luxquant-compass-reflection.timer
systemctl start luxquant-arena-v6-evaluator.timer
systemctl start luxquant-arena-v6-monitor.timer
systemctl start luxquant-compass-resolver.timer
systemctl start luxquant-compass-reflection.timer
echo "  • luxquant-arena-v6.timer DISABLED (event-driven mode — monitor drives reports)"
echo "  ✓ luxquant-arena-v6-evaluator.timer enabled + started"
echo "  ✓ luxquant-arena-v6-monitor.timer enabled + started"
echo "  ✓ luxquant-compass-resolver.timer enabled + started"

# ─────────────────────────────────────────────────────────────────────
# Verify
# ─────────────────────────────────────────────────────────────────────
echo
echo "[4/4] Verifying timer schedule..."
echo
systemctl list-timers luxquant-arena-v6* --no-pager

echo
echo "=== Install complete ==="
echo
echo "Next scheduled runs:"
echo "  - Worker:    DISABLED (event-driven — no fixed schedule)"
echo "  - Monitor:   every 2 minutes, triggers a full run only on material BTC changes"
echo "  - Evaluator: every hour at :05 UTC"
echo "  - Resolver:  every 5 minutes (Compass 2.0 first-barrier audit)"
echo
echo "Useful commands:"
echo "  systemctl list-timers luxquant-arena-v6*"
echo "  systemctl status luxquant-arena-v6.timer"
echo "  systemctl status luxquant-arena-v6-monitor.timer"
echo "  journalctl -u luxquant-arena-v6.service -n 50"
echo "  journalctl -u luxquant-arena-v6-monitor.service -n 50"
echo "  journalctl -u luxquant-arena-v6-evaluator.service -n 50"
echo
echo "Manual trigger (test once):"
echo "  systemctl start luxquant-arena-v6.service"
echo "  systemctl start luxquant-arena-v6-monitor.service"
echo "  systemctl start luxquant-arena-v6-evaluator.service"
