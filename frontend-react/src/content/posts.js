// src/content/posts.js
// Public blog — editorial layer for topical authority. Each post is an
// indexable page at /blog/:slug. Body is an array of blocks:
//   { h2: "..." }            → section heading
//   { p: "..." }             → paragraph
//   { list: ["a","b"] }      → bullet list
// Keep content genuinely useful and link to glossary terms where relevant.

export const POSTS = [
  {
    slug: "how-to-read-crypto-sector-rotation",
    title: "How to read crypto sector rotation (money flow, explained)",
    excerpt:
      "Capital in crypto rotates between narratives — AI, RWA, memes, DeFi. Here's how to read where money is flowing using dominance, breadth, and sector performance.",
    date: "2026-07-13",
    updated: "2026-07-13",
    readingTime: "6 min",
    keywords:
      "crypto sector rotation, money flow crypto, narrative rotation, altcoin season, btc dominance",
    body: [
      { p: "Crypto rarely moves as one block. Capital rotates — out of Bitcoin into altcoins, between narratives like AI and real-world assets (RWA), and in and out of stablecoins. Reading that rotation is how you understand what the market is actually doing instead of staring at a single coin's chart." },
      { h2: "Start with the macro compass" },
      { p: "Three ratios frame everything. Bitcoin dominance tells you whether capital favors BTC or is spreading into alts. Stablecoin dominance tells you how much money is parked on the sidelines. An altseason index tells you how broad altcoin outperformance is right now." },
      { p: "Read them together, not in isolation. Rising Bitcoin dominance with falling stablecoin dominance means money is entering and concentrating in BTC; falling Bitcoin dominance with a rising altseason index means breadth is expanding into alts." },
      { h2: "Then look at sector (narrative) performance" },
      { p: "Group coins by narrative and compare category performance over 24h and 7d. A narrative that's up sharply on 24h but flat on 7d is a fresh move; one that's up on both is a maturing trend. This is where you see attention concentrating before it shows up in individual coins you follow." },
      { list: [
        "24h leaders = where attention is today",
        "7d leaders = where the trend has legs",
        "Laggards rotating green = early rotation candidates",
      ] },
      { h2: "Confirm with flow, not vibes" },
      { p: "Narrative performance shows what moved; flow data shows how actively. Flow intensity (24h volume ÷ market cap) tells you whether a move has real turnover behind it, and DEX buy/sell pressure shows on-chain accumulation vs distribution for tokens that centralized data misses." },
      { p: "The point isn't prediction — it's a clear, current picture so you decide for yourself. Inform, don't decide." },
      { h2: "Where to watch it" },
      { p: "LuxQuant's Money Flow page puts the macro compass, sector rotation, per-coin flow intensity, and live DEX pressure in one view — and lets you open any narrative to see every coin inside it." },
    ],
    related: ["btc-dominance-explained", ],
    relatedTerms: ["sector-rotation", "money-flow", "flow-intensity", "btc-dominance"],
  },
  {
    slug: "btc-dominance-explained",
    title: "Bitcoin dominance explained: what BTC.D signals for altcoins",
    excerpt:
      "Bitcoin dominance is Bitcoin's share of total crypto market cap. Here's what rising and falling BTC.D actually tells you — and what it doesn't.",
    date: "2026-07-13",
    updated: "2026-07-13",
    readingTime: "5 min",
    keywords:
      "bitcoin dominance, btc.d, what is btc dominance, altseason, crypto market cap",
    body: [
      { p: "Bitcoin dominance (BTC.D) is one of the most quoted — and most misread — numbers in crypto. It's simply Bitcoin's market cap as a share of the total crypto market. But because it's a ratio, understanding why it moves matters more than the number itself." },
      { h2: "What rising and falling BTC.D mean" },
      { p: "A rising dominance means Bitcoin is gaining share of the market. That often happens when traders de-risk within crypto, favoring BTC over smaller, more volatile alts. A falling dominance means the opposite: capital is spreading into altcoins, which is why traders associate a declining BTC.D with 'altcoin season.'" },
      { h2: "The trap: ratios have three drivers" },
      { p: "Dominance can rise because Bitcoin went up, because altcoins went down, or both. So never read BTC.D alone — pair it with absolute prices and with stablecoin dominance. A rising BTC.D while total market cap falls is very different from a rising BTC.D during a broad rally." },
      { list: [
        "BTC.D up + alts down = risk-off rotation into Bitcoin",
        "BTC.D down + alts up = breadth expanding (possible altseason)",
        "Stablecoin dominance up = capital moving to the sidelines",
      ] },
      { h2: "How to use it" },
      { p: "Treat dominance as a context gauge, not a trade trigger. It frames risk appetite and tells you whether strength is concentrated in Bitcoin or spread across alts. Combine it with an altseason index for breadth and with flow data for confirmation." },
      { p: "LuxQuant shows BTC, ETH, and stablecoin dominance plus an altseason index side by side in the Money Flow Market Compass." },
    ],
    related: ["how-to-read-crypto-sector-rotation"],
    relatedTerms: ["btc-dominance", "altseason-index", "money-flow"],
  },
];

export const getPost = (slug) => POSTS.find((p) => p.slug === slug) || null;
