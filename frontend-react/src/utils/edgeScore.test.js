import { describe, expect, it } from "vitest";

import { buildEdgeScoreContext, scoreSignalTags } from "./edgeScore";

// The expectancy leg has to be the server's (edge_lab._r_ladder +
// _expectancy_proxy). On 2026-09-19 this copy priced the full-TP leg at R4
// alone, the server at the mean of R3, R4 and R2 — ~0.9R, ~1.9 points of
// score — and the desk ranked every closed call on the inflated number.
const ctx = buildEdgeScoreContext(
  [{ tag: "BROKE_RESISTANCE_RECENT", n: 400, win_rate: 88, full_tp_rate: 50 }],
  86
);

// What the server computes, written out from the Python.
function serverExpectancy(avgWr, avgFull, ladder) {
  const pWin = avgWr / 100;
  const pFull = avgFull / 100;
  const r1 = ladder?.r1 || 1;
  let rFull = 2.5;
  if (ladder) {
    const rs = [ladder.r3, ladder.r4, ladder.r2].filter((r) => r != null);
    rFull = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : ladder.r2 || r1;
  }
  return pFull * rFull + Math.max(0, pWin - pFull) * r1 - Math.max(0, 1 - pWin);
}

const score = (signal) => scoreSignalTags(["BROKE_RESISTANCE_RECENT"], ctx, signal);

describe("Edge expectancy matches the server", () => {
  it("prices the full-TP leg at the mean of R3, R4 and R2, not R4", () => {
    // risk 10: R1 0.5, R2 1, R3 2, R4 4 → full leg 2.33R, not 4R.
    const r = score({ status: "open", entry: 100, stop1: 90, target1: 105, target2: 110, target3: 120, target4: 140 });
    const want = serverExpectancy(r.avgWr, r.avgFull, { r1: 0.5, r2: 1, r3: 2, r4: 4 });
    expect(r.expectancyR).toBeCloseTo(want, 2);
  });

  it("uses the server's defaults when there is no risk unit", () => {
    // No stop: the server still scores expectancy, at R1 = 1 and a 2.5R leg.
    const r = score({ status: "open", entry: 100, target1: 105 });
    expect(r.expectancyR).toBeCloseTo(serverExpectancy(r.avgWr, r.avgFull, null), 2);
  });

  it("does not let a far TP4 alone lift the score", () => {
    const near = score({ status: "open", entry: 100, stop1: 90, target1: 105, target2: 110, target3: 120, target4: 130 });
    const far = score({ status: "open", entry: 100, stop1: 90, target1: 105, target2: 110, target3: 120, target4: 190 });
    // +6R on TP4 moves the full leg by 2R (a third), so ~pFull * 2R.
    expect(far.expectancyR - near.expectancyR).toBeCloseTo((far.avgFull / 100) * 2, 2);
  });
});
