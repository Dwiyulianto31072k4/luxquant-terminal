/**
 * The Top Runners refinement, rendered.
 *
 * It is a chip that only exists while Runners is the mode, carries the count,
 * and reports its own state — three things that are easy to get wrong and
 * invisible in a build. Rendered rather than asserted on the state, because
 * the bug worth catching is the control appearing where it means nothing.
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
  if (typeof globalThis.localStorage === "undefined") {
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
});

const { default: EdgeRecipesBar } = await import("../EdgeRecipesBar");
const { runnersRecipeState } = await import("../../utils/signalFilters");

const TAGS = ["VOL_CLIMAX", "RSI_OVERBOUGHT_H1"];
const runners = runnersRecipeState(TAGS);

const bar = (over = {}) =>
  renderToString(
    <EdgeRecipesBar
      tagWr={[]}
      deskRunnerTags={TAGS}
      selectedTags={[]}
      tagMatchMode="any"
      statusFilter="all"
      riskFilter="all"
      streakFilter="all"
      sorts={[]}
      searchPair=""
      edgeTop={null}
      showRecipes
      watchlistCount={0}
      watchlistActive={false}
      topRunnersCount={12}
      onToggleTopRunners={() => {}}
      {...over}
    />
  );

const text = (html) =>
  html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the Top only chip", () => {
  it("is there when Runners is the mode, with the count behind it", () => {
    const t = text(
      bar({
        selectedTags: runners.selectedTags,
        tagMatchMode: runners.tagMatchMode,
        edgeTop: runners.edgeTop,
        sorts: runners.sorts,
      })
    );
    expect(t).toContain("Top only");
    expect(t).toContain("12");
  });

  it("is NOT there in All, where the words mean nothing", () => {
    expect(text(bar())).not.toContain("Top only");
  });

  it("is NOT there for a reader with no Runners at all", () => {
    const t = text(
      bar({
        showRecipes: false,
        selectedTags: runners.selectedTags,
        tagMatchMode: runners.tagMatchMode,
        edgeTop: runners.edgeTop,
        sorts: runners.sorts,
      })
    );
    expect(t).not.toContain("Top only");
  });

  it("reports whether it is on, so a screen reader is not guessing", () => {
    const on = bar({
      selectedTags: runners.selectedTags,
      tagMatchMode: runners.tagMatchMode,
      edgeTop: runners.edgeTop,
      sorts: runners.sorts,
      topRunnersOnly: true,
    });
    expect(on).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Top only/s);
  });

  it("drops the count rather than printing a zero nobody can act on", () => {
    const t = text(
      bar({
        selectedTags: runners.selectedTags,
        tagMatchMode: runners.tagMatchMode,
        edgeTop: runners.edgeTop,
        sorts: runners.sorts,
        topRunnersCount: 0,
      })
    );
    expect(t).toContain("Top only");
    expect(t).not.toMatch(/Top only\s+0/);
  });
});
