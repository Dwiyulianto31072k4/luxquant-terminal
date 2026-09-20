// CoinScatter — is the busy money buying or selling, and are we on it?
//
// Replaces the bubble field this view used to hold. Floating bubbles look like
// a chart and answer nothing: at twenty-five coins in a 620x290 box the labels
// collide, the field never settles, and the two things it encoded — dollars
// traded and the day's move — are both already columns in the table above it.
//
// This asks something the table cannot. Turnover on its own is direction-free:
// a coin that traded 90% of itself today is contested, and the number says
// nothing about who won. Put the day's move on the other axis and the field
// splits into the four states a desk actually cares about — quietly drifting,
// quietly bleeding, busy and bid, busy and sold — and the gold points show
// where LuxQuant's calls sit inside it.
//
// Both axes are square-rooted, for the same reason: the day's move runs −21% to
// +87% and turnover runs 0 to 0.90, each around a median a fraction of its
// maximum. Ticks carry their real values.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InfoTip } from "../GuideInfo";
import { fmtMultiple, num, price as fmtPrice, usdShort } from "./flowMetrics";
import { cull, pickTicks, placeLabels, projector, sq } from "./scatterKit";
import useZoomPan from "./useZoomPan";
import ZoomControls, { ZoomHint } from "./ZoomControls";
import ScatterTip from "./ScatterTip";
import CoinDisc from "./CoinDisc";

const DESK = {
  W: 640, H: 330, pad: { t: 16, r: 22, b: 34, l: 44 },
  fs: 9.5, r0: 4, r1: 11, maxLabels: 38, minLogo: 7,
};
const PHONE = {
  W: 360, H: 300, pad: { t: 14, r: 16, b: 38, l: 34 },
  fs: 10, r0: 2.5, r1: 8, maxLabels: 12, minLogo: 7,
};
// Expanded. Nearly four times the area of the inline plot, which is why this is
// not a zoom: the marks grow past the logo threshold, and the label placer —
// which only ever keeps what fits — finds room for two or three times as many
// names without a single collision.
const LARGE = {
  W: 1240, H: 620, pad: { t: 20, r: 30, b: 42, l: 56 },
  // The floor is the point: at r0 = 7 every mark is big enough to carry a
  // logo, so the expanded plot is read by recognising coins rather than by
  // reading labels. Area still tracks dollars above the floor — a minimum mark
  // size is why r0 exists at all, here it is just set where the logos start.
  fs: 11, r0: 7, r1: 16, maxLabels: 80, minLogo: 7,
};

// Deliberately finer than any one view needs: pickTicks thins whatever will
// not fit, so the coarse values survive at 1x and the fine ones appear as the
// axis stretches under a zoom. One list, every scale.
const X_TICKS = [
  -50, -40, -30, -20, -15, -10, -8, -6, -5, -4, -3, -2, -1, -0.5, 0,
  0.5, 1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 40, 50, 75, 100, 150,
];
const Y_TICKS = [
  0.005, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.07, 0.1, 0.15, 0.2, 0.25, 0.3,
  0.4, 0.5, 0.6, 0.75, 0.9, 1,
];

const EXPLAIN =
  "Each dot is one coin in the current snapshot. Left to right is its move over the last 24 " +
  "hours; bottom to top is turnover — 24h volume divided by market cap, so how much of the " +
  "coin changed hands today. Dot size is the dollars traded, and gold is a coin LuxQuant has " +
  "called in the last 7 days.\n\n" +
  "Turnover on its own has no direction: a coin that traded most of itself today was fought " +
  "over, and the figure does not say who won. Reading it against the day's move is what " +
  "separates a coin being accumulated from a coin being unloaded — the top right and the top " +
  "left of this plot.\n\n" +
  "Both axes are square-root scales. The day's move runs from about −20% to about +90% and " +
  "turnover from nothing to nearly 1.0, each with almost every coin near the bottom of its " +
  "range; on linear axes the whole market would sit in one corner. The ticks carry their real " +
  "values.\n\n" +
  "This is a snapshot, refreshed every four hours, and it is descriptive. A busy coin is not a " +
  "signal, and the dots do not know what happens next.";

function Plot({ model, G, onOpen, logos = true, wheel = "modifier" }) {
  const { W, H, pad: PAD, fs } = G;
  const [hover, setHover] = useState(null);
  // Labels are re-placed when a gesture settles, never during it — see
  // useZoomPan. Between settles each label rides its own dot by the offset it
  // was placed at, so nothing detaches while you drag.
  const [labels, setLabels] = useState(model.labels);
  const stateRef = useRef(null);

  const resettle = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    setLabels(st.place());
  }, []);

  const zp = useZoomPan({ W, H, wheel, onSettle: resettle });
  const { t, project, mark } = zp;
  // Type grows with the zoom too, or it shrinks away beside marks that do.
  const fz = fs * zp.label;

  // Positions after the transform. Radii grow sub-linearly, which is what makes
  // a zoom de-clutter rather than magnify: the cloud spreads faster than the
  // marks do, and small dots still cross the threshold where they gain a logo.
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
      placeLabels(
        cull(
          model.points.map((p) => {
            const q = project(p.cx, p.cy);
            return { ...p, cx: q.x, cy: q.y, r: p.r * mark };
          }),
          W,
          H,
          0
        ),
        {
          W,
          H,
          fs: fz,
          // The cap is a guard for the UNZOOMED view, where every point is on
          // screen and a wall of text helps nobody. Zoomed in, the frame holds
          // a handful of dots with room to spare, and the collision rule is
          // the only limit that should still apply.
          max: zp.zoomed ? 999 : G.maxLabels,
          maxChars: 10,
        }
      ),
  };

  // The unzoomed labels are the model's own; anything else is placed here.
  useEffect(() => {
    if (t.k <= 1.001 && t.x === 0 && t.y === 0) setLabels(model.labels);
  }, [t, model.labels]);

  // Ticks for the window actually on screen: filter the full candidate list to
  // what falls inside the frame after the transform, then thin what cannot fit.
  // Zooming therefore produces FINER gradations rather than the same four
  // numbers drifting apart.
  const xTicks = useMemo(() => {
    const inFrame = X_TICKS.filter((v) => {
      const x = project(model.px(v), 0).x;
      return x >= PAD.l - 1 && x <= W - PAD.r + 1;
    });
    return pickTicks(inFrame, -Infinity, Infinity, (v) => project(model.px(v), 0).x, fs * 3.4, 0);
  }, [project, model, PAD.l, PAD.r, W, fs]);

  const yTicks = useMemo(() => {
    const inFrame = Y_TICKS.filter((v) => {
      const y = project(0, model.py(v)).y;
      return y >= 4 && y <= H - PAD.b - 2;
    });
    return pickTicks(inFrame, -Infinity, Infinity, (v) => project(0, model.py(v)).y, fs * 1.9);
  }, [project, model, H, PAD.b, fs]);

  const clipId = `plot-${W}-${H}`;
  const zeroX = project(model.px(0), 0).x;

  return (
    <div className="relative">
    <svg
      ref={zp.hostRef}
      viewBox={`0 0 ${W} ${H}`}
      className={`h-auto w-full select-none ${zp.panning ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ touchAction: zp.touchAction }}
      role="img"
      tabIndex={0}
      aria-label="Each coin's 24 hour move against how much of it changed hands today. Drag to pan, plus and minus to zoom, zero to reset."
      {...zp.handlers}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD.l} y={0} width={W - PAD.l - 2} height={H - PAD.b} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
      <line
        x1={zeroX}
        x2={zeroX}
        y1={0}
        y2={H - PAD.b}
        stroke="rgb(var(--ink) / 0.2)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      {model.busyY != null ? (
        <>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={project(0, model.busyY).y}
            y2={project(0, model.busyY).y}
            stroke="rgb(var(--accent) / 0.35)"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
          <text
            x={W - PAD.r}
            y={project(0, model.busyY).y - 4}
            textAnchor="end"
            className="fill-text-muted"
            style={{ fontSize: fs - 0.5, fontFamily: "monospace", letterSpacing: "0.08em" }}
          >
            BUSY LINE · 30%
          </text>
        </>
      ) : null}

      </g>

      {/* Ticks live OUTSIDE the clip and are thinned for the window actually on
          screen, so zooming in produces finer gradations rather than the same
          four numbers drifting apart. */}
      {xTicks.map((v) => {
        const x = project(model.px(v), 0).x;
        return (
          <g key={`x${v}`}>
            <line x1={x} x2={x} y1={H - PAD.b} y2={H - PAD.b + 3} stroke="rgb(var(--ink) / 0.25)" />
            <text
              x={x}
              y={H - PAD.b + 13}
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
          style={{ fontSize: fs - 0.5, fontFamily: "monospace" }}
        >
          {v < 0.01 ? v.toFixed(3) : v.toFixed(2).replace(/0$/, "")}
        </text>
      ))}
      <text
        x={W - PAD.r}
        y={H - 3}
        textAnchor="end"
        className="fill-text-muted"
        style={{ fontSize: fs - 0.5, fontFamily: "monospace", letterSpacing: "0.1em" }}
      >
        24H MOVE (%) · √ SCALE
      </text>
      <text
        x={PAD.l - 6}
        y={PAD.t + 6}
        textAnchor="end"
        className="fill-text-muted"
        style={{ fontSize: fs - 0.5, fontFamily: "monospace" }}
      >
        churn
      </text>

      <g clipPath={`url(#${clipId})`}>
      {visible.map((p) => {
        const label = labels.get(p.id);
        const on = hover?.id === p.id;
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
            {/* A transparent disc under every dot, so a 3px mark is still a
                target a mouse can find without hunting for it. */}
            <circle cx={p.cx} cy={p.cy} r={Math.max(p.r + 4, 9)} fill="transparent" />
            <CoinDisc
              symbol={p.name}
              cx={p.cx}
              cy={p.cy}
              r={p.r}
              minLogo={logos ? G.minLogo : Infinity}
              fill={
                p.called
                  ? "rgb(var(--accent) / 0.4)"
                  : p.x >= 0
                    ? "rgb(var(--pos) / 0.26)"
                    : "rgb(var(--neg) / 0.26)"
              }
              ring={
                on
                  ? "rgb(var(--fg))"
                  : p.called
                    ? "rgb(var(--accent))"
                    : p.x >= 0
                      ? "rgb(var(--pos) / 0.75)"
                      : "rgb(var(--neg) / 0.75)"
              }
              ringWidth={on ? 2.4 : p.called ? 1.8 : 1.1}
            />
            {label ? (
              <text
                x={label.x}
                y={label.y}
                textAnchor={label.anchor}
                className="pointer-events-none fill-text-primary"
                /* A halo in the surface colour, drawn UNDER the glyphs. It is
                   what lets a label sit over a mark and still be read, which
                   is what buys the plot three times as many names. */
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
            ) : null}
          </g>
        );
      })}
      </g>
    </svg>
    {/* Over the plot rather than in the header, because this is where the hand
        already is, and because the modal header has no room for it. */}
    <span className="absolute right-1.5 top-1.5">
      <ZoomControls zoomed={zp.zoomed} zoomBy={zp.zoomBy} reset={zp.reset} k={t.k} />
    </span>
    <ScatterTip
      point={hover}
      W={W}
      H={H}
      title={hover?.name}
      rows={
        hover
          ? [
              { label: "24h", value: `${hover.x >= 0 ? "+" : "\u2212"}${Math.abs(hover.x).toFixed(2)}%`, tone: hover.x >= 0 ? "text-profit" : "text-loss" },
              { label: "turnover", value: hover.y.toFixed(2) },
              { label: "24h volume", value: usdShort(hover.vol) },
              { label: "price", value: fmtPrice(hover.raw?.c?.price) },
              { label: "vol vs 7d ago", value: fmtMultiple(hover.raw?.volX) },
            ]
          : []
      }
      note={hover?.called ? "LuxQuant call \u00b7 tap to open" : "tap to open"}
    />
    </div>
  );
}

function buildModel(rows, G) {
  const { W, H, pad: PAD } = G;
  const pts = rows
    .filter((r) => num(r.c.flow_intensity) != null && num(r.c.price_change_24h) != null)
    .map((r) => ({
      id: r.c.coin_id || r.c.symbol,
      name: r.c.symbol,
      x: num(r.c.price_change_24h),
      y: num(r.c.flow_intensity),
      vol: num(r.c.volume_24h) || 0,
      called: r.called,
      raw: r,
    }));
  if (pts.length < 3) return null;

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const xLo = Math.min(...xs, 0);
  const xHi = Math.max(...xs, 0);
  const yHi = Math.max(...ys);
  const maxVol = Math.max(...pts.map((p) => p.vol), 1);

  const px = projector({
    lo: xLo, hi: xHi, from: PAD.l, to: W - PAD.r, inset: 12, transform: sq,
  });
  const pyRaw = projector({
    lo: 0, hi: yHi, from: PAD.t, to: H - PAD.b, inset: 10, transform: Math.sqrt,
  });
  // The y projector runs top-down in SVG space, so flip it.
  const py = (v) => H - PAD.b - (pyRaw(v) - PAD.t);

  const placed = pts.map((p) => ({
    ...p,
    cx: px(p.x),
    cy: py(p.y),
    // sqrt so AREA tracks the dollars, with a floor that stays tappable.
    r: G.r0 + Math.sqrt(p.vol / maxVol) * G.r1,
  }));

  // Who gets a name. The corners of the story come first — the biggest mover
  // each way, the busiest, the largest by dollars traded — then everything else
  // in order of how much money is behind it, and a coin we called outranks one
  // we did not. placeLabels keeps whatever fits; the rest have the hover card.
  const maxX = Math.max(...placed.map((p) => Math.abs(p.x)), 1);
  const corners = new Set(
    [
      [...placed].sort((a, b) => b.x - a.x)[0],
      [...placed].sort((a, b) => a.x - b.x)[0],
      [...placed].sort((a, b) => b.y - a.y)[0],
      [...placed].sort((a, b) => b.vol - a.vol)[0],
    ]
      .filter(Boolean)
      .map((p) => p.id)
  );
  const labels = placeLabels(
    placed.map((p) => ({
      ...p,
      priority:
        (corners.has(p.id) ? 100 : 0) +
        Math.sqrt(p.vol / maxVol) * 10 +
        (Math.abs(p.x) / maxX) * 4 +
        (p.called ? 1.5 : 0),
    })),
    { W, H, fs: G.fs, max: G.maxLabels, maxChars: 10 }
  );

  const busy = placed.filter((p) => p.y >= 0.3);
  // The four states the plot exists to separate, counted — and how many of each
  // are ours, which is the question the gold is there to answer.
  const quad = (label, key, fn) => {
    const set = placed.filter(fn);
    return { key, label, count: set.length, ours: set.filter((p) => p.called).length };
  };
  const quadrants = [
    quad("Busy and bid", "bb", (p) => p.y >= 0.3 && p.x >= 0),
    quad("Busy and sold", "bs", (p) => p.y >= 0.3 && p.x < 0),
    quad("Quiet and rising", "qr", (p) => p.y < 0.3 && p.x >= 0),
    quad("Quiet and drifting", "qd", (p) => p.y < 0.3 && p.x < 0),
  ];
  return {
    quadrants,
    points: placed,
    labels,
    px,
    py,
    busyY: yHi >= 0.3 ? py(0.3) : null,
    xTicks: pickTicks(X_TICKS, xLo, xHi, px, G.fs * 3.4, 0),
    yTicks: pickTicks(Y_TICKS, 0, yHi, py, G.fs * 1.9),
    busy: busy.length,
    busyUp: busy.filter((p) => p.x >= 0).length,
    calledCount: placed.filter((p) => p.called).length,
  };
}

export function CoinScatterHeadline({ model }) {
  if (!model?.busy) return null;
  return (
    <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-text-muted">
      {model.busyUp} of {model.busy} busy coins up today
    </span>
  );
}

/** The expanded plot, for the modal. One geometry, all the room it needs. */
export function CoinScatterLarge({ rows = [], onOpen }) {
  const model = useMemo(() => buildModel(rows, LARGE), [rows]);
  if (!model) return null;
  return (
    <div className="min-w-0">
      {/* The modal locks the page behind it, so there is no scroll to steal:
          the plain wheel zooms here and only asks for a modifier inline. */}
      <Plot model={model} G={LARGE} onOpen={onOpen} wheel="direct" />
      <p className="mt-1">
        <ZoomHint wheel="direct" />
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {model.quadrants.map((q) => (
          <div key={q.key} className="rounded-lg bg-ink/[0.03] px-3 py-2">
            <p className="text-[11.5px] font-medium leading-snug text-text-primary">{q.label}</p>
            <p className="mt-0.5 font-mono text-[15px] tabular-nums text-text-primary">
              {q.count}
              <span className="ml-1.5 text-[10.5px] text-text-muted">coins</span>
            </p>
            <p className="text-[10.5px] text-text-muted">
              <span className="font-mono tabular-nums text-accent">{q.ours}</span> of them ours
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CoinScatter({ rows = [], onOpen, onExpand }) {
  const desk = useMemo(() => buildModel(rows, DESK), [rows]);
  const phone = useMemo(() => buildModel(rows, PHONE), [rows]);
  if (!desk || !phone) return null;

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[12.5px] font-medium text-text-primary">
          Is the busy money buying or selling?
        </span>
        <CoinScatterHeadline model={desk} />
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
          <InfoTip side="bottom" title="Churn against direction" text={EXPLAIN} />
        </span>
      </div>

      <div className="sm:hidden">
        <Plot model={phone} G={PHONE} onOpen={onOpen} />
      </div>
      <div className="hidden sm:block">
        <Plot model={desk} G={DESK} onOpen={onOpen} />
      </div>

      <p className="mt-1 text-[11px] leading-snug text-text-muted">
        Up is a coin that traded more of itself today, right is a coin that rose. Dot size is the
        dollars traded and gold is a coin we have called — {desk.calledCount} of{" "}
        {desk.points.length} here. Turnover has no direction on its own; this is the chart that
        gives it one. Hover any dot for its figures; tap to open the coin.
      </p>
      <p className="mt-1">
        <ZoomHint wheel="modifier" />
      </p>
    </div>
  );
}
