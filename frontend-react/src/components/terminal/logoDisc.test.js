import { describe, expect, it } from "vitest";

import { logoDiscSeries } from "./logoDisc";

/**
 * The one thing this layer exists for: a coin logo comes out round no matter
 * what shape the PNG was. Asserted on the element tree rather than on pixels —
 * renderItem is a pure function of a point and an api, so it can just be called.
 */
const tokens = {
  fg: "#111",
  "surface-raised": "#fff",
  "surface-hover": "#eee",
};

const marks = [
  { pair: "PUNDIXUSDT", value: [1, 2], ring: "#f00" },
  { pair: "LSKUSDT", value: [3, 4], ring: null },
];

const api = (x = 100, y = 200) => ({
  value: (i) => marks[0].value[i],
  coord: () => [x, y],
});

const render = (over = {}, idx = 0) =>
  logoDiscSeries({ marks, size: 28, tokens, ...over }).renderItem({ dataIndex: idx }, api());

const childOf = (g, type) => g.children.find((c) => c.type === type);

describe("coin logos are drawn as round discs", () => {
  it("clips the image to a circle, which is the whole point", () => {
    const img = childOf(render(), "image");
    expect(img.clipPath.type).toBe("circle");
    expect(img.clipPath.shape.r).toBe(14); // size / 2
    // the clip is centred on the mark, not on the canvas origin
    expect(img.clipPath.shape.cx).toBe(100);
    expect(img.clipPath.shape.cy).toBe(200);
  });

  it("fills the circle exactly, so a square logo loses its corners and nothing else", () => {
    const img = childOf(render(), "image");
    expect(img.style.width).toBe(28);
    expect(img.style.height).toBe(28);
    expect(img.style.x).toBe(100 - 14);
    expect(img.style.y).toBe(200 - 14);
  });

  it("takes CoinLogo's first choice rather than rebuilding the URL rule", () => {
    // PUNDIX ships locally; whatever it resolves to, it must not be a second
    // hand-built CDN string — that is how the vs-BTC chart drifted onto a
    // wrong-project logo once already.
    expect(typeof childOf(render(), "image").style.image).toBe("string");
    expect(childOf(render(), "image").style.image.length).toBeGreaterThan(0);
  });

  it("puts no text behind the image, because it would show through", () => {
    // Most crypto logos are transparent PNGs. Initials drawn under one bleed
    // between its strokes — measured against the real CDN, PUNDIX rendered its
    // three bars with "PU" visible between them. The ticker is already printed
    // as the label under every disc, so the fallback was buying nothing.
    expect(childOf(render(), "text")).toBeUndefined();
  });

  it("rings the disc in the colour handed to it, and falls back when there is none", () => {
    const ringed = render().children.filter((c) => c.type === "circle").pop();
    expect(ringed.style.stroke).toBe("#f00");
    const plain = render({}, 1).children.filter((c) => c.type === "circle").pop();
    expect(plain.style.stroke).toBe(tokens.fg);
  });

  it("draws nothing rather than throwing when a point has no place on the canvas", () => {
    const s = logoDiscSeries({ marks, size: 28, tokens });
    const offscreen = { value: () => 1, coord: () => [NaN, NaN] };
    expect(s.renderItem({ dataIndex: 0 }, offscreen)).toBeNull();
    expect(s.renderItem({ dataIndex: 99 }, api())).toBeNull();
  });

  it("survives a theme that has not resolved its tokens yet", () => {
    expect(() => logoDiscSeries({ marks, size: 28, tokens: {} }).renderItem({ dataIndex: 0 }, api())).not.toThrow();
  });
});

describe("a disc pinned to the rail is still a whole circle", () => {
  const box = { x: 50, y: 10, width: 400, height: 300 };
  const at = (x, y) => ({ value: () => 1, coord: () => [x, y] });
  const draw = (x, y) =>
    logoDiscSeries({ marks, size: 28, tokens }).renderItem({ dataIndex: 0, coordSys: box }, at(x, y));
  const centre = (g) => g.children[0].shape;

  it("tucks a disc sitting exactly on the axis fully inside the grid", () => {
    // clampRange puts an outlier here on purpose; `clip` used to halve it
    expect(centre(draw(box.x, 150)).cx).toBeGreaterThan(box.x);
    expect(centre(draw(box.x + box.width, 150)).cx).toBeLessThan(box.x + box.width);
    expect(centre(draw(200, box.y)).cy).toBeGreaterThan(box.y);
  });

  it("leaves a disc that is comfortably inside exactly where it belongs", () => {
    expect(centre(draw(200, 150))).toMatchObject({ cx: 200, cy: 150 });
  });

  it("drops a point panned off the canvas rather than parking it on the edge", () => {
    expect(draw(box.x - 200, 150)).toBeNull();
    expect(draw(200, box.y + box.height + 200)).toBeNull();
  });
});
