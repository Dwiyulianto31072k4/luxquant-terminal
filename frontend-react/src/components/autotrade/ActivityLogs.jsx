import { useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  StatusBadge,
  fmtDateTime,
} from "./AutoTradeUI";

const FILTERS = [
  ["all", "All"],
  ["strategy", "Strategy"],
  ["execution", "Executions"],
  ["risk", "Risk"],
  ["position", "Positions"],
  ["account", "Connections"],
];

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
  if (action === "strategy.emergency_paused") {
    return {
      category: "strategy",
      tone: "warn",
      title: "AutoTrade paused for an emergency action",
      description:
        metadata.reason ||
        "New entries were stopped before an emergency portfolio operation.",
      source: "Emergency controls",
    };
  }
  if (action === "strategy_config.active") {
    const active = metadata.active === true;
    return {
      category: "strategy",
      tone: active ? "good" : "warn",
      title: active ? "AutoTrade started" : "AutoTrade paused",
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
    return {
      category: "execution",
      tone: "bad",
      title: `${symbol || "Execution"} failed`,
      description: metadata.error || "The execution engine returned an error.",
      source: "Execution engine",
    };
  }
  if (action.startsWith("execution.skip_risk_limit.")) {
    return {
      category: "risk",
      tone: "warn",
      title: `${symbol || "Entry"} blocked by risk limit`,
      description: action.split(".").at(-1).replaceAll("_", " "),
      source: "Risk engine",
    };
  }
  if (action.startsWith("execution.skip_")) {
    return {
      category: "execution",
      tone: "warn",
      title: `${symbol || "Signal"} skipped`,
      description: action.replace("execution.skip_", "").replaceAll("_", " "),
      source: "Execution engine",
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
          metadata.error ||
          "The emergency exit did not complete and requires reconciliation.",
        source: "Emergency controls",
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
      title: action.endsWith("check")
        ? "Binance connection checked"
        : "Binance connection updated",
      description: "Exchange credentials or connectivity status changed.",
      source: "Connection manager",
    };
  }
  return {
    category: "execution",
    tone: "neutral",
    title: action.replaceAll(".", " ").replaceAll("_", " "),
    description: symbol ? `Related to ${symbol}.` : "AutoTrade operational event.",
    source: "AutoTrade",
  };
}

export default function ActivityLogs({ items = [] }) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const enriched = useMemo(
    () => items.map((item) => ({ ...item, presentation: eventInfo(item) })),
    [items],
  );
  const visible = enriched.filter(
    (item) => filter === "all" || item.presentation.category === filter,
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon="L"
        title="No AutoTrade logs yet"
        hint="Strategy changes, executions, risk blocks, and position incidents will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary">
              Operational timeline
            </p>
            <p className="mt-1 text-xs text-text-muted">
              A readable audit trail of user actions and automatic safety decisions.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-[3px] border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider ${
                  filter === id
                    ? "border-gold-primary/35 bg-gold-primary/10 text-gold-primary"
                    : "border-white/[0.07] text-text-muted hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card padded={false}>
        <div className="divide-y divide-white/[0.05]">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(selected?.id === item.id ? null : item)}
              className="grid w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-white/[0.02] md:grid-cols-[145px_1fr_150px]"
            >
              <span className="font-mono text-[11px] text-text-muted">
                {fmtDateTime(item.created_at)}
              </span>
              <span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-white">
                    {item.presentation.title}
                  </span>
                  <StatusBadge tone={item.presentation.tone}>
                    {item.presentation.category}
                  </StatusBadge>
                  {item.inferred ? (
                    <StatusBadge tone="info">reconstructed</StatusBadge>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs leading-5 text-text-muted">
                  {item.presentation.description}
                </span>
                {selected?.id === item.id ? (
                  <span className="mt-3 block rounded border border-white/[0.06] bg-black/20 p-3 font-mono text-[10px] leading-5 text-text-muted">
                    Event: {item.action}
                    <br />
                    Source: {item.presentation.source}
                    <br />
                    Reference: {item.subject_id || "—"}
                  </span>
                ) : null}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted md:text-right">
                {item.presentation.source}
              </span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
