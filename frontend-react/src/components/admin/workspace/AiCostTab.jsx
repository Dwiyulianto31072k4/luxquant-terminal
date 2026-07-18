// src/components/admin/workspace/AiCostTab.jsx
//
// LuxQuant — Management System › AI Cost tab.
// Tracks the cost of AI features (starts with the LuxQuant Assistant, generalizes
// to every feature via the `feature` label). Reads aggregates from ai_usage_log.
//
// Data: workspaceApi.getAiCostSummary(days) / getAiCostRecent(limit)
// Backend: /api/v1/workspace/ai-cost/* (admin-only)

import { useState, useEffect, useCallback } from "react";
import { workspaceApi } from "../../../services/workspaceApi";
import { palette } from "../designSystem";

const RANGES = [7, 30, 90];

const fmtUSD = (n) => {
  const v = Number(n || 0);
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(5)}`;
  if (v < 1) return `$${v.toFixed(4)}`;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtNum = (n) => Number(n || 0).toLocaleString("en-US");
const fmtTokens = (n) => {
  const v = Number(n || 0);
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
};

const Card = ({ label, value, sub, accent }) => (
  <div className="rounded-xl border border-ink/[0.06] bg-ink/[0.02] p-4">
    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-primary/45">
      {label}
    </p>
    <p
      className="mt-2 font-mono text-2xl font-semibold tabular-nums"
      style={{ color: accent || "rgb(var(--fg))" }}
    >
      {value}
    </p>
    {sub && <p className="mt-1 font-mono text-[10px] text-text-primary/40">{sub}</p>}
  </div>
);

export function AiCostTab() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aiEnabled, setAiEnabled] = useState(null); // null=loading
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    workspaceApi
      .getAiSettings()
      .then((s) => setAiEnabled(s.assistant_enabled !== false))
      .catch(() => setAiEnabled(true));
  }, []);

  const toggleAi = async () => {
    if (toggling || aiEnabled === null) return;
    const next = !aiEnabled;
    setToggling(true);
    setAiEnabled(next); // optimistic
    try {
      const res = await workspaceApi.setAiSettings(next);
      setAiEnabled(res.assistant_enabled !== false);
    } catch {
      setAiEnabled(!next); // revert
    } finally {
      setToggling(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, r] = await Promise.all([
        workspaceApi.getAiCostSummary(days),
        workspaceApi.getAiCostRecent(50),
      ]);
      setSummary(s);
      setRecent(r.items || []);
    } catch {
      setError("Failed to load AI cost data.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const maxDaily = Math.max(1, ...(summary?.daily || []).map((d) => d.cost));

  return (
    <div className="space-y-6">
      {/* AI Assistant master switch */}
      <div className="flex flex-col gap-3 rounded-xl border border-ink/[0.08] bg-ink/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-primary">
            AI Assistant
          </p>
          <p className="mt-1 text-[11px] text-text-primary/45">
            {aiEnabled === false
              ? "Turned OFF — the help widget is hidden everywhere (no bubble, no badge)."
              : "Turned ON — the help widget is available across the app."}
          </p>
        </div>
        <button
          onClick={toggleAi}
          disabled={toggling || aiEnabled === null}
          className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${aiEnabled ? "bg-profit/80" : "bg-ink/15"}`}
          aria-label="Toggle AI Assistant"
          role="switch"
          aria-checked={!!aiEnabled}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${aiEnabled ? "translate-x-6" : "translate-x-1"}`}
          />
        </button>
      </div>

      {/* Range selector + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-full border border-ink/[0.08] bg-ink/[0.02] p-1">
          {RANGES.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition-all ${
                days === d
                  ? "bg-accent text-accent-fg font-semibold"
                  : "text-text-primary/50 hover:text-text-primary"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-ink/[0.08] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-primary/60 hover:text-text-primary hover:bg-ink/5 transition-all"
        >
          Refresh
        </button>
      </div>

      {error && <p className="font-mono text-xs text-loss">{error}</p>}
      {loading && !summary && <p className="font-mono text-xs text-text-primary/40">Loading…</p>}

      {summary && (
        <>
          {/* Headline cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Card
              label="Today"
              value={fmtUSD(summary.today.cost)}
              sub={`${fmtNum(summary.today.calls)} calls`}
              accent={palette.green[400]}
            />
            <Card
              label="This Month"
              value={fmtUSD(summary.month.cost)}
              sub={`${fmtNum(summary.month.calls)} calls`}
              accent="rgb(var(--fg))"
            />
            <Card
              label={`${days}d Cost`}
              value={fmtUSD(summary.range.cost)}
              sub={`${fmtNum(summary.range.calls)} calls`}
              accent={palette.gold[300]}
            />
            <Card
              label={`${days}d Tokens`}
              value={fmtTokens(summary.range.tokens)}
              accent="rgb(var(--fg))"
            />
            <Card
              label="Model Calls"
              value={fmtNum(summary.range.model_calls)}
              sub={`${fmtNum(summary.range.cache_calls)} from cache`}
              accent="rgb(var(--fg))"
            />
            <Card
              label="Cache Hit Rate"
              value={`${summary.cache_hit_rate}%`}
              sub="served free"
              accent={palette.teal[400]}
            />
          </div>

          {/* Daily cost bars */}
          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-primary/45">
              Daily cost — last {days} days
            </p>
            {summary.daily.length === 0 ? (
              <p className="font-mono text-xs text-text-primary/40">No usage recorded yet.</p>
            ) : (
              <div className="flex items-end gap-1 h-32 rounded-xl border border-ink/[0.06] bg-ink/[0.02] p-3">
                {summary.daily.map((d) => (
                  <div
                    key={d.date}
                    className="group relative flex-1 flex flex-col items-center justify-end h-full"
                  >
                    <div
                      className="w-full rounded-t bg-accent/60 hover:bg-accent transition-all"
                      style={{ height: `${Math.max(2, (d.cost / maxDaily) * 100)}%` }}
                    />
                    <div className="pointer-events-none absolute bottom-full mb-1 hidden group-hover:block whitespace-nowrap rounded bg-scrim/90 px-2 py-1 font-mono text-[9px] text-text-primary">
                      {d.date} · {fmtUSD(d.cost)} · {fmtNum(d.calls)} calls
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* By feature */}
          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-primary/45">
              Cost by feature
            </p>
            <div className="overflow-hidden rounded-xl border border-ink/[0.06]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-ink/[0.06] bg-ink/[0.02] font-mono text-[9px] uppercase tracking-wider text-text-primary/40">
                    <th className="px-3 py-2">Feature</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2 text-right">Calls</th>
                    <th className="px-3 py-2 text-right">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.by_feature.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-4 text-center font-mono text-xs text-text-primary/40"
                      >
                        No data
                      </td>
                    </tr>
                  ) : (
                    summary.by_feature.map((f) => (
                      <tr
                        key={f.feature}
                        className="border-b border-ink/[0.03] font-mono text-[11px] text-text-primary/80"
                      >
                        <td className="px-3 py-2 uppercase tracking-wider text-text-muted">
                          {f.feature}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(f.cost)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(f.calls)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtTokens(f.tokens)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top users */}
          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-primary/45">
              Top users
            </p>
            <div className="overflow-hidden rounded-xl border border-ink/[0.06]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-ink/[0.06] bg-ink/[0.02] font-mono text-[9px] uppercase tracking-wider text-text-primary/40">
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2 text-right">Questions</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2 text-right">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary.top_users || []).length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-4 text-center font-mono text-xs text-text-primary/40"
                      >
                        No data
                      </td>
                    </tr>
                  ) : (
                    summary.top_users.map((u, i) => (
                      <tr
                        key={i}
                        className="border-b border-ink/[0.03] font-mono text-[11px] text-text-primary/80"
                      >
                        <td
                          className={`px-3 py-2 ${u.user === "anonymous" ? "text-text-primary/40 italic" : "text-text-primary/85"}`}
                        >
                          {u.user}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(u.calls)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtUSD(u.cost)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtTokens(u.tokens)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent calls */}
          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-primary/45">
              Recent calls
            </p>
            <div className="overflow-hidden rounded-xl border border-ink/[0.06]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-ink/[0.06] bg-ink/[0.02] font-mono text-[9px] uppercase tracking-wider text-text-primary/40">
                    <th className="px-3 py-2">Time (UTC)</th>
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2">Feature</th>
                    <th className="px-3 py-2">Model</th>
                    <th className="px-3 py-2 text-right">Tokens</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-4 text-center font-mono text-xs text-text-primary/40"
                      >
                        No calls yet
                      </td>
                    </tr>
                  ) : (
                    recent.map((r, i) => (
                      <tr
                        key={i}
                        className="border-b border-ink/[0.03] font-mono text-[11px] text-text-primary/75"
                      >
                        <td className="px-3 py-2 whitespace-nowrap text-text-primary/50">{r.ts}</td>
                        <td
                          className={`px-3 py-2 whitespace-nowrap ${r.user === "anonymous" ? "text-text-primary/35 italic" : "text-text-primary/70"}`}
                        >
                          {r.user || "anonymous"}
                        </td>
                        <td className="px-3 py-2 uppercase tracking-wider text-text-muted">
                          {r.feature}
                        </td>
                        <td className="px-3 py-2 text-text-primary/60">
                          {r.cached ? <span className="text-positive">cache hit</span> : r.model}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.cached ? "—" : fmtNum(r.tokens)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.cached ? "$0" : fmtUSD(r.cost)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AiCostTab;
