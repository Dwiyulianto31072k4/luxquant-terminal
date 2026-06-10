// src/components/autotrade/SignalsQueue.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade · Executions tab
// Execution-job history backed by GET /executions, linked to signals.
// Responsive (cards ↔ table). Retry calls retryExecution(id).
// ════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import CoinLogo from "../CoinLogo";
import {
  Card,
  StatCard,
  StatusBadge,
  EmptyState,
  fmtDateTime,
} from "./AutoTradeUI";

function statusTone(status) {
  if (status === "completed") return "good";
  if (status === "failed") return "bad";
  if (status === "skipped") return "warn";
  if (status === "reconciliation_required") return "info";
  if (status === "running" || status === "pending") return "info";
  return "neutral";
}

function statusLabel(status) {
  if (status === "reconciliation_required") return "needs reconciliation";
  return status;
}

function getSymbol(execution) {
  return execution?.symbol || execution?.orders?.[0]?.symbol || "—";
}

function getSide(execution, signal) {
  return execution?.side || signal?.side || execution?.orders?.[0]?.side || "—";
}

export default function SignalsQueue({ executions = [], signalsById = {} }) {
  const stats = useMemo(() => {
    const completed = executions.filter((e) => e.status === "completed").length;
    const skipped = executions.filter((e) => e.status === "skipped").length;
    const failed = executions.filter((e) => e.status === "failed").length;
    const reconciliation = executions.filter(
      (e) => e.status === "reconciliation_required",
    ).length;
    const running = executions.filter(
      (e) => e.status === "running" || e.status === "pending",
    ).length;
    return { completed, skipped, failed, reconciliation, running };
  }, [executions]);
  const statusChart = [
    { name: "Completed", value: stats.completed, color: "#0ECB81" },
    { name: "Skipped", value: stats.skipped, color: "#d4a853" },
    { name: "Failed", value: stats.failed, color: "#F6465D" },
    { name: "Reconcile", value: stats.reconciliation, color: "#5B8DEF" },
    { name: "Running", value: stats.running, color: "#848E9C" },
  ].filter((item) => item.value > 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Completed" value={stats.completed} valueColor="text-[#0ECB81]" />
        <StatCard label="Skipped" value={stats.skipped} valueColor={stats.skipped > 0 ? "text-gold-primary" : "text-white"} />
        <StatCard label="Failed" value={stats.failed} valueColor={stats.failed > 0 ? "text-[#F6465D]" : "text-white"} />
        <StatCard label="Needs Reconciliation" value={stats.reconciliation} valueColor={stats.reconciliation > 0 ? "text-[#5B8DEF]" : "text-white"} />
        <StatCard label="Pending / Running" value={stats.running} valueColor={stats.running > 0 ? "text-gold-primary" : "text-white"} />
      </div>

      {executions.length > 0 ? (
        <div>
          <Card>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-primary">
              Execution outcomes
            </p>
            <p className="mt-1 text-xs text-text-muted">Operational job status, not trading PnL.</p>
            <div className="mt-3 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusChart}>
                  <XAxis dataKey="name" tick={{ fill: "#848E9C", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "#848E9C", fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {statusChart.map((item) => <Cell key={item.name} fill={item.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      ) : null}

      {executions.length === 0 ? (
        <EmptyState
          icon="📜"
          title="No execution jobs yet"
          hint="When the engine acts on a signal, each execution attempt is logged here with its status and any error."
        />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2.5 lg:hidden">
            {executions.map((execution) => {
              const signal = signalsById[execution.signal_id];
              const symbol = getSymbol(execution);
              return (
                <Card key={execution.id}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <CoinLogo pair={symbol} size={30} />
                      <div>
                        <p className="font-mono text-sm font-semibold text-white">
                          {symbol}
                        </p>
                        <p className="font-mono text-[10px] text-text-muted">
                          {getSide(execution, signal)} · {execution.market_type}
                        </p>
                      </div>
                    </div>
                    <StatusBadge tone={statusTone(execution.status)}>
                      {statusLabel(execution.status)}
                    </StatusBadge>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
                    <span className="font-mono text-[10px] text-text-muted">
                      {fmtDateTime(execution.created_at)}
                    </span>
                  </div>
                  {execution.error ? (
                    <p className="mt-2 text-xs text-red-400/80">{execution.error}</p>
                  ) : null}
                </Card>
              );
            })}
          </div>

          {/* Desktop table */}
          <Card padded={false} className="hidden lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {["Time", "Symbol", "Side", "Market", "Status", "Error"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/80"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {executions.map((execution) => {
                    const signal = signalsById[execution.signal_id];
                    const symbol = getSymbol(execution);
                    return (
                      <tr
                        key={execution.id}
                        className="border-b border-white/[0.04] last:border-0 transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-text-muted">
                          {fmtDateTime(execution.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <CoinLogo pair={symbol} size={22} />
                            <span className="font-mono font-medium text-white">
                              {symbol}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-white/80">
                          {getSide(execution, signal)}
                        </td>
                        <td className="px-4 py-3 font-mono text-white/80">
                          {execution.market_type}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            tone={statusTone(execution.status)}
                          >
                            {statusLabel(execution.status)}
                          </StatusBadge>
                        </td>
                        <td className="max-w-[260px] truncate px-4 py-3 text-xs text-text-muted">
                          {execution.error || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
