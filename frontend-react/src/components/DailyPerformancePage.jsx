// src/components/DailyPerformancePage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Daily Performance (Analytics Tool v4)
//
// Features:
//   • Cross-filtering: click any segment/bar → adds to active filters
//   • Filter chips bar at top — see active filters, click ✕ to remove
//   • 4 tabs: Overview · By Pattern · By Correlation · By Sector
//   • Sortable Pattern Performance Table (count/WR/avg peak/total peak)
//   • Scatter plot: confidence × peak (colored by outcome)
//   • Per-sector color palette (defi=blue, ai=purple, gamefi=pink, etc)
//   • Click any pair → opens existing SignalModal with full signal data
//   • "Show all" modal for full filtered signal list
//
// Design principles (research-backed):
//   • Cross-chart filtering (Databricks/Fusedash 2026)
//   • Drill-down hierarchy: aggregate → segment → record
//   • Cleveland-McGill: horizontal bars for multi-category
//   • Donut only for 2-3 segments with direct labels
//   • Progressive disclosure
//   • Filter-aware narrative
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from "react";
import { analyticsApi } from "../services/analyticsApi";
import { signalsApi } from "../services/api";
import SignalModal from "./SignalModal";

// ─── Sector color palette (industry-standard category encoding) ──

const SECTOR_COLORS = {
  defi: "#3b82f6",          // blue
  ai: "#a855f7",            // purple
  gamefi: "#ec4899",        // pink
  infrastructure: "#06b6d4", // cyan
  hype: "#f97316",          // orange
  payments: "#10b981",      // emerald
  rwa: "#f59e0b",           // amber
  privacy: "#8b5cf6",       // violet
  socialfi: "#14b8a6",      // teal
  other: "#64748b",         // slate
  uncategorized: "#6b7280", // gray
};

const sectorColor = (s) => SECTOR_COLORS[s] || SECTOR_COLORS.uncategorized;

const OUTCOME_COLORS = {
  tp4: "#10b981",
  tp3: "#34d399",
  tp2: "#6ee7b7",
  tp1: "#a7f3d0",
  sl: "#f87171",
};

// ─── Helpers ─────────────────────────────────────────────────────

const todayUTC = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
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

// ─── Reusable Card / Label / Section ─────────────────────────────

const Card = ({ children, className = "" }) => (
  <div className={`relative rounded-md bg-[#0a0805] border border-white/[0.06] ${className}`}>
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    {children}
  </div>
);

const Label = ({ children, className = "" }) => (
  <div className={`text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 ${className}`}>
    {children}
  </div>
);

const SectionHeader = ({ label }) => (
  <div className="flex items-center gap-3 my-6">
    <div className="h-px flex-1 bg-gradient-to-r from-transparent to-gold-primary/40" />
    <div className="text-[11px] tracking-[0.25em] text-gold-primary/80 font-mono">
      · {label} ·
    </div>
    <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gold-primary/40" />
  </div>
);

// ─── Donut chart (single value) ──────────────────────────────────

const Donut = ({ value, size = 200, stroke = 16, valueColor = "#d4a853", label, sublabel }) => {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (value / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={valueColor} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-mono tabular-nums text-white" style={{ fontSize: size * 0.18 }}>{label}</div>
        {sublabel && (
          <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/50 mt-1">{sublabel}</div>
        )}
      </div>
    </div>
  );
};

// ─── Segmented donut (multi segments, clickable) ─────────────────

const SegmentedDonut = ({ segments, size = 160, stroke = 16, centerLabel, centerSublabel, onSegmentClick }) => {
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
        className={onSegmentClick && s.value > 0 ? "cursor-pointer hover:opacity-80 transition" : ""}
        onClick={() => s.value > 0 && onSegmentClick && onSegmentClick(s)}
        style={{ transition: "all 0.6s ease-out" }}
      />
    );
  });

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={stroke} />
        {arcs}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="font-mono tabular-nums text-white" style={{ fontSize: size * 0.22 }}>{centerLabel}</div>
        {centerSublabel && (
          <div className="text-[9px] tracking-[0.2em] font-mono uppercase text-white/45 mt-0.5">{centerSublabel}</div>
        )}
      </div>
    </div>
  );
};

// ─── Horizontal bar chart (clickable rows for cross-filtering) ───

const HBar = ({ rows, height = 8, onRowClick, activeFilter }) => {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const pct = (r.value / max) * 100;
        const isActive = activeFilter && r.label === activeFilter;
        const clickable = !!onRowClick;
        return (
          <div
            key={i}
            className={`${clickable ? "cursor-pointer group" : ""} ${isActive ? "ring-1 ring-gold-primary/40 rounded-sm -mx-2 px-2 -my-1 py-1" : ""}`}
            onClick={() => clickable && onRowClick(r.label)}
          >
            <div className="flex justify-between items-baseline mb-1.5">
              <span className={`text-[12px] font-mono uppercase tracking-wider ${isActive ? "text-gold-primary" : "text-white/75 group-hover:text-white"}`}>
                {r.label}
              </span>
              <span className="flex items-center gap-2">
                {r.sublabel && (
                  <span className="text-[10px] font-mono tabular-nums text-white/40">{r.sublabel}</span>
                )}
                <span className={`text-xs font-mono tabular-nums min-w-[3rem] text-right ${isActive ? "text-gold-primary" : "text-white/85"}`}>
                  {r.value}
                </span>
              </span>
            </div>
            <div className="bg-white/[0.04] rounded-sm overflow-hidden" style={{ height }}>
              <div
                className="h-full rounded-sm transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  background: r.color || "rgba(212,168,83,0.7)",
                  opacity: isActive ? 1 : 0.85,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Filter chips bar (active filters display + clear) ───────────

const FilterChipsBar = ({ filters, onRemove, onClear, totalUnfiltered, totalFiltered }) => {
  const entries = Object.entries(filters).filter(([_, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return null;

  const labels = {
    outcome: "Outcome",
    sector: "Sector",
    pattern: "Pattern",
    btc_trend: "BTC",
    side: "Side",
  };

  return (
    <Card className="px-4 py-3 mb-5 bg-gold-primary/[0.04] border-gold-primary/20">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-gold-primary/70">Active Filters:</Label>
        {entries.map(([key, value]) => (
          <button
            key={key}
            onClick={() => onRemove(key)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-gold-primary/10 border border-gold-primary/30 text-[11px] font-mono uppercase tracking-wider text-gold-primary hover:bg-gold-primary/20 transition group"
          >
            <span className="text-gold-primary/60">{labels[key] || key}:</span>
            <span className="text-gold-primary">{value}</span>
            <span className="text-gold-primary/40 group-hover:text-gold-primary ml-1">✕</span>
          </button>
        ))}
        <span className="ml-auto flex items-center gap-3 text-[11px] font-mono">
          <span className="text-white/40">
            {totalUnfiltered}
            <span className="text-white/30 mx-1">→</span>
            <span className="text-gold-primary tabular-nums">{totalFiltered}</span>
            <span className="text-white/30 ml-1">signals</span>
          </span>
          <button
            onClick={onClear}
            className="px-2 py-0.5 rounded-sm border border-white/[0.08] text-white/50 hover:text-white hover:border-white/20 text-[10px] uppercase tracking-wider transition"
          >
            Clear All
          </button>
        </span>
      </div>
    </Card>
  );
};

// ─── KPI Card (clickable to add filter) ──────────────────────────

const KpiCard = ({ label, value, sub, subColor, onClick }) => (
  <div
    className={`relative rounded-md bg-[#0a0805] border border-white/[0.06] px-4 py-3.5 transition ${onClick ? "cursor-pointer hover:border-gold-primary/25" : ""}`}
    onClick={onClick}
  >
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <Label>{label}</Label>
    <div className="text-xl lg:text-2xl font-mono tabular-nums text-white/95 mt-1.5 truncate">{value}</div>
    <div className={`text-[10px] tracking-[0.15em] font-mono uppercase mt-1 ${subColor || "text-white/40"}`}>{sub}</div>
  </div>
);

// ─── Hero Section ────────────────────────────────────────────────

const HeroSection = ({ signals, totalUnfiltered, summary, detail, selectedDate, hasFilters }) => {
  const total = signals?.length || 0;
  const wins = signals?.filter((s) => s.outcome?.startsWith("tp")).length || 0;
  const losses = signals?.filter((s) => s.outcome === "sl").length || 0;
  const wr = total > 0 ? (wins / total) * 100 : 0;

  const regimeColors = {
    strong: { ring: "#d4a853", label: "STRONG" },
    neutral: { ring: "rgba(255,255,255,0.4)", label: "NEUTRAL" },
    weak: { ring: "#f87171", label: "WEAK" },
  };
  const regime = wr >= 75 ? "strong" : wr >= 50 ? "neutral" : "weak";
  const rc = total > 0 ? regimeColors[regime] : { ring: "rgba(255,255,255,0.1)", label: "NO DATA" };

  // Auto-generated narrative
  const avgPeak = total > 0
    ? signals.reduce((sum, s) => sum + (s.peak_pct || 0), 0) / total
    : 0;

  const topSector = useMemo(() => {
    if (!signals?.length) return null;
    const sectorMap = {};
    for (const s of signals) {
      const k = s.sector || "uncategorized";
      if (!sectorMap[k]) sectorMap[k] = { sector: k, total: 0, wins: 0 };
      sectorMap[k].total++;
      if (s.outcome?.startsWith("tp")) sectorMap[k].wins++;
    }
    const arr = Object.values(sectorMap);
    return arr
      .filter((s) => s.total >= 2)
      .sort((a, b) => b.wins / b.total - a.wins / a.total || b.total - a.total)[0];
  }, [signals]);

  const topPattern = useMemo(() => {
    if (!signals?.length) return null;
    const patternMap = {};
    for (const s of signals) {
      for (const tag of s.important_tags || []) {
        if (!patternMap[tag]) patternMap[tag] = 0;
        patternMap[tag]++;
      }
    }
    const arr = Object.entries(patternMap)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
    return arr[0];
  }, [signals]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
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
          sublabel={hasFilters ? "filtered wr" : "win rate"}
        />
        <div className="mt-5 flex items-center gap-3">
          <span className="flex items-center gap-2 px-3 py-1 rounded-sm bg-white/[0.04] border border-white/[0.08]">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: rc.ring }} />
            <span className="text-[11px] tracking-[0.25em] font-mono uppercase text-white/70">{rc.label}</span>
          </span>
        </div>
        <div className="mt-3 text-[11px] font-mono tabular-nums text-white/55">
          {wins}W / {losses}L
          <span className="text-white/30 mx-2">·</span>
          {total} {hasFilters ? "filtered" : "resolved"}
        </div>
      </Card>

      <Card className="lg:col-span-7 p-6">
        <div className="text-[10px] tracking-[0.25em] font-mono uppercase text-gold-primary/70 mb-4">
          · Daily Story {hasFilters ? "(filtered)" : ""} ·
        </div>

        <p className="text-base text-white/85 leading-relaxed">
          {hasFilters ? (
            <>
              <span className="font-mono tabular-nums text-gold-primary text-lg">{total}</span>
              {" "}of {totalUnfiltered} signals match current filters with{" "}
              <span className="font-mono tabular-nums text-white">{fmtPct(wr, 2)}</span>{" "}
              win rate{total > 0 && (<>, avg peak{" "}
                <span className={`font-mono ${avgPeak > 0 ? "text-emerald-400" : avgPeak < 0 ? "text-red-400" : "text-white/60"}`}>
                  {avgPeak > 0 ? "+" : ""}{avgPeak.toFixed(2)}%
                </span></>)}.
            </>
          ) : (
            <>
              <span className="font-mono tabular-nums text-gold-primary text-lg">{summary?.total_resolved ?? 0}</span>
              {" "}signals resolved with{" "}
              <span className="font-mono tabular-nums text-white">{fmtPct(summary?.win_rate, 2)}</span>{" "}
              win rate
              {summary?.delta_vs_yesterday !== 0 && (
                <span className="text-white/60">
                  ,{" "}<span className={summary?.delta_vs_yesterday > 0 ? "text-emerald-400" : "text-red-400"}>
                    {summary?.delta_vs_yesterday > 0 ? "+" : ""}{(summary?.delta_vs_yesterday || 0).toFixed(2)}
                  </span>{" "}vs yesterday
                </span>
              )}.
            </>
          )}
        </p>

        <div className="mt-6 space-y-3">
          {topSector && (
            <div className="flex items-start gap-3">
              <span
                className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                style={{ background: sectorColor(topSector.sector) }}
              />
              <div className="text-sm text-white/70">
                <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/45 mr-2">Best sector</span>
                <span className="font-mono uppercase tracking-wider text-white/90">{topSector.sector}</span>
                <span className="text-white/50 ml-2 font-mono tabular-nums text-xs">
                  {topSector.wins}/{topSector.total} ({fmtPct((topSector.wins / topSector.total) * 100, 0)})
                </span>
              </div>
            </div>
          )}

          {!hasFilters && summary?.btc_trend_mode && (
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-white/50 mt-2 flex-shrink-0" />
              <div className="text-sm text-white/70">
                <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/45 mr-2">BTC context</span>
                <span className="font-mono uppercase tracking-wider text-white/90">{summary.btc_trend_mode}</span>
                {summary.fear_greed_avg !== null && summary.fear_greed_avg !== undefined && (
                  <span className="text-white/40 ml-2 text-xs">
                    · F&amp;G {summary.fear_greed_avg} {summary.fear_greed_label}
                  </span>
                )}
              </div>
            </div>
          )}

          {topPattern && topPattern.count >= 2 && (
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-gold-primary mt-2 flex-shrink-0" />
              <div className="text-sm text-white/70">
                <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-gold-primary/70 mr-2">Top flag</span>
                <span className="font-mono text-white/90">{topPattern.tag}</span>
                <span className="text-white/50 ml-2 font-mono tabular-nums text-xs">in {topPattern.count} signals</span>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

// ─── KPI Row ─────────────────────────────────────────────────────

const KpiRow = ({ signals, detail, addFilter }) => {
  const bestPeak = useMemo(() => {
    if (!signals?.length) return null;
    let best = null;
    for (const s of signals) {
      if (s.peak_pct === null || s.peak_pct === undefined) continue;
      if (!best || s.peak_pct > best.peak_pct) best = s;
    }
    return best;
  }, [signals]);

  const avgPeak = useMemo(() => {
    if (!signals?.length) return 0;
    return signals.reduce((sum, s) => sum + (s.peak_pct || 0), 0) / signals.length;
  }, [signals]);

  const total = signals?.length || 0;
  const wins = signals?.filter((s) => s.outcome?.startsWith("tp")).length || 0;
  const decoupled = signals?.filter((s) => s.is_decoupled).length || 0;
  const coverage = signals?.filter((s) => (s.important_tag_count || 0) > 0).length || 0;
  const coveragePct = total ? Math.round((coverage / total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <KpiCard label="Resolved" value={total} sub="signals" />
      <KpiCard
        label="Hit Rate"
        value={total ? `${wins}/${total}` : "—"}
        sub={total ? fmtPct((wins / total) * 100, 1) : "—"}
      />
      <KpiCard
        label="Best Pair"
        value={bestPeak?.pair || "—"}
        sub={bestPeak?.peak_pct !== null && bestPeak?.peak_pct !== undefined ? `+${bestPeak.peak_pct.toFixed(2)}%` : "—"}
        subColor="text-emerald-400"
      />
      <KpiCard
        label="Avg Peak"
        value={total ? `${avgPeak >= 0 ? "+" : ""}${avgPeak.toFixed(2)}%` : "—"}
        sub="across filtered"
        subColor={avgPeak >= 0 ? "text-emerald-400/70" : "text-red-400/70"}
      />
      <KpiCard
        label="Decoupled"
        value={decoupled}
        sub={`${coveragePct}% enriched`}
      />
    </div>
  );
};

// ─── Tab Switcher ────────────────────────────────────────────────

const TAB_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "patterns", label: "By Pattern" },
  { id: "correlation", label: "Correlation" },
  { id: "sectors", label: "By Sector" },
];

const TabSwitcher = ({ active, onChange }) => (
  <div className="flex items-center gap-1 border-b border-white/[0.06]">
    {TAB_ITEMS.map((t) => {
      const isActive = active === t.id;
      return (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`relative px-4 py-3 text-[12px] font-mono uppercase tracking-wider transition ${
            isActive ? "text-gold-primary" : "text-white/40 hover:text-white/70"
          }`}
        >
          {t.label}
          {isActive && (
            <span className="absolute bottom-0 inset-x-3 h-[2px] bg-gold-primary" />
          )}
        </button>
      );
    })}
  </div>
);

// ─── Overview Tab ────────────────────────────────────────────────

const OverviewTab = ({ signals, detail, filters, addFilter }) => {
  // Outcome distribution
  const outcomes = useMemo(() => {
    const counts = { tp4: 0, tp3: 0, tp2: 0, tp1: 0, sl: 0 };
    for (const s of signals || []) {
      if (counts[s.outcome] !== undefined) counts[s.outcome]++;
    }
    return [
      { label: "TP4", key: "tp4", value: counts.tp4, color: OUTCOME_COLORS.tp4 },
      { label: "TP3", key: "tp3", value: counts.tp3, color: OUTCOME_COLORS.tp3 },
      { label: "TP2", key: "tp2", value: counts.tp2, color: OUTCOME_COLORS.tp2 },
      { label: "TP1", key: "tp1", value: counts.tp1, color: OUTCOME_COLORS.tp1 },
      { label: "SL", key: "sl", value: counts.sl, color: OUTCOME_COLORS.sl },
    ];
  }, [signals]);

  const outcomeTotal = outcomes.reduce((s, o) => s + o.value, 0);
  const winSegmentTotal = outcomes.filter((o) => o.key !== "sl").reduce((s, o) => s + o.value, 0);

  // Sector breakdown (frontend-computed for filter-awareness)
  const sectors = useMemo(() => {
    const sectorMap = {};
    for (const s of signals || []) {
      const k = s.sector || "uncategorized";
      if (!sectorMap[k]) sectorMap[k] = { sector: k, total: 0, wins: 0, losses: 0 };
      sectorMap[k].total++;
      if (s.outcome?.startsWith("tp")) sectorMap[k].wins++;
      if (s.outcome === "sl") sectorMap[k].losses++;
    }
    return Object.values(sectorMap)
      .map((s) => ({
        ...s,
        win_rate: s.total ? (s.wins / s.total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [signals]);

  // BTC trend distribution from signals' important_tags
  const btcTrendDist = useMemo(() => {
    const dist = { BULLISH: 0, RANGING: 0, BEARISH: 0 };
    for (const s of signals || []) {
      for (const tag of s.important_tags || []) {
        if (tag === "BTC_BULLISH") dist.BULLISH++;
        else if (tag === "BTC_RANGING") dist.RANGING++;
        else if (tag === "BTC_BEARISH") dist.BEARISH++;
      }
    }
    return dist;
  }, [signals]);

  const btcSegments = [
    { label: "BULLISH", key: "BULLISH", value: btcTrendDist.BULLISH, color: OUTCOME_COLORS.tp3 },
    { label: "RANGING", key: "RANGING", value: btcTrendDist.RANGING, color: "rgba(255,255,255,0.4)" },
    { label: "BEARISH", key: "BEARISH", value: btcTrendDist.BEARISH, color: OUTCOME_COLORS.sl },
  ];
  const btcTotal = btcSegments.reduce((s, b) => s + b.value, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Outcome Distribution */}
        <Card className="p-5">
          <div className="flex justify-between items-center mb-4">
            <Label>Outcome Distribution</Label>
            <div className="text-[10px] font-mono uppercase tracking-wider text-white/30">click to filter</div>
          </div>
          <div className="flex items-center gap-6">
            <SegmentedDonut
              segments={outcomes}
              size={140}
              stroke={14}
              centerLabel={winSegmentTotal}
              centerSublabel="wins"
              onSegmentClick={(s) => addFilter("outcome", s.key)}
            />
            <div className="flex-1 space-y-2">
              {outcomes.map((o) => {
                const pct = outcomeTotal ? (o.value / outcomeTotal) * 100 : 0;
                const isActive = filters.outcome === o.key;
                return (
                  <button
                    key={o.key}
                    onClick={() => addFilter("outcome", o.key)}
                    className={`w-full flex items-center gap-3 text-left transition ${o.value === 0 ? "opacity-30 pointer-events-none" : "hover:opacity-90"} ${isActive ? "ring-1 ring-gold-primary/40 rounded-sm -mx-1 px-1" : ""}`}
                  >
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: o.color }} />
                    <span className={`text-[11px] font-mono uppercase tracking-wider w-8 ${isActive ? "text-gold-primary" : "text-white/65"}`}>{o.label}</span>
                    <div className="flex-1 h-1 bg-white/[0.04] rounded-sm overflow-hidden">
                      <div className="h-full transition-all duration-700" style={{ width: `${pct}%`, background: o.color }} />
                    </div>
                    <span className="font-mono tabular-nums text-xs text-white/75 w-8 text-right">{o.value}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* BTC Trend Distribution */}
        <Card className="p-5">
          <div className="flex justify-between items-center mb-4">
            <Label>BTC Trend (at enrichment)</Label>
            <div className="text-[10px] font-mono uppercase tracking-wider text-white/30">click to filter</div>
          </div>
          {btcTotal > 0 ? (
            <div className="flex items-center gap-6">
              <SegmentedDonut
                segments={btcSegments}
                size={140}
                stroke={14}
                centerLabel={btcTotal}
                centerSublabel="enriched"
                onSegmentClick={(s) => addFilter("btc_trend", s.key)}
              />
              <div className="flex-1 space-y-2">
                {btcSegments.map((s) => {
                  const pct = btcTotal ? (s.value / btcTotal) * 100 : 0;
                  const isActive = filters.btc_trend === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => addFilter("btc_trend", s.key)}
                      className={`w-full flex items-center gap-3 text-left transition ${s.value === 0 ? "opacity-30 pointer-events-none" : "hover:opacity-90"} ${isActive ? "ring-1 ring-gold-primary/40 rounded-sm -mx-1 px-1" : ""}`}
                    >
                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                      <span className={`text-[11px] font-mono uppercase tracking-wider w-16 ${isActive ? "text-gold-primary" : "text-white/65"}`}>{s.label}</span>
                      <div className="flex-1 h-1 bg-white/[0.04] rounded-sm overflow-hidden">
                        <div className="h-full transition-all duration-700" style={{ width: `${pct}%`, background: s.color }} />
                      </div>
                      <span className="font-mono tabular-nums text-xs text-white/75 w-8 text-right">{s.value}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-xs font-mono text-white/30 py-8 text-center">No BTC enrichment data</div>
          )}
        </Card>
      </div>

      {/* Quick Sector Glance */}
      <Card className="p-5">
        <div className="flex justify-between items-center mb-4">
          <Label>Sector Quick Glance</Label>
          <div className="text-[10px] font-mono uppercase tracking-wider text-white/30">click bar to filter</div>
        </div>
        <HBar
          rows={sectors.map((s) => ({
            label: s.sector,
            value: s.total,
            sublabel: `${s.wins}/${s.total} · ${fmtPct(s.win_rate, 0)}`,
            color: sectorColor(s.sector),
          }))}
          onRowClick={(sectorName) => addFilter("sector", sectorName)}
          activeFilter={filters.sector}
        />
      </Card>
    </div>
  );
};

// ─── Pattern Performance Tab (sortable table) ────────────────────

const PatternsTab = ({ signals, filters, addFilter }) => {
  const [sortBy, setSortBy] = useState("count");
  const [sortDir, setSortDir] = useState("desc");

  const patternStats = useMemo(() => {
    const map = {};
    for (const s of signals || []) {
      const peak = s.peak_pct || 0;
      const isWin = s.outcome?.startsWith("tp");
      for (const tag of s.important_tags || []) {
        if (!map[tag]) {
          map[tag] = { pattern: tag, count: 0, wins: 0, losses: 0, total_peak: 0, peaks: [] };
        }
        map[tag].count++;
        if (isWin) map[tag].wins++;
        if (s.outcome === "sl") map[tag].losses++;
        map[tag].total_peak += peak;
        map[tag].peaks.push(peak);
      }
    }
    return Object.values(map).map((m) => ({
      ...m,
      win_rate: m.count ? (m.wins / m.count) * 100 : 0,
      avg_peak: m.count ? m.total_peak / m.count : 0,
    }));
  }, [signals]);

  const sorted = useMemo(() => {
    const arr = [...patternStats];
    arr.sort((a, b) => {
      const va = a[sortBy] ?? 0;
      const vb = b[sortBy] ?? 0;
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return arr;
  }, [patternStats, sortBy, sortDir]);

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortBy(key);
      setSortDir("desc");
    }
  };

  const SortHeader = ({ id, label, className = "" }) => {
    const isActive = sortBy === id;
    return (
      <th
        onClick={() => toggleSort(id)}
        className={`px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase font-normal cursor-pointer hover:text-white transition ${
          isActive ? "text-gold-primary" : "text-white/40"
        } ${className}`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {isActive && <span className="text-[8px]">{sortDir === "desc" ? "▼" : "▲"}</span>}
        </span>
      </th>
    );
  };

  if (sorted.length === 0) {
    return (
      <Card className="p-10 text-center">
        <div className="text-white/30 text-sm font-mono uppercase tracking-wider">
          No pattern data available
        </div>
        <div className="text-white/20 text-xs font-mono mt-2 normal-case">
          Signals don't have v3.0 enrichment tags
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-white/[0.06] flex justify-between items-center">
        <Label>Pattern Performance — sorted by {sortBy.replace("_", " ")}</Label>
        <div className="text-[10px] font-mono uppercase tracking-wider text-white/30">
          click column to sort · click row to filter
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                Pattern
              </th>
              <SortHeader id="count" label="Count" className="text-right" />
              <SortHeader id="win_rate" label="WR %" className="text-right" />
              <SortHeader id="avg_peak" label="Avg Peak" className="text-right" />
              <SortHeader id="total_peak" label="Total Peak" className="text-right" />
              <th className="px-4 py-3 text-right">{" "}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const isActive = filters.pattern === p.pattern;
              return (
                <tr
                  key={p.pattern}
                  onClick={() => addFilter("pattern", p.pattern)}
                  className={`border-b border-white/[0.04] cursor-pointer transition ${
                    isActive
                      ? "bg-gold-primary/[0.08] border-gold-primary/20"
                      : "hover:bg-white/[0.02]"
                  }`}
                >
                  <td className={`px-4 py-2.5 font-mono text-sm ${isActive ? "text-gold-primary" : "text-white/85"}`}>
                    {p.pattern}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-white/80">{p.count}</td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                      p.win_rate >= 75
                        ? "text-emerald-400"
                        : p.win_rate >= 50
                        ? "text-white/75"
                        : "text-red-400"
                    }`}
                  >
                    {p.win_rate.toFixed(1)}%
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                      p.avg_peak > 0 ? "text-emerald-400" : p.avg_peak < 0 ? "text-red-400" : "text-white/40"
                    }`}
                  >
                    {p.avg_peak > 0 ? "+" : ""}{p.avg_peak.toFixed(2)}%
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                      p.total_peak > 0 ? "text-emerald-400/80" : p.total_peak < 0 ? "text-red-400/80" : "text-white/40"
                    }`}
                  >
                    {p.total_peak > 0 ? "+" : ""}{p.total_peak.toFixed(2)}%
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`text-xs font-mono ${isActive ? "text-gold-primary" : "text-white/30"}`}>
                      {isActive ? "● filtered" : "→"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

// ─── Correlation Tab (scatter plot) ──────────────────────────────

const CorrelationTab = ({ signals }) => {
  // Compute axes range
  const validSignals = (signals || []).filter(
    (s) => s.confidence_score !== null && s.confidence_score !== undefined && s.peak_pct !== null
  );

  if (!validSignals.length) {
    return (
      <Card className="p-10 text-center">
        <div className="text-white/30 text-sm font-mono uppercase tracking-wider">
          No correlation data available
        </div>
        <div className="text-white/20 text-xs font-mono mt-2 normal-case">
          Signals don't have confidence_score / peak_pct
        </div>
      </Card>
    );
  }

  const peakValues = validSignals.map((s) => s.peak_pct);
  const minPeak = Math.min(...peakValues, 0);
  const maxPeak = Math.max(...peakValues, 0);
  const maxConf = Math.max(...validSignals.map((s) => s.confidence_score || 0), 100);

  const width = 700;
  const height = 400;
  const pad = { top: 20, right: 30, bottom: 50, left: 60 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const xScale = (v) => pad.left + (v / maxConf) * innerW;
  const yScale = (v) => {
    const range = maxPeak - minPeak || 1;
    return pad.top + innerH - ((v - minPeak) / range) * innerH;
  };

  const zeroY = yScale(0);

  return (
    <Card className="p-5">
      <div className="flex justify-between items-center mb-4">
        <Label>Confidence × Peak Correlation</Label>
        <div className="text-[10px] font-mono uppercase tracking-wider text-white/30">
          colored by outcome
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg width={width} height={height} className="block mx-auto">
          {/* Grid */}
          {[0, 25, 50, 75, 100].map((c) => (
            <line
              key={"vx" + c}
              x1={xScale(c)}
              y1={pad.top}
              x2={xScale(c)}
              y2={pad.top + innerH}
              stroke="rgba(255,255,255,0.05)"
              strokeDasharray="2,4"
            />
          ))}
          {/* Y grid + labels */}
          {[minPeak, (minPeak + maxPeak) / 2, maxPeak].map((v, i) => (
            <g key={"hy" + i}>
              <line
                x1={pad.left}
                y1={yScale(v)}
                x2={pad.left + innerW}
                y2={yScale(v)}
                stroke="rgba(255,255,255,0.05)"
                strokeDasharray="2,4"
              />
              <text
                x={pad.left - 8}
                y={yScale(v) + 4}
                textAnchor="end"
                fill="rgba(255,255,255,0.4)"
                fontSize={10}
                fontFamily="JetBrains Mono"
              >
                {v.toFixed(1)}%
              </text>
            </g>
          ))}

          {/* Zero line */}
          {minPeak < 0 && (
            <line
              x1={pad.left}
              y1={zeroY}
              x2={pad.left + innerW}
              y2={zeroY}
              stroke="rgba(255,255,255,0.15)"
              strokeDasharray="3,3"
            />
          )}

          {/* X labels */}
          {[0, 25, 50, 75, 100].map((c) => (
            <text
              key={"xl" + c}
              x={xScale(c)}
              y={pad.top + innerH + 18}
              textAnchor="middle"
              fill="rgba(255,255,255,0.4)"
              fontSize={10}
              fontFamily="JetBrains Mono"
            >
              {c}
            </text>
          ))}

          {/* Axis labels */}
          <text
            x={pad.left + innerW / 2}
            y={height - 12}
            textAnchor="middle"
            fill="rgba(255,255,255,0.5)"
            fontSize={10}
            fontFamily="JetBrains Mono"
            letterSpacing="0.2em"
          >
            CONFIDENCE SCORE →
          </text>
          <text
            x={-pad.top - innerH / 2}
            y={16}
            transform="rotate(-90)"
            textAnchor="middle"
            fill="rgba(255,255,255,0.5)"
            fontSize={10}
            fontFamily="JetBrains Mono"
            letterSpacing="0.2em"
          >
            ← PEAK %
          </text>

          {/* Dots */}
          {validSignals.map((s, i) => (
            <circle
              key={s.signal_id + i}
              cx={xScale(s.confidence_score || 0)}
              cy={yScale(s.peak_pct)}
              r={5}
              fill={OUTCOME_COLORS[s.outcome] || "rgba(255,255,255,0.3)"}
              fillOpacity={0.6}
              stroke={OUTCOME_COLORS[s.outcome] || "rgba(255,255,255,0.5)"}
              strokeWidth={1}
            >
              <title>{`${s.pair} · ${s.outcome?.toUpperCase()} · conf:${s.confidence_score} · peak:${s.peak_pct.toFixed(2)}%`}</title>
            </circle>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center justify-center gap-4 flex-wrap">
        {Object.entries(OUTCOME_COLORS).map(([key, color]) => (
          <span key={key} className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-white/50">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color, opacity: 0.7 }} />
            {key}
          </span>
        ))}
      </div>

      <div className="mt-3 text-xs text-white/40 text-center font-mono">
        {validSignals.length} signals plotted · Note: rating from legacy v2.1, confidence may be 0 for older signals
      </div>
    </Card>
  );
};

// ─── Sector Detail Tab ───────────────────────────────────────────

const SectorsTab = ({ signals, filters, addFilter }) => {
  const sectors = useMemo(() => {
    const map = {};
    for (const s of signals || []) {
      const k = s.sector || "uncategorized";
      if (!map[k]) {
        map[k] = { sector: k, total: 0, wins: 0, losses: 0, peaks: [] };
      }
      map[k].total++;
      if (s.outcome?.startsWith("tp")) map[k].wins++;
      if (s.outcome === "sl") map[k].losses++;
      if (s.peak_pct !== null && s.peak_pct !== undefined) map[k].peaks.push(s.peak_pct);
    }
    return Object.values(map).map((m) => ({
      ...m,
      win_rate: m.total ? (m.wins / m.total) * 100 : 0,
      avg_peak: m.peaks.length ? m.peaks.reduce((a, b) => a + b, 0) / m.peaks.length : 0,
      max_peak: m.peaks.length ? Math.max(...m.peaks) : 0,
    })).sort((a, b) => b.total - a.total);
  }, [signals]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      {sectors.map((s) => {
        const isActive = filters.sector === s.sector;
        return (
          <button
            key={s.sector}
            onClick={() => addFilter("sector", s.sector)}
            className={`text-left relative rounded-md bg-[#0a0805] border transition p-5 hover:border-gold-primary/30 ${
              isActive ? "border-gold-primary/40" : "border-white/[0.06]"
            }`}
          >
            <div
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background: `linear-gradient(to right, transparent, ${sectorColor(s.sector)}88, transparent)`,
              }}
            />
            <div className="flex items-center gap-2 mb-3">
              <span
                className="w-2 h-2 rounded-sm"
                style={{ background: sectorColor(s.sector) }}
              />
              <span className="font-mono uppercase tracking-wider text-sm text-white/90">
                {s.sector}
              </span>
              {isActive && <span className="text-[9px] text-gold-primary ml-auto">● FILTER</span>}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <Label>Signals</Label>
                <div className="font-mono tabular-nums text-lg text-white/90 mt-1">{s.total}</div>
              </div>
              <div>
                <Label>Win Rate</Label>
                <div
                  className={`font-mono tabular-nums text-lg mt-1 ${
                    s.win_rate >= 75 ? "text-emerald-400" : s.win_rate >= 50 ? "text-white/85" : "text-red-400"
                  }`}
                >
                  {s.win_rate.toFixed(0)}%
                </div>
              </div>
              <div>
                <Label>Avg Peak</Label>
                <div
                  className={`font-mono tabular-nums text-sm mt-1 ${
                    s.avg_peak > 0 ? "text-emerald-400/85" : s.avg_peak < 0 ? "text-red-400/85" : "text-white/50"
                  }`}
                >
                  {s.avg_peak > 0 ? "+" : ""}{s.avg_peak.toFixed(2)}%
                </div>
              </div>
              <div>
                <Label>Max Peak</Label>
                <div className="font-mono tabular-nums text-sm text-emerald-400/85 mt-1">
                  {s.max_peak > 0 ? "+" : ""}{s.max_peak.toFixed(2)}%
                </div>
              </div>
            </div>

            <div className="h-1.5 rounded-sm overflow-hidden bg-white/[0.04] flex">
              <div
                className="h-full bg-emerald-400/60"
                style={{ width: `${(s.wins / s.total) * 100}%` }}
                title={`${s.wins} wins`}
              />
              <div
                className="h-full bg-red-400/60"
                style={{ width: `${(s.losses / s.total) * 100}%` }}
                title={`${s.losses} losses`}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono tabular-nums text-white/40 mt-1.5">
              <span>{s.wins}W</span>
              <span>{s.losses}L</span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

// ─── Signal Row (used in preview + modal) ────────────────────────

const SignalRow = ({ s, onClick, dense = false }) => {
  const peakPos = (s.peak_pct ?? 0) > 0;
  const peakNeg = (s.peak_pct ?? 0) < 0;

  const outcomeChip = (o) => {
    if (!o) return { cls: "bg-white/[0.04] text-white/50 border-white/[0.08]", label: "—" };
    if (o === "sl") return { cls: "bg-red-500/15 text-red-300 border-red-500/30", label: "SL" };
    if (o === "tp4") return { cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", label: "TP4" };
    if (o === "tp3") return { cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25", label: "TP3" };
    if (o === "tp2") return { cls: "bg-emerald-500/8 text-emerald-400/85 border-emerald-500/20", label: "TP2" };
    if (o === "tp1") return { cls: "bg-emerald-500/5 text-emerald-400/75 border-emerald-500/15", label: "TP1" };
    return { cls: "bg-white/[0.04] text-white/50 border-white/[0.08]", label: o.toUpperCase() };
  };

  const ot = outcomeChip(s.outcome);

  return (
    <tr
      onClick={() => onClick(s)}
      className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer transition"
    >
      <td className="px-4 py-2.5 font-mono text-sm text-white/90">{s.pair}</td>
      <td className="px-3 py-2.5">
        <span className={`inline-flex px-2 py-0.5 rounded-sm border text-[10px] font-mono tracking-wider ${ot.cls}`}>
          {ot.label}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: sectorColor(s.sector) }}
          />
          <span className="text-[11px] font-mono uppercase tracking-wider text-white/55">
            {s.sector || "—"}
          </span>
        </span>
      </td>
      {!dense && (
        <td className="px-3 py-2.5">
          {s.signal_direction === "BULLISH" ? (
            <span className="text-emerald-400 text-xs font-mono">↑ LONG</span>
          ) : s.signal_direction === "BEARISH" ? (
            <span className="text-red-400 text-xs font-mono">↓ SHORT</span>
          ) : (
            <span className="text-white/20 text-xs">—</span>
          )}
        </td>
      )}
      <td
        className={`px-3 py-2.5 text-right font-mono tabular-nums text-sm ${
          peakPos ? "text-emerald-400" : peakNeg ? "text-red-400" : "text-white/40"
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

// ─── Top Signals (filter-aware preview) ──────────────────────────

const TopSignalsList = ({ signals, onPickSignal, onShowAll }) => {
  const preview = signals.slice(0, 10);
  const remaining = signals.length - preview.length;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
        <Label>Top Signals · {signals.length} matching</Label>
        <div className="text-[10px] font-mono uppercase tracking-wider text-white/30">click any row to view detail</div>
      </div>

      {preview.length === 0 ? (
        <div className="p-10 text-center text-white/30 text-sm font-mono uppercase tracking-wider">
          No signals match current filters
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">Pair</th>
                  <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">Outcome</th>
                  <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">Sector</th>
                  <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">Side</th>
                  <th className="text-right px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">Peak %</th>
                  <th className="text-right px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">Hit At</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((s) => (
                  <SignalRow key={s.signal_id} s={s} onClick={onPickSignal} />
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
                Show all {signals.length} signals →
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
};

// ─── All Signals Modal (full filtered list) ──────────────────────

const AllSignalsModal = ({ open, onClose, signals, onPickSignal }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-5xl max-h-[90vh] rounded-md bg-[#0a0805] border border-white/[0.08] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div>
            <div className="text-[10px] tracking-[0.25em] font-mono uppercase text-gold-primary/70">· All Filtered Signals ·</div>
            <div className="text-lg text-white/90 mt-0.5">{signals?.length || 0} signals</div>
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
                <th className="text-left px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">Pair</th>
                <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">Outcome</th>
                <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">Sector</th>
                <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">Side</th>
                <th className="text-right px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">Peak %</th>
                <th className="text-right px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">Hit At</th>
              </tr>
            </thead>
            <tbody>
              {signals?.map((s) => (
                <SignalRow key={s.signal_id} s={s} onClick={(sig) => { onPickSignal(sig); onClose(); }} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────────

const DailyPerformancePage = () => {
  const [selectedDate, setSelectedDate] = useState(todayUTC());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active filters state
  const [filters, setFilters] = useState({
    outcome: null,
    sector: null,
    pattern: null,
    btc_trend: null,
  });

  const [activeTab, setActiveTab] = useState("overview");
  const [showAllModal, setShowAllModal] = useState(false);

  // SignalModal state
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [loadingSignal, setLoadingSignal] = useState(false);

  // Fetch dashboard
  const fetchData = useCallback(async (date) => {
    setLoading(true);
    setError(null);
    try {
      const res = await analyticsApi.getDailyDashboard(date);
      setData(res);
    } catch (err) {
      console.error("Daily dashboard fetch failed:", err);
      setError(err?.response?.data?.detail || err?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate, fetchData]);

  // Reset filters on date change
  useEffect(() => {
    setFilters({ outcome: null, sector: null, pattern: null, btc_trend: null });
  }, [selectedDate]);

  // Filter logic
  const addFilter = useCallback((key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key] === value ? null : value, // toggle: same value clears
    }));
  }, []);

  const removeFilter = useCallback((key) => {
    setFilters((prev) => ({ ...prev, [key]: null }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ outcome: null, sector: null, pattern: null, btc_trend: null });
  }, []);

  // Compute filtered signals
  const allSignals = data?.day_detail?.signals || [];

  const filteredSignals = useMemo(() => {
    return allSignals.filter((s) => {
      if (filters.outcome && s.outcome !== filters.outcome) return false;
      if (filters.sector && s.sector !== filters.sector) return false;
      if (filters.btc_trend) {
        const btcTag = `BTC_${filters.btc_trend}`;
        if (!(s.important_tags || []).includes(btcTag)) return false;
      }
      if (filters.pattern) {
        if (!(s.important_tags || []).includes(filters.pattern)) return false;
      }
      return true;
    });
  }, [allSignals, filters]);

  const hasFilters = Object.values(filters).some((v) => v !== null);

  // SignalModal pick handler
  const handlePickSignal = useCallback(async (signalSummary) => {
    setLoadingSignal(true);
    try {
      const full = await signalsApi.getSignal(signalSummary.signal_id);
      setSelectedSignal(full);
    } catch (err) {
      console.error("Failed to load signal detail:", err);
      // Fallback: open with summary data
      setSelectedSignal(signalSummary);
    } finally {
      setLoadingSignal(false);
    }
  }, []);

  // Date constraints
  const dateMax = todayUTC();
  const dateMin = useMemo(() => {
    const d = new Date(dateMax + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 89);
    return d.toISOString().slice(0, 10);
  }, [dateMax]);

  const summary = data?.today_summary;
  const detail = data?.day_detail;

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-8">
      <SectionHeader label="DAILY PERFORMANCE" />

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display text-white/95 tracking-tight">Daily Performance</h1>
          <p className="text-sm text-white/45 mt-1">
            Interactive analytics · click any chart to filter · click any pair for detail
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

      {/* Filter chips bar */}
      <FilterChipsBar
        filters={filters}
        onRemove={removeFilter}
        onClear={clearFilters}
        totalUnfiltered={allSignals.length}
        totalFiltered={filteredSignals.length}
      />

      {/* Error */}
      {error && (
        <Card className="p-5 mb-6 border-red-500/20">
          <div className="text-sm text-red-300">
            <Label className="text-red-400/80 mb-1">· Error ·</Label>
            {error}
          </div>
        </Card>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="space-y-4">
          <div className="h-64 rounded-md bg-[#0a0805] border border-white/[0.06] animate-pulse" />
          <div className="grid grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 rounded-md bg-[#0a0805] border border-white/[0.06] animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {data && (
        <div className="space-y-5">
          <HeroSection
            signals={filteredSignals}
            totalUnfiltered={allSignals.length}
            summary={summary}
            detail={detail}
            selectedDate={selectedDate}
            hasFilters={hasFilters}
          />

          <KpiRow signals={filteredSignals} detail={detail} addFilter={addFilter} />

          {/* Tab switcher */}
          <div className="mt-8">
            <TabSwitcher active={activeTab} onChange={setActiveTab} />
          </div>

          <div className="mt-5">
            {activeTab === "overview" && (
              <OverviewTab
                signals={filteredSignals}
                detail={detail}
                filters={filters}
                addFilter={addFilter}
              />
            )}
            {activeTab === "patterns" && (
              <PatternsTab
                signals={filteredSignals}
                filters={filters}
                addFilter={addFilter}
              />
            )}
            {activeTab === "correlation" && (
              <CorrelationTab signals={filteredSignals} />
            )}
            {activeTab === "sectors" && (
              <SectorsTab
                signals={filteredSignals}
                filters={filters}
                addFilter={addFilter}
              />
            )}
          </div>

          <SectionHeader label="SIGNALS" />
          <TopSignalsList
            signals={filteredSignals}
            onPickSignal={handlePickSignal}
            onShowAll={() => setShowAllModal(true)}
          />
        </div>
      )}

      {/* All signals modal */}
      <AllSignalsModal
        open={showAllModal}
        onClose={() => setShowAllModal(false)}
        signals={filteredSignals}
        onPickSignal={handlePickSignal}
      />

      {/* Signal detail modal (existing component) */}
      {selectedSignal && (
        <SignalModal
          signal={selectedSignal}
          isOpen={!!selectedSignal}
          onClose={() => setSelectedSignal(null)}
        />
      )}

      {/* Loading signal indicator */}
      {loadingSignal && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0a0805] border border-gold-primary/30 rounded-md px-4 py-2 flex items-center gap-3">
          <div className="w-3 h-3 border border-gold-primary/30 border-t-gold-primary rounded-full animate-spin" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-white/70">Loading signal...</span>
        </div>
      )}
    </div>
  );
};

export default DailyPerformancePage;