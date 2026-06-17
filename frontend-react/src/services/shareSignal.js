// frontend-react/src/services/shareSignal.js
// ================================================================
// Share a signal as a referral-tagged link. WA/TG/Discord/X render
// the rich OG preview (image + title + desc) automatically from the
// link, so we share text + url and let each platform unfurl it.
// Desktop without Web Share → copy text + link to clipboard.
// ================================================================

import { referralApi } from "./referralApi";

const extractCode = (data) => {
  if (!data || typeof data !== "object") return null;
  return (
    data.code || data.referral_code || data.my_code ||
    data.referralCode || (data.referral && data.referral.code) || null
  );
};

let _cachedCode;
const getReferralCode = async () => {
  if (_cachedCode) return _cachedCode;
  try {
    _cachedCode = extractCode(await referralApi.getMyCode());
  } catch { _cachedCode = null; }
  if (!_cachedCode) {
    try { _cachedCode = extractCode(await referralApi.generateCode()); }
    catch { _cachedCode = null; }
  }
  return _cachedCode;
};

export const resetShareCodeCache = () => { _cachedCode = undefined; };

const getOrigin = () =>
  (typeof window !== "undefined" && window.location?.origin)
    ? window.location.origin
    : "https://luxquant.tw";

export const buildSignalShareUrl = (signalId, code) => {
  const params = new URLSearchParams();
  if (signalId != null) params.set("signal", String(signalId));
  if (code) params.set("ref", code);
  return `${getOrigin()}/signals?${params.toString()}`;
};

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

const pickVariant = (arr, seed) => {
  let h = 0;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
};

const TEXT_REACHED = [
  (P) => `${P} just ran to its targets on LuxQuant Terminal. See how the whole move played out, and get 10% off your first payment when you sign up through my link.`,
  (P) => `Another clean run on LuxQuant Terminal: ${P} reached its targets. Take a look at the full breakdown, and use my link for 10% off your first payment.`,
  (P) => `${P} hit target on LuxQuant Terminal. See the entry, the targets, and how it unfolded, then claim 10% off your first payment with my link.`,
];

const TEXT_LIVE = [
  (P) => `Watching ${P} unfold on LuxQuant Terminal — entry, targets, and live progress in one place. Join through my link for 10% off your first payment.`,
  (P) => `${P} is live on LuxQuant Terminal right now. Follow the setup as it plays out, and use my link for 10% off your first payment.`,
  (P) => `Tracking ${P} on LuxQuant Terminal — the full setup and live updates. Take a look, and get 10% off your first payment with my link.`,
];

const buildShareText = (signal) => {
  const P = fmtPair(signal?.pair);
  const status = (signal?.status || "").toLowerCase();
  const seed = signal?.signal_id ?? signal?.id ?? signal?.pair;
  return pickVariant(REACHED.has(status) ? TEXT_REACHED : TEXT_LIVE, seed)(P);
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
 * method ∈ 'web-share' | 'clipboard' | 'cancelled' | 'failed'
 */
export const shareSignal = async (signal, opts = {}) => {
  const signalId = signal?.signal_id ?? signal?.id;
  const code = await getReferralCode();
  const url = buildSignalShareUrl(signalId, code);
  const text = buildShareText(signal);
  const title = buildTitle(signal);

  if (code) referralApi.trackShare(code, "signal_share").catch(() => {});

  // Native link share → WA/TG/Discord render the rich OG preview card.
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return { ok: true, method: "web-share" };
    } catch (err) {
      if (err && err.name === "AbortError") return { ok: false, method: "cancelled" };
    }
  }

  // Desktop fallback: copy message + link.
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
