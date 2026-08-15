import { describe, expect, it } from "vitest";
import { describeExitPlan } from "./autotradeFieldGuide";

describe("describeExitPlan", () => {
  it("trailing does not place TP and warns when the callback is tight", () => {
    const plan = describeExitPlan({
      exitMode: "trailing_stop",
      tpLevel: 1,
      slLevel: 1,
      callbackRate: 1,
      futuresEnabled: true,
    });
    expect(plan.trailing).toBe(true);
    expect(plan.placed.join(" ")).toMatch(/TP1 is not placed/);
    expect(plan.placed.join(" ")).toMatch(/Hard stop at SL1/);
    expect(plan.ifSignalTp).toMatch(/stays open/);
    expect(plan.tight).toMatch(/1%/);
  });

  it("fixed SL places TP and SL", () => {
    const plan = describeExitPlan({
      exitMode: "fixed_sl",
      tpLevel: 2,
      slLevel: 1,
      futuresEnabled: true,
    });
    expect(plan.trailing).toBe(false);
    expect(plan.placed).toEqual(["Take-profit at TP2", "Hard stop at SL1"]);
    expect(plan.ifSignalTp).toMatch(/TP2/);
    expect(plan.tight).toBeNull();
  });

  it("spot-only trailing is downgraded", () => {
    const plan = describeExitPlan({
      exitMode: "trailing_stop",
      spotEnabled: true,
      futuresEnabled: false,
    });
    expect(plan.trailing).toBe(false);
    expect(plan.spotNote).toMatch(/Fixed SL/);
  });
});
