import { describe, expect, it } from "vitest";

import {
  formatSortChain,
  isSortableField,
  MAX_SORTS,
  normalizeSorts,
  promoteSortField,
  SORT_FIELDS,
  SORT_LABELS,
  sortSignals,
} from "./signalSort";

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
    // Reads MAX_SORTS rather than a literal: the cap was raised from 4 to 6 and
    // a hard-coded 4 here would have failed for the wrong reason.
    const long = normalizeSorts(
      Array.from({ length: MAX_SORTS }, (_, i) => ({ field: `f${i}`, order: "desc" }))
    );
    expect(long).toHaveLength(MAX_SORTS);
    expect(promoteSortField(long, "e").length).toBeLessThanOrEqual(MAX_SORTS);
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
    expect(formatSortChain(chain)).toBe("1 Pair record ↓ · 2 Edge ↓ · 3 Called ↑");
  });
});

it('sorts Pair record by adjusted rate, keeps zero real and unknown last in both directions', () => {
  const rows = ['a','b','c','d'].map(pair => ({pair,signal_id:pair}));
  const ctx = { coinIntel: { a:{win_rate:100,win_rate_shrunk:70}, b:{win_rate:85,win_rate_shrunk:82}, c:{win_rate:0} } };
  expect(sortSignals(rows,[{field:'verdict',order:'desc'}],ctx).map(s=>s.pair)).toEqual(['b','a','c','d']);
  expect(sortSignals(rows,[{field:'verdict',order:'asc'}],ctx).map(s=>s.pair)).toEqual(['c','a','b','d']);
});

describe("the sort field registry is the only list", () => {
  // Written because the two lists that preceded it had BOTH drifted, in
  // opposite directions, at the same time: `turnover` shipped a comparator and
  // a dropdown row with no label, so a filter chip printed the bare field name
  // `turnover` beside properly named ones; `verdict` shipped a label, a column
  // and a preset with no dropdown row, so it was reachable only by knowing that
  // clicking the header worked. Neither is the sort of thing review catches.
  it("gives every field a short label and a dropdown label", () => {
    for (const f of SORT_FIELDS) {
      expect(f.value, `${f.value} value`).toBeTruthy();
      expect(f.label, `${f.value} short label`).toBeTruthy();
      expect(f.long, `${f.value} dropdown label`).toBeTruthy();
    }
  });

  it("never lists a field twice", () => {
    const values = SORT_FIELDS.map((f) => f.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("keeps SORT_LABELS and SORT_FIELDS in step by construction", () => {
    expect(Object.keys(SORT_LABELS).sort()).toEqual(SORT_FIELDS.map((f) => f.value).sort());
  });

  it("renders a real name for every field, never the raw key", () => {
    // This is the assertion that would have caught the turnover chip.
    for (const f of SORT_FIELDS) {
      const out = formatSortChain([{ field: f.value, order: "desc" }]);
      expect(out).toBe(`1 ${f.label} ↓`);
      if (f.label !== f.value) expect(out).not.toContain(f.value);
    }
  });

  it("recognises its own fields and rejects junk", () => {
    for (const f of SORT_FIELDS) expect(isSortableField(f.value)).toBe(true);
    expect(isSortableField("dropTable")).toBe(false);
    expect(isSortableField(undefined)).toBe(false);
  });

  it("can actually sort by every field it offers", () => {
    // A field in the list with no comparator would silently fall through to the
    // created_at default; at minimum it must not throw and must return the rows.
    const rows = [
      { pair: "AUSDT", signal_id: 1, call_message_id: 1, entry: "2", created_at: "2026-09-01T00:00:00Z" },
      { pair: "BUSDT", signal_id: 2, call_message_id: 2, entry: "1", created_at: "2026-09-02T00:00:00Z" },
    ];
    for (const f of SORT_FIELDS) {
      const out = sortSignals(rows, [{ field: f.value, order: "desc" }]);
      expect(out, `${f.value} sort`).toHaveLength(2);
    }
  });
});
