// src/components/PortfolioPage.jsx
import { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar,
} from "recharts";
import {
  getPortfolioSummary,
  getPortfolioByExchange,
  getDailyPnl,
  listOrders,
} from "../services/autotradeApi";
import TradeHistoryTable from "./autotrade/TradeHistoryTable";

function fmtUsd(n) {
  const v = Number(n || 0);
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
}

function StatCard({ label, value, sub, color = "#d4a853" }) {
  return (
    <div className="bg-bg-card border border-white/5 rounded-xl p-4">
      <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{label}</p>
      <p className="text-2xl font-display font-bold" style={{ color }}>
        {value}
      </p>
      {sub && <p className="text-xs text-text-muted mt-1">{sub}</p>}
    </div>
  );
}

export default function PortfolioPage() {
  const [summary, setSummary] = useState(null);
  const [byExchange, setByExchange] = useState([]);
  const [dailyPnl, setDailyPnl] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const load = async () => {
    setLoading(true);
    try {
      const [s, be, dp, h] = await Promise.all([
        getPortfolioSummary(),
        getPortfolioByExchange(),
        getDailyPnl(days),
        listOrders({ status: "closed", page_size: 50 }),
      ]);
      setSummary(s);
      setByExchange(be);
      setDailyPnl((dp.items || []).map((d) => ({
        date: d.date,
        pnl: Number(d.net_pnl || 0),
        trades: (d.trades_closed || 0),
      })));
      setHistory(h.orders || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [days]);

  if (loading && !summary) {
    return (
      <div className="text-center py-16">
        <div className="w-10 h-10 border-2 border-gold-primary/20 border-t-gold-primary rounded-full animate-spin mx-auto mb-3" />
        <p className="text-text-muted text-sm">Loading portfolio…</p>
      </div>
    );
  }

  if (!summary) return null;

  const winRateColor = summary.win_rate >= 55 ? "#10b981" : summary.win_rate >= 45 ? "#d4a853" : "#ef4444";
  const netColor = summary.net_pnl >= 0 ? "#10b981" : "#ef4444";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-1 h-6 rounded bg-gradient-to-b from-gold-light to-gold-dark" />
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-white">Portfolio</h1>
        </div>
        <p className="text-sm text-text-muted">
          Aggregated across {summary.active_accounts} active accounts · Total balance: {fmtUsd(summary.total_balance_usd)}
        </p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Balance"
          value={fmtUsd(summary.total_balance_usd)}
          sub={`${summary.open_positions} open`}
        />
        <StatCard
          label="Net PnL"
          value={fmtUsd(summary.net_pnl)}
          sub={`after $${summary.total_fees_paid.toFixed(2)} fees`}
          color={netColor}
        />
        <StatCard
          label="Win Rate"
          value={`${summary.win_rate.toFixed(1)}%`}
          sub={`${summary.total_wins}W / ${summary.total_losses}L`}
          color={winRateColor}
        />
        <StatCard
          label="Today PnL"
          value={fmtUsd(summary.today_net_pnl)}
          sub={`${summary.today_trades_closed} closed`}
          color={summary.today_net_pnl >= 0 ? "#10b981" : "#ef4444"}
        />
      </div>

      {/* Daily PnL chart */}
      <div className="bg-bg-card border border-white/5 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-display font-bold text-white">Daily PnL</h2>
          <div className="flex gap-1 p-1 bg-white/[0.02] rounded-lg">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 text-xs font-semibold rounded ${
                  days === d ? "bg-gold-primary/15 text-gold-primary" : "text-text-muted hover:text-white"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {dailyPnl.length === 0 ? (
          <div className="h-60 flex items-center justify-center text-text-muted text-sm">
            No data yet
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyPnl}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={10} />
                <YAxis stroke="#6b7280" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    background: "#0d0a10",
                    border: "1px solid rgba(212,168,83,0.2)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(val) => [fmtUsd(val), "PnL"]}
                />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                  {dailyPnl.map((entry, i) => (
                    <Bar key={i} fill={entry.pnl >= 0 ? "#10b981" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* By exchange */}
      <div className="bg-bg-card border border-white/5 rounded-2xl p-5">
        <h2 className="text-base font-display font-bold text-white mb-3">By Exchange</h2>
        {byExchange.length === 0 ? (
          <p className="text-text-muted text-sm">No data</p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {byExchange.map((ex) => (
              <div
                key={ex.exchange_id}
                className="bg-white/[0.02] border border-white/5 rounded-xl p-3"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-semibold text-white capitalize">{ex.exchange_id}</p>
                    <p className="text-[11px] text-text-muted">{ex.account_count} account(s)</p>
                  </div>
                  <p className="text-xs font-mono text-gold-primary">
                    {ex.win_rate.toFixed(1)}% WR
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-text-muted">Balance</p>
                    <p className="text-white font-mono">{fmtUsd(ex.total_balance_usd)}</p>
                  </div>
                  <div>
                    <p className="text-text-muted">PnL</p>
                    <p
                      className="font-mono"
                      style={{ color: ex.realized_pnl >= 0 ? "#10b981" : "#ef4444" }}
                    >
                      {fmtUsd(ex.realized_pnl)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trade history */}
      <div>
        <h2 className="text-base font-display font-bold text-white mb-3">Recent Closed Trades</h2>
        <TradeHistoryTable orders={history} loading={loading} />
      </div>
    </div>
  );
}
