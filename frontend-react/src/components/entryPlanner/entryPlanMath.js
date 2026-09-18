// Entry planner maths — pure functions, no React.
//
// Turns a LuxQuant call into a laddered order plan: Entry 1 as a market order,
// the rest as limit orders between the entry and SL1, one stop for the whole
// position, and a TP split — sized so that if every entry fills and the stop is
// hit, the loss is the amount the trader said they could lose.
//
// The one promise this module keeps above all others: the planned loss never
// exceeds the budget. Prices are rounded to the venue's tick in the direction
// that keeps the stop at or inside the planned distance, quantities are floored
// to the venue's step AFTER that rounding, and the loss that is reported is
// recomputed from the rounded numbers — not the ideal ones.
//
// Venue rules differ per coin (tick, step, minimums, and whether quantities are
// typed in coins or in contracts), so every quantity is also expressed in the
// venue's own unit. See backend/app/api/routes/entry_planner.py.

export const FEES = { maker: 0.0002, taker: 0.0005 };
// A rough maintenance-margin rate for the liquidation estimate. Real tiers vary
// with position size; this is for a warning, never for a number to trade on.
const MMR = 0.005;

/** Decimal places carried by a step or tick string ("0.0001" → 4, "1" → 0, "1e-7" → 7). */
export function decimalsOf(step) {
  const s = String(step ?? "");
  if (/e-/i.test(s)) return Number(s.split(/e-/i)[1]) || 0;
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

/**
 * Round `value` to a multiple of `step`, in integer space so 0.1 + 0.2 never
 * decides a price. mode: "down" | "up" | "nearest".
 */
export function roundToStep(value, step, mode = "nearest") {
  const v = Number(value);
  const st = Number(step);
  if (!Number.isFinite(v) || !Number.isFinite(st) || st <= 0) return v;
  const d = Math.min(12, Math.max(decimalsOf(step), 0));
  const scale = 10 ** d;
  const unit = Math.round(st * scale);
  const scaled = v * scale;
  const eps = 1e-7;
  let n;
  if (mode === "down") n = Math.floor(scaled / unit + eps);
  else if (mode === "up") n = Math.ceil(scaled / unit - eps);
  else n = Math.round(scaled / unit);
  return Number(((n * unit) / scale).toFixed(d));
}

/** Evenly spaced ladder from `first` towards `sl1`, stopping one step short of it. */
export function evenLadder(first, sl1, n) {
  const out = [first];
  for (let i = 1; i < n; i += 1) out.push(first + ((sl1 - first) * i) / n);
  return out;
}

/** Normalise percentages so they sum to exactly 1. */
function shares(list) {
  const clean = list.map((x) => Math.max(0, Number(x) || 0));
  const total = clean.reduce((a, b) => a + b, 0);
  return total > 0 ? clean.map((x) => x / total) : clean.map(() => 1 / clean.length);
}

/**
 * Build the plan.
 * @param {object} p
 *   side          "long" | "short"
 *   entryPrices   number[]  prices for Entry 1..n (Entry 1 filled at market)
 *   sl            number    final stop for the whole position
 *   targets       number[]  TP1..TP4 from the call (nulls allowed)
 *   sizeBy        "risk" (default) | "margin"
 *   riskUsd       number    loss budget if everything fills and the stop hits
 *   marginUsd     number    sizeBy "margin": total initial margin across all entries
 *   leverage      number
 *   weights       number[]  % per entry
 *   tpSplit       number[]  % of the position closed at each TP
 *   includeFees   boolean
 *   rule          {tick, step, min_qty, min_notional, unit, contract_size} | null
 */
export function buildPlan(p) {
  const long = p.side !== "short";
  const dir = long ? 1 : -1;
  const rule = p.rule || null;
  const tick = rule?.tick || null;
  const cs = Number(rule?.contract_size || 1) || 1;
  const stepCoin = rule?.step ? Number(rule.step) * cs : null;
  const minQtyCoin = rule?.min_qty ? Number(rule.min_qty) * cs : 0;
  const minNotional = rule?.min_notional ? Number(rule.min_notional) : 0;
  const fee = p.includeFees ? FEES : { maker: 0, taker: 0 };
  const warnings = [];

  // Prices: entries rounded to the better side, the stop rounded TOWARDS the
  // entries, targets rounded to the side that fills first.
  const r = (v, towardsLower) => (tick ? roundToStep(v, tick, towardsLower ? "down" : "up") : v);
  const entries = p.entryPrices.map((e) => r(e, long));
  const sl = r(p.sl, !long);
  const w = shares(p.weights.slice(0, entries.length));

  const bad = entries.findIndex((e) => !(e > 0) || (e - sl) * dir <= 0);
  if (!(sl > 0) || bad >= 0) {
    return {
      ok: false,
      error: bad >= 0
        ? `Entry ${bad + 1} is on the wrong side of the stop — every entry must be ${long ? "above" : "below"} ${sl}.`
        : "The stop price is missing.",
    };
  }

  // Loss per coin for each entry, fees included when asked: the entry's own fee
  // (market for Entry 1, limit for the rest) plus the stop's market exit.
  const perCoin = entries.map((e, i) => (e - sl) * dir + e * (i === 0 ? fee.taker : fee.maker) + sl * fee.taker);
  // Two ways a trader sizes: "I can lose $X" (risk) or "I put $X of capital in"
  // (margin — what the exchange order form asks for). Margin mode spends the
  // capital at the chosen leverage and reports the loss that follows from it.
  const lev = Math.max(1, Number(p.leverage) || 1);
  const byMargin = p.sizeBy === "margin";
  const marginIn = Math.max(0, Number(p.marginUsd) || 0);
  const idealTotal = byMargin
    ? (marginIn * lev) / w.reduce((a, wi, i) => a + wi * entries[i], 0)
    : Math.max(0, Number(p.riskUsd) || 0) / w.reduce((a, wi, i) => a + wi * perCoin[i], 0);

  const legs = entries.map((price, i) => {
    let qty = idealTotal * w[i];
    if (stepCoin) qty = roundToStep(qty, stepCoin, "down");
    const notional = qty * price;
    const legWarn = [];
    if (qty <= 0 || qty < minQtyCoin) legWarn.push("below_min_qty");
    if (minNotional && notional < minNotional) legWarn.push("below_min_notional");
    return {
      index: i + 1,
      type: i === 0 ? "market" : "limit",
      price,
      weight: w[i] * 100,
      qty,
      qtyUnit: qty / cs,
      notional,
      margin: notional / lev,
      lossAtSl: qty * perCoin[i],
      warnings: legWarn,
    };
  });

  const scenario = (m) => {
    const used = legs.slice(0, m);
    const qty = used.reduce((a, l) => a + l.qty, 0);
    const avg = qty > 0 ? used.reduce((a, l) => a + l.qty * l.price, 0) / qty : 0;
    const loss = used.reduce((a, l) => a + l.lossAtSl, 0);
    const tps = tpPlan(qty, avg);
    return { fills: m, qty, avg, margin: used.reduce((a, l) => a + l.margin, 0), lossAtSl: loss, profitAllTps: tps.reduce((a, t) => a + t.profit, 0), tps };
  };

  function tpPlan(totalQty, avg) {
    const targets = (p.targets || []).map((t) => (Number(t) > 0 ? Number(t) : null));
    const split = shares((p.tpSplit || []).slice(0, targets.length).map((s, i) => (targets[i] ? s : 0)));
    let left = totalQty;
    const lastIdx = split.map((s, i) => (s > 0 ? i : -1)).filter((i) => i >= 0).pop();
    return targets.map((t, i) => {
      if (!t || !split[i]) return { index: i + 1, price: t, pct: 0, qty: 0, qtyUnit: 0, profit: 0 };
      const price = tick ? roundToStep(t, tick, long ? "down" : "up") : t;
      let qty = i === lastIdx ? left : totalQty * split[i];
      if (stepCoin && i !== lastIdx) qty = roundToStep(qty, stepCoin, "down");
      qty = Math.min(qty, left);
      left -= qty;
      const profit = qty * ((price - avg) * dir - price * fee.taker);
      return { index: i + 1, price, pct: split[i] * 100, qty, qtyUnit: qty / cs, profit };
    });
  }

  const full = scenario(legs.length);
  const budget = byMargin ? full.lossAtSl : Math.max(0, Number(p.riskUsd) || 0);
  const margin = full.qty * full.avg / lev;
  const liq = full.avg * (long ? 1 - 1 / lev + MMR : 1 + 1 / lev - MMR);
  const liqBeforeStop = long ? liq >= sl : liq <= sl;

  if (liqBeforeStop) warnings.push("liquidation_before_stop");
  if (legs.some((l) => l.warnings.length)) warnings.push("leg_below_minimum");
  if (!byMargin && full.lossAtSl > budget + 1e-9) warnings.push("over_budget");

  return {
    ok: true,
    side: long ? "long" : "short",
    legs,
    sl,
    avg: full.avg,
    totalQty: full.qty,
    totalUnit: full.qty / cs,
    notional: full.qty * full.avg,
    margin,
    liq,
    liqBeforeStop,
    lossAtSl: full.lossAtSl,
    budget,
    sizeBy: byMargin ? "margin" : "risk",
    // Rough fees if every entry fills and the stop hits — the wallet needs this
    // on top of the margin.
    feesAtSl: legs.reduce((a, l, i) => a + l.notional * (i === 0 ? FEES.taker : FEES.maker), 0) + full.qty * sl * FEES.taker,
    tps: full.tps,
    scenarios: legs.map((_, i) => scenario(i + 1)),
    unit: rule?.unit || "coin",
    contractSize: cs,
    warnings,
  };
}
