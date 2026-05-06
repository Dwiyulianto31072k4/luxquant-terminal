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

import React, { useState, useMemo } from "react";
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
export default function VerdictLedger({ trackRecord, ledger }) {
  const [filter, setFilter] = useState("all"); // all | hit | miss | pending

  const items = ledger?.items || [];

  // Filter items if needed
  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((it) => {
      if (!it.outcomes) return false;
      return it.outcomes.some((o) => o.outcome === filter);
    });
  }, [items, filter]);

  const totalEvaluated = trackRecord?.overall?.total ?? 0;
  const hasAnyEvaluated = totalEvaluated > 0;

  return (
    <section className="mb-8">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <h2
            className="text-2xl text-white/90"
            style={{
              fontFamily: "Fraunces, serif",
              fontWeight: 500,
              letterSpacing: "-0.02em",
            }}
          >
            Verdict Ledger
          </h2>
          <span className="text-xs font-mono text-white/40">
            {trackRecord?.window_days
              ? `last ${trackRecord.window_days}d`
              : "track record"}
          </span>
        </div>
        <Tooltip termKey="confluence">
          <span className="text-xs text-white/40 font-mono cursor-help border-b border-dotted border-white/20">
            How is this measured?
          </span>
        </Tooltip>
      </div>

      {/* Track record stats — 4 horizon cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {HORIZON_ORDER.map((h) => (
          <HorizonStatCard
            key={h}
            horizon={h}
            stats={trackRecord?.horizons?.[h]}
          />
        ))}
      </div>

      {/* Empty state if no verdicts evaluated yet */}
      {!hasAnyEvaluated && (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 mb-5 flex items-start gap-3">
          <span className="text-base shrink-0">⏳</span>
          <div>
            <div className="text-sm text-white/80 mb-1">
              Track record warming up
            </div>
            <p className="text-xs text-white/50 leading-relaxed">
              No verdicts have completed their evaluation horizon yet. The first
              24h verdicts will be evaluated within 24 hours of their call. Stats
              will populate automatically as horizons elapse.
            </p>
          </div>
        </div>
      )}

      {/* History table */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
        {/* Table header with filter pills */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 flex-wrap gap-2">
          <span className="text-xs font-mono uppercase tracking-wider text-white/50">
            History · {filtered.length} verdicts
          </span>
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
        {filtered.length > 0 ? (
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
                {filtered.map((item) => (
                  <HistoryRow key={item.id || item.report_id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-white/40 text-sm italic">
              {filter === "all"
                ? "No verdicts in this window"
                : `No ${filter} verdicts in this window`}
            </p>
          </div>
        )}
      </div>

      {/* Footer note */}
      <p className="mt-3 text-[11px] text-white/30 font-mono leading-relaxed">
        Hit thresholds: bullish &gt; +1% · bearish &lt; −1% · neutral within
        ±2%. Reports cached every 6h, outcomes evaluated hourly as horizons
        elapse.
      </p>
    </section>
  );
}
