// Tests for the Compare verdict logic.
//
// This is the code that tells a trader which of several setups to take, so a
// wrong answer here costs money rather than pixels. Two of the cases below are
// bugs this file actually shipped and I had to fix:
//
//   · the verdict once ranked by percentage room but printed the absolute
//     figure, announcing "most room left (+22.9%)" while +38.0% sat on screen
//   · a row whose live price had not loaded scored 0, which beats a genuinely
//     bad setup (past target scores −4.3) — so the winner could be a coin we
//     had no price for at all
//
// Both are pinned here so they cannot come back.
import { describe, it, expect } from "vitest";
import { metricsOf, scoreOne, buildVerdict, concentrationNote } from "./SignalCompare.jsx";

// A signal shaped like the API returns one. entry 100, stop 95, target 120.
const sig = (over = {}) => ({
  pair: "TESTUSDT",
  entry: 100,
  stop1: 95,
  target1: 110,
  target2: 120,
  created_at: new Date().toISOString(),
  ...over,
});
const row = (price, over = {}, volume = 5e6) =>
  metricsOf({ signal: sig(over), price, volume });

describe("metricsOf — the numbers behind the verdict", () => {
  it("measures room and risk from the LIVE price, not the entry", () => {
    const m = row(110); // halfway to target
    expect(m.room).toBeCloseTo(9.09, 1); // (120-110)/110
    expect(m.risk).toBeCloseTo(13.64, 1); // (110-95)/110
    expect(m.rr).toBeCloseTo(0.667, 2); // 10/15 — worse than at entry
  });

  it("at the entry price, R:R matches the planned ratio", () => {
    expect(row(100).rr).toBeCloseTo(4.0, 2); // 20/5
  });

  it("flags a price already past the target", () => {
    const m = row(125);
    expect(m.pastTarget).toBe(true);
    expect(m.rr).toBeLessThan(0); // buying above the target
  });

  it("flags a price through the stop, and quotes no ratio", () => {
    const m = row(94);
    expect(m.belowStop).toBe(true);
    expect(m.rr).toBeNull(); // invalidated — there is nothing to quote
  });

  it("treats the stop price itself as through the stop", () => {
    expect(row(95).belowStop).toBe(true);
  });

  it("returns nulls rather than guesses when the price has not loaded", () => {
    const m = row(null);
    expect(m.rr).toBeNull();
    expect(m.room).toBeNull();
    expect(m.belowStop).toBe(false); // unknown is not "invalidated"
  });

  it("uses the furthest target, not the first", () => {
    expect(row(100, { target1: 110, target2: 120, target3: 150 }).tmax).toBe(150);
  });
});

describe("scoreOne — ranking", () => {
  it("scores a setup through its stop below everything else", () => {
    expect(scoreOne(row(94))).toBeLessThan(scoreOne(row(125))); // worse than past-target
    expect(scoreOne(row(94))).toBeLessThan(-50);
  });

  it("penalises thin liquidity", () => {
    expect(scoreOne(row(100, {}, 5e5))).toBeLessThan(scoreOne(row(100, {}, 5e6)));
  });

  it("prefers more room from the current price", () => {
    expect(scoreOne(row(100))).toBeGreaterThan(scoreOne(row(115)));
  });
});

describe("buildVerdict — what the trader is actually told", () => {
  it("names the setup with the best R:R from here", () => {
    const { verdict } = buildVerdict([
      metricsOf({ signal: sig({ pair: "GOODUSDT" }), price: 101, volume: 5e6 }),
      metricsOf({ signal: sig({ pair: "MEHUSDT" }), price: 115, volume: 5e6 }),
    ]);
    expect(verdict.win.signal.pair).toBe("GOODUSDT");
    expect(verdict.weak).toBe(false);
  });

  // REGRESSION: a row with no price scored 0 and outranked a real but bad setup.
  //
  // The first version of this test used a real row scoring +0.17, which beats a
  // no-price row on 0 anyway — so it passed even with the bug reintroduced. Both
  // real rows here score BELOW zero, which is the only arrangement where the
  // defect actually shows.
  it("never crowns a row whose price has not loaded", () => {
    const real = [
      metricsOf({ signal: sig({ pair: "PASTUSDT" }), price: 125, volume: 5e6 }), // past target
      metricsOf({ signal: sig({ pair: "THINUSDT" }), price: 123, volume: 5e5 }), // past target + thin
    ];
    // guard the guard: if these ever stop scoring negative the test is vacuous
    real.forEach((m) => expect(scoreOne(m)).toBeLessThan(0));

    const { verdict } = buildVerdict([
      ...real,
      metricsOf({ signal: sig({ pair: "NOPRICEUSDT" }), price: null, volume: 5e6 }),
    ]);
    expect(verdict.win.signal.pair).not.toBe("NOPRICEUSDT");
  });

  // REGRESSION: the verdict once ranked on one quantity and printed another,
  // announcing "most room left (+22.9%)" with +38.0% visible on screen.
  //
  // The first version wrapped this in `if (claimsMostRoom)`, so it passed
  // vacuously whenever the reason was absent — which is exactly what a broken
  // comparison produces. Now the claim is required, then checked.
  it("claims 'most room' only for the row that actually has the most", () => {
    const rows = [
      metricsOf({ signal: sig({ pair: "TIGHTUSDT" }), price: 101, volume: 5e6 }),
      metricsOf({ signal: sig({ pair: "ROOMYUSDT", target2: 200 }), price: 101, volume: 5e6 }),
    ];
    const { verdict } = buildVerdict(rows);

    // ROOMY has a 200 target against TIGHT's 120 — it must win and must say so.
    expect(verdict.win.signal.pair).toBe("ROOMYUSDT");
    expect(verdict.reasons.some((r) => r.includes("most room"))).toBe(true);

    const best = Math.max(...rows.map((m) => m.room));
    expect(verdict.win.room).toBeCloseTo(best, 5);
    // and the figure printed is the winner's own, not someone else's
    const claim = verdict.reasons.find((r) => r.includes("most room"));
    expect(claim).toContain(verdict.win.room.toFixed(1));
  });

  it("says nothing at all when only one row can be priced", () => {
    const { verdict } = buildVerdict([
      metricsOf({ signal: sig({ pair: "AUSDT" }), price: 101, volume: 5e6 }),
      metricsOf({ signal: sig({ pair: "BUSDT" }), price: null, volume: 5e6 }),
    ]);
    expect(verdict).toBeNull();
  });

  it("calls a board of bad setups weak instead of picking a winner", () => {
    const { verdict } = buildVerdict([
      metricsOf({ signal: sig({ pair: "AUSDT" }), price: 118, volume: 5e6 }),
      metricsOf({ signal: sig({ pair: "BUSDT" }), price: 119, volume: 5e6 }),
    ]);
    expect(verdict.weak).toBe(true);
    expect(verdict.cautions.length).toBeGreaterThan(0);
  });

  it("warns when the runner-up is close, rather than implying a clear call", () => {
    const { verdict } = buildVerdict([
      metricsOf({ signal: sig({ pair: "AUSDT" }), price: 101, volume: 5e6 }),
      metricsOf({ signal: sig({ pair: "BUSDT" }), price: 101.2, volume: 5e6 }),
    ]);
    expect(verdict.cautions.some((c) => c.includes("close behind"))).toBe(true);
  });
});

describe("concentrationNote — are these actually different bets", () => {
  const withCorr = (c) => ({ corr: c });

  it("says nothing about a single setup", () => {
    expect(concentrationNote([withCorr(0.9)])).toBeNull();
  });

  it("warns when every pick tracks BTC closely", () => {
    const note = concentrationNote([withCorr(0.85), withCorr(0.9), withCorr(0.75)]);
    expect(note).toMatch(/All of these/);
  });

  it("counts the subset when only some are correlated", () => {
    const note = concentrationNote([withCorr(0.85), withCorr(0.9), withCorr(0.1)]);
    expect(note).toMatch(/^2 of these/);
  });

  it("stays quiet when the picks are genuinely uncorrelated", () => {
    expect(concentrationNote([withCorr(0.1), withCorr(0.2), withCorr(0.3)])).toBeNull();
  });

  it("ignores rows with no correlation data rather than assuming safe", () => {
    expect(concentrationNote([withCorr(null), withCorr(0.9)])).toBeNull();
  });
});
