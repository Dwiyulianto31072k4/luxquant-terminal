// ScreenMap — the filtered calls on two axes you choose.
//
// Same machinery as the flow scatters: pan, zoom about the pointer, labels
// placed where they fit and re-placed when the gesture settles, coin marks that
// gain their logo as they grow. What differs is the subject — these are the
// desk's own live calls, and the default axes are the two numbers that decide
// whether a published trade is still on offer: how far past the entry the price
// is, and how much is left to the target from here.
//
// The quadrants are not decoration. Zero on each axis is a real line: right of
// the vertical is "the price has run past the call", below the horizontal is
// "the target is already behind the price". Bottom right is the corner to
// leave alone.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CoinDisc from "../CoinDisc";
import ScatterTip from "../ScatterTip";
import MissingTray from "../MissingTray";
import { cull, pickTicks, placeLabels, projector, sq } from "../scatterKit";
import useZoomPan from "../useZoomPan";
import usePhone from "../usePhone";
import useControlsReserve from "../useControlsReserve";
import ZoomControls, { ZoomHint } from "../ZoomControls";
import {
  CHASE_LINE,
  METRICS,
  domainFor,
  fmt,
  formatMetric,
  goodCorner,
  missingReason,
  scaleFor,
} from "./screenMetrics";

// Two geometries, chosen by how much there is to draw. A day with eight calls
// in a 1180x560 canvas is nine tenths white space with five marks adrift in it —
// which is exactly what "still abstract" looks like. Fewer points get a shorter
// frame, bigger marks, and their values printed under the name, so the chart
// reads as a labelled comparison rather than a sparse cloud.
const BIG = { W: 1180, H: 560, pad: { t: 18, r: 28, b: 44, l: 72 }, fs: 11, r0: 7, r1: 15, maxLabels: 70 };
const FEW = { W: 1180, H: 400, pad: { t: 18, r: 28, b: 44, l: 72 }, fs: 12.5, r0: 13, r1: 16, maxLabels: 40 };
const FEW_MAX = 12;
// A phone draws in its own units. The 1180-wide canvas above, fitted to a
// 358px sheet, printed every name at 3.5px and every mark at a third of its
// size — a smear of dots nobody could read or hit. These are close to the
// sheet's real width, and portrait, because a phone has height to spare and
// no width at all.
const PHONE_BIG = { W: 360, H: 440, pad: { t: 14, r: 12, b: 36, l: 40 }, fs: 10, r0: 4.5, r1: 9.5, maxLabels: 16, phone: true };
const PHONE_FEW = { W: 360, H: 380, pad: { t: 14, r: 12, b: 36, l: 40 }, fs: 11, r0: 10, r1: 12, maxLabels: 12, phone: true };

const TICKS = [
  -1e6, -1e5, -1e4, -1000, -500, -200, -100, -50, -30, -20, -15, -10, -8, -6, -5, -4, -3, -2, -1,
  -0.5, 0, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 50, 100, 200, 500, 1000, 1e4, 1e5, 1e6, 1e7,
  1e8, 1e9, 1e10,
];

const tickText = (m, v) => {
  if (m.unit === "$") return fmt.usd(v).replace("$", "");
  if (m.unit === "%") return v > 0 ? `+${v}` : String(v);
  if (m.unit === "h") return `${v}`;
  return String(v);
};

export default function ScreenMap({ rows, xKey, yKey, sizeKey = "vol24", onOpen }) {
  const mx = METRICS[xKey];
  const my = METRICS[yKey];
  const [hover, setHover] = useState(null);
  const stateRef = useRef(null);
  const [labels, setLabels] = useState(new Map());

  const resettle = useCallback(() => {
    const st = stateRef.current;
    if (st) setLabels(st.place());
  }, []);

  const plottable = useMemo(
    () => rows.filter((r) => r[xKey] != null && r[yKey] != null),
    [rows, xKey, yKey]
  );
  // Never silently dropped. The header says "8 of 8 calls" and the plot drew
  // five; the three that cannot be placed are named under the chart with the
  // reason, because "no stop published" is something a reader can act on and a
  // missing dot is not.
  const unplottable = useMemo(
    () =>
      rows
        .filter((r) => r[xKey] == null || r[yKey] == null)
        .map((r) => ({
          ...r,
          why: missingReason(r, r[xKey] == null ? xKey : yKey),
        })),
    [rows, xKey, yKey]
  );

  const phone = usePhone();
  const fewPoints = plottable.length <= FEW_MAX;
  const G = fewPoints ? (phone ? PHONE_FEW : FEW) : phone ? PHONE_BIG : BIG;
  const few = fewPoints;

  const zp = useZoomPan({ W: G.W, H: G.H, wheel: "direct", onSettle: resettle });
  const [controlsRef, ctl] = useControlsReserve(zp.hostRef, G.W, 0);
  const { t, project, mark } = zp;
  const fz = G.fs * zp.label;

  const model = useMemo(() => {
    const pts = plottable.map((r) => ({ ...r, name: r.pair, x: r[xKey], y: r[yKey] }));
    if (!pts.length) return null;

    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    // Scale and window per axis, from the data. A square root is right for a
    // heavy tail and wrong for anything else — on reward-for-risk, which runs
    // about -0.5 to 2, it bunched every tick into the bottom eighth of the
    // axis. And zero is only forced into the window when zero means something
    // on that metric.
    const xScale = scaleFor(xs);
    const yScale = scaleFor(ys);
    const xd = domainFor(xs, { zero: mx.zero });
    const yd = domainFor(ys, { zero: my.zero });
    const px = projector({
      lo: xd.lo, hi: xd.hi, from: G.pad.l, to: G.W - G.pad.r, inset: 18,
      transform: xScale === "sqrt" ? sq : (v) => v,
    });
    const pyRaw = projector({
      lo: yd.lo, hi: yd.hi, from: G.pad.t, to: G.H - G.pad.b, inset: 16,
      transform: yScale === "sqrt" ? sq : (v) => v,
    });
    const py = (v) => G.H - G.pad.b - (pyRaw(v) - G.pad.t);

    const sizes = pts.map((p) => Math.abs(p[sizeKey] ?? 0));
    const maxSize = Math.max(...sizes, 1);
    const placed = pts.map((p) => {
      const size = Math.sqrt(Math.abs(p[sizeKey] ?? 0) / maxSize);
      return {
        ...p,
        cx: px(p.x),
        cy: py(p.y),
        r: G.r0 + size * G.r1,
        // Who gets a name when not everyone can: a call still at the plan,
        // then a Top Runner, then the biggest mark. In data order the names
        // went to whichever calls happened to be first in the list.
        priority: (p.atPlan ? 10 : 0) + (p.isTop ? 5 : 0) + size * 3,
      };
    });
    return { points: placed, px, py, xs, ys, xScale, yScale, xd, yd };
  }, [plottable, xKey, yKey, sizeKey, mx, my, G]);

  const points = useMemo(() => {
    if (!model) return [];
    return model.points.map((p) => {
      const q = project(p.cx, p.cy);
      return { ...p, cx: q.x, cy: q.y, r: p.r * mark };
    });
  }, [model, project, mark]);

  const visible = useMemo(() => cull(points, G.W, G.H), [points, G]);

  stateRef.current = {
    place: () =>
      placeLabels(cull(points, G.W, G.H, 0), {
        W: G.W, H: G.H, fs: fz, max: zp.zoomed ? 999 : G.maxLabels, maxChars: 9,
        blocked: ctl.w ? [[G.W - ctl.w, 0, ctl.w, ctl.h]] : [],
      }),
  };

  // Re-place when the DATA or the axes change. Never on `t`: that fires on
  // every frame of a pan, and the placer walks every point against every label
  // already down — which is exactly the stutter that reads as "the names are
  // not keeping up". During a gesture each label rides its own dot by the
  // offset it was placed at, and useZoomPan re-places once the gesture stops.
  useEffect(() => {
    if (stateRef.current) setLabels(stateRef.current.place());
  }, [model, xKey, yKey, sizeKey, ctl.w, ctl.h]);

  const corner = useMemo(() => goodCorner(mx, my), [mx, my]);

  const xTicks = useMemo(() => {
    if (!model) return [];
    const inFrame = TICKS.filter((v) => {
      const x = project(model.px(v), 0).x;
      return x >= G.pad.l - 1 && x <= G.W - G.pad.r + 1;
    });
    return pickTicks(inFrame, -Infinity, Infinity, (v) => project(model.px(v), 0).x, fz * 3.6, 0);
  }, [model, project, fz, G]);

  const yTicks = useMemo(() => {
    if (!model) return [];
    // A tick that slides under the axis name prints the two on top of each
    // other. The name is fixed, so the tick gives way.
    const nameY = G.pad.t + 2;
    const inFrame = TICKS.filter((v) => {
      const y = project(0, model.py(v)).y;
      return y >= 6 && y <= G.H - G.pad.b - 2 && Math.abs(y - nameY) > fz * 1.2;
    });
    return pickTicks(inFrame, -Infinity, Infinity, (v) => project(0, model.py(v)).y, fz * 2, 0);
  }, [model, project, fz, G]);

  if (!model) {
    return (
      <p className="py-14 text-center text-[12.5px] text-text-muted">
        Nothing in this set carries both {mx.label.toLowerCase()} and {my.label.toLowerCase()} — a
        call needs a live price and a target before it can be placed.
      </p>
    );
  }

  const zeroX = project(model.px(0), 0).x;
  const zeroY = project(0, model.py(0)).y;
  // The band starts at each metric's own "good enough" mark where it has one,
  // and at the midpoint of the window otherwise.
  const cornerX = project(model.px(mx.good ?? (model.xd.lo + model.xd.hi) / 2), 0).x;
  const cornerY = project(0, model.py(my.good ?? (model.yd.lo + model.yd.hi) / 2)).y;
  const chaseX = xKey === "distEntry" ? project(model.px(CHASE_LINE), 0).x : null;
  const clip = "screen-map-clip";
  const cornerName =
    corner.x === "max" && corner.y === "max"
      ? { x: G.W - G.pad.r - 6, y: Math.max(15, cornerY - 6), anchor: "end" }
      : {
          x: corner.x === "max" ? G.W - G.pad.r - 6 : G.pad.l + 6,
          y: corner.y === "max" ? 15 : G.H - G.pad.b - 6,
          anchor: corner.x === "max" ? "end" : "start",
        };
  // On a phone the +5% line sits a hundred-odd units from the left edge, right
  // where the corner's own name is printed, so its label goes to the other end
  // of the line — and says only the number; the sentence is under the chart.
  const chaseLabelY = G.phone && corner.y === "max" ? G.H - G.pad.b - 6 : 14;

  return (
    <div className="relative">
      <svg
        ref={zp.hostRef}
        viewBox={`0 0 ${G.W} ${G.H}`}
        className={`h-auto w-full select-none ${zp.panning ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ touchAction: zp.touchAction }}
        role="img"
        tabIndex={0}
        aria-label={`Each call's ${mx.label} against its ${my.label}. Drag to pan, plus and minus to zoom, zero to reset.`}
        {...zp.handlers}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={G.pad.l} y={0} width={G.W - G.pad.l - 2} height={G.H - G.pad.b} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clip})`}>
          {/* The corner worth looking at, shaded and named. Without it the plot
              shows where things ARE and never says where to look — which is
              the difference between a chart and a decoration. */}
          <rect
            x={corner.x === "max" ? cornerX : G.pad.l}
            y={corner.y === "max" ? 0 : cornerY}
            width={corner.x === "max" ? Math.max(0, G.W - G.pad.r - cornerX) : Math.max(0, cornerX - G.pad.l)}
            height={corner.y === "max" ? Math.max(0, cornerY) : Math.max(0, G.H - G.pad.b - cornerY)}
            fill="rgb(var(--pos) / 0.05)"
          />
          <text
            x={cornerName.x}
            y={cornerName.y}
            textAnchor={cornerName.anchor}
            className="fill-profit"
            style={{ fontSize: fz - 1, fontFamily: "monospace", letterSpacing: "0.08em", opacity: 0.75 }}
          >
            {corner.label.toUpperCase()}
          </text>
          <line x1={zeroX} x2={zeroX} y1={0} y2={G.H - G.pad.b} stroke="rgb(var(--ink) / 0.2)" strokeDasharray="3 3" />
          <line x1={G.pad.l} x2={G.W - G.pad.r} y1={zeroY} y2={zeroY} stroke="rgb(var(--ink) / 0.2)" strokeDasharray="3 3" />
          {/* The measured line: past here the published trade is usually gone. */}
          {chaseX != null ? (
            <>
              <line
                x1={chaseX} x2={chaseX} y1={0} y2={G.H - G.pad.b}
                stroke="rgb(var(--neg) / 0.4)" strokeDasharray="5 3"
              />
              <text
                x={chaseX + 5} y={chaseLabelY}
                className="fill-text-muted"
                style={{ fontSize: fz - 1, fontFamily: "monospace", letterSpacing: "0.08em" }}
              >
                {G.phone ? `+${CHASE_LINE}%` : `+${CHASE_LINE}% · TP3 BEHIND 35% OF CALLS`}
              </text>
            </>
          ) : null}
        </g>

        {xTicks.map((v) => {
          const x = project(model.px(v), 0).x;
          return (
            <g key={`x${v}`}>
              <line x1={x} x2={x} y1={G.H - G.pad.b} y2={G.H - G.pad.b + 3} stroke="rgb(var(--ink) / 0.25)" />
              <text x={x} y={G.H - G.pad.b + 14} textAnchor="middle" className="fill-text-muted"
                style={{ fontSize: fz - 1, fontFamily: "monospace" }}>
                {tickText(mx, v)}
              </text>
            </g>
          );
        })}
        {yTicks.map((v) => (
          <text key={`y${v}`} x={G.pad.l - 7} y={project(0, model.py(v)).y + 3} textAnchor="end"
            className="fill-text-muted" style={{ fontSize: fz - 1, fontFamily: "monospace" }}>
            {tickText(my, v)}
          </text>
        ))}
        <text x={G.W - G.pad.r} y={G.H - 4} textAnchor="end" className="fill-text-muted"
          style={{ fontSize: fz - 1, fontFamily: "monospace", letterSpacing: "0.1em" }}>
          {mx.axis}
          {model.xScale === "sqrt" ? " · √ SCALE" : ""}
        </text>
        <text x={G.pad.l - 7} y={G.pad.t + 2} textAnchor="end" className="fill-text-muted"
          style={{ fontSize: fz - 1, fontFamily: "monospace" }}>
          {my.unit === "$" ? "$" : my.unit || ""}
        </text>

        <g clipPath={`url(#${clip})`}>
          {visible.map((p) => {
            const on = hover?.id === p.id;
            const good = p.atPlan;
            const dead = p.roomTp3 != null && p.roomTp3 <= 0;
            return (
              <g
                key={p.id}
                className="cursor-pointer"
                onClick={() => {
                  if (zp.swallowClick()) return;
                  onOpen?.(p.signal);
                }}
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover((h) => (h?.id === p.id ? null : h))}
              >
                <circle cx={p.cx} cy={p.cy} r={Math.max(p.r + 4, 10)} fill="transparent" />
                <CoinDisc
                  symbol={p.pair}
                  cx={p.cx}
                  cy={p.cy}
                  r={p.r}
                  minLogo={7}
                  fill={
                    dead
                      ? "rgb(var(--ink) / 0.10)"
                      : good
                        ? "rgb(var(--pos) / 0.30)"
                        : "rgb(var(--accent) / 0.22)"
                  }
                  ring={
                    on
                      ? "rgb(var(--fg))"
                      : p.isTop
                        ? "rgb(var(--accent))"
                        : dead
                          ? "rgb(var(--ink) / 0.35)"
                          : good
                            ? "rgb(var(--pos))"
                            : "rgb(var(--accent) / 0.7)"
                  }
                  ringWidth={on ? 2.6 : p.isTop ? 2.2 : 1.3}
                />
              </g>
            );
          })}

          {/* Names and their values are a layer of their own, drawn after
              every mark: inside each mark's group the next disc painted over
              the previous name. */}
          {visible.map((p) => {
            const label = labels.get(p.id);
            if (!label) return null;
            const x = Math.min(G.W - G.pad.r, Math.max(G.pad.l, p.cx + label.dx));
            return (
              <g key={`label-${p.id}`} className="pointer-events-none">
                <text
                  x={x}
                  y={p.cy + label.dy}
                  textAnchor={label.anchor}
                  className="fill-text-primary"
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
                {/* With a dozen marks or fewer the plot has room to say what
                    each one IS, so a reader never has to trace a dot back to
                    two axes to read it. */}
                {few ? (
                  <text
                    x={x}
                    y={p.cy + label.dy + fz + 1}
                    textAnchor={label.anchor}
                    className="fill-text-muted"
                    style={{
                      fontSize: fz - 2,
                      fontFamily: "monospace",
                      paintOrder: "stroke",
                      stroke: "rgb(var(--surface-raised))",
                      strokeWidth: 3,
                      strokeLinejoin: "round",
                    }}
                  >
                    {formatMetric(xKey, p.x)} · {formatMetric(yKey, p.y)}
                  </text>
                ) : null}
              </g>
            );
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
        W={G.W}
        H={G.H}
        title={hover ? `${hover.pair}${hover.isTop ? " ★" : ""}` : null}
        rows={
          hover
            ? [
                { label: "past the call", value: fmt.pct(hover.distEntry), tone: hover.distEntry != null && hover.distEntry > CHASE_LINE ? "text-loss" : "text-text-primary" },
                { label: "room to target", value: fmt.pct(hover.roomTp3), tone: hover.roomTp3 != null && hover.roomTp3 > 0 ? "text-profit" : "text-loss" },
                { label: "reward ÷ risk", value: fmt.mult(hover.rr) },
                { label: "24h volume", value: fmt.usd(hover.vol24) },
                { label: "called", value: fmt.hours(hover.ageH) },
                ...(xKey !== "distEntry" && xKey !== "roomTp3"
                  ? [{ label: mx.label.toLowerCase(), value: formatMetric(xKey, hover.x) }]
                  : []),
                ...(yKey !== "distEntry" && yKey !== "roomTp3"
                  ? [{ label: my.label.toLowerCase(), value: formatMetric(yKey, hover.y) }]
                  : []),
              ]
            : []
        }
        note={hover?.atPlan ? "still at the plan · tap to open" : "tap to open"}
      />

      <MissingTray
        items={unplottable}
        onOpen={onOpen}
        payloadOf={(r) => r.signal}
        nameOf={(r) => r.pair}
      />

      <p className="mt-1.5 text-[11px] leading-snug text-text-muted">
        Dot size is {METRICS[sizeKey].label.toLowerCase()}; a gold ring is a Top Runner; a grey dot
        has already passed its target. The shaded corner is{" "}
        {corner.label}.
        {chaseX != null && G.phone
          ? ` The red dashed line is +${CHASE_LINE}%: past it, TP3 is already behind for 35% of calls.`
          : ""}{" "}
        <ZoomHint wheel="direct" />
      </p>
    </div>
  );
}
