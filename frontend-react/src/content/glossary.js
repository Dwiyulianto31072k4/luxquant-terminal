// src/content/glossary.js
// Public glossary — programmatic SEO. Each term is its own indexable page at
// /learn/:slug, targeting long-tail "what is X" search. Content maps directly
// to LuxQuant features so the topical relevance is real (not thin pSEO).
// Body is an array of paragraph strings; keep them factual and educational.

export const GLOSSARY = [
  {
    slug: "money-flow",
    term: "Money flow (crypto)",
    aka: "Capital rotation",
    short:
      "Money flow is where capital is rotating across crypto — between sectors, coins, and on/off exchanges — read from volume, dominance, and buy/sell data.",
    body: [
      "In crypto, “money flow” describes where capital is moving: into or out of Bitcoin, between narratives (AI, RWA, memes), from stablecoins into risk assets, and on- or off-exchange. It is inferred from measurable data — trading volume, market-cap dominance, and on-chain buy/sell activity — rather than any single price.",
      "Traders watch money flow to gauge risk appetite and rotation. When capital leaves Bitcoin and spreads into altcoins, breadth expands; when it retreats into stablecoins, the market is de-risking. None of this predicts price — it describes what is currently happening so you can decide for yourself.",
      "LuxQuant’s Money Flow page tracks this across three layers: macro dominance gauges, per-coin flow intensity, and live DEX buy/sell pressure.",
    ],
    related: ["flow-intensity", "sector-rotation", "btc-dominance", "dex-buy-sell-pressure"],
  },
  {
    slug: "flow-intensity",
    term: "Flow intensity",
    aka: "Volume-to-market-cap turnover",
    short:
      "Flow intensity is a coin's 24h trading volume divided by its market cap — a proxy for how actively capital is churning relative to size.",
    body: [
      "Flow intensity = 24h volume ÷ market capitalization. It normalizes activity by size, so a small coin trading its entire market cap in a day scores far higher than a mega-cap with the same dollar volume. It is a descriptive ratio, not a signal.",
      "A high ratio means money is turning over quickly relative to the coin’s size — often around catalysts, listings, or heightened speculation. A low ratio means comparatively little of the float is changing hands. Reading it alongside price change and liquidity gives context that raw volume alone can’t.",
      "On LuxQuant, flow intensity powers the Coins tab of Money Flow, with descriptive tags (normal / elevated / high turnover) derived straight from the ratio.",
    ],
    related: ["money-flow", "turnover-ratio", "dex-buy-sell-pressure"],
  },
  {
    slug: "btc-dominance",
    term: "Bitcoin dominance (BTC.D)",
    aka: "BTC.D",
    short:
      "Bitcoin dominance is Bitcoin's share of total crypto market cap. Rising BTC.D usually means capital favoring BTC over altcoins.",
    body: [
      "Bitcoin dominance (BTC.D) is Bitcoin’s market cap as a percentage of the entire crypto market. It’s a quick read on where capital sits: a rising BTC.D means Bitcoin is gaining share (often a flight to relative safety within crypto), while a falling BTC.D can signal capital rotating out into altcoins.",
      "Dominance is a ratio, so it can move because Bitcoin rose, because altcoins fell, or both — always read it next to absolute prices. Stablecoin dominance is a useful companion metric: rising stablecoin dominance means more capital parked on the sidelines.",
      "LuxQuant surfaces BTC dominance, ETH dominance, stablecoin dominance, and an altseason index together in the Money Flow “Market Compass”.",
    ],
    related: ["altseason-index", "money-flow", "sector-rotation"],
  },
  {
    slug: "altseason-index",
    term: "Altseason index",
    aka: "Altcoin season index",
    short:
      "The altseason index measures how broadly altcoins are outperforming Bitcoin over a window — a high reading suggests an 'altcoin season'.",
    body: [
      "An altseason index scores how many top altcoins are outperforming Bitcoin over a set window (commonly 30 or 90 days), usually on a 0–100 scale. A high value means outperformance is broad — the market shorthand for “altcoin season” — while a low value means Bitcoin is leading.",
      "It’s a breadth gauge, not a forecast. It tells you whether strength is concentrated in Bitcoin or spread across alts right now, which helps frame risk and position sizing. It says nothing about what happens next.",
      "LuxQuant computes an altseason index from the top coins (excluding stablecoins and wrapped assets) and shows it in the Market Compass gauges.",
    ],
    related: ["btc-dominance", "money-flow", "sector-rotation"],
  },
  {
    slug: "sector-rotation",
    term: "Sector rotation (crypto narratives)",
    aka: "Narrative rotation",
    short:
      "Sector rotation is capital moving between crypto narratives — AI, RWA, memes, DeFi — visible as one category outperforming others.",
    body: [
      "Crypto trades in narratives — AI agents, real-world assets (RWA), memecoins, DeFi, gaming, and more. Sector rotation is the movement of capital between these categories: as one narrative heats up, its coins outperform while attention (and money) leaves others.",
      "Tracking rotation helps you see where momentum is concentrating without chasing a single coin. Comparing 24h and 7d category performance shows whether a move is fresh or maturing. Like all flow data, it’s descriptive — it maps attention, it doesn’t guarantee continuation.",
      "LuxQuant’s Money Flow ranks sectors by market-cap change and lets you open any narrative to see every coin inside it.",
    ],
    related: ["money-flow", "btc-dominance", "altseason-index"],
  },
  {
    slug: "dex-buy-sell-pressure",
    term: "DEX buy/sell pressure",
    aka: "On-chain buy vs sell",
    short:
      "DEX buy/sell pressure compares the number of on-chain buy vs sell transactions in a pool — a factual read on accumulation vs distribution.",
    body: [
      "On decentralized exchanges, every swap is on-chain, so you can count buys versus sells directly. DEX buy/sell pressure compares those counts (and their volume) over a window to describe whether a pool is seeing net buying or net selling — a transparent, fact-based alternative to guessing sentiment.",
      "It’s especially useful for meme and micro-cap tokens that centralized-exchange data misses. Because it’s raw transaction data, it describes behavior rather than judging it: more buys than sells is “net buying”, not “bullish”. You draw the conclusion.",
      "LuxQuant pulls live DEX pressure from GeckoTerminal into the Money Flow Coins view.",
    ],
    related: ["flow-intensity", "money-flow", "whale-alert"],
  },
  {
    slug: "whale-alert",
    term: "Whale alert (large transactions)",
    aka: "Whale transactions",
    short:
      "A whale alert flags unusually large on-chain transfers — big wallets moving funds to or from exchanges — a signal watched for potential supply shifts.",
    body: [
      "“Whales” are wallets large enough to move markets. A whale alert flags outsized on-chain transfers — for example, a large deposit to an exchange (often read as potential selling) or a withdrawal to self-custody (often read as accumulation). It’s context, not certainty; whales move funds for many reasons.",
      "Watching large-transaction flow helps you spot when big holders are repositioning before it shows up in price. The useful signal is direction and destination — exchange inflow vs outflow — not any single transfer.",
      "LuxQuant tracks BTC and ETH whale transfers, tagged by inflow/outflow, in its On-Chain and Whale Alert views.",
    ],
    related: ["dex-buy-sell-pressure", "money-flow"],
  },
  {
    slug: "turnover-ratio",
    term: "Turnover ratio (volume / market cap)",
    aka: "Turnover",
    short:
      "Turnover ratio is trading volume divided by market cap — how much of an asset's value changes hands in a period. High turnover = high activity.",
    body: [
      "Turnover ratio divides trading volume by market cap over a period (usually 24h). It answers “how much of this asset’s value traded today?” A ratio of 0.30 means volume equal to 30% of market cap changed hands — very active; 0.02 means quiet.",
      "It’s the engine behind flow intensity and a fast way to compare activity across coins of very different sizes. High turnover often accompanies volatility and news; sustained low turnover suggests thin interest. It measures activity, not direction.",
      "LuxQuant tags coins as normal / elevated / high turnover directly from this ratio.",
    ],
    related: ["flow-intensity", "money-flow"],
  },
  {
    slug: "eth-dominance",
    term: "Ethereum dominance (ETH.D)",
    aka: "ETH.D",
    short:
      "Ethereum dominance is Ethereum's share of total crypto market cap — a read on how ETH is holding up versus Bitcoin and the wider market.",
    body: [
      "Ethereum dominance (ETH.D) is Ethereum's market cap as a percentage of the total crypto market. It sits alongside Bitcoin dominance as a gauge of where capital concentrates. A rising ETH.D means Ethereum is gaining share — often when the ETH ecosystem (L2s, DeFi, staking) is in favor.",
      "Read it against BTC dominance: if BTC.D falls while ETH.D rises, capital is rotating from Bitcoin toward Ethereum and its ecosystem specifically, rather than into small-cap alts broadly. As a ratio, it moves on both numerator and denominator — always pair with absolute prices.",
    ],
    related: ["btc-dominance", "altseason-index", "money-flow"],
  },
  {
    slug: "stablecoin-dominance",
    term: "Stablecoin dominance",
    aka: "USDT.D / stablecoin share",
    short:
      "Stablecoin dominance is the share of crypto market cap held in stablecoins — a proxy for how much capital is parked on the sidelines.",
    body: [
      "Stablecoin dominance measures the combined market cap of stablecoins (USDT, USDC, etc.) as a share of the total crypto market. It's a sidelines gauge: when it rises, more capital is sitting in stables waiting; when it falls, that capital is being deployed into risk assets.",
      "Traders read a falling stablecoin dominance as risk-on (dry powder entering the market) and a rising one as risk-off (capital retreating to safety). It pairs naturally with Bitcoin dominance to describe both direction and available buying power.",
    ],
    related: ["btc-dominance", "money-flow", "altseason-index"],
  },
  {
    slug: "exchange-inflow-outflow",
    term: "Exchange inflow & outflow",
    aka: "Exchange flows",
    short:
      "Exchange inflow is crypto moving onto exchanges (often pre-sell); outflow is crypto leaving to self-custody (often accumulation). A key on-chain signal.",
    body: [
      "Exchange inflow is the movement of coins from private wallets onto exchanges; outflow is the reverse — coins leaving exchanges into self-custody. Because most selling happens on exchanges, sustained net inflows are often read as potential selling pressure, and sustained net outflows as accumulation or a supply squeeze.",
      "It's directional context, not certainty — funds move onto exchanges for derivatives, OTC, and many reasons. The useful signal is the trend and size of net flows, especially from large (whale) wallets.",
    ],
    related: ["whale-alert", "smart-money", "money-flow"],
  },
  {
    slug: "smart-money",
    term: "Smart money",
    aka: "Smart-money wallets",
    short:
      "Smart money refers to wallets with a track record of profitable, well-timed moves — tracked on-chain to see what informed participants are doing.",
    body: [
      "“Smart money” describes wallets that have historically bought and sold well — early entries, profitable exits, accumulation before major moves. On-chain analytics labels and tracks these wallets so you can watch what informed participants are doing in near real time.",
      "Following smart money is context, not a copy-trade guarantee: their edge, risk tolerance, and time horizon differ from yours, and labels can be wrong. The value is seeing where experienced capital is flowing before it's obvious in price.",
    ],
    related: ["whale-alert", "exchange-inflow-outflow", "money-flow"],
  },
  {
    slug: "liquidation",
    term: "Liquidation (leverage)",
    aka: "Forced liquidation",
    short:
      "A liquidation is when an exchange force-closes a leveraged position that can no longer meet margin — clusters of them can accelerate price moves.",
    body: [
      "In leveraged trading, a liquidation happens when a position's losses breach its maintenance margin and the exchange force-closes it. Because these are forced market orders, large clusters of liquidations can cascade — long liquidations add selling into a drop, short liquidations add buying into a rally.",
      "Watching liquidation levels and totals helps you understand where forced flows might accelerate a move. It describes leverage stress in the market; it doesn't tell you direction on its own.",
    ],
    related: ["funding-rate", "money-flow"],
  },
  {
    slug: "funding-rate",
    term: "Funding rate (perpetuals)",
    aka: "Perp funding",
    short:
      "Funding rate is the periodic payment between long and short perpetual-futures traders that keeps the perp price tethered to spot — a gauge of leverage bias.",
    body: [
      "Perpetual futures have no expiry, so exchanges use a funding rate — a small periodic payment between longs and shorts — to keep the perp price anchored to spot. Positive funding means longs pay shorts (crowded longs); negative funding means shorts pay longs (crowded shorts).",
      "Persistently high positive funding signals aggressive long leverage, which can precede long-squeeze liquidations; deeply negative funding signals the opposite. It's a sentiment/positioning gauge, read alongside price and open interest.",
    ],
    related: ["liquidation", "money-flow"],
  },
];

export const getTerm = (slug) => GLOSSARY.find((t) => t.slug === slug) || null;
