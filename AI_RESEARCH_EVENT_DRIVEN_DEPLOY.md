# AI Research → Event-Driven Compass — Deploy Runbook

This release makes the BTC Compass **event-driven**: the fixed 4×/day schedule is
removed, and the 2-minute monitor triggers a fresh AI read only when the market
**materially changes** — price/volatility moves, projection-level touches, and now
**derivatives confluence** (funding-rate flips/extremes, open-interest surges/flushes,
long/short positioning shifts). All triggers are event/crossing-based, so a persistent
state does not re-fire every poll.

## What changed

**Backend**
- `backend/migrations/install_v6_timers.sh` — no longer enables the scheduled report
  timer (`luxquant-arena-v6.timer`); it is explicitly disabled. Monitor, evaluator,
  resolver, and reflection timers stay on.
- `backend/app/services/ai_arena_v6_monitor.py`
  - Bootstrap trigger: generates a first read if no report exists yet.
  - Derivatives confluence layer (Bybit linear BTCUSDT): funding flip/spike/extreme,
    OI surge/flush over ~1h, long/short shift. Fully fail-safe (any fetch error →
    price/level signals only). Toggle with `COMPASS_MONITOR_DERIVATIVES_ENABLED`.

**Frontend**
- `humanizeTrigger()` in `aiArenaV6/_ui.jsx` renders machine trigger codes as plain
  English (e.g. `oi_surge_+7.30%_1h` → "open interest surged +7.30% in 1h (leverage
  building)").
- `TheRead.jsx` + `CompassSnapshot.jsx` banners now show event-driven copy and the
  humanized trigger reason.

## Deploy — backend (run on the VPS as root)

```bash
cd /root/luxquant-terminal
git pull

# Refresh systemd units. This DISABLES the fixed schedule and keeps the monitor.
bash backend/migrations/install_v6_timers.sh

# The monitor is a systemd oneshot fired every 2 min; it runs the new code on its
# next fire automatically. To test immediately:
systemctl start luxquant-arena-v6-monitor.service
journalctl -u luxquant-arena-v6-monitor.service -n 40 --no-pager
```

### Verify
```bash
# Scheduled report timer must be gone; monitor/evaluator/resolver must remain.
systemctl list-timers 'luxquant-arena-v6*' --no-pager
systemctl is-enabled luxquant-arena-v6.timer      # expect: disabled

# See a live decision WITHOUT triggering a full run:
cd /root/luxquant-terminal/backend
venv/bin/python -m app.services.ai_arena_v6_monitor --dry-run
```
A healthy dry-run logs a line like:
`BTC monitor price=$... 15m=... funding=... oi_1h=... long%=... decision=no_material_change`

### Optional threshold tuning (systemd override or EnvironmentFile)
```ini
COMPASS_MONITOR_DERIVATIVES_ENABLED=true      # set false to disable the whole layer
COMPASS_MONITOR_FUNDING_EXTREME_HIGH_PCT=0.05 # crowded longs (%/8h)
COMPASS_MONITOR_FUNDING_EXTREME_LOW_PCT=-0.02 # crowded shorts
COMPASS_MONITOR_FUNDING_SPIKE_DELTA_PCT=0.03  # jump between settlements
COMPASS_MONITOR_OI_SURGE_1H_PCT=5.0           # OI build/unwind over ~1h
COMPASS_MONITOR_LS_SHIFT_PP=8.0               # long-share shift (pp)
COMPASS_MONITOR_COOLDOWN_MINUTES=30           # min gap between event reports
```
The backend API (uvicorn) does **not** need a restart — no API routes changed.

## Deploy — frontend

```bash
cd /root/luxquant-terminal/frontend-react
npm install            # only if deps changed
npm run build
# publish the build output to your existing web root / nginx (same as usual)
```

## Rollback
- Re-enable the fixed schedule: `systemctl enable --now luxquant-arena-v6.timer`
- Disable derivatives only: set `COMPASS_MONITOR_DERIVATIVES_ENABLED=false`, then
  `systemctl restart luxquant-arena-v6-monitor.timer` (next fire uses it).
- Full revert: `git revert <commit>` and redeploy.

## Notes / best-practice rationale
- Triggers combine **volatility** (adaptive, ATR-like), **structure** (projection-level
  touches), and **derivatives** (funding/OI/positioning) — the multi-signal confluence
  recommended for crypto event detection, rather than price alone.
- `/latest` serves Redis→DB fallback, so during quiet markets the page keeps showing the
  last read (older timestamp) — it never goes blank without a schedule.
- Derivatives use Bybit public endpoints (no API key) and are individually wrapped in
  try/except, so a Bybit hiccup degrades gracefully to price/level triggers.
