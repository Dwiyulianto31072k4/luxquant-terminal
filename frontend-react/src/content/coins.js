// src/content/coins.js
// Curated coin dataset for programmatic SEO pages at /coins/:slug.
// Quality over quantity: each coin has a real, unique descriptive blurb (no
// thin/doorway pages). Live price is shown client-side; the prerendered HTML
// carries the evergreen, crawlable content. `cg` = CoinGecko id (for links).

export const COINS = [
 { slug: "btc", symbol: "BTC", name: "Bitcoin", cg: "bitcoin", category: "Store of value · Layer 1",
 body: [
 "Bitcoin (BTC) is the first and largest cryptocurrency — a decentralized, fixed-supply digital asset widely treated as crypto's reserve asset and risk benchmark. Its market-cap dominance (BTC.D) is one of the most-watched gauges of where capital sits across the whole market.",
 "On LuxQuant, Bitcoin anchors the macro picture: its dominance drives the Money Flow Market Compass, its whale transfers show in On-Chain, and BTC correlation is scored on every signal so you can see how an altcoin moves relative to it.",
 ], related: ["eth", "sol", "bnb"] },
 { slug: "eth", symbol: "ETH", name: "Ethereum", cg: "ethereum", category: "Smart contracts · Layer 1",
 body: [
 "Ethereum (ETH) is the largest smart-contract platform and the settlement layer for most of DeFi, NFTs, stablecoins, and Layer-2 rollups. Its dominance (ETH.D) is a read on how the ETH ecosystem is holding up versus Bitcoin and the wider market.",
 "LuxQuant tracks ETH dominance in the Money Flow Market Compass, monitors large ETH whale transfers on-chain, and surfaces Ethereum-ecosystem narratives (L2s, DeFi, RWA) in sector rotation.",
 ], related: ["btc", "arb", "op"] },
 { slug: "sol", symbol: "SOL", name: "Solana", cg: "solana", category: "High-performance · Layer 1",
 body: [
 "Solana (SOL) is a high-throughput Layer-1 known for low fees and fast finality, and a hub for memecoins, DePIN, and consumer apps. It's often a leading indicator of on-chain speculative appetite.",
 "On LuxQuant, Solana activity shows up across DEX buy/sell pressure and flow intensity, and SOL-ecosystem tokens frequently lead the sector-rotation board when risk appetite expands.",
 ], related: ["btc", "eth", "bnb"] },
 { slug: "bnb", symbol: "BNB", name: "BNB", cg: "binancecoin", category: "Exchange token · Layer 1",
 body: [
 "BNB is the native asset of the BNB Chain ecosystem and the token behind the Binance exchange. It blends exchange-utility demand with an active on-chain DeFi and memecoin scene.",
 "LuxQuant tracks BNB-chain DEX flow and exchange-related activity, and BNB features in Money Flow as one of the large-cap majors framing overall market breadth.",
 ], related: ["btc", "eth", "sol"] },
 { slug: "xrp", symbol: "XRP", name: "XRP", cg: "ripple", category: "Payments",
 body: [
 "XRP is the asset of the XRP Ledger, built for fast, low-cost cross-border value transfer. It has one of crypto's largest and most active holder bases and often moves on regulatory and payments-adoption news.",
 "LuxQuant monitors XRP among the majors for money-flow and whale activity, and scores its BTC correlation on signals so you can gauge independent strength.",
 ], related: ["xlm", "ltc", "btc"] },
 { slug: "ada", symbol: "ADA", name: "Cardano", cg: "cardano", category: "Layer 1",
 body: [
 "Cardano (ADA) is a research-driven, proof-of-stake Layer-1 with a large community and a growing DeFi ecosystem. It's a long-standing large-cap that traders watch for rotation within the majors.",
 "On LuxQuant, ADA appears in Money Flow and sector views, with on-chain and correlation context to frame how it moves versus Bitcoin and its peers.",
 ], related: ["eth", "dot", "atom"] },
 { slug: "doge", symbol: "DOGE", name: "Dogecoin", cg: "dogecoin", category: "Memecoin",
 body: [
 "Dogecoin (DOGE) is the original memecoin and a barometer of retail speculative sentiment. Its moves are often driven by social momentum rather than fundamentals, making flow and turnover especially useful reads.",
 "LuxQuant's flow intensity and turnover tags help you see when DOGE activity is heating up, and sector rotation tracks the broader memecoin narrative it leads.",
 ], related: ["shib", "sol", "btc"] },
 { slug: "avax", symbol: "AVAX", name: "Avalanche", cg: "avalanche-2", category: "Layer 1",
 body: [
 "Avalanche (AVAX) is a fast Layer-1 using a subnet architecture for app-specific chains, with activity across DeFi, gaming, and institutional pilots.",
 "LuxQuant tracks AVAX among the Layer-1 majors in Money Flow, with on-chain and correlation context to frame ecosystem rotation.",
 ], related: ["sol", "near", "eth"] },
 { slug: "link", symbol: "LINK", name: "Chainlink", cg: "chainlink", category: "Oracle · DeFi infrastructure",
 body: [
 "Chainlink (LINK) is the leading decentralized oracle network, feeding real-world and cross-chain data into smart contracts across most major DeFi protocols. It's core infrastructure for the on-chain economy.",
 "On LuxQuant, LINK is tracked as a DeFi-infrastructure bellwether; its flow and correlation help gauge appetite for the broader DeFi and RWA narratives.",
 ], related: ["eth", "uni", "inj"] },
 { slug: "dot", symbol: "DOT", name: "Polkadot", cg: "polkadot", category: "Interoperability · Layer 0",
 body: [
 "Polkadot (DOT) is a multi-chain network connecting purpose-built parachains through a shared security layer, focused on interoperability.",
 "LuxQuant tracks DOT among interoperability majors, with money-flow and correlation context for rotation between ecosystems.",
 ], related: ["atom", "ada", "eth"] },
 { slug: "trx", symbol: "TRX", name: "TRON", cg: "tron", category: "Layer 1 · Stablecoin rails",
 body: [
 "TRON (TRX) is a high-throughput Layer-1 that carries a large share of stablecoin (especially USDT) transfer volume, giving it heavy real-world payment usage.",
 "LuxQuant monitors TRX on-chain flow and its role in stablecoin movement, a useful lens on sidelined-capital dynamics.",
 ], related: ["btc", "xrp", "eth"] },
 { slug: "matic", symbol: "POL", name: "Polygon", cg: "matic-network", category: "Layer 2 · Scaling",
 body: [
 "Polygon (POL, formerly MATIC) is a leading Ethereum scaling ecosystem spanning a PoS chain and zk-rollup tech, widely used for low-cost DeFi and enterprise deployments.",
 "On LuxQuant, Polygon activity is tracked within the Ethereum-scaling narrative, with flow and correlation context for L2 rotation.",
 ], related: ["arb", "op", "eth"] },
 { slug: "shib", symbol: "SHIB", name: "Shiba Inu", cg: "shiba-inu", category: "Memecoin",
 body: [
 "Shiba Inu (SHIB) is a major Ethereum-based memecoin that has expanded into its own ecosystem (including the Shibarium L2). Like other memecoins, it trades heavily on sentiment and turnover.",
 "LuxQuant's flow intensity and DEX pressure help you spot when SHIB activity spikes, within the broader memecoin sector rotation.",
 ], related: ["doge", "eth", "sol"] },
 { slug: "ltc", symbol: "LTC", name: "Litecoin", cg: "litecoin", category: "Payments",
 body: [
 "Litecoin (LTC) is one of the oldest cryptocurrencies, a Bitcoin-derived payments network valued for fast, low-cost transfers and deep liquidity.",
 "LuxQuant tracks LTC among payments majors with money-flow and correlation context.",
 ], related: ["btc", "xrp", "xlm"] },
 { slug: "uni", symbol: "UNI", name: "Uniswap", cg: "uniswap", category: "DeFi · DEX",
 body: [
 "Uniswap (UNI) is the governance token of the largest decentralized exchange, a cornerstone of on-chain liquidity and a bellwether for DeFi activity.",
 "On LuxQuant, DEX buy/sell pressure and DeFi rotation give context to UNI and the protocols it anchors.",
 ], related: ["link", "eth", "inj"] },
 { slug: "atom", symbol: "ATOM", name: "Cosmos", cg: "cosmos", category: "Interoperability",
 body: [
 "Cosmos (ATOM) is the hub asset of the Inter-Blockchain Communication (IBC) ecosystem, an 'internet of blockchains' of sovereign, interconnected app-chains.",
 "LuxQuant tracks ATOM among interoperability plays, with flow and correlation context for cross-ecosystem rotation.",
 ], related: ["dot", "inj", "eth"] },
 { slug: "xlm", symbol: "XLM", name: "Stellar", cg: "stellar", category: "Payments",
 body: [
 "Stellar (XLM) is a payments-focused network for fast, low-cost transfers and asset issuance, with a focus on financial inclusion and tokenized real-world assets.",
 "LuxQuant monitors XLM among payments majors, with money-flow and correlation context.",
 ], related: ["xrp", "ltc", "btc"] },
 { slug: "near", symbol: "NEAR", name: "NEAR Protocol", cg: "near", category: "Layer 1 · AI",
 body: [
 "NEAR is a scalable, developer-friendly Layer-1 increasingly positioned around AI and user-owned data, with a sharded architecture for throughput.",
 "On LuxQuant, NEAR is tracked within the L1 and AI narratives that often lead sector rotation.",
 ], related: ["sol", "avax", "render"] },
 { slug: "arb", symbol: "ARB", name: "Arbitrum", cg: "arbitrum", category: "Layer 2 · Ethereum scaling",
 body: [
 "Arbitrum (ARB) is a leading Ethereum optimistic rollup, one of the largest Layer-2s by activity and total value locked, hosting a deep DeFi ecosystem.",
 "LuxQuant tracks Arbitrum within the Ethereum-scaling narrative, with DEX flow and rotation context for L2s.",
 ], related: ["op", "eth", "matic"] },
 { slug: "op", symbol: "OP", name: "Optimism", cg: "optimism", category: "Layer 2 · Ethereum scaling",
 body: [
 "Optimism (OP) is a major Ethereum optimistic rollup and the coordinator of the OP Stack 'Superchain' powering multiple L2s.",
 "On LuxQuant, OP is tracked in the L2 narrative alongside Arbitrum and Polygon, with flow and correlation context.",
 ], related: ["arb", "eth", "matic"] },
 { slug: "inj", symbol: "INJ", name: "Injective", cg: "injective", category: "DeFi · Layer 1",
 body: [
 "Injective (INJ) is a finance-focused Layer-1 optimized for on-chain trading, derivatives, and RWA, with a deflationary token model.",
 "LuxQuant tracks INJ within the DeFi and RWA narratives, using flow and rotation to frame ecosystem strength.",
 ], related: ["link", "uni", "atom"] },
 { slug: "render", symbol: "RENDER", name: "Render", cg: "render-token", category: "DePIN · AI",
 body: [
 "Render (RENDER) is a decentralized GPU rendering network, a flagship of the DePIN and AI-compute narrative that connects idle hardware to demand.",
 "On LuxQuant, Render is tracked within the AI/DePIN sector, one of the narratives whose rotation the Money Flow board highlights.",
 ], related: ["near", "sol", "inj"] },
 { slug: "sui", symbol: "SUI", name: "Sui", cg: "sui", category: "Layer 1",
 body: [
 "Sui (SUI) is a high-performance Layer-1 using an object-centric model and the Move language, targeting fast, parallel execution for consumer and DeFi apps.",
 "LuxQuant tracks SUI among the newer high-performance L1s, with flow and correlation context for ecosystem rotation.",
 ], related: ["sol", "apt", "near"] },
 { slug: "apt", symbol: "APT", name: "Aptos", cg: "aptos", category: "Layer 1",
 body: [
 "Aptos (APT) is a Move-based Layer-1 focused on high throughput and low latency, emerging from the same lineage as Sui.",
 "On LuxQuant, APT is tracked alongside other high-performance L1s in Money Flow and sector rotation.",
 ], related: ["sui", "sol", "near"] },
];

export const getCoin = (slug) => COINS.find((c) => c.slug === slug) || null;
