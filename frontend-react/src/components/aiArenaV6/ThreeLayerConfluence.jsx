// frontend-react/src/components/aiArenaV6/ThreeLayerConfluence.jsx
/**
 * ThreeLayerConfluence — 3 cards for Macro / Smart Money / On-Chain
 * ================================================================
 * Renders layer_briefs from /v6/latest. Real shape per layer:
 *   {
 *     layer: "macro",
 *     direction: "bullish",
 *     strength: 0.75,
 *     headline: "Macro liquidity conditions are improving.",
 *     key_points: [
 *       "M2 $119.4T",
 *       "YoY +6.93%",
 *       "SSR 5.947"
 *     ],
 *     notable_metrics: [
 *       "Funding rate -0.0000316",
 *       "Volatility 35.47"
 *     ]
 *   }
 *
 * Plus overall_setup is a string at layer_briefs.overall_setup.
 * confluence verdict is derived from per-layer directions (3↑ / 2↑1↓ / etc).
 *
 * Props:
 *   layerBriefs   — object with macro, smart_money, onchain, cycle, overall_setup
 *   overallSetup  — string (the cross-layer narrative)
 */

import React from "react";
import Tooltip from "./Tooltip";
import { directionStyle } from "./constants";

// ─────────────────────────────────────────────────────────────────────
// Map layer name to GLOSSARY termKey for tooltip
// (kebab-case, matching keys defined in Tooltip.jsx GLOSSARY)
// ─────────────────────────────────────────────────────────────────────
const LAYER_TERM_KEY = {
  macro: "m2-global",
  smart_money: "top-traders",
  onchain: "nupl",
};

// ─────────────────────────────────────────────────────────────────────
// Compute confluence summary from 3 layer directions
// ─────────────────────────────────────────────────────────────────────
function computeConfluence(briefs) {
  if (!briefs) return { label: "—", up: 0, down: 0, side: 0, color: "#94a3b8" };

  const layers = ["macro", "smart_money", "onchain"];
  let up = 0;
  let down = 0;
  let side = 0;

  layers.forEach((key) => {
    const d = String(briefs?.[key]?.direction || "").toLowerCase();
    if (d === "bullish") up++;
    else if (d === "bearish") down++;
    else side++;
  });

  let label = "MIXED";
  let color = "#f5c451";
  if (up >= 2 && down === 0) {
    label = "ALIGNED BULL";
    color = "#22c55e";
  } else if (down >= 2 && up === 0) {
    label = "ALIGNED BEAR";
    color = "#ef4444";
  }

  return { label, up, down, side, color };
}

// ─────────────────────────────────────────────────────────────────────
// Sub-component: single layer card
// ─────────────────────────────────────────────────────────────────────
function LayerCard({ title, icon, brief, accent, termKey }) {
  if (!brief) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
        <div className="text-sm text-white/40 font-mono uppercase tracking-wider mb-2">
          {title}
        </div>
        <div className="text-white/30 text-sm italic">No data</div>
      </div>
    );
  }

  const dir = directionStyle(brief.direction);
  // strength is 0..1 from layer_briefs; display as 0..100% confidence
  const strengthPct = brief.strength != null
    ? Math.round(brief.strength * 100)
    : null;

  return (
    <div className="rounded-xl border border-white/5 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5 hover:border-white/10 transition-colors">
      {/* Header: icon + title + direction */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <Tooltip termKey={termKey}>
            <span className="text-xs text-white/50 font-mono uppercase tracking-wider cursor-help border-b border-dotted border-white/20">
              {title}
            </span>
          </Tooltip>
        </div>
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono"
          style={{ backgroundColor: dir.bg, color: dir.fg }}
          title={`Direction: ${brief.direction}`}
        >
          <span className="text-base leading-none">{dir.arrow}</span>
          <span className="font-semibold">{dir.label}</span>
        </div>
      </div>

      {/* Strength bar */}
      {strengthPct !== null && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-[10px] font-mono mb-1">
            <span className="text-white/40 uppercase tracking-wider">
              Strength
            </span>
            <span style={{ color: accent }}>{strengthPct}%</span>
          </div>
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${strengthPct}%`,
                backgroundColor: accent,
              }}
            />
          </div>
        </div>
      )}

      {/* Headline (1 sentence narrative) */}
      <p className="text-sm text-white/85 leading-relaxed mb-3 min-h-[2.5rem]">
        {brief.headline || "—"}
      </p>

      {/* Key points (bullets) */}
      {brief.key_points && brief.key_points.length > 0 && (
        <ul className="space-y-1 mb-3">
          {brief.key_points.slice(0, 3).map((point, idx) => (
            <li
              key={idx}
              className="text-xs text-white/65 font-mono pl-3 relative leading-relaxed"
            >
              <span
                className="absolute left-0 top-1.5 w-1 h-1 rounded-full"
                style={{ backgroundColor: accent }}
              />
              {point}
            </li>
          ))}
        </ul>
      )}

      {/* Notable metrics chips */}
      {brief.notable_metrics && brief.notable_metrics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/5">
          {brief.notable_metrics.slice(0, 2).map((metric, idx) => (
            <span
              key={idx}
              className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/5 text-white/50"
            >
              {metric}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-component: confluence summary banner
// ─────────────────────────────────────────────────────────────────────
function ConfluenceBanner({ summary }) {
  const bg =
    summary.label === "ALIGNED BULL"
      ? "rgba(34, 197, 94, 0.12)"
      : summary.label === "ALIGNED BEAR"
      ? "rgba(239, 68, 68, 0.12)"
      : "rgba(245, 196, 81, 0.1)";

  return (
    <div
      className="rounded-lg border p-3 mb-4 flex items-center justify-between flex-wrap gap-2"
      style={{
        borderColor: `${summary.color}40`,
        backgroundColor: bg,
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded font-bold"
          style={{ backgroundColor: summary.color, color: "#0a0a0a" }}
        >
          {summary.label}
        </span>
        <Tooltip termKey="confluence">
          <span className="text-xs text-white/60 font-mono cursor-help border-b border-dotted border-white/20">
            Cross-layer confluence
          </span>
        </Tooltip>
      </div>

      <div className="flex items-center gap-3 text-xs font-mono">
        <span className="flex items-center gap-1">
          <span className="text-emerald-400">↑</span>
          <span className="text-white/70">{summary.up}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="text-red-400">↓</span>
          <span className="text-white/70">{summary.down}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="text-white/40">→</span>
          <span className="text-white/70">{summary.side}</span>
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────
export default function ThreeLayerConfluence({ layerBriefs, overallSetup }) {
  const summary = computeConfluence(layerBriefs);

  return (
    <section className="mb-8">
      {/* Section heading */}
      <div className="flex items-baseline justify-between mb-4">
        <h2
          className="text-2xl text-white/90"
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 500,
            letterSpacing: "-0.02em",
          }}
        >
          Three-Layer Confluence
        </h2>
        <Tooltip termKey="confluence">
          <span className="text-xs text-white/40 font-mono cursor-help border-b border-dotted border-white/20">
            What is this?
          </span>
        </Tooltip>
      </div>

      {/* Confluence banner */}
      <ConfluenceBanner summary={summary} />

      {/* 3-column grid of layer cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <LayerCard
          title="Macro"
          icon="🌐"
          brief={layerBriefs?.macro}
          accent="#f5c451"
          termKey={LAYER_TERM_KEY.macro}
        />
        <LayerCard
          title="Smart Money"
          icon="🐋"
          brief={layerBriefs?.smart_money}
          accent="#a78bfa"
          termKey={LAYER_TERM_KEY.smart_money}
        />
        <LayerCard
          title="On-Chain"
          icon="⛓"
          brief={layerBriefs?.onchain}
          accent="#22d3ee"
          termKey={LAYER_TERM_KEY.onchain}
        />
      </div>

      {/* Overall setup narrative */}
      {overallSetup && (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1">
            Overall Setup
          </div>
          <p className="text-sm text-white/75 leading-relaxed">
            {overallSetup}
          </p>
        </div>
      )}

      {/* Footer note */}
      <p className="mt-3 text-[11px] text-white/30 font-mono">
        Compressed by GPT-4o-mini from 23 raw indicators
      </p>
    </section>
  );
}
