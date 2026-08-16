// src/components/admin/workspace/ApiHealthTab.jsx
//
// LuxQuant — Management System › API Health tab.
// One row per external provider LuxQuant depends on: is the key alive, and how
// much balance or quota is left. Providers differ in what they will report, so
// each row is tagged by signal (balance / quota / validity) — a "validity" row
// showing OK means the key works, not that the account is funded.
//
// Data: workspaceApi.getApiHealth() / refreshApiHealth()
// Backend: /api/v1/workspace/api-health (admin-only, Redis-cached)

import { useState, useEffect, useCallback } from "react";
import { workspaceApi } from "../../../services/workspaceApi";

const STATUS = {
  ok: { label: "OK", color: "#16a34a", bg: "rgba(22,163,74,0.10)" },
  warn: { label: "WARN", color: "#ca8a04", bg: "rgba(202,138,4,0.12)" },
  down: { label: "DOWN", color: "#dc2626", bg: "rgba(220,38,38,0.10)" },
  error: { label: "ERROR", color: "#dc2626", bg: "rgba(220,38,38,0.10)" },
  unconfigured: { label: "NO KEY", color: "#6b7280", bg: "rgba(107,114,128,0.10)" },
};

const SIGNAL_LABEL = {
  balance: "balance",
  quota: "quota",
  validity: "key only",
};

// Order the table by urgency, not by name: anything broken sorts to the top so
// an admin never has to scan for it.
const SEVERITY = { down: 0, error: 1, warn: 2, unconfigured: 3, ok: 4 };

const fmtAge = (ts) => {
  if (!ts) return "—";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - Number(ts)));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

const Pill = ({ status }) => {
  const s = STATUS[status] || STATUS.error;
  return (
    <span
      className="inline-block rounded px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.12em]"
      style={{ color: s.color, background: s.bg }}
    >
      {s.label}
    </span>
  );
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

/** Render whatever quota/balance numbers a provider chose to expose. */
function Metrics({ row }) {
  const m = row.metrics || {};
  if (row.signal === "balance" && m.balance_usd !== undefined) {
    return (
      <span className="font-mono text-xs tabular-nums">
        ${Number(m.balance_usd).toFixed(2)}
      </span>
    );
  }
  if (m.used_usd !== undefined && m.limit_usd) {
    return (
      <span className="font-mono text-xs tabular-nums">
        ${Number(m.used_usd).toFixed(4)} / ${Number(m.limit_usd).toFixed(0)}
        <span className="ml-1 text-text-primary/40">({m.used_pct}%)</span>
      </span>
    );
  }
  if (typeof m.used === "number" && typeof m.limit === "number") {
    return (
      <span className="font-mono text-xs tabular-nums">
        {m.used} / {m.limit}
        {m.used_pct != null && (
          <span className="ml-1 text-text-primary/40">({m.used_pct}%)</span>
        )}
      </span>
    );
  }
  if (m.remaining_hour !== undefined && m.remaining_hour !== null) {
    return (
      <span className="font-mono text-xs tabular-nums">
        {m.remaining_hour} / {m.limit_hour} per hr
      </span>
    );
  }
  if (m.remaining !== undefined && m.remaining !== null) {
    return (
      <span className="font-mono text-xs tabular-nums">
        {m.remaining} / {m.limit}
      </span>
    );
  }
  return <span className="font-mono text-xs text-text-primary/30">—</span>;
}

export function ApiHealthTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (force = false) => {
    force ? setRefreshing(true) : setLoading(true);
    try {
      const res = force
        ? await workspaceApi.refreshApiHealth()
        : await workspaceApi.getApiHealth();
      setData(res);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Failed to load API health");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  if (loading) {
    return (
      <p className="font-mono text-xs text-text-primary/50">Probing providers…</p>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-4">
        <p className="font-mono text-xs text-red-500">{error}</p>
      </div>
    );
  }

  const counts = data?.counts || {};
  const rows = [...(data?.providers || [])].sort(
    (a, b) =>
      (SEVERITY[a.status] ?? 9) - (SEVERITY[b.status] ?? 9) ||
      a.label.localeCompare(b.label)
  );
  const broken = (counts.down || 0) + (counts.error || 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-mono text-sm font-semibold uppercase tracking-[0.16em]">
            External APIs
          </h3>
          <p className="mt-1 font-mono text-[10px] text-text-primary/45">
            Cached {Math.round((data?.cache_ttl_s || 900) / 60)}m · {data?.probed_now || 0}{" "}
            probed on this load
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="rounded-lg border border-ink/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition hover:bg-ink/[0.04] disabled:opacity-40"
        >
          {refreshing ? "Probing…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card
          label="Needs attention"
          value={broken}
          sub={broken ? "down or erroring" : "all clear"}
          accent={broken ? STATUS.down.color : STATUS.ok.color}
        />
        <Card label="Healthy" value={counts.ok || 0} sub="key valid" accent={STATUS.ok.color} />
        <Card
          label="Warnings"
          value={counts.warn || 0}
          sub="plan or quota limits"
          accent={counts.warn ? STATUS.warn.color : undefined}
        />
        <Card label="Tracked" value={data?.total || 0} sub="providers total" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink/[0.06]">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="border-b border-ink/[0.06] bg-ink/[0.02]">
              {["Provider", "Status", "Balance / Quota", "Signal", "Powers", "Checked"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-text-primary/45"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-ink/[0.04] last:border-0">
                <td className="px-4 py-3">
                  <p className="font-mono text-xs font-semibold">{r.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-text-primary/35">
                    {r.env_keys.join(", ")}
                    {r.key_hint ? ` ${r.key_hint}` : ""}
                  </p>
                </td>
                <td className="px-4 py-3 align-top">
                  <Pill status={r.status} />
                  <p className="mt-1 max-w-[280px] font-mono text-[10px] leading-relaxed text-text-primary/50">
                    {r.detail}
                  </p>
                </td>
                <td className="px-4 py-3 align-top">
                  <Metrics row={r} />
                </td>
                <td className="px-4 py-3 align-top">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-primary/40">
                    {SIGNAL_LABEL[r.signal] || r.signal}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className="font-mono text-[10px] text-text-primary/55">
                    {r.powers}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className="font-mono text-[10px] tabular-nums text-text-primary/40">
                    {fmtAge(r.checked_at)}
                  </span>
                  {r.latency_ms != null && (
                    <span className="ml-1 font-mono text-[10px] text-text-primary/25">
                      {r.latency_ms}ms
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-text-primary/35">
        "Key only" means the provider publishes no billing endpoint — an OK there
        proves the key is accepted, not that the account has credit. Refresh
        re-probes at most once a minute per provider so this page can never burn a
        provider's quota.
      </p>
    </div>
  );
}
