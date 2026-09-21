/**
 * The phone layer of the Signals desk, pinned.
 *
 * Every one of these was a defect on a real phone: filter chips squeezed to
 * empty boxes, a caption printed under the zoom buttons, names hidden under
 * chrome, a tray that repeated one reason fourteen times, a hint that told a
 * thumb to click and scroll.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { renderToString } from "react-dom/server";
import { placeLabels, quadrantCaptions } from "./scatterKit";

beforeAll(() => {
  if (typeof globalThis.document === "undefined") {
    globalThis.document = { documentElement: {}, body: {}, hidden: false };
  }
  if (typeof globalThis.getComputedStyle === "undefined") {
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
  }
});

const { default: EdgeActiveFilters } = await import("../EdgeActiveFilters");
const { default: MissingTray } = await import("./MissingTray");
const { ZoomHint } = await import("./ZoomControls");
const { default: usePhone } = await import("./usePhone");

const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the filter bar on a phone", () => {
  const html = renderToString(
    <EdgeActiveFilters
      selectedTags={["VOL_CLIMAX", "RSI_OVERBOUGHT_H1"]}
      tagMatchMode="any"
      edgeTop={30}
      sorts={[
        { field: "edge_score", order: "desc" },
        { field: "created_at", order: "desc" },
      ]}
      filteredCount={119}
      totalUnfiltered={698}
      onVisualize={() => {}}
    />
  );

  it("gives the chip run a real basis, so the ORDER group cannot squeeze it to nothing", () => {
    // flex-1 (a zero basis) beside a shrink-0 sort group is what left five
    // empty boxes with an x in each at 440px.
    expect(html).toContain("flex-[1_1_18rem]");
    expect(html).not.toMatch(/class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-1.5">/);
  });

  it("ends on a full-width Visualize that names what it will show", () => {
    expect(text(html)).toContain("Visualize 119 calls");
    expect(html).toMatch(/h-11 w-full[^"]*sm:hidden/);
  });

  it("keeps the compact Visualize for sm and up", () => {
    expect(html).toMatch(/hidden items-center[^"]*sm:inline-flex/);
  });
});

describe("what a chart could not place", () => {
  const items = Array.from({ length: 15 }, (_, i) => ({
    id: `c${i}`,
    pair: `COIN${i}`,
    why: "no turnover in this snapshot",
    raw: { i },
  }));

  it("says a shared reason once", () => {
    const t = text(renderToString(<MissingTray items={items} />));
    expect(t.match(/no turnover in this snapshot/gi)).toHaveLength(1);
    expect(t).toContain("Not on this chart · 15");
  });

  it("offers the rest as a button, not as text that looks like one", () => {
    const h = renderToString(<MissingTray items={items} limit={8} />);
    expect(text(h)).toContain("Show 7 more");
    expect(h).toMatch(/<button[^>]*>Show 7 more<\/button>/);
  });

  it("keeps separate reasons separate", () => {
    const mixed = [
      ...items.slice(0, 2),
      { id: "x", pair: "NOSTOP", why: "no stop published", raw: {} },
    ];
    const t = text(renderToString(<MissingTray items={mixed} />));
    expect(t).toContain("No turnover in this snapshot:");
    expect(t).toContain("No stop published:");
  });
});

describe("labels and captions stay out from under the zoom controls", () => {
  const W = 360;
  const H = 440;
  const controls = [W - 130, 0, 130, 42];

  it("never places a name inside a blocked box", () => {
    const pts = Array.from({ length: 30 }, (_, i) => ({
      id: `p${i}`,
      cx: 200 + (i % 6) * 26,
      cy: 12 + Math.floor(i / 6) * 22,
      r: 4,
      name: `N${i}`,
      priority: 30 - i,
    }));
    const placed = placeLabels(pts, { W, H, fs: 10, max: 99, blocked: [controls] });
    const [bx, by, bw, bh] = controls;
    for (const l of placed.values()) {
      const [x, y, w, h] = l.box;
      const overlaps = !(x + w < bx || bx + bw < x || y + h < by || by + bh < y);
      expect(overlaps).toBe(false);
    }
    expect(placed.size).toBeGreaterThan(0);
  });

  it("drops the top-right caption below the controls when beside them would cross zero", () => {
    const c = quadrantCaptions({
      W, H, pad: { t: 14, r: 16, b: 38, l: 42 }, fs: 10,
      zeroX: 170, midY: 200,
      labels: { tr: "BUSY · BID", tl: "BUSY · SOLD" },
      reserveTopRight: 140, reserveTopRightDown: 44,
    });
    const tr = c.find((x) => x.key === "tr");
    expect(tr).toBeTruthy();
    expect(tr.y).toBeGreaterThan(44);
    expect(tr.x).toBeGreaterThan(300);
  });

  it("keeps it beside them where there is room, as on the desk", () => {
    const c = quadrantCaptions({
      W: 1240, H: 600, pad: { t: 20, r: 34, b: 44, l: 56 }, fs: 11,
      zeroX: 600, midY: 300,
      labels: { tr: "HOT · RAN FURTHER" },
      reserveTopRight: 140, reserveTopRightDown: 44,
    });
    expect(c[0].y).toBeLessThan(44);
  });
});

describe("the chart hint speaks to the hand holding it", () => {
  it("carries both a pointer and a touch sentence, switched by pointer type", () => {
    const h = renderToString(<ZoomHint wheel="direct" />);
    expect(text(h)).toContain("scroll to zoom");
    expect(text(h)).toContain("pinch to zoom");
    expect(h).toContain("[@media(pointer:coarse)]:hidden");
    expect(h).toContain("hidden [@media(pointer:coarse)]:inline");
  });
});

describe("usePhone", () => {
  it("answers desktop where there is no window, so server render never draws the phone geometry", () => {
    function Probe() {
      return <span>{usePhone() ? "phone" : "desk"}</span>;
    }
    expect(text(renderToString(<Probe />))).toContain("desk");
  });
});
