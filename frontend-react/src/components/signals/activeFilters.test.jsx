/**
 * The one filter bar, rendered.
 *
 * It replaced two bars that printed the same filters twice under two counts
 * beside two Clear alls, so the things worth pinning are: nothing is listed
 * twice, sort is kept apart from filtering, the count leads, and the action on
 * the result is actually findable.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { renderToString } from "react-dom/server";

beforeAll(() => {
  if (typeof globalThis.document === "undefined") {
    globalThis.document = { documentElement: {}, body: {}, hidden: false };
  }
  if (typeof globalThis.getComputedStyle === "undefined") {
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
  }
});

const { default: EdgeActiveFilters } = await import("../EdgeActiveFilters");

const bar = (over = {}) =>
  renderToString(
    <EdgeActiveFilters
      selectedTags={["VOL_CLIMAX", "RSI_OVERBOUGHT_H1"]}
      tagMatchMode="any"
      edgeTop={30}
      sorts={[
        { field: "edge_score", order: "desc" },
        { field: "created_at", order: "desc" },
      ]}
      filteredCount={8}
      totalUnfiltered={736}
      onVisualize={() => {}}
      {...over}
    />
  );

const text = (h) =>
  h.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the consolidated filter bar", () => {
  it("leads with what you narrowed to", () => {
    expect(text(bar())).toContain("8 of 736 signals");
  });

  it("lists the Edge cut ONCE, not once per bar", () => {
    // "Edge top 30" and "Top 30% Edge" were the same filter in two strips.
    const t = text(bar());
    expect(t.match(/Edge/g).length).toBeLessThan(4);
    expect(t).toContain("Top 30% Edge");
    expect(t).not.toContain("Edge top 30");
  });

  it("carries the narratives the other strip used to own", () => {
    const t = text(
      bar({ narratives: [{ category_id: "privacy", name: "Privacy" }], onRemoveNarrative: () => {} })
    );
    expect(t).toContain("Privacy");
  });

  it("counts only what filters, not the sort chain beside it", () => {
    // Counting the sort chips here contradicted the layout two lines under it.
    const t = text(bar());
    // dates, match mode, two tags and the Edge cut — the two sort chips excluded.
    expect(t).toMatch(/5 filters/);
  });

  it("keeps the sort chain out of the filter run", () => {
    // A sort changes the ORDER of a set, not its membership; mixed in, people
    // removed a sort expecting rows back.
    const t = text(bar());
    expect(t).toContain("Order");
    expect(t).toMatch(/1 Edge/);
  });

  it("shows Visualize in the accent, with the count it acts on", () => {
    const h = bar();
    expect(h).toContain("bg-accent");
    expect(text(h)).toContain("Visualize");
  });

  it("hides Visualize when there is nothing to compare", () => {
    expect(text(bar({ filteredCount: 1 }))).not.toContain("Visualize");
    expect(text(bar({ onVisualize: undefined }))).not.toContain("Visualize");
  });

  it("always states the day span, because a count means nothing without it", () => {
    // 8 of 736 is a different claim over one day than over all of them.
    expect(text(bar({ selectedDates: [] }))).toContain("All days");
    expect(text(bar({ selectedDates: ["2026-09-21"] }))).toContain("2026-09-21");
    expect(text(bar({ selectedDates: ["2026-09-21", "2026-09-20"] }))).toContain("Days: 2");
  });
});
