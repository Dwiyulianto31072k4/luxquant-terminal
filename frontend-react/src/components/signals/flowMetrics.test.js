import { describe, it, expect } from "vitest";
import {
  HIGH_TURNOVER,
  barScale,
  barWidth,
  coinFindings,
  CALL_SCOPES,
  coinCounts,
  filterCoins,
  matchCoin,
  enrichCoins,
  fmtMultiple,
  median,
  narrativeFinding,
  narrativesBySymbol,
  percentileRanker,
  price,
  quantile,
  relStrength,
  separablePairs,
  sortCoins,
  sortNarratives,
  statusRank,
  turnoverBand,
  usdShort,
  volMultiple,
} from "./flowMetrics";

const coin = (over = {}) => ({
  coin_id: over.symbol?.toLowerCase() || "x",
  symbol: "X",
  price: 1,
  market_cap: 1e9,
  volume_24h: 1e8,
  flow_intensity: 0.1,
  vol_change_7d: 0,
  price_change_24h: 0,
  price_change_7d: 0,
  price_change_30d: 0,
  is_luxquant_signal: false,
  ...over,
});

describe("formatting", () => {
  it("keeps sub-cent prices readable instead of rounding them to $0.00", () => {
    expect(price(0.08365)).toBe("$0.0837");
    expect(price(0.0000123)).toBe("$0.0000123");
    expect(price(117204)).toBe("$117,204");
    expect(price(null)).toBe("—");
  });

  it("states volume as a multiple of its own week-ago level", () => {
    expect(volMultiple(3440.16)).toBeCloseTo(35.4, 1);
    expect(volMultiple(-92)).toBeCloseTo(0.08, 2);
    expect(volMultiple(null)).toBeNull();
    expect(fmtMultiple(35.4)).toBe("35×");
    expect(fmtMultiple(3.44)).toBe("3.4×");
    expect(fmtMultiple(0.08)).toBe("0.08×");
    expect(fmtMultiple(null)).toBe("—");
  });

  it("shortens money without losing the order of magnitude", () => {
    expect(usdShort(467.31e9)).toBe("$467.3B");
    expect(usdShort(-6.81e9)).toBe("$6.8B");
    expect(usdShort(50e6)).toBe("$50M");
  });
});

describe("turnover bands follow the backend's own thresholds", () => {
  it("bands at 30% and 10% of market cap", () => {
    expect(turnoverBand(0.9001).key).toBe("high");
    expect(turnoverBand(HIGH_TURNOVER).key).toBe("high");
    expect(turnoverBand(0.2172).key).toBe("elevated");
    expect(turnoverBand(0.0408).key).toBe("normal");
    expect(turnoverBand(null).key).toBe("none");
  });
});

describe("statistics", () => {
  it("medians and quantiles ignore nulls", () => {
    expect(median([3, null, 1, 2])).toBe(2);
    expect(median([])).toBeNull();
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it("calls two rates different only when their intervals miss each other", () => {
    const touching = separablePairs([
      { value: 88.4, half: 4.8 },
      { value: 91.2, half: 5.9 },
    ]);
    expect(touching.separable).toBe(0);
    const apart = separablePairs([
      { value: 52, half: 6.2 },
      { value: 38.8, half: 5.4 },
    ]);
    expect(apart.separable).toBe(1);
    expect(apart.total).toBe(1);
  });

  it("skips pairs with no interval rather than counting them as equal", () => {
    const r = separablePairs([{ value: 50, half: null }, { value: 10, half: 2 }]);
    expect(r.total).toBe(0);
    expect(r.share).toBe(0);
  });
});

describe("bar scale survives an outlier", () => {
  // The live window: one narrative 95.8 points ahead, median 4.4.
  const live = [95.82, 56.02, 24.77, 20.88, 19.59, 15.26, 6, 4.4, 3, 2, -2.26, -4.22];

  it("scales to a quantile, not the maximum", () => {
    const s = barScale(live, 0.9);
    expect(s.ref).toBeLessThan(s.max);
    expect(s.clipped).toBeGreaterThan(0);
  });

  it("keeps the median bar readable where max-scaling would not", () => {
    const s = barScale(live, 0.9);
    const atMedian = barWidth(4.4, s.ref).w;
    const maxScaled = (4.4 / 95.82) * 100;
    expect(maxScaled).toBeLessThan(5); // what the panel drew before
    expect(atMedian).toBeGreaterThan(maxScaled);
  });

  it("marks the values it clipped instead of silently flattening them", () => {
    const s = barScale(live, 0.9);
    expect(barWidth(95.82, s.ref)).toEqual({ w: 100, over: true });
    expect(barWidth(2, s.ref).over).toBe(false);
    expect(barWidth(null, s.ref)).toEqual({ w: 0, over: false });
  });

  it("never divides by zero when every value is the same", () => {
    const s = barScale([0, 0, 0]);
    expect(Number.isFinite(s.ref)).toBe(true);
    expect(barWidth(0, s.ref).w).toBe(0);
  });
});

describe("coin rows", () => {
  const signals = new Map([["AAA", { pair: "AAAUSDT", entry: "2", status: "tp2", created_at: "2026-09-19T00:00:00Z" }]]);
  const rows = enrichCoins(
    [
      coin({ symbol: "AAA", price: 3, flow_intensity: 0.5, vol_change_7d: 400, price_change_7d: 12 }),
      coin({ symbol: "BBB", price: 1, flow_intensity: 0.05, vol_change_7d: -50, price_change_7d: -1 }),
      coin({ symbol: "CCC", price: 1, flow_intensity: null, vol_change_7d: null, is_luxquant_signal: true }),
    ],
    signals
  );

  it("measures the move from our own entry, not from yesterday", () => {
    expect(rows[0].fromCall).toBeCloseTo(50, 5);
    expect(rows[1].fromCall).toBeNull();
  });

  it("counts a coin as called from either the desk list or the snapshot flag", () => {
    expect(rows[0].called).toBe(true);
    expect(rows[1].called).toBe(false);
    expect(rows[2].called).toBe(true);
  });

  it("sorts nulls last in BOTH directions", () => {
    const desc = sortCoins(rows, "intensity", "desc").map((r) => r.c.symbol);
    const asc = sortCoins(rows, "intensity", "asc").map((r) => r.c.symbol);
    expect(desc).toEqual(["AAA", "BBB", "CCC"]);
    expect(asc).toEqual(["BBB", "AAA", "CCC"]);
  });

  it("sorts coin names alphabetically in the direction asked", () => {
    expect(sortCoins(rows, "coin", "asc").map((r) => r.c.symbol)).toEqual(["AAA", "BBB", "CCC"]);
    expect(sortCoins(rows, "coin", "desc").map((r) => r.c.symbol)).toEqual(["CCC", "BBB", "AAA"]);
  });

  it("ranks the TP ladder above open and SL below it", () => {
    expect(statusRank("sl")).toBe(0);
    expect(statusRank("open")).toBe(1);
    expect(statusRank("tp3")).toBeGreaterThan(statusRank("tp1"));
    expect(statusRank(null)).toBeNull();
  });

  it("gives every finding a filter that reproduces its own count", () => {
    const many = enrichCoins(
      [
        ...Array.from({ length: 12 }, (_, i) =>
          coin({ symbol: `C${i}`, is_luxquant_signal: true, price_change_7d: 8, vol_change_7d: 400, flow_intensity: 0.4 })
        ),
        ...Array.from({ length: 12 }, (_, i) => coin({ symbol: `U${i}`, price_change_7d: 0 })),
      ],
      new Map()
    );
    const findings = coinFindings(many);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      const got = f.filter.scope
        ? filterCoins(many, f.filter.scope, [])
        : filterCoins(many, "all", [f.filter.flag]);
      expect(got.length).toBe(f.count);
    }
  });

  it("says nothing at all when there is nothing to say", () => {
    expect(coinFindings([])).toEqual([]);
  });
});

describe("coin to narrative map", () => {
  it("inverts the narrative payload and strips the USDT suffix", () => {
    const m = narrativesBySymbol([
      { name: "Privacy", pairs: ["ZAMAUSDT", "ARUSDT"] },
      { name: "AI", pairs: ["ARUSDT"] },
    ]);
    expect(m.get("AR").map((n) => n.name)).toEqual(["Privacy", "AI"]);
    expect(m.get("ZAMA")).toHaveLength(1);
    expect(m.get("NOPE")).toBeUndefined();
  });
});

describe("narrative finding", () => {
  // Shapes taken from the live 30d payload.
  const live = [
    { name: "Binance Wallet IDO", wr: 88.44, wr_ci_half: 4.79, median_peak: 14.55, full_tp_rate: 52.6, n: 173, mcap_change_7d: 101.84, coins_called: 31 },
    { name: "AI Applications", wr: 91.21, wr_ci_half: 5.94, median_peak: 21.62, full_tp_rate: 55, n: 91, mcap_change_7d: 62.04, coins_called: 15 },
    { name: "Privacy", wr: 90, wr_ci_half: 6.68, median_peak: 25.65, full_tp_rate: 55, n: 97, mcap_change_7d: 8, coins_called: 20 },
    { name: "Binance Launchpool", wr: 84.52, wr_ci_half: 7.71, median_peak: 9.12, full_tp_rate: 38.1, n: 164, mcap_change_7d: 2, coins_called: 12 },
    { name: "Play To Earn", wr: 83.33, wr_ci_half: 7.42, median_peak: 17.05, full_tp_rate: 37.5, n: 96, mcap_change_7d: -1, coins_called: 9 },
  ];

  it("reports how little of the win-rate ranking is real", () => {
    const f = narrativeFinding(live);
    expect(f.wrPairs).toBe(10);
    expect(f.wrSeparable).toBe(0);
    expect(f.wrHi - f.wrLo).toBeLessThan(10);
  });

  it("reports the spread that IS real", () => {
    const f = narrativeFinding(live);
    expect(f.peakLo).toBeCloseTo(9.12, 2);
    expect(f.peakHi).toBeCloseTo(25.65, 2);
    expect(f.peakSpread).toBeGreaterThan(2.5);
  });

  it("refuses to draw a conclusion from three rows", () => {
    expect(narrativeFinding(live.slice(0, 2))).toBeNull();
    expect(narrativeFinding([])).toBeNull();
  });

  it("measures rotation against the market, not against zero", () => {
    expect(relStrength({ mcap_change_7d: 1.5 }, -2.04)).toBeCloseTo(3.54, 2);
    expect(relStrength({ mcap_change_7d: null }, 6)).toBeNull();
  });

  it("sorts on the column asked for and puts nulls last", () => {
    const withNull = [...live, { name: "Empty", median_peak: null, full_tp_rate: null, coins_called: 1, wr: null }];
    expect(sortNarratives(withNull, "peak")[0].name).toBe("Privacy");
    expect(sortNarratives(withNull, "peak").at(-1).name).toBe("Empty");
    expect(sortNarratives(withNull, "tp3")[0].full_tp_rate).toBe(55);
    expect(sortNarratives(withNull, "coins")[0].name).toBe("Binance Wallet IDO");
  });
});

describe("percentile ranker — the turnover rail", () => {
  const live = [0.9001, 0.72, 0.63, 0.375, 0.217, 0.13, 0.053, 0.0408, 0.02, 0.0];
  const rank = percentileRanker(live);

  it("spreads the population across the whole rail instead of clipping its head", () => {
    // The old fixed-reference rail drew every one of these at 100%.
    const head = [0.9001, 0.72, 0.63].map(rank);
    expect(new Set(head.map(Math.round)).size).toBe(3);
    expect(Math.max(...head)).toBeLessThanOrEqual(100);
  });

  it("keeps the middle of the book readable", () => {
    expect(rank(0.13)).toBeGreaterThan(40);
    expect(rank(0.0408)).toBeGreaterThan(10);
  });

  it("is monotone and bounded", () => {
    expect(rank(0.9001)).toBeGreaterThan(rank(0.13));
    expect(rank(0.13)).toBeGreaterThan(rank(0.02));
    expect(rank(0)).toBeGreaterThanOrEqual(0);
    expect(rank(999)).toBeLessThanOrEqual(100);
  });

  it("puts a population of identical values in the middle, not at an edge", () => {
    const flat = percentileRanker([5, 5, 5, 5]);
    expect(flat(5)).toBe(50);
  });

  it("returns null rather than a number it cannot justify", () => {
    expect(rank(null)).toBeNull();
    expect(percentileRanker([])(1)).toBeNull();
    expect(percentileRanker([null, undefined])(1)).toBeNull();
  });
});

describe("scope and traits combine", () => {
  const rows = enrichCoins(
    [
      coin({ symbol: "A", is_luxquant_signal: true, flow_intensity: 0.5, vol_change_7d: 400 }), // ours, busy, woke up
      coin({ symbol: "B", is_luxquant_signal: true, flow_intensity: 0.5, vol_change_7d: 10 }), // ours, busy
      coin({ symbol: "C", is_luxquant_signal: true, flow_intensity: 0.01, vol_change_7d: 400 }), // ours, woke up
      coin({ symbol: "D", flow_intensity: 0.5, vol_change_7d: 400 }), // theirs, busy, woke up
      coin({ symbol: "E", flow_intensity: 0.01, vol_change_7d: 0 }), // theirs, quiet
    ],
    new Map()
  );
  const syms = (scope, flags) => filterCoins(rows, scope, flags).map((r) => r.c.symbol);

  it("answers the question one exclusive control could not: ours AND busy", () => {
    expect(syms("called", ["busy"])).toEqual(["A", "B"]);
  });

  it("stacks traits with AND, not OR", () => {
    expect(syms("all", ["busy", "surge"])).toEqual(["A", "D"]);
    expect(syms("called", ["busy", "surge"])).toEqual(["A"]);
  });

  it("leaves scope alone when no trait is on, and vice versa", () => {
    expect(syms("called", [])).toEqual(["A", "B", "C"]);
    expect(syms("all", ["surge"])).toEqual(["A", "C", "D"]);
    expect(syms("all", [])).toHaveLength(5);
  });

  it("ignores a trait nobody defined rather than emptying the table", () => {
    expect(syms("all", ["nonsense"])).toHaveLength(5);
    expect(matchCoin(rows[0], "nope", [])).toBe(true);
  });

  it("badges the size of the RESULT, so a chip cannot promise what it will not give", () => {
    // With "called" on, the Busy chip must read 2 — the busy coins that are
    // ours — not 3, which is every busy coin in the snapshot.
    const c = coinCounts(rows, "called", []);
    expect(c.flags.busy).toBe(2);
    expect(c.scopes.called).toBe(3);
    // With Busy already on, the scope chips count within it.
    const d = coinCounts(rows, "called", ["busy"]);
    expect(d.scopes.all).toBe(3);
    expect(d.scopes.called).toBe(2);
    // A chip already on shows what it is holding, not what dropping it opens.
    expect(d.flags.busy).toBe(2);
  });

  it("exposes every scope it claims to", () => {
    expect(Object.keys(CALL_SCOPES)).toEqual(["all", "called", "uncalled"]);
  });
});
