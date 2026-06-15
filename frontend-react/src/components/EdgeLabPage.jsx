// src/components/EdgeLabPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Edge Lab (multi-day analytics) — v5
//   · Pulse-style header, KPI cards (Win Rate sparkline+delta, Top Edge)
//   · Tabs: Calibration · Pattern×BTC · EV · Calendar · Timing · Coins
//   · Drill on every tab → centered modal → SignalModal (full detail)
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from "react";
import { edgeLabApi } from "../services/edgeLabApi";

import PatternCalibrationTab from "./edgelab/PatternCalibrationTab";
import PatternBtcHeatmapTab from "./edgelab/PatternBtcHeatmapTab";
import ExpectedValueTab from "./edgelab/ExpectedValueTab";
import CalendarHeatmapTab from "./edgelab/CalendarHeatmapTab";
import HourDowHeatmapTab from "./edgelab/HourDowHeatmapTab";
import CoinLeaderboardTab from "./edgelab/CoinLeaderboardTab";
import WrVsBtcTab from "./edgelab/WrVsBtcTab";
import SignalDrillDrawer from "./edgelab/SignalDrillDrawer";
import SignalModal from "./SignalModal";

const TAB_ITEMS = [
  { id: "calibration", label: "Calibration" },
  { id: "btc_heatmap", label: "Pattern × BTC" },
  { id: "ev", label: "Expected Value" },
  { id: "calendar", label: "Calendar" },
  { id: "timing", label: "Timing" },
  { id: "coins", label: "Coins" },
  { id: "wrbtc", label: "WR \u00d7 BTC" },
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

// ─── Sparkline (inline SVG, area + line, trend-colored) ──────────
const Sparkline = ({ values, up }) => {
  if (!values || values.length < 2) return null;
  const W = 132, H = 30, pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return [x, y];
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
  const stroke = up ? "#10b981" : "#ef4444";
  const last = pts[pts.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <path d={area} fill={stroke} fillOpacity="0.10" />
      <path d={line} fill="none" stroke={stroke} strokeOpacity="0.85" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={stroke} />
    </svg>
  );
};

// ─── KPI tile ────────────────────────────────────────────────────
const Kpi = ({ label, value, sub, valueColor, valueClass, children }) => (
  <div className="relative rounded-lg bg-[#0c0a07] border border-white/[0.07] px-4 py-3.5 flex flex-col">
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/40">{label}</div>
    <div className={`font-mono tabular-nums mt-1 leading-none truncate ${valueClass || "text-xl lg:text-[1.7rem]"} ${valueColor || "text-white/95"}`}>
      {value}
    </div>
    {children}
    {sub && <div className="text-[10px] tracking-[0.12em] font-mono uppercase mt-1.5 text-white/40">{sub}</div>}
  </div>
);

const EdgeLabPage = ({ activeTab: controlledTab, onTabChange, hideTabBar } = {}) => {
  const [days, setDays] = useState(30);
  const [sector, setSector] = useState("all");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [internalTab, setInternalTab] = useState("calibration");
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = onTabChange ?? setInternalTab;
  const [drillBucket, setDrillBucket] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [openingId, setOpeningId] = useState(null);

  // Drill cards carry only a partial signal (6 fields). SignalModal reads some
  // fields straight off the prop (target1..4, stop, entry_chart_url…), so we
  // fetch the full detail first, then hand SignalModal a complete object —
  // identical to opening from SignalsTable.
  const openSignal = useCallback(async (signalId, partial) => {
    if (!signalId) return;
    setOpeningId(signalId);
    try {
      const token = localStorage.getItem("access_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const r = await fetch(`/api/v1/signals/detail/${signalId}`, { headers });
      if (r.ok) {
        const full = await r.json();
        setSelectedSignal({ ...partial, ...full });
      } else {
        setSelectedSignal(partial || { signal_id: signalId });
      }
    } catch {
      setSelectedSignal(partial || { signal_id: signalId });
    } finally {
      setOpeningId(null);
    }
  }, []);

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
  const corrPct = totals?.correlation_pct ?? null;
  const resolved = totals?.signals_resolved ?? null;
  const wr = totals?.win_rate ?? null;

  const wrTrend = useMemo(() => {
    const days_ = (data?.calendar_wr || []).filter((d) => d.total > 0 && d.win_rate != null);
    const vals = days_.map((d) => d.win_rate);
    let delta = null;
    if (vals.length >= 4) {
      const half = Math.floor(vals.length / 2);
      const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
      delta = avg(vals.slice(half)) - avg(vals.slice(0, half));
    }
    return { vals, delta };
  }, [data]);

  const topEdge = useMemo(() => {
    const ev = data?.pattern_ev || [];
    const trusted = ev.filter((p) => p.reliability !== "unreliable" && p.expected_value != null);
    const pool = trusted.length ? trusted : ev.filter((p) => p.expected_value != null);
    return [...pool].sort((a, b) => b.expected_value - a.expected_value)[0] || null;
  }, [data]);

  const wrColorCls = wr >= 75 ? "text-emerald-400" : wr >= 50 ? "text-white/95" : "text-red-400";

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-8 space-y-6">
      {/* ═══ HEADER ═══ */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
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
              <div key={i} className="h-[110px] rounded-lg bg-[#0c0a07] border border-white/[0.06] animate-pulse" />
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
              label="Win Rate"
              value={wr != null ? `${wr.toFixed(2)}%` : "—"}
              valueColor={wrColorCls}
              sub={`${(totals?.wins ?? 0).toLocaleString()}W / ${(totals?.losses ?? 0).toLocaleString()}L`}
            >
              <div className="flex items-end justify-between gap-2 mt-2">
                <Sparkline values={wrTrend.vals} up={(wrTrend.delta ?? 0) >= 0} />
                {wrTrend.delta != null && (
                  <span
                    className={`text-[10px] font-mono tabular-nums shrink-0 ${wrTrend.delta >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    title="second half vs first half of range"
                  >
                    {wrTrend.delta >= 0 ? "▲" : "▼"} {Math.abs(wrTrend.delta).toFixed(1)}pp
                  </span>
                )}
              </div>
            </Kpi>

            <Kpi
              label="Resolved"
              value={(totals?.signals_resolved ?? 0).toLocaleString()}
              sub={`${data.date_range.start} → ${data.date_range.end}`}
            />

            <Kpi
              label="Top Edge"
              value={topEdge ? topEdge.pattern : "—"}
              valueClass="text-sm lg:text-base"
              valueColor="text-gold-primary"
              sub={topEdge ? `+${topEdge.expected_value?.toFixed(1)}% / trade · n=${topEdge.count}` : "no positive edge"}
            />

            <Kpi
              label="Correlation"
              value={corrPct != null ? `${corrPct.toFixed(0)}%` : "—"}
              sub="BTC β coverage"
            />
          </div>

          {/* Tabs */}
          {!hideTabBar && (
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
          )}

          <div>
            {activeTab === "calibration" && <PatternCalibrationTab data={data.pattern_calibration} onDrill={setDrillBucket} />}
            {activeTab === "btc_heatmap" && <PatternBtcHeatmapTab data={data.pattern_btc_heatmap} onDrill={setDrillBucket} />}
            {activeTab === "ev" && <ExpectedValueTab data={data.pattern_ev} onDrill={setDrillBucket} />}
            {activeTab === "calendar" && <CalendarHeatmapTab data={data.calendar_wr} onDrill={setDrillBucket} />}
            {activeTab === "timing" && <HourDowHeatmapTab data={data.hour_dow_heatmap} onDrill={setDrillBucket} />}
            {activeTab === "coins" && <CoinLeaderboardTab data={data.coin_leaderboard} onDrill={setDrillBucket} />}
            {activeTab === "wrbtc" && <WrVsBtcTab onDrill={setDrillBucket} />}
          </div>
        </div>
      )}

      {/* ─── Level 2: drill modal (hidden while a signal is open) ─── */}
      <SignalDrillDrawer
        bucket={drillBucket}
        days={days}
        sector={sector}
        hidden={!!selectedSignal}
        openingId={openingId}
        onClose={() => setDrillBucket(null)}
        onOpenSignal={(signalId, signalObj) => openSignal(signalId, signalObj)}
      />

      {/* ─── Level 3: full signal modal ─── */}
      <SignalModal
        signal={selectedSignal}
        isOpen={!!selectedSignal}
        onClose={() => setSelectedSignal(null)}
      />
    </div>
  );
};

export default EdgeLabPage;
