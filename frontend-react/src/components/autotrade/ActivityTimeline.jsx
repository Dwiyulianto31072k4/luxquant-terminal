// src/components/autotrade/ActivityTimeline.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade · Activity tab (merged Activity + Logs)
// One compact view:
//   • inline stat strip from execution jobs (completed / skipped /
//     failed / reconciliation / running) — no big cards, no charts
//   • a single operational timeline from the audit log, with the
//     category filters that used to live on the Logs tab
//   • consecutive repeated skip / risk-block events collapse into
//     one expandable group so 80 identical rows read as one line
//   • paginated (12 rows/page) so the page no longer runs forever
// ════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  StatusBadge,
  StatusDot,
  fmtDateTime,
  fmtTime,
} from "./AutoTradeUI";

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
      title: "AutoTrade resumed after convert",
      description: `${metadata.submitted || 0} submitted · ${metadata.failed || 0} failed · ${metadata.skipped || 0} skipped`,
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
      collapseKey: `risk:${action.split(".").at(-1)}`,
    };
  }
  if (action.startsWith("execution.skip_")) {
    return {
      category: "execution",
      tone: "warn",
      title: `${symbol || "Signal"} skipped`,
      description: action.replace("execution.skip_", "").replaceAll("_", " "),
      source: "Execution engine",
      collapseKey: `skip:${action}`,
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
    if (action === "position.reconciliation_resolved") {
      return {
        category: "position",
        tone: "good",
        title: `${symbol || "Position"} reconciliation resolved`,
        description:
          metadata.note || "The position was closed and new entries unblocked.",
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
      while (
        end < visible.length &&
        visible[end].presentation.collapseKey === key
      ) {
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
    .map(
      (entry) =>
        entry.context?.symbol || entry.metadata?.symbol || null,
    )
    .filter(Boolean);
  const unique = [...new Set(symbols)];
  const head = unique.slice(0, 4).join(", ");
  return unique.length > 4 ? `${head} +${unique.length - 4} more` : head;
}

function Pager({ page, pageCount, total, rangeStart, rangeEnd, onPage }) {
  if (pageCount <= 1) return null;
  const btn =
    "rounded-md border border-white/[0.1] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-secondary transition-colors hover:border-gold-primary/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-white/[0.1] disabled:hover:text-text-secondary";
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
        <button type="button" className={btn} disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

function EventRow({ item, selected, onSelect }) {
  const open = selected === item.id;
  return (
    <button
      type="button"
      onClick={() => onSelect(open ? null : item.id)}
      className="grid w-full gap-1 px-4 py-3 text-left transition-colors hover:bg-white/[0.02] md:grid-cols-[130px_1fr_140px] md:gap-3"
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
        <span className="mt-0.5 block text-xs leading-5 text-text-muted">
          {item.presentation.description}
        </span>
        {open ? (
          <span className="mt-2 block rounded border border-white/[0.06] bg-black/20 p-3 font-mono text-[10px] leading-5 text-text-muted">
            Event: {item.action}
            <br />
            Source: {item.presentation.source}
            <br />
            Reference: {item.subject_id || "—"}
          </span>
        ) : null}
      </span>
      <span className="hidden font-mono text-[10px] uppercase tracking-wider text-text-muted md:block md:text-right">
        {item.presentation.source}
      </span>
    </button>
  );
}

function GroupRow({ group, expanded, onToggle, selected, onSelect }) {
  const items = group.items;
  const first = items[0];
  const last = items[items.length - 1];
  const preview = symbolsPreview(items);
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full gap-1 px-4 py-3 text-left transition-colors hover:bg-white/[0.02] md:grid-cols-[130px_1fr_140px] md:gap-3"
      >
        <span className="font-mono text-[11px] text-text-muted">
          {fmtTime(last.created_at)} – {fmtTime(first.created_at)}
        </span>
        <span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-white">
              {items.length} signals · {first.presentation.description}
            </span>
            <StatusBadge tone={first.presentation.tone}>
              {first.presentation.category}
            </StatusBadge>
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
        <div className="divide-y divide-white/[0.04] border-t border-white/[0.05] bg-white/[0.01]">
          {items.map((item) => (
            <EventRow
              key={item.id}
              item={item}
              selected={selected}
              onSelect={onSelect}
            />
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
  const [page, setPage] = useState(1);

  const stats = useMemo(() => {
    const completed = executions.filter((e) => e.status === "completed").length;
    const skipped = executions.filter((e) => e.status === "skipped").length;
    const failed = executions.filter((e) => e.status === "failed").length;
    const reconciliation = executions.filter(
      (e) => e.status === "reconciliation_required",
    ).length;
    const running = executions.filter(
      (e) => e.status === "running" || e.status === "pending",
    ).length;
    return { completed, skipped, failed, reconciliation, running };
  }, [executions]);

  const enriched = useMemo(
    () => items.map((item) => ({ ...item, presentation: eventInfo(item) })),
    [items],
  );
  const visible = useMemo(
    () =>
      enriched.filter(
        (item) => filter === "all" || item.presentation.category === filter,
      ),
    [enriched, filter],
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
        title="No AutoTrade activity yet"
        hint="Strategy changes, executions, risk blocks, and position incidents will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary">
              Activity
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Execution jobs and the operational audit trail in one timeline.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <StatusDot tone="good">
                Completed{" "}
                <span className="font-mono tabular-nums text-white">
                  {stats.completed}
                </span>
              </StatusDot>
              <StatusDot tone={stats.skipped > 0 ? "warn" : "neutral"}>
                Skipped{" "}
                <span className="font-mono tabular-nums text-white">
                  {stats.skipped}
                </span>
              </StatusDot>
              <StatusDot tone={stats.failed > 0 ? "bad" : "neutral"}>
                Failed{" "}
                <span className="font-mono tabular-nums text-white">
                  {stats.failed}
                </span>
              </StatusDot>
              <StatusDot tone={stats.reconciliation > 0 ? "info" : "neutral"}>
                Reconcile{" "}
                <span className="font-mono tabular-nums text-white">
                  {stats.reconciliation}
                </span>
              </StatusDot>
              <StatusDot tone={stats.running > 0 ? "warn" : "neutral"}>
                Running{" "}
                <span className="font-mono tabular-nums text-white">
                  {stats.running}
                </span>
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

      {visible.length === 0 ? (
        <EmptyState
          icon="A"
          title="Nothing in this category yet"
          hint="Try another filter — events will appear here as the engine works."
        />
      ) : (
        <>
          <Card padded={false}>
            <div className="divide-y divide-white/[0.05]">
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
                  />
                ) : (
                  <EventRow
                    key={row.id}
                    item={row.item}
                    selected={selected}
                    onSelect={setSelected}
                  />
                ),
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
    </div>
  );
}
