// src/components/DailyPerformancePage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Daily Performance (Dashboard Redesign v3)
//
// Design principles applied (research-driven):
//   • 5-second rule: hero metric dominant, top-left F-pattern placement
//   • Cleveland-McGill perception: donut only for 2-3 segments,
//     horizontal bars for multi-category (sectors, outcomes)
//   • Progressive disclosure: top 10 signals + "show all" modal
//   • Narrative-driven: auto-generated story panel
//   • Selected day = protagonist: 14-day bars give selected day 2x prominence
//   • 5-7 KPI max per view
//   • Grayscale-first, color only for status (gold/emerald/red)
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from "react";
import { analyticsApi } from "../services/analyticsApi";

// ─── Helpers ─────────────────────────────────────────────────────

const todayUTC = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

const fmtDateLong = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

const fmtPct = (v, d = 2) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(d)}%`;
};

// ─── Reusable: SectionHeader ─────────────────────────────────────

const SectionHeader = ({ label }) => (
  <div className="flex items-center gap-3 my-6">
    <div className="h-px flex-1 bg-gradient-to-r from-transparent to-gold-primary/40" />
    <div className="text-[11px] tracking-[0.25em] text-gold-primary/80 font-mono">
      · {label} ·
    </div>
    <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gold-primary/40" />
  </div>
);

const Card = ({ children, className = "" }) => (
  <div
    className={`relative rounded-md bg-[#0a0805] border border-white/[0.06] ${className}`}
  >
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    {children}
  </div>
);

const Label = ({ children, className = "" }) => (
  <div
    className={`text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 ${className}`}
  >
    {children}
  </div>
);

// ─── Custom SVG: Donut Chart with center label ───────────────────

const Donut = ({
  value, // 0-100
  size = 200,
  stroke = 16,
  trackColor = "rgba(255,255,255,0.06)",
  valueColor = "#d4a853", // gold-primary
  label,
  sublabel,
}) => {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (value / 100) * circ;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={valueColor}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-mono tabular-nums text-white" style={{ fontSize: size * 0.18 }}>
          {label}
        </div>
        {sublabel && (
          <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/50 mt-1">
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Custom SVG: Multi-segment donut (for outcome distribution) ──

const SegmentedDonut = ({
  segments, // [{value, color, label}]
  size = 140,
  stroke = 14,
  centerLabel,
  centerSublabel,
}) => {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  let offset = 0;
  const arcs = segments.map((s, i) => {
    const portion = (s.value / total) * circ;
    const dasharray = `${portion} ${circ - portion}`;
    const dashoffset = -offset;
    offset += portion;
    return (
      <circle
        key={i}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={s.color}
        strokeWidth={stroke}
        strokeDasharray={dasharray}
        strokeDashoffset={dashoffset}
        style={{ transition: "all 0.6s ease-out" }}
      />
    );
  });

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={stroke}
        />
        {arcs}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div
          className="font-mono tabular-nums text-white"
          style={{ fontSize: size * 0.2 }}
        >
          {centerLabel}
        </div>
        {centerSublabel && (
          <div className="text-[9px] tracking-[0.2em] font-mono uppercase text-white/45 mt-0.5">
            {centerSublabel}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Horizontal Bar Chart (Cleveland-McGill: most accurate perception) ──

const HBar = ({
  rows, // [{label, value, total, color, sublabel}]
  maxValue,
  height = 8,
}) => {
  const max = maxValue || Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const pct = (r.value / max) * 100;
        return (
          <div key={i}>
            <div className="flex justify-between items-baseline mb-1.5">
              <span className="text-[12px] font-mono uppercase tracking-wider text-white/75">
                {r.label}
              </span>
              <span className="flex items-center gap-2">
                {r.sublabel && (
                  <span className="text-[10px] font-mono tabular-nums text-white/40">
                    {r.sublabel}
                  </span>
                )}
                <span className="text-xs font-mono tabular-nums text-white/85 min-w-[3rem] text-right">
                  {r.value}
                </span>
              </span>
            </div>
            <div
              className="bg-white/[0.04] rounded-sm overflow-hidden"
              style={{ height }}
            >
              <div
                className="h-full rounded-sm transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  background: r.color || "rgba(212,168,83,0.7)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── 14-Day Trend Strip with selected-day prominence ─────────────

const TrendStrip = ({ trend, selectedDate, onPick }) => {
  if (!trend?.length) return null;
  const maxTotal = Math.max(...trend.map((d) => d.total), 1);

  return (
    <Card className="p-5">
      <div className="flex items-end gap-1.5 h-40 mb-2">
        {trend.map((d) => {
          const isSelected = d.date === selectedDate;
          const heightPct = d.total > 0 ? (d.total / maxTotal) * 100 : 4;
          const isEmpty = d.total === 0;

          const barColor = isEmpty
            ? "bg-white/[0.04]"
            : isSelected
            ? "bg-gradient-to-t from-gold-primary to-gold-primary/70"
            : d.regime === "strong"
            ? "bg-gold-primary/40 group-hover:bg-gold-primary/60"
            : d.regime === "neutral"
            ? "bg-white/20 group-hover:bg-white/30"
            : "bg-red-500/40 group-hover:bg-red-500/55";

          return (
            <button
              key={d.date}
              onClick={() => onPick(d.date)}
              className="flex-1 group flex flex-col items-center justify-end h-full relative"
              title={`${d.date}: ${d.total} resolved · ${d.win_rate}% WR · ${d.regime}`}
            >
              {/* Selected day callout label */}
              {isSelected && d.total > 0 && (
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap px-2 py-1 rounded-sm bg-[#0a0805] border border-gold-primary/30 z-10">
                  <div className="text-[9px] tracking-[0.2em] font-mono uppercase text-gold-primary">
                    {d.win_rate.toFixed(0)}%
                  </div>
                </div>
              )}
              <div className="w-full flex items-end h-full px-0.5">
                <div
                  className={`w-full rounded-t-sm transition-all duration-300 ${barColor} ${
                    isSelected ? "shadow-[0_0_20px_rgba(212,168,83,0.3)]" : ""
                  }`}
                  style={{
                    height: `${heightPct}%`,
                    minHeight: "3px",
                    transform: isSelected ? "scaleY(1.05)" : "scaleY(1)",
                    transformOrigin: "bottom",
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        {trend.map((d) => {
          const isSelected = d.date === selectedDate;
          const dayNum = fmtDate(d.date).split(" ")[1];
          return (
            <div
              key={d.date + "-l"}
              className={`flex-1 text-center text-[10px] font-mono tabular-nums transition-colors ${
                isSelected
                  ? "text-gold-primary font-semibold"
                  : "text-white/30"
              }`}
            >
              {dayNum}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between text-[10px] tracking-[0.2em] font-mono uppercase">
        <div className="flex items-center gap-4 text-white/30">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-gold-primary/40 rounded-sm" /> Strong
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-white/20 rounded-sm" /> Neutral
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-red-500/40 rounded-sm" /> Weak
          </span>
        </div>
        <span className="text-white/30 normal-case tracking-wider">
          click a bar to inspect
        </span>
      </div>
    </Card>
  );
};

// ─── KPI Cards Row (5 metrics, top-row anchor) ───────────────────

const KpiRow = ({ summary, detail, signals }) => {
  // Best peak signal
  const bestPeak = useMemo(() => {
    if (!signals?.length) return null;
    let best = null;
    for (const s of signals) {
      if (s.peak_pct === null || s.peak_pct === undefined) continue;
      if (!best || s.peak_pct > best.peak_pct) best = s;
    }
    return best;
  }, [signals]);

  const hitRate = summary?.total_resolved
    ? `${summary.wins}/${summary.total_resolved}`
    : "—";

  const decoupled = detail?.context?.decoupled_count ?? 0;
  const coverage = detail?.context?.enrichment_coverage ?? 0;
  const coverageTotal = detail?.context?.enrichment_total ?? 0;
  const coveragePct = coverageTotal ? Math.round((coverage / coverageTotal) * 100) : 0;

  const cards = [
    {
      label: "Resolved",
      value: summary?.total_resolved ?? 0,
      sub: "signals",
    },
    {
      label: "Hit Rate",
      value: hitRate,
      sub: summary?.win_rate ? fmtPct(summary.win_rate, 1) : "—",
    },
    {
      label: "Best Pair",
      value: bestPeak?.pair || "—",
      sub:
        bestPeak?.peak_pct !== null && bestPeak?.peak_pct !== undefined
          ? `+${bestPeak.peak_pct.toFixed(2)}%`
          : "—",
      subColor: "text-emerald-400",
    },
    {
      label: "Decoupled",
      value: decoupled,
      sub: "from BTC",
    },
    {
      label: "Coverage",
      value: `${coverage}/${coverageTotal}`,
      sub: `${coveragePct}% enriched`,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c, i) => (
        <Card key={i} className="px-4 py-3.5">
          <Label>{c.label}</Label>
          <div className="text-xl lg:text-2xl font-mono tabular-nums text-white/95 mt-1.5 truncate">
            {c.value}
          </div>
          <div
            className={`text-[10px] tracking-[0.15em] font-mono uppercase mt-1 ${
              c.subColor || "text-white/40"
            }`}
          >
            {c.sub}
          </div>
        </Card>
      ))}
    </div>
  );
};

// ─── Hero Section: Big WR donut + Story panel ────────────────────

const HeroSection = ({ summary, detail, selectedDate }) => {
  if (!summary) return null;

  const wr = summary.win_rate ?? 0;
  const delta = summary.delta_vs_yesterday ?? 0;
  const deltaPos = delta > 0;
  const deltaNeg = delta < 0;
  const regime = summary.regime_label || "no_data";

  const regimeColors = {
    strong: { ring: "#d4a853", label: "STRONG" },
    neutral: { ring: "rgba(255,255,255,0.4)", label: "NEUTRAL" },
    weak: { ring: "#f87171", label: "WEAK" },
    no_data: { ring: "rgba(255,255,255,0.1)", label: "NO DATA" },
  };
  const rc = regimeColors[regime] || regimeColors.no_data;

  // Auto-generated narrative
  const hotSector = summary.hot_sector;
  const btcTrend = summary.btc_trend_mode;
  const fng = summary.fear_greed_avg;
  const fngLabel = summary.fear_greed_label;
  const topTag = detail?.context?.important_tags?.[0];
  const btcDist = detail?.context?.btc_trend_distribution || {};
  const btcTotal = Object.values(btcDist).reduce((a, b) => a + b, 0);
  const topBtc = Object.entries(btcDist).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* HERO DONUT — Left, dominant */}
      <Card className="lg:col-span-5 p-6 flex flex-col items-center justify-center">
        <div className="text-[10px] tracking-[0.25em] font-mono uppercase text-gold-primary/70 mb-1">
          · {fmtDateLong(selectedDate)} ·
        </div>
        <Donut
          value={wr}
          size={220}
          stroke={18}
          valueColor={rc.ring}
          label={`${wr.toFixed(1)}%`}
          sublabel="win rate"
        />
        <div className="mt-5 flex items-center gap-3">
          <span className="flex items-center gap-2 px-3 py-1 rounded-sm bg-white/[0.04] border border-white/[0.08]">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: rc.ring }}
            />
            <span className="text-[11px] tracking-[0.25em] font-mono uppercase text-white/70">
              {rc.label}
            </span>
          </span>
          {delta !== 0 && (
            <span
              className={`text-xs font-mono tabular-nums ${
                deltaPos
                  ? "text-emerald-400"
                  : deltaNeg
                  ? "text-red-400"
                  : "text-white/40"
              }`}
            >
              {deltaPos ? "▲" : "▼"} {Math.abs(delta).toFixed(2)} vs yesterday
            </span>
          )}
        </div>
        <div className="mt-3 text-[11px] font-mono tabular-nums text-white/55">
          {summary.wins ?? 0}W / {summary.losses ?? 0}L
          <span className="text-white/30 mx-2">·</span>
          {summary.total_resolved ?? 0} resolved
        </div>
      </Card>

      {/* STORY PANEL — Right, narrative-driven insights */}
      <Card className="lg:col-span-7 p-6">
        <div className="text-[10px] tracking-[0.25em] font-mono uppercase text-gold-primary/70 mb-4">
          · Daily Story ·
        </div>

        <p className="text-base text-white/85 leading-relaxed">
          <span className="font-mono tabular-nums text-gold-primary text-lg">
            {summary.total_resolved ?? 0}
          </span>{" "}
          signals resolved with{" "}
          <span className="font-mono tabular-nums text-white">
            {fmtPct(wr, 2)}
          </span>{" "}
          win rate
          {delta !== 0 && (
            <span className="text-white/60">
              ,{" "}
              <span
                className={deltaPos ? "text-emerald-400" : "text-red-400"}
              >
                {deltaPos ? "+" : ""}
                {delta.toFixed(2)}
              </span>{" "}
              vs yesterday
            </span>
          )}
          .
        </p>

        <div className="mt-6 space-y-3">
          {hotSector && hotSector.total >= 2 && (
            <div className="flex items-start gap-3">
              <div className="w-1 h-1 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
              <div className="text-sm text-white/70">
                <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-emerald-400/80 mr-2">
                  Best sector
                </span>
                <span className="font-mono uppercase tracking-wider text-white/90">
                  {hotSector.sector}
                </span>
                <span className="text-white/50 ml-2 font-mono tabular-nums text-xs">
                  {hotSector.wins}/{hotSector.total} ({fmtPct(hotSector.win_rate, 0)})
                </span>
              </div>
            </div>
          )}

          {topBtc && btcTotal > 0 && (
            <div className="flex items-start gap-3">
              <div className="w-1 h-1 rounded-full bg-white/50 mt-2 flex-shrink-0" />
              <div className="text-sm text-white/70">
                <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/50 mr-2">
                  BTC context
                </span>
                <span className="font-mono uppercase tracking-wider text-white/90">
                  {topBtc[0]}
                </span>
                <span className="text-white/50 ml-2 font-mono tabular-nums text-xs">
                  {topBtc[1]}/{btcTotal} signals ({Math.round((topBtc[1] / btcTotal) * 100)}%)
                </span>
                {fng !== null && fng !== undefined && (
                  <span className="text-white/40 ml-2 text-xs">
                    · F&G {fng} {fngLabel}
                  </span>
                )}
              </div>
            </div>
          )}

          {topTag && topTag.count >= 3 && (
            <div className="flex items-start gap-3">
              <div className="w-1 h-1 rounded-full bg-gold-primary mt-2 flex-shrink-0" />
              <div className="text-sm text-white/70">
                <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-gold-primary/70 mr-2">
                  Top flag
                </span>
                <span className="font-mono text-white/90">{topTag.tag}</span>
                <span className="text-white/50 ml-2 font-mono tabular-nums text-xs">
                  in {topTag.count} signals
                </span>
              </div>
            </div>
          )}

          {(detail?.context?.decoupled_count > 0 ||
            detail?.context?.extended_count > 0) && (
            <div className="flex items-start gap-3">
              <div className="w-1 h-1 rounded-full bg-white/30 mt-2 flex-shrink-0" />
              <div className="text-sm text-white/70">
                <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/50 mr-2">
                  Correlation
                </span>
                <span className="font-mono tabular-nums text-white/90">
                  {detail.context.decoupled_count}
                </span>
                <span className="text-white/50 ml-1 text-xs">
                  decoupled,{" "}
                </span>
                <span className="font-mono tabular-nums text-white/90">
                  {detail.context.extended_count}
                </span>
                <span className="text-white/50 ml-1 text-xs">extended</span>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

// ─── Distribution Section: Outcome donut + BTC donut ─────────────

const DistributionSection = ({ signals, detail }) => {
  // Outcome distribution
  const outcomes = useMemo(() => {
    const counts = { tp4: 0, tp3: 0, tp2: 0, tp1: 0, sl: 0 };
    for (const s of signals || []) {
      if (counts[s.outcome] !== undefined) counts[s.outcome]++;
    }
    return [
      { label: "TP4", value: counts.tp4, color: "#34d399" },
      { label: "TP3", value: counts.tp3, color: "#6ee7b7" },
      { label: "TP2", value: counts.tp2, color: "#a7f3d0" },
      { label: "TP1", value: counts.tp1, color: "rgba(167,243,208,0.5)" },
      { label: "SL", value: counts.sl, color: "#f87171" },
    ];
  }, [signals]);

  const outcomeTotal = outcomes.reduce((s, o) => s + o.value, 0);
  const winSegmentTotal = outcomes
    .filter((o) => o.label !== "SL")
    .reduce((s, o) => s + o.value, 0);

  // BTC trend distribution
  const btcDist = detail?.context?.btc_trend_distribution || {};
  const btcSegments = [
    {
      label: "Bullish",
      value: btcDist.BULLISH || 0,
      color: "#34d399",
    },
    {
      label: "Ranging",
      value: btcDist.RANGING || 0,
      color: "rgba(255,255,255,0.4)",
    },
    {
      label: "Bearish",
      value: btcDist.BEARISH || 0,
      color: "#f87171",
    },
  ];
  const btcTotal = btcSegments.reduce((s, b) => s + b.value, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* OUTCOME BREAKDOWN — donut + legend */}
      <Card className="p-5">
        <Label className="mb-4">Outcome Distribution</Label>
        <div className="flex items-center gap-6">
          <SegmentedDonut
            segments={outcomes}
            size={140}
            stroke={14}
            centerLabel={winSegmentTotal}
            centerSublabel="wins"
          />
          <div className="flex-1 space-y-2">
            {outcomes.map((o) => {
              const pct = outcomeTotal ? (o.value / outcomeTotal) * 100 : 0;
              return (
                <div key={o.label} className="flex items-center gap-3">
                  <span
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ background: o.color }}
                  />
                  <span className="text-[11px] font-mono uppercase tracking-wider text-white/65 w-8">
                    {o.label}
                  </span>
                  <div className="flex-1 h-1 bg-white/[0.04] rounded-sm overflow-hidden">
                    <div
                      className="h-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: o.color }}
                    />
                  </div>
                  <span className="font-mono tabular-nums text-xs text-white/75 w-8 text-right">
                    {o.value}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* BTC TREND DISTRIBUTION — donut + legend */}
      <Card className="p-5">
        <Label className="mb-4">BTC Trend (at enrichment)</Label>
        {btcTotal > 0 ? (
          <div className="flex items-center gap-6">
            <SegmentedDonut
              segments={btcSegments}
              size={140}
              stroke={14}
              centerLabel={btcTotal}
              centerSublabel="enriched"
            />
            <div className="flex-1 space-y-2">
              {btcSegments.map((s) => {
                const pct = btcTotal ? (s.value / btcTotal) * 100 : 0;
                return (
                  <div key={s.label} className="flex items-center gap-3">
                    <span
                      className="w-2 h-2 rounded-sm flex-shrink-0"
                      style={{ background: s.color }}
                    />
                    <span className="text-[11px] font-mono uppercase tracking-wider text-white/65 w-16">
                      {s.label}
                    </span>
                    <div className="flex-1 h-1 bg-white/[0.04] rounded-sm overflow-hidden">
                      <div
                        className="h-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: s.color }}
                      />
                    </div>
                    <span className="font-mono tabular-nums text-xs text-white/75 w-8 text-right">
                      {s.value}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-xs font-mono text-white/30 py-8 text-center">
            No BTC enrichment data for this day
          </div>
        )}
      </Card>
    </div>
  );
};

// ─── Sector Performance: Horizontal bars (multi-category) ────────

const SectorSection = ({ sectors }) => {
  if (!sectors?.length) return null;

  const rows = sectors.map((s) => ({
    label: s.sector,
    value: s.total,
    sublabel: `${s.wins}/${s.total} · ${fmtPct(s.win_rate, 0)}`,
    color:
      s.win_rate >= 75
        ? "rgba(52,211,153,0.7)"
        : s.win_rate >= 50
        ? "rgba(212,168,83,0.7)"
        : "rgba(248,113,113,0.7)",
  }));

  return (
    <Card className="p-5">
      <Label className="mb-4">Sector Performance</Label>
      <HBar rows={rows} />
      <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center justify-between text-[10px] tracking-[0.2em] font-mono uppercase text-white/40">
        <span>Sorted by volume</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-emerald-400/70" /> WR ≥ 75%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-gold-primary/70" /> 50-74%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-red-500/70" /> &lt; 50%
          </span>
        </span>
      </div>
    </Card>
  );
};

// ─── Top Tags Section ────────────────────────────────────────────

const TagsSection = ({ tags }) => {
  if (!tags?.length) return null;

  const rows = tags.slice(0, 8).map((t) => ({
    label: t.tag,
    value: t.count,
    color: "rgba(212,168,83,0.5)",
  }));

  return (
    <Card className="p-5">
      <Label className="mb-1">Top Signal Tags</Label>
      <div className="text-[10px] text-white/30 font-mono normal-case mb-4">
        Important enrichment flags · v3.0
      </div>
      <HBar rows={rows} height={6} />
    </Card>
  );
};

// ─── Compact Signal Row (for collapsed view) ─────────────────────

const outcomeStyle = (o) => {
  switch (o) {
    case "tp4":
      return {
        cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
        label: "TP4",
      };
    case "tp3":
      return {
        cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
        label: "TP3",
      };
    case "tp2":
      return {
        cls: "bg-emerald-500/8 text-emerald-400/90 border-emerald-500/20",
        label: "TP2",
      };
    case "tp1":
      return {
        cls: "bg-emerald-500/5 text-emerald-400/80 border-emerald-500/15",
        label: "TP1",
      };
    case "sl":
      return {
        cls: "bg-red-500/15 text-red-300 border-red-500/30",
        label: "SL",
      };
    default:
      return {
        cls: "bg-white/[0.04] text-white/50 border-white/[0.08]",
        label: "—",
      };
  }
};

const SignalRow = ({ s }) => {
  const ot = outcomeStyle(s.outcome);
  const peakPos = (s.peak_pct ?? 0) > 0;
  const peakNeg = (s.peak_pct ?? 0) < 0;
  return (
    <tr className="border-b border-white/[0.04] hover:bg-white/[0.02]">
      <td className="px-4 py-2.5 font-mono text-sm text-white/90">{s.pair}</td>
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex px-2 py-0.5 rounded-sm border text-[10px] font-mono tracking-wider ${ot.cls}`}
        >
          {ot.label}
        </span>
      </td>
      <td className="px-3 py-2.5 text-[11px] font-mono uppercase tracking-wider text-white/50">
        {s.sector || "—"}
      </td>
      <td className="px-3 py-2.5">
        {s.signal_direction === "BULLISH" ? (
          <span className="text-emerald-400 text-xs">↑ LONG</span>
        ) : s.signal_direction === "BEARISH" ? (
          <span className="text-red-400 text-xs">↓ SHORT</span>
        ) : (
          <span className="text-white/20 text-xs">—</span>
        )}
      </td>
      <td
        className={`px-3 py-2.5 text-right font-mono tabular-nums text-sm ${
          peakPos
            ? "text-emerald-400"
            : peakNeg
            ? "text-red-400"
            : "text-white/40"
        }`}
      >
        {s.peak_pct !== null && s.peak_pct !== undefined
          ? `${peakPos ? "+" : ""}${s.peak_pct.toFixed(2)}%`
          : "—"}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-white/40 text-xs">
        {s.outcome_at
          ? new Date(s.outcome_at).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "UTC",
            })
          : "—"}
      </td>
    </tr>
  );
};

// ─── Top Signals Preview + Modal for full list ───────────────────

const SignalsModal = ({ open, onClose, signals, date }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[90vh] rounded-md bg-[#0a0805] border border-white/[0.08] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />

        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div>
            <div className="text-[10px] tracking-[0.25em] font-mono uppercase text-gold-primary/70">
              · All Signals ·
            </div>
            <div className="text-lg text-white/90 mt-0.5">
              {signals?.length || 0} resolved on {fmtDate(date)}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-sm border border-white/[0.08] text-white/60 hover:text-white hover:border-white/20 transition flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0a0805] z-10">
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                  Pair
                </th>
                <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                  Outcome
                </th>
                <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                  Sector
                </th>
                <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                  Side
                </th>
                <th className="text-right px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                  Peak %
                </th>
                <th className="text-right px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                  Hit At
                </th>
              </tr>
            </thead>
            <tbody>
              {signals?.map((s) => (
                <SignalRow key={s.signal_id} s={s} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const TopSignalsPreview = ({ signals, onShowAll }) => {
  const [filter, setFilter] = useState("all");
  const filtered = useMemo(() => {
    if (!signals) return [];
    if (filter === "all") return signals;
    if (filter === "wins")
      return signals.filter((s) => s.outcome?.startsWith("tp"));
    if (filter === "losses") return signals.filter((s) => s.outcome === "sl");
    if (filter === "tp4") return signals.filter((s) => s.outcome === "tp4");
    return signals;
  }, [signals, filter]);

  const preview = filtered.slice(0, 10);
  const remaining = filtered.length - preview.length;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
        <Label>Top Signals</Label>
        <div className="flex items-center gap-1">
          {[
            { id: "all", label: "All" },
            { id: "wins", label: "Wins" },
            { id: "tp4", label: "TP4" },
            { id: "losses", label: "Losses" },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={`px-2.5 py-1 rounded-sm text-[10px] font-mono uppercase tracking-wider transition ${
                filter === c.id
                  ? "bg-gold-primary/15 text-gold-primary border border-gold-primary/30"
                  : "text-white/45 border border-white/[0.06] hover:text-white/70"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {preview.length === 0 ? (
        <div className="p-10 text-center text-white/30 text-sm font-mono uppercase tracking-wider">
          No signals match this filter
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                    Pair
                  </th>
                  <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                    Outcome
                  </th>
                  <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                    Sector
                  </th>
                  <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                    Side
                  </th>
                  <th className="text-right px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                    Peak %
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                    Hit At
                  </th>
                </tr>
              </thead>
              <tbody>
                {preview.map((s) => (
                  <SignalRow key={s.signal_id} s={s} />
                ))}
              </tbody>
            </table>
          </div>

          {remaining > 0 && (
            <div className="border-t border-white/[0.06] p-3 flex justify-center">
              <button
                onClick={onShowAll}
                className="px-4 py-2 rounded-sm text-[11px] font-mono uppercase tracking-wider text-gold-primary border border-gold-primary/30 hover:bg-gold-primary/10 transition"
              >
                Show all {filtered.length} signals →
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
};

// ─── Main Page ───────────────────────────────────────────────────

const DailyPerformancePage = () => {
  const [selectedDate, setSelectedDate] = useState(todayUTC());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAllModal, setShowAllModal] = useState(false);

  const fetchData = useCallback(async (date) => {
    setLoading(true);
    setError(null);
    try {
      const res = await analyticsApi.getDailyDashboard(date);
      setData(res);
    } catch (err) {
      console.error("Daily dashboard fetch failed:", err);
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Failed to load dashboard"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate, fetchData]);

  const dateMax = todayUTC();
  const dateMin = useMemo(() => {
    const d = new Date(dateMax + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 89);
    return d.toISOString().slice(0, 10);
  }, [dateMax]);

  const summary = data?.today_summary;
  const detail = data?.day_detail;
  const trend = data?.trend_14d;
  const signals = detail?.signals;

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-8">
      <SectionHeader label="DAILY PERFORMANCE" />

      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display text-white/95 tracking-tight">
            Daily Performance
          </h1>
          <p className="text-sm text-white/45 mt-1">
            Per-day breakdown by hit date · UTC · BTC + sector context
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#0a0805] border border-white/[0.08]">
            <Label>Date</Label>
            <input
              type="date"
              value={selectedDate}
              min={dateMin}
              max={dateMax}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-white/85 font-mono tabular-nums text-sm focus:outline-none [color-scheme:dark]"
            />
          </div>
          <button
            onClick={() => fetchData(selectedDate)}
            disabled={loading}
            className="px-3 py-2 rounded-md bg-[#0a0805] border border-white/[0.08] text-[10px] tracking-[0.2em] font-mono uppercase text-white/60 hover:border-gold-primary/30 hover:text-gold-primary transition disabled:opacity-50"
          >
            {loading ? "..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <Card className="p-5 mb-6 border-red-500/20">
          <div className="text-sm text-red-300">
            <Label className="text-red-400/80 mb-1">· Error ·</Label>
            {error}
          </div>
        </Card>
      )}

      {loading && !data && (
        <div className="space-y-4">
          <div className="h-64 rounded-md bg-[#0a0805] border border-white/[0.06] animate-pulse" />
          <div className="grid grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-20 rounded-md bg-[#0a0805] border border-white/[0.06] animate-pulse"
              />
            ))}
          </div>
        </div>
      )}

      {data && (
        <div className="space-y-5">
          {/* HERO — 5-second comprehension */}
          <HeroSection
            summary={summary}
            detail={detail}
            selectedDate={selectedDate}
          />

          {/* KPI ROW — 5 critical metrics */}
          <KpiRow summary={summary} detail={detail} signals={signals} />

          {/* 14-DAY TREND — navigation + context */}
          <SectionHeader label="14-DAY TREND" />
          <TrendStrip
            trend={trend}
            selectedDate={selectedDate}
            onPick={setSelectedDate}
          />

          {/* DISTRIBUTION — outcome donut + BTC donut */}
          <SectionHeader label="DISTRIBUTION" />
          <DistributionSection signals={signals} detail={detail} />

          {/* SECTOR PERFORMANCE — horizontal bars */}
          <SectionHeader label="BREAKDOWN" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SectorSection sectors={detail?.context?.sector_breakdown} />
            <TagsSection tags={detail?.context?.important_tags} />
          </div>

          {/* TOP SIGNALS — progressive disclosure */}
          <SectionHeader label="SIGNALS" />
          <TopSignalsPreview
            signals={signals}
            onShowAll={() => setShowAllModal(true)}
          />
        </div>
      )}

      <SignalsModal
        open={showAllModal}
        onClose={() => setShowAllModal(false)}
        signals={signals}
        date={selectedDate}
      />
    </div>
  );
};

export default DailyPerformancePage;
