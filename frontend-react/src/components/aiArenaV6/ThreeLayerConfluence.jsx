// frontend-react/src/components/aiArenaV6/ThreeLayerConfluence.jsx
/**
 * ThreeLayerConfluence — 3 cards for Macro / Smart Money / On-Chain
 * ================================================================
 * Renders the layer_briefs from Stage 1 compression + the confluence
 * verdict (MIXED / ALIGNED_BULL / ALIGNED_BEAR) from Phase 1 engine.
 *
 * Each card shows:
 *   - Layer name + direction arrow + confidence
 *   - 1-2 sentence narrative (from GPT-4o-mini compression)
 *   - 2-3 key metric chips with tooltip
 *
 * Props:
 *   layerBriefs — { macro, smart_money, onchain } each with
 *                 { direction, confidence, narrative, key_metrics: [{name, value, weight}] }
 *   confluenceVerdict — string e.g. "MIXED 1↑/1↓/1→"
 */

import React from "react";
import Tooltip from "./Tooltip";
import { directionStyle, confidenceTier, formatNumber } from "./constants";

// ─────────────────────────────────────────────────────────────────────
// Sub-component: single layer card
// ─────────────────────────────────────────────────────────────────────
function LayerCard({ title, icon, brief, accent }) {
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
  const conf = confidenceTier(brief.confidence);

  return (
    <div className="rounded-xl border border-white/5 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5 hover:border-white/10 transition-colors">
      {/* Header: icon + title + direction */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <span className="text-xs text-white/50 font-mono uppercase tracking-wider">
            {title}
          </span>
        </div>
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono"
          style={{ backgroundColor: dir.bg, color: dir.fg }}
          title={`Direction: ${brief.direction}`}
        >
          <span className="text-base leading-none">{dir.arrow}</span>
          <span className="font-semibold">{brief.direction?.toUpperCase()}</span>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-[10px] font-mono mb-1">
          <span className="text-white/40 uppercase tracking-wider">Conf</span>
          <span style={{ color: conf.color }}>
            {brief.confidence ?? "—"}% · {conf.label}
          </span>
        </div>
        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${brief.confidence ?? 0}%`,
              backgroundColor: conf.color,
            }}
          />
        </div>
      </div>

      {/* Narrative */}
      <p className="text-sm text-white/75 leading-relaxed mb-4 min-h-[3rem]">
        {brief.narrative || "—"}
      </p>

      {/* Key metric chips */}
      {brief.key_metrics && brief.key_metrics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {brief.key_metrics.slice(0, 3).map((metric, idx) => (
            <MetricChip key={idx} metric={metric} accent={accent} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-component: metric chip with tooltip
// ─────────────────────────────────────────────────────────────────────
function MetricChip({ metric, accent }) {
  if (!metric || !metric.name) return null;

  const weightDot =
    metric.weight === "high"
      ? "●"
      : metric.weight === "medium"
      ? "◐"
      : "○";

  return (
    <Tooltip term={metric.name}>
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/5 text-xs font-mono cursor-help hover:bg-white/10 transition-colors"
        style={{ color: accent }}
      >
        <span className="text-[10px] opacity-50">{weightDot}</span>
        <span className="text-white/60">{metric.name}</span>
        <span className="text-white/90 font-semibold">
          {typeof metric.value === "number"
            ? formatNumber(metric.value)
            : metric.value}
        </span>
      </div>
    </Tooltip>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-component: confluence summary banner
// ─────────────────────────────────────────────────────────────────────
function ConfluenceBanner({ verdict }) {
  if (!verdict) return null;

  // Parse "MIXED 1↑/1↓/1→" or "ALIGNED_BULL 3↑/0↓/0→" etc.
  const upper = verdict.toUpperCase();
  let label = "MIXED";
  let color = "#f5c451"; // gold
  let bg = "rgba(245, 196, 81, 0.1)";

  if (upper.includes("ALIGNED_BULL")) {
    label = "ALIGNED BULL";
    color = "#22c55e";
    bg = "rgba(34, 197, 94, 0.12)";
  } else if (upper.includes("ALIGNED_BEAR")) {
    label = "ALIGNED BEAR";
    color = "#ef4444";
    bg = "rgba(239, 68, 68, 0.12)";
  }

  // Extract counts from string like "1↑/1↓/1→"
  const match = verdict.match(/(\d+)↑\s*\/\s*(\d+)↓\s*\/\s*(\d+)→/);
  const counts = match
    ? { up: match[1], down: match[2], side: match[3] }
    : null;

  return (
    <div
      className="rounded-lg border p-3 mb-4 flex items-center justify-between"
      style={{ borderColor: `${color}40`, backgroundColor: bg }}
    >
      <div className="flex items-center gap-3">
        <span
          className="text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded font-bold"
          style={{ backgroundColor: color, color: "#0a0a0a" }}
        >
          {label}
        </span>
        <span className="text-xs text-white/60 font-mono">
          Cross-layer confluence
        </span>
      </div>

      {counts && (
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="flex items-center gap-1">
            <span className="text-emerald-400">↑</span>
            <span className="text-white/70">{counts.up}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-red-400">↓</span>
            <span className="text-white/70">{counts.down}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-white/40">→</span>
            <span className="text-white/70">{counts.side}</span>
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────
export default function ThreeLayerConfluence({
  layerBriefs,
  confluenceVerdict,
}) {
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
        <Tooltip term="confluence">
          <span className="text-xs text-white/40 font-mono cursor-help border-b border-dotted border-white/20">
            What is this?
          </span>
        </Tooltip>
      </div>

      {/* Confluence banner */}
      <ConfluenceBanner verdict={confluenceVerdict} />

      {/* 3-column grid of layer cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <LayerCard
          title="Macro"
          icon="🌐"
          brief={layerBriefs?.macro}
          accent="#f5c451"
        />
        <LayerCard
          title="Smart Money"
          icon="🐋"
          brief={layerBriefs?.smart_money}
          accent="#a78bfa"
        />
        <LayerCard
          title="On-Chain"
          icon="⛓"
          brief={layerBriefs?.onchain}
          accent="#22d3ee"
        />
      </div>

      {/* Footer note */}
      <p className="mt-3 text-[11px] text-white/30 font-mono">
        Compressed by GPT-4o-mini from 23 raw indicators · weights:{" "}
        <span className="opacity-60">●</span> high ·{" "}
        <span className="opacity-60">◐</span> medium ·{" "}
        <span className="opacity-60">○</span> low
      </p>
    </section>
  );
}
