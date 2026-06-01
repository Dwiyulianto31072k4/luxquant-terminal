// src/components/MoreMenuDropdown.jsx
// ════════════════════════════════════════════════════════════════
// More mega-menu — hover-triggered dropdown (CoinAnk-style)
//   - Opens on hover (cursor enters trigger), closes on leave (small delay)
//   - Column-per-category layout with compact icon + label ROWS
//     (no card boxes, no top hairline strip)
//   - Circular accent icon badges with hover glow bloom
//   - Burgundy panel matching the app theme
//   - Desktop only (rendered inside the lg-only nav)
//
// Public API mirrors what App.jsx already has: isActive, isPremium,
// isAdmin, premiumPaths, onNavigate, moreHasActive, label.
// ════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const MoreMenuDropdown = ({
  isActive,
  isPremium,
  isAdmin,
  premiumPaths = [],
  onNavigate,
  moreHasActive,
  label,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const closeTimer = useRef(null);

  const openNow = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 130);
  };

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  // Click outside → close
  useEffect(() => {
    const h = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // Esc → close
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setOpen(false); };
    if (open) window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);

  const go = (path) => {
    setOpen(false);
    onNavigate(path);
  };

  // ─── Icons (Lucide-style, single stroke, render in currentColor) ───
  const Icon = {
    signals: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17 L9 11 L13 15 L21 7" /><path d="M16 7 H21 V12" />
      </svg>
    ),
    autotrade: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="20" x2="21" y2="20" /><rect x="5" y="13" width="3" height="6" /><rect x="10.5" y="9" width="3" height="10" /><rect x="16" y="5" width="3" height="14" />
      </svg>
    ),
    aiArena: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8V4H8" /><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
      </svg>
    ),
    orderbook: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="8" height="16" rx="1" /><rect x="13" y="4" width="8" height="16" rx="1" />
        <line x1="5" y1="8" x2="9" y2="8" /><line x1="5" y1="12" x2="8" y2="12" /><line x1="5" y1="16" x2="9" y2="16" />
        <line x1="15" y1="8" x2="19" y2="8" /><line x1="15" y1="12" x2="18" y2="12" /><line x1="15" y1="16" x2="19" y2="16" />
      </svg>
    ),
    markets: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 4v3M8 17v3" /><rect x="6" y="7" width="4" height="10" rx="1" /><path d="M16 2v4M16 18v4" /><rect x="14" y="6" width="4" height="12" rx="1" />
      </svg>
    ),
    pulse: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12 H7 L9 6 L13 18 L15 12 H21" />
      </svg>
    ),
    onchain: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="12" cy="14" r="2.5" /><circle cx="6" cy="20" r="1.8" /><circle cx="18" cy="20" r="1.8" />
        <line x1="6" y1="8" x2="11" y2="13" /><line x1="18" y1="8" x2="13" y2="13" /><line x1="11" y1="15.5" x2="7" y2="19" /><line x1="13" y1="15.5" x2="17" y2="19" />
      </svg>
    ),
    moneyFlow: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0" />
        <path d="M3 12c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0" />
        <path d="M3 17c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0" />
      </svg>
    ),
    bitcoin: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><path d="M10 7 V8 M10 16 V17 M13 7 V8 M13 16 V17" /><path d="M9 8 H14 a2 2 0 010 4 H9 M9 12 H15 a2 2 0 010 4 H9 V8 z" />
      </svg>
    ),
    news: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="14" height="15" rx="1" /><path d="M17 8 H20 a1 1 0 011 1 V19 a1 1 0 01-1 1 H17" />
        <line x1="6" y1="9" x2="14" y2="9" /><line x1="6" y1="12" x2="14" y2="12" /><line x1="6" y1="15" x2="11" y2="15" />
      </svg>
    ),
    calendar: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="16" rx="1" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" />
        <circle cx="8" cy="14" r="0.8" fill="currentColor" /><circle cx="12" cy="14" r="0.8" fill="currentColor" /><circle cx="16" cy="14" r="0.8" fill="currentColor" /><circle cx="8" cy="17.5" r="0.8" fill="currentColor" />
      </svg>
    ),
    analytics: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 7l-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" />
      </svg>
    ),
    dailyPerformance: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="16" rx="1" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" />
        <line x1="7" y1="17" x2="7" y2="15" /><line x1="11" y1="17" x2="11" y2="13.5" /><line x1="15" y1="17" x2="15" y2="12" /><line x1="19" y1="17" x2="19" y2="11" />
        <path d="M7 15 L11 13.5 L15 12 L19 11" strokeOpacity="0.5" />
      </svg>
    ),
    edgeLab: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="9" y1="3" x2="15" y2="3" /><path d="M10 3 v6 L4.6 18.4 A1 1 0 005.5 20 h13 a1 1 0 00.9-1.6 L14 9 V3" />
        <line x1="7" y1="14.5" x2="17" y2="14.5" /><circle cx="11" cy="17" r="0.6" fill="currentColor" /><circle cx="14" cy="16" r="0.5" fill="currentColor" />
      </svg>
    ),
    journal: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="14" height="18" rx="1" /><line x1="8" y1="3" x2="8" y2="21" /><line x1="11" y1="9" x2="15" y2="9" /><line x1="11" y1="13" x2="15" y2="13" /><path d="M11 17 L13 18 L16 15" />
      </svg>
    ),
    portfolio: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="7" width="18" height="14" rx="1" /><path d="M9 7 V5 a1 1 0 011-1 H14 a1 1 0 011 1 V7" /><line x1="3" y1="13" x2="21" y2="13" />
      </svg>
    ),
    watchlist: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 L14.5 8.5 L20.5 9.3 L16 13.5 L17.2 19.5 L12 16.5 L6.8 19.5 L8 13.5 L3.5 9.3 L9.5 8.5 Z" />
      </svg>
    ),
    tips: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4 H12 V20 H4 z" /><path d="M12 4 H20 V20 H12 z" /><line x1="7" y1="9" x2="9" y2="9" /><line x1="15" y1="9" x2="17" y2="9" /><line x1="7" y1="13" x2="9" y2="13" /><line x1="15" y1="13" x2="17" y2="13" />
      </svg>
    ),
    referral: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="9" width="18" height="11" rx="1" /><path d="M9 9 V6.5 a2.5 2.5 0 015 0 V9" /><path d="M11 9 V6.5 a2.5 2.5 0 015 0 V9" /><line x1="12" y1="9" x2="12" y2="20" /><line x1="3" y1="13.5" x2="21" y2="13.5" />
      </svg>
    ),
    admin: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 L20 6 V12 c0 4-3 7-8 9 c-5-2-8-5-8-9 V6 Z" /><path d="M9 12 L11 14 L15 9.5" />
      </svg>
    ),
  };

  // ─── Category accents (RGB triplets) — warm, theme-cohesive ───
  const ACCENT = { gold: '212,168,83', amber: '224,154,72', emerald: '86,186,128' };

  const groups = [
    {
      key: 'trading',
      label: t('mfm.group_trading', { defaultValue: 'Trading' }),
      accent: ACCENT.gold,
      items: [
        { path: '/signals',   icon: Icon.signals,   label: t('mfm.signals') },
        { path: '/autotrade', icon: Icon.autotrade, label: t('mfm.autotrade') },
        { path: '/ai-arena',  icon: Icon.aiArena,   label: t('mfm.ai_arena') },
        { path: '/orderbook', icon: Icon.orderbook, label: t('mfm.orderbook') },
      ],
    },
    {
      key: 'market',
      label: t('mfm.group_market', { defaultValue: 'Market & Data' }),
      accent: ACCENT.amber,
      items: [
        { path: '/markets',      icon: Icon.markets,   label: t('mfm.markets') },
        { path: '/market-pulse', icon: Icon.pulse,     label: t('mfm.pulse') },
        { path: '/onchain',      icon: Icon.onchain,   label: t('mfm.onchain') },
        { path: '/money-flow',   icon: Icon.moneyFlow, label: t('mfm.money_flow', { defaultValue: 'Money Flow' }) },
        { path: '/bitcoin',      icon: Icon.bitcoin,   label: t('mfm.bitcoin') },
        { path: '/crypto-news',  icon: Icon.news,      label: t('mfm.news') },
        { path: '/calendar',     icon: Icon.calendar,  label: t('mfm.calendar') },
      ],
    },
    {
      key: 'performance',
      label: t('mfm.group_performance', { defaultValue: 'Performance' }),
      accent: ACCENT.emerald,
      items: [
        { path: '/analytics',         icon: Icon.analytics,        label: t('mfm.analytics') },
        { path: '/daily-performance', icon: Icon.dailyPerformance, label: t('mfm.daily_perf', { defaultValue: 'Daily Performance' }) },
        { path: '/daily-performance/edge-lab', icon: Icon.edgeLab, label: t('mfm.edge_lab', { defaultValue: 'Edge Lab' }) },
        { path: '/journal',   icon: Icon.journal,   label: t('mfm.journal') },
        { path: '/portfolio', icon: Icon.portfolio, label: t('mfm.portfolio') },
      ],
    },
    {
      key: 'personal',
      label: t('mfm.group_personal', { defaultValue: 'Personal' }),
      accent: ACCENT.gold,
      items: [
        { path: '/watchlist', icon: Icon.watchlist, label: t('mfm.watchlist') },
        { path: '/tips',      icon: Icon.tips,      label: t('mfm.tips') },
        { path: '/referral',  icon: Icon.referral,  label: t('mfm.referral') },
        ...(isAdmin ? [{ path: '/admin', icon: Icon.admin, label: t('mfm.admin'), isAdmin: true }] : []),
      ],
    },
  ];

  // ─── Single row item ───
  const Row = ({ item, accent }) => {
    const active = isActive(item.path);
    const isPro = premiumPaths.includes(item.path) && !isPremium;
    const acc = item.isAdmin ? '248,113,113' : accent;

    return (
      <button
        onClick={() => go(item.path)}
        className="group w-full flex items-center gap-2.5 pl-1 pr-2 py-1.5 rounded-md hover:bg-white/[0.045] transition-colors text-left"
      >
        {/* Circular accent badge (no card, no top strip) */}
        <span className="relative flex-shrink-0">
          <span
            className="absolute -inset-1 rounded-full blur-md opacity-0 group-hover:opacity-70 transition-opacity duration-300 pointer-events-none"
            style={{ background: `radial-gradient(circle, rgba(${acc},0.5), transparent 70%)` }}
          />
          <span
            className="relative w-8 h-8 rounded-full flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.08]"
            style={{
              background: `radial-gradient(circle at 32% 26%, rgba(${acc},0.30), rgba(${acc},0.05) 72%)`,
              border: `1px solid rgba(${acc},${active ? 0.55 : 0.26})`,
              boxShadow: active ? `0 0 11px rgba(${acc},0.30)` : 'none',
            }}
          >
            <span className="w-4 h-4" style={{ color: `rgb(${acc})` }}>{item.icon}</span>
          </span>
        </span>

        {/* Label */}
        <span className={`flex-1 min-w-0 text-[12.5px] truncate transition-colors ${
          active ? 'text-gold-primary' : 'text-text-secondary group-hover:text-white'
        }`}>
          {item.label}
        </span>

        {/* Active dot OR PRO tag */}
        {active ? (
          <span
            className="w-1.5 h-1.5 rounded-full bg-gold-primary flex-shrink-0"
            style={{ boxShadow: '0 0 6px rgba(212,168,83,0.85)' }}
          />
        ) : isPro ? (
          <span className="font-mono text-[8px] tracking-[0.14em] uppercase px-1 py-0.5 bg-gold-primary/10 text-gold-primary/80 border border-gold-primary/25 rounded-sm flex-shrink-0">
            PRO
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
    >
      {/* Trigger button (matches the other nav items) */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`relative flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-md border transition-all duration-150 ${
          moreHasActive || open
            ? 'text-white border-transparent'
            : 'text-text-secondary border-transparent hover:text-white hover:bg-white/[0.05] hover:border-white/[0.08]'
        }`}
      >
        <span>{label}</span>
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {moreHasActive && (
          <span className="absolute left-3 right-3 -bottom-[16px] h-[2px] bg-white" />
        )}
      </button>

      {/* Dropdown panel (pt-3 = invisible hover-bridge to button) */}
      <div
        className={`absolute right-0 top-full z-[60] pt-3 transition-all duration-200 ${
          open
            ? 'opacity-100 translate-y-0 visible'
            : 'opacity-0 -translate-y-1 invisible pointer-events-none'
        }`}
      >
        <div
          className="relative w-[820px] max-w-[92vw] rounded-lg border border-white/[0.07] shadow-2xl shadow-black/50 overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #1a0a0c 0%, #120608 55%, #0d0405 100%)' }}
        >
          {/* Ambient depth glows */}
          <span className="absolute -top-20 -left-16 w-72 h-72 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(139,26,26,0.16), transparent 70%)' }} />
          <span className="absolute -bottom-20 -right-16 w-72 h-72 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(212,168,83,0.05), transparent 70%)' }} />
          {/* Top accent (panel edge) */}
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />

          <div className="relative grid grid-cols-4 gap-x-5 p-5">
            {groups.map((group) => (
              <div key={group.key} className="min-w-0">
                {/* Column header */}
                <div className="flex items-center gap-2 px-1 mb-2.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                    style={{ background: `rgb(${group.accent})`, boxShadow: `0 0 6px rgba(${group.accent},0.6)` }}
                  />
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.2em]"
                    style={{ color: `rgba(${group.accent},0.9)` }}
                  >
                    {group.label}
                  </span>
                </div>
                {/* Rows */}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <Row key={item.path} item={item} accent={group.accent} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MoreMenuDropdown;