// frontend-react/src/components/aiArenaV6/constants.js
// Shared design tokens, colors, helpers for AI Arena v6 components.

// ════════════════════════════════════════
// Colors (matches existing LuxQuant dark + gold theme)
// ════════════════════════════════════════

export const COLORS = {
  // v6.3: lowered opacity — theme gradient passes through
  bgPrimary: 'transparent',
  bgSecondary: 'rgba(20, 23, 30, 0.30)',
  bgCard: 'rgba(20, 23, 30, 0.40)',
  bgElevated: 'rgba(28, 32, 40, 0.55)',

  border: 'rgba(212, 168, 83, 0.12)',
  borderSubtle: 'rgba(255, 255, 255, 0.06)',
  borderStrong: 'rgba(212, 168, 83, 0.25)',

  text: '#e8e6e1',
  textMuted: '#94a3b8',
  textFaint: 'rgba(232, 230, 225, 0.5)',

  gold: '#d4a853',
  goldDim: 'rgba(212, 168, 83, 0.6)',
  goldBg: 'rgba(212, 168, 83, 0.08)',

  bullish: '#4ade80',
  bullishBg: 'rgba(74, 222, 128, 0.08)',
  bullishBorder: 'rgba(74, 222, 128, 0.25)',

  bearish: '#f87171',
  bearishBg: 'rgba(248, 113, 113, 0.08)',
  bearishBorder: 'rgba(248, 113, 113, 0.25)',

  neutral: '#94a3b8',
  neutralBg: 'rgba(148, 163, 184, 0.08)',
  neutralBorder: 'rgba(148, 163, 184, 0.2)',

  cautious: '#fbbf24',
  cautiousBg: 'rgba(251, 191, 36, 0.08)',
  cautiousBorder: 'rgba(251, 191, 36, 0.25)',

  severityHigh: '#f87171',
  severityMedium: '#fbbf24',
  severityLow: '#94a3b8',

  outcomeHit: '#4ade80',
  outcomeMiss: '#f87171',
  outcomePending: '#94a3b8',
};

export const FONTS = {
  display: "'Fraunces', Georgia, serif",
  body: "'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', Consolas, monospace",
};

export function directionColor(direction) {
  switch ((direction || '').toLowerCase()) {
    case 'bullish': return COLORS.bullish;
    case 'bearish': return COLORS.bearish;
    case 'neutral': return COLORS.neutral;
    default: return COLORS.textMuted;
  }
}

export function directionBg(direction) {
  switch ((direction || '').toLowerCase()) {
    case 'bullish': return COLORS.bullishBg;
    case 'bearish': return COLORS.bearishBg;
    case 'neutral': return COLORS.neutralBg;
    default: return COLORS.bgCard;
  }
}

export function directionBorder(direction) {
  switch ((direction || '').toLowerCase()) {
    case 'bullish': return COLORS.bullishBorder;
    case 'bearish': return COLORS.bearishBorder;
    case 'neutral': return COLORS.neutralBorder;
    default: return COLORS.border;
  }
}

export function directionArrow(direction) {
  switch ((direction || '').toLowerCase()) {
    case 'bullish': return '↑';
    case 'bearish': return '↓';
    case 'neutral': return '→';
    default: return '·';
  }
}

export function directionLabel(direction) {
  if (!direction) return '—';
  return direction.charAt(0).toUpperCase() + direction.slice(1);
}

export function severityColor(severity) {
  switch ((severity || '').toLowerCase()) {
    case 'high': return COLORS.severityHigh;
    case 'medium': return COLORS.severityMedium;
    case 'low': return COLORS.severityLow;
    default: return COLORS.textMuted;
  }
}

export function outcomeColor(outcome) {
  switch ((outcome || '').toLowerCase()) {
    case 'hit': return COLORS.outcomeHit;
    case 'miss': return COLORS.outcomeMiss;
    case 'pending': return COLORS.outcomePending;
    case 'expired': return COLORS.textFaint;
    default: return COLORS.textMuted;
  }
}

export function outcomeIcon(outcome) {
  switch ((outcome || '').toLowerCase()) {
    case 'hit': return '✓';
    case 'miss': return '✗';
    case 'pending': return '⏱';
    case 'expired': return '—';
    default: return '·';
  }
}

export const CYCLE_PHASES = [
  { key: 'DEEP_BOTTOM', label: 'Deep Bottom', range: [0, 10], color: '#22d3ee' },
  { key: 'ACCUMULATION', label: 'Accumulation', range: [10, 30], color: '#4ade80' },
  { key: 'EARLY_BULL', label: 'Early Bull', range: [30, 50], color: '#84cc16' },
  { key: 'MID_BULL', label: 'Mid Bull', range: [50, 70], color: '#d4a853' },
  { key: 'LATE_BULL', label: 'Late Bull', range: [70, 85], color: '#f97316' },
  { key: 'DISTRIBUTION', label: 'Distribution', range: [85, 95], color: '#ef4444' },
  { key: 'TOP', label: 'Top', range: [95, 100], color: '#dc2626' },
];

export function cycleColorFor(phaseKey) {
  const phase = CYCLE_PHASES.find((p) => p.key === phaseKey);
  return phase ? phase.color : COLORS.gold;
}

export function cycleLabelFor(phaseKey) {
  const phase = CYCLE_PHASES.find((p) => p.key === phaseKey);
  return phase ? phase.label : 'Unknown';
}

export function formatPrice(n) {
  if (n == null) return '—';
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatPriceRange(low, high) {
  if (low == null || high == null) return '—';
  return `${formatPrice(low)} – ${formatPrice(high)}`;
}

export function formatPct(n, decimals = 2) {
  if (n == null) return '—';
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(decimals)}%`;
}

export function formatDate(iso, opts = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const { withTime = true, short = false } = opts;
  if (short) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (withTime) {
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatRelativeTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ═══════════════════════════════════════════════════════════════════════
// v6 Phase 4 Batch 1 — additional exports
// ═══════════════════════════════════════════════════════════════════════
// These are convenience wrappers + new helpers required by:
//   - ThreeLayerConfluence.jsx
//   - VerdictLedger.jsx
//   - AIReasoningWalkthrough.jsx
// All existing exports above are preserved unchanged.

// ─────────────────────────────────────────────────────────────────────
// directionStyle — consolidated direction styling
// Wraps the existing directionColor / directionBg / directionBorder / directionArrow
// into a single object for ergonomic destructuring in JSX.
//
// Usage:
//   const dir = directionStyle(brief.direction);
//   <span style={{ backgroundColor: dir.bg, color: dir.fg }}>{dir.arrow}</span>
// ─────────────────────────────────────────────────────────────────────
export function directionStyle(direction) {
  return {
    fg: directionColor(direction),
    bg: directionBg(direction),
    border: directionBorder(direction),
    arrow: directionArrow(direction),
    label: directionLabel(direction),
  };
}

// ─────────────────────────────────────────────────────────────────────
// confidenceTier — bucket confidence percentage into tiers with color
// Tiers:
//   >= 70  → STRONG (emerald)
//   50-69  → MODERATE (gold)
//   < 50   → LOW (gray)
//   null   → UNKNOWN (gray)
// ─────────────────────────────────────────────────────────────────────
export function confidenceTier(confidence) {
  if (confidence == null || isNaN(confidence)) {
    return { label: "UNKNOWN", color: "rgba(255,255,255,0.4)" };
  }
  if (confidence >= 70) {
    return { label: "STRONG", color: "#22c55e" };
  }
  if (confidence >= 50) {
    return { label: "MODERATE", color: "#f5c451" };
  }
  return { label: "LOW", color: "#94a3b8" };
}

// ─────────────────────────────────────────────────────────────────────
// outcomeStyle — consolidated outcome badge styling
// Wraps existing outcomeColor / outcomeIcon plus adds bg/border/label
// for compact badge rendering in the ledger table.
// ─────────────────────────────────────────────────────────────────────
export function outcomeStyle(outcome) {
  const fg = outcomeColor(outcome);
  const lower = String(outcome || "").toLowerCase();
  switch (lower) {
    case "hit":
      return {
        fg,
        bg: "rgba(34, 197, 94, 0.12)",
        border: "rgba(34, 197, 94, 0.3)",
        label: "HIT",
      };
    case "miss":
      return {
        fg,
        bg: "rgba(239, 68, 68, 0.12)",
        border: "rgba(239, 68, 68, 0.3)",
        label: "MISS",
      };
    case "pending":
      return {
        fg,
        bg: "rgba(148, 163, 184, 0.1)",
        border: "rgba(148, 163, 184, 0.25)",
        label: "PEND",
      };
    case "expired":
      return {
        fg,
        bg: "rgba(115, 115, 115, 0.1)",
        border: "rgba(115, 115, 115, 0.25)",
        label: "EXP",
      };
    default:
      return {
        fg: "rgba(255,255,255,0.5)",
        bg: "rgba(255,255,255,0.05)",
        border: "rgba(255,255,255,0.1)",
        label: "—",
      };
  }
}

// ─────────────────────────────────────────────────────────────────────
// formatNumber — generic compact number formatter
// Use for non-price metrics (volumes, counts, ratios, etc.).
// For prices, use the existing formatPrice() instead.
//
// Examples:
//   formatNumber(1234)      → "1.2K"
//   formatNumber(1500000)   → "1.5M"
//   formatNumber(0.0042)    → "0.0042"
//   formatNumber(0.5)       → "0.50"
//   formatNumber(null)      → "—"
// ─────────────────────────────────────────────────────────────────────
export function formatNumber(n) {
  if (n == null || isNaN(n)) return "—";
  const num = Number(n);
  const abs = Math.abs(num);

  if (abs >= 1e12) return (num / 1e12).toFixed(1) + "T";
  if (abs >= 1e9) return (num / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (num / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (num / 1e3).toFixed(1) + "K";
  if (abs >= 1) return num.toFixed(2);
  if (abs >= 0.01) return num.toFixed(3);
  if (abs >= 0.0001) return num.toFixed(4);
  return num.toExponential(2);
}

// ─────────────────────────────────────────────────────────────────────
// formatTimestamp — short relative-or-absolute timestamp for tables
// Returns relative when fresh (< 24h), absolute date when older.
// Used in VerdictLedger history table where compactness matters.
//
// Examples:
//   formatTimestamp(now - 5min)   → "5m ago"
//   formatTimestamp(now - 3h)     → "3h ago"
//   formatTimestamp(now - 2d)     → "May 03, 14:22"
// ─────────────────────────────────────────────────────────────────────
export function formatTimestamp(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";

    const ageMs = Date.now() - d.getTime();
    const ageMin = Math.round(ageMs / 60000);

    // Within last 24h: relative
    if (ageMin < 60) return `${Math.max(1, ageMin)}m ago`;
    if (ageMin < 60 * 24) return `${Math.round(ageMin / 60)}h ago`;

    // Older: absolute
    return d.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

// ─────────────────────────────────────────────────────────────────────
// HORIZON_ORDER — canonical ordering of verdict horizons
// Used by VerdictLedger to render stat cards and outcome badges
// in a consistent left-to-right order.
// ─────────────────────────────────────────────────────────────────────
export const HORIZON_ORDER = ["24h", "72h", "7d", "30d"];

// ─────────────────────────────────────────────────────────────────────
// HORIZON_LABEL — human-friendly horizon labels
// ─────────────────────────────────────────────────────────────────────
export const HORIZON_LABEL = {
  "24h": "24 hours",
  "72h": "72 hours",
  "7d": "7 days",
  "30d": "30 days",
};
