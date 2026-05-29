// src/components/EdgeLabPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Edge Lab (multi-day analytics)
//
// Route: /daily-performance/edge-lab
//
// 5 panels:
//   1. Pattern Calibration  — Wilson 95% CI on WR per pattern (default)
//   2. Pattern × BTC Heatmap — matrix grid of WR
//   3. Expected Value       — sortable table of EV
//   4. Calendar Heatmap     — GitHub-style daily WR
//   5. Hour × DOW Heatmap   — entry-timing grid
//
// Data source: GET /api/v1/analytics/edge-lab?days={7|30|90}&sector={all|...}
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { edgeLabApi } from "../services/edgeLabApi";

import PatternCalibrationTab from "./edgelab/PatternCalibrationTab";
import PatternBtcHeatmapTab from "./edgelab/PatternBtcHeatmapTab";
import ExpectedValueTab from "./edgelab/ExpectedValueTab";
import CalendarHeatmapTab from "./edgelab/CalendarHeatmapTab";
import HourDowHeatmapTab from "./edgelab/HourDowHeatmapTab";

// ─── Reusable mini components (matched to DailyPerformancePage style) ──

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
    <div className="text-[11px] tracking-[0.25em] text-gold-primary/80 font-mono">· {label} ·</div>
    <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gold-primary/40" />
  </div>
);

// ─── KPI Card ────────────────────────────────────────────────────

const KpiCard = ({ label, value, sub, subColor, valueColor }) => (
  <Card className="px-4 py-3.5">
    <Label>{label}</Label>
    <div className={`text-xl lg:text-2xl font-mono tabular-nums mt-1.5 truncate ${valueColor || "text-white/95"}`}>
      {value}
    </div>
    <div className={`text-[10px] tracking-[0.15em] font-mono uppercase mt-1 ${subColor || "text-white/40"}`}>
      {sub}
    </div>
  </Card>
);

// ─── Tab Switcher ────────────────────────────────────────────────

const TAB_ITEMS = [
  { id: "calibration", label: "Pattern Calibration" },
  { id: "btc_heatmap", label: "Pattern × BTC" },
  { id: "ev",          label: "Expected Value" },
  { id: "calendar",    label: "Calendar WR" },
  { id: "timing",      label: "Hour × DOW" },
];

const TabSwitcher = ({ active, onChange }) => (
  <div className="flex items-center gap-1 border-b border-white/[0.06] overflow-x-auto">
    {TAB_ITEMS.map((t) => {
      const isActive = active === t.id;
      return (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`relative px-4 py-3 text-[12px] font-mono uppercase tracking-wider transition whitespace-nowrap ${
            isActive ? "text-gold-primary" : "text-white/40 hover:text-white/70"
          }`}
        >
          {t.label}
          {isActive && <span className="absolute bottom-0 inset-x-3 h-[2px] bg-gold-primary" />}
        </button>
      );
    })}
  </div>
);

// ─── Range / Sector controls ─────────────────────────────────────

const RANGE_OPTIONS = [
  { value: 7,  label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

const SECTOR_OPTIONS = [
  "all", "defi", "ai", "gamefi", "infrastructure",
  "hype", "payments", "rwa", "privacy", "socialfi", "other",
];

// ─── Main Page ───────────────────────────────────────────────────

const EdgeLabPage = () => {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [sector, setSector] = useState("all");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("calibration");

  const fetchData = useCallback(async (d, s) => {
    setLoading(true);
    setError(null);
    try {
      const res = await edgeLabApi.getEdgeLab(d, s);
      setData(res);
    } catch (err) {
      console.error("Edge Lab fetch failed:", err);
      setError(err?.response?.data?.detail || err?.message || "Failed to load Edge Lab");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(days, sector);
  }, [days, sector, fetchData]);

  const totals = data?.totals;
  const enrichmentPct = totals?.enrichment_pct ?? null;
  const corrPct = totals?.correlation_pct ?? null;

  const lowCoverage = enrichmentPct !== null && enrichmentPct < 30;

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-8">
      <SectionHeader label="EDGE LAB" />

      {/* Header row */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/daily-performance")}
              className="px-2.5 py-1.5 rounded-sm border border-white/[0.08] text-white/55 hover:text-white hover:border-white/20 text-[10px] uppercase tracking-wider transition font-mono"
              title="Back to Daily Performance"
            >
              ← Daily
            </button>
            <h1 className="text-2xl lg:text-3xl font-display text-white/95 tracking-tight">
              Edge Lab
            </h1>
          </div>
          <p className="text-sm text-white/45 mt-1">
            Multi-day analytics · pattern reliability, EV, timing, regime fit
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Range toggle */}
          <div className="flex items-center gap-0 rounded-md overflow-hidden border border-white/[0.08]">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setDays(r.value)}
                className={`px-3 py-2 text-[10px] tracking-[0.2em] font-mono uppercase transition ${
                  days === r.value
                    ? "bg-gold-primary/10 text-gold-primary border-x border-gold-primary/30"
                    : "text-white/55 hover:text-white"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Sector selector */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#0a0805] border border-white/[0.08]">
            <Label>Sector</Label>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="bg-transparent text-white/85 font-mono text-sm focus:outline-none cursor-pointer uppercase tracking-wider [color-scheme:dark]"
            >
              {SECTOR_OPTIONS.map((s) => (
                <option key={s} value={s} className="bg-[#0a0805] text-white">
                  {s}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => fetchData(days, sector)}
            disabled={loading}
            className="px-3 py-2 rounded-md bg-[#0a0805] border border-white/[0.08] text-[10px] tracking-[0.2em] font-mono uppercase text-white/60 hover:border-gold-primary/30 hover:text-gold-primary transition disabled:opacity-50"
          >
            {loading ? "..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Coverage warning */}
      {!loading && data && lowCoverage && (
        <Card className="px-4 py-3 mb-5 border-amber-500/20 bg-amber-500/[0.03]">
          <div className="flex items-start gap-3">
            <span className="text-amber-400 mt-0.5">⚠</span>
            <div className="flex-1 text-xs text-white/75">
              <span className="text-amber-300 font-mono uppercase tracking-wider text-[10px]">
                Sparse enrichment coverage ({enrichmentPct?.toFixed(0)}%)
              </span>
              <div className="mt-1 text-white/55">
                Pattern-based panels reflect only signals with v3.0 enrichment tags. Calendar &
                timing panels remain fully accurate.
              </div>
            </div>
          </div>
        </Card>
      )}

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 rounded-md bg-[#0a0805] border border-white/[0.06] animate-pulse" />
            ))}
          </div>
          <div className="h-96 rounded-md bg-[#0a0805] border border-white/[0.06] animate-pulse" />
        </div>
      )}

      {data && (
        <div className="space-y-5">
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Resolved"
              value={totals?.signals_resolved ?? 0}
              sub={`${data.date_range.start} → ${data.date_range.end}`}
            />
            <KpiCard
              label="Win Rate"
              value={totals?.win_rate !== null ? `${totals.win_rate.toFixed(2)}%` : "—"}
              sub={`${totals?.wins ?? 0}W / ${totals?.losses ?? 0}L`}
              valueColor={
                totals?.win_rate >= 75
                  ? "text-emerald-400"
                  : totals?.win_rate >= 50
                  ? "text-white/95"
                  : "text-red-400"
              }
            />
            <KpiCard
              label="Enrichment"
              value={enrichmentPct !== null ? `${enrichmentPct.toFixed(0)}%` : "—"}
              sub="v3.0 tagged"
              subColor={lowCoverage ? "text-amber-400/60" : "text-white/40"}
            />
            <KpiCard
              label="Correlation"
              value={corrPct !== null ? `${corrPct.toFixed(0)}%` : "—"}
              sub="BTC β coverage"
            />
          </div>

          {/* Tabs */}
          <div className="mt-8">
            <TabSwitcher active={activeTab} onChange={setActiveTab} />
          </div>

          <div className="mt-5">
            {activeTab === "calibration" && (
              <PatternCalibrationTab data={data.pattern_calibration} />
            )}
            {activeTab === "btc_heatmap" && (
              <PatternBtcHeatmapTab data={data.pattern_btc_heatmap} />
            )}
            {activeTab === "ev" && <ExpectedValueTab data={data.pattern_ev} />}
            {activeTab === "calendar" && <CalendarHeatmapTab data={data.calendar_wr} />}
            {activeTab === "timing" && <HourDowHeatmapTab data={data.hour_dow_heatmap} />}
          </div>
        </div>
      )}
    </div>
  );
};

export default EdgeLabPage;
