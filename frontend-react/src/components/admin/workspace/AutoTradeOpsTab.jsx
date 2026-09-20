// src/components/admin/workspace/AutoTradeOpsTab.jsx
//
// Agent Monitor — the operator's view of the bot fleet.
//
// Agent runs as a separate application against its own database, so this used
// to be an SSH-and-SQL job. Read-only throughout: the database role cannot
// write and cannot see the encrypted API key columns.
//
// ── What this page is for ────────────────────────────────────────────────────
// A monitor is not a report. It answers, in this order:
//
//   1. Is anything broken right now?   one strip, counts that open their rows
//   2. What is the money doing?        one hero number + the curve that made it
//   3. WHY?                            the findings — what explains the loss
//   4. How do trades end, and what shape are they?
//   5. Show me the rows.               accounts, open positions, paperwork
//
// The first rebuild of this page got (1) and (2) right and then drew ten bars
// of the ten worst symbols. In production those ten are −$17 to −$27 each, one
// to four trades apiece: ten near-identical red bars, no finding in any of
// them, while the actual shape of the loss — two days out of twenty-six, one
// account out of six — was nowhere on the page. Charts here now have to earn
// their canvas: two do (the curve and its day-by-day strip), and the rest are
// HTML shares and pairs, where the number never leaves its bar.
//
// Colour: money is DIVERGING (--pos/--neg against a real zero), health is a
// status scale, everything else is ink. Every coloured figure also carries a
// word, so nothing is legible by colour alone. No hardcoded hex — the old file
// was #0ECB81/#F6465D throughout, which made it a dark-only page.

import { useCallback, useEffect, useMemo, useState } from "react";

import { adminApi } from "../../../services/adminApi";
import { deskChipClass } from "../../ui/SegGroup";
import { EXCHANGE_LIST, EXCHANGE_VENUES, VenueLogo } from "../../autotrade/exchangeVenues";
import { AlertTriangleIcon, RefreshIcon, SearchIcon } from "../Icons";
import { CollectionPagination, useCollectionPagination } from "../CollectionPagination";
import { AutoTradeUserModal } from "./AutoTradeUserModal";
import ForceCloseModal from "./ForceCloseModal";
import { DailyStrip, EquityCurve } from "./agent/AgentCharts";
import {
  BarCell,
  Card,
  EYEBROW,
  Finding,
  Hero,
  PairRow,
  ShareBar,
  ShareRow,
  Stat,
  moneyTone,
} from "./agent/AgentUI";
import { concentration, exitShape, worstDays } from "./agent/agentInsights";
import {
  ago,
  breakEvenWinRate,
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
  usd,
} from "./agent/agentMetrics";

// Performance epoch. History is kept; "All time" still shows everything.
const TRACKING_RESET_AT = "2026-08-14T17:13:05Z";
const PERIODS = [
  ["Since reset", TRACKING_RESET_AT],
  ["30 days", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)],
  ["All time", ""],
];

// Health is ordinal and the WORD carries it; the dot is the second channel.
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

// How a position ended, and what colour that outcome is. Two shades of one hue
// per pole — a sequential pair inside a diverging scheme — so "closed at target"
// and "trailed out" read as the same family without inventing a new hue.
// `exchange_close` is NOT folded into stop-loss: it is an absence of
// information, and it wears the neutral.
const EXITS = {
  take_profit: { label: "Closed at target", note: "take-profit filled", color: "rgb(var(--pos))" },
  trailing_stop: { label: "Trailed out", note: "locked a move in", color: "rgb(var(--pos) / 0.55)" },
  stop_loss: { label: "Stopped out", note: "price went the wrong way", color: "rgb(var(--neg))" },
  liquidated: { label: "Liquidated", note: "leverage too high for the stop", color: "rgb(var(--neg) / 0.75)" },
  auto_deleveraged: { label: "Auto-deleveraged", note: "closed by the exchange", color: "rgb(var(--neg) / 0.6)" },
  emergency_close_unprotected: {
    label: "Flattened",
    note: "entry had no stop, so we closed it",
    color: "rgb(var(--neg) / 0.45)",
  },
  forced_sell: { label: "Force-closed", note: "closed by an operator", color: "rgb(var(--ink) / 0.35)" },
  manual_exit: { label: "Closed by hand", note: "closed outside the bot", color: "rgb(var(--ink) / 0.28)" },
  exchange_close: {
    label: "Not attributed",
    note: "no closing order we could match",
    color: "rgb(var(--ink) / 0.18)",
  },
};

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

function Th({ label, sortKey, sort, onSort, align = "left" }) {
  const active = sort.key === sortKey;
  return (
    <th
      className={`whitespace-nowrap pb-2 pr-3 font-medium ${align === "right" ? "text-right" : ""} ${
        sortKey ? "cursor-pointer select-none hover:text-text-secondary" : ""
      }`}
      onClick={sortKey ? () => onSort(sortKey) : undefined}
    >
      {label}
      {active ? <span className="text-accent"> {sort.dir === "asc" ? "↑" : "↓"}</span> : null}
    </th>
  );
}

// ───────────────────────────── the view ─────────────────────────────

/** Everything the tab draws, from data it is handed.
 *
 *  Split from the fetching container on purpose: a component that loads its own
 *  data can only be exercised by a browser with an admin session, which is how
 *  this repo once shipped a green build that white-screened. As a pure view it
 *  renders to a string in a test, with production-shaped data, on every branch. */
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
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState({ key: "net", dir: "desc" });
  const [modalUser, setModalUser] = useState(null);
  const [closing, setClosing] = useState(null);
  const [venueFilter, setVenueFilter] = useState("all");
  const [query, setQuery] = useState("");

  const onSort = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  // Health lives in overview, money in analytics. Merge on subject so one row
  // answers both "is it broken" and "is it making money".
  const rows = useMemo(() => {
    const perf = new Map((analytics?.leaderboard || []).map((u) => [u.subject, u]));
    return (overview?.users || []).map((u) => ({ ...u, ...(perf.get(u.subject) || {}) }));
  }, [overview, analytics]);

  const t = useMemo(() => overview?.totals || {}, [overview]);
  const at = useMemo(() => analytics?.totals || {}, [analytics]);

  const linked = useMemo(() => rows.filter((u) => u.has_account), [rows]);
  const incidents = useMemo(
    () => readIncidents({ totals: t, users: rows, positions: positions || {} }),
    [t, rows, positions]
  );
  const exposure = useMemo(() => readExposure(positions), [positions]);
  const series = useMemo(() => curveSeries(analytics?.curve), [analytics]);
  const worst = useMemo(() => worstDays(analytics?.curve), [analytics]);
  const findings = useMemo(
    () =>
      concentration({
        analytics,
        rows,
        venueName: (k) => EXCHANGE_VENUES[k]?.name || k,
      }),
    [analytics, rows]
  );
  const exits = useMemo(
    () => exitShape(analytics?.by_exit_reason, at.lost),
    [analytics, at.lost]
  );

  const openErrorCount = linked.filter((u) => u.status === "error").length;
  const recoveredCount = linked.filter((u) => u.errors_recovered).length;
  const hasDeskTrades = Boolean(at.trades);
  const pf = profitFactor(at.won, at.lost);
  const exp = expectancy(at.net, at.trades);
  const pay = payoff(at.avg_win, at.avg_loss);
  const breakEven = breakEvenWinRate(pay);
  const clearsBar = breakEven != null && at.win_rate != null && at.win_rate >= breakEven;

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
                    : filter === "trading"
                      ? linked.filter((u) => (u.trades ?? 0) > 0)
                      : linked.filter((u) => u.status === filter)
  )
    .filter(venueMatch)
    .filter((u) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [who(u), u.email, u.cb_email, `lq:${u.luxquant_user_id}`, u.subject]
        .concat((u.venues || []).map((v) => v.exchange))
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

  const shown = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    // Net sorts by SIZE, either way: "biggest mover" is the question, and a
    // -$438 account belongs at the top of a monitor, not at the bottom. Nulls
    // stay null here so the guard below puts accounts that never traded last —
    // Math.abs(-Infinity) is Infinity, which floated every empty row to the top.
    const key = (r) =>
      sort.key === "net" ? (num(r.net) === null ? null : Math.abs(num(r.net))) : r[sort.key];
    return filtered.slice().sort((a, b) => {
      const av = key(a);
      const bv = key(b);
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return typeof av === "string" ? dir * av.localeCompare(bv) : dir * (av - bv);
    });
  }, [filtered, sort]);
  const botPages = useCollectionPagination(shown, 20);
  const biggestNet = Math.max(1, ...linked.map((u) => Math.abs(num(u.net) || 0)));

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
    ["Opened Agent", funnel.opened ?? t.signed_in ?? 0, "saw the tab"],
    ["Connected a key", funnel.connected ?? t.linked ?? 0, "linked an exchange"],
    ["Live", funnel.live ?? t.live ?? 0, "placing real orders"],
    ["Ahead", at.profitable_users ?? 0, "in profit this window"],
  ];
  const maxFunnel = Math.max(1, ...funnelSteps.map(([, n]) => n));

  const goFilter = (key) => {
    if (!key) return;
    setFilter(key);
    botPages.resetPage();
    document.getElementById("agent-accounts")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (loading && !overview) return <p className="text-sm text-text-muted">Loading Agent…</p>;
  if (overview?.available === false)
    return (
      <p className="text-sm text-text-muted">
        The Agent database is not reachable from here. Nothing else on this page is affected.
      </p>
    );

  const anatomyMax = Math.max(Math.abs(at.won ?? 0), Math.abs(at.lost ?? 0), 1);

  return (
    <div className="space-y-3">
      {/* ── command bar ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={EYEBROW}>Agent · bot operations</p>
          <h2 className="mt-1 text-[21px] font-semibold leading-tight text-text-primary">
            Agent Monitor
          </h2>
          <p className="mt-1 text-[12.5px] text-text-muted">
            {since ? `Money from ${fmtDay(since)}` : "Money over all time"}
            {" · "}
            {t.linked ?? 0} connected accounts
            {loadedAt ? ` · loaded ${ago(loadedAt)}` : ""}
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
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── 1. is anything broken ─────────────────────────────── */}
      {incidents.length ? (
        <div className="overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised">
          <div className="flex items-stretch">
            <span aria-hidden className="w-1 shrink-0 bg-loss" />
            <div className="min-w-0 flex-1 px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <AlertTriangleIcon size={13} className="text-loss" />
                <span className="text-[12.5px] font-semibold text-text-primary">
                  Needs attention now
                </span>
                <span className="text-[11.5px] text-text-muted">
                  each count opens the rows behind it
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {incidents.map((i) => {
                  const Box = i.filter ? "button" : "div";
                  return (
                    <Box
                      key={i.key}
                      type={i.filter ? "button" : undefined}
                      onClick={i.filter ? () => goFilter(i.filter) : undefined}
                      title={i.hint}
                      className={`group text-left ${i.filter ? "cursor-pointer" : ""}`}
                    >
                      <span className="flex items-baseline gap-1.5">
                        <span
                          className={`font-mono text-[18px] font-semibold leading-none tabular-nums ${
                            i.tone === "neg" ? "text-loss" : "text-warning"
                          }`}
                        >
                          {i.count}
                        </span>
                        <span
                          className={`text-[12.5px] text-text-primary ${
                            i.filter ? "group-hover:underline" : ""
                          }`}
                        >
                          {i.label}
                        </span>
                      </span>
                      <span className="mt-0.5 block max-w-[34ch] text-[10.5px] leading-snug text-text-muted">
                        {i.hint}
                      </span>
                    </Box>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink/[0.07] bg-surface-raised px-3.5 py-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-positive" />
          <span className="text-[12.5px] font-semibold text-text-primary">
            Nothing needs attention
          </span>
          <span className="text-[11.5px] text-text-muted">
            no failing bots, no invalid keys, nothing stuck or unprotected
          </span>
        </div>
      )}

      {/* ── 2. what the money is doing ────────────────────────── */}
      <Card padded={false} className="overflow-hidden">
        <div className="grid gap-px bg-ink/[0.06] lg:grid-cols-[minmax(240px,320px)_1fr]">
          <div className="bg-surface-raised p-4">
            <Hero
              label="Net realised"
              value={hasDeskTrades ? usd(at.net) : "—"}
              tone={hasDeskTrades ? moneyTone(at.net) : "text-text-muted"}
              sub={
                hasDeskTrades
                  ? `${at.trades} settled trades · ${at.wins ?? 0} won, ${at.losses ?? 0} lost`
                  : "no settled trades in this window"
              }
              foot={
                series
                  ? `${fmtDay(series.first)} → ${fmtDay(series.last)} · ${series.greenDays} green days, ${series.redDays} red`
                  : null
              }
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Stat
                label="Win rate"
                value={at.win_rate == null ? "—" : pct(at.win_rate)}
                tone={breakEven == null ? undefined : clearsBar ? "text-positive" : "text-loss"}
                sub={breakEven == null ? "of settled trades" : `needs ${pct(breakEven, 0)} to break even`}
                title="With this payoff, the win rate the desk must reach just to end flat"
              />
              <Stat
                label="Profit factor"
                value={pf === null ? "—" : pf.toFixed(2)}
                tone={pf === null ? undefined : pf >= 1 ? "text-positive" : "text-loss"}
                sub={pf === null ? "needs a settled loss" : `${usd(pf)} back per $1 lost`}
              />
              <Stat
                label="Per trade"
                value={exp === null ? "—" : signed(exp)}
                tone={moneyTone(exp)}
                sub="average, win or lose"
              />
              <Stat
                label="Money at risk"
                value={usd(exposure.notional, 0)}
                sub={`${exposure.liveOpen} open · ${signed(exposure.unrealized)}`}
                title="Notional of every live position held right now, dry runs excluded"
              />
            </div>
          </div>
          <div className="min-w-0 bg-surface-raised p-4">
            {series ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3 className="text-[13.5px] font-semibold leading-tight text-text-primary">
                      Running total, {series.n} days
                    </h3>
                    <p className="mt-1 text-[11.5px] leading-snug text-text-muted">
                      {worst
                        ? `The two marked days are ${Math.round(worst.share)}% of the whole loss. Hover any day for its figures and BTC's move.`
                        : "Hover any day for its figures and BTC's move."}
                    </p>
                  </div>
                  <p className="text-right">
                    <span className={`font-mono text-[13px] tabular-nums ${moneyTone(series.maxDrawdown ? -1 : 0)}`}>
                      {usd(series.maxDrawdown)}
                    </span>
                    <span className="ml-1.5 text-[11px] text-text-muted">deepest fall</span>
                  </p>
                </div>
                <EquityCurve series={series} worst={worst?.days || []} />
                <p className={`${EYEBROW} mt-1`}>Day by day</p>
                <DailyStrip series={series} />
              </>
            ) : (
              <div className="flex h-full min-h-[180px] flex-col items-start justify-center gap-2">
                <p className="text-[13px] font-semibold text-text-primary">
                  No settled trades in this window
                </p>
                <p className="text-[11.5px] text-text-muted">
                  History is kept — switch the window to see earlier fills.
                </p>
                <button type="button" onClick={() => onSince("")} className={deskChipClass(false)}>
                  Show all time
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ── 3. why ────────────────────────────────────────────── */}
      {findings.length ? (
        <Card
          title="What explains the loss"
          hint="Each figure is that line's share of the net loss in this window — the same denominator, so the lines can be compared with each other."
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {findings.map((f) => (
              <Finding
                key={f.key}
                share={f.share}
                headline={f.headline}
                detail={f.detail}
                onClick={f.key === "account" ? () => goFilter("trading") : undefined}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {/* ── 4. how trades end, and their shape ────────────────── */}
      {hasDeskTrades ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {exits ? (
            <Card
              title="How trades end"
              hint="Read from the closing order on the exchange. Share of trades along the bar; money beside each row."
              right={
                <span className="text-[11px] text-text-muted">{exits.trades} settled</span>
              }
            >
              <ShareBar
                segments={exits.rows.map((r) => ({
                  key: r.key || "unknown",
                  label: EXITS[r.key]?.label || r.key,
                  share: r.share,
                  color: EXITS[r.key]?.color || "rgb(var(--ink) / 0.2)",
                }))}
              />
              <div className="mt-2 divide-y divide-ink/[0.05]">
                {exits.rows.map((r) => (
                  <ShareRow
                    key={r.key || "unknown"}
                    color={EXITS[r.key]?.color || "rgb(var(--ink) / 0.2)"}
                    label={EXITS[r.key]?.label || (r.key || "unknown").replaceAll("_", " ")}
                    note={EXITS[r.key]?.note}
                    share={r.share}
                    trades={r.trades}
                    net={r.net}
                    dim={r.unattributed}
                  />
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
                {exits.stopShareOfLoss != null ? (
                  <>
                    <span className="text-text-secondary">
                      {pct(exits.stopShareOfLoss, 0)} of every dollar the desk lost
                    </span>{" "}
                    left through a stop.{" "}
                  </>
                ) : null}
                &quot;Not attributed&quot; is {pct(exits.unattributed, 0)} of trades: the exchange gave
                no closing order we could match — mostly positions adopted after an entry timed out,
                which never had our stops attached. It is never counted as a stop-loss.
              </p>
            </Card>
          ) : null}

          <Card
            title="The shape of a trade"
            hint="Losses to the left of the line, wins to the right. A win rate only means something next to the size of the average win."
          >
            <div className="divide-y divide-ink/[0.05]">
              <PairRow
                label="Money"
                hint={`${at.losses ?? 0} losing · ${at.wins ?? 0} winning trades`}
                left={at.lost ?? 0}
                right={at.won ?? 0}
                leftValue
                rightValue
                max={anatomyMax}
              />
              <PairRow
                label="The average trade"
                hint={pay === null ? "" : `payoff ${pay.toFixed(2)}× the average loss`}
                left={at.avg_loss ?? 0}
                right={at.avg_win ?? 0}
                leftValue
                rightValue
                max={Math.max(Math.abs(at.avg_loss ?? 0), Math.abs(at.avg_win ?? 0), 0.01)}
              />
              <PairRow
                label="How long it is held"
                hint="losers against winners"
                left={at.avg_hold_loss_hours ?? 0}
                right={at.avg_hold_win_hours ?? 0}
                leftValue
                rightValue
                unit="hours"
                max={Math.max(at.avg_hold_loss_hours ?? 0, at.avg_hold_win_hours ?? 0, 0.1)}
              />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Stat
                label="Accounts ahead"
                value={`${at.profitable_users ?? 0} / ${(at.profitable_users ?? 0) + (at.losing_users ?? 0)}`}
                tone={at.profitable_users ? "text-positive" : "text-loss"}
                sub="in this window"
                onClick={() => goFilter("trading")}
              />
              <Stat
                label="Break-even bar"
                value={breakEven === null ? "—" : pct(breakEven)}
                tone={breakEven == null ? undefined : clearsBar ? "text-positive" : "text-loss"}
                sub={
                  breakEven == null || at.win_rate == null
                    ? "needs settled wins and losses"
                    : clearsBar
                      ? `win rate clears it by ${(at.win_rate - breakEven).toFixed(1)} points`
                      : `win rate is ${(breakEven - at.win_rate).toFixed(1)} points short`
                }
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

      {analytics?.manual?.trades ? (
        <Card
          title="Traded by hand, not by the bot"
          hint="Same exchange accounts, but Agent did not place these. Excluded from every figure above — the reconciler adopts whatever it finds, so a user's own trades land here."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Stat
              label="Net realised — manual"
              value={usd(analytics.manual.net)}
              tone={moneyTone(analytics.manual.net)}
              sub={`${analytics.manual.trades} trades · ${analytics.manual.traders} account(s)`}
            />
            <Stat
              label="Wins / losses"
              value={`${analytics.manual.wins ?? 0}W / ${analytics.manual.losses ?? 0}L`}
            />
            <Stat
              label="Share of the combined loss"
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
              sub="bot and hand together"
            />
          </div>
        </Card>
      ) : null}

      {/* ── 5. the rows ───────────────────────────────────────── */}
      <Card
        id="agent-accounts"
        title="Accounts"
        hint="One row per connected account, biggest mover first. This replaces the old venue and leverage charts: in production both drew the same fact — one account is the only one on its venue and the only one at its leverage."
        padded={false}
        className="scroll-mt-4"
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
                className="h-11 w-[170px] rounded-md border border-ink/[0.1] bg-surface-secondary pl-7 pr-3 font-mono text-[11px] text-text-primary outline-none focus:border-accent sm:h-8"
              />
            </div>
            {[
              ["all", `All ${t.linked ?? 0}`],
              ["trading", "Trading"],
              ["problems", `Failing ${openErrorCount}`],
              ["recovered", `Recovered ${recoveredCount}`],
              ["live", `Live ${t.live || 0}`],
              ["blocked", "Switched off"],
              ["unsigned", `No agreement ${t.unsigned || 0}`],
              ["paused", "Paused"],
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
          <p className="px-4 pb-4 text-[13px] text-text-muted">Nothing in this view.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left">
              <thead>
                <tr className="border-y border-ink/[0.07] font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
                  <th className="whitespace-nowrap py-2 pl-4 pr-3 font-medium">Status</th>
                  <Th label="Account" sortKey="username" sort={sort} onSort={onSort} />
                  <th className="whitespace-nowrap pb-2 pr-3 font-medium">Venue · mode</th>
                  <Th label="Trades" sortKey="trades" sort={sort} onSort={onSort} align="right" />
                  <Th label="Win %" sortKey="win_rate" sort={sort} onSort={onSort} align="right" />
                  <Th label="Net" sortKey="net" sort={sort} onSort={onSort} align="right" />
                  <Th label="Best" sortKey="best" sort={sort} onSort={onSort} align="right" />
                  <Th label="Worst" sortKey="worst" sort={sort} onSort={onSort} align="right" />
                  <Th label="Open" sortKey="open_positions" sort={sort} onSort={onSort} align="right" />
                  <Th label="Errors 24h" sortKey="recent_errors" sort={sort} onSort={onSort} align="right" />
                  <Th label="Running" sortKey="active_seconds" sort={sort} onSort={onSort} />
                  <th className="whitespace-nowrap pb-2 pr-3 font-medium">Last fill</th>
                  <th className="whitespace-nowrap pb-2 pr-4 font-medium">Why</th>
                </tr>
              </thead>
              <tbody>
                {botPages.pagedItems.map((u) => (
                  <tr
                    key={u.subject}
                    onClick={() => setModalUser(u)}
                    className="cursor-pointer border-b border-ink/[0.05] text-[12.5px] hover:bg-ink/[0.03]"
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
                        {u.has_live_ack ? " · signed" : u.has_account ? " · no agreement" : ""}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-1.5">
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
                        <span className="text-[11.5px] text-text-secondary">
                          {u.is_active ? (u.dry_run ? "dry run" : "live") : "paused"}
                          {u.leverage ? ` · ${u.leverage}×` : ""}
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-text-secondary">
                      {u.trades ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-text-secondary">
                      {u.win_rate == null ? "—" : `${u.win_rate}%`}
                    </td>
                    <td className="py-2.5 pr-3">
                      {u.net == null ? (
                        <span className="block text-right font-mono text-text-muted">—</span>
                      ) : (
                        <BarCell value={u.net} max={biggestNet}>
                          {signed(u.net)}
                        </BarCell>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-positive">
                      {u.best == null ? "—" : signed(u.best)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-loss">
                      {u.worst == null ? "—" : signed(u.worst)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-text-secondary">
                      {u.open_positions}
                      {u.stuck_positions ? <span className="text-loss"> +{u.stuck_positions}</span> : null}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                      <span
                        className={
                          u.recent_errors
                            ? u.errors_recovered
                              ? "text-warning"
                              : "text-loss"
                            : "text-text-muted"
                        }
                      >
                        {u.recent_errors}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[11.5px] tabular-nums text-text-secondary">
                      {dur(u.active_seconds)}
                      {u.active_time_estimated ? "*" : ""}
                    </td>
                    <td className="py-2.5 pr-3 text-[11.5px] text-text-muted">
                      {u.last_success_at ? ago(u.last_success_at) : "—"}
                    </td>
                    <td className="max-w-[24ch] truncate py-2.5 pr-4 text-[11.5px] text-text-muted">
                      {u.bot_access_blocked
                        ? u.bot_access_blocked_reason || "switched off by an operator"
                        : u.reasons?.[0]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-3 text-[11px] text-text-muted">
              Click a row for that account&apos;s errors, trades and positions. Headers sort.
              &quot;Running&quot; counts only the time a bot was switched on; * marks one that
              predates the toggle history.
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
        itemLabel="accounts"
      />

      <Card
        title="Open positions"
        hint="What the fleet is holding right now. A position with no stop of ours, or one the reconciler cannot resolve, is marked in its row."
        padded={false}
        right={
          <span className="font-mono text-[11px] text-text-muted">
            {exposure.liveOpen} open · {usd(exposure.notional, 0)} notional ·{" "}
            <span className={moneyTone(exposure.unrealized)}>{signed(exposure.unrealized)}</span>{" "}
            unrealised
            {exposure.dryRun ? ` · ${exposure.dryRun} dry run` : ""}
          </span>
        }
      >
        {positions?.available === false ? (
          <p className="px-4 pb-4 text-[13px] text-text-muted">Positions unavailable.</p>
        ) : !positionRows.length ? (
          <p className="px-4 pb-4 text-[13px] text-text-muted">
            {venueFilter === "all"
              ? "Nobody is holding anything right now."
              : "Nothing open on this venue."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-y border-ink/[0.07] font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
                  <th className="py-2 pl-4 pr-3 font-medium">Symbol</th>
                  <th className="pb-2 pr-3 font-medium">Venue</th>
                  <th className="pb-2 pr-3 font-medium">Side</th>
                  <th className="pb-2 pr-3 text-right font-medium">Qty</th>
                  <th className="pb-2 pr-3 text-right font-medium">Entry</th>
                  <th className="pb-2 pr-3 text-right font-medium">Mark</th>
                  <th className="pb-2 pr-3 text-right font-medium">Live P&amp;L</th>
                  <th className="pb-2 pr-3 text-right font-medium">Notional</th>
                  <th className="pb-2 pr-3 font-medium">Account</th>
                  <th className="pb-2 pr-3 font-medium">Opened</th>
                  <th className="pb-2 pr-4 font-medium">State</th>
                  <th className="pb-2 pr-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {positionPages.pagedItems.map((p, i) => (
                  <tr
                    key={`${p.subject}-${p.symbol}-${i}`}
                    className={`border-b border-ink/[0.05] text-[12.5px] ${
                      p.unprotected || p.status === "reconciliation_required" ? "bg-loss/[0.035]" : ""
                    }`}
                  >
                    <td className="py-2.5 pl-4 pr-3 font-medium text-text-primary">{p.symbol}</td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center gap-1.5 text-[11.5px] text-text-secondary">
                        <VenueLogo venue={p.venue || p.exchange} className="h-4 w-4" />
                        {EXCHANGE_VENUES[p.venue || p.exchange]?.name || p.exchange || "—"}
                        {p.market_type === "futures" && p.leverage ? (
                          <span className="text-text-muted">{p.leverage}×</span>
                        ) : null}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-text-secondary">{p.side}</td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-text-secondary">
                      {p.quantity}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-text-secondary">
                      {p.entry_price ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-text-muted">
                      {p.mark_price == null ? "—" : fmtMark(p.mark_price)}
                    </td>
                    <td className={`py-2.5 pr-3 text-right font-mono tabular-nums ${moneyTone(p.unrealized_pnl)}`}>
                      {p.unrealized_pnl == null
                        ? "—"
                        : `${signed(p.unrealized_pnl)}${
                            p.unrealized_pnl_pct == null ? "" : ` · ${p.unrealized_pnl_pct}%`
                          }`}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-text-secondary">
                      {p.notional == null ? "—" : usd(p.notional)}
                    </td>
                    <td className="py-2.5 pr-3 text-[11.5px] text-text-secondary">
                      {p.username || p.cb_email || p.subject}
                    </td>
                    <td className="py-2.5 pr-3 text-[11.5px] text-text-muted">{ago(p.created_at)}</td>
                    <td className="py-2.5 pr-4">
                      {p.status === "reconciliation_required" ? (
                        <span className="text-[11.5px] font-semibold text-loss">
                          needs reconciliation
                        </span>
                      ) : (
                        <span className="text-[11.5px] text-text-secondary">
                          {p.dry_run ? "open (dry run)" : "open"}
                        </span>
                      )}
                      {p.unprotected ? (
                        <span className="mt-0.5 block text-[10.5px] font-semibold text-loss">
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

      {/* ── venues + adoption ─────────────────────────────────── */}
      <div className="grid gap-3 xl:grid-cols-2">
        <Card
          title="Venues"
          hint="Connected keys and what each venue has made or lost. Click one to filter the tables above."
          right={
            <span className="text-[11px] text-text-muted">
              {t.venues_live ?? venueCards.filter((v) => v.live).length} of {venueCards.length} live
            </span>
          }
        >
          <div className="divide-y divide-ink/[0.05]">
            {venueCards.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setVenueFilter(v.id === venueFilter ? "all" : v.id);
                  botPages.resetPage();
                }}
                className={`flex w-full items-center gap-3 py-2 text-left transition-colors ${
                  venueFilter === v.id ? "bg-accent/[0.06]" : "hover:bg-ink/[0.02]"
                }`}
              >
                <VenueLogo venue={v.id} className="h-5 w-5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium text-text-primary">{v.name}</span>
                  <span className="block text-[10.5px] text-text-muted">
                    {v.connected ? `${v.connected} key${v.connected === 1 ? "" : "s"}` : "no keys"}
                    {v.live ? ` · ${v.live} live` : ""}
                    {v.dryRun ? ` · ${v.dryRun} dry` : ""}
                    {v.open ? ` · ${v.open} open` : ""}
                    {v.wait ? ` · ${v.wait} waiting` : ""}
                  </span>
                </span>
                {v.invalid ? (
                  <span className="shrink-0 rounded-full bg-loss/10 px-2 py-0.5 text-[10.5px] font-semibold text-loss">
                    {v.invalid} bad key{v.invalid === 1 ? "" : "s"}
                  </span>
                ) : null}
                <span className="w-28 shrink-0 whitespace-nowrap text-right">
                  <span className={`block font-mono text-[12.5px] tabular-nums ${v.trades ? moneyTone(v.net) : "text-text-muted"}`}>
                    {v.trades ? signed(v.net) : "—"}
                  </span>
                  <span className="block font-mono text-[10px] text-text-muted">
                    {v.trades ? `${v.trades} trades · ${v.winRate}%` : "no trades"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card
          title="Adoption"
          hint="Of everyone who opened Agent, how many got as far as each step. This is growth, not health — it is the last thing on the page for a reason."
          right={
            waitlist?.counts && Object.keys(waitlist.counts).length ? (
              <span className="font-mono text-[11px] text-accent-text">
                Waitlist{" "}
                {Object.entries(waitlist.counts)
                  .map(([k, n]) => `${k} ${n}`)
                  .join(" · ")}
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
                  <div className="w-28 shrink-0">
                    <p className="text-[12.5px] leading-tight text-text-primary">{label}</p>
                    <p className="text-[10.5px] leading-tight text-text-muted">{note}</p>
                  </div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/[0.07]">
                    <div
                      className="h-full rounded-full bg-accent/80"
                      style={{ width: `${Math.max(2, (value / maxFunnel) * 100)}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums text-text-primary">
                    {value}
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono text-[10.5px] tabular-nums text-text-muted">
                    {rate === null ? "start" : `${rate}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card
        title="Live trading agreements"
        hint="Connecting a key requires this form; unsigned keys are disconnected. The same PDFs live on each person's record under Users → Agent."
        right={
          <span className="text-[11px] text-text-muted">
            {t.signed_live ?? 0} signed · {t.unsigned ?? 0} without
          </span>
        }
      >
        {linked.filter((u) => u.has_live_ack).length ? (
          <div className="divide-y divide-ink/[0.05]">
            {linked
              .filter((u) => u.has_live_ack)
              .map((u) => (
                <div key={u.subject} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div>
                    <p className="text-[12.5px] font-medium text-text-primary">{who(u)}</p>
                    <p className="font-mono text-[10.5px] text-text-muted">
                      lq:{u.luxquant_user_id} · signed {fmtDay(u.live_ack_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
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
                        PDF
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setModalUser(u)}
                      className={deskChipClass(false)}
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-text-muted">Nobody has signed the live trading form yet.</p>
        )}
      </Card>

      <ForceCloseModal position={closing} onClose={() => setClosing(null)} onDone={onReload} />
      {modalUser ? <AutoTradeUserModal user={modalUser} onClose={() => setModalUser(null)} /> : null}
    </div>
  );
}

// ─────────────────────────── the container ───────────────────────────

/** Fetches, and nothing else. Four calls in parallel: health, positions and
 *  money are three different queries against the Agent database, and the
 *  waitlist is ours — a failure there must not cost the page. */
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
