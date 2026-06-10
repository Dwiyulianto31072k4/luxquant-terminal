#!/bin/bash
cd /root/luxquant-terminal/backend
set -a && source .env && set +a
exec /usr/bin/python3 scripts/peak_price_worker.py "$@" >> peak_worker_cron.log 2>&1
