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
