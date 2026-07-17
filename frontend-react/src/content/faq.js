// Shared landing FAQ — single source for UI (FaqV2) + FAQPage schema + prerender.
// Answers = product reasoning + transparent risk framing + soft sell (no invented stats).

export const LANDING_FAQ = [
 {
 q: "What is LuxQuant Terminal?",
 a: "LuxQuant Terminal is a quantitative crypto market-intelligence platform: algorithmic trade calls with a public, timestamped track record, money-flow and sector context, on-chain whale signals, risk scoring, and AI research — so decisions start from data, not noise. Explore the free tier, then unlock full signals and AutoTrade when you are ready.",
 },
 {
 q: "How does the LuxQuant algorithm reason about a trade?",
 a: "Each call is a structured plan, not a random tip. The engine scores structure, momentum, and risk context, then publishes a clear entry, multi-step take-profits (TP1–TP4), and a hard stop-loss (SL). You always see the thesis levels before you act — on the dashboard, in proof charts, and in your alerts.",
 },
 {
 q: "Why multiple take-profits instead of one target?",
 a: "Markets rarely move in a straight line. Staged TPs let winners pay you early while still leaving room for larger runs (including TP4+ peaks you can audit on Performance). The SL stays fixed so downside is capped and pre-defined — that is how the edge is designed to compound over the full sample.",
 },
 {
 q: "Is it suitable for beginners?",
 a: "Yes. Every signal ships with the full plan — exact entry, TP1–TP4, and SL — so you know what to do on day one without inventing your own levels. Start small on the free tier, learn the workflow, then size up only when the process feels natural.",
 },
 {
 q: "What is the recommended starting capital?",
 a: "There is no hard minimum, but many members start around $100–$500 so they can size positions sensibly and keep risk per trade under control. Quality of process beats size of account — LuxQuant is built for disciplined, plan-based execution.",
 },
 {
 q: "What happens when a call hits stop-loss?",
 a: "Losses are part of trading. Every signal includes a strict SL so the downside is known before you enter. We do not hide stopped-out trades: Performance shows winners and losers together so you can judge the edge on the full history, not cherry-picked highlights.",
 },
 {
 q: "Do I need to watch charts 24/7?",
 a: "No. The system runs continuously and pushes alerts to Telegram and the terminal when something needs attention. You act on a plan with levels already defined — not glued to the screen.",
 },
 {
 q: "How is the track record verified?",
 a: "Calls are recorded and timestamped from day one — no hidden book, no silent deletes. On the landing Performance section and inside the app you can audit win rate, exit mix (TP1–TP4 / SL), share of outcomes, and behavior across market regimes. If it is not in the public sample, we do not claim it.",
 },
 {
 q: "What does “share” mean on Where Winners Exit?",
 a: "Share is the percentage of all closed trades that exited at that bucket (TP1, TP2, TP3, TP4+, or SL). It shows how often the plan paid at each step versus how often it stopped out — essential for understanding risk and expectancy, not just win rate alone.",
 },
 {
 q: "Can LuxQuant auto-execute trades for me?",
 a: "Yes. AutoTrade can connect your exchange API keys and follow signal plans under your risk limits (size, max positions, cooldowns). You stay in control of keys, sizing, and on/off — LuxQuant supplies the plan and the automation layer. Start in dry-run if you want to observe first.",
 },
 {
 q: "Is AutoTrade safe for my funds?",
 a: "You trade on your own exchange account with keys you control. Use withdraw-disabled keys where the exchange allows it, set conservative notional and position caps, and validate IP/permissions carefully. Automation removes clicks — it does not remove market risk. Always size for survival first.",
 },
 {
 q: "What else is inside the Terminal besides signals?",
 a: "Beyond calls you get money-flow and sector tools, on-chain / whale context, market pulse views, risk-aware analytics, and AI research workflows — one workspace so you are not juggling three apps to form a view. Signals are the spine; the rest is situational awareness.",
 },
 {
 q: "Is there a free tier?",
 a: "Yes. Explore the product free, then upgrade when you want full algorithmic signals, AutoTrade, deeper on-chain intelligence, and AI research. Pricing is transparent — start light, scale only when the process is earning your trust.",
 },
 {
 q: "Who is LuxQuant built for?",
 a: "Traders and investors who want a quant-style process: written levels, audit trail, and tools that explain market context — not hype threads. If you value transparent performance and plan-based risk over “trust me” calls, you are the audience.",
 },
 {
 q: "How do I get started in under five minutes?",
 a: "Open the app (or Sign Up with Google), scan the latest calls and Performance proof, optionally link Telegram alerts, then paper-trade or size a small live position with the published entry/TP/SL. When you want hands-off execution, connect exchange keys and enable AutoTrade with tight limits.",
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
