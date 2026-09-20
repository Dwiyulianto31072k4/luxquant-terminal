import { describe, it, expect } from "vitest";
import {
  CHASE_LINE,
  METRICS,
  applyScreens,
  domainFor,
  goodCorner,
  missingReason,
  planSummary,
  scaleFor,
  screenCounts,
  screenRow,
} from "./screenMetrics";

const call = (over = {}) => ({
  signal_id: "s1",
  pair: "AAAUSDT",
  entry: 100,
  target1: 103,
  target2: 104.5,
  target3: 106,
  target4: 111,
  stop1: 97,
  status: "open",
  created_at: new Date(Date.now() - 3 * 3600e3).toISOString(),
  ...over,
});

describe("every number is measured from the live price", () => {
  it("measures the room and the risk from what you would actually pay", () => {
    const r = screenRow(call(), { price: 103 });
    // Not from the entry: from 103, the 106 target is 2.9% away and the 97
    // stop is 5.8% below.
    expect(r.distEntry).toBeCloseTo(3, 5);
    expect(r.roomTp3).toBeCloseTo(2.91, 1);
    expect(r.stopDist).toBeCloseTo(5.83, 1);
    expect(r.rr).toBeCloseTo(0.5, 1);
  });

  it("knows when the published trade is gone", () => {
    const past = screenRow(call(), { price: 108 });
    expect(past.roomTp3).toBeLessThan(0);
    expect(past.atPlan).toBe(false);
    const chased = screenRow(call(), { price: 100 + CHASE_LINE + 0.5 });
    expect(chased.atPlan).toBe(false);
    const good = screenRow(call(), { price: 101 });
    expect(good.atPlan).toBe(true);
  });

  it("leaves a gap null rather than filling it with zero", () => {
    // A call with no stop is not a call with a stop at zero, and a screener
    // that fills gaps with zeroes ranks the gaps first.
    const noStop = screenRow(call({ stop1: null, stop_loss: null }), { price: 101 });
    expect(noStop.stopDist).toBeNull();
    expect(noStop.rr).toBeNull();
    const noPrice = screenRow(call(), {});
    expect(noPrice.distEntry).toBeNull();
    expect(noPrice.roomTp3).toBeNull();
  });
});

describe("nothing is dropped without saying why", () => {
  it("names the reason a call cannot be placed", () => {
    expect(missingReason(screenRow(call(), {}), "rr")).toBe("no live price yet");
    expect(missingReason(screenRow(call({ stop1: null }), { price: 101 }), "rr")).toBe(
      "no stop published"
    );
    expect(missingReason(screenRow(call(), { price: 101 }), "rr")).toBeNull();
  });
});

describe("an axis bends only when the data bends", () => {
  it("stays linear on a well-behaved spread", () => {
    // Reward-for-risk runs about -0.5 to 2. A square root here bunched every
    // tick into the bottom eighth of the axis.
    expect(scaleFor([-0.5, 0.4, 0.9, 1.2, 1.8, 2])).toBe("linear");
  });

  it("bends for a real tail", () => {
    expect(scaleFor([1, 2, 3, 4, 5, 900])).toBe("sqrt");
  });

  it("does not guess from three points", () => {
    expect(scaleFor([1, 900])).toBe("linear");
  });
});

describe("the window shows the data, not a number nobody plotted", () => {
  it("anchors at zero only where zero means something", () => {
    // Hours-old calls: anchoring at zero reserves half the canvas for "0h".
    const age = domainFor([18, 22, 30], METRICS.ageH);
    expect(age.lo).toBeGreaterThan(0);
    // Room to target: zero is the line between a trade and a post-mortem.
    const room = domainFor([4, 8, 12], METRICS.roomTp3);
    expect(room.lo).toBeLessThanOrEqual(0);
  });

  it("leaves air on both sides so no mark is welded to the frame", () => {
    const d = domainFor([10, 20], METRICS.edge);
    expect(d.lo).toBeLessThan(10);
    expect(d.hi).toBeGreaterThan(20);
  });

  it("survives a single value without collapsing", () => {
    const d = domainFor([7], METRICS.edge);
    expect(d.hi).toBeGreaterThan(d.lo);
  });
});

describe("the plot says where to look", () => {
  it("puts the good corner where both metrics say it is", () => {
    // Past the call: low is good. Room to target: high is good.
    const c = goodCorner(METRICS.distEntry, METRICS.roomTp3);
    expect(c.x).toBe("min");
    expect(c.y).toBe("max");
    expect(c.label).toBe("still at the plan");
  });

  it("names any other pair in the metrics' own words", () => {
    const c = goodCorner(METRICS.rr, METRICS.stopDist);
    expect(c.x).toBe("max");
    expect(c.y).toBe("min");
    expect(c.label).toContain("reward for the risk");
  });
});

describe("screens and the summary", () => {
  const rows = [
    screenRow(call({ signal_id: "a" }), { price: 101, volume: 3e7 }),
    screenRow(call({ signal_id: "b" }), { price: 108, volume: 1e6 }),
    screenRow(call({ signal_id: "c", stop1: 99 }), { price: 100.5, volume: 5e7 }),
  ];

  it("stacks with AND and counts what each would leave", () => {
    expect(applyScreens(rows, ["plan"]).map((r) => r.id)).toEqual(["a", "c"]);
    const counts = screenCounts(rows, ["plan"]);
    expect(counts.liquid).toBe(2);
  });

  it("summarises the set against the chase line", () => {
    const s = planSummary(rows);
    expect(s.total).toBe(3);
    expect(s.atPlan).toBe(2);
    expect(s.passed).toBe(1);
  });

  it("says nothing when no call has a price", () => {
    expect(planSummary([screenRow(call(), {})])).toBeNull();
  });
});

describe("the reason a call is off the chart has to be true", () => {
  it("tells a missing stop apart from a stop that has already been hit", () => {
    const noStop = screenRow(call({ stop1: null, stop_loss: null }), { price: 101 });
    expect(missingReason(noStop, "rr")).toBe("no stop published");
    // Stop at 97, price at 95: the stop is there and the price is through it.
    // "No stop published" would be a plain lie about a call whose stop did
    // exactly what it was for.
    const through = screenRow(call(), { price: 95 });
    expect(through.rr).toBeNull();
    expect(missingReason(through, "rr")).toBe("price is below the stop");
  });
});
