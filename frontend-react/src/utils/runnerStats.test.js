import { describe, expect, it } from "vitest";

import { diff, fmtDay, fmtHours, fmtPp, pointRates, rates, wilson } from "./runnerStats";

describe("rates", () => {
  const c = { n: 10, open: 3, sl: 1, tp1: 2, tp2: 2, tp3: 3, tp4: 2 };

  it("reads levels as reached-at-least and the mix as final shares", () => {
    const r = rates(c);
    expect(r.tp1).toBe(90); // everything but the one stop
    expect(r.tp2).toBe(70);
    expect(r.tp3).toBe(50);
    expect(r.tp4).toBe(20);
    expect(r.sl).toBe(10);
    expect(Object.values(r.share).reduce((a, b) => a + b, 0)).toBeCloseTo(100);
    expect(r.open).toBe(3);
  });

  it("is null when nothing has finished — open calls are not losses", () => {
    expect(rates({ n: 0, open: 5 })).toBe(null);
    expect(rates(null)).toBe(null);
  });
});

describe("wilson", () => {
  it("brackets the rate and narrows with n", () => {
    const [lo, hi] = wilson(50, 100);
    expect(lo).toBeLessThan(50);
    expect(hi).toBeGreaterThan(50);
    const [lo2, hi2] = wilson(500, 1000);
    expect(hi2 - lo2).toBeLessThan(hi - lo);
  });

  it("stays inside 0-100 at the edges", () => {
    const [lo, hi] = wilson(0, 20);
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThan(0);
    expect(wilson(20, 20)[1]).toBe(100);
    expect(wilson(1, 0)).toBe(null);
  });
});

describe("formatting", () => {
  it("says hours the way a reader would", () => {
    expect(fmtHours(0.4)).toBe("24 min");
    expect(fmtHours(0.001)).toBe("1 min");
    expect(fmtHours(10.2)).toBe("10 h");
    expect(fmtHours(1.8)).toBe("1.8 h");
    expect(fmtHours(72)).toBe("3.0 days");
    expect(fmtHours(null)).toBe("—");
  });

  it("signs points and keeps a real minus", () => {
    expect(fmtPp(8.1)).toBe("+8.1pp");
    expect(fmtPp(-3.7)).toBe("−3.7pp");
    expect(fmtPp(null)).toBe("—");
    expect(diff(5, null)).toBe(null);
  });

  it("names a day", () => {
    expect(fmtDay("2026-09-08")).toBe("8 Sep");
  });

  it("drops a thin point instead of plotting noise", () => {
    expect(pointRates([4, 2, 1, 3], 5)).toBe(null);
    expect(pointRates([10, 5, 1, 9]).tp3).toBe(50);
  });
});
