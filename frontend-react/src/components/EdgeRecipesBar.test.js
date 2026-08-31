import { describe, expect, it } from "vitest";

import { captureRecipeState, sameRecipeState } from "./EdgeRecipesBar";

// What "Hunt full TP" applies.
const hunt = captureRecipeState({
  selectedTags: ["BTC_VOLATILE", "VOL_CLIMAX"],
  tagMatchMode: "any",
  verdictFilter: "worth_it",
  statusFilter: "all",
  riskFilter: "all",
  streakFilter: "all",
  sorts: [
    { field: "edge_score", order: "desc" },
    { field: "created_at", order: "desc" },
  ],
  searchPair: "",
  corrDecoupled: false,
  corrHighAlign: false,
});

const live = (over) => captureRecipeState({ ...hunt, ...over });

describe("a recipe stays on while you narrow inside it", () => {
  it("matches itself", () => {
    expect(sameRecipeState(live({}), hunt)).toBe(true);
  });

  it("survives typing in the search box", () => {
    // This is the regression: searching a coin inside Hunt made the bar claim
    // Hunt was off while every one of its filters was still applied.
    expect(sameRecipeState(live({ searchPair: "DO" }), hunt)).toBe(true);
  });

  it("survives tag order differing", () => {
    expect(
      sameRecipeState(live({ selectedTags: ["VOL_CLIMAX", "BTC_VOLATILE"] }), hunt)
    ).toBe(true);
  });
});

describe("a recipe turns off when its own filters change", () => {
  it("dropping a tag", () => {
    expect(sameRecipeState(live({ selectedTags: ["BTC_VOLATILE"] }), hunt)).toBe(false);
  });

  it("changing the verdict", () => {
    expect(sameRecipeState(live({ verdictFilter: "all" }), hunt)).toBe(false);
  });

  it("changing the status", () => {
    expect(sameRecipeState(live({ statusFilter: "open" }), hunt)).toBe(false);
  });

  it("re-sorting", () => {
    expect(
      sameRecipeState(live({ sorts: [{ field: "volume", order: "desc" }] }), hunt)
    ).toBe(false);
  });

  it("flipping a sort direction", () => {
    expect(
      sameRecipeState(
        live({
          sorts: [
            { field: "edge_score", order: "asc" },
            { field: "created_at", order: "desc" },
          ],
        }),
        hunt
      )
    ).toBe(false);
  });

  it("clearing everything", () => {
    expect(
      sameRecipeState(
        captureRecipeState({ selectedTags: [], verdictFilter: "all", statusFilter: "all" }),
        hunt
      )
    ).toBe(false);
  });
});
