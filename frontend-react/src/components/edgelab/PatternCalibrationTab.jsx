// src/components/edgelab/PatternCalibrationTab.jsx
import { useState, useMemo } from "react";

// Color palette consistent with DailyPerformancePage
const TIER_COLORS = {
  reliable: "#10b981",
  moderate: "#f59e0b",
  unreliable: "#ef4444",
};

const TIER_LABELS = {
  reliable: "Reliable",
  moderate: "Moderate",
  unreliable: "Unreliable",
};

const TIER_DESC = {
  reliable: "n ≥ 30, CI ≤ 5pp — robust evidence",
  moderate: "n ≥ 10, CI ≤ 12pp — directional signal",
  unreliable: "small sample or wide CI",
};

const ReliabilityBadge = ({ tier }) => {
  const color = TIER_COLORS[tier];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border text-[9px] font-mono uppercase tracking-wider"
      style={{
        background: `${color}1a`,
        borderColor: `${color}55`,
        color: color,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {TIER_LABELS[tier]}
    </span>
  );
};

/**
 * Renders a horizontal bar for one pattern showing:
 *  - bar fill = win rate (0-100%)
 *  - whiskers at CI lower/upper bounds (gray)
 *  - tier color on bar
 */
const CalibrationBar = ({ row, maxN }) => {
  const wr = row.win_rate ?? 0;
  const ciLo = row.win_rate_ci_lower ?? 0;
  const ciHi = row.win_rate_ci_upper ?? 100;
  const color = TIER_COLORS[row.reliability];

  return (
    <div className="py-3 border-b border-white/[0.04] last:border-b-0">
      {/* Top row: pattern name + WR + sample + tier badge */}
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-white/90 truncate">{row.pattern}</span>
          <ReliabilityBadge tier={row.reliability} />
        </div>
        <div className="flex items-baseline gap-2.5 font-mono tabular-nums text-[10px] flex-shrink-0">
          <span className="text-white/40">n = {row.count}</span>
          <span className="text-white/85 text-sm" style={{ color }}>
            {wr.toFixed(1)}%
          </span>
          <span className="text-white/35">
            [{ciLo.toFixed(1)}, {ciHi.toFixed(1)}]
          </span>
          <span className="text-white/35">±{row.win_rate_ci_half_width?.toFixed(1)}pp</span>
        </div>
      </div>

      {/* Bar + CI whiskers (relative position 0-100%) */}
      <div className="relative h-3">
        {/* Background track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-white/[0.04] rounded-sm" />

        {/* WR bar fill (from 0 to win_rate) */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-sm transition-all duration-700"
          style={{ width: `${wr}%`, background: color, opacity: 0.85 }}
        />

        {/* CI whisker — horizontal line between CI lower and upper */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-px bg-white/45"
          style={{ left: `${ciLo}%`, width: `${ciHi - ciLo}%` }}
        />

        {/* CI lower bound tick */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-white/55"
          style={{ left: `${ciLo}%` }}
        />

        {/* CI upper bound tick */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-white/55"
          style={{ left: `${ciHi}%` }}
        />

        {/* WR point marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
          style={{ left: `calc(${wr}% - 3px)`, background: color, boxShadow: `0 0 0 2px #0a0805` }}
        />
      </div>
    </div>
  );
};

const PatternCalibrationTab = ({ data }) => {
  const [tierFilter, setTierFilter] = useState("all"); // all | reliable | moderate | unreliable

  const filtered = useMemo(() => {
    if (!data?.length) return [];
    if (tierFilter === "all") return data;
    return data.filter((d) => d.reliability === tierFilter);
  }, [data, tierFilter]);

  const tierCounts = useMemo(() => {
    const c = { reliable: 0, moderate: 0, unreliable: 0 };
    for (const d of data || []) c[d.reliability] = (c[d.reliability] || 0) + 1;
    return c;
  }, [data]);

  const maxN = useMemo(() => Math.max(...(data || []).map((d) => d.count), 1), [data]);

  if (!data?.length) {
    return (
      <div className="rounded-md bg-[#0a0805] border border-white/[0.06] p-10 text-center">
        <div className="text-white/30 text-sm font-mono uppercase tracking-wider">
          No calibration data available
        </div>
        <div className="text-white/20 text-xs font-mono mt-2 normal-case">
          Need at least 5 signals per pattern in this date range
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Methodology callout */}
      <div className="rounded-md bg-[#0a0805] border border-white/[0.06] p-4 relative">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <div className="text-[10px] tracking-[0.25em] font-mono uppercase text-gold-primary/70 mb-2">
          · About Pattern Calibration ·
        </div>
        <p className="text-xs text-white/65 leading-relaxed">
          Win rate alone can be misleading with small samples. We compute the{" "}
          <span className="text-white/85 font-mono">Wilson 95% confidence interval</span> around each
          pattern's WR — the band where the true WR most likely sits given the sample size.
          Narrow band + large sample = reliable evidence. Wide band = treat with caution.
        </p>
      </div>

      {/* Tier filter chips + counts */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 mr-2">
          Filter
        </span>
        <button
          onClick={() => setTierFilter("all")}
          className={`px-3 py-1.5 rounded-sm border text-[10px] font-mono uppercase tracking-wider transition ${
            tierFilter === "all"
              ? "border-gold-primary/40 bg-gold-primary/10 text-gold-primary"
              : "border-white/[0.08] text-white/55 hover:text-white"
          }`}
        >
          All <span className="text-white/30 ml-1">({data.length})</span>
        </button>
        {["reliable", "moderate", "unreliable"].map((t) => {
          const isActive = tierFilter === t;
          const color = TIER_COLORS[t];
          return (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className="px-3 py-1.5 rounded-sm border text-[10px] font-mono uppercase tracking-wider transition"
              style={
                isActive
                  ? { borderColor: `${color}66`, background: `${color}15`, color }
                  : { borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)" }
              }
              title={TIER_DESC[t]}
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                {TIER_LABELS[t]}
                <span className="text-white/30 ml-1">({tierCounts[t] || 0})</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Chart card */}
      <div className="relative rounded-md bg-[#0a0805] border border-white/[0.06]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/40">
            Win Rate · 95% Confidence Interval · per Pattern
          </div>
          <div className="text-[9px] font-mono uppercase tracking-wider text-white/30">
            {filtered.length} of {data.length} shown
          </div>
        </div>

        {/* Scale ticks */}
        <div className="px-5 pt-4">
          <div className="relative h-4 mb-1">
            {[0, 25, 50, 75, 100].map((v) => (
              <div
                key={v}
                className="absolute top-0 -translate-x-1/2 text-[9px] font-mono tabular-nums text-white/30"
                style={{ left: `${v}%` }}
              >
                {v}%
              </div>
            ))}
          </div>
          <div className="relative h-px bg-white/[0.05] mb-3">
            {[25, 50, 75].map((v) => (
              <div
                key={v}
                className="absolute -top-1 w-px h-2 bg-white/15"
                style={{ left: `${v}%` }}
              />
            ))}
          </div>
        </div>

        <div className="px-5 pb-3">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-white/30 text-sm font-mono uppercase tracking-wider">
              No patterns match this tier filter
            </div>
          ) : (
            filtered.map((row) => <CalibrationBar key={row.pattern} row={row} maxN={maxN} />)
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/[0.05] text-[10px] text-white/35 leading-relaxed">
          ━━ band = 95% CI · ● = observed WR · sorted by reliability then sample size
        </div>
      </div>
    </div>
  );
};

export default PatternCalibrationTab;
