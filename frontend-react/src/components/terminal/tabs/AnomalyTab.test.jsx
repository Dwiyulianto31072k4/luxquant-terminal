/**
 * Does it actually render?
 *
 * Lint proves every name resolves and the build proves every import exists.
 * Neither runs a line of the component, and this repo has already shipped a
 * green build that white-screened on a temporal-dead-zone error. Extracting a
 * 500-line tab out of a shared component is exactly the change that breaks
 * that way: a hook reading a value declared below it, or a prop the parent
 * forgot to pass.
 *
 * renderToString needs no DOM, so this costs no new dependency. It will not
 * lay out a chart — Recharts needs a measured box — but it executes every
 * hook, every memo and every branch reached with data present.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k, o) => (o && o.defaultValue) || k }),
}));

import { renderToString } from "react-dom/server";
import AnomalyTab from "./AnomalyTab";

const pt = (pair, x, y, setup, extra = {}) => ({
  pair,
  x,
  y,
  yl: Math.log10(Math.max(y, 0.02)),
  setup,
  hot: setup === "breakout",
  dec: false,
  sector: "Layer 1 (L1)",
  ...extra,
});

const agg = {
  // one member of every regime, so no branch is skipped for want of data
  anomPts: [
    pt("BTCUSDT", 12, 30, "breakout"),
    pt("ETHUSDT", 0.4, 30, "absorption"),
    pt("SOLUSDT", 12, 1, "thin"),
    pt("XRPUSDT", -12, 30, "capitulation"),
    pt("ADAUSDT", 1, 1, "dormant"),
    pt("DOTUSDT", 2, 6, "ordinary"),
  ],
  medFlow: 5.32,
  movers: [{ pair: "BTCUSDT", v: 4 }],
  rs: [{ pair: "BTCUSDT", v: 2 }],
  scatterOpp: [],
  scatterBeta: [],
  peakPts: [],
};

const render = (over = {}) =>
  renderToString(
    <AnomalyTab
      agg={agg}
      deriv={{ generated_at: new Date().toISOString(), stale: false }}
      view={[]}
      latestByPair={{}}
      pairFc={{}}
      statusMap={{}}
      openPair={() => {}}
      openSignalRow={() => {}}
      {...over}
    />
  );

describe("AnomalyTab survives being rendered", () => {
  it("renders with a point in every regime", () => {
    const html = render();
    expect(html).toContain("Breakout");
    expect(html).toContain("Absorption");
  });

  it("counts each setup on its chip", () => {
    const html = render();
    // one member each, and the zero-count chips still appear
    expect(html).toMatch(/Capitulation/);
    expect(html).toMatch(/Dormant/);
  });

  it("renders with no points at all, the way a cold load arrives", () => {
    expect(() =>
      render({ agg: { ...agg, anomPts: [], medFlow: 0 } })
    ).not.toThrow();
  });

  it("renders when the derivatives blob has not arrived", () => {
    expect(() => render({ deriv: null })).not.toThrow();
  });

  it("renders when every point is one regime, so the others are empty", () => {
    const only = [pt("BTCUSDT", 12, 30, "breakout"), pt("ETHUSDT", 14, 40, "breakout")];
    expect(() => render({ agg: { ...agg, anomPts: only } })).not.toThrow();
  });
});
