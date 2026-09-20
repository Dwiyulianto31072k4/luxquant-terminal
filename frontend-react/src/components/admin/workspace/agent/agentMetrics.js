// Pure helpers for the Agent Monitor.
//
// The tab renders; every number is derived here, so a tile, a tooltip and a
// table can never disagree about the same figure. Nothing in this file touches
// React, the DOM or the network — which is also why it can be tested.

export const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

/** "$12.34" / "-$12.34" — magnitude first, the sign carried by the minus. */
export const usd = (v, digits = 2) => {
  const n = num(v);
  if (n === null) return "—";
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(digits)}`;
};

/** Same, but a gain keeps its plus: a P&L reader needs the direction. */
export const signed = (v, digits = 2) => {
  const n = num(v);
  if (n === null) return "—";
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}$${Math.abs(n).toFixed(digits)}`;
};

/** Compact money for an axis: $1.2k, -$430, $0. */
export const usdShort = (v) => {
  const n = num(v);
  if (n === null) return "—";
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  return `${sign}$${a < 10 ? a.toFixed(2).replace(/\.00$/, "") : Math.round(a)}`;
};

export const pct = (v, digits = 1) => {
  const n = num(v);
  return n === null ? "—" : `${n.toFixed(digits)}%`;
};

export const fmtDay = (v) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—";

export const ago = (v) => {
  if (!v) return "—";
  const mins = Math.round((Date.now() - new Date(v).getTime()) / 60000);
  if (!Number.isFinite(mins)) return "—";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

/** Accumulated running time: "42d" means forty-two days switched ON. */
export const dur = (secs) => {
  const s = num(secs) || 0;
  if (!s) return "—";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  const d = Math.floor(s / 86400);
  const h = Math.round((s % 86400) / 3600);
  return d ? `${d}d ${h}h` : `${h}h`;
};

/** Dollars won for every dollar lost. The one ratio a trading desk is judged
 *  on: above 1 the desk makes money, below 1 it does not, and it stays
 *  readable when the net is a small difference between two large sides. */
export const profitFactor = (won, lost) => {
  const w = num(won);
  const l = Math.abs(num(lost) ?? 0);
  if (w === null || !l) return null;
  return w / l;
};

/** What one average trade is worth — the number that multiplies by volume. */
export const expectancy = (net, trades) => {
  const n = num(net);
  const t = num(trades);
  return n === null || !t ? null : n / t;
};

/** Average win ÷ average loss. With the win rate it says whether the shape of
 *  the edge is "many small wins" or "few big ones". */
export const payoff = (avgWin, avgLoss) => {
  const w = num(avgWin);
  const l = Math.abs(num(avgLoss) ?? 0);
  if (w === null || !l) return null;
  return w / l;
};

/** The win rate this payoff needs just to break even: 1 / (1 + payoff).
 *  Comparing it to the real win rate turns two abstract numbers into a verdict. */
export const breakEvenWinRate = (payoffRatio) => {
  const p = num(payoffRatio);
  return p === null || p <= 0 ? null : (100 * 1) / (1 + p);
};

/** Largest peak-to-trough fall of the cumulative curve, in dollars. Survival,
 *  not profit: a desk can end a month up and still have been unrunnable. */
export const maxDrawdown = (cumulative = []) => {
  let peak = null;
  let worst = 0;
  for (const raw of cumulative) {
    const v = num(raw);
    if (v === null) continue;
    peak = peak === null ? v : Math.max(peak, v);
    worst = Math.min(worst, v - peak);
  }
  return worst === 0 ? 0 : Math.abs(worst);
};

/** The daily curve, unpacked into parallel arrays a chart can take directly. */
export function curveSeries(curve) {
  const rows = (Array.isArray(curve) ? curve : []).filter((r) => r && r.day);
  if (!rows.length) return null;
  const days = rows.map((r) => r.day);
  const pnl = rows.map((r) => num(r.pnl) ?? 0);
  const cumulative = rows.map((r) => num(r.cumulative) ?? 0);
  const btc = rows.map((r) => num(r.btc_change_pct));
  const greens = pnl.filter((v) => v > 0).length;
  return {
    days,
    pnl,
    cumulative,
    btc,
    n: rows.length,
    first: days[0],
    last: days[days.length - 1],
    end: cumulative[cumulative.length - 1],
    best: Math.max(...pnl),
    worst: Math.min(...pnl),
    greenDays: greens,
    redDays: pnl.filter((v) => v < 0).length,
    maxDrawdown: maxDrawdown(cumulative),
  };
}

/** What is broken right now, in the order an operator should act on it.
 *  Each entry carries the desk filter that shows the rows behind the number,
 *  so a count is never a dead end. */
export function incidents({ totals = {}, users = [], positions = {} } = {}) {
  const linked = (users || []).filter((u) => u.has_account);
  const openErrors = linked.filter((u) => u.status === "error").length;
  const recovered = linked.filter((u) => u.errors_recovered).length;
  const blocked = linked.filter((u) => u.bot_access_blocked).length;
  const unsignedLive = num(totals.unsigned_live) ?? 0;
  const unprotected = (positions.positions || []).filter((p) => p.unprotected).length;
  const out = [
    {
      key: "errors",
      count: openErrors,
      label: openErrors === 1 ? "bot failing" : "bots failing",
      hint: "an order was rejected and has not gone through since",
      filter: "problems",
      tone: "neg",
    },
    {
      key: "keys",
      count: num(totals.invalid_keys) ?? 0,
      label: "invalid keys",
      hint: "the exchange refuses the key, so nothing can be placed",
      filter: "problems",
      tone: "neg",
    },
    {
      key: "stuck",
      count: num(totals.stuck_positions) ?? 0,
      label: "stuck positions",
      hint: "a position the reconciler cannot resolve blocks every new entry on that account",
      filter: "problems",
      tone: "neg",
    },
    {
      key: "unprotected",
      count: unprotected,
      label: "without a stop",
      hint: "open positions carrying no stop-loss of ours",
      filter: null,
      tone: "neg",
    },
    {
      key: "unsigned",
      count: unsignedLive,
      label: "live without the form",
      hint: "trading live with no signed agreement on file",
      filter: "unsigned",
      tone: "warn",
    },
    {
      key: "blocked",
      count: blocked,
      label: "switched off by us",
      hint: "an operator blocked the bot; the person sees the reason",
      filter: "blocked",
      tone: "warn",
    },
    {
      key: "recovered",
      count: recovered,
      label: "recovered",
      hint: "failed earlier, then filled — nothing to do, kept visible for a day",
      filter: "recovered",
      tone: "warn",
      resolved: true,
    },
  ];
  return out.filter((i) => i.count > 0);
}

/** Money actually at risk right now, which no total on the page carried before. */
export function exposure(positions) {
  const rows = (positions?.positions || []).filter(Boolean);
  const live = rows.filter((p) => !p.dry_run);
  const sum = (list, key) => list.reduce((a, p) => a + (num(p[key]) ?? 0), 0);
  const byVenue = new Map();
  for (const p of live) {
    const key = p.venue || p.exchange || "unknown";
    const slot = byVenue.get(key) || { venue: key, open: 0, notional: 0, unrealized: 0 };
    slot.open += 1;
    slot.notional += num(p.notional) ?? 0;
    slot.unrealized += num(p.unrealized_pnl) ?? 0;
    byVenue.set(key, slot);
  }
  return {
    open: rows.length,
    liveOpen: live.length,
    dryRun: rows.length - live.length,
    notional: sum(live, "notional"),
    unrealized: num(positions?.totals?.live_unrealized_pnl) ?? sum(live, "unrealized_pnl"),
    unprotected: rows.filter((p) => p.unprotected).length,
    stuck: num(positions?.totals?.stuck) ?? 0,
    holders: num(positions?.totals?.users_holding) ?? 0,
    priced: live.filter((p) => p.mark_price != null).length,
    byVenue: [...byVenue.values()].sort((a, b) => b.notional - a.notional),
  };
}

/** The n rows that moved the most money, either way — a monitor cares about
 *  the biggest bleed as much as the biggest winner. */
export const topByAbs = (rows = [], n = 8) =>
  [...rows]
    .filter((r) => r && num(r.net) !== null)
    .sort((a, b) => Math.abs(num(b.net)) - Math.abs(num(a.net)))
    .slice(0, n);

/** Sorted so a diverging bar chart reads top-down from best to worst. */
export const byNet = (rows = []) =>
  [...rows].filter((r) => r && num(r.net) !== null).sort((a, b) => num(b.net) - num(a.net));
