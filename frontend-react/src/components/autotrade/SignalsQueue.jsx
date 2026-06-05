import { useMemo, useState } from "react";
import { retryExecution } from "../../services/autotradeApi";

function fmtDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function getSymbol(execution) {
  return execution?.orders?.[0]?.symbol || execution?.signal_id || "—";
}

function getSide(execution, signal) {
  return signal?.side || execution?.orders?.[0]?.side || "—";
}

function getRisk(signal) {
  return signal?.risk_level || "—";
}

function StatusPill({ status }) {
  const tone =
    status === "completed"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
      : status === "failed" || status === "skipped"
        ? "border-red-500/25 bg-red-500/10 text-red-400"
        : "border-gold-primary/25 bg-gold-primary/10 text-gold-primary";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.15em] ${tone}`}
    >
      {status}
    </span>
  );
}

export default function SignalsQueue({ executions, signalsById, onRetried }) {
  const [retryingId, setRetryingId] = useState("");
  const [error, setError] = useState("");

  const stats = useMemo(() => {
    const completed = executions.filter((item) => item.status === "completed").length;
    const failed = executions.filter(
      (item) => item.status === "failed" || item.status === "skipped",
    ).length;
    const running = executions.filter(
      (item) => item.status === "running" || item.status === "pending",
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
      setError(err.message || "Retry failed");
    } finally {
      setRetryingId("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Completed" value={stats.completed} />
        <MetricCard label="Failed / Skipped" value={stats.failed} />
        <MetricCard label="Pending / Running" value={stats.running} />
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/25 bg-red-500/[0.05] p-3 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border border-white/[0.06] bg-[#0a0805]">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <h3 className="text-base font-semibold text-white">Execution history</h3>
          <p className="mt-1 text-xs text-text-muted">
            Backed by `GET /executions` and linked to `GET /signals`.
          </p>
        </div>

        {executions.length === 0 ? (
          <div className="p-6 text-center text-sm text-text-muted">
            No execution jobs yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/20">
                <tr>
                  {[
                    "Created",
                    "Symbol",
                    "Side",
                    "Market",
                    "Status",
                    "Risk",
                    "Dry Run",
                    "Error",
                    "Action",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted/80"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {executions.map((execution) => {
                  const signal = signalsById[execution.signal_id];
                  const canRetry =
                    execution.status === "failed" || execution.status === "completed";

                  return (
                    <tr
                      key={execution.id}
                      className="border-t border-white/[0.06] text-white/90"
                    >
                      <td className="px-4 py-3 font-mono text-xs">
                        {fmtDate(execution.created_at)}
                      </td>
                      <td className="px-4 py-3 font-mono">{getSymbol(execution)}</td>
                      <td className="px-4 py-3 font-mono">{getSide(execution, signal)}</td>
                      <td className="px-4 py-3 font-mono">{execution.market_type}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={execution.status} />
                      </td>
                      <td className="px-4 py-3 font-mono">{getRisk(signal)}</td>
                      <td className="px-4 py-3 font-mono">
                        {execution.dry_run ? "yes" : "no"}
                      </td>
                      <td className="max-w-[280px] px-4 py-3 text-xs text-text-muted">
                        {execution.error || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleRetry(execution.id)}
                          disabled={!canRetry || retryingId === execution.id}
                          className="rounded-md border border-gold-primary/25 px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.15em] text-gold-primary hover:bg-gold-primary/[0.08] disabled:opacity-40"
                        >
                          {retryingId === execution.id ? "Retrying..." : "Retry"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-[#0a0805] p-4">
      <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-muted/60">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
