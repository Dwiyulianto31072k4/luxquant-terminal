// src/components/admin/workspace/ApiHealthTab.jsx
//
// LuxQuant — Management System › API Health tab.
// One card per external dependency: is it alive, and how much is left. Cards
// carry only the number worth glancing at; everything else lives in the detail
// modal, so a wall of 28 providers stays scannable.
//
// Providers differ in what they will report, and the card says which kind it is
// — an OK on a "key only" row proves the key is accepted, NOT that the account
// is funded. Conflating those is the whole reason this page exists.
//
// Data: workspaceApi.getApiHealth() / refreshApiHealth()
// Backend: /api/v1/workspace/api-health (admin-only, Redis-cached)

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
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
  usage: "our meter",
  reachability: "no key",
};

// Sort by urgency, never alphabetically: anything broken must sit in the first
// row without the reader hunting for it.
const SEVERITY = { down: 0, error: 1, warn: 2, unconfigured: 3, ok: 4 };

const fmtAge = (ts) => {
  if (!ts) return "—";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - Number(ts)));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/** The one figure worth putting on the card, plus a bar when there is a cap. */
function headline(row) {
  const m = row.metrics || {};

  if (m.balance_usd !== undefined) {
    return { value: `$${Number(m.balance_usd).toFixed(2)}`, sub: "available", pct: null };
  }
  if (m.used_usd !== undefined && m.limit_usd) {
    const pct = Math.min(100, (Number(m.used_usd) / Number(m.limit_usd)) * 100);
    return {
      value: `$${Number(m.used_usd).toFixed(4)}`,
      sub: `of $${Number(m.limit_usd).toFixed(0)} this cycle`,
      pct,
    };
  }
  if (num(m.used) !== null && num(m.limit)) {
    const pct = Math.min(100, (num(m.used) / num(m.limit)) * 100);
    return { value: `${m.used}`, sub: `of ${m.limit} credits`, pct };
  }
  // Rate-limit style: show what is LEFT, and fill the bar by what is used.
  const left = num(m.remaining_day) !== null ? num(m.remaining_day) : num(m.remaining_hour);
  const cap = num(m.remaining_day) !== null ? num(m.limit_day) : num(m.limit_hour);
  if (left !== null && cap) {
    const unit = num(m.remaining_day) !== null ? "per day" : "per hr";
    return { value: `${left}`, sub: `of ${cap} ${unit} left`, pct: ((cap - left) / cap) * 100 };
  }
  if (num(m.remaining) !== null && num(m.limit)) {
    return { value: `${m.remaining}`, sub: `of ${m.limit} left`, pct: null };
  }
  if (m.calls_24h !== undefined) {
    return {
      value: `$${Number(m.cost_usd_24h || 0).toFixed(2)}`,
      sub: `${m.ok_24h} ok · ${m.failed_24h} failed / 24h`,
      pct: null,
    };
  }
  if (row.latency_ms != null) {
    return { value: `${row.latency_ms}`, sub: "ms response", pct: null };
  }
  return { value: "—", sub: SIGNAL_LABEL[row.signal] || row.signal, pct: null };
}

const Pill = ({ status, small }) => {
  const s = STATUS[status] || STATUS.error;
  return (
    <span
      className={`inline-block rounded font-mono font-semibold tracking-[0.12em] ${
        small ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
      }`}
      style={{ color: s.color, background: s.bg }}
    >
      {s.label}
    </span>
  );
};

const Summary = ({ label, value, sub, accent }) => (
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

// Border and background stay on Tailwind's theme-aware `ink` token; only the
// attention state overrides them, so cards follow Luxquant/Dark/Bright instead
// of hardcoding a colour that would be wrong in two of the three themes.
function ProviderCard({ row, onOpen }) {
  const s = STATUS[row.status] || STATUS.error;
  const h = headline(row);
  const attention = row.status === "down" || row.status === "error";

  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className={`group relative flex flex-col overflow-hidden rounded-xl border p-4 text-left transition hover:-translate-y-px hover:shadow-md focus:outline-none focus-visible:ring-2 ${
        attention ? "" : "border-ink/[0.07]"
      }`}
      style={
        attention
          ? { borderColor: `${s.color}55`, background: s.bg }
          : { background: "rgb(var(--surface))" }
      }
    >
      {/* severity accent — colour appears only when it means something */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: row.status === "ok" ? "transparent" : s.color }}
      />

      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate font-mono text-xs font-semibold text-text-primary">
          {row.label}
        </p>
        <Pill status={row.status} small />
      </div>

      <p className="mt-3 font-mono text-xl font-semibold tabular-nums" style={{ color: "rgb(var(--fg))" }}>
        {h.value}
      </p>
      <p className="mt-0.5 font-mono text-[10px] text-text-primary/45">{h.sub}</p>

      {h.pct != null && (
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-ink/[0.08]">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.max(2, h.pct)}%`, background: s.color }}
          />
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink/[0.05] pt-2">
        <span className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-text-primary/35">
          {SIGNAL_LABEL[row.signal] || row.signal}
        </span>
        <span className="shrink-0 font-mono text-[9px] tabular-nums text-text-primary/30">
          {fmtAge(row.checked_at)}
        </span>
      </div>
    </button>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-ink/[0.05] py-2.5 last:border-0">
      <p className="w-32 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-text-primary/40">
        {label}
      </p>
      <div className="min-w-0 flex-1 font-mono text-xs text-text-primary/80">{children}</div>
    </div>
  );
}

function DetailModal({ row, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!row) return null;
  const s = STATUS[row.status] || STATUS.error;
  const m = row.metrics || {};
  const entries = Object.entries(m).filter(([, v]) => v !== null && v !== undefined && v !== "");

  return createPortal(
    <div
      className="lq-modal-safe lq-scrim-bg fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${row.label} detail`}
    >
      <div
        className="lq-sheet isolate flex max-h-[min(var(--lq-modal-maxh),100%)] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-ink/[0.08] shadow-2xl sm:max-h-[var(--lq-modal-maxh)] sm:rounded-2xl"
        style={{ backgroundColor: "rgb(var(--surface))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-0.5 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-ink/25" />
        </div>

        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-ink/[0.08] px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-primary/40">
              EXTERNAL API
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-[20px] font-semibold text-text-primary">{row.label}</h2>
              <Pill status={row.status} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg border border-ink/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition hover:bg-ink/[0.04]"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <p
            className="rounded-lg px-3 py-2.5 font-mono text-xs leading-relaxed"
            style={{ background: s.bg, color: s.color }}
          >
            {row.detail || "—"}
          </p>

          <div className="mt-3">
            <DetailRow label="Powers">{row.powers || "—"}</DetailRow>
            <DetailRow label="Signal">
              {SIGNAL_LABEL[row.signal] || row.signal}
              <span className="ml-2 text-text-primary/40">
                {row.signal === "validity" && "— provider publishes no balance; OK means the key is accepted, not funded"}
                {row.signal === "reachability" && "— no credential exists; OK means the host is serving data"}
                {row.signal === "usage" && "— provider reports nothing, so this is measured from our own logs"}
                {row.signal === "balance" && "— real money remaining"}
                {row.signal === "quota" && "— consumption against a cap"}
              </span>
            </DetailRow>
            <DetailRow label="Env keys">
              {row.env_keys?.length ? (
                <span>
                  {row.env_keys.join(", ")}
                  {row.key_hint && <span className="ml-1 text-text-primary/40">{row.key_hint}</span>}
                </span>
              ) : (
                <span className="text-text-primary/40">none — unauthenticated</span>
              )}
            </DetailRow>
            <DetailRow label="Configured">{row.configured ? "yes" : "no"}</DetailRow>
            <DetailRow label="Latency">
              {row.latency_ms != null ? `${row.latency_ms} ms` : "—"}
            </DetailRow>
            <DetailRow label="Checked">{fmtAge(row.checked_at)}</DetailRow>
            {row.docs && (
              <DetailRow label="Console">
                <a
                  href={row.docs}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-2 hover:opacity-70"
                >
                  {row.docs}
                </a>
              </DetailRow>
            )}
          </div>

          {entries.length > 0 && (
            <div className="mt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-primary/40">
                Reported by provider
              </p>
              <div className="mt-2 overflow-x-auto rounded-lg border border-ink/[0.06]">
                <table className="w-full text-left">
                  <tbody>
                    {entries.map(([k, v]) => (
                      <tr key={k} className="border-b border-ink/[0.04] last:border-0">
                        <td className="px-3 py-1.5 font-mono text-[10px] text-text-primary/50">{k}</td>
                        <td className="px-3 py-1.5 font-mono text-[11px] tabular-nums text-text-primary/85">
                          {String(v)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ApiHealthTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

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

  const rows = useMemo(
    () =>
      [...(data?.providers || [])].sort(
        (a, b) =>
          (SEVERITY[a.status] ?? 9) - (SEVERITY[b.status] ?? 9) ||
          a.label.localeCompare(b.label)
      ),
    [data]
  );

  if (loading) {
    return <p className="font-mono text-xs text-text-primary/50">Probing providers…</p>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-4">
        <p className="font-mono text-xs text-red-500">{error}</p>
      </div>
    );
  }

  const counts = data?.counts || {};
  const broken = (counts.down || 0) + (counts.error || 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-mono text-sm font-semibold uppercase tracking-[0.16em]">
            External APIs
          </h3>
          <p className="mt-1 font-mono text-[10px] text-text-primary/45">
            Cached {Math.round((data?.cache_ttl_s || 900) / 60)}m · {data?.probed_now || 0} probed
            on this load · tap a card for detail
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
        <Summary
          label="Needs attention"
          value={broken}
          sub={broken ? "down or erroring" : "all clear"}
          accent={broken ? STATUS.down.color : STATUS.ok.color}
        />
        <Summary label="Healthy" value={counts.ok || 0} sub="responding" accent={STATUS.ok.color} />
        <Summary
          label="Warnings"
          value={counts.warn || 0}
          sub="plan or quota limits"
          accent={counts.warn ? STATUS.warn.color : undefined}
        />
        <Summary label="Tracked" value={data?.total || 0} sub="providers total" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((r) => (
          <ProviderCard key={r.id} row={r} onOpen={setSelected} />
        ))}
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-text-primary/35">
        "Key only" means the provider publishes no billing endpoint — an OK there
        proves the key is accepted, not that the account has credit. "No key" rows
        are unauthenticated dependencies, where the only question is whether the
        host still answers. Refresh re-probes at most once a minute per provider,
        and some carry a longer floor, so this page can never spend a provider's
        quota.
      </p>

      <DetailModal row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
