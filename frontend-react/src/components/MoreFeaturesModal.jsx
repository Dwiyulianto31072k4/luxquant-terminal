// src/components/MoreFeaturesModal.jsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/**
 * MoreFeaturesModal — Web3 Luxe Edition (categorized)
 *
 * What changed vs the flat-grid version:
 * - Features are grouped into categories (Trading / Market & Data /
 *   Performance / Personal) with line-label-line headers, instead of one
 *   undifferentiated 20-item wall.
 * - Each item now has a CIRCULAR icon badge with a radial gold/accent
 *   gradient, hairline ring, inner highlight, and a soft glow that blooms
 *   on hover (reference-style "cover" badges).
 * - Surfaces shifted from near-black (#0a0805) to a subtle burgundy so the
 *   modal sits inside the app's dark-red gradient theme instead of fighting it.
 * - Staggered card reveal on open (animation-delay) for a premium entrance.
 * - Catalog completeness: added Money Flow (/money-flow) and Edge Lab
 *   (/daily-performance/edge-lab); removed the stale Whale entry (/whale now
 *   redirects to /money-flow in App.jsx).
 *
 * Public API is unchanged — App.jsx needs zero edits.
 * Can be embedded inline by passing `inline={true}` (skips the modal wrapper).
 */
const MoreFeaturesModal = ({
  isOpen,
  onClose,
  onNavigate,
  isActive,
  isPremium,
  isAdmin,
  premiumPaths = [],
  inline = false,
}) => {
  const { t } = useTranslation();
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!inline && isOpen) document.body.style.overflow = 'hidden';
    return () => { if (!inline) document.body.style.overflow = ''; };
  }, [isOpen, inline]);

  useEffect(() => {
    if (inline) return;
    const handleEsc = (e) => { if (e.key === 'Escape') handleClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, inline]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose?.();
    }, 200);
  };

  const handleItemClick = (path) => {
    if (inline) {
      onNavigate(path);
      return;
    }
    handleClose();
    setTimeout(() => onNavigate(path), 60);
  };

  if (!inline && !isOpen) return null;

  // ─── Icons (Lucide-style, single stroke, render in currentColor) ───
  const Icon = {
    signals: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17 L9 11 L13 15 L21 7" />
        <path d="M16 7 H21 V12" />
      </svg>
    ),
    autotrade: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="20" x2="21" y2="20" />
        <rect x="5" y="13" width="3" height="6" />
        <rect x="10.5" y="9" width="3" height="10" />
        <rect x="16" y="5" width="3" height="14" />
      </svg>
    ),
    aiArena: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8V4H8" />
        <rect x="4" y="8" width="16" height="12" rx="2" />
        <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
      </svg>
    ),
    orderbook: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="8" height="16" rx="1" />
        <rect x="13" y="4" width="8" height="16" rx="1" />
        <line x1="5" y1="8" x2="9" y2="8" />
        <line x1="5" y1="12" x2="8" y2="12" />
        <line x1="5" y1="16" x2="9" y2="16" />
        <line x1="15" y1="8" x2="19" y2="8" />
        <line x1="15" y1="12" x2="18" y2="12" />
        <line x1="15" y1="16" x2="19" y2="16" />
      </svg>
    ),
    markets: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 4v3M8 17v3" />
        <rect x="6" y="7" width="4" height="10" rx="1" />
        <path d="M16 2v4M16 18v4" />
        <rect x="14" y="6" width="4" height="12" rx="1" />
      </svg>
    ),
    pulse: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12 H7 L9 6 L13 18 L15 12 H21" />
      </svg>
    ),
    onchain: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="12" cy="14" r="2.5" />
        <circle cx="6" cy="20" r="1.8" />
        <circle cx="18" cy="20" r="1.8" />
        <line x1="6" y1="8" x2="11" y2="13" />
        <line x1="18" y1="8" x2="13" y2="13" />
        <line x1="11" y1="15.5" x2="7" y2="19" />
        <line x1="13" y1="15.5" x2="17" y2="19" />
      </svg>
    ),
    // Money Flow — stacked waves (capital rotation)
    moneyFlow: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0" />
        <path d="M3 12c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0" />
        <path d="M3 17c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 3 1.6 4.5 0" />
      </svg>
    ),
    bitcoin: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M10 7 V8 M10 16 V17 M13 7 V8 M13 16 V17" />
        <path d="M9 8 H14 a2 2 0 010 4 H9 M9 12 H15 a2 2 0 010 4 H9 V8 z" />
      </svg>
    ),
    news: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="14" height="15" rx="1" />
        <path d="M17 8 H20 a1 1 0 011 1 V19 a1 1 0 01-1 1 H17" />
        <line x1="6" y1="9" x2="14" y2="9" />
        <line x1="6" y1="12" x2="14" y2="12" />
        <line x1="6" y1="15" x2="11" y2="15" />
      </svg>
    ),
    calendar: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="16" rx="1" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="8" y1="3" x2="8" y2="7" />
        <line x1="16" y1="3" x2="16" y2="7" />
        <circle cx="8" cy="14" r="0.8" fill="currentColor" />
        <circle cx="12" cy="14" r="0.8" fill="currentColor" />
        <circle cx="16" cy="14" r="0.8" fill="currentColor" />
        <circle cx="8" cy="17.5" r="0.8" fill="currentColor" />
      </svg>
    ),
    analytics: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 7l-8.5 8.5-5-5L2 17" />
        <path d="M16 7h6v6" />
      </svg>
    ),
    // Daily Performance — calendar frame + ascending bars + trend line
    dailyPerformance: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="16" rx="1" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="8" y1="3" x2="8" y2="7" />
        <line x1="16" y1="3" x2="16" y2="7" />
        <line x1="7" y1="17" x2="7" y2="15" />
        <line x1="11" y1="17" x2="11" y2="13.5" />
        <line x1="15" y1="17" x2="15" y2="12" />
        <line x1="19" y1="17" x2="19" y2="11" />
        <path d="M7 15 L11 13.5 L15 12 L19 11" strokeOpacity="0.5" />
      </svg>
    ),
    // Edge Lab — conical flask with liquid line + bubbles (analytics lab)
    edgeLab: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="9" y1="3" x2="15" y2="3" />
        <path d="M10 3 v6 L4.6 18.4 A1 1 0 005.5 20 h13 a1 1 0 00.9-1.6 L14 9 V3" />
        <line x1="7" y1="14.5" x2="17" y2="14.5" />
        <circle cx="11" cy="17" r="0.6" fill="currentColor" />
        <circle cx="14" cy="16" r="0.5" fill="currentColor" />
      </svg>
    ),
    journal: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="14" height="18" rx="1" />
        <line x1="8" y1="3" x2="8" y2="21" />
        <line x1="11" y1="9" x2="15" y2="9" />
        <line x1="11" y1="13" x2="15" y2="13" />
        <path d="M11 17 L13 18 L16 15" />
      </svg>
    ),
    portfolio: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="7" width="18" height="14" rx="1" />
        <path d="M9 7 V5 a1 1 0 011-1 H14 a1 1 0 011 1 V7" />
        <line x1="3" y1="13" x2="21" y2="13" />
      </svg>
    ),
    watchlist: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 L14.5 8.5 L20.5 9.3 L16 13.5 L17.2 19.5 L12 16.5 L6.8 19.5 L8 13.5 L3.5 9.3 L9.5 8.5 Z" />
      </svg>
    ),
    tips: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4 H12 V20 H4 z" />
        <path d="M12 4 H20 V20 H12 z" />
        <line x1="7" y1="9" x2="9" y2="9" />
        <line x1="15" y1="9" x2="17" y2="9" />
        <line x1="7" y1="13" x2="9" y2="13" />
        <line x1="15" y1="13" x2="17" y2="13" />
      </svg>
    ),
    referral: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="9" width="18" height="11" rx="1" />
        <path d="M9 9 V6.5 a2.5 2.5 0 015 0 V9" />
        <path d="M11 9 V6.5 a2.5 2.5 0 015 0 V9" />
        <line x1="12" y1="9" x2="12" y2="20" />
        <line x1="3" y1="13.5" x2="21" y2="13.5" />
      </svg>
    ),
    admin: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 L20 6 V12 c0 4-3 7-8 9 c-5-2-8-5-8-9 V6 Z" />
        <path d="M9 12 L11 14 L15 9.5" />
      </svg>
    ),
  };

  // ─── Category accents (RGB triplets) — warm, theme-cohesive ───
  //   gold = signature · amber = market data · emerald = performance
  const ACCENT = {
    gold: '212,168,83',
    amber: '224,154,72',
    emerald: '86,186,128',
  };

  // ─── Feature catalog, grouped ───
  const groups = [
    {
      key: 'trading',
      label: t('mfm.group_trading', { defaultValue: 'Trading' }),
      accent: ACCENT.gold,
      items: [
        { path: '/signals',   icon: Icon.signals,   label: t('mfm.signals'),    desc: t('mfm.signals_desc') },
        { path: '/autotrade', icon: Icon.autotrade, label: t('mfm.autotrade'),  desc: t('mfm.autotrade_desc') },
        { path: '/ai-arena',  icon: Icon.aiArena,   label: t('mfm.ai_arena'),   desc: t('mfm.ai_arena_desc') },
        { path: '/orderbook', icon: Icon.orderbook, label: t('mfm.orderbook'),  desc: t('mfm.orderbook_desc') },
      ],
    },
    {
      key: 'market',
      label: t('mfm.group_market', { defaultValue: 'Market & Data' }),
      accent: ACCENT.amber,
      items: [
        { path: '/markets',      icon: Icon.markets,   label: t('mfm.markets'),    desc: t('mfm.markets_desc') },
        { path: '/market-pulse', icon: Icon.pulse,     label: t('mfm.pulse'),      desc: t('mfm.pulse_desc') },
        { path: '/onchain',      icon: Icon.onchain,   label: t('mfm.onchain'),    desc: t('mfm.onchain_desc') },
        { path: '/money-flow',   icon: Icon.moneyFlow, label: t('mfm.money_flow',  { defaultValue: 'Money Flow' }),
          desc: t('mfm.money_flow_desc', { defaultValue: 'Capital rotation — sectors, coins & whales' }) },
        { path: '/bitcoin',      icon: Icon.bitcoin,   label: t('mfm.bitcoin'),    desc: t('mfm.bitcoin_desc') },
        { path: '/crypto-news',  icon: Icon.news,      label: t('mfm.news'),       desc: t('mfm.news_desc') },
        { path: '/calendar',     icon: Icon.calendar,  label: t('mfm.calendar'),   desc: t('mfm.calendar_desc') },
      ],
    },
    {
      key: 'performance',
      label: t('mfm.group_performance', { defaultValue: 'Performance' }),
      accent: ACCENT.emerald,
      items: [
        { path: '/analytics',         icon: Icon.analytics,        label: t('mfm.analytics'),  desc: t('mfm.analytics_desc') },
        { path: '/daily-performance', icon: Icon.dailyPerformance, label: t('mfm.daily_perf', { defaultValue: 'Daily Performance' }),
          desc: t('mfm.daily_perf_desc', { defaultValue: 'Per-day breakdown with BTC context' }) },
        { path: '/daily-performance/edge-lab', icon: Icon.edgeLab, label: t('mfm.edge_lab', { defaultValue: 'Edge Lab' }),
          desc: t('mfm.edge_lab_desc', { defaultValue: 'Pattern reliability, EV & timing analytics' }) },
        { path: '/journal',   icon: Icon.journal,   label: t('mfm.journal'),    desc: t('mfm.journal_desc') },
        { path: '/portfolio', icon: Icon.portfolio, label: t('mfm.portfolio'),  desc: t('mfm.portfolio_desc') },
      ],
    },
    {
      key: 'personal',
      label: t('mfm.group_personal', { defaultValue: 'Personal' }),
      accent: ACCENT.gold,
      items: [
        { path: '/watchlist', icon: Icon.watchlist, label: t('mfm.watchlist'),  desc: t('mfm.watchlist_desc') },
        { path: '/tips',      icon: Icon.tips,      label: t('mfm.tips'),       desc: t('mfm.tips_desc') },
        { path: '/referral',  icon: Icon.referral,  label: t('mfm.referral'),   desc: t('mfm.referral_desc') },
        ...(isAdmin ? [{
          path: '/admin', icon: Icon.admin, label: t('mfm.admin'), desc: t('mfm.admin_desc'), isAdmin: true,
        }] : []),
      ],
    },
  ];

  const totalModules = groups.reduce((n, g) => n + g.items.length, 0);

  // ─── Single feature card (circular accent badge + hover bloom) ───
  const FeatureCard = ({ item, accent, delay }) => {
    const active = isActive(item.path);
    const isPro = premiumPaths.includes(item.path) && !isPremium;
    const acc = item.isAdmin ? '248,113,113' /* loss red */ : accent;

    return (
      <button
        onClick={() => handleItemClick(item.path)}
        style={{ animationDelay: `${delay}ms` }}
        className={`mfm-card group relative flex flex-col items-start text-left p-4 rounded-lg overflow-hidden transition-all duration-200 hover:-translate-y-0.5 ${
          active
            ? 'bg-[#241116] border border-gold-primary/40'
            : 'bg-[#1b0d0f]/70 border border-white/[0.06] hover:border-gold-primary/30 hover:bg-[#241116]/80'
        }`}
      >
        {/* Hairline top accent */}
        <span className={`absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent to-transparent transition-opacity duration-200 ${
          active ? 'via-gold-primary/60' : 'via-gold-primary/20 group-hover:via-gold-primary/45'
        }`} />

        {/* Card backlight bloom on hover */}
        <span
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: `radial-gradient(120% 80% at 24% 0%, rgba(${acc},0.10), transparent 60%)` }}
        />

        {/* Top-right: active LED dot OR PRO badge */}
        {active ? (
          <span
            className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-gold-primary"
            style={{ boxShadow: '0 0 6px rgba(212,168,83,0.85), 0 0 12px rgba(212,168,83,0.4)' }}
          />
        ) : isPro ? (
          <span className="absolute top-2.5 right-2.5 font-mono text-[9px] tracking-[0.18em] uppercase px-1.5 py-0.5 bg-gold-primary/10 text-gold-primary border border-gold-primary/30 rounded-sm">
            PRO
          </span>
        ) : null}

        {/* ── Circular icon badge ── */}
        <div className="relative mb-3.5">
          {/* Glow halo (blooms on hover) */}
          <span
            className="absolute -inset-1.5 rounded-full blur-md opacity-0 group-hover:opacity-80 transition-opacity duration-300 pointer-events-none"
            style={{ background: `radial-gradient(circle, rgba(${acc},0.45), transparent 70%)` }}
          />
          {/* Badge surface */}
          <div
            className="relative w-12 h-12 rounded-full flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.06]"
            style={{
              background: `radial-gradient(circle at 32% 26%, rgba(${acc},0.28), rgba(${acc},0.05) 72%)`,
              border: `1px solid rgba(${acc},${active ? 0.55 : 0.28})`,
              boxShadow: active
                ? `0 0 14px rgba(${acc},0.30), inset 0 1px 0 rgba(255,255,255,0.10)`
                : 'inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            {/* Top sheen highlight */}
            <span
              className="absolute top-1 left-1/2 -translate-x-1/2 w-6 h-1.5 rounded-full opacity-60"
              style={{ background: 'linear-gradient(to bottom, rgba(255,245,214,0.45), transparent)' }}
            />
            <span
              className="relative w-5 h-5 transition-colors duration-200"
              style={{ color: `rgb(${acc})` }}
            >
              {item.icon}
            </span>
          </div>
        </div>

        {/* Label */}
        <span className={`text-[13px] font-semibold leading-tight transition-colors duration-200 ${
          active ? 'text-gold-primary' : 'text-white group-hover:text-gold-primary'
        }`}>
          {item.label}
        </span>

        {/* Description */}
        {item.desc && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60 mt-1.5 leading-relaxed line-clamp-2">
            {item.desc}
          </span>
        )}
      </button>
    );
  };

  // ─── Grouped content (shared between inline + modal) ───
  const groupedContent = (
    <>
      <style>{`
        @keyframes mfmCardIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .mfm-card { animation: mfmCardIn .32s cubic-bezier(.16,1,.3,1) both; }
      `}</style>

      <div className="space-y-8">
        {groups.map((group, gi) => {
          // running stagger index across all groups
          const offset = groups.slice(0, gi).reduce((n, g) => n + g.items.length, 0);
          return (
            <section key={group.key}>
              {/* Group header: dot · label · line · count */}
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                  style={{ background: `rgb(${group.accent})`, boxShadow: `0 0 6px rgba(${group.accent},0.6)` }}
                />
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.25em]"
                  style={{ color: `rgba(${group.accent},0.9)` }}
                >
                  {group.label}
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-white/[0.08] to-transparent" />
                <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted/70">
                  {group.items.length}
                </span>
              </div>

              {/* Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {group.items.map((item, i) => (
                  <FeatureCard
                    key={item.path}
                    item={item}
                    accent={group.accent}
                    delay={Math.min(offset + i, 16) * 25}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );

  // ─── INLINE MODE (embed into Home page above TopGainer) ───
  if (inline) {
    return (
      <section className="mb-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="h-px w-8 bg-gold-primary/40" />
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
            {t('mfm.title_lead', { defaultValue: 'Features' })}
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/40 via-white/[0.06] to-transparent" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted hidden md:inline">
            {totalModules} modules
          </span>
        </div>
        {groupedContent}
      </section>
    );
  }

  // ─── MODAL MODE ───
  const modalContent = (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center px-4 py-6 transition-all duration-200 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ background: 'rgba(10,4,5,0.82)', backdropFilter: 'blur(8px)' }}
      onClick={handleClose}
    >
      <div
        className={`relative w-full max-w-5xl max-h-[90vh] rounded-lg border border-white/[0.07] overflow-hidden flex flex-col shadow-2xl transition-all duration-200 ${
          isClosing ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100'
        }`}
        style={{
          background:
            'linear-gradient(160deg, #1a0a0c 0%, #120608 55%, #0d0405 100%)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient burgundy/gold glows for depth */}
        <span
          className="absolute -top-24 -left-16 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(139,26,26,0.18), transparent 70%)' }}
        />
        <span
          className="absolute -bottom-24 -right-16 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(212,168,83,0.06), transparent 70%)' }}
        />
        {/* Hairline top accent */}
        <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent z-10" />

        {/* HEADER */}
        <div className="relative flex-shrink-0 px-6 py-5 border-b border-white/[0.06] bg-white/[0.015] flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="h-px w-8 bg-gold-primary/40" />
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
                {t('mfm.title_lead', { defaultValue: 'Features' })}
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/40 via-white/[0.06] to-transparent" />
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-normal text-white tracking-tight">
              {t('mfm.title_accent', { defaultValue: 'LuxQuant Terminal' })}
            </h2>
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted mt-1.5">
              {t('mfm.subtitle', { defaultValue: `${totalModules} modules · all-in-one trading suite` })}
            </p>
          </div>

          <button
            onClick={handleClose}
            aria-label="Close"
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-sm bg-white/[0.03] border border-white/[0.06] text-text-muted hover:text-white hover:bg-white/[0.08] hover:border-white/[0.12] transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* BODY — grouped grid */}
        <div className="relative flex-1 overflow-y-auto p-6 mfm-scroll">
          {groupedContent}
        </div>

        {/* Scrollbar style scoped */}
        <style>{`
          .mfm-scroll::-webkit-scrollbar { width: 6px; }
          .mfm-scroll::-webkit-scrollbar-track { background: transparent; }
          .mfm-scroll::-webkit-scrollbar-thumb {
            background: rgba(212,168,83,0.15);
            border-radius: 3px;
          }
          .mfm-scroll::-webkit-scrollbar-thumb:hover {
            background: rgba(212,168,83,0.3);
          }
        `}</style>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default MoreFeaturesModal;