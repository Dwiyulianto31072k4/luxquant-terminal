import { describe, it, expect } from "vitest";
import { buildPlan, roundToStep, decimalsOf, evenLadder } from "./entryPlanMath";

const BEAT_BINANCE = { tick: "0.0001", step: "1", min_qty: "1", min_notional: "5", unit: "coin", contract_size: "1" };

describe("rounding", () => {
  it("reads decimals from plain and scientific steps", () => {
    expect(decimalsOf("0.0001")).toBe(4);
    expect(decimalsOf("1")).toBe(0);
    expect(decimalsOf("1e-7")).toBe(7);
  });
  it("rounds in integer space", () => {
    expect(roundToStep(0.08914, "0.0001", "down")).toBe(0.0891);
    expect(roundToStep(0.08911, "0.0001", "up")).toBe(0.0892);
    expect(roundToStep(177.9, "1", "down")).toBe(177);
    expect(roundToStep(133.3, "10", "down")).toBe(130);
    expect(roundToStep(0.3 - 0.1, "0.1", "down")).toBe(0.2);
  });
  it("builds an even ladder towards SL1", () => {
    const l = evenLadder(0.09, 0.0858, 3);
    expect(l).toHaveLength(3);
    expect(l[1]).toBeCloseTo(0.0886);
    expect(l[2]).toBeCloseTo(0.0872);
  });
});

describe("Erik's BEATUSDT sheet", () => {
  // His spreadsheet: entries 0.0891 / 0.0875 / 0.0862, weights 40/30/30,
  // SL 0.0855, $1 risk, 5x → avg 0.08775, total 444, qty 177/133/133, margin 7.79.
  const plan = buildPlan({
    side: "long",
    entryPrices: [0.0891, 0.0875, 0.0862],
    sl: 0.0855,
    targets: [0.0904, 0.0918, 0.0958, 0.1024],
    riskUsd: 1,
    leverage: 5,
    weights: [40, 30, 30],
    tpSplit: [40, 30, 20, 10],
    includeFees: false,
    rule: BEAT_BINANCE,
  });

  it("matches the sheet quantities, floored to the step", () => {
    expect(plan.ok).toBe(true);
    expect(plan.legs.map((l) => l.qty)).toEqual([177, 133, 133]);
    expect(plan.totalQty).toBe(443);
    expect(plan.avg).toBeCloseTo(0.08775, 4);
    expect(plan.margin).toBeCloseTo(7.77, 1);
  });

  it("never plans a loss above the budget", () => {
    expect(plan.lossAtSl).toBeLessThanOrEqual(1);
    expect(plan.lossAtSl).toBeGreaterThan(0.99);
  });

  it("shows that partial fills lose less and make less", () => {
    const [one, two, all] = plan.scenarios;
    expect(one.lossAtSl).toBeCloseTo(0.64, 2);
    expect(two.lossAtSl).toBeCloseTo(0.903, 3); // 177 × 0.0036 + 133 × 0.0020, after flooring
    expect(all.lossAtSl).toBeCloseTo(plan.lossAtSl, 6);
    expect(one.profitAllTps).toBeLessThan(all.profitAllTps);
  });

  it("closes the whole position across the TP split", () => {
    const closed = plan.tps.reduce((a, t) => a + t.qty, 0);
    expect(closed).toBeCloseTo(plan.totalQty, 6);
    expect(plan.tps.map((t) => t.qty)).toEqual([177, 132, 88, 46]);
  });
});

describe("fees keep the loss inside the budget", () => {
  it("shrinks size so fees are paid out of the budget, not on top", () => {
    const base = { side: "long", entryPrices: [0.0891, 0.0875, 0.0862], sl: 0.0855, targets: [], riskUsd: 1, leverage: 5, weights: [40, 30, 30], tpSplit: [], rule: BEAT_BINANCE };
    const noFee = buildPlan({ ...base, includeFees: false });
    const withFee = buildPlan({ ...base, includeFees: true });
    expect(withFee.totalQty).toBeLessThan(noFee.totalQty);
    expect(withFee.lossAtSl).toBeLessThanOrEqual(1);
  });
});

describe("contract venues", () => {
  it("expresses quantities in contracts and respects the contract step", () => {
    const okx = { tick: "0.000001", step: "1", min_qty: "1", min_notional: null, unit: "contract", contract_size: "100" };
    const plan = buildPlan({
      side: "long", entryPrices: [0.0038, 0.0037, 0.0036], sl: 0.0035, targets: [0.004],
      riskUsd: 5, leverage: 5, weights: [40, 30, 30], tpSplit: [100], includeFees: false, rule: okx,
    });
    expect(plan.unit).toBe("contract");
    plan.legs.forEach((l) => {
      expect(l.qty % 100).toBe(0);
      expect(l.qtyUnit).toBe(l.qty / 100);
    });
    expect(plan.lossAtSl).toBeLessThanOrEqual(5);
  });

  it("flags a leg under the venue minimum instead of hiding it", () => {
    const bitunix = { tick: "0.0000001", step: "1", min_qty: "2000", min_notional: null, unit: "coin", contract_size: "1" };
    const plan = buildPlan({
      side: "long", entryPrices: [0.0009, 0.00088, 0.00086], sl: 0.00084, targets: [],
      riskUsd: 0.1, leverage: 5, weights: [40, 30, 30], tpSplit: [], includeFees: false, rule: bitunix,
    });
    expect(plan.warnings).toContain("leg_below_minimum");
    expect(plan.legs.some((l) => l.warnings.includes("below_min_qty"))).toBe(true);
  });
});

describe("shorts and safety", () => {
  it("mirrors a short", () => {
    const plan = buildPlan({
      side: "short", entryPrices: [100, 101, 102], sl: 104, targets: [98, 96],
      riskUsd: 10, leverage: 5, weights: [40, 30, 30], tpSplit: [50, 50], includeFees: false,
      rule: { tick: "0.1", step: "0.001", min_qty: "0.001", min_notional: "5", unit: "coin", contract_size: "1" },
    });
    expect(plan.ok).toBe(true);
    expect(plan.lossAtSl).toBeLessThanOrEqual(10);
    expect(plan.tps[0].profit).toBeGreaterThan(0);
  });

  it("refuses an entry on the wrong side of the stop", () => {
    const plan = buildPlan({
      side: "long", entryPrices: [0.09, 0.0850], sl: 0.0855, targets: [], riskUsd: 1,
      leverage: 5, weights: [50, 50], tpSplit: [], includeFees: false, rule: BEAT_BINANCE,
    });
    expect(plan.ok).toBe(false);
    expect(plan.error).toMatch(/Entry 2/);
  });

  it("warns when leverage would liquidate before the stop", () => {
    const plan = buildPlan({
      side: "long", entryPrices: [0.0891, 0.0875, 0.0862], sl: 0.0855, targets: [], riskUsd: 1,
      leverage: 50, weights: [40, 30, 30], tpSplit: [], includeFees: false, rule: BEAT_BINANCE,
    });
    expect(plan.liqBeforeStop).toBe(true);
    expect(plan.warnings).toContain("liquidation_before_stop");
  });
});
