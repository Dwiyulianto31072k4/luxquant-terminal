// Single source for landing marketing copy (hero, CTAs, free band, SEO, risk).
// Keep short, concrete, honest about free vs premium.
// Agent is optional assistance — never a profit product or set-and-forget bot.

/** Post-login destinations that match what the button just promised. */
export const DEST = {
  /** First free tool sold on the page. Login required, not premium. */
  free: "/market-pulse",
  /** Public track record. Login required, not premium. */
  record: "/performance",
};

export const HERO = {
  line1: "Algo-Backed Crypto Calls.",
  line2: "A Track Record You Can Audit.",
  sub:
    "Every call is timestamped — entry, targets, and a stop you can check. Free tools: Pulse, News, Performance, and the public record. Premium unlocks live levels, the full terminal, and optional Agent assistance. Running since 2023.",
};

export const CTA = {
  pill: "Start free — no card",
  pillShort: "Start free",
  openApp: "Open app",
  openTerminal: "Open Terminal",
  seePlans: "See plans & pricing",
  primaryGuest: "Create free account",
  primaryAuthed: "Open free features",
  stickyTitle: "Start free · no card",
  stickySub: "Pulse, track record, and more",
  stickyBtn: "Start free",
  logIn: "Log In",
  signUp: "Start Free",
  openAppHeader: "Open App",
  gateEyebrow: "On the record",
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
    "Want this call — and the next ones — on a record you can check? A free account opens Pulse, News, the track record, and your watchlist. Live signal levels stay Premium.",
  gatePrimary: "Create free account",
  gateSecondary: "Maybe later",
  freeEyebrow: "Free features · no card",
  freeTitleLead: "Real free tools —",
  freeTitleGold: "not just a teaser.",
  freeBody:
    "Free account: Market Pulse, News, Performance, watchlist, tips, and the verified track record. Premium when you want live levels, the full terminal, and optional Agent assistance.",
  freePrimary: "Create free account",
  freePrimaryAuthed: "Open free features",
  freePremiumNote:
    "Upgrade later for live signal levels — free tools stay free. Agent is optional assistance, not a managed account.",
  freeChannelTitle: "Free features + public Telegram samples",
  freeChannelBody:
    "Free account = Pulse, News, Performance, watchlist, and more in the app. Telegram = public samples, not the full live book. Best results: use both.",
  freeChannelCta: "Join sample channel",
  gainersCtaGuest: "See the full record — free",
  gainersCtaAuth: "See full track record",
};

export const MARQUEE = {
  title: "Real calls. Real peaks.",
  body:
    "Every card is a dated LuxQuant call — close level and peak time — so you can audit it on any chart. A peak is not the same as realized P&L.",
};

export const SEO = {
  title: "LuxQuant — Algo-Backed Crypto Calls You Can Audit",
  description:
    "Timestamped crypto calls with entry, targets, and stops you can check. Free: Market Pulse, News, Performance, and the public track record. Premium: live levels, the full terminal, and optional Agent assistance.",
  keywords:
    "luxquant, crypto signals, verified track record, market pulse, crypto terminal, free crypto tools",
};

export const RISK = {
  footer:
    "Trading involves risk of loss. Past results are not future returns. Agent is optional assistance on your own exchange — not a managed account, and not a promise of profit.",
};

export const FOOTER = {
  blurb:
    "Market intelligence for crypto — timestamped calls, context, and research in one terminal.",
};

export const ARCH = {
  eyebrow: "How LuxQuant thinks",
  titleLead: "From market noise to a decision",
  titleGold: "you can verify.",
  body:
    "A live scoring network turns fragmented market data into risk-defined calls — then keeps every published decision on the public record.",
  foot:
    "Observe the market, drop stale data, and define entry, targets, and exit before publication — then deliver the call and keep its proof.",
  coreTitle: "Scoring & decision engine",
  coreTitleShort: "Scoring & decision",
  coreStatus: "LIVE SCORING",
  agentMeta: "Optional assistance",
};

export const TERMINAL = {
  eyebrow: "The terminal",
  titleLead: "One desk.",
  titleGold: "Every tool that matters.",
  body:
    "Real product screens — switch a module and see the workspace. Free tools open first; live levels and optional Agent assistance when you upgrade.",
  agentShort: "Assistance under your limits",
  agentDesc:
    "Connect your keys and Agent can follow a published plan under the size, caps, and cooldowns you set. Start in dry-run. Not set-and-forget.",
  moreNote: "Free tools open first. Live levels and optional Agent assistance when you upgrade.",
};

export const PERF = {
  eyebrow: "Verified track record",
  titleAfter: "of closed calls reached a target.",
  sub:
    "Every resolved call on record since day one — no hidden trades, no cherry-picking. Reached a target means TP1 before the stop.",
  edgeEyebrow: "Where the historical edge sits",
  actualCap: "on the public record",
};

export const GLOBAL = {
  eyebrow: "On the record",
  titleLead: "Every call above",
  titleGold: "is timestamped.",
  close:
    "Every marker is a published call. A free account opens Pulse, News, and the full track record — no card.",
};

export const FAQ_INTRO = {
  eyebrow: "Questions, answered",
  titleLead: "Still wondering how it",
  titleGold: "really works?",
  body:
    "Algorithm, risk, track record, free tier, Agent — straight answers so you can verify before you size up.",
};
