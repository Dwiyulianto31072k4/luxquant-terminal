// Preserve intended destination across /login and OAuth redirects.
// sessionStorage survives same-tab Google/Discord round-trips; localStorage
// is a fallback for some in-app browsers that drop sessionStorage on leave.

const KEY = "lq_post_login_redirect";
const BLOCKED = ["/login", "/register", "/auth/", "/google", "/discord"];

function isSafePath(path) {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  return !BLOCKED.some((p) => path === p || path.startsWith(p));
}

function write(path) {
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* private mode */
  }
  try {
    localStorage.setItem(KEY, path);
  } catch {
    /* ignore */
  }
}

function read() {
  try {
    const s = sessionStorage.getItem(KEY);
    if (s) return s;
  } catch {
    /* ignore */
  }
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function clear() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Remember where the user wanted to go before auth. */
export function stashPostLoginRedirect(path) {
  if (!isSafePath(path)) return;
  write(path);
}

/** Read without clearing (e.g. LoginPage mount). */
export function peekPostLoginRedirect() {
  const path = read();
  return isSafePath(path) ? path : null;
}

/** Consume redirect once after successful auth. */
export function consumePostLoginRedirect(fallback = "/home") {
  const path = peekPostLoginRedirect();
  clear();
  return path || fallback;
}

/**
 * Build /login URL and stash redirect.
 * @param {string|null} redirect
 * @param {{ source?: string }} [opts]
 */
export function loginUrl(redirect = null, opts = {}) {
  if (redirect) stashPostLoginRedirect(redirect);
  const q = new URLSearchParams();
  if (redirect && isSafePath(redirect)) q.set("redirect", redirect);
  if (opts.source) q.set("src", opts.source);
  const qs = q.toString();
  return qs ? `/login?${qs}` : "/login";
}
