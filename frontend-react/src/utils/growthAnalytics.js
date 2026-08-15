// Authenticated product and checkout milestones.
//
// This complements (does not replace) funnelAnalytics:
//   funnelAnalytics  = anonymous landing/auth sessions
//   growthAnalytics  = user-linked intent milestones after login
//
// Fire-and-forget and fail-open: measurement must never block product UX.

const FUNNEL_SESSION_KEY = "lq_funnel_sid";
const GROWTH_SESSION_KEY = "lq_growth_sid";
const ONCE_PREFIX = "lq_growth_once:";

const ALLOWED = new Set([
  "proof_verified",
  "pricing_viewed",
  "plan_selected",
  "checkout_viewed",
  "wallet_address_copied",
  "payment_amount_copied",
  "transaction_submitted",
  "telegram_write_access_shown",
  "telegram_write_access_allowed",
  "telegram_write_access_cancelled",
]);

function randomId(prefix = "g") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sessionId() {
  try {
    const funnelId = sessionStorage.getItem(FUNNEL_SESSION_KEY);
    if (funnelId) return funnelId;
    let id = sessionStorage.getItem(GROWTH_SESSION_KEY);
    if (!id) {
      id = randomId("s");
      sessionStorage.setItem(GROWTH_SESSION_KEY, id);
    }
    return id;
  } catch {
    return randomId("s");
  }
}

function alreadyTracked(key) {
  if (!key) return false;
  try {
    const storageKey = `${ONCE_PREFIX}${key}`;
    if (sessionStorage.getItem(storageKey)) return true;
    sessionStorage.setItem(storageKey, "1");
  } catch {
    // If storage is unavailable, send the event; event_id still protects an
    // individual request from accidental transport retries.
  }
  return false;
}

/**
 * @param {string} event
 * @param {{source?: string, path?: string, entity_type?: string,
 *   entity_id?: string|number, meta?: object, once?: string}} props
 */
export function trackGrowth(event, props = {}) {
  if (!ALLOWED.has(event) || typeof window === "undefined") return;
  const token = localStorage.getItem("access_token");
  if (!token || alreadyTracked(props.once)) return;

  const payload = {
    event,
    event_id: randomId(),
    session_id: sessionId(),
    source: props.source || null,
    path: props.path || window.location.pathname,
    entity_type: props.entity_type || null,
    entity_id: props.entity_id == null ? null : String(props.entity_id),
    meta: props.meta || null,
  };

  try {
    fetch("/api/v1/growth/event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
