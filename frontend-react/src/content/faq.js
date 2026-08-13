// Shared landing FAQ — single source for UI (FaqV2) + FAQPage schema + prerender.
// Answers = product reasoning + transparent risk framing. No invented stats.
// Agent is optional assistance — dry-run first, not set-and-forget.

export const LANDING_FAQ = [
  {
    q: "What is LuxQuant Terminal?",
    a: "LuxQuant Terminal is a crypto market-intelligence desk built around algorithmic trade calls with a public, timestamped track record. Around that spine you also get money-flow and sector context, on-chain views, risk scoring, and AI research — so a decision can start from a written plan, not a hype thread. Explore the free tools, then unlock live levels, the full terminal, and optional Agent assistance when you are ready.",
  },
  {
    q: "How does the LuxQuant algorithm reason about a trade?",
    a: "Each call is a structured plan, not a random tip. The engine scores structure, momentum, and risk context, then publishes a clear entry, multi-step take-profits (TP1–TP4), and a hard stop-loss (SL). You always see the thesis levels before you act — on the dashboard, in proof charts, and in your alerts.",
  },
  {
    q: "Why multiple take-profits instead of one target?",
    a: "Markets rarely move in a straight line. Staged TPs let a winner pay something early while still leaving room for a larger run (including TP4+ peaks you can audit on Performance). The SL stays fixed so downside is pre-defined. That is risk design — not a promise that results will compound.",
  },
  {
    q: "Is it suitable for beginners?",
    a: "The plan is written for you — exact entry, TP1–TP4, and SL — so you are not inventing levels on day one. That does not make this beginner-safe. Crypto, especially futures and leverage, can lose money quickly. Start on the free track record, size small, and do not turn Agent live until you have watched it in dry-run.",
  },
  {
    q: "What is the recommended starting capital?",
    a: "There is no required minimum. Size so that a full stop-out is money you can lose — one risk unit per trade, not the whole account. If a stopped-out call would hurt, you are too large. Process first. Agent is optional and should stay in dry-run until you have watched it skip, fill, and pause.",
  },
  {
    q: "What happens when a call hits stop-loss?",
    a: "Losses are part of trading. Every signal includes a strict SL so the downside is known before you enter. We do not hide stopped-out trades: Performance shows winners and losers together so you can judge the sample on the full history, not cherry-picked highlights.",
  },
  {
    q: "Do I need to watch charts 24/7?",
    a: "No. Calls are published with levels already defined, and alerts can go to Telegram and the terminal when something needs attention. That is not the same as leaving live execution unsupervised. If Agent is LIVE, pause it when you cannot check it.",
  },
  {
    q: "How is the track record verified?",
    a: "Calls are recorded and timestamped from day one — no hidden book, no silent deletes. On the landing Performance section and inside the app you can audit how often a call reached a target, the exit mix (TP1–TP4 / SL), share of outcomes, and behavior across market regimes. If it is not in the public sample, we do not claim it.",
  },
  {
    q: "What does “share” mean on Where Winners Exit?",
    a: "Share is the percentage of all closed trades that exited at that bucket (TP1, TP2, TP3, TP4+, or SL). It shows how often the plan paid at each step versus how often it stopped out — essential for understanding risk and expectancy, not just a single win-rate number.",
  },
  {
    q: "Can LuxQuant auto-execute trades for me?",
    a: "Optionally. Agent is an assistant, not a managed account. It can place orders on your exchange when a signal matches the rules you saved — size, max positions, cooldowns, spot or futures. Withdraw permission is never requested. One venue at a time. Start in dry-run. Pause it when you cannot supervise. A skip is not a bug; a fill is not a gift.",
  },
  {
    q: "Is Agent safe for my funds?",
    a: "You trade on your own exchange account with keys you control. Use withdraw-disabled keys, set conservative notional and position caps, and check IP and permissions carefully. Agent does not remove market risk, slippage, liquidations, or exchange failures. It is not set-and-forget. Always size for survival first.",
  },
  {
    q: "What else is inside the Terminal besides signals?",
    a: "Beyond calls you get money-flow and sector tools, on-chain context, market pulse views, risk-aware analytics, and AI research workflows — one workspace so you are not juggling three apps to form a view. Signals are the spine; the rest is situational awareness.",
  },
  {
    q: "Is there a free tier?",
    a: "Yes. A free account opens Market Pulse, News, Performance, watchlist, tips, and the verified track record — no card. Upgrade when you want live signal levels, the full terminal, and optional Agent assistance. Free tools stay free after you upgrade.",
  },
  {
    q: "Who is LuxQuant built for?",
    a: "Traders and investors who want a written plan, an audit trail, and tools that explain market context — not hype threads. If you value transparent performance and plan-based risk over “trust me” calls, you are the audience.",
  },
  {
    q: "How do I get started in under five minutes?",
    a: "Open the app (or sign up with Google), scan the latest calls and the Performance record, optionally link Telegram alerts, then follow a published entry / TP / SL at a size you can lose. If you want execution help later, connect exchange keys and keep Agent in dry-run until you have watched it. Do not leave it LIVE unsupervised.",
  },
];

/** JSON-LD FAQPage block for homepage / prerender */
export function landingFaqJsonLd(site = "https://luxquant.tw") {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${site}/#faq`,
    mainEntity: LANDING_FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}
