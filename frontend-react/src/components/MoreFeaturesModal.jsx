// src/components/MoreFeaturesModal.jsx
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/**
 * MoreFeaturesModal — Web3 Flowscan Edition
 *
 * Design principles:
 * - Flat hairline cards (no glass-blur, no conic gradients, no flowing animation)
 * - Sharp rounded-md corners (6px), not rounded-2xl
 * - Hairline borders white/[0.06], hover gold-primary/25
 * - Inset top accent gradient (signature Flowscan pattern)
 * - Mono uppercase labels with tracking-wider
 * - SVG icons inline gold-primary, NO glow rings, NO ambient pulse
 * - Hover: -translate-y-0.5 + border color + bg shift (no scale, no sweep)
 * - Active state: static LED dot with soft glow (no aggressive pulse)
 *
 * Can be embedded inline (as Overview section above TopGainer) by passing
 * `inline={true}` and skipping modal wrapper.
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

  // ─── Icons (Lucide-style, single stroke, flat gold) ───
  const Icon = {
    home: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5 L12 3 L21 9.5 V20 a1 1 0 01-1 1 H4 a1 1 0 01-1-1 Z" />
        <path d="M9 21 V13 H15 V21" />
      </svg>
    ),
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
        <path d="M12 3 L14 9 L20 11 L14 13 L12 19 L10 13 L4 11 L10 9 Z" />
      </svg>
    ),
    bitcoin: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M10 7 V8 M10 16 V17 M13 7 V8 M13 16 V17" />
        <path d="M9 8 H14 a2 2 0 010 4 H9 M9 12 H15 a2 2 0 010 4 H9 V8 z" />
      </svg>
    ),
    pulse: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12 H7 L9 6 L13 18 L15 12 H21" />
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
    markets: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <line x1="3" y1="12" x2="21" y2="12" />
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
    analytics: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="20" x2="21" y2="20" />
        <rect x="5" y="13" width="3" height="7" />
        <rect x="10.5" y="9" width="3" height="11" />
        <rect x="16" y="5" width="3" height="15" />
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
    whale: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 13 c2-5 6-7 10-6 c4 1 6 4 7 7 c1 2 1 4 1 4 l-2-1 c-1 2-4 3-7 3 c-3 0-6-1-8-2 c-1-1-1-3-1-5z" />
        <circle cx="15" cy="10" r="0.8" fill="currentColor" />
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
    watchlist: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 L14.5 8.5 L20.5 9.3 L16 13.5 L17.2 19.5 L12 16.5 L6.8 19.5 L8 13.5 L3.5 9.3 L9.5 8.5 Z" />
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

  const features = [
    { path: '/home',         icon: Icon.home,       label: t('mfm.home'),       desc: t('mfm.home_desc') },
    { path: '/signals',      icon: Icon.signals,    label: t('mfm.signals'),    desc: t('mfm.signals_desc') },
    { path: '/autotrade',    icon: Icon.autotrade,  label: t('mfm.autotrade'),  desc: t('mfm.autotrade_desc') },
    { path: '/ai-arena',     icon: Icon.aiArena,    label: t('mfm.ai_arena'),   desc: t('mfm.ai_arena_desc') },
    { path: '/bitcoin',      icon: Icon.bitcoin,    label: t('mfm.bitcoin'),    desc: t('mfm.bitcoin_desc') },
    { path: '/market-pulse', icon: Icon.pulse,      label: t('mfm.pulse'),      desc: t('mfm.pulse_desc') },
    { path: '/crypto-news',  icon: Icon.news,       label: t('mfm.news'),       desc: t('mfm.news_desc') },
    { path: '/onchain',      icon: Icon.onchain,    label: t('mfm.onchain'),    desc: t('mfm.onchain_desc') },
    { path: '/markets',      icon: Icon.markets,    label: t('mfm.markets'),    desc: t('mfm.markets_desc') },
    { path: '/journal',      icon: Icon.journal,    label: t('mfm.journal'),    desc: t('mfm.journal_desc') },
    { path: '/portfolio',    icon: Icon.portfolio,  label: t('mfm.portfolio'),  desc: t('mfm.portfolio_desc') },
    { path: '/analytics',    icon: Icon.analytics,  label: t('mfm.analytics'),  desc: t('mfm.analytics_desc') },
    { path: '/orderbook',    icon: Icon.orderbook,  label: t('mfm.orderbook'),  desc: t('mfm.orderbook_desc') },
    { path: '/calendar',     icon: Icon.calendar,   label: t('mfm.calendar'),   desc: t('mfm.calendar_desc') },
    { path: '/whale',        icon: Icon.whale,      label: t('mfm.whale'),      desc: t('mfm.whale_desc') },
    { path: '/tips',         icon: Icon.tips,       label: t('mfm.tips'),       desc: t('mfm.tips_desc') },
    { path: '/watchlist',    icon: Icon.watchlist,  label: t('mfm.watchlist'),  desc: t('mfm.watchlist_desc') },
    { path: '/referral',     icon: Icon.referral,   label: t('mfm.referral'),   desc: t('mfm.referral_desc') },
    ...(isAdmin ? [{
      path: '/admin', icon: Icon.admin, label: t('mfm.admin'), desc: t('mfm.admin_desc'), isAdmin: true,
    }] : []),
  ];

  // ─── Grid (shared between inline + modal) ───
  const gridContent = (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {features.map((item) => {
        const active = isActive(item.path);
        const isPro = premiumPaths.includes(item.path) && !isPremium;

        return (
          <button
            key={item.path}
            onClick={() => handleItemClick(item.path)}
            className={`relative flex flex-col items-start text-left p-4 rounded-md transition-all duration-200 overflow-hidden group ${
              active
                ? 'bg-[#0a0805] border border-gold-primary/40 hover:-translate-y-0.5'
                : 'bg-[#0a0805] border border-white/[0.06] hover:border-gold-primary/25 hover:-translate-y-0.5 hover:bg-white/[0.015]'
            }`}
          >
            {/* Hairline top accent gradient (Flowscan signature) */}
            <span className={`absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent ${
              active ? 'via-gold-primary/60' : 'via-gold-primary/25 group-hover:via-gold-primary/40'
            } to-transparent transition-all duration-200`} />

            {/* Top-right indicator: PRO badge OR active LED dot */}
            {active ? (
              <span
                className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-gold-primary"
                style={{
                  boxShadow:
                    '0 0 6px rgba(212,168,83,0.85), 0 0 12px rgba(212,168,83,0.4), inset 0 0 2px rgba(255,245,214,0.6)',
                }}
              />
            ) : isPro ? (
              <span className="absolute top-2.5 right-2.5 font-mono text-[9px] tracking-[0.18em] uppercase px-1.5 py-0.5 bg-gold-primary/10 text-gold-primary border border-gold-primary/30 rounded-sm">
                PRO
              </span>
            ) : null}

            {/* Icon container — flat, hairline, no glow */}
            <div className={`w-9 h-9 rounded-sm flex items-center justify-center mb-3 transition-colors ${
              item.isAdmin
                ? 'bg-loss/[0.06] border border-loss/20 text-loss/80 group-hover:border-loss/30 group-hover:text-loss'
                : 'bg-gold-primary/[0.06] border border-gold-primary/20 text-gold-primary/70 group-hover:border-gold-primary/40 group-hover:text-gold-primary'
            }`}>
              <div className="w-[18px] h-[18px]">{item.icon}</div>
            </div>

            {/* Label */}
            <span className={`font-sans text-[13px] font-semibold leading-tight transition-colors ${
              active ? 'text-gold-primary' : 'text-white group-hover:text-gold-primary'
            }`}>
              {item.label}
            </span>

            {/* Description — Flowscan mono uppercase pattern */}
            {item.desc && (
              <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted/70 mt-1.5 leading-snug line-clamp-2">
                {item.desc}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  // ─── INLINE MODE (embed into Home page above TopGainer) ───
  if (inline) {
    return (
      <section className="mb-8">
        {/* Section header — line-label-line (Flowscan signature, consistent with OverviewPage/TopPerformers) */}
        <div className="flex items-center gap-3 mb-5">
          <span className="h-px w-8 bg-gold-primary/40" />
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
            {t('mfm.title_lead', { defaultValue: 'Features' })}
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/40 via-white/[0.06] to-transparent" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted hidden md:inline">
            {features.length} modules
          </span>
        </div>
        {gridContent}
      </section>
    );
  }

  // ─── MODAL MODE ───
  const modalContent = (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center px-4 py-6 transition-all duration-200 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={handleClose}
    >
      <div
        className={`relative w-full max-w-5xl max-h-[90vh] bg-[#0a0506] rounded-md border border-white/[0.06] overflow-hidden flex flex-col shadow-2xl transition-all duration-200 ${
          isClosing ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hairline top accent — Flowscan signature */}
        <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent z-10" />

        {/* HEADER */}
        <div className="flex-shrink-0 px-6 py-5 border-b border-white/[0.06] bg-white/[0.015] flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            {/* Line-label-line title (Flowscan signature) */}
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
              {t('mfm.subtitle', { defaultValue: `${features.length} modules · all-in-one trading suite` })}
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

        {/* BODY — grid */}
        <div className="flex-1 overflow-y-auto p-6 mfm-scroll">
          {gridContent}
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