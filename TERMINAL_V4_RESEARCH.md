# Terminal v4 — Deep Research & Element Design
> Signals Analytics: side-nav layout, derivatives intelligence, live TA vs BTC,
> and a zero-empty-state caching system. Everything below is grounded in what
> ALREADY exists in this repo (verified endpoints/tables), so implementation is
> wiring + precompute, not new infrastructure.

---

## 0. What we verified exists (data inventory)

### A. Backend proxies already live in `app/api/routes/market.py`
| Endpoint | Data | Batchable? |
|---|---|---|
| `/market/prices?symbols=` | price, 24h volume, 24h change (100/pair batch) | ✅ already batched |
| `/market/klines?symbol&interval&startTime&endTime` | OHLCV (spot→futures fallback) | per symbol |
| `/market/funding-rate/{symbol}` + `/funding-rates` | funding per pair | per symbol / topN |
| `/market/long-short-ratio?symbol` | global account LSR | per symbol |
| `/market/top-trader-ratio?symbol` | top trader position LSR | per symbol |
| `/market/open-interest?symbol` | OI now (contracts × price) | per symbol |
| `/market/open-interest-history?symbol&period` | OI series (5m/1h) | per symbol |
| `/market/taker-volume?symbol` | taker buy/sell ratio | per symbol |
| `/market/derivatives-pulse` | aggregate OI + funding snapshot | ✅ single call |

### B. DB (from `luxquant_schema_report.txt`, 74 tables)
- `signals`: entry/targets/stop, status final (open/tp1-3/closed_win/closed_loss), **peak_pct/peak_price/peak_at**, market_cap, risk
- `signal_updates` (227k): every TP/SL hit **with timestamp & price** → time-to-TP analytics
- `signal_journey` (51k): MAE/MFE, time_to_tp1, pct_time_above_entry, realized/missed
- `signal_btc_correlation`: beta_30d, downside_beta, is_decoupled, is_extended, lead_lag, alignment
- `coins` + `coins_with_signal_stats` view: sector, token_type, mcap rank
- `mf_coin_snapshots` / `mf_sector_snapshots` / `mf_macro_snapshots`: money-flow series
- `_cache_outcomes`: precomputed outcomes (poller already maintains it)

### C. Worker pattern (in `app/services/cache_worker.py`)
`signal_cache_loop` / `market_cache_loop` / `coingecko_cache_loop` — leadership-elected
`while True` loops writing Redis via `cache_set` (which also stores a 10×TTL stale copy).
**We add `terminal_cache_loop` following the exact same pattern.**

---

## 1. Layout — side tabs like Allium

Replace the horizontal tab strip with Allium's structure: **left sub-sidebar inside
the page** (sticky, ~200px, grouped sections) + content column. Groups:

```
SIGNALS                DERIVATIVES            MARKET
· Overview             · Open Interest        · vs BTC (trend chart)
· Live Performance     · Long/Short           · Sectors
· Anomaly (live)       · Funding & Squeeze    · Market Map
```

- Same left-nav visual language as the app's admin rail (thin gold active bar).
- Mobile: sidebar → horizontal chips (existing pattern).
- Breadcrumb + BTC live ticker + signal count in the slim top strip (exists).
- Each item = URL (`?tab=oi`, `?tab=ls`, `?tab=vsbtc`, …) — deep-linkable.

---

## 2. New elements (as many as useful — each grounded in a real source)

### Tab: vs BTC — "Trend vs BTC" (user's #3)
1. **Rebased multi-line chart** — BTC + top movers + user-picked coins (search/add,
   max ~8), all klines rebased to 100 at window start (24h/48h/7D switch).
   Divergence vs BTC is instantly visible. Source: `/market/klines` (small N, on-demand,
   cached per symbol+interval 60s). Library: recharts LineChart (or lightweight-charts).
2. **RSI Live board** — RSI(14) on 1h klines for EVERY pair in view, precomputed
   by worker. Visuals: RSI histogram (bins 10), oversold (<30) / overbought (>70)
   coin-pill lists, scatter RSI × Δfrom-call ("oversold + above entry = strength").
3. **Volume change live** — today's rolling 24h volume vs previous 24h (two daily
   klines) per pair → `vol_chg_pct`. Ranked bars + used as size/color dimension in
   the anomaly scatter.
4. **RS line vs BTC (already have RS bars)** — keep, add sparkline per coin from
   price history buffer.

### Tab: Open Interest (user's #5)
5. **OI Δ vs Price Δ quadrant scatter** — the classic derivatives matrix:
   - OI↑ + price↑ = new longs (trend fuel) · OI↑ + price↓ = new shorts
   - OI↓ + price↑ = short covering · OI↓ + price↓ = long liquidation
   Colored quadrants, dot = coin, click → latest call.
6. **Top OI gainers/losers 1h & 4h** — ranked bars with coin pills.
7. **OI-weighted KPI row** — total OI in view, biggest builder, biggest unwind.

### Tab: Long/Short
8. **Global LSR distribution** + extremes lists (crowded-long / crowded-short pills).
9. **Top-trader vs retail divergence** — scatter topTraderLSR × globalLSR; corners =
   "smart money against the crowd" (highlight gold).
10. **Taker buy/sell pressure** — ranked bars of taker ratio (aggression right now).

### Tab: Funding & Squeeze
11. **Funding rate strip** — most negative / most positive funding (ranked bars).
12. **Squeeze Radar (composite)** — score = OI Δ↑ + funding negative + price rising
    → short-squeeze candidates; inverse for long-squeeze. Card of gold coin pills
    with the 3 inputs shown. This is the "wow" derivative of #5+#11.
13. **Funding × Δcall scatter** — are our calls fighting or riding funding?

### Signals group upgrades (cheap, from DB we already join)
14. **Time-to-TP1 distribution** (from `signal_updates`/journey agg) per window.
15. **MAE preview strip** — median drawdown-before-TP1 (journey `initial_mae_pct`)
    as context under the funnel.
16. **Equity-style cumulative outcome sparkline** — daily closed_win − closed_loss.

> Everything keeps: CoinLogo pills, click→latest call (SignalModal), XCard
> expand + zoom, quarantine/median data sanity.

---

## 3. Caching system — "no empty data, ever" (user's #7)

### Backend (authoritative layer)
- **New `terminal_cache_loop`** in `cache_worker.py` (same leadership pattern):
  - every 120s: batch-fetch for all pairs in the 7d window —
    funding (one shot via `/fapi/v1/premiumIndex` full list = 1 call!),
    24h tickers (1 call), OI per pair (batched, throttled ~10/s),
    LSR + top-trader (batched, 5m period), taker volume (batched),
    RSI+vol_chg: klines 1h ×15 bars per pair (throttled; full sweep every 5 min).
  - writes ONE Redis blob: `lq:terminal:deriv` = {per-pair: {rsi, vol_chg, oi, oi_chg_1h,
    oi_chg_4h, funding, lsr, top_lsr, taker}} + `generated_at`.
- **New endpoint** `GET /api/v1/terminal/derivatives` (plain `def`):
  `cache_get` fresh → return; else `cache_get_with_stale` → return stale with
  `"stale": true`; else (cold start only) return `{warming: true}` — never 500,
  never partial-compute in request path.
- `/terminal/screener` unchanged (already cached + serve-stale).
- Binance weight budget: premiumIndex(all)=10, ticker24h(all)=40, OI ≈ 1/pair —
  400 pairs across 120s ≈ well under the 2400/min IP limit; worker throttles.

### Frontend (perceived layer)
- **SWR + localStorage hydration**: on mount, hydrate `data`, `derivatives`, `prices`
  from `localStorage["lq:terminal:v4"]` (if < 24h old) → charts render INSTANTLY
  with last session's data + "updated HH:MM" badge, then background refresh swaps in.
- Skeleton shimmer only on true first-ever visit; per-card "warming" placeholder only
  for the live session layers (spike/session movers) that mathematically need samples.
- Poll cadence: screener 60s · derivatives 60s · prices 30s (existing).

---

## 4. Implementation phases
- **P1 backend**: `terminal_cache_loop` (deriv blob: funding+ticker+OI+LSR+taker+RSI)
  + `/terminal/derivatives` endpoint. Deploy → data warms in background.
- **P2 layout**: side-nav refactor (Allium groups), tabs OI / Long-Short / Funding /
  vs BTC added; existing 6 tabs re-homed into groups.
- **P3 charts**: elements #1–#13 (each = one XCard, reuse existing atoms).
- **P4 signals extras**: #14–#16 (needs small screener endpoint additions:
  time_to_tp1 from journey join — optional).
- **P5 cache UX**: localStorage hydration + stale badges.

## 5. Open decisions (need your call)
1. vs-BTC chart default coins: top-5 movers otomatis + manual add? (saranku: ya)
2. OI/LSR hanya tersedia untuk pair futures — pair spot-only ditandai "no deriv data"
   badge (bukan disembunyikan). OK?
3. Urutan build: P1+P2 dulu (backend warm + layout), lalu P3 sekali gas?
