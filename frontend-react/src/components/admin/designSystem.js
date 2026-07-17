// src/components/admin/designSystem.js
//
// LuxQuant Admin — Design System
// ──────────────────────────────────────────────────────────────────────
// Single source of truth for visual tokens used across the admin/workspace
// surface. Theme-aware: values use CSS semantic channels so luxquant / dark /
// bright all render correctly without per-theme branches in components.
//
// Usage:
//   import { tokens, surface, semantic, typography } from './designSystem';
//   style={{ background: surface.raised.bg, border: `1px solid ${surface.raised.border}` }}
//

// ════════════════════════════════════════════════════════════════════
// 1. Color palette — brand + semantic (hex kept for tints that need alpha
//    via tint(); prefer CSS channels for surfaces/text).
// ════════════════════════════════════════════════════════════════════

export const palette = {
  gold: {
    50: '#f5ead0',
    100: '#e8d3a0',
    200: '#dcbc70',
    300: '#d4a853',
    400: '#b88f3f',
    500: '#8b6914',
    600: '#5e470e',
    700: '#3a2c08',
  },

  maroon: {
    900: '#0a0506',
    800: '#12090d',
    700: '#1a0d12',
    600: '#241218',
  },

  warm: {
    50:  '#ffffff',
    100: '#f5f0e8',
    200: '#c9b59e',
    300: '#a8967e',
    400: '#8a7a6e',
    500: '#6b5c52',
    600: '#4a3f39',
    700: '#2d2622',
    800: '#1a1411',
  },

  green:  { 300: '#86efac', 400: '#34d399', 500: '#10b981', 700: '#065f46' },
  red:    { 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 700: '#991b1b' },
  amber:  { 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 700: '#92400e' },
  orange: { 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 700: '#9a3412' },
  blue:   { 300: '#93c5fd', 400: '#8a8a93', 500: '#3b82f6', 700: '#1e40af' },
  purple: { 300: '#c4b5fd', 400: '#8a8a93', 500: '#8b5cf6', 700: '#5b21b6' },
  violet: { 400: '#a855f7', 500: '#9333ea' },
  teal:   { 400: '#2dd4bf', 500: '#14b8a6' },

  channels: {
    telegram: '#229ED9',
    discord:  '#5865F2',
    google:   '#4285F4',
    email:    '#fbbf24',
  },
};

// ════════════════════════════════════════════════════════════════════
// 2. Surface presets — theme-safe (CSS channels)
// ════════════════════════════════════════════════════════════════════

export const surface = {
  sunken: {
    bg: 'rgb(var(--surface-secondary))',
    border: 'rgb(var(--ink) / 0.08)',
    borderActive: 'rgb(var(--accent) / 0.35)',
  },
  premium: {
    bg: 'rgb(var(--surface-raised))',
    border: 'rgb(var(--ink) / 0.09)',
    hover: 'rgb(var(--ink) / 0.06)',
    borderHover: 'rgb(var(--ink) / 0.16)',
    topGlow: 'rgb(var(--ink) / 0.1)',
    shadowHover: '0 14px 34px rgb(var(--scrim) / 0.18)',
  },
  base: {
    bg: 'rgb(var(--ink) / 0.02)',
    border: 'rgb(var(--ink) / 0.08)',
    hover: 'rgb(var(--ink) / 0.04)',
    topGlow: 'rgb(var(--ink) / 0.06)',
  },
  raised: {
    bg: 'rgb(var(--ink) / 0.03)',
    border: 'rgb(var(--ink) / 0.1)',
    hover: 'rgb(var(--ink) / 0.05)',
    topGlow: 'rgb(var(--ink) / 0.08)',
  },
  glass: {
    bg: 'rgb(var(--surface-secondary))',
    bgOverlay: 'rgb(var(--scrim) / 0.72)',
    border: 'rgb(var(--ink) / 0.12)',
    borderSubtle: 'rgb(var(--ink) / 0.09)',
  },
  intent: (color, intensity = 0.025) => ({
    bg: `${color}${intensity === 0.025 ? '06' : '0f'}`,
    border: `${color}1f`,
    borderStrong: `${color}40`,
  }),
};

// ════════════════════════════════════════════════════════════════════
// 3. Semantic tokens
// ════════════════════════════════════════════════════════════════════

export const semantic = {
  role: {
    admin:      { color: palette.violet[400], bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)' },
    subscriber: { color: palette.green[400],  bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)' },
    free:       { color: 'rgb(var(--fg-muted))', bg: 'rgb(var(--ink) / 0.06)', border: 'rgb(var(--ink) / 0.14)' },
  },
  status: {
    success: { color: palette.green[400],  bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)' },
    danger:  { color: palette.red[400],    bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)' },
    warning: { color: palette.amber[400],  bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.3)' },
    pending: { color: palette.amber[400],  bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.3)' },
    info:    { color: palette.blue[400],   bg: 'rgb(var(--ink) / 0.06)', border: 'rgb(var(--ink) / 0.14)' },
    neutral: { color: 'rgb(var(--fg-muted))', bg: 'rgb(var(--ink) / 0.05)', border: 'rgb(var(--ink) / 0.12)' },
    urgent:  { color: palette.orange[400], bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.3)' },
  },
  accent: {
    muted:  'rgb(var(--fg-muted))',
    blue:   'rgb(var(--fg-muted))',
    green:  palette.green[400],
    gold:   'rgb(var(--fg-muted))',
    purple: 'rgb(var(--fg-muted))',
    orange: palette.orange[400],
    red:    palette.red[400],
    teal:   'rgb(var(--fg-muted))',
    amber:  palette.amber[400],
  },
};

// ════════════════════════════════════════════════════════════════════
// 4. Typography — theme-safe channels
// ════════════════════════════════════════════════════════════════════

export const typography = {
  label: {
    color: 'rgb(var(--fg-muted))',
    className: 'text-[10px] uppercase tracking-wider font-semibold',
  },
  labelMicro: {
    color: 'rgb(var(--fg-muted) / 0.85)',
    className: 'text-[9px] uppercase tracking-wider font-semibold',
  },
  body: {
    primary: 'rgb(var(--fg))',
    secondary: 'rgb(var(--fg-secondary))',
    muted: 'rgb(var(--fg-muted))',
    faint: 'rgb(var(--fg-muted) / 0.75)',
    deep: 'rgb(var(--fg-secondary))',
  },
};

export const textColor = typography.body;

// ════════════════════════════════════════════════════════════════════
// 5. Layout & rhythm
// ════════════════════════════════════════════════════════════════════

export const radius = {
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  pill: '999px',
};

export const elevation = {
  topHairline: (color = 'rgb(var(--ink) / 0.08)') =>
    `linear-gradient(to right, transparent, ${color}, transparent)`,
  goldHairline: (alpha = 0.12) =>
    `linear-gradient(to right, transparent, rgb(var(--ink) / ${alpha}), transparent)`,
  modal: '0 25px 50px -12px rgb(var(--scrim) / 0.45), 0 0 0 1px rgb(var(--ink) / 0.08)',
  floating: '0 12px 32px -8px rgb(var(--scrim) / 0.28), 0 0 0 1px rgb(var(--ink) / 0.08)',
  cardHover: '0 14px 34px rgb(var(--scrim) / 0.18)',
};

export const gradient = {
  goldText: 'linear-gradient(135deg, rgb(var(--fg)), rgb(var(--fg-secondary)) 55%, rgb(var(--fg-muted)))',
  goldFill: 'rgb(var(--fg) / 0.92)',
  goldBar:
    'linear-gradient(180deg, rgb(var(--ink) / 0.4) 0%, rgb(var(--ink) / 0.2) 55%, rgb(var(--ink) / 0.1) 100%)',
};

/** Decorative icon/chip ink — not semantic PnL */
export const NEUTRAL = 'rgb(var(--fg-muted))';

// ════════════════════════════════════════════════════════════════════
// 6. Helpers
// ════════════════════════════════════════════════════════════════════

export const tint = (hex, alpha) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

export const tilePreset = (accentHex, { active = false } = {}) => ({
  background: active ? tint(accentHex, 0.12) : tint(accentHex, 0.04),
  border: `1px solid ${active ? tint(accentHex, 0.35) : tint(accentHex, 0.18)}`,
  color: accentHex,
});

export const motion = {
  fast: 'all 120ms ease-out',
  base: 'all 180ms ease-out',
  slow: 'all 280ms cubic-bezier(0.16, 1, 0.3, 1)',
  pressable: { transform: 'scale(0.97)' },
};

export const tokens = {
  palette,
  surface,
  semantic,
  typography,
  textColor,
  radius,
  elevation,
  gradient,
  motion,
  tint,
  tilePreset,
  NEUTRAL,
};

export default tokens;
