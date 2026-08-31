import { describe, expect, it } from "vitest";

import { DEFAULT_FILTERS, applySignalFilters, filtersToParams, parseFilters } from "./signalFilters";

const sig = (over = {}) => ({
  signal_id: Math.random().toString(36).slice(2),
  pair: "BTCUSDT",
  status: "open",
  risk_level: "high",
  created_at: "2026-08-30T10:00:00+00:00",
  important_tags: [],
  ...over,
});

const run = (signals, over) => applySignalFilters(signals, { ...DEFAULT_FILTERS, ...over });

describe("status buckets", () => {
  // These three used to fall through to `default: return true` here, so the
  // filter silently returned the unfiltered list.
  const all = [
    sig({ status: "open" }),
    sig({ status: "tp1" }),
    sig({ status: "tp2" }),
    sig({ status: "tp3" }),
    sig({ status: "closed_win" }),
    sig({ status: "closed_loss" }),
  ];

  it("tp1_plus takes TP1 and above, never open or the stop", () => {
    const got = run(all, { statusFilter: "tp1_plus" }).map((s) => s.status);
    expect(got).toEqual(["tp1", "tp2", "tp3", "closed_win"]);
  });

  it("tp2_plus excludes TP1", () => {
    expect(run(all, { statusFilter: "tp2_plus" }).map((s) => s.status)).toEqual([
      "tp2",
      "tp3",
      "closed_win",
    ]);
  });

  it("full_tp is TP3 and above", () => {
    expect(run(all, { statusFilter: "full_tp" }).map((s) => s.status)).toEqual([
      "tp3",
      "closed_win",
    ]);
  });

  it("every bucket is a real subset — none is a silent no-op", () => {
    for (const f of ["tp1_plus", "tp2_plus", "full_tp"]) {
      expect(run(all, { statusFilter: f }).length).toBeLessThan(all.length);
    }
  });
});

describe("risk buckets partition the set", () => {
  const all = [
    sig({ risk_level: "low" }),
    sig({ risk_level: "medium" }),
    sig({ risk_level: "med" }),
    sig({ risk_level: "normal" }),
    sig({ risk_level: "high" }),
    sig({ risk_level: "" }),
    sig({ risk_level: null }),
  ];

  it("normal covers medium, med and normal alike", () => {
    expect(run(all, { riskFilter: "normal" })).toHaveLength(3);
  });

  it("unrated reaches the rows no other bucket matches", () => {
    expect(run(all, { riskFilter: "unrated" })).toHaveLength(2);
  });

  it("low + normal + high + unrated adds up to the whole set", () => {
    const total = ["low", "normal", "high", "unrated"].reduce(
      (n, f) => n + run(all, { riskFilter: f }).length,
      0
    );
    expect(total).toBe(all.length);
  });
});

describe("tag match mode", () => {
  const all = [
    sig({ important_tags: ["a", "b"] }),
    sig({ important_tags: ["a"] }),
    sig({ important_tags: ["c"] }),
  ];

  it("any matches either tag", () => {
    expect(run(all, { selectedTags: ["a", "b"], tagMatchMode: "any" })).toHaveLength(2);
  });

  it("all demands every tag — it used to be ignored and behave like any", () => {
    expect(run(all, { selectedTags: ["a", "b"], tagMatchMode: "all" })).toHaveLength(1);
  });

  it("defaults to any when unset", () => {
    expect(run(all, { selectedTags: ["a", "b"], tagMatchMode: undefined })).toHaveLength(2);
  });
});

describe("url round-trip", () => {
  it("carries the tag match mode", () => {
    const f = { ...DEFAULT_FILTERS, selectedTags: ["x"], tagMatchMode: "all" };
    expect(parseFilters(new URLSearchParams(filtersToParams(f).toString())).tagMatchMode).toBe(
      "all"
    );
  });

  it("omits the default so the url stays clean", () => {
    expect(filtersToParams({ ...DEFAULT_FILTERS }).toString()).not.toContain("tagmode");
  });
});
