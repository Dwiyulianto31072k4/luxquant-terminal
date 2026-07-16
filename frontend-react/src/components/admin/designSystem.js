// src/components/admin/designSystem.js
//
// LuxQuant Admin — Design System
// ──────────────────────────────────────────────────────────────────────
// Single source of truth for visual tokens used across the admin/workspace
// surface. Import these instead of hardcoding hex values inline.
//
// Conventions:
//   • All colors expressed as solid hex OR rgba() — never named colors.
//   • Surface tokens encode (background + border) pairs that work together.
//   • Semantic tokens (success, danger…) point at palette colors so the
//     palette can be re-themed without touching components.
//
// Usage:
//   import { tokens, surface, semantic, typography } from './designSystem';
//   style={{ background: surface.raised.bg, border: `1px solid ${surface.raised.border}` }}
//

// ════════════════════════════════════════════════════════════════════
// 1. Color palette — the brand
// ════════════════════════════════════════════════════════════════════

export const palette = {
  // ── Brand gold (primary accent) ──
  gold: {
    50: '#f5ead0',
    100: '#e8d3a0',
    200: '#dcbc70',
    300: '#d4a853', // ← primary
    400: '#b88f3f',
    500: '#8b6914',
    600: '#5e470e',
    700: '#3a2c08',
  },

  // ── Maroon (page background tone) ──
  maroon: {
    900: '#0a0506',
    800: '#12090d',
    700: '#1a0d12',
    600: '#241218',
  },

  // ── Warm grays (text, dividers) ──
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

  // ── Semantic palette ──
  green:  { 300: '#86efac', 400: '#34d399', 500: '#10b981', 700: '#065f46' },
  red:    { 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 700: '#991b1b' },
  amber:  { 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 700: '#92400e' },
  orange: { 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 700: '#9a3412' },
  blue:   { 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 700: '#1e40af' },
  purple: { 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 700: '#5b21b6' },
  violet: { 400: '#a855f7', 500: '#9333ea' },
  teal:   { 400: '#2dd4bf', 500: '#14b8a6' },

  // ── Brand channels ──
  channels: {
    telegram: '#229ED9',
    discord:  '#5865F2',
    google:   '#4285F4',
    email:    '#fbbf24',
  },
};

// ════════════════════════════════════════════════════════════════════
// 2. Surface presets — bg + border pairings
// ════════════════════════════════════════════════════════════════════
//
// Layers (lighter as you go up):
//   page    → maroon.900 (handled by app shell)
//   sunken  → rgba(0,0,0,0.3)        for inputs, dropdowns, nested fields
//   base    → rgba(255,255,255,0.015) for default cards & rows
//   raised  → rgba(255,255,255,0.025) for prominent cards & table headers
//   glass   → rgba(255,255,255,0.04)  for modals, drawers, floating bars
//

export const surface = {
  sunken: {
    bg: 'rgba(0,0,0,0.3)',
    border: 'rgba(255,255,255,0.06)',
    borderActive: 'rgba(212,168,83,0.35)',
  },
  // premium → matches the LandingPageV2 card language: a solid near-black
  // panel with a gold top-hairline and a lift-on-hover treatment. Use for
  // hero KPI cards, analytics panels, anything that should feel "showcase".
  premium: {
    bg: '#0a0805',
    border: 'rgba(255,255,255,0.07)',
    hover: 'rgba(255,255,255,0.10)',
    borderHover: 'rgba(212,168,83,0.25)',
    topGlow: 'rgba(212,168,83,0.45)', // gold hairline (landing signature)
    shadowHover: '0 14px 34px rgba(0,0,0,0.5)',
  },
  base: {
    bg: 'rgba(255,255,255,0.015)',
    border: 'rgba(255,255,255,0.06)',
    hover: 'rgba(255,255,255,0.025)',
    topGlow: 'rgba(255,255,255,0.04)', // for inset top hairline
  },
  raised: {
    bg: 'rgba(255,255,255,0.025)',
    border: 'rgba(255,255,255,0.08)',
    hover: 'rgba(255,255,255,0.04)',
    topGlow: 'rgba(255,255,255,0.06)',
  },
  glass: {
    bg: '#12090d',                       // solid base for modals
    bgOverlay: 'rgba(0,0,0,0.85)',       // backdrop
    border: 'rgba(212,168,83,0.25)',
    borderSubtle: 'rgba(255,255,255,0.08)',
  },
  // For sections (Contact Reach, Stale Alert) — tinted by intent
  intent: (color, intensity = 0.025) => ({
    bg: `${color}${intensity === 0.025 ? '06' : '0f'}`, // hex alpha (approx)
    border: `${color}1f`,                                // ≈ 0.12 alpha
    borderStrong: `${color}40`,                          // ≈ 0.25 alpha
  }),
};

// ════════════════════════════════════════════════════════════════════
// 3. Semantic tokens
// ════════════════════════════════════════════════════════════════════

export const semantic = {
  // role colors
  role: {
    admin:      { color: palette.violet[400], bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)' },
    subscriber: { color: palette.green[400],  bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.3)' },
    free:       { color: 'rgb(var(--fg-muted))',            bg: 'rgba(107,92,82,0.12)',  border: 'rgba(107,92,82,0.3)' },
  },
  // status (general)
  status: {
    success: { color: palette.green[400],  bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)' },
    danger:  { color: palette.red[400],    bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)' },
    warning: { color: palette.amber[400],  bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.3)' },
    pending: { color: palette.amber[400],  bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.3)' },
    info:    { color: palette.blue[400],   bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.3)' },
    neutral: { color: 'rgb(var(--fg-muted))',           bg: 'rgba(138,122,110,0.1)', border: 'rgba(138,122,110,0.3)' },
    urgent:  { color: palette.orange[400], bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.3)' },
  },
  // accent palette for stat tiles
  accent: {
    // Standard for decorative KPI chips: one muted monochrome voice.
    // Coloured accents below are reserved for SEMANTIC states only
    // (warning/orange, danger/red, success/green) — not decoration.
    muted:  '#8a8a93',
    blue:   palette.blue[400],
    green:  palette.green[400],
    gold:   palette.gold[300],
    purple: palette.violet[400],
    orange: palette.orange[400],
    red:    palette.red[400],
    teal:   palette.teal[400],
    amber:  palette.amber[400],
  },
};

// ════════════════════════════════════════════════════════════════════
// 4. Typography
// ════════════════════════════════════════════════════════════════════

export const typography = {
  // Labels — uppercase tracking, used on stat tile headers, table headers
  label: {
    color: 'rgba(255,255,255,0.4)',
    className: 'text-[10px] uppercase tracking-wider font-semibold',
  },
  labelMicro: {
    color: 'rgba(255,255,255,0.35)',
    className: 'text-[9px] uppercase tracking-wider font-semibold',
  },
  // Body
  body: {
    primary: '#ffffff',
    secondary: '#c9b59e',
    muted: '#8a7a6e',
    faint: '#6b5c52',
    deep: '#4a3f39',
  },
};

// Convenience text-color tokens
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
  // Subtle top hairline used on cards to suggest depth
  topHairline: (color = 'rgba(255,255,255,0.04)') =>
    `linear-gradient(to right, transparent, ${color}, transparent)`,
  // Gold top hairline — the LandingPageV2 signature accent line.
  goldHairline: (alpha = 0.45) =>
    `linear-gradient(to right, transparent, rgba(212,168,83,${alpha}), transparent)`,
  // Modal shadow — used on grant modal, drawer
  modal: '0 25px 50px -12px rgba(0,0,0,0.8), 0 0 0 1px rgba(212,168,83,0.1)',
  // Floating bar (bulk action)
  floating: '0 12px 32px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,168,83,0.12)',
  // Card lift on hover (premium surface)
  cardHover: '0 14px 34px rgba(0,0,0,0.5)',
};

// ════════════════════════════════════════════════════════════════════
// Gradients — reusable brand gradients (match LandingPageV2)
// ════════════════════════════════════════════════════════════════════

export const gradient = {
  // Gold text — apply with `background`, `WebkitBackgroundClip:'text'`,
  // `backgroundClip:'text'`, `color:'transparent'`.
  goldText: 'linear-gradient(135deg, #f0d890, #d4a853 50%, #b8860b)',
  // Solid gold CTA fill (buttons)
  goldFill: 'linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)',
  // Glossy 3D bar fill (MEXC-ish cylinder) used by Bar3D
  goldBar: 'linear-gradient(180deg, #f6e0a0 0%, #e7c373 34%, #cba24f 68%, #a8842f 100%)',
};

// ════════════════════════════════════════════════════════════════════
// 6. Helpers
// ════════════════════════════════════════════════════════════════════

/**
 * Hex → rgba with alpha. Used to build tinted backgrounds from accent colors.
 * tint('#d4a853', 0.12) → 'rgba(212,168,83,0.12)'
 */
export const tint = (hex, alpha) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

/**
 * Pick a complete tile preset (bg + border + accent) given an accent hex.
 * Used by StatTile, IntentCard, ReachCard for consistency.
 */
export const tilePreset = (accentHex, { active = false } = {}) => ({
  background: active ? tint(accentHex, 0.12) : tint(accentHex, 0.04),
  border: `1px solid ${active ? tint(accentHex, 0.35) : tint(accentHex, 0.18)}`,
  color: accentHex,
});

// ════════════════════════════════════════════════════════════════════
// 7. Animation
// ════════════════════════════════════════════════════════════════════

export const motion = {
  fast: 'all 120ms ease-out',
  base: 'all 180ms ease-out',
  slow: 'all 280ms cubic-bezier(0.16, 1, 0.3, 1)',
  // Subtle scale on press
  pressable: { transform: 'scale(0.97)' },
};

// ════════════════════════════════════════════════════════════════════
// Default export — convenience grouped object
// ════════════════════════════════════════════════════════════════════

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
};

export default tokens;
