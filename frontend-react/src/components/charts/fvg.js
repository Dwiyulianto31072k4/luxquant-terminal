// src/components/charts/fvg.js
//
// Fair Value Gap / Inversion FVG detection.
//
// FVG is a public ICT concept: a three-candle imbalance where the outer wicks
// fail to overlap, leaving a price band that was crossed without two-sided
// trade. This is an independent implementation of that definition — no third
// party's code is used. That matters here: the well-known TradingView versions
// are either published under a NonCommercial licence or closed source, and
// LuxQuant is a paid product. The idea is common property; their code is not.
//
// Pure functions, no React and no chart library, so the rules can be tested
// without mounting anything.

/** When a gap counts as filled. This single choice is the biggest reason two
 *  FVG indicators disagree on screen, so it is exposed rather than assumed. */
export const MITIGATION = {
  WICK: "wick",       // any touch of the far edge
  CLOSE: "close",     // a candle must close past the far edge
  AVERAGE: "average", // price reaches the midpoint — ICT's consequent encroachment
  NONE: "none",       // zones persist
};

export const DEFAULTS = {
  mitigation: MITIGATION.AVERAGE,
  autoThreshold: true,
  thresholdPct: 0,     // used when autoThreshold is false; 0 keeps every gap
  requireConfirm: true,
  showInversions: true,
  maxZones: 40,
  clusterBars: 5,
};

/** Mean relative bar range — the yardstick for "is this gap big enough to care".
 *  Scaling by price keeps one threshold usable across a $60k pair and a $0.0001
 *  one, which a fixed percentage cannot do. */
export function meanRelativeRange(candles) {
  if (!candles?.length) return 0;
  let sum = 0;
  let n = 0;
  for (const c of candles) {
    if (c.low > 0) {
      sum += (c.high - c.low) / c.low;
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Detect fair value gaps, then walk forward to resolve what happened to each.
 *
 * @param {Array<{time:number,open:number,high:number,low:number,close:number}>} candles
 *        Ascending by time.
 * @param {object} [options] See DEFAULTS.
 * @returns {Array} zones, oldest first.
 */
export function detectFVGs(candles, options = {}) {
  const o = { ...DEFAULTS, ...options };
  if (!Array.isArray(candles) || candles.length < 3) return [];

  const threshold = o.autoThreshold
    ? meanRelativeRange(candles)
    : Math.max(0, Number(o.thresholdPct) || 0) / 100;

  const zones = [];

  for (let i = 2; i < candles.length; i += 1) {
    const a = candles[i - 2];
    const mid = candles[i - 1];
    const c = candles[i];

    // Bullish: this low sits entirely above the high two bars back.
    const bull = c.low > a.high;
    // Bearish: this high sits entirely below the low two bars back.
    const bear = c.high < a.low;
    if (!bull && !bear) continue;

    // The middle candle must have closed through the gap edge. Without this a
    // sideways wick straddle registers as an imbalance, which is where naive
    // implementations produce their noise.
    if (o.requireConfirm) {
      if (bull && !(mid.close > a.high)) continue;
      if (bear && !(mid.close < a.low)) continue;
    }

    const top = bull ? c.low : a.low;
    const bottom = bull ? a.high : c.high;
    const height = top - bottom;
    if (!(height > 0) || !(bottom > 0)) continue;
    if (height / bottom < threshold) continue;

    // Suppress a same-direction zone stacked on top of a very recent one; a
    // trending leg otherwise prints a ladder of near-identical bands.
    if (o.clusterBars > 0) {
      const recent = zones[zones.length - 1];
      if (
        recent &&
        recent.dir === (bull ? "bull" : "bear") &&
        i - recent.index < o.clusterBars
      ) {
        continue;
      }
    }

    zones.push({
      dir: bull ? "bull" : "bear",
      index: i,
      time: c.time,
      top,
      bottom,
      mid: (top + bottom) / 2,
      mitigatedAt: null,
      invertedAt: null,
      invalidatedAt: null,
    });
  }

  resolveZones(zones, candles, o);

  // Keep the most recent zones; older ones are usually far off-screen.
  return o.maxZones > 0 && zones.length > o.maxZones
    ? zones.slice(zones.length - o.maxZones)
    : zones;
}

/** Walk each zone forward through later candles to find when it was filled,
 *  and — if it was closed straight through — when it flipped polarity. */
function resolveZones(zones, candles, o) {
  for (const z of zones) {
    for (let j = z.index + 1; j < candles.length; j += 1) {
      const k = candles[j];

      if (z.mitigatedAt === null && o.mitigation !== MITIGATION.NONE) {
        if (isMitigated(z, k, o.mitigation)) z.mitigatedAt = k.time;
      }

      // Inversion is a stricter event than mitigation: the candle BODY has to
      // close beyond the gap, not merely wick into it. A bullish gap closed
      // through stops being support and starts acting as resistance.
      if (o.showInversions && z.invertedAt === null) {
        const through =
          z.dir === "bull" ? k.close < z.bottom : k.close > z.top;
        if (through) z.invertedAt = k.time;
      } else if (o.showInversions && z.invalidatedAt === null) {
        // Once inverted, a close back the other way retires the zone.
        const back = z.dir === "bull" ? k.close > z.top : k.close < z.bottom;
        if (back) {
          z.invalidatedAt = k.time;
          break;
        }
      }

      if (z.mitigatedAt !== null && !o.showInversions) break;
    }
  }
}

function isMitigated(z, k, method) {
  if (z.dir === "bull") {
    // Filled from above: price returns down into the gap.
    if (method === MITIGATION.WICK) return k.low <= z.top;
    if (method === MITIGATION.CLOSE) return k.close <= z.bottom;
    return k.low <= z.mid; // AVERAGE
  }
  if (method === MITIGATION.WICK) return k.high >= z.bottom;
  if (method === MITIGATION.CLOSE) return k.close >= z.top;
  return k.high >= z.mid; // AVERAGE
}

/** Split into what should be drawn as a live gap vs a flipped zone. */
export function partitionZones(zones) {
  const open = [];
  const inverted = [];
  for (const z of zones) {
    if (z.invalidatedAt) continue;
    if (z.invertedAt) inverted.push(z);
    else if (!z.mitigatedAt) open.push(z);
  }
  return { open, inverted };
}
