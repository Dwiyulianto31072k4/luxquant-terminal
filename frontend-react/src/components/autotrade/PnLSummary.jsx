// src/components/autotrade/PnLSummary.jsx
import { useState, useEffect } from "react";
import { getPortfolioSummary } from "../../services/autotradeApi";

function fmtUsd(n) {
  const v = Number(n || 0);
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
}

const IconUp = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
  </svg>
);
const IconDown = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" />
  </svg>
);
const IconWallet = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
  </svg>
);
const IconTrophy = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0116.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 01-3.52 1.122h-1.5a6.023 6.023 0 01-3.52-1.122" />
  </svg>
);
const IconChart = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
  </svg>
);
const IconLayers = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />
  </svg>
);

function StatCard({ icon, label, value, sub, color = "#d4a853", trend }) {
  return (
    <div className="relative bg-bg-card border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-colors overflow-hidden">
      {/* Subtle gradient accent */}
      <div
        className="absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl opacity-20"
        style={{ background: color }}
      />

      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
          >
            {icon}
          </div>
          {trend !== undefined && trend !== 0 && (
            <span
              className="flex items-center gap-1 text-[11px] font-semibold"
              style={{ color: trend > 0 ? "#10b981" : "#ef4444" }}
            >
              {trend > 0 ? <IconUp /> : <IconDown />}
            </span>
          )}
        </div>
        <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1">
          {label}
        </p>
        <p className="text-xl md:text-2xl font-display font-bold" style={{ color }}>
          {value}
        </p>
        {sub && <p className="text-[11px] text-text-muted mt-1">{sub}</p>}
      </div>
    </div>
  );
}

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
    const t = setInterval(load, 30000); // Refresh every 30s
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-bg-card border border-white/5 rounded-2xl p-4 animate-pulse">
            <div className="w-9 h-9 bg-white/5 rounded-xl mb-3" />
            <div className="h-3 bg-white/5 rounded w-2/3 mb-2" />
            <div className="h-6 bg-white/5 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const todayColor = summary.today_net_pnl >= 0 ? "#10b981" : "#ef4444";
  const totalColor = summary.net_pnl >= 0 ? "#10b981" : "#ef4444";
  const winRateColor =
    summary.win_rate >= 55 ? "#10b981" :
    summary.win_rate >= 45 ? "#d4a853" : "#ef4444";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      <StatCard
        icon={<IconChart />}
        label="Today PnL"
        value={fmtUsd(summary.today_net_pnl)}
        sub={`${summary.today_trades_closed} trades closed`}
        color={todayColor}
        trend={summary.today_net_pnl}
      />
      <StatCard
        icon={<IconTrophy />}
        label="Win Rate"
        value={`${summary.win_rate.toFixed(1)}%`}
        sub={`${summary.total_wins}W / ${summary.total_losses}L`}
        color={winRateColor}
      />
      <StatCard
        icon={<IconLayers />}
        label="Open Positions"
        value={summary.open_positions}
        sub={`${summary.active_accounts} active accounts`}
        color="#d4a853"
      />
      <StatCard
        icon={<IconWallet />}
        label="Net PnL"
        value={fmtUsd(summary.net_pnl)}
        sub={`after $${summary.total_fees_paid.toFixed(2)} fees`}
        color={totalColor}
        trend={summary.net_pnl}
      />
    </div>
  );
}
