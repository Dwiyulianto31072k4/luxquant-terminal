import { describe, expect, it } from "vitest";

import { captureRecipeState, sameRecipeState } from "./EdgeRecipesBar";

// What the Runners mode (key `full_tp`) applies.
const hunt = captureRecipeState({
  selectedTags: ["BTC_VOLATILE", "VOL_CLIMAX"],
  tagMatchMode: "any",
  statusFilter: "all",
  riskFilter: "all",
  streakFilter: "all",
  edgeTop: 20,
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

  it("does not capture the day tab — dates slice a recipe, they are not the recipe", () => {
    // The other half of the awkward Hunt → then day flow: applyRecipeState
    // used to wipe selectedDates, so Today then Hunt bounced back to All Days.
    // The captured recipe must not even carry a date, or a saved view would
    // still fight the tabs.
    expect("selectedDates" in captureRecipeState({ ...hunt, selectedDates: ["2026-09-07"] })).toBe(
      false
    );
    expect(sameRecipeState(live({}), hunt)).toBe(true);
  });

  it("survives tag order differing", () => {
    expect(
      sameRecipeState(live({ selectedTags: ["VOL_CLIMAX", "BTC_VOLATILE"] }), hunt)
    ).toBe(true);
  });

  // These two asserted `false` and sat under "turns off when its own filters
  // change", which is where the bug lived: a sort is not one of its filters.
  // Re-sorting inside Runners left the result set identical — 33 of 709 before
  // and after — while the rail dropped to All. Search narrows for real and is
  // allowed to stay inside a recipe, so an ordering that narrows nothing
  // cannot be held to a stricter rule.
  it("survives re-sorting on another field", () => {
    expect(
      sameRecipeState(live({ sorts: [{ field: "volume", order: "desc" }] }), hunt)
    ).toBe(true);
  });

  it("survives flipping a sort direction", () => {
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
    ).toBe(true);
  });

  it("still remembers the sort it applied, for saved views", () => {
    // Dropping it from IDENTITY must not drop it from CAPTURE: entering
    // Runners should still rank by Edge.
    expect(captureRecipeState({ ...hunt }).sorts).toEqual([
      { field: "edge_score", order: "desc" },
      { field: "created_at", order: "desc" },
    ]);
  });
});

describe("a recipe turns off when its own filters change", () => {
  it("dropping a tag", () => {
    expect(sameRecipeState(live({ selectedTags: ["BTC_VOLATILE"] }), hunt)).toBe(false);
  });

  it("changing the risk band", () => {
    expect(sameRecipeState(live({ riskFilter: "low" }), hunt)).toBe(false);
  });

  it("changing the status", () => {
    expect(sameRecipeState(live({ statusFilter: "open" }), hunt)).toBe(false);
  });

  it("dropping the Edge cut", () => {
    expect(sameRecipeState(live({ edgeTop: null }), hunt)).toBe(false);
  });

  it("clearing everything", () => {
    expect(
      sameRecipeState(
        captureRecipeState({ selectedTags: [], statusFilter: "all" }),
        hunt
      )
    ).toBe(false);
  });
});
