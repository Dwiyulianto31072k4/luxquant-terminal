/**
 * The two Signals flow panels, actually rendered.
 *
 * Lint proves the names resolve and the build proves the imports exist; neither
 * runs a line. This repo has already shipped a green build that white-screened
 * — once on a temporal dead zone, once on an ECharts markLine that only threw
 * after mount — so a panel change that nobody executed is a panel change nobody
 * has tested.
 *
 * renderToString runs every hook and every branch without a DOM or a new
 * dependency. The two shims below are the whole cost: the chart-token reader
 * touches getComputedStyle during render, and Modal reaches for document.body.
 *
 * The fixtures' SHAPES are the real ones, taken from the live
 * /money-flow/coins and /analytics/narrative-flow payloads on 2026-09-20.
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

const { default: SignalsCoinFlow } = await import("../SignalsCoinFlow");
const { default: SignalsNarrativeFlow } = await import("../SignalsNarrativeFlow");

const COINS = [
  {
    coin_id: "zama",
    symbol: "ZAMA",
    price: 0.08365,
    market_cap: 207340875,
    volume_24h: 186631052,
    flow_intensity: 0.9001,
    turnover_tag: "high_turnover",
    vol_change_7d: 3440.16,
    price_change_24h: 36.89324,
    price_change_7d: 70.8,
    price_change_30d: 78.3,
    is_luxquant_signal: true,
  },
  {
    coin_id: "arweave",
    symbol: "AR",
    price: 6.21,
    market_cap: 420000000,
    volume_24h: 265000000,
    flow_intensity: 0.63,
    turnover_tag: "high_turnover",
    vol_change_7d: 3038,
    price_change_24h: 4.7,
    price_change_7d: 63.5,
    price_change_30d: 71.2,
    is_luxquant_signal: true,
  },
  // No call, quiet, and every optional field missing — the row that used to
  // decide whether a sort put nulls first.
  {
    coin_id: "nothing",
    symbol: "NUL",
    price: null,
    market_cap: null,
    volume_24h: null,
    flow_intensity: null,
    turnover_tag: null,
    vol_change_7d: null,
    price_change_24h: null,
    price_change_7d: null,
    price_change_30d: null,
    is_luxquant_signal: false,
  },
  ...Array.from({ length: 20 }, (_, i) => ({
    coin_id: `c${i}`,
    symbol: `C${i}`,
    price: 1 + i,
    market_cap: 1e9,
    volume_24h: 4e7,
    flow_intensity: 0.04,
    turnover_tag: "normal_turnover",
    vol_change_7d: 10,
    price_change_24h: -0.3,
    price_change_7d: 0.1,
    price_change_30d: 2,
    is_luxquant_signal: i % 3 === 0,
  })),
];

const SIGNALS = [
  {
    signal_id: "s1",
    pair: "ZAMAUSDT",
    entry: "0.0677",
    status: "closed_win",
    created_at: new Date(Date.now() - 23 * 3600e3).toISOString(),
  },
  {
    signal_id: "s2",
    pair: "ARUSDT",
    entry: "3.8",
    status: "tp2",
    created_at: new Date(Date.now() - 3 * 86400e3).toISOString(),
  },
];

const NARRATIVE = (over = {}) => ({
  category_id: "ai",
  name: "Artificial Intelligence (AI)",
  market_cap: 21.66e9,
  volume_24h: 2e9,
  mcap_change_24h: -0.3,
  mcap_change_7d: 26.9,
  flow_usd_7d: 4.6e9,
  coins_called: 78,
  n: 416,
  wr: 92.07,
  wr_shrunk: 91.4,
  wr_ci_half: 2.61,
  full_tp_rate: 49.5,
  median_peak: 14.33,
  pairs: ["ARUSDT", "ZAMAUSDT"],
  outcome_flow: { tp1: 40.2, tp2: 30.1, tp3: 25.5, tp4: 12.2, sl: 9.4 },
  flow_total: 117.4,
  ...over,
});

const NARR_DATA = {
  market_change_7d: 6.02,
  days: 30,
  snapshot_at: "2026-09-20T04:00:00+00:00",
  has_7d: true,
  base_wr: 87.89,
  narratives: [
    NARRATIVE(),
    // The outlier that used to flatten every other rotation bar.
    NARRATIVE({
      category_id: "ido",
      name: "Binance Wallet IDO",
      mcap_change_7d: 101.84,
      median_peak: 14.55,
      wr: 88.44,
      wr_ci_half: 4.79,
      full_tp_rate: 52.6,
      n: 173,
      coins_called: 31,
    }),
    NARRATIVE({
      category_id: "privacy",
      name: "Privacy",
      mcap_change_7d: 8,
      median_peak: 25.65,
      wr: 90,
      wr_ci_half: 6.68,
      full_tp_rate: 55,
      n: 97,
      coins_called: 20,
    }),
    NARRATIVE({
      category_id: "pool",
      name: "Binance Launchpool",
      mcap_change_7d: 2,
      median_peak: 9.12,
      wr: 84.52,
      wr_ci_half: 7.71,
      full_tp_rate: 38.1,
      n: 164,
      coins_called: 12,
    }),
    // Behind the market, and with nothing resolved yet.
    NARRATIVE({
      category_id: "base",
      name: "Base Native",
      mcap_change_7d: 1.8,
      median_peak: null,
      wr: null,
      wr_ci_half: null,
      full_tp_rate: null,
      n: 0,
      coins_called: 5,
      outcome_flow: {},
    }),
  ],
};

const { default: CoinScatter } = await import("./CoinScatter");
const { default: NarrativeScatter } = await import("./NarrativeScatter");
const { enrichCoins } = await import("./flowMetrics");

const html = (el) => renderToString(el);
/** React separates adjacent text nodes with `<!-- -->`; strip the markup so an
 *  assertion reads what a person would read. */
const text = (el) =>
  renderToString(el)
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

describe("Coin flow renders", () => {
  it("with a live snapshot", () => {
    const out = html(
      <SignalsCoinFlow
        coins={COINS}
        signals={SIGNALS}
        narratives={NARR_DATA.narratives}
        onOpenSignal={() => {}}
        onPickNarrative={() => {}}
        onMore={() => {}}
        defaultOpen
      />
    );
    expect(out).toContain("Coin flow");
    expect(out).toContain("ZAMA");
    // The findings, the columns that were missing, and the drill-in table.
    expect(out).toContain("woke up this week");
    expect(out).toContain("Vol 7d");
    expect(text(
      <SignalsCoinFlow coins={COINS} signals={SIGNALS} defaultOpen />
    )).toContain("35×");
    // The turnover rail is a percentile over the whole snapshot, so the rows
    // on screen get DIFFERENT lengths instead of a column of full bars.
    const widths = [...out.matchAll(/width:([\d.]+)%/g)].map((m) => Number(m[1]));
    expect(new Set(widths).size).toBeGreaterThan(3);
    expect(Math.max(...widths)).toBeLessThanOrEqual(100);
  });

  it("marks every finding as a switch, with its current state", () => {
    const out = html(<SignalsCoinFlow coins={COINS} signals={SIGNALS} defaultOpen />);
    const findings = (out.match(/aria-pressed="(true|false)"/g) || []).length;
    expect(findings).toBeGreaterThan(0);
    // A checkbox per finding, so the card reads as something you turn on
    // rather than as a caption with a number in the corner.
    expect(out).toContain("M2 6.2 4.6 8.8 10 3.4");
    expect(out).toContain("cursor-pointer");
    expect(out).toContain("Show");
  });

  it("names the coins it is on in the collapsed subtitle", () => {
    const out = html(<SignalsCoinFlow coins={COINS} signals={SIGNALS} />);
    expect(out).toContain("woke up");
    expect(out).toContain("called");
  });

  it("with no coins at all, which is the pre-snapshot state", () => {
    expect(html(<SignalsCoinFlow coins={[]} signals={[]} />)).toBe("");
  });

  it("with coins but no desk list and no narrative payload", () => {
    const out = html(<SignalsCoinFlow coins={COINS} signals={[]} narratives={[]} defaultOpen />);
    expect(out).toContain("Coin flow");
  });

  it("with a single coin carrying nothing but a symbol", () => {
    const bare = [{ coin_id: "x", symbol: "X" }];
    expect(html(<SignalsCoinFlow coins={bare} signals={[]} defaultOpen />)).toContain("X");
  });
});

describe("Narratives renders", () => {
  it("with a live payload", () => {
    const out = html(
      <SignalsNarrativeFlow
        data={NARR_DATA}
        days={30}
        signals={SIGNALS}
        activeIds={[]}
        onPick={() => {}}
        onDaysChange={() => {}}
        onOpenSignal={() => {}}
        onMore={() => {}}
        defaultOpen
      />
    );
    expect(out).toContain("Narratives");
    // Ranked on the column that separates, with the flat one carrying its
    // interval so nobody ranks on it.
    expect(out).toContain("Typ. peak");
    expect(out).toContain("WR ±");
    expect(out).toContain("TP3+");
    expect(out).toContain("cannot rank anything");
  });

  it("prints every win rate with the interval it rests on", () => {
    const t = text(<SignalsNarrativeFlow data={NARR_DATA} days={30} defaultOpen />);
    expect(t).toContain("92.1% ±2.6 · 416");
    expect(t).toContain("84.5% ±7.7 · 164");
  });

  it("puts the widest-running narrative first by default", () => {
    const out = html(<SignalsNarrativeFlow data={NARR_DATA} days={30} defaultOpen />);
    const privacy = out.indexOf("Privacy");
    const pool = out.indexOf("Binance Launchpool");
    expect(privacy).toBeGreaterThan(-1);
    expect(privacy).toBeLessThan(pool);
  });

  it("while it is still loading", () => {
    const out = html(<SignalsNarrativeFlow data={null} loading days={30} defaultOpen />);
    expect(out).toContain("Narratives");
  });

  it("when the window came back empty", () => {
    expect(html(<SignalsNarrativeFlow data={{ narratives: [] }} days={30} />)).toBe("");
  });

  it("when the 7-day snapshot is missing, so nothing has a rotation", () => {
    const noSeven = {
      ...NARR_DATA,
      market_change_7d: null,
      has_7d: false,
      narratives: NARR_DATA.narratives.map((n) => ({
        ...n,
        mcap_change_7d: null,
        flow_usd_7d: null,
      })),
    };
    expect(html(<SignalsNarrativeFlow data={noSeven} days={30} defaultOpen />)).toContain(
      "Narratives"
    );
  });

  it("with a narrative that has been picked", () => {
    const out = html(
      <SignalsNarrativeFlow
        data={NARR_DATA}
        days={30}
        activeIds={["privacy"]}
        onPick={() => {}}
        defaultOpen
      />
    );
    expect(out).toContain("Filtering");
  });
});

describe("the two scatters", () => {
  it("Coin flow's map draws every coin, labels what fits, and leaves the rest to hover", () => {
    const rows = enrichCoins(COINS, new Map());
    const out = html(<CoinScatter rows={rows} onOpen={() => {}} />);
    expect(out).toContain("Is the busy money buying or selling?");
    const plotted = rows.filter((r) => r.c.flow_intensity != null).length;
    // One group per point, in each of the two geometries (phone and desk).
    const groups = (out.match(/<g class="cursor-pointer"/g) || []).length;
    expect(groups).toBe(plotted * 2);
    // Every dot carries an invisible hit target as well as its mark, because a
    // 3px circle is not something a mouse can find.
    expect((out.match(/fill="transparent"/g) || []).length).toBe(plotted * 2);
    // Some names, never all of them.
    const names = (out.match(/font-weight:600/g) || []).length;
    expect(names).toBeGreaterThan(0);
    expect(names).toBeLessThan(groups);
  });

  it("never places two labels on top of each other", async () => {
    const { placeLabels } = await import("./scatterKit");
    // Ten points stacked in the same place: at most one of them can be named.
    const stacked = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`, cx: 300, cy: 160, r: 5, name: "OVERLAP", priority: i,
    }));
    expect(placeLabels(stacked, { W: 640, H: 320, fs: 9.5 }).size).toBeLessThanOrEqual(4);

    // Spread out, they all get one.
    const spread = Array.from({ length: 6 }, (_, i) => ({
      id: `p${i}`, cx: 60 + i * 95, cy: 60 + (i % 2) * 120, r: 4, name: "AAA", priority: i,
    }));
    expect(placeLabels(spread, { W: 640, H: 320, fs: 9.5 }).size).toBe(6);
  });

  it("keeps every label inside the frame and honours the cap", async () => {
    const { placeLabels } = await import("./scatterKit");
    const pts = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i}`,
      cx: 20 + ((i * 53) % 600),
      cy: 20 + ((i * 97) % 280),
      r: 4,
      name: `NAME${i}`,
      priority: 60 - i,
    }));
    const placed = placeLabels(pts, { W: 640, H: 320, fs: 9.5, max: 12 });
    expect(placed.size).toBeLessThanOrEqual(12);
    for (const l of placed.values()) {
      expect(l.x).toBeGreaterThanOrEqual(0);
      expect(l.x).toBeLessThanOrEqual(640);
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeLessThanOrEqual(320);
    }
  });

  it("truncates a name rather than letting it run out of the plot", async () => {
    const { placeLabels } = await import("./scatterKit");
    const placed = placeLabels(
      [{ id: "a", cx: 320, cy: 160, r: 5, name: "Artificial Intelligence (AI)", priority: 1 }],
      { W: 640, H: 320, fs: 9.5, maxChars: 12 }
    );
    expect(placed.get("a").text).toBe("Artificial…");
  });

  it("the map says nothing when there is nothing to plot", () => {
    expect(html(<CoinScatter rows={[]} />)).toBe("");
    expect(html(<CoinScatter rows={enrichCoins([{ symbol: "X" }], new Map())} />)).toBe("");
  });

  it("the narrative scatter reports the rank correlation it measured", () => {
    const t = text(
      <NarrativeScatter
        narratives={NARR_DATA.narratives}
        marketChange7d={NARR_DATA.market_change_7d}
        activeIds={[]}
      />
    );
    expect(t).toContain("Does a hot narrative pay more?");
    expect(t).toMatch(/rank correlation [+\u2212]\d\.\d\d/);
  });

  it("the narrative scatter refuses to draw a correlation from three points", () => {
    const out = html(
      <NarrativeScatter narratives={NARR_DATA.narratives.slice(0, 2)} marketChange7d={6} />
    );
    expect(out).not.toContain("rank correlation");
  });

  it("clamps a label on an edge dot inside the frame", () => {
    // One narrative 96 points clear of the market: the label used to be centred
    // on a dot at the right edge and ran off the viewBox.
    const out = html(
      <NarrativeScatter narratives={NARR_DATA.narratives} marketChange7d={0} activeIds={[]} />
    );
    const xs = [...out.matchAll(/<text[^>]*x="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(640);
  });
});
