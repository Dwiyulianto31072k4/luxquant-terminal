// ── Support / resistance ─────────────────────────────────────────────────────
// Built to the method the research converges on, not the easy one.
//
// A rolling max/min — the first thing anyone writes — returns the extreme price
// in a window and knows nothing about whether the market respected it. One wild
// wick becomes "resistance". Everything below exists to replace that guess with
// evidence:
//
//   1. PIVOTS      Williams fractal, W bars each side. A bar price TURNED at.
//   2. CLUSTER     pivots inside a volatility-scaled tolerance collapse into one
//                  zone, so a shelf tested five times is one level with five
//                  touches, not five levels with one.
//   3. VOLUME      a volume-by-price profile over the same candles. The
//                  literature weights traded volume ABOVE touch count — where
//                  size changed hands is where consensus actually formed.
//   4. CONFLUENCE  a level echoed on other timeframes is stronger than one that
//                  only exists on the chart you happen to be looking at.
//   5. LIQUIDITY   resting order-book size at the zone: past commitment
//                  confirmed by present intent, which the research calls the
//                  strongest confirmation available.
//
// Zones, never lines. The width comes out of the clustering and is carried
// through to the UI, because price reacts to an area.

const SR_PIVOT_W = 2; // bars each side; 2 is the standard fractal width
const SR_MIN_TOUCH = 2; // prefer a level price has come back to at least once
const PROFILE_BINS = 120;

export const SR_TFS = ["15m", "30m", "1h", "4h", "1d"];

const num = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

export function srPivots(rows, hi, lo, w = SR_PIVOT_W) {
  const highs = [];
  const lows = [];
  for (let i = w; i < rows.length - w; i++) {
    const h = num(rows[i][hi]);
    const l = num(rows[i][lo]);
    if (h === null || l === null) continue;
    let isHigh = true;
    let isLow = true;
    for (let j = i - w; j <= i + w && (isHigh || isLow); j++) {
      if (j === i) continue;
      if (num(rows[j][hi]) >= h) isHigh = false;
      if (num(rows[j][lo]) <= l) isLow = false;
    }
    if (isHigh) highs.push({ p: h, i });
    if (isLow) lows.push({ p: l, i });
  }
  return { highs, lows };
}

// Tolerance tracks the coin's own volatility: 0.5% is a wide band on BTC and
// noise on a microcap. Median candle range is a cheap, robust stand-in for ATR
// with no warm-up. The 3% cap is load-bearing — at 1.5% a daily chart on a
// volatile alt split one shelf into nineteen zones of a single touch each.
export function srTolerance(rows, hi, lo, close) {
  const ranges = [];
  for (const r of rows) {
    const h = num(r[hi]);
    const l = num(r[lo]);
    const c = num(r[close]);
    if (h > 0 && l > 0 && c > 0) ranges.push((h - l) / c);
  }
  if (!ranges.length) return 0.005;
  ranges.sort((a, b) => a - b);
  return Math.min(0.03, Math.max(0.0025, ranges[Math.floor(ranges.length / 2)] * 0.75));
}

// A price can print several fractals within a few bars while wobbling against
// the same level. Counting each as a separate test is the false positive the
// research warns about, and it is not rare: measured across 219 zones on five
// timeframes, 59% had their touch count inflated this way and one had ALL of
// its "touches" inside a single visit. So touches are counted as VISITS —
// pivots closer together than this are one approach, not several.
const SR_MIN_BARS_BETWEEN_TOUCHES = 5;

function countVisits(indices) {
  if (!indices.length) return 0;
  const sorted = [...indices].sort((a, b) => a - b);
  let visits = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > SR_MIN_BARS_BETWEEN_TOUCHES) visits++;
  }
  return visits;
}

export function srCluster(points, tol) {
  const sorted = [...points].sort((a, b) => a.p - b.p);
  const zones = [];
  for (const pt of sorted) {
    const last = zones[zones.length - 1];
    if (last && Math.abs(pt.p - last.price) / last.price <= tol) {
      last.pts.push(pt.p);
      last.idx.push(pt.i);
      last.price = last.pts.reduce((s, x) => s + x, 0) / last.pts.length;
      last.lo = Math.min(last.lo, pt.p);
      last.hi = Math.max(last.hi, pt.p);
      last.newest = Math.max(last.newest, pt.i);
    } else {
      zones.push({ price: pt.p, lo: pt.p, hi: pt.p, pts: [pt.p], idx: [pt.i], newest: pt.i });
    }
  }
  return zones.map((z) => ({
    price: z.price,
    lo: z.lo,
    hi: z.hi,
    touches: countVisits(z.idx),
    pivots: z.pts.length,
    newest: z.newest,
  }));
}

/** Volume-by-price over the window. A candle's volume is spread evenly across
 *  the bins its range covers — an approximation, because OHLCV does not say
 *  where inside the bar the size traded, but it is the standard one and far
 *  better than ignoring volume entirely. */
export function volumeProfile(rows, { hi, lo, vol }) {
  let min = Infinity;
  let max = -Infinity;
  for (const r of rows) {
    const h = num(r[hi]);
    const l = num(r[lo]);
    if (h > 0) max = Math.max(max, h);
    if (l > 0) min = Math.min(min, l);
  }
  if (!(max > min)) return null;
  const step = (max - min) / PROFILE_BINS;
  const bins = new Array(PROFILE_BINS).fill(0);
  let total = 0;
  for (const r of rows) {
    const h = num(r[hi]);
    const l = num(r[lo]);
    const v = num(r[vol]);
    if (!(h > 0) || !(l > 0) || !(v > 0)) continue;
    const a = Math.max(0, Math.min(PROFILE_BINS - 1, Math.floor((l - min) / step)));
    const b = Math.max(0, Math.min(PROFILE_BINS - 1, Math.floor((h - min) / step)));
    const share = v / (b - a + 1);
    for (let k = a; k <= b; k++) bins[k] += share;
    total += v;
  }
  if (!(total > 0)) return null;
  let pocIdx = 0;
  for (let k = 1; k < bins.length; k++) if (bins[k] > bins[pocIdx]) pocIdx = k;
  return {
    min,
    step,
    bins,
    total,
    poc: min + (pocIdx + 0.5) * step,
    /** Share of all traded volume that changed hands inside a price band. */
    shareBetween(loP, hiP) {
      const a = Math.max(0, Math.min(PROFILE_BINS - 1, Math.floor((loP - min) / step)));
      const b = Math.max(0, Math.min(PROFILE_BINS - 1, Math.floor((hiP - min) / step)));
      let s = 0;
      for (let k = a; k <= b; k++) s += bins[k];
      return s / total;
    },
  };
}



/** Signed Kaufman efficiency ratio over the last 50 closes: net move divided by
 *  the path actually walked. Near +1 the market climbed in a straight line,
 *  near 0 it thrashed and ended where it started.
 *
 *  Thresholds are the terciles of 6,528 measured samples, not a textbook
 *  constant — a fixed 0.3 cut put 94% of samples in one bucket and tested
 *  nothing. Crypto's slight upward drift is why they are not symmetric.
 *
 *  This matters because the regime decides whether a level is worth anything,
 *  and the measured answer inverts the usual advice. Walk-forward over 12 pairs
 *  x 4 timeframes, zone vs a distance-matched control:
 *
 *    resistance, uptrend    49.8% vs 43.6%  z +2.37   edge
 *    resistance, downtrend  56.3% vs 51.1%  z +2.04   edge
 *    resistance, range      53.3% vs 53.0%  z +0.10   none
 *    support,    range      59.5% vs 57.6%  z +0.61   none
 *    support,    uptrend    60.5% vs 65.9%  z -2.38   WORSE than random
 *
 *  In a range everything bounces, so structure adds nothing. In a trend a
 *  random level gets run through while real resistance still stalls price —
 *  that is where the work pays. Support never earns its keep, and in an uptrend
 *  it is actively misleading, so the UI has to say so.  */
const ER_LEN = 50;
const ER_DOWN = -0.054;
const ER_UP = 0.093;

export function marketRegime(bars, close) {
  const seg = bars.slice(-ER_LEN).map((b) => Number(b[close]));
  if (seg.length < 10) return null;
  const net = seg[seg.length - 1] - seg[0];
  let path = 0;
  for (let i = 1; i < seg.length; i++) path += Math.abs(seg[i] - seg[i - 1]);
  if (!(path > 0)) return null;
  const er = net / path;
  return er < ER_DOWN ? "down" : er > ER_UP ? "up" : "range";
}

/** Has price already traded through this level inside the window and come back?
 *
 *  Measured, not assumed: across 10 pairs x 4 timeframes walk-forward, a
 *  RESISTANCE price had previously traded above held 55.1% of the time against
 *  51.3% for one it had not (z = +2.27). For support the same test found
 *  nothing (60.5% vs 60.9%, z = -0.25) — consistent with levels below price in
 *  leveraged crypto being liquidity to sweep rather than a floor.
 *
 *  Using it to CHOOSE the level was also tested and did not help (z = +0.34),
 *  so it is reported as evidence about the level shown, never as a selector.
 *
 *  The upper bound matters: in a trend every level has price on the far side,
 *  which would make the flag meaningless.  */
function isFlipped(bars, close, level, above) {
  let farSide = 0;
  for (const b of bars) {
    const c = Number(b[close]);
    if (above ? c > level : c < level) farSide++;
  }
  return farSide >= 3 && farSide <= bars.length * 0.4;
}

/** Concentration of resting size at a zone: the AVERAGE order at these prices
 *  against the average order across the whole book. 1.0 is ordinary, 3.0 means
 *  orders three times the usual size are parked there. 0 means the book does
 *  not reach this level at all, which is common and is the honest answer.
 *
 *  Two earlier attempts were wrong in ways only real data exposed.
 *  Share-of-book reported ~100% for every level, because `depth?limit=1000`
 *  spans a thin band and any zone inside it captured the lot. Normalising by
 *  PRICE SPAN then blew up to 11,652x on ROBO, because a handful of far-out
 *  levels stretched the span while carrying almost no size. Counting per ORDER
 *  is immune to both.  */
function wallDensity(book, loP, hiP) {
  if (!book?.length) return 0;
  let inQty = 0;
  let inN = 0;
  let allQty = 0;
  let allN = 0;
  for (const [p, q] of book) {
    if (!(q > 0)) continue;
    allQty += q;
    allN++;
    if (p >= loP && p <= hiP) {
      inQty += q;
      inN++;
    }
  }
  if (!inN || !allN) return 0;
  return inQty / inN / (allQty / allN);
}



/** Score a zone. Weights follow the published formula — volume above touches —
 *  with confluence and resting liquidity as the two confirmations the research
 *  singles out. Kept as named parts so the UI can say WHY a level scored. */
function scoreZone(z, { volShare, maxVolShare, confluence, wall }) {
  const vol = maxVolShare > 0 ? volShare / maxVolShare : 0;
  return {
    ...z,
    volShare,
    volRel: vol,
    confluence,
    wall,
    // Exactly the formula that was backtested — nothing more. Cross-timeframe
    // agreement used to add +25 per timeframe here and was never in any
    // harness; when it was finally tested it turned out to be worthless for
    // resistance (z 0.75) and INVERTED for support, where 3 agreeing
    // timeframes held 52.7% against 66.3% for none (z -2.35). An untested term
    // steering the selection is exactly how a tool starts lying.
    score:
      Math.min(z.touches, 6) * 30 +
      vol * 70 +
      // Density 1.0 is average and earns nothing; a 3x wall earns the cap.
      // NOTE: this term cannot be backtested — Binance publishes no historical
      // order book — so it is capped low and describes the book NOW rather
      // than predicting anything.
      Math.min(Math.max(wall - 1, 0) * 20, 40),
  };
}

/** Zones for one timeframe. `book` is [ [price, qty], ... ] on the matching
 *  side, `others` are the zone lists already computed for other timeframes. */
export function srZones(rows, { hi, lo, close, vol, newestFirst = false, price = null }) {
  if (!Array.isArray(rows) || rows.length < 20) return null;
  // Drop the candle still forming: counted, it pins a level to the live price
  // the instant price makes a new extreme, and a level you are always touching
  // tells the reader nothing.
  const bars = newestFirst ? rows.slice(1).reverse() : rows.slice(0, -1);
  if (bars.length < 20) return null;
  const lastClose = num(bars[bars.length - 1][close]);
  // Zones are built from CLOSED bars, but which SIDE of the market they fall on
  // must be judged against the live price. Using the last close printed a daily
  // "resistance" below the market whenever price had risen since yesterday.
  const ref = num(price) > 0 ? num(price) : lastClose;
  if (!(ref > 0)) return null;

  const tol = srTolerance(bars, hi, lo, close);
  const { highs, lows } = srPivots(bars, hi, lo);
  const profile = volumeProfile(bars, { hi, lo, vol });
  return {
    tol,
    ref,
    profile,
    bars,
    closeIdx: close,
    regime: marketRegime(bars, close),
    above: srCluster(highs, tol),
    below: srCluster(lows, tol),
  };
}

/** Final pick for one side, once every timeframe has been clustered. */
export function srPick(tfData, side, { book, otherTfZones }) {
  const zones = tfData[side];
  if (!zones?.length) return null;
  const above = side === "above";
  const candidates = zones
    .filter((z) => (above ? z.price > tfData.ref : z.price < tfData.ref))
    .sort((a, b) => (above ? a.price - b.price : b.price - a.price))
    .slice(0, 6); // only levels price could plausibly meet next
  if (!candidates.length) return null;

  const shares = candidates.map((z) =>
    tfData.profile ? tfData.profile.shareBetween(z.lo, z.hi) : 0
  );
  const maxShare = Math.max(...shares, 0);

  const scored = candidates.map((z, i) => {
    const pad = z.price * tfData.tol;
    // A level echoed on another timeframe: count how many others have a zone
    // on the same side within this timeframe's own tolerance.
    const confluence = (otherTfZones || []).reduce(
      (n, list) =>
        n + (list.some((o) => Math.abs(o - z.price) / z.price <= tfData.tol) ? 1 : 0),
      0
    );
    return scoreZone(z, {
      volShare: shares[i],
      maxVolShare: maxShare,
      confluence,
      wall: wallDensity(book, z.lo - pad, z.hi + pad),
    });
  });

  // A trader wants the level price meets NEXT. A stronger zone may win, but
  // only from close behind: unbounded, this promoted a 7-touch daily zone 16.5%
  // away over one 1% away, which is not a level anyone is about to trade.
  const nearest = scored[0];
  const dist = (z) => Math.abs(z.price - tfData.ref) / tfData.ref;
  // Reach has to clear a few zone-widths or a strong shelf just past the first
  // weak one is unreachable — 1.6x nearest left BTC 1h stuck on a 1-touch zone
  // while a 7-touch shelf sat 1.6% away. Hard-capped at 8% so a distant giant
  // can never masquerade as the next level; nearest is always inside it.
  const reach = Math.min(
    Math.max(dist(nearest) * 2, tfData.tol * 4),
    Math.max(dist(nearest), 0.08)
  );
  const inReach = scored.filter((z) => dist(z) <= reach);
  const pool = inReach.length ? inReach : [nearest];
  const withTouches = pool.filter((z) => z.touches >= SR_MIN_TOUCH);
  const finalPool = withTouches.length ? withTouches : pool;
  const winner = [...finalPool].sort((a, b) => b.score - a.score)[0];
  return {
    ...winner,
    flipped: isFlipped(tfData.bars, tfData.closeIdx, winner.price, above),
  };
}

const BYBIT_TF = { "15m": "15", "30m": "30", "1h": "60", "4h": "240", "1d": "D" };
const BARS = 200;

async function klines(symbol, tf) {
  try {
    const r = await fetch(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${tf}&limit=${BARS}`
    );
    if (r.ok) return { rows: await r.json(), newestFirst: false };
  } catch {
    /* fall through */
  }
  try {
    const r = await fetch(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}` +
        `&interval=${BYBIT_TF[tf] || "60"}&limit=${BARS}`
    );
    if (r.ok) {
      const kj = await r.json();
      return { rows: kj?.result?.list || [], newestFirst: true };
    }
  } catch {
    /* both unreachable */
  }
  return null;
}

async function orderBook(symbol) {
  try {
    const r = await fetch(
      `https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=1000`
    );
    if (!r.ok) return null;
    const d = await r.json();
    const conv = (a) => (a || []).map(([p, q]) => [Number(p), Number(q)]);
    return { bids: conv(d.bids), asks: conv(d.asks) };
  } catch {
    // Optional evidence, never a blocker: without it a level simply carries no
    // liquidity confirmation.
    return null;
  }
}

/** Every timeframe at once, so confluence can be measured and switching tabs
 *  costs nothing. Six requests per refresh against the modal's existing 66 per
 *  minute — the levels only move when a candle closes, so this runs on a slow
 *  timer of its own rather than the 10s price poll. */
export async function fetchAllLevels(symbol, price) {
  const [book, ...packs] = await Promise.all([
    orderBook(symbol),
    ...SR_TFS.map((tf) => klines(symbol, tf)),
  ]);

  const raw = {};
  SR_TFS.forEach((tf, i) => {
    const pack = packs[i];
    if (!pack?.rows?.length) return;
    const z = srZones(pack.rows, {
      hi: 2,
      lo: 3,
      close: 4,
      vol: 5,
      newestFirst: pack.newestFirst,
      price,
    });
    if (z) raw[tf] = z;
  });
  if (!Object.keys(raw).length) return null;

  const out = {};
  for (const tf of Object.keys(raw)) {
    const others = Object.keys(raw).filter((k) => k !== tf);
    out[tf] = {
      tol: raw[tf].tol,
      poc: raw[tf].profile?.poc ?? null,
      regime: raw[tf].regime,
      resistance: srPick(raw[tf], "above", {
        book: book?.asks,
        otherTfZones: others.map((k) => raw[k].above.map((z) => z.price)),
      }),
      support: srPick(raw[tf], "below", {
        book: book?.bids,
        otherTfZones: others.map((k) => raw[k].below.map((z) => z.price)),
      }),
    };
  }
  out._hasBook = Boolean(book);
  return out;
}
