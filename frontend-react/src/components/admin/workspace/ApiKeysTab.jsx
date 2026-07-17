// src/components/admin/workspace/ApiKeysTab.jsx
// ════════════════════════════════════════════════════════════════
// Admin · API Keys — view & manage every key across users + IP-anomaly
// flags (possible sharing/reselling). Fetch GET /admin/api-keys.
// Revoke via POST /admin/api-keys/{id}/revoke.
// Self-contained (app Tailwind tokens), no designSystem needed.
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import api from "../../../services/api";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "flagged", label: "Flagged" },
  { id: "revoked", label: "Revoked" },
];

function fmtDate(s) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtRelative(s) {
  if (!s) return "never";
  const d = new Date(s);
  if (isNaN(d)) return "never";
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ApiKeysTab() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ active_keys: 0, flagged_keys: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [revokingId, setRevokingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page_size: 200 };
      if (filter !== "all") params.status = filter;
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get("/admin/api-keys", { params });
      setItems(Array.isArray(data?.items) ? data.items : []);
      if (data?.summary) setSummary(data.summary);
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRevoke = async (id) => {
    if (!window.confirm(`Revoke API key #${id}? The bot using it will stop working.`)) return;
    setRevokingId(id);
    try {
      await api.post(`/admin/api-keys/${id}/revoke`);
      await load();
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to revoke");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl px-4 py-3 border border-ink/5 bg-ink/[0.02]">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
            Active keys
          </p>
          <p className="text-lg font-semibold mt-1 text-text-primary tabular-nums">
            {summary.active_keys}
          </p>
        </div>
        <div className="rounded-xl px-4 py-3 border border-amber-500/15 bg-amber-500/[0.04]">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-400/70">
            Flagged (multi-IP)
          </p>
          <p className="text-lg font-semibold mt-1 text-amber-400 tabular-nums">
            {summary.flagged_keys}
          </p>
        </div>
        <div className="rounded-xl px-4 py-3 border border-ink/5 bg-ink/[0.02] hidden sm:block">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
            Showing
          </p>
          <p className="text-lg font-semibold mt-1 text-text-primary tabular-nums">
            {items.length}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                filter === f.id
                  ? "bg-accent text-accent-fg border-ink/12"
                  : "text-text-muted border-ink/5 hover:text-text-secondary hover:border-ink/10"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search user / email / key…"
          className="px-3 py-1.5 rounded-lg text-sm text-text-primary bg-ink/[0.03] border border-ink/10 placeholder:text-text-muted/70 focus:outline-none focus:border-ink/15 sm:w-64"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl px-4 py-3 text-[13px] text-loss border border-red-500/25 bg-red-500/10">
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="rounded-2xl p-8 border border-ink/5 bg-ink/[0.02] flex items-center justify-center">
          <div className="w-5 h-5 rounded-full border-2 border-ink/12 border-t-accent animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl p-8 border border-ink/5 bg-ink/[0.02] text-center">
          <p className="text-text-muted text-sm">No API keys match this filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((k) => (
            <div
              key={k.id}
              className={`rounded-xl p-4 border transition-colors ${
                k.flagged
                  ? "border-amber-500/25 bg-amber-500/[0.03]"
                  : k.is_active
                    ? "border-ink/5 bg-ink/[0.02]"
                    : "border-ink/[0.03] bg-ink/[0.01] opacity-60"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-text-primary text-sm font-medium truncate">
                      {k.name || "Untitled key"}
                    </span>
                    {k.is_active ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-profit/15 text-profit border border-profit/20">
                        Active
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-red-500/15 text-loss border border-red-500/20">
                        Revoked
                      </span>
                    )}
                    {k.flagged && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-400 border border-amber-500/25">
                        ⚠ Flagged
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-text-secondary mt-1 truncate">
                    <span className="text-text-primary">{k.username}</span>
                    <span className="text-text-muted"> · {k.email}</span>
                  </p>
                  <code className="block font-mono text-[11px] text-text-muted mt-1 truncate">
                    {k.key_prefix}
                    {"\u2022".repeat(8)}
                  </code>
                  <p className="text-[11px] text-text-muted mt-1">
                    Created {fmtDate(k.created_at)}
                    {k.is_active && <> · used {fmtRelative(k.last_used_at)}</>}
                    {" · "}
                    <span
                      className={k.distinct_ips_24h >= 5 ? "text-amber-400" : "text-text-muted"}
                    >
                      {k.distinct_ips_24h} IP{k.distinct_ips_24h === 1 ? "" : "s"} /24h
                    </span>
                  </p>
                </div>

                {k.is_active && (
                  <button
                    onClick={() => handleRevoke(k.id)}
                    disabled={revokingId === k.id}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-loss/80 border border-red-500/25 hover:text-loss hover:bg-red-500/10 transition-colors disabled:opacity-40 whitespace-nowrap flex-shrink-0"
                  >
                    {revokingId === k.id ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ApiKeysTab;
