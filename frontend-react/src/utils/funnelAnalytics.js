// Client funnel tracker for landing → login conversion.
// Fire-and-forget: local ring buffer + optional beacon to backend.
// Never blocks UI; fails open.

const LS_SESSION = "lq_funnel_sid";
const LS_RING = "lq_funnel_ring_v1";
const RING_MAX = 80;

const ALLOWED = new Set([
  "landing_view",
  "cta_click",
  // Impressions. The backend has allowed these since the funnel was built, but
  // this list never did, so `trackFunnel` dropped them before the request was
  // ever made — StickyLandingCta has been firing cta_shown into a void.
  //
  // Without them the top of the funnel has no denominator: 81% of landing
  // sessions click nothing, and there is no way to tell someone who never saw
  // a CTA from someone who saw it and was not convinced. Those need opposite
  // fixes, so the gap has to close before anything is changed on the page.
  "cta_shown",
  "cta_dismiss",
  "soft_gate_shown",
  "soft_gate_login_click",
  "auth_page_view",
  "auth_start",
  "auth_success",
  "auth_error",
  "post_login_land",
  "acq_land",
  "auth_popup_blocked",
  "auth_abandoned",
  "auth_fallback_offered",
  "auth_fallback_taken",
]);

function sessionId() {
  try {
    let id = sessionStorage.getItem(LS_SESSION);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(LS_SESSION, id);
    }
    return id;
  } catch {
    return `s_${Date.now().toString(36)}`;
  }
}

function pushLocal(payload) {
  try {
    const raw = localStorage.getItem(LS_RING);
    const arr = raw ? JSON.parse(raw) : [];
    arr.push(payload);
    while (arr.length > RING_MAX) arr.shift();
    localStorage.setItem(LS_RING, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} event
 * @param {{ source?: string, path?: string, provider?: string, meta?: object }} [props]
 */
export function trackFunnel(event, props = {}) {
  if (!ALLOWED.has(event)) return;

  const payload = {
    event,
    source: props.source || null,
    path: props.path || (typeof window !== "undefined" ? window.location.pathname : null),
    provider: props.provider || null,
    session_id: sessionId(),
    meta: props.meta || null,
    ts: new Date().toISOString(),
  };

  pushLocal(payload);

  // Beacon when possible so navigations (OAuth leave) still send.
  try {
    const body = JSON.stringify(payload);
    const url = "/api/v1/funnel/event";
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
    }
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Read local ring (debug / admin diagnostics). */
export function getLocalFunnelRing() {
  try {
    return JSON.parse(localStorage.getItem(LS_RING) || "[]");
  } catch {
    return [];
  }
}
