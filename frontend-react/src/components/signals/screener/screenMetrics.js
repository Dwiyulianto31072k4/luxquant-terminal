// screenMetrics — the numbers the screener compares calls on, and the measured
// reason it leads with the one it does.
//
// THE FINDING THIS TOOL IS BUILT ON, measured over 10,003 calls since 10 Jun
// 2026 (entry, target3, stop1 and the realised peak, from the signals table):
//
//   entering at   still ran higher   median left to the high   TP3 STILL AHEAD   stop now
//        +0%            97.9%                 +23.0%                100%           -2.7%
//        +2%            92.7%                 +22.3%                 98.8%         -4.7%
//        +5%            86.3%                 +20.9%                 65.0%         -7.7%
//       +10%            74.6%                 +19.5%                 13.7%        -12.7%
//       +20%            54.6%                 +18.0%                  2.4%        -22.7%
//
// The desk's TP3 sits a median of 5.9% above entry while the typical call peaks
// 22.4% above it. So a coin that has already run keeps running about as often
// as one that has not — but THE PUBLISHED TRADE IS GONE: past +10% above entry,
// TP3 is behind you 86% of the time and the stop that was 2.7% away is now
// 12.7% away. The reward is unchanged and the risk has quadrupled.
//
// That is why "how far past the call" is the screener's default axis and why
// every view prints the room left to target beside it. It is not a prediction
// and this file must never present it as one: it is arithmetic about where the
// price sits inside a plan somebody already published.

export const CHASE_TABLE = [
  { at: 0, ranHigher: 97.9, medLeft: 23.0, tp3Ahead: 100.0, stop: -2.7 },
  { at: 2, ranHigher: 92.7, medLeft: 22.3, tp3Ahead: 98.8, stop: -4.7 },
  { at: 5, ranHigher: 86.3, medLeft: 20.9, tp3Ahead: 65.0, stop: -7.7 },
  { at: 10, ranHigher: 74.6, medLeft: 19.5, tp3Ahead: 13.7, stop: -12.7 },
  { at: 20, ranHigher: 54.6, medLeft: 18.0, tp3Ahead: 2.4, stop: -22.7 },
];

/** The point past which the published trade is usually gone. */
export const CHASE_LINE = 5;

export const num = (v) => {
  const n = Number(v);
  return v == null || v === "" || Number.isNaN(n) ? null : n;
};

const pctBetween = (from, to) => {
  const a = num(from);
  const b = num(to);
  if (a == null || b == null || a === 0) return null;
  return ((b - a) / Math.abs(a)) * 100;
};

/** The highest target a call actually carries — the ladder is ragged and not
 *  every call has four rungs. */
export const topTarget = (s) =>
  num(s.target4) ?? num(s.target3) ?? num(s.target2) ?? num(s.target1);

/** One row of comparable numbers per call. Every field is null when the input
 *  is missing rather than 0, because a call with no stop is not a call with a
 *  stop at zero, and a screener that fills gaps with zeroes ranks the gaps
 *  first. */
export function screenRow(signal, { price, volume, edge, isTop } = {}) {
  const entry = num(signal.entry);
  const now = num(price);
  const t1 = num(signal.target1);
  const t3 = num(signal.target3) ?? num(signal.target2) ?? t1;
  const stop = num(signal.stop1) ?? num(signal.stop_loss);
  const created = signal.created_at ? new Date(signal.created_at).getTime() : null;

  // How far past the call the price already is. The screener's first question.
  const distEntry = pctBetween(entry, now);
  // What is left to the desk's own target, FROM HERE — not from entry.
  const roomTp3 = pctBetween(now, t3);
  const roomTp1 = pctBetween(now, t1);
  // Positive means the price is still above the stop, and by how much.
  const stopDist = pctBetween(now, stop) == null ? null : -pctBetween(now, stop);

  // Reward for the risk, both measured FROM THE CURRENT PRICE, which is the
  // only place a reader can actually buy. Quoting the published R:R here would
  // describe a trade that is no longer on offer.
  const rr =
    roomTp3 != null && stopDist != null && stopDist > 0 ? roomTp3 / stopDist : null;

  return {
    id: signal.signal_id,
    signal,
    pair: String(signal.pair || "").replace(/USDT$/i, "").toUpperCase(),
    entry,
    price: now,
    target: t3,
    stop,
    distEntry,
    roomTp3,
    roomTp1,
    stopDist,
    rr,
    ageH: created ? (Date.now() - created) / 3600000 : null,
    vol24: num(volume) ?? num(signal.volume_24h),
    edge: num(edge),
    peak: num(signal.peak_pct),
    status: signal.status || null,
    isTop: !!isTop,
    // The published trade still exists at this price: the target is ahead and
    // the price has not run away from the entry.
    atPlan: roomTp3 != null && roomTp3 > 0 && distEntry != null && distEntry <= CHASE_LINE,
  };
}

/** Every axis the screener offers, with the unit and the direction that counts
 *  as "better" — a picker that cannot say which end is good is a picker that
 *  makes people guess. */
export const METRICS = {
  distEntry: {
    key: "distEntry",
    label: "Past the call",
    axis: "PAST THE CALL (%)",
    unit: "%",
    better: "low",
    hint: "Price against the published entry. Above +5% the desk's own TP3 is usually behind you.",
    diverging: true,
  },
  roomTp3: {
    key: "roomTp3",
    label: "Room to target",
    axis: "ROOM TO TARGET (%)",
    unit: "%",
    better: "high",
    hint: "From the current price to the desk's target. Negative means the target is already passed.",
    diverging: true,
  },
  rr: {
    key: "rr",
    label: "Reward for the risk",
    axis: "REWARD ÷ RISK, FROM HERE",
    unit: "×",
    better: "high",
    hint: "Room to target divided by the distance down to the stop, both from the price you can actually pay.",
  },
  stopDist: {
    key: "stopDist",
    label: "Stop distance",
    axis: "DISTANCE TO STOP (%)",
    unit: "%",
    better: "low",
    hint: "How far the price would have to fall to take the stop.",
  },
  ageH: {
    key: "ageH",
    label: "Age",
    axis: "HOURS SINCE THE CALL",
    unit: "h",
    better: "low",
    hint: "Hours since the call was published.",
  },
  vol24: {
    key: "vol24",
    label: "24h volume",
    axis: "24H VOLUME",
    unit: "$",
    better: "high",
    log: true,
    hint: "Dollars traded in the last day — whether a position can be built and left.",
  },
  edge: {
    key: "edge",
    label: "Edge score",
    axis: "EDGE SCORE",
    unit: "",
    better: "high",
    hint: "The desk's own score for the setup at publish.",
  },
  peak: {
    key: "peak",
    label: "Best so far",
    axis: "BEST SO FAR (%)",
    unit: "%",
    better: "high",
    hint: "The highest this call has reached above its entry since it was published.",
  },
};

export const METRIC_LIST = Object.values(METRICS);

/** One-click screens. Each is a question a desk actually asks, and each says
 *  how many rows it leaves so nobody clicks into an empty table. */
export const SCREENS = {
  plan: {
    key: "plan",
    label: "Still at the plan",
    hint: "Target still ahead and the price within 5% of the published entry — the trade the desk posted is still on offer.",
    test: (r) => r.atPlan,
  },
  fresh: {
    key: "fresh",
    label: "Called today",
    hint: "Published in the last 12 hours.",
    test: (r) => r.ageH != null && r.ageH <= 12,
  },
  rr: {
    key: "rr",
    label: "Pays for its risk",
    hint: "At least twice as far to the target as to the stop, both from the current price.",
    test: (r) => r.rr != null && r.rr >= 2,
  },
  liquid: {
    key: "liquid",
    label: "Deep book",
    hint: "Twenty million dollars or more traded in the last day.",
    test: (r) => r.vol24 != null && r.vol24 >= 2e7,
  },
  top: {
    key: "top",
    label: "Top Runners",
    hint: "Runners carrying the day's leading runner tag when they were posted.",
    test: (r) => r.isTop,
  },
};

export const SCREEN_LIST = Object.values(SCREENS);

export function applyScreens(rows, keys = []) {
  if (!keys.length) return rows;
  return rows.filter((r) => keys.every((k) => SCREENS[k]?.test(r)));
}

/** What each screen would leave, given the others — the same rule the coin
 *  panel's chips follow, for the same reason. */
export function screenCounts(rows, active = []) {
  const out = {};
  for (const k of Object.keys(SCREENS)) {
    const keys = active.includes(k) ? active : [...active, k];
    out[k] = applyScreens(rows, keys).length;
  }
  return out;
}

/** How the filtered set sits against the chase line — the headline the modal
 *  opens with, computed from the rows on screen rather than asserted. */
export function planSummary(rows) {
  const priced = rows.filter((r) => r.distEntry != null && r.roomTp3 != null);
  if (!priced.length) return null;
  const atPlan = priced.filter((r) => r.atPlan).length;
  const passed = priced.filter((r) => r.roomTp3 <= 0).length;
  const chased = priced.filter((r) => r.distEntry > CHASE_LINE).length;
  return { total: priced.length, atPlan, passed, chased };
}

export const fmt = {
  pct: (v, d = 1) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}%`),
  plain: (v, d = 1) => (v == null ? "—" : v.toFixed(d)),
  mult: (v) => (v == null ? "—" : `${v.toFixed(1)}×`),
  hours: (v) =>
    v == null ? "—" : v < 1 ? "just now" : v < 24 ? `${Math.round(v)}h` : `${Math.round(v / 24)}d`,
  usd: (v) => {
    if (v == null) return "—";
    const a = Math.abs(v);
    if (a >= 1e9) return `$${(a / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `$${(a / 1e6).toFixed(0)}M`;
    if (a >= 1e3) return `$${(a / 1e3).toFixed(0)}K`;
    return `$${a.toFixed(0)}`;
  },
};

export function formatMetric(key, v) {
  if (v == null) return "—";
  const m = METRICS[key];
  if (!m) return String(v);
  if (m.unit === "$") return fmt.usd(v);
  if (m.unit === "×") return fmt.mult(v);
  if (m.unit === "h") return fmt.hours(v);
  if (m.unit === "%") return fmt.pct(v);
  return fmt.plain(v);
}
