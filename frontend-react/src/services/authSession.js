// src/services/authSession.js
// ════════════════════════════════════════════════════════════════
// One session-refresh path for the whole app.
//
// Access tokens live 24 h, refresh tokens 7 days. Before this module only the
// authApi axios instance knew how to refresh: the /api/v1 axios instance just
// deleted the access token on a 401, and the ~30 files that call `fetch`
// directly never refreshed at all. A tab left open past the 24 h mark kept
// polling with a dead token — screener every few minutes, the admin growth
// panels seven at a time — each one a 401, until something that happened to
// go through authApi refreshed the token by accident.
//
// Now every caller shares ONE in-flight refresh:
//   • both axios instances install `attachAuthRefresh`
//   • `installFetchAuthRefresh` wraps window.fetch for our own /api/ paths
// A 401 on a request that carried our bearer token refreshes once and retries
// once. Only a refresh the server itself rejects (or no refresh token at all)
// ends the session — a timeout or 5xx on the refresh call keeps it, exactly as
// authApi always did. Ending the session clears the tokens and fires
// SESSION_EXPIRED_EVENT; AuthContext logs out and RequireAuth sends the user to
// /login?redirect=… instead of the hard reload to a bare /login it used to be.
// ════════════════════════════════════════════════════════════════

export const SESSION_EXPIRED_EVENT = "lq:session-expired";

const API_URL = import.meta.env?.VITE_API_URL || "";
const REFRESH_PATH = "/api/v1/auth/refresh";

// Sign-in, sign-out and refresh answer 401 for their own reasons; retrying
// them with a refreshed token is meaningless (and /refresh would recurse).
// /auth/me and friends are ordinary authenticated reads and stay eligible.
const NEVER_RETRY = /^\/api\/v1\/auth\/(refresh|logout|google|telegram(?:\/webapp)?$|discord)/;

let nativeFetch = null;
let inflight = null;

const store = () => globalThis.localStorage;

const baseFetch = (...args) => (nativeFetch || globalThis.fetch)(...args);

function authError(message, { status = 0, authFailure = false, cause } = {}) {
  const err = new Error(message);
  err.status = status;
  err.authFailure = authFailure;
  if (cause) err.cause = cause;
  return err;
}

/** True when the refresh failed because the session is really over. */
export const isAuthFailure = (err) => Boolean(err && err.authFailure);

async function runRefresh() {
  const sent = store().getItem("refresh_token");
  if (!sent) throw authError("no_refresh_token", { authFailure: true });

  let res;
  try {
    res = await baseFetch(`${API_URL}${REFRESH_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: sent }),
    });
  } catch (cause) {
    throw authError("refresh_unreachable", { cause });
  }

  // Another tab may have refreshed, or the user signed out or in again, while
  // this request was in the air. Whatever is stored now is newer than our
  // answer and wins; storing ours over a sign-out would quietly revive it.
  const now = store().getItem("refresh_token");
  if (now !== sent) {
    const access = store().getItem("access_token");
    if (now && access) return access;
    throw authError("session_changed", { authFailure: true });
  }

  if (res.status === 401 || res.status === 403) {
    throw authError("refresh_rejected", { status: res.status, authFailure: true });
  }
  if (!res.ok) throw authError("refresh_failed", { status: res.status });

  let data;
  try {
    data = await res.json();
  } catch (cause) {
    throw authError("refresh_unreadable", { status: res.status, cause });
  }
  if (!data?.access_token) throw authError("refresh_unreadable", { status: res.status });
  store().setItem("access_token", data.access_token);
  if (data.refresh_token) store().setItem("refresh_token", data.refresh_token);
  return data.access_token;
}

/** Refresh the access token. Concurrent callers share one request. */
export function refreshAccessToken() {
  if (!inflight) {
    inflight = runRefresh().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * The token to retry with after `sent` drew a 401: the stored one if another
 * request already refreshed it, otherwise a fresh one.
 */
export function tokenAfter401(sent) {
  const current = store().getItem("access_token");
  if (current && current !== sent) return Promise.resolve(current);
  return refreshAccessToken();
}

/** Clear the tokens and tell the app, once per session rather than per request. */
export function endSession() {
  const s = store();
  const had = s.getItem("access_token") || s.getItem("refresh_token");
  s.removeItem("access_token");
  s.removeItem("refresh_token");
  if (had && typeof globalThis.dispatchEvent === "function") {
    globalThis.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
}

const bearerOf = (value) => {
  const m = /^Bearer\s+(.+)$/i.exec(String(value || "").trim());
  return m ? m[1] : null;
};

function apiPath(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl, globalThis.location?.href);
  } catch {
    return null;
  }
  const origins = new Set([globalThis.location?.origin]);
  if (API_URL) {
    try {
      origins.add(new URL(API_URL, globalThis.location?.href).origin);
    } catch {
      /* a malformed VITE_API_URL just means no extra origin */
    }
  }
  if (!origins.has(url.origin) || !url.pathname.startsWith("/api/")) return null;
  return url.pathname;
}

/** Install the shared 401 → refresh → retry-once handler on an axios instance. */
export function attachAuthRefresh(instance) {
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const cfg = error?.config;
      if (error?.response?.status !== 401 || !cfg || cfg._retry || cfg.skipAuthRefresh) {
        return Promise.reject(error);
      }
      const path = apiPath(instance.getUri ? instance.getUri(cfg) : cfg.url);
      if (!path || NEVER_RETRY.test(path)) return Promise.reject(error);

      const headers = cfg.headers || {};
      const sent = bearerOf(
        typeof headers.get === "function" ? headers.get("Authorization") : headers.Authorization
      );
      // No token on the request: the 401 is the endpoint's answer to an
      // anonymous caller, not an expired session.
      if (!sent) return Promise.reject(error);

      cfg._retry = true;
      let token;
      try {
        token = await tokenAfter401(sent);
      } catch (err) {
        if (isAuthFailure(err)) endSession();
        return Promise.reject(error);
      }
      if (typeof headers.set === "function") headers.set("Authorization", `Bearer ${token}`);
      else headers.Authorization = `Bearer ${token}`;
      cfg.headers = headers;
      return instance(cfg);
    }
  );
  return instance;
}

/**
 * Wrap window.fetch so plain `fetch` calls to our API get the same treatment.
 * Only same-origin /api/ requests that carried a bearer token are touched;
 * everything else — exchange proxies, /cryptobot, third parties — passes
 * through untouched. Idempotent.
 */
export function installFetchAuthRefresh(target = globalThis) {
  if (!target || typeof target.fetch !== "function" || target.fetch.__lqAuthRefresh) return;
  const base = target.fetch.bind(target);
  nativeFetch = base;

  const wrapped = async function fetch(input, init) {
    const res = await base(input, init);
    if (res.status !== 401) return res;
    // A Request body is single-use and already spent; retrying one would
    // need a clone of every request up front. Nothing here sends them.
    if (typeof Request !== "undefined" && input instanceof Request) return res;

    const path = apiPath(input instanceof URL ? input.href : input);
    if (!path || NEVER_RETRY.test(path)) return res;

    const headers = new Headers(init?.headers);
    const sent = bearerOf(headers.get("Authorization"));
    if (!sent) return res;
    if (typeof ReadableStream !== "undefined" && init?.body instanceof ReadableStream) return res;

    let token;
    try {
      token = await tokenAfter401(sent);
    } catch (err) {
      if (isAuthFailure(err)) endSession();
      return res;
    }
    headers.set("Authorization", `Bearer ${token}`);
    return base(input, { ...init, headers });
  };
  wrapped.__lqAuthRefresh = true;
  target.fetch = wrapped;
}
