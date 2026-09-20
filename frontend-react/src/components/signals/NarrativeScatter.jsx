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

import { useMemo } from "react";
import { InfoTip } from "../GuideInfo";
import { median as medianOf, num } from "./flowMetrics";
import { pickTicks, spearman, sq } from "./scatterKit";

// Two geometries, same data. A 640-wide viewBox squeezed into a 358px phone
// column renders its 9.5px labels at 5.3px, which is not a label. The phone
// gets a viewBox close to its own width so the type lands near its real size.
const DESK = {
  W: 640, H: 320, pad: { t: 14, r: 26, b: 32, l: 40 },
  fs: 9.5, r0: 4, r1: 9, axis: "VS MARKET, 7D (pp) · √ SCALE",
};
const PHONE = {
  W: 360, H: 300, pad: { t: 14, r: 18, b: 38, l: 30 },
  fs: 10, r0: 3.5, r1: 7, axis: "VS MARKET 7D (pp) · √",
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

    const sxLo = sq(xLo);
    const sxHi = sq(xHi);
    const span = sxHi - sxLo || 1;
    // An inset on each side so the extreme dots are not welded to the frame —
    // the widest one is a circle, not a tick.
    const inset = 14;
    const px = (v) =>
      PAD.l + inset + ((sq(v) - sxLo) / span) * (W - PAD.l - PAD.r - inset * 2);
    const ySpan = yHi - yLo || 1;
    // A tenth of headroom top and bottom so no dot is welded to an edge.
    const py = (v) =>
      H - PAD.b - ((v - yLo + ySpan * 0.08) / (ySpan * 1.16)) * (H - PAD.t - PAD.b);

    const placed = pts.map((p) => ({
      ...p,
      cx: px(p.x),
      cy: py(p.y),
      // sqrt so AREA tracks the call count, with a floor that stays clickable.
      r: G.r0 + Math.sqrt(p.coins / maxCoins) * G.r1,
    }));

    // Label the extremes only. Every dot labelled is the wall of overlapping
    // text this chart replaced.
    const byX = [...placed].sort((a, b) => b.x - a.x);
    const byY = [...placed].sort((a, b) => b.y - a.y);
    const named = new Set([byX[0]?.id, byX.at(-1)?.id, byY[0]?.id, byY[1]?.id, byY.at(-1)?.id]);

    return {
      points: placed,
      named,
      medianPeak: medianOf(ys),
      py,
      px,
      ticks: pickTicks([-50, -20, -10, -5, 0, 5, 10, 20, 50, 100, 200], xLo, xHi, px, G.fs * 3.4, 0),
      rho: spearman(pts),
      market: m,
    };
  }
}

/** The plot itself, at one geometry. */
function Plot({ model, G, activeIds, onOpen }) {
  const { W, H, pad: PAD, fs } = G;
  const active = new Set(activeIds || []);
  const zeroX = model.px(0);
  const midY = model.py(model.medianPeak);
  return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-manipulation"
        role="img"
        aria-label="Each narrative's move against the market, against how far our calls ran there"
      >
        {/* Quadrant splits: moved-with-the-market, and the median typical peak. */}
        <line
          x1={zeroX}
          x2={zeroX}
          y1={PAD.t}
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

        {model.ticks.map((t) => (
          <g key={t}>
            <line
              x1={model.px(t)}
              x2={model.px(t)}
              y1={H - PAD.b}
              y2={H - PAD.b + 3}
              stroke="rgb(var(--ink) / 0.25)"
            />
            <text
              x={model.px(t)}
              y={H - PAD.b + 14}
              textAnchor="middle"
              className="fill-text-muted"
              style={{ fontSize: fs - 0.5, fontFamily: "monospace" }}
            >
              {t > 0 ? `+${t}` : t}
            </text>
          </g>
        ))}
        <text
          x={W - PAD.r}
          y={H - 3}
          textAnchor="end"
          className="fill-text-muted"
          style={{ fontSize: fs - 0.5, fontFamily: "monospace", letterSpacing: "0.1em" }}
        >
          {G.axis}
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
        <text
          x={PAD.l - 6}
          y={midY - 3}
          textAnchor="end"
          className="fill-text-muted"
          style={{ fontSize: fs - 0.5, fontFamily: "monospace" }}
        >
          {model.medianPeak == null ? "" : `${model.medianPeak.toFixed(0)}%`}
        </text>

        {model.points.map((p) => {
          const on = active.has(p.id);
          const ahead = p.x >= 0;
          return (
            <g
              key={p.id}
              className="cursor-pointer"
              onClick={() => onOpen?.(p.raw)}
              tabIndex={-1}
            >
              <circle
                cx={p.cx}
                cy={p.cy}
                r={p.r}
                fill={ahead ? "rgb(var(--pos) / 0.45)" : "rgb(var(--neg) / 0.45)"}
                stroke={on ? "rgb(var(--accent))" : ahead ? "rgb(var(--pos))" : "rgb(var(--neg))"}
                strokeWidth={on ? 2.5 : 1.4}
              />
              {model.named.has(p.id) || on ? (
                <text
                  /* Clamped into the frame: a name centred on a dot at the
                     right edge runs off the viewBox and gets cut mid-word. */
                  x={Math.min(W - PAD.r, Math.max(PAD.l, p.cx))}
                  y={p.cy - p.r - 4}
                  textAnchor={p.cx > W * 0.7 ? "end" : p.cx < W * 0.2 ? "start" : "middle"}
                  className="pointer-events-none fill-text-primary"
                  style={{ fontSize: fs, fontWeight: 600 }}
                >
                  {p.name.length > 22 ? `${p.name.slice(0, 21).trim()}…` : p.name}
                </text>
              ) : null}
              <title>{`${p.name}\n${p.x >= 0 ? "+" : "−"}${Math.abs(p.x).toFixed(
                1
              )}pp vs market · typical peak ${p.y.toFixed(1)}% · ${p.coins} coins called`}</title>
            </g>
          );
        })}
      </svg>
  );
}

export default function NarrativeScatter({
  narratives = [],
  marketChange7d = null,
  activeIds = [],
  onOpen,
}) {
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
        <span className="ml-auto">
          <InfoTip side="bottom" title="Rotation against reward" text={EXPLAIN} />
        </span>
      </div>

      <div className="sm:hidden">
        <Plot model={phone} G={PHONE} activeIds={activeIds} onOpen={onOpen} />
      </div>
      <div className="hidden sm:block">
        <Plot model={desk} G={DESK} activeIds={activeIds} onOpen={onOpen} />
      </div>

      <p className="mt-1 text-[11px] leading-snug text-text-muted">
        Right is ahead of the market this week, up is calls that ran further, dot size is how many
        coins we called there. The cloud does not tilt:{" "}
        {model.rho != null && Math.abs(model.rho) < 0.2
          ? "capital arriving in a narrative is not a reason to expect more from a call in it."
          : "read the corner figure before drawing a line through it."}{" "}
        Tap a dot for the calls behind it.
      </p>
    </div>
  );
}
