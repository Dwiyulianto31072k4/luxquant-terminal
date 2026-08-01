// src/components/admin/workspace/AutoTradeUserModal.jsx
//
// Full breakdown for one user's bot, in a large modal.
//
// Charts encode profit/loss as a DIVERGING scale, not as categorical series:
// two poles with a neutral zero. The pair is the product's existing
// #0ECB81 / #F6465D. That pair sits in the 6–8 CVD band, which is permitted
// only alongside secondary encoding — so every mark here is also positioned
// relative to a zero baseline and carries a signed direct label. A darker
// pair was measured and is worse: it fixes lightness but drops deutan
// separation to ΔE 3.6 (a hard fail) versus 7.9. Do not "fix" the colours
// without re-running scripts/validate_palette.js.
//

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminApi } from "../../../services/adminApi";

const UP = "#0ECB81";
const DOWN = "#F6465D";
const GRID = "rgba(255,255,255,0.06)";
const AXIS = "#8B92A5";

// The reconciler, entitlement gate and fill recording were fixed on 2026-07-30.
const FIXES_LANDED = "2026-07-31";
const PERIODS = [
  ["Since fixes", FIXES_LANDED],
  ["30 days", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)],
  ["All time", ""],
];

// How a position ended. Futures closes were all recorded as "exchange_close"
// until the reconciler learned to read the closing order off the exchange —
// see AutoTradeOpsTab.jsx. The unattributed bucket is kept visible rather than
// hidden, because a missing answer and a stop-loss mean different things.
const EXIT_REASONS = {
  take_profit: { label: "Take-profit hit", tone: UP },
  trailing_stop: { label: "Trailing stop", tone: UP },
  stop_loss: { label: "Stop-loss hit", tone: DOWN },
  liquidated: { label: "Liquidated", tone: DOWN },
  auto_deleveraged: { label: "Auto-deleveraged", tone: DOWN },
  forced_sell: { label: "Force-closed", tone: AXIS },
  manual_exit: { label: "Closed manually", tone: AXIS },
  exchange_close: { label: "Not attributed", tone: AXIS },
};

const usd = (n) => `${n < 0 ? "-" : ""}$${Math.abs(Number(n) || 0).toFixed(2)}`;
const signed = (n) => `${n >= 0 ? "+" : "-"}$${Math.abs(Number(n) || 0).toFixed(2)}`;
const day = (v) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—";

function ChartFrame({ title, note, children, height = 200 }) {
  return (
    <div className="rounded-xl border border-ink/[0.08] bg-surface-raised p-4">
      <p className="text-[12px] font-semibold text-text-primary">{title}</p>
      {note ? <p className="mt-0.5 text-[11px] text-text-muted">{note}</p> : null}
      <div style={{ height }} className="mt-3">
        {children}
      </div>
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

function Kpi({ label, value, sub, tone }) {
  return (
    <div className="rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p
        className="mt-1.5 text-[20px] font-semibold leading-none text-text-primary"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-[11px] text-text-muted">{sub}</p> : null}
    </div>
  );
}

export const AutoTradeUserModal = ({ user, onClose }) => {
  const [detail, setDetail] = useState(null);
  const [trades, setTrades] = useState(null);
  const [error, setError] = useState("");
  // Everything before 2026-07-31 came from a system whose reconciler had not
  // completed a cycle in weeks, so the default window starts after the fixes.
  const [since, setSince] = useState(FIXES_LANDED);

  const userId = user?.luxquant_user_id;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!userId) return;
    let dead = false;
    Promise.all([
      adminApi.getAutoTradeUser(userId),
      adminApi.getAutoTradeTrades(userId, since),
    ])
      .then(([d, t]) => {
        if (dead) return;
        setDetail(d);
        setTrades(t);
      })
      .catch((e) => !dead && setError(e?.message || "Could not load"));
    return () => {
      dead = true;
    };
  }, [userId, since]);

  // Oldest → newest so the curve reads left to right.
  const curve = useMemo(() => {
    const rows = (trades?.trades || [])
      .filter((r) => r.realized_pnl !== null && r.closed_at)
      .slice()
      .reverse();
    let running = 0;
    return rows.map((r) => {
      running += Number(r.realized_pnl) || 0;
      return {
        at: r.closed_at,
        label: day(r.closed_at),
        symbol: r.symbol,
        pnl: Number(r.realized_pnl) || 0,
        cumulative: Number(running.toFixed(2)),
        btc: r.btc_change_pct,
      };
    });
  }, [trades]);

  // Where zero sits between the curve's max and min, as a 0–1 gradient offset.
  const zeroOffset = useMemo(() => {
    if (!curve.length) return 0;
    const values = curve.map((c) => c.cumulative);
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    if (max <= 0) return 0;
    if (min >= 0) return 1;
    return max / (max - min);
  }, [curve]);

  const bySymbol = useMemo(
    () => (trades?.by_symbol || []).slice().sort((a, b) => a.pnl - b.pnl),
    [trades]
  );

  // Unattributed exits sort last: an absence of information, not an outcome.
  const byExit = useMemo(() => {
    const rows = (trades?.by_exit_reason || []).filter((b) => b.trades > 0);
    const most = Math.max(1, ...rows.map((b) => b.trades));
    return rows
      .map((b) => ({
        ...b,
        meta: EXIT_REASONS[b.key] || {
          label: (b.key || "unknown").replaceAll("_", " "),
          tone: AXIS,
        },
        share: b.trades / most,
        unattributed: !b.key || b.key === "exchange_close",
      }))
      .sort((a, b) =>
        a.unattributed !== b.unattributed ? a.unattributed - b.unattributed : b.trades - a.trades
      );
  }, [trades]);

  const s = detail?.summary || {};
  const ts = trades?.summary || {};

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: "rgba(0,0,0,0.78)" }}
      onClick={onClose}
    >
      <div
        className="isolate w-full max-w-6xl rounded-2xl border border-ink/12 shadow-2xl"
        // Explicit and opaque: the utility class resolved translucent here, which
        // let the table underneath bleed through the numbers.
        style={{ backgroundColor: "rgb(var(--surface))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-ink/[0.08] px-6 py-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
              AGENT · BOT BREAKDOWN
            </p>
            <h2 className="mt-1 text-[22px] font-semibold text-text-primary">
              {user?.username || user?.email || `lq:${userId}`}
            </h2>
            <p className="mt-0.5 text-[12px] text-text-muted">
              lq:{userId}
              {user?.role ? ` · ${user.role}` : ""}
              {s.first_active_at ? ` · started ${day(s.first_active_at)}` : " · never started"}
              {s.markets?.length ? ` · ${s.markets.join("+")}` : ""}
              {s.leverage ? ` · ${s.leverage}× leverage` : ""}
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
              onClick={onClose}
              className="rounded-lg border border-ink/12 px-3 py-1.5 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
            >
              Close
            </button>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error ? <p className="text-sm text-[#F6465D]">{error}</p> : null}
          {!detail && !error ? <p className="text-sm text-text-muted">Loading…</p> : null}

          {detail ? (
            <>
              {/* Health reasons */}
              <div className="rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-3">
                <ul className="space-y-0.5">
                  {(s.reasons || []).map((r) => (
                    <li key={r} className="text-[12px] leading-5 text-text-secondary">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              {/* KPIs */}
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                <Kpi
                  label="Net PnL"
                  value={usd(ts.net ?? s.realized_pnl_total ?? 0)}
                  tone={(ts.net ?? 0) >= 0 ? UP : DOWN}
                  sub="realised"
                />
                <Kpi
                  label="Win rate"
                  value={ts.win_rate === null || ts.win_rate === undefined ? "—" : `${ts.win_rate}%`}
                  sub={`${ts.wins ?? 0}W / ${ts.losses ?? 0}L`}
                />
                <Kpi label="Won" value={usd(ts.gross_win ?? 0)} tone={UP} />
                <Kpi label="Lost" value={usd(ts.gross_loss ?? 0)} tone={DOWN} />
                <Kpi label="Open now" value={s.open_positions ?? 0} sub={`${s.stuck_positions ?? 0} stuck`} />
                <Kpi
                  label="Active for"
                  value={
                    s.active_seconds
                      ? `${Math.floor(s.active_seconds / 86400)}d ${Math.round((s.active_seconds % 86400) / 3600)}h`
                      : "—"
                  }
                  sub={s.active_since ? "running now" : `${s.toggles || 0} toggles`}
                />
              </div>

              {/* Benchmark against BTC */}
              {trades?.btc_benchmark?.length ? (
                <div className="rounded-xl border border-ink/[0.08] bg-surface-raised">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/[0.06] px-4 py-3">
                    <p className="text-[12px] font-semibold text-text-primary">
                      Benchmark — how this bot does in each BTC condition
                    </p>
                    <span className="text-[11px] text-text-muted">
                      BTC column is the market&apos;s own average move over the same sessions
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left">
                      <thead>
                        <tr className="border-b border-ink/[0.06] font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
                          <th className="px-4 py-2 font-medium">Market</th>
                          <th className="px-2 py-2 text-right font-medium">BTC avg/day</th>
                          <th className="px-2 py-2 text-right font-medium">Trades</th>
                          <th className="px-2 py-2 text-right font-medium">Win rate</th>
                          <th className="px-2 py-2 text-right font-medium">Avg / trade</th>
                          <th className="px-4 py-2 text-right font-medium">Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.btc_benchmark.map((b) => (
                          <tr key={b.key} className="border-b border-ink/[0.04] text-[12px]">
                            <td className="px-4 py-2 text-text-secondary">{b.label}</td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              <span style={{ color: b.btc_avg >= 0 ? UP : DOWN }}>
                                {b.btc_avg > 0 ? "+" : ""}
                                {b.btc_avg}%
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-text-muted">
                              {b.trades}
                              <span className="text-text-muted"> · {b.days}d</span>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              <span style={{ color: b.win_rate >= 50 ? UP : DOWN }}>{b.win_rate}%</span>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              <span style={{ color: b.avg >= 0 ? UP : DOWN }}>{signed(b.avg)}</span>
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              <span style={{ color: b.net >= 0 ? UP : DOWN }}>{signed(b.net)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {/* Charts */}
              {curve.length > 1 ? (
                <ChartFrame
                  title="Equity curve"
                  note="Cumulative realised PnL, oldest trade to newest. Above the line is profit."
                  height={220}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={curve} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                      <defs>
                        {/* Split at the zero crossing: colouring the whole area by
                            the final value painted profitable stretches red. */}
                        <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                          <stop offset={0} stopColor={UP} stopOpacity={0.3} />
                          <stop offset={zeroOffset} stopColor={UP} stopOpacity={0.04} />
                          <stop offset={zeroOffset} stopColor={DOWN} stopOpacity={0.04} />
                          <stop offset={1} stopColor={DOWN} stopOpacity={0.3} />
                        </linearGradient>
                        <linearGradient id="eqline" x1="0" y1="0" x2="0" y2="1">
                          <stop offset={zeroOffset} stopColor={UP} />
                          <stop offset={zeroOffset} stopColor={DOWN} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: AXIS, fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={28}
                      />
                      <YAxis
                        tick={{ fill: AXIS, fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        width={54}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.22)" strokeDasharray="3 3" />
                      <Tooltip
                        cursor={{ stroke: "rgba(255,255,255,0.2)" }}
                        content={({ active, payload }) =>
                          active && payload?.length ? (
                            <TipBox
                              rows={[
                                ["Date", payload[0].payload.label],
                                ["Trade", payload[0].payload.symbol],
                                [
                                  "This trade",
                                  signed(payload[0].payload.pnl),
                                  payload[0].payload.pnl >= 0 ? UP : DOWN,
                                ],
                                [
                                  "Cumulative",
                                  usd(payload[0].payload.cumulative),
                                  payload[0].payload.cumulative >= 0 ? UP : DOWN,
                                ],
                                payload[0].payload.btc === null || payload[0].payload.btc === undefined
                                  ? ["BTC", "—"]
                                  : [
                                      "BTC that day",
                                      `${payload[0].payload.btc > 0 ? "+" : ""}${payload[0].payload.btc}%`,
                                      payload[0].payload.btc >= 0 ? UP : DOWN,
                                    ],
                              ]}
                            />
                          ) : null
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="cumulative"
                        stroke="url(#eqline)"
                        strokeWidth={2}
                        fill="url(#eq)"
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartFrame>
              ) : null}

              <div className="grid gap-3 lg:grid-cols-2">
                {bySymbol.length ? (
                  <ChartFrame
                    title="Profit and loss by coin"
                    note="Bars sit left or right of zero, and each carries its signed value."
                    height={Math.max(180, bySymbol.length * 26)}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={bySymbol}
                        layout="vertical"
                        margin={{ top: 0, right: 56, bottom: 0, left: 8 }}
                      >
                        <CartesianGrid stroke={GRID} horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fill: AXIS, fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `$${v}`}
                        />
                        <YAxis
                          type="category"
                          dataKey="symbol"
                          tick={{ fill: AXIS, fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          width={78}
                        />
                        <ReferenceLine x={0} stroke="rgba(255,255,255,0.28)" />
                        <Tooltip
                          cursor={{ fill: "rgba(255,255,255,0.04)" }}
                          content={({ active, payload }) =>
                            active && payload?.length ? (
                              <TipBox
                                rows={[
                                  ["Coin", payload[0].payload.symbol],
                                  ["Net", signed(payload[0].payload.pnl), payload[0].payload.pnl >= 0 ? UP : DOWN],
                                  ["Trades", payload[0].payload.trades],
                                  ["Won", `${payload[0].payload.wins} of ${payload[0].payload.trades}`],
                                ]}
                              />
                            ) : null
                          }
                        />
                        <Bar dataKey="pnl" radius={[4, 4, 4, 4]} barSize={13}>
                          <LabelList
                            dataKey="pnl"
                            position="right"
                            formatter={(v) => signed(v)}
                            style={{ fill: AXIS, fontSize: 10 }}
                          />
                          {bySymbol.map((b) => (
                            <Cell key={b.symbol} fill={b.pnl >= 0 ? UP : DOWN} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartFrame>
                ) : null}

                <div className="space-y-3">
                  {byExit.length ? (
                    <div className="rounded-xl border border-ink/[0.08] bg-surface-raised p-4">
                      <p className="text-[12px] font-semibold text-text-primary">
                        How positions ended
                      </p>
                      <p className="mt-0.5 text-[11px] text-text-muted">
                        Read from the closing order on the exchange.
                      </p>
                      <div className="mt-3 space-y-2">
                        {byExit.map((b) => (
                          <div key={b.key || "unknown"} className="flex items-center gap-2.5">
                            <span
                              className="w-32 shrink-0 text-[12px]"
                              style={{ color: b.unattributed ? AXIS : undefined }}
                            >
                              {b.meta.label}
                            </span>
                            <div className="h-1.5 flex-1 rounded-full bg-ink/5">
                              <div
                                className="h-1.5 rounded-full"
                                style={{
                                  width: `${Math.max(2, b.share * 100)}%`,
                                  backgroundColor: b.meta.tone,
                                  opacity: b.unattributed ? 0.35 : 0.85,
                                }}
                              />
                            </div>
                            <span className="w-8 shrink-0 text-right font-mono text-[11px] text-text-muted">
                              {b.trades}
                            </span>
                            <span
                              className="w-20 shrink-0 text-right font-mono text-[11px]"
                              style={{ color: b.net >= 0 ? UP : DOWN }}
                            >
                              {signed(b.net)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {detail.blocks?.length ? (
                    <div className="rounded-xl border border-ink/[0.08] bg-surface-raised p-4">
                      <p className="text-[12px] font-semibold text-text-primary">
                        Why entries were blocked
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {detail.blocks.map((b) => (
                          <div key={b.code} className="flex items-center justify-between gap-3">
                            <span className="text-[12px] text-text-secondary">
                              {b.code.replaceAll("_", " ")}
                            </span>
                            <span className="font-mono text-[11px] text-text-muted">×{b.hits}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {detail.errors?.length ? (
                    <div className="rounded-xl border border-ink/[0.08] bg-surface-raised p-4">
                      <p className="text-[12px] font-semibold text-text-primary">Recent errors</p>
                      <div className="mt-2 max-h-[220px] space-y-2 overflow-y-auto">
                        {detail.errors.map((e, i) => (
                          <div
                            key={`${e.created_at}-${i}`}
                            className="rounded-lg border border-[#F6465D]/25 bg-[#F6465D]/[0.06] px-3 py-2"
                          >
                            <p className="text-[10px] text-text-muted">
                              {new Date(e.created_at).toLocaleString()}
                              {e.symbol ? ` · ${e.symbol}` : ""}
                            </p>
                            <p className="mt-1 break-words font-mono text-[11px] leading-[1.5] text-text-secondary">
                              {e.error || e.action}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Trades table */}
              {trades?.trades?.length ? (
                <div className="rounded-xl border border-ink/[0.08] bg-surface-raised">
                  <div className="flex items-center justify-between border-b border-ink/[0.06] px-4 py-3">
                    <p className="text-[12px] font-semibold text-text-primary">Closed trades</p>
                    <span className="font-mono text-[11px] text-text-muted">
                      {ts.settled} settled
                      {ts.unpriced ? ` · ${ts.unpriced} without a recorded price` : ""}
                    </span>
                  </div>
                  <div className="max-h-[380px] overflow-auto">
                    <table className="w-full min-w-[760px] text-left">
                      <thead className="sticky top-0 bg-surface-raised">
                        <tr className="border-b border-ink/[0.08] font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
                          <th className="px-4 py-2 font-medium">Closed</th>
                          <th className="px-2 py-2 font-medium">Coin</th>
                          <th className="px-2 py-2 text-right font-medium">PnL</th>
                          <th className="px-2 py-2 text-right font-medium">Move</th>
                          <th className="px-2 py-2 text-right font-medium">BTC that day</th>
                          <th className="px-2 py-2 font-medium">Signals</th>
                          <th className="px-4 py-2 font-medium">Exit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.trades.map((r, i) => (
                          <tr key={`${r.symbol}-${i}`} className="border-b border-ink/[0.04] text-[12px]">
                            <td className="px-4 py-2 text-text-muted">{r.day || "—"}</td>
                            <td className="px-2 py-2 text-text-secondary">
                              {r.symbol}
                              <span className="text-text-muted"> · {r.market_type}</span>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {r.realized_pnl === null ? (
                                <span className="text-text-muted">not recorded</span>
                              ) : (
                                <span style={{ color: r.realized_pnl >= 0 ? UP : DOWN }}>
                                  {signed(r.realized_pnl)}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-text-muted">
                              {r.move_pct === null ? "—" : `${r.move_pct}%`}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {r.btc_change_pct === null || r.btc_change_pct === undefined ? (
                                <span className="text-text-muted">—</span>
                              ) : (
                                <span style={{ color: r.btc_change_pct >= 0 ? UP : DOWN }}>
                                  {r.btc_change_pct > 0 ? "+" : ""}
                                  {r.btc_change_pct}%
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-text-muted">{r.signal_regime || "—"}</td>
                            <td className="px-4 py-2 text-text-muted">
                              {r.is_bot === false ? (
                                <span
                                  className="rounded-sm bg-ink/[0.06] px-1.5 py-0.5 text-[10px]"
                                  title="Opened by hand on this exchange account, not by Agent. It never carried our stop-loss, so it has no exit reason to report."
                                >
                                  traded by hand
                                </span>
                              ) : r.exit_reason ? (
                                EXIT_REASONS[r.exit_reason]?.label ||
                                r.exit_reason.replaceAll("_", " ")
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="border-t border-ink/[0.06] px-4 py-2 text-[10px] text-text-muted">
                    Move is entry to exit. On older trades the entry was sampled before the order
                    filled, so treat those percentages as approximate.
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AutoTradeUserModal;
