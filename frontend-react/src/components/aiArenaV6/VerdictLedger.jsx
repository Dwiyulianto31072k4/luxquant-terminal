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
      title={
        `${outcome.direction} @ ${outcome.horizon}` +
        (outcome.move_pct != null
          ? ` · move ${outcome.move_pct > 0 ? "+" : ""}${Number(
              outcome.move_pct
            ).toFixed(2)}%`
          : "")
      }
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

function scopedItems(items, resetSince) {
  if (!resetSince) return items;
  const since = new Date(resetSince);
  if (Number.isNaN(since.getTime())) return items;
  return items.filter((item) => {
    const timestamp = new Date(item.timestamp);
    return !Number.isNaN(timestamp.getTime()) && timestamp >= since;
  });
}

export default function VerdictLedger({
  trackRecord,
  ledger,
  resetSince = null,
  resetLabel = "track record",
  pageSize = 8,
}) {
  const [filter, setFilter] = useState("all"); // all | hit | miss | pending
  const [page, setPage] = useState(1);

  const items = ledger?.items || [];
  const scoped = useMemo(() => scopedItems(items, resetSince), [items, resetSince]);
  const effectiveTrackRecord = useMemo(
    () => (resetSince ? buildScopedTrackRecord(scoped, resetLabel) : trackRecord),
    [resetSince, resetLabel, scoped, trackRecord],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return scoped;
    return scoped.filter((it) => {
      if (!it.outcomes) return false;
      return it.outcomes.some((o) => o.outcome === filter);
    });
  }, [scoped, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const startIndex = (page - 1) * pageSize;
  const visibleRows = filtered.slice(startIndex, startIndex + pageSize);
  const firstVisible = filtered.length ? startIndex + 1 : 0;
  const lastVisible = Math.min(startIndex + pageSize, filtered.length);
  const totalEvaluated = effectiveTrackRecord?.overall?.total ?? 0;
  const hasAnyEvaluated = totalEvaluated > 0;
  const windowText = resetSince
    ? resetLabel
    : effectiveTrackRecord?.window_days
      ? `last ${effectiveTrackRecord.window_days}d`
      : "track record";

  useEffect(() => {
    setPage(1);
  }, [filter, resetSince, items.length]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <section className="mb-8 rounded-2xl border border-white/[0.08] bg-[#0d0d12]/80 p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
      {/* Header */}
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
              {windowText}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-white/40">
            Reset view starts from today. Older outcomes are kept in the database for audit, but this scorecard begins clean from the reset window.
          </p>
        </div>
        <Tooltip termKey="confluence">
          <span className="text-xs text-white/40 font-mono cursor-help border-b border-dotted border-white/20">
            How is this judged?
          </span>
        </Tooltip>
      </div>

      {/* Track record stats — 4 horizon cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {HORIZON_ORDER.map((h) => (
          <HorizonStatCard
            key={h}
            horizon={h}
            stats={effectiveTrackRecord?.horizons?.[h]}
          />
        ))}
      </div>

      {/* Empty state if no reads evaluated yet */}
      {!hasAnyEvaluated && (
        <div className="rounded-xl border border-[#d4a853]/15 bg-[#d4a853]/[0.04] p-4 mb-5 flex items-start gap-3">
          <span className="text-base shrink-0 text-[#d4a853]">•</span>
          <div>
            <div className="text-sm text-white/80 mb-1">
              Fresh reset is warming up
            </div>
            <p className="text-xs text-white/50 leading-relaxed">
              Today has no completed hit/miss outcomes yet. Pending rows can already appear below, then 24h outcomes will start resolving after their horizon ends.
            </p>
          </div>
        </div>
      )}

      {/* History table */}
      <div className="rounded-xl border border-white/5 bg-black/20 overflow-hidden">
        {/* Table header with filter pills */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 flex-wrap gap-2">
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-white/50">
              Evaluation table · {filtered.length} reads
            </span>
            <div className="mt-0.5 text-[10px] font-mono text-white/30">
              Showing {firstVisible}-{lastVisible} of {filtered.length}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {[
              { key: "all", label: "All" },
              { key: "hit", label: "Hits" },
              { key: "miss", label: "Misses" },
              { key: "pending", label: "Pending" },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`text-[11px] font-mono px-2 py-1 rounded transition-colors ${
                  filter === f.key
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white/80 hover:bg-white/5"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table body */}
        {visibleRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="text-left py-2 px-3 text-[10px] font-mono uppercase tracking-wider text-white/40">
                    When
                  </th>
                  <th className="text-left py-2 px-3 text-[10px] font-mono uppercase tracking-wider text-white/40">
                    BTC
                  </th>
                  <th className="text-left py-2 px-3 text-[10px] font-mono uppercase tracking-wider text-white/40">
                    30d
                  </th>
                  <th className="text-left py-2 px-3 text-[10px] font-mono uppercase tracking-wider text-white/40">
                    7d
                  </th>
                  <th className="text-left py-2 px-3 text-[10px] font-mono uppercase tracking-wider text-white/40">
                    24h
                  </th>
                  <th className="text-left py-2 px-3 text-[10px] font-mono uppercase tracking-wider text-white/40">
                    Outcomes (24h/72h/7d/30d)
                  </th>
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
            <p className="text-white/40 text-sm italic">
              {filter === "all"
                ? "No evaluated reads in this reset window"
                : `No ${filter} reads in this reset window`}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 px-3 py-3">
          <p className="text-[11px] text-white/30 font-mono leading-relaxed">
            This is the accountability layer. It tells you whether previous reads resolved correctly after their horizon, not what to trade right now.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.12em] text-white/50 disabled:opacity-30 hover:bg-white/[0.06]"
            >
              Prev
            </button>
            <span className="text-[11px] font-mono text-white/40">
              Page {page} / {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.12em] text-white/50 disabled:opacity-30 hover:bg-white/[0.06]"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
