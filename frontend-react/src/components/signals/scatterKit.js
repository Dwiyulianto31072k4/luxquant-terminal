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
export function placeLabels(items, { W, H, fs, max = 26, maxChars = 18, pad = 3, blocked = [] }) {
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
  // `blocked` is chrome drawn over the plot — the zoom controls — which a
  // label would sit underneath, unreadable. Seeded as if already placed.
  const placed = blocked.filter(Boolean).map((b) => [...b]);
  // Dots are NOT obstacles, and every label is drawn with a halo instead.
  //
  // Treating them as obstacles is the obvious rule and it was measurably wrong:
  // raising the mark floor so coins could carry their logos pushed most dots
  // over the threshold, and the inline plot fell from 30 names to 12 — the
  // chart lost more by going quiet than it gained by keeping text off circles.
  // Zoomed in it was worse: three names for seven visible dots, in a frame with
  // room for all seven. A haloed label reads cleanly over a mark, so the only
  // collision that still matters is label against label.

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
      // The gap rides the mark, so a label sits the same distance off a big
      // logo as off a small dot. It is deliberately tight: at a deep zoom the
      // marks are large, and r + 4 left enough air between a logo and its own
      // name to read as two unrelated things.
      { ...at(p.cx, p.cy - p.r - 2.5, "middle"), left: p.cx - w / 2 },
      { ...at(p.cx, p.cy + p.r + fs * 0.9, "middle"), left: p.cx - w / 2 },
      { ...at(p.cx + p.r + 3, p.cy + fs * 0.34, "start"), left: p.cx + p.r + 3 },
      { ...at(p.cx - p.r - 3, p.cy + fs * 0.34, "end"), left: p.cx - p.r - 3 - w },
    ].map((o) => ({ ...o, box: [o.left, o.y - ascent, w, h] }));
    for (const o of options) {
      const [bx, by, bw, bh] = o.box;
      if (bx < 2 || bx + bw > W - 2 || by < 2 || by + bh > H - 2) continue;
      if (placed.some((b) => hits(o.box, b))) continue;
      placed.push(o.box);
      // The offset from the dot rides along, so a label can follow its own
      // mark through a pan or a zoom without being re-placed on every frame —
      // re-placing is a settle-time job, not a per-frame one.
      out.set(p.id, { ...o, text, dx: o.x - p.cx, dy: o.y - p.cy });
      break;
    }
  }
  return out;
}

/** Everything still inside the frame, with a margin so a mark half over the
 *  edge is not popped out mid-drag. Zoomed in this is most of the work saved:
 *  223 dots become the twenty you are looking at, which is what lets the label
 *  placer find room for names the unzoomed plot had no space for. */
export function cull(points, W, H, pad = 40) {
  return points.filter(
    (p) => p.cx > -pad && p.cx < W + pad && p.cy > -pad && p.cy < H + pad
  );
}

/** Which scale an axis should use, decided from the DATA rather than by blanket
 *  rule. A square root is the right answer for a heavy tail — turnover,
 *  rotation, volume — and the wrong answer for anything else: applied to a
 *  variable running -0.5 to 2 it bunched every tick into the bottom eighth of
 *  the axis. So measure the tail, and only bend the axis when there is one. */
export function scaleFor(values) {
  const v = values.filter((x) => x != null && Number.isFinite(x)).map(Math.abs).sort((a, b) => a - b);
  if (v.length < 4) return "linear";
  const med = v[Math.floor(v.length / 2)] || 0;
  const max = v[v.length - 1] || 0;
  if (!med) return max > 0 ? "sqrt" : "linear";
  return max / med > 8 ? "sqrt" : "linear";
}

/** The window an axis should show: the data with a little air, and zero only
 *  when zero means something on that axis. Always including it is how a plot of
 *  narratives whose peaks run 9% to 27% ends up reserving a third of its canvas
 *  for a number nobody plotted. */
export function domainFor(values, { zero = false, padFrac = 0.08 } = {}) {
  const v = values.filter((x) => x != null && Number.isFinite(x));
  if (!v.length) return { lo: 0, hi: 1 };
  let lo = Math.min(...v);
  let hi = Math.max(...v);
  if (zero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  const span = hi - lo || Math.abs(hi) || 1;
  return { lo: lo - span * padFrac, hi: hi + span * padFrac };
}

/** Corner captions for a plot split by two reference lines.
 *
 *  Named, never shaded — on these two panels that distinction is the whole
 *  point. The screener SHADES a corner because it is telling you where to look;
 *  these two are descriptive and their own findings say the axes do not predict
 *  each other, so naming the quadrants informs without smuggling in a
 *  recommendation the data refuses to support. */
export function quadrantCaptions({ W, H, pad, zeroX, midY, labels, fs, reserveTopRight = 0, reserveTopRightDown = 0 }) {
  const inset = 10;
  const topY = fs + 6;
  const botY = H - pad.b - 8;
  // A quadrant that has been panned or zoomed off the frame gets no caption:
  // a label for a region nobody can see is worse than none.
  const hasLeft = zeroX > pad.l + 40;
  const hasRight = zeroX < W - pad.r - 40;
  const hasTop = midY > topY + 14;
  const hasBottom = midY < botY - 14;
  const out = [];
  // The captions sit in the FRAME's corners, not beside the dividing lines.
  // Anchored beside the lines they landed in the middle of the cloud and, when
  // the zero line drifted left, an end-anchored label ran off the edge —
  // "BUSY · SOLD" printed as "SOLD".
  // The zoom controls float over the top-right of the plot, so that caption
  // starts where they end — otherwise the two print on top of each other.
  if (hasRight && hasTop) {
    // Beside the controls when there is room; where there is not — a phone,
    // or the zero line far to the right — under them, so the caption never
    // runs back across the line into the other quadrant.
    const beside = W - pad.r - inset - reserveTopRight;
    const textW = String(labels.tr || "").length * fs * 0.62;
    const fits = beside - textW > zeroX + 6;
    if (fits || !reserveTopRightDown) {
      out.push({ key: "tr", x: beside, y: topY, anchor: "end", text: labels.tr });
    } else if (midY > topY + reserveTopRightDown + 14) {
      out.push({ key: "tr", x: W - pad.r - inset, y: topY + reserveTopRightDown, anchor: "end", text: labels.tr });
    }
  }
  if (hasLeft && hasTop) out.push({ key: "tl", x: pad.l + inset, y: topY, anchor: "start", text: labels.tl });
  if (hasRight && hasBottom) out.push({ key: "br", x: W - pad.r - inset, y: botY, anchor: "end", text: labels.br });
  if (hasLeft && hasBottom) out.push({ key: "bl", x: pad.l + inset, y: botY, anchor: "start", text: labels.bl });
  return out.filter((c) => c.text);
}
