import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import CoinLogo from "../CoinLogo";
import {
  Card,
  EmptyState,
  SectionHeader,
  StatCard,
  StatusBadge,
  fmtDateTime,
  fmtNum,
  fmtPct,
  fmtUsd,
} from "./AutoTradeUI";

const COLORS = { up: "#0ECB81", down: "#F6465D", gold: "rgb(var(--accent))", muted: "#848E9C" };
const PAGE_SIZE = 10;

function dayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function pnlClass(value) {
  if (Number(value || 0) > 0) return "text-profit";
  if (Number(value || 0) < 0) return "text-negative";
  return "text-text-primary/80";
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return "—";
  const minutes = Math.max(0, Math.round(Number(seconds) / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function valueFor(trade, basis) {
  return basis === "percent"
    ? Number(trade.realized_pnl_pct || 0)
    : Number(trade.realized_pnl_usdt || 0);
}

function formatBasis(value, basis) {
  return basis === "percent" ? fmtPct(value) : fmtUsd(value);
}

function Pager({ page, pageCount, total, rangeStart, rangeEnd, onPage }) {
  if (pageCount <= 1) return null;
  const btn =
    "rounded-md border border-ink/[0.1] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary transition-colors hover:border-ink/12 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-ink/[0.1] disabled:hover:text-text-secondary";
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-1">
      <span className="font-mono text-[11px] text-text-muted">
        {rangeStart}–{rangeEnd} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </button>
        <span className="font-mono text-[11px] tabular-nums text-text-secondary">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          className={btn}
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, basis }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-ink/[0.08] bg-surface-raised px-3 py-2 shadow-xl">
      <p className="font-mono text-[10px] text-text-muted">{label}</p>
      <p className={`mt-1 font-mono text-sm ${pnlClass(payload[0]?.value)}`}>
        {formatBasis(payload[0]?.value, basis)}
      </p>
    </div>
  );
}

function TradeDetailModal({ trade, onClose, basis }) {
  if (!trade) return null;
  const signal = trade.signal || {};
  const config = trade.config_snapshot || {};
  const entryOrder = (trade.orders || []).find((order) => order.side === "BUY");
  const exitOrder = (trade.orders || []).find((order) => order.side === "SELL");

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-end justify-center sm:items-center bg-scrim/80 p-0 sm:p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[min(92dvh,100%)] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-xl border-t border-ink/[0.08] sm:border bg-surface-raised shadow-[0_-20px_60px_rgb(var(--scrim) / 0.35)] sm:shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex shrink-0 justify-center pt-2.5 pb-0 sm:hidden sticky top-0 z-10 bg-surface-raised"
          aria-hidden="true"
        >
          <div className="h-1 w-10 rounded-full bg-ink/25" />
        </div>
        <div className="overflow-hidden">
          <div className="flex items-start justify-between border-b border-ink/[0.06] p-5">
            <div className="flex items-center gap-3">
              <CoinLogo pair={trade.symbol} size={40} />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-mono text-lg font-semibold text-text-primary">
                    {trade.symbol}
                  </h3>
                  <StatusBadge tone={trade.exit_reason === "take_profit" ? "good" : "bad"}>
                    {trade.exit_reason?.replaceAll("_", " ") || trade.status}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  AutoTrade live · {trade.market_type} · closed {fmtDateTime(trade.closed_at)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-full text-text-muted hover:bg-ink/[0.06] hover:text-text-primary"
            >
              ×
            </button>
          </div>

          <div className="grid grid-cols-2 gap-px border-b border-ink/[0.06] bg-ink/[0.04] md:grid-cols-4">
            <ModalMetric
              label="Final PnL"
              value={formatBasis(valueFor(trade, basis), basis)}
              tone={pnlClass(valueFor(trade, basis))}
            />
            <ModalMetric label="Fee" value={fmtUsd(trade.fees_usdt)} />
            <ModalMetric label="Quantity" value={fmtNum(trade.quantity, 8)} />
            <ModalMetric label="Holding time" value={formatDuration(trade.duration_seconds)} />
            <ModalMetric label="Entry notional" value={fmtUsd(trade.entry_notional_usdt)} />
            <ModalMetric label="Exit notional" value={fmtUsd(trade.exit_notional_usdt)} />
            <ModalMetric label="Entry price" value={fmtNum(trade.entry_price, 8)} />
            <ModalMetric label="Exit price" value={fmtNum(trade.exit_price, 8)} />
          </div>

          <div className="grid gap-4 p-5 lg:grid-cols-2">
            <DetailPanel title="Trade outcome">
              <DetailRow label="Opened" value={fmtDateTime(trade.opened_at)} />
              <DetailRow label="Closed" value={fmtDateTime(trade.closed_at)} />
              <DetailRow label="Result" value={trade.exit_reason?.replaceAll("_", " ") || "—"} />
              <DetailRow label="Entry order" value={entryOrder?.exchange_order_id || "—"} />
              <DetailRow label="OCO list" value={exitOrder?.exchange_order_list_id || "—"} />
              <DetailRow
                label="Exit order"
                value={exitOrder?.exchange_order_id || "Recorded in OCO"}
              />
            </DetailPanel>

            <DetailPanel title="Execution settings">
              <DetailRow
                label="Sizing"
                value={`${config.spot_sizing_method || config.sizing_method || "—"} ${config.spot_sizing_value ?? config.sizing_value ?? ""}`}
              />
              <DetailRow
                label="TP level"
                value={`TP${config.spot_tp_level ?? config.tp_level ?? "—"}`}
              />
              <DetailRow
                label="SL level"
                value={`SL${config.spot_sl_level ?? config.sl_level ?? "—"}`}
              />
              <DetailRow
                label="Exit mode"
                value={config.spot_exit_mode || config.exit_mode || "—"}
              />
              <DetailRow label="Risk" value={signal.risk_level || "—"} />
            </DetailPanel>

            <div className="lg:col-span-2">
              <DetailPanel title="Signal snapshot">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <ModalMetric label="Side" value={signal.side || trade.side || "—"} compact />
                  <ModalMetric
                    label="Entry range"
                    value={
                      (signal.entries || [])
                        .slice(0, 2)
                        .map((v) => fmtNum(v, 8))
                        .join(" – ") || "—"
                    }
                    compact
                  />
                  <ModalMetric
                    label="Selected target"
                    value={fmtNum(
                      (signal.tps || [])[Number(config.spot_tp_level ?? config.tp_level ?? 1) - 1],
                      8
                    )}
                    compact
                  />
                  <ModalMetric
                    label="Selected stop"
                    value={fmtNum(
                      (signal.sls || [])[Number(config.spot_sl_level ?? config.sl_level ?? 1) - 1],
                      8
                    )}
                    compact
                  />
                </div>
                <p className="mt-3 text-xs text-text-muted">
                  Signal text is intentionally hidden here. This view records only the
                  execution-relevant snapshot.
                </p>
              </DetailPanel>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalMetric({ label, value, tone = "text-text-primary", compact = false }) {
  return (
    <div className={compact ? "" : "bg-surface-raised p-4"}>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted/60">{label}</p>
      <p className={`mt-1 break-words font-mono text-sm ${tone}`}>{value ?? "—"}</p>
    </div>
  );
}

function DetailPanel({ title, children }) {
  return (
    <div className="rounded-md border border-ink/[0.06] bg-ink/[0.015] p-4">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{title}</p>
      {children}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink/[0.04] py-2 last:border-0">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="max-w-[65%] break-all text-right font-mono text-xs text-text-primary/85">
        {value}
      </span>
    </div>
  );
}

export default function TradeHistoryCalendar({ history = {} }) {
  const trades = history.items || [];
  const summary = history.summary || {};
  const closedTrades = trades.filter((trade) => trade.status === "closed");
  const [basis, setBasis] = useState("nominal");
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [page, setPage] = useState(1);

  const chartData = useMemo(() => {
    let cumulative = 0;
    return [...closedTrades].reverse().map((trade) => {
      cumulative += valueFor(trade, basis);
      return {
        id: trade.id,
        date: new Date(trade.closed_at).toLocaleDateString([], { month: "short", day: "numeric" }),
        symbol: trade.symbol,
        pnl: valueFor(trade, basis),
        cumulative,
      };
    });
  }, [closedTrades, basis]);

  const dailyData = useMemo(() => {
    const grouped = {};
    closedTrades.forEach((trade) => {
      const key = dayKey(trade.closed_at);
      if (!grouped[key]) grouped[key] = { date: key, pnl: 0, count: 0 };
      grouped[key].pnl += valueFor(trade, basis);
      grouped[key].count += 1;
    });
    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  }, [closedTrades, basis]);

  const outcomes = [
    { name: "Wins", value: Number(summary.winning_trades || 0), color: COLORS.up },
    { name: "Losses", value: Number(summary.losing_trades || 0), color: COLORS.down },
  ];
  const winRate = summary.closed_live_trades
    ? (Number(summary.winning_trades || 0) / Number(summary.closed_live_trades)) * 100
    : 0;
  const totalDisplay =
    basis === "percent"
      ? closedTrades.reduce((sum, trade) => sum + Number(trade.realized_pnl_pct || 0), 0)
      : Number(summary.realized_pnl_usdt || 0);

  const pageCount = Math.max(1, Math.ceil(closedTrades.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedTrades = closedTrades.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const rangeStart = closedTrades.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, closedTrades.length);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader label="Live Trade Performance" />
        <div className="flex rounded-md border border-ink/[0.08] bg-scrim/20 p-1">
          {[
            ["nominal", "USDT"],
            ["percent", "%"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setBasis(value)}
              className={`rounded px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider ${
                basis === value
                  ? "bg-accent text-accent-fg"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open live" value={summary.open_live_positions || 0} />
        <StatCard label="Closed live" value={summary.closed_live_trades || 0} />
        <StatCard
          label="Realized PnL"
          value={formatBasis(totalDisplay, basis)}
          valueColor={pnlClass(totalDisplay)}
        />
        <StatCard label="Win rate" value={`${winRate.toFixed(0)}%`} />
      </div>

      {closedTrades.length === 0 ? (
        <EmptyState
          icon="C"
          title="No closed live trades yet"
          hint="Completed live trades will appear here."
        />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card>
              <div className="mb-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                  Cumulative performance
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Running realized result across closed live trades.
                </p>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.gold} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={COLORS.gold} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgb(var(--ink) / 0.05)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: COLORS.muted, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: COLORS.muted, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                    />
                    <Tooltip content={<ChartTooltip basis={basis} />} />
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      stroke={COLORS.gold}
                      strokeWidth={2}
                      fill="url(#pnlFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                Outcome mix
              </p>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={outcomes}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={78}
                      paddingAngle={4}
                    >
                      {outcomes.map((item) => (
                        <Cell key={item.name} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {outcomes.map((item) => (
                  <div key={item.name} className="rounded border border-ink/[0.06] p-3">
                    <p className="text-xs text-text-muted">{item.name}</p>
                    <p className="mt-1 font-mono text-lg text-text-primary">{item.value}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                  Daily result
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Calendar basis summarized as a compact daily bar chart.
                </p>
              </div>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid stroke="rgb(var(--ink) / 0.05)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: COLORS.muted, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: COLORS.muted, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip content={<ChartTooltip basis={basis} />} />
                  <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                    {dailyData.map((item) => (
                      <Cell key={item.date} fill={item.pnl >= 0 ? COLORS.up : COLORS.down} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <SectionHeader label="Closed Live Trades" hint="Tap a trade for full execution notes" />

          {/* Mobile: compact tappable cards (the 9-column table needs horizontal scroll on phones) */}
          <div className="space-y-2.5 lg:hidden">
            {pagedTrades.map((trade) => (
              <Card key={trade.id} padded={false} hover>
                <button
                  type="button"
                  onClick={() => setSelectedTrade(trade)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <CoinLogo pair={trade.symbol} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-text-primary">
                        {trade.symbol}
                      </span>
                      <StatusBadge tone={trade.exit_reason === "take_profit" ? "good" : "bad"}>
                        {trade.exit_reason?.replaceAll("_", " ")}
                      </StatusBadge>
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-text-muted">
                      {fmtDateTime(trade.closed_at)} · {formatDuration(trade.duration_seconds)}
                    </span>
                  </span>
                  <span className="flex-shrink-0 text-right">
                    <span
                      className={`block font-mono text-sm font-semibold tabular-nums ${pnlClass(valueFor(trade, basis))}`}
                    >
                      {formatBasis(valueFor(trade, basis), basis)}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-text-muted">
                      fee {fmtUsd(trade.fees_usdt)}
                    </span>
                  </span>
                  <svg
                    className="h-4 w-4 flex-shrink-0 text-text-secondary"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </Card>
            ))}
          </div>

          {/* Desktop: full table */}
          <Card padded={false} className="hidden lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/[0.06]">
                    {[
                      "Closed",
                      "Symbol",
                      "Result",
                      "Qty",
                      "Entry",
                      "Exit",
                      "Fee",
                      "PnL",
                      "Duration",
                    ].map((heading, index) => (
                      <th
                        key={heading}
                        className={`px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted ${index >= 3 ? "text-right" : "text-left"}`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedTrades.map((trade) => (
                    <tr
                      key={trade.id}
                      onClick={() => setSelectedTrade(trade)}
                      className="cursor-pointer border-b border-ink/[0.04] transition-colors last:border-0 hover:bg-surface-secondary"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-text-muted">
                        {fmtDateTime(trade.closed_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CoinLogo pair={trade.symbol} size={24} />
                          <span className="font-mono text-text-primary">{trade.symbol}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={trade.exit_reason === "take_profit" ? "good" : "bad"}>
                          {trade.exit_reason?.replaceAll("_", " ")}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-text-primary/85">
                        {fmtNum(trade.quantity, 8)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-text-primary/85">
                        {fmtNum(trade.entry_price, 8)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-text-primary/85">
                        {fmtNum(trade.exit_price, 8)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-text-muted">
                        {fmtUsd(trade.fees_usdt)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-semibold ${pnlClass(valueFor(trade, basis))}`}
                      >
                        {formatBasis(valueFor(trade, basis), basis)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-text-muted">
                        {formatDuration(trade.duration_seconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Pager
            page={safePage}
            pageCount={pageCount}
            total={closedTrades.length}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onPage={setPage}
          />
        </>
      )}

      <TradeDetailModal
        trade={selectedTrade}
        onClose={() => setSelectedTrade(null)}
        basis={basis}
      />
    </div>
  );
}
