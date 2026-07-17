// src/components/DailyPerformancePage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Daily Performance (Analytics Tool v7)
//
// v7 changes (over v6):
//   - NEW "Today's Edge" tab (5th tab): Loss Autopsy, Best/Worst Setups,
//     Pattern × Outcome matrix. Small-sample badge when n<5.
//   - "Open Edge Lab →" button in header (multi-day analytics, placeholder)
//   - All Today's Edge math is frontend-only from existing day_signals.
//
// v6 changes:
//   - REBUILT CorrelationTab with 4 panels powered by correlation_summary
//   - Daily Story shows correlation edge when advantage >= 10pp
//   - Graceful empty state for pre-backfill dates
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { analyticsApi } from "../services/analyticsApi";
import { signalsApi } from "../services/api";
import SignalModal from "./SignalModal";
import CoinLogo from "./CoinLogo";

// strip the quote-asset suffix for a clean coin symbol
const coinSym = (p) => (p || "").replace(/USDT$|USDC$|USD$/i, "");

// ─── Sector color palette ────────────────────────────────────────

const SECTOR_COLORS = {
  defi: "#3b82f6",
  ai: "#a855f7",
  gamefi: "#ec4899",
  infrastructure: "#06b6d4",
  hype: "#f97316",
  payments: "#10b981",
  rwa: "#f59e0b",
  privacy: "#8b5cf6",
  socialfi: "#14b8a6",
  other: "#64748b",
  uncategorized: "#6b7280",
};

const sectorColor = (s) => SECTOR_COLORS[s] || SECTOR_COLORS.uncategorized;

const OUTCOME_COLORS = {
  tp4: "#10b981",
  tp3: "#34d399",
  tp2: "#6ee7b7",
  tp1: "#a7f3d0",
  sl: "#ef4444",
};

const WIN_COLOR = "#10b981";
const LOSS_COLOR = "#ef4444";

const RISK_COLORS = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#ef4444",
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
  <div className={`relative rounded-xl bg-surface-raised border border-ink/[0.07] ${className}`}>
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink/10 to-transparent" />
    {children}
  </div>
);

const Label = ({ children, className = "" }) => (
  <div className={`text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40 ${className}`}>
    {children}
  </div>
);

const SectionHeader = ({ label }) => (
  <div className="flex items-center gap-3 my-6">
    <div className="h-px flex-1 bg-gradient-to-r from-transparent to-accent/40" />
    <div className="text-[11px] tracking-[0.25em] text-text-muted font-mono">
      · {label} ·
    </div>
    <div className="h-px flex-1 bg-gradient-to-l from-transparent to-accent/40" />
  </div>
);

// ─── Win/Loss Split Donut ────────────────────────────────────────

const WinLossDonut = ({ wins, losses, size = 220, stroke = 18 }) => {
  const total = wins + losses;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const winsPortion = total > 0 ? (wins / total) * circ : 0;
  const lossesPortion = total > 0 ? (losses / total) * circ : 0;
  const wr = total > 0 ? (wins / total) * 100 : 0;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgb(var(--ink) / 0.04)" strokeWidth={stroke} />
        {total > 0 && (
          <>
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={WIN_COLOR} strokeWidth={stroke} strokeDasharray={`${winsPortion} ${circ - winsPortion}`} strokeDashoffset={0} style={{ transition: "stroke-dasharray 0.8s ease-out" }} />
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={LOSS_COLOR} strokeWidth={stroke} strokeDasharray={`${lossesPortion} ${circ - lossesPortion}`} strokeDashoffset={-winsPortion} style={{ transition: "stroke-dasharray 0.8s ease-out" }} />
          </>
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-mono tabular-nums text-text-primary leading-none" style={{ fontSize: size * 0.2 }}>{wr.toFixed(1)}%</div>
        <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/50 mt-1.5">win rate</div>
        {total > 0 && (
          <div className="flex items-center gap-2 mt-2 font-mono tabular-nums text-[11px]">
            <span className="text-profit">{wins}W</span>
            <span className="text-text-primary/20">/</span>
            <span className="text-loss">{losses}L</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Segmented donut ─────────────────────────────────────────────

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
      <circle key={i} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={s.color} strokeWidth={stroke} strokeDasharray={dasharray} strokeDashoffset={dashoffset} className={onSegmentClick && s.value > 0 ? "cursor-pointer hover:opacity-80 transition" : ""} onClick={() => s.value > 0 && onSegmentClick && onSegmentClick(s)} style={{ transition: "all 0.6s ease-out" }} />
    );
  });
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgb(var(--ink) / 0.04)" strokeWidth={stroke} />
        {arcs}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="font-mono tabular-nums text-text-primary" style={{ fontSize: size * 0.22 }}>{centerLabel}</div>
        {centerSublabel && <div className="text-[9px] tracking-[0.2em] font-mono uppercase text-text-primary/45 mt-0.5">{centerSublabel}</div>}
      </div>
    </div>
  );
};

// ─── Horizontal bar ──────────────────────────────────────────────

const HBar = ({ rows, height = 8, onRowClick, activeFilter }) => {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const pct = (r.value / max) * 100;
        const isActive = activeFilter && r.label === activeFilter;
        const clickable = !!onRowClick;
        return (
          <div key={i} className={`${clickable ? "cursor-pointer group" : ""} ${isActive ? "ring-1 ring-accent/40 rounded-sm -mx-2 px-2 -my-1 py-1" : ""}`} onClick={() => clickable && onRowClick(r.label)}>
            <div className="flex justify-between items-baseline mb-1.5">
              <span className={`text-[12px] font-mono uppercase tracking-wider ${isActive ? "text-accent" : "text-text-primary/75 group-hover:text-text-primary"}`}>{r.label}</span>
              <span className="flex items-center gap-2">
                {r.sublabel && <span className="text-[10px] font-mono tabular-nums text-text-primary/40">{r.sublabel}</span>}
                <span className={`text-xs font-mono tabular-nums min-w-[3rem] text-right ${isActive ? "text-accent" : "text-text-primary/85"}`}>{r.value}</span>
              </span>
            </div>
            <div className="bg-ink/[0.04] rounded-sm overflow-hidden" style={{ height }}>
              <div className="h-full rounded-sm transition-all duration-700" style={{ width: `${pct}%`, background: r.color || "rgba(212,168,83,0.7)", opacity: isActive ? 1 : 0.85 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Filter chips ────────────────────────────────────────────────

const FilterChipsBar = ({ filters, onRemove, onClear, totalUnfiltered, totalFiltered }) => {
  const entries = Object.entries(filters).filter(([_, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return null;
  const labels = { outcome: "Outcome", sector: "Sector", pattern: "Pattern", btc_trend: "BTC", side: "Side" };
  return (
    <Card className="px-4 py-3 mb-5 bg-surface-secondary border-ink/10">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-text-muted">Active Filters:</Label>
        {entries.map(([key, value]) => (
          <button key={key} onClick={() => onRemove(key)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-accent/12 border border-ink/12 text-[11px] font-mono uppercase tracking-wider text-accent hover:bg-accent transition group">
            <span className="text-text-muted">{labels[key] || key}:</span>
            <span className="text-accent">{value}</span>
            <span className="text-text-muted/50 group-hover:text-text-primary ml-1">✕</span>
          </button>
        ))}
        <span className="ml-auto flex items-center gap-3 text-[11px] font-mono">
          <span className="text-text-primary/40">
            {totalUnfiltered}<span className="text-text-primary/30 mx-1">→</span><span className="text-accent tabular-nums">{totalFiltered}</span><span className="text-text-primary/30 ml-1">signals</span>
          </span>
          <button onClick={onClear} className="px-2 py-0.5 rounded-sm border border-ink/[0.08] text-text-primary/50 hover:text-text-primary hover:border-ink/20 text-[10px] uppercase tracking-wider transition">Clear All</button>
        </span>
      </div>
    </Card>
  );
};

// ─── Coverage banner ─────────────────────────────────────────────

const CoverageBanner = ({ coverage, total, dailyRegime, hasFilters }) => {
  if (hasFilters) return null;
  const pct = total > 0 ? (coverage / total) * 100 : 0;
  if (pct >= 30) return null;
  const isPreV3 = coverage === 0;
  return (
    <Card className="px-4 py-3 mb-5 border-amber-500/20 bg-amber-500/[0.03]">
      <div className="flex items-start gap-3">
        <span className="text-accent mt-0.5">⚠</span>
        <div className="flex-1 text-xs text-text-primary/75">
          {isPreV3 ? (
            <>
              <span className="text-accent font-mono uppercase tracking-wider text-[10px]">Limited enrichment data</span>
              <div className="mt-1 text-text-primary/55">BTC context, patterns, and per-signal tags unavailable for this date — enrichment v3.0 launched 2026-05-14. Win rate and sector breakdown remain accurate.</div>
            </>
          ) : (
            <>
              <span className="text-accent font-mono uppercase tracking-wider text-[10px]">Sparse enrichment ({coverage}/{total} signals · {pct.toFixed(0)}%)</span>
              <div className="mt-1 text-text-primary/55">BTC context and pattern analysis based on partial sample.</div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
};

// ─── Small sample badge (v7) ─────────────────────────────────────

const SmallSampleBadge = ({ n, threshold = 15 }) => {
  if (n >= threshold) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border border-accent/25 bg-amber-500/[0.05] text-[9px] font-mono uppercase tracking-wider text-accent/80" title={`Only ${n} data points — patterns may not generalize`}>
      ⚠ small sample
    </span>
  );
};

// ─── KPI Card ────────────────────────────────────────────────────

const KpiCard = ({ label, value, sub, subColor, onClick, valueColor }) => (
  <div className={`relative rounded-xl bg-surface-raised border border-ink/[0.07] px-4 py-3.5 transition ${onClick ? "cursor-pointer hover:border-ink/12" : ""}`} onClick={onClick}>
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink/10 to-transparent" />
    <Label>{label}</Label>
    <div className={`text-xl lg:text-2xl font-mono tabular-nums mt-1.5 truncate ${valueColor || "text-text-primary/95"}`}>{value}</div>
    <div className={`text-[10px] tracking-[0.15em] font-mono uppercase mt-1 ${subColor || "text-text-primary/40"}`}>{sub}</div>
  </div>
);

// ─── Hero Section ────────────────────────────────────────────────

const HeroSection = ({ signals, totalUnfiltered, summary, correlationSummary, selectedDate, hasFilters }) => {
  const total = signals?.length || 0;
  const wins = signals?.filter((s) => s.outcome?.startsWith("tp")).length || 0;
  const losses = signals?.filter((s) => s.outcome === "sl").length || 0;
  const wr = total > 0 ? (wins / total) * 100 : 0;

  const regimeBadge = {
    strong: { bg: "bg-profit/15", border: "border-profit/25", text: "text-profit", dot: WIN_COLOR },
    neutral: { bg: "bg-ink/[0.06]", border: "border-ink/[0.12]", text: "text-text-primary/75", dot: "rgb(var(--ink) / 0.5)" },
    weak: { bg: "bg-loss/15", border: "border-loss/25", text: "text-loss", dot: LOSS_COLOR },
    no_data: { bg: "bg-ink/[0.04]", border: "border-ink/[0.08]", text: "text-text-primary/40", dot: "rgb(var(--ink) / 0.2)" },
  };
  const regime = wr >= 75 ? "strong" : wr >= 50 ? "neutral" : total > 0 ? "weak" : "no_data";
  const rb = regimeBadge[regime];
  const avgPeak = total > 0 ? signals.reduce((sum, s) => sum + (s.peak_pct || 0), 0) / total : 0;

  const topSector = useMemo(() => {
    if (!signals?.length) return null;
    const m = {};
    for (const s of signals) {
      const k = s.sector || "uncategorized";
      if (!m[k]) m[k] = { sector: k, total: 0, wins: 0 };
      m[k].total++;
      if (s.outcome?.startsWith("tp")) m[k].wins++;
    }
    return Object.values(m).filter((s) => s.total >= 2).sort((a, b) => b.wins / b.total - a.wins / a.total || b.total - a.total)[0];
  }, [signals]);

  const topPattern = useMemo(() => {
    if (!signals?.length) return null;
    const m = {};
    for (const s of signals) for (const tag of s.important_tags || []) m[tag] = (m[tag] || 0) + 1;
    return Object.entries(m).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count)[0];
  }, [signals]);

  const enrichedCount = signals?.filter((s) => (s.important_tag_count || 0) > 0).length || 0;
  const hasEnrichment = enrichedCount > 0;
  const corrAdvantage = correlationSummary?.decoupled_vs_coupled?.advantage;
  const hasCorrelationInsight = !hasFilters && corrAdvantage !== null && corrAdvantage !== undefined && Math.abs(corrAdvantage) >= 10;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <Card className="lg:col-span-5 p-6 flex flex-col items-center justify-center">
        <div className="text-[10px] tracking-[0.25em] font-mono uppercase text-text-muted mb-3">· {fmtDateLong(selectedDate)} ·</div>
        <WinLossDonut wins={wins} losses={losses} size={220} stroke={18} />
        <div className="mt-5 flex items-center gap-3">
          <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-sm border ${rb.bg} ${rb.border}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: rb.dot }} />
            <span className={`text-[11px] tracking-[0.25em] font-mono uppercase ${rb.text}`}>{regime.toUpperCase().replace("_", " ")}</span>
          </span>
        </div>
        {total > 0 && (
          <div className="mt-3 text-[11px] font-mono tabular-nums text-text-primary/55">
            {total} {hasFilters ? "filtered" : "resolved"}
            {summary?.delta_vs_yesterday !== undefined && summary?.delta_vs_yesterday !== 0 && !hasFilters && (
              <>
                <span className="text-text-primary/20 mx-2">·</span>
                <span className={summary.delta_vs_yesterday > 0 ? "text-profit" : "text-loss"}>{summary.delta_vs_yesterday > 0 ? "▲" : "▼"} {Math.abs(summary.delta_vs_yesterday).toFixed(2)}</span>
                <span className="text-text-primary/30 ml-1">vs yesterday</span>
              </>
            )}
          </div>
        )}
      </Card>

      <Card className="lg:col-span-7 p-6">
        <div className="text-[10px] tracking-[0.25em] font-mono uppercase text-text-muted mb-4">· Daily Story {hasFilters ? "(filtered)" : ""} ·</div>
        <p className="text-base text-text-primary/85 leading-relaxed">
          {hasFilters ? (
            <>
              <span className="font-mono tabular-nums text-accent text-lg">{total}</span> of {totalUnfiltered} signals match current filters with <span className="font-mono tabular-nums text-text-primary">{fmtPct(wr, 2)}</span> win rate
              {total > 0 && (<>, avg peak <span className={`font-mono ${avgPeak > 0 ? "text-profit" : avgPeak < 0 ? "text-loss" : "text-text-primary/60"}`}>{avgPeak > 0 ? "+" : ""}{avgPeak.toFixed(2)}%</span></>)}.
            </>
          ) : (
            <>
              <span className="font-mono tabular-nums text-accent text-lg">{summary?.total_resolved ?? 0}</span> signals resolved with <span className="font-mono tabular-nums text-text-primary">{fmtPct(summary?.win_rate, 2)}</span> win rate
              {summary?.delta_vs_yesterday !== 0 && (
                <span className="text-text-primary/60">, <span className={summary?.delta_vs_yesterday > 0 ? "text-profit" : "text-loss"}>{summary?.delta_vs_yesterday > 0 ? "+" : ""}{(summary?.delta_vs_yesterday || 0).toFixed(2)}</span> vs yesterday</span>
              )}.
            </>
          )}
        </p>

        <div className="mt-6 space-y-3">
          {topSector && (
            <div className="flex items-start gap-3">
              <span className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ background: sectorColor(topSector.sector) }} />
              <div className="text-sm text-text-primary/70">
                <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/45 mr-2">Best sector</span>
                <span className="font-mono uppercase tracking-wider text-text-primary/90">{topSector.sector}</span>
                <span className="text-text-primary/50 ml-2 font-mono tabular-nums text-xs">{topSector.wins}/{topSector.total} ({fmtPct((topSector.wins / topSector.total) * 100, 0)})</span>
              </div>
            </div>
          )}
          {!hasFilters && summary?.btc_trend_mode && (
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-ink/50 mt-2 flex-shrink-0" />
              <div className="text-sm text-text-primary/70">
                <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/45 mr-2">BTC context</span>
                <span className="font-mono uppercase tracking-wider text-text-primary/90">{summary.btc_trend_mode}</span>
                {summary.btc_dom_trend_mode && <span className="text-text-primary/40 ml-2 text-xs">· DOM {summary.btc_dom_trend_mode}</span>}
                {summary.fear_greed_avg !== null && summary.fear_greed_avg !== undefined && <span className="text-text-primary/40 ml-2 text-xs">· F&amp;G {summary.fear_greed_avg} {summary.fear_greed_label}</span>}
              </div>
            </div>
          )}
          {!hasFilters && !summary?.btc_trend_mode && summary?.daily_regime && (
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400/70 mt-2 flex-shrink-0" />
              <div className="text-sm text-text-primary/70">
                <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-accent/70 mr-2">Daily regime (fallback)</span>
                <span className="font-mono uppercase tracking-wider text-text-primary/90">{summary.daily_regime.regime}</span>
                <span className="text-text-primary/50 ml-2 font-mono tabular-nums text-xs">{summary.daily_regime.wins}/{summary.daily_regime.total_closed} · {fmtPct(summary.daily_regime.win_rate, 1)}</span>
              </div>
            </div>
          )}
          {hasEnrichment && topPattern && topPattern.count >= 2 && (
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-accent mt-2 flex-shrink-0" />
              <div className="text-sm text-text-primary/70">
                <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-text-muted mr-2">Top flag</span>
                <span className="font-mono text-text-primary/90">{topPattern.tag}</span>
                <span className="text-text-primary/50 ml-2 font-mono tabular-nums text-xs">in {topPattern.count} signals</span>
              </div>
            </div>
          )}
          {hasCorrelationInsight && (
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ background: corrAdvantage > 0 ? "#10b981" : "#f59e0b" }} />
              <div className="text-sm text-text-primary/70">
                <span className="text-[10px] tracking-[0.2em] font-mono uppercase mr-2" style={{ color: corrAdvantage > 0 ? "rgba(16,185,129,0.7)" : "rgba(245,158,11,0.7)" }}>Correlation edge</span>
                <span className="font-mono uppercase tracking-wider text-text-primary/90">{corrAdvantage > 0 ? "Decoupled" : "Coupled"}</span>
                <span className="text-text-primary/50 ml-2 font-mono tabular-nums text-xs">outperformed by <span className={corrAdvantage > 0 ? "text-profit" : "text-accent"}>+{Math.abs(corrAdvantage).toFixed(1)}%</span></span>
              </div>
            </div>
          )}
          {!hasEnrichment && !hasFilters && total > 0 && (
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-ink/20 mt-2 flex-shrink-0" />
              <div className="text-xs text-text-primary/40 italic">Pattern analysis unavailable — signals on this date predate v3.0 enrichment</div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

// ─── KPI Row ─────────────────────────────────────────────────────

const KpiRow = ({ signals }) => {
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
  const enrichedCount = signals?.filter((s) => (s.important_tag_count || 0) > 0).length || 0;
  const coveragePct = total ? Math.round((enrichedCount / total) * 100) : 0;
  const hasAnyEnrichment = enrichedCount > 0;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <KpiCard label="Resolved" value={total} sub="signals" />
      <KpiCard label="Hit Rate" value={total ? `${wins}/${total}` : "—"} sub={total ? fmtPct((wins / total) * 100, 1) : "—"} subColor={total ? wins / total >= 0.75 ? "text-profit" : wins / total >= 0.5 ? "text-text-primary/60" : "text-loss" : "text-text-primary/40"} />
      <KpiCard label="Best Pair" value={bestPeak?.pair || "—"} sub={bestPeak?.peak_pct !== null && bestPeak?.peak_pct !== undefined ? `+${bestPeak.peak_pct.toFixed(2)}%` : "—"} subColor="text-profit" />
      <KpiCard label="Avg Peak" value={total ? `${avgPeak >= 0 ? "+" : ""}${avgPeak.toFixed(2)}%` : "—"} sub="across filtered" valueColor={avgPeak > 0 ? "text-profit" : avgPeak < 0 ? "text-loss" : "text-text-primary/95"} />
      <KpiCard label="Decoupled" value={hasAnyEnrichment ? decoupled : "—"} sub={hasAnyEnrichment ? `${coveragePct}% enriched` : "no enrichment"} subColor={hasAnyEnrichment ? "text-text-primary/40" : "text-accent/60"} />
    </div>
  );
};

// ─── Tab Switcher (v7: 5 tabs) ───────────────────────────────────

const TAB_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "patterns", label: "By Pattern" },
  { id: "correlation", label: "Correlation" },
  { id: "sectors", label: "By Sector" },
  { id: "edge", label: "Today's Edge" },
];

const TabSwitcher = ({ active, onChange }) => (
  <div className="flex items-center gap-1 border-b border-ink/[0.06] overflow-x-auto">
    {TAB_ITEMS.map((t) => {
      const isActive = active === t.id;
      return (
        <button key={t.id} onClick={() => onChange(t.id)} className={`relative px-4 py-3 text-[12px] font-mono uppercase tracking-wider transition whitespace-nowrap ${isActive ? "text-accent" : "text-text-primary/40 hover:text-text-primary/70"}`}>
          {t.label}
          {isActive && <span className="absolute bottom-0 inset-x-3 h-[2px] bg-accent" />}
        </button>
      );
    })}
  </div>
);

// ─── F&G Gauge ───────────────────────────────────────────────────

const FngGauge = ({ value, label }) => {
  if (value === null || value === undefined) return null;
  const color = value < 25 ? "text-loss" : value < 45 ? "text-orange-400" : value < 55 ? "text-text-primary/80" : value < 75 ? "text-profit/85" : "text-profit";
  return (
    <div className="pt-3 border-t border-ink/[0.05]">
      <Label className="mb-1.5">Fear &amp; Greed</Label>
      <div className="flex items-baseline gap-3">
        <span className="font-mono tabular-nums text-2xl text-text-primary/95">{value}</span>
        <span className={`text-[11px] font-mono uppercase tracking-wider ${color}`}>{label || "—"}</span>
      </div>
      <div className="mt-2 h-1.5 bg-gradient-to-r from-red-500 via-orange-400 via-yellow-400 to-emerald-400 rounded-sm relative">
        <div className="absolute -top-0.5 w-1 h-2.5 bg-white shadow-md" style={{ left: `calc(${value}% - 2px)` }} />
      </div>
      <div className="flex justify-between text-[9px] font-mono uppercase tracking-wider text-text-primary/30 mt-1">
        <span>0</span><span>50</span><span>100</span>
      </div>
    </div>
  );
};

// ─── BTC Context Card ───────────────────────────────────────────

const BtcContextCard = ({ signals, summary, detail, filters, addFilter }) => {
  const btcTrendDist = useMemo(() => {
    const dist = { BULLISH: 0, RANGING: 0, BEARISH: 0 };
    for (const s of signals || []) for (const tag of s.important_tags || []) {
      if (tag === "BTC_BULLISH") dist.BULLISH++;
      else if (tag === "BTC_RANGING") dist.RANGING++;
      else if (tag === "BTC_BEARISH") dist.BEARISH++;
    }
    return dist;
  }, [signals]);
  const backendDist = detail?.btc_trend_distribution || {};
  const dist = { BULLISH: btcTrendDist.BULLISH || backendDist.BULLISH || 0, RANGING: btcTrendDist.RANGING || backendDist.RANGING || 0, BEARISH: btcTrendDist.BEARISH || backendDist.BEARISH || 0 };
  const btcSegments = [
    { label: "BULLISH", key: "BULLISH", value: dist.BULLISH, color: OUTCOME_COLORS.tp3 },
    { label: "RANGING", key: "RANGING", value: dist.RANGING, color: "rgb(var(--ink)_/_0.4)" },
    { label: "BEARISH", key: "BEARISH", value: dist.BEARISH, color: OUTCOME_COLORS.sl },
  ];
  const btcTotal = btcSegments.reduce((s, b) => s + b.value, 0);
  const btcMode = summary?.btc_trend_mode;
  const btcDomMode = summary?.btc_dom_trend_mode;
  const fng = summary?.fear_greed_avg;
  const fngLabel = summary?.fear_greed_label;
  const dailyRegime = summary?.daily_regime;
  const showInteractiveDonut = btcTotal >= 3;
  const showSummaryFallback = !showInteractiveDonut && (btcMode || btcDomMode || fng !== null);
  const showRegimeFallback = !showInteractiveDonut && !showSummaryFallback && dailyRegime;
  const showEmpty = !showInteractiveDonut && !showSummaryFallback && !showRegimeFallback;
  return (
    <Card className="p-5">
      <div className="flex justify-between items-center mb-4">
        <Label>BTC Context</Label>
        {showInteractiveDonut && <div className="text-[10px] font-mono uppercase tracking-wider text-text-primary/30">click to filter</div>}
      </div>
      {showInteractiveDonut && (
        <div className="flex items-center gap-6">
          <SegmentedDonut segments={btcSegments} size={140} stroke={14} centerLabel={btcTotal} centerSublabel="enriched" onSegmentClick={(s) => addFilter("btc_trend", s.key)} />
          <div className="flex-1 space-y-2">
            {btcSegments.map((s) => {
              const pct = btcTotal ? (s.value / btcTotal) * 100 : 0;
              const isActive = filters.btc_trend === s.key;
              return (
                <button key={s.key} onClick={() => addFilter("btc_trend", s.key)} className={`w-full flex items-center gap-3 text-left transition ${s.value === 0 ? "opacity-30 pointer-events-none" : "hover:opacity-90"} ${isActive ? "ring-1 ring-accent/40 rounded-sm -mx-1 px-1" : ""}`}>
                  <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                  <span className={`text-[11px] font-mono uppercase tracking-wider w-16 ${isActive ? "text-accent" : "text-text-primary/65"}`}>{s.label}</span>
                  <div className="flex-1 h-1 bg-ink/[0.04] rounded-sm overflow-hidden"><div className="h-full transition-all duration-700" style={{ width: `${pct}%`, background: s.color }} /></div>
                  <span className="font-mono tabular-nums text-xs text-text-primary/75 w-8 text-right">{s.value}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {showSummaryFallback && (
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-4">
            {btcMode && (
              <div>
                <Label className="mb-1.5">BTC Trend</Label>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: btcMode === "BULLISH" ? OUTCOME_COLORS.tp3 : btcMode === "BEARISH" ? OUTCOME_COLORS.sl : "rgb(var(--ink) / 0.5)" }} />
                  <span className="font-mono uppercase tracking-wider text-base text-text-primary/90">{btcMode}</span>
                </div>
              </div>
            )}
            {btcDomMode && (
              <div>
                <Label className="mb-1.5">BTC.D Trend</Label>
                <div className="font-mono uppercase tracking-wider text-base text-text-primary/90">{btcDomMode}</div>
              </div>
            )}
          </div>
          <FngGauge value={fng} label={fngLabel} />
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-primary/30 pt-1">Aggregate mode · {detail?.enrichment_coverage || 0} of {detail?.enrichment_total || 0} signals enriched</div>
        </div>
      )}
      {showRegimeFallback && (
        <div className="space-y-3 py-1">
          <div className="flex items-center gap-3 p-3 rounded-sm bg-amber-500/[0.04] border border-amber-500/15">
            <span className="text-accent/70 text-lg">ℹ</span>
            <div className="flex-1 text-xs">
              <div className="text-accent font-mono uppercase tracking-wider text-[10px] mb-1">Limited data — using daily regime fallback</div>
              <div className="text-text-primary/60">BTC context unavailable for this date (pre-v3.0 enrichment).</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5">Daily Regime</Label>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: dailyRegime.regime === "strong" ? WIN_COLOR : dailyRegime.regime === "weak" ? LOSS_COLOR : "rgb(var(--ink) / 0.5)" }} />
                <span className="font-mono uppercase tracking-wider text-base text-text-primary/90">{dailyRegime.regime}</span>
              </div>
            </div>
            <div>
              <Label className="mb-1.5">Regime WR</Label>
              <div className="font-mono tabular-nums text-base text-text-primary/90">{dailyRegime.win_rate?.toFixed(1)}%</div>
              <div className="text-[10px] font-mono tabular-nums text-text-primary/40 mt-0.5">{dailyRegime.wins}/{dailyRegime.total_closed} closed</div>
            </div>
          </div>
        </div>
      )}
      {showEmpty && <div className="text-xs font-mono text-text-primary/30 py-8 text-center uppercase tracking-wider">No BTC context available</div>}
    </Card>
  );
};

// ─── Overview Tab ────────────────────────────────────────────────

const OverviewTab = ({ signals, detail, summary, filters, addFilter }) => {
  const outcomes = useMemo(() => {
    const counts = { tp4: 0, tp3: 0, tp2: 0, tp1: 0, sl: 0 };
    for (const s of signals || []) if (counts[s.outcome] !== undefined) counts[s.outcome]++;
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
  const sectors = useMemo(() => {
    const m = {};
    for (const s of signals || []) {
      const k = s.sector || "uncategorized";
      if (!m[k]) m[k] = { sector: k, total: 0, wins: 0, losses: 0 };
      m[k].total++;
      if (s.outcome?.startsWith("tp")) m[k].wins++;
      if (s.outcome === "sl") m[k].losses++;
    }
    return Object.values(m).map((s) => ({ ...s, win_rate: s.total ? (s.wins / s.total) * 100 : 0 })).sort((a, b) => b.total - a.total);
  }, [signals]);
  if (!signals?.length) return <Card className="p-10 text-center"><div className="text-text-primary/30 text-sm font-mono uppercase tracking-wider">No signals match current filters</div></Card>;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5">
          <div className="flex justify-between items-center mb-4">
            <Label>Outcome Distribution</Label>
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-primary/30">click to filter</div>
          </div>
          <div className="flex items-center gap-6">
            <SegmentedDonut segments={outcomes} size={140} stroke={14} centerLabel={winSegmentTotal} centerSublabel="wins" onSegmentClick={(s) => addFilter("outcome", s.key)} />
            <div className="flex-1 space-y-2">
              {outcomes.map((o) => {
                const pct = outcomeTotal ? (o.value / outcomeTotal) * 100 : 0;
                const isActive = filters.outcome === o.key;
                return (
                  <button key={o.key} onClick={() => addFilter("outcome", o.key)} className={`w-full flex items-center gap-3 text-left transition ${o.value === 0 ? "opacity-30 pointer-events-none" : "hover:opacity-90"} ${isActive ? "ring-1 ring-accent/40 rounded-sm -mx-1 px-1" : ""}`}>
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: o.color }} />
                    <span className={`text-[11px] font-mono uppercase tracking-wider w-8 ${isActive ? "text-accent" : "text-text-primary/65"}`}>{o.label}</span>
                    <div className="flex-1 h-1 bg-ink/[0.04] rounded-sm overflow-hidden"><div className="h-full transition-all duration-700" style={{ width: `${pct}%`, background: o.color }} /></div>
                    <span className="font-mono tabular-nums text-xs text-text-primary/75 w-8 text-right">{o.value}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
        <BtcContextCard signals={signals} summary={summary} detail={detail} filters={filters} addFilter={addFilter} />
      </div>
      <Card className="p-5">
        <div className="flex justify-between items-center mb-4">
          <Label>Sector Quick Glance</Label>
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-primary/30">click bar to filter</div>
        </div>
        <HBar rows={sectors.map((s) => ({ label: s.sector, value: s.total, sublabel: `${s.wins}/${s.total} · ${fmtPct(s.win_rate, 0)}`, color: sectorColor(s.sector) }))} onRowClick={(n) => addFilter("sector", n)} activeFilter={filters.sector} />
      </Card>
    </div>
  );
};

// ─── Pattern Tab ─────────────────────────────────────────────────

const PatternsTab = ({ signals, filters, addFilter }) => {
  const [sortBy, setSortBy] = useState("count");
  const [sortDir, setSortDir] = useState("desc");
  const patternStats = useMemo(() => {
    const map = {};
    for (const s of signals || []) {
      const peak = s.peak_pct || 0;
      const isWin = s.outcome?.startsWith("tp");
      for (const tag of s.important_tags || []) {
        if (!map[tag]) map[tag] = { pattern: tag, count: 0, wins: 0, losses: 0, total_peak: 0 };
        map[tag].count++;
        if (isWin) map[tag].wins++;
        if (s.outcome === "sl") map[tag].losses++;
        map[tag].total_peak += peak;
      }
    }
    return Object.values(map).map((m) => ({ ...m, win_rate: m.count ? (m.wins / m.count) * 100 : 0, avg_peak: m.count ? m.total_peak / m.count : 0 }));
  }, [signals]);
  const sorted = useMemo(() => {
    const arr = [...patternStats];
    arr.sort((a, b) => { const va = a[sortBy] ?? 0; const vb = b[sortBy] ?? 0; return sortDir === "desc" ? vb - va : va - vb; });
    return arr;
  }, [patternStats, sortBy, sortDir]);
  const toggleSort = (key) => { if (sortBy === key) setSortDir((d) => (d === "desc" ? "asc" : "desc")); else { setSortBy(key); setSortDir("desc"); } };
  const SortHeader = ({ id, label, className = "" }) => {
    const isActive = sortBy === id;
    return (
      <th onClick={() => toggleSort(id)} className={`px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase font-normal cursor-pointer hover:text-text-primary transition ${isActive ? "text-accent" : "text-text-primary/40"} ${className}`}>
        <span className="inline-flex items-center gap-1">{label}{isActive && <span className="text-[8px]">{sortDir === "desc" ? "▼" : "▲"}</span>}</span>
      </th>
    );
  };
  if (sorted.length === 0) return (
    <Card className="p-10 text-center">
      <div className="text-text-primary/30 text-sm font-mono uppercase tracking-wider">No pattern data available</div>
      <div className="text-text-primary/20 text-xs font-mono mt-2 normal-case">Signals on this date don't have v3.0 enrichment tags</div>
    </Card>
  );
  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-ink/[0.06] flex justify-between items-center">
        <Label>Pattern Performance — sorted by {sortBy.replace("_", " ")}</Label>
        <div className="text-[10px] font-mono uppercase tracking-wider text-text-primary/30">click column to sort · click row to filter</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-ink/[0.06]">
            <th className="text-left px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40 font-normal">Pattern</th>
            <SortHeader id="count" label="Count" className="text-right" />
            <SortHeader id="win_rate" label="WR %" className="text-right" />
            <SortHeader id="avg_peak" label="Avg Peak" className="text-right" />
            <SortHeader id="total_peak" label="Total Peak" className="text-right" />
            <th className="px-4 py-3 text-right"> </th>
          </tr></thead>
          <tbody>
            {sorted.map((p) => {
              const isActive = filters.pattern === p.pattern;
              return (
                <tr key={p.pattern} onClick={() => addFilter("pattern", p.pattern)} className={`border-b border-ink/[0.04] cursor-pointer transition ${isActive ? "bg-accent/10 border-ink/10" : "hover:bg-ink/[0.02]"}`}>
                  <td className={`px-4 py-2.5 font-mono text-sm ${isActive ? "text-accent" : "text-text-primary/85"}`}>{p.pattern}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary/80">{p.count}</td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${p.win_rate >= 75 ? "text-profit" : p.win_rate >= 50 ? "text-text-primary/75" : "text-loss"}`}>{p.win_rate.toFixed(1)}%</td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${p.avg_peak > 0 ? "text-profit" : p.avg_peak < 0 ? "text-loss" : "text-text-primary/40"}`}>{p.avg_peak > 0 ? "+" : ""}{p.avg_peak.toFixed(2)}%</td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${p.total_peak > 0 ? "text-profit/80" : p.total_peak < 0 ? "text-loss/80" : "text-text-primary/40"}`}>{p.total_peak > 0 ? "+" : ""}{p.total_peak.toFixed(2)}%</td>
                  <td className="px-4 py-2.5 text-right"><span className={`text-xs font-mono ${isActive ? "text-accent" : "text-text-primary/30"}`}>{isActive ? "● filtered" : "→"}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

// ─── BetaScatter ─────────────────────────────────────────────────

const BetaScatter = ({ signals }) => {
  if (!signals.length) return <div className="text-text-primary/30 text-sm font-mono uppercase tracking-wider text-center py-8">Not enough data to plot</div>;
  const betas = signals.map((s) => s.correlation.beta_30d);
  const peaks = signals.map((s) => s.peak_pct);
  const minBeta = Math.min(...betas, 0), maxBeta = Math.max(...betas, 1.5);
  const minPeak = Math.min(...peaks, 0), maxPeak = Math.max(...peaks, 0);
  const width = 700, height = 380;
  const pad = { top: 20, right: 30, bottom: 50, left: 60 };
  const innerW = width - pad.left - pad.right, innerH = height - pad.top - pad.bottom;
  const betaRange = maxBeta - minBeta || 1, peakRange = maxPeak - minPeak || 1;
  const xScale = (v) => pad.left + ((v - minBeta) / betaRange) * innerW;
  const yScale = (v) => pad.top + innerH - ((v - minPeak) / peakRange) * innerH;
  const zeroY = yScale(0), oneBetaX = xScale(1);
  const xTicks = []; for (let i = 0; i <= 4; i++) xTicks.push(minBeta + (betaRange / 4) * i);
  const yTicks = []; for (let i = 0; i <= 4; i++) yTicks.push(minPeak + (peakRange / 4) * i);
  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="block mx-auto">
        {xTicks.map((v, i) => <line key={"vx" + i} x1={xScale(v)} y1={pad.top} x2={xScale(v)} y2={pad.top + innerH} stroke="rgb(var(--ink) / 0.05)" strokeDasharray="2,4" />)}
        {yTicks.map((v, i) => (
          <g key={"hy" + i}>
            <line x1={pad.left} y1={yScale(v)} x2={pad.left + innerW} y2={yScale(v)} stroke="rgb(var(--ink) / 0.05)" strokeDasharray="2,4" />
            <text x={pad.left - 8} y={yScale(v) + 4} textAnchor="end" fill="rgb(var(--ink) / 0.4)" fontSize={10} fontFamily="JetBrains Mono">{v.toFixed(1)}%</text>
          </g>
        ))}
        {minPeak < 0 && <line x1={pad.left} y1={zeroY} x2={pad.left + innerW} y2={zeroY} stroke="rgb(var(--ink) / 0.15)" strokeDasharray="3,3" />}
        {minBeta < 1 && maxBeta > 1 && (<>
          <line x1={oneBetaX} y1={pad.top} x2={oneBetaX} y2={pad.top + innerH} stroke="rgba(212,168,83,0.25)" strokeDasharray="3,3" />
          <text x={oneBetaX} y={pad.top - 5} textAnchor="middle" fill="rgba(212,168,83,0.6)" fontSize={9} fontFamily="JetBrains Mono">β=1</text>
        </>)}
        {xTicks.map((v, i) => <text key={"xl" + i} x={xScale(v)} y={pad.top + innerH + 18} textAnchor="middle" fill="rgb(var(--ink) / 0.4)" fontSize={10} fontFamily="JetBrains Mono">{v.toFixed(2)}</text>)}
        <text x={pad.left + innerW / 2} y={height - 12} textAnchor="middle" fill="rgb(var(--ink) / 0.5)" fontSize={10} fontFamily="JetBrains Mono" letterSpacing="0.2em">BETA (vs BTC) →</text>
        <text x={-pad.top - innerH / 2} y={16} transform="rotate(-90)" textAnchor="middle" fill="rgb(var(--ink) / 0.5)" fontSize={10} fontFamily="JetBrains Mono" letterSpacing="0.2em">← PEAK %</text>
        {signals.map((s, i) => (
          <circle key={s.signal_id + i} cx={xScale(s.correlation.beta_30d)} cy={yScale(s.peak_pct)} r={5} fill={OUTCOME_COLORS[s.outcome] || "rgb(var(--ink) / 0.3)"} fillOpacity={0.7} stroke={OUTCOME_COLORS[s.outcome] || "rgb(var(--ink) / 0.5)"} strokeWidth={1}>
            <title>{`${s.pair} · ${s.outcome?.toUpperCase()} · β:${s.correlation.beta_30d.toFixed(2)} · peak:${s.peak_pct.toFixed(2)}%`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-4 pt-4 border-t border-ink/[0.05] flex items-center justify-center gap-4 flex-wrap">
        {Object.entries(OUTCOME_COLORS).map(([key, color]) => (
          <span key={key} className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-text-primary/50">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color, opacity: 0.7 }} />{key}
          </span>
        ))}
      </div>
    </div>
  );
};

const AverageStat = ({ label, value, suffix = "", hint, digits = 2 }) => (
  <div className="rounded-sm bg-ink/[0.02] border border-ink/[0.05] px-3 py-2.5">
    <div className="text-[9px] tracking-[0.2em] font-mono uppercase text-text-primary/40 mb-1">{label}</div>
    <div className="font-mono tabular-nums text-lg text-text-primary/90">{value === null || value === undefined ? "—" : `${value.toFixed(digits)}${suffix}`}</div>
    <div className="text-[9px] font-mono text-text-primary/30 mt-0.5">{hint}</div>
  </div>
);

// ─── Correlation Tab ─────────────────────────────────────────────

const CorrelationTab = ({ signals, correlationSummary }) => {
  if (!correlationSummary || correlationSummary.coverage === 0) return (
    <Card className="p-10 text-center">
      <div className="text-text-primary/40 text-sm font-mono uppercase tracking-wider">No correlation data available</div>
      <div className="text-text-primary/30 text-xs font-mono mt-2 normal-case">Signals predate the v2.0 BTC correlation worker (launched 2026-05-14)</div>
    </Card>
  );
  const sum = correlationSummary;
  const validSignals = (signals || []).filter((s) => s.correlation && s.correlation.beta_30d !== null && s.peak_pct !== null);
  const totalRisk = sum.risk_distribution.low + sum.risk_distribution.medium + sum.risk_distribution.high;
  const dec = sum.decoupled_vs_coupled.decoupled;
  const cou = sum.decoupled_vs_coupled.coupled;
  const adv = sum.decoupled_vs_coupled.advantage;
  const decoupledWins = adv !== null && adv > 0;
  const coupledWins = adv !== null && adv < 0;
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex justify-between items-center mb-5">
          <Label>Decoupled vs Coupled — Performance Comparison</Label>
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-primary/30">{sum.coverage} signals enriched</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`rounded-md border p-4 transition ${decoupledWins ? "border-profit/25 bg-profit/[0.04]" : "border-ink/[0.06] bg-surface-raised"}`}>
            <div className="flex items-center justify-between mb-3">
              <Label className={decoupledWins ? "text-profit/80" : ""}>Decoupled</Label>
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-primary/40">{dec.total} signal{dec.total !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-mono tabular-nums ${dec.win_rate === null ? "text-text-primary/30" : dec.win_rate >= 70 ? "text-profit" : dec.win_rate >= 50 ? "text-text-primary/90" : "text-loss"}`}>{dec.win_rate === null ? "—" : `${dec.win_rate.toFixed(1)}%`}</span>
              <span className="text-xs text-text-primary/40 font-mono">win rate</span>
            </div>
            <div className="mt-2 text-[11px] font-mono tabular-nums text-text-primary/50">{dec.wins}W / {dec.total - dec.wins}L</div>
            <div className="mt-3 h-1.5 bg-ink/[0.04] rounded-sm overflow-hidden"><div className="h-full bg-profit/70 transition-all duration-700" style={{ width: `${dec.win_rate || 0}%` }} /></div>
            <div className="mt-3 text-[10px] text-text-primary/40 leading-relaxed">Coins trading independently of BTC — low correlation, beta near zero</div>
          </div>
          <div className={`rounded-md border p-4 transition ${coupledWins ? "border-profit/25 bg-profit/[0.04]" : "border-ink/[0.06] bg-surface-raised"}`}>
            <div className="flex items-center justify-between mb-3">
              <Label className={coupledWins ? "text-profit/80" : ""}>Coupled</Label>
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-primary/40">{cou.total} signal{cou.total !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-mono tabular-nums ${cou.win_rate === null ? "text-text-primary/30" : cou.win_rate >= 70 ? "text-profit" : cou.win_rate >= 50 ? "text-text-primary/90" : "text-loss"}`}>{cou.win_rate === null ? "—" : `${cou.win_rate.toFixed(1)}%`}</span>
              <span className="text-xs text-text-primary/40 font-mono">win rate</span>
            </div>
            <div className="mt-2 text-[11px] font-mono tabular-nums text-text-primary/50">{cou.wins}W / {cou.total - cou.wins}L</div>
            <div className="mt-3 h-1.5 bg-ink/[0.04] rounded-sm overflow-hidden"><div className="h-full bg-profit/70 transition-all duration-700" style={{ width: `${cou.win_rate || 0}%` }} /></div>
            <div className="mt-3 text-[10px] text-text-primary/40 leading-relaxed">Coins moving with BTC — standard correlation, beta close to 1</div>
          </div>
        </div>
        {adv !== null && (
          <div className={`mt-4 px-4 py-3 rounded-md flex items-center justify-between border ${Math.abs(adv) >= 10 ? decoupledWins ? "bg-profit/[0.06] border-profit/20" : "bg-amber-500/[0.06] border-amber-500/20" : "bg-ink/[0.02] border-ink/[0.06]"}`}>
            <div className="text-xs text-text-primary/70">
              {Math.abs(adv) < 1 ? (<><span className="font-mono uppercase tracking-wider text-[10px] text-text-primary/40 mr-2">Insight</span>No meaningful difference between decoupled and coupled today</>) : (<><span className="font-mono uppercase tracking-wider text-[10px] text-text-primary/40 mr-2">Today's edge</span>{decoupledWins ? "Decoupled" : "Coupled"} coins outperformed by <span className={`font-mono tabular-nums ${decoupledWins ? "text-profit" : "text-accent"}`}>{Math.abs(adv).toFixed(2)}%</span></>)}
            </div>
          </div>
        )}
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card className="p-5">
          <Label>Risk Distribution</Label>
          <div className="mt-4 space-y-3">
            {[{ key: "low", label: "LOW", count: sum.risk_distribution.low }, { key: "medium", label: "MEDIUM", count: sum.risk_distribution.medium }, { key: "high", label: "HIGH", count: sum.risk_distribution.high }].map((r) => {
              const pct = totalRisk > 0 ? (r.count / totalRisk) * 100 : 0;
              const color = RISK_COLORS[r.key];
              return (
                <div key={r.key}>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm" style={{ background: color }} /><span className="text-[11px] font-mono uppercase tracking-wider text-text-primary/65">{r.label}</span></span>
                    <span className="font-mono tabular-nums text-xs text-text-primary/75">{r.count} <span className="text-text-primary/30">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-ink/[0.04] rounded-sm overflow-hidden"><div className="h-full transition-all duration-700" style={{ width: `${pct}%`, background: color, opacity: 0.75 }} /></div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-ink/[0.05] text-[10px] text-text-primary/35 leading-relaxed">Risk level inferred from BTC correlation strength, beta volatility, and downside exposure</div>
        </Card>
        <Card className="p-5">
          <div className="flex justify-between items-baseline mb-4">
            <Label>BTC Lead/Lag</Label>
            {sum.lead_lag.avg_hours !== null && <span className="text-[10px] font-mono tabular-nums text-text-primary/40">avg {sum.lead_lag.avg_hours > 0 ? "+" : ""}{sum.lead_lag.avg_hours.toFixed(1)}h</span>}
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <div className="text-center px-2 py-3 rounded-sm bg-ink/[0.02] border border-ink/[0.05]">
              <div className="text-[9px] font-mono uppercase tracking-wider text-profit/70 mb-1">↑ Leads</div>
              <div className="font-mono tabular-nums text-2xl text-text-primary/90">{sum.lead_lag.leads}</div>
              <div className="text-[9px] font-mono text-text-primary/30 mt-1">moves first</div>
            </div>
            <div className="text-center px-2 py-3 rounded-sm bg-ink/[0.02] border border-ink/[0.05]">
              <div className="text-[9px] font-mono uppercase tracking-wider text-text-primary/50 mb-1">◌ Sync</div>
              <div className="font-mono tabular-nums text-2xl text-text-primary/90">{sum.lead_lag.sync}</div>
              <div className="text-[9px] font-mono text-text-primary/30 mt-1">moves with</div>
            </div>
            <div className="text-center px-2 py-3 rounded-sm bg-ink/[0.02] border border-ink/[0.05]">
              <div className="text-[9px] font-mono uppercase tracking-wider text-loss/70 mb-1">↓ Lags</div>
              <div className="font-mono tabular-nums text-2xl text-text-primary/90">{sum.lead_lag.lags}</div>
              <div className="text-[9px] font-mono text-text-primary/30 mt-1">moves after</div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-ink/[0.05] text-[10px] text-text-primary/35 leading-relaxed">Coins that lag BTC tend to follow — entry timing tip: wait for BTC confirmation</div>
        </Card>
      </div>
      <Card className="p-5">
        <div className="flex justify-between items-center mb-4">
          <Label>Beta × Peak — Risk vs Reward</Label>
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-primary/30">{validSignals.length} signals plotted · colored by outcome</span>
        </div>
        <BetaScatter signals={validSignals} />
        <div className="mt-3 text-[10px] text-text-primary/35 text-center font-mono">Right side = higher beta (moves more than BTC). Up = larger peak gain.</div>
      </Card>
      <Card className="p-4">
        <Label className="mb-3">Aggregate Averages</Label>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <AverageStat label="Beta vs BTC" value={sum.averages.beta_30d} hint="1.0 = matches BTC" />
          <AverageStat label="R²" value={sum.averages.r_squared_30d !== null ? sum.averages.r_squared_30d * 100 : null} suffix="%" hint="% explained by BTC" digits={1} />
          <AverageStat label="Vol Ratio" value={sum.averages.volatility_ratio} suffix="×" hint="vs BTC volatility" />
          <AverageStat label="Correlation" value={sum.averages.corr_4h_30d} hint="4h × 30d window" />
          <AverageStat label="Coin Vol" value={sum.averages.coin_volatility_pct} suffix="%" hint="annualized" digits={0} />
        </div>
      </Card>
    </div>
  );
};

// ─── Sector Tab ──────────────────────────────────────────────────

const SectorsTab = ({ signals, filters, addFilter }) => {
  const sectors = useMemo(() => {
    const m = {};
    for (const s of signals || []) {
      const k = s.sector || "uncategorized";
      if (!m[k]) m[k] = { sector: k, total: 0, wins: 0, losses: 0, peaks: [] };
      m[k].total++;
      if (s.outcome?.startsWith("tp")) m[k].wins++;
      if (s.outcome === "sl") m[k].losses++;
      if (s.peak_pct !== null && s.peak_pct !== undefined) m[k].peaks.push(s.peak_pct);
    }
    return Object.values(m).map((m) => ({ ...m, win_rate: m.total ? (m.wins / m.total) * 100 : 0, avg_peak: m.peaks.length ? m.peaks.reduce((a, b) => a + b, 0) / m.peaks.length : 0, max_peak: m.peaks.length ? Math.max(...m.peaks) : 0 })).sort((a, b) => b.total - a.total);
  }, [signals]);
  if (!sectors.length) return <Card className="p-10 text-center"><div className="text-text-primary/30 text-sm font-mono uppercase tracking-wider">No sector data</div></Card>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      {sectors.map((s) => {
        const isActive = filters.sector === s.sector;
        return (
          <button key={s.sector} onClick={() => addFilter("sector", s.sector)} className={`text-left relative rounded-md bg-surface-raised border transition p-5 hover:border-ink/12 ${isActive ? "border-ink/15" : "border-ink/[0.06]"}`}>
            <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(to right, transparent, ${sectorColor(s.sector)}88, transparent)` }} />
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-sm" style={{ background: sectorColor(s.sector) }} />
              <span className="font-mono uppercase tracking-wider text-sm text-text-primary/90">{s.sector}</span>
              {isActive && <span className="text-[9px] text-accent ml-auto">● FILTER</span>}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><Label>Signals</Label><div className="font-mono tabular-nums text-lg text-text-primary/90 mt-1">{s.total}</div></div>
              <div><Label>Win Rate</Label><div className={`font-mono tabular-nums text-lg mt-1 ${s.win_rate >= 75 ? "text-profit" : s.win_rate >= 50 ? "text-text-primary/85" : "text-loss"}`}>{s.win_rate.toFixed(0)}%</div></div>
              <div><Label>Avg Peak</Label><div className={`font-mono tabular-nums text-sm mt-1 ${s.avg_peak > 0 ? "text-profit/85" : s.avg_peak < 0 ? "text-loss/85" : "text-text-primary/50"}`}>{s.avg_peak > 0 ? "+" : ""}{s.avg_peak.toFixed(2)}%</div></div>
              <div><Label>Max Peak</Label><div className="font-mono tabular-nums text-sm text-profit/85 mt-1">{s.max_peak > 0 ? "+" : ""}{s.max_peak.toFixed(2)}%</div></div>
            </div>
            <div className="h-1.5 rounded-sm overflow-hidden bg-ink/[0.04] flex">
              <div className="h-full bg-profit/60" style={{ width: `${(s.wins / s.total) * 100}%` }} title={`${s.wins} wins`} />
              <div className="h-full bg-red-400/60" style={{ width: `${(s.losses / s.total) * 100}%` }} title={`${s.losses} losses`} />
            </div>
            <div className="flex justify-between text-[10px] font-mono tabular-nums text-text-primary/40 mt-1.5"><span>{s.wins}W</span><span>{s.losses}L</span></div>
          </button>
        );
      })}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// ─── Today's Edge Tab (v7 NEW) ───────────────────────────────────
// ════════════════════════════════════════════════════════════════

const pickDominantTag = (signal) => {
  const tags = (signal.important_tags || []).filter((t) => !t.startsWith("BTC_"));
  return tags[0] || null;
};

const LossAutopsy = ({ signals }) => {
  const analysis = useMemo(() => {
    const losers = signals.filter((s) => s.outcome === "sl");
    const winners = signals.filter((s) => s.outcome?.startsWith("tp"));
    const totalLosers = losers.length, totalWinners = winners.length;
    if (totalLosers === 0) return { losers: 0, winners: totalWinners, tagStats: [], coverageOk: false };
    const lc = {}, wc = {};
    for (const s of losers) for (const tag of s.important_tags || []) { if (tag.startsWith("BTC_")) continue; lc[tag] = (lc[tag] || 0) + 1; }
    for (const s of winners) for (const tag of s.important_tags || []) { if (tag.startsWith("BTC_")) continue; wc[tag] = (wc[tag] || 0) + 1; }
    const allTags = new Set([...Object.keys(lc), ...Object.keys(wc)]);
    const stats = Array.from(allTags).map((tag) => {
      const inLosers = lc[tag] || 0, inWinners = wc[tag] || 0;
      const loserFreq = totalLosers ? (inLosers / totalLosers) * 100 : 0;
      const winnerFreq = totalWinners ? (inWinners / totalWinners) * 100 : 0;
      return { tag, inLosers, inWinners, loserFreq, winnerFreq, lift: loserFreq - winnerFreq };
    });
    stats.sort((a, b) => b.inLosers !== a.inLosers ? b.inLosers - a.inLosers : Math.abs(b.lift) - Math.abs(a.lift));
    const coverageOk = losers.some((s) => (s.important_tags || []).length > 0);
    return { losers: totalLosers, winners: totalWinners, tagStats: stats, coverageOk };
  }, [signals]);

  if (analysis.losers === 0) return (
    <Card className="p-5">
      <div className="flex justify-between items-center mb-4"><Label>Loss Autopsy</Label><span className="text-[10px] font-mono uppercase tracking-wider text-profit/70">zero losses today</span></div>
      <div className="py-8 text-center"><div className="text-profit/80 text-base font-mono mb-1">No SL hits today ✓</div><div className="text-text-primary/40 text-xs font-mono">Clean session — all resolved signals reached at least TP1</div></div>
    </Card>
  );
  if (!analysis.coverageOk) return (
    <Card className="p-5">
      <div className="flex justify-between items-center mb-4"><Label>Loss Autopsy</Label><span className="text-[10px] font-mono uppercase tracking-wider text-text-primary/40">{analysis.losers} loss{analysis.losers !== 1 ? "es" : ""}</span></div>
      <div className="py-6 text-center text-text-primary/35 text-xs font-mono">Losers on this date have no enrichment tags — pre-v3.0 signals</div>
    </Card>
  );
  const top = analysis.tagStats.filter((s) => s.inLosers > 0).slice(0, 6);
  const maxFreq = Math.max(...top.map((s) => s.loserFreq), 1);
  return (
    <Card className="p-5">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2"><Label>Loss Autopsy</Label><SmallSampleBadge n={analysis.losers} threshold={5} /></div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-primary/40">{analysis.losers} loss{analysis.losers !== 1 ? "es" : ""} · {analysis.winners} win{analysis.winners !== 1 ? "s" : ""}</span>
      </div>
      <div className="text-xs text-text-primary/55 mb-4 leading-relaxed">Tags most frequently associated with stopped-out signals today, compared with their frequency in winners.</div>
      <div className="space-y-3">
        {top.map((s) => {
          const barPct = (s.loserFreq / maxFreq) * 100;
          const isBad = s.lift > 15, isGood = s.lift < -15;
          return (
            <div key={s.tag}>
              <div className="flex justify-between items-baseline mb-1 gap-3 flex-wrap">
                <span className="flex items-center gap-2">
                  <span className="text-xs font-mono text-text-primary/85">{s.tag}</span>
                  {isBad && <span className="text-[9px] font-mono uppercase tracking-wider text-loss/80 bg-loss/10 border border-loss/20 rounded-sm px-1.5 py-0.5">bad signal</span>}
                  {isGood && <span className="text-[9px] font-mono uppercase tracking-wider text-profit/80 bg-profit/10 border border-profit/20 rounded-sm px-1.5 py-0.5">good signal</span>}
                </span>
                <span className="font-mono tabular-nums text-[10px] text-text-primary/50">{s.inLosers}/{analysis.losers} losers ({s.loserFreq.toFixed(0)}%)<span className="text-text-primary/30 mx-1.5">vs</span>{s.inWinners}/{analysis.winners} winners ({s.winnerFreq.toFixed(0)}%)</span>
              </div>
              <div className="h-1.5 bg-ink/[0.04] rounded-sm overflow-hidden flex"><div className="h-full bg-red-400/60 transition-all duration-700" style={{ width: `${barPct}%` }} /></div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

const SetupCombinations = ({ signals }) => {
  const combos = useMemo(() => {
    const map = {};
    for (const s of signals) {
      const sector = s.sector || "uncategorized";
      const tag = pickDominantTag(s);
      if (!tag) continue;
      const key = `${sector}|${tag}`;
      if (!map[key]) map[key] = { key, sector, pattern: tag, signals: [], wins: 0, losses: 0, total_peak: 0 };
      const c = map[key];
      c.signals.push(s);
      c.total_peak += s.peak_pct || 0;
      if (s.outcome?.startsWith("tp")) c.wins++;
      if (s.outcome === "sl") c.losses++;
    }
    const arr = Object.values(map).filter((c) => c.signals.length >= 2).map((c) => ({ ...c, total: c.signals.length, win_rate: c.signals.length ? (c.wins / c.signals.length) * 100 : 0, avg_peak: c.signals.length ? c.total_peak / c.signals.length : 0 }));
    const best = arr.filter((c) => c.win_rate >= 75).sort((a, b) => b.total - a.total || b.avg_peak - a.avg_peak);
    const worst = arr.filter((c) => c.win_rate <= 25).sort((a, b) => b.total - a.total || a.avg_peak - b.avg_peak);
    return { all: arr, best, worst };
  }, [signals]);
  const hasEnrichment = signals.some((s) => (s.important_tags || []).length > 0);
  if (!hasEnrichment) return <Card className="p-5"><Label>Today's Best/Worst Setups</Label><div className="mt-6 py-6 text-center text-text-primary/35 text-xs font-mono">No pattern tags available — signals on this date predate v3.0 enrichment</div></Card>;
  if (combos.best.length === 0 && combos.worst.length === 0) return <Card className="p-5"><Label>Today's Best/Worst Setups</Label><div className="mt-6 py-6 text-center text-text-primary/35 text-xs font-mono normal-case leading-relaxed">No setup combinations have ≥2 signals with consistent outcomes today.<br /><span className="text-text-primary/25">Mixed results — no clear winning or losing combos.</span></div></Card>;
  const Row = ({ c, kind }) => (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-sm border ${kind === "best" ? "bg-profit/[0.05] border-profit/20" : "bg-red-500/[0.05] border-loss/20"}`}>
      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: sectorColor(c.sector) }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap"><span className="text-[11px] font-mono uppercase tracking-wider text-text-primary/85">{c.sector}</span><span className="text-text-primary/25 text-[10px]">+</span><span className="text-[11px] font-mono text-text-primary/85 break-all">{c.pattern}</span></div>
        <div className="text-[10px] font-mono tabular-nums text-text-primary/45">{c.wins}W / {c.losses}L · avg <span className={c.avg_peak > 0 ? "text-profit/80" : "text-loss/80"}>{c.avg_peak > 0 ? "+" : ""}{c.avg_peak.toFixed(2)}%</span></div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className={`font-mono tabular-nums text-base ${kind === "best" ? "text-profit" : "text-loss"}`}>{c.win_rate.toFixed(0)}%</div>
        <div className="text-[9px] font-mono tabular-nums text-text-primary/40">{c.total} signal{c.total !== 1 ? "s" : ""}</div>
      </div>
    </div>
  );
  return (
    <Card className="p-5">
      <div className="flex justify-between items-center mb-4"><Label>Today's Best/Worst Setups</Label><span className="text-[10px] font-mono uppercase tracking-wider text-text-primary/30">sector × pattern combos</span></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-profit/70 mb-2.5">⚡ Winning combos</div>
          {combos.best.length === 0 ? <div className="text-[11px] font-mono text-text-primary/30 italic py-3">No combos with ≥75% win rate today</div> : <div className="space-y-2">{combos.best.slice(0, 5).map((c) => <Row key={c.key} c={c} kind="best" />)}</div>}
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-loss/70 mb-2.5">⚠ Losing combos</div>
          {combos.worst.length === 0 ? <div className="text-[11px] font-mono text-text-primary/30 italic py-3">No combos with ≤25% win rate today</div> : <div className="space-y-2">{combos.worst.slice(0, 5).map((c) => <Row key={c.key} c={c} kind="worst" />)}</div>}
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-ink/[0.05] text-[10px] text-text-primary/35 leading-relaxed">Combos with ≥2 signals and ≥75% / ≤25% win rate. Dominant pattern picked alphabetically per signal.</div>
    </Card>
  );
};

const PatternByOutcomeMatrix = ({ signals }) => {
  const matrix = useMemo(() => {
    const map = {};
    for (const s of signals) for (const tag of s.important_tags || []) {
      if (tag.startsWith("BTC_")) continue;
      if (!map[tag]) map[tag] = { tag, tp4: 0, tp3: 0, tp2: 0, tp1: 0, sl: 0, total: 0 };
      if (map[tag][s.outcome] !== undefined) { map[tag][s.outcome]++; map[tag].total++; }
    }
    return Object.values(map).filter((m) => m.total >= 2).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [signals]);
  if (matrix.length === 0) return <Card className="p-5"><Label>Pattern × Outcome Distribution</Label><div className="mt-6 py-6 text-center text-text-primary/35 text-xs font-mono">No patterns with ≥2 signals today</div></Card>;
  return (
    <Card className="p-5 overflow-hidden">
      <div className="flex justify-between items-center mb-4"><Label>Pattern × Outcome Distribution</Label><span className="text-[10px] font-mono uppercase tracking-wider text-text-primary/30">top {matrix.length} patterns</span></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-ink/[0.06]">
            <th className="text-left px-2 py-2 text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40 font-normal">Pattern</th>
            {["tp4", "tp3", "tp2", "tp1", "sl"].map((o) => <th key={o} className="text-center px-2 py-2 text-[10px] tracking-[0.2em] font-mono uppercase font-normal" style={{ color: OUTCOME_COLORS[o] }}>{o.toUpperCase()}</th>)}
            <th className="text-right px-2 py-2 text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40 font-normal">Total</th>
          </tr></thead>
          <tbody>
            {matrix.map((m) => (
              <tr key={m.tag} className="border-b border-ink/[0.03]">
                <td className="px-2 py-2 font-mono text-xs text-text-primary/85">{m.tag}</td>
                {["tp4", "tp3", "tp2", "tp1", "sl"].map((o) => {
                  const v = m[o], pct = m.total ? (v / m.total) * 100 : 0;
                  return <td key={o} className="px-2 py-2 text-center">{v > 0 ? <div className="inline-flex items-center justify-center w-7 h-7 rounded-sm font-mono tabular-nums text-xs text-text-primary/90" style={{ background: OUTCOME_COLORS[o], opacity: 0.35 + (pct / 100) * 0.55 }}>{v}</div> : <span className="text-text-primary/15 text-xs">·</span>}</td>;
                })}
                <td className="px-2 py-2 text-right font-mono tabular-nums text-xs text-text-primary/60">{m.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 pt-3 border-t border-ink/[0.05] text-[10px] text-text-primary/35 leading-relaxed">Color intensity = % of signals with that pattern ending in that outcome. Patterns with ≥2 signals only.</div>
    </Card>
  );
};

const TodaysEdgeTab = ({ signals }) => {
  if (!signals?.length) return <Card className="p-10 text-center"><div className="text-text-primary/30 text-sm font-mono uppercase tracking-wider">No signals to analyze</div></Card>;
  return (
    <div className="space-y-5">
      <LossAutopsy signals={signals} />
      <SetupCombinations signals={signals} />
      <PatternByOutcomeMatrix signals={signals} />
    </div>
  );
};

// ─── Signal Row ──────────────────────────────────────────────────

const SignalRow = ({ s, onClick }) => {
  const peakPos = (s.peak_pct ?? 0) > 0, peakNeg = (s.peak_pct ?? 0) < 0;
  const outcomeChip = (o) => {
    if (!o) return { cls: "bg-ink/[0.04] text-text-primary/50 border-ink/[0.08]", label: "—" };
    if (o === "sl") return { cls: "bg-loss/15 text-loss border-loss/25", label: "SL" };
    if (o === "tp4") return { cls: "bg-profit/15 text-profit border-profit/25", label: "TP4" };
    if (o === "tp3") return { cls: "bg-profit/10 text-profit border-profit/25", label: "TP3" };
    if (o === "tp2") return { cls: "bg-profit/8 text-profit/85 border-profit/20", label: "TP2" };
    if (o === "tp1") return { cls: "bg-profit/5 text-profit/75 border-profit/25", label: "TP1" };
    return { cls: "bg-ink/[0.04] text-text-primary/50 border-ink/[0.08]", label: o.toUpperCase() };
  };
  const ot = outcomeChip(s.outcome);
  return (
    <tr onClick={() => onClick(s)} className="border-b border-ink/[0.04] hover:bg-ink/[0.02] cursor-pointer transition">
      <td className="px-4 py-2.5">
        <span className="inline-flex items-center gap-2">
          <CoinLogo pair={s.pair} size={18} />
          <span className="font-mono text-sm text-text-primary/90">{coinSym(s.pair)}</span>
        </span>
      </td>
      <td className="px-3 py-2.5"><span className={`inline-flex px-2 py-0.5 rounded-sm border text-[10px] font-mono tracking-wider ${ot.cls}`}>{ot.label}</span></td>
      <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: sectorColor(s.sector) }} /><span className="text-[11px] font-mono uppercase tracking-wider text-text-primary/55">{s.sector || "—"}</span></span></td>
      <td className="px-3 py-2.5">{s.signal_direction === "BULLISH" ? <span className="text-profit text-xs font-mono">↑ LONG</span> : s.signal_direction === "BEARISH" ? <span className="text-loss text-xs font-mono">↓ SHORT</span> : <span className="text-text-primary/20 text-xs">—</span>}</td>
      <td className={`px-3 py-2.5 text-right font-mono tabular-nums text-sm ${peakPos ? "text-profit" : peakNeg ? "text-loss" : "text-text-primary/40"}`}>{s.peak_pct !== null && s.peak_pct !== undefined ? `${peakPos ? "+" : ""}${s.peak_pct.toFixed(2)}%` : "—"}</td>
      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-text-primary/40 text-xs">{s.outcome_at ? new Date(s.outcome_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) : "—"}</td>
    </tr>
  );
};

// ─── Top Signals List ────────────────────────────────────────────

const TopSignalsList = ({ signals, onPickSignal, onShowAll }) => {
  const preview = signals.slice(0, 10);
  const remaining = signals.length - preview.length;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-ink/[0.06]"><Label>Top Signals · {signals.length} matching</Label><div className="text-[10px] font-mono uppercase tracking-wider text-text-primary/30">click any row to view detail</div></div>
      {preview.length === 0 ? (
        <div className="p-10 text-center text-text-primary/30 text-sm font-mono uppercase tracking-wider">No signals match current filters</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-ink/[0.06]">
                <th className="text-left px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40 font-normal">Pair</th>
                <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40 font-normal">Outcome</th>
                <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40 font-normal">Sector</th>
                <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40 font-normal">Side</th>
                <th className="text-right px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40 font-normal">Peak %</th>
                <th className="text-right px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40 font-normal">Hit At</th>
              </tr></thead>
              <tbody>{preview.map((s) => <SignalRow key={s.signal_id} s={s} onClick={onPickSignal} />)}</tbody>
            </table>
          </div>
          {remaining > 0 && <div className="border-t border-ink/[0.06] p-3 flex justify-center"><button onClick={onShowAll} className="px-4 py-2 rounded-sm text-[11px] font-mono uppercase tracking-wider text-accent border border-ink/12 hover:bg-accent/12 transition">Show all {signals.length} signals →</button></div>}
        </>
      )}
    </Card>
  );
};

// ─── All Signals Modal ───────────────────────────────────────────

const AllSignalsModal = ({ open, onClose, signals, onPickSignal }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-scrim/70 backdrop-blur-sm flex items-end justify-center sm:items-center p-0 sm:p-4" onClick={onClose}>
      <div className="relative w-full max-w-5xl max-h-[min(92dvh,100%)] rounded-t-3xl sm:rounded-2xl bg-surface-raised border-t border-ink/[0.08] sm:border flex flex-col shadow-[0_-20px_60px_rgb(var(--scrim) / 0.35)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 justify-center pt-2.5 pb-0 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-ink/25" />
        </div>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink/12 to-transparent" />
        <div className="flex items-center justify-between p-5 border-b border-ink/[0.06]">
          <div><div className="text-[10px] tracking-[0.25em] font-mono uppercase text-text-muted">· All Filtered Signals ·</div><div className="text-lg text-text-primary/90 mt-0.5">{signals?.length || 0} signals</div></div>
          <button onClick={onClose} className="w-8 h-8 rounded-sm border border-ink/[0.08] text-text-primary/60 hover:text-text-primary hover:border-ink/20 transition flex items-center justify-center">✕</button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-raised z-10"><tr className="border-b border-ink/[0.06]">
              <th className="text-left px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40 font-normal">Pair</th>
              <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40 font-normal">Outcome</th>
              <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40 font-normal">Sector</th>
              <th className="text-left px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40 font-normal">Side</th>
              <th className="text-right px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40 font-normal">Peak %</th>
              <th className="text-right px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40 font-normal">Hit At</th>
            </tr></thead>
            <tbody>{signals?.map((s) => <SignalRow key={s.signal_id} s={s} onClick={(sig) => { onPickSignal(sig); onClose(); }} />)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────────

const DailyPerformancePage = ({ activeTab: controlledTab, onTabChange, hideTabBar } = {}) => {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(todayUTC());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ outcome: null, sector: null, pattern: null, btc_trend: null });
  const [internalTab, setInternalTab] = useState("overview");
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = onTabChange ?? setInternalTab;
  const [showAllModal, setShowAllModal] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [loadingSignal, setLoadingSignal] = useState(false);

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

  useEffect(() => { fetchData(selectedDate); }, [selectedDate, fetchData]);
  useEffect(() => { setFilters({ outcome: null, sector: null, pattern: null, btc_trend: null }); }, [selectedDate]);

  const addFilter = useCallback((key, value) => { setFilters((prev) => ({ ...prev, [key]: prev[key] === value ? null : value })); }, []);
  const removeFilter = useCallback((key) => { setFilters((prev) => ({ ...prev, [key]: null })); }, []);
  const clearFilters = useCallback(() => { setFilters({ outcome: null, sector: null, pattern: null, btc_trend: null }); }, []);

  const allSignals = data?.day_detail?.signals || [];

  const filteredSignals = useMemo(() => {
    return allSignals.filter((s) => {
      if (filters.outcome && s.outcome !== filters.outcome) return false;
      if (filters.sector && s.sector !== filters.sector) return false;
      if (filters.btc_trend) { const btcTag = `BTC_${filters.btc_trend}`; if (!(s.important_tags || []).includes(btcTag)) return false; }
      if (filters.pattern) { if (!(s.important_tags || []).includes(filters.pattern)) return false; }
      return true;
    });
  }, [allSignals, filters]);

  const hasFilters = Object.values(filters).some((v) => v !== null);

  const handlePickSignal = useCallback(async (signalSummary) => {
    setLoadingSignal(true);
    try {
      const full = await signalsApi.getSignal(signalSummary.signal_id);
      setSelectedSignal(full);
    } catch (err) {
      console.error("Failed to load signal detail:", err);
      setSelectedSignal(signalSummary);
    } finally {
      setLoadingSignal(false);
    }
  }, []);

  const dateMax = todayUTC();
  const dateMin = useMemo(() => { const d = new Date(dateMax + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 89); return d.toISOString().slice(0, 10); }, [dateMax]);

  const summary = data?.today_summary;
  const detail = data?.day_detail;
  const enrichmentCoverage = detail?.context?.enrichment_coverage || 0;
  const enrichmentTotal = detail?.context?.enrichment_total || 0;
  const dailyRegime = summary?.daily_regime;
  const correlationSummary = detail?.context?.correlation_summary;

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-8">

      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight">Daily Performance</h1>
          <p className="text-sm text-text-primary/45 mt-1">Interactive analytics · click any chart to filter · click any pair for detail</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* v7: Edge Lab button (placeholder until Deliverable B) */}
          <button
            onClick={() => navigate("/daily-performance/edge-lab")}
            className="px-3 py-2 rounded-md bg-surface-secondary border border-ink/12 text-[10px] tracking-[0.2em] font-mono uppercase text-accent hover:bg-accent/12 hover:border-ink/18 transition flex items-center gap-2"
            title="Multi-day analytics: pattern × BTC heatmap, EV, calendar WR"
          >
            <span>Open Edge Lab</span><span className="text-[8px]">→</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-surface-raised border border-ink/[0.08]">
            <Label>Date</Label>
            <input type="date" value={selectedDate} min={dateMin} max={dateMax} onChange={(e) => setSelectedDate(e.target.value)} className="bg-transparent text-text-primary/85 font-mono tabular-nums text-sm focus:outline-none" />
          </div>
          <button onClick={() => fetchData(selectedDate)} disabled={loading} className="px-3 py-2 rounded-md bg-surface-raised border border-ink/[0.08] text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/60 hover:border-ink/12 hover:text-text-primary transition disabled:opacity-50">{loading ? "..." : "Refresh"}</button>
        </div>
      </div>

      <FilterChipsBar filters={filters} onRemove={removeFilter} onClear={clearFilters} totalUnfiltered={allSignals.length} totalFiltered={filteredSignals.length} />

      {data && <CoverageBanner coverage={enrichmentCoverage} total={enrichmentTotal} dailyRegime={dailyRegime} hasFilters={hasFilters} />}

      {error && <Card className="p-5 mb-6 border-loss/20"><div className="text-sm text-loss"><Label className="text-loss/80 mb-1">· Error ·</Label>{error}</div></Card>}

      {loading && !data && (
        <div className="space-y-4">
          <div className="h-64 rounded-xl bg-surface-raised border border-ink/[0.07] animate-pulse" />
          <div className="grid grid-cols-5 gap-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-surface-raised border border-ink/[0.07] animate-pulse" />)}</div>
        </div>
      )}

      {data && (
        <div className="space-y-5">
          <HeroSection signals={filteredSignals} totalUnfiltered={allSignals.length} summary={summary} correlationSummary={correlationSummary} selectedDate={selectedDate} hasFilters={hasFilters} />
          <KpiRow signals={filteredSignals} />
          {!hideTabBar && (
          <div className="mt-8"><TabSwitcher active={activeTab} onChange={setActiveTab} /></div>
          )}
          <div className="mt-5">
            {activeTab === "overview" && <OverviewTab signals={filteredSignals} detail={detail?.context} summary={summary} filters={filters} addFilter={addFilter} />}
            {activeTab === "patterns" && <PatternsTab signals={filteredSignals} filters={filters} addFilter={addFilter} />}
            {activeTab === "correlation" && <CorrelationTab signals={filteredSignals} correlationSummary={correlationSummary} />}
            {activeTab === "sectors" && <SectorsTab signals={filteredSignals} filters={filters} addFilter={addFilter} />}
            {activeTab === "edge" && <TodaysEdgeTab signals={filteredSignals} />}
          </div>
          <SectionHeader label="SIGNALS" />
          <TopSignalsList signals={filteredSignals} onPickSignal={handlePickSignal} onShowAll={() => setShowAllModal(true)} />
        </div>
      )}

      <AllSignalsModal open={showAllModal} onClose={() => setShowAllModal(false)} signals={filteredSignals} onPickSignal={handlePickSignal} />

      {selectedSignal && <SignalModal signal={selectedSignal} isOpen={!!selectedSignal} onClose={() => setSelectedSignal(null)} />}

      {loadingSignal && (
        <div className="fixed bottom-6 right-6 z-50 bg-surface-raised border border-ink/12 rounded-md px-4 py-2 flex items-center gap-3">
          <div className="w-3 h-3 border border-ink/12 border-t-accent rounded-full animate-spin" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-text-primary/70">Loading signal...</span>
        </div>
      )}
    </div>
  );
};

export default DailyPerformancePage;