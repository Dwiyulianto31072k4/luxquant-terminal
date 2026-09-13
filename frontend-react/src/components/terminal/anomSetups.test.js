import { describe, expect, it } from "vitest";

import { anomSetupOf } from "./anomSetups";

// Volume is effort, price progress is result, and the pairs worth a second look
// are where the two disagree. Heavy = turnover above 3x the desk median (the
// same 3x line the chart already draws); light = below half. A big move is 5%
// in 24h — the threshold the Hot flag has always used.
//
// Measured on production 2026-09-13 across 439 called pairs, median turnover
// 5.32%: breakout 37, absorption 60, capitulation 7, thin pump 6, dormant 115,
// ordinary 214. Every bucket had members, which is why all five ship.
describe("anomSetupOf sorts a point into its regime", () => {
  const MED = 5.32;
  const heavy = MED * 3 + 1;
  const light = MED / 2 - 1;
  const mid = MED;

  it("calls an up-move on heavy turnover a breakout", () => {
    expect(anomSetupOf(12, heavy, MED)).toBe("breakout");
  });

  it("calls a sell-off on heavy turnover capitulation", () => {
    expect(anomSetupOf(-12, heavy, MED)).toBe("capitulation");
  });

  it("calls heavy turnover with no price progress absorption", () => {
    expect(anomSetupOf(0.4, heavy, MED)).toBe("absorption");
    expect(anomSetupOf(-3, heavy, MED)).toBe("absorption");
  });

  it("calls an up-move on light turnover a thin pump", () => {
    expect(anomSetupOf(12, light, MED)).toBe("thin");
  });

  it("calls light turnover with no direction dormant", () => {
    expect(anomSetupOf(1, light, MED)).toBe("dormant");
    // a drift DOWN on nobody's volume is still just asleep
    expect(anomSetupOf(-9, light, MED)).toBe("dormant");
  });

  it("leaves the middle of the board ordinary", () => {
    expect(anomSetupOf(20, mid, MED)).toBe("ordinary");
    expect(anomSetupOf(0, mid, MED)).toBe("ordinary");
  });

  // Breakout is the set the Hot flag marks, and that has to stay exactly true:
  // the KPI card, the Hot list and the gold glow all read `hot`.
  it("keeps breakout identical to the long-standing Hot test", () => {
    const hot = (x, y) => y > MED * 3 && x > 5;
    for (let x = -30; x <= 30; x += 0.5) {
      for (const y of [0.1, 1, MED, MED * 2.99, MED * 3.01, 60]) {
        expect(anomSetupOf(x, y, MED) === "breakout").toBe(hot(x, y));
      }
    }
  });

  it("refuses to classify anything when there is no median to compare against", () => {
    expect(anomSetupOf(50, 99, 0)).toBe("ordinary");
    expect(anomSetupOf(50, 99, undefined)).toBe("ordinary");
  });

  it("puts a point exactly on a threshold in the calmer bucket", () => {
    expect(anomSetupOf(5, MED * 3, MED)).toBe("ordinary");
    expect(anomSetupOf(5.01, MED * 3.01, MED)).toBe("breakout");
  });
});
