// frontend-react/src/components/aiArenaV6/RiskWatch.jsx
/**
 * RiskWatch — Specific scenarios that would invalidate the verdict
 * =================================================================
 * Renders verdict.risk_scenarios array from /v6/latest.
 *
 * Each entry:
 *   {
 *     title: "Sudden Liquidity Contraction",
 *     severity: "low" | "medium" | "high",
 *     threshold: "M2 growth reverses or SSR drops below 5.5",
 *     why_matters: "Macro tailwind is key bullish driver..."
 *   }
 *
 * This is the AI's pre-mortem — what would have to change for the
 * current verdict to be wrong. Useful for users to monitor proactively.
 *
 * Props:
 *   riskScenarios — array of risk scenario objects
 */

import React from "react";

// ─────────────────────────────────────────────────────────────────────
// Map severity to visual style
// ─────────────────────────────────────────────────────────────────────
function severityStyle(severity) {
  const lower = String(severity || "").toLowerCase();
  if (lower === "high" || lower === "critical") {
    return {
      label: "High",
      color: "#ef4444",
      bg: "rgba(239,68,68,0.08)",
      border: "rgba(239,68,68,0.3)",
      icon: "▲",
      dots: 3,
    };
  }
  if (lower === "medium" || lower === "moderate") {
    return {
      label: "Medium",
      color: "#f5c451",
      bg: "rgba(245,196,81,0.08)",
      border: "rgba(245,196,81,0.3)",
      icon: "◆",
      dots: 2,
    };
  }
  // low / info / unknown
  return {
    label: severity ? String(severity).toUpperCase() : "Low",
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.05)",
    border: "rgba(148,163,184,0.2)",
    icon: "•",
    dots: 1,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Severity dots indicator
// ─────────────────────────────────────────────────────────────────────
function SeverityDots({ count, color }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{
            backgroundColor: i <= count ? color : "rgba(255,255,255,0.1)",
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-component: scenario card
// ─────────────────────────────────────────────────────────────────────
function ScenarioCard({ scenario }) {
  const style = severityStyle(scenario.severity);

  return (
    <div
      className="rounded-xl p-5 relative overflow-hidden"
      style={{
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
      }}
    >
      {/* Header: title + severity */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span
            className="text-base shrink-0 mt-0.5"
            style={{ color: style.color }}
            aria-hidden
          >
            {style.icon}
          </span>
          <h3
            className="text-base text-white/90 leading-tight"
            style={{
              fontFamily: "Fraunces, serif",
              fontWeight: 500,
            }}
          >
            {scenario.title}
          </h3>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span
            className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold"
            style={{
              backgroundColor: `${style.color}25`,
              color: style.color,
            }}
          >
            {style.label}
          </span>
          <SeverityDots count={style.dots} color={style.color} />
        </div>
      </div>

      {/* Threshold (the trigger condition) */}
      {scenario.threshold && (
        <div className="mb-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1">
            Trigger
          </div>
          <div
            className="text-sm font-mono px-2.5 py-2 rounded leading-relaxed"
            style={{
              backgroundColor: "rgba(0,0,0,0.25)",
              color: "rgba(255,255,255,0.85)",
              borderLeft: `2px solid ${style.color}`,
            }}
          >
            {scenario.threshold}
          </div>
        </div>
      )}

      {/* Why it matters */}
      {scenario.why_matters && (
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1">
            Why it matters
          </div>
          <p className="text-xs text-white/70 leading-relaxed">
            {scenario.why_matters}
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────
export default function RiskWatch({ riskScenarios }) {
  if (!riskScenarios || riskScenarios.length === 0) {
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
          Risk Watch
        </h2>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 text-center">
          <p className="text-white/40 text-sm italic">
            No specific risk scenarios identified
          </p>
        </div>
      </section>
    );
  }

  // Sort by severity descending (high → medium → low)
  const severityRank = { high: 0, critical: 0, medium: 1, moderate: 1, low: 2 };
  const sorted = [...riskScenarios].sort((a, b) => {
    const aRank = severityRank[String(a.severity || "").toLowerCase()] ?? 9;
    const bRank = severityRank[String(b.severity || "").toLowerCase()] ?? 9;
    return aRank - bRank;
  });

  // Count severities for header summary
  const severityCounts = sorted.reduce((acc, s) => {
    const lvl = String(s.severity || "low").toLowerCase();
    if (lvl === "high" || lvl === "critical") acc.high++;
    else if (lvl === "medium" || lvl === "moderate") acc.med++;
    else acc.low++;
    return acc;
  }, { high: 0, med: 0, low: 0 });

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
            Risk Watch
          </h2>
          <span className="text-xs font-mono text-white/40">
            What would invalidate the verdict
          </span>
        </div>
        {/* Severity badges */}
        <div className="flex items-center gap-2 text-[10px] font-mono">
          {severityCounts.high > 0 && (
            <span className="text-red-400">
              ▲ {severityCounts.high} high
            </span>
          )}
          {severityCounts.med > 0 && (
            <span style={{ color: "#f5c451" }}>
              ◆ {severityCounts.med} medium
            </span>
          )}
          {severityCounts.low > 0 && (
            <span className="text-white/50">
              • {severityCounts.low} low
            </span>
          )}
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {sorted.map((scenario, idx) => (
          <ScenarioCard key={idx} scenario={scenario} />
        ))}
      </div>

      {/* Footer note */}
      <p className="mt-3 text-[11px] text-white/30 font-mono leading-relaxed">
        Risk scenarios are AI's own pre-mortem — what would have to change for
        the current verdict to be wrong. Useful for proactive monitoring.
      </p>
    </section>
  );
}
