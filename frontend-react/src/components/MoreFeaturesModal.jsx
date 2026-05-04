// src/components/MoreFeaturesModal.jsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * MoreFeaturesModal v2 — Premium gold-standardized aesthetic
 * Icons are crafted with proper visual weight, fill+stroke combos,
 * and consistent gold/amber tones matching landing page brand.
 */
const MoreFeaturesModal = ({
  isOpen,
  onClose,
  onNavigate,
  isActive,
  isPremium,
  isAdmin,
  premiumPaths = [],
}) => {
  const { t } = useTranslation();
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') handleClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  const handleItemClick = (path) => {
    handleClose();
    setTimeout(() => onNavigate(path), 80);
  };

  if (!isOpen) return null;

  // ─── Three tonal tiers within gold family ──────────────────────
  // tier 1: bright gold (primary features)
  // tier 2: amber (secondary features)
  // tier 3: bronze/copper (utility features)
  const TIER = {
    primary:   { from: '#fde6a8', via: '#d4a853', to: '#8b6914' },  // bright gold
    secondary: { from: '#f5d088', via: '#c89143', to: '#7a5610' },  // amber
    utility:   { from: '#e8b87a', via: '#a87938', to: '#5e3d09' },  // bronze
    danger:    { from: '#f5d088', via: '#c89143', to: '#7a5610' },  // amber-tinted (admin)
  };

  // ─── Custom-crafted SVG icons ───────────────────────────────────
  // Each icon uses fill+stroke composition for visual weight,
  // not flat single-stroke outlines.

  const Icon = {
    home: (
      <g>
        <path d="M3 11.5 L12 4 L21 11.5 V20 a1 1 0 01-1 1h-5v-7h-4v7H4 a1 1 0 01-1-1z" fill="currentColor" opacity="0.15" />
        <path d="M3 11.5 L12 4 L21 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
        <path d="M5 11 V20 a1 1 0 001 1h4v-6h4v6h4 a1 1 0 001-1V11" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      </g>
    ),
    signals: (
      <g>
        <path d="M4 17 L9 12 L13 15 L20 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M16 7 L20 7 L20 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="9" cy="12" r="1.5" fill="currentColor" />
        <circle cx="13" cy="15" r="1.5" fill="currentColor" />
        <circle cx="20" cy="7" r="1.5" fill="currentColor" />
      </g>
    ),
    autotrade: (
      <g>
        <rect x="3" y="13" width="4" height="8" rx="1" fill="currentColor" opacity="0.2" />
        <rect x="3" y="13" width="4" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <rect x="10" y="9" width="4" height="12" rx="1" fill="currentColor" opacity="0.35" />
        <rect x="10" y="9" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <rect x="17" y="4" width="4" height="17" rx="1" fill="currentColor" opacity="0.5" />
        <rect x="17" y="4" width="4" height="17" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </g>
    ),
    aiArena: (
      <g>
        <path d="M12 3 L13.5 9 L19.5 10.5 L13.5 12 L12 18 L10.5 12 L4.5 10.5 L10.5 9 Z" fill="currentColor" opacity="0.2" />
        <path d="M12 3 L13.5 9 L19.5 10.5 L13.5 12 L12 18 L10.5 12 L4.5 10.5 L10.5 9 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
        <circle cx="18" cy="5" r="1.2" fill="currentColor" />
        <circle cx="6" cy="18" r="1" fill="currentColor" opacity="0.7" />
        <circle cx="19" cy="19" r="0.8" fill="currentColor" opacity="0.5" />
      </g>
    ),
    pulse: (
      <g>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.2" opacity="0.25" fill="none" />
        <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.2" opacity="0.5" fill="none" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
        <path d="M3 12 L8 12 L10 7 L13 17 L15 12 L21 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    ),
    news: (
      <g>
        <rect x="3" y="5" width="14" height="15" rx="1.5" fill="currentColor" opacity="0.15" />
        <rect x="3" y="5" width="14" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M17 8 H20 a1 1 0 011 1 V18 a2 2 0 01-2 2 H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <line x1="6" y1="9" x2="14" y2="9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <line x1="6" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <line x1="6" y1="15" x2="11" y2="15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </g>
    ),
    onchain: (
      <g>
        <circle cx="6" cy="6" r="2.5" fill="currentColor" opacity="0.3" />
        <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <circle cx="18" cy="6" r="2.5" fill="currentColor" opacity="0.3" />
        <circle cx="18" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <circle cx="12" cy="14" r="2.5" fill="currentColor" opacity="0.5" />
        <circle cx="12" cy="14" r="2.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <circle cx="6" cy="20" r="1.8" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.3" />
        <circle cx="18" cy="20" r="1.8" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.3" />
        <line x1="7.5" y1="7.5" x2="10.5" y2="12.5" stroke="currentColor" strokeWidth="1.3" />
        <line x1="16.5" y1="7.5" x2="13.5" y2="12.5" stroke="currentColor" strokeWidth="1.3" />
        <line x1="11" y1="16" x2="7" y2="18.5" stroke="currentColor" strokeWidth="1.3" />
        <line x1="13" y1="16" x2="17" y2="18.5" stroke="currentColor" strokeWidth="1.3" />
      </g>
    ),
    bitcoin: (
      <g>
        <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.18" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M10 7 V17 M14 7 V17 M9 9 H14.5 a1.8 1.8 0 010 3.5 H9 M9 12.5 H15 a1.8 1.8 0 010 3.5 H9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    ),
    markets: (
      <g>
        <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.12" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <ellipse cx="12" cy="12" rx="4" ry="9" stroke="currentColor" strokeWidth="1.3" fill="none" opacity="0.7" />
        <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.3" />
      </g>
    ),
    journal: (
      <g>
        <rect x="4" y="3" width="14" height="18" rx="1.5" fill="currentColor" opacity="0.15" />
        <rect x="4" y="3" width="14" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <line x1="7" y1="3" x2="7" y2="21" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
        <path d="M14 8 L17 5 L19 7 L16 10 Z" fill="currentColor" opacity="0.4" />
        <path d="M14 8 L17 5 L19 7 L16 10 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
        <line x1="9" y1="13" x2="14" y2="13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <line x1="9" y1="16" x2="13" y2="16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </g>
    ),
    portfolio: (
      <g>
        <rect x="3" y="7" width="18" height="13" rx="1.5" fill="currentColor" opacity="0.18" />
        <rect x="3" y="7" width="18" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M9 7 V5.5 a1 1 0 011-1 H14 a1 1 0 011 1 V7" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <line x1="3" y1="13" x2="21" y2="13" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="12" cy="13" r="1.4" fill="currentColor" />
      </g>
    ),
    analytics: (
      <g>
        <path d="M3 20 H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="5" y="13" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.4" />
        <rect x="5" y="13" width="3" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <rect x="10.5" y="9" width="3" height="10" rx="0.5" fill="currentColor" opacity="0.55" />
        <rect x="10.5" y="9" width="3" height="10" rx="0.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <rect x="16" y="5" width="3" height="14" rx="0.5" fill="currentColor" opacity="0.7" />
        <rect x="16" y="5" width="3" height="14" rx="0.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
      </g>
    ),
    orderbook: (
      <g>
        <rect x="3" y="4" width="8" height="16" rx="1" fill="currentColor" opacity="0.15" />
        <rect x="3" y="4" width="8" height="16" rx="1" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <rect x="13" y="4" width="8" height="16" rx="1" fill="currentColor" opacity="0.3" />
        <rect x="13" y="4" width="8" height="16" rx="1" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <line x1="5" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth="1.2" />
        <line x1="5" y1="11" x2="8" y2="11" stroke="currentColor" strokeWidth="1.2" />
        <line x1="5" y1="14" x2="9" y2="14" stroke="currentColor" strokeWidth="1.2" />
        <line x1="5" y1="17" x2="7" y2="17" stroke="currentColor" strokeWidth="1.2" />
        <line x1="15" y1="8" x2="19" y2="8" stroke="currentColor" strokeWidth="1.2" />
        <line x1="15" y1="11" x2="18" y2="11" stroke="currentColor" strokeWidth="1.2" />
        <line x1="15" y1="14" x2="19" y2="14" stroke="currentColor" strokeWidth="1.2" />
        <line x1="15" y1="17" x2="17" y2="17" stroke="currentColor" strokeWidth="1.2" />
      </g>
    ),
    calendar: (
      <g>
        <rect x="3" y="5" width="18" height="16" rx="1.5" fill="currentColor" opacity="0.15" />
        <rect x="3" y="5" width="18" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="1.4" />
        <line x1="8" y1="3" x2="8" y2="7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="16" y1="3" x2="16" y2="7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="14" r="1" fill="currentColor" />
        <circle cx="12" cy="14" r="1" fill="currentColor" opacity="0.5" />
        <circle cx="16" cy="14" r="1" fill="currentColor" />
        <circle cx="8" cy="17.5" r="1" fill="currentColor" opacity="0.5" />
        <circle cx="12" cy="17.5" r="1" fill="currentColor" />
      </g>
    ),
    whale: (
      <g>
        <path d="M3 13 c2-5 6-7 10-6 c3 1 5 3 6 5 c1 2 2 4 2 4 l-2-1 c-1 2-3 3-5 3 c-3 0-6-1-8-2 c-2-1-3-2-3-3z" fill="currentColor" opacity="0.25" />
        <path d="M3 13 c2-5 6-7 10-6 c3 1 5 3 6 5 c1 2 2 4 2 4 l-2-1 c-1 2-3 3-5 3 c-3 0-6-1-8-2 c-2-1-3-2-3-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
        <circle cx="15" cy="10" r="0.9" fill="currentColor" />
        <path d="M19 12 c0-1 1-2 2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      </g>
    ),
    tips: (
      <g>
        <path d="M4 5 a1 1 0 011-1 h7 v15 H5 a1 1 0 01-1-1 z" fill="currentColor" opacity="0.18" />
        <path d="M12 4 h7 a1 1 0 011 1 v13 a1 1 0 01-1 1 h-7" fill="currentColor" opacity="0.28" />
        <path d="M4 5 a1 1 0 011-1 h7 v15 H5 a1 1 0 01-1-1 z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
        <path d="M12 4 h7 a1 1 0 011 1 v13 a1 1 0 01-1 1 h-7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
        <line x1="12" y1="4" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 19 c-1.5-1-3.5-1.5-7-1.5 M12 19 c1.5-1 3.5-1.5 7-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </g>
    ),
    watchlist: (
      <g>
        <path d="M12 3 L14.5 8.5 L20.5 9.3 L16 13.5 L17.2 19.5 L12 16.5 L6.8 19.5 L8 13.5 L3.5 9.3 L9.5 8.5 Z" fill="currentColor" opacity="0.3" />
        <path d="M12 3 L14.5 8.5 L20.5 9.3 L16 13.5 L17.2 19.5 L12 16.5 L6.8 19.5 L8 13.5 L3.5 9.3 L9.5 8.5 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      </g>
    ),
    referral: (
      <g>
        <rect x="3" y="9" width="18" height="11" rx="1.5" fill="currentColor" opacity="0.18" />
        <rect x="3" y="9" width="18" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M9 9 V6.5 a2 2 0 014 0 V9" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M11 9 V6.5 a2 2 0 014 0 V9" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <line x1="3" y1="13.5" x2="21" y2="13.5" stroke="currentColor" strokeWidth="1.3" opacity="0.5" />
        <line x1="12" y1="9" x2="12" y2="20" stroke="currentColor" strokeWidth="1.3" opacity="0.5" />
      </g>
    ),
    admin: (
      <g>
        <path d="M12 3 L20 6 V12 c0 4-3 7-8 9 c-5-2-8-5-8-9 V6 Z" fill="currentColor" opacity="0.2" />
        <path d="M12 3 L20 6 V12 c0 4-3 7-8 9 c-5-2-8-5-8-9 V6 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
        <path d="M9 12 L11 14 L15 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    ),
  };

  // ─── Feature catalog with tier mapping ─────────────────────────
  const features = [
    // Tier 1 — primary (bright gold)
    { path: '/home',         icon: Icon.home,       tier: 'primary',   label: t('mfm.home'),       desc: t('mfm.home_desc') },
    { path: '/signals',      icon: Icon.signals,    tier: 'primary',   label: t('mfm.signals'),    desc: t('mfm.signals_desc') },
    { path: '/autotrade',    icon: Icon.autotrade,  tier: 'primary',   label: t('mfm.autotrade'),  desc: t('mfm.autotrade_desc') },
    { path: '/ai-arena',     icon: Icon.aiArena,    tier: 'primary',   label: t('mfm.ai_arena'),   desc: t('mfm.ai_arena_desc') },
    { path: '/bitcoin',      icon: Icon.bitcoin,    tier: 'primary',   label: t('mfm.bitcoin'),    desc: t('mfm.bitcoin_desc') },

    // Tier 2 — secondary (amber)
    { path: '/market-pulse', icon: Icon.pulse,      tier: 'secondary', label: t('mfm.pulse'),      desc: t('mfm.pulse_desc') },
    { path: '/crypto-news',  icon: Icon.news,       tier: 'secondary', label: t('mfm.news'),       desc: t('mfm.news_desc') },
    { path: '/onchain',      icon: Icon.onchain,    tier: 'secondary', label: t('mfm.onchain'),    desc: t('mfm.onchain_desc') },
    { path: '/markets',      icon: Icon.markets,    tier: 'secondary', label: t('mfm.markets'),    desc: t('mfm.markets_desc') },
    { path: '/journal',      icon: Icon.journal,    tier: 'secondary', label: t('mfm.journal'),    desc: t('mfm.journal_desc') },

    // Tier 3 — utility (bronze)
    { path: '/portfolio',    icon: Icon.portfolio,  tier: 'utility',   label: t('mfm.portfolio'),  desc: t('mfm.portfolio_desc') },
    { path: '/analytics',    icon: Icon.analytics,  tier: 'utility',   label: t('mfm.analytics'),  desc: t('mfm.analytics_desc') },
    { path: '/orderbook',    icon: Icon.orderbook,  tier: 'utility',   label: t('mfm.orderbook'),  desc: t('mfm.orderbook_desc') },
    { path: '/calendar',     icon: Icon.calendar,   tier: 'utility',   label: t('mfm.calendar'),   desc: t('mfm.calendar_desc') },
    { path: '/whale',        icon: Icon.whale,      tier: 'utility',   label: t('mfm.whale'),      desc: t('mfm.whale_desc') },
    { path: '/tips',         icon: Icon.tips,       tier: 'utility',   label: t('mfm.tips'),       desc: t('mfm.tips_desc') },
    { path: '/watchlist',    icon: Icon.watchlist,  tier: 'utility',   label: t('mfm.watchlist'),  desc: t('mfm.watchlist_desc') },
    { path: '/referral',     icon: Icon.referral,   tier: 'utility',   label: t('mfm.referral'),   desc: t('mfm.referral_desc') },

    ...(isAdmin ? [{
      path: '/admin', icon: Icon.admin, tier: 'danger', label: t('mfm.admin'), desc: t('mfm.admin_desc'),
    }] : []),
  ];

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center px-4 py-6 mfm-overlay ${isClosing ? 'mfm-overlay-out' : ''}`}
      onClick={handleClose}
    >
      <style>{`
        .mfm-overlay {
          background: rgba(0,0,0,0);
          backdrop-filter: blur(0px);
          animation: mfmOverlayIn .3s ease forwards;
        }
        .mfm-overlay-out { animation: mfmOverlayOut .2s ease forwards; }
        .mfm-overlay-out .mfm-card { animation: mfmCardOut .2s ease forwards; }
        @keyframes mfmOverlayIn {
          to { background: rgba(0,0,0,.85); backdrop-filter: blur(8px); }
        }
        @keyframes mfmOverlayOut {
          from { background: rgba(0,0,0,.85); backdrop-filter: blur(8px); }
          to { background: rgba(0,0,0,0); backdrop-filter: blur(0px); }
        }
        .mfm-card {
          animation: mfmCardIn .35s cubic-bezier(.16,1,.3,1) forwards;
          background:
            radial-gradient(ellipse at top, rgba(212,168,83,0.06), transparent 60%),
            #0c0a0f;
        }
        @keyframes mfmCardIn {
          from { opacity: 0; transform: scale(.96) translateY(12px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes mfmCardOut {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(.96) translateY(12px); }
        }

        /* ─── Tile base ─── */
        .mfm-tile {
          position: relative;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.015);
          transition: transform .25s cubic-bezier(.16,1,.3,1),
                      border-color .25s ease,
                      background .25s ease,
                      box-shadow .25s ease;
        }
        .mfm-tile::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(135deg, transparent, transparent);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          transition: opacity .25s ease, background .25s ease;
          pointer-events: none;
        }
        .mfm-tile:hover {
          transform: translateY(-3px);
          border-color: rgba(212,168,83,0.25);
          background: rgba(212,168,83,0.04);
          box-shadow:
            0 8px 24px -8px rgba(212,168,83,0.25),
            0 0 0 1px rgba(212,168,83,0.08);
        }
        .mfm-tile:hover::before {
          opacity: 1;
          background: linear-gradient(135deg, rgba(253,230,168,0.6), rgba(212,168,83,0.2), rgba(139,105,20,0.4));
        }
        .mfm-tile.active {
          border-color: rgba(212,168,83,0.45);
          background: rgba(212,168,83,0.06);
          box-shadow: 0 0 0 1px rgba(212,168,83,0.25), 0 4px 16px -4px rgba(212,168,83,0.3);
        }

        /* ─── Icon container ─── */
        .mfm-icon-wrap {
          position: relative;
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
          transition: transform .3s cubic-bezier(.16,1,.3,1);
        }
        .mfm-icon-wrap::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
        .mfm-tile:hover .mfm-icon-wrap {
          transform: scale(1.06);
        }

        /* Tier — primary (bright gold) */
        .mfm-icon-wrap.t-primary {
          background:
            radial-gradient(circle at 30% 25%, rgba(253,230,168,0.18), transparent 65%),
            rgba(212,168,83,0.10);
          color: #f5d088;
        }
        .mfm-icon-wrap.t-primary::after {
          background: linear-gradient(135deg, rgba(253,230,168,0.5), rgba(212,168,83,0.2), rgba(139,105,20,0.35));
        }

        /* Tier — secondary (amber) */
        .mfm-icon-wrap.t-secondary {
          background:
            radial-gradient(circle at 30% 25%, rgba(245,208,136,0.14), transparent 65%),
            rgba(200,145,67,0.08);
          color: #d4a853;
        }
        .mfm-icon-wrap.t-secondary::after {
          background: linear-gradient(135deg, rgba(245,208,136,0.4), rgba(200,145,67,0.18), rgba(122,86,16,0.3));
        }

        /* Tier — utility (bronze) */
        .mfm-icon-wrap.t-utility {
          background:
            radial-gradient(circle at 30% 25%, rgba(232,184,122,0.12), transparent 65%),
            rgba(168,121,56,0.07);
          color: #c89143;
        }
        .mfm-icon-wrap.t-utility::after {
          background: linear-gradient(135deg, rgba(232,184,122,0.35), rgba(168,121,56,0.15), rgba(94,61,9,0.25));
        }

        /* Tier — danger (admin, slightly warm-red tinted) */
        .mfm-icon-wrap.t-danger {
          background:
            radial-gradient(circle at 30% 25%, rgba(245,180,120,0.18), transparent 65%),
            rgba(200,100,60,0.08);
          color: #e8a878;
        }
        .mfm-icon-wrap.t-danger::after {
          background: linear-gradient(135deg, rgba(245,180,120,0.45), rgba(200,100,60,0.18), rgba(120,50,20,0.3));
        }
      `}</style>

      <div
        className="mfm-card relative w-full max-w-5xl max-h-[88vh] rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/80 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent z-10" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/[0.05] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: 'radial-gradient(circle at 30% 25%, rgba(253,230,168,0.2), transparent 60%), rgba(212,168,83,0.1)',
                border: '1px solid rgba(212,168,83,0.25)',
              }}
            >
              <svg className="w-4 h-4 text-gold-primary" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2" />
                <rect x="14" y="4" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <rect x="4" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <rect x="14" y="14" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2" />
              </svg>
            </div>
            <div>
              <h2 className="text-white font-bold text-lg sm:text-xl tracking-tight">
                {t('mfm.title')}
              </h2>
              <p className="text-text-muted text-xs mt-0.5">
                {t('mfm.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:text-white hover:bg-white/10 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Grid body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {features.map((item) => {
              const active = isActive(item.path);
              const isPro = premiumPaths.includes(item.path) && !isPremium;

              return (
                <button
                  key={item.path}
                  onClick={() => handleItemClick(item.path)}
                  className={`mfm-tile group flex flex-col items-center text-center p-3 sm:p-4 rounded-2xl ${active ? 'active' : ''}`}
                >
                  {/* PRO badge */}
                  {isPro && (
                    <span
                      className="absolute top-2 right-2 text-[8px] font-bold px-1.5 py-0.5 rounded leading-none"
                      style={{
                        background: 'rgba(212,168,83,0.15)',
                        color: '#d4a853',
                        border: '1px solid rgba(212,168,83,0.3)',
                      }}
                    >
                      PRO
                    </span>
                  )}

                  {/* Active indicator */}
                  {active && (
                    <span
                      className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full"
                      style={{
                        background: '#d4a853',
                        boxShadow: '0 0 8px rgba(212,168,83,0.6)',
                      }}
                    />
                  )}

                  {/* Icon container */}
                  <div className={`mfm-icon-wrap t-${item.tier}`}>
                    <svg
                      className="w-6 h-6 sm:w-7 sm:h-7"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      {item.icon}
                    </svg>
                  </div>

                  {/* Label */}
                  <span className={`text-[12px] sm:text-[13px] font-semibold leading-tight tracking-tight ${
                    active ? 'text-gold-primary' : 'text-white'
                  }`}>
                    {item.label}
                  </span>

                  {/* Description */}
                  {item.desc && (
                    <span className="text-[10px] text-text-muted mt-1.5 leading-snug line-clamp-2 hidden sm:block">
                      {item.desc}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3 border-t border-white/[0.05] flex items-center justify-between text-[11px] text-text-muted flex-shrink-0">
          <span className="flex items-center gap-1.5">
            <span
              className="w-1 h-1 rounded-full"
              style={{ background: '#d4a853', boxShadow: '0 0 6px rgba(212,168,83,0.5)' }}
            />
            {t('mfm.footer_count', { count: features.length })}
          </span>
          <span className="hidden sm:inline">{t('mfm.footer_hint')}</span>
        </div>
      </div>
    </div>
  );
};

export default MoreFeaturesModal;