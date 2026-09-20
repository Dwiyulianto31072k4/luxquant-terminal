// flowMetrics — every derivation the two Signals flow panels draw, as pure
// functions, so the numbers can be tested without a browser and the panels can
// stay layout.
//
// Measured against the live 2026-09-20 snapshot (250 coins, 40 narratives).
// The constants below are not taste; each one is a threshold the backend or the
// data itself already defines.

/** The backend's own "high turnover" line: 24h volume >= 30% of market cap.
 *  Bars are scaled to THIS, not to the busiest coin in view. A max-scaled bar
 *  means the same coin draws a different length depending on who else is on
 *  screen — at 50 rows the median coin measured 14% of the rail, at 250 rows
 *  6%, for an unchanged number. A fixed reference is comparable across views
 *  and across days, and it says something: "a third of the way to busy". */
export const HIGH_TURNOVER = 0.3;
export const ELEVATED_TURNOVER = 0.1;

/** A week-on-week volume jump of 3x is the floor for "something woke up here".
 *  On the live snapshot 46 of 250 coins clear it and 20 of those are ours. */
export const VOL_SURGE_X = 3;

export const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

export const median = (values) => {
  const v = values.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

export const quantile = (values, p) => {
  const v = values.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.floor(p * (v.length - 1))))];
};

export const pct = (v, digits = 2) => {
  const n = num(v);
  if (n == null) return "—";
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}%`;
};

export const usdShort = (v) => {
  const n = num(v);
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(a / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `$${(a / 1e3).toFixed(0)}K`;
  return `$${a.toFixed(0)}`;
};

/** Price, at the precision the price itself deserves — $0.08365 and $117,204
 *  cannot share a format, and rounding a sub-cent coin to two places prints
 *  $0.00 for a live market. */
export const price = (v) => {
  const n = num(v);
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (a >= 1) return `$${n.toFixed(2)}`;
  if (a >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
};

/** Volume against its own level a week ago, as a MULTIPLE.
 *  The field is a percentage change spanning −92% to +12,588% on the live
 *  snapshot; "+3440%" is arithmetic nobody does in their head, "35x" is a fact
 *  you read. Below 1x means the coin is quieter than it was. */
export const volMultiple = (changePct) => {
  const n = num(changePct);
  if (n == null) return null;
  return 1 + n / 100;
};

export const fmtMultiple = (x) => {
  if (x == null) return "—";
  if (x >= 10) return `${Math.round(x)}×`;
  if (x >= 1) return `${x.toFixed(1)}×`;
  return `${x.toFixed(2)}×`;
};

/** Where a value sits in a population, 0-100.
 *
 *  This is what the turnover rail draws, and it is the only scale that works
 *  for this column. A raw ratio cannot be railed honestly: the table is sorted
 *  by turnover, so ANY fixed or quantile reference clips the whole visible
 *  head into identical full bars, and scaling to the busiest coin on screen
 *  makes the same coin draw a different length at ten rows and at two hundred.
 *  A percentile is linear, has a fixed 0-100 domain, is uniform by
 *  construction so it always uses the whole rail, and does not move when the
 *  table is filtered or re-sorted. The raw ratio stays printed beside it, so
 *  nothing is lost and the mark answers the question the number cannot:
 *  busier than how much of the market. */
export function percentileRanker(values) {
  const sorted = values.filter((v) => v != null && !Number.isNaN(v)).sort((a, b) => a - b);
  if (!sorted.length) return () => null;
  return (v) => {
    if (v == null || Number.isNaN(v)) return null;
    // Count strictly below plus half the ties — the mid-rank definition, so a
    // population of identical values sits at 50 rather than at 0 or 100.
    let lo = 0;
    let eq = 0;
    for (const x of sorted) {
      if (x < v) lo += 1;
      else if (x === v) eq += 1;
      else break;
    }
    return ((lo + eq / 2) / sorted.length) * 100;
  };
}

export function turnoverBand(intensity) {
  const v = num(intensity);
  if (v == null) return { key: "none", label: "—" };
  if (v >= HIGH_TURNOVER) return { key: "high", label: "Busy" };
  if (v >= ELEVATED_TURNOVER) return { key: "elevated", label: "Active" };
  return { key: "normal", label: "Quiet" };
}

/** Wilson half-width, in points. The same interval the backend puts on WR —
 *  repeated here so a rate we derive in the browser can never be drawn with
 *  more confidence than one the server sent. */
export function wilsonHalf(k, n) {
  if (!n || k == null) return null;
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const h = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return (h / d) * 100;
}

/** Two rates are only DIFFERENT if their intervals do not touch. Used to say
 *  out loud how much of a ranking is real: on the live 30d window this returns
 *  1 of 780 pairs for win rate. A column nobody can rank on should not be
 *  presented as a ranking. */
export function separablePairs(items) {
  let separable = 0;
  let total = 0;
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      if (a?.value == null || b?.value == null || a?.half == null || b?.half == null) continue;
      total += 1;
      if (Math.abs(a.value - b.value) > a.half + b.half) separable += 1;
    }
  }
  return { separable, total, share: total ? separable / total : 0 };
}

// ── Coin flow ───────────────────────────────────────────────────────────────

/** One row per coin, with the desk's own call attached. */
export function enrichCoins(coins = [], signalBySymbol = new Map()) {
  return coins.map((c) => {
    const sig = signalBySymbol.get(String(c.symbol || "").toUpperCase());
    const entry = sig?.entry ? Number(sig.entry) : null;
    const px = num(c.price);
    return {
      c,
      sig,
      // Both sources mean "called in the last 7 days" — the desk list is live
      // and the snapshot flag is up to four hours old, so either one counts.
      called: !!sig || !!c.is_luxquant_signal,
      fromCall: entry && px ? ((px - entry) / entry) * 100 : null,
      volX: volMultiple(c.vol_change_7d),
      band: turnoverBand(c.flow_intensity),
    };
  });
}

/** What this snapshot actually says, in the order a desk would ask it.
 *  Each finding carries the filter that proves it, so reading one and checking
 *  it are the same click. */
export function coinFindings(rows = []) {
  if (!rows.length) return [];
  const called = rows.filter((r) => r.called);
  const uncalled = rows.filter((r) => !r.called);
  const surge = rows.filter((r) => r.volX != null && r.volX >= VOL_SURGE_X);
  const busy = rows.filter((r) => r.band.key === "high");

  const out = [];

  if (surge.length) {
    const ours = surge.filter((r) => r.called).length;
    const top = [...surge].sort((a, b) => (b.volX || 0) - (a.volX || 0))[0];
    out.push({
      key: "surge",
      headline: `${surge.length} coins woke up this week`,
      detail:
        `Trading at ${VOL_SURGE_X}× or more of the volume they did seven days ago — ` +
        `${top.c.symbol} leads at ${fmtMultiple(top.volX)}. We are on ${ours} of them.`,
      count: surge.length,
      filter: { flag: "surge" },
    });
  }

  const cm = median(called.map((r) => num(r.c.price_change_7d)));
  const um = median(uncalled.map((r) => num(r.c.price_change_7d)));
  if (cm != null && um != null && called.length >= 10 && uncalled.length >= 10) {
    out.push({
      key: "ours",
      headline: `The ${called.length} coins we are on are up ${cm.toFixed(1)}% this week`,
      detail:
        `The ${uncalled.length} we are not sit at ${um.toFixed(1)}%. Median move in this ` +
        `snapshot — a description of where the desk is pointed, not a claim about what it earns.`,
      count: called.length,
      filter: { scope: "called" },
    });
  }

  if (busy.length) {
    out.push({
      key: "busy",
      headline: `${busy.length} coins traded over a third of themselves today`,
      detail:
        `24h volume above ${Math.round(HIGH_TURNOVER * 100)}% of market cap. That is churn, ` +
        `not direction — it says a coin is contested, not which way it resolves.`,
      count: busy.length,
      filter: { flag: "busy" },
    });
  }

  return out;
}

/** Two kinds of filter, because they are two kinds of question.
 *
 *  "Called" and "No call" are states a coin is IN — exclusive, so they behave
 *  like a radio. "Woke up" and "Busy" are things a coin is DOING — a coin can
 *  be both, and either can be true of a called coin or an uncalled one. Folding
 *  all five into one exclusive control made the obvious question unaskable:
 *  which of the coins we are on are also busy right now.
 */
export const CALL_SCOPES = {
  all: () => true,
  called: (r) => r.called,
  uncalled: (r) => !r.called,
};

export const TRAIT_FLAGS = {
  surge: (r) => r.volX != null && r.volX >= VOL_SURGE_X,
  busy: (r) => r.band.key === "high",
};

export const COIN_SCOPE_LABEL = {
  all: "All",
  called: "Called",
  uncalled: "No call",
  surge: "Woke up",
  busy: "Busy",
};

/** Scope AND every trait switched on. */
export function matchCoin(row, scope = "all", flags = []) {
  if (!(CALL_SCOPES[scope] || CALL_SCOPES.all)(row)) return false;
  for (const f of flags) {
    const fn = TRAIT_FLAGS[f];
    if (fn && !fn(row)) return false;
  }
  return true;
}

export function filterCoins(rows = [], scope = "all", flags = []) {
  return rows.filter((r) => matchCoin(r, scope, flags));
}

/** What a chip would leave you with if you clicked it — the count has to be the
 *  count of the result, not of the trait in isolation, or a badge promises 41
 *  rows and hands over 6. */
export function coinCounts(rows = [], scope = "all", flags = []) {
  const others = (f) => flags.filter((x) => x !== f);
  const out = { scopes: {}, flags: {} };
  for (const k of Object.keys(CALL_SCOPES)) out.scopes[k] = filterCoins(rows, k, flags).length;
  for (const k of Object.keys(TRAIT_FLAGS)) {
    const on = flags.includes(k);
    out.flags[k] = filterCoins(rows, scope, on ? flags : [...flags, k]).length;
    // What switching it OFF would give, so a chip that is on still shows the
    // size of what it is holding rather than of what removing it would open.
    if (on) out.flags[k] = filterCoins(rows, scope, flags).length;
    void others;
  }
  return out;
}

export function sortCoins(rows, key, dir) {
  const val = (x) => {
    switch (key) {
      case "coin":
        return x.c.symbol || "";
      case "price":
        return num(x.c.price);
      case "chg":
        return num(x.c.price_change_24h);
      case "chg7":
        return num(x.c.price_change_7d);
      case "chg30":
        return num(x.c.price_change_30d);
      case "vol":
        return x.volX;
      case "cap":
        return num(x.c.market_cap);
      case "fromcall":
        return x.fromCall;
      case "status":
        return x.sig ? statusRank(x.sig.status) : null;
      case "called":
        return x.sig?.created_at ? new Date(x.sig.created_at).getTime() : null;
      case "intensity":
      default:
        return num(x.c.flow_intensity);
    }
  };
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    // Nulls sort LAST in both directions. Folding them to ±Infinity floats
    // never-traded rows to the top of one of the two orders, which is how the
    // Agent monitor once ranked six silent accounts above every real one.
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string") return sign * String(va).localeCompare(String(vb));
    return sign * (va - vb);
  });
}

export function statusRank(st) {
  const s = String(st || "").toLowerCase();
  if (!st) return null;
  if (s === "sl" || s === "closed_loss") return 0;
  if (s === "open") return 1;
  if (s.startsWith("tp")) return 1 + (parseInt(s.slice(2), 10) || 1);
  if (s === "closed_win") return 6;
  return 1;
}

export function statusMeta(st) {
  const s = String(st || "").toLowerCase();
  if (s === "sl" || s === "closed_loss") return { l: "SL", c: "bg-loss/12 text-loss" };
  if (s === "closed_win") return { l: "Win", c: "bg-profit/12 text-profit" };
  if (s.startsWith("tp")) return { l: s.toUpperCase(), c: "bg-profit/12 text-profit" };
  return { l: "Open", c: "bg-accent/12 text-accent" };
}

/** Which narratives a coin sits in, inverted from the narrative payload. A coin
 *  sits in a median of 4, so this is the cheapest real depth on the page: it
 *  turns a ticker into "and here is the company it keeps". */
export function narrativesBySymbol(narratives = []) {
  const m = new Map();
  for (const n of narratives) {
    for (const p of n.pairs || []) {
      const s = String(p).replace(/USDT$/i, "").toUpperCase();
      if (!m.has(s)) m.set(s, []);
      m.get(s).push(n);
    }
  }
  return m;
}

// ── Narratives ──────────────────────────────────────────────────────────────

export const relStrength = (n, market) => {
  const v = num(n?.mcap_change_7d);
  if (v == null) return null;
  return v - (num(market) ?? 0);
};

/** A scale that survives an outlier.
 *
 *  On the live window one narrative sits 95.8 points ahead of the market while
 *  the median is 4.4. Scaled to the maximum, every bar but the first is under
 *  five pixels and the panel shows one fact instead of twelve. So the rail is
 *  scaled to the 90th percentile and anything past it is drawn full length with
 *  an overflow mark — the ranking is intact, the reading is honest, and the
 *  outlier is still visibly an outlier because it is the one that is clipped. */
export function barScale(values, p = 0.9) {
  const abs = values.filter((v) => v != null).map(Math.abs);
  if (!abs.length) return { ref: 1, max: 1, clipped: 0 };
  const ref = quantile(abs, p) || Math.max(...abs) || 1;
  return {
    ref: Math.max(ref, 0.001),
    max: Math.max(...abs),
    clipped: abs.filter((v) => v > ref).length,
  };
}

export function barWidth(value, ref) {
  if (value == null || !ref) return { w: 0, over: false };
  const a = Math.abs(value);
  return { w: Math.min(100, (a / ref) * 100), over: a > ref };
}

/** The finding that decides how this table should be read.
 *
 *  Win rate across narratives is 83–94 with intervals of ±2 to ±8 points: on
 *  the live 30-day window exactly 1 pair of 780 is separable, and at 90 days
 *  with three times the sample it is 5. Typical peak is a different story —
 *  9.1% to 25.7%, and a bootstrap separates 17% of pairs. So the desk can say
 *  which narrative runs FURTHER, and cannot say which one wins MORE OFTEN.
 *  The panel prints that rather than quietly ranking on the flat column. */
export function narrativeFinding(narratives = []) {
  const rows = narratives.filter((x) => x?.wr != null && x?.wr_ci_half != null);
  if (rows.length < 4) return null;
  const wr = separablePairs(rows.map((x) => ({ value: x.wr, half: x.wr_ci_half })));
  const peaks = narratives.map((x) => num(x.median_peak)).filter((v) => v != null);
  if (peaks.length < 4) return null;
  const lo = Math.min(...peaks);
  const hi = Math.max(...peaks);
  const wrLo = Math.min(...rows.map((x) => x.wr));
  const wrHi = Math.max(...rows.map((x) => x.wr));
  return {
    wrSeparable: wr.separable,
    wrPairs: wr.total,
    wrLo,
    wrHi,
    peakLo: lo,
    peakHi: hi,
    peakSpread: hi / (lo || 1),
  };
}

export function sortNarratives(rows, key) {
  const val = (x) => {
    switch (key) {
      case "move":
        return num(x.mcap_change_24h);
      case "coins":
        return num(x.coins_called);
      case "tp3":
        return num(x.full_tp_rate);
      case "peak":
      default:
        return num(x.median_peak);
    }
  };
  return [...rows].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return vb - va;
  });
}
