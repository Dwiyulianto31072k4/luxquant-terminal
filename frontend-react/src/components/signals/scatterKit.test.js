import { describe, it, expect } from "vitest";
import { domainFor, quadrantCaptions, scaleFor } from "./scatterKit";

const LABELS = { tr: "HOT · RAN FURTHER", tl: "QUIET · RAN FURTHER", br: "HOT · ORDINARY", bl: "QUIET · ORDINARY" };
const FRAME = { W: 1240, H: 600, pad: { t: 20, r: 34, b: 44, l: 56 }, fs: 11 };

describe("an axis bends only when the data bends", () => {
  it("leaves a well-behaved spread alone", () => {
    expect(scaleFor([9.1, 12, 14, 17, 21, 25.6])).toBe("linear");
  });
  it("bends for a real tail, which rotation has", () => {
    expect(scaleFor([-4, -2, 1, 3, 4, 6, 15, 20, 24, 56, 95])).toBe("sqrt");
  });
  it("refuses to decide from too little", () => {
    expect(scaleFor([1, 500])).toBe("linear");
    expect(scaleFor([])).toBe("linear");
  });
});

describe("the window shows the data", () => {
  it("does not reserve a third of a canvas for a zero nobody plotted", () => {
    // Narrative peaks run about 9% to 27%.
    const d = domainFor([9.1, 14, 21, 25.6], { zero: false });
    expect(d.lo).toBeGreaterThan(5);
  });
  it("keeps zero when zero is a real line", () => {
    const d = domainFor([4, 9, 22], { zero: true });
    expect(d.lo).toBeLessThanOrEqual(0);
  });
  it("never collapses to a point", () => {
    const d = domainFor([12], { zero: false });
    expect(d.hi).toBeGreaterThan(d.lo);
  });
});

describe("quadrant captions sit in the corners and know when not to appear", () => {
  const at = (zeroX, midY) =>
    quadrantCaptions({ ...FRAME, zeroX, midY, labels: LABELS });

  it("labels all four when all four exist", () => {
    const c = at(600, 300);
    expect(c.map((x) => x.key).sort()).toEqual(["bl", "br", "tl", "tr"]);
  });

  it("anchors into the frame so a label cannot run off the edge", () => {
    // Anchored beside the dividing line, a left caption printed "BUSY · SOLD"
    // as "SOLD" whenever the zero line drifted left.
    for (const c of at(600, 300)) {
      expect(c.x).toBeGreaterThanOrEqual(FRAME.pad.l);
      expect(c.x).toBeLessThanOrEqual(FRAME.W - FRAME.pad.r);
      if (c.anchor === "start") expect(c.x).toBeLessThan(FRAME.W / 2);
      if (c.anchor === "end") expect(c.x).toBeGreaterThan(FRAME.W / 2);
    }
  });

  it("drops a caption for a quadrant that has been panned off the frame", () => {
    // Everything positive: there is no left half to label.
    const c = at(FRAME.pad.l + 5, 300);
    expect(c.map((x) => x.key).sort()).toEqual(["br", "tr"]);
    // And nothing above the divider.
    const d = at(600, 25);
    expect(d.every((x) => x.key.startsWith("b"))).toBe(true);
  });

  it("says nothing at all when a label is missing", () => {
    const c = quadrantCaptions({ ...FRAME, zeroX: 600, midY: 300, labels: { tr: "ONLY" } });
    expect(c).toHaveLength(1);
    expect(c[0].text).toBe("ONLY");
  });
});

describe("captions keep clear of the floating controls", () => {
  it("starts the top-right caption where the zoom buttons end", () => {
    const plain = quadrantCaptions({ ...FRAME, zeroX: 600, midY: 300, labels: LABELS });
    const reserved = quadrantCaptions({
      ...FRAME, zeroX: 600, midY: 300, labels: LABELS, reserveTopRight: 140,
    });
    const tr = (c) => c.find((x) => x.key === "tr").x;
    expect(tr(reserved)).toBeCloseTo(tr(plain) - 140, 6);
    // and only that one moves
    expect(reserved.find((x) => x.key === "br").x).toBeCloseTo(
      plain.find((x) => x.key === "br").x,
      6
    );
  });
});
