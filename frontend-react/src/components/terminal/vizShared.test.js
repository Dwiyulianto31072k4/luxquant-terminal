import { describe, expect, it } from "vitest";

import {
  pickLabels,
  logTicks,
  chartH,
  labelCells,
  promote,
  pctRange,
  clampRange,
} from "./vizShared";

// ── pickLabels ──────────────────────────────────────────────────────
// The contract that matters: no two labels come within a label's own width and
// height of each other, and the ranking you pass in is the ranking you get.
// Everything on /terminal that decides "which coin shows its name" rests on it.
describe("pickLabels keeps labels off each other", () => {
  const cell = { cellW: 100, cellH: 100, max: 50 };

  it("keeps only the highest-priority point where several contend", () => {
    const keep = pickLabels(
      [
        { id: "a", x: 10, y: 10, priority: 1 },
        { id: "b", x: 20, y: 20, priority: 9 },
        { id: "c", x: 30, y: 30, priority: 5 },
      ],
      cell
    );
    expect([...keep]).toEqual(["b"]);
  });

  it("keeps every point that stands clear of the others", () => {
    const keep = pickLabels(
      [
        { id: "a", x: 10, y: 10, priority: 1 },
        { id: "b", x: 150, y: 10, priority: 1 },
        { id: "c", x: 10, y: 150, priority: 1 },
      ],
      cell
    );
    expect(keep.size).toBe(3);
  });

  it("stops at max even when there is room for more", () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({
      id: `p${i}`,
      x: i * 200,
      y: 0,
      priority: i,
    }));
    expect(pickLabels(pts, { ...cell, max: 7 }).size).toBe(7);
  });

  it("drops points with no finite position rather than placing them at 0,0", () => {
    const keep = pickLabels(
      [
        { id: "real", x: 0, y: 0, priority: 1 },
        { id: "nan", x: NaN, y: 0, priority: 99 },
        { id: "undef", priority: 99 },
      ],
      cell
    );
    expect([...keep]).toEqual(["real"]);
  });

  // The grid this replaced bucketed points, so two points a pixel apart were
  // kept whenever a bucket boundary happened to fall between them — the exact
  // overlap the helper exists to prevent, occurring on every boundary.
  it("rejects a near neighbour wherever it sits, not only inside one bucket", () => {
    for (let offset = 0; offset < 400; offset += 7) {
      const keep = pickLabels(
        [
          { id: "first", x: offset, y: offset, priority: 2 },
          { id: "second", x: offset + 3, y: offset + 3, priority: 1 },
        ],
        cell
      );
      expect([...keep]).toEqual(["first"]);
    }
  });

  it("is deterministic — the same input gives the same set", () => {
    const pts = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i}`,
      x: (i * 37) % 500,
      y: (i * 71) % 500,
      priority: (i * 13) % 17,
    }));
    expect([...pickLabels(pts, cell)]).toEqual([...pickLabels(pts, cell)]);
  });
});

// ── logTicks ────────────────────────────────────────────────────────
// The bug this exists to stop: Recharts labelling every data value on a log
// axis, which printed "0.1%0.2%0.2%0.4%5%0.6%1%" across the bottom of the
// turnover charts.
describe("logTicks labels decades, not data", () => {
  it("returns a handful of ticks across a wide span, ascending", () => {
    const t = logTicks(0.001, 1000);
    expect(t.length).toBeLessThanOrEqual(8);
    expect(t).toEqual([...t].sort((a, b) => a - b));
    t.forEach((v) => expect(Math.log10(v) % 1).toBeCloseTo(0, 9));
  });

  it("stays inside the domain it was given", () => {
    logTicks(0.05, 40).forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0.05);
      expect(v).toBeLessThanOrEqual(40);
    });
  });

  it("subdivides a narrow span so the axis is not left with two labels", () => {
    expect(logTicks(1, 100).length).toBeGreaterThan(3);
  });

  it("survives a degenerate or zero domain instead of dividing by it", () => {
    expect(logTicks(0, 0).length).toBeGreaterThan(0);
    expect(logTicks(5, 5).every(Number.isFinite)).toBe(true);
  });
});

// ── chartH ──────────────────────────────────────────────────────────
describe("chartH follows the viewport within bounds", () => {
  it("gives a hero chart more room than a standard one on the same screen", () => {
    expect(chartH("hero", 1250)).toBeGreaterThan(chartH("std", 1250));
    expect(chartH("std", 1250)).toBeGreaterThan(chartH("compact", 1250));
  });

  it("grows with the window but never past its ceiling", () => {
    expect(chartH("hero", 900)).toBeLessThan(chartH("hero", 1400));
    expect(chartH("hero", 4000)).toBe(660);
  });

  it("keeps a usable height on a short window", () => {
    expect(chartH("hero", 300)).toBeGreaterThanOrEqual(420);
  });
});

// ── labelCells ──────────────────────────────────────────────────────
describe("labelCells converts pixels into the normalised grid", () => {
  it("asks for taller cells on a shorter plot", () => {
    expect(labelCells(300).cellH).toBeGreaterThan(labelCells(900).cellH);
  });

  it("does not blow up on a zero-height plot", () => {
    expect(Number.isFinite(labelCells(0).cellH)).toBe(true);
  });
});

// ── promote ─────────────────────────────────────────────────────────
describe("promote measures spacing where the reader sees it", () => {
  // Two points equally far apart in data units are NOT equally far apart on
  // screen when the axes have different ranges. Normalising through the domain
  // is the whole reason this helper exists.
  it("separates by screen position, not by data distance", () => {
    const pts = [
      { pair: "A", x: 0, y: 0 },
      { pair: "B", x: 0.02, y: 0 }, // 2% of a 0..1 axis — visually on top of A
      { pair: "C", x: 0.9, y: 0 },
    ];
    const keep = promote(pts, [0, 1], [0, 1], 600, 10, () => 1);
    expect(keep.has("C")).toBe(true);
    expect(keep.has("A") && keep.has("B")).toBe(false);
  });

  it("lets the priority function decide the winner", () => {
    const pts = [
      { pair: "small", x: 0.5, y: 0.5 },
      { pair: "big", x: 0.51, y: 0.5 },
    ];
    expect([...promote(pts, [0, 1], [0, 1], 600, 10, (p) => (p.pair === "big" ? 9 : 1))]).toEqual([
      "big",
    ]);
  });

  it("survives a collapsed domain without producing NaN positions", () => {
    const keep = promote([{ pair: "A", x: 1, y: 1 }], [1, 1], [1, 1], 600, 10, () => 1);
    expect(keep.has("A")).toBe(true);
  });
});

// ── pctRange ────────────────────────────────────────────────────────
// A mirrored axis is only right when the variable is genuinely two-sided. On an
// up day 24h change runs roughly -4%..+18%, and mirroring the larger half hands
// a third of the canvas to a region holding no coins.
describe("pctRange fits each side of an axis on its own", () => {
  const upDay = [-3, -1, 0, 2, 4, 6, 8, 11, 14, 18];

  it("does not mirror the larger side", () => {
    const [lo, hi] = pctRange(upDay, 1, 0);
    expect(Math.abs(lo)).toBeLessThan(hi);
  });

  it("always keeps the anchor inside, so the reference line stays on screen", () => {
    const [lo, hi] = pctRange([12, 14, 16, 18], 1, 0);
    expect(lo).toBeLessThanOrEqual(0);
    expect(hi).toBeGreaterThan(0);
  });

  it("honours a minimum span so a quiet market is not magnified into a storm", () => {
    const [lo, hi] = pctRange([0.1, 0.2, 0.15], 1, 0, 8);
    expect(hi - lo).toBeGreaterThanOrEqual(8);
  });

  it("ignores the tail beyond the percentile", () => {
    const withOutlier = [...upDay, 900];
    const [, hi] = pctRange(withOutlier, 0.9, 0);
    expect(hi).toBeLessThan(100);
  });

  it("returns a usable range from no data at all", () => {
    const [lo, hi] = pctRange([], 0.97, 0, 4);
    expect(hi).toBeGreaterThan(lo);
    expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true);
  });
});

describe("clampRange puts an outlier on the rail, never off the chart", () => {
  it("pins past either edge", () => {
    expect(clampRange(900, [-5, 20])).toBe(20);
    expect(clampRange(-900, [-5, 20])).toBe(-5);
  });

  it("leaves a value inside the range alone", () => {
    expect(clampRange(7, [-5, 20])).toBe(7);
  });

  it("treats a missing value as zero rather than NaN", () => {
    expect(clampRange(undefined, [-5, 20])).toBe(0);
  });
});
