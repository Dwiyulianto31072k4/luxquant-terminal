// frontend-react/src/components/aiArenaV6/ZonesToWatch.jsx
/**
 * ZonesToWatch — Demand / Fair Value / Supply zones from verdict
 * ===============================================================
 * Renders verdict.zones_to_watch array from /v6/latest.
 *
 * Each entry:
 *   {
 *     kind: "demand" | "fair_value" | "supply",
 *     price_low: 77000.0,
 *     price_high: 78204.0,
 *     why: "Recent 7d low and prior accumulation zone...",
 *     liquidity_note: "Cluster of bid liquidity below $78k." | null
 *   }
 *
 * Layout: 3 cards horizontal stacked vertically by current BTC price
 * (visual ladder: supply on top, fair in middle, demand at bottom)
 * with a price marker showing where current BTC sits.
 *
 * IMPORTANT (legal-safe): we never use trader-action language like
 * "entry", "target", "stop loss", "buy here". Just descriptive zones.
 *
 * Props:
 *   zones — array of zone objects
 *   currentPrice — current BTC price for visual marker
 */

import React, { useMemo } from "react";
import { formatPrice } from "./constants";

// ─────────────────────────────────────────────────────────────────────
// Map zone kind to color/label
// ─────────────────────────────────────────────────────────────────────
function zoneStyle(kind) {
  const lower = String(kind || "").toLowerCase();
  if (lower === "demand") {
    return {
      label: "Demand",
      color: "#22c55e",
      bg: "rgba(34,197,94,0.06)",
      border: "rgba(34,197,94,0.25)",
      barBg: "rgba(34,197,94,0.15)",
      icon: "↓",
      desc: "Buyers historically stepped in",
    };
  }
  if (lower === "supply") {
    return {
      label: "Supply",
      color: "#ef4444",
      bg: "rgba(239,68,68,0.06)",
      border: "rgba(239,68,68,0.25)",
      barBg: "rgba(239,68,68,0.15)",
      icon: "↑",
      desc: "Sellers historically active",
    };
  }
  // fair_value / neutral
  return {
    label: "Fair Value",
    color: "#f5c451",
    bg: "rgba(245,196,81,0.05)",
    border: "rgba(245,196,81,0.2)",
    barBg: "rgba(245,196,81,0.12)",
    icon: "→",
    desc: "Current trading range",
  };
}

// ─────────────────────────────────────────────────────────────────────
// Sub-component: zone card
// ─────────────────────────────────────────────────────────────────────
function ZoneCard({ zone, currentPrice }) {
  const style = zoneStyle(zone.kind);
  const low = zone.price_low;
  const high = zone.price_high;
  const mid = (low + high) / 2;

  // Distance from current price (for sublabel)
  let distanceLabel = null;
  if (currentPrice && mid) {
    const pct = ((mid - currentPrice) / currentPrice) * 100;
    if (Math.abs(pct) < 0.3) {
      distanceLabel = "at current price";
    } else if (pct > 0) {
      distanceLabel = `+${pct.toFixed(1)}% above`;
    } else {
      distanceLabel = `${pct.toFixed(1)}% below`;
    }
  }

  // Is current price inside this zone?
  const inZone = currentPrice && currentPrice >= low && currentPrice <= high;

  return (
    <div
      className="rounded-xl p-5 relative overflow-hidden transition-colors"
      style={{
        backgroundColor: style.bg,
        border: `1px solid ${inZone ? style.color : style.border}`,
        boxShadow: inZone ? `0 0 0 1px ${style.color}40 inset` : undefined,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="text-base"
            style={{ color: style.color }}
            aria-hidden
          >
            {style.icon}
          </span>
          <span
            className="text-xs font-mono uppercase tracking-wider font-semibold"
            style={{ color: style.color }}
          >
            {style.label}
          </span>
        </div>
        {inZone && (
          <span
            className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded font-bold"
            style={{
              backgroundColor: style.color,
              color: "#0a0a0a",
            }}
          >
            ● Active
          </span>
        )}
      </div>

      {/* Price range — big number */}
      <div className="mb-3">
        <div
          className="text-xl font-semibold tabular-nums"
          style={{
            fontFamily: "JetBrains Mono, monospace",
            color: "rgba(255,255,255,0.9)",
          }}
        >
          ${formatPrice(low)} <span className="text-white/40">–</span>{" "}
          ${formatPrice(high)}
        </div>
        {distanceLabel && (
          <div className="text-[11px] font-mono text-white/40 mt-1">
            {distanceLabel}
          </div>
        )}
      </div>

      {/* Why */}
      {zone.why && (
        <p className="text-xs text-white/65 leading-relaxed mb-2">
          {zone.why}
        </p>
      )}

      {/* Liquidity note */}
      {zone.liquidity_note && (
        <div
          className="mt-3 pt-3 border-t border-white/5 flex items-start gap-2"
          style={{ borderColor: "rgba(255,255,255,0.05)" }}
        >
          <span className="text-[10px] mt-0.5">💧</span>
          <p className="text-[11px] text-white/55 leading-relaxed font-mono">
            {zone.liquidity_note}
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Visual price ladder (left rail showing zones stacked with BTC price marker)
// ─────────────────────────────────────────────────────────────────────
function PriceLadder({ zones, currentPrice }) {
  // Get full price range across all zones
  const { minPrice, maxPrice } = useMemo(() => {
    if (!zones || zones.length === 0) {
      return { minPrice: 0, maxPrice: 0 };
    }
    let mn = Infinity;
    let mx = -Infinity;
    zones.forEach((z) => {
      if (z.price_low < mn) mn = z.price_low;
      if (z.price_high > mx) mx = z.price_high;
    });
    if (currentPrice) {
      if (currentPrice < mn) mn = currentPrice;
      if (currentPrice > mx) mx = currentPrice;
    }
    // Add small padding
    const range = mx - mn;
    return {
      minPrice: mn - range * 0.05,
      maxPrice: mx + range * 0.05,
    };
  }, [zones, currentPrice]);

  if (!zones || zones.length === 0 || maxPrice <= minPrice) return null;

  const range = maxPrice - minPrice;
  const priceToY = (p) => 100 - ((p - minPrice) / range) * 100; // top=high, bottom=low

  return (
    <div className="relative h-full min-h-[260px] w-12 shrink-0">
      {/* Vertical track */}
      <div
        className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2"
        style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
      />

      {/* Zone bands */}
      {zones.map((zone, idx) => {
        const style = zoneStyle(zone.kind);
        const yTop = priceToY(zone.price_high);
        const yBottom = priceToY(zone.price_low);
        const height = yBottom - yTop;

        return (
          <div
            key={idx}
            className="absolute left-1/2 -translate-x-1/2 w-2.5 rounded-sm"
            style={{
              top: `${yTop}%`,
              height: `${height}%`,
              backgroundColor: style.color,
              opacity: 0.5,
              boxShadow: `0 0 4px ${style.color}80`,
            }}
            title={`${style.label}: $${formatPrice(zone.price_low)} – $${formatPrice(
              zone.price_high
            )}`}
          />
        );
      })}

      {/* Current price marker */}
      {currentPrice && (
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: `${priceToY(currentPrice)}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold whitespace-nowrap"
            style={{
              backgroundColor: "#0a0a0a",
              border: "1px solid #f5c451",
              color: "#f5c451",
              boxShadow: "0 0 8px rgba(245,196,81,0.4)",
            }}
          >
            ◆ ${formatPrice(currentPrice)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────
export default function ZonesToWatch({ zones, currentPrice }) {
  if (!zones || zones.length === 0) {
    return (
      <section className="mb-8">
        <h2
          className="text-2xl text-white/90 mb-4"
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 500,
            letterSpacing: "-0.02em",
          }}
        >
          Zones to Watch
        </h2>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 text-center">
          <p className="text-white/40 text-sm italic">No zones defined</p>
        </div>
      </section>
    );
  }

  // Sort: supply on top, fair_value middle, demand bottom (price descending)
  const order = { supply: 0, fair_value: 1, demand: 2 };
  const sorted = [...zones].sort(
    (a, b) => (order[a.kind] ?? 99) - (order[b.kind] ?? 99)
  );

  return (
    <section className="mb-8">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2
          className="text-2xl text-white/90"
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 500,
            letterSpacing: "-0.02em",
          }}
        >
          Zones to Watch
        </h2>
        <span className="text-xs font-mono text-white/40 uppercase tracking-wider">
          Demand · Fair · Supply
        </span>
      </div>

      {/* Layout: ladder + cards */}
      <div className="flex gap-4">
        {/* Ladder visualization */}
        <PriceLadder zones={sorted} currentPrice={currentPrice} />

        {/* Cards stacked vertically */}
        <div className="flex-1 grid grid-cols-1 gap-3">
          {sorted.map((zone, idx) => (
            <ZoneCard key={idx} zone={zone} currentPrice={currentPrice} />
          ))}
        </div>
      </div>

      {/* Footer note */}
      <p className="mt-3 text-[11px] text-white/30 font-mono leading-relaxed">
        Zones are descriptive price areas where historical activity has
        clustered, not trade signals. Not financial advice.
      </p>
    </section>
  );
}
