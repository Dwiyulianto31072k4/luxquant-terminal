// src/components/EdgeLabPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Edge Lab (multi-day analytics) — v5
// · Pulse-style header, KPI cards (Win Rate sparkline+delta, Top Edge)
// · Tabs: Calibration · Pattern×BTC · EV · Calendar · Timing · Coins
// · Drill on every tab → centered modal → SignalModal (full detail)
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
import { PageHeader } from "./ui/PageHeader";

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
  "all",
  "defi",
  "ai",
  "gamefi",
  "infrastructure",
  "hype",
  "payments",
  "rwa",
  "privacy",
  "socialfi",
  "other",
];

// ─── Sparkline (inline SVG, area + line, trend-colored) ──────────
const Sparkline = ({ values, up }) => {
  if (!values || values.length < 2) return null;
  const W = 132,
    H = 30,
    pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return [x, y];
  });
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
  const stroke = up ? "#10b981" : "#ef4444";
  const last = pts[pts.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <path d={area} fill={stroke} fillOpacity="0.10" />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeOpacity="0.85"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2" fill={stroke} />
    </svg>
  );
};

// ─── KPI tile ────────────────────────────────────────────────────
const Kpi = ({ label, value, sub, valueColor, valueClass, children }) => (
  <div className="relative rounded-xl bg-surface-raised border border-ink/[0.07] px-4 py-3.5 flex flex-col">
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
    <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40">
      {label}
    </div>
    <div
      className={`font-mono tabular-nums mt-1 leading-none truncate ${valueClass || "text-xl lg:text-[1.7rem]"} ${valueColor || "text-text-primary/95"}`}
    >
      {value}
    </div>
    {children}
    {sub && (
      <div className="text-[10px] tracking-[0.12em] font-mono uppercase mt-1.5 text-text-primary/40">
        {sub}
      </div>
    )}
  </div>
);

// ─── Per-research-tab identity ───────────────────────────────────
// Each research tab answers a different question, so it opens with its own
// header (icon + title + intent) plus a slim shared range-context strip —
// not the same 4-KPI block on every tab.

const RGlyph = ({ d, circles }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-[18px] w-[18px]"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {d && <path d={d} />}
    {circles}
  </svg>
);

const RESEARCH_TAB_META = {
  calibration: {
    title: "Calibration",
    intent: "Are the win-rate claims trustworthy — predicted vs realized by pattern.",
    glyph: <RGlyph d="M12 3a9 9 0 1 0 9 9 M12 12l5-3 M12 12V6" />,
  },
  btc_heatmap: {
    title: "Pattern × BTC",
    intent: "How each pattern performs across bullish, ranging and bearish BTC regimes.",
    glyph: <RGlyph d="M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z" />,
  },
  ev: {
    title: "Expected Value",
    intent: "Profit per trade — which patterns actually pay after wins and losses.",
    glyph: <RGlyph d="M3 3v18h18 M7 14l3-4 3 3 5-7" />,
  },
  calendar: {
    title: "Calendar",
    intent: "Win rate day by day — spot streaks, droughts and seasonality.",
    glyph: <RGlyph d="M4 5h16v16H4z M4 9h16 M8 3v4 M16 3v4" />,
  },
  timing: {
    title: "Timing",
    intent: "The best hours and weekdays to take entries.",
    glyph: <RGlyph d="M12 3a9 9 0 1 0 9 9 M12 7v5l3 2" />,
  },
  coins: {
    title: "Coins",
    intent: "Per-coin leaderboard — where the edge concentrates.",
    glyph: (
      <RGlyph
        circles={
          <>
            <ellipse cx="12" cy="6" rx="7" ry="3" />
            <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
          </>
        }
      />
    ),
  },
  wrbtc: {
    title: "WR × BTC",
    intent: "Win rate plotted against Bitcoin price over time.",
    glyph: <RGlyph d="M3 17l5-5 3 3 4-6 3 3 3-4" />,
  },
};

const RContextChip = ({ label, value, tone = "muted", cls = "" }) => {
  const toneCls =
    tone === "pos"
      ? "text-profit"
      : tone === "neg"
        ? "text-loss"
        : tone === "accent"
          ? "text-accent"
          : "text-text-primary";
  return (
    <div className="flex min-w-[84px] flex-col rounded-lg border border-ink/[0.07] bg-ink/[0.02] px-2.5 py-1.5">
      <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-text-muted">
        {label}
      </span>
      <span className={`font-mono text-[13px] font-semibold tabular-nums ${toneCls} ${cls}`}>
        {value}
      </span>
    </div>
  );
};

const ResearchTabHeader = ({ tab, wr, wrColorCls, totals, topEdge }) => {
  const meta = RESEARCH_TAB_META[tab] || RESEARCH_TAB_META.calibration;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-ink/[0.07] bg-surface-raised p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent/[0.1] text-accent">
          {meta.glyph}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
            {meta.title}
          </h2>
          <p className="mt-0.5 max-w-lg text-[12px] leading-relaxed text-text-muted">
            {meta.intent}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <RContextChip
          label="Win rate"
          value={wr != null ? `${wr.toFixed(1)}%` : "—"}
          cls={wrColorCls}
        />
        <RContextChip label="Resolved" value={(totals?.signals_resolved ?? 0).toLocaleString()} />
        <RContextChip label="Top edge" value={topEdge ? topEdge.pattern : "—"} tone="accent" />
      </div>
    </div>
  );
};

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

  useEffect(() => {
    fetchData(days, sector);
  }, [days, sector, fetchData]);

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

  const wrColorCls = wr >= 75 ? "text-profit" : wr >= 50 ? "text-text-primary/95" : "text-loss";

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-8 space-y-6">
      {/* ═══ HEADER ═══ */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <PageHeader title="Research" />

          <p className="text-sm text-text-muted/70 mt-2">
            Pattern reliability, expected value &amp; timing across{" "}
            <span className="text-text-primary/85 font-mono tabular-nums">
              {resolved != null ? resolved.toLocaleString() : "—"}
            </span>{" "}
            resolved signals
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          <div className="flex items-center rounded-md overflow-hidden border border-ink/[0.08]">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setDays(r.value)}
                className={`px-3.5 py-2 text-[10px] tracking-[0.18em] font-mono uppercase transition ${
                  days === r.value
                    ? "bg-accent/12 text-accent"
                    : "text-text-primary/50 hover:text-text-primary"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-surface-raised border border-ink/[0.08]">
            <span className="text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40">
              Sector
            </span>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="bg-transparent text-text-primary/85 font-mono text-sm focus:outline-none cursor-pointer uppercase tracking-wider"
            >
              {SECTOR_OPTIONS.map((s) => (
                <option key={s} value={s} className="bg-surface-raised text-text-primary">
                  {s}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => fetchData(days, sector)}
            disabled={loading}
            className="px-3 py-2 rounded-md bg-surface-raised border border-ink/[0.08] text-[10px] tracking-[0.18em] font-mono uppercase text-text-primary/55 hover:border-ink/12 hover:text-accent transition disabled:opacity-50"
          >
            {loading ? "···" : "Refresh"}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg p-5 border border-negative/20 bg-negative/[0.03] text-sm text-loss">
          <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-loss/80 mb-1">
            · Error ·
          </div>
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-[110px] rounded-lg bg-surface-raised border border-ink/[0.06] animate-pulse"
              />
            ))}
          </div>
          <div className="h-12 rounded-lg bg-surface-raised border border-ink/[0.06] animate-pulse" />
          <div className="h-96 rounded-lg bg-surface-raised border border-ink/[0.06] animate-pulse" />
        </div>
      )}

      {data && (
        <div className="space-y-5">
          {/* Per-tab identity header (distinct purpose per research view) */}
          <ResearchTabHeader
            tab={activeTab}
            wr={wr}
            wrColorCls={wrColorCls}
            totals={totals}
            topEdge={topEdge}
          />

          {/* Tabs */}
          {!hideTabBar && (
            <div className="flex items-center gap-1 border-b border-ink/[0.07] overflow-x-auto">
              {TAB_ITEMS.map((t) => {
                const isActive = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`relative px-4 py-3 text-[12px] font-mono uppercase tracking-wider transition whitespace-nowrap ${
                      isActive ? "text-accent" : "text-text-primary/40 hover:text-text-primary/70"
                    }`}
                  >
                    {t.label}
                    {isActive && (
                      <span className="absolute bottom-0 inset-x-3 h-[2px] bg-accent/12" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div>
            {activeTab === "calibration" && (
              <PatternCalibrationTab data={data.pattern_calibration} onDrill={setDrillBucket} />
            )}
            {activeTab === "btc_heatmap" && (
              <PatternBtcHeatmapTab data={data.pattern_btc_heatmap} onDrill={setDrillBucket} />
            )}
            {activeTab === "ev" && (
              <ExpectedValueTab data={data.pattern_ev} onDrill={setDrillBucket} />
            )}
            {activeTab === "calendar" && (
              <CalendarHeatmapTab data={data.calendar_wr} onDrill={setDrillBucket} />
            )}
            {activeTab === "timing" && (
              <HourDowHeatmapTab data={data.hour_dow_heatmap} onDrill={setDrillBucket} />
            )}
            {activeTab === "coins" && (
              <CoinLeaderboardTab data={data.coin_leaderboard} onDrill={setDrillBucket} />
            )}
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
