// The five regimes of price against turnover, and the test that sorts a point
// into one.
//
// This lives on its own because both sides need it: SignalsAnalytics tags every
// point while building `agg`, and AnomalyTab renders and filters by the result.
// Neither can own it, and a copy in each would drift.

import { GOLD, PURPLE, NEG, GRAYBAR } from "./vizShared";

// Anomaly turnover axis. A log scale cannot contain zero, and a coin that
// traded nothing still belongs on the chart, so 0.02% of market cap is the
// floor it sits on. Ticks are the decades either side of it — 0.1%, 1%, 10%,
// 100% — which is also how anyone reading turnover actually thinks about it.
export const ANOM_FLOOR = 0.02;

// The chart plots price change against turnover, which is the oldest question
// in volume analysis: volume is EFFORT, price progress is RESULT, and the pairs
// worth a second look are the ones where the two disagree. These are the five
// regimes that produces, with the counts they held on production on 2026-09-13
// across 439 called pairs — measured before shipping, because a filter that is
// always empty teaches people the control is broken.
//
// Heavy = turnover above 3x the desk median (the 3x line already on the chart).
// Light = below half the median. Big move = more than 5% in 24h, the same
// threshold the Hot flag has always used.
export const ANOM_FILL = {
  breakout: GOLD,
  absorption: PURPLE,
  thin: NEG,
  capitulation: NEG,
  dormant: "rgb(var(--fg) / 0.13)",
  ordinary: GRAYBAR,
};

/**
 * Which regime a point belongs to. Exported so the thresholds can be pinned by
 * a test rather than living only inside a 200-line memo — they are the whole
 * meaning of the Setup buttons, and the Hot flag has depended on the same two
 * numbers since long before those buttons existed.
 */
export function anomSetupOf(x, y, medFlow) {
  if (!(medFlow > 0)) return "ordinary";
  const heavy = y > medFlow * 3;
  const light = y < medFlow / 2;
  if (heavy && x > 5) return "breakout";
  if (heavy && x < -5) return "capitulation";
  if (heavy) return "absorption";
  if (light && x > 5) return "thin";
  if (light) return "dormant";
  return "ordinary";
}

export const ANOM_SETUPS = [
  {
    id: "breakout",
    label: "Breakout",
    dot: "bg-accent",
    what: "Up more than 5% on turnover above 3x the median.",
    why: "The move has participation behind it. A break on heavy volume is the one that tends to hold; the identical break on thin volume is the one that gives it back. This is the same set the Hot flag marks.",
  },
  {
    id: "absorption",
    label: "Absorption",
    dot: "bg-[var(--viz-4)]",
    what: "Turnover above 3x the median while price went nowhere.",
    why: "Effort without result. Heavy trading that moves nothing means one side is soaking up the other at this level — it is the second-largest group on the board and the one the old Hot/Other split hid completely.",
  },
  {
    id: "thin",
    label: "Thin pump",
    dot: "bg-negative",
    what: "Up more than 5% on turnover below half the median.",
    why: "Price moved and almost nobody traded it. A handful of participants drove it and it can unwind just as fast when they stop. Size and stops, not conviction.",
  },
  {
    id: "capitulation",
    label: "Capitulation",
    dot: "bg-negative",
    what: "Down more than 5% on turnover above 3x the median.",
    why: "Heavy selling rather than a drift. Sellers spending this much effort is what a washout looks like — a bounce WATCH, not a buy on its own. Rare on a green day, which is why it can read zero.",
  },
  {
    id: "dormant",
    label: "Dormant",
    dot: "bg-ink/25",
    what: "Turnover below half the median, no real direction.",
    why: "Nothing is trading it. Not a setup — it is here so you can see how much of the book is asleep, and take it out of the picture.",
  },
];
export const ANOM_Y_TICKS = [-1.5, -1, 0, 1, 2];
