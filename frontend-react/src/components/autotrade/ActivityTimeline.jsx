// src/components/autotrade/ActivityTimeline.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — Agent · Activity tab (merged Activity + Logs)
// One compact view:
// • inline stat strip from execution jobs (completed / skipped /
// failed / reconciliation / running) — no big cards, no charts
// • a single operational timeline from the audit log, with the
// category filters that used to live on the Logs tab
// • consecutive repeated skip / risk-block events collapse into
// one expandable group so 80 identical rows read as one line
// • paginated (12 rows/page) so the page no longer runs forever
// ════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { Card, EmptyState, StatusBadge, StatusDot, fmtDateTime, fmtTime } from "./AutoTradeUI";
import EventExplainerModal from "./EventExplainerModal";

const FILTERS = [
  ["all", "All"],
  ["strategy", "Strategy"],
  ["execution", "Executions"],
  ["risk", "Risk"],
  ["position", "Positions"],
  ["account", "Connections"],
];

const PAGE_SIZE = 12;

// ────────────────────────────────────────────────────────────────
// Risk-limit reasons, in plain language.
// The engine only sends a code (execution.skip_risk_limit.<code>), so
// without this the timeline printed "reconciliation required" and left
// the user with no idea what to do about it.
// `blocking: true` marks the gates that stop *every* new entry until
// something is resolved, as opposed to a limit that simply held this
// one signal back.
// Keep the codes in sync with app/domains/execution/risk.py in cryptobot.
// ────────────────────────────────────────────────────────────────
const RISK_LIMIT_HELP = {
  telegram_not_connected: {
    label: "Telegram is not connected",
    blocking: true,
    hint: "Live trading needs a Telegram connection, because every warning about a missing stop-loss, a dead exchange key or a closing trade arrives there. Connect it from the alerts card and entries resume on the next signal. Dry-run is unaffected and positions you already hold are still managed.",
  },
  reconciliation_required: {
    label: "Position needs reconciliation",
    blocking: true,
    hint: "A position could not be matched against Binance, so every new entry is paused until it clears. This usually means the coin left your spot wallet outside the bot — a manual sell, convert or transfer, all of which cancel the protective OCO first. The reconciler now closes those automatically once it confirms the balance is gone; if it persists, contact support.",
  },
  subscription_inactive: {
    label: "LuxQuant subscription is not active",
    blocking: true,
    hint: "Live entries are paused until the subscription is renewed. Open positions are untouched — their take-profit and stop-loss keep running.",
  },
  max_open_positions: {
    label: "Max open positions reached",
    hint: "Raise the limit in Risk settings, or wait for an open position to close. Positions awaiting reconciliation count toward this limit too.",
  },
  symbol_position_exists: {
    label: "Already holding this symbol",
    hint: "One open position per symbol is enforced. Turn that off in Risk settings if you want to stack entries on the same coin.",
  },
  max_trade_notional: {
    label: "Trade size above your per-trade cap",
    hint: "Your Per-trade cap is below the size this signal needs. The live minimum is 5 USDT of margin, so a cap under that skips every signal. Raise the cap, or lower Amount.",
  },
  minimum_available_balance: {
    label: "Minimum reserve would be breached",
    hint: "The trade would leave less free USDT than your Minimum reserve. Top up USDT, lower Amount, or reduce the reserve.",
  },
  max_daily_trades: {
    label: "Daily trade limit reached",
    hint: "Resets at 00:00 UTC. Raise the limit in Risk settings if this is too tight.",
  },
  daily_loss_limit: {
    label: "Daily loss limit reached",
    blocking: true,
    hint: "Losses on trades Agent placed hit your limit, so trading is paused until 00:00 UTC. Trades you opened by hand are not counted. This is a guardrail working as intended — raise it only deliberately.",
  },
  loss_cooldown: {
    label: "Cooling down after a loss",
    hint: "A pause after a losing trade Agent placed — your own hand-trading does not trigger it. Shorten or disable it under Cooldown after loss.",
  },
  error_cooldown: {
    label: "Cooling down after a failed trade",
    hint: "Only trade failures trigger this — exchange bans and key errors are excluded so one infrastructure hiccup does not freeze your bot.",
  },
  max_live_bots: {
    label: "Server live-bot capacity reached",
    blocking: true,
    hint: "A platform-wide cap, not your setting. Wait for capacity, or run in dry-run meanwhile.",
  },
  user_order_throttle: {
    label: "Too many live orders in a short window",
    hint: "A per-account rate limit that protects the shared exchange IP. It clears on its own within a minute.",
  },
};

const usd = (value) => {
  const amount = Number(value);
  return `${amount < 0 ? "-" : ""}$${Math.abs(amount).toFixed(2)}`;
};

// The audit row carries the engine's numbers but not its sentence, so the
// live figures have to be rebuilt here. Keys match RiskDecision.metadata.
function riskLimitDetail(limitKey, metadata = {}) {
  const has = (key) => metadata[key] !== undefined && metadata[key] !== null;
  switch (limitKey) {
    case "max_open_positions":
      return has("open_positions") ? `${metadata.open_positions}/${metadata.limit} open` : null;
    case "max_daily_trades":
      return has("daily_trades") ? `${metadata.daily_trades}/${metadata.limit} today` : null;
    case "max_live_bots":
      return has("live_bots") ? `${metadata.live_bots}/${metadata.limit} live bots` : null;
    case "max_trade_notional":
      return has("notional") ? `${usd(metadata.notional)} vs ${usd(metadata.limit)} cap` : null;
    case "minimum_available_balance":
      return has("remaining")
        ? `would leave ${usd(metadata.remaining)}, reserve is ${usd(metadata.minimum_reserve)}`
        : null;
    case "daily_loss_limit":
      return has("realized_pnl_today")
        ? `${usd(metadata.realized_pnl_today)} today vs ${usd(metadata.limit)} limit`
        : null;
    case "loss_cooldown":
    case "error_cooldown":
      return has("cooldown_until") ? `until ${fmtTime(metadata.cooldown_until)}` : null;
    case "user_order_throttle":
      return has("retry_after_seconds") ? `retry in ~${metadata.retry_after_seconds}s` : null;
    default:
      return null;
  }
}

// Non-risk-limit skips. These carry their own metadata rather than a code, and
// the raw action name is actively misleading in the most common case: a user
// with no USDT was told "spot min notional", which reads as "raise your trade
// size" when the actual fix is to deposit.
function skipInfo(action, metadata = {}) {
  const num = (v) => (v === undefined || v === null ? null : Number(v));
  switch (action) {
    case "execution.skip_spot_min_notional": {
      const balance = num(metadata.balance);
      const required = num(metadata.required_quote);
      const configured = num(metadata.configured_quote);
      if (balance !== null && required !== null && required > balance) {
        return {
          label: "Not enough USDT",
          detail: `This entry needed ${usd(required)} and the spot wallet held ${usd(balance)}. Top up USDT — changing the trade size will not help.`,
        };
      }
      return {
        label: "Spot size too small for its stop order",
        detail: `${usd(configured)} was configured but the protective stop leg needs ${usd(required)}. Raise Amount to about ${usd(Math.ceil((required || 0) * 2))} for spot.`,
      };
    }
    case "execution.skip_missing_exchange_account":
      return {
        label: "No usable exchange key",
        detail:
          "This account has no working Binance key, so nothing can be placed. Either none was ever connected, or the key was revoked, lost its trading permission, or fell off the IP allow-list. Reconnect it — positions you already hold cannot be managed until you do.",
      };
    case "execution.skip_risk_level_filtered":
      return {
        label: "Risk level filtered out",
        detail: `Signal was ${metadata.signal_risk_level || "an excluded level"}; your filter allows ${(metadata.allowed_risk_levels || []).join(", ") || "nothing"}.`,
      };
    case "execution.skip_market_not_selected":
      return {
        label: "Market not enabled",
        detail: `This signal routes to ${metadata.market_type || "a market"}, which is switched off in your settings.`,
      };
    case "execution.skip_no_supported_market":
      return {
        label: "Coin not available on your markets",
        detail: `${metadata.symbol || "This coin"} is not listed on the market you have enabled.`,
      };
    case "execution.skip_price_outside_entry_window":
      return {
        label: "Price already past the entry",
        detail:
          metadata.reason === "price_at_stop_loss"
            ? "By the time the order could be placed the price had already reached the stop loss, so entering would have been an instant loss."
            : "The price had already passed the take-profit, so there was no move left to trade.",
      };
    case "execution.skip_leverage_cap":
      return {
        label: "Coin caps leverage below your setting",
        detail: `${metadata.symbol || "This coin"} allows at most ${metadata.symbol_max_leverage}×, you run ${metadata.requested_leverage}×, and your setting is to skip these.`,
      };
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────────
// Audit-event presentation (carried over from the old Logs tab)
// ────────────────────────────────────────────────────────────────
function eventInfo(item) {
  const action = item.action || "";
  const metadata = item.metadata || {};
  const context = item.context || {};
  const symbol = context.symbol || metadata.symbol;

  if (action === "strategy.auto_paused_after_live_entry") {
    return {
      category: "strategy",
      tone: "warn",
      title: "Strategy auto-paused after canary entry",
      description: `${symbol || "The first live order"} was accepted. The one-order canary guard paused new entries automatically.`,
      source: "System safety",
    };
  }
  if (action === "strategy.auto_resumed_after_convert") {
    return {
      category: "strategy",
      tone: "good",
      title: "Agent resumed after convert",
      description: `${metadata.submitted || 0} submitted · ${metadata.failed || 0} failed · ${metadata.skipped || 0} skipped`,
      source: "System safety",
    };
  }
  if (action === "strategy.emergency_paused") {
    return {
      category: "strategy",
      tone: "warn",
      title: "Agent paused for an emergency action",
      description:
        metadata.reason || "New entries were stopped before an emergency portfolio operation.",
      source: "Emergency controls",
    };
  }
  if (action === "strategy_config.active") {
    const active = metadata.active === true;
    return {
      category: "strategy",
      tone: active ? "good" : "warn",
      title: active ? "Agent started" : "Agent paused",
      description: active
        ? "The user enabled processing for new matching signals."
        : "The user paused processing for new matching signals.",
      source: "User action",
    };
  }
  if (action === "strategy_config.upsert") {
    return {
      category: "strategy",
      tone: "info",
      title: "Strategy settings saved",
      description: "Trading, exit, filter, or risk-limit configuration changed.",
      source: "User action",
    };
  }
  if (action === "execution.completed_live") {
    return {
      category: "execution",
      tone: "good",
      title: `${symbol || "Order"} executed live`,
      description: `${context.side || "Order"} · ${context.market_type || "market"} · completed`,
      source: "Execution engine",
    };
  }
  if (action === "execution.completed_dry_run") {
    return {
      category: "execution",
      tone: "info",
      title: `${symbol || "Order"} simulated`,
      description: "Execution completed without placing a Binance order.",
      source: "Execution engine",
    };
  }
  if (action === "execution.failed") {
    // surface Binance IP ban / rate limit clearly (HTTP 418 / -1003)
    const rawErr = String(metadata.error || "");
    const is418 = /HTTP 418|code['"]?\s*:\s*-1003|Way too many requests|IP\([^)]*\) banned/i.test(
      rawErr
    );
    return {
      category: "execution",
      tone: "bad",
      title: is418
        ? `${symbol || "Execution"} blocked — exchange rate limit (418)`
        : `${symbol || "Execution"} failed`,
      description: is418
        ? "Binance temporarily banned this VPS IP for too many REST calls. Wait for ban expiry or use websocket-backed price feeds; raise notional only after IP is clear."
        : rawErr || "The execution engine returned an error.",
      source: "Execution engine",
    };
  }
  if (action.startsWith("execution.skip_risk_limit.")) {
    const limitKey = action.split(".").at(-1);
    const help = RISK_LIMIT_HELP[limitKey];
    return {
      category: "risk",
      tone: help?.blocking ? "bad" : "warn",
      title: help?.blocking
        ? `All entries paused — ${help.label.toLowerCase()}`
        : `${symbol || "Entry"} blocked — ${help?.label?.toLowerCase() || limitKey.replaceAll("_", " ")}`,
      // Live figures first, then what to do about it.
      description:
        [riskLimitDetail(limitKey, metadata), help?.hint].filter(Boolean).join(" — ") ||
        limitKey.replaceAll("_", " "),
      source: "Risk engine",
      collapseKey: `risk:${limitKey}`,
      explainCode: limitKey,
    };
  }
  if (action.startsWith("execution.skip_")) {
    const info = skipInfo(action, metadata);
    return {
      category: "execution",
      tone: "warn",
      title: `${symbol || "Signal"} skipped — ${info?.label?.toLowerCase() || action.replace("execution.skip_", "").replaceAll("_", " ")}`,
      description: info?.detail || action.replace("execution.skip_", "").replaceAll("_", " "),
      source: "Execution engine",
      collapseKey: `skip:${action}`,
      explainCode: action,
    };
  }
  if (action.startsWith("position.")) {
    if (action === "position.forced_sell") {
      return {
        category: "position",
        tone: "warn",
        title: `${symbol || "Position"} force-sold`,
        description: `Market exit completed${metadata.exit_quote_usdt ? ` · received ${Number(metadata.exit_quote_usdt).toFixed(2)} USDT` : ""}.`,
        source: "Emergency controls",
      };
    }
    if (action === "position.forced_sell_failed") {
      return {
        category: "position",
        tone: "bad",
        title: `${symbol || "Position"} force-sell needs attention`,
        description:
          metadata.error || "The emergency exit did not complete and requires reconciliation.",
        source: "Emergency controls",
      };
    }
    if (action === "position.futures_settlement_failed") {
      return {
        category: "position",
        tone: "info",
        title: `${symbol || "Position"} close booked without venue PnL`,
        description:
          metadata.error ||
          "The exchange does not report income history to Agent. The position is already closed.",
        source: "Position reconciler",
        collapseKey: `settle-fail:${symbol || "x"}`,
      };
    }
    if (action === "position.reconciliation_resolved") {
      return {
        category: "position",
        tone: "good",
        title: `${symbol || "Position"} reconciliation resolved`,
        description: metadata.note || "The position was closed and new entries unblocked.",
        source: "Position reconciler",
      };
    }
    return {
      category: "position",
      tone: action.includes("reconciliation_required") ? "bad" : "info",
      title: `${symbol || "Position"} needs attention`,
      description: metadata.reason || action.replaceAll(".", " "),
      source: "Position reconciler",
    };
  }
  if (action === "portfolio.force_sell_all_completed") {
    return {
      category: "position",
      tone: Number(metadata.failure_count || 0) > 0 ? "bad" : "warn",
      title: "Emergency sell-all completed",
      description: `${metadata.success_count || 0} sold · ${metadata.failure_count || 0} need attention.`,
      source: "Emergency controls",
    };
  }
  if (action === "portfolio.asset_converted_to_usdt") {
    return {
      category: "account",
      tone: "good",
      title: `${metadata.asset || "Asset"} conversion submitted`,
      description: `${metadata.from_amount || 0} ${metadata.asset || ""} · estimated ${Number(metadata.estimated_usdt || 0).toFixed(2)} USDT.`,
      source: "Binance Convert",
    };
  }
  if (action === "portfolio.asset_conversion_failed") {
    return {
      category: "account",
      tone: "bad",
      title: `${metadata.asset || "Asset"} conversion failed`,
      description: metadata.reason || "Binance Convert rejected this asset.",
      source: "Binance Convert",
    };
  }
  if (action.startsWith("exchange_account.")) {
    return {
      category: "account",
      tone: metadata.valid === false ? "bad" : "good",
      title: action.endsWith("check") ? "Binance connection checked" : "Binance connection updated",
      description: "Exchange credentials or connectivity status changed.",
      source: "Connection manager",
    };
  }
  return {
    category: "execution",
    tone: "neutral",
    title: action.replaceAll(".", " ").replaceAll("_", " "),
    description: symbol ? `Related to ${symbol}.` : "Agent operational event.",
    source: "Agent",
  };
}

// ────────────────────────────────────────────────────────────────
// Collapse consecutive repeated skip / risk-block events
// ────────────────────────────────────────────────────────────────
const COLLAPSE_MIN_RUN = 3;

function buildRows(visible) {
  const rows = [];
  let index = 0;
  while (index < visible.length) {
    const item = visible[index];
    const key = item.presentation.collapseKey;
    if (key) {
      let end = index;
      while (end < visible.length && visible[end].presentation.collapseKey === key) {
        end += 1;
      }
      const run = visible.slice(index, end);
      if (run.length >= COLLAPSE_MIN_RUN) {
        rows.push({ type: "group", id: `group-${item.id}`, items: run });
        index = end;
        continue;
      }
    }
    rows.push({ type: "item", id: item.id, item });
    index += 1;
  }
  return rows;
}

function symbolsPreview(items) {
  const symbols = items
    .map((entry) => entry.context?.symbol || entry.metadata?.symbol || null)
    .filter(Boolean);
  const unique = [...new Set(symbols)];
  const head = unique.slice(0, 4).join(", ");
  return unique.length > 4 ? `${head} +${unique.length - 4} more` : head;
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

function EventRow({ item, selected, onSelect, onExplain }) {
  const open = selected === item.id;
  const toggle = () => onSelect(open ? null : item.id);
  return (
    // A div rather than a button: the expanded panel holds its own "Why did
    // this happen?" button, and a button inside a button is invalid.
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
      className="grid w-full cursor-pointer gap-1 px-4 py-3 text-left transition-colors hover:bg-ink/[0.02] md:grid-cols-[130px_1fr_140px] md:gap-3"
    >
      <span className="font-mono text-[11px] text-text-muted">{fmtDateTime(item.created_at)}</span>
      <span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{item.presentation.title}</span>
          <StatusBadge tone={item.presentation.tone}>{item.presentation.category}</StatusBadge>
          {item.inferred ? <StatusBadge tone="info">reconstructed</StatusBadge> : null}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-text-muted">
          {item.presentation.description}
        </span>
        {open ? (
          <>
            <span className="mt-2 block rounded border border-ink/[0.06] bg-scrim/20 p-3 font-mono text-[10px] leading-5 text-text-muted">
              Event: {item.action}
              <br />
              Source: {item.presentation.source}
              <br />
              Reference: {item.subject_id || "—"}
            </span>
            {item.presentation.explainCode ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onExplain?.(item.presentation.explainCode);
                }}
                className="mt-2 rounded-md border border-ink/[0.1] px-2.5 py-1 text-[11px] font-medium text-text hover:bg-ink/[0.04]"
              >
                Why did this happen?
              </button>
            ) : null}
          </>
        ) : null}
      </span>
      <span className="hidden font-mono text-[10px] uppercase tracking-wider text-text-muted md:block md:text-right">
        {item.presentation.source}
      </span>
    </div>
  );
}

function GroupRow({ group, expanded, onToggle, selected, onSelect, onExplain }) {
  const items = group.items;
  const first = items[0];
  const last = items[items.length - 1];
  const preview = symbolsPreview(items);
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full gap-1 px-4 py-3 text-left transition-colors hover:bg-ink/[0.02] md:grid-cols-[130px_1fr_140px] md:gap-3"
      >
        <span className="font-mono text-[11px] text-text-muted">
          {fmtTime(last.created_at)} – {fmtTime(first.created_at)}
        </span>
        <span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-text-primary">
              {items.length} signals · {first.presentation.description}
            </span>
            <StatusBadge tone={first.presentation.tone}>{first.presentation.category}</StatusBadge>
            <span className="font-mono text-[10px] text-text-muted">
              {expanded ? "▾ collapse" : "▸ expand"}
            </span>
          </span>
          {preview ? (
            <span className="mt-0.5 block truncate text-xs leading-5 text-text-muted">
              {preview}
            </span>
          ) : null}
        </span>
        <span className="hidden font-mono text-[10px] uppercase tracking-wider text-text-muted md:block md:text-right">
          {first.presentation.source}
        </span>
      </button>
      {expanded ? (
        <div className="divide-y divide-ink/[0.04] border-t border-ink/[0.05] bg-ink/[0.01]">
          {items.map((item) => (
            <EventRow key={item.id} item={item} selected={selected} onSelect={onSelect} onExplain={onExplain} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────
export default function ActivityTimeline({ executions = [], items = [] }) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [explaining, setExplaining] = useState(null);
  const [page, setPage] = useState(1);

  const stats = useMemo(() => {
    const completed = executions.filter((e) => e.status === "completed").length;
    const skipped = executions.filter((e) => e.status === "skipped").length;
    const failed = executions.filter((e) => e.status === "failed").length;
    const reconciliation = executions.filter((e) => e.status === "reconciliation_required").length;
    const running = executions.filter(
      (e) => e.status === "running" || e.status === "pending"
    ).length;
    return { completed, skipped, failed, reconciliation, running };
  }, [executions]);

  const enriched = useMemo(
    () => items.map((item) => ({ ...item, presentation: eventInfo(item) })),
    [items]
  );
  const visible = useMemo(
    () => enriched.filter((item) => filter === "all" || item.presentation.category === filter),
    [enriched, filter]
  );
  const rows = useMemo(() => buildRows(visible), [visible]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);
  const pagedRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const rangeStart = rows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, rows.length);

  const selectFilter = (id) => {
    setFilter(id);
    setPage(1);
  };

  if (items.length === 0 && executions.length === 0) {
    return (
      <EmptyState
        icon="A"
        title="No Agent activity yet"
        hint="Strategy changes, executions, risk blocks, and position incidents will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">Activity</p>
            <p className="mt-1 text-xs text-text-muted">
              Execution jobs and the operational audit trail in one timeline.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <StatusDot tone="good">
                Completed{" "}
                <span className="font-mono tabular-nums text-text-primary">{stats.completed}</span>
              </StatusDot>
              <StatusDot tone={stats.skipped > 0 ? "warn" : "neutral"}>
                Skipped{" "}
                <span className="font-mono tabular-nums text-text-primary">{stats.skipped}</span>
              </StatusDot>
              <StatusDot tone={stats.failed > 0 ? "bad" : "neutral"}>
                Failed{" "}
                <span className="font-mono tabular-nums text-text-primary">{stats.failed}</span>
              </StatusDot>
              <StatusDot tone={stats.reconciliation > 0 ? "info" : "neutral"}>
                Reconcile{" "}
                <span className="font-mono tabular-nums text-text-primary">
                  {stats.reconciliation}
                </span>
              </StatusDot>
              <StatusDot tone={stats.running > 0 ? "warn" : "neutral"}>
                Running{" "}
                <span className="font-mono tabular-nums text-text-primary">{stats.running}</span>
              </StatusDot>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 lg:justify-end">
            {FILTERS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => selectFilter(id)}
                className={`rounded-[3px] border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider ${
                  filter === id
                    ? "border-ink/35 bg-accent/12 text-accent"
                    : "border-ink/[0.07] text-text-muted hover:text-text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {visible.length === 0 ? (
        <EmptyState
          icon="A"
          title="Nothing in this category yet"
          hint="Try another filter — events will appear here as the engine works."
        />
      ) : (
        <>
          <Card padded={false}>
            <div className="divide-y divide-ink/[0.05]">
              {pagedRows.map((row) =>
                row.type === "group" ? (
                  <GroupRow
                    key={row.id}
                    group={row}
                    expanded={Boolean(expandedGroups[row.id])}
                    onToggle={() =>
                      setExpandedGroups((previous) => ({
                        ...previous,
                        [row.id]: !previous[row.id],
                      }))
                    }
                    selected={selected}
                    onSelect={setSelected}
                    onExplain={setExplaining}
                  />
                ) : (
                  <EventRow
                    key={row.id}
                    item={row.item}
                    selected={selected}
                    onSelect={setSelected}
                    onExplain={setExplaining}
                  />
                )
              )}
            </div>
          </Card>
          <Pager
            page={safePage}
            pageCount={pageCount}
            total={rows.length}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            onPage={setPage}
          />
        </>
      )}
      <EventExplainerModal code={explaining} onClose={() => setExplaining(null)} />
    </div>
  );
}
