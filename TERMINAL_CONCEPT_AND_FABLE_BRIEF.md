# LuxQuant Terminal — Full Concept & Build Brief

Companion docs (read together): `TERMINAL_DATA_MAP_AND_IDEAS.md` (data inventory) and
`luxquant_schema_report.txt` (live schema). This doc is the **product spec + build plan**,
and ends with a **copy-paste prompt for Claude Fable** (§10) to implement it.

---

## 0. TL;DR
Rebuild "Potential Trades / Terminal" into a **multi-section terminal with a left nav**
(Allium-style), serving subscribers *and* internal analytics. Surface the untapped data:
journey/MAE-MFE, enrichment/SMC/MTF, BTC correlation, money flow, coin fundamentals — all
cross-linked by `signal_id`. Persistent, URL-synced global filters. Dark+gold aesthetic,
EN/ZH, responsive. Backend follows our proven pattern (`def` endpoints, Redis cache +
serve-stale, poller precompute, statement_timeout).

---

## 0.5 Scope boundary — REUSE vs BUILD (important)
**Do NOT rebuild what already works.** The existing pages stay as-is and are *reused* by the
new terminal (mounted/linked, not re-coded):
- **`SignalsPage` + `SignalTable`** (the current "Potential Trades" table) → becomes the
  **Signals › Screener** section (embed the existing component / route to it).
- **`SignalTerminalPage`** (the current treemap / bubble / matrix / sectors view) → becomes the
  **Signals › Market Map** section (reuse as-is).

The **new left-nav Terminal is a NEW page/route** that (a) hosts those two existing views as
sections, and (b) adds the genuinely new, currently-untapped views: **Overview, Trade Replay,
Edge Lab, Intelligence, BTC & Correlation, Money Flow, Coins, Live Pulse.** All build effort
goes into the shell + the new views — never into re-doing the screener or treemap.

Entry point: a new route `/terminal` (left-nav), reachable from a nav item and/or a button on
Potential Trades. The existing "TERMINAL" treemap toggle can stay or be folded in as
Signals › Market Map.

---

## 1. Vision, audience, principles
- **Vision:** not a signal *list* — a **research terminal** where each signal is a rich object
  (call + journey + intelligence + correlation + flow + fundamentals) you can screen, replay,
  and analyze.
- **Audience (all):** subscribers (decide trades), power users (screen/filter), internal
  (edge analytics/admin). Gate premium columns by role where needed.
- **Principles:** (1) every view grounded in real columns; (2) fast (cache/precompute, no
  N+1); (3) shareable state (URL); (4) progressive disclosure (screener → detail → replay);
  (5) consistent gold/dark language; (6) bilingual.

---

## 2. Information architecture (left nav)
```
LuxQuant Terminal
├── ▚ Overview            command center
├── ⌗ Signals
│    ├── Screener         ↺ REUSE existing SignalsPage/SignalTable (embed/link, don't rebuild)
│    ├── Market Map       ↺ REUSE existing SignalTerminalPage (treemap/bubble/matrix/sectors)
│    └── Live Pulse       NEW · market_pulse tape
├── ◎ Intelligence
│    ├── Quality Scanner  rating/confidence/MTF/regime
│    └── SMC Setups       golden setups, FVG/OB/sweep
├── ⇄ Journey / Edge
│    ├── Trade Replay     per-signal price path + MAE/MFE
│    └── Edge Lab         aggregate edge analytics
├── ₿ BTC & Correlation   decoupled · beta · alignment · lead-lag
├── ⤳ Money Flow          sector rotation · capital flow · macro
├── ◈ Coins               profiles · fundamentals
└── ★ Watchlist           user lists
```
Routes: `/terminal/<section>[/<sub>]`. Deep links open detail (e.g. `/terminal/journey/:signalId`).

---

## 3. Global systems
- **Shell:** fixed left rail (icons + labels, collapsible). Desktop: rail + content.
  Mobile: rail → slide-in drawer + bottom quick-tabs. Top strip: breadcrumb + global search +
  compass/regime chip + updated-at.
- **Global filter bar (persistent, URL-synced):** status · rating · regime · sector · risk ·
  beta bucket · decoupled · MTF-aligned · mcap tier · date range · pair search. Views read the
  same filter store → switching sections keeps context. Encode in query string (shareable).
- **State:** React context/store for filters; each view fetches with the active filters.
- **i18n:** all copy via `react-i18next` (EN/ZH). Use `event_type_zh` etc. where present.
- **Theming:** existing dark + gold (`#d4a853`) language; reuse SignalModal-style modals and
  the admin `designSystem` (palette/tint) tokens.
- **Responsive:** every table → card list on mobile; charts → full-width; nav → drawer.

---

## 4. View specs (data → endpoint → UI)

> Convention per view: **Data** (tables.columns) · **Endpoint** · **UI** · **Filters** · **Interactions**.

### 4.1 Overview (command center)
- **Data:** `compass_reads`/`ai_arena_reports.source_json` (BTC read), `daily_market_regime`
  (regime), `signals` (today activity + WR), `mf_sector_snapshots` (top sector movers),
  `market_pulse` (recent events).
- **Endpoint:** `GET /terminal/overview` (aggregate, cached 60s).
- **UI:** compass card (dir/target/invalidation), regime badge + history sparkline, KPI row
  (today activity, today WR, overall WR, signals in view), money-flow top movers, live pulse
  ticker.

### 4.2 Signals › Screener + Market Map — ↺ REUSE (do NOT rebuild)
- **Screener** = mount the existing `SignalsPage`/`SignalTable` inside the terminal shell (or
  route to it). **Market Map** = mount the existing `SignalTerminalPage` (treemap/bubble/
  matrix/sectors). No re-coding of these — they already work well.
- **Only additive touches allowed** (optional, low-risk): pass the global filter state through,
  and add a "→ Replay" affordance on a row that deep-links to Trade Replay (§4.5). If adding
  intel columns here is wanted later, do it inside the *existing* table, not a rewrite.

### 4.3 Signals › Live Pulse
- **Data:** `market_pulse` (direction, pct_change, timeframe, event_type[_zh], has_media).
- **Endpoint:** `GET /terminal/pulse` (recent, paged, cached 30s).
- **UI:** streaming tape (red/green rows), filter by direction/timeframe/event; if pair maps
  to a signal, badge + link.

### 4.4 Intelligence › Quality Scanner + SMC Setups
- **Data:** `signal_enrichment` (confidence_score, rating, regime, mtf_h4/h1/m15,
  signal_direction, patterns_detected, smc_fvg/ob/sweep_count, smc_golden_setup, smc_detail,
  btc_trend, fear_greed, atr_percentile, warnings, confluence_notes).
- **Endpoint:** `GET /terminal/intelligence` (filterable).
- **UI (Quality):** filter recent signals by rating≥, confidence≥, MTF-aligned (h4=h1=m15),
  regime, fear&greed, atr pct. Card grid with score breakdown.
- **UI (SMC):** golden-setup board + FVG/OB/sweep counts + smc_detail expandable.

### 4.5 Journey / Edge › Trade Replay (the "wow")
- **Data:** `signal_journey` (events jsonb = price path, overall/initial mae/mfe,
  time_to_tp1/outcome, pct_time_above_entry, tp_then_sl, tps_hit_before_sl, realized/missed pct)
  + `signals` (entry/targets/stops) + `signal_updates` (event markers).
- **Endpoint:** `GET /terminal/journey/{signal_id}` (events + derived stats).
- **UI:** price chart (**lightweight-charts**, already a dep) with entry/TP1-4/SL lines,
  MAE/MFE markers, TP-hit event dots; stat panel: "captured X% of a Y% max move",
  time-to-TP1, drawdown-before-win, fakeout flag. Optional play/scrub animation.

### 4.6 Journey / Edge › Edge Lab v2
- **Data:** `signal_journey` + `signal_enrichment` + `signal_btc_correlation` + `signals`.
- **Endpoint:** `GET /terminal/edge` (aggregates; heavy → precompute in poller, cache long).
- **UI (recharts):** WR by rating/regime/sector/beta/risk/hour-of-day; MAE distribution
  (heat-before-win → stop guidance); speed-to-TP histogram; fakeout (tp_then_sl) rate;
  realized-vs-missed potential; equity/streak curve.

### 4.7 BTC & Correlation
- **Data:** `signal_btc_correlation` (corr, beta_30d, r², is_decoupled, downside_beta,
  tail_corr_*, lead_lag_hours, volatility_ratio, momentum_divergence_7d, is_extended, btc_context).
- **Endpoint:** `GET /terminal/correlation`.
- **UI:** decoupled-plays board (is_decoupled=true), beta buckets (defensive/neutral/aggressive),
  alignment-score sort, lead-lag ("moves before BTC"), scatter beta vs performance.

### 4.8 Money Flow
- **Data:** `mf_sector_snapshots` (rotation over time), `mf_coin_snapshots`
  (is_luxquant_signal flow), `mf_macro_snapshots` (dom/altseason).
- **Endpoint:** `GET /terminal/moneyflow`.
- **UI:** sector rotation heatmap over time; "capital into our calls vs market"; macro gauges
  (BTC dom, ETH dom, altseason — already have gauges in current terminal); top coin flows.

### 4.9 Coins
- **Data:** `coins` (token_type, sector, has_utility, utility_details, market_cap_rank,
  description, use_cases, key_features, risk_notes) + view `coins_with_signal_stats`.
- **Endpoint:** `GET /terminal/coins`, `GET /terminal/coins/{pair}`.
- **UI:** filterable coin grid (sector/token_type/utility/mcap); profile page = fundamentals +
  this coin's signal history & WR.

### 4.10 Watchlist
- **Data:** `watchlist`, `coin_watch` (user-scoped). **Endpoint:** existing. Reuse; add the new
  screener columns.

---

## 5. Backend API plan
- New router `backend/app/api/routes/terminal.py`, prefix `/api/v1/terminal`, admin/subscriber
  gated as appropriate.
- **Rules (follow existing patterns):** endpoints are `def` (run in threadpool, never freeze the
  loop); heavy reads use **raw SQL joins** and are **precomputed in the poller** (`cache_worker`)
  into Redis with `cache_set` + **serve-stale**; `statement_timeout` already caps web queries.
- Precompute in poller: the joined screener row set, edge aggregates, money-flow series, overview.
- Per-signal detail (journey/{id}) computed on demand (already stored) + cached short.

---

## 6. Data normalization & quality
- **`risk_level`** is dirty (`high/High`, `med/Medium/Normal`, `low`). Normalize in SQL to a clean
  enum: `high|High→HIGH`, `med|Medium→MEDIUM`, `low→LOW`, `Normal→NORMAL` (decide MEDIUM vs
  NORMAL). Expose a `risk_norm`.
- **`created_at` is TEXT** (ISO) on `signals` → cast `created_at::timestamptz` for ranges/sort.
- **Enrichment coverage gap:** ~16k older signals have `None` MTF/BTC trends; `rating` skews
  AVOID and `confidence_score` often 0 (v2.1 vs v3.0). Show intel only where present; badge
  "no intel" otherwise. Don't imply a WEAK rating means fully-scored.
- **Time-series** (mf_*, market_pulse, regime): index/query by time; downsample for charts.

---

## 7. Tech stack, conventions, file layout
- **Frontend:** React 18 + Vite + Tailwind; `react-router-dom` v7 (nested routes for left-nav);
  **recharts** (analytics), **lightweight-charts** (price replay — already a dep), **reactflow**
  (already added, any graph view), **react-i18next** (EN/ZH), axios `api` service. Reuse admin
  `designSystem` (palette/tint) + SignalModal-style modal shell.
- **Backend:** FastAPI; raw SQL; `def` endpoints; Redis cache + serve-stale; poller precompute
  in `cache_worker`; `statement_timeout` net already in place.
- **Files:** frontend under `frontend-react/src/components/terminal/` (shell + views) +
  `services/terminalApi.js`; backend `app/api/routes/terminal.py` + poller warm step.
- **URL state:** section in path, filters in query string (shareable/bookmarkable).

---

## 8. Build phases (execute in order)
- **P0 — Shell:** left-nav layout + routing + global filter bar (URL-synced) + responsive
  drawer; **mount existing `SignalsPage` (Screener) + `SignalTerminalPage` (Market Map) as
  sections** — reuse, do NOT rebuild.
- **P1 — Trade Replay (NEW):** `/terminal/journey/{id}` + lightweight-charts replay + MAE/MFE.
  The flagship differentiator.
- **P2 — Edge Lab v2 (NEW):** `/terminal/edge` aggregates + recharts.
- **P3 — Intelligence + Correlation (NEW):** `/terminal/intelligence`, `/terminal/correlation`.
- **P4 — Money Flow + Coins + Overview + Live Pulse (NEW):** remaining views.
Each phase ships backend endpoint (cached) + frontend view + is independently deployable.
All build effort is the shell + NEW views; the screener/treemap are reused untouched.

---

## 9. Acceptance criteria
Left-nav shell with URL-synced global filters; every view backed by a cached endpoint (no N+1,
serve-stale); `def` handlers; EN/ZH; responsive (tables→cards, nav→drawer); matches gold/dark
aesthetic; deep-linkable detail/replay; risk_level normalized; graceful "no intel" states.

---

## 10. ⇢ COPY-PASTE PROMPT FOR CLAUDE FABLE

> Paste everything below to Claude Fable. It assumes Fable has access to this repo.

```
You are building the "LuxQuant Terminal" — a research terminal for crypto trading signals —
inside this existing repo (React 18 + Vite + Tailwind frontend in `frontend-react/`, FastAPI
backend in `backend/`).

FIRST, read these three files fully before writing code:
  1. TERMINAL_CONCEPT_AND_FABLE_BRIEF.md   (the product spec + build plan — follow it)
  2. TERMINAL_DATA_MAP_AND_IDEAS.md         (what data exists, by domain)
  3. luxquant_schema_report.txt             (the live DB schema: tables, columns, relations)

GOAL: Add a NEW multi-section terminal (route `/terminal`) with a LEFT NAV (Allium-style) that
surfaces the rich, currently-untapped signal data. Audience = subscribers + power users +
internal analytics. See §2 for the nav and §4 for each view's exact data sources, endpoints, UI.

SCOPE — DO NOT REBUILD EXISTING PAGES (see §0.5): the current `SignalsPage`/`SignalTable`
("Potential Trades" table) and `SignalTerminalPage` (treemap/bubble/matrix/sectors) already work
— **reuse them by mounting/linking as the "Signals › Screener" and "Signals › Market Map"
sections. Never re-code them.** All build effort goes into the new left-nav SHELL + the NEW
views (Overview, Trade Replay, Edge Lab, Intelligence, BTC & Correlation, Money Flow, Coins,
Live Pulse).

HARD CONSTRAINTS (match the existing codebase — do not deviate):
- Backend read endpoints MUST be plain `def` (FastAPI runs them in a threadpool; never
  `async def` with sync DB — it freezes the worker). Use raw SQL joins for heavy reads.
- Cache every read in Redis via the existing `app.core.redis` helpers with SERVE-STALE
  (`cache_get_with_stale` / `cache_set`); precompute heavy/aggregate queries in the poller
  (`app/services/cache_worker.py`) like the existing signal cache. A `statement_timeout` net
  already exists in `app/core/database.py`.
- New backend router: `app/api/routes/terminal.py`, prefix `/api/v1/terminal`; register it in
  `app/main.py`. Reuse auth deps (`get_current_user` / `get_admin_user`).
- Frontend lives in `frontend-react/src/components/terminal/` (shell + views) with
  `services/terminalApi.js`. Use `react-router-dom` v7 nested routes for the left-nav; keep
  filters in the URL query string (shareable). Use existing libs already in package.json:
  recharts (analytics), lightweight-charts (price replay), reactflow (graphs), react-i18next
  (EN + ZH — every string localized; use `*_zh` DB columns where present). Reuse the dark+gold
  design language and SignalModal-style modal shell.
- Normalize `risk_level` (high/High, med/Medium, low, Normal) in SQL; `signals.created_at` is
  TEXT (cast `::timestamptz` for ranges). Show enrichment/intel only where present; badge
  "no intel" for older signals that lack it.
- Mobile-responsive: tables → card lists, left-nav → slide-in drawer + bottom quick-tabs.

BUILD IN PHASES (each phase = backend endpoint(s) + frontend view, independently deployable;
after each phase, give me the exact `git add` + deploy commands — the deploy script is
`./deploy.sh luxquant` and does NOT run `npm install`, so tell me when a new npm dep is needed):
  P0  Shell: left-nav + routing + global filter bar (URL-synced) + responsive drawer; MOUNT the
      existing SignalsPage as the "Screener" section and SignalTerminalPage as the "Market Map"
      section — REUSE, do NOT rebuild them.
  P1  Trade Replay (NEW, flagship): `/terminal/journey/{signal_id}` returning
      `signal_journey.events` + derived stats; render with lightweight-charts (entry/TP/SL
      lines, MAE/MFE markers, TP-hit dots) + a stat panel ("captured X% of a Y% max move",
      time-to-TP, fakeout flag).
  P2  Edge Lab v2 (NEW): `/terminal/edge` aggregates (WR by rating/regime/sector/beta/risk/hour,
      MAE distribution, speed-to-TP, fakeout rate, realized vs missed) with recharts.
  P3  Intelligence (`/terminal/intelligence`) + BTC & Correlation (`/terminal/correlation`).
  P4  Money Flow (`/terminal/moneyflow`) + Coins (`/terminal/coins[/{pair}]`) + Overview
      (`/terminal/overview`) + Live Pulse (`/terminal/pulse`).

Start with P0 + P1. Before coding each phase, briefly restate the endpoints and components you
will create, then implement. Keep everything consistent with the specs in
TERMINAL_CONCEPT_AND_FABLE_BRIEF.md §4. Ask me only if a product decision is genuinely ambiguous.
```
