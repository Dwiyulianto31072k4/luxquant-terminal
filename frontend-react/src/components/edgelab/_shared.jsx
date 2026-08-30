// src/components/edgelab/_shared.jsx
// ════════════════════════════════════════════════════════════════
// Shared primitives for Edge Lab tabs (v2 UX rebuild)
// - Panel : card chrome with gold top-hairline
// - Methodology : collapsible "how this works" (default collapsed)
// - InsightBand : 1-3 auto-surfaced takeaways at top of each tab
// - EmptyState : consistent empty panel
// - tier helpers : colors, labels
// ════════════════════════════════════════════════════════════════


// Methodology / InsightBand / ReliabilityBadge now live in the Terminal's
// design system, so every surface can use them rather than just Edge Lab.
// Re-exported here so the seven tabs that already import them keep working
// unchanged; their colours moved from Tailwind defaults onto --pos / --accent
// / --neg on the way, which is why the badges now match the rest of the app.
export {
  Methodology,
  InsightBand,
  ReliabilityBadge,
  TIER_COLORS,
  TIER_LABELS,
} from "../terminal/vizShared";

// ─── Win-rate → color (solid Binance green/red — no pastel alpha) ─
// Mix deep slate → full #0ECB81 / #F6465D so cells stay sharp on any theme.
const _WR_M = [32, 38, 48];
const _WR_G = [14, 203, 129];
const _WR_R = [246, 70, 93];
const _mix3 = (a, b, t) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;

export const wrColor = (wr, total = 1) => {
  if (!total) return `rgb(${_WR_M[0]},${_WR_M[1]},${_WR_M[2]})`;
  if (wr === null || wr === undefined) return `rgb(${_WR_M[0]},${_WR_M[1]},${_WR_M[2]})`;
  if (wr >= 90) return _mix3(_WR_M, _WR_G, 1.0);
  if (wr >= 75) return _mix3(_WR_M, _WR_G, 0.82);
  if (wr >= 60) return _mix3(_WR_M, _WR_G, 0.58);
  if (wr >= 50) return _mix3(_WR_M, _WR_G, 0.32);
  if (wr >= 35) return _mix3(_WR_M, _WR_R, 0.48);
  return _mix3(_WR_M, _WR_R, 0.85);
};

export const WR_LEGEND = [
  { l: "<35", c: _mix3(_WR_M, _WR_R, 0.85) },
  { l: "35–50", c: _mix3(_WR_M, _WR_R, 0.48) },
  { l: "50–60", c: _mix3(_WR_M, _WR_G, 0.32) },
  { l: "60–75", c: _mix3(_WR_M, _WR_G, 0.58) },
  { l: "75–90", c: _mix3(_WR_M, _WR_G, 0.82) },
  { l: "≥90", c: _mix3(_WR_M, _WR_G, 1.0) },
];

// ─── Panel chrome ────────────────────────────────────────────────
export const Panel = ({ children, className = "", title, meta, pad = true }) => (
  <div className={`relative rounded-lg bg-surface-raised border border-ink/[0.07] ${className}`}>
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink/35 to-transparent" />
    {title && (
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-ink/[0.05]">
        <div className="text-[10px] tracking-[0.22em] font-mono uppercase text-text-primary/45">
          {title}
        </div>
        {meta && (
          <div className="text-[9px] font-mono uppercase tracking-wider text-text-primary/30">
            {meta}
          </div>
        )}
      </div>
    )}
    {pad ? <div className="p-5">{children}</div> : children}
  </div>
);

// ─── Collapsible methodology ─────────────────────────────────────
// ─── Insight band — the headline takeaways ───────────────────────
// ─── Empty state ─────────────────────────────────────────────────
export const EmptyState = ({ title, hint }) => (
  <Panel pad>
    <div className="py-12 text-center">
      <div className="text-text-primary/30 text-sm font-mono uppercase tracking-wider">{title}</div>
      {hint && (
        <div className="text-text-primary/20 text-xs font-mono mt-2 normal-case">{hint}</div>
      )}
    </div>
  </Panel>
);

// ─── WR scale legend strip ───────────────────────────────────────
export const WrLegend = ({ note }) => (
  <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono uppercase tracking-wider text-text-primary/40">
    <span>WR</span>
    {WR_LEGEND.map((s, i) => (
      <span key={i} className="inline-flex items-center gap-1">
        <span className="w-4 h-3 rounded-sm border border-ink/10" style={{ background: s.c }} />
        {s.l}
      </span>
    ))}
    {note && (
      <span className="ml-2 text-text-primary/25 normal-case tracking-normal">· {note}</span>
    )}
  </div>
);
