// src/components/edgelab/_shared.jsx
// ════════════════════════════════════════════════════════════════
// Shared primitives for Edge Lab tabs (v2 UX rebuild)
//   - Panel        : card chrome with gold top-hairline
//   - Methodology  : collapsible "how this works" (default collapsed)
//   - InsightBand  : 1-3 auto-surfaced takeaways at top of each tab
//   - EmptyState   : consistent empty panel
//   - tier helpers : colors, labels
// ════════════════════════════════════════════════════════════════

import { useState } from "react";

export const TIER_COLORS = {
  reliable: "#10b981",
  moderate: "#f59e0b",
  unreliable: "#ef4444",
};

export const TIER_LABELS = {
  reliable: "Reliable",
  moderate: "Moderate",
  unreliable: "Unreliable",
};

// ─── Win-rate → color (shared scale across all heatmaps) ─────────
export const wrColor = (wr, total = 1) => {
  if (!total) return "rgba(255,255,255,0.025)";
  if (wr === null || wr === undefined) return "rgba(255,255,255,0.05)";
  if (wr >= 90) return "rgba(16,185,129,0.62)";
  if (wr >= 75) return "rgba(16,185,129,0.42)";
  if (wr >= 60) return "rgba(16,185,129,0.26)";
  if (wr >= 50) return "rgba(255,255,255,0.09)";
  if (wr >= 35) return "rgba(239,68,68,0.28)";
  return "rgba(239,68,68,0.5)";
};

export const WR_LEGEND = [
  { l: "<35", c: "rgba(239,68,68,0.5)" },
  { l: "35–50", c: "rgba(239,68,68,0.28)" },
  { l: "50–60", c: "rgba(255,255,255,0.09)" },
  { l: "60–75", c: "rgba(16,185,129,0.26)" },
  { l: "75–90", c: "rgba(16,185,129,0.42)" },
  { l: "≥90", c: "rgba(16,185,129,0.62)" },
];

// ─── Panel chrome ────────────────────────────────────────────────
export const Panel = ({ children, className = "", title, meta, pad = true }) => (
  <div className={`relative rounded-lg bg-surface-raised border border-white/[0.07] ${className}`}>
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/35 to-transparent" />
    {title && (
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.05]">
        <div className="text-[10px] tracking-[0.22em] font-mono uppercase text-text-primary/45">{title}</div>
        {meta && <div className="text-[9px] font-mono uppercase tracking-wider text-text-primary/30">{meta}</div>}
      </div>
    )}
    {pad ? <div className="p-5">{children}</div> : children}
  </div>
);

// ─── Collapsible methodology ─────────────────────────────────────
export const Methodology = ({ title, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.015] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.02] transition group"
      >
        <span className="flex items-center gap-2 text-[10px] tracking-[0.2em] font-mono uppercase text-gold-primary/60 group-hover:text-gold-primary/85 transition">
          <span className="text-text-primary/25">ⓘ</span> {title}
        </span>
        <span className={`text-text-primary/30 text-[10px] transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 pb-3.5 pt-0.5 text-xs text-text-primary/60 leading-relaxed border-t border-white/[0.04]">
          {children}
        </div>
      )}
    </div>
  );
};

// ─── Insight band — the headline takeaways ───────────────────────
// items: [{ kind: 'good'|'bad'|'neutral', label, value, sub }]
const KIND = {
  good: { dot: "#10b981", val: "text-emerald-400", ring: "border-emerald-500/25 bg-emerald-500/[0.045]" },
  bad: { dot: "#ef4444", val: "text-red-400", ring: "border-red-500/25 bg-red-500/[0.045]" },
  neutral: { dot: "#d4a853", val: "text-gold-primary", ring: "border-line/25 bg-gold-primary/[0.04]" },
};

export const InsightBand = ({ items = [] }) => {
  const shown = items.filter(Boolean).slice(0, 3);
  if (!shown.length) return null;
  return (
    <div className={`grid gap-3 ${shown.length === 1 ? "grid-cols-1" : shown.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
      {shown.map((it, i) => {
        const k = KIND[it.kind] || KIND.neutral;
        return (
          <div key={i} className={`relative rounded-lg border px-4 py-3.5 ${k.ring}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: k.dot }} />
              <span className="text-[9px] tracking-[0.2em] font-mono uppercase text-text-primary/45">{it.label}</span>
            </div>
            <div className={`font-mono tabular-nums text-lg leading-none ${k.val}`}>{it.value}</div>
            {it.sub && <div className="text-[10px] font-mono text-text-primary/45 mt-1.5 leading-snug">{it.sub}</div>}
          </div>
        );
      })}
    </div>
  );
};

// ─── Empty state ─────────────────────────────────────────────────
export const EmptyState = ({ title, hint }) => (
  <Panel pad>
    <div className="py-12 text-center">
      <div className="text-text-primary/30 text-sm font-mono uppercase tracking-wider">{title}</div>
      {hint && <div className="text-text-primary/20 text-xs font-mono mt-2 normal-case">{hint}</div>}
    </div>
  </Panel>
);

// ─── Reliability badge ───────────────────────────────────────────
export const ReliabilityBadge = ({ tier, compact = false }) => {
  const color = TIER_COLORS[tier] || "#888";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-sm border font-mono uppercase tracking-wider"
      style={{
        background: `${color}18`,
        borderColor: `${color}50`,
        color,
        padding: compact ? "1px 6px" : "2px 8px",
        fontSize: compact ? 8 : 9,
      }}
    >
      <span className="rounded-full" style={{ background: color, width: 5, height: 5 }} />
      {TIER_LABELS[tier] || tier}
    </span>
  );
};

// ─── WR scale legend strip ───────────────────────────────────────
export const WrLegend = ({ note }) => (
  <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono uppercase tracking-wider text-text-primary/40">
    <span>WR</span>
    {WR_LEGEND.map((s, i) => (
      <span key={i} className="inline-flex items-center gap-1">
        <span className="w-4 h-3 rounded-sm border border-white/10" style={{ background: s.c }} />
        {s.l}
      </span>
    ))}
    {note && <span className="ml-2 text-text-primary/25 normal-case tracking-normal">· {note}</span>}
  </div>
);
