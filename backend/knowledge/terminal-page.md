# Guide: LuxQuant Terminal (Potential Trades → Terminal)

The **LuxQuant Terminal** is a visual, chart-first cockpit for the 7-day active
LuxQuant signals ("calls"). It does NOT create signals — it helps you *screen,
time, size, and pressure-test* the calls that already exist. Every view joins
live market data (price, derivatives, order flow, klines) to the active calls, so
you can read the market context behind each signal in one place.

You can answer in depth about: what each view shows, how each metric is computed,
how to read it (with concrete "if X then usually Y" scenarios), common mistakes,
and how to combine views into a decision. When a user asks "how do I use X" or
"what does X tell me", give the practical read and a scenario or two.

> Note: This is feature and data guidance to help read the market context behind
> LuxQuant calls. It is NOT financial advice and never tells anyone to buy or sell
> a specific asset. If asked "should I buy X", decline that specific part politely,
> but you may still explain the relevant view and where to look.

---

## Core concepts (read first)

- A LuxQuant **call/signal** is active for a **maximum of 7 days**. Every Terminal
  view is scoped to that rolling window.
- **Status** of a call: **OPEN** (running, no target hit), **TP1 / TP2 / TP3 /
  TP4** (that take-profit level was reached), **SL** (stop-loss hit). A "win"
  counts ANY target hit (TP1–TP4), not only TP4.
- **Entry / TP1–TP4 / SL** are the levels of the call. **% from call** = how far
  price has moved from the entry since the call was made.
- The Terminal is **read-only market intelligence** — it never places trades. To
  actually trade, users use their own exchange or the AutoTrade page.

## How to read ANY chart here (shared mechanics)

- **Hover a coin logo** (anywhere — a dot, a row, a label) → a tooltip with the
  call's **status** and **"called X hours ago"**.
- **Click any coin** → a detail modal: status, when it was called (relative +
  absolute), key stats, **vs Call VWAP**, and an **"Open full signal"** button
  that jumps to the full signal page.
- **Status rings**: the colored ring around each scatter dot encodes status
  (OPEN / TP / SL). Read outcomes straight off the chart without opening anything.
- **Pan & zoom**: drag to pan, mouse-wheel / pinch to zoom, **double-click to
  reset**. Zoom into a dense cluster to separate overlapping labels.
- **Date window filter** (top): pick specific **calendar dates** inside the 7-day
  window to compare how calls made on different days are performing (e.g. isolate
  the day BTC dumped to see which calls held up).
- **Color convention**: green = positive / bullish / buy-side, red = negative /
  bearish / sell-side, gold = the LuxQuant accent / averages / reference lines.
- **"Warming up"** on a view means the background worker hasn't filled that blob
  yet (just after a restart). It fills within a sweep or two; the data is live,
  not missing.

## Sidebar groups

SIGNALS · DERIVATIVES · MARKET · SCREENERS · EDGE · MARKET MAP. Each item is a
view. Most are tabs of the "scan" page; Market Map views have their own route.

---

# SIGNALS group

## Confluence
- **Shows:** cards for the highest-conviction calls — direction (bullish/bearish),
  higher-timeframe (HTF) strength, multi-timeframe alignment (4H / 1H / 15m), entry
  tags, warnings, and % from the call. Filter chips: HTF strong, fully aligned,
  fresh (still near entry), golden setup, volume spike, no-warning. The **Coiled**
  section lists good setups that haven't moved yet.
- **How to read:** HTF strong + fully aligned + still *fresh* = the cleanest,
  highest-quality setup. A **warning** flag or a call already far from entry = a
  lower-quality read; treat with more caution.
- **Playbook:** *If a call is HTF-strong, fully aligned across 4H/1H/15m, and
  fresh → it's a prime candidate to study first.* *If it shows warnings or has run
  far from entry → the easy risk/reward is gone; don't force it.*
- **Tip:** "Coiled" is the sweet spot — quality setup, entry still near price, best
  risk/reward. Use the chips to shrink a big list down to only the cleanest calls.
- **Combine with:** RSI / Vol Squeeze / ATR to time the entry; Risk Calculator to
  size it.

## Overview
- **Shows:** the market backdrop + scorecard. A **Market Regime gauge** (0–100)
  that fuses altseason index, BTC-dominance (inverted), market breadth, and funding
  into a single risk-on/risk-off dial; plus KPIs, a time-to-TP1 distribution,
  **Outcomes by Day** (stacked TP1–TP4 vs SL), and signals-by-sector.
- **How to read:** the gauge sets your aggression for the day. High (risk-on) =
  broad participation, longs generally safer. Low (risk-off) = defensive, size down
  and take only the strongest calls.
- **Playbook:** *If regime is risk-on and breadth is wide → you can be more
  aggressive on longs.* *If risk-off → fewer, higher-quality calls and smaller
  size.* *If most calls sit in one sector → you actually hold one concentrated bet,
  not a diversified basket — don't mistake it for diversification.*
- **Tip:** Read Overview before anything else; it frames every other view.

## Live
- **Shows:** how each call is doing live vs its entry — breadth, best mover, the
  distribution of change-from-call, an **Opportunity Map** (distance from entry vs
  upside left to target), **Peak-vs-Now "giveback"**, and top movers.
- **How to read:** the Opportunity Map corner "near entry + big upside left" is
  where late entries can still make sense. High giveback (pumped, then faded back)
  means the momentum is spent.
- **Playbook:** *If a call is still near entry but upside to target is large → a
  late entry may still be valid.* *If a call already pumped and gave most of it
  back → momentum exhausted, don't chase the bounce.*
- **Combine with:** Order Flow (is the move backed by real buying?) and RSI/ATR.

## Anomaly
- **Shows:** unusual behaviour — an anomaly scatter (price move × volume
  intensity), a Volume Spike Detector, and coins over/under-performing BTC.
- **How to read:** a real move is backed by volume. Price up **with** a volume
  spike = participation confirms it; price up **without** volume = fragile / prone
  to fakeout.
- **Playbook:** *If a coin is up hard on a big volume spike and outperforming BTC →
  a genuine catalyst is likely; worth investigating.* *If it's up on thin volume →
  be skeptical.*

---

# DERIVATIVES group

## Open Interest
- **Shows:** an OI-change × price-change quadrant, plus OI builders/unwinds. OI =
  total open leveraged contracts.
- **How to read (the four quadrants):**
  - price ↑ + OI ↑ = **new money / new longs** → trend supported.
  - price ↑ + OI ↓ = **short covering** → rally is fuel-less, fragile.
  - price ↓ + OI ↑ = **new shorts** building.
  - price ↓ + OI ↓ = **longs closing / liquidating** → selling pressure easing.
- **Playbook:** *If price makes a new high but OI is falling → exhaustion warning,
  the move lacks conviction.*
- **Tip:** OI tells you whether a move has "fuel" (leverage entering) or is just
  positions unwinding.

## Long / Short
- **Shows:** LSR (long/short ratio) distribution, **Top Traders vs Retail**, taker
  pressure, crowded positioning, and a **live Liquidation tape** (Bybit) with 5-min
  long/short USD totals.
- **How to read:** LSR is a fast read on crowd sentiment; retail account-ratio is a
  proxy for the crowd. Extremes often matter more as contrarian warnings than
  confirmation.
- **Playbook:** *If retail is heavily short (LSR ≪ 1) while top traders are long
  (> 1.5) → whales are quietly accumulating; leans contrarian bullish.* *If a heavy
  one-sided liquidation burst prints on the tape → it often marks a local capitulation
  bottom (longs liquidated) or top (shorts liquidated).*
- **Tip:** When everyone is on one side, the market is fragile and set up for a
  squeeze the other way.

## Funding & Squeeze
- **Shows:** negative/positive **funding** leaderboards, **Perp Basis** (perp
  premium/discount vs index price), and a funding × change scatter.
- **How to read:** funding is what leveraged longs pay shorts (or vice-versa) to
  hold. Persistent high positive funding = crowded, overheated longs.
- **Playbook:** *If funding is very positive AND OI rising → crowded longs → risk
  of a long-squeeze (downward flush).* *If funding is negative with high OI →
  crowded shorts → short-squeeze fuel (upward).* *If funding is clearly "wrong" vs
  price (extreme divergence) → those setups tend to resolve with a violent move.*
- **Basis tip:** a rich (high positive) perp premium = aggressive perp buyers
  paying up; a discount = perp sellers / bearish lean.

## Squeeze
- **Shows:** a positioning crowding radar — squeeze score from funding × L/S, with
  bubble size = OI.
- **How to read:** the biggest bubble with extreme funding and a skewed LSR is the
  most squeeze-prone name. This is a *risk warning*, not a direct entry — crowded
  can get more crowded before it snaps.
- **Note:** this is POSITIONING squeeze (derivatives). It's different from the
  **Vol Squeeze** screener, which is VOLATILITY contraction from price bands.

## Order Flow
- **Shows:** the order-flow hub, two layers:
  1. **CVD (Cumulative Volume Delta, 1h)** vs 24h price change — a scatter. CVD =
     aggressive market-buys minus market-sells (the taker flow). Streamed live from
     Bybit trades.
  2. **Order Book Pressure** — passive intent from the live **Binance** book
     (top-20 levels): **bid-stacked** (resting buyers = support below) vs
     **ask-stacked** (resting sellers = resistance above). Binance because the calls
     are Binance-native; its WebSocket is used (not the rate-limited REST).
- **How to read (the divergence corners are the signal):**
  - price ↑ + CVD ↓ = **distribution** — the rally is being sold into → reversal
    risk.
  - price ↓ + CVD ↑ = **accumulation** — bought on weakness → bounce watch.
  - price ↑ + CVD ↑ = healthy up (buyers confirm); price ↓ + CVD ↓ = healthy down.
- **Playbook (combine both layers):** *CVD up + book bid-stacked = strongest read
  (aggressive buying AND passive buyers underneath).* *CVD up but book ask-stacked
  = buyers are hitting a wall — be ready for rejection.*
- **Tip:** CVD = aggressive flow (market orders); the book = passive intent (limit
  orders). Together they're the full order-flow picture.

---

# MARKET group

## vs BTC
- **Shows:** each call's relative strength vs BTC, with coin logos at the line tips.
- **Read/Playbook:** *If a coin outperforms while BTC is flat → real, coin-specific
  strength (alpha).* *If it only rises alongside BTC → that's beta, not alpha.* In
  risk-on, hunt the biggest outperformers; in risk-off, favour the ones holding up
  best.

## BTC Correlation
- **Shows:** how correlated each coin is to BTC (and beta / downside beta).
- **Read/Playbook:** *Low correlation = decoupled → better diversification and more
  resilient when BTC drops.* If BTC looks volatile, high-correlation names will get
  dragged — trim exposure there.

## Momentum
- **Shows:** a relative-strength × volume-acceleration scatter + leaderboards, and a
  precomputed **momentum score (0–100)**.
- **Read/Playbook:** *Strong RS AND rising volume acceleration → healthy, likely
  continuation.* *Strong RS but fading volume → ageing momentum, be ready to exit.*
  The top-right quadrant (strong + volume rising) is the safest momentum zone.

## Sectors
- **Shows:** sector rotation (change in sector market cap).
- **Read/Playbook:** *The sector leading consistently is where money is rotating —
  follow its leaders.* Early-rotation sectors (just starting to turn up) often have
  more runway than ones that already pumped.

---

# SCREENERS group

## RSI Heatmap
- **Shows:** 14-period RSI for every active call, with overbought (≥ 70) and
  oversold (≤ 30) bands and an average line. A **Timeframe toggle: 1h / 4h / 1d
  (default 4h★)** switches the RSI period. Hover also shows **%B**.
- **Why 4h default:** the standard swing framework is 1D / 4H / 1H — 4H is the
  primary swing timeframe, 1h is for entry timing, 1d is the trend. LuxQuant calls
  are swing (up to 7 days), so 4h is the most relevant default.
- **How to read:** RSI ≥ 70 = stretched (mean-reversion risk); ≤ 30 = beaten down
  (bounce watch). **%B** = where price sits inside the Bollinger band (0 = lower
  band, 100 = upper).
- **Playbook:** *In a strong trend crypto can stay overbought for days — don't short
  a strong call just because RSI > 70.* *RSI ≤ 30 AND %B ≤ 5 = "double-oversold ✓"
  (stronger bounce signal than either alone).* *RSI ≥ 70 AND %B ≥ 95 =
  "double-overbought ✗".* Best use: time a pullback entry inside an already-valid
  call, rather than short blindly.

## ATR Levels
- **Shows:** daily-range **exhaustion** — today's 24h range vs the expected daily
  move (computed as 1h ATR × √24). Tiers: FRESH → MODERATE → HIGH → CRITICAL →
  EXCEEDED.
- **How to read:** near/over 100% (EXCEEDED) = the coin has already used up its
  typical daily range → chasing an entry here risks buying right before a pullback.
  FRESH (low) = room left to run.
- **Playbook:** *If a name is EXCEEDED → wait for a pullback rather than chase.* *If
  FRESH → more comfortable entry room.* Also use ATR to set stops — a stop roughly
  1.5× ATR away avoids getting shaken out by normal noise.

## Vol Squeeze
- **Shows:** Bollinger **band-width percentile** vs each coin's OWN recent history,
  with the same 1h/4h/1d toggle. A fuller bar = tighter / more coiled.
- **How to read:** a low band-width percentile means the range has contracted
  ("coiling") — the calm before an expansion/breakout. Tiers: COILED → TIGHT →
  NORMAL → LOOSE → EXPANDED.
- **Playbook:** *If a call is COILED (very low percentile) → volatility is compressed
  and a breakout is more likely soon; watch for the expansion and confirm direction
  with Order Flow / OI.* *If EXPANDED → the move may already be mature.*
- **Note:** this is VOLATILITY squeeze (from price bands), different from the
  positioning **Squeeze** tab (funding × L/S).

---

# EDGE group

## Edge Simulator
- **Shows:** proof the signals carry an edge.
  - **Edge Economics:** expectancy, profit factor, reward:risk, win rate, and
    "where winners exit" (which TP most winners reach).
  - **Edge Map:** each confluence pattern scored by win rate × sample size × EV;
    click to drill into the historical signals behind a pattern.
- **How to read:** a pattern is trustworthy when it has a high win rate **and** a
  large sample **and** positive EV. High win rate on a tiny sample is not yet
  significant.
- **Playbook:** *Profit factor > 1.5 with positive expectancy = a system worth
  running consistently.* *Weight the patterns with the highest EV and biggest
  sample more; treat small-sample "high win rate" patterns with caution.*
- **Key terms:** **Expectancy** = average P/L per trade. **Profit factor** = gross
  wins ÷ gross losses. **Reward:risk (R:R)** = average win size vs average loss.

## Risk Calculator
- **Shows:** turns a call into a measured trade. Inputs: account size, risk %,
  leverage, entry, stop, target (auto-prefilled from a selected signal). Outputs:
  position size, margin, R:R, **breakeven win rate**, **liquidation price**, and an
  R-ladder. It also integrates ATR (stop-in-ATR) and a **correlation /
  concentration guard**.
- **How to read:** **breakeven win rate** = the win rate you'd need for this R:R to
  break even. If it's higher than your realistic/historical win rate, the trade's
  reward:risk is too poor.
- **Playbook:** *If breakeven WR > your historical WR → move the TP/SL to improve
  R:R or skip.* *If the correlation guard warns you already hold other open calls in
  the same direction/sector → your true risk is larger than one position; size each
  down.* *Keep risk ~1–2% of the account per trade and let the tool compute the
  position size — don't pick a lot size first and rationalise it.*
- **Liquidation price:** where leverage wipes the position; keep it far from entry
  and from the stop.

---

# MARKET MAP group

## Treemap
- **Shows:** market-cap tiles colored by a chosen metric, plus dominance /
  altseason / sector-rotation panels.
- **Read/Playbook:** *Rising BTC dominance + low altseason index → money into BTC,
  alts likely weak (trim alt exposure).* *Falling dominance + rising altseason →
  alt-season, be more aggressive on alts.* Green spread evenly across tiles =
  healthy breadth; green only in a few big tiles = a narrow, fragile rally.

## Bubble
- **Shows:** a **Momentum × Turnover** map (quadrants).
- **Read/Playbook:** *High momentum + high turnover → active money, live trend
  (ride it).* *High momentum + drying turnover → interest fading, watch for a turn
  (consider taking profit).*

## Matrix
- **Shows:** a heatmap of coins × metrics (win rate, volume/mcap, BTC alignment, max
  target, from-call, 24h change), sortable, with a sticky header.
- **Read/Playbook:** sort by one metric, then scan rows — *a coin green across many
  columns is the strongest confluence.* One bright-red column (e.g. a warning or BTC
  misalignment) is enough to downgrade a call even if other metrics look good.

## Explore
- **Shows:** a free scatter where you pick the X, Y, and color metrics yourself.
- **Read/Playbook:** test your own hypotheses (e.g. plot funding on X vs 24h change
  on Y to see whether extreme funding preceded reversals in the current calls).
  Outliers far from the crowd usually tell the most interesting story.

---

# Metric glossary (plain definitions)

- **CVD (Cumulative Volume Delta):** aggressive market-buys minus market-sells over
  a window; positive = net aggressive buying.
- **Order-book imbalance:** resting bid USD vs ask USD (top-20 levels); positive =
  bid-stacked (support), negative = ask-stacked (resistance).
- **Funding rate:** periodic payment between longs and shorts on a perp; high
  positive = crowded longs paying to hold.
- **Open Interest (OI):** total open leveraged contracts; rising OI = new leverage
  entering.
- **LSR (Long/Short Ratio):** accounts (or size) long vs short; a crowd-sentiment
  proxy.
- **Perp Basis:** perp price premium/discount vs the index (spot) price.
- **RSI(14):** momentum oscillator 0–100; > 70 overbought, < 30 oversold.
- **%B:** position of price within the Bollinger band (0 = lower, 100 = upper).
- **ATR% / exhaustion:** average true range as % of price; exhaustion = today's
  range vs the expected daily move.
- **Band-width percentile (Vol Squeeze):** how tight the Bollinger bands are vs the
  coin's own history; low = coiled.
- **RVOL (relative volume):** current volume vs its 20-period average.
- **Realized volatility:** standard deviation of recent returns.
- **Anchored VWAP (vs Call VWAP):** volume-weighted average price since the call was
  made; price above it = buyers in control since entry.
- **Beta / downside beta:** sensitivity to BTC moves (downside beta = sensitivity on
  BTC down-moves).
- **Decoupled:** low correlation to BTC.
- **Momentum score (0–100):** precomputed blend of relative strength, volume
  acceleration, spike, and RSI.
- **Squeeze score:** positioning-crowding blend of funding × L/S, sized by OI.
- **Regime gauge (0–100):** risk-on/off blend of altseason, BTC-dominance
  (inverted), breadth, and funding.
- **Expectancy / Profit factor / R:R / Breakeven WR:** trade-economics terms defined
  in the Risk Calculator and Edge sections above.

# Suggested end-to-end workflow

1. **Overview + Treemap (dominance/altseason)** → decide risk-on vs risk-off.
2. **Confluence + Matrix** → screen the quality calls.
3. **RSI + Vol Squeeze + ATR + Momentum** → time the entry (buy pullbacks, avoid
   exhausted/overbought names, prefer coiled ones with rising momentum).
4. **Open Interest + Funding + Basis + Long/Short + Order Flow (CVD + book)** →
   check the fuel and the danger (crowded? squeeze-prone? sold into? wall above?).
5. **Risk Calculator + correlation guard** → size the trade, set the stop (via ATR),
   avoid over-exposure in one direction.
6. **Edge Simulator** → confirm which patterns deserve more weight over time.

# Troubleshooting FAQ

- **"A view says warming up / is empty."** The background worker hasn't filled that
  blob yet (usually right after a restart). It fills within a sweep or two.
- **"A dot has no status ring / neutral color."** That pair has no active call in
  the 7-day window, or its status data hasn't loaded yet.
- **"Order Flow doesn't show my small coin."** CVD/order-book cover the most-liquid
  call pairs (a firehose otherwise); very small caps may not appear.
- **"RSI/ATR looks different from my exchange."** Timeframe matters — the toggle is
  4h by default; switch to 1h/1d to match your chart.
- **"Why is the window capped at 7 days?"** Calls are only active for 7 days, so the
  Terminal never shows older ones.

# Data sources & coverage limits (answer honestly if asked)

- **Derivatives (funding / OI / basis / price / volume):** from **Bybit** tickers
  (one call), covering all active-call pairs. Binance REST is IP-limited on the
  host, so Bybit is primary; Binance is a fallback.
- **Klines (RSI / ATR / Vol-Squeeze / %B / RVOL):** Bybit primary, Binance
  fallback, **60 bars per timeframe**. So "percentile vs history" means the coin's
  own recent ~40–60 bars on that timeframe, not months of history. They fill in
  progressively over a few minutes after a worker restart.
- **CVD (Order Flow):** live **Bybit** trade stream, the **top ~50 call pairs by
  open interest** (aggressive-trade feed is a firehose), rolling 15m / 1h windows.
- **Order Book Pressure:** live **Binance** depth (calls are Binance-native), the
  **top ~90 call pairs by 24h volume**, and the **top 20 book levels** near price.
  20 is the deepest lightweight snapshot Binance offers without maintaining a full
  order book — and near-touch levels are the most actionable anyway (deep levels
  are often spoofed).
- **Liquidation tape:** **Bybit**, top ~120 pairs by OI, a rolling buffer of recent
  events.
- **Anchored VWAP:** computed from **4h** candles since the call time (coarse, not
  tick-level).
- **So:** the smallest-cap calls may not appear in Order Flow / Order Book /
  Liquidation specifically (they exceed those liquidity caps), but still appear in
  the other views. CVD (Bybit) and Order Book (Binance) are different venues, so
  they are not perfectly apples-to-apples.
- **Not available (needs paid feeds):** on-chain (exchange netflow, whale wallets,
  MVRV/SOPR) and options (DVOL, put/call, gamma, skew). Everything here is one
  venue per metric, not a global cross-exchange aggregate.

# Combined multi-view reads (the real edge is confluence)

- **Best long confluence:** Confluence says HTF-strong + fully aligned + fresh →
  RSI/%B not overbought (ideally a pullback) → Vol Squeeze coiled or Momentum
  rising → OI rising with price (real fuel) → CVD up and book bid-stacked. When
  several agree, the setup is strong.
- **Reversal / "be careful" confluence:** price up but **CVD down** (distribution)
  **and** book ask-stacked **and** ATR EXCEEDED **and** funding very positive with
  rising OI → a crowded, exhausted rally being sold into; high pullback risk.
- **Squeeze setup:** funding negative + high OI (Funding tab) + a heavy short-side
  liquidation cluster (Long/Short tape) + CVD turning up → short-squeeze fuel.
- **Bottom-fishing a beaten call:** RSI ≤ 30 and %B ≤ 5 (double-oversold) + CVD up
  (accumulation) + book bid-stacked → bounce watch, but confirm the regime isn't
  hard risk-off first.

# How to answer questions about this page

When a user asks about a view or metric, structure the answer like this (keep it
short, plain paragraphs and "- " bullets, no headings/tables):

- Start with a one-line plain-English definition of the thing.
- Then how to read it (what high/low or each quadrant means).
- Then ONE concrete scenario tip in "if X, that usually means Y" form.
- If useful, name ONE other view to pair it with.
- If the user's question is vague and a current-tab context is provided, assume
  they mean that view.
- You may give usage strategy (that is feature guidance). You may NOT tell them to
  buy or sell a specific coin — if asked that, decline that part and point them to
  the view that helps them decide.

# Example answers (match this depth and style)

Q: "How do I read the Order Flow chart?"
A: Order Flow plots **CVD (aggressive buys minus sells) over 1h** against **24h
price change**, with a passive **order-book** layer below it.
- The corners are the signal: **price up + CVD down = distribution** (rally being
  sold into → reversal risk); **price down + CVD up = accumulation** (bought on
  weakness → bounce watch).
- Strongest read: **CVD up AND book bid-stacked** (aggressive buyers plus resting
  buyers underneath). CVD up but **ask-stacked** = buyers hitting a wall.
- Pair it with Open Interest to check the move has leverage fuel.

Q: "What does the RSI timeframe toggle change?"
A: It switches the RSI period between **1h / 4h / 1d** (4h is the default).
- 4h is the primary swing read, 1h is for fine entry timing, 1d is the trend.
- **If RSI is over 70 on 4h but the trend is strong, don't short it** — crypto can
  stay overbought for days; use RSI to time a pullback entry instead.
- Hover also shows **%B**; RSI ≤ 30 and %B ≤ 5 together is a stronger oversold read
  than either alone.

Q: "Why is my small coin missing from Order Flow?"
A: Order Flow covers only the most-liquid call pairs — roughly the **top 50 by open
interest** for CVD and **top 90 by volume** for the order book.
- The live trade and depth streams are very heavy, so we cap them to keep the data
  stable.
- Your coin still appears in the other views (RSI, Funding, Overview, etc.); it's
  just outside the order-flow liquidity cap.

Q: "How should I size a trade from a call?"
A: Use the **Risk Calculator** — enter your account size, risk %, entry, stop and
target (it can prefill from a signal).
- It returns position size, R:R, **breakeven win rate**, and the liquidation price.
- **If the breakeven win rate is higher than your usual win rate, the reward:risk
  is too poor** — widen the target or tighten the stop.
- Keep risk around 1–2% per trade and let the tool compute the size. (This is
  general guidance, not advice to take any specific trade.)

# Important note

Everything here helps you read the market context behind the LuxQuant calls. It is
not a recommendation to buy or sell any asset — decisions are the user's own.
