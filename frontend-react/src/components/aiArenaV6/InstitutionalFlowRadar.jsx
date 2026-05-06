// frontend-react/src/components/aiArenaV6/InstitutionalFlowRadar.jsx
//
// Institutional Flow Radar — Spot BTC ETFs + Coinbase Premium
// ============================================================
// Adopted from AI Arena v4 — adds visibility into institutional money flow.
//
// Data source: GET /api/v1/ai-arena/etf-flows
// Shape (from etf_flows.py / fetch_etf_summary):
//   {
//     flows: {
//       last_date, last_total, last_per_fund: {IBIT, FBTC, ...},
//       top_contributors: [{fund, flow}, ...],
//       history_7d: [{date, total, per_fund}, ...],
//       streak: {direction: 'inflow'|'outflow', days: N},
//       cumulative_7d, cumulative_30d
//     },
//     coinbase_premium: { coinbase_price, binance_price, premium_pct, signal }
//   }
//
// Refresh: live (component-level fetch), 10min server-side cache.
// Decoupled from verdict cycle — this is "current institutional context".

import { useEffect, useState, useMemo } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ── Helpers ───────────────────────────────────────────
const fmtMoney = (millions) => {
  if (millions == null || isNaN(millions)) return "—";
  const sign = millions >= 0 ? "+" : "−";
  const abs = Math.abs(millions);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}B`;
  return `${sign}$${abs.toFixed(1)}M`;
};

const fmtPct = (pct) => {
  if (pct == null || isNaN(pct)) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(3)}%`;
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    const [y, m, d] = iso.split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(m)-1]} ${parseInt(d)}`;
  } catch {
    return iso;
  }
};

// Premium signal interpretation
const premiumColor = (pct) => {
  if (pct == null) return "text-text-muted";
  if (pct > 0.05) return "text-green-400";
  if (pct < -0.05) return "text-red-400";
  return "text-text-muted";
};

const premiumLabel = (signal, pct) => {
  if (signal === "bullish" || (pct != null && pct > 0.05)) return "US Buying Pressure";
  if (signal === "bearish" || (pct != null && pct < -0.05)) return "US Selling Pressure";
  return "Neutral";
};

// ── Mini bar chart for 7-day history ──────────────────
const FlowHistoryBars = ({ history }) => {
  const data = useMemo(() => {
    if (!Array.isArray(history) || history.length === 0) return [];
    const max = Math.max(...history.map(h => Math.abs(h.total || 0)), 1);
    return history.map(h => ({
      date: h.date,
      total: h.total || 0,
      pct: ((h.total || 0) / max) * 100,
    }));
  }, [history]);

  if (!data.length) {
    return <div className="text-text-muted text-xs">No flow history available</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Bar row — fixed height, bars sit at bottom, label below */}
      <div className="flex items-end justify-between gap-1.5" style={{ height: 120 }}>
        {data.map((d, i) => {
          const isPositive = d.total >= 0;
          const heightPx = Math.max((Math.abs(d.pct) / 100) * 120, 4); // bar fills 0-120px, min 4px so even zero shows
          return (
            <div
              key={`${d.date}-bar-${i}`}
              className={`flex-1 min-w-0 rounded-sm transition-all ${
                isPositive
                  ? "bg-gradient-to-t from-green-600/70 to-green-400/90"
                  : "bg-gradient-to-t from-red-600/70 to-red-400/90"
              }`}
              style={{ height: `${heightPx}px` }}
              title={`${d.date}: ${fmtMoney(d.total)}`}
            />
          );
        })}
      </div>
      {/* Label row — same flex layout to align with bars above */}
      <div className="flex items-start justify-between gap-1.5">
        {data.map((d, i) => (
          <span
            key={`${d.date}-label-${i}`}
            className="flex-1 min-w-0 text-[9px] font-mono text-text-muted text-center truncate"
          >
            {fmtDate(d.date).split(" ")[1]}
          </span>
        ))}
      </div>
    </div>
  );
};

// ── Top contributors chips ────────────────────────────
const ContributorChip = ({ fund, flow }) => {
  const positive = flow >= 0;
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono border ${
        positive
          ? "bg-green-500/10 border-green-500/20 text-green-300"
          : "bg-red-500/10 border-red-500/20 text-red-300"
      }`}
    >
      <span className="font-bold tracking-wide">{fund}</span>
      <span className="opacity-80">{fmtMoney(flow)}</span>
    </div>
  );
};

// ── Main component ────────────────────────────────────
export default function InstitutionalFlowRadar() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/api/v1/ai-arena/etf-flows`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message || "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ── Loading ──
  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 border border-gold-primary/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-6 bg-gradient-to-b from-gold-primary to-gold-primary/30 rounded" />
          <h2 className="font-display text-xl text-white">Institutional Flow Radar</h2>
        </div>
        <div className="h-32 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // ── Error / no data ──
  if (error || !data || (!data.flows && !data.coinbase_premium)) {
    return (
      <div className="glass-card rounded-2xl p-6 border border-gold-primary/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-1 h-6 bg-gradient-to-b from-gold-primary to-gold-primary/30 rounded" />
          <h2 className="font-display text-xl text-white">Institutional Flow Radar</h2>
        </div>
        <div className="text-text-muted text-sm py-4">
          {error ? `Could not load flow data: ${error}` : "No flow data available."}
          <button
            onClick={fetchData}
            className="ml-3 px-3 py-1 text-[10px] uppercase tracking-wider rounded border border-gold-primary/30 text-gold-primary hover:bg-gold-primary/10 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const flows = data.flows || {};
  const premium = data.coinbase_premium || {};

  const lastTotal = flows.last_total;
  const isPositive = lastTotal != null && lastTotal >= 0;
  const streak = flows.streak || {};
  const streakDir = streak.direction;
  const streakDays = streak.days || 0;
  const cum7d = flows.cumulative_7d;
  const premiumPct = premium.premium_pct;

  return (
    <div className="glass-card rounded-2xl p-6 border border-gold-primary/10">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-gradient-to-b from-gold-primary to-gold-primary/30 rounded" />
          <div>
            <h2 className="font-display text-xl text-white leading-tight">
              Institutional Flow Radar
            </h2>
            <p className="text-text-muted text-[11px] mt-0.5 tracking-wide">
              Spot BTC ETFs · Coinbase Premium
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted font-mono">
            Last: {fmtDate(flows.last_date)}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase border bg-gold-primary/10 border-gold-primary/30 text-gold-primary">
            Live
          </span>
        </div>
      </div>

      {/* Top metrics — 4 columns */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {/* Today's net flow */}
        <div className="bg-bg-card/50 rounded-xl p-3 border border-white/5">
          <div className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-1">
            Today's Net Flow
          </div>
          <div
            className={`font-mono text-xl font-bold ${
              isPositive ? "text-green-400" : "text-red-400"
            }`}
          >
            {fmtMoney(lastTotal)}
          </div>
          <div className="text-[10px] text-text-muted mt-0.5">
            {flows.last_date || "—"}
          </div>
        </div>

        {/* Streak */}
        <div className="bg-bg-card/50 rounded-xl p-3 border border-white/5">
          <div className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-1">
            Current Streak
          </div>
          <div
            className={`font-mono text-xl font-bold flex items-baseline gap-1 ${
              streakDir === "inflow" ? "text-green-400" : "text-red-400"
            }`}
          >
            {streakDays}d
            <span className="text-xs opacity-70">
              {streakDir === "inflow" ? "↑" : "↓"}
            </span>
          </div>
          <div className="text-[10px] text-text-muted mt-0.5 capitalize">
            {streakDir || "—"}
          </div>
        </div>

        {/* 7D cumulative */}
        <div className="bg-bg-card/50 rounded-xl p-3 border border-white/5">
          <div className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-1">
            7D Cumulative
          </div>
          <div
            className={`font-mono text-xl font-bold ${
              cum7d != null && cum7d >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {fmtMoney(cum7d)}
          </div>
          <div className="text-[10px] text-text-muted mt-0.5">past 7 days</div>
        </div>

        {/* Coinbase Premium */}
        <div className="bg-bg-card/50 rounded-xl p-3 border border-white/5">
          <div className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-1">
            Coinbase Premium
          </div>
          <div className={`font-mono text-xl font-bold ${premiumColor(premiumPct)}`}>
            {fmtPct(premiumPct)}
          </div>
          <div className="text-[10px] text-text-muted mt-0.5 capitalize">
            {premiumLabel(premium.signal, premiumPct)}
          </div>
        </div>
      </div>

      {/* 7-day history bars */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] uppercase tracking-widest text-text-muted font-bold">
            Last 7 Days
          </span>
          <span className="text-[9px] text-text-muted font-mono">
            in millions USD
          </span>
        </div>
        <FlowHistoryBars history={flows.history_7d} />
      </div>

      {/* Top contributors */}
      {Array.isArray(flows.top_contributors) && flows.top_contributors.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-2">
            Top Contributors Today
          </div>
          <div className="flex flex-wrap gap-2">
            {flows.top_contributors.map((c, i) => (
              <ContributorChip key={`${c.fund}-${i}`} fund={c.fund} flow={c.flow} />
            ))}
          </div>
        </div>
      )}

      {/* Narrative footer */}
      <div className="mt-5 pt-4 border-t border-white/5">
        <p className="text-[11px] text-text-muted leading-relaxed">
          {(() => {
            const flowDir = isPositive ? "Inflows" : "Outflows";
            const flowStrength =
              Math.abs(lastTotal || 0) > 500
                ? "strong"
                : Math.abs(lastTotal || 0) > 100
                ? "moderate"
                : "muted";
            const premPart =
              premiumPct == null
                ? ""
                : premiumPct > 0.05
                ? "with positive Coinbase Premium suggesting US institutional buying."
                : premiumPct < -0.05
                ? "with negative Coinbase Premium hinting at US-side selling pressure."
                : "with neutral Coinbase Premium — no strong directional bias from US flows.";
            const streakNarr =
              streakDays >= 3
                ? ` Streak of ${streakDays}d ${streakDir} reinforces the trend.`
                : "";
            return `${flowDir} are ${flowStrength} today (${fmtMoney(lastTotal)}) ${premPart}${streakNarr}`;
          })()}
        </p>
      </div>
    </div>
  );
}
