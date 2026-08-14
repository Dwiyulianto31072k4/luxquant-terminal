// Shared landing FAQ — UI (FaqV2) + FAQPage schema + prerender.
// Answers stay inside the product: no invented stats, no "members made money",
// no 24/7 support, no scarcity. Extra fields (tag, lead, link) are UI-only.

export function faqText(item) {
  return [item.lead, item.a].filter(Boolean).join(" ");
}

export const LANDING_FAQ = [
  {
    tag: "free",
    q: "What's free, and what do I actually pay for?",
    lead: "A free account needs no card.",
    a: "You get Market Pulse, News, Performance, a journal, a watchlist, tips, and the full entry / TP / SL on any call older than seven days. Premium is for live levels on new calls, the Terminal, Agent, on-chain, money flow, and AI research. The public Telegram channel stays free either way.",
    link: { href: "#free-features", label: "See what's included" },
  },
  {
    tag: "record",
    q: "Can I verify the track record before I sign up?",
    lead: "Yes. The book on this page is the book.",
    a: "Performance is public: timestamped calls, the exit mix, and how the sample behaved across years — not a private ledger we keep off-site. A free login unlocks more of the same record, including average P/L at TP1–TP3. If it is not in the public sample, we do not claim it.",
    link: { href: "#performance", label: "Open the public record" },
  },
  {
    tag: "record",
    q: "What does the win rate on this page actually mean?",
    lead: "It means the call reached at least its first target.",
    a: "The figure labeled “Reached a Target” is the share of resolved calls that touched TP1. A call that tagged TP1 and later hit the stop is still a TP1 win. It is not “members made money,” and it is not a forecast for your next trade. Stopped-out calls stay in the mix you can audit.",
  },
  {
    tag: "record",
    q: "Do you hide losing calls?",
    lead: "No. Every published call stays on the book.",
    a: "Performance shows the stop-loss bucket next to TP1–TP4. We do not quietly delete losers or keep a second, prettier history.",
    link: { href: "#performance", label: "See winners and stops together" },
  },
  {
    tag: "risk",
    q: "Is this a Telegram pump group?",
    lead: "No. A call is a written plan, not a hype blast.",
    a: "Each one publishes an entry, TP1–TP4, and a hard stop, with a public audit trail. There is no countdown and no “last spots.” Telegram is optional — most accounts use the web terminal without linking it.",
    link: { href: "#how-it-works", label: "How a call is produced" },
  },
  {
    tag: "risk",
    q: "How does a call work — and what if it stops out?",
    lead: "You see the levels before you size.",
    a: "Entry, four take-profits, and a fixed stop. Staged TPs let you bank early and still leave room for a larger run. When a call hits the stop, that outcome is recorded with everything else. Losses are part of the sample, not an exception we explain away.",
  },
  {
    tag: "free",
    q: "Do I need to watch the charts all day?",
    lead: "No. The engine runs continuously.",
    a: "Alerts land in the app, and on Telegram if you choose to link it. You act on levels that are already written — you do not have to invent them at 3am.",
  },
  {
    tag: "agent",
    q: "Can Agent trade for me? Who holds the funds?",
    lead: "Agent is optional, premium, and it never holds your money.",
    a: "It places on your exchange with keys you issue. Use withdraw-disabled keys, set size and position caps, and leave new configs in dry-run until you have watched them. You stay on/off control. Automation removes clicks. It does not remove market risk.",
  },
  {
    tag: "risk",
    q: "I'm new. Will I know what to do?",
    lead: "On the mechanics, yes: every call ships the full plan.",
    a: "Start on the free tier, size so one stop does not end the account, and treat the SL as part of the plan. This is a process you can audit — not a promise of easy money.",
  },
  {
    tag: "free",
    q: "How do I start without paying?",
    lead: "Create a free account. Google, Telegram, or Discord.",
    a: "Open Performance, browse Pulse and News, and inspect older calls. Upgrade later only if you want live levels, the Terminal, or Agent.",
  },
];

export const FAQ_TAGS = [
  { id: "all", label: "All" },
  { id: "free", label: "Free vs paid" },
  { id: "record", label: "Track record" },
  { id: "risk", label: "Risk" },
  { id: "agent", label: "Agent" },
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
        text: faqText(item),
      },
    })),
  };
}
