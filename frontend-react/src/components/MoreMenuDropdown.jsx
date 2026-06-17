// src/components/MoreMenuDropdown.jsx
// ════════════════════════════════════════════════════════════════
// More mega-menu — hover-triggered dropdown (Stripe/Binance-style).
//   - Bare SVG icons (no circular badges, no glow bloom): the colour
//     lives in the icon stroke — white at rest, full-white on hover —
//     against the dark burgundy panel for contrast.
//   - Each item is a two-tier row: label + one-line description, so the
//     menu reads like a directory, not a list of links.
//   - One restrained accent (gold) used only for the active indicator
//     and the column dots — never per-group rainbow colours.
//   - 3 columns; contained panel width (not full-bleed).
//
// Public API unchanged — App.jsx needs no edits:
//   isActive, isPremium, isAdmin, premiumPaths, onNavigate,
//   moreHasActive, label.
//
// NOTE: Performance is now ONE entry (/performance) — Analytics, Daily
// Performance and Edge Lab were unified into that hub's sub-tabs.
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

  // ─── Icons — Lucide-style, single 1.5 stroke, render in currentColor ───
  // Consistent visual weight & rhythm across the whole set.
  const Icon = {
    signals: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    autotrade: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="7" width="11.5" height="9.5" rx="2.5" />
        <path d="M9.25 7 V4.5" /><circle cx="9.25" cy="3.4" r="0.85" />
        <circle cx="7" cy="11.3" r="1" /><circle cx="11.5" cy="11.3" r="1" />
        <path d="M3.5 11 H2.2 M15 11 H16.3" />
        <circle cx="17.8" cy="17.3" r="2.1" />
        <path d="M17.8 14.6 v0.8 M17.8 20 v-0.8 M15.1 17.3 h0.8 M20.5 17.3 h-0.8 M16 15.5 l0.55 0.55 M19.6 19.1 l-0.55 -0.55 M19.6 15.5 l-0.55 0.55 M16 19.1 l0.55 -0.55" />
      </svg>
    ),
    aiResearch: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="6" /><path d="M15.5 15.5 L21 21" /><path d="M11 8.5 v5 M8.5 11 h5" strokeOpacity="0.55" />
      </svg>
    ),
    orderbook: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="6" x2="13" y2="6" /><line x1="4" y1="10" x2="10" y2="10" />
        <line x1="4" y1="14" x2="11" y2="14" /><line x1="4" y1="18" x2="9" y2="18" />
        <line x1="18" y1="4" x2="18" y2="20" /><path d="M15.5 17 L18 20 L20.5 17" />
      </svg>
    ),
    markets: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="8" width="4" height="11" rx="1" /><path d="M7 8 V5 M7 19 v0" />
        <rect x="15" y="4" width="4" height="13" rx="1" /><path d="M17 4 V2 M17 17 v3" />
      </svg>
    ),
    pulse: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12 H7 L9 6 L13 18 L15 12 H21" />
      </svg>
    ),
    onchain: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="12" cy="14" r="2.4" /><circle cx="6" cy="20" r="1.8" /><circle cx="18" cy="20" r="1.8" />
        <line x1="7.4" y1="7.4" x2="10.4" y2="12.2" /><line x1="16.6" y1="7.4" x2="13.6" y2="12.2" /><line x1="10.6" y1="15.8" x2="7.2" y2="18.4" /><line x1="13.4" y1="15.8" x2="16.8" y2="18.4" />
      </svg>
    ),
    moneyFlow: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0" />
        <path d="M3 14c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0" />
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
    performance: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3 v18 h18" /><path d="M7 14 l4-4 4 4 6-6" /><path d="M17 8 h4 v4" />
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
        <path d="M9 18 h6 M10 21 h4" /><path d="M12 3 a6 6 0 0 1 4 10.5 c-0.7 0.7-1 1.3-1 2.5 H9 c0-1.2-0.3-1.8-1-2.5 A6 6 0 0 1 12 3 z" />
      </svg>
    ),
    referral: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="9" r="3" /><path d="M3 19 a5 5 0 0 1 10 0" /><path d="M16 7 h5 M18.5 4.5 v5" strokeOpacity="0.7" /><path d="M16 14 a4 4 0 0 1 5 4" />
      </svg>
    ),
    apiKeys: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7.5" cy="15.5" r="3.5" /><path d="M10 13 L20 3 M17 6 L20 9 M14 9 L16 11" />
      </svg>
    ),
    admin: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 L20 6 V12 c0 4-3 7-8 9 c-5-2-8-5-8-9 V6 Z" /><path d="M9 12 L11 14 L15 9.5" />
      </svg>
    ),
  };

  // ─── Groups: label + one-line description per item ───
  // Descriptions say what the thing does, in plain terms (no selling).
  const groups = [
    {
      key: 'trading',
      label: t('mfm.group_trading', { defaultValue: 'Trading' }),
      items: [
        { path: '/signals',   icon: Icon.signals,   label: t('mfm.signals'),   desc: 'Live calls with entries & targets' },
        { path: '/autotrade', icon: Icon.autotrade, label: t('mfm.autotrade'), desc: 'Automated signal execution' },
        { path: '/ai-arena',  icon: Icon.aiResearch, label: t('mfm.ai_arena', { defaultValue: 'AI Research' }), desc: 'AI model trade analysis' },
        { path: '/orderbook', icon: Icon.orderbook, label: t('mfm.orderbook'), desc: 'Live depth & order flow' },
      ],
    },
    {
      key: 'market',
      label: t('mfm.group_market', { defaultValue: 'Market & Data' }),
      items: [
        { path: '/markets',      icon: Icon.markets,   label: t('mfm.markets'),   desc: 'Prices across every pair' },
        { path: '/market-pulse', icon: Icon.pulse,     label: t('mfm.pulse'),     desc: 'Real-time sentiment & momentum' },
        { path: '/onchain',      icon: Icon.onchain,   label: t('mfm.onchain'),   desc: 'Wallet & whale activity' },
        { path: '/money-flow',   icon: Icon.moneyFlow, label: t('mfm.money_flow', { defaultValue: 'Money Flow' }), desc: 'Sector & capital rotation' },
        { path: '/bitcoin',      icon: Icon.bitcoin,   label: t('mfm.bitcoin'),   desc: 'BTC dominance & macro view' },
        { path: '/crypto-news',  icon: Icon.news,      label: t('mfm.news'),      desc: 'Curated market headlines' },
        { path: '/calendar',     icon: Icon.calendar,  label: t('mfm.calendar'),  desc: 'Macro events & releases' },
      ],
    },
    {
      key: 'performance',
      label: t('mfm.group_performance', { defaultValue: 'Performance' }),
      items: [
        { path: '/performance', icon: Icon.performance, label: t('mfm.performance', { defaultValue: 'Performance' }), desc: 'Track record, daily & research' },
        { path: '/journal',     icon: Icon.journal,     label: t('mfm.journal'),   desc: 'Log & review your trades' },
        { path: '/portfolio',   icon: Icon.portfolio,   label: t('mfm.portfolio'), desc: 'PnL, equity & holdings' },
      ],
    },
    {
      key: 'personal',
      label: t('mfm.group_personal', { defaultValue: 'Personal' }),
      items: [
        { path: '/watchlist', icon: Icon.watchlist, label: t('mfm.watchlist'), desc: 'Pairs you follow' },
        { path: '/tips',      icon: Icon.tips,      label: t('mfm.tips'),      desc: 'Guides & how-tos' },
        { path: '/referral',  icon: Icon.referral,  label: t('mfm.referral'),  desc: 'Invite & earn rewards' },
        { path: '/api-keys',  icon: Icon.apiKeys,   label: t('mfm.api_keys', { defaultValue: 'API Keys' }), desc: 'Programmatic access' },
        ...(isAdmin ? [{ path: '/admin', icon: Icon.admin, label: t('mfm.admin'), desc: 'Platform management', isAdmin: true }] : []),
      ],
    },
  ];

  // 3 columns: Market gets its own; Trading + Personal share; Performance + (overflow)
  // Distribute groups across 3 columns by grouping into balanced stacks.
  const columns = [
    [groups[0], groups[2]],  // Trading + Performance
    [groups[1]],             // Market & Data (tallest)
    [groups[3]],             // Personal
  ];

  const GOLD = '212,168,83';

  // ─── Single row item ───
  const Row = ({ item }) => {
    const active = isActive(item.path);
    const isPro = premiumPaths.includes(item.path) && !isPremium;

    return (
      <button
        onClick={() => go(item.path)}
        className="group relative w-full flex items-start gap-3 pl-3 pr-2.5 py-2 rounded-md hover:bg-white/[0.05] transition-colors text-left"
      >
        {/* active indicator — thin gold bar on the left */}
        {active && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
            style={{ background: `rgb(${GOLD})`, boxShadow: `0 0 6px rgba(${GOLD},0.6)` }}
          />
        )}

        {/* bare icon — colour lives in the stroke, white→full-white on hover */}
        <span
          className={`mt-0.5 w-[18px] h-[18px] flex-shrink-0 transition-colors ${
            active
              ? 'text-gold-primary'
              : item.isAdmin
                ? 'text-red-400/70 group-hover:text-red-400'
                : 'text-white/70 group-hover:text-white'
          }`}
        >
          {item.icon}
        </span>

        {/* label + description */}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={`text-[13px] leading-tight truncate transition-colors ${
              active ? 'text-gold-primary' : 'text-white/90 group-hover:text-white'
            }`}>
              {item.label}
            </span>
          </span>
          {item.desc && (
            <span className="block text-[11px] leading-snug text-white/40 group-hover:text-white/55 transition-colors mt-0.5 truncate">
              {item.desc}
            </span>
          )}
        </span>
      </button>
    );
  };

  const Column = ({ stack }) => (
    <div className="min-w-0 space-y-5">
      {stack.map((group) => (
        <div key={group.key} className="min-w-0">
          {/* column header — gold dot + mono eyebrow */}
          <div className="flex items-center gap-2 px-3 mb-1.5">
            <span
              className="h-1 w-1 rounded-full flex-shrink-0"
              style={{ background: `rgb(${GOLD})`, boxShadow: `0 0 5px rgba(${GOLD},0.5)` }}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary/75">
              {group.label}
            </span>
          </div>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <Row key={item.path} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
    >
      {/* Trigger button */}
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

      {/* Dropdown panel (pt-3 = invisible hover-bridge) */}
      <div
        className={`absolute right-0 top-full z-[60] pt-3 transition-all duration-200 ${
          open
            ? 'opacity-100 translate-y-0 visible'
            : 'opacity-0 -translate-y-1 invisible pointer-events-none'
        }`}
      >
        <div
          className="relative w-[720px] max-w-[92vw] rounded-lg border border-white/[0.07] shadow-2xl shadow-black/50 overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #1a0a0c 0%, #120608 55%, #0d0405 100%)' }}
        >
          {/* Ambient depth glow — single, restrained */}
          <span className="absolute -top-24 -right-16 w-72 h-72 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(139,26,26,0.14), transparent 70%)' }} />
          {/* Top accent edge */}
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />

          <div className="relative grid grid-cols-3 gap-x-6 p-5">
            {columns.map((stack, i) => (
              <Column key={i} stack={stack} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MoreMenuDropdown;
