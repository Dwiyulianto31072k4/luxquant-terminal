// ================================================================
// icons.jsx — single source of truth for LuxQuant's inline SVG icons.
// Standardized stroke SVGs (no emoji). Everything uses currentColor so
// each icon inherits the text color of whatever wraps it. Pass a Tailwind
// size/color class as the only argument, e.g. Ic.trophy("w-4 h-4 text-amber-400").
// ================================================================

export const Ic = {
  // ── trade / signal core ──────────────────────────────────────
  target: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></svg>
  ),
  stop: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z" /><path d="M12 8v4.5" /><path d="M12 16h.01" /></svg>
  ),
  bars: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18" /><path d="M7 21v-7" /><path d="M12 21V8" /><path d="M17 21v-11" /></svg>
  ),
  camera: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9a2 2 0 0 1 2-2h1.5l1.2-1.8A1 1 0 0 1 8.5 4.7h7a1 1 0 0 1 .8.5L17.5 7H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.2" /></svg>
  ),
  clock: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ),
  bank: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18" /><path d="M4 10h16" /><path d="M5 10V21M9.5 10V21M14.5 10V21M19 10V21" /><path d="M12 3 4 7.5V10h16V7.5z" /></svg>
  ),
  link: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></svg>
  ),
  send: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>
  ),
  cpu: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 9h6v6H9z" /><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" /></svg>
  ),
  signal: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.9 16.1a7 7 0 0 1 0-9.9" /><path d="M19.1 6.2a7 7 0 0 1 0 9.9" /><path d="M7.8 13.2a3 3 0 0 1 0-4.2" /><path d="M16.2 9a3 3 0 0 1 0 4.2" /><circle cx="12" cy="11" r="1.6" /><path d="M12 12.5V20" /></svg>
  ),

  // ── links / social ───────────────────────────────────────────
  globe: (c = "w-3 h-3") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18" /></svg>
  ),
  xLogo: (c = "w-3 h-3") => (
    <svg className={c} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2H21.5l-7.51 8.59L23 22h-6.59l-5.16-6.75L5.34 22H2.08l8.03-9.18L1.5 2h6.76l4.67 6.17L18.244 2Zm-1.16 18h1.83L7.01 3.92H5.05L17.084 20Z" /></svg>
  ),
  chat: (c = "w-3 h-3") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" /></svg>
  ),
  code: (c = "w-3 h-3") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></svg>
  ),
  lock: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="11" width="17" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
  ),

  // ── history / stats ──────────────────────────────────────────
  trophy: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M5 4H4a2 2 0 0 0 0 4h1" /><path d="M19 4h1a2 2 0 0 1 0 4h-1" /></svg>
  ),
  trendUp: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8" /><path d="M16 7h5v5" /></svg>
  ),
  flame: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
  ),
  snowflake: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2v20M2 12h20M4.5 4.5l15 15M19.5 4.5l-15 15" /><path d="M12 6 9.5 4M12 6l2.5-2M12 18l-2.5 2M12 18l2.5 2M6 12 4 9.5M6 12l-2 2.5M18 12l2-2.5M18 12l2 2.5" /></svg>
  ),
  clipboard: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3" /></svg>
  ),
  inbox: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.5z" /></svg>
  ),

  // ── status / verdict ─────────────────────────────────────────
  check: (c = "w-3 h-3") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
  ),
  checkCircle: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>
  ),
  warn: (c = "w-3 h-3") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
  ),
  siren: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 18v-6a5 5 0 0 1 10 0v6" /><path d="M5 21h14" /><path d="M12 2v2" /><path d="M4.6 5.6 6 7M19.4 5.6 18 7" /></svg>
  ),

  // ── misc ─────────────────────────────────────────────────────
  zap: (c = "w-3 h-3") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></svg>
  ),
  arrowRight: (c = "w-3 h-3") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
  ),
  instagram: (c = "w-4 h-4") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>
  ),
  share: (c = "w-3.5 h-3.5") => (
    <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 17v-1a6 6 0 0 1 6-6h7" /><path d="M13 5l5 5-5 5" /></svg>
  ),
};

export default Ic;
