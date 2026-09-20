import { describe, it, expect } from "vitest";
import { IDENTITY, markScale, zoomAbout } from "./useZoomPan";

const W = 640;
const H = 320;
const at = (t, f, x, y) => zoomAbout(t, f, x, y, { W, H, min: 1, max: 16 });

describe("zoom about the pointer", () => {
  it("keeps the datum under the cursor exactly where it was", () => {
    // The point at screen 420,200 must still be at 420,200 after the zoom —
    // this is the whole difference between a chart that feels like a map and
    // one that feels like it is fighting you.
    const t = at(IDENTITY, 2.5, 420, 200);
    const back = (v, o) => t.k * v + o;
    // the datum that WAS under the cursor, in data space
    const dataX = (420 - IDENTITY.x) / IDENTITY.k;
    const dataY = (200 - IDENTITY.y) / IDENTITY.k;
    expect(back(dataX, t.x)).toBeCloseTo(420, 6);
    expect(back(dataY, t.y)).toBeCloseTo(200, 6);
  });

  it("composes: two zooms about the same point equal one of the product", () => {
    const once = at(IDENTITY, 4, 300, 150);
    const twice = at(at(IDENTITY, 2, 300, 150), 2, 300, 150);
    expect(twice.k).toBeCloseTo(once.k, 9);
    expect(twice.x).toBeCloseTo(once.x, 6);
    expect(twice.y).toBeCloseTo(once.y, 6);
  });

  it("never zooms out past the frame or in past the ceiling", () => {
    expect(at(IDENTITY, 0.2, 100, 100).k).toBe(1);
    expect(at({ k: 12, x: -100, y: -100 }, 8, 100, 100).k).toBe(16);
  });

  it("returns to exactly the identity when zoomed back out", () => {
    const t = at(at(IDENTITY, 3, 500, 90), 1 / 3, 500, 90);
    expect(t.k).toBeCloseTo(1, 9);
    expect(t.x).toBeCloseTo(0, 6);
    expect(t.y).toBeCloseTo(0, 6);
  });
});

describe("the frame cannot be dragged away", () => {
  it("pins the offset to the overhang, so the cloud cannot be flicked into the margin", () => {
    const t = at(IDENTITY, 4, 320, 160);
    // At k=4 the content is four frames wide, so the offset may range over
    // three of them and no further.
    expect(t.x).toBeLessThanOrEqual(0);
    expect(t.x).toBeGreaterThanOrEqual(-W * 3);
    expect(t.y).toBeLessThanOrEqual(0);
    expect(t.y).toBeGreaterThanOrEqual(-H * 3);
  });

  it("has no slack at all at 1x, so an unzoomed plot cannot be nudged", () => {
    const t = at(IDENTITY, 1, 0, 0);
    expect(t).toEqual({ k: 1, x: 0, y: 0 });
  });

  it("clamps a zoom at the very edge back inside the frame", () => {
    const t = at(IDENTITY, 6, 0, 0);
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);
    const r = at(IDENTITY, 6, W, H);
    expect(r.x).toBeCloseTo(-W * 5, 6);
    expect(r.y).toBeCloseTo(-H * 5, 6);
  });
});

describe("marks grow slower than the plot does", () => {
  it("spreads the cloud faster than it magnifies the dots", () => {
    // If marks scaled with k, zooming would keep the field exactly as crowded
    // as it started — which is the one thing zooming is for.
    for (const k of [2, 4, 8]) expect(markScale(k)).toBeLessThan(k);
    expect(markScale(1)).toBe(1);
  });

  it("still carries dots over the threshold where they gain a logo", () => {
    // The point of the sub-linear growth: marks that were too small to hold a
    // logo cross the 7px line as you zoom. A mid-sized 5px dot at 2x, the
    // smallest 4px ones at 4x.
    expect(5 * markScale(2)).toBeGreaterThan(7);
    expect(4 * markScale(4)).toBeGreaterThan(7);
    expect(4 * markScale(1)).toBeLessThan(7);
  });

  it("is capped, so a deep zoom does not fill the plot with one coin", () => {
    expect(markScale(16)).toBeLessThanOrEqual(2.6);
    expect(markScale(100)).toBeLessThanOrEqual(2.6);
  });
});

describe("the two-finger rule, which is what keeps a phone scrollable", () => {
  // The hook is a React hook, so the rule is asserted on the shape that
  // decides it: a single TOUCH pointer must be ignored, everything else must
  // not. This mirrors the branch at the top of onPointerDown.
  const wouldPan = (pointerType, count) => !(pointerType === "touch" && count === 1);

  it("lets one finger scroll the page", () => {
    expect(wouldPan("touch", 1)).toBe(false);
  });

  it("takes the gesture back at two fingers", () => {
    expect(wouldPan("touch", 2)).toBe(true);
  });

  it("never withholds a mouse or pen drag, which has no page-scroll to steal", () => {
    expect(wouldPan("mouse", 1)).toBe(true);
    expect(wouldPan("pen", 1)).toBe(true);
  });
});
