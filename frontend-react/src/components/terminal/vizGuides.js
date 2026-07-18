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
};

export default VIZ_GUIDES;
