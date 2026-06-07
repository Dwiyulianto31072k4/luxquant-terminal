// src/components/EdgeLabPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Edge Lab (multi-day analytics) — v3 UX rebuild
// Route: /daily-performance/edge-lab
// Header mirrors Market Pulse (left-aligned eyebrow + gradient title).
// Drill: Calendar + Timing cells → drawer → SignalModal (Level 3).
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { edgeLabApi } from "../services/edgeLabApi";

import PatternCalibrationTab from "./edgelab/PatternCalibrationTab";
import PatternBtcHeatmapTab from "./edgelab/PatternBtcHeatmapTab";
import ExpectedValueTab from "./edgelab/ExpectedValueTab";
import CalendarHeatmapTab from "./edgelab/CalendarHeatmapTab";
import HourDowHeatmapTab from "./edgelab/HourDowHeatmapTab";
import SignalDrillDrawer from "./edgelab/SignalDrillDrawer";
import SignalModal from "./SignalModal";

const TAB_ITEMS = [
  { id: "calibration", label: "Calibration" },
  { id: "btc_heatmap", label: "Pattern × BTC" },
  { id: "ev", label: "Expected Value" },
  { id: "calendar", label: "Calendar" },
  { id: "timing", label: "Timing" },
];

const RANGE_OPTIONS = [
  { value: 7, label: "7D" },
  { value: 30, label: "30D" },
  { value: 90, label: "90D" },
];

const SECTOR_OPTIONS = [
  "all", "defi", "ai", "gamefi", "infrastructure",
  "hype", "payments", "rwa", "privacy", "socialfi", "other",
];

// ─── KPI tile ────────────────────────────────────────────────────
const Kpi = ({ label, value, sub, valueColor, subColor }) => (
  <div className="relative rounded-lg bg-[#0c0a07] border border-white/[0.07] px-4 py-3.5">
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/40">{label}</div>
    <div className={`text-xl lg:text-[1.7rem] font-mono tabular-nums mt-1 leading-none truncate ${valueColor || "text-white/95"}`}>
      {value}
    </div>
    <div className={`text-[10px] tracking-[0.12em] font-mono uppercase mt-1.5 ${subColor || "text-white/40"}`}>{sub}</div>
  </div>
);

const EdgeLabPage = () => {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [sector, setSector] = useState("all");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("calibration");
  const [drillBucket, setDrillBucket] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);

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

  useEffect(() => { fetchData(days, sector); }, [days, sector, fetchData]);

  const totals = data?.totals;
  const enrichmentPct = totals?.enrichment_pct ?? null;
  const corrPct = totals?.correlation_pct ?? null;
  const lowCoverage = enrichmentPct !== null && enrichmentPct < 30;
  const resolved = totals?.signals_resolved ?? null;

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-8 space-y-6">
      {/* ═══ PAGE HEADER — mirrors Market Pulse (eyebrow + gradient title, left-aligned) ═══ */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button
            onClick={() => navigate("/daily-performance")}
            className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-white/40 hover:text-white/75 transition mb-3"
          >
            ← Daily Performance
          </button>

          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-primary/70 mb-2">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-primary/40 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold-primary/80" />
            </span>
            <span>Multi-Day Analytics</span>
          </div>

          <h1
            className="text-2xl sm:text-3xl font-semibold tracking-tight leading-none"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.7) 60%, rgba(212,168,83,0.85) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Edge Lab
          </h1>

          <p className="text-sm text-text-muted/70 mt-2">
            Pattern reliability, expected value &amp; timing across{" "}
            <span className="text-white/85 font-mono tabular-nums">
              {resolved != null ? resolved.toLocaleString() : "—"}
            </span>{" "}
            resolved signals
          </p>
        </div>

        {/* controls */}
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          <div className="flex items-center rounded-md overflow-hidden border border-white/[0.08]">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setDays(r.value)}
                className={`px-3.5 py-2 text-[10px] tracking-[0.18em] font-mono uppercase transition ${
                  days === r.value ? "bg-gold-primary/12 text-gold-primary" : "text-white/50 hover:text-white"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#0c0a07] border border-white/[0.08]">
            <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/40">Sector</span>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="bg-transparent text-white/85 font-mono text-sm focus:outline-none cursor-pointer uppercase tracking-wider [color-scheme:dark]"
            >
              {SECTOR_OPTIONS.map((s) => (
                <option key={s} value={s} className="bg-[#0c0a07] text-white">{s}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => fetchData(days, sector)}
            disabled={loading}
            className="px-3 py-2 rounded-md bg-[#0c0a07] border border-white/[0.08] text-[10px] tracking-[0.18em] font-mono uppercase text-white/55 hover:border-gold-primary/30 hover:text-gold-primary transition disabled:opacity-50"
          >
            {loading ? "···" : "Refresh"}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg p-5 border border-red-500/20 bg-red-500/[0.03] text-sm text-red-300">
          <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-red-400/80 mb-1">· Error ·</div>
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-[88px] rounded-lg bg-[#0c0a07] border border-white/[0.06] animate-pulse" />
            ))}
          </div>
          <div className="h-12 rounded-lg bg-[#0c0a07] border border-white/[0.06] animate-pulse" />
          <div className="h-96 rounded-lg bg-[#0c0a07] border border-white/[0.06] animate-pulse" />
        </div>
      )}

      {data && (
        <div className="space-y-5">
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi
              label="Resolved"
              value={(totals?.signals_resolved ?? 0).toLocaleString()}
              sub={`${data.date_range.start} → ${data.date_range.end}`}
            />
            <Kpi
              label="Win Rate"
              value={totals?.win_rate != null ? `${totals.win_rate.toFixed(2)}%` : "—"}
              sub={`${(totals?.wins ?? 0).toLocaleString()}W / ${(totals?.losses ?? 0).toLocaleString()}L`}
              valueColor={totals?.win_rate >= 75 ? "text-emerald-400" : totals?.win_rate >= 50 ? "text-white/95" : "text-red-400"}
            />
            <Kpi
              label="Enrichment"
              value={enrichmentPct != null ? `${enrichmentPct.toFixed(0)}%` : "—"}
              sub="v3.0 tagged"
              subColor={lowCoverage ? "text-amber-400/70" : "text-white/40"}
            />
            <Kpi
              label="Correlation"
              value={corrPct != null ? `${corrPct.toFixed(0)}%` : "—"}
              sub="BTC β coverage"
            />
          </div>

          {/* coverage note — inline, thin */}
          {lowCoverage && (
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-md border border-amber-500/15 bg-amber-500/[0.03] text-[11px]">
              <span className="text-amber-400/80">⚠</span>
              <span className="text-white/60">
                <span className="text-amber-300/90 font-mono uppercase tracking-wider text-[10px] mr-1.5">
                  Sparse enrichment ({enrichmentPct?.toFixed(0)}%)
                </span>
                Pattern-based tabs reflect only v3.0-tagged signals. Calendar &amp; Timing remain fully accurate.
              </span>
            </div>
          )}

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-white/[0.07] overflow-x-auto">
            {TAB_ITEMS.map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
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

          <div>
            {activeTab === "calibration" && <PatternCalibrationTab data={data.pattern_calibration} />}
            {activeTab === "btc_heatmap" && <PatternBtcHeatmapTab data={data.pattern_btc_heatmap} />}
            {activeTab === "ev" && <ExpectedValueTab data={data.pattern_ev} />}
            {activeTab === "calendar" && <CalendarHeatmapTab data={data.calendar_wr} onDrill={setDrillBucket} />}
            {activeTab === "timing" && <HourDowHeatmapTab data={data.hour_dow_heatmap} onDrill={setDrillBucket} />}
          </div>
        </div>
      )}

      {/* ─── Level 2: drill drawer (global, renders null when no bucket) ─── */}
      <SignalDrillDrawer
        bucket={drillBucket}
        days={days}
        sector={sector}
        onClose={() => setDrillBucket(null)}
        onOpenSignal={(signalId, signalObj) =>
          setSelectedSignal(signalObj || { signal_id: signalId })
        }
      />

      {/* ─── Level 3: full signal modal (same pattern as SignalsTable) ─── */}
      <SignalModal
        signal={selectedSignal}
        isOpen={!!selectedSignal}
        onClose={() => setSelectedSignal(null)}
      />
    </div>
  );
};

export default EdgeLabPage;
