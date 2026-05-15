// src/components/autotrade/PnLSummary.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade PnL Summary v2 (Flowscan reskin)
// 4 stat cards: Today PnL · Win Rate · Open Positions · Net PnL
// ════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { getPortfolioSummary } from "../../services/autotradeApi";

function fmtUsd(n) {
  const v = Number(n || 0);
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}


// ════════════════════════════════════════════════════════════════
// STAT CARD — Flowscan-exact pattern (hairline + top accent)
// ════════════════════════════════════════════════════════════════
function StatCard({ label, value, sublabel, tone = "neutral" }) {
  // tone: 'neutral' | 'gold' | 'positive' | 'negative'
  const valueColor = {
    neutral: "text-white",
    gold: "text-gold-primary",
    positive: "text-emerald-400",
    negative: "text-red-400",
  }[tone];

  return (
    <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
      {/* Top hairline accent */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

      <div className="relative z-10">
        <div className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-mono mb-2">
          {label}
        </div>
        <div className={`text-xl sm:text-2xl font-mono tabular-nums mb-1.5 truncate ${valueColor}`}>
          {value}
        </div>
        {sublabel && (
          <div className="text-[10px] font-mono text-text-muted/70 truncate">
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function PnLSummary() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const r = await getPortfolioSummary();
      setSummary(r);
    } catch {
      // Silent fail — not critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md p-4"
          >
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/20 to-transparent" />
            <div className="h-3 bg-white/[0.04] rounded w-1/2 mb-3 animate-pulse" />
            <div className="h-6 bg-white/[0.05] rounded w-2/3 animate-pulse mb-2" />
            <div className="h-2.5 bg-white/[0.03] rounded w-1/3 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!summary) return null;

  // ── Determine tone based on values (only gold/neutral when zero) ──
  const todayTone =
    summary.today_net_pnl > 0 ? "positive" :
    summary.today_net_pnl < 0 ? "negative" : "neutral";

  const netTone =
    summary.net_pnl > 0 ? "positive" :
    summary.net_pnl < 0 ? "negative" : "neutral";

  const winRateTone =
    summary.total_wins + summary.total_losses === 0 ? "neutral" :
    summary.win_rate >= 55 ? "positive" :
    summary.win_rate >= 45 ? "gold" : "negative";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        label="Today PnL"
        value={fmtUsd(summary.today_net_pnl)}
        sublabel={`${summary.today_trades_closed} ${
          summary.today_trades_closed === 1 ? "trade" : "trades"
        } closed`}
        tone={todayTone}
      />

      <StatCard
        label="Win Rate"
        value={`${summary.win_rate.toFixed(1)}%`}
        sublabel={`${summary.total_wins}W · ${summary.total_losses}L`}
        tone={winRateTone}
      />

      <StatCard
        label="Open Positions"
        value={summary.open_positions}
        sublabel={`${summary.active_accounts} active ${
          summary.active_accounts === 1 ? "account" : "accounts"
        }`}
        tone={summary.open_positions > 0 ? "gold" : "neutral"}
      />

      <StatCard
        label="Net PnL"
        value={fmtUsd(summary.net_pnl)}
        sublabel={`after ${fmtUsd(summary.total_fees_paid)} fees`}
        tone={netTone}
      />
    </div>
  );
}
