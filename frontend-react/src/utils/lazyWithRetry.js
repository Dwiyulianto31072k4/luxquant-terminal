// src/utils/lazyWithRetry.js
// ════════════════════════════════════════════════════════════════
// React.lazy that survives a dropped asset fetch.
//
// Measured 2026-09-06 from an Indonesian connection: individual Cloudflare
// cache keys at the Singapore edge get stuck answering 522 to every request,
// indefinitely, while the very same file serves in 0.3s from origin and 0.6s
// through Cloudflare under any other cache key. Size is irrelevant — a 1.5KB
// chunk failed exactly like a 245KB stylesheet. So this is not congestion to
// wait out: the only way past a poisoned key is a different key.
//
// Hence the shape below. A plain retry cannot help twice over: the browser
// records a failed module URL in its module map and replays that same
// rejection forever, and even if it did re-fetch, the edge would answer 522
// again. Attempt 3 therefore re-fetches under a fresh query string.
//
// KNOWN LIMIT: this only covers the lazily-imported module itself. If one of
// that chunk's own static imports is the poisoned key, the retry re-imports
// the parent, the parent statically imports the same dead URL, and it fails
// again. Nothing in the app can fix that case — it needs a Cloudflare purge.
// ════════════════════════════════════════════════════════════════

import { lazy } from "react";

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload|Loading chunk \S+ failed|Loading CSS chunk \S+ failed/i;

// A stuck key answers 522 only after Cloudflare's ~20s origin timeout. Waiting
// that out three times is 60s of spinner, so give up on an attempt long before
// the network does — every genuinely healthy fetch measured came back under 6s.
const ATTEMPT_TIMEOUT_MS = 8000;

/** True for the "the file did not arrive" family of errors, nothing else. */
export function isChunkLoadError(err) {
  if (!err) return false;
  const msg = err.message || err.reason?.message || err.reason || err;
  return CHUNK_ERROR.test(String(msg));
}

/** The chunk URL is in the error text — that is the only place it is exposed. */
function urlFromError(err) {
  const msg = String(err?.message || err || "");
  const m = msg.match(/https?:\/\/[^\s"')]+\.(?:js|mjs|css)/i);
  return m ? m[0] : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withDeadline(promise, ms) {
  let timer;
  const bell = new Promise((_, reject) => {
    timer = setTimeout(
      // Worded so isChunkLoadError() claims it and the retry loop continues.
      () => reject(new Error("Failed to fetch dynamically imported module: timed out")),
      ms
    );
  });
  return Promise.race([promise, bell]).finally(() => clearTimeout(timer));
}

/**
 * Run a dynamic import, retrying transient asset failures.
 * Anything that is not a chunk-load error is rethrown on the spot — a genuine
 * bug inside the module must not be run three times and then swallowed.
 */
export async function importWithRetry(factory, { retries = 2, base = 300 } = {}) {
  let lastErr = null;
  let lastUrl = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Attempts 0 and 1 are the normal path. Repeating it is worth one go:
      // a failure at the modulepreload stage does not poison the module map,
      // so the plain import can still succeed.
      if (attempt < 2 || !lastUrl) return await withDeadline(factory(), ATTEMPT_TIMEOUT_MS);

      const bust = `${lastUrl}${lastUrl.includes("?") ? "&" : "?"}lqretry=${attempt}`;
      return await withDeadline(import(/* @vite-ignore */ bust), ATTEMPT_TIMEOUT_MS);
    } catch (err) {
      lastErr = err;
      lastUrl = urlFromError(err) || lastUrl;
      if (!isChunkLoadError(err) || attempt === retries) throw err;
      // Jitter, so a page pulling twenty chunks does not retry them in lockstep.
      await sleep(base * 2 ** attempt + Math.random() * 250);
    }
  }

  throw lastErr;
}

/**
 * Drop-in for React.lazy. Import it aliased so call sites stay untouched:
 *   import { lazyWithRetry as lazy } from "./utils/lazyWithRetry";
 */
export function lazyWithRetry(factory, options) {
  return lazy(() => importWithRetry(factory, options));
}

export default lazyWithRetry;
