# LuxQuant Terminal — Data Map & Feature Brainstorm

Grounded in the live `luxquant` DB (74 tables · 1.6 GB · 52,911 signals). This is the
menu of what we can build, mapped to the data that actually powers each idea.

---

## 1. The data assets (what we actually have)

### A. Signal core — `signals` (52,911) + `signal_updates` (227,452)
Every call: `pair, entry, target1..4, stop1..2, risk_level, volume_rank, status,
market_cap, peak_price/peak_pct/peak_at, pnl_leverage, max_leverage`, chart/PnL paths.
`signal_updates` = every TP/SL event (tp1 106k · tp2 66k · tp3 30k · tp4 9.9k · sl 13k).
- **Status mix:** closed_win 27,245 · closed_loss 9,553 · tp1/2/3 open · open 1,207 → ~74% win on closed.
- Already exposed (screener/table). This is the base layer.

### B. Journey analytics — `signal_journey` (51,638 · **620 MB, the crown jewel**)
Per signal, the **full price path replayed from klines**:
`events` (jsonb tick-by-tick), `overall_mae_pct/mfe_pct` (max adverse/favorable
excursion), `initial_mae_pct` (heat before first TP), `time_to_tp1_seconds`,
`time_to_outcome_seconds`, `pct_time_above_entry`, `tp_then_sl` (fakeouts),
`tps_hit_before_sl`, `realized_outcome_pct`, **`missed_potential_pct`** (how much was
left on the table).
- **This is the differentiator.** Almost no signal service shows *how* a trade played out.
- Powers: trade replay, "heat before win", efficiency (captured vs missed), speed-to-TP,
  fakeout detection, stop-placement guidance.

### C. Pre-trade intelligence — `signal_enrichment` (52,854 · 200 MB) + `_history` (64,847)
The "should I take it" layer: `confidence_score, rating (AVOID/LOW/WEAK/MODERATE),
regime (normal/low_vol/high_vol/skip), score_breakdown, mtf_h4/h1/m15_trend,
signal_direction, patterns_detected, SMC (fvg/ob/sweep counts, golden_setup),
btc_trend, btc_dom_trend, fear_greed, atr_percentile, confluence_notes, warnings,
entry_snapshot, live_snapshot`. History = snapshot over time (jsonb).
- Powers: quality screener, SMC scanner, multi-timeframe alignment, regime-based perf.

### D. BTC relationship — `signal_btc_correlation` (52,911 · 68 MB)
`corr_1h_7d, corr_4h_30d, beta_30d, r_squared, is_decoupled (510 true),
downside_beta, tail_corr_btc_down/up, lead_lag_hours, volatility_ratio,
momentum_divergence_7d, is_extended, btc_context`.
- Powers: decoupled-plays scanner, beta filter (defensive vs aggressive), BTC-alignment.

### E. Money flow — `mf_sector_snapshots` (67,101) · `mf_coin_snapshots` (52,250) · `mf_macro_snapshots` (209)
Time-series of sector rotation (market cap Δ, volume, top-3 coins), per-coin flow
(price/mcap/vol, Δ24h/7d/30d, **`is_luxquant_signal`** flag), and macro (dom/altseason).
- Powers: sector rotation heatmap over time, "is money flowing into our calls?", capital timeline.

### F. Market context — `daily_market_regime` (924) · `market_pulse` (4,227) · `compass_reads`/`ai_arena_reports` (BTC Compass)
- `market_pulse` = **live tape** of price events (flash_move, breakout, sell-off, high/low
  break) with direction/pct/timeframe/event_type (EN+ZH).
- `daily_market_regime` = regime history (overlay win-rate by regime).
- Compass = AI market read (deepseek-reasoner), `source_json` with liquidity/positioning layers.

### G. Coin fundamentals — `coins` (747) + view `coins_with_signal_stats`
`token_type (utility/layer1/defi/memecoin/rwa/…), sector, has_utility, utility_details,
market_cap_rank, description, categories, use_cases, key_features, risk_notes`.
- Powers: coin profile pages, fundamental filters, overlay fundamentals onto signals.

### H. Distribution & misc
`x_posts` (12,599), `tg_call_posts` (6,018), `discord_relays`, `watchlist`/`coin_watch`
(user lists), `onchain_alerts`, `delisting_events`, `crypto_news`.

> Cross-link: **everything joins on `signal_id`** (5 FK tables → `signals`), and coins on `pair`.
> Two ready-made views: `v_signal_with_correlation`, `coins_with_signal_stats`.

---

## 2. What's exposed today vs untapped

**Exposed** (via `signals.py`): screener/table, analyze, bulk-7d, active, stats,
top-performers, coin-intel, detail. Terminal has treemap/bubble/matrix/sectors.

**Untapped gold** (data exists, barely surfaced):
- Journey MAE/MFE/efficiency/missed-potential (620 MB sitting mostly unused in UI).
- SMC setups + MTF alignment + regime from enrichment.
- BTC decoupling / beta / lead-lag.
- Money-flow-into-our-calls, sector rotation over time.
- Coin fundamentals overlay.

---

## 3. Terminal capability ideas (each mapped to its data)

**Signals & screener** (B/A) — power-filter table + treemap/bubble/matrix/sectors *plus*
new columns: rating, confidence, regime, beta, decoupled, MAE/MFE, time-to-TP, efficiency.

**Trade Journey / Replay** (B) — click a signal → animated price path with entry/TPs/SL,
MAE/MFE markers, "captured X% of a Y% max move", time-to-outcome.

**Edge Lab v2** (B) — aggregate analytics: win-rate by rating/regime/sector/beta/risk/hour,
MAE distribution (heat-before-win → stop guidance), speed-to-TP, fakeout (tp_then_sl) rate,
realized vs missed potential.

**Signal Intelligence scanner** (C) — filter live/recent by rating, confidence, MTF
alignment (h4+h1+m15 agree), SMC golden setup, patterns, fear_greed, atr percentile.

**BTC & Correlation** (D) — decoupled-plays board, beta buckets (defensive/aggressive),
alignment score, lead-lag; "coins that move before/independent of BTC".

**Money Flow** (E) — sector rotation heatmap over time, capital-into-our-calls vs market,
macro dom/altseason gauges, per-coin flow.

**Market Pulse (live tape)** (F) — streaming price-event feed (flash moves, breakouts,
sell-offs) filterable by direction/timeframe/event; ties events back to our signals.

**Coins** (G) — profile pages (fundamentals + this coin's signal history from the view),
fundamental filters.

**Overview / Command center** — Compass read + regime + today's activity + win rate +
money-flow snapshot + live pulse ticker.

---

## 4. Proposed layout (Allium-style left nav)

```
LuxQuant Terminal
├── ▚ Overview            compass · regime · activity · win-rate · flow · pulse ticker
├── ⌗ Signals
│    ├── Screener         table + treemap/bubble/matrix/sectors (+ intel columns)
│    └── Live Pulse       market_pulse tape
├── ◎ Intelligence
│    ├── Quality Scanner  rating/confidence/MTF/regime filters
│    └── SMC Setups       golden setups, FVG/OB/sweep
├── ⇄ Journey / Edge
│    ├── Trade Replay     per-signal price path + MAE/MFE
│    └── Edge Lab         aggregate edge stats
├── ₿ BTC & Correlation   decoupled · beta · alignment · lead-lag
├── ⤳ Money Flow          sector rotation · capital flow · macro
├── ◈ Coins               profiles · fundamentals
└── ★ Watchlist           user lists
```
Global filter bar (persistent): status · rating · regime · sector · risk · beta ·
decoupled · MTF-aligned · mcap tier · date range · search. URL-synced so views share state.

---

## 5. Why this is *superior* (differentiators)

1. **Post-trade truth (journey/MAE-MFE):** show how trades actually played out —
   efficiency, heat-before-win, missed potential. Rare; institutional-grade.
2. **Pre-trade intelligence (enrichment/SMC/MTF):** every call carries a quality read.
3. **Regime & BTC-awareness (correlation/regime/compass):** select by market state.
4. **Money-flow context:** see capital rotating into sectors/our calls.
5. **One cross-linked graph:** signal_id ties journey + enrichment + correlation +
   flow + fundamentals into a single object → a real *terminal*, not a signal list.

---

## 6. Data-quality notes (fix before/while building)

- **`risk_level` is messy:** `high/High, med/Medium/Normal, low` → normalize to a clean enum.
- **Enrichment coverage gap:** ~16,346 older signals have `None` MTF/btc trends; `rating`
  skews AVOID (42k) and `confidence_score` often 0 → newer (v3.0) signals are far richer.
  Decide: show intel only where present, or backfill.
- **`created_at` stored as TEXT** on `signals` (ISO strings) — fine, but cast for range queries.
- **Money-flow / pulse** are time-series (snapshots) — great for charts, index by time.

---

## 7. Open questions for us to decide

1. Audience: this terminal for **subscribers** (trading tool) or also **admin/analytics**?
2. First slice to build: **Screener++ (intel columns)**, **Trade Replay**, or **Edge Lab v2**?
3. Keep current treemap/bubble/matrix, or rebuild the whole terminal shell with the left-nav?
4. Real-time (websocket for pulse/prices) or polling-with-cache like today?
