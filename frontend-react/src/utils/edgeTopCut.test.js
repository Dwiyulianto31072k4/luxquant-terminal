import { describe, expect, it } from "vitest";

import {
  DEFAULT_FILTERS,
  MIN_SCORED_FOR_CUT,
  applySignalFilters,
  edgeTopThreshold,
  filtersToParams,
  parseFilters,
} from "./signalFilters";

// The Edge cut is what turns Runners from "half the board" into a shortlist,
// so its edges matter. Measured walk-forward over 16,845 closed calls: a
// runner tag alone kept 51.9% of the book for +1.5pp; the tag plus a top-20%
// Edge cut came in at 90.6% win / 50.9% TP3+ against a desk at 86.1 / 44.8.
//
// It is a PERCENTILE and not a score, because the share of calls clearing any
// fixed score swung 14.1% → 32.6% → 15.8% across March, May and July.

const sig = (id, score) => ({ signal_id: id, score });
const mapOf = (rows) =>
  Object.fromEntries(rows.map((r) => [r.signal_id, { score: r.score }]));

// 20 rows scoring 1..20, so the top 20% is exactly the four highest.
const twenty = Array.from({ length: 20 }, (_, i) => sig(`s${i + 1}`, i + 1));
const twentyMap = mapOf(twenty);

describe("edgeTopThreshold", () => {
  it("returns the boundary score of the top slice", () => {
    // top 20% of 1..20 is 17, 18, 19, 20 — so the boundary is 17.
    expect(edgeTopThreshold(twenty, twentyMap, 20)).toBe(17);
    expect(edgeTopThreshold(twenty, twentyMap, 50)).toBe(11);
    expect(edgeTopThreshold(twenty, twentyMap, 100)).toBe(1);
  });

  it("refuses to guess on too few scored rows", () => {
    // Filtering on a percentile of nine rows is filtering on noise.
    const few = twenty.slice(0, MIN_SCORED_FOR_CUT - 1);
    expect(edgeTopThreshold(few, mapOf(few), 20)).toBe(null);
    expect(edgeTopThreshold(twenty.slice(0, MIN_SCORED_FOR_CUT), twentyMap, 20)).not.toBe(
      null
    );
  });

  it("ignores rows with no score rather than treating them as zero", () => {
    // A call the scorer skipped must not be dragged to the bottom of the
    // distribution and shift the cut for everyone else.
    const withBlanks = [...twenty, sig("x1"), sig("x2", null), sig("x3", NaN)];
    expect(edgeTopThreshold(withBlanks, twentyMap, 20)).toBe(17);
  });

  it("is null when there is no map or no percentile", () => {
    expect(edgeTopThreshold(twenty, null, 20)).toBe(null);
    expect(edgeTopThreshold(twenty, twentyMap, null)).toBe(null);
    expect(edgeTopThreshold(twenty, twentyMap, 0)).toBe(null);
  });

  it("survives an empty book", () => {
    expect(edgeTopThreshold([], {}, 20)).toBe(null);
    expect(edgeTopThreshold(null, {}, 20)).toBe(null);
  });
});

describe("applySignalFilters with edgeTop", () => {
  const base = { ...DEFAULT_FILTERS, selectedDates: [] };

  it("keeps only the top slice", () => {
    const out = applySignalFilters(twenty, { ...base, edgeTop: 20 }, {
      edgeScoreMap: twentyMap,
    });
    expect(out.map((s) => s.score).sort((a, b) => a - b)).toEqual([17, 18, 19, 20]);
  });

  it("drops rows the scorer never scored", () => {
    // An unscored row cannot be shown to clear a bar it was never measured
    // against — that is the whole promise of the mode.
    const withBlank = [...twenty, sig("x1")];
    const out = applySignalFilters(withBlank, { ...base, edgeTop: 20 }, {
      edgeScoreMap: twentyMap,
    });
    expect(out.some((s) => s.signal_id === "x1")).toBe(false);
  });

  it("leaves the book alone when the cut cannot be computed", () => {
    // Fail open, not closed: an empty desk reads as a broken page, while a
    // full one reads as "the cut is not available", which the chip shows.
    const few = twenty.slice(0, 5);
    const out = applySignalFilters(few, { ...base, edgeTop: 20 }, {
      edgeScoreMap: twentyMap,
    });
    expect(out).toHaveLength(5);
  });

  it("cuts the board BEFORE the tag filter, not the tagged rows after", () => {
    // This is the difference between the measured claim and a weaker one.
    // Tag the four LOWEST scorers. "Top 20% of the board, then tagged" keeps
    // nothing; "tagged, then top 20% of those" would keep the best of a bad
    // set — which is not what was measured.
    const tagged = twenty.map((s) => ({
      ...s,
      important_tags: s.score <= 4 ? ["VOL_CLIMAX"] : [],
    }));
    const out = applySignalFilters(
      tagged,
      { ...base, edgeTop: 20, selectedTags: ["VOL_CLIMAX"], tagMatchMode: "any" },
      { edgeScoreMap: mapOf(tagged) }
    );
    expect(out).toHaveLength(0);
  });

  it("does nothing when edgeTop is unset", () => {
    const out = applySignalFilters(twenty, base, { edgeScoreMap: twentyMap });
    expect(out).toHaveLength(20);
  });
});

describe("edgeTop travels in a shared link", () => {
  it("round-trips through the URL codec", () => {
    const params = filtersToParams({ ...DEFAULT_FILTERS, edgeTop: 20 });
    expect(params.get("edgetop")).toBe("20");
    expect(parseFilters(new URLSearchParams("edgetop=20")).edgeTop).toBe(20);
  });

  it("is absent from a default link, and unreadable values read as unset", () => {
    expect(filtersToParams(DEFAULT_FILTERS).has("edgetop")).toBe(false);
    expect(parseFilters(new URLSearchParams("")).edgeTop).toBe(null);
    expect(parseFilters(new URLSearchParams("edgetop=abc")).edgeTop).toBe(null);
  });
});
