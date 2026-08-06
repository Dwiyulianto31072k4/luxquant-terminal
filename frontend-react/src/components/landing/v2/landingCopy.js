// Single source for landing marketing copy (hero, CTAs, free band).
// Keep short, concrete, honest about free vs premium.

export const HERO = {
  // Two short lines — sales-friendly, not "enterprise jargon wall"
  line1: "Crypto calls you can verify.",
  line2: "Start free. Go deeper when ready.",
  // Supporting line under the headline
  sub:
    "Timestamped entries, targets & stops — plus free tools (Pulse, News, track record). Premium unlocks live levels and the full terminal.",
};

export const CTA = {
  // Hero pill primary label (desktop)
  pill: "Start free — no card needed",
  // Hero pill compact (mobile)
  pillShort: "Start free",
  // Authenticated
  openApp: "Open app",
  // Sticky bar
  stickyTitle: "Free features · no card",
  stickySub: "Pulse, track record & more · 30s",
  stickyBtn: "Continue",
  // Header
  logIn: "Log In",
  signUp: "Start free",
  openAppHeader: "Open App",
  // Soft gate
  gateEyebrow: "Free features",
  gateTitle: (coin) => (coin ? `Like ${coin}? Create a free account` : "Create a free account"),
  gateBody:
    "Keep viewing charts. Free tools: Market Pulse, News, Performance, watchlist & more. Live signal levels stay Premium.",
  gatePrimary: "Create free account",
  gateSecondary: "Keep viewing chart",
  // Free tier section
  freeEyebrow: "Free features · no card",
  freeTitleLead: "Real free tools —",
  freeTitleGold: "not just a teaser.",
  freeBody:
    "Free account: Market Pulse, News, Performance, watchlist, tips & verified track record. Premium: live levels, Terminal & Agent.",
  freePrimary: "Create free account",
  freePrimaryAuthed: "Open free features",
  freeChannelTitle: "Free features + free channel",
  freeChannelBody:
    "Free account = Pulse, News, Performance, watchlist & more in the app. Telegram = public samples. Best results: use both.",
  freeChannelCta: "Join free channel",
  // Top gainers footer CTA
  gainersCtaGuest: "Free features · create account",
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
    "Audit every crypto call with timestamped entries and peaks. Free: Market Pulse, News, Performance & track record. Premium: live levels and the full terminal.",
  keywords:
    "luxquant, crypto signals, verified track record, market pulse, crypto terminal, free crypto tools",
};
