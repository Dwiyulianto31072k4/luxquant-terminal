// "The same symbol has already reached TP4 within the last 24 hours" — BigStar's
// own risk line, stored on the call (signals.risk_reasons) and printed on the
// Telegram call post. bulk-7d carries it as `tp4_in_24h`; every other payload
// that reaches the signal modal (detail, watchlist, terminal) carries the raw
// risk_reasons, so both are read and the badge shows wherever the post warns.

export const MAX_TP_24H_REASON = "reached tp4 within the last 24 hours";

export const MAX_TP_24H_LABEL = "Prev call hit max TP in 24h";

export const MAX_TP_24H_TIP =
  "A previous call on this coin already hit its max TP (TP4) in the 24h before this one. It may be more volatile — keep your risk management tight.";

/** True when an earlier call on this coin reached TP4 in the 24h before `signal`. */
export function prevCallHitMaxTp(signal, detail = null) {
  if (signal?.tp4_in_24h === true || detail?.tp4_in_24h === true) return true;
  const reasons = detail?.risk_reasons ?? signal?.risk_reasons;
  return typeof reasons === "string" && reasons.toLowerCase().includes(MAX_TP_24H_REASON);
}
