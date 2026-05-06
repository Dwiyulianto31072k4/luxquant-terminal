// frontend-react/src/components/aiArenaV6/WhatChanged.jsx
/**
 * WhatChanged — Diff narrative vs previous report
 * ================================================
 * Renders verdict.what_changed string from /v6/latest.
 *
 * Backend already produces a coherent diff narrative, so we just
 * present it cleanly with timestamp context.
 *
 * Props:
 *   whatChanged — string narrative
 *   timestamp — current report timestamp (ISO)
 */

import React from "react";

export default function WhatChanged({ whatChanged, timestamp }) {
  if (!whatChanged) {
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
          What Changed
        </h2>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 text-center">
          <p className="text-white/40 text-sm italic">
            No previous report to compare against
          </p>
        </div>
      </section>
    );
  }

  // Compute "since" relative time
  let sinceLabel = "since previous report";
  if (timestamp) {
    try {
      const d = new Date(timestamp);
      const ageMs = Date.now() - d.getTime();
      const ageHrs = ageMs / 3600000;
      if (ageHrs < 12) {
        sinceLabel = "since last 6h cycle";
      } else if (ageHrs < 36) {
        sinceLabel = "since yesterday";
      }
    } catch {
      // ignore
    }
  }

  return (
    <section className="mb-8">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-4">
        <h2
          className="text-2xl text-white/90"
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 500,
            letterSpacing: "-0.02em",
          }}
        >
          What Changed
        </h2>
        <span className="text-xs font-mono text-white/40 uppercase tracking-wider">
          {sinceLabel}
        </span>
      </div>

      {/* Body */}
      <div
        className="rounded-xl p-5 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(245,196,81,0.04) 0%, rgba(255,255,255,0.02) 100%)",
          border: "1px solid rgba(245,196,81,0.15)",
        }}
      >
        {/* Decorative arrow icon */}
        <div className="flex items-start gap-3">
          <div
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5"
            style={{
              backgroundColor: "rgba(245,196,81,0.12)",
              color: "#f5c451",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
          <p className="text-base text-white/85 leading-relaxed flex-1">
            {whatChanged}
          </p>
        </div>
      </div>

      {/* Footer note */}
      <p className="mt-3 text-[11px] text-white/30 font-mono">
        Diff produced by LuxQuant AI comparing previous and current verdicts
      </p>
    </section>
  );
}
