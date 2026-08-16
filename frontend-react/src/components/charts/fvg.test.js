// Tests for Fair Value Gap detection.
//
// These rules decide what a trader sees as "unfilled institutional imbalance",
// so a wrong answer here points them at a level that was never there. Two
// distinctions carry most of the weight and are easy to get subtly wrong:
//
//   · MITIGATION decides when a gap is spent. Wick, close, and midpoint give
//     three different charts from one dataset, and this single choice is the
//     main reason two FVG indicators disagree on screen.
//   · INVERSION requires a candle BODY to close through the gap. A wick that
//     pierces and recovers has not inverted anything — treating it as an
//     inversion flips the zone's meaning while price is still respecting it.

import { describe, it, expect } from "vitest";
import {
  detectFVGs,
  partitionZones,
  meanRelativeRange,
  meanRelativeHeight,
  MITIGATION,
} from "./fvg";

const c = (time, open, high, low, close) => ({ time, open, high, low, close });

// Textbook bullish gap: bar 3's low (110) clears bar 1's high (100), and the
// middle bar closed above 100, so the imbalance is confirmed. Gap = 100..110.
const BULL = [
  c(1, 95, 100, 90, 99),
  c(2, 99, 118, 98, 117),
  c(3, 117, 125, 110, 120),
];

const bare = { autoThreshold: false, clusterBars: 0 };

describe("detection", () => {
  it("finds a bullish gap and reports its exact bounds", () => {
    const [z] = detectFVGs(BULL, { ...bare, showInversions: false });
    expect(z).toMatchObject({ dir: "bull", bottom: 100, top: 110, mid: 105 });
  });

  it("finds the bearish mirror", () => {
    const bear = [
      c(1, 125, 130, 120, 122),
      c(2, 122, 123, 104, 105),
      c(3, 105, 110, 100, 102),
    ];
    const [z] = detectFVGs(bear, { ...bare, showInversions: false });
    expect(z).toMatchObject({ dir: "bear", bottom: 110, top: 120 });
  });

  it("rejects a gap whose middle candle never closed through it", () => {
    // Same geometry as BULL, but bar 2 closes at 99 — below the 100 edge. The
    // wicks straddle without the imbalance being confirmed.
    const unconfirmed = [c(1, 95, 100, 90, 99), c(2, 99, 118, 98, 99), c(3, 117, 125, 110, 120)];
    expect(detectFVGs(unconfirmed, bare)).toHaveLength(0);
    expect(detectFVGs(unconfirmed, { ...bare, requireConfirm: false })).toHaveLength(1);
  });

  it("survives degenerate input", () => {
    expect(detectFVGs([])).toEqual([]);
    expect(detectFVGs(null)).toEqual([]);
    expect(detectFVGs(BULL.slice(0, 2))).toEqual([]);
  });
});

describe("mitigation", () => {
  // Gap is 100..110, midpoint 105. Bar 4 is the pullback under test.
  // The method is always passed explicitly: the default is AVERAGE, so a test
  // that omits it silently checks the wrong rule.
  const after = (method, low, close) =>
    detectFVGs([...BULL, c(4, 120, 121, low, close)], {
      ...bare,
      showInversions: false,
      mitigation: method,
    })[0];

  it("wick: any touch of the near edge spends the gap", () => {
    expect(after(MITIGATION.WICK, 109, 120).mitigatedAt).toBe(4);
    expect(after(MITIGATION.WICK, 111, 120).mitigatedAt).toBeNull();
  });

  it("average: reaching the midpoint spends it — ICT consequent encroachment", () => {
    expect(after(MITIGATION.AVERAGE, 104, 120).mitigatedAt).toBe(4);
    expect(after(MITIGATION.AVERAGE, 106, 120).mitigatedAt).toBeNull();
  });

  it("close: a wick through is not enough, the body must settle past it", () => {
    expect(after(MITIGATION.CLOSE, 95, 99).mitigatedAt).toBe(4);
    expect(after(MITIGATION.CLOSE, 95, 120).mitigatedAt).toBeNull();
  });

  it("none: zones persist through anything", () => {
    expect(after(MITIGATION.NONE, 50, 55).mitigatedAt).toBeNull();
  });
});

describe("inversion", () => {
  it("ignores a wick that pierces and recovers", () => {
    const wick = [...BULL, c(4, 120, 121, 95, 120)];
    expect(detectFVGs(wick, bare)[0].invertedAt).toBeNull();
  });

  it("flips the zone when a body closes through it", () => {
    const body = [...BULL, c(4, 120, 121, 95, 98)];
    expect(detectFVGs(body, bare)[0].invertedAt).toBe(4);
  });

  it("retires an inverted zone once price closes back the other way", () => {
    const back = [...BULL, c(4, 120, 121, 95, 98), c(5, 98, 115, 97, 112)];
    expect(detectFVGs(back, bare)[0].invalidatedAt).toBe(5);
  });

  it("moves a flipped zone out of the open list", () => {
    const body = [...BULL, c(4, 120, 121, 95, 98)];
    const { open, inverted } = partitionZones(detectFVGs(body, bare));
    expect(open).toHaveLength(0);
    expect(inverted).toHaveLength(1);
  });
});

describe("auto threshold", () => {
  // Appends a bullish gap of `width`, continuing from the running price.
  // Each block MUST start where the last one closed: rebasing to a new price
  // inserts a jump between blocks, and that jump is itself a far larger gap
  // than the ones under test — which is how the first version of this fixture
  // ended up measuring its own seams.
  const push = (s, width) => {
    const t = s.length ? s[s.length - 1].time + 1 : 1;
    const base = s.length ? s[s.length - 1].close : 100;
    s.push(c(t, base, base, base - 1, base));
    s.push(c(t + 1, base, base + width + 2, base, base + width + 1));
    s.push(c(t + 2, base + width + 1, base + width + 3, base + width, base + width + 2));
    return s;
  };
  const build = (widths) => widths.reduce((s, w) => push(s, w), []);
  const opts = { autoThreshold: true, clusterBars: 0, mitigation: MITIGATION.NONE, showInversions: false };

  it("keeps the larger gaps and drops the slivers", () => {
    // Three wide gaps (~8%) and three hairline ones (~0.04%) in one series.
    const kept = detectFVGs(build([8, 9, 10, 0.05, 0.06, 0.04]), opts);
    expect(kept).toHaveLength(3);
    for (const z of kept) expect(z.top - z.bottom).toBeGreaterThan(1);
  });

  it("calibrates against gaps, not candle ranges", () => {
    // Regression. The first version judged a gap against MEAN BAR RANGE, which
    // shipped and drew nothing: a gap is the sliver a bar leaves behind, so on
    // real candles it is a fraction of that bar's range. Reproduced here with
    // wide bars (~22% range) and narrow gaps (~1.7%) — the shape real data has.
    const wide = (s, width) => {
      const t = s.length ? s[s.length - 1].time + 1 : 1;
      const base = s.length ? s[s.length - 1].close : 100;
      const wick = 20;
      s.push(c(t, base, base, base - wick, base));
      s.push(c(t + 1, base, base + width + 2, base - wick, base + width + 1));
      s.push(c(t + 2, base + width + 1, base + width + wick, base + width, base + width + 2));
      return s;
    };
    const series = [3, 3.5, 4, 0.2, 0.25, 0.15].reduce(wide, []);
    const all = detectFVGs(series, { ...opts, autoThreshold: false });

    expect(meanRelativeRange(series)).toBeGreaterThan(meanRelativeHeight(all));
    // The old rule kept nothing at all on this shape.
    const byBarRange = all.filter(
      (z) => (z.top - z.bottom) / z.bottom >= meanRelativeRange(series)
    );
    expect(byBarRange).toHaveLength(0);
    // The gap-calibrated rule keeps the larger half.
    expect(detectFVGs(series, opts)).toHaveLength(3);
  });

  it("scales with price rather than assuming a fixed percentage", () => {
    const cheap = [c(1, 0.001, 0.0011, 0.0009, 0.001)];
    const dear = [c(1, 60000, 66000, 54000, 60000)];
    // Both move ~20% of their low, so the yardstick must agree despite the
    // six-order-of-magnitude difference in nominal price.
    expect(meanRelativeRange(cheap)).toBeCloseTo(meanRelativeRange(dear), 5);
  });
});
