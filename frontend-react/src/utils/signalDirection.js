// Which way a call points — one rule, one place.
//
// The modal used to work this out twice, inline, from `target1 < entry`. That
// is the exact bug the backend already fixed and documented: TP1 landing on the
// entry tick is a rounding artefact, not a short. Over all 56,026 signals it hit
// 70 of them, 48 already resolved, and every one of those was silently dropped
// from the journey table — so from realized_outcome_pct and everything built on
// it — while every other resolved signal had 100% coverage.
//
// Evidence in order of reliability, mirroring
// backend/app/services/journey_fetcher.py `derive_direction`:
//
//   1. stop1, when it differs from the entry. It always sits on the losing
//      side. stop2 is never consulted: measured across all 56,026 signals it
//      never changes the answer, because it is null exactly where stop1 is.
//   2. the furthest target that differs from the entry, TP4 first, since the
//      furthest level is the least likely to round into the entry tick.
//   3. long — the only direction this desk has ever published (across 55,989
//      signals, none carries a stop above its entry).
//
// A level equal to the entry never decides anything; that equality is the
// artefact this function exists to survive.
//
// Three codebases now hold this rule and share no modules. If it changes here,
// change it in backend/app/services/journey_fetcher.py and in
// /opt/luxquant/signal_side.py too.

/** Positive finite number, or null. Guards Decimal/string/null from the API. */
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const f = Number(v);
  return Number.isFinite(f) && f > 0 ? f : null;
}

/**
 * @param {object} signal a signal row (entry, target1..4, stop1)
 * @returns {"long"|"short"} never throws; an unusable entry reads as long,
 *   because that is what this desk publishes and a thrown error here used to
 *   mean a missing row rather than a visible failure.
 */
export function signalDirection(signal) {
  const entry = num(signal?.entry);
  if (entry === null) return "long";

  const stop = num(signal?.stop1);
  if (stop !== null && stop !== entry) return stop < entry ? "long" : "short";

  for (const t of [
    num(signal?.target4),
    num(signal?.target3),
    num(signal?.target2),
    num(signal?.target1),
  ]) {
    if (t !== null && t !== entry) return t > entry ? "long" : "short";
  }

  return "long";
}

/** Convenience for the many places that only need the boolean. */
export function isShortSignal(signal) {
  return signalDirection(signal) === "short";
}

export default signalDirection;
