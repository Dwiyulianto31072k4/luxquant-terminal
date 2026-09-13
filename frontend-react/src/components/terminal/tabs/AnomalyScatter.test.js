import { describe, expect, it } from "vitest";

import { buildAnomalyOption } from "./AnomalyScatter";

/**
 * The reasons for moving this chart to canvas, asserted.
 *
 * A render test proves the component tree builds; renderToString never runs
 * useEffect, so it says nothing about whether the axis is logarithmic, the
 * wheel demands a modifier, or the 400-point field is batched. Those ARE the
 * move, so they are what gets pinned.
 */
const tokens = {
  fg: "#111",
  "fg-muted": "#777",
  "surface-raised": "#fff",
  accent: "#d4a853",
  inkRaw: "17 17 17",
};

const pt = (pair, x, y, setup) => ({ pair, x, y, setup });

const field = Array.from({ length: 400 }, (_, i) =>
  pt(`C${i}USDT`, (i % 40) - 20, 0.5 + (i % 17), "ordinary")
);

const build = (points, over = {}) =>
  buildAnomalyOption({
    points,
    medFlow: 5.32,
    statusMap: {},
    tokens,
    height: 660,
    ...over,
  });

describe("the anomaly chart is configured the way the move intended", () => {
  it("puts turnover on a log axis, floored so a coin that traded nothing still shows", () => {
    const o = build(field);
    expect(o.yAxis.type).toBe("log");
    expect(o.yAxis.logBase).toBe(10);
    expect(o.yAxis.min).toBeGreaterThan(0);
  });

  it("leaves the wheel to the page and asks for a modifier to zoom", () => {
    const z = build(field).dataZoom[0];
    expect(z.zoomOnMouseWheel).toBe("ctrl");
    expect(z.moveOnMouseWheel).toBe(false);
  });

  it("batches the field rather than styling four hundred marks", () => {
    const s = build(field).series[0];
    expect(s.large).toBe(true);
    expect(s.largeThreshold).toBeLessThan(400);
  });

  it("asks ECharts to drop a label it cannot fit", () => {
    expect(build(field).series[1].labelLayout.hideOverlap).toBe(true);
  });

  it("fits each side of the x axis on its own, rather than mirroring", () => {
    // an up day: -3 .. +18
    const upDay = [
      pt("A", -3, 4, "ordinary"),
      pt("B", 2, 4, "ordinary"),
      pt("C", 18, 4, "ordinary"),
    ];
    const { min, max } = build(upDay).xAxis;
    expect(Math.abs(min)).toBeLessThan(max);
    expect(min).toBeLessThanOrEqual(0); // zero stays inside, it is the reference
  });

  it("splits named coins into their own series so the field stays batched", () => {
    const o = build(field);
    const named = o.series[1].data.length;
    expect(named).toBeGreaterThan(0);
    expect(named).toBeLessThanOrEqual(16);
    expect(o.series[0].data.length).toBe(field.length - named);
  });

  it("names nothing when labels are off, and still draws every point", () => {
    const o = build(field, { labelMode: "off" });
    expect(o.series[1].data).toHaveLength(0);
    expect(o.series[0].data).toHaveLength(field.length);
  });

  it("gives a named coin its own mark", () => {
    const o = build(field);
    expect(o.series[1].data[0].symbol).toMatch(/^image:\/\//);
  });

  it("draws the 3x flow line only when there is a median to draw it from", () => {
    const withLine = build(field).series[2].markLine.data;
    const without = build(field, { medFlow: 0 }).series[2].markLine.data;
    expect(withLine.length).toBe(2); // zero line + 3x flow
    expect(without.length).toBe(1); // zero line only
  });

  it("survives an empty board", () => {
    expect(() => build([])).not.toThrow();
  });
});
