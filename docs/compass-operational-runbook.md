# Compass Operational Runbook

Status: Phase 7 runbook for BTC Compass monitoring and alert response.

This runbook covers runtime health only. It must not be used to change market
direction, confidence, entries, stops, targets, or position sizing.

## Quick Triage

Run on the VPS:

```bash
curl -sf http://localhost:8002/health
curl -sf http://localhost:8002/openapi.json | grep operational-health
systemctl is-active luxquant-backend
systemctl is-active luxquant-arena-v6.timer
systemctl is-active luxquant-arena-v6-evaluator.timer
systemctl is-active luxquant-binance-liquidation-stream
redis-cli ping
```

For the full operational contract:

```bash
cd /root/luxquant-terminal/backend
./venv/bin/python - <<'PY'
import json
from app.core.database import SessionLocal
from app.services.compass_operational_health import get_operational_health

db = SessionLocal()
try:
    print(json.dumps(get_operational_health(db), default=str, indent=2))
finally:
    db.close()
PY
```

## Alert Keys

### `api`

Meaning: the FastAPI process or route layer cannot serve Compass health.

Checks:

```bash
systemctl status luxquant-backend --no-pager --full
journalctl -u luxquant-backend -n 120 --no-pager
curl -sf http://localhost:8002/health
```

Action: restart the backend if the process is dead, then re-check `/health`.
Do not redeploy until logs show whether the failure is code, config, or
dependency-related.

### `redis`

Meaning: the cache layer is unreachable or unhealthy.

Checks:

```bash
redis-cli ping
systemctl status redis-server --no-pager --full
journalctl -u redis-server -n 80 --no-pager
```

Action: restart Redis only if it is actually down. Do not flush Redis as a
first response; last-good Compass payloads are useful diagnostics.

### `latest_report`

Meaning: the latest v6.1 Compass report is missing, stale, or expired.

Checks:

```bash
cd /root/luxquant-terminal/backend
./venv/bin/python -m app.services.ai_arena_v6_scheduled_run
systemctl status luxquant-arena-v6.timer --no-pager --full
journalctl -u luxquant-arena-v6.service -n 160 --no-pager
```

Action: inspect the worker log first. If the timer is inactive, restart the
timer. If the worker fails, fix the failing source or dependency before trusting
new narrative output.

### `dashboard_health`

Meaning: the evidence dashboard could not be built from the latest report, or
the report has critical data-quality issues.

Checks:

```bash
cd /root/luxquant-terminal/backend
./venv/bin/python - <<'PY'
from app.core.database import SessionLocal
from app.services.compass_operational_health import get_operational_health

db = SessionLocal()
try:
    health = get_operational_health(db)
    for check in health["checks"]:
        if check["key"] in {"dashboard_health", "source_health"}:
            print(check)
finally:
    db.close()
PY
```

Action: identify whether the issue is stale report age, missing evidence rows,
or unavailable source health. Fix ingestion before interpreting the AI summary.

### `source_health`

Meaning: one or more evidence feeds are stale or unavailable.

Checks:

```bash
cd /root/luxquant-terminal/backend
./venv/bin/python - <<'PY'
from app.core.database import SessionLocal
from app.models.ai_arena import AIArenaReport

db = SessionLocal()
try:
    row = (
        db.query(AIArenaReport)
        .filter(AIArenaReport.schema_version == "v6.1")
        .order_by(AIArenaReport.timestamp.desc())
        .first()
    )
    matrix = (row.report_json or {}).get("evidence_matrix", {}) if row else {}
    for item in matrix.get("rows", []):
        print(item.get("key"), item.get("source_health"))
finally:
    db.close()
PY
```

Action: fix the specific stale or unavailable feed. Treat unavailable as
missing evidence, not neutral market evidence.

### `backend_service`

Meaning: `luxquant-backend` is not active.

Checks:

```bash
systemctl status luxquant-backend --no-pager --full
journalctl -u luxquant-backend -n 160 --no-pager
```

Action: restart the backend, then re-check `/health` and the AI Arena page.

### `arena_timer`

Meaning: `luxquant-arena-v6.timer` is inactive, so scheduled report generation
may stop.

Checks:

```bash
systemctl status luxquant-arena-v6.timer --no-pager --full
systemctl list-timers luxquant-arena-v6* --no-pager
journalctl -u luxquant-arena-v6.service -n 160 --no-pager
```

Action: enable and start the timer, or run the worker once manually if an
immediate fresh report is needed.

### `evaluator_timer`

Meaning: `luxquant-arena-v6-evaluator.timer` is inactive, so outcome validation
and calibration may stop updating.

Checks:

```bash
systemctl status luxquant-arena-v6-evaluator.timer --no-pager --full
journalctl -u luxquant-arena-v6-evaluator.service -n 160 --no-pager
```

Action: enable and start the evaluator timer. This affects validation history,
not the current market direction.

### `liquidation_stream`

Meaning: the Binance liquidation validation stream is inactive, so actual
liquidation samples will not accumulate.

Checks:

```bash
systemctl status luxquant-binance-liquidation-stream --no-pager --full
journalctl -u luxquant-binance-liquidation-stream -n 160 --no-pager
```

Action: restart the stream and confirm new liquidation audit records begin
accumulating. This validates the estimated heatmap; it is not a direct trade
signal.
