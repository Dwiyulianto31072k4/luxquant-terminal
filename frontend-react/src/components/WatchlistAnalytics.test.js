import { describe, expect, it } from "vitest";

import { summarise } from "./WatchlistAnalytics";

const row = (over = {}) => ({
  signal_id: Math.random().toString(36).slice(2),
  created_at: "2026-09-13T12:00:00+00:00",
  call_created_at: "2026-09-13T11:30:00+00:00",
  outcome: "tp2",
  peak_pct: 12,
  ...over,
});

describe("what the saved calls did", () => {
  it("counts a win by OUTCOME, never by status", () => {
    // The reason this matters, measured on the live watchlist: 22 of 732 rows
    // carry status closed_loss while their canonical outcome is a TP — the call
    // reached a target and later stopped out. Reading status would under-count
    // wins by 3% and contradict the desk's published rate.
    const s = summarise([
      row({ outcome: "tp3", status: "closed_loss" }),
      row({ outcome: "sl", status: "closed_loss" }),
    ]);
    expect(s.resolved).toBe(2);
    expect(s.wins).toBe(1);
  });

  it("never counts an open call as a loss", () => {
    const s = summarise([row({ outcome: null }), row({ outcome: "tp1" })]);
    expect(s.open).toBe(1);
    expect(s.resolved).toBe(1);
    expect(s.wins).toBe(1);
  });

  it("works at n=1, which is what 29 of 62 users hold", () => {
    const s = summarise([row({ outcome: "tp4", peak_pct: 80 })]);
    expect(s.total).toBe(1);
    expect(s.ladder.tp4).toBe(1);
    expect(s.peak.gte50).toBe(1);
    expect(s.avgPeak).toBe(80);
  });

  it("buckets the gap between the call and the save", () => {
    const s = summarise([
      // 30 minutes after the call
      row({ created_at: "2026-09-13T12:00:00Z", call_created_at: "2026-09-13T11:30:00Z" }),
      // 6 hours after
      row({ created_at: "2026-09-13T18:00:00Z", call_created_at: "2026-09-13T12:00:00Z" }),
      // three days after
      row({ created_at: "2026-09-13T12:00:00Z", call_created_at: "2026-09-10T12:00:00Z" }),
    ]);
    expect(s.lag).toEqual({ h1: 1, d1: 1, late: 1 });
    expect(s.lagN).toBe(3);
  });

  it("drops a negative gap rather than inventing a bucket for it", () => {
    // Saved "before" the call exists means the clocks disagree, not time travel.
    const s = summarise([
      row({ created_at: "2026-09-13T10:00:00Z", call_created_at: "2026-09-13T12:00:00Z" }),
    ]);
    expect(s.lagN).toBe(0);
  });

  it("survives rows with nothing joined", () => {
    const s = summarise([{ signal_id: "x", created_at: "2026-09-13T12:00:00Z" }]);
    expect(s.total).toBe(1);
    expect(s.resolved).toBe(0);
    expect(s.peakN).toBe(0);
    expect(s.lagN).toBe(0);
    expect(s.avgPeak).toBe(null);
  });

  it("returns an empty shape for an empty list", () => {
    const s = summarise([]);
    expect(s.total).toBe(0);
    expect(s.wins).toBe(0);
  });
});
