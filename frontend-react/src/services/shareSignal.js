// frontend-react/src/services/shareSignal.js
// ================================================================
// Shared "share a signal" logic for SignalModal + SignalsTable.
// Builds a referral-tagged deep link, dynamic status-aware message,
// tries Web Share API, falls back to clipboard.
//
// Notes:
// - Link assembled on FRONTEND from window.location.origin (sidesteps
//   the referral.py luxquant.com hardcode).
// - Message text is dynamic by signal status, never appends the url
//   (url is passed separately to navigator.share). Clipboard fallback
//   copies text + url with spacing so a paste reads cleanly.
// - No leverage/numbers in text — the OG preview image carries those.
// ================================================================

import { referralApi } from "./referralApi";

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

let _cachedCode;
const getReferralCode = async () => {
  if (_cachedCode) return _cachedCode;
  try {
    const data = await referralApi.getMyCode();
    _cachedCode = extractCode(data);
  } catch {
    _cachedCode = null;
  }
  if (!_cachedCode) {
    try {
      const gen = await referralApi.generateCode();
      _cachedCode = extractCode(gen);
    } catch {
      _cachedCode = null;
    }
  }
  return _cachedCode;
};

export const resetShareCodeCache = () => {
  _cachedCode = undefined;
};

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

// ── Helpers ──────────────────────────────────────────────────────
// "UBERUSDT" → "UBER/USDT" for nicer reading.
const fmtPair = (pair) => {
  if (!pair) return "this setup";
  const quotes = ["USDT", "USDC", "FDUSD", "TUSD", "BUSD", "USD", "BTC", "ETH"];
  for (const q of quotes) {
    if (pair.endsWith(q) && pair.length > q.length) {
      return `${pair.slice(0, -q.length)}/${q}`;
    }
  }
  return pair;
};

const REACHED = new Set(["tp2", "tp3", "tp4", "closed_win"]);

// Deterministic variant pick so a given signal always reads the same.
const pickVariant = (arr, seed) => {
  let h = 0;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
};

const TEXT_REACHED = [
  (P) => `${P} just ran to its targets on LuxQuant Terminal. See how the whole move played out — and if you join through my link, you'll get a member discount on the way in.`,
  (P) => `Another clean run on LuxQuant Terminal: ${P} reached its targets. Take a look at the full breakdown, and grab a discount when you sign up with my link.`,
  (P) => `${P} hit target on LuxQuant Terminal — the entry, the targets, and exactly how it unfolded. Sign up through my link for a member discount.`,
];

const TEXT_LIVE = [
  (P) => `Watching ${P} unfold on LuxQuant Terminal — entry, targets, and live progress in one place. Come follow along, and my link gets you a member discount.`,
  (P) => `${P} is live on LuxQuant Terminal right now. Follow the setup as it plays out, and use my link for a discount when you join.`,
  (P) => `Tracking ${P} on LuxQuant Terminal — the full setup and live updates. Take a look, and sign up through my link for a member discount.`,
];

const buildShareText = (signal) => {
  const P = fmtPair(signal?.pair);
  const status = (signal?.status || "").toLowerCase();
  const seed = signal?.signal_id ?? signal?.id ?? signal?.pair;
  const pool = REACHED.has(status) ? TEXT_REACHED : TEXT_LIVE;
  return pickVariant(pool, seed)(P);
};

const buildTitle = (signal) => {
  const P = fmtPair(signal?.pair);
  const status = (signal?.status || "").toLowerCase();
  return REACHED.has(status)
    ? `${P} reached its targets · LuxQuant`
    : `${P} · LuxQuant signal`;
};

/**
 * shareSignal(signal, opts?)
 * Returns { ok, method } where method ∈ 'web-share'|'clipboard'|'cancelled'|'failed'
 */
export const shareSignal = async (signal, opts = {}) => {
  const signalId = signal?.signal_id ?? signal?.id;
  const code = await getReferralCode();
  const url = buildSignalShareUrl(signalId, code);
  const text = buildShareText(signal);
  const title = buildTitle(signal);

  if (code) {
    referralApi.trackShare(code, "signal_share").catch(() => {});
  }

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return { ok: true, method: "web-share" };
    } catch (err) {
      if (err && err.name === "AbortError") {
        return { ok: false, method: "cancelled" };
      }
    }
  }

  // Clipboard fallback: copy message + link with spacing.
  const clip = `${text}\n\n${url}`;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(clip);
    } else {
      const ta = document.createElement("textarea");
      ta.value = clip;
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
