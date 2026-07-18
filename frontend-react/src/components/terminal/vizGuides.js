// ════════════════════════════════════════════════════════════════
// Terminal viz guides — a plain-English "how to read" + a worked case
// study for every visualization, so a new user can navigate and act on
// each chart without prior desk knowledge.
//
// Shape: { read: string[], example: string, takeaway: string }
// Rendered by <SectionBand guide="<id>"> as a collapsible panel.
// ════════════════════════════════════════════════════════════════

export const VIZ_GUIDES = {
  confluence: {
    read: [
      "Each card is a live setup that passed our filters — direction, higher-timeframe strength, multi-timeframe alignment and entry quality.",
      "Green % = the call is in profit, red = underwater. The TP/SL chip shows the furthest target already hit.",
      "4H · 1H · 15m lit up = all three timeframes agree; a greyed frame means that timeframe disagrees.",
      "Tags below (fresh breakout, deep pullback, ob near entry…) describe why the setup fired.",
    ],
    example:
      "KAITO shows Bullish · HTF strong · full aligned with 4H/1H/15m all green and a 'fresh breakout' tag, sitting at +25% (TP4). All three timeframes point the same way and it already ran to its final target.",
    takeaway:
      "Prioritise cards where all three timeframes agree AND the tag matches your style — those are the cleanest, highest-conviction entries.",
  },
  anomaly: {
    read: [
      "Surfaces coins doing something statistically unusual right now — abnormal volume, funding, OI or price vs their own baseline.",
      "The bigger the deviation from normal, the higher it ranks.",
      "Anomalies are early signals, not confirmations — they flag where to look, not what to do.",
    ],
    example:
      "A mid-cap suddenly printing 5× its average volume with funding flipping positive is an anomaly: something changed before the crowd noticed.",
    takeaway:
      "Use anomalies as a watchlist trigger — then confirm with Confluence and Order Flow before acting.",
  },
  oi: {
    read: [
      "Open Interest = total value of contracts currently open. Rising OI = new money entering; falling OI = positions being closed.",
      "OI up + price up = fresh longs (trend fuel). OI up + price down = fresh shorts.",
      "OI down while price moves = an existing side is capitulating (unwind), often near exhaustion.",
    ],
    example:
      "Price grinds +8% while OI climbs 20% — new longs keep piling in, confirming real conviction behind the move rather than a short squeeze.",
    takeaway:
      "Trends backed by rising OI are the most durable; a move on falling OI is running on fumes.",
  },
  ls: {
    read: [
      "Long/Short ratio = how the crowd is positioned. Above 1 = more longs than shorts; below 1 = more shorts.",
      "Extremes are contrarian fuel: when almost everyone is long, there's little buying left and lots of liquidations below.",
      "Compare top-trader L/S vs the retail crowd — divergence is the interesting signal.",
    ],
    example:
      "A coin with a 3.5 L/S ratio (crowd heavily long) that stalls at resistance is squeeze-down prone: one flush cascades stop-losses.",
    takeaway:
      "Fade crowded extremes, or at least tighten risk — the crowded side is the one that gets liquidated.",
  },
  funding: {
    read: [
      "Funding rate is the periodic fee perp traders pay. Positive = longs pay shorts (bullish crowd); negative = shorts pay longs.",
      "Persistently high positive funding means longs are overpaying to stay in — expensive and crowded.",
      "Funding flipping sign often marks a sentiment turn.",
    ],
    example:
      "Funding sits at +0.08% every 8h for two days — longs are bleeding fees to hold. That overcrowding often resolves with a long squeeze down.",
    takeaway:
      "Extreme positive funding = crowded longs (downside risk); extreme negative = crowded shorts (squeeze-up fuel).",
  },
  squeeze: {
    read: [
      "The scatter fuses funding, long/short, OI build and taker flow into a squeeze score (0–100) per coin.",
      "X-axis = long/short ratio (right = more longs). Y-axis = funding (up = positive). Dot size = Open Interest.",
      "Red = long-crowded, green = short-crowded. Far corners with big dots = the most extended, squeeze-prone books.",
      "Click any dot to open that coin's latest call.",
    ],
    example:
      "NOMUSDT scores 69 on the long side — far right (crowd very long), positive funding, large OI. Longs are stacked and paying to stay: a squeeze-DOWN is the higher-probability resolution.",
    takeaway:
      "Big dots in the far corners are the setups to watch — that's where a cascade of liquidations is most likely to fire.",
  },
  orderflow: {
    read: [
      "Order flow shows who is being aggressive — market buyers (taker buy) vs market sellers (taker sell).",
      "Sustained taker-buy dominance = demand absorbing supply (bullish); taker-sell dominance = the opposite.",
      "Divergence (price flat but buyers aggressive) hints at quiet accumulation.",
    ],
    example:
      "Price chops sideways but cumulative taker-buy volume keeps climbing — someone is absorbing every sell. That accumulation often precedes a breakout.",
    takeaway:
      "Trade with the aggressor: persistent one-sided flow usually resolves in that direction.",
  },
  liquidations: {
    read: [
      "Each bar is forced liquidations — traders margin-called out of their positions.",
      "Long liquidations (red) spike on sharp drops; short liquidations (green) spike on sharp rallies.",
      "Large liquidation clusters mark where leverage was flushed — often local tops/bottoms.",
    ],
    example:
      "A $40M long-liquidation candle prints into a support level, then price snaps back — the flush cleared weak hands and reset the move.",
    takeaway:
      "Big liquidation spikes often mark exhaustion — fading the flush (with confirmation) can be high R:R.",
  },
  vsbtc: {
    read: [
      "Shows how each coin is performing relative to Bitcoin, not just in dollars.",
      "Outperforming BTC in an up-move = real strength; lagging BTC = weak hands.",
      "In a down-move, coins that hold up vs BTC are where money is hiding.",
    ],
    example:
      "BTC is flat but a coin is +6% against it — that relative strength usually continues short-term as rotation flows in.",
    takeaway:
      "Long the relative-strength leaders, avoid the laggards — BTC sets the tide, relative strength picks the winners.",
  },
  btccorr: {
    read: [
      "Correlation (ρ) measures how tightly a coin tracks BTC; beta (β) measures how hard it moves per BTC move.",
      "ρ near 1 = moves with BTC; ρ near 0 = decoupled, trading on its own story.",
      "β above 1 = amplifies BTC moves (more risk/reward); below 1 = dampened.",
    ],
    example:
      "A coin with ρ 0.1 and β 0.2 is decoupled — it can rally even while BTC ranges. Our data shows decoupled calls outperformed coupled ones today.",
    takeaway: "Decoupled, low-beta coins let you take a setup without betting on BTC's direction.",
  },
  momentum: {
    read: [
      "Ranks coins by the strength and freshness of their move across timeframes.",
      "Accelerating momentum = trend still building; fading momentum = move maturing.",
      "Best used to time entries within an already-valid setup, not to pick tops.",
    ],
    example:
      "A coin flips to strong momentum on the 1H while the 4H trend is already up — the shorter timeframe is catching up, a classic continuation entry.",
    takeaway: "Enter when a lower timeframe's momentum aligns with the higher-timeframe trend.",
  },
  sectors: {
    read: [
      "Groups performance by narrative (DeFi, AI, GameFi, RWA…) so you can see where capital is rotating.",
      "Win rate + average peak per sector shows which narrative is actually paying, not just trending on X.",
      "A hot sector lifts most of its coins — trade the theme, not just one ticker.",
    ],
    example:
      "AI prints 4/4 winners at 100% while other sectors lag — money is rotating into that narrative today, so AI setups have tailwind.",
    takeaway:
      "Fish where the fish are: bias entries toward the sector leading on win rate and average peak.",
  },
  tokenflow: {
    read: [
      "Tracks net stablecoin/asset flow in and out of centralized exchanges (Dune data).",
      "Net inflow to exchanges = potential sell pressure (coins moved to sell); net outflow = accumulation to cold storage.",
      "Large, sustained flows matter more than single spikes.",
    ],
    example:
      "A token sees steady net OUTflow from exchanges over a week — supply is leaving to wallets, tightening float ahead of a move.",
    takeaway:
      "Outflows tighten supply (bullish pressure); heavy inflows warn of incoming sell-side.",
  },
  rsi: {
    read: [
      "A heatmap of RSI across many coins and timeframes at once.",
      "Hot (overbought, RSI>70) = stretched; cold (oversold, RSI<30) = washed out.",
      "Alignment across timeframes (all cold, then turning up) is the strongest signal.",
    ],
    example:
      "A coin shows oversold RSI on 4H and 1H, then the 15m ticks green — a multi-timeframe reversal often starts exactly here.",
    takeaway:
      "Look for multi-timeframe oversold turning up (or overbought rolling over) — single-timeframe RSI lies too often.",
  },
  atr: {
    read: [
      "ATR (Average True Range) measures how much a coin typically moves — its volatility budget.",
      "Levels are drawn as ATR multiples from price: realistic targets and stops based on the coin's own volatility.",
      "A wide ATR means give the trade more room; a tight ATR means smaller stops work.",
    ],
    example:
      "A coin's 1× ATR is 3%. A stop placed 0.5% away will get wicked out on normal noise — size your stop to at least 1× ATR.",
    takeaway:
      "Set stops and targets in ATR multiples, not round numbers — respect each coin's natural range.",
  },
  volsqueeze: {
    read: [
      "Detects when volatility has compressed — Bollinger Bands squeezing inside Keltner Channels.",
      "A squeeze = the market is coiling; energy builds while range narrows.",
      "The squeeze doesn't tell you direction, only that a big move is loading.",
    ],
    example:
      "A coin has been in a tight range for days (bands pinched). When the squeeze releases, it breaks out hard — the compression fed the expansion.",
    takeaway:
      "Watch squeezing coins for the break — pair with Order Flow or Confluence to pick the direction.",
  },

  // ── Per-chart guides: DERIVATIVES ──────────────────────────────
  oiQuad: {
    read: [
      "Four quadrants: X = price change, Y = open-interest change.",
      "Top-right (price ↑, OI ↑) = new longs, real conviction. Top-left (price ↓, OI ↑) = new shorts.",
      "Bottom-right (price ↑, OI ↓) = short covering, not new buying. Bottom-left = long capitulation.",
    ],
    example:
      "A coin sits top-right: +9% with OI up 25%. Fresh money is backing the move, not just shorts being squeezed out.",
    takeaway: "Top-right is the healthiest continuation; bottom-right rallies fade fastest.",
  },
  oiTop: {
    read: [
      "Largest open-interest builds over the last hour — where leverage is being added right now.",
      "A fast OI build means traders are committing size into that coin.",
    ],
    example:
      "A coin adds 30% OI in an hour while price grinds up — positioning is being built ahead of a move.",
    takeaway: "New OI marks where the action is about to be — check direction before joining.",
  },
  oiBottom: {
    read: [
      "Largest open-interest unwinds — positions being closed or liquidated.",
      "Heavy unwind often follows a flush; the leverage is being cleared out.",
    ],
    example:
      "OI drops 20% right after a sharp wick — that's forced exits, and often a local exhaustion point.",
    takeaway: "Big unwinds reset leverage; the next move starts from a cleaner book.",
  },
  oiBig: {
    read: [
      "Highest open interest by notional — the deepest, most liquid perp books in view.",
      "Big OI = more liquidity, tighter spreads, but also more fuel for a liquidation cascade.",
    ],
    example:
      "The top OI market absorbs large orders without slipping — good for size, but a cascade there moves the whole market.",
    takeaway: "Trade size in high-OI markets; expect violent moves when they unwind.",
  },
  lsrDist: {
    read: [
      "Distribution of account long/short ratios across all pairs. The line at 1.0 = balanced book.",
      "Bars far right = crowd heavily long; far left = heavily short.",
      "Click a bar to list the pairs in that bucket.",
    ],
    example:
      "The histogram leans hard right — most of the market is long. That's a crowded tape where a flush hurts many at once.",
    takeaway: "When the whole distribution skews one way, treat that side as the risk side.",
  },
  lsDiv: {
    read: [
      "X = retail long/short, Y = top-trader long/short.",
      "Gold points = smart money positioned AGAINST retail — the most interesting divergence.",
      "Points on the diagonal = everyone agrees (less edge).",
    ],
    example:
      "Retail L/S is 2.4 (very long) but top traders sit at 0.8 (short). Professionals are fading the crowd.",
    takeaway: "Follow the top-trader side when the two diverge sharply.",
  },
  taker: {
    read: [
      "Aggressive market-buy volume minus market-sell volume over 5 minutes.",
      "Positive = buyers lifting offers (demand). Negative = sellers hitting bids.",
    ],
    example:
      "A coin prints sustained positive taker delta while price holds flat — buyers are absorbing supply quietly.",
    takeaway: "Persistent one-sided taker pressure usually leads price.",
  },
  crowded: {
    read: [
      "Pairs sitting at long/short extremes — the most one-sided books.",
      "Crowded long = downside liquidation risk; crowded short = squeeze-up fuel.",
    ],
    example:
      "A coin appears with L/S 3.6 — nearly everyone is long, so there's little buying left and a stack of stops below.",
    takeaway: "Crowded books are where the sharpest counter-moves start.",
  },
  perpPremium: {
    read: [
      "Perp premium = how far the perpetual price sits above (rich) or below (cheap/inverted) the spot index.",
      "A rich perp means leveraged longs are paying up; an inverted perp means shorts are aggressive.",
      "Extreme premiums tend to mean-revert back to spot.",
    ],
    example:
      "A perp trades 1.2% above index — leverage is chasing. That gap usually closes, often via a sharp wick down.",
    takeaway: "Big premiums are late-entry warnings; inverted perps can mark capitulation lows.",
  },
  squeezeRadar: {
    read: [
      "Composite radar of the coins most primed to squeeze — shorts paying, OI building, price rising.",
      "It fuses several derivative signals rather than relying on funding alone.",
    ],
    example:
      "A coin shows negative funding + rising OI + firm price: shorts are paying to stay in while the market grinds up against them.",
    takeaway: "That combination is classic squeeze-up fuel — shorts get forced out.",
  },
  fundNeg: {
    read: [
      "Most negative funding — holding a LONG here gets paid by the shorts.",
      "Deeply negative funding means shorts are crowded and financing your position.",
    ],
    example: "Funding at −0.05% per 8h means longs collect a fee every period just for holding.",
    takeaway: "Negative funding pays you to be long and marks crowded shorts (squeeze-up risk).",
  },
  fundPos: {
    read: [
      "Most positive funding — the most expensive longs in the market.",
      "These traders pay a recurring fee to stay long; crowded and cost-bleeding.",
    ],
    example:
      "Funding at +0.09% per 8h costs ~0.27%/day just to hold — that pressure eventually forces exits.",
    takeaway: "Expensive longs are fragile longs — a prime long-squeeze candidate.",
  },
  fundFc: {
    read: [
      "X = funding rate, Y = how far the coin has moved since our call.",
      "Shows whether the crowd's funding stance is being rewarded or punished.",
    ],
    example:
      "A coin has positive funding but is below entry — longs are paying to hold a losing position, a common pre-flush setup.",
    takeaway: "Paying funding while underwater is the weakest possible position structure.",
  },
  vsChart: {
    read: [
      "Every series starts at 100 so you compare shape, not price.",
      "BTC is the gold line — anything above it is outperforming, below is lagging.",
      "Divergence from the BTC line = the coin is trading on its own story.",
    ],
    example:
      "A coin climbs to 112 while BTC sits at 101 — it's making an independent move, not just riding beta.",
    takeaway: "Lines separating from gold are where genuine alpha is showing up.",
  },
  rsiDist: {
    read: [
      "Distribution of 1h RSI(14) across signals. Below 30 = oversold, above 70 = overbought.",
      "A bunched distribution shows the whole market in the same condition.",
    ],
    example:
      "Most of the book sits above 70 — the market is broadly extended, so new longs are chasing.",
    takeaway: "Market-wide RSI extremes warn that easy continuation is over.",
  },
  volChg: {
    read: [
      "1h change in rolling 24h volume — turnover waking up or dying off.",
      "Rising volume validates a price move; falling volume means the move lacks participation.",
    ],
    example:
      "A breakout comes with +60% volume change — real participation is confirming the break.",
    takeaway: "Never trust a breakout on shrinking volume.",
  },
  momScatter: {
    read: [
      "X = relative strength vs BTC, Y = volume acceleration.",
      "Top-right = outperforming BTC AND attracting fresh volume — the strongest quadrant.",
      "Bottom-left = lagging and being abandoned.",
    ],
    example:
      "A coin sits top-right: beating BTC by 7% with volume accelerating 40% — money is actively rotating in.",
    takeaway: "Top-right is where trends start; that pairing beats either signal alone.",
  },
  momTop: {
    read: [
      "Highest composite momentum score — strength blended across timeframes.",
      "Momentum persists more often than it reverses over short horizons.",
    ],
    example: "The top-ranked coin has been leading for hours — continuation is the base case.",
    takeaway: "Use this to pick which valid setup to take first.",
  },
  momRs: {
    read: [
      "Biggest 24h outperformance over BTC — pure relative strength leaders.",
      "These coins rise more on green days and fall less on red ones.",
    ],
    example: "A coin beats BTC by 9% in 24h — capital is rotating into it specifically.",
    takeaway: "Relative-strength leaders are the highest-quality longs in an up-tape.",
  },
  momAccel: {
    read: [
      "Biggest rise in rolling volume over the last hour — where attention just arrived.",
      "Acceleration is an early tell, often before the price move completes.",
    ],
    example: "Volume accelerates 80% in an hour on a quiet coin — something just changed.",
    takeaway: "Volume arrives before the crowd — treat this as an early watchlist.",
  },
  sqLong: {
    read: [
      "Highest squeeze score on the LONG side — the most crowded, extended longs.",
      "Longer bar = more stacked and more exposed to a downside flush.",
    ],
    example:
      "NOMUSDT tops the list at 69 — longs are heavily stacked there, so a drop cascades stops.",
    takeaway: "These are squeeze-DOWN candidates — avoid chasing longs here.",
  },
  sqShort: {
    read: [
      "Highest squeeze score on the SHORT side — the most crowded shorts.",
      "Crowded shorts are fuel: forced covering pushes price up fast.",
    ],
    example: "A coin ranks high on the short side while price holds firm — shorts are trapped.",
    takeaway: "These are squeeze-UP candidates — the pain trade is higher.",
  },

  // ── Per-chart guides: SIGNAL ANALYTICS ─────────────────────────
  flow: {
    read: [
      "How many signals fired each day, so you can see the desk's activity rhythm.",
      "Quiet days usually mean conditions didn't meet the filters — not a bug.",
    ],
    example: "A burst of signals on one day lines up with a volatility expansion in the market.",
    takeaway: "Signal count follows opportunity — few signals means few clean setups.",
  },
  funnel: {
    read: [
      "How many signals reached TP1, then TP2, TP3 and TP4 — a drop-off funnel.",
      "The step-down between levels shows how far calls typically run.",
    ],
    example:
      "Most signals clear TP1 but far fewer reach TP4 — so taking partials early captures the bulk of the edge.",
    takeaway: "Let the funnel set your take-profit plan, not hope.",
  },
  statusMix: {
    read: [
      "Share of open vs TP-progressed signals currently in view.",
      "A high open share means results are still pending, not that they failed.",
    ],
    example: "60% still open early in the day — the sample hasn't resolved yet.",
    takeaway: "Judge win rate on resolved signals, not on a book full of open ones.",
  },
  riskMix: {
    read: [
      "Distribution of normalized risk levels across signals. Click a slice to filter.",
      "Higher risk = wider expected swing, so it needs smaller size.",
    ],
    example: "The book skews to MEDIUM risk — position sizing can be consistent across it.",
    takeaway: "Match position size to the risk bucket, not to your conviction.",
  },
  tt1: {
    read: [
      "How long signals typically take to reach TP1.",
      "Sets a realistic expectation for how long to hold before a setup is 'wrong'.",
    ],
    example:
      "Median time to TP1 is a few hours — so a call flat after 20 minutes isn't failing yet.",
    takeaway: "Give trades the time the data says they need before abandoning them.",
  },
  equity: {
    read: [
      "Daily targets hit (TP1–TP4, up) versus stop-outs (SL, down).",
      "The running shape shows consistency, not just a single day's result.",
    ],
    example: "A run of green days with a shallow red day shows losses staying small.",
    takeaway: "Consistency and small losses matter more than any one big winner.",
  },
  sectorCount: {
    read: [
      "Where the calls are concentrated by sector. Click a sector to focus every tab on it.",
      "Concentration shows which narrative the engine is finding setups in.",
    ],
    example: "Half the signals cluster in one sector — that narrative is in play today.",
    takeaway: "Heavy concentration is a rotation tell — but avoid over-exposing to one theme.",
  },
  anom: {
    read: [
      "Plots price movement against volume intensity to find statistically odd behaviour.",
      "Outliers move on far more (or less) volume than their own norm.",
    ],
    example: "A coin jumps on 5× normal volume — a genuine participation event, not noise.",
    takeaway: "Price without volume is noise; price with volume is a signal.",
  },
  spike: {
    read: [
      "Notional traded in 15m versus each coin's typical pace. 3× = three times normal.",
      "Spikes flag sudden attention — news, a whale, or a breakout starting.",
    ],
    example: "A quiet coin prints a 5× volume spike — something just triggered real interest.",
    takeaway: "Volume spikes are the earliest tell that a move is beginning.",
  },
  rsUp: {
    read: ["24h return minus BTC's — the relative-strength leaders."],
    example: "A coin beats BTC by 8% — it's absorbing rotation flow.",
    takeaway: "In an up-tape, buy strength: leaders keep leading.",
  },
  rsDown: {
    read: ["24h return minus BTC's, on the weak side — relative laggards."],
    example: "A coin trails BTC by 6% even on a green day — demand simply isn't there.",
    takeaway: "Avoid laggards for longs; they're the first to break on a pullback.",
  },
  sess: {
    read: [
      "Price change over roughly the last 15 minutes — what's moving right now.",
      "Useful for timing an entry into an already-valid setup.",
    ],
    example: "A coin on your watchlist appears in the 15m movers — the move is starting now.",
    takeaway: "Use this for timing, never as a reason to enter on its own.",
  },
  fcDist: {
    read: [
      "Distribution of how far live prices sit from entry. Right of center = in profit.",
      "A right-shifted shape means the book as a whole is working.",
    ],
    example:
      "Most of the distribution sits right of center — the majority of open calls are green.",
    takeaway: "Read the whole book's health here, not just your one position.",
  },
  opp: {
    read: [
      "Maps signals by how much room is left to target versus how far they've already run.",
      "Coins near entry with big targets still have the most upside left.",
    ],
    example:
      "A call sits near its entry but carries a large max target — the full move is still ahead.",
    takeaway: "Best risk/reward is close to entry with the target still far away.",
  },
  peak: {
    read: [
      "Compares each signal's peak gain against where it trades now.",
      "A wide gap means the move already happened and gave much of it back.",
    ],
    example:
      "A coin peaked at +30% but sits at +6% — most of that move is gone; chasing it now is late.",
    takeaway: "Big peak-vs-current gaps mean you missed it — wait for the next setup.",
  },
  topGainers: {
    read: ["Best live performance versus entry among the calls in view."],
    example: "The leader is well above entry, already through several targets.",
    takeaway: "Manage winners — trail stops rather than chasing more size in late.",
  },
  topLosers: {
    read: ["Calls sitting deepest below entry right now."],
    example: "A call trades under entry but above its stop — still valid, just not working yet.",
    takeaway: "Below entry isn't invalidated — the stop level decides that, not your patience.",
  },
  suspect: {
    read: [
      "Data quarantined for being implausible — live vs entry outside −95%…+400%.",
      "Usually bad exchange ticks or token redenominations, not real moves.",
    ],
    example: "A pair shows −99% after a redenomination — excluded so it can't skew the stats.",
    takeaway: "This exists so the win-rate numbers stay honest.",
  },
  betaDist: {
    read: [
      "Distribution of 30-day beta to BTC across the book.",
      "Beta above 1 amplifies BTC moves; below 1 dampens them.",
    ],
    example: "The book skews high-beta — a BTC drop would hit these calls harder than BTC itself.",
    takeaway: "Know your book's beta: high beta means you're implicitly leveraged to BTC.",
  },
  betaPerf: {
    read: [
      "Beta plotted against live performance — does taking BTC risk actually pay?",
      "If low-beta coins outperform, the edge is coin-specific rather than market-driven.",
    ],
    example:
      "Low-beta names lead the performance column — today's edge came from stock-picking, not BTC direction.",
    takeaway: "When low beta wins, favour decoupled setups over market beta.",
  },
  align: {
    read: [
      "How closely each coin's structure matches BTC's, scored 0–100.",
      "High alignment = it will follow BTC; low = it trades independently.",
    ],
    example: "A coin scores 20 — it's ignoring BTC and trading its own structure.",
    takeaway: "Low alignment lets you take a setup without forecasting BTC.",
  },
  decList: {
    read: [
      "Coins statistically decoupled from BTC right now, with live distance from call.",
      "Decoupled names offer diversification from a single BTC bet.",
    ],
    example: "A decoupled coin is up while BTC ranges flat — its move is genuinely its own.",
    takeaway: "Decoupled winners are the cleanest alpha in a directionless market.",
  },
  radar: {
    read: ["Signal count by sector — concentration of the book at a glance."],
    example: "One spoke dominates the radar — that's where the engine is finding setups.",
    takeaway: "Watch concentration so one narrative doesn't become your whole risk.",
  },
  sectorFc: {
    read: [
      "Median distance from call, grouped by sector — which narratives are actually working now.",
      "Click a sector to focus every tab on it.",
    ],
    example:
      "One sector shows a clearly positive median while others sit flat — rotation is live there.",
    takeaway: "Bias new entries toward the sector with the healthiest median.",
  },
  sectorTgt: {
    read: [
      "Median max target by sector — where the biggest promised upside sits.",
      "Pair with the median performance chart: big targets only matter if calls are working.",
    ],
    example:
      "A sector shows large median targets but weak live performance — ambitious targets, poor delivery.",
    takeaway: "Chase upside only where the sector is also delivering.",
  },

  // ── Remaining tabs ─────────────────────────────────────────────
  live: {
    read: [
      "A live feed of calls as they fire, newest first, with their current distance from entry.",
      "Green = above entry, red = below. Status chips show the furthest target hit so far.",
    ],
    example:
      "A call appears and moves to TP1 within the hour — you can watch the progression in real time.",
    takeaway: "Use this to catch setups early; check Confluence before acting on any of them.",
  },
  edge: {
    read: [
      "Simulates what a strategy would have returned across historical signals.",
      "Change the rules (which targets you take, where the stop sits, position size) and the result recalculates.",
      "It's backtest maths, not a promise — past edge is evidence, not a guarantee.",
    ],
    example:
      "Taking partials at TP1 and trailing the rest usually beats holding everything for TP4, because far fewer signals reach TP4.",
    takeaway: "Use it to pick an exit plan you can actually follow, then stick to it.",
  },
  riskcalc: {
    read: [
      "Works out position size from your account size, risk-per-trade %, entry and stop.",
      "Size is derived from the STOP distance — a wider stop means a smaller position for the same risk.",
      "The risk % is the only thing you truly control on entry.",
    ],
    example:
      "A $10,000 account risking 1% ($100) with a 5% stop gives a $2,000 position — not $10,000 of leverage.",
    takeaway: "Size from the stop, never from conviction. Fixed risk % is what keeps you alive.",
  },
  orderbook: {
    read: [
      "Compares resting bid depth against ask depth near the current price.",
      "More bids = buy-side support; more asks = a wall of supply overhead.",
      "Resting orders can be pulled — treat it as a snapshot, not a promise.",
    ],
    example:
      "Bid depth heavily outweighs asks just under price — buyers are stacked, so dips are likely to get absorbed.",
    takeaway: "Trade toward the thin side: price travels where there's least resistance.",
  },
};

export default VIZ_GUIDES;
