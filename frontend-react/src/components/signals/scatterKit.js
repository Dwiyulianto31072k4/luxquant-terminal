// scatterKit — the parts both flow scatters need, in one place so the two
// panels cannot drift into drawing the same idea two different ways.

/** Monotone, signed, zero-preserving.
 *
 *  Both panels plot a heavy tail against a well-behaved axis: narrative
 *  rotation runs −4pp to +96pp around a median of 4, coin turnover runs 0 to
 *  0.90 around a median of 0.04. On a linear axis almost every point piles into
 *  one eighth of the plot and the chart draws its outlier. A square root keeps
 *  the order, keeps zero at zero, and the ticks carry their real values, so
 *  nothing about the axis is hidden from the reader. */
export const sq = (v) => Math.sign(v) * Math.sqrt(Math.abs(v));

/** Spearman's rho — the correlation of the RANKS.
 *
 *  The honest one to quote when an axis has a 96-point outlier on a 4-point
 *  median: Pearson would be reporting that one narrative. */
export function spearman(points) {
  const n = points.length;
  if (n < 4) return null;
  const rank = (key) => {
    const idx = points.map((p, i) => [p[key], i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j += 1;
      const mid = (i + j) / 2 + 1;
      for (let k = i; k <= j; k += 1) r[idx[k][1]] = mid;
      i = j + 1;
    }
    return r;
  };
  const rx = rank("x");
  const ry = rank("y");
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (rx[i] - mx) * (ry[i] - my);
    vx += (rx[i] - mx) ** 2;
    vy += (ry[i] - my) ** 2;
  }
  if (!vx || !vy) return null;
  return cov / Math.sqrt(vx * vy);
}

/** Round values a reader recognises, placed where the transform puts them, then
 *  thinned so they cannot run into one word. A square-root axis bunches the
 *  small values, which is exactly where the candidates are densest. `keep` is
 *  never dropped. */
export function pickTicks(candidates, lo, hi, project, minGap, keep = 0) {
  const inRange = candidates.filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9);
  const out = [];
  for (const v of inRange) {
    const x = project(v);
    const clash = out.find((k) => Math.abs(project(k) - x) < minGap);
    if (clash == null) out.push(v);
    else if (v === keep) out.splice(out.indexOf(clash), 1, v);
  }
  return out;
}

/** A linear projector with an inset, so the widest point is a circle inside the
 *  frame rather than a mark welded to it. */
export function projector({ lo, hi, from, to, inset = 0, transform = (v) => v }) {
  const a = transform(lo);
  const b = transform(hi);
  const span = b - a || 1;
  return (v) => from + inset + ((transform(v) - a) / span) * (to - from - inset * 2);
}

/** Greedy label placement.
 *
 *  Labelling only the extremes leaves a plot where almost nothing has a name,
 *  which is the first thing anybody asks about. Labelling everything is the
 *  wall of overlapping text the bubble fields died of. So: walk the points in
 *  order of importance, try four positions around each one, and keep the label
 *  only if it lands inside the frame and clear of every label already placed
 *  and every dot big enough to be hidden by it. Whatever does not fit has the
 *  hover layer instead — which is why this can afford to be strict.
 *
 *  @param items [{ id, cx, cy, r, name, priority }] — priority high to low
 *  @returns Map id -> { x, y, anchor, text }
 */
export function placeLabels(items, { W, H, fs, max = 26, maxChars = 18, pad = 3 }) {
  // Measured against the rendered getBBox of the real labels: 0.58 left one
  // colliding pair in thirty, 0.63 leaves none. Estimating rather than
  // measuring keeps this a pure function that runs before paint.
  // Glyph metrics, estimated rather than measured so this stays a pure function
  // that runs before paint. Checked against getBBox on the rendered labels: at
  // 9.5px the browser reports 12.2px tall boxes sitting 9.3px above the
  // baseline, which is what these two constants reproduce. The earlier model
  // treated the baseline as the BOTTOM of the box and put every box three
  // pixels too high, so two labels on adjacent rows passed the check and then
  // touched on screen.
  const charW = fs * 0.63;
  const ascent = fs * 0.98;
  const h = fs * 1.3;
  const placed = [];
  // A label may cover a small dot; covering a big one hides data. Only the
  // visually significant ones block.
  const obstacles = items
    .filter((p) => p.r > fs * 0.62)
    .map((p) => [p.cx - p.r, p.cy - p.r, p.r * 2, p.r * 2]);

  const hits = (a, b) =>
    !(
      a[0] + a[2] + pad < b[0] ||
      b[0] + b[2] + pad < a[0] ||
      a[1] + a[3] + pad < b[1] ||
      b[1] + b[3] + pad < a[1]
    );

  const out = new Map();
  const ranked = [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const p of ranked) {
    if (out.size >= max) break;
    const text = p.name.length > maxChars ? `${p.name.slice(0, maxChars - 1).trim()}…` : p.name;
    const w = text.length * charW;
    // Four places to try, each given as a BASELINE; the box hangs from the
    // ascender above it.
    const at = (bx, by, anchor) => ({ x: bx, y: by, anchor, box: null });
    const options = [
      { ...at(p.cx, p.cy - p.r - 4, "middle"), left: p.cx - w / 2 },
      { ...at(p.cx, p.cy + p.r + fs, "middle"), left: p.cx - w / 2 },
      { ...at(p.cx + p.r + 4, p.cy + fs * 0.34, "start"), left: p.cx + p.r + 4 },
      { ...at(p.cx - p.r - 4, p.cy + fs * 0.34, "end"), left: p.cx - p.r - 4 - w },
    ].map((o) => ({ ...o, box: [o.left, o.y - ascent, w, h] }));
    for (const o of options) {
      const [bx, by, bw, bh] = o.box;
      if (bx < 2 || bx + bw > W - 2 || by < 2 || by + bh > H - 2) continue;
      if (placed.some((b) => hits(o.box, b))) continue;
      if (obstacles.some((b) => hits(o.box, b))) continue;
      placed.push(o.box);
      out.set(p.id, { ...o, text });
      break;
    }
  }
  return out;
}
