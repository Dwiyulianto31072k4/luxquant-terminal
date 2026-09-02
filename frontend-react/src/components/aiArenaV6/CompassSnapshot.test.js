import { describe, expect, it } from "vitest";

import { rangeEdge } from "./CompassSnapshot";

/**
 * The BTC Compass meter plots INVALIDATION — TARGET — LIVE. On a range read the
 * level the AI expects to touch first can sit below spot, and then both markers
 * land on one side with LIVE pinned to the end of the track. The band's other
 * edge is what makes it read as a range instead of a broken directional call.
 *
 * Same contract as the Telegram card's levels block — the same read ships
 * through both, so they must not disagree.
 */
const RANGE = {
  spot: 77450,
  target: 76250,
  bias: "NEUTRAL_RANGE",
  support: 76250,
  lid: 78450,
};

describe("rangeEdge", () => {
  it("shows the lid when the target sits below spot", () => {
    expect(rangeEdge(RANGE)).toEqual({ label: "RANGE LID", price: 78450 });
  });

  it("shows the floor when the target sits above spot", () => {
    expect(
      rangeEdge({ ...RANGE, target: 78200, spot: 77041, support: 76413 })
    ).toEqual({ label: "RANGE FLOOR", price: 76413 });
  });

  it("adds nothing to a directional read", () => {
    for (const bias of ["BULLISH_CONTINUATION", "BEARISH_CONTINUATION"]) {
      expect(rangeEdge({ ...RANGE, bias })).toBeNull();
    }
  });

  it("draws nothing when the edge is on the wrong side", () => {
    // A lid below spot is not a lid; say nothing rather than something false.
    expect(rangeEdge({ ...RANGE, lid: 76900 })).toBeNull();
  });

  it("tolerates a missing edge", () => {
    expect(rangeEdge({ ...RANGE, lid: null })).toBeNull();
    expect(rangeEdge({ ...RANGE, lid: undefined })).toBeNull();
  });

  it("returns null when spot or target is not a number", () => {
    expect(rangeEdge({ ...RANGE, spot: null })).toBeNull();
    expect(rangeEdge({ ...RANGE, target: undefined })).toBeNull();
  });

  it("brackets spot whenever it returns an edge", () => {
    // Whichever side the touch falls on, the touch and the edge must sit on
    // opposite sides of spot — that is the whole point of drawing the edge.
    for (const target of [76250, 78200]) {
      const e = rangeEdge({ ...RANGE, target, spot: 77041, support: 76413 });
      expect(e).not.toBeNull();
      expect(Math.min(target, e.price)).toBeLessThan(77041);
      expect(Math.max(target, e.price)).toBeGreaterThan(77041);
    }
  });
});
