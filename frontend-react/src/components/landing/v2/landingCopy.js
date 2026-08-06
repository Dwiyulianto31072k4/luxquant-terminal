// Single source for landing marketing copy (hero, CTAs, free band).
// Keep short, concrete, honest about free vs premium.

export const HERO = {
  // Branding first — do not replace with soft "start free" messaging
  line1: "Algo-Backed Crypto Calls.",
  line2: "Plus The Full Terminal.",
  // Transparency + free/premium honesty — tease free breadth with "& more"
  sub:
    "Every call is timestamped — entry, targets, stops you can audit. Free tools (Pulse, News, track record & more). Premium unlocks live levels and the full terminal. Running since 2023.",
};

export const CTA = {
  // Hero pill — secondary to branding, still clear CTA
  pill: "Access LuxQuant Terminal",
  pillShort: "Start free",
  openApp: "Open app",
  // One primary verb across sticky / gate / free / section CTAs
  primaryGuest: "Create free account",
  primaryAuthed: "Open free features",
  stickyTitle: "Start free · no card",
  stickySub: "Pulse, track record & more",
  stickyBtn: "Start free",
  logIn: "Log In",
  // Header keeps Start Free; hero stays brand-led
  signUp: "Start Free",
  openAppHeader: "Open App",
  // Soft gate — proof-led FOMO, honest free vs premium
  gateEyebrow: "We called it",
  gateTitle: (coin, gainPct) => {
    const g =
      gainPct != null && Number.isFinite(Number(gainPct)) && Number(gainPct) > 0
        ? `+${Math.round(Number(gainPct))}%`
        : null;
    if (coin && g) return `Like ${coin}? We called ${g}.`;
    if (coin) return `Like ${coin}? We called the move.`;
    return "Like this call? We flagged it first.";
  },
  gateBody:
    "Wanna profit on the next one? Free account: Pulse, News, track record & watchlist. Live signal levels stay Premium.",
  gatePrimary: "Create free account",
  // Shown after proof modal closes — not stacked on the chart
  gateSecondary: "Maybe later",
  // Free tier section
  freeEyebrow: "Free features · no card",
  freeTitleLead: "Real free tools —",
  freeTitleGold: "not just a teaser.",
  freeBody:
    "Free account: Market Pulse, News, Performance, watchlist, tips & verified track record. Premium when you want live levels, Terminal & Agent.",
  freePrimary: "Create free account",
  freePrimaryAuthed: "Open free features",
  freePremiumNote: "Upgrade later for live signal levels — free tools stay free.",
  freeChannelTitle: "Free features + free channel",
  freeChannelBody:
    "Free account = Pulse, News, Performance, watchlist & more in the app. Telegram = public samples. Best results: use both.",
  freeChannelCta: "Join free channel",
  // Top gainers footer CTA
  gainersCtaGuest: "Create free account",
  gainersCtaAuth: "See full track record",
};

export const MARQUEE = {
  title: "Real calls. Real peaks.",
  body:
    "Every card is a dated LuxQuant call — close level and peak time — so you can audit it on any chart.",
};

export const SEO = {
  title: "LuxQuant — Verified Crypto Calls & Free Market Tools",
  description:
    "Audit every crypto call with timestamped entries and peaks. Free: Market Pulse, News, Performance, track record & more. Premium: live levels and the full terminal.",
  keywords:
    "luxquant, crypto signals, verified track record, market pulse, crypto terminal, free crypto tools",
};
