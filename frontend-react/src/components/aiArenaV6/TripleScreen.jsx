// frontend-react/src/components/aiArenaV6/TripleScreen.jsx
/**
 * TripleScreen — Multi-timeframe trend alignment (Alexander Elder style)
 * ======================================================================
 * Renders verdict.triple_screen array from /v6/latest.
 *
 * Each entry:
 *   {
 *     timeframe: "1D" | "4H" | "1H",
 *     state: "UPTREND" | "MIXED" | "BEARISH" | "DOWNTREND" | "BULLISH",
 *     note: "Price above 20 and 50 DMA; 7d positive momentum."
 *   }
 *
 * Tide / Wave / Ripple metaphor (Elder's framework):
 *   1D = Tide (long-term trend)
 *   4H = Wave (medium-term)
 *   1H = Ripple (short-term timing)
 *
 * Props:
 *   tripleScreen — array of timeframe states
 */

import React from "react";

// ─────────────────────────────────────────────────────────────────────
// Map state to color/icon
// ─────────────────────────────────────────────────────────────────────
function stateStyle(state) {
  const upper = String(state || "").toUpperCase();
  if (upper === "UPTREND" || upper === "BULLISH") {
    return {
      label: upper,
      color: "#22c55e",
      bg: "rgba(34,197,94,0.08)",
      border: "rgba(34,197,94,0.25)",
      icon: "↑",
    };
  }
  if (upper === "DOWNTREND" || upper === "BEARISH") {
    return {
      label: upper,
      color: "#ef4444",
      bg: "rgba(239,68,68,0.08)",
      border: "rgba(239,68,68,0.25)",
      icon: "↓",
    };
  }
  // MIXED / NEUTRAL / RANGE / SIDEWAYS
  return {
    label: upper || "—",
    color: "#f5c451",
    bg: "rgba(245,196,81,0.08)",
    border: "rgba(245,196,81,0.25)",
    icon: "→",
  };
}

// ─────────────────────────────────────────────────────────────────────
// Map timeframe to Elder metaphor + description
// ─────────────────────────────────────────────────────────────────────
const TIMEFRAME_META = {
  "1D": { metaphor: "Tide", desc: "Long-term trend" },
  "4H": { metaphor: "Wave", desc: "Medium-term swing" },
  "1H": { metaphor: "Ripple", desc: "Short-term timing" },
};

// ─────────────────────────────────────────────────────────────────────
// Compute alignment summary
// ─────────────────────────────────────────────────────────────────────
function computeAlignment(screens) {
  if (!screens || screens.length === 0) {
    return { label: "—", color: "#94a3b8" };
  }

  let bull = 0;
  let bear = 0;
  let mixed = 0;

  screens.forEach((s) => {
    const u = String(s.state || "").toUpperCase();
    if (u === "UPTREND" || u === "BULLISH") bull++;
    else if (u === "DOWNTREND" || u === "BEARISH") bear++;
    else mixed++;
  });

  if (bull === screens.length) {
    return { label: "ALL ALIGNED BULL", color: "#22c55e" };
  }
  if (bear === screens.length) {
    return { label: "ALL ALIGNED BEAR", color: "#ef4444" };
  }
  if (bull >= 2) return { label: "MAJORITY BULL", color: "#22c55e" };
  if (bear >= 2) return { label: "MAJORITY BEAR", color: "#ef4444" };
  return { label: "MIXED ACROSS TF", color: "#f5c451" };
}

// ─────────────────────────────────────────────────────────────────────
// Sub-component: timeframe card
// ─────────────────────────────────────────────────────────────────────
function TimeframeCard({ screen }) {
  if (!screen) return null;

  const style = stateStyle(screen.state);
  const meta = TIMEFRAME_META[screen.timeframe] || {
    metaphor: "",
    desc: "",
  };

  return (
    <div
      className="rounded-xl p-5 relative overflow-hidden"
      style={{
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
      }}
    >
      {/* Header */}
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div
            className="text-2xl font-semibold tabular-nums"
            style={{
              fontFamily: "JetBrains Mono, monospace",
              color: "rgba(255,255,255,0.9)",
            }}
          >
            {screen.timeframe}
          </div>
          {meta.metaphor && (
            <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mt-0.5">
              {meta.metaphor}
            </div>
          )}
        </div>
        <div
          className="text-2xl"
          style={{ color: style.color }}
          aria-hidden
        >
          {style.icon}
        </div>
      </div>

      {/* State label */}
      <div
        className="text-lg font-semibold mb-2"
        style={{
          color: style.color,
          fontFamily: "Fraunces, serif",
          letterSpacing: "-0.01em",
        }}
      >
        {style.label}
      </div>

      {/* Note */}
      {screen.note && (
        <p className="text-xs text-white/65 leading-relaxed">{screen.note}</p>
      )}

      {/* Bottom metaphor */}
      {meta.desc && (
        <p className="text-[10px] font-mono uppercase tracking-wider text-white/30 mt-3 pt-3 border-t border-white/5">
          {meta.desc}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────
export default function TripleScreen({ tripleScreen }) {
  if (!tripleScreen || tripleScreen.length === 0) {
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
          Triple Screen
        </h2>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 text-center">
          <p className="text-white/40 text-sm italic">
            No multi-timeframe data available
          </p>
        </div>
      </section>
    );
  }

  // Sort canonical order: 1D, 4H, 1H
  const order = { "1D": 0, "4H": 1, "1H": 2 };
  const sorted = [...tripleScreen].sort(
    (a, b) => (order[a.timeframe] ?? 99) - (order[b.timeframe] ?? 99)
  );

  const alignment = computeAlignment(sorted);

  return (
    <section className="mb-8">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-baseline gap-3">
          <h2
            className="text-2xl text-white/90"
            style={{
              fontFamily: "Fraunces, serif",
              fontWeight: 500,
              letterSpacing: "-0.02em",
            }}
          >
            Triple Screen
          </h2>
          <span className="text-xs font-mono text-white/40">
            Tide · Wave · Ripple
          </span>
        </div>
        <span
          className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded font-semibold"
          style={{
            backgroundColor: `${alignment.color}20`,
            color: alignment.color,
            border: `1px solid ${alignment.color}40`,
          }}
        >
          {alignment.label}
        </span>
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {sorted.map((screen) => (
          <TimeframeCard key={screen.timeframe} screen={screen} />
        ))}
      </div>

      {/* Footer note */}
      <p className="mt-3 text-[11px] text-white/30 font-mono">
        Multi-timeframe alignment helps gauge whether short-term setups agree
        with the dominant trend
      </p>
    </section>
  );
}
