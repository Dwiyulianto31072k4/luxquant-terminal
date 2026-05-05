// frontend-react/src/components/aiArenaV6/AIReasoningWalkthrough.jsx
/**
 * AIReasoningWalkthrough — 5-step Chain-of-Thought from DeepSeek R1
 * =================================================================
 * Renders the reasoning_chain array from Stage 2 (DeepSeek R1).
 * Each step is expandable; first step expanded by default.
 *
 * Step structure (from verdict_schema.py):
 *   {
 *     step: 1-7,
 *     title: short label
 *     observation: what AI saw in the data
 *     interpretation: what it means
 *     evidence: [list of metric refs that support this]
 *   }
 *
 * Plus optional self-critique badge from Stage 3 if it flagged a concern
 * for this step.
 *
 * Props:
 *   reasoningChain — array of step objects
 *   critique — { decision, concerns: [string], suggested_caveat } | null
 */

import React, { useState } from "react";
import Tooltip from "./Tooltip";

// ─────────────────────────────────────────────────────────────────────
// Sub-component: single reasoning step
// ─────────────────────────────────────────────────────────────────────
function ReasoningStep({ step, index, total, isOpen, onToggle, hasCritique }) {
  const stepNum = step.step || index + 1;

  return (
    <div
      className={`relative pl-10 transition-all ${
        index < total - 1 ? "pb-4" : ""
      }`}
    >
      {/* Vertical timeline line */}
      {index < total - 1 && (
        <div
          className="absolute left-[15px] top-8 bottom-0 w-px"
          style={{ backgroundColor: "rgba(245, 196, 81, 0.15)" }}
        />
      )}

      {/* Step circle marker */}
      <div
        className={`absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm font-semibold transition-all ${
          isOpen
            ? "bg-gold-primary text-black"
            : "bg-white/5 text-white/60 border border-white/10"
        }`}
        style={
          isOpen
            ? { backgroundColor: "#f5c451", color: "#0a0a0a" }
            : undefined
        }
      >
        {stepNum}
      </div>

      {/* Header (clickable) */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left group"
      >
        <div className="flex items-center justify-between gap-3">
          <h3
            className={`text-base transition-colors ${
              isOpen ? "text-white" : "text-white/80 group-hover:text-white"
            }`}
            style={{
              fontFamily: "Fraunces, serif",
              fontWeight: 500,
            }}
          >
            {step.title || `Step ${stepNum}`}
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            {hasCritique && (
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider"
                style={{
                  backgroundColor: "rgba(245, 196, 81, 0.15)",
                  color: "#f5c451",
                }}
                title="AI flagged a concern about this step"
              >
                ⚠ flagged
              </span>
            )}
            <span
              className="text-white/40 font-mono text-xs transition-transform"
              style={{
                transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}
            >
              ▾
            </span>
          </div>
        </div>
      </button>

      {/* Expanded body */}
      {isOpen && (
        <div className="mt-3 space-y-3 animate-fadeIn">
          {/* Observation */}
          {step.observation && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1">
                Observation
              </div>
              <p className="text-sm text-white/80 leading-relaxed">
                {step.observation}
              </p>
            </div>
          )}

          {/* Interpretation */}
          {step.interpretation && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1">
                Interpretation
              </div>
              <p className="text-sm text-white/75 leading-relaxed italic">
                {step.interpretation}
              </p>
            </div>
          )}

          {/* Evidence chips */}
          {step.evidence && step.evidence.length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1.5">
                Evidence
              </div>
              <div className="flex flex-wrap gap-1.5">
                {step.evidence.map((ev, idx) => (
                  <Tooltip key={idx} term={ev}>
                    <span
                      className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/70 cursor-help hover:bg-white/10 transition-colors"
                    >
                      {ev}
                    </span>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Critique banner (top-level decision from Stage 3)
// ─────────────────────────────────────────────────────────────────────
function CritiqueBanner({ critique }) {
  if (!critique || !critique.decision) return null;

  const decisionStyle = {
    approved: {
      label: "Approved",
      color: "#22c55e",
      bg: "rgba(34, 197, 94, 0.1)",
      icon: "✓",
    },
    approved_with_caveat: {
      label: "Approved with caveat",
      color: "#f5c451",
      bg: "rgba(245, 196, 81, 0.1)",
      icon: "⚠",
    },
    needs_revision: {
      label: "Needs revision",
      color: "#ef4444",
      bg: "rgba(239, 68, 68, 0.1)",
      icon: "⚠",
    },
  }[critique.decision] || {
    label: critique.decision,
    color: "#94a3b8",
    bg: "rgba(148, 163, 184, 0.1)",
    icon: "•",
  };

  return (
    <div
      className="rounded-lg border p-3 mb-5"
      style={{
        borderColor: `${decisionStyle.color}40`,
        backgroundColor: decisionStyle.bg,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="text-base shrink-0 mt-0.5"
          style={{ color: decisionStyle.color }}
        >
          {decisionStyle.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs font-mono uppercase tracking-wider font-semibold"
              style={{ color: decisionStyle.color }}
            >
              Self-critique: {decisionStyle.label}
            </span>
            <Tooltip term="self-critique">
              <span className="text-[10px] text-white/30 font-mono cursor-help border-b border-dotted border-white/20">
                ?
              </span>
            </Tooltip>
          </div>
          {critique.suggested_caveat && (
            <p className="text-sm text-white/75 leading-relaxed">
              {critique.suggested_caveat}
            </p>
          )}
          {critique.concerns && critique.concerns.length > 0 && (
            <ul className="mt-2 space-y-1">
              {critique.concerns.map((c, idx) => (
                <li
                  key={idx}
                  className="text-xs text-white/60 leading-relaxed pl-3 relative"
                >
                  <span
                    className="absolute left-0 top-1.5 w-1 h-1 rounded-full"
                    style={{ backgroundColor: decisionStyle.color }}
                  />
                  {c}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────
export default function AIReasoningWalkthrough({ reasoningChain, critique }) {
  // Default: first step open, others closed
  const [openSteps, setOpenSteps] = useState({ 0: true });

  if (!reasoningChain || reasoningChain.length === 0) {
    return (
      <section className="mb-8">
        <h2
          className="text-2xl text-white/90 mb-3"
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 500,
            letterSpacing: "-0.02em",
          }}
        >
          AI Reasoning
        </h2>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center">
          <p className="text-white/40 text-sm italic">
            No reasoning chain available
          </p>
        </div>
      </section>
    );
  }

  // Map flagged concerns to step numbers (heuristic: search step title in concerns)
  const flaggedSteps = new Set();
  if (critique?.concerns) {
    critique.concerns.forEach((c) => {
      const lower = c.toLowerCase();
      reasoningChain.forEach((step, idx) => {
        const title = (step.title || "").toLowerCase();
        if (title && lower.includes(title.substring(0, 10))) {
          flaggedSteps.add(idx);
        }
      });
    });
  }

  const toggleStep = (idx) => {
    setOpenSteps((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const expandAll = () => {
    const all = {};
    reasoningChain.forEach((_, idx) => (all[idx] = true));
    setOpenSteps(all);
  };

  const collapseAll = () => setOpenSteps({});

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
            AI Reasoning
          </h2>
          <span className="text-xs font-mono text-white/40">
            {reasoningChain.length} steps · DeepSeek R1
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <button
            type="button"
            onClick={expandAll}
            className="text-white/50 hover:text-white/80 transition-colors"
          >
            expand all
          </button>
          <span className="text-white/20">·</span>
          <button
            type="button"
            onClick={collapseAll}
            className="text-white/50 hover:text-white/80 transition-colors"
          >
            collapse
          </button>
        </div>
      </div>

      {/* Stage 3 critique banner */}
      <CritiqueBanner critique={critique} />

      {/* Reasoning steps */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
        {reasoningChain.map((step, idx) => (
          <ReasoningStep
            key={idx}
            step={step}
            index={idx}
            total={reasoningChain.length}
            isOpen={!!openSteps[idx]}
            onToggle={() => toggleStep(idx)}
            hasCritique={flaggedSteps.has(idx)}
          />
        ))}
      </div>

      {/* Footer note */}
      <p className="mt-3 text-[11px] text-white/30 font-mono">
        Reasoning chain produced by DeepSeek R1, audited by GPT-4o
      </p>

      {/* CSS for fade-in animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 200ms ease-out; }
      `}</style>
    </section>
  );
}
