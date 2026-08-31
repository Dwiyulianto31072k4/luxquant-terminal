import { describe, expect, it } from "vitest";

import { formatSortChain, normalizeSorts, promoteSortField, sortSignals } from "./signalSort";

const chain = [
  { field: "verdict", order: "desc" },
  { field: "edge_score", order: "desc" },
  { field: "created_at", order: "asc" },
];

describe("promoteSortField", () => {
  it("keeps the other levels as tiebreakers instead of wiping them", () => {
    // The dropdown used to hand back a chain of one, so picking a field there
    // silently destroyed everything built with Shift+click.
    expect(promoteSortField(chain, "volume")).toEqual([
      { field: "volume", order: "desc" },
      ...chain,
    ]);
  });

  it("moves a field already in the chain to the front, keeping its direction", () => {
    expect(promoteSortField(chain, "created_at")).toEqual([
      { field: "created_at", order: "asc" },
      { field: "verdict", order: "desc" },
      { field: "edge_score", order: "desc" },
    ]);
  });

  it("never duplicates a field", () => {
    const out = promoteSortField(chain, "edge_score");
    expect(out.filter((s) => s.field === "edge_score")).toHaveLength(1);
  });

  it("honours an explicit order over the remembered one", () => {
    expect(promoteSortField(chain, "created_at", "desc")[0]).toEqual({
      field: "created_at",
      order: "desc",
    });
  });

  it("respects the max chain length", () => {
    const long = normalizeSorts([
      { field: "a", order: "desc" },
      { field: "b", order: "desc" },
      { field: "c", order: "desc" },
      { field: "d", order: "desc" },
    ]);
    expect(promoteSortField(long, "e").length).toBeLessThanOrEqual(4);
    expect(promoteSortField(long, "e")[0].field).toBe("e");
  });

  it("promotes onto the default chain when there is nothing yet", () => {
    // An empty chain normalizes to the default (Called ↓), which then stays on
    // as the tiebreak — the same thing that happens for any other chain.
    expect(promoteSortField([], "volume")).toEqual([
      { field: "volume", order: "desc" },
      { field: "created_at", order: "desc" },
    ]);
  });
});

describe("Called sorts by when the call went out", () => {
  const s = (id, iso) => ({ signal_id: id, call_message_id: id, created_at: iso });

  it("orders newest first and reverses on asc", () => {
    const rows = [
      s(3, "2026-08-31T14:40:00+00:00"),
      s(1, "2026-08-31T19:55:00+00:00"),
      s(2, "2026-08-31T18:45:00+00:00"),
    ];
    const desc = sortSignals(rows, [{ field: "created_at", order: "desc" }]);
    expect(desc.map((r) => r.signal_id)).toEqual([1, 2, 3]);
    const asc = sortSignals(rows, [{ field: "created_at", order: "asc" }]);
    expect(asc.map((r) => r.signal_id)).toEqual([3, 2, 1]);
  });
});

describe("formatSortChain", () => {
  it("numbers the levels so hidden ones are still nameable", () => {
    expect(formatSortChain(chain)).toBe("1 Verdict ↓ · 2 Edge ↓ · 3 Called ↑");
  });
});
