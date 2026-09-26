// NarrativeScatter — does capital arriving in a narrative mean our calls run
// further there?
//
// This is the chart the Narratives board was designed around and never got.
// What sat in its place was a bubble field: forty circles sized by coins called
// and coloured by the same relative strength the Capital rotation list beside
// it already ranks. Two marks for one fact, and at forty items in a 620x340
// box the labels overlapped so badly that half the narratives could not be
// read at all. A scatter is the one shape here that holds a RELATIONSHIP
// rather than a second ranking, and it is the only thing on this panel neither
// the table nor the rotation list can say.
//
// The answer it gives is no, and that is worth drawing. The rank correlation is
// computed live and printed: on the live window it is near zero, the points sit
// in all four quadrants, and a reader who came looking for "buy the hot
// narrative" leaves without it.
//
// Two scale decisions, both forced by the data:
//
//  • X is SIGNED SQUARE ROOT. Relative strength runs from −4pp to +96pp on the
//    live week, so on a linear axis thirty-eight narratives pile into the left
//    eighth of the plot and the chart draws one outlier. The transform is
//    monotone, keeps zero at zero, and the ticks are labelled with their real
//    values so nothing about the axis is hidden.
//  • Y is linear, because typical peak behaves: 9% to 26%, no tail.
//
// Plain SVG on purpose — forty points, two axes and six labels do not justify a
// chart bundle, and hand-drawn marks take the theme tokens directly.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InfoTip } from "../GuideInfo";
import { median as medianOf, num } from "./flowMetrics";
import {
  cull,
  domainFor,
  pickTicks,
  placeLabels,
  quadrantCaptions,
  scaleFor,
  spearman,
  sq,
} from "./scatterKit";
import useZoomPan from "./useZoomPan";
import usePhone from "./usePhone";
import useControlsReserve from "./useControlsReserve";
import MissingTray from "./MissingTray";
import ZoomControls, { ZoomHint } from "./ZoomControls";
import ScatterTip from "./ScatterTip";

// Two geometries, same data. A 640-wide viewBox squeezed into a 358px phone
// column renders its 9.5px labels at 5.3px, which is not a label. The phone
// gets a viewBox close to its own width so the type lands near its real size.
const DESK = {
  W: 640, H: 320, pad: { t: 14, r: 26, b: 32, l: 40 },
  fs: 9.5, r0: 4, r1: 9, axis: "VS MARKET, 7D (pp) · √ SCALE", maxLabels: 22, maxChars: 18,
};
// Expanded. Nearly four times the area, so the label placer finds room for
// most of the forty narratives instead of nine.
const LARGE = {
  W: 1240, H: 600, pad: { t: 20, r: 34, b: 44, l: 56 },
  fs: 11.5, r0: 6, r1: 18, axis: "VS MARKET, 7D (pp) · √ SCALE", maxLabels: 40, maxChars: 26,
};
const PHONE = {
  W: 360, H: 300, pad: { t: 14, r: 18, b: 38, l: 30 },
  fs: 10, r0: 3.5, r1: 7, axis: "VS MARKET 7D (pp) · √", maxLabels: 10, maxChars: 13,
};
// Expanded on a phone: taller, not wider — LARGE fitted to a 358px sheet
// printed its names at 3px, smaller than the inline chart it was expanding.
const PHONE_TALL = {
  W: 360, H: 520, pad: { t: 14, r: 18, b: 38, l: 30 },
  fs: 10.5, r0: 4.5, r1: 10, axis: "VS MARKET 7D (pp) · √", maxLabels: 16, maxChars: 14,
};

const EXPLAIN =
  "Each dot is one narrative. Left to right is how it moved against the market over the last " +
  "7 days; bottom to top is how far our calls inside it typically ran. Dot size is how many " +
  "coins we called there.\n\n" +
  "The two dashed lines split the plot at 'moved with the market' and 'the median narrative's " +
  "typical peak', so the four quadrants are: hot and rewarding (top right), hot and ordinary " +
  "(bottom right), quiet and rewarding (top left), quiet and ordinary (bottom left).\n\n" +
  "The number in the corner is the rank correlation between the two axes. Near zero means " +
  "capital arriving in a narrative tells you nothing about how far a call in it will run — " +
  "which is the honest reading of this desk, and the reason the chart refuses to form a line.\n\n" +
  "The horizontal axis is a square-root scale. One narrative regularly sits ninety points " +
  "ahead of the market while the typical one sits four; on a linear axis every other dot piles " +
  "into the left edge. The ticks carry their real values.";

/** Why a narrative cannot be placed. The panel counts forty and the plot draws
 *  thirty-six; the four deserve a reason rather than a disappearance. */
export function narrativeMissing(narratives = []) {
  return narratives
    .filter((x) => x.mcap_change_7d == null || x.median_peak == null)
    .map((x) => ({
      id: x.category_id,
      name: x.name,
      raw: x,
      why: x.mcap_change_7d == null ? "no 7-day snapshot" : "nothing resolved yet",
    }));
}

function buildModel(narratives, marketChange7d, G) {
  {
    const { W, H, pad: PAD } = G;
    const m = num(marketChange7d) ?? 0;
    const pts = narratives
      .filter((x) => x.mcap_change_7d != null && x.median_peak != null)
      .map((x) => ({
        id: x.category_id,
        name: x.name,
        x: (num(x.mcap_change_7d) ?? 0) - m,
        y: num(x.median_peak),
        coins: x.coins_called || 1,
        raw: x,
      }));
    if (!pts.length) return null;

    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const xLo = Math.min(...xs, 0);
    const xHi = Math.max(...xs, 0);
    const yLo = Math.min(...ys);
    const yHi = Math.max(...ys);
    const maxCoins = Math.max(...pts.map((p) => p.coins));

    // Scale from the data: rotation has a real tail (one narrative regularly
    // sits ninety points clear) and typical peak does not, so they should not
    // be bent by the same rule.
    const xScale = scaleFor(xs);
    const yScale = scaleFor(ys);
    const xw = domainFor(xs, { zero: true });
    const tx = xScale === "sqrt" ? sq : (v) => v;
    const sxLo = tx(xw.lo);
    const sxHi = tx(xw.hi);
    const span = sxHi - sxLo || 1;
    // An inset on each side so the extreme dots are not welded to the frame —
    // the widest one is a circle, not a tick.
    const inset = 14;
    const px = (v) =>
      PAD.l + inset + ((tx(v) - sxLo) / span) * (W - PAD.l - PAD.r - inset * 2);
    // Peak runs about 9% to 27%; anchoring this axis at zero would reserve a
    // third of the canvas for a number nobody plotted.
    const yw = domainFor(ys, { zero: false });
    const ty = yScale === "sqrt" ? sq : (v) => v;
    const yLo2 = ty(yw.lo);
    const ySpan = ty(yw.hi) - yLo2 || 1;
    const py = (v) => H - PAD.b - ((ty(v) - yLo2) / ySpan) * (H - PAD.t - PAD.b);

    const placed = pts.map((p) => ({
      ...p,
      cx: px(p.x),
      cy: py(p.y),
      // sqrt so AREA tracks the call count, with a floor that stays clickable.
      r: G.r0 + Math.sqrt(p.coins / maxCoins) * G.r1,
    }));

    // Who gets a name. The extremes first, then everything else by how many
    // coins we called there — the narratives the desk is most invested in are
    // the ones worth recognising without a hover. placeLabels keeps whatever
    // fits without colliding; the rest have the hover card.
    const maxX = Math.max(...placed.map((p) => Math.abs(p.x)), 1);
    const corners = new Set(
      [
        [...placed].sort((a, b) => b.x - a.x)[0],
        [...placed].sort((a, b) => a.x - b.x)[0],
        [...placed].sort((a, b) => b.y - a.y)[0],
        [...placed].sort((a, b) => a.y - b.y)[0],
      ]
        .filter(Boolean)
        .map((p) => p.id)
    );
    // The priority is kept ON the points, not on a throwaway copy: the plot
    // re-places its labels (on open, on a new filter, after a zoom), and a
    // re-place that could not see it fell back to data order — the extremes
    // the chart is about went unnamed while the first ten rows got names.
    const ranked = placed.map((p) => ({
      ...p,
      priority:
        (corners.has(p.id) ? 100 : 0) +
        Math.sqrt(p.coins / maxCoins) * 10 +
        (Math.abs(p.x) / maxX) * 3,
    }));
    const labels = placeLabels(ranked, { W, H, fs: G.fs, max: G.maxLabels, maxChars: G.maxChars });

    // The four states the plot separates, with the biggest name in each so a
    // count is never just a count.
    const quad = (label, key, fn) => {
      const set = placed.filter(fn);
      const lead = [...set].sort((a, b) => b.coins - a.coins)[0];
      return {
        key,
        label,
        count: set.length,
        lead: lead ? `${lead.name} leads, ${lead.coins} coins` : null,
      };
    };
    const midPeak = medianOf(ys) ?? 0;
    const quadrants = [
      quad("Hot and rewarding", "hr", (p) => p.x >= 0 && p.y >= midPeak),
      quad("Hot but ordinary", "ho", (p) => p.x >= 0 && p.y < midPeak),
      quad("Quiet but rewarding", "qr", (p) => p.x < 0 && p.y >= midPeak),
      quad("Quiet and ordinary", "qo", (p) => p.x < 0 && p.y < midPeak),
    ];

    return {
      quadrants,
      points: ranked,
      labels,
      medianPeak: medianOf(ys),
      py,
      px,
      xLo,
      xHi,
      xScale,
      yScale,
      yw,
      rho: spearman(pts),
      market: m,
    };
  }
}

// Deliberately finer than any one view needs: pickTicks thins whatever will not
// fit, so the coarse values survive at 1x and the fine ones appear as the axis
// stretches under a zoom.
const X_TICKS = [
  -50, -30, -20, -15, -10, -8, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 8,
  10, 15, 20, 30, 40, 50, 75, 100, 150, 200,
];

// The vertical axis had no ticks at all, which meant the one number this chart
// ranks narratives on could not be read off it — you could see that Privacy sat
// above AI Applications and not that it sat at 27% against 21%.
const Y_TICKS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 25, 30, 35, 40, 50, 60, 75, 100];

/** The narratives a plot cannot place, named with the reason. */
/** The plot itself, at one geometry. */
function Plot({ model, G, activeIds, onOpen, wheel = "modifier" }) {
  const { W, H, pad: PAD, fs } = G;
  const [hover, setHover] = useState(null);
  // Labels re-place when a gesture settles, never during it; between settles
  // each rides its own dot by the offset it was placed at.
  const [labels, setLabels] = useState(model.labels);
  const stateRef = useRef(null);
  const resettle = useCallback(() => {
    const st = stateRef.current;
    if (st) setLabels(st.place());
  }, []);

  const zp = useZoomPan({ W, H, wheel, onSettle: resettle });
  const [controlsRef, ctl] = useControlsReserve(zp.hostRef, W, W * 0.11);
  const { t, project, mark } = zp;
  // Type grows with the zoom too, or it shrinks away beside marks that do.
  const fz = fs * zp.label;
  const active = new Set(activeIds || []);

  const points = useMemo(
    () =>
      model.points.map((p) => {
        const q = project(p.cx, p.cy);
        return { ...p, cx: q.x, cy: q.y, r: p.r * mark };
      }),
    [model.points, project, mark]
  );
  const visible = useMemo(() => cull(points, W, H), [points, W, H]);

  stateRef.current = {
    place: () =>
      placeLabels(cull(points, W, H, 0), {
        W,
        H,
        fs: fz,
        // The cap guards the UNZOOMED view, where every point is on screen and
        // a wall of text helps nobody. Zoomed in, the frame holds a handful of
        // dots with room to spare, and collision is the only limit that should
        // still apply.
        max: zp.zoomed ? 999 : G.maxLabels,
        maxChars: G.maxChars,
        blocked: ctl.w ? [[W - ctl.w, 0, ctl.w, ctl.h]] : [],
      }),
  };

  // Re-place whenever the MODEL changes — new rows, a new filter, a new
  // window. This is the bug that made the names look like they had come
  // unstuck: a label carries the offset from the dot it was placed against,
  // and changing the filter changes the axis domain, which moves every dot.
  // The offsets were still correct and the positions they were measured from
  // no longer existed, so each label drifted by a different amount. There was
  // no path back either — the only reset ran at exactly 1x with no pan, and a
  // reader who had touched the zoom never saw it fire.
  //
  // Deliberately NOT keyed on the transform: the placer walks every point
  // against every label already down, and running that per frame is the
  // stutter this panel was accused of. Gestures are handled by useZoomPan's
  // settle instead.
  useEffect(() => {
    if (stateRef.current) setLabels(stateRef.current.place());
  }, [model, ctl.w, ctl.h]);

  const xTicks = useMemo(() => {
    const inFrame = X_TICKS.filter((v) => {
      const x = project(model.px(v), 0).x;
      return x >= PAD.l - 1 && x <= W - PAD.r + 1;
    });
    return pickTicks(inFrame, -Infinity, Infinity, (v) => project(model.px(v), 0).x, fz * 3.4, 0);
  }, [project, model, PAD.l, PAD.r, W, fz]);

  // The axis this chart RANKS on finally gets a scale you can read a value off.
  const yTicks = useMemo(() => {
    const nameY = PAD.t + 8;
    // The median line prints its own value at the axis. A tick at the same
    // height printed "14%" twice, one over the other. Computed here, not read
    // from `midY` below — that is declared after this memo runs.
    const medY = model.medianPeak == null ? null : project(0, model.py(model.medianPeak)).y;
    const inFrame = Y_TICKS.filter((v) => {
      const y = project(0, model.py(v)).y;
      return (
        y >= 6 &&
        y <= H - PAD.b - 2 &&
        Math.abs(y - nameY) > fz * 1.2 &&
        (medY == null || Math.abs(y - (medY - 3)) > fz * 1.1)
      );
    });
    return pickTicks(inFrame, -Infinity, Infinity, (v) => project(0, model.py(v)).y, fz * 2);
  }, [project, model, H, PAD.b, PAD.t, fz]);

  const clipId = `narr-${W}-${H}`;
  const zeroX = project(model.px(0), 0).x;
  const midY = project(0, model.py(model.medianPeak)).y;

  // Named, not shaded. This panel's own finding is that rotation does not
  // predict reward, so shading a corner would smuggle in a recommendation the
  // data refuses to support — but a reader still deserves to know what each
  // corner MEANS.
  const captions = useMemo(
    () =>
      quadrantCaptions({
        W,
        H,
        pad: PAD,
        zeroX,
        midY,
        fs: fz,
        // room for the floating zoom controls, measured
        reserveTopRight: ctl.w,
        reserveTopRightDown: ctl.h,
        labels: {
          tr: "HOT · RAN FURTHER",
          tl: "QUIET · RAN FURTHER",
          br: "HOT · ORDINARY",
          bl: "QUIET · ORDINARY",
        },
      }),
    [W, H, PAD, zeroX, midY, fz, ctl.w, ctl.h]
  );

  return (
    <div className="relative">
      <svg
        ref={zp.hostRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`h-auto w-full select-none ${zp.panning ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ touchAction: zp.touchAction }}
        role="img"
        tabIndex={0}
        aria-label="Each narrative's move against the market, against how far our calls ran there. Drag to pan, plus and minus to zoom, zero to reset."
        {...zp.handlers}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.l} y={0} width={W - PAD.l - 2} height={H - PAD.b} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
        {/* Quadrant splits: moved-with-the-market, and the median typical peak. */}
        <line
          x1={zeroX}
          x2={zeroX}
          y1={0}
          y2={H - PAD.b}
          stroke="rgb(var(--ink) / 0.18)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={midY}
          y2={midY}
          stroke="rgb(var(--ink) / 0.18)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        </g>

        {captions.map((c) => (
          <text
            key={c.key}
            x={c.x}
            y={c.y}
            textAnchor={c.anchor}
            className="fill-text-muted"
            style={{ fontSize: fz - 1.5, fontFamily: "monospace", letterSpacing: "0.1em", opacity: 0.55 }}
          >
            {c.text}
          </text>
        ))}

        {/* Ticks sit OUTSIDE the clip and are thinned for the window actually
            on screen, so a zoom yields finer gradations rather than the same
            handful drifting apart. */}
        {xTicks.map((v) => {
          const x = project(model.px(v), 0).x;
          return (
            <g key={v}>
              <line x1={x} x2={x} y1={H - PAD.b} y2={H - PAD.b + 3} stroke="rgb(var(--ink) / 0.25)" />
              <text
                x={x}
                y={H - PAD.b + 14}
                textAnchor="middle"
                className="fill-text-muted"
                style={{ fontSize: fs - 0.5, fontFamily: "monospace" }}
              >
                {v > 0 ? `+${v}` : v}
              </text>
            </g>
          );
        })}
        {yTicks.map((v) => (
          <text
            key={`y${v}`}
            x={PAD.l - 6}
            y={project(0, model.py(v)).y + 3}
            textAnchor="end"
            className="fill-text-muted"
            style={{ fontSize: fz - 1, fontFamily: "monospace" }}
          >
            {v}%
          </text>
        ))}
        <text
          x={W - PAD.r}
          y={H - 3}
          textAnchor="end"
          className="fill-text-muted"
          style={{ fontSize: fz - 0.5, fontFamily: "monospace", letterSpacing: "0.1em" }}
        >
          {model.xScale === "sqrt" ? G.axis : G.axis.replace(" · √ SCALE", "").replace(" · √", "")}
        </text>
        <text
          x={PAD.l - 6}
          y={PAD.t + 8}
          textAnchor="end"
          className="fill-text-muted"
          style={{ fontSize: fs - 0.5, fontFamily: "monospace" }}
        >
          peak
        </text>
        {/* The median-peak label is skipped when it would land on the axis
            name — the same pixels twice reads as one broken word. */}
        <text
          x={PAD.l - 6}
          y={midY - 3}
          opacity={Math.abs(midY - 3 - (PAD.t + 8)) < fs * 1.2 ? 0 : 1}
          textAnchor="end"
          className="fill-text-muted"
          style={{ fontSize: fs - 0.5, fontFamily: "monospace" }}
        >
          {model.medianPeak == null ? "" : `${model.medianPeak.toFixed(0)}%`}
        </text>

        <g clipPath={`url(#${clipId})`}>
        {visible.map((p) => {
          const on = active.has(p.id);
          const hot = hover?.id === p.id;
          const ahead = p.x >= 0;
          return (
            <g
              key={p.id}
              className="cursor-pointer"
              onClick={() => {
                if (zp.swallowClick()) return;
                onOpen?.(p.raw);
              }}
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover((h) => (h?.id === p.id ? null : h))}
            >
              {/* A transparent disc under every dot, so a small mark is still a
                  target a mouse can find without hunting for it. */}
              <circle cx={p.cx} cy={p.cy} r={Math.max(p.r + 4, 10)} fill="transparent" />
              <circle
                cx={p.cx}
                cy={p.cy}
                r={p.r}
                fill={ahead ? "rgb(var(--pos) / 0.45)" : "rgb(var(--neg) / 0.45)"}
                stroke={
                  hot
                    ? "rgb(var(--fg))"
                    : on
                      ? "rgb(var(--accent))"
                      : ahead
                        ? "rgb(var(--pos))"
                        : "rgb(var(--neg))"
                }
                strokeWidth={hot ? 2.6 : on ? 2.5 : 1.4}
              />
            </g>
          );
        })}

        {/* Names are a layer of their own, drawn after EVERY mark. Inside each
           mark's group, the next mark painted straight over the previous name —
           "OP" and "FIL" read as one word, and a big disc could hide a name
           entirely. The halo lets a name sit over any mark; it only works when
           the name is on top. */}
        {visible.map((p) => {
          const label = labels.get(p.id);
          return label ? (
            <text
              key={`label-${p.id}`}
              x={label.x}
              y={label.y}
              textAnchor={label.anchor}
              className="pointer-events-none fill-text-primary"
              /* A halo in the surface colour, drawn UNDER the glyphs. It is what
                 lets a label sit over a mark and still be read, which is what buys
                 the plot three times as many names. */
              style={{
                fontSize: fz,
                fontWeight: 600,
                paintOrder: "stroke",
                stroke: "rgb(var(--surface-raised))",
                strokeWidth: 3.2,
                strokeLinejoin: "round",
              }}
            >
              {label.text}
            </text>
          ) : null;
        })}
        </g>
      </svg>
      <span ref={controlsRef} className="absolute right-1.5 top-1.5">
        <ZoomControls
          zoomed={zp.zoomed}
          zoomBy={zp.zoomBy}
          reset={zp.reset}
          k={t.k}
          min={zp.min}
          max={zp.max}
        />
      </span>
      <ScatterTip
        point={hover}
        W={W}
        H={H}
        title={hover?.name}
        rows={
          hover
            ? [
                {
                  label: "vs market, 7d",
                  value: `${hover.x >= 0 ? "+" : "\u2212"}${Math.abs(hover.x).toFixed(1)}pp`,
                  tone: hover.x >= 0 ? "text-profit" : "text-loss",
                },
                { label: "typical peak", value: `${hover.y.toFixed(1)}%`, tone: "text-profit" },
                { label: "coins called", value: hover.coins },
                {
                  label: "TP3+",
                  value:
                    hover.raw?.full_tp_rate == null
                      ? "\u2014"
                      : `${hover.raw.full_tp_rate.toFixed(1)}%`,
                },
              ]
            : []
        }
        note="tap for the calls behind it"
      />
    </div>
  );
}

/** The expanded plot, for the modal. */
export function NarrativeScatterLarge({ narratives = [], marketChange7d = null, activeIds = [], onOpen }) {
  const phone = usePhone();
  const G = phone ? PHONE_TALL : LARGE;
  const model = useMemo(
    () => buildModel(narratives, marketChange7d, G),
    [narratives, marketChange7d, G]
  );
  const missing = useMemo(() => narrativeMissing(narratives), [narratives]);
  if (!model) return null;
  return (
    <div className="min-w-0">
      {/* The modal locks the page behind it, so there is no scroll to steal:
          the plain wheel zooms here and only asks for a modifier inline. */}
      <Plot model={model} G={G} activeIds={activeIds} onOpen={onOpen} wheel="direct" />
      <MissingTray items={missing} onOpen={onOpen} nameOf={(m) => m.name} limit={6} />
      <p className="mt-1">
        <ZoomHint wheel="direct" />
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {model.quadrants.map((q) => (
          <div key={q.key} className="rounded-lg bg-ink/[0.03] px-3 py-2">
            <p className="text-[11.5px] font-medium leading-snug text-text-primary">{q.label}</p>
            <p className="mt-0.5 font-mono text-[15px] tabular-nums text-text-primary">
              {q.count}
              <span className="ml-1.5 text-[10.5px] text-text-muted">narratives</span>
            </p>
            <p className="truncate text-[10.5px] text-text-muted">{q.lead || "—"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NarrativeScatter({
  narratives = [],
  marketChange7d = null,
  activeIds = [],
  onOpen,
  onExpand,
}) {
  const missing = useMemo(() => narrativeMissing(narratives), [narratives]);
  const desk = useMemo(
    () => buildModel(narratives, marketChange7d, DESK),
    [narratives, marketChange7d]
  );
  const phone = useMemo(
    () => buildModel(narratives, marketChange7d, PHONE),
    [narratives, marketChange7d]
  );
  if (!desk || !phone) return null;
  const model = desk;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[12.5px] font-medium text-text-primary">
          Does a hot narrative pay more?
        </span>
        {model.rho != null ? (
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-text-muted">
            rank correlation {model.rho >= 0 ? "+" : "\u2212"}
            {Math.abs(model.rho).toFixed(2)}
            {Math.abs(model.rho) < 0.2 ? " \u00b7 essentially none" : ""}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-2">
          {onExpand ? (
            <button
              type="button"
              onClick={onExpand}
              className="rounded-md border border-ink/[0.12] px-2 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-muted transition-colors hover:border-accent/40 hover:text-accent"
            >
              Expand
            </button>
          ) : null}
          <InfoTip side="bottom" title="Rotation against reward" text={EXPLAIN} />
        </span>
      </div>

      <div className="sm:hidden">
        <Plot model={phone} G={PHONE} activeIds={activeIds} onOpen={onOpen} />
      </div>
      <div className="hidden sm:block">
        <Plot model={desk} G={DESK} activeIds={activeIds} onOpen={onOpen} />
      </div>

      <MissingTray items={missing} onOpen={onOpen} nameOf={(m) => m.name} limit={6} />
      <p className="mt-1 text-[11px] leading-snug text-text-muted">
        Right is ahead of the market this week, up is calls that ran further, dot size is how many
        coins we called there. The cloud does not tilt:{" "}
        {model.rho != null && Math.abs(model.rho) < 0.2
          ? "capital arriving in a narrative is not a reason to expect more from a call in it."
          : "read the corner figure before drawing a line through it."}{" "}
        Hover any dot for its figures; tap for the calls behind it.
      </p>
      <p className="mt-1">
        <ZoomHint wheel="modifier" />
      </p>
    </div>
  );
}
