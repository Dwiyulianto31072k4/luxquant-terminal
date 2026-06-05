// src/components/autotrade/PositionsBoard.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade Positions Board
// Cryptobot-inspired compact table view for open positions
// ════════════════════════════════════════════════════════════════

import CoinLogo from "../CoinLogo";
import { closeOrderManually } from "../../services/autotradeApi";

const DEMO_POSITIONS = [
  {
    id: 10821,
    pair: "BTCUSDT",
    side: "buy",
    exchange_id: "binance",
    market_type: "futures",
    entry_price: 68420.5,
    qty: 0.082,
    leverage: 8,
    tp_orders: [
      { filled: true },
      { filled: true },
      { filled: false },
      { filled: false },
    ],
    trailing_enabled: true,
    trailing_value: 1.8,
    trailing_type: "percent",
    status: "filled",
    created_at: "2026-05-29T08:42:00Z",
  },
  {
    id: 10822,
    pair: "ETHUSDT",
    side: "buy",
    exchange_id: "bybit",
    market_type: "spot",
    entry_price: 3658.12,
    qty: 1.75,
    leverage: 3,
    tp_orders: [{ filled: true }, { filled: false }, { filled: false }],
    trailing_enabled: false,
    trailing_value: 0,
    trailing_type: "percent",
    status: "partial",
    created_at: "2026-05-29T09:18:00Z",
  },
  {
    id: 10823,
    pair: "SOLUSDT",
    side: "sell",
    exchange_id: "okx",
    market_type: "futures",
    entry_price: 171.34,
    qty: 24,
    leverage: 5,
    tp_orders: [
      { filled: false },
      { filled: false },
      { filled: false },
      { filled: false },
    ],
    trailing_enabled: true,
    trailing_value: 8,
    trailing_type: "fixed_usdt",
    status: "active",
    created_at: "2026-05-29T09:54:00Z",
  },
];

function fmtNum(value, digits = 4) {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function fmtTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function pickPair(position) {
  return position.pair || position.symbol || position.market || "—";
}

function pickSide(position) {
  return String(position.side || position.direction || "—").toLowerCase();
}

function pickStatus(position) {
  return String(position.status || position.state || "filled").toLowerCase();
}

function pickMarketType(position) {
  const value = String(
    position.market_type || position.market || "",
  ).toLowerCase();
  if (value.includes("future")) return "futures";
  return "spot";
}

function statusTone(status) {
  if (status === "filled" || status === "active") return "success";
  if (status === "partial") return "warning";
  if (status === "error") return "danger";
  return "neutral";
}

const Pill = ({ children, tone = "neutral" }) => {
  const cls = {
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    warning: "bg-gold-primary/10 text-gold-primary border-gold-primary/25",
    danger: "bg-red-500/10 text-red-400 border-red-500/25",
    neutral: "bg-white/[0.04] text-text-muted border-white/[0.08]",
  }[tone];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[9px] font-mono uppercase tracking-[0.1em] border ${cls}`}
    >
      {children}
    </span>
  );
};

const EmptyState = () => (
  <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0a0805] p-8 text-center">
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-gold-primary/20 bg-gold-primary/[0.04]">
      <svg
        className="h-6 w-6 text-gold-primary/70"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 19.5V4.5m0 15h16m-16 0L9 15l4 4 4-6 3 3"
        />
      </svg>
    </div>
    <p className="text-white text-sm font-medium mb-1">No open positions</p>
    <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted">
      Positions will appear here when autotrade executes signals
    </p>
  </div>
);

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <div className="h-4 w-40 animate-pulse rounded bg-white/[0.06]" />
      </div>
      <div className="p-4 space-y-3">
        {[...Array(4)].map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-12 gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3"
          >
            {[...Array(12)].map((__, cellIndex) => (
              <div
                key={cellIndex}
                className="h-4 animate-pulse rounded bg-white/[0.05]"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PositionsBoard({
  positions = [],
  onClosed,
  loading = false,
  onRefresh,
}) {
  const liveRows = Array.isArray(positions) ? positions : [];
  const rows = liveRows.length > 0 ? liveRows : DEMO_POSITIONS;
  const spotRows = rows.filter(
    (position) => pickMarketType(position) === "spot",
  );
  const futuresRows = rows.filter(
    (position) => pickMarketType(position) === "futures",
  );

  const handleClose = async (position) => {
    if (
      !confirm(
        `Close ${pickPair(position)} ${String(position.side || "").toUpperCase()} at market?`,
      )
    )
      return;
    await closeOrderManually(position.id, "manual_from_ui");
    onClosed?.();
  };

  if (loading) {
    return <TableSkeleton />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="h-px w-8 bg-gold-primary/40" />
          <span className="font-mono uppercase tracking-[0.25em] text-gold-primary/80 text-[11px]">
            Positions
          </span>
          <span className="text-[10px] font-mono text-text-muted/70 uppercase tracking-[0.15em]">
            {liveRows.length > 0 ? `${rows.length} active` : "demo seeded"}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted flex-wrap justify-end">
          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live board
          </span>
          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06]">
            Cryptobot style
          </span>
          {liveRows.length === 0 && (
            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-gold-primary/10 border border-gold-primary/20 text-gold-primary">
              Demo first
            </span>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/[0.06] text-gold-primary/80 hover:text-gold-primary hover:border-gold-primary/30 transition-all"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992m0 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
              Refresh
            </button>
          )}
        </div>
      </div>

      <MarketSection
        title="Spot Positions"
        description="Cash-market positions and manual close controls"
        rows={spotRows}
        emptyLabel="No spot positions"
        onClose={handleClose}
      />

      <MarketSection
        title="Futures Positions"
        description="Leveraged positions and manual close controls"
        rows={futuresRows}
        emptyLabel="No futures positions"
        onClose={handleClose}
      />
    </div>
  );
}

function MarketSection({ title, description, rows, emptyLabel, onClose }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted/60">
            {description}
          </p>
        </div>
        <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/70">
          {rows.length} rows
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-8">
          <EmptyState />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-black/20 text-text-muted/80">
              <tr>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em]">
                  Pair
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em]">
                  Side
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em]">
                  Exchange
                </th>
                <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                  Entry
                </th>
                <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                  Qty
                </th>
                <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                  Lev
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em]">
                  TP
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em]">
                  Trailing
                </th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.18em]">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                  Time
                </th>
                <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.18em]">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((position, index) => {
                const pair = pickPair(position);
                const side = pickSide(position);
                const status = pickStatus(position);
                const tpHit = Array.isArray(position.tp_orders)
                  ? position.tp_orders.filter((item) => item.filled).length
                  : 0;
                const tpTotal = Array.isArray(position.tp_orders)
                  ? position.tp_orders.length
                  : 0;

                return (
                  <tr
                    key={position.id || `${pair}-${index}`}
                    className="border-t border-white/[0.06] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3 text-white">
                      <div className="flex items-center gap-3 min-w-0">
                        <CoinLogo pair={pair} size={30} />
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-semibold truncate">
                            {pair}
                          </p>
                          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/60 truncate">
                            #{position.id}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Pill
                        tone={
                          side === "buy"
                            ? "success"
                            : side === "sell"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {side}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 text-white font-mono text-sm capitalize">
                      {position.exchange_id || "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-mono tabular-nums">
                      {fmtNum(position.entry_price ?? position.entry, 6)}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-mono tabular-nums">
                      {fmtNum(position.qty, 4)}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-mono tabular-nums">
                      {fmtNum(position.leverage, 2)}x
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      <div className="space-y-0.5">
                        <p className="text-white font-mono text-sm tabular-nums">
                          {tpHit}
                          <span className="text-text-muted/50"> / </span>
                          {tpTotal}
                        </p>
                        <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/60">
                          TP progress
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      <div className="space-y-0.5">
                        <p className="text-white font-mono text-sm tabular-nums">
                          {position.trailing_enabled ? "On" : "Off"}
                        </p>
                        <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/60">
                          {position.trailing_enabled
                            ? `${fmtNum(position.trailing_value, 2)}${position.trailing_type === "percent" ? "%" : " USDT"}`
                            : "Disabled"}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={statusTone(status)}>{status}</Pill>
                    </td>
                    <td className="px-4 py-3 text-right text-white font-mono text-sm whitespace-nowrap">
                      {fmtTime(position.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onClose(position)}
                        className="inline-flex items-center rounded-md border border-red-500/25 px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.15em] text-red-400 hover:bg-red-500/[0.08] hover:border-red-500/40 transition-all"
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
