// src/components/admin/workspace/BotsTab.jsx
//
// LuxQuant — Management System › Bots.
// Every Telegram bot LuxQuant speaks through, judged on what matters: does the
// token still work, is the profile complete, are the services that run it up,
// and did it actually post. "Service active" alone was the blind spot — the
// Alert bot's service was green for weeks while every alert it sent failed.
//
// Below the bots, the Telethon user sessions (accounts, not bots): for those
// the question is only whether they are still alive, measured by how long ago
// they last wrote a log line.
//
// Data: workspaceApi.getBots() / refreshBots()
// Backend: /api/v1/workspace/bots (admin-only, Redis-cached 60s)

import { useState, useEffect, useCallback } from "react";
import { workspaceApi } from "../../../services/workspaceApi";

const STATUS = {
  ok: { label: "OK", color: "#16a34a", bg: "rgba(22,163,74,0.10)" },
  warn: { label: "WARN", color: "#ca8a04", bg: "rgba(202,138,4,0.12)" },
  down: { label: "DOWN", color: "#dc2626", bg: "rgba(220,38,38,0.10)" },
  info: { label: "NOTE", color: "#6b7280", bg: "rgba(107,114,128,0.10)" },
  unknown: { label: "?", color: "#6b7280", bg: "rgba(107,114,128,0.10)" },
};
const SEVERITY = { down: 0, warn: 1, ok: 2 };

const ago = (iso) => {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  return fmtSecs(s) + " ago";
};
function fmtSecs(s) {
  if (s == null) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

const Pill = ({ status, small }) => {
  const s = STATUS[status] || STATUS.unknown;
  return (
    <span
      className={`inline-block shrink-0 rounded font-mono font-semibold tracking-[0.12em] ${
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
    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-primary/45">{label}</p>
    <p
      className="mt-2 font-mono text-2xl font-semibold tabular-nums"
      style={{ color: accent || "rgb(var(--fg))" }}
    >
      {value}
    </p>
    {sub && <p className="mt-1 font-mono text-[10px] text-text-primary/40">{sub}</p>}
  </div>
);

const Metric = ({ label, value, sub, tone }) => (
  <div className="min-w-0 rounded-lg border border-ink/[0.05] px-3 py-2">
    <p className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-text-primary/40">{label}</p>
    <p
      className="mt-1 truncate font-mono text-sm font-semibold tabular-nums"
      style={{ color: tone ? STATUS[tone].color : "rgb(var(--fg))" }}
    >
      {value}
    </p>
    {sub && <p className="truncate font-mono text-[9px] text-text-primary/40">{sub}</p>}
  </div>
);

/** The numbers that prove a bot is doing its job, per bot. */
function metricsFor(bot) {
  const a = bot.activity || {};
  const d = bot.delivery || {};
  const since = d.window_s ? `since worker start (${fmtSecs(d.window_s)})` : "last 24h";
  switch (bot.key) {
    case "terminal":
      return [
        { label: "Alerts sent · 24h", value: a.alerts_stamped_24h ?? "—", sub: `last ${ago(a.last_alert)}` },
        {
          label: "Delivery failures",
          value: d.available ? d.failed_24h : "—",
          sub: since,
          tone: d.failed_24h ? "warn" : undefined,
        },
        {
          label: "Reachable accounts",
          value: `${a.reachable_accounts ?? "—"} / ${a.linked_accounts ?? "—"}`,
          sub: "started the bot / linked Telegram",
        },
        { label: "Compass posts · 24h", value: a.compass_24h ?? "—", sub: `last ${ago(a.last_compass_post)}` },
      ];
    case "alert":
      return [
        { label: "Role", value: "Fallback", sub: "only when Terminal bot can't reach a user" },
        {
          label: "Delivery failures",
          value: d.available ? d.failed_24h : "—",
          sub: since,
          tone: d.failed_24h ? "warn" : undefined,
        },
      ];
    case "assistant":
      return [
        { label: "Calls · 24h", value: a.calls_24h ?? "—", sub: `last ${ago(a.last_call_post)}` },
        { label: "Tracking · 24h", value: a.tracking_24h ?? "—", sub: `last ${ago(a.last_tracking_post)}` },
        { label: "Runners · 24h", value: a.runners_24h ?? "—", sub: `last ${ago(a.last_runner_post)}` },
        {
          label: "Failures · 24h",
          value: (a.failures_24h || 0) + (a.runner_failures_24h || 0),
          sub: a.calls_waiting_6h ? `${a.calls_waiting_6h} calls waiting` : "none waiting",
          tone: a.failures_24h || a.runner_failures_24h || a.calls_waiting_6h ? "warn" : undefined,
        },
      ];
    case "ai":
      return [
        { label: "Channel posts · 24h", value: a.channel_posts_24h ?? "—", sub: `last ${ago(a.last_channel_post)}` },
      ];
    default:
      return [];
  }
}

function Row({ label, children }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-ink/[0.05] py-2 last:border-0">
      <p className="w-28 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-text-primary/40">{label}</p>
      <div className="min-w-0 flex-1 break-words font-mono text-[11px] text-text-primary/80">{children}</div>
    </div>
  );
}

function BotCard({ bot }) {
  const s = STATUS[bot.status] || STATUS.unknown;
  const p = bot.profile || {};
  const wh = bot.webhook || {};
  const attention = bot.status !== "ok";
  const problems = (bot.checks || []).filter((c) => c.level !== "info");
  const notes = (bot.checks || []).filter((c) => c.level === "info");

  return (
    <div
      className={`relative flex min-w-0 flex-col overflow-hidden rounded-xl border p-4 ${
        attention ? "" : "border-ink/[0.07]"
      }`}
      style={attention ? { borderColor: `${s.color}55`, background: s.bg } : { background: "rgb(var(--surface))" }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: attention ? s.color : "transparent" }}
      />

      <div className="flex items-start gap-3">
        {p.avatar ? (
          <img src={p.avatar} alt="" className="h-11 w-11 shrink-0 rounded-full border border-ink/10 object-cover" />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-ink/20 font-mono text-[9px] text-text-primary/40">
            no photo
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-[15px] font-semibold text-text-primary">
              {bot.name || bot.key}
            </p>
            <Pill status={bot.status} />
          </div>
          {bot.username ? (
            <a
              href={`https://t.me/${bot.username}`}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono text-[11px] text-text-primary/55 underline-offset-2 hover:underline"
            >
              @{bot.username}
            </a>
          ) : (
            <p className="font-mono text-[11px] text-text-primary/40">{bot.env}</p>
          )}
        </div>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-text-primary/65">{bot.role}</p>

      <ul className="mt-3 space-y-1.5">
        {problems.length === 0 ? (
          <li className="font-mono text-[11px]" style={{ color: STATUS.ok.color }}>
            ✓ All checks passed
          </li>
        ) : (
          problems.map((c, i) => (
            <li key={i} className="flex gap-2 font-mono text-[11px] leading-snug" style={{ color: STATUS[c.level].color }}>
              <span aria-hidden="true">{c.level === "down" ? "●" : "▲"}</span>
              <span className="min-w-0">{c.text}</span>
            </li>
          ))
        )}
        {notes.map((c, i) => (
          <li key={`n${i}`} className="flex gap-2 font-mono text-[11px] leading-snug text-text-primary/45">
            <span aria-hidden="true">·</span>
            <span className="min-w-0">{c.text}</span>
          </li>
        ))}
      </ul>

      {metricsFor(bot).length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {metricsFor(bot).map((m) => (
            <Metric key={m.label} {...m} />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(bot.services || []).map((u) => {
          const us = STATUS[u.health === "ok" ? "ok" : u.health === "down" ? "down" : u.health === "warn" ? "warn" : "unknown"];
          return (
            <span
              key={u.unit}
              title={`${u.active_state}/${u.sub_state}${u.restarts ? ` · ${u.restarts} restarts` : ""}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink/[0.07] px-2 py-1 font-mono text-[10px] text-text-primary/70"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: us.color }} />
              {u.name || u.unit}
              {u.uptime_seconds != null && u.kind !== "timer" && (
                <span className="text-text-primary/35">{fmtSecs(u.uptime_seconds)}</span>
              )}
            </span>
          );
        })}
      </div>

      <details className="group mt-3 border-t border-ink/[0.05] pt-2">
        <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.14em] text-text-primary/45 hover:text-text-primary/70">
          <span className="group-open:hidden">▸ Profile & plumbing</span>
          <span className="hidden group-open:inline">▾ Profile & plumbing</span>
        </summary>
        <div className="mt-2">
          <Row label="Photo">{p.photo ? "set" : <span style={{ color: STATUS.warn.color }}>missing</span>}</Row>
          <Row label="Short desc">{p.short_description || <span style={{ color: STATUS.warn.color }}>missing</span>}</Row>
          <Row label="Description">
            {p.description ? (
              <span className="whitespace-pre-line">{p.description}</span>
            ) : (
              <span style={{ color: STATUS.warn.color }}>missing</span>
            )}
          </Row>
          <Row label="Commands">
            {p.commands?.length ? p.commands.map((c) => `/${c}`).join("  ") : <span className="text-text-primary/40">none</span>}
          </Row>
          <Row label="Menu button">{p.menu_button || "—"}</Row>
          <Row label="Webhook">
            {wh.set ? (
              <>
                {wh.host} · {wh.pending} pending
                {wh.last_error && (
                  <span className="block text-text-primary/45">
                    last error {fmtSecs(wh.last_error_age_s)} ago: {wh.last_error}
                  </span>
                )}
              </>
            ) : (
              <>not set (polling / send-only) · {wh.pending ?? 0} unread</>
            )}
          </Row>
          <Row label="Token">
            {bot.env} <span className="text-text-primary/40">in {bot.env_file}</span>
          </Row>
        </div>
      </details>
    </div>
  );
}

export function BotsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (force = false) => {
    force ? setRefreshing(true) : setLoading(true);
    try {
      const res = force ? await workspaceApi.refreshBots() : await workspaceApi.getBots();
      setData(res);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Failed to load bots");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  if (loading) return <p className="font-mono text-xs text-text-primary/50">Checking bots…</p>;
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-4">
        <p className="font-mono text-xs text-red-500">{error}</p>
      </div>
    );
  }

  const bots = [...(data?.bots || [])].sort((a, b) => (SEVERITY[a.status] ?? 9) - (SEVERITY[b.status] ?? 9));
  const sessions = data?.sessions || [];
  const c = data?.counts || {};
  const checkedAgo = data?.checked_at ? fmtSecs(Date.now() / 1000 - data.checked_at) : "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-mono text-sm font-semibold uppercase tracking-[0.16em]">Telegram bots</h3>
          <p className="mt-1 font-mono text-[10px] text-text-primary/45">
            Checked {checkedAgo} ago · cached {data?.cache_ttl_s || 60}s · {bots.length} bots, {sessions.length} user
            sessions
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="rounded-lg border border-ink/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition hover:bg-ink/[0.04] disabled:opacity-40"
        >
          {refreshing ? "Checking…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary
          label="Down"
          value={c.down || 0}
          sub={c.down ? "not delivering" : "none"}
          accent={c.down ? STATUS.down.color : STATUS.ok.color}
        />
        <Summary
          label="Warnings"
          value={c.warn || 0}
          sub="needs a look"
          accent={c.warn ? STATUS.warn.color : undefined}
        />
        <Summary label="Healthy" value={c.ok || 0} sub="bots + sessions" accent={STATUS.ok.color} />
        <Summary label="Tracked" value={bots.length + sessions.length} sub="bots + sessions" />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {bots.map((b) => (
          <BotCard key={b.key} bot={b} />
        ))}
      </div>

      <div>
        <h4 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-text-primary/70">
          User sessions (Telethon)
        </h4>
        <p className="mt-1 font-mono text-[10px] text-text-primary/40">
          Accounts, not bots — no profile to check. "Active" is not the same as alive, so each is also judged by its
          last log line.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-ink/[0.06]">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-ink/[0.06]">
                {["Session", "Status", "Last log", "Service", "What it does"].map((h) => (
                  <th key={h} className="px-3 py-2 font-mono text-[9px] font-normal uppercase tracking-[0.14em] text-text-primary/40">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.unit} className="border-b border-ink/[0.04] last:border-0 align-top">
                  <td className="px-3 py-2">
                    <p className="text-[12px] font-semibold text-text-primary">{s.label}</p>
                    <p className="font-mono text-[10px] text-text-primary/40">{s.unit.replace(/\.service$/, "")}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Pill status={s.status} small />
                    {s.note && (
                      <p className="mt-1 font-mono text-[10px]" style={{ color: STATUS[s.status]?.color }}>
                        {s.note}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-text-primary/70">
                    {s.last_log_age_s != null ? `${fmtSecs(s.last_log_age_s)} ago` : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-text-primary/55">
                    {s.service?.active_state}/{s.service?.sub_state}
                    {s.service?.restarts ? ` · ${s.service.restarts} restarts` : ""}
                  </td>
                  <td className="px-3 py-2 text-[11px] leading-snug text-text-primary/60">{s.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="font-mono text-[10px] leading-relaxed text-text-primary/35">
        DOWN = the bot cannot deliver (token rejected, its service stopped, webhook failing, or calls piling up
        unposted). WARN = it works but something needs a look (incomplete profile, recent failures, a quiet channel).
        Notes never change a status. Delivery failures are counted from the delivery worker's own log since it last
        started, because a failed send is stamped in the database exactly like a successful one.
      </p>
    </div>
  );
}
