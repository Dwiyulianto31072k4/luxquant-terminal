// frontend-react/src/services/shareSignal.js
// ================================================================
// Shared "share a signal" logic, used by both SignalModal and
// SignalsTable. Builds a referral-tagged deep link to the signal,
// tries the native Web Share API, and falls back to clipboard copy.
//
// Design notes:
// - The link is assembled on the FRONTEND from window.location.origin,
//   NOT from any backend-provided URL. This sidesteps the known
//   referral.py /my-code bug that still hardcodes luxquant.com.
// - getMyCode() return shape isn't assumed; we defensively read the
//   referral code from several possible field names. If no code is
//   available (not logged in / no code yet), we still share a plain
//   signal link without ref — sharing never hard-fails.
// ================================================================

import { referralApi } from "./referralApi";

// Pull a referral code out of whatever getMyCode() returns.
const extractCode = (data) => {
  if (!data || typeof data !== "object") return null;
  return (
    data.code ||
    data.referral_code ||
    data.my_code ||
    data.referralCode ||
    (data.referral && data.referral.code) ||
    null
  );
};

// Cache the code for the session so we don't refetch on every share.
let _cachedCode;
const getReferralCode = async () => {
  if (_cachedCode) return _cachedCode;
  // 1) Try to read an existing code.
  try {
    const data = await referralApi.getMyCode();
    _cachedCode = extractCode(data);
  } catch {
    _cachedCode = null; // not logged in, endpoint error, etc.
  }
  // 2) No code yet but the user IS logged in → generate one so the share
  //    link is referral-tagged (and the share actually earns credit).
  //    generateCode() requires auth; if it fails (guest), we share without ref.
  if (!_cachedCode) {
    try {
      const gen = await referralApi.generateCode();
      _cachedCode = extractCode(gen);
    } catch {
      _cachedCode = null; // guest / not allowed → plain link, no ref
    }
  }
  return _cachedCode;
};

// Allow callers to reset the cache (e.g. after logout/login).
export const resetShareCodeCache = () => {
  _cachedCode = undefined;
};

// Build the shareable deep link: <origin>/signals?signal=<id>[&ref=<code>]
export const buildSignalShareUrl = (signalId, code) => {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://luxquant.tw";
  const params = new URLSearchParams();
  if (signalId != null) params.set("signal", String(signalId));
  if (code) params.set("ref", code);
  return `${origin}/signals?${params.toString()}`;
};

// Compose a friendly invite message. NOTE: do NOT append the url here —
// it's passed separately as the `url` field of navigator.share(), and share
// targets (WhatsApp/Telegram/X) append the url themselves. Putting it in both
// places makes the link show up twice.
const buildShareText = (signal) => {
  const pair = signal?.pair || "this signal";
  return `Check out ${pair} on LuxQuant Terminal — live entry, targets & track record.`;
};

/**
 * shareSignal(signal, opts?)
 * Returns: { ok, method } where method ∈ 'web-share' | 'clipboard' | 'cancelled' | 'failed'
 *
 * opts.onCopied  — called when we fell back to clipboard (show a "Copied!" toast)
 * opts.onError   — called on unexpected failure
 */
export const shareSignal = async (signal, opts = {}) => {
  const signalId = signal?.signal_id ?? signal?.id;
  const code = await getReferralCode();
  const url = buildSignalShareUrl(signalId, code);
  const text = buildShareText(signal);
  const title = `LuxQuant — ${signal?.pair || "Signal"}`;

  // Fire-and-forget share tracking (never blocks the share itself).
  if (code) {
    referralApi
      .trackShare(code, "signal_share")
      .catch(() => {});
  }

  // 1) Native Web Share API (best on mobile — opens the OS share sheet).
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return { ok: true, method: "web-share" };
    } catch (err) {
      // User dismissing the sheet throws AbortError — treat as a no-op,
      // do NOT fall through to clipboard (that would be surprising).
      if (err && err.name === "AbortError") {
        return { ok: false, method: "cancelled" };
      }
      // Any other error → fall through to clipboard.
    }
  }

  // 2) Clipboard fallback (desktop / browsers without Web Share).
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    if (opts.onCopied) opts.onCopied(url);
    return { ok: true, method: "clipboard" };
  } catch (err) {
    if (opts.onError) opts.onError(err);
    return { ok: false, method: "failed" };
  }
};

export default shareSignal;
