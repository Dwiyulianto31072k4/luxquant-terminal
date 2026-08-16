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
import { detectFVGs, partitionZones, meanRelativeRange, MITIGATION } from "./fvg";

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
  it("discards a gap far below typical bar range", () => {
    const noisy = Array.from({ length: 40 }, (_, i) => c(100 + i, 100, 103, 97, 101));
    const trivial = [
      c(1, 100, 100.05, 99.95, 100),
      c(2, 100, 100.06, 99.99, 100.055),
      c(3, 100.05, 100.1, 100.051, 100.09),
    ];
    expect(detectFVGs([...noisy, ...trivial], { autoThreshold: true, clusterBars: 0 })).toHaveLength(0);
  });

  it("scales with price rather than assuming a fixed percentage", () => {
    const cheap = [c(1, 0.001, 0.0011, 0.0009, 0.001)];
    const dear = [c(1, 60000, 66000, 54000, 60000)];
    // Both move ~20% of their low, so the yardstick must agree despite the
    // six-order-of-magnitude difference in nominal price.
    expect(meanRelativeRange(cheap)).toBeCloseTo(meanRelativeRange(dear), 5);
  });
});
