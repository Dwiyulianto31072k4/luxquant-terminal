// Row primitives shared by the two tables on Home: Crypto Market Data
// (GateMarketTable) and LuxQuant Calls (TopPerformers).
//
// They were written for the market table first. The calls leaderboard used to
// draw its own filled-area sparkline and no range at all, so two tables sitting
// on the same page disagreed about what a price path looks like. One copy now,
// imported by both.
import { useMemo } from "react";

export const fmtPrice = (n) => {
  if (n == null) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.01) return n.toFixed(5);
  return n.toPrecision(4);
};

/** A price path. Flat/short series degrade to a centre line rather than NaN. */
export const RowSpark = ({ points, up, w = 88, h = 26 }) => {
  const path = useMemo(() => {
    if (!Array.isArray(points) || points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min;
    const stepX = w / (points.length - 1);
    return points
      .map((p, i) => {
        const y = span === 0 ? h / 2 : h - ((p - min) / span) * (h - 2) - 1;
        return `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [points, w, h]);

  if (!path) {
    return <div style={{ width: w, height: h }} aria-hidden="true" />;
  }
  const stroke = up ? "rgb(var(--pos))" : "rgb(var(--neg))";
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="overflow-visible"
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};

/**
 * Where a price sits between a low and a high.
 *
 * The market table passes the 24h low/high and the last price ("position"):
 * the dot says where price sits inside the range. The calls leaderboard passes
 * a call's entry and its peak and asks for "span": the same two labels, but the
 * line is the distance travelled, so it is drawn solid with a cap at each end
 * and carries no marker.
 *
 * In "position", a missing last price draws the range without a dot rather than
 * hiding the range: the two ends are known even when the live price is not.
 */
export const RangeDumbbell = ({ low, high, last, width = 150, markerTitle, variant = "position" }) => {
  if (low == null || high == null || high <= low) {
    return <span className="text-[11px] text-text-muted">—</span>;
  }
  const pct =
    last == null ? null : Math.min(100, Math.max(0, ((last - low) / (high - low)) * 100));
  return (
    <div style={{ width }}>
      <div className="relative h-[10px]">
        {/* "span" draws the distance travelled (entry to peak) rather than a
            position inside a range: solid line, a cap at each end, no marker.
            A dashed line with nothing on it reads as a missing value. */}
        <div
          className={`absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t ${
            variant === "span" ? "border-solid border-ink/20" : "border-dashed border-ink/25"
          }`}
        />
        {variant === "span" && (
          <>
            <span className="absolute left-0 top-1/2 h-[7px] w-[2px] -translate-y-1/2 rounded-[1px] bg-ink/30" />
            <span className="absolute right-0 top-1/2 h-[7px] w-[2px] -translate-y-1/2 rounded-[1px] bg-positive" />
          </>
        )}
        {variant !== "span" && pct !== null && (
          <div
            className="absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink/40 bg-surface-raised"
            style={{ left: `${pct}%` }}
            title={markerTitle || `${pct.toFixed(0)}% of the range`}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-text-muted">
        <span>{fmtPrice(low)}</span>
        <span>{fmtPrice(high)}</span>
      </div>
    </div>
  );
};
