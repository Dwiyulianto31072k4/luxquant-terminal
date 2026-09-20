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
import { cull, pickTicks, placeLabels, projector, sq } from "../scatterKit";
import useZoomPan from "../useZoomPan";
import ZoomControls, { ZoomHint } from "../ZoomControls";
import { CHASE_LINE, METRICS, fmt, formatMetric } from "./screenMetrics";

const G = {
  W: 1180,
  H: 560,
  pad: { t: 18, r: 28, b: 42, l: 68 },
  fs: 11,
  r0: 7,
  r1: 15,
  maxLabels: 70,
};

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

  const zp = useZoomPan({ W: G.W, H: G.H, wheel: "direct", onSettle: resettle });
  const { t, project, mark } = zp;
  const fz = G.fs * zp.label;

  const model = useMemo(() => {
    const pts = rows
      .filter((r) => r[xKey] != null && r[yKey] != null)
      // `name` is what placeLabels labels with — the kit is shared, and a row
      // that calls its label something else gets no label and a crash.
      .map((r) => ({ ...r, name: r.pair, x: r[xKey], y: r[yKey] }));
    if (!pts.length) return null;

    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    // Both transforms are signed square roots for the same reason the flow
    // scatters use one: a handful of calls sit a very long way from the pack,
    // and on a linear axis everything else collapses into a line. Ticks carry
    // their real values.
    const px = projector({
      lo: Math.min(...xs, 0), hi: Math.max(...xs, 0),
      from: G.pad.l, to: G.W - G.pad.r, inset: 16, transform: sq,
    });
    const pyRaw = projector({
      lo: Math.min(...ys, 0), hi: Math.max(...ys, 0),
      from: G.pad.t, to: G.H - G.pad.b, inset: 14, transform: sq,
    });
    const py = (v) => G.H - G.pad.b - (pyRaw(v) - G.pad.t);

    const sizes = pts.map((p) => Math.abs(p[sizeKey] ?? 0));
    const maxSize = Math.max(...sizes, 1);
    const placed = pts.map((p) => ({
      ...p,
      cx: px(p.x),
      cy: py(p.y),
      r: G.r0 + Math.sqrt(Math.abs(p[sizeKey] ?? 0) / maxSize) * G.r1,
    }));
    return { points: placed, px, py, xs, ys };
  }, [rows, xKey, yKey, sizeKey]);

  const points = useMemo(() => {
    if (!model) return [];
    return model.points.map((p) => {
      const q = project(p.cx, p.cy);
      return { ...p, cx: q.x, cy: q.y, r: p.r * mark };
    });
  }, [model, project, mark]);

  const visible = useMemo(() => cull(points, G.W, G.H), [points]);

  stateRef.current = {
    place: () =>
      placeLabels(cull(points, G.W, G.H, 0), {
        W: G.W, H: G.H, fs: fz, max: zp.zoomed ? 999 : G.maxLabels, maxChars: 9,
      }),
  };

  // Re-place when the DATA or the axes change. Never on `t`: that fires on
  // every frame of a pan, and the placer walks every point against every label
  // already down — which is exactly the stutter that reads as "the names are
  // not keeping up". During a gesture each label rides its own dot by the
  // offset it was placed at, and useZoomPan re-places once the gesture stops.
  useEffect(() => {
    if (stateRef.current) setLabels(stateRef.current.place());
  }, [model, xKey, yKey, sizeKey]);

  const xTicks = useMemo(() => {
    if (!model) return [];
    const inFrame = TICKS.filter((v) => {
      const x = project(model.px(v), 0).x;
      return x >= G.pad.l - 1 && x <= G.W - G.pad.r + 1;
    });
    return pickTicks(inFrame, -Infinity, Infinity, (v) => project(model.px(v), 0).x, fz * 3.6, 0);
  }, [model, project, fz]);

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
  }, [model, project, fz]);

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
  const chaseX = xKey === "distEntry" ? project(model.px(CHASE_LINE), 0).x : null;
  const clip = "screen-map-clip";

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
                x={chaseX + 5} y={14}
                className="fill-text-muted"
                style={{ fontSize: fz - 1, fontFamily: "monospace", letterSpacing: "0.08em" }}
              >
                +{CHASE_LINE}% · TP3 BEHIND 35% OF CALLS
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
          {mx.axis} · √ SCALE
        </text>
        <text x={G.pad.l - 7} y={G.pad.t + 2} textAnchor="end" className="fill-text-muted"
          style={{ fontSize: fz - 1, fontFamily: "monospace" }}>
          {my.unit === "$" ? "$" : my.unit || ""}
        </text>

        <g clipPath={`url(#${clip})`}>
          {visible.map((p) => {
            const label = labels.get(p.id);
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
                {label ? (
                  <text
                    x={Math.min(G.W - G.pad.r, Math.max(G.pad.l, p.cx + label.dx))}
                    y={p.cy + label.dy}
                    textAnchor={label.anchor}
                    className="pointer-events-none fill-text-primary"
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

      <span className="absolute right-1.5 top-1.5">
        <ZoomControls zoomed={zp.zoomed} zoomBy={zp.zoomBy} reset={zp.reset} k={t.k} />
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

      <p className="mt-1.5 text-[11px] leading-snug text-text-muted">
        Dot size is {METRICS[sizeKey].label.toLowerCase()}; a gold ring is a Top Runner; a grey dot
        has already passed its target. <ZoomHint wheel="direct" />
      </p>
    </div>
  );
}
