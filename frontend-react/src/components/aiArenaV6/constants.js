// frontend-react/src/components/aiArenaV6/constants.js
// Shared design tokens, colors, helpers for AI Arena v6 components.

// ════════════════════════════════════════
// Colors (matches existing LuxQuant dark + gold theme)
// ════════════════════════════════════════

export const COLORS = {
  bgPrimary: '#0a0d12',
  bgSecondary: 'rgba(15, 18, 24, 0.7)',
  bgCard: 'rgba(20, 23, 30, 0.8)',
  bgElevated: 'rgba(28, 32, 40, 0.6)',

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
