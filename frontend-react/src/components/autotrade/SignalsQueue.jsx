// src/components/autotrade/SignalsQueue.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade · Executions tab
// Execution-job history backed by GET /executions, linked to signals.
// Responsive (cards ↔ table). Retry calls retryExecution(id).
// ════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { retryExecution } from "../../services/autotradeApi";
import CoinLogo from "../CoinLogo";
import {
  Card,
  StatCard,
  StatusBadge,
  EmptyState,
  GhostButton,
  Notice,
  fmtDateTime,
} from "./AutoTradeUI";

function statusTone(status) {
  if (status === "completed") return "good";
  if (status === "failed" || status === "skipped") return "bad";
  if (status === "running" || status === "pending") return "info";
  return "neutral";
}

function getSymbol(execution) {
  return execution?.orders?.[0]?.symbol || execution?.signal_id || "—";
}

function getSide(execution, signal) {
  return signal?.side || execution?.orders?.[0]?.side || "—";
}

export default function SignalsQueue({ executions = [], signalsById = {}, onRetried }) {
  const [retryingId, setRetryingId] = useState("");
  const [error, setError] = useState("");

  const stats = useMemo(() => {
    const completed = executions.filter((e) => e.status === "completed").length;
    const failed = executions.filter(
      (e) => e.status === "failed" || e.status === "skipped",
    ).length;
    const running = executions.filter(
      (e) => e.status === "running" || e.status === "pending",
    ).length;
    return { completed, failed, running };
  }, [executions]);

  const handleRetry = async (executionId) => {
    setRetryingId(executionId);
    setError("");
    try {
      await retryExecution(executionId);
      onRetried?.();
    } catch (err) {
      setError(err.message || "Failed to retry execution");
    } finally {
      setRetryingId("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Completed" value={stats.completed} valueColor="text-[#0ECB81]" />
        <StatCard label="Failed / Skipped" value={stats.failed} valueColor={stats.failed > 0 ? "text-[#F6465D]" : "text-white"} />
        <StatCard label="Pending / Running" value={stats.running} valueColor={stats.running > 0 ? "text-gold-primary" : "text-white"} />
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

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
              const canRetry =
                execution.status === "failed" || execution.status === "completed";
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
                          {execution.dry_run ? " · dry" : ""}
                        </p>
                      </div>
                    </div>
                    <StatusBadge tone={statusTone(execution.status)}>
                      {execution.status}
                    </StatusBadge>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-3">
                    <span className="font-mono text-[10px] text-text-muted">
                      {fmtDateTime(execution.created_at)}
                    </span>
                    {canRetry ? (
                      <button
                        type="button"
                        onClick={() => handleRetry(execution.id)}
                        disabled={retryingId === execution.id}
                        className="rounded-md border border-gold-primary/25 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-gold-primary hover:bg-gold-primary/[0.08] disabled:opacity-40"
                      >
                        {retryingId === execution.id ? "Retrying…" : "Retry"}
                      </button>
                    ) : null}
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
                    {["Time", "Symbol", "Side", "Market", "Status", "Dry", "Error", ""].map((h) => (
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
                    const canRetry =
                      execution.status === "failed" ||
                      execution.status === "completed";
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
                            {execution.status}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 font-mono text-white/70">
                          {execution.dry_run ? "yes" : "no"}
                        </td>
                        <td className="max-w-[260px] truncate px-4 py-3 text-xs text-text-muted">
                          {execution.error || "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canRetry ? (
                            <button
                              type="button"
                              onClick={() => handleRetry(execution.id)}
                              disabled={retryingId === execution.id}
                              className="rounded-md border border-gold-primary/25 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-gold-primary hover:bg-gold-primary/[0.08] disabled:opacity-40"
                            >
                              {retryingId === execution.id ? "…" : "Retry"}
                            </button>
                          ) : null}
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
