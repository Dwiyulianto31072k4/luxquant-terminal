// src/components/admin/workspace/AutoTradeOpsTab.jsx
//
// Agent operations: desk profitability, every bot, and every open position.
//
// Agent runs as a separate application against its own database, so this
// used to be an SSH-and-SQL job. Read-only throughout — the database role
// cannot write and cannot see the encrypted API key columns.
//
// Profit/loss is a DIVERGING encoding (two poles, neutral zero), not a set of
// categorical series. Colours are the product's #0ECB81 / #F6465D; see the note
// in AutoTradeUserModal.jsx for why that pair is kept and what was measured.
//

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminApi } from "../../../services/adminApi";
import { AutoTradeUserModal } from "./AutoTradeUserModal";
import ForceCloseModal from "./ForceCloseModal";
import { CollectionPagination, useCollectionPagination } from "../CollectionPagination";
import { EXCHANGE_LIST, EXCHANGE_VENUES, VenueLogo } from "../../autotrade/exchangeVenues";
import { SearchIcon, RefreshIcon, AlertTriangleIcon } from "../Icons";

const UP = "#0ECB81";
const DOWN = "#F6465D";
const WARN = "#F0B90B";
const GRID = "rgba(255,255,255,0.06)";
const AXIS = "#8B92A5";

// Performance epoch. History is kept; "All time" still shows everything.
const TRACKING_RESET_AT = "2026-08-14T17:13:05Z";
const PERIODS = [
  ["Since reset", TRACKING_RESET_AT],
  ["30 days", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)],
  ["All time", ""],
];

const STATUS = {
  error: { label: "Error", dot: DOWN, fg: DOWN, bg: "rgba(246,70,93,0.12)" },
  warn: { label: "Warning", dot: WARN, fg: "#E3A008", bg: "rgba(240,185,11,0.12)" },
  recovered: { label: "Recovered", dot: WARN, fg: "#E3A008", bg: "rgba(240,185,11,0.12)" },
  ok: { label: "Healthy", dot: UP, fg: UP, bg: "rgba(14,203,129,0.12)" },
  paused: { label: "Paused", dot: "#8B92A5", fg: "#98A2B3", bg: "rgba(139,146,165,0.12)" },
  unsigned: { label: "No agreement", dot: AXIS, fg: "#98A2B3", bg: "rgba(139,146,165,0.12)" },
  unlinked: { label: "Not linked", dot: "#5A6070", fg: "#8B92A5", bg: "rgba(90,96,112,0.12)" },
};

// How a position ended. Futures closes used to be recorded as one undifferentiated
// "exchange_close" — the exchange only told us the position was gone. The
// reconciler now reads the closing order, which matters because a stop that was
// hit and a liquidation call for opposite fixes: a wrong signal versus leverage
// too high for the stop distance. `exchange_close` is kept as an honest "we
// could not tell", never folded into stop-loss to make the split look complete.
const EXIT_REASONS = {
  take_profit: { label: "Take-profit hit", note: "target reached", tone: UP },
  trailing_stop: { label: "Trailing stop", note: "locked in a move", tone: UP },
  stop_loss: { label: "Stop-loss hit", note: "price went the wrong way", tone: DOWN },
  liquidated: { label: "Liquidated", note: "leverage too high for the stop distance", tone: DOWN },
  auto_deleveraged: { label: "Auto-deleveraged", note: "closed by the exchange, not by us", tone: DOWN },
  emergency_close_unprotected: { label: "Emergency close", note: "entry had no stop, so we flattened it", tone: DOWN },
  forced_sell: { label: "Force-closed", note: "closed by an operator", tone: AXIS },
  manual_exit: { label: "Closed manually", note: "closed outside the bot", tone: AXIS },
  exchange_close: { label: "Not attributed", note: "closing order could not be identified", tone: AXIS },
};

const usd = (n) => `${n < 0 ? "-" : ""}$${Math.abs(Number(n) || 0).toFixed(2)}`;
const signed = (n) => `${n >= 0 ? "+" : "-"}$${Math.abs(Number(n) || 0).toFixed(2)}`;
const fmtMark = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return "—";
  if (x >= 100) return x.toFixed(2);
  if (x >= 1) return x.toPrecision(6).replace(/\.?0+$/, "");
  return String(x);
};
const marksMissing = (rows) =>
  Array.isArray(rows) && rows.length > 0 && rows.every((p) => p.mark_price == null);
const day = (v) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—";
const ago = (v) => {
  if (!v) return "—";
  const mins = Math.round((Date.now() - new Date(v).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};
// Accumulated running time, so "42d" means forty-two days switched on — not
// forty-two days since the account was created.
const dur = (secs) => {
  const s = Number(secs) || 0;
  if (!s) return "—";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  const d = Math.floor(s / 86400);
  const h = Math.round((s % 86400) / 3600);
  return d ? `${d}d ${h}h` : `${h}h`;
};
const who = (u) => u.username || u.email || u.cb_email || `lq:${u.luxquant_user_id}`;

function Pill({ status, recovered }) {
  const key = status === "warn" && recovered ? "recovered" : status;
  const s = STATUS[key] || STATUS.unlinked;
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

function Card({ title, right, children, padded = true }) {
  return (
    <div className="rounded-xl border border-ink/[0.08] bg-surface-raised">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/[0.06] px-4 py-3">
        <p className="text-[13px] font-semibold text-text-primary">{title}</p>
        {right}
      </div>
      <div className={padded ? "p-4" : ""}>{children}</div>
    </div>
  );
}

function TipBox({ rows }) {
  return (
    <div className="rounded-lg border border-ink/15 bg-[#0B0E11] px-3 py-2 shadow-xl">
      {rows.map(([k, v, color]) => (
        <p key={k} className="text-[11px] leading-5">
          <span className="text-text-muted">{k} </span>
          <span style={color ? { color } : undefined} className="text-text-primary">
            {v}
          </span>
        </p>
      ))}
    </div>
  );
}

// Sorting is the whole point of a leaderboard, so every numeric column sorts and
// the active one says which way it is pointing.
function Th({ label, sortKey, sort, onSort, align = "left" }) {
  const active = sort.key === sortKey;
  return (
    <th
      className={`pb-2 pr-3 font-medium ${align === "right" ? "text-right" : ""} ${
        sortKey ? "cursor-pointer select-none hover:text-text-secondary" : ""
      }`}
      onClick={sortKey ? () => onSort(sortKey) : undefined}
    >
      {label}
      {active ? <span className="text-accent"> {sort.dir === "asc" ? "↑" : "↓"}</span> : null}
    </th>
  );
}

export const AutoTradeOpsTab = () => {
  const [overview, setOverview] = useState(null);
  const [positions, setPositions] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("problems");
  const [sort, setSort] = useState({ key: "net", dir: "desc" });
  const [modalUser, setModalUser] = useState(null);
  const [closing, setClosing] = useState(null);
  const [since, setSince] = useState(TRACKING_RESET_AT);
  const [waitlist, setWaitlist] = useState(null);
  const [venueFilter, setVenueFilter] = useState("all");
  const [query, setQuery] = useState("");

  const load = useCallback((attempt = 0) => {
    const n = typeof attempt === "number" ? attempt : 0;
    if (n === 0) {
      setLoading(true);
      setError("");
    }
    Promise.all([
      adminApi.getAutoTradeOverview(),
      adminApi.getAutoTradePositions(),
      adminApi.getAutoTradeAnalytics(since),
      adminApi.getAgentExchangeWaitlist().catch(() => null),
    ])
      .then(([o, p, a, w]) => {
        setOverview(o);
        setPositions(p);
        setAnalytics(a);
        setWaitlist(w);
        if (marksMissing(p?.positions) && n < 1) {
          setTimeout(() => load(n + 1), 1500);
        }
      })
      .catch((e) => setError(e?.message || "Could not load Agent data"))
      .finally(() => {
        if (n === 0) setLoading(false);
      });
  }, [since]);

  useEffect(() => {
    load(0);
  }, [load]);

  const onSort = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  // Trading performance lives in analytics, health lives in overview. Merge on
  // subject so one row answers both "is it broken" and "is it making money".
  const rows = useMemo(() => {
    const perf = new Map((analytics?.leaderboard || []).map((u) => [u.subject, u]));
    return (overview?.users || []).map((u) => ({ ...u, ...(perf.get(u.subject) || {}) }));
  }, [overview, analytics]);

  const t = overview?.totals || {};
  const at = analytics?.totals || {};
  const pt = positions?.totals || {};

  const venueMatch = (u) =>
    venueFilter === "all" || (u.venues || []).some((v) => v.exchange === venueFilter && v.connected);

  const linked = rows.filter((u) => u.has_account);
  const filtered = (
    filter === "all"
      ? linked
      : filter === "unlinked"
        ? rows.filter((u) => !u.has_account)
        : filter === "problems"
          ? linked.filter((u) => u.status === "error" || (u.status === "warn" && !u.errors_recovered))
          : filter === "recovered"
            ? linked.filter((u) => u.errors_recovered)
          : filter === "unsigned"
            ? linked.filter((u) => u.status === "unsigned" || !u.has_live_ack)
          : filter === "signed"
            ? linked.filter((u) => u.has_live_ack)
          : filter === "live"
            ? linked.filter((u) => u.is_active && u.dry_run === false)
            : filter === "profitable"
              ? linked.filter((u) => (u.net ?? 0) > 0)
              : linked.filter((u) => u.status === filter)
  ).filter(venueMatch).filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = [who(u), u.email, u.cb_email, `lq:${u.luxquant_user_id}`, u.subject]
      .concat((u.venues || []).map((v) => v.exchange))
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  const shown = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return filtered.slice().sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return typeof av === "string" ? dir * av.localeCompare(bv) : dir * (av - bv);
    });
  }, [filtered, sort]);
  const botPages = useCollectionPagination(shown, 20);
  const positionRows = (positions?.positions || []).filter(
    (p) => venueFilter === "all" || (p.venue || p.exchange) === venueFilter
  );
  const positionPages = useCollectionPagination(positionRows, 20);

  const venuePnl = useMemo(() => {
    const map = new Map((analytics?.by_exchange || []).map((b) => [b.key, b]));
    return map;
  }, [analytics]);

  const venueCards = useMemo(() => {
    const snap = new Map((overview?.by_exchange || []).map((v) => [v.exchange, v]));
    return EXCHANGE_LIST.map((meta) => {
      const row = snap.get(meta.id) || {};
      const pnl = venuePnl.get(meta.id) || {};
      return {
        ...meta,
        connected: row.connected || 0,
        live: row.live || 0,
        dryRun: row.dry_run || 0,
        invalid: row.invalid_keys || 0,
        trades: pnl.trades || 0,
        net: pnl.net,
        winRate: pnl.win_rate,
        wait: waitlist?.counts?.[meta.id] || 0,
      };
    });
  }, [overview, venuePnl, waitlist]);

  const funnel = overview?.funnel || {};
  const funnelSteps = [
    ["Opened Agent", funnel.opened ?? t.signed_in ?? 0],
    ["Connected a key", funnel.connected ?? t.linked ?? 0],
    ["Live", funnel.live ?? t.live ?? 0],
    ["Profitable", at.profitable_users ?? 0],
  ];

  const leverageData = useMemo(
    () =>
      (analytics?.by_leverage || [])
        .filter((b) => b.key !== null && b.trades >= 3)
        .map((b) => ({ ...b, label: `${b.key}×` })),
    [analytics]
  );

  // Ordered by trade count, but "Not attributed" is pinned last: it is an
  // absence of information, not an outcome to compare against the others.
  const exitData = useMemo(() => {
    const rows = (analytics?.by_exit_reason || []).filter((b) => b.trades > 0);
    const most = Math.max(1, ...rows.map((b) => b.trades));
    return rows
      .map((b) => ({
        ...b,
        meta: EXIT_REASONS[b.key] || {
          label: (b.key || "unknown").replaceAll("_", " "),
          note: "",
          tone: AXIS,
        },
        share: b.trades / most,
        unattributed: !b.key || b.key === "exchange_close",
      }))
      .sort((a, b) =>
        a.unattributed !== b.unattributed ? a.unattributed - b.unattributed : b.trades - a.trades
      );
  }, [analytics]);

  const recoveredCount = linked.filter((u) => u.errors_recovered).length;
  const openErrorCount = linked.filter((u) => u.status === "error").length;
  const hasDeskTrades = Boolean(at.trades);
  const maxFunnel = Math.max(1, ...funnelSteps.map(([, n]) => n));

  if (loading && !overview) return <p className="text-sm text-text-muted">Loading Agent…</p>;
  if (error) return <p className="text-sm text-[#F6465D]">{error}</p>;
  if (overview?.available === false)
    return (
      <p className="text-sm text-text-muted">
        The Agent database is not reachable from here. Nothing else on this page is affected.
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
            AGENT · BOT OPERATIONS
          </p>
          <h2 className="mt-1 text-[22px] font-semibold text-text-primary">Agent Monitor</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Fleet health, every venue, every bot. Click a row to drill in.
            {since ? (
              <span className="text-text-muted"> Figures from {day(since)} onward.</span>
            ) : (
              <span className="text-text-muted"> Figures cover all time.</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {PERIODS.map(([label, value]) => (
              <button
                key={label}
                type="button"
                onClick={() => setSince(value)}
                className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                  since === value
                    ? "bg-accent text-surface-primary"
                    : "border border-ink/10 text-text-muted hover:text-text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/12 px-3 py-1.5 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
          >
            <RefreshIcon size={12} />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Live bots", t.live ?? 0, "placing real orders", undefined, "live"],
          ["Open errors", openErrorCount, "still blocking or failing", openErrorCount ? DOWN : undefined, "problems"],
          ["Recovered 24h", recoveredCount, "failed then filled", recoveredCount ? WARN : undefined, "recovered"],
          ["Invalid keys", t.invalid_keys ?? 0, "cannot trade", t.invalid_keys ? DOWN : undefined, "problems"],
          ["Stuck", t.stuck_positions ?? 0, "block all entries", t.stuck_positions ? DOWN : undefined, "problems"],
          ["Net realised", hasDeskTrades ? usd(at.net ?? 0) : "—", hasDeskTrades ? `${at.trades} trades` : "no settled trades yet", hasDeskTrades ? ((at.net ?? 0) >= 0 ? UP : DOWN) : undefined, "all"],
        ].map(([label, value, sub, tone, next]) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setFilter(next);
              botPages.resetPage();
            }}
            className="rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-3 text-left transition-colors hover:border-ink/20"
          >
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">{label}</p>
            <p className="mt-1.5 text-[22px] font-semibold leading-none tabular-nums text-text-primary" style={tone ? { color: tone } : undefined}>
              {value}
            </p>
            <p className="mt-1 text-[11px] text-text-muted">{sub}</p>
          </button>
        ))}
      </div>

      {openErrorCount || t.stuck_positions ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#F6465D]/25 bg-[#F6465D]/[0.05] px-3 py-2">
          <AlertTriangleIcon size={13} style={{ color: DOWN }} />
          <span className="text-[12px] text-text-secondary">Needs attention now</span>
          {openErrorCount ? (
            <button type="button" onClick={() => setFilter("problems")} className="rounded-full bg-[#F6465D]/15 px-2 py-0.5 text-[11px] font-semibold" style={{ color: DOWN }}>
              {openErrorCount} open error{openErrorCount === 1 ? "" : "s"}
            </button>
          ) : null}
          {t.stuck_positions ? (
            <span className="rounded-full bg-[#F6465D]/15 px-2 py-0.5 text-[11px] font-semibold" style={{ color: DOWN }}>
              {t.stuck_positions} stuck
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[12px] font-semibold text-text-primary">Activation</p>
          {waitlist?.counts && Object.keys(waitlist.counts).length ? (
            <p className="font-mono text-[11px] text-accent">
              Waitlist {Object.entries(waitlist.counts).map(([k, n]) => `${k} ${n}`).join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {funnelSteps.map(([label, value], i) => {
            const prev = i === 0 ? value : funnelSteps[i - 1][1];
            const rate = i === 0 || !prev ? null : Math.round((value / prev) * 100);
            return (
              <div key={label}>
                <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className="h-full rounded-full bg-accent/80"
                    style={{ width: `${Math.max(4, (value / maxFunnel) * 100)}%` }}
                  />
                </div>
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">{label}</p>
                <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-text-primary">{value}</p>
                <p className="text-[11px] text-text-muted">
                  {rate === null ? "opened Agent" : `${rate}% of previous`}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <Card
        title="Live trading agreements"
        right={
          <span className="text-[11px] text-text-muted">
            {t.signed_live ?? 0} signed · {t.unsigned ?? 0} connected without the form
          </span>
        }
      >
        {linked.filter((u) => u.has_live_ack).length ? (
          <div className="space-y-2">
            {linked
              .filter((u) => u.has_live_ack)
              .map((u) => (
                <div
                  key={u.subject}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink/[0.06] px-3 py-2"
                >
                  <div>
                    <p className="text-[13px] font-medium text-text-primary">{who(u)}</p>
                    <p className="font-mono text-[11px] text-text-muted">
                      lq:{u.luxquant_user_id} · signed {day(u.live_ack_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.live_ack_id ? (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const blob = await adminApi.downloadUserAgentAckPdf(
                              u.luxquant_user_id,
                              u.live_ack_id
                            );
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `luxquant-agent-live-${u.live_ack_id}.pdf`;
                            a.click();
                            URL.revokeObjectURL(url);
                          } catch (err) {
                            setError(err?.message || "Could not download PDF");
                          }
                        }}
                        className="rounded-lg border border-ink/12 px-2.5 py-1 text-[11px] text-text-secondary hover:border-accent hover:text-accent"
                      >
                        Download PDF
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setModalUser(u)}
                      className="rounded-lg border border-ink/12 px-2.5 py-1 text-[11px] text-text-secondary hover:border-accent hover:text-accent"
                    >
                      Open bot
                    </button>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-[13px] text-text-muted">
            Nobody has signed the live trading form yet.
          </p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
          The same PDFs also live on each person&apos;s record: Users → open the user →
          Agent tab → Signed acknowledgements. Unsigned connected keys stay under
          No agreement — they are not live Agent incidents.
        </p>
      </Card>

      <Card
        title="Venues"
        right={
          <span className="text-[11px] text-text-muted">
            {t.venues_live ?? venueCards.filter((v) => v.live).length} of {venueCards.length} placing
            live orders
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setVenueFilter("all")}
            className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
              venueFilter === "all"
                ? "bg-accent text-surface-primary"
                : "border border-ink/10 text-text-muted hover:text-text-secondary"
            }`}
          >
            All venues
          </button>
          {venueCards.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setVenueFilter(v.id);
                botPages.resetPage();
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                venueFilter === v.id
                  ? "bg-accent text-surface-primary"
                  : "border border-ink/10 text-text-muted hover:text-text-secondary"
              }`}
            >
              <VenueLogo venue={v.id} className="h-3.5 w-3.5" />
              {v.name}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {venueCards.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setVenueFilter(v.id === venueFilter ? "all" : v.id);
                botPages.resetPage();
              }}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                venueFilter === v.id
                  ? "border-accent/40 bg-accent/[0.06]"
                  : "border-ink/[0.08] hover:border-ink/20"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <VenueLogo venue={v.id} className="h-5 w-5" />
                  <span className="text-[12px] font-semibold text-text-primary">{v.name}</span>
                </span>
                <span
                  className="font-mono text-[10px] uppercase tracking-wider"
                  style={{ color: v.live ? UP : AXIS }}
                >
                  {v.live ? "live" : v.connected ? "on" : "—"}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-text-muted">
                {v.connected}/{v.live}
                {v.dryRun ? ` · ${v.dryRun} dry` : ""}
              </p>
              <p
                className="mt-0.5 text-[14px] font-semibold tabular-nums"
                style={{ color: v.trades ? ((v.net ?? 0) >= 0 ? UP : DOWN) : AXIS }}
              >
                {v.trades ? usd(v.net ?? 0) : "—"}
              </p>
              {v.invalid ? (
                <p className="mt-0.5 text-[10px] font-semibold" style={{ color: DOWN }}>
                  {v.invalid} bad key{v.invalid === 1 ? "" : "s"}
                </p>
              ) : null}
            </button>
          ))}
        </div>
      </Card>

      {/* Money — hidden as a wall of zeros when the window has no settled trades */}
      {analytics?.available && hasDeskTrades ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Stat
              label="Net realised — bot"
              value={usd(at.net ?? 0)}
              sub={`${at.trades ?? 0} trades Agent placed`}
              tone={(at.net ?? 0) >= 0 ? UP : DOWN}
            />
            <Stat
              label="Win rate"
              value={at.win_rate === null ? "—" : `${at.win_rate}%`}
              sub={`${at.wins ?? 0}W / ${at.losses ?? 0}L`}
            />
            <Stat label="Won" value={usd(at.won ?? 0)} tone={UP} sub={`avg ${usd(at.avg_win ?? 0)}`} />
            <Stat
              label="Lost"
              value={usd(at.lost ?? 0)}
              tone={DOWN}
              sub={`avg ${usd(at.avg_loss ?? 0)}`}
            />
            <Stat
              label="Profitable users"
              value={`${at.profitable_users ?? 0} / ${(at.profitable_users ?? 0) + (at.losing_users ?? 0)}`}
              tone={at.profitable_users ? UP : DOWN}
            />
            <Stat
              label="Avg hold"
              value={`${at.avg_hold_loss_hours ?? "—"}h`}
              sub={`losses · wins ${at.avg_hold_win_hours ?? "—"}h`}
              tone={
                at.avg_hold_loss_hours && at.avg_hold_win_hours
                  ? at.avg_hold_loss_hours > at.avg_hold_win_hours
                    ? DOWN
                    : UP
                  : undefined
              }
            />
          </div>

          {analytics?.manual?.trades ? (
            <Card
              title="Traded by hand, not by the bot"
              right={
                <span className="text-[11px] text-text-muted">
                  excluded from every figure above
                </span>
              }
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat
                  label="Net realised — manual"
                  value={usd(analytics.manual.net ?? 0)}
                  sub={`${analytics.manual.trades} trades · ${analytics.manual.traders} account(s)`}
                  tone={(analytics.manual.net ?? 0) >= 0 ? UP : DOWN}
                />
                <Stat
                  label="Wins / losses"
                  value={`${analytics.manual.wins ?? 0}W / ${analytics.manual.losses ?? 0}L`}
                />
                <Stat
                  label="Share of total loss"
                  value={
                    (at.net ?? 0) + (analytics.manual.net ?? 0) < 0
                      ? `${Math.round(
                          (Math.abs(analytics.manual.net ?? 0) /
                            Math.abs((at.net ?? 0) + (analytics.manual.net ?? 0))) *
                            100
                        )}%`
                      : "—"
                  }
                  sub="of the desk's combined result"
                />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
                These positions were opened on the same exchange accounts but not by
                Agent — the reconciler adopts whatever it finds, so a user's own
                trades land here too. They keep no stop-loss from us and cannot be
                attributed to a take-profit or stop, which is why they never appear in
                the exit-reason breakdown.
              </p>
            </Card>
          ) : null}

          {(analytics?.by_exchange || []).length ? (
            <Card
              title="Net result by venue"
              right={
                <span className="text-[11px] text-text-muted">
                  settled bot trades in this window
                </span>
              }
            >
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={(analytics.by_exchange || []).map((b) => ({
                      ...b,
                      label: EXCHANGE_VENUES[b.key]?.name || b.key || "unknown",
                    }))}
                    margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
                  >
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={{ fill: AXIS, fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={58}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.28)" />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <TipBox
                            rows={[
                              ["Venue", payload[0].payload.label],
                              [
                                "Net",
                                signed(payload[0].payload.net),
                                payload[0].payload.net >= 0 ? UP : DOWN,
                              ],
                              ["Trades", payload[0].payload.trades],
                              ["Win rate", `${payload[0].payload.win_rate}%`],
                            ]}
                          />
                        ) : null
                      }
                    />
                    <Bar dataKey="net" radius={[4, 4, 0, 0]} barSize={46}>
                      {(analytics.by_exchange || []).map((b) => (
                        <Cell key={b.key} fill={b.net >= 0 ? UP : DOWN} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : null}

          {leverageData.length ? (
            <Card
              title="Net result by leverage"
              right={
                <span className="text-[11px] text-text-muted">
                  settled trades, 3+ per tier · bars sit either side of zero
                </span>
              }
            >
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={leverageData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: AXIS, fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fill: AXIS, fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={58}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.28)" />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <TipBox
                            rows={[
                              ["Leverage", payload[0].payload.label],
                              [
                                "Net",
                                signed(payload[0].payload.net),
                                payload[0].payload.net >= 0 ? UP : DOWN,
                              ],
                              ["Trades", payload[0].payload.trades],
                              ["Win rate", `${payload[0].payload.win_rate}%`],
                            ]}
                          />
                        ) : null
                      }
                    />
                    <Bar dataKey="net" radius={[4, 4, 0, 0]} barSize={46}>
                      {leverageData.map((b) => (
                        <Cell key={b.key} fill={b.net >= 0 ? UP : DOWN} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : null}

          {exitData.length ? (
            <Card
              title="How positions ended"
              right={
                <span className="text-[11px] text-text-muted">
                  read from the closing order on the exchange
                </span>
              }
            >
              <div className="space-y-2.5">
                {exitData.map((b) => (
                  <div key={b.key || "unknown"} className="flex items-center gap-3">
                    <div className="w-44 shrink-0">
                      <p
                        className="text-[13px] text-text-primary"
                        style={b.unattributed ? { color: AXIS } : undefined}
                      >
                        {b.meta.label}
                      </p>
                      {b.meta.note ? (
                        <p className="text-[11px] leading-tight text-text-muted">{b.meta.note}</p>
                      ) : null}
                    </div>
                    <div className="h-2 flex-1 rounded-full bg-ink/5">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${Math.max(2, b.share * 100)}%`,
                          backgroundColor: b.meta.tone,
                          opacity: b.unattributed ? 0.35 : 0.85,
                        }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right font-mono text-[12px] text-text-secondary">
                      {b.trades}
                    </span>
                    <span
                      className="w-24 shrink-0 text-right font-mono text-[12px]"
                      style={{ color: b.net >= 0 ? UP : DOWN }}
                    >
                      {signed(b.net)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-text-muted">
                Trades and net result per outcome. &quot;Not attributed&quot; means the exchange
                gave no closing order we could match — mostly positions adopted after an entry
                timed out, which never had our stops attached. It is not counted as a stop-loss.
              </p>
            </Card>
          ) : null}
        </>
      ) : analytics?.available ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-text-primary">No settled trades in this window</p>
            <p className="mt-0.5 text-[11px] text-text-muted">
              History is kept. Switch to 30 days or All time to see earlier fills.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSince("")}
            className="rounded-lg border border-ink/12 px-3 py-1.5 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
          >
            Show all time
          </button>
        </div>
      ) : null}

      {/* Bots */}
      <Card
        title="Bots"
        padded={false}
        right={
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative">
              <SearchIcon
                size={12}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  botPages.resetPage();
                }}
                placeholder="Search user, id, venue…"
                className="w-[180px] rounded-full border border-ink/12 bg-transparent py-1 pl-7 pr-3 text-[11px] text-text-primary outline-none focus:border-accent"
              />
            </div>
            {[
              ["problems", `Needs attention ${openErrorCount}`],
              ["recovered", `Recovered ${recoveredCount}`],
              ["signed", `Signed ${t.signed_live || 0}`],
              ["unsigned", `No agreement ${t.unsigned || 0}`],
              ["live", `Live ${t.live || 0}`],
              ["profitable", `Profitable ${at.profitable_users ?? 0}`],
              ["ok", "Healthy"],
              ["paused", "Paused"],
              ["all", `All bots ${t.linked ?? 0}`],
              ["unlinked", `Never connected ${t.never_linked ?? 0}`],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setFilter(key);
                  botPages.resetPage();
                }}
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
          <p className="p-4 text-[13px] text-text-muted">Nothing in this view.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left">
              <thead>
                <tr className="border-b border-ink/[0.08] font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
                  <th className="py-2 pl-4 pr-3 font-medium">Status</th>
                  <Th label="User" sortKey="username" sort={sort} onSort={onSort} />
                  <th className="pb-2 pr-3 font-medium">Venues</th>
                  <th className="pb-2 pr-3 font-medium">Mode</th>
                  <Th label="Started" sortKey="first_active_at" sort={sort} onSort={onSort} />
                  <Th label="Active for" sortKey="active_seconds" sort={sort} onSort={onSort} />
                  <Th label="Trades" sortKey="trades" sort={sort} onSort={onSort} align="right" />
                  <Th label="Win %" sortKey="win_rate" sort={sort} onSort={onSort} align="right" />
                  <Th label="Net PnL" sortKey="net" sort={sort} onSort={onSort} align="right" />
                  <Th label="Best" sortKey="best" sort={sort} onSort={onSort} align="right" />
                  <Th label="Worst" sortKey="worst" sort={sort} onSort={onSort} align="right" />
                  <Th
                    label="Open"
                    sortKey="open_positions"
                    sort={sort}
                    onSort={onSort}
                    align="right"
                  />
                  <Th
                    label="Errors 24h"
                    sortKey="recent_errors"
                    sort={sort}
                    onSort={onSort}
                    align="right"
                  />
                  <th className="pb-2 pr-3 font-medium">Last fill</th>
                  <th className="pb-2 pr-4 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {botPages.pagedItems.map((u) => (
                  <tr
                    key={u.subject}
                    onClick={() => setModalUser(u)}
                    className="cursor-pointer border-b border-ink/[0.05] text-[13px] hover:bg-ink/[0.03]"
                  >
                    <td className="py-2.5 pl-4 pr-3">
                      <Pill status={u.status} recovered={u.errors_recovered} />
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="block font-medium text-text-primary">{who(u)}</span>
                      <span className="block font-mono text-[10px] text-text-muted">
                        lq:{u.luxquant_user_id}
                        {u.role ? ` · ${u.role}` : ""}
                        {u.has_live_ack
                          ? " · signed"
                          : u.has_account
                            ? " · no agreement"
                            : ""}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center gap-1">
                        {(u.venues || []).filter((v) => v.connected).length ? (
                          (u.venues || [])
                            .filter((v) => v.connected)
                            .map((v) => (
                              <span key={v.exchange} title={v.exchange} className="inline-flex">
                                <VenueLogo venue={v.exchange} className="h-4 w-4" />
                              </span>
                            ))
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-text-secondary">
                      {u.is_active ? (u.dry_run ? "Dry run" : "Live") : "Paused"}
                      {u.markets?.length ? (
                        <span className="text-text-muted"> · {u.markets.join("+")}</span>
                      ) : null}
                      {u.leverage ? <span className="text-text-muted"> · {u.leverage}×</span> : null}
                    </td>
                    <td className="py-2.5 pr-3 text-[12px] text-text-secondary">
                      {u.first_active_at ? (
                        day(u.first_active_at)
                      ) : (
                        <span className="text-text-muted">never</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-[12px] tabular-nums text-text-secondary">
                      {dur(u.active_seconds)}
                      {u.active_time_estimated ? "*" : ""}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text-secondary">
                      {u.trades ?? 0}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text-secondary">
                      {u.win_rate === null || u.win_rate === undefined ? "—" : `${u.win_rate}%`}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {u.net === null || u.net === undefined ? (
                        <span className="text-text-muted">—</span>
                      ) : (
                        <span style={{ color: u.net >= 0 ? UP : DOWN }}>{signed(u.net)}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums" style={{ color: UP }}>
                      {u.best === null || u.best === undefined ? "—" : signed(u.best)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums" style={{ color: DOWN }}>
                      {u.worst === null || u.worst === undefined ? "—" : signed(u.worst)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text-secondary">
                      {u.open_positions}
                      {u.stuck_positions ? (
                        <span style={{ color: DOWN }}> +{u.stuck_positions}</span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      <span
                        style={
                          u.recent_errors
                            ? { color: u.errors_recovered ? WARN : DOWN }
                            : undefined
                        }
                      >
                        {u.recent_errors}
                        {u.errors_recovered && u.recent_errors ? (
                          <span className="ml-1 text-[10px]">ok</span>
                        ) : null}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-[12px] text-text-muted">
                      {u.last_success_at ? ago(u.last_success_at) : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-[12px] text-text-muted">{u.reasons?.[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-3 text-[11px] text-text-muted">
              Click any row for the full breakdown. Column headers sort. &quot;Active for&quot;
              accumulates only the time a bot was switched on; * marks one that predates the
              toggle history.
            </p>
          </div>
        )}
      </Card>
      <CollectionPagination
        page={botPages.page}
        totalPages={botPages.totalPages}
        total={botPages.total}
        pageSize={botPages.pageSize}
        onPageChange={botPages.setPage}
        onPageSizeChange={botPages.setPageSize}
        pageSizeOptions={[20, 40, 80]}
        itemLabel="bots"
      />

      {/* Positions */}
      <Card
        title="Open positions"
        padded={false}
        right={
          <span className="font-mono text-[11px] text-text-muted">
            {pt.open ?? 0} open
            {pt.live_unrealized_pnl == null
              ? ""
              : ` · ${pt.live_unrealized_pnl >= 0 ? "+" : ""}$${Number(pt.live_unrealized_pnl).toFixed(2)} live`}
            {" · "}
            {pt.stuck ?? 0} stuck · {pt.users_holding ?? 0} users
          </span>
        }
      >
        {positions?.available === false ? (
          <p className="p-4 text-[13px] text-text-muted">Positions unavailable.</p>
        ) : !positions?.positions?.length ? (
          <p className="p-4 text-[13px] text-text-muted">Nobody is holding anything right now.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-ink/[0.08] font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
                  <th className="py-2 pl-4 pr-3 font-medium">Symbol</th>
                  <th className="pb-2 pr-3 font-medium">Venue</th>
                  <th className="pb-2 pr-3 font-medium">Market</th>
                  <th className="pb-2 pr-3 font-medium">Side</th>
                  <th className="pb-2 pr-3 text-right font-medium">Qty</th>
                  <th className="pb-2 pr-3 text-right font-medium">Entry</th>
                  <th className="pb-2 pr-3 text-right font-medium">Mark</th>
                  <th className="pb-2 pr-3 text-right font-medium">Live PnL</th>
                  <th className="pb-2 pr-3 text-right font-medium">Notional</th>
                  <th className="pb-2 pr-3 font-medium">User</th>
                  <th className="pb-2 pr-3 font-medium">Opened</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {positionPages.pagedItems.map((p, i) => (
                  <tr
                    key={`${p.subject}-${p.symbol}-${i}`}
                    className="border-b border-ink/[0.05] text-[13px]"
                  >
                    <td className="py-2.5 pl-4 pr-3 font-medium text-text-primary">{p.symbol}</td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-text-secondary">
                        <VenueLogo venue={p.venue || p.exchange} className="h-4 w-4" />
                        {EXCHANGE_VENUES[p.venue || p.exchange]?.name || p.exchange || "—"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-text-muted">
                      {p.market_type}
                      {p.market_type === "futures" && p.leverage ? ` ${p.leverage}×` : ""}
                    </td>
                    <td className="py-2.5 pr-3 text-text-secondary">{p.side}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text-secondary">
                      {p.quantity}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text-secondary">
                      {p.entry_price ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text-muted">
                      {p.mark_price == null ? "—" : fmtMark(p.mark_price)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {p.unrealized_pnl == null ? (
                        "—"
                      ) : (
                        <span style={{ color: p.unrealized_pnl >= 0 ? UP : DOWN }}>
                          {`${p.unrealized_pnl >= 0 ? "+" : ""}${usd(p.unrealized_pnl)}`}
                          {p.unrealized_pnl_pct == null ? "" : ` · ${p.unrealized_pnl_pct}%`}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text-secondary">
                      {p.notional === null ? "—" : usd(p.notional)}
                    </td>
                    <td className="py-2.5 pr-3 text-[12px] text-text-secondary">
                      {p.username || p.cb_email || p.subject}
                    </td>
                    <td className="py-2.5 pr-3 text-[12px] text-text-muted">{ago(p.created_at)}</td>
                    <td className="py-2.5 pr-4">
                      {p.status === "reconciliation_required" ? (
                        <span className="text-[12px] font-semibold" style={{ color: DOWN }}>
                          needs reconciliation
                        </span>
                      ) : (
                        <span className="text-[12px] text-text-secondary">
                          {p.dry_run ? "open (dry run)" : "open"}
                        </span>
                      )}
                      {p.unprotected ? (
                        <span className="mt-0.5 block text-[11px] font-semibold" style={{ color: DOWN }}>
                          no stop-loss
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      {p.position_id && !p.dry_run ? (
                        <button
                          type="button"
                          onClick={() => setClosing(p)}
                          className="rounded-md border border-ink/[0.12] px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-ink/[0.05]"
                          title="Close this position at market on the account holder's behalf"
                        >
                          Force close
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <CollectionPagination
        page={positionPages.page}
        totalPages={positionPages.totalPages}
        total={positionPages.total}
        pageSize={positionPages.pageSize}
        onPageChange={positionPages.setPage}
        onPageSizeChange={positionPages.setPageSize}
        pageSizeOptions={[20, 40, 80]}
        itemLabel="positions"
      />

      <ForceCloseModal
        position={closing}
        onClose={() => setClosing(null)}
        onDone={load}
      />

      {modalUser ? (
        <AutoTradeUserModal user={modalUser} onClose={() => setModalUser(null)} />
      ) : null}
    </div>
  );
};

export default AutoTradeOpsTab;
