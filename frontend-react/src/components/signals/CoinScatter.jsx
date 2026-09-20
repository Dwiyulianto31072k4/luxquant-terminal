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

import { useMemo } from "react";
import { InfoTip } from "../GuideInfo";
import { num } from "./flowMetrics";
import { pickTicks, projector, sq } from "./scatterKit";

const DESK = {
  W: 640, H: 330, pad: { t: 16, r: 22, b: 34, l: 44 },
  fs: 9.5, r0: 3, r1: 11,
};
const PHONE = {
  W: 360, H: 300, pad: { t: 14, r: 16, b: 38, l: 34 },
  fs: 10, r0: 2.5, r1: 8,
};

const X_TICKS = [-50, -20, -10, -5, 0, 5, 10, 20, 50, 100];
const Y_TICKS = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1];

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

function Plot({ model, G, onOpen }) {
  const { W, H, pad: PAD, fs } = G;
  const zeroX = model.px(0);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full touch-manipulation"
      role="img"
      aria-label="Each coin's 24 hour move against how much of it changed hands today"
    >
      <line
        x1={zeroX}
        x2={zeroX}
        y1={PAD.t}
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
            y1={model.busyY}
            y2={model.busyY}
            stroke="rgb(var(--accent) / 0.35)"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
          <text
            x={W - PAD.r}
            y={model.busyY - 4}
            textAnchor="end"
            className="fill-text-muted"
            style={{ fontSize: fs - 0.5, fontFamily: "monospace", letterSpacing: "0.08em" }}
          >
            BUSY LINE · 30%
          </text>
        </>
      ) : null}

      {model.xTicks.map((t) => (
        <g key={`x${t}`}>
          <line
            x1={model.px(t)}
            x2={model.px(t)}
            y1={H - PAD.b}
            y2={H - PAD.b + 3}
            stroke="rgb(var(--ink) / 0.25)"
          />
          <text
            x={model.px(t)}
            y={H - PAD.b + 13}
            textAnchor="middle"
            className="fill-text-muted"
            style={{ fontSize: fs - 0.5, fontFamily: "monospace" }}
          >
            {t > 0 ? `+${t}` : t}
          </text>
        </g>
      ))}
      {model.yTicks.map((t) => (
        <text
          key={`y${t}`}
          x={PAD.l - 6}
          y={model.py(t) + 3}
          textAnchor="end"
          className="fill-text-muted"
          style={{ fontSize: fs - 0.5, fontFamily: "monospace" }}
        >
          {t.toFixed(2).replace(/0$/, "")}
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

      {model.points.map((p) => (
        <g key={p.id} className="cursor-pointer" onClick={() => onOpen?.(p.raw)}>
          <circle
            cx={p.cx}
            cy={p.cy}
            r={p.r}
            fill={
              p.called
                ? "rgb(var(--accent) / 0.4)"
                : p.x >= 0
                  ? "rgb(var(--pos) / 0.26)"
                  : "rgb(var(--neg) / 0.26)"
            }
            stroke={
              p.called
                ? "rgb(var(--accent))"
                : p.x >= 0
                  ? "rgb(var(--pos) / 0.75)"
                  : "rgb(var(--neg) / 0.75)"
            }
            strokeWidth={p.called ? 1.6 : 1}
          />
          {model.named.has(p.id) ? (
            <text
              /* Clamped into the frame: a name centred on a dot at the right
                 edge runs off the viewBox and gets cut mid-word. */
              x={Math.min(W - PAD.r, Math.max(PAD.l, p.cx))}
              y={p.cy - p.r - 3.5}
              textAnchor={p.cx > W * 0.7 ? "end" : p.cx < W * 0.16 ? "start" : "middle"}
              className="pointer-events-none fill-text-primary"
              style={{ fontSize: fs, fontWeight: 600 }}
            >
              {p.name}
            </text>
          ) : null}
          <title>{`${p.name}\n${p.x >= 0 ? "+" : "−"}${Math.abs(p.x).toFixed(
            2
          )}% today · turnover ${p.y.toFixed(2)}${p.called ? " · LuxQuant call" : ""}`}</title>
        </g>
      ))}
    </svg>
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

  // Label the corners of the story, not the market: the biggest mover each
  // way, the busiest, and the two largest by dollars traded.
  const byX = [...placed].sort((a, b) => b.x - a.x);
  const byY = [...placed].sort((a, b) => b.y - a.y);
  const byVol = [...placed].sort((a, b) => b.vol - a.vol);
  const named = new Set(
    [byX[0], byX.at(-1), byY[0], byY[1], byVol[0], byVol[1]].filter(Boolean).map((p) => p.id)
  );

  const busy = placed.filter((p) => p.y >= 0.3);
  return {
    points: placed,
    named,
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

export default function CoinScatter({ rows = [], onOpen }) {
  const desk = useMemo(() => buildModel(rows, DESK), [rows]);
  const phone = useMemo(() => buildModel(rows, PHONE), [rows]);
  if (!desk || !phone) return null;

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[12.5px] font-medium text-text-primary">
          Is the busy money buying or selling?
        </span>
        {desk.busy ? (
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-text-muted">
            {desk.busyUp} of {desk.busy} busy coins up today
          </span>
        ) : null}
        <span className="ml-auto">
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
        gives it one. Tap a dot to open the coin.
      </p>
    </div>
  );
}
