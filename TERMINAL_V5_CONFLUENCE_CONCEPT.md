# Terminal v5 — Confluence Screener + Post-Signal Intelligence (Final Concept)
> Market data only. Current visual style (dense, chart-heavy, dark+gold).
> Every field below is VERIFIED to exist in this repo/DB — no assumptions.

---

## 0. Data reality (verified)

| Source | Where | What's inside |
|---|---|---|
| **v3 facts** | `signal_enrichment.entry_snapshot` (frozen at entry) & `live_snapshot` (refreshed) — JSONB | `signal_direction` (REFINED via `refine_signal_direction`), `facts.by_timeframe.{m15,h1,h4}.{trend{trend,adx,trend_strength},momentum{rsi,div},volume{ratio,state,climax}}`, `entry_quality{fresh_breakout,deep_pullback,exhaustion_candle,distance_from_ema*,last_N_gain}`, `levels`, `structure.smc{available,golden…}`, `context{funding,btc,fng,liquidity}`, `tags[]`, `tags_annotated[{name,important}]` |
| **Tag vocabulary** | `IMPORTANT_TAGS` in `enrichment_service_v3.py` | HTF_BIAS_* · HTF_TREND_STRONG/EXHAUSTED · MTF_FULL_ALIGNED/LTF_ALIGNED/AGAINST_HTF · RSI_OB/OS/DIV · VOL_SPIKE_2X/3X/CLIMAX · FRESH_BREAKOUT · DEEP_PULLBACK · LATE_ENTRY · OVEREXTENDED · PARABOLIC · SMC_GOLDEN_SETUP · FVG/OB_NEAR_ENTRY · BROKE_R/S_RECENT · AT_FIB_GOLDEN_ZONE · BB_SQUEEZE · BTC_BULLISH/BEARISH · RISK_OFF_REGIME · FUNDING_HEAVY_LONG/SHORT · LIQ_LOW … |
| **History** | `signal_enrichment_history.snapshot` (64k rows, live-mode periodic) | full snapshot per refresh → time-series of facts per signal |
| **Post-signal paths** | `signal_journey.events` (51k signals) | price/pct at every swing+TP with timestamps → horizon returns (24/48h/7d) via nearest-event; plus MAE/MFE, time_to_tp1, realized |
| **Peak** | `signals.peak_pct/peak_at` | max excursion per signal (already in screener endpoint) |
| **Live layer** | `lq:terminal:deriv` blob (worker, 60s) | price, chg_15m, spike_15m, vol_chg_1h, funding, OI Δ, LSR, RSI — **live anomaly already solved** |

> Catatan: KOLOM `signal_enrichment.confidence_score/mtf_*/smc_*` memang kosong di v3 —
> semua pembacaan HARUS dari JSONB `COALESCE(live_snapshot, entry_snapshot)`.

---

## 1. Modules (final, market-data only)

| # | Module | Data | Edge untuk user | Status |
|---|---|---|---|---|
| 1 | **Confluence Screener** (tab baru, hero) | v3 snapshot JSONB + tags | Temukan sinyal ber-konfluensi kuat dalam 3 detik; filter HTF Strong / Full Aligned / Fresh Entry / Golden Setup; hindari LATE_ENTRY & OVEREXTENDED | BARU |
| 2 | **Signal Card kaya** (komponen hero) | direction refined, HTF badge, MTF chips, EQ badge, top-3 key reasons (important tags), live Δ, anomaly badges, post-signal avg vs actual | Paham "kenapa sinyal ini" tanpa buka chart | BARU |
| 3 | **Post-Signal Intelligence** | journey horizon-returns per pair (precomputed) + peak_pct + deriv blob live | "Sinyal ini outperform rata-rata historis pair-nya?" + volume anomaly live | BARU |
| 4 | Live Anomaly / Volume spike | deriv blob (sudah ada) | Sudah jalan — tinggal dipakai sebagai badge di card | ✅ ada |
| 5 | Derivatives (OI/LSR/Funding/Squeeze) | deriv blob | Sudah jalan | ✅ ada |
| 6 | **Market Regime strip** | `daily_market_regime` + compass + context tags aggregate | Konteks besar: Trending/Ranging/Risk-Off + drivers; band di atas semua tab | Fase 3 |
| 7 | vs BTC / Sectors / Market Map | ada | — | ✅ ada |

Dropped: X/Smart-Money layer (keputusan user — market data only).

---

## 2. Signal Card — field mapping (persis)

| Elemen UI | Sumber persis |
|---|---|
| Pair + logo | `signals.pair` + CoinLogo (ada) |
| Direction badge | `snap.signal_direction` (BULLISH/BEARISH/NEUTRAL — refined) |
| HTF STRONG badge | `snap.facts.by_timeframe.h4.trend.trend_strength == "STRONG"` (atau tag `HTF_TREND_STRONG`) |
| MTF chips (H4/H1/M15) | `snap.facts.by_timeframe.*.trend.trend` (sudah dirender dot-style di terminal lama — reuse) |
| MTF Alignment badge | tag: `MTF_FULL_ALIGNED` / `MTF_LTF_ALIGNED` / `MTF_AGAINST_HTF` |
| Entry Quality badge | tag: `FRESH_BREAKOUT` / `DEEP_PULLBACK` / `EXHAUSTION_CANDLE` / `PARABOLIC` / `LATE_ENTRY` / `OVEREXTENDED` |
| Key Reasons (max 3) | `tags_annotated` where important=true, prioritas: SMC_GOLDEN_SETUP > FVG/OB_NEAR_ENTRY > RSI_DIV > VOL_SPIKE > BROKE_R/S |
| Live Δ from call | deriv blob price vs entry (sudah ada — fcOf) |
| Anomaly badges | deriv blob: `spike_15m>3` → "VOL SPIKE ×N", `chg_15m` besar → "MOVING NOW" |
| Post-Signal | `avg_24h` pair (blob baru) vs actual → "OUTPERF +X pp" / "UNDERPERF" |
| Warnings strip | tags: LATE_ENTRY, OVEREXTENDED, LIQ_LOW, FUNDING_HEAVY_* (merah kecil) |

---

## 3. Backend plan (mengikuti pola yang sudah ada)

### 3a. Endpoint screener v2 — `GET /terminal/confluence`
SQL join `signals` (7d) × `signal_enrichment` dengan ekstraksi JSONB:
```sql
COALESCE(e.live_snapshot, e.entry_snapshot) AS snap
-- lalu di SELECT:
snap->>'signal_direction', snap#>>'{facts,by_timeframe,h4,trend,trend_strength}',
snap#>>'{facts,by_timeframe,h4,trend,trend}', … h1, m15,
snap->'tags' (array), snap->'tags_annotated',
snap#>>'{facts,entry_quality,fresh_breakout}', … ,
snap#>>'{metadata,structure_available}'
```
`def` endpoint, cache 60s + serve-stale, **prewarmed oleh terminal_worker** (pola sama).
(Alternatif: perluas `/terminal/screener` yang ada dengan field `snap` — 1 endpoint saja.)

### 3b. Post-Signal stats — pass baru di terminal_worker (per 6 jam)
Dari `signal_journey` (join signals utk pair), per pair (≥5 sampel):
- horizon return: `pct` event terdekat ke entry+24h/48h/7d (events jsonb)
- `avg_peak` (signals.peak_pct), `avg_mae` (initial_mae_pct), `hit_tp1_rate`
→ Redis `lq:terminal:postsignal` {pair: {avg_24h, avg_48h, avg_7d, avg_peak, avg_mae, n}}.
Endpoint `GET /terminal/postsignal` (baca cache, fresh→stale→warming).
Query berat → jalan di worker, TIDAK PERNAH di request path.

### 3c. Regime strip (fase 3)
`daily_market_regime` (924 rows, ada) + compass_reads terakhir → blob kecil
{regime_label, confidence, drivers[3]} → band di TerminalLayout.

---

## 4. Frontend plan (style sekarang, komponen reuse)

| Layar | Isi |
|---|---|
| **Tab "Confluence"** (Signals group, jadi landing default) | Filter chips: HTF Strong · Full Aligned · Fresh Breakout · Deep Pullback · Golden Setup · Vol Spike · No Warnings; grid SignalCard 3-kolom (XCard style); klik card → SignalModal (sudah ada) |
| **Tab "Post-Signal"** (Signals group) | KPI (pair terbaik vs rata-rata, % outperforming); scatter Actual-vs-Avg per sinyal aktif (diagonal = sesuai historis); leaderboard Outperformers/Underperformers (RankBars + CoinPill); distribusi avg_24h per pair |
| **Card enrichment di semua tempat** | Badge anomaly & post-signal dipakai ulang di Overview/Live |
| **Regime band** (fase 3) | SectionBand di atas semua tab: "RANGING · defensif — HTF Strong only" |

---

## 5. Fase build

| Fase | Isi | Effort |
|---|---|---|
| **F1** | Endpoint confluence (JSONB extract) + prewarm + tab Confluence + SignalCard kaya | besar, core |
| **F2** | Post-signal pass di worker + endpoint + tab Post-Signal + badge avg-vs-actual di card | sedang |
| **F3** | Regime strip + regime-aware filter default | kecil |

Semua caching: worker precompute → Redis → fresh/stale/warming (pola v4.1, zero-empty).
