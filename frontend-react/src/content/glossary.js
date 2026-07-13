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
];

export const getTerm = (slug) => GLOSSARY.find((t) => t.slug === slug) || null;
