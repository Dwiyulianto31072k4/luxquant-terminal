// src/utils/peakTiming.js
/**
 * How long after the call a peak landed, and whether it was still reachable.
 *
 * Why this exists — a peak with no elapsed time attached is the easiest claim
 * on the site to attack. Measured over the whole book: the median peak lands
 * 12.8 days after the call, while every TP/SL event resolves inside 5 days. So
 * for most calls the high arrives after the position is already closed, and
 * "+80% peak" read as a trade result overstates what anyone could bank.
 *
 * The fix is not to hide the number — it is genuine, 91.7% of peaks have a week
 * or more of lower prices after them — but to say when it happened. "+80% peak,
 * 41 days after the call" is both impressive and checkable on any chart.
 *
 * Every surface that prints a peak should print one of these next to it.
 */

/**
 * Compact elapsed-time label: "~4h", "3 days", "6 weeks".
 * Returns null when there is nothing trustworthy to show, so callers can
 * render the peak alone rather than an empty parenthesis.
 */
export function peakLagLabel(days) {
  if (days == null || !Number.isFinite(days) || days < 0) return null;
  if (days < 1) return `~${Math.max(1, Math.round(days * 24))}h`;
  if (days < 14) {
    const d = Math.round(days);
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  const w = Math.round(days / 7);
  return `${w} week${w === 1 ? "" : "s"}`;
}

/** Same, from a raw seconds value (the shape the signals API returns). */
export function peakLagFromSeconds(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return null;
  return peakLagLabel(Number(seconds) / 86400);
}

/** Days between a call and its peak, from two timestamps. Null if either is missing. */
export function daysToPeak(calledAt, peakAt) {
  if (!calledAt || !peakAt) return null;
  const a = Date.parse(calledAt);
  const b = Date.parse(peakAt);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / 86400000;
}

/**
 * True when the peak landed after the stop was hit — the case where the number
 * is real but was never available to anyone holding the position. Callers
 * should say so rather than letting it read as an in-position gain.
 */
export function peakIsAfterStop(peakAt, stopAt) {
  if (!peakAt || !stopAt) return false;
  const p = Date.parse(peakAt);
  const s = Date.parse(stopAt);
  if (!Number.isFinite(p) || !Number.isFinite(s)) return false;
  return p > s;
}

/**
 * The full phrase for a peak, ready to drop after the percentage.
 * e.g. "3 days after call" or "6 weeks after call · after stop"
 */
export function peakContextLabel({ days, seconds, afterStop = false } = {}) {
  const lag = days != null ? peakLagLabel(days) : peakLagFromSeconds(seconds);
  if (!lag) return afterStop ? "after stop" : null;
  return afterStop ? `${lag} after call · after stop` : `${lag} after call`;
}
