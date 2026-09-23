// src/components/admin/workspace/VipMembersTab.jsx
//
// LuxQuant — Management System › VIP Members.
// Every Telegram account inside the VIP group, traced back to a LuxQuant
// account or named as untraced. Anyone with an invite link can walk in, and
// until this page nothing on the site could say who those people were, who let
// them in, or whether they ever paid — the group held 278 while the database
// knew 129.
//
// Untraced rows sort first and are the only ones coloured: they are the
// question. Nothing is removed automatically; Kick is an admin decision, and
// the note beside it is how that decision is remembered.
//
// Data: workspaceApi.getVipMembers / vipMemberNote / vipMemberRemove / vipScan

import { useCallback, useEffect, useMemo, useState } from "react";
import { workspaceApi } from "../../../services/workspaceApi";

const TRACE = {
  untraced: { label: "UNTRACED", color: "#dc2626", bg: "rgba(220,38,38,0.10)", hint: "no LuxQuant account, not a legacy member" },
  account_active: { label: "ACTIVE", color: "#16a34a", bg: "rgba(22,163,74,0.10)", hint: "account with live access" },
  legacy: { label: "LEGACY", color: "#2563eb", bg: "rgba(37,99,235,0.10)", hint: "pre-webapp member, entitled on their own terms" },
  account_expired: { label: "EXPIRED", color: "#ca8a04", bg: "rgba(202,138,4,0.12)", hint: "has an account, subscription lapsed" },
  admin: { label: "ADMIN", color: "#6b7280", bg: "rgba(107,114,128,0.10)", hint: "group admin or creator" },
};
const ORDER = ["untraced", "account_expired", "account_active", "legacy", "admin"];

const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtAgo = (v) => {
  if (!v) return "";
  const d = (Date.now() - new Date(v).getTime()) / 86400000;
  return d < 1 ? "today" : d < 2 ? "yesterday" : `${Math.floor(d)}d ago`;
};

const Chip = ({ trace }) => {
  const t = TRACE[trace] || TRACE.untraced;
  return (
    <span
      title={t.hint}
      className="inline-block shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.12em]"
      style={{ color: t.color, background: t.bg }}
    >
      {t.label}
    </span>
  );
};

const Summary = ({ label, value, sub, accent, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-xl border p-4 text-left transition hover:bg-ink/[0.03] ${
      active ? "border-accent/60" : "border-ink/[0.06]"
    }`}
    style={{ background: active ? "rgb(var(--surface-raised))" : "rgb(var(--surface) / 0.4)" }}
  >
    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-primary/45">{label}</p>
    <p className="mt-2 font-mono text-2xl font-semibold tabular-nums" style={{ color: accent || "rgb(var(--fg))" }}>
      {value}
    </p>
    {sub && <p className="mt-1 font-mono text-[10px] text-text-primary/40">{sub}</p>}
  </button>
);

function HowIn({ row }) {
  if (row.invite_link_name || row.invited_by_username) {
    return (
      <>
        <span className="text-text-primary/80">{row.invite_link_name || "invite link"}</span>
        {row.invited_by_username && (
          <span className="block text-text-primary/45">by @{row.invited_by_username}</span>
        )}
      </>
    );
  }
  if (row.join_source === "added_by_admin") return <span className="text-text-primary/70">added by an admin</span>;
  // Everyone who was already inside when recording started: Telegram keeps the
  // join date but never says which link was used, and no bot can recover it.
  return <span className="text-text-primary/40">before tracking</span>;
}

function NoteCell({ row, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.note || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await workspaceApi.vipMemberNote(row.telegram_id, value);
      onSaved(row.telegram_id, value.trim() || null);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full text-left text-[11px] leading-snug text-text-primary/70 hover:text-text-primary"
      >
        {row.note || <span className="text-text-primary/30">+ note</span>}
      </button>
    );
  }
  return (
    <div className="flex items-start gap-1">
      <textarea
        autoFocus
        rows={2}
        maxLength={500}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="min-w-0 flex-1 rounded border border-ink/[0.12] bg-surface-secondary px-1.5 py-1 text-[11px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="shrink-0 rounded border border-ink/[0.12] px-1.5 py-1 font-mono text-[9px] uppercase hover:bg-ink/[0.05] disabled:opacity-40"
      >
        {busy ? "…" : "Save"}
      </button>
    </div>
  );
}

function Row({ row, onSaved, onRemoved }) {
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const untraced = row.trace === "untraced";

  const remove = async () => {
    const who = row.username ? `@${row.username}` : row.full_name || row.telegram_id;
    if (!window.confirm(`Remove ${who} from the VIP group?\n\nThey can join again later with a new invite.`)) return;
    setBusy(true);
    try {
      await workspaceApi.vipMemberRemove(row.telegram_id);
      onRemoved(row.telegram_id);
    } catch (e) {
      window.alert(e?.response?.data?.detail || "Telegram refused the removal");
    } finally {
      setBusy(false);
    }
  };

  const toggleHistory = async () => {
    if (history) return setHistory(null);
    const { items } = await workspaceApi.vipMemberEvents(row.telegram_id);
    setHistory(items.length ? items : [{ event: "no recorded events", at: null }]);
  };

  return (
    <>
      <tr className="border-b border-ink/[0.04] align-top" style={untraced ? { background: TRACE.untraced.bg } : undefined}>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate text-[12px] font-semibold text-text-primary">
              {row.full_name || "—"}
            </p>
            <Chip trace={row.trace} />
          </div>
          <p className="font-mono text-[10px] text-text-primary/45">
            {row.username ? `@${row.username}` : "no username"} · {row.telegram_id}
          </p>
        </td>
        <td className="px-3 py-2 text-[11px]">
          {row.user_id ? (
            <>
              <span className="text-text-primary/85">{row.account || `#${row.user_id}`}</span>
              <span className="block text-text-primary/45">{row.email || ""}</span>
              {row.subscription_expires_at && (
                <span className="block font-mono text-[10px] text-text-primary/40">
                  until {fmtDate(row.subscription_expires_at)}
                </span>
              )}
            </>
          ) : row.legacy ? (
            <span className="text-text-primary/60">legacy member</span>
          ) : (
            <span style={{ color: TRACE.untraced.color }}>no account</span>
          )}
        </td>
        <td className="px-3 py-2 font-mono text-[11px] text-text-primary/70">
          {fmtDate(row.joined_at)}
          <span className="block text-[10px] text-text-primary/40">{fmtAgo(row.joined_at)}</span>
        </td>
        <td className="px-3 py-2 text-[11px]">
          <HowIn row={row} />
        </td>
        <td className="px-3 py-2 w-[22%]">
          <NoteCell row={row} onSaved={onSaved} />
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={toggleHistory}
              className="rounded border border-ink/[0.1] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] hover:bg-ink/[0.04]"
            >
              Log
            </button>
            {row.trace !== "admin" && (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] disabled:opacity-40"
                style={{ borderColor: `${TRACE.untraced.color}55`, color: TRACE.untraced.color }}
              >
                {busy ? "…" : "Kick"}
              </button>
            )}
          </div>
        </td>
      </tr>
      {history && (
        <tr className="border-b border-ink/[0.04]">
          <td colSpan={6} className="bg-ink/[0.02] px-3 py-2">
            <ul className="space-y-1">
              {history.map((h, i) => (
                <li key={i} className="font-mono text-[10px] text-text-primary/60">
                  {h.at ? new Date(h.at).toLocaleString() : ""} · {h.event}
                  {h.invite_link_name ? ` · via ${h.invite_link_name}` : ""}
                  {h.actor_username ? ` · by @${h.actor_username}` : ""}
                  {h.source ? ` · ${h.source}` : ""}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

export function VipMembersTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trace, setTrace] = useState(null);
  const [q, setQ] = useState("");
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const res = await workspaceApi.getVipMembers({ trace: opts.trace ?? trace, q: opts.q ?? q });
      setData(res);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Failed to load VIP members");
    } finally {
      setLoading(false);
    }
  }, [trace, q]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trace]);

  const rows = data?.items || [];
  const counts = useMemo(() => data?.counts || {}, [data]);
  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);

  const onSaved = (tid, note) =>
    setData((d) => ({ ...d, items: d.items.map((r) => (r.telegram_id === tid ? { ...r, note } : r)) }));
  const onRemoved = (tid) =>
    setData((d) => ({ ...d, items: d.items.filter((r) => r.telegram_id !== tid) }));

  const scan = async () => {
    setScanning(true);
    try {
      await workspaceApi.vipScan();
      // The scan runs outside this request; give it a moment, then reload.
      setTimeout(() => load(), 8000);
    } catch (e) {
      window.alert(e?.response?.data?.detail || "Could not start the scan");
      setScanning(false);
      return;
    }
    setTimeout(() => setScanning(false), 8000);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-mono text-sm font-semibold uppercase tracking-[0.16em]">VIP group members</h3>
          <p className="mt-1 font-mono text-[10px] text-text-primary/45">
            {total} in the group · list read {data?.last_seen_at ? fmtAgo(data.last_seen_at) : "—"} · anyone with an
            invite link can join, so this is the only place that says who they are
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load({ q: e.target.value })}
            placeholder="Name, @username, email, Telegram id…"
            className="min-h-[36px] w-56 rounded-lg border border-ink/[0.12] bg-surface-secondary px-2.5 text-[12px] text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            onClick={() => load()}
            className="rounded-lg border border-ink/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] hover:bg-ink/[0.04]"
          >
            Search
          </button>
          <button
            onClick={scan}
            disabled={scanning}
            title="Re-read the member list from Telegram"
            className="rounded-lg border border-ink/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] hover:bg-ink/[0.04] disabled:opacity-40"
          >
            {scanning ? "Scanning…" : "Rescan"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {ORDER.map((k) => (
          <Summary
            key={k}
            label={TRACE[k].label}
            value={counts[k] || 0}
            sub={TRACE[k].hint}
            accent={k === "untraced" && counts[k] ? TRACE.untraced.color : undefined}
            active={trace === k}
            onClick={() => setTrace(trace === k ? null : k)}
          />
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-4">
          <p className="font-mono text-xs text-red-500">{error}</p>
        </div>
      ) : loading ? (
        <p className="font-mono text-xs text-text-primary/50">Loading members…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/[0.06]">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-ink/[0.06]">
                {["Telegram", "LuxQuant account", "Joined", "How they got in", "Note", ""].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 font-mono text-[9px] font-normal uppercase tracking-[0.14em] text-text-primary/40"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row key={r.telegram_id} row={r} onSaved={onSaved} onRemoved={onRemoved} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center font-mono text-[11px] text-text-primary/40">
                    Nobody matches this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="font-mono text-[10px] leading-relaxed text-text-primary/35">
        UNTRACED means no LuxQuant account is linked to that Telegram and it is not a legacy member — worth a look, not
        proof of anything. Joins from now on record the invite link used and who created it; people who were already
        inside show "before tracking", because Telegram never reveals that after the fact. Kick bans and immediately
        unbans, so the seat is taken back but the person can rejoin with a new invite.
      </p>
    </div>
  );
}
