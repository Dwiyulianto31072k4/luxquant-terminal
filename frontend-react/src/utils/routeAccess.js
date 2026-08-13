// src/utils/routeAccess.js
//
// Which app routes need a session, and which need a paid plan. Moved out of
// App.jsx so surfaces outside the app shell — the landing header's More menu,
// section CTAs — can tell a free route from a premium one instead of guessing.
// App.jsx remains the only place that enforces them.

const LOGIN_REQUIRED = [
  "/market-pulse",
  "/crypto-news",
  "/signals",
  "/terminal",
  "/analytics",
  "/performance",
  "/bitcoin",
  "/markets",
  "/watchlist",
  "/tips",
  "/admin",
  "/admin/workspace",
  "/ai-arena",
  "/ai-arena/v6",
  "/ai-arena/legacy",
  "/referral",
  "/orderbook",
  "/calendar",
  "/whale",
  "/money-flow",
  "/delistings",
  "/notifications",
  "/journal",
  "/onchain",
  "/autotrade",
  "/agent",
  "/portfolio",
  "/api-keys",
];

// Free accounts (login required, not premium) get habit-forming product value:
// · /signals — browse + full levels on calls older than 7d (backend PUBLIC_AFTER_DAYS)
// · /watchlist — personal list (API is login-only, no paywall)
// · /tips, /performance, /market-pulse, /crypto-news, /journal, /notifications
// · /bitcoin, /markets — public market data (Called overlay on Pulse stays VIP)
// Premium keeps the live moat: Terminal, Agent, AI Arena, orderbook, etc.
const PREMIUM_REQUIRED = [
  "/terminal",
  "/ai-arena",
  "/ai-arena/v6",
  "/ai-arena/legacy",
  "/orderbook",
  "/calendar",
  "/whale",
  "/money-flow",
  "/delistings",
  "/onchain",
  "/autotrade",
  "/agent",
  "/portfolio",
  "/api-keys",
];

export { LOGIN_REQUIRED, PREMIUM_REQUIRED };
