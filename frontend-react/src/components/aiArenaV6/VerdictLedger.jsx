// frontend-react/src/components/aiArenaV6/VerdictLedger.jsx
/**
 * VerdictLedger — Accuracy stats + verdict history table
 * ======================================================
 * THE killer feature of v6.
 *
 * Track record shape (from /v6/track-record):
 *   {
 *     window_days: 30,
 *     horizons: {                  ← NOT by_horizon
 *       "24h": { total, hit, miss, hit_rate },
 *       "72h": {...}, "7d": {...}, "30d": {...}
 *     },
 *     overall: { total, hit, miss, hit_rate }
 *   }
 *
 * Ledger shape (from /v6/ledger):
 *   {
 *     window_days, horizon_filter, count,
 *     items: [                     ← NOT reports
 *       {
 *         id, report_id, timestamp, btc_price, headline,
 *         primary_direction, primary_confidence,
 *         secondary_direction, tactical_direction,
 *         is_anomaly,
 *         outcomes: [
 *           { horizon, direction, price_at_horizon, move_pct, outcome, evaluated_at }
 *         ]
 *       }
 *     ]
 *   }
 *
 * Note field names use no horizon suffix in the ledger response,
 * unlike the DB (which has primary_direction_30d etc).
 */

import React, { useEffect, useMemo, useState } from "react";
import Tooltip from "./Tooltip";
import {
  directionStyle,
  outcomeStyle,
  formatTimestamp,
  formatPrice,
  HORIZON_ORDER,
  HORIZON_LABEL,
} from "./constants";

// ─────────────────────────────────────────────────────────────────────
// Sub-component: stat card per horizon
// ─────────────────────────────────────────────────────────────────────
function HorizonStatCard({ horizon, stats }) {
  const hitRate = stats?.hit_rate ?? null;
  const total = stats?.total ?? 0;
  const hits = stats?.hit ?? 0;       // /v6/track-record uses 'hit', not 'hits'
  const misses = stats?.miss ?? 0;    // 'miss', not 'misses'

  // Color tier based on hit rate
  let color = "#94a3b8"; // gray when no data
  let tier = "—";
  if (hitRate !== null && total >= 3) {
    if (hitRate >= 0.65) {
      color = "#22c55e";
      tier = "STRONG";
    } else if (hitRate >= 0.50) {
      color = "#f5c451";
      tier = "OK";
    } else {
      color = "#ef4444";
      tier = "WEAK";
    }
  } else if (total > 0 && total < 3) {
    color = "#94a3b8";
    tier = "LOW SAMPLE";
  }

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 hover:border-white/10 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono uppercase tracking-wider text-white/50">
          {HORIZON_LABEL[horizon] || horizon}
        </span>
        <span
          className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: `${color}20`,
            color,
          }}
        >
          {tier}
        </span>
      </div>

      {/* Big number: hit rate */}
      <div className="flex items-baseline gap-1 mb-2">
        <span
          className="text-3xl font-semibold tabular-nums"
          style={{
            fontFamily: "JetBrains Mono, monospace",
            color: hitRate !== null ? color : "rgba(255,255,255,0.3)",
          }}
        >
          {hitRate !== null ? (Number(hitRate) * 100).toFixed(0) : "—"}
        </span>
        <span className="text-base text-white/40 font-mono">%</span>
        <span className="text-xs text-white/40 font-mono ml-1">hit</span>
      </div>

      {/* Hit/miss bar */}
      {total > 0 ? (
        <>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden flex mb-2">
            {hits > 0 && (
              <div
                className="h-full"
                style={{
                  width: `${(hits / total) * 100}%`,
                  backgroundColor: "#22c55e",
                }}
              />
            )}
            {misses > 0 && (
              <div
                className="h-full"
                style={{
                  width: `${(misses / total) * 100}%`,
                  backgroundColor: "#ef4444",
                }}
              />
            )}
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-white/50">
            <span>
              <span className="text-emerald-400">{hits}</span>
              <span className="text-white/30"> / </span>
              <span className="text-red-400">{misses}</span>
            </span>
            <span>n={total}</span>
          </div>
        </>
      ) : (
        <div className="text-[11px] font-mono text-white/30 italic">
          No verdicts evaluated yet
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-component: outcome badge for a horizon
// ─────────────────────────────────────────────────────────────────────
function outcomeExplanation(outcome) {
  const move = Number(outcome.move_pct);
  const hasMove = Number.isFinite(move);
  const threshold = Number(outcome.threshold_pct ?? 1);
  const neutralBand = Number(outcome.neutral_band_pct ?? 2);
  const direction = String(outcome.direction || "").toLowerCase();

  if (direction === "neutral") {
    if (!hasMove) return `Neutral is a hit only inside ±${neutralBand.toFixed(1)}%.`;
    const side = move > 0 ? "above" : "below";
    const result = outcome.outcome === "miss" ? "MISS" : "HIT";
    return `Neutral rule: final move must stay inside ±${neutralBand.toFixed(1)}%. BTC finished ${Math.abs(move).toFixed(2)}% ${side} the call price: ${result}.`;
  }

  if (direction === "bullish") {
    return `Bullish rule: final move must reach +${threshold.toFixed(1)}% or more.`;
  }

  if (direction === "bearish") {
    return `Bearish rule: final move must reach -${threshold.toFixed(1)}% or less.`;
  }

  return "Outcome rule unavailable.";
}

function OutcomeBadge({ outcome }) {
  if (!outcome) {
    return <span className="text-white/20 text-xs font-mono">—</span>;
  }

  const style = outcomeStyle(outcome.outcome);

  return (
    <span
      className="inline-flex items-center justify-center w-7 h-5 rounded text-[10px] font-mono uppercase font-bold"
      style={{
        backgroundColor: style.bg,
        color: style.fg,
        border: `1px solid ${style.border}`,
      }}
      title={`${outcome.direction} @ ${outcome.horizon}` +
        (outcome.move_pct != null
          ? ` · move ${outcome.move_pct > 0 ? "+" : ""}${Number(outcome.move_pct).toFixed(2)}%`
          : "") +
        ` · ${outcomeExplanation(outcome)}`}
    >
      {style.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-component: history table row
// ─────────────────────────────────────────────────────────────────────
function HistoryRow({ item }) {
  // Group outcomes by horizon for ordered rendering
  const outcomesByHorizon = useMemo(() => {
    const map = {};
    if (item.outcomes) {
      item.outcomes.forEach((o) => {
        map[o.horizon] = o;
      });
    }
    return map;
  }, [item.outcomes]);

  const primaryDir = directionStyle(item.primary_direction);
  const secondaryDir = directionStyle(item.secondary_direction);
  const tacticalDir = directionStyle(item.tactical_direction);

  return (
    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
      {/* Timestamp */}
      <td className="py-2.5 px-3 text-xs font-mono text-white/60 whitespace-nowrap">
        {formatTimestamp(item.timestamp)}
      </td>

      {/* BTC price */}
      <td className="py-2.5 px-3 text-xs font-mono text-white/80 tabular-nums whitespace-nowrap">
        {formatPrice(item.btc_price)}
      </td>

      {/* 30d primary verdict */}
      <td className="py-2.5 px-3 whitespace-nowrap">
        <span
          className="inline-flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded"
          style={{ backgroundColor: primaryDir.bg, color: primaryDir.fg }}
        >
          {primaryDir.arrow} {item.primary_confidence ?? "—"}%
        </span>
      </td>

      {/* 7d secondary verdict (no confidence in ledger response) */}
      <td className="py-2.5 px-3 whitespace-nowrap">
        <span
          className="inline-flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded"
          style={{ backgroundColor: secondaryDir.bg, color: secondaryDir.fg }}
        >
          {secondaryDir.arrow}
        </span>
      </td>

      {/* 24h tactical verdict */}
      <td className="py-2.5 px-3 whitespace-nowrap">
        <span
          className="inline-flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded"
          style={{ backgroundColor: tacticalDir.bg, color: tacticalDir.fg }}
        >
          {tacticalDir.arrow}
        </span>
      </td>

      {/* Outcomes per horizon */}
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-1">
          {HORIZON_ORDER.map((h) => (
            <OutcomeBadge key={h} outcome={outcomesByHorizon[h]} />
          ))}
        </div>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────
function isResolved(outcome) {
  return outcome?.outcome === "hit" || outcome?.outcome === "miss";
}

function buildScopedTrackRecord(items, windowLabel = "today") {
  const horizons = HORIZON_ORDER.reduce((acc, horizon) => {
    acc[horizon] = { total: 0, hit: 0, miss: 0, hit_rate: null };
    return acc;
  }, {});

  items.forEach((item) => {
    (item.outcomes || []).forEach((outcome) => {
      if (!horizons[outcome.horizon] || !isResolved(outcome)) return;
      horizons[outcome.horizon].total += 1;
      horizons[outcome.horizon][outcome.outcome] += 1;
    });
  });

  Object.values(horizons).forEach((stats) => {
    stats.hit_rate = stats.total > 0 ? stats.hit / stats.total : null;
  });

  const overall = Object.values(horizons).reduce(
    (acc, stats) => {
      acc.total += stats.total;
      acc.hit += stats.hit;
      acc.miss += stats.miss;
      return acc;
    },
    { total: 0, hit: 0, miss: 0, hit_rate: null },
  );
  overall.hit_rate = overall.total > 0 ? overall.hit / overall.total : null;

  return {
    window_days: null,
    window_label: windowLabel,
    horizons,
    overall,
  };
}

function scopedItems(items, sinceValue) {
  if (!sinceValue) return items;
  const since = new Date(sinceValue);
  if (Number.isNaN(since.getTime())) return items;
  return items.filter((item) => {
    const timestamp = new Date(item.timestamp);
    return !Number.isNaN(timestamp.getTime()) && timestamp >= since;
  });
}

function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

const AUDIT_WINDOWS = [
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "all", label: "All retained", days: null },
];

function auditWindowSince(windowKey) {
  if (windowKey === "today") return startOfTodayIso();
  const window = AUDIT_WINDOWS.find((item) => item.key === windowKey);
  if (!window?.days) return null;
  return new Date(Date.now() - window.days * 24 * 60 * 60 * 1000).toISOString();
}

export default function VerdictLedger({ ledger, pageSize = 8 }) {
  const [filter, setFilter] = useState("all"); // all | hit | miss | pending
  const [auditWindow, setAuditWindow] = useState("all");
  const [page, setPage] = useState(1);

  const items = ledger?.items || [];
  const todayItems = useMemo(
    () => scopedItems(items, startOfTodayIso()),
    [items],
  );
  const todayTrackRecord = useMemo(
    () => buildScopedTrackRecord(todayItems, "Today"),
    [todayItems],
  );
  const auditItems = useMemo(
    () => scopedItems(items, auditWindowSince(auditWindow)),
    [auditWindow, items],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return auditItems;
    return auditItems.filter((it) => {
      if (!it.outcomes) return false;
      return it.outcomes.some((outcome) => outcome.outcome === filter);
    });
  }, [auditItems, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const startIndex = (page - 1) * pageSize;
  const visibleRows = filtered.slice(startIndex, startIndex + pageSize);
  const firstVisible = filtered.length ? startIndex + 1 : 0;
  const lastVisible = Math.min(startIndex + pageSize, filtered.length);
  const totalEvaluated = todayTrackRecord.overall.total;
  const hasAnyEvaluated = totalEvaluated > 0;
  const auditWindowLabel =
    AUDIT_WINDOWS.find((item) => item.key === auditWindow)?.label ||
    "All retained";

  useEffect(() => {
    setPage(1);
  }, [filter, auditWindow, items.length]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <section className="mb-8 rounded-2xl border border-white/[0.08] bg-[#0d0d12]/80 p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
            Evaluation
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <h2
              className="text-2xl text-white/90"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 500,
                letterSpacing: "-0.02em",
              }}
            >
              Compass Track Record
            </h2>
            <span className="rounded-full border border-[#d4a853]/20 bg-[#d4a853]/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-[#f5c451]">
              Today scorecard
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-white/40">
            The scorecard resets at the start of each day. It does not remove earlier Compass reads: the retained audit ledger below stays available for review.
          </p>
        </div>
        <Tooltip termKey="verdict-evaluation">
          <span className="cursor-help border-b border-dotted border-white/20 font-mono text-xs text-white/40">
            How is this judged?
          </span>
        </Tooltip>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {HORIZON_ORDER.map((horizon) => (
          <HorizonStatCard
            key={horizon}
            horizon={horizon}
            stats={todayTrackRecord.horizons[horizon]}
          />
        ))}
      </div>

      {!hasAnyEvaluated && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#d4a853]/15 bg-[#d4a853]/[0.04] p-4">
          <span className="shrink-0 text-base text-[#d4a853]">•</span>
          <div>
            <div className="mb-1 text-sm text-white/80">Today is still warming up</div>
            <p className="text-xs leading-relaxed text-white/50">
              No verdict from today has completed its horizon yet. Earlier resolved reads remain available in Audit history below, while today&apos;s 24h outcomes begin resolving after their horizon ends.
            </p>
          </div>
        </div>
      )}

      <div className="mb-3 grid gap-2 rounded-xl border border-white/[0.06] bg-black/15 p-3 text-[11px] leading-relaxed text-white/55 md:grid-cols-3">
        <div><span className="font-mono text-[#8ee5b7]">BULLISH HIT</span> at +1.0% or more</div>
        <div><span className="font-mono text-[#ff9a9a]">BEARISH HIT</span> at -1.0% or less</div>
        <div><span className="font-mono text-[#cbd5e1]">NEUTRAL HIT</span> only inside ±2.0%</div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/5 bg-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-3 py-3">
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-white/50">
              Audit history · {filtered.length} reads
            </span>
            <div className="mt-0.5 text-[10px] font-mono text-white/30">
              {auditWindowLabel} · showing {firstVisible}-{lastVisible} of {filtered.length}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            {AUDIT_WINDOWS.map((window) => (
              <button
                key={window.key}
                type="button"
                onClick={() => setAuditWindow(window.key)}
                className={`rounded px-2 py-1 text-[11px] font-mono transition-colors ${
                  auditWindow === window.key
                    ? "bg-[#d4a853]/15 text-[#f5c451]"
                    : "text-white/50 hover:bg-white/5 hover:text-white/80"
                }`}
              >
                {window.label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-white/10" aria-hidden="true" />
            {[
              { key: "all", label: "All" },
              { key: "hit", label: "Hits" },
              { key: "miss", label: "Misses" },
              { key: "pending", label: "Pending" },
            ].map((outcomeFilter) => (
              <button
                key={outcomeFilter.key}
                type="button"
                onClick={() => setFilter(outcomeFilter.key)}
                className={`rounded px-2 py-1 text-[11px] font-mono transition-colors ${
                  filter === outcomeFilter.key
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:bg-white/5 hover:text-white/80"
                }`}
              >
                {outcomeFilter.label}
              </button>
            ))}
          </div>
        </div>

        {visibleRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-white/40">When</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-white/40">BTC</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-white/40">30d</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-white/40">7d</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-white/40">24h</th>
                  <th className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-white/40">Outcomes (24h/72h/7d/30d)</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((item) => (
                  <HistoryRow key={item.id || item.report_id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-sm italic text-white/40">
              {filter === "all"
                ? "No Compass reads in this audit window"
                : `No ${filter} reads in this audit window`}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 px-3 py-3">
          <p className="text-[11px] font-mono leading-relaxed text-white/30">
            Daily scorecards reset. Audit history does not. Use this ledger to verify how prior Compass reads resolved after each horizon, not to decide a new trade.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.12em] text-white/50 hover:bg-white/[0.06] disabled:opacity-30"
            >
              Prev
            </button>
            <span className="text-[11px] font-mono text-white/40">Page {page} / {pageCount}</span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.12em] text-white/50 hover:bg-white/[0.06] disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
