// src/components/admin/workspace/AutoTradeUserModal.jsx
//
// Full breakdown for one user's bot. Charts encode profit/loss as a
// diverging scale (#0ECB81 / #F6465D) with a signed label at zero.
// Do not change that pair without re-running scripts/validate_palette.js.

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
import { EXCHANGE_VENUES, VenueLogo } from "../../autotrade/exchangeVenues";
import ForceCloseModal from "./ForceCloseModal";
import { CloseIcon, AlertTriangleIcon, CheckCircleIcon, KeyIcon, SearchIcon } from "../Icons";

const UP = "#0ECB81";
const DOWN = "#F6465D";
const WARN = "#F0B90B";
const GRID = "rgba(255,255,255,0.06)";
const AXIS = "#8B92A5";

const TRACKING_RESET_AT = "2026-08-14T17:13:05Z";
const PERIODS = [
  ["Since reset", TRACKING_RESET_AT],
  ["30 days", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)],
  ["All time", ""],
];

const EXIT_REASONS = {
  take_profit: { label: "Take-profit hit", tone: UP },
  trailing_stop: { label: "Trailing stop", tone: UP },
  stop_loss: { label: "Stop-loss hit", tone: DOWN },
  liquidated: { label: "Liquidated", tone: DOWN },
  auto_deleveraged: { label: "Auto-deleveraged", tone: DOWN },
  emergency_close_unprotected: { label: "Emergency close", tone: DOWN },
  forced_sell: { label: "Force-closed", tone: AXIS },
  manual_exit: { label: "Closed manually", tone: AXIS },
  exchange_close: { label: "Not attributed", tone: AXIS },
};

const RISK_HELP = {
  telegram_not_connected: {
    label: "Telegram is not connected",
    hint: "Live entries wait until Telegram is connected. Dry-run and open positions are untouched.",
  },
  reconciliation_required: {
    label: "Position needs reconciliation",
    hint: "Every new entry is paused until the unmatched position clears.",
  },
  subscription_inactive: {
    label: "Subscription inactive",
    hint: "Live entries pause until renewal. Open positions keep their stops.",
  },
  max_open_positions: { label: "Max open positions reached", hint: "Wait for a close, or raise the limit." },
  symbol_position_exists: { label: "Already holding this symbol", hint: "One open position per symbol." },
  max_trade_notional: { label: "Trade size above per-trade cap", hint: "Raise the cap or lower Amount." },
  minimum_available_balance: { label: "Minimum reserve would be breached", hint: "Top up USDT or lower Amount." },
  max_daily_trades: { label: "Daily trade limit reached", hint: "Resets 00:00 UTC." },
  daily_loss_limit: { label: "Daily loss limit reached", hint: "Paused until 00:00 UTC." },
  loss_cooldown: { label: "Cooling down after a loss", hint: "Shorten or disable under Cooldown after loss." },
  error_cooldown: { label: "Cooling down after a failed trade", hint: "Clears on its own." },
  max_live_bots: { label: "Server live-bot capacity reached", hint: "Platform cap, not this user's setting." },
  user_order_throttle: { label: "Too many live orders in a short window", hint: "Clears within about a minute." },
  not_listed: { label: "Symbol not listed on this venue", hint: "The signal coin is not tradable there." },
  outside_entry: { label: "Price outside entry zone", hint: "Venue last was not inside the signal's entry band." },
  missing_exchange_account: { label: "No key on this venue", hint: "Connect the exchange first." },
};

const TABS = [
  ["overview", "Overview"],
  ["venues", "Venues"],
  ["positions", "Positions"],
  ["trades", "Trades"],
  ["errors", "Errors"],
  ["skips", "Skips"],
  ["agreements", "Agreements"],
  ["control", "Control"],
];

const usd = (n) => `${n < 0 ? "-" : ""}$${Math.abs(Number(n) || 0).toFixed(2)}`;
const signed = (n) => `${n >= 0 ? "+" : "-"}$${Math.abs(Number(n) || 0).toFixed(2)}`;
const day = (v) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—";
const when = (v) =>
  v
    ? new Date(v).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const ago = (v) => {
  if (!v) return "—";
  const mins = Math.round((Date.now() - new Date(v).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};
const venueName = (id) => EXCHANGE_VENUES[id]?.name || id || "—";
const who = (u, id) => u?.username || u?.email || u?.cb_email || `lq:${id}`;

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
    <div className="rounded-xl border border-ink/[0.1] bg-surface-raised px-3 py-2 shadow-xl">
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
    <div className="rounded-xl border border-ink/[0.08] bg-surface-raised px-3.5 py-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p
        className="mt-1.5 text-[20px] font-semibold leading-none tabular-nums text-text-primary"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-[11px] text-text-muted">{sub}</p> : null}
    </div>
  );
}

function StatusChip({ status, recovered }) {
  const map = {
    error: { label: "Error", fg: DOWN, bg: "rgba(246,70,93,0.12)" },
    warn: {
      label: recovered ? "Recovered" : "Warning",
      fg: WARN,
      bg: "rgba(240,185,11,0.12)",
    },
    ok: { label: "Healthy", fg: UP, bg: "rgba(14,203,129,0.12)" },
    paused: { label: "Paused", fg: AXIS, bg: "rgba(139,146,165,0.12)" },
    unsigned: { label: "No agreement", fg: AXIS, bg: "rgba(139,146,165,0.12)" },
    unlinked: { label: "Not linked", fg: AXIS, bg: "rgba(90,96,112,0.12)" },
  };
  const s = map[status] || map.unlinked;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.fg }} />
      {s.label}
    </span>
  );
}

function ModeChip({ summary }) {
  if (!summary?.is_active) {
    return (
      <span className="rounded-full border border-ink/12 px-2 py-0.5 text-[11px] text-text-muted">
        Paused
      </span>
    );
  }
  if (summary.dry_run) {
    return (
      <span className="rounded-full bg-[rgba(240,185,11,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[#E3A008]">
        Dry run
      </span>
    );
  }
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(14,203,129,0.12)", color: UP }}>
      Live
    </span>
  );
}

const BotAccessControl = ({ userId, blocked, reason, blockedBy, onChanged }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (nextBlocked) => {
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setErr("A reason is required — the user is shown it.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await adminApi.setAutoTradeBotAccess(userId, nextBlocked, trimmed);
      setOpen(false);
      setText("");
      onChanged?.();
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || "Could not apply");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        blocked ? "border-negative/40 bg-negative/[0.06]" : "border-ink/[0.08] bg-surface-raised"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">
            BOT ACCESS
          </p>
          <p className="mt-1 text-[13px] font-semibold text-text-primary">
            {blocked ? "Switched off by an operator" : "Operator has not switched this bot off"}
          </p>
          {blocked ? (
            <p className="mt-0.5 break-words text-[11px] text-text-muted">
              {reason || "No reason recorded."}
              {blockedBy ? ` · by ${blockedBy}` : ""}
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-text-muted">
              Stops new live entries only. Subscription, signals and open positions
              keep their take-profit and stop-loss.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setErr("");
            setOpen((v) => !v);
          }}
          className={`shrink-0 rounded-xl border px-3 py-1.5 text-[12px] transition-colors ${
            blocked
              ? "border-ink/[0.08] text-text-secondary hover:border-accent hover:text-accent"
              : "border-negative/40 text-loss hover:bg-negative/10"
          }`}
        >
          {open ? "Cancel" : blocked ? "Switch back on" : "Switch bot off"}
        </button>
      </div>
      {open ? (
        <div className="mt-3 border-t border-ink/[0.08] pt-3">
          <label className="text-[11px] text-text-muted">Reason — shown to the user</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={
              blocked
                ? "e.g. Review complete, no issue found."
                : "e.g. Suspected API key sharing, pending review."
            }
            className="mt-1 w-full rounded-lg border border-ink/12 bg-surface-primary px-3 py-2 text-[12px] text-text-primary outline-none focus:border-accent"
          />
          {err ? <p className="mt-1 text-[11px] text-loss">{err}</p> : null}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => submit(!blocked)}
              className="rounded-xl bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-fg disabled:opacity-50"
            >
              {busy ? "Applying…" : blocked ? "Switch back on" : "Switch bot off"}
            </button>
            <span className="text-[11px] text-text-muted">Takes effect within about 2 minutes.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
};

function Verdict({ summary, trades, errors }) {
  const liveVenues = (summary?.venues || []).filter((v) => v.connected);
  const liveNames = liveVenues
    .filter((v) => v.is_active && v.dry_run === false)
    .map((v) => venueName(v.exchange));
  const openErrors = (errors || []).filter((e) => !e.resolved);
  const recovered = (errors || []).filter((e) => e.resolved);
  const sinceReset = (errors || []).filter((e) => e.since_reset);
  const stuck = summary?.stuck_positions || 0;
  const invalid = summary?.key_status === "invalid";

  let tone = "ok";
  let title = "Running normally";
  if (summary?.bot_access_blocked) {
    tone = "bad";
    title = "Switched off by an operator";
  } else if (stuck) {
    tone = "bad";
    title = `${stuck} position${stuck === 1 ? "" : "s"} need reconciliation — all new entries blocked`;
  } else if (invalid) {
    tone = "bad";
    title = "An exchange key was rejected — cannot trade until reconnected";
  } else if (openErrors.length) {
    tone = "bad";
    title = `${openErrors.length} unresolved execution error${openErrors.length === 1 ? "" : "s"}`;
  } else if (!summary?.is_active) {
    tone = "muted";
    title = "Bot is paused — no new entries";
  } else if (summary?.dry_run) {
    tone = "warn";
    title = "Dry-run — no real orders are placed";
  } else if (recovered.length && !sinceReset.length) {
    tone = "warn";
    title = `Live${liveNames.length ? ` on ${liveNames.join(" + ")}` : ""}. ${recovered.length} error${recovered.length === 1 ? "" : "s"} in the last 24h already recovered`;
  } else if (liveNames.length) {
    tone = "ok";
    title = `Live on ${liveNames.join(" + ")}`;
  }

  const border =
    tone === "bad"
      ? "border-[#F6465D]/35 bg-[#F6465D]/[0.07]"
      : tone === "warn"
        ? "border-[#F0B90B]/35 bg-[#F0B90B]/[0.07]"
        : tone === "ok"
          ? "border-[#0ECB81]/30 bg-[#0ECB81]/[0.06]"
          : "border-ink/[0.08] bg-surface-raised";

  return (
    <div className={`rounded-xl border px-4 py-3 ${border}`}>
      <div className="flex items-start gap-2.5">
        {tone === "ok" ? (
          <CheckCircleIcon size={16} style={{ color: UP }} className="mt-0.5 shrink-0" />
        ) : (
          <AlertTriangleIcon
            size={16}
            style={{ color: tone === "bad" ? DOWN : WARN }}
            className="mt-0.5 shrink-0"
          />
        )}
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-text-primary">{title}</p>
          <p className="mt-1 text-[11px] leading-5 text-text-muted">
            {sinceReset.length
              ? `${sinceReset.length} error${sinceReset.length === 1 ? "" : "s"} since the tracking reset.`
              : "No execution errors since the tracking reset."}{" "}
            {summary?.last_success_at ? `Last live fill ${ago(summary.last_success_at)}.` : "No live fill recorded."}{" "}
            {trades?.summary?.settled
              ? `${trades.summary.settled} settled trade${trades.summary.settled === 1 ? "" : "s"} in this window.`
              : "No settled trades in this window."}
          </p>
          {(summary?.reasons || []).length ? (
            <ul className="mt-2 space-y-0.5">
              {summary.reasons.map((r) => (
                <li key={r} className="text-[11px] leading-5 text-text-secondary">
                  {r}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TradeRow({ row, open, onToggle }) {
  const reason = row.is_bot === false
    ? "traded by hand"
    : EXIT_REASONS[row.exit_reason]?.label || (row.exit_reason || "—").replaceAll("_", " ");
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-ink/[0.04] text-[12px] hover:bg-ink/[0.03]"
      >
        <td className="px-4 py-2 text-text-muted">{row.day || day(row.closed_at)}</td>
        <td className="px-2 py-2">
          <span className="font-medium text-text-primary">{row.symbol}</span>
          <span className="text-text-muted"> · {row.market_type}</span>
        </td>
        <td className="px-2 py-2">
          <span className="inline-flex items-center gap-1 text-text-secondary">
            <VenueLogo venue={row.venue || row.exchange} className="h-3.5 w-3.5" />
            {venueName(row.venue || row.exchange)}
          </span>
        </td>
        <td className="px-2 py-2 text-right tabular-nums">
          {row.realized_pnl === null ? (
            <span className="text-text-muted">not recorded</span>
          ) : (
            <span style={{ color: row.realized_pnl >= 0 ? UP : DOWN }}>{signed(row.realized_pnl)}</span>
          )}
        </td>
        <td className="px-2 py-2 text-right tabular-nums text-text-muted">
          {row.move_pct === null || row.move_pct === undefined ? "—" : `${row.move_pct}%`}
        </td>
        <td className="px-2 py-2 text-text-muted">{reason}</td>
      </tr>
      {open ? (
        <tr className="border-b border-ink/[0.06] bg-ink/[0.02]">
          <td colSpan={6} className="px-4 py-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Side", row.side || "—"],
                ["Qty", row.quantity ?? "—"],
                ["Entry", row.entry_price ?? "—"],
                ["Exit", row.exit_price ?? "—"],
                ["Fees", row.fees == null ? "—" : usd(row.fees)],
                ["Hold", row.hold_hours == null ? "—" : `${row.hold_hours}h`],
                ["Opened", when(row.created_at)],
                ["Closed", when(row.closed_at)],
                [
                  "BTC that day",
                  row.btc_change_pct == null
                    ? "—"
                    : `${row.btc_change_pct > 0 ? "+" : ""}${row.btc_change_pct}%`,
                ],
                ["Signals", row.signal_regime || "—"],
                ["Origin", row.is_bot === false ? "Hand trade" : "Agent"],
                ["Exit code", row.exit_reason || "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">{k}</p>
                  <p className="mt-0.5 text-[12px] text-text-secondary">{v}</p>
                </div>
              ))}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export const AutoTradeUserModal = ({ user, onClose }) => {
  const [detail, setDetail] = useState(null);
  const [trades, setTrades] = useState(null);
  const [error, setError] = useState("");
  const [since, setSince] = useState(TRACKING_RESET_AT);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState("overview");
  const [tradeQ, setTradeQ] = useState("");
  const [tradeVenue, setTradeVenue] = useState("all");
  const [tradeSide, setTradeSide] = useState("all");
  const [openTrade, setOpenTrade] = useState(null);
  const [openErr, setOpenErr] = useState(null);
  const [closing, setClosing] = useState(null);
  const [acks, setAcks] = useState([]);
  const [pdfBusy, setPdfBusy] = useState(null);
  const reload = () => setReloadKey((n) => n + 1);

  const userId = user?.luxquant_user_id;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!userId) return;
    let dead = false;
    Promise.all([
      adminApi.getAutoTradeUser(userId),
      adminApi.getAutoTradeTrades(userId, since),
      adminApi.getUserAgentAcks(userId).catch(() => ({ items: [] })),
    ])
      .then(([d, t, a]) => {
        if (dead) return;
        setDetail(d);
        setTrades(t);
        setAcks(a?.items || []);
      })
      .catch((e) => !dead && setError(e?.message || "Could not load"));
    return () => {
      dead = true;
    };
  }, [userId, since, reloadKey]);

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
  const venues = s.venues || [];
  const errors = detail?.errors || [];
  const groups = detail?.error_groups || [];
  const blocks = detail?.blocks || [];
  const positions = detail?.positions || [];
  const alerts = detail?.alerts || [];
  const activity = detail?.activity || [];

  const filteredTrades = useMemo(() => {
    const q = tradeQ.trim().toLowerCase();
    return (trades?.trades || []).filter((r) => {
      if (tradeVenue !== "all" && (r.venue || r.exchange) !== tradeVenue) return false;
      if (tradeSide === "win" && !(Number(r.realized_pnl) > 0)) return false;
      if (tradeSide === "loss" && !(Number(r.realized_pnl) < 0)) return false;
      if (!q) return true;
      return (
        String(r.symbol || "").toLowerCase().includes(q) ||
        String(r.exit_reason || "").toLowerCase().includes(q) ||
        String(r.venue || r.exchange || "").toLowerCase().includes(q)
      );
    });
  }, [trades, tradeQ, tradeVenue, tradeSide]);

  const tabCount = {
    venues: venues.filter((v) => v.connected).length,
    positions: positions.length,
    trades: ts.settled ?? trades?.trades?.length ?? 0,
    errors: errors.length,
    skips: blocks.length,
    agreements: acks.length,
  };

  const venuePnl = new Map((trades?.by_exchange || []).map((b) => [b.key, b]));

  return createPortal(
    <div
      className="lq-modal-safe lq-scrim-bg fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="lq-sheet isolate flex max-h-[min(var(--lq-modal-maxh),100%)] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl border border-ink/[0.08] shadow-2xl sm:max-h-[var(--lq-modal-maxh)] sm:rounded-2xl"
        style={{ backgroundColor: "rgb(var(--surface))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-0.5 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-ink/25" />
        </div>

        <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-ink/[0.08] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
              AGENT · BOT BREAKDOWN
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-[22px] font-semibold text-text-primary">{who(user, userId)}</h2>
              <StatusChip status={s.status || user?.status} recovered={s.errors_recovered} />
              <ModeChip summary={s} />
              {s.has_live_ack ? (
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(14,203,129,0.12)", color: UP }}>
                  Agreement signed
                </span>
              ) : s.has_account ? (
                <span className="rounded-full border border-ink/12 px-2 py-0.5 text-[11px] text-text-muted">
                  No live agreement
                </span>
              ) : null}
              {venues
                .filter((v) => v.connected)
                .map((v) => (
                  <span key={v.exchange} className="inline-flex" title={venueName(v.exchange)}>
                    <VenueLogo venue={v.exchange} className="h-5 w-5" />
                  </span>
                ))}
            </div>
            <p className="mt-1 text-[12px] text-text-muted">
              lq:{userId}
              {user?.role || s.role ? ` · ${user?.role || s.role}` : ""}
              {s.first_active_at ? ` · started ${day(s.first_active_at)}` : " · never started"}
              {s.markets?.length ? ` · ${s.markets.join(" + ")}` : ""}
              {s.leverage ? ` · ${s.leverage}×` : ""}
              {s.last_success_at ? ` · last fill ${ago(s.last_success_at)}` : ""}
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
              className="rounded-lg border border-ink/12 p-1.5 text-text-secondary hover:border-accent hover:text-accent"
              aria-label="Close"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-ink/[0.08] px-4 sm:px-6">
          {TABS.map(([id, label]) => {
            const n = tabCount[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`relative shrink-0 px-3 py-2.5 text-[12px] font-medium transition-colors ${
                  tab === id ? "text-text-primary" : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {label}
                {n ? (
                  <span className="ml-1.5 font-mono text-[10px] text-text-muted">{n}</span>
                ) : null}
                {tab === id ? (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          {error ? <p className="text-sm text-[#F6465D]">{error}</p> : null}
          {!detail && !error ? <p className="text-sm text-text-muted">Loading…</p> : null}
          {detail && !detail.linked ? (
            <div className="rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-10 text-center text-[13px] text-text-muted">
              This user has never connected an exchange to Agent.
            </div>
          ) : null}

          {detail && tab === "overview" ? (
            <>
              <Verdict summary={s} trades={trades} errors={errors} />

              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                <Kpi
                  label="Net PnL"
                  value={usd(ts.net ?? s.realized_pnl_total ?? 0)}
                  tone={(ts.net ?? 0) >= 0 ? UP : DOWN}
                  sub={ts.settled ? `${ts.settled} settled` : "no settled trades"}
                />
                <Kpi
                  label="Win rate"
                  value={ts.win_rate === null || ts.win_rate === undefined ? "—" : `${ts.win_rate}%`}
                  sub={`${ts.wins ?? 0}W / ${ts.losses ?? 0}L`}
                />
                <Kpi label="Won" value={usd(ts.gross_win ?? 0)} tone={UP} />
                <Kpi label="Lost" value={usd(ts.gross_loss ?? 0)} tone={DOWN} />
                <Kpi
                  label="Open now"
                  value={s.open_positions ?? 0}
                  sub={s.stuck_positions ? `${s.stuck_positions} stuck` : "none stuck"}
                  tone={s.stuck_positions ? DOWN : undefined}
                />
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

              {alerts.length ? (
                <div className="rounded-xl border border-[#F6465D]/30 bg-[#F6465D]/[0.06] px-4 py-3">
                  <p className="text-[12px] font-semibold text-text-primary">Open alerts</p>
                  <div className="mt-2 space-y-1.5">
                    {alerts.map((a) => (
                      <div key={a.alert_key} className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[12px] text-text-primary">{a.title || a.category}</p>
                          <p className="text-[11px] text-text-muted">{a.message}</p>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-text-muted">
                          ×{a.occurrence_count} · {ago(a.last_seen_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {venues.filter((v) => v.connected).length ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {venues
                    .filter((v) => v.connected)
                    .map((v) => {
                      const pnl = venuePnl.get(v.exchange) || {};
                      return (
                        <button
                          key={v.exchange}
                          type="button"
                          onClick={() => setTab("venues")}
                          className="rounded-xl border border-ink/[0.08] bg-surface-raised px-3 py-3 text-left hover:border-ink/20"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-2">
                              <VenueLogo venue={v.exchange} className="h-5 w-5" />
                              <span className="text-[13px] font-semibold text-text-primary">
                                {venueName(v.exchange)}
                              </span>
                            </span>
                            <span
                              className="font-mono text-[10px] uppercase tracking-wider"
                              style={{
                                color:
                                  v.key_status === "invalid"
                                    ? DOWN
                                    : v.is_active && v.dry_run === false
                                      ? UP
                                      : AXIS,
                              }}
                            >
                              {v.key_status === "invalid"
                                ? "bad key"
                                : v.is_active
                                  ? v.dry_run
                                    ? "dry-run"
                                    : "live"
                                  : "paused"}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[11px] text-text-muted">
                            {[v.spot_enabled && "spot", v.futures_enabled && "futures"]
                              .filter(Boolean)
                              .join(" + ") || "no market"}
                            {v.leverage ? ` · ${v.leverage}×` : ""}
                          </p>
                          <p
                            className="mt-1 text-[14px] font-semibold tabular-nums"
                            style={{
                              color:
                                pnl.net === undefined || pnl.net === null
                                  ? AXIS
                                  : pnl.net >= 0
                                    ? UP
                                    : DOWN,
                            }}
                          >
                            {pnl.trades ? usd(pnl.net) : "—"}
                            <span className="ml-2 text-[11px] font-normal text-text-muted">
                              {pnl.trades ? `${pnl.trades} trades` : "no settled trades"}
                            </span>
                          </p>
                        </button>
                      );
                    })}
                </div>
              ) : null}

              {trades?.btc_benchmark?.length ? (
                <div className="rounded-xl border border-ink/[0.08] bg-surface-raised">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/[0.06] px-4 py-3">
                    <p className="text-[12px] font-semibold text-text-primary">
                      Benchmark — this bot in each BTC condition
                    </p>
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

              {curve.length > 1 ? (
                <ChartFrame
                  title="Equity curve"
                  note="Cumulative realised PnL, oldest trade to newest. Above the line is profit."
                  height={220}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={curve} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                      <defs>
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
                                payload[0].payload.btc == null
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
                    note="Bars sit left or right of zero."
                    height={Math.max(160, bySymbol.length * 26)}
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
                                  [
                                    "Net",
                                    signed(payload[0].payload.pnl),
                                    payload[0].payload.pnl >= 0 ? UP : DOWN,
                                  ],
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
                ) : (
                  <div className="rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-8 text-center text-[12px] text-text-muted">
                    No settled trades in this window to split by coin.
                  </div>
                )}

                <div className="space-y-3">
                  {byExit.length ? (
                    <div className="rounded-xl border border-ink/[0.08] bg-surface-raised p-4">
                      <p className="text-[12px] font-semibold text-text-primary">How positions ended</p>
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

                  {activity.length ? (
                    <div className="rounded-xl border border-ink/[0.08] bg-surface-raised p-4">
                      <p className="text-[12px] font-semibold text-text-primary">Latest activity</p>
                      <div className="mt-2 max-h-[240px] space-y-1.5 overflow-y-auto">
                        {activity.slice(0, 12).map((ev, i) => (
                          <div
                            key={`${ev.created_at}-${i}`}
                            className="flex items-start justify-between gap-3 text-[11px]"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-text-secondary">
                                {(ev.action || "").replaceAll(".", " · ")}
                                {ev.symbol ? ` · ${ev.symbol}` : ""}
                                {ev.venue ? ` · ${venueName(ev.venue)}` : ""}
                              </p>
                              {ev.error ? (
                                <p className="mt-0.5 truncate font-mono text-[10px] text-text-muted">
                                  {ev.error}
                                </p>
                              ) : null}
                            </div>
                            <span className="shrink-0 tabular-nums text-text-muted">{ago(ev.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}

          {detail && tab === "venues" ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {venues.filter((v) => v.connected).length ? (
                venues
                  .filter((v) => v.connected)
                  .map((v) => {
                    const pnl = venuePnl.get(v.exchange) || {};
                    const venueErrors = errors.filter((e) => e.venue === v.exchange);
                    const venueBlocks = blocks.filter((b) => b.last_venue === v.exchange);
                    return (
                      <div
                        key={v.exchange}
                        className="rounded-xl border border-ink/[0.08] bg-surface-raised p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="inline-flex items-center gap-2">
                            <VenueLogo venue={v.exchange} className="h-7 w-7" />
                            <span>
                              <span className="block text-[15px] font-semibold text-text-primary">
                                {venueName(v.exchange)}
                              </span>
                              <span className="block text-[11px] text-text-muted">
                                key {v.key_status || "unknown"}
                                {s.key_checked_at ? ` · checked ${ago(s.key_checked_at)}` : ""}
                              </span>
                            </span>
                          </span>
                          <ModeChip
                            summary={{
                              is_active: v.is_active,
                              dry_run: v.dry_run,
                            }}
                          />
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <Kpi label="Net" value={pnl.trades ? usd(pnl.net) : "—"} tone={pnl.net >= 0 ? UP : DOWN} />
                          <Kpi label="Trades" value={pnl.trades ?? 0} sub={pnl.win_rate != null ? `${pnl.win_rate}% win` : ""} />
                          <Kpi
                            label="Errors 24h"
                            value={venueErrors.length}
                            tone={venueErrors.some((e) => !e.resolved) ? DOWN : venueErrors.length ? WARN : undefined}
                          />
                        </div>
                        <p className="mt-3 text-[12px] text-text-secondary">
                          {[v.spot_enabled && "Spot", v.futures_enabled && "Futures"].filter(Boolean).join(" + ") ||
                            "No market enabled"}
                          {v.leverage ? ` · ${v.leverage}× leverage` : ""}
                        </p>
                        {venueErrors[0] ? (
                          <p className="mt-2 font-mono text-[11px] leading-5 text-text-muted">
                            Last error {ago(venueErrors[0].created_at)}
                            {venueErrors[0].code ? ` · ${venueErrors[0].code}` : ""}
                            {venueErrors[0].symbol ? ` · ${venueErrors[0].symbol}` : ""}
                            {venueErrors[0].resolved ? " · recovered" : ""}
                          </p>
                        ) : null}
                        {venueBlocks[0] ? (
                          <p className="mt-1 text-[11px] text-text-muted">
                            Last skip {venueBlocks[0].code.replaceAll("_", " ")}
                            {venueBlocks[0].last_symbol ? ` · ${venueBlocks[0].last_symbol}` : ""} ·{" "}
                            {ago(venueBlocks[0].last_at)}
                          </p>
                        ) : null}
                      </div>
                    );
                  })
              ) : (
                <p className="text-[13px] text-text-muted">No exchange connected.</p>
              )}
            </div>
          ) : null}

          {detail && tab === "positions" ? (
            positions.length ? (
              <div className="overflow-x-auto rounded-xl border border-ink/[0.08] bg-surface-raised">
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr className="border-b border-ink/[0.08] font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
                      <th className="px-4 py-2 font-medium">Symbol</th>
                      <th className="px-2 py-2 font-medium">Venue</th>
                      <th className="px-2 py-2 font-medium">Side</th>
                      <th className="px-2 py-2 text-right font-medium">Qty</th>
                      <th className="px-2 py-2 text-right font-medium">Entry</th>
                      <th className="px-2 py-2 text-right font-medium">Notional</th>
                      <th className="px-2 py-2 font-medium">Opened</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => (
                      <tr key={p.position_id || `${p.symbol}-${p.created_at}`} className="border-b border-ink/[0.04] text-[12px]">
                        <td className="px-4 py-2 font-medium text-text-primary">{p.symbol}</td>
                        <td className="px-2 py-2">
                          <span className="inline-flex items-center gap-1.5">
                            <VenueLogo venue={p.venue} className="h-3.5 w-3.5" />
                            {venueName(p.venue)}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-text-secondary">
                          {p.side}
                          <span className="text-text-muted"> · {p.market_type}</span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{p.quantity}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{p.entry_price ?? "—"}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{p.notional == null ? "—" : usd(p.notional)}</td>
                        <td className="px-2 py-2 text-text-muted">{ago(p.created_at)}</td>
                        <td className="px-2 py-2">
                          {p.status === "reconciliation_required" ? (
                            <span className="font-semibold" style={{ color: DOWN }}>
                              needs reconciliation
                            </span>
                          ) : (
                            <span className="text-text-secondary">{p.is_bot === false ? "open (hand)" : "open"}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {p.position_id ? (
                            <button
                              type="button"
                              onClick={() => setClosing({ ...p, luxquant_user_id: userId })}
                              className="rounded-md border border-ink/[0.12] px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-ink/[0.05]"
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
            ) : (
              <div className="rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-10 text-center text-[13px] text-text-muted">
                No open positions.
              </div>
            )
          ) : null}

          {detail && tab === "trades" ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <SearchIcon
                    size={13}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                  />
                  <input
                    value={tradeQ}
                    onChange={(e) => setTradeQ(e.target.value)}
                    placeholder="Search symbol, venue, exit…"
                    className="w-full rounded-lg border border-ink/12 bg-surface-raised py-1.5 pl-8 pr-3 text-[12px] text-text-primary outline-none focus:border-accent"
                  />
                </div>
                <select
                  value={tradeVenue}
                  onChange={(e) => setTradeVenue(e.target.value)}
                  className="rounded-lg border border-ink/12 bg-surface-raised px-2 py-1.5 text-[12px] text-text-secondary"
                >
                  <option value="all">All venues</option>
                  {venues.filter((v) => v.connected).map((v) => (
                    <option key={v.exchange} value={v.exchange}>
                      {venueName(v.exchange)}
                    </option>
                  ))}
                </select>
                {[
                  ["all", "All"],
                  ["win", "Wins"],
                  ["loss", "Losses"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTradeSide(id)}
                    className={`rounded-full px-2.5 py-1 text-[11px] ${
                      tradeSide === id
                        ? "bg-accent text-surface-primary"
                        : "border border-ink/10 text-text-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <span className="ml-auto font-mono text-[11px] text-text-muted">
                  {filteredTrades.length} shown
                  {ts.unpriced ? ` · ${ts.unpriced} without a recorded price` : ""}
                </span>
              </div>
              {filteredTrades.length ? (
                <div className="overflow-hidden rounded-xl border border-ink/[0.08] bg-surface-raised">
                  <div className="max-h-[480px] overflow-auto">
                    <table className="w-full min-w-[780px] text-left">
                      <thead className="sticky top-0 bg-surface-raised">
                        <tr className="border-b border-ink/[0.08] font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
                          <th className="px-4 py-2 font-medium">Closed</th>
                          <th className="px-2 py-2 font-medium">Coin</th>
                          <th className="px-2 py-2 font-medium">Venue</th>
                          <th className="px-2 py-2 text-right font-medium">PnL</th>
                          <th className="px-2 py-2 text-right font-medium">Move</th>
                          <th className="px-2 py-2 font-medium">Exit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTrades.map((r, i) => (
                          <TradeRow
                            key={`${r.symbol}-${r.closed_at}-${i}`}
                            row={r}
                            open={openTrade === i}
                            onToggle={() => setOpenTrade((cur) => (cur === i ? null : i))}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="border-t border-ink/[0.06] px-4 py-2 text-[10px] text-text-muted">
                    Click a row for entry, exit, fees and hold time. Move is entry to exit.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-10 text-center text-[13px] text-text-muted">
                  No closed trades in this window.
                </div>
              )}
            </>
          ) : null}

          {detail && tab === "errors" ? (
            groups.length || errors.length ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full border border-ink/10 px-2.5 py-1 text-text-muted">
                    {errors.filter((e) => e.since_reset).length} since reset
                  </span>
                  <span className="rounded-full border border-ink/10 px-2.5 py-1 text-text-muted">
                    {errors.filter((e) => e.resolved).length} recovered
                  </span>
                  <span className="rounded-full border border-ink/10 px-2.5 py-1 text-text-muted">
                    {errors.filter((e) => !e.resolved).length} still open
                  </span>
                </div>
                {(groups.length ? groups : []).map((g, i) => (
                  <button
                    key={`${g.fingerprint}-${g.symbol}-${i}`}
                    type="button"
                    onClick={() => setOpenErr((cur) => (cur === i ? null : i))}
                    className={`w-full rounded-xl border px-4 py-3 text-left ${
                      g.resolved
                        ? "border-ink/[0.08] bg-surface-raised"
                        : "border-[#F6465D]/25 bg-[#F6465D]/[0.06]"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-semibold text-text-primary">
                          {g.code ? `${g.code} · ` : ""}
                          {g.symbol || "Execution"}
                          {g.venue ? ` · ${venueName(g.venue)}` : ""}
                        </p>
                        <p className="mt-0.5 text-[11px] text-text-muted">
                          ×{g.hits}
                          {g.resolved ? " · recovered" : " · still open"}
                          {g.since_reset ? ` · ${g.since_reset} since reset` : " · none since reset"}
                          {g.last_at ? ` · last ${ago(g.last_at)}` : ""}
                        </p>
                      </div>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          color: g.resolved ? WARN : DOWN,
                          background: g.resolved ? "rgba(240,185,11,0.12)" : "rgba(246,70,93,0.12)",
                        }}
                      >
                        {g.resolved ? "recovered" : "open"}
                      </span>
                    </div>
                    {openErr === i && g.sample ? (
                      <p className="mt-2 break-words font-mono text-[11px] leading-[1.5] text-text-secondary">
                        {g.sample}
                      </p>
                    ) : null}
                  </button>
                ))}
                <div className="space-y-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
                    Raw log
                  </p>
                  {errors.map((e, i) => (
                    <div
                      key={`${e.created_at}-${i}`}
                      className="rounded-lg border border-ink/[0.08] bg-surface-raised px-3 py-2"
                    >
                      <p className="text-[10px] text-text-muted">
                        {when(e.created_at)}
                        {e.symbol ? ` · ${e.symbol}` : ""}
                        {e.venue ? ` · ${venueName(e.venue)}` : ""}
                        {e.code ? ` · ${e.code}` : ""}
                        {e.since_reset ? " · since reset" : " · before reset"}
                        {e.resolved ? " · recovered" : ""}
                      </p>
                      <p className="mt-1 break-words font-mono text-[11px] leading-[1.5] text-text-secondary">
                        {e.error || e.action}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-10 text-center text-[13px] text-text-muted">
                No execution errors on record.
              </div>
            )
          ) : null}

          {detail && tab === "skips" ? (
            blocks.length ? (
              <div className="space-y-2">
                {blocks.map((b) => {
                  const help = RISK_HELP[b.code] || {
                    label: (b.code || "").replaceAll("_", " "),
                    hint: "",
                  };
                  return (
                    <div key={b.action} className="rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-semibold text-text-primary">{help.label}</p>
                          {help.hint ? <p className="mt-0.5 text-[11px] text-text-muted">{help.hint}</p> : null}
                          <p className="mt-1 text-[11px] text-text-muted">
                            Last {ago(b.last_at)}
                            {b.last_symbol ? ` · ${b.last_symbol}` : ""}
                            {b.last_venue ? ` · ${venueName(b.last_venue)}` : ""}
                          </p>
                        </div>
                        <span className="font-mono text-[12px] text-text-secondary">×{b.hits}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-10 text-center text-[13px] text-text-muted">
                No skipped entries in the last 7 days.
              </div>
            )
          ) : null}

          {detail && tab === "agreements" ? (
            acks.length ? (
              <div className="space-y-2">
                {acks.map((ack) => (
                  <div
                    key={ack.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-3"
                  >
                    <div>
                      <p className="text-[13px] font-semibold text-text-primary">
                        {ack.kind === "live" ? "Live trading agreement" : "Assistant disclaimer"}
                        <span className="ml-2 font-mono text-[10px] font-normal text-text-muted">
                          v{ack.version} · #{ack.id}
                        </span>
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-text-muted">
                        {when(ack.accepted_at)}
                        {ack.ip ? ` · IP ${ack.ip}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={pdfBusy === ack.id}
                      onClick={async () => {
                        setPdfBusy(ack.id);
                        try {
                          const blob = await adminApi.downloadUserAgentAckPdf(userId, ack.id);
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `luxquant-agent-${ack.kind}-${ack.id}.pdf`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } finally {
                          setPdfBusy(null);
                        }
                      }}
                      className="rounded-lg border border-ink/12 px-2.5 py-1.5 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
                    >
                      {pdfBusy === ack.id ? "Preparing…" : "Download PDF"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-10 text-center text-[13px] text-text-muted">
                No signed Agent form. This person has not accepted the live trading
                agreement, so they are not treated as a live Agent incident.
              </div>
            )
          ) : null}

          {detail && tab === "control" ? (
            <div className="space-y-4">
              <BotAccessControl
                userId={userId}
                blocked={Boolean(s.bot_access_blocked)}
                reason={s.bot_access_blocked_reason}
                blockedBy={s.bot_access_blocked_by}
                onChanged={reload}
              />
              <div className="rounded-xl border border-ink/[0.08] bg-surface-raised px-4 py-3 text-[12px] text-text-muted">
                <p className="inline-flex items-center gap-1.5 font-semibold text-text-primary">
                  <KeyIcon size={13} /> Read-only credentials
                </p>
                <p className="mt-1">
                  This console cannot see API keys. Switching the bot off only stops new live
                  entries. Open positions keep their take-profit and stop-loss.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ForceCloseModal
        position={closing}
        onClose={() => setClosing(null)}
        onDone={() => {
          setClosing(null);
          reload();
        }}
      />
    </div>,
    document.body
  );
};

export default AutoTradeUserModal;
