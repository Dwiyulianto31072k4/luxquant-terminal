// Auth rescue state that survives refreshes and OAuth round-trips in this tab.
// sessionStorage is intentional: a failed provider may work in a new browser
// session, while losing the state during the current attempt hides the fallback
// exactly when the visitor needs it.

const FAILED_KEY = "lq_auth_failed_providers_v1";
const VALID_PROVIDERS = new Set(["telegram", "google", "discord"]);

export function getFailedAuthProviders() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(FAILED_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((provider) => VALID_PROVIDERS.has(provider)))];
  } catch {
    return [];
  }
}

export function markFailedAuthProvider(provider) {
  const current = getFailedAuthProviders();
  if (!VALID_PROVIDERS.has(provider) || current.includes(provider)) return current;
  const next = [...current, provider];
  try {
    sessionStorage.setItem(FAILED_KEY, JSON.stringify(next));
  } catch {
    /* in-memory state in LoginPage still works when storage is unavailable */
  }
  return next;
}

export function clearAuthRescueState() {
  try {
    sessionStorage.removeItem(FAILED_KEY);
  } catch {
    /* ignore */
  }
}

export function providerFromAuthError(code) {
  const prefix = String(code || "").split("_")[0];
  return VALID_PROVIDERS.has(prefix) ? prefix : null;
}
