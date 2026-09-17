// Which plans include the Agent.
//
// Mirrors BOT_TIERS in backend/app/api/routes/autotrade_auth.py. The backend is
// the authority — it is re-checked before every live entry, so a wrong answer
// here only ever produces a misleading page, never a trade. But a page that
// invites someone to configure a feature their plan cannot run is its own kind
// of broken, so the two lists are kept identical on purpose. Change one, change
// the other.
//
// `custom` is included for the same reason it is on the backend: it is an
// admin-granted bespoke plan, and the one account holding it runs twenty
// months. `monthly` is deliberately out.
export const AGENT_TIERS = ["yearly", "lifetime", "custom"];

/** The label used everywhere this is explained to a user. */
export const AGENT_PLAN_LABEL = "Annual or Lifetime";

export function planAllowsAgent(user) {
  if (!user) return false;
  // Staff have to be able to reach the feature to support it.
  if (user.role === "admin" || user.role === "co_admin" || user.role === "founder") return true;
  return AGENT_TIERS.includes(user.subscription_tier || "");
}
