#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
# LuxQuant AI Arena v6 — Systemd Timer Install Script
# ════════════════════════════════════════════════════════════════════════
# Installs 4 systemd units:
#   1. luxquant-arena-v6.service        (one-shot worker)
#   2. luxquant-arena-v6.timer          (4x/day at 00/06/12/18 UTC)
#   3. luxquant-arena-v6-evaluator.service (one-shot outcome evaluator)
#   4. luxquant-arena-v6-evaluator.timer   (hourly at minute 5)
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
systemctl enable luxquant-arena-v6.timer
systemctl enable luxquant-arena-v6-evaluator.timer
systemctl start luxquant-arena-v6.timer
systemctl start luxquant-arena-v6-evaluator.timer
echo "  ✓ luxquant-arena-v6.timer enabled + started"
echo "  ✓ luxquant-arena-v6-evaluator.timer enabled + started"

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
echo "  - Worker:    every 6h at 00/06/12/18 UTC"
echo "  - Evaluator: every hour at :05 UTC"
echo
echo "Useful commands:"
echo "  systemctl list-timers luxquant-arena-v6*"
echo "  systemctl status luxquant-arena-v6.timer"
echo "  journalctl -u luxquant-arena-v6.service -n 50"
echo "  journalctl -u luxquant-arena-v6-evaluator.service -n 50"
echo
echo "Manual trigger (test once):"
echo "  systemctl start luxquant-arena-v6.service"
echo "  systemctl start luxquant-arena-v6-evaluator.service"
