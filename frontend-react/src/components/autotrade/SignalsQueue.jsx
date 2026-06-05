// src/components/autotrade/SignalsQueue.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade Trade History
// Executed trades history based on potential trades, using demo data
// ════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import CoinLogo from "../CoinLogo";

function fmtNum(n, d = 4) {
  if (n === null || n === undefined) return "—";
  return Number(n).toFixed(d);
}

function fmtPrice(n) {
  if (n === null || n === undefined) return "—";
  const value = Number(n);
  if (!Number.isFinite(value)) return String(n);
  if (value >= 1000)
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(4);
  return value.toFixed(6);
}

function fmtDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const DEMO_HISTORY = [
  {
    id: "TH-9001",
    pair: "BTCUSDT",
    side: "buy",
    market_type: "futures",
    status: "TP4 Win",
    outcome: "tp4",
    source: "Potential Trades",
    entry: 68210.5,
    exit: 69488.2,
    pnl_pct: 1.87,
    duration: "4h 12m",
    risk_level: "Normal",
    created_at: "2026-05-29T01:12:00Z",
    executed_at: "2026-05-29T01:18:00Z",
    reason: "Trend breakout with volume confirmation",
  },
  {
    id: "TH-9002",
    pair: "ETHUSDT",
    side: "buy",
    market_type: "spot",
    status: "TP2",
    outcome: "tp2",
    source: "Potential Trades",
    entry: 3628.4,
    exit: 3716.9,
    pnl_pct: 2.44,
    duration: "2h 46m",
    risk_level: "Low",
    created_at: "2026-05-29T03:05:00Z",
    executed_at: "2026-05-29T03:11:00Z",
    reason: "EMA reclaim and liquidity sweep",
  },
  {
    id: "TH-9003",
    pair: "SOLUSDT",
    side: "sell",
    market_type: "futures",
    status: "SL",
    outcome: "sl",
    source: "Potential Trades",
    entry: 171.42,
    exit: 168.9,
    pnl_pct: -1.47,
    duration: "51m",
    risk_level: "High",
    created_at: "2026-05-29T05:22:00Z",
    executed_at: "2026-05-29T05:29:00Z",
    reason: "Failed breakdown with quick reversal",
  },
  {
    id: "TH-9004",
    pair: "XRPUSDT",
    side: "buy",
    market_type: "spot",
    status: "TP1",
    outcome: "tp1",
    source: "Potential Trades",
    entry: 0.5231,
    exit: 0.5318,
    pnl_pct: 1.66,
    duration: "1h 13m",
    risk_level: "Normal",
    created_at: "2026-05-29T07:40:00Z",
    executed_at: "2026-05-29T07:45:00Z",
    reason: "Range expansion after base build",
  },
  {
    id: "TH-9005",
    pair: "AVAXUSDT",
    side: "buy",
    market_type: "futures",
    status: "TP3",
    outcome: "tp3",
    source: "Potential Trades",
    entry: 44.8,
    exit: 47.2,
    pnl_pct: 5.36,
    duration: "3h 02m",
    risk_level: "Low",
    created_at: "2026-05-29T09:04:00Z",
    executed_at: "2026-05-29T09:09:00Z",
    reason: "Momentum continuation on higher timeframe support",
  },
];

const riskStyle = (risk) => {
  const r = (risk || "").toLowerCase();
  if (r.startsWith("high"))
    return "bg-red-500/10 text-red-400 border-red-500/25";
  if (r.startsWith("med") || r.startsWith("nor"))
    return "bg-gold-primary/10 text-gold-primary border-gold-primary/25";
  if (r.startsWith("low"))
    return "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
  return "bg-white/[0.04] text-white/70 border-white/[0.08]";
};

const riskLabel = (risk) => {
  const r = (risk || "").toLowerCase();
  if (r.startsWith("high")) return "High";
  if (r.startsWith("med") || r.startsWith("nor")) return "Normal";
  if (r.startsWith("low")) return "Low";
  return risk || "—";
};

const outcomeTone = (outcome) => {
  if (outcome === "sl") return "danger";
  if (
    outcome === "tp1" ||
    outcome === "tp2" ||
    outcome === "tp3" ||
    outcome === "tp4"
  )
    return "success";
  return "neutral";
};

// ════════════════════════════════════════════════════════════════
// SECTION HEADER
// ════════════════════════════════════════════════════════════════
const SectionHeader = ({ label }) => (
  <div className="flex items-center gap-3">
    <span className="h-px w-6 bg-gold-primary/40" />
    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
      {label}
    </span>
    <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/20 to-transparent" />
  </div>
);

export default function SignalsQueue() {
  const [marketFilter, setMarketFilter] = useState("all");
  const [sortMode, setSortMode] = useState("latest");

  const stats = useMemo(() => {
    const total = DEMO_HISTORY.length;
    const wins = DEMO_HISTORY.filter((trade) => trade.pnl_pct > 0).length;
    const futures = DEMO_HISTORY.filter(
      (trade) => trade.market_type === "futures",
    ).length;
    const spot = DEMO_HISTORY.filter(
      (trade) => trade.market_type === "spot",
    ).length;
    const avgPnl =
      DEMO_HISTORY.reduce((sum, trade) => sum + trade.pnl_pct, 0) / total;
    return { total, wins, futures, spot, avgPnl };
  }, []);

  const trades = useMemo(() => {
    const filtered = DEMO_HISTORY.filter(
      (trade) => marketFilter === "all" || trade.market_type === marketFilter,
    );

    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === "pnl") return b.pnl_pct - a.pnl_pct;
      if (sortMode === "pair") return a.pair.localeCompare(b.pair);
      return (
        new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime()
      );
    });

    return sorted;
  }, [marketFilter, sortMode]);

  return (
    <div className="space-y-4">
      <SectionHeader label="Trade History" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Executed" value={stats.total} sub="dummy history" />
        <MetricCard
          label="Win rate"
          value={`${Math.round((stats.wins / stats.total) * 100)}%`}
          sub={`${stats.wins} wins`}
        />
        <MetricCard
          label="Avg PnL"
          value={`${stats.avgPnl >= 0 ? "+" : ""}${stats.avgPnl.toFixed(2)}%`}
          sub="per executed trade"
        />
        <MetricCard
          label="Split"
          value={`${stats.spot} spot / ${stats.futures} fut`}
          sub="market mix"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0805]">
        <div className="flex flex-col gap-4 border-b border-white/[0.06] px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-white text-sm font-semibold tracking-tight">
              Executed Trade Signals
            </h3>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/70 mt-1">
              Based on potential trades, but seeded with demo executions for
              easy browsing
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={marketFilter}
              onChange={(e) => setMarketFilter(e.target.value)}
              className="px-3 py-2 bg-[#120809] border border-white/[0.06] rounded-md text-white text-sm font-mono focus:outline-none focus:border-gold-primary/40"
            >
              <option value="all">All markets</option>
              <option value="spot">Spot</option>
              <option value="futures">Futures</option>
            </select>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value)}
              className="px-3 py-2 bg-[#120809] border border-white/[0.06] rounded-md text-white text-sm font-mono focus:outline-none focus:border-gold-primary/40"
            >
              <option value="latest">Latest</option>
              <option value="pnl">Best PnL</option>
              <option value="pair">Pair</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-black/20 text-text-muted/80">
              <tr>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em]">
                  Pair
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em]">
                  Market
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em]">
                  Side
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em]">
                  Outcome
                </th>
                <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                  Entry
                </th>
                <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                  Exit
                </th>
                <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                  PnL
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em]">
                  Reason
                </th>
                <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                  Executed
                </th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr
                  key={trade.id}
                  className="border-t border-white/[0.06] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-3 text-white">
                    <div className="flex items-center gap-3 min-w-0">
                      <CoinLogo pair={trade.pair} size={30} />
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold truncate">
                          {trade.pair}
                        </p>
                        <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/60 truncate">
                          {trade.source}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[9px] font-mono uppercase tracking-[0.1em] border ${trade.market_type === "spot" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" : "bg-gold-primary/10 text-gold-primary border-gold-primary/25"}`}
                    >
                      {trade.market_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[9px] font-mono uppercase tracking-[0.1em] border ${trade.side === "buy" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" : "bg-red-500/10 text-red-400 border-red-500/25"}`}
                    >
                      {trade.side}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[9px] font-mono uppercase tracking-[0.1em] border ${outcomeTone(trade.outcome) === "danger" ? "bg-red-500/10 text-red-400 border-red-500/25" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"}`}
                    >
                      {trade.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-white font-mono tabular-nums">
                    {fmtPrice(trade.entry)}
                  </td>
                  <td className="px-4 py-3 text-right text-white font-mono tabular-nums">
                    {fmtPrice(trade.exit)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    <span
                      className={
                        trade.pnl_pct >= 0 ? "text-emerald-400" : "text-red-400"
                      }
                    >
                      {trade.pnl_pct >= 0 ? "+" : ""}
                      {fmtNum(trade.pnl_pct, 2)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    <p className="text-white/85 text-sm line-clamp-1">
                      {trade.reason}
                    </p>
                    <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/60 mt-0.5">
                      {trade.risk_level} risk
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right text-white font-mono text-sm whitespace-nowrap">
                    {fmtDate(trade.executed_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const MetricCard = ({ label, value, sub }) => (
  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
    <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-muted/60 mb-1">
      {label}
    </p>
    <p className="text-white font-semibold text-xl tabular-nums">{value}</p>
    {sub && (
      <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/60 mt-1">
        {sub}
      </p>
    )}
  </div>
);
