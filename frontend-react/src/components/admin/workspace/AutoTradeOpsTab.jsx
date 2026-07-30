// src/components/admin/workspace/AutoTradeOpsTab.jsx
//
// AutoTrade operations: fleet health, every bot, and every open position.
//
// AutoTrade runs as a separate application against its own database, so this
// used to be an SSH-and-SQL job. Read-only throughout — the database role
// cannot write and cannot see the encrypted API key columns.
//

import { Fragment, useCallback, useEffect, useState } from "react";
import { adminApi } from "../../../services/adminApi";

const STATUS = {
  error: { label: "Error", dot: "#F6465D", fg: "#F6465D", bg: "rgba(246,70,93,0.12)" },
  warn: { label: "Warning", dot: "#F0B90B", fg: "#E3A008", bg: "rgba(240,185,11,0.12)" },
  ok: { label: "Healthy", dot: "#0ECB81", fg: "#0ECB81", bg: "rgba(14,203,129,0.12)" },
  paused: { label: "Paused", dot: "#8B92A5", fg: "#98A2B3", bg: "rgba(139,146,165,0.12)" },
  unlinked: { label: "Not linked", dot: "#5A6070", fg: "#8B92A5", bg: "rgba(90,96,112,0.12)" },
};

const BLOCK_LABEL = {
  reconciliation_required: "Position needs reconciliation (blocks everything)",
  subscription_inactive: "Subscription not active (blocks everything)",
  daily_loss_limit: "Daily loss limit reached (blocks everything)",
  max_live_bots: "Server live-bot capacity reached",
  max_open_positions: "Max open positions reached",
  symbol_position_exists: "Already holding this symbol",
  max_trade_notional: "Trade size above per-trade cap",
  minimum_available_balance: "Minimum reserve would be breached",
  max_daily_trades: "Daily trade limit reached",
  loss_cooldown: "Cooling down after a loss",
  error_cooldown: "Cooling down after a failed trade",
  user_order_throttle: "Short-window order throttle",
};

const fmt = (v) => (v ? new Date(v).toLocaleString() : "—");
const ago = (v) => {
  if (!v) return "—";
  const mins = Math.round((Date.now() - new Date(v).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};
const usd = (n) => `${n < 0 ? "-" : ""}$${Math.abs(Number(n) || 0).toFixed(2)}`;
const day = (v) => (v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—");
// Accumulated running time, so "42d" means forty-two days switched on — not
// forty-two days since the account was created.
const dur = (secs) => {
  const s = Number(secs) || 0;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  const d = Math.floor(s / 86400);
  const h = Math.round((s % 86400) / 3600);
  return d ? `${d}d ${h}h` : `${h}h`;
};
const who = (u) => u.username || u.email || u.cb_email || `lq:${u.luxquant_user_id}`;

function Pill({ status }) {
  const s = STATUS[status] || STATUS.unlinked;
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className="rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-3.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p
        className="mt-1.5 text-[24px] font-semibold leading-none text-text-primary"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-[11px] text-text-muted">{sub}</p> : null}
    </div>
  );
}

function Card({ title, right, children }) {
  return (
    <div className="rounded-xl border border-ink/[0.08] bg-surface-raised">
      <div className="flex items-center justify-between gap-3 border-b border-ink/[0.06] px-4 py-3">
        <p className="text-[13px] font-semibold text-text-primary">{title}</p>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function UserDetail({ userId }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let dead = false;
    adminApi
      .getAutoTradeUser(userId)
      .then((x) => !dead && setD(x))
      .catch((e) => !dead && setErr(e?.message || "Could not load"));
    return () => {
      dead = true;
    };
  }, [userId]);

  if (err) return <p className="px-4 py-3 text-[12px] text-[#F6465D]">{err}</p>;
  if (!d) return <p className="px-4 py-3 text-[12px] text-text-muted">Loading…</p>;
  if (!d.linked) return <p className="px-4 py-3 text-[12px] text-text-muted">Not linked.</p>;

  const s = d.summary || {};
  const facts = [
    ["User", s.username || s.email || "—"],
    ["Plan", s.role || "—"],
    ["Linked", day(s.linked_at)],
    ["First started", s.first_active_at ? day(s.first_active_at) : "never started"],
    ["Active for", s.active_seconds ? dur(s.active_seconds) : "—"],
    ["State", s.active_since ? "running now" : `${s.toggles || 0} on/off toggle(s)`],
    ["Open positions", `${s.open_positions ?? 0}${s.stuck_positions ? ` (+${s.stuck_positions} stuck)` : ""}`],
    ["Realised PnL", usd(s.realized_pnl_total)],
  ];

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-ink/[0.05] py-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
              {k}
            </span>
            <span className="text-[12px] text-text-secondary">{v}</span>
          </div>
        ))}
      </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">
          Recent errors
        </p>
        {d.errors?.length ? (
          <div className="space-y-2">
            {d.errors.slice(0, 6).map((e, i) => (
              <div
                key={`${e.created_at}-${i}`}
                className="rounded-lg border border-[#F6465D]/25 bg-[#F6465D]/[0.06] px-3 py-2"
              >
                <p className="text-[10px] text-text-muted">
                  {fmt(e.created_at)}
                  {e.symbol ? ` · ${e.symbol}` : ""}
                </p>
                <p className="mt-1 break-words font-mono text-[11px] leading-[1.5] text-text-secondary">
                  {e.error || e.action}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-text-muted">No execution errors recorded.</p>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">
            Why entries were blocked (7d)
          </p>
          {d.blocks?.length ? (
            <div className="space-y-1.5">
              {d.blocks.map((b) => (
                <div key={b.code} className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-text-secondary">
                    {BLOCK_LABEL[b.code] || b.code.replaceAll("_", " ")}
                  </span>
                  <span className="whitespace-nowrap font-mono text-[11px] text-text-muted">
                    ×{b.hits}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-text-muted">Nothing blocked.</p>
          )}
        </div>

        {d.alerts?.length ? (
          <div>
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">
              Open alerts
            </p>
            <div className="space-y-1.5">
              {d.alerts.slice(0, 5).map((a) => (
                <div key={a.alert_key}>
                  <p className="text-[12px] font-medium text-text-secondary">{a.title}</p>
                  <p className="text-[11px] leading-[1.5] text-text-muted">{a.message}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
    </div>
  );
}

export const AutoTradeOpsTab = () => {
  const [overview, setOverview] = useState(null);
  const [positions, setPositions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("problems");
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    Promise.all([adminApi.getAutoTradeOverview(), adminApi.getAutoTradePositions()])
      .then(([o, p]) => {
        setOverview(o);
        setPositions(p);
      })
      .catch((e) => setError(e?.message || "Could not load AutoTrade data"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading && !overview) return <p className="text-sm text-text-muted">Loading AutoTrade…</p>;
  if (error) return <p className="text-sm text-[#F6465D]">{error}</p>;
  if (overview?.available === false)
    return (
      <p className="text-sm text-text-muted">
        The AutoTrade database is not reachable from here. Nothing else on this page is
        affected.
      </p>
    );

  const t = overview?.totals || {};
  const pt = positions?.totals || {};
  const users = overview?.users || [];
  const shown =
    filter === "all"
      ? users
      : filter === "problems"
        ? users.filter((u) => u.status === "error" || u.status === "warn")
        : filter === "live"
          ? users.filter((u) => u.is_active && u.dry_run === false)
          : users.filter((u) => u.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
            AUTOTRADE · BOT OPERATIONS
          </p>
          <h2 className="mt-1 text-[22px] font-semibold text-text-primary">AutoTrade Monitor</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Every user&apos;s bot, its health, and everything it is holding right now.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-ink/12 px-3 py-1.5 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Linked" value={t.linked ?? 0} sub={`${t.active ?? 0} active`} />
        <Stat label="Live bots" value={t.live ?? 0} sub="placing real orders" />
        <Stat
          label="Errors"
          value={t.errors ?? 0}
          sub="need attention"
          tone={t.errors ? "#F6465D" : undefined}
        />
        <Stat
          label="Warnings"
          value={t.warnings ?? 0}
          tone={t.warnings ? "#F0B90B" : undefined}
        />
        <Stat
          label="Invalid keys"
          value={t.invalid_keys ?? 0}
          sub="cannot trade"
          tone={t.invalid_keys ? "#F6465D" : undefined}
        />
        <Stat
          label="Stuck positions"
          value={t.stuck_positions ?? 0}
          sub="block all entries"
          tone={t.stuck_positions ? "#F6465D" : undefined}
        />
      </div>

      <Card
        title="Bots"
        right={
          <div className="flex flex-wrap gap-1.5">
            {[
              ["problems", `Needs attention ${(t.errors || 0) + (t.warnings || 0)}`],
              ["live", `Live ${t.live || 0}`],
              ["ok", "Healthy"],
              ["paused", "Paused"],
              ["all", `All ${users.length}`],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                  filter === key
                    ? "bg-accent text-surface-primary"
                    : "border border-ink/10 text-text-muted hover:text-text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {shown.length === 0 ? (
          <p className="text-[13px] text-text-muted">Nothing here — every bot is healthy.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-ink/[0.08] font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 pr-3 font-medium">User</th>
                  <th className="pb-2 pr-3 font-medium">Mode</th>
                  <th className="pb-2 pr-3 font-medium">Started</th>
                  <th className="pb-2 pr-3 font-medium">Active for</th>
                  <th className="pb-2 pr-3 font-medium">Key</th>
                  <th className="pb-2 pr-3 text-right font-medium">Open</th>
                  <th className="pb-2 pr-3 text-right font-medium">Entries 24h</th>
                  <th className="pb-2 pr-3 text-right font-medium">Errors 24h</th>
                  <th className="pb-2 pr-3 text-right font-medium">PnL</th>
                  <th className="pb-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <Fragment key={u.subject}>
                    <tr
                      onClick={() => setExpanded(expanded === u.subject ? null : u.subject)}
                      className="cursor-pointer border-b border-ink/[0.05] text-[13px] hover:bg-ink/[0.02]"
                    >
                      <td className="py-2.5 pr-3">
                        <Pill status={u.status} />
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="block font-medium text-text-primary">{who(u)}</span>
                        <span className="block font-mono text-[10px] text-text-muted">
                          lq:{u.luxquant_user_id}
                          {u.role ? ` · ${u.role}` : ""}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-text-secondary">
                        {u.is_active ? (u.dry_run ? "Dry run" : "Live") : "Paused"}
                        {u.markets?.length ? (
                          <span className="text-text-muted"> · {u.markets.join("+")}</span>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-3 text-[12px] text-text-secondary">
                        {u.first_active_at ? (
                          <>
                            <span className="block">{day(u.first_active_at)}</span>
                            <span className="block text-[10px] text-text-muted">
                              linked {day(u.linked_at)}
                            </span>
                          </>
                        ) : (
                          <span className="text-text-muted">never started</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-[12px] text-text-secondary">
                        {u.active_seconds ? (
                          <>
                            <span className="block tabular-nums">
                              {dur(u.active_seconds)}
                              {u.active_time_estimated ? "*" : ""}
                            </span>
                            <span className="block text-[10px] text-text-muted">
                              {u.active_since ? "running now" : `${u.toggles} toggle${u.toggles === 1 ? "" : "s"}`}
                            </span>
                          </>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-text-secondary">
                        <span
                          style={u.key_status === "invalid" ? { color: "#F6465D" } : undefined}
                        >
                          {u.key_status || "—"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-text-secondary">
                        {u.open_positions}
                        {u.stuck_positions ? (
                          <span style={{ color: "#F6465D" }}> +{u.stuck_positions}</span>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-text-secondary">
                        {u.recent_entries}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        <span style={u.recent_errors ? { color: "#F6465D" } : undefined}>
                          {u.recent_errors}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        <span
                          style={{ color: u.realized_pnl_total >= 0 ? "#0ECB81" : "#F6465D" }}
                        >
                          {usd(u.realized_pnl_total)}
                        </span>
                      </td>
                      <td className="py-2.5 text-[12px] text-text-muted">{u.reasons?.[0]}</td>
                    </tr>
                    {expanded === u.subject ? (
                      <tr className="border-b border-ink/[0.05]">
                        <td colSpan={11} className="bg-ink/[0.02] p-0">
                          <UserDetail userId={u.luxquant_user_id} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-text-muted">
              Click a row to read that bot&apos;s error text and block reasons. &quot;Active
              for&quot; accumulates only the time the bot was switched on; * marks a bot that
              predates the toggle history, where the figure is time since setup.
            </p>
          </div>
        )}
      </Card>

      <Card
        title="Open positions"
        right={
          <span className="font-mono text-[11px] text-text-muted">
            {pt.open ?? 0} open · {pt.stuck ?? 0} stuck · {pt.users_holding ?? 0} users
          </span>
        }
      >
        {positions?.available === false ? (
          <p className="text-[13px] text-text-muted">Positions unavailable.</p>
        ) : !positions?.positions?.length ? (
          <p className="text-[13px] text-text-muted">Nobody is holding anything right now.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-ink/[0.08] font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
                  <th className="pb-2 pr-3 font-medium">Symbol</th>
                  <th className="pb-2 pr-3 font-medium">Market</th>
                  <th className="pb-2 pr-3 font-medium">Side</th>
                  <th className="pb-2 pr-3 text-right font-medium">Qty</th>
                  <th className="pb-2 pr-3 text-right font-medium">Entry</th>
                  <th className="pb-2 pr-3 text-right font-medium">Notional</th>
                  <th className="pb-2 pr-3 font-medium">User</th>
                  <th className="pb-2 pr-3 font-medium">Opened</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {positions.positions.map((p, i) => (
                  <tr
                    key={`${p.subject}-${p.symbol}-${i}`}
                    className="border-b border-ink/[0.05] text-[13px]"
                  >
                    <td className="py-2.5 pr-3 font-medium text-text-primary">{p.symbol}</td>
                    <td className="py-2.5 pr-3 text-text-muted">
                      {p.market_type}
                      {p.market_type === "futures" && p.leverage ? (
                        <span className="text-text-muted"> {p.leverage}×</span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 text-text-secondary">{p.side}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text-secondary">
                      {p.quantity}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text-secondary">
                      {p.entry_price ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text-secondary">
                      {p.notional === null ? "—" : usd(p.notional)}
                    </td>
                    <td className="py-2.5 pr-3 text-[12px] text-text-secondary">
                      {p.username || p.cb_email || p.subject}
                    </td>
                    <td className="py-2.5 pr-3 text-[12px] text-text-muted">{ago(p.created_at)}</td>
                    <td className="py-2.5">
                      {p.status === "reconciliation_required" ? (
                        <span className="text-[12px] font-semibold" style={{ color: "#F6465D" }}>
                          needs reconciliation
                        </span>
                      ) : (
                        <span className="text-[12px] text-text-secondary">
                          {p.dry_run ? "open (dry run)" : "open"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AutoTradeOpsTab;
