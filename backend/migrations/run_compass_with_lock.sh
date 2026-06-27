#!/bin/bash
# Run Compass jobs with one shared lock so scheduled and monitor-triggered
# reports cannot generate duplicate market reads at the same time.

set -euo pipefail

LOCK_FILE="${COMPASS_RUN_LOCK_FILE:-/tmp/luxquant-arena-v6-run.lock}"
MODE="${1:-}"

if [[ -z "$MODE" ]]; then
    echo "Usage: $0 <scheduled|monitor> [args...]"
    exit 2
fi

shift || true

case "$MODE" in
    scheduled)
        CMD=(
            /root/luxquant-terminal/backend/venv/bin/python
            -m app.services.ai_arena_v6_scheduled_run
            "$@"
        )
        ;;
    monitor)
        CMD=(
            /root/luxquant-terminal/backend/venv/bin/python
            -m app.services.ai_arena_v6_monitor
            "$@"
        )
        ;;
    *)
        echo "Unknown Compass job mode: $MODE"
        exit 2
        ;;
esac

if /usr/bin/flock -n -E 75 "$LOCK_FILE" "${CMD[@]}"; then
    exit 0
fi

code=$?
if [[ "$code" == "75" ]]; then
    echo "Another Compass run is already active; skipping $MODE job."
    exit 0
fi

exit "$code"
