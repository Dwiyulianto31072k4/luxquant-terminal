// src/components/admin/workspace/AutoTradeOpsTab.jsx
//
// Agent Monitor — the operator's view of the bot fleet.
//
// Agent runs as a separate application against its own database, so this used
// to be an SSH-and-SQL job. Read-only throughout: the database role cannot
// write and cannot see the encrypted API key columns.
//
// The page is ordered the way an operator actually works, which is not the
// order the data arrives in:
//
//   1. Is anything broken right now?      incident strip — counts that filter
//   2. What is the fleet doing?           live bots, money at risk, activation
//   3. Is it making money, and how?       curve, then venue / leverage / symbol
//   4. Show me the rows.                  bots, open positions, agreements
//
// Money is a DIVERGING quantity — two poles, a meaningful zero — so it wears
// --pos / --neg against a neutral zero line, never the categorical palette.
// Health is a STATUS scale (good / warning / critical) and keeps its own
// colours. Text always wears text tokens: a number is never legible only
// because of its colour, so every coloured figure also carries a word.
//
// Earlier versions hardcoded #0ECB81 / #F6465D / #8B92A5 and rgba(255,255,255,…)
// grid lines, which made the whole tab a dark-mode-only page. Everything here
// reads theme tokens instead.

import { useCallback, useEffect, useMemo, useState } from "react";

import { adminApi } from "../../../services/adminApi";
import { deskChipClass } from "../../ui/SegGroup";
import { EXCHANGE_LIST, EXCHANGE_VENUES, VenueLogo } from "../../autotrade/exchangeVenues";
import { AlertTriangleIcon, RefreshIcon, SearchIcon } from "../Icons";
import { CollectionPagination, useCollectionPagination } from "../CollectionPagination";
import { AutoTradeUserModal } from "./AutoTradeUserModal";
import ForceCloseModal from "./ForceCloseModal";
import { DailyBars, EquityCurve, LeverageBars, SplitBars } from "./agent/AgentCharts";
import {
  ago,
  breakEvenWinRate,
  byNet,
  curveSeries,
  dur,
  expectancy,
  exposure as readExposure,
  fmtDay,
  incidents as readIncidents,
  num,
  payoff,
  pct,
  profitFactor,
  signed,
  topByAbs,
  usd,
} from "./agent/agentMetrics";

// Performance epoch. History is kept; "All time" still shows everything.
const TRACKING_RESET_AT = "2026-08-14T17:13:05Z";
const PERIODS = [
  ["Since reset", TRACKING_RESET_AT],
  ["30 days", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)],
  ["All time", ""],
];

// Health is ordinal, and the words carry it — the dot is a second channel, not
// the only one. (Same rule as the performance page: colour never decides alone.)
const STATUS = {
  error: { label: "Failing", dot: "bg-loss", fg: "text-loss", chip: "bg-loss/10" },
  warn: { label: "Warning", dot: "bg-warning", fg: "text-warning", chip: "bg-warning/10" },
  recovered: { label: "Recovered", dot: "bg-warning", fg: "text-warning", chip: "bg-warning/10" },
  blocked: { label: "Switched off", dot: "bg-warning", fg: "text-warning", chip: "bg-warning/10" },
  ok: { label: "Healthy", dot: "bg-positive", fg: "text-positive", chip: "bg-positive/10" },
  paused: { label: "Paused", dot: "bg-ink/30", fg: "text-text-muted", chip: "bg-ink/[0.06]" },
  unsigned: { label: "No agreement", dot: "bg-ink/30", fg: "text-text-muted", chip: "bg-ink/[0.06]" },
  unlinked: { label: "Not linked", dot: "bg-ink/20", fg: "text-text-muted", chip: "bg-ink/[0.04]" },
};

// How a position ended. Futures closes used to be recorded as one
// undifferentiated "exchange_close" — the exchange only told us the position
// was gone. The reconciler now reads the closing order, which matters because a
// stop that was hit and a liquidation call for opposite fixes: a wrong signal
// versus leverage too high for the stop distance. `exchange_close` is kept as an
// honest "we could not tell", never folded into stop-loss to look complete.
const EXIT_REASONS = {
  take_profit: { label: "Take-profit hit", note: "target reached", tone: "pos" },
  trailing_stop: { label: "Trailing stop", note: "locked in a move", tone: "pos" },
  stop_loss: { label: "Stop-loss hit", note: "price went the wrong way", tone: "neg" },
  liquidated: { label: "Liquidated", note: "leverage too high for the stop distance", tone: "neg" },
  auto_deleveraged: { label: "Auto-deleveraged", note: "closed by the exchange, not by us", tone: "neg" },
  emergency_close_unprotected: {
    label: "Emergency close",
    note: "entry had no stop, so we flattened it",
    tone: "neg",
  },
  forced_sell: { label: "Force-closed", note: "closed by an operator", tone: "muted" },
  manual_exit: { label: "Closed manually", note: "closed outside the bot", tone: "muted" },
  exchange_close: { label: "Not attributed", note: "closing order could not be identified", tone: "muted" },
};

const TONE_BAR = { pos: "bg-positive", neg: "bg-loss", muted: "bg-ink/25" };
const money = (v) => (num(v) === null ? "text-text-muted" : num(v) >= 0 ? "text-positive" : "text-loss");

const fmtMark = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return "—";
  if (x >= 100) return x.toFixed(2);
  if (x >= 1) return x.toPrecision(6).replace(/\.?0+$/, "");
  return String(x);
};
const marksMissing = (rows) =>
  Array.isArray(rows) && rows.length > 0 && rows.every((p) => p.mark_price == null);
const who = (u) => u.username || u.email || u.cb_email || `lq:${u.luxquant_user_id}`;

const LBL = "font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted";

// ───────────────────────────── pieces ─────────────────────────────

function Card({ title, hint, right, children, padded = true, className = "" }) {
  return (
    <section className={`rounded-xl border border-ink/[0.08] bg-surface-raised ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-ink/[0.06] px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold leading-snug text-text-primary">{title}</h3>
          {hint ? <p className="mt-0.5 text-[11.5px] leading-snug text-text-muted">{hint}</p> : null}
        </div>
        {right}
      </div>
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

/** A headline number with the sentence that makes it mean something. Clickable
 *  when there are rows behind it — a count an operator cannot open is a
 *  dead end. */
function Tile({ label, value, sub, tone, onClick, title }) {
  const Box = onClick ? "button" : "div";
  return (
    <Box
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      className={`rounded-xl border border-ink/[0.08] bg-surface-raised px-3.5 py-3 text-left transition-colors ${
        onClick ? "hover:border-ink/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent" : ""
      }`}
    >
      <p className={LBL}>{label}</p>
      <p className={`mt-1.5 text-[22px] font-semibold leading-none tabular-nums ${tone || "text-text-primary"}`}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-[11px] leading-snug text-text-muted">{sub}</p> : null}
    </Box>
  );
}

function Pill({ status, recovered, blocked }) {
  const key = blocked ? "blocked" : status === "warn" && recovered ? "recovered" : status;
  const s = STATUS[key] || STATUS.unlinked;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.chip} ${s.fg}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
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

/** One labelled bar in a ranked list. Share of the biggest row, so the eye
 *  compares lengths; the count and the money stay in text beside it. */
function BarRow({ label, note, share, tone = "muted", count, net, dim }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 shrink-0 sm:w-44">
        <p className={`text-[12.5px] leading-tight ${dim ? "text-text-muted" : "text-text-primary"}`}>
          {label}
        </p>
        {note ? <p className="text-[10.5px] leading-tight text-text-muted">{note}</p> : null}
      </div>
      <div className="h-2 flex-1 rounded-full bg-ink/[0.06]">
        <div
          className={`h-2 rounded-full ${TONE_BAR[tone] || TONE_BAR.muted} ${dim ? "opacity-40" : "opacity-90"}`}
          style={{ width: `${Math.max(2, (share || 0) * 100)}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-text-secondary">
        {count}
      </span>
      <span className={`w-20 shrink-0 text-right font-mono text-[11.5px] tabular-nums ${money(net)}`}>
        {signed(net)}
      </span>
    </div>
  );
}

// ───────────────────────────── the view ─────────────────────────────

/** Everything the tab draws, from data it is handed.
 *
 *  Split from the fetching container on purpose: a 1,200-line component that
 *  loads its own data can only be exercised by a browser with an admin session,
 *  which is exactly how this repo once shipped a green build that white-screened
 *  (see terminal/tabs/tabs.render.test.jsx). As a pure view it renders to a
 *  string in a test, with real payload shapes, on every branch. */
export function AgentMonitorView({
  overview,
  analytics,
  positions,
  waitlist = null,
  loading = false,
  loadedAt = null,
  since = TRACKING_RESET_AT,
  onSince = () => {},
  onReload = () => {},
  onError = () => {},
}) {
  const [filter, setFilter] = useState("problems");
  const [sort, setSort] = useState({ key: "net", dir: "desc" });
  const [modalUser, setModalUser] = useState(null);
  const [closing, setClosing] = useState(null);
  const [venueFilter, setVenueFilter] = useState("all");
  const [query, setQuery] = useState("");

  const onSort = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  // Trading performance lives in analytics, health lives in overview. Merge on
  // subject so one row answers both "is it broken" and "is it making money".
  const rows = useMemo(() => {
    const perf = new Map((analytics?.leaderboard || []).map((u) => [u.subject, u]));
    return (overview?.users || []).map((u) => ({ ...u, ...(perf.get(u.subject) || {}) }));
  }, [overview, analytics]);

  // Memoised because they feed useMemo deps: `overview?.totals || {}` is a NEW
  // object on every render, which would re-derive the whole page each time.
  const t = useMemo(() => overview?.totals || {}, [overview]);
  const at = useMemo(() => analytics?.totals || {}, [analytics]);

  const linked = useMemo(() => rows.filter((u) => u.has_account), [rows]);
  const incidents = useMemo(
    () => readIncidents({ totals: t, users: rows, positions: positions || {} }),
    [t, rows, positions]
  );
  const exposure = useMemo(() => readExposure(positions), [positions]);
  const series = useMemo(() => curveSeries(analytics?.curve), [analytics]);

  const openErrorCount = linked.filter((u) => u.status === "error").length;
  const recoveredCount = linked.filter((u) => u.errors_recovered).length;
  const hasDeskTrades = Boolean(at.trades);
  const pf = profitFactor(at.won, at.lost);
  const exp = expectancy(at.net, at.trades);
  const pay = payoff(at.avg_win, at.avg_loss);
  const breakEven = breakEvenWinRate(pay);

  const venueMatch = (u) =>
    venueFilter === "all" || (u.venues || []).some((v) => v.exchange === venueFilter && v.connected);

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
                  : filter === "blocked"
                    ? linked.filter((u) => u.bot_access_blocked)
                    : filter === "profitable"
                      ? linked.filter((u) => (u.net ?? 0) > 0)
                      : linked.filter((u) => u.status === filter)
  )
    .filter(venueMatch)
    .filter((u) => {
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

  const venuePnl = useMemo(
    () => new Map((analytics?.by_exchange || []).map((b) => [b.key, b])),
    [analytics]
  );

  const venueCards = useMemo(() => {
    const snap = new Map((overview?.by_exchange || []).map((v) => [v.exchange, v]));
    const hold = new Map(exposure.byVenue.map((v) => [v.venue, v]));
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
        open: hold.get(meta.id)?.open || 0,
        wait: waitlist?.counts?.[meta.id] || 0,
      };
    });
  }, [overview, venuePnl, waitlist, exposure]);

  const funnel = overview?.funnel || {};
  const funnelSteps = [
    ["Opened Agent", funnel.opened ?? t.signed_in ?? 0, "people who opened the tab"],
    ["Connected a key", funnel.connected ?? t.linked ?? 0, "linked an exchange"],
    ["Live", funnel.live ?? t.live ?? 0, "placing real orders"],
    ["Profitable", at.profitable_users ?? 0, "ahead in this window"],
  ];
  const maxFunnel = Math.max(1, ...funnelSteps.map(([, n]) => n));

  const leverageData = useMemo(
    () => (analytics?.by_leverage || []).filter((b) => b.key !== null && b.trades >= 3),
    [analytics]
  );
  const venueNet = useMemo(
    () =>
      byNet(analytics?.by_exchange || []).map((b) => ({
        ...b,
        name: EXCHANGE_VENUES[b.key]?.name || b.key || "unknown",
      })),
    [analytics]
  );
  const symbolNet = useMemo(() => byNet(topByAbs(analytics?.by_symbol || [], 10)), [analytics]);

  // Ordered by trade count, but "Not attributed" is pinned last: it is an
  // absence of information, not an outcome to compare against the others.
  const exitData = useMemo(() => {
    const list = (analytics?.by_exit_reason || []).filter((b) => b.trades > 0);
    const most = Math.max(1, ...list.map((b) => b.trades));
    const all = list.reduce((a, b) => a + b.trades, 0) || 1;
    return list
      .map((b) => ({
        ...b,
        meta: EXIT_REASONS[b.key] || {
          label: (b.key || "unknown").replaceAll("_", " "),
          note: "",
          tone: "muted",
        },
        share: b.trades / most,
        of: (100 * b.trades) / all,
        unattributed: !b.key || b.key === "exchange_close",
      }))
      .sort((a, b) =>
        a.unattributed !== b.unattributed ? a.unattributed - b.unattributed : b.trades - a.trades
      );
  }, [analytics]);

  const goFilter = (key) => {
    if (!key) return;
    setFilter(key);
    botPages.resetPage();
    document.getElementById("agent-bots")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading && !overview) return <p className="text-sm text-text-muted">Loading Agent…</p>;
  if (overview?.available === false)
    return (
      <p className="text-sm text-text-muted">
        The Agent database is not reachable from here. Nothing else on this page is affected.
      </p>
    );

  return (
    <div className="space-y-4">
      {/* ── header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
            AGENT · BOT OPERATIONS
          </p>
          <h2 className="mt-1 text-[22px] font-semibold text-text-primary">Agent Monitor</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Every bot, every venue, every open position. Click a row to drill in.
            <span className="text-text-muted">
              {since ? ` Money figures start ${fmtDay(since)}.` : " Money figures cover all time."}
              {loadedAt ? ` Loaded ${ago(loadedAt)}.` : ""}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIODS.map(([label, value]) => (
            <button
              key={label}
              type="button"
              onClick={() => onSince(value)}
              className={deskChipClass(since === value)}
            >
              {label}
            </button>
          ))}
          <button type="button" onClick={onReload} className={deskChipClass(false)}>
            <RefreshIcon size={12} />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── 1. is anything broken right now ────────────────────── */}
      {incidents.length ? (
        <div className="rounded-xl border border-loss/25 bg-loss/[0.05] px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <AlertTriangleIcon size={13} className="text-loss" />
            <span className="text-[12.5px] font-semibold text-text-primary">Needs attention now</span>
            <span className="text-[11.5px] text-text-muted">
              worst first · each one opens the rows behind it
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {incidents.map((i) => {
              const Box = i.filter ? "button" : "div";
              return (
                <Box
                  key={i.key}
                  type={i.filter ? "button" : undefined}
                  onClick={i.filter ? () => goFilter(i.filter) : undefined}
                  title={i.hint}
                  className={`rounded-lg border px-2.5 py-1.5 text-left ${
                    i.tone === "neg" ? "border-loss/30 bg-loss/[0.07]" : "border-warning/30 bg-warning/[0.07]"
                  } ${i.filter ? "transition-colors hover:border-ink/25" : ""}`}
                >
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className={`font-mono text-[15px] font-semibold tabular-nums ${
                        i.tone === "neg" ? "text-loss" : "text-warning"
                      }`}
                    >
                      {i.count}
                    </span>
                    <span className="text-[12px] text-text-primary">{i.label}</span>
                  </span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-text-muted">{i.hint}</span>
                </Box>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-positive/25 bg-positive/[0.05] px-3.5 py-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-positive" />
          <span className="text-[12.5px] font-semibold text-text-primary">Nothing needs attention</span>
          <span className="text-[11.5px] text-text-muted">
            no failing bots, no invalid keys, no stuck or unprotected positions
          </span>
        </div>
      )}

      {/* ── 2. what the fleet is doing ─────────────────────────── */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <Tile
          label="Live bots"
          value={t.live ?? 0}
          sub={`${t.linked ?? 0} connected · ${t.active ?? 0} switched on`}
          onClick={() => goFilter("live")}
          title="Bots placing real orders right now"
        />
        <Tile
          label="Failing"
          value={openErrorCount}
          tone={openErrorCount ? "text-loss" : undefined}
          sub={recoveredCount ? `${recoveredCount} recovered since` : "orders rejected and not retried"}
          onClick={() => goFilter("problems")}
        />
        <Tile
          label="Invalid keys"
          value={t.invalid_keys ?? 0}
          tone={t.invalid_keys ? "text-loss" : undefined}
          sub="the exchange refuses the key"
          onClick={() => goFilter("problems")}
        />
        <Tile
          label="Money at risk"
          value={usd(exposure.notional, 0)}
          sub={`${exposure.liveOpen} open · ${signed(exposure.unrealized)} unrealised`}
          tone={exposure.notional ? undefined : "text-text-muted"}
          title="Notional of every live position held right now, dry runs excluded"
        />
        <Tile
          label="Net realised"
          value={hasDeskTrades ? usd(at.net) : "—"}
          tone={hasDeskTrades ? money(at.net) : undefined}
          sub={hasDeskTrades ? `${at.trades} settled trades` : "no settled trades in this window"}
        />
        <Tile
          label="Profit factor"
          value={pf === null ? "—" : pf.toFixed(2)}
          tone={pf === null ? undefined : pf >= 1 ? "text-positive" : "text-loss"}
          sub={
            pf === null
              ? "needs a settled loss to divide by"
              : `${usd(pf)} back for every $1 lost`
          }
          title="Dollars won ÷ dollars lost. Above 1 the desk makes money."
        />
      </div>

      {/* ── 3. is it making money ──────────────────────────────── */}
      {analytics?.available && hasDeskTrades && series ? (
        <Card
          title="Where the money went"
          hint={`Running total across ${series.n} day${series.n === 1 ? "" : "s"}, then the same window day by day. Hover any point for that day's figures and BTC's move.`}
          right={
            <div className="text-right">
              <p className={`font-mono text-[15px] font-semibold tabular-nums ${money(series.end)}`}>
                {signed(series.end)}
              </p>
              <p className="text-[10.5px] text-text-muted">
                {fmtDay(series.first)} → {fmtDay(series.last)}
              </p>
            </div>
          }
        >
          <EquityCurve series={series} />
          <p className={`${LBL} mt-3`}>Day by day</p>
          <DailyBars series={series} />
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <Tile
              label="Best day"
              value={signed(series.best)}
              tone={money(series.best)}
              sub="single-day gain"
            />
            <Tile
              label="Worst day"
              value={signed(series.worst)}
              tone={money(series.worst)}
              sub="single-day loss"
            />
            <Tile
              label="Deepest fall"
              value={usd(series.maxDrawdown)}
              tone={series.maxDrawdown ? "text-loss" : undefined}
              sub="peak to trough, not the final loss"
              title="The largest drop from a high point of the running total — what an account had to sit through"
            />
            <Tile
              label="Green days"
              value={`${series.greenDays} / ${series.n}`}
              sub={`${series.redDays} red · ${pct((100 * series.greenDays) / series.n, 0)} of days`}
            />
          </div>
        </Card>
      ) : null}

      {/* trade shape — the two numbers that decide whether the edge can work */}
      {analytics?.available && hasDeskTrades ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card
            title="The shape of a trade"
            hint="A win rate only means something next to the size of the average win. These two together say whether the strategy can pay for itself."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Tile
                label="Win rate"
                value={at.win_rate === null ? "—" : pct(at.win_rate)}
                sub={`${at.wins ?? 0} won · ${at.losses ?? 0} lost`}
                tone={
                  breakEven == null || at.win_rate == null
                    ? undefined
                    : at.win_rate >= breakEven
                      ? "text-positive"
                      : "text-loss"
                }
              />
              <Tile
                label="Needed to break even"
                value={breakEven === null ? "—" : pct(breakEven)}
                sub={
                  breakEven === null || at.win_rate == null
                    ? "at the current payoff"
                    : at.win_rate >= breakEven
                      ? "the desk clears its own bar"
                      : `${(breakEven - at.win_rate).toFixed(1)} points short of its own bar`
                }
                title="With this payoff, the win rate the desk must reach just to end flat"
              />
              <Tile
                label="Average win"
                value={usd(at.avg_win)}
                tone="text-positive"
                sub={`${usd(at.won)} won in total`}
              />
              <Tile
                label="Average loss"
                value={usd(at.avg_loss)}
                tone="text-loss"
                sub={`${usd(at.lost)} lost in total`}
              />
            </div>
            <div className="mt-3 space-y-2 border-t border-ink/[0.06] pt-3">
              <BarRow
                label="Won"
                note={`${at.wins ?? 0} trades`}
                share={
                  Math.abs(at.won ?? 0) / Math.max(1, Math.abs(at.won ?? 0), Math.abs(at.lost ?? 0))
                }
                tone="pos"
                count={at.wins ?? 0}
                net={at.won}
              />
              <BarRow
                label="Lost"
                note={`${at.losses ?? 0} trades`}
                share={
                  Math.abs(at.lost ?? 0) / Math.max(1, Math.abs(at.won ?? 0), Math.abs(at.lost ?? 0))
                }
                tone="neg"
                count={at.losses ?? 0}
                net={at.lost}
              />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
              Each trade is worth {signed(exp)} on average. Payoff {pay === null ? "—" : pay.toFixed(2)}×:
              the average win is {pay === null ? "—" : `${pay.toFixed(2)}×`} the average loss.
            </p>
          </Card>

          <Card
            title="How long money is held"
            hint="The classic failure mode is holding losers longer than winners — the bar to watch is whether the red one is longer."
          >
            <div className="space-y-2">
              <BarRow
                label="Winning trades"
                note={`${at.avg_hold_win_hours ?? "—"} hours on average`}
                share={
                  (at.avg_hold_win_hours ?? 0) /
                  Math.max(1, at.avg_hold_win_hours ?? 0, at.avg_hold_loss_hours ?? 0)
                }
                tone="pos"
                count={at.wins ?? 0}
                net={at.won}
              />
              <BarRow
                label="Losing trades"
                note={`${at.avg_hold_loss_hours ?? "—"} hours on average`}
                share={
                  (at.avg_hold_loss_hours ?? 0) /
                  Math.max(1, at.avg_hold_win_hours ?? 0, at.avg_hold_loss_hours ?? 0)
                }
                tone="neg"
                count={at.losses ?? 0}
                net={at.lost}
              />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Tile
                label="Accounts ahead"
                value={`${at.profitable_users ?? 0} / ${(at.profitable_users ?? 0) + (at.losing_users ?? 0)}`}
                tone={at.profitable_users ? "text-positive" : "text-loss"}
                sub="in this window"
                onClick={() => goFilter("profitable")}
              />
              <Tile
                label="Venues traded"
                value={at.venues_traded ?? 0}
                sub={`${at.unpriced ?? 0} trades could not be priced`}
              />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
              {at.avg_hold_loss_hours && at.avg_hold_win_hours
                ? at.avg_hold_loss_hours > at.avg_hold_win_hours
                  ? `Losers are held ${(at.avg_hold_loss_hours / at.avg_hold_win_hours).toFixed(1)}× longer than winners — the pattern that turns a small loss into a large one.`
                  : "Winners are held longer than losers, which is the way round it should be."
                : "Not enough settled trades to compare hold times."}
            </p>
          </Card>
        </div>
      ) : null}

      {/* where it wins and loses */}
      {analytics?.available && hasDeskTrades ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {venueNet.length ? (
            <Card title="Net result by venue" hint="Settled bot trades in this window. Bars sit either side of zero.">
              <SplitBars
                rows={venueNet}
                labelOf={(r) => r.name}
                meta={(r) => [
                  ["Trades", r.trades],
                  ["Win rate", `${r.win_rate}%`],
                ]}
              />
            </Card>
          ) : null}
          {leverageData.length ? (
            <Card
              title="Net result by leverage"
              hint="Tiers with at least three settled trades. Higher leverage does not fail gently — it fails faster."
            >
              <LeverageBars rows={leverageData} />
            </Card>
          ) : null}
        </div>
      ) : null}

      {analytics?.available && symbolNet.length ? (
        <Card
          title="Biggest movers by symbol"
          hint="The ten coins that moved the most money either way — the bleed is as worth knowing as the win."
        >
          <SplitBars
            rows={symbolNet}
            labelOf={(r) => r.key}
            meta={(r) => [
              ["Trades", r.trades],
              ["Win rate", `${r.win_rate}%`],
            ]}
          />
        </Card>
      ) : null}

      {analytics?.available && exitData.length ? (
        <Card
          title="How positions ended"
          hint="Read from the closing order on the exchange. Trades and net result per outcome."
          right={<span className="text-[11px] text-text-muted">{at.trades} settled</span>}
        >
          <div className="space-y-2.5">
            {exitData.map((b) => (
              <BarRow
                key={b.key || "unknown"}
                label={b.meta.label}
                note={`${b.meta.note}${b.meta.note ? " · " : ""}${pct(b.of, 0)} of trades`}
                share={b.share}
                tone={b.meta.tone}
                dim={b.unattributed}
                count={b.trades}
                net={b.net}
              />
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
            &quot;Not attributed&quot; means the exchange gave no closing order we could match —
            mostly positions adopted after an entry timed out, which never had our stops attached.
            It is never counted as a stop-loss.
          </p>
        </Card>
      ) : null}

      {analytics?.available && !hasDeskTrades ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-text-primary">No settled trades in this window</p>
            <p className="mt-0.5 text-[11px] text-text-muted">
              History is kept. Switch to 30 days or All time to see earlier fills.
            </p>
          </div>
          <button type="button" onClick={() => onSince("")} className={deskChipClass(false)}>
            Show all time
          </button>
        </div>
      ) : null}

      {analytics?.manual?.trades ? (
        <Card
          title="Traded by hand, not by the bot"
          hint="Same exchange accounts, but Agent did not place these. Excluded from every figure above."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Tile
              label="Net realised — manual"
              value={usd(analytics.manual.net)}
              tone={money(analytics.manual.net)}
              sub={`${analytics.manual.trades} trades · ${analytics.manual.traders} account(s)`}
            />
            <Tile
              label="Wins / losses"
              value={`${analytics.manual.wins ?? 0}W / ${analytics.manual.losses ?? 0}L`}
            />
            <Tile
              label="Share of the desk's loss"
              value={
                (at.net ?? 0) + (analytics.manual.net ?? 0) < 0
                  ? pct(
                      (Math.abs(analytics.manual.net ?? 0) /
                        Math.abs((at.net ?? 0) + (analytics.manual.net ?? 0))) *
                        100,
                      0
                    )
                  : "—"
              }
              sub="of the combined result"
            />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
            The reconciler adopts whatever it finds on the account, so a user&apos;s own trades land
            here too. They keep no stop-loss from us and cannot be attributed to a take-profit or a
            stop, which is why they never appear in the exit-reason breakdown.
          </p>
        </Card>
      ) : null}

      {/* ── activation + venues ────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card
          title="Activation"
          hint="Of everyone who opened Agent, how many got as far as each step."
          right={
            waitlist?.counts && Object.keys(waitlist.counts).length ? (
              <span className="font-mono text-[11px] text-accent-text">
                Waitlist {Object.entries(waitlist.counts).map(([k, n]) => `${k} ${n}`).join(" · ")}
              </span>
            ) : null
          }
        >
          <div className="space-y-2.5">
            {funnelSteps.map(([label, value, note], i) => {
              const prev = i === 0 ? value : funnelSteps[i - 1][1];
              const rate = i === 0 || !prev ? null : Math.round((value / prev) * 100);
              return (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-32 shrink-0">
                    <p className="text-[12.5px] leading-tight text-text-primary">{label}</p>
                    <p className="text-[10.5px] leading-tight text-text-muted">{note}</p>
                  </div>
                  <div className="h-2 flex-1 rounded-full bg-ink/[0.06]">
                    <div
                      className="h-2 rounded-full bg-accent/80"
                      style={{ width: `${Math.max(2, (value / maxFunnel) * 100)}%` }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums text-text-primary">
                    {value}
                  </span>
                  <span className="w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-text-muted">
                    {rate === null ? "start" : `${rate}% of prev`}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card
          title="Venues"
          hint="Connected keys, live bots, and what each venue has made or lost."
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
              className={deskChipClass(venueFilter === "all")}
            >
              All venues
            </button>
            {venueCards.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setVenueFilter(v.id === venueFilter ? "all" : v.id);
                  botPages.resetPage();
                }}
                className={deskChipClass(venueFilter === v.id)}
              >
                <VenueLogo venue={v.id} className="h-3.5 w-3.5" />
                {v.name}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
                    className={`font-mono text-[10px] uppercase tracking-wider ${
                      v.live ? "text-positive" : "text-text-muted"
                    }`}
                  >
                    {v.live ? `${v.live} live` : v.connected ? "connected" : "—"}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-text-muted">
                  {v.connected} key{v.connected === 1 ? "" : "s"}
                  {v.dryRun ? ` · ${v.dryRun} dry run` : ""}
                  {v.open ? ` · ${v.open} open` : ""}
                  {v.wait ? ` · ${v.wait} waiting` : ""}
                </p>
                <p className={`mt-0.5 text-[14px] font-semibold tabular-nums ${v.trades ? money(v.net) : "text-text-muted"}`}>
                  {v.trades ? usd(v.net) : "no trades"}
                  {v.trades ? (
                    <span className="ml-1.5 font-mono text-[10px] font-normal text-text-muted">
                      {v.trades} · {v.winRate}% won
                    </span>
                  ) : null}
                </p>
                {v.invalid ? (
                  <p className="mt-0.5 text-[10.5px] font-semibold text-loss">
                    {v.invalid} invalid key{v.invalid === 1 ? "" : "s"}
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* ── 4. the rows ────────────────────────────────────────── */}
      <div id="agent-bots" className="scroll-mt-4">
        <Card
          title="Bots"
          hint="One row per connected account. Click any row for its errors, trades and positions."
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
                  className="h-11 w-[180px] rounded-md border border-ink/[0.1] bg-surface-secondary pl-7 pr-3 font-mono text-[11px] text-text-primary outline-none focus:border-accent sm:h-8"
                />
              </div>
              {[
                ["problems", `Needs attention ${openErrorCount}`],
                ["recovered", `Recovered ${recoveredCount}`],
                ["live", `Live ${t.live || 0}`],
                ["profitable", `Profitable ${at.profitable_users ?? 0}`],
                ["signed", `Signed ${t.signed_live || 0}`],
                ["unsigned", `No agreement ${t.unsigned || 0}`],
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
                  className={deskChipClass(filter === key)}
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
                    <Th label="Open" sortKey="open_positions" sort={sort} onSort={onSort} align="right" />
                    <Th label="Errors 24h" sortKey="recent_errors" sort={sort} onSort={onSort} align="right" />
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
                        <Pill
                          status={u.status}
                          recovered={u.errors_recovered}
                          blocked={u.bot_access_blocked}
                        />
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="block font-medium text-text-primary">{who(u)}</span>
                        <span className="block font-mono text-[10px] text-text-muted">
                          lq:{u.luxquant_user_id}
                          {u.role ? ` · ${u.role}` : ""}
                          {u.has_live_ack ? " · signed" : u.has_account ? " · no agreement" : ""}
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
                        {u.first_active_at ? fmtDay(u.first_active_at) : <span className="text-text-muted">never</span>}
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
                      <td className={`py-2.5 pr-3 text-right tabular-nums ${money(u.net)}`}>
                        {u.net === null || u.net === undefined ? "—" : signed(u.net)}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-positive">
                        {u.best === null || u.best === undefined ? "—" : signed(u.best)}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-loss">
                        {u.worst === null || u.worst === undefined ? "—" : signed(u.worst)}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-text-secondary">
                        {u.open_positions}
                        {u.stuck_positions ? <span className="text-loss"> +{u.stuck_positions}</span> : null}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        <span
                          className={
                            u.recent_errors ? (u.errors_recovered ? "text-warning" : "text-loss") : undefined
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
                      <td className="py-2.5 pr-4 text-[12px] text-text-muted">
                        {u.bot_access_blocked ? u.bot_access_blocked_reason || "switched off by an operator" : u.reasons?.[0]}
                      </td>
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
      </div>
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

      <Card
        title="Open positions"
        hint="Everything the fleet is holding right now. A position with no stop, or one the reconciler cannot resolve, is called out in its row."
        padded={false}
        right={
          <span className="font-mono text-[11px] text-text-muted">
            {exposure.liveOpen} open · {usd(exposure.notional, 0)} notional ·{" "}
            <span className={money(exposure.unrealized)}>{signed(exposure.unrealized)}</span> unrealised
            {exposure.dryRun ? ` · ${exposure.dryRun} dry run` : ""} · {exposure.holders} accounts
          </span>
        }
      >
        {positions?.available === false ? (
          <p className="p-4 text-[13px] text-text-muted">Positions unavailable.</p>
        ) : !positionRows.length ? (
          <p className="p-4 text-[13px] text-text-muted">
            {venueFilter === "all"
              ? "Nobody is holding anything right now."
              : "Nothing open on this venue."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
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
                    className={`border-b border-ink/[0.05] text-[13px] ${
                      p.unprotected || p.status === "reconciliation_required" ? "bg-loss/[0.04]" : ""
                    }`}
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
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text-secondary">{p.quantity}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text-secondary">
                      {p.entry_price ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-text-muted">
                      {p.mark_price == null ? "—" : fmtMark(p.mark_price)}
                    </td>
                    <td className={`py-2.5 pr-3 text-right tabular-nums ${money(p.unrealized_pnl)}`}>
                      {p.unrealized_pnl == null
                        ? "—"
                        : `${signed(p.unrealized_pnl)}${p.unrealized_pnl_pct == null ? "" : ` · ${p.unrealized_pnl_pct}%`}`}
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
                        <span className="text-[12px] font-semibold text-loss">needs reconciliation</span>
                      ) : (
                        <span className="text-[12px] text-text-secondary">
                          {p.dry_run ? "open (dry run)" : "open"}
                        </span>
                      )}
                      {p.unprotected ? (
                        <span className="mt-0.5 block text-[11px] font-semibold text-loss">no stop-loss</span>
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

      <Card
        title="Live trading agreements"
        hint="Connecting a key requires this form. Unsigned keys are disconnected."
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
                      lq:{u.luxquant_user_id} · signed {fmtDay(u.live_ack_at)}
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
                            onError(err?.message || "Could not download PDF");
                          }
                        }}
                        className={deskChipClass(false)}
                      >
                        Download PDF
                      </button>
                    ) : null}
                    <button type="button" onClick={() => setModalUser(u)} className={deskChipClass(false)}>
                      Open bot
                    </button>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-[13px] text-text-muted">Nobody has signed the live trading form yet.</p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
          The same PDFs live on each person&apos;s record: Users → open the user → Agent tab →
          Signed acknowledgements.
        </p>
      </Card>

      <ForceCloseModal position={closing} onClose={() => setClosing(null)} onDone={onReload} />

      {modalUser ? <AutoTradeUserModal user={modalUser} onClose={() => setModalUser(null)} /> : null}
    </div>
  );
}

// ─────────────────────────── the container ───────────────────────────

/** Fetches, and nothing else. Four calls in parallel: health, positions and
 *  money come from three different queries against the Agent database, and the
 *  waitlist from our own — a failure there must not cost the page. */
export const AutoTradeOpsTab = () => {
  const [overview, setOverview] = useState(null);
  const [positions, setPositions] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [waitlist, setWaitlist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [since, setSince] = useState(TRACKING_RESET_AT);
  const [loadedAt, setLoadedAt] = useState(null);

  const load = useCallback(
    (attempt = 0) => {
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
          setLoadedAt(Date.now());
          // Marks come from the venues' own tickers a moment after the rows;
          // one retry turns "—" into live P&L without making the page wait.
          if (marksMissing(p?.positions) && n < 1) {
            setTimeout(() => load(n + 1), 1500);
          }
        })
        .catch((e) => setError(e?.message || "Could not load Agent data"))
        .finally(() => {
          if (n === 0) setLoading(false);
        });
    },
    [since]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  if (error) return <p className="text-sm text-loss">{error}</p>;

  return (
    <AgentMonitorView
      overview={overview}
      analytics={analytics}
      positions={positions}
      waitlist={waitlist}
      loading={loading}
      loadedAt={loadedAt}
      since={since}
      onSince={setSince}
      onReload={load}
      onError={setError}
    />
  );
};

export default AutoTradeOpsTab;
