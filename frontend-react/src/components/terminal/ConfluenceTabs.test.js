import { describe, expect, it } from "vitest";

import { CONF_EDGE, CONF_FILTERS, edgeOf } from "./ConfluenceTabs";

const keep = (key, tags) => CONF_FILTERS.find(([k]) => k === key)[2](tags);

describe("the filters keep what they claim", () => {
  it("volume 3x no longer drags 2x and climax in with it", () => {
    // This was the bug: one chip mixed a +5.7pp tag with a -0.9pp one, so the
    // only filter here that clearly earns its place was diluted by the one
    // beside it.
    expect(keep("volspike", ["VOL_SPIKE_3X"])).toBe(true);
    expect(keep("volspike", ["VOL_SPIKE_2X"])).toBe(false);
    expect(keep("volspike", ["VOL_CLIMAX"])).toBe(false);
  });

  it("the mover filter needs BOTH halves — the conjunction is what pays", () => {
    // Already-moving ALONE measures nothing (43.8% against 43.0% baseline).
    expect(keep("mover", ["VOL_SPIKE_3X", "PARABOLIC"])).toBe(true);
    expect(keep("mover", ["VOL_SPIKE_3X", "LATE_ENTRY"])).toBe(true);
    expect(keep("mover", ["VOL_SPIKE_3X"])).toBe(false);
    expect(keep("mover", ["PARABOLIC"])).toBe(false);
  });

  it("no-warnings still excludes the warning tags", () => {
    expect(keep("nowarn", ["FRESH_BREAKOUT"])).toBe(true);
    expect(keep("nowarn", ["FRESH_BREAKOUT", "LATE_ENTRY"])).toBe(false);
  });
});

describe("the measured edge", () => {
  it("takes the best single claim, never the sum", () => {
    // The tags overlap heavily; summing would count one volume spike three
    // times and hand the top of the screener to whatever is most tagged.
    const both = edgeOf(["VOL_SPIKE_3X", "PARABOLIC", "FRESH_BREAKOUT"]);
    expect(both).toBe(CONF_EDGE.mover.pp);
    expect(both).toBeLessThan(
      CONF_EDGE.mover.pp + CONF_EDGE.volspike.pp + CONF_EDGE.fresh.pp
    );
  });

  it("never goes negative on a setup that also carries a good tag", () => {
    expect(edgeOf(["DEEP_PULLBACK", "VOL_SPIKE_3X"])).toBe(CONF_EDGE.volspike.pp);
  });

  it("is zero for a setup with nothing measured on it", () => {
    expect(edgeOf(["SOME_UNKNOWN_TAG"])).toBe(0);
    expect(edgeOf([])).toBe(0);
    expect(edgeOf(null)).toBe(0);
  });

  it("keeps the sample size beside every figure it publishes", () => {
    for (const [k, e] of Object.entries(CONF_EDGE)) {
      if (e === null) continue;
      expect(typeof e.pp, k).toBe("number");
      expect(e.n, k).toBeGreaterThan(100);
    }
  });
});
