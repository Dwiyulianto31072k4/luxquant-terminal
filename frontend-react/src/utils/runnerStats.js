// Pure helpers for the Runners results page. The server sends COUNTS
// (hunt-full-tp `dashboard`); every rate, range and label is derived here so the
// page, its tooltips and its table can never disagree about a number.

export const OUTCOMES = ["sl", "tp1", "tp2", "tp3", "tp4"];

/** 95% Wilson range for k successes in n, in percent. [lo, hi] or null. */
export function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n;
  const den = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / den;
  const half = (z / den) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, centre - half) * 100, Math.min(1, centre + half) * 100];
}

/** Rates from a counts object {n, open, sl, tp1..tp4}. `reached` levels are
 *  cumulative (a TP4 also reached TP1-TP3); `share` is the final mix (sums to
 *  100). Null when nothing has finished. */
export function rates(c) {
  if (!c || !c.n) return null;
  const f = (k) => Number(c[k]) || 0;
  const n = c.n;
  const tp3p = f("tp3") + f("tp4");
  const tp2p = f("tp2") + tp3p;
  const tp1p = f("tp1") + tp2p;
  const pct = (x) => (100 * x) / n;
  return {
    n,
    open: f("open"),
    tp1: pct(tp1p),
    tp2: pct(tp2p),
    tp3: pct(tp3p),
    tp4: pct(f("tp4")),
    sl: pct(f("sl")),
    share: Object.fromEntries(OUTCOMES.map((k) => [k, pct(f(k))])),
    count: Object.fromEntries(OUTCOMES.map((k) => [k, f(k)])),
    ci: { tp3: wilson(tp3p, n), sl: wilson(f("sl"), n), tp1: wilson(tp1p, n) },
  };
}

/** A series point [finished, tp3+, sl, tp1+] as rates; null under `minN`. */
export function pointRates(p, minN = 1) {
  if (!Array.isArray(p) || !p[0] || p[0] < minN) return null;
  const [n, full, sl, win] = p;
  return { n, tp3: (100 * full) / n, sl: (100 * sl) / n, tp1: (100 * win) / n };
}

export const fmtPct = (v, d = 1) =>
  v == null || !Number.isFinite(Number(v)) ? "—" : `${Number(v).toFixed(d)}%`;

export const fmtPp = (v, d = 1) =>
  v == null || !Number.isFinite(Number(v)) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}pp`;

/** Hours as a reader says them: 25 min, 4.2 h, 1.3 days. */
export function fmtHours(h) {
  if (h == null || !Number.isFinite(Number(h))) return "—";
  const x = Number(h);
  if (x < 1) return `${Math.max(1, Math.round(x * 60))} min`;
  if (x < 48) return `${x < 10 ? x.toFixed(1) : Math.round(x)} h`;
  return `${(x / 24).toFixed(1)} days`;
}

/** "56 of every 100" — the natural-frequency reading of a rate. */
export const perHundred = (v) => (v == null ? null : Math.round(v));

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "8 Sep" from an ISO day. */
export function fmtDay(iso) {
  if (!iso) return "";
  const [, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return m && d ? `${d} ${MON[m - 1]}` : String(iso);
}

/** Point difference between two rates, or null. */
export const diff = (a, b) => (a == null || b == null ? null : a - b);
