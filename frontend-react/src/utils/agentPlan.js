// Which plans include the Agent.
//
// Mirrors _plan_allows_bot in backend/app/api/routes/autotrade_auth.py. The
// backend is the authority — it is re-checked before every live entry, so a
// wrong answer here only ever produces a misleading page, never a trade. But a
// page that invites someone to configure a feature their plan cannot run is its
// own kind of broken, so the two are kept identical on purpose.
//
// THE TEST IS THE SPAN, NOT THE LABEL. `custom` is an admin-granted plan whose
// length is whatever was typed at the time: the one account holding it was
// granted 2026-07-18 to 2027-05-02 — 288 days, which is under a year, so it is
// refused. Reading the label alone would have let it through.
const YEAR_DAYS = 365;
const ALWAYS = ["yearly", "lifetime"];
const STAFF = ["admin", "co_admin", "founder"];

export const AGENT_PLAN_LABEL = "Annual or Lifetime";

const TIER_DISPLAY = {
  monthly: "Monthly",
  yearly: "Annual",
  lifetime: "Lifetime",
  custom: "Custom",
};

/** How many days this plan runs, or null when it never ends. */
export function planSpanDays(user) {
  const end = user?.subscription_expires_at;
  if (!end) return null;
  const start = user?.subscription_granted_at || user?.created_at;
  if (!start) return null;
  const days = (new Date(end) - new Date(start)) / 86400000;
  return Number.isFinite(days) ? Math.round(days) : null;
}

export function planAllowsAgent(user) {
  if (!user) return false;
  // Staff have to be able to reach the feature to support it.
  if (STAFF.includes(user.role)) return true;
  const tier = (user.subscription_tier || "").toLowerCase();
  if (ALWAYS.includes(tier)) return true;
  if (tier === "custom") {
    const span = planSpanDays(user);
    return span === null || span >= YEAR_DAYS;
  }
  return false;
}

/** What to call this person's plan when explaining the refusal. */
export function planName(user) {
  const tier = (user?.subscription_tier || "").toLowerCase();
  const label = TIER_DISPLAY[tier];
  if (!label) return user?.role && user.role !== "free" ? "Member" : "Free";
  if (tier === "custom") {
    const span = planSpanDays(user);
    return span === null ? "Custom" : `Custom (${span} days)`;
  }
  return label;
}

/** Why this plan cannot run the Agent — one sentence, shown to the user. */
export function planRefusalReason(user) {
  const tier = (user?.subscription_tier || "").toLowerCase();
  if (tier === "monthly")
    return "Monthly covers the terminal and the signal feed. Automated execution is not part of it.";
  if (tier === "custom") {
    const span = planSpanDays(user);
    return `This custom plan runs ${span} days, which is under a year. The Agent starts at twelve months of access.`;
  }
  return "The Agent is part of the paid plans that run for a year or more.";
}
