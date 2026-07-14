// Shared landing FAQ — single source for UI (FaqV2) + FAQPage schema + prerender.
// Keep answers factual; do not invent performance claims beyond public track-record messaging.

export const LANDING_FAQ = [
  {
    q: "Is it suitable for beginners?",
    a: "Absolutely. Every signal ships with the full plan — exact entry, multiple profit targets (TP1–TP4) and a strict stop-loss (SL) — so you always know precisely what to do, even on day one.",
  },
  {
    q: "What is the recommended starting capital?",
    a: "There is no strict minimum, but we recommend starting with at least $100–$500 so you can size positions sensibly and keep risk per trade under control.",
  },
  {
    q: "What happens if the algorithm makes a wrong prediction (loss)?",
    a: "Trading always carries risk. That's why every single signal includes a strict Stop-Loss level to cap the downside — losses are small and pre-defined, and the edge plays out over the full sample.",
  },
  {
    q: "Do I need to monitor the screen 24/7?",
    a: "Not at all. The system runs 24/7 and pushes real-time alerts straight to your Telegram and dashboard, so you only act when there's something to act on.",
  },
  {
    q: "How is the track record verified?",
    a: "Every call is recorded and timestamped from day one — no hidden trades, no cherry-picking. You can audit win rate, peak gains and time-to-target across the entire history on the Performance page.",
  },
  {
    q: "Is there a free tier?",
    a: "Yes. LuxQuant Terminal has a free tier to explore the product. Premium plans unlock full algorithmic signals, AutoTrade, on-chain intelligence, and AI research. See pricing for current plans.",
  },
  {
    q: "What is LuxQuant Terminal?",
    a: "LuxQuant Terminal is a quantitative crypto market-intelligence platform: algorithmic signals with a transparent track record, money-flow and sector rotation, on-chain whale context, risk scoring, and AI research — so you can trade informed by data.",
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
