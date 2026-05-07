// src/components/MoreFeaturesModal.jsx
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/**
 * MoreFeaturesModal v5 — Flowing Gold Edition
 *
 * What makes this premium:
 *   1. Conic-gradient border with @property --angle → "flowing gold" that
 *      circulates around each tile on hover (real motion, not static gradient)
 *   2. Light sweep on tile hover (specular highlight passes diagonally
 *      across the surface, like light catching polished metal)
 *   3. Shimmer animation on label text on hover
 *   4. Icons rebuilt with dual-layer (outer shape + inner accent in lighter
 *      gold) and animated gradient fill via SVG <linearGradient>
 *   5. Cursor-following spotlight retained from v4
 *   6. Idle subtle pulse on icon glow ring (ambient life, not distracting)
 *
 * Removed: hex codes, fake breadcrumb, FEATURE INDEX pill, jargon dividers,
 * terminal LARP footer.
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
  const gridRef = useRef(null);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') handleClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  // Cursor spotlight (sets per-tile --mx/--my for radial highlight)
  useEffect(() => {
    if (!isOpen) return;
    const grid = gridRef.current;
    if (!grid) return;

    const handleMove = (e) => {
      const tiles = grid.querySelectorAll('.mfm-tile');
      tiles.forEach((tile) => {
        const r = tile.getBoundingClientRect();
        tile.style.setProperty('--mx', `${e.clientX - r.left}px`);
        tile.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    };

    grid.addEventListener('mousemove', handleMove);
    return () => grid.removeEventListener('mousemove', handleMove);
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 220);
  };

  const handleItemClick = (path) => {
    handleClose();
    setTimeout(() => onNavigate(path), 80);
  };

  if (!isOpen) return null;

  // ─── Premium icons: dual-layer (outer shape + inner accent details) ───
  // Each icon uses gradient stroke via `url(#mfm-gold-stroke)` defined once
  // in a hidden SVG defs block, plus a brighter inner accent for depth.
  const Icon = {
    home: (
      <g>
        <path d="M3.5 11 L12 3.5 L20.5 11" stroke="url(#mfm-gold-stroke)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M5 10.5 V20 a1 1 0 001 1h3.5v-6.5h5V21H18 a1 1 0 001-1V10.5" stroke="url(#mfm-gold-stroke)" strokeWidth="1.6" strokeLinejoin="round" fill="rgba(245,208,136,0.06)" />
        <circle cx="12" cy="17" r="0.8" fill="url(#mfm-gold-bright)" />
      </g>
    ),
    signals: (
      <g>
        <path d="M3.5 17 L8.5 11.5 L13 14.5 L20.5 6.5" stroke="url(#mfm-gold-stroke)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M16 6.5 L20.5 6.5 L20.5 11" stroke="url(#mfm-gold-bright)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="3.5" cy="17" r="1.4" fill="url(#mfm-gold-stroke)" />
        <circle cx="8.5" cy="11.5" r="1.4" fill="url(#mfm-gold-stroke)" />
        <circle cx="13" cy="14.5" r="1.4" fill="url(#mfm-gold-stroke)" />
        <circle cx="20.5" cy="6.5" r="1.6" fill="url(#mfm-gold-bright)" />
      </g>
    ),
    autotrade: (
      <g>
        <rect x="3" y="14" width="3.5" height="7" rx="0.8" fill="rgba(245,208,136,0.08)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" />
        <rect x="10.25" y="9" width="3.5" height="12" rx="0.8" fill="rgba(245,208,136,0.14)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" />
        <rect x="17.5" y="4" width="3.5" height="17" rx="0.8" fill="rgba(245,208,136,0.22)" stroke="url(#mfm-gold-bright)" strokeWidth="1.5" />
        <line x1="3" y1="11.5" x2="21" y2="11.5" stroke="url(#mfm-gold-stroke)" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
      </g>
    ),
    aiArena: (
      <g>
        <path d="M12 3 L13.6 9.2 L19.8 10.8 L13.6 12.4 L12 18.6 L10.4 12.4 L4.2 10.8 L10.4 9.2 Z"
              fill="rgba(245,208,136,0.1)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M18.5 4.5 L19 6 L20.5 6.5 L19 7 L18.5 8.5 L18 7 L16.5 6.5 L18 6 Z"
              fill="url(#mfm-gold-bright)" />
        <path d="M5.5 18 L5.8 19 L6.8 19.3 L5.8 19.6 L5.5 20.6 L5.2 19.6 L4.2 19.3 L5.2 19" fill="url(#mfm-gold-stroke)" />
      </g>
    ),
    pulse: (
      <g>
        <circle cx="12" cy="12" r="9" stroke="url(#mfm-gold-stroke)" strokeWidth="1" opacity="0.3" fill="none" />
        <circle cx="12" cy="12" r="6" stroke="url(#mfm-gold-stroke)" strokeWidth="1" opacity="0.55" fill="none" />
        <circle cx="12" cy="12" r="2.8" fill="url(#mfm-gold-bright)" />
        <path d="M3 12 L7.5 12 L9.5 6.5 L13 17.5 L15 12 L21 12"
              stroke="url(#mfm-gold-stroke)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    ),
    news: (
      <g>
        <rect x="3" y="5" width="14" height="15" rx="1.5" fill="rgba(245,208,136,0.08)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" />
        <path d="M17 8 H20 a1 1 0 011 1 V18 a2 2 0 01-2 2 H17" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <line x1="6" y1="9" x2="14" y2="9" stroke="url(#mfm-gold-bright)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="6" y1="12" x2="14" y2="12" stroke="url(#mfm-gold-stroke)" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
        <line x1="6" y1="15" x2="11" y2="15" stroke="url(#mfm-gold-stroke)" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
      </g>
    ),
    onchain: (
      <g>
        <line x1="6" y1="6" x2="12" y2="14" stroke="url(#mfm-gold-stroke)" strokeWidth="1.3" />
        <line x1="18" y1="6" x2="12" y2="14" stroke="url(#mfm-gold-stroke)" strokeWidth="1.3" />
        <line x1="12" y1="14" x2="6" y2="20" stroke="url(#mfm-gold-stroke)" strokeWidth="1.3" />
        <line x1="12" y1="14" x2="18" y2="20" stroke="url(#mfm-gold-stroke)" strokeWidth="1.3" />
        <circle cx="6" cy="6" r="2.4" fill="rgba(245,208,136,0.18)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.4" />
        <circle cx="18" cy="6" r="2.4" fill="rgba(245,208,136,0.18)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.4" />
        <circle cx="12" cy="14" r="2.6" fill="url(#mfm-gold-bright)" stroke="url(#mfm-gold-bright)" strokeWidth="1" />
        <circle cx="6" cy="20" r="1.8" fill="rgba(245,208,136,0.18)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.4" />
        <circle cx="18" cy="20" r="1.8" fill="rgba(245,208,136,0.18)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.4" />
      </g>
    ),
    bitcoin: (
      <g>
        <circle cx="12" cy="12" r="9" fill="rgba(245,208,136,0.1)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="9" stroke="url(#mfm-gold-bright)" strokeWidth="0.5" fill="none" opacity="0.4" />
        <path d="M10.5 6.5 V8 M13.5 6.5 V8 M10.5 16 V17.5 M13.5 16 V17.5"
              stroke="url(#mfm-gold-bright)" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M9 8 H14.5 a1.8 1.8 0 010 3.5 H9 M9 11.5 H15 a1.8 1.8 0 010 3.5 H9 V8 z"
              stroke="url(#mfm-gold-stroke)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
              fill="rgba(245,208,136,0.12)" />
      </g>
    ),
    markets: (
      <g>
        <circle cx="12" cy="12" r="9" fill="rgba(245,208,136,0.06)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" />
        <ellipse cx="12" cy="12" rx="4" ry="9" stroke="url(#mfm-gold-stroke)" strokeWidth="1.2" fill="none" opacity="0.65" />
        <line x1="3" y1="12" x2="21" y2="12" stroke="url(#mfm-gold-bright)" strokeWidth="1.3" />
        <line x1="3" y1="8" x2="21" y2="8" stroke="url(#mfm-gold-stroke)" strokeWidth="0.8" opacity="0.4" />
        <line x1="3" y1="16" x2="21" y2="16" stroke="url(#mfm-gold-stroke)" strokeWidth="0.8" opacity="0.4" />
      </g>
    ),
    journal: (
      <g>
        <rect x="4" y="3" width="14" height="18" rx="1.5" fill="rgba(245,208,136,0.08)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" />
        <line x1="7" y1="3" x2="7" y2="21" stroke="url(#mfm-gold-stroke)" strokeWidth="1" opacity="0.6" />
        <path d="M14.5 7.5 L17.5 4.5 L19.5 6.5 L16.5 9.5 Z" fill="url(#mfm-gold-bright)" stroke="url(#mfm-gold-bright)" strokeWidth="1.2" strokeLinejoin="round" />
        <line x1="9.5" y1="13" x2="14.5" y2="13" stroke="url(#mfm-gold-stroke)" strokeWidth="1.3" strokeLinecap="round" />
        <line x1="9.5" y1="16" x2="13" y2="16" stroke="url(#mfm-gold-stroke)" strokeWidth="1.3" strokeLinecap="round" opacity="0.6" />
      </g>
    ),
    portfolio: (
      <g>
        <rect x="3" y="7" width="18" height="13" rx="1.5" fill="rgba(245,208,136,0.1)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" />
        <path d="M9 7 V5.5 a1 1 0 011-1 H14 a1 1 0 011 1 V7" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" fill="none" />
        <line x1="3" y1="13" x2="21" y2="13" stroke="url(#mfm-gold-bright)" strokeWidth="1.2" />
        <rect x="10.5" y="11.5" width="3" height="3" rx="0.4" fill="url(#mfm-gold-bright)" />
      </g>
    ),
    analytics: (
      <g>
        <path d="M3 20 H21" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="5" y="13" width="3" height="6" rx="0.5" fill="rgba(245,208,136,0.18)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.4" />
        <rect x="10.5" y="9" width="3" height="10" rx="0.5" fill="rgba(245,208,136,0.28)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.4" />
        <rect x="16" y="5" width="3" height="14" rx="0.5" fill="rgba(245,208,136,0.4)" stroke="url(#mfm-gold-bright)" strokeWidth="1.4" />
        <path d="M5 11 L11 7.5 L17 4" stroke="url(#mfm-gold-bright)" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.6" />
      </g>
    ),
    orderbook: (
      <g>
        <rect x="3" y="4" width="8" height="16" rx="1" fill="rgba(245,208,136,0.08)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.4" />
        <rect x="13" y="4" width="8" height="16" rx="1" fill="rgba(245,208,136,0.18)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.4" />
        <line x1="5" y1="8" x2="9" y2="8" stroke="url(#mfm-gold-stroke)" strokeWidth="1.2" />
        <line x1="5" y1="11" x2="8" y2="11" stroke="url(#mfm-gold-stroke)" strokeWidth="1.2" />
        <line x1="5" y1="14" x2="9" y2="14" stroke="url(#mfm-gold-stroke)" strokeWidth="1.2" />
        <line x1="5" y1="17" x2="7" y2="17" stroke="url(#mfm-gold-stroke)" strokeWidth="1.2" />
        <line x1="15" y1="8" x2="19" y2="8" stroke="url(#mfm-gold-bright)" strokeWidth="1.2" />
        <line x1="15" y1="11" x2="18" y2="11" stroke="url(#mfm-gold-bright)" strokeWidth="1.2" />
        <line x1="15" y1="14" x2="19" y2="14" stroke="url(#mfm-gold-bright)" strokeWidth="1.2" />
        <line x1="15" y1="17" x2="17" y2="17" stroke="url(#mfm-gold-bright)" strokeWidth="1.2" />
      </g>
    ),
    calendar: (
      <g>
        <rect x="3" y="5" width="18" height="16" rx="1.5" fill="rgba(245,208,136,0.08)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" />
        <line x1="3" y1="10" x2="21" y2="10" stroke="url(#mfm-gold-bright)" strokeWidth="1.3" />
        <line x1="8" y1="3" x2="8" y2="7" stroke="url(#mfm-gold-stroke)" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="16" y1="3" x2="16" y2="7" stroke="url(#mfm-gold-stroke)" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="14" r="1" fill="url(#mfm-gold-stroke)" />
        <circle cx="12" cy="14" r="1.2" fill="url(#mfm-gold-bright)" />
        <circle cx="16" cy="14" r="1" fill="url(#mfm-gold-stroke)" opacity="0.6" />
        <circle cx="8" cy="17.5" r="1" fill="url(#mfm-gold-stroke)" opacity="0.5" />
        <circle cx="12" cy="17.5" r="1" fill="url(#mfm-gold-stroke)" />
      </g>
    ),
    whale: (
      <g>
        <path d="M3 13 c2-5 6-7 10-6 c3 1 5 3 6 5 c1 2 2 4 2 4 l-2-1 c-1 2-3 3-5 3 c-3 0-6-1-8-2 c-2-1-3-2-3-3z"
              fill="rgba(245,208,136,0.14)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M7 11 c1.5-1.5 3.5-2 5.5-2" stroke="url(#mfm-gold-stroke)" strokeWidth="0.8" fill="none" opacity="0.5" />
        <circle cx="15" cy="9.5" r="0.9" fill="url(#mfm-gold-bright)" />
        <path d="M19 12 c0-1 1-2 2-2" stroke="url(#mfm-gold-bright)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      </g>
    ),
    tips: (
      <g>
        <path d="M4 5 a1 1 0 011-1 h7 v15 H5 a1 1 0 01-1-1 z" fill="rgba(245,208,136,0.1)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M12 4 h7 a1 1 0 011 1 v13 a1 1 0 01-1 1 h-7" fill="rgba(245,208,136,0.16)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" strokeLinejoin="round" />
        <line x1="12" y1="4" x2="12" y2="19" stroke="url(#mfm-gold-bright)" strokeWidth="1.4" />
        <path d="M12 19 c-1.5-1-3.5-1.5-7-1.5 M12 19 c1.5-1 3.5-1.5 7-1.5"
              stroke="url(#mfm-gold-stroke)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        <line x1="6.5" y1="9" x2="9.5" y2="9" stroke="url(#mfm-gold-stroke)" strokeWidth="1" opacity="0.5" />
        <line x1="14.5" y1="9" x2="17.5" y2="9" stroke="url(#mfm-gold-stroke)" strokeWidth="1" opacity="0.5" />
      </g>
    ),
    watchlist: (
      <g>
        <path d="M12 3 L14.6 8.5 L20.6 9.3 L16.2 13.5 L17.4 19.5 L12 16.5 L6.6 19.5 L7.8 13.5 L3.4 9.3 L9.4 8.5 Z"
              fill="rgba(245,208,136,0.18)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M12 6.5 L13.4 9.5 L16.5 10 L14 12.3 L14.6 15.5 L12 14"
              fill="url(#mfm-gold-bright)" opacity="0.7" />
      </g>
    ),
    referral: (
      <g>
        <rect x="3" y="9" width="18" height="11" rx="1.5" fill="rgba(245,208,136,0.1)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" />
        <path d="M9 9 V6.5 a2 2 0 014 0 V9" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" fill="none" />
        <path d="M11 9 V6.5 a2 2 0 014 0 V9" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" fill="none" />
        <line x1="3" y1="13.5" x2="21" y2="13.5" stroke="url(#mfm-gold-bright)" strokeWidth="1.3" />
        <line x1="12" y1="9" x2="12" y2="20" stroke="url(#mfm-gold-bright)" strokeWidth="1.3" />
        <circle cx="12" cy="13.5" r="1.4" fill="url(#mfm-gold-bright)" />
      </g>
    ),
    admin: (
      <g>
        <path d="M12 3 L20 6 V12 c0 4-3 7-8 9 c-5-2-8-5-8-9 V6 Z"
              fill="rgba(245,180,120,0.15)" stroke="url(#mfm-gold-stroke)" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9 12 L11 14 L15 9.5"
              stroke="url(#mfm-gold-bright)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    ),
  };

  // Flat feature list
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

  const modalContent = (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center px-4 py-6 mfm-overlay ${isClosing ? 'mfm-overlay-out' : ''}`}
      onClick={handleClose}
    >
      {/* ─── Hidden SVG defs (gradients reused by every icon) ─── */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <linearGradient id="mfm-gold-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"  stopColor="#fde6a8" />
            <stop offset="50%" stopColor="#d4a853" />
            <stop offset="100%" stopColor="#8b6914" />
          </linearGradient>
          <linearGradient id="mfm-gold-bright" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"  stopColor="#fff5d6" />
            <stop offset="100%" stopColor="#f5d088" />
          </linearGradient>
        </defs>
      </svg>

      <style>{`
        /* ─── Custom property registration for animatable angle ─── */
        @property --mfm-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @property --mfm-sweep {
          syntax: '<percentage>';
          initial-value: -100%;
          inherits: false;
        }

        /* ─── Overlay ─── */
        .mfm-overlay {
          background: rgba(0,0,0,0);
          backdrop-filter: blur(0px);
          animation: mfmOverlayIn .35s ease forwards;
        }
        .mfm-overlay-out { animation: mfmOverlayOut .22s ease forwards; }
        .mfm-overlay-out .mfm-card { animation: mfmCardOut .22s ease forwards; }
        @keyframes mfmOverlayIn {
          to { background: rgba(0,0,0,.85); backdrop-filter: blur(14px); }
        }
        @keyframes mfmOverlayOut {
          from { background: rgba(0,0,0,.85); backdrop-filter: blur(14px); }
          to   { background: rgba(0,0,0,0); backdrop-filter: blur(0px); }
        }

        /* ─── Card ─── */
        .mfm-card {
          animation: mfmCardIn .42s cubic-bezier(.16,1,.3,1) forwards;
          background:
            radial-gradient(ellipse 60% 40% at 20% 0%, rgba(212,168,83,0.10), transparent 60%),
            radial-gradient(ellipse 50% 40% at 90% 100%, rgba(180,80,40,0.07), transparent 60%),
            #131012;
          box-shadow:
            0 30px 90px -15px rgba(0,0,0,0.8),
            0 0 0 1px rgba(212,168,83,0.08),
            inset 0 1px 0 rgba(255,255,255,0.04);
        }
        @keyframes mfmCardIn {
          from { opacity: 0; transform: scale(.97) translateY(16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes mfmCardOut {
          from { opacity: 1; transform: scale(1); }
          to   { opacity: 0; transform: scale(.97) translateY(16px); }
        }

        .mfm-edge-light {
          position: absolute;
          top: 0; left: 8%; right: 8%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(245,208,136,0.6), transparent);
        }

        /* ─── Typography ─── */
        .mfm-serif {
          font-family: 'Playfair Display', 'Cormorant Garamond', Georgia, serif;
          letter-spacing: -0.025em;
        }
        .mfm-gold-grad {
          background: linear-gradient(135deg, #fde6a8 0%, #d4a853 50%, #a87938 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
        }

        /* ─── Tile (the star of the show) ─── */
        .mfm-tile {
          --mx: 50%;
          --my: 50%;
          --mfm-angle: 0deg;
          --mfm-sweep: -100%;
          position: relative;
          padding: 18px 16px 16px;
          border-radius: 14px;
          background: linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005));
          border: 1px solid rgba(255,255,255,0.05);
          transition:
            transform .4s cubic-bezier(.16,1,.3,1),
            border-color .35s ease,
            background .35s ease,
            box-shadow .4s ease;
          overflow: hidden;
          isolation: isolate;
        }

        /* Layer 1 — flowing gold conic-gradient border (the magic) */
        .mfm-tile::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1.5px;
          background: conic-gradient(
            from var(--mfm-angle),
            transparent 0deg,
            transparent 90deg,
            rgba(253,230,168,0.9) 130deg,
            rgba(245,208,136,1) 150deg,
            rgba(212,168,83,0.85) 170deg,
            transparent 210deg,
            transparent 360deg
          );
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;
          opacity: 0;
          transition: opacity .4s ease;
          pointer-events: none;
          z-index: 1;
        }

        /* Layer 2 — cursor-following spotlight inside surface */
        .mfm-tile::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(
            300px circle at var(--mx) var(--my),
            rgba(245,208,136,0.12),
            rgba(212,168,83,0.04) 35%,
            transparent 65%
          );
          opacity: 0;
          transition: opacity .35s ease;
          pointer-events: none;
          z-index: 0;
        }

        /* Layer 3 — diagonal light sweep (the "polished metal" feel) */
        .mfm-sweep {
          position: absolute;
          inset: -10%;
          background: linear-gradient(
            115deg,
            transparent 0%,
            transparent calc(var(--mfm-sweep) - 10%),
            rgba(253,230,168,0.05) calc(var(--mfm-sweep) - 4%),
            rgba(253,230,168,0.18) var(--mfm-sweep),
            rgba(253,230,168,0.05) calc(var(--mfm-sweep) + 4%),
            transparent calc(var(--mfm-sweep) + 10%),
            transparent 100%
          );
          opacity: 0;
          transition: opacity .25s ease;
          pointer-events: none;
          z-index: 1;
        }

        /* ─── Hover triggers all three effects ─── */
        .mfm-tile:hover {
          transform: translateY(-5px);
          background: linear-gradient(180deg, rgba(212,168,83,0.05), rgba(212,168,83,0.01));
          border-color: rgba(212,168,83,0.12);
          box-shadow:
            0 14px 36px -12px rgba(212,168,83,0.32),
            0 0 0 1px rgba(212,168,83,0.04);
          --mfm-angle: 360deg;
        }
        .mfm-tile:hover::before {
          opacity: 1;
          transition: opacity .4s ease, --mfm-angle 2.4s linear;
          animation: mfmFlow 2.4s linear infinite;
        }
        .mfm-tile:hover::after  { opacity: 1; }
        .mfm-tile:hover .mfm-sweep {
          opacity: 1;
          animation: mfmSweep 1.4s cubic-bezier(.4,0,.2,1) forwards;
        }
        .mfm-tile:hover .mfm-icon-wrap {
          transform: translateY(-3px);
        }
        .mfm-tile:hover .mfm-icon-glow {
          opacity: 1;
        }
        .mfm-tile:hover .mfm-label {
          background: linear-gradient(110deg,
            #fff 0%,
            #fff 35%,
            #fde6a8 50%,
            #fff 65%,
            #fff 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
                  background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: mfmShimmer 1.6s ease-in-out;
        }
        .mfm-tile:hover .mfm-arrow {
          opacity: 1;
          transform: translateX(0);
        }

        @keyframes mfmFlow {
          to { --mfm-angle: 360deg; }
        }
        @keyframes mfmSweep {
          0%   { --mfm-sweep: -20%; opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { --mfm-sweep: 120%; opacity: 0; }
        }
        @keyframes mfmShimmer {
          from { background-position: 200% 0; }
          to   { background-position: -200% 0; }
        }

        /* ─── Active state ─── */
        .mfm-tile.active {
          background: linear-gradient(180deg, rgba(212,168,83,0.08), rgba(212,168,83,0.02));
          border-color: rgba(212,168,83,0.4);
          box-shadow:
            0 0 0 1px rgba(212,168,83,0.25),
            0 10px 30px -10px rgba(212,168,83,0.3),
            inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .mfm-tile.active::before {
          opacity: 1;
          animation: mfmFlow 4s linear infinite;
        }
        .mfm-tile.active::after { opacity: 1; }
        .mfm-tile.active .mfm-icon-glow { opacity: 1; }

        /* Tile content stays above all the layers */
        .mfm-tile > * { position: relative; z-index: 2; }

        /* ─── Icon container ─── */
        .mfm-icon-wrap {
          position: relative;
          width: 46px;
          height: 46px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
          background:
            radial-gradient(circle at 30% 25%, rgba(253,230,168,0.18), transparent 60%),
            linear-gradient(160deg, rgba(245,208,136,0.08), rgba(168,121,56,0.03));
          border: 1px solid rgba(212,168,83,0.18);
          transition:
            transform .45s cubic-bezier(.16,1,.3,1),
            border-color .35s ease,
            background .35s ease;
        }
        .mfm-icon-wrap.is-admin {
          background:
            radial-gradient(circle at 30% 25%, rgba(245,180,120,0.2), transparent 60%),
            linear-gradient(160deg, rgba(245,160,100,0.10), rgba(180,70,40,0.03));
          border-color: rgba(220,120,80,0.25);
        }
        .mfm-tile:hover .mfm-icon-wrap {
          border-color: rgba(245,208,136,0.4);
        }

        /* ─── Pulsing glow ring behind icon (idle ambient + amplified on hover) ─── */
        .mfm-icon-glow {
          position: absolute;
          inset: -6px;
          border-radius: 16px;
          background: radial-gradient(circle, rgba(245,208,136,0.35), transparent 65%);
          filter: blur(8px);
          opacity: 0;
          transition: opacity .4s ease;
          z-index: -1;
          animation: mfmPulse 3.5s ease-in-out infinite;
        }
        @keyframes mfmPulse {
          0%, 100% { transform: scale(1);   filter: blur(8px); }
          50%      { transform: scale(1.08); filter: blur(10px); }
        }

        /* ─── Label & description ─── */
        .mfm-label {
          font-size: 13.5px;
          font-weight: 600;
          line-height: 1.2;
          letter-spacing: -0.005em;
          color: #fff;
          transition: color .25s ease;
        }
        .mfm-label.active {
          background: linear-gradient(135deg, #fde6a8, #d4a853);
          -webkit-background-clip: text;
                  background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        /* ─── PRO badge ─── */
        .mfm-pro {
          position: absolute;
          top: 12px;
          right: 12px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.14em;
          padding: 3px 7px;
          border-radius: 4px;
          background: linear-gradient(135deg, rgba(253,230,168,0.22), rgba(212,168,83,0.08));
          color: #fde6a8;
          border: 1px solid rgba(245,208,136,0.35);
          font-family: 'Inter', system-ui, sans-serif;
          box-shadow: 0 2px 8px -2px rgba(245,208,136,0.3);
        }

        /* ─── Active dot ─── */
        .mfm-active-dot {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: radial-gradient(circle, #fff5d6, #f5d088);
          box-shadow: 0 0 12px rgba(245,208,136,0.9), 0 0 4px rgba(255,245,214,0.8);
          animation: mfmDotPulse 2s ease-in-out infinite;
        }
        @keyframes mfmDotPulse {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%      { transform: scale(1.2); opacity: 0.85; }
        }

        /* ─── Arrow indicator ─── */
        .mfm-arrow {
          position: absolute;
          bottom: 14px;
          right: 14px;
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #f5d088;
          opacity: 0;
          transform: translateX(-6px);
          transition: opacity .3s ease, transform .35s cubic-bezier(.16,1,.3,1);
        }

        /* ─── Scrollbar ─── */
        .mfm-body::-webkit-scrollbar { width: 6px; }
        .mfm-body::-webkit-scrollbar-track { background: transparent; }
        .mfm-body::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(212,168,83,0.3), rgba(212,168,83,0.1));
          border-radius: 3px;
        }
        .mfm-body::-webkit-scrollbar-thumb:hover { background: rgba(245,208,136,0.45); }

        /* ─── Reduced motion ─── */
        @media (prefers-reduced-motion: reduce) {
          .mfm-tile:hover::before,
          .mfm-tile.active::before { animation: none; }
          .mfm-tile:hover .mfm-sweep { animation: none; opacity: 0; }
          .mfm-tile:hover .mfm-label { animation: none; }
          .mfm-icon-glow { animation: none; }
          .mfm-active-dot { animation: none; }
        }
      `}</style>

      <div
        className="mfm-card relative w-full max-w-5xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mfm-edge-light" />

        {/* ────────── HEADER ────────── */}
        <div className="relative px-7 sm:px-9 pt-9 pb-6 flex-shrink-0">
          <button
            onClick={handleClose}
            aria-label="Close"
            className="absolute top-5 right-5 w-9 h-9 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/[0.06] transition-all"
            style={{ border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <h2 className="mfm-serif text-3xl sm:text-[40px] font-bold leading-[1.05] mb-2.5">
            <span className="text-white">{t('mfm.title_lead', { defaultValue: 'More' })}</span>{' '}
            <span className="mfm-gold-grad italic">
              {t('mfm.title_accent', { defaultValue: 'Features' })}
            </span>
          </h2>
          <p className="text-white/45 text-[13.5px] leading-relaxed max-w-md">
            {t('mfm.subtitle', { defaultValue: 'Explore the complete LuxQuant toolkit.' })}
          </p>
        </div>

        {/* ────────── BODY ────────── */}
        <div ref={gridRef} className="mfm-body flex-1 overflow-y-auto px-7 sm:px-9 pb-7">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
            {features.map((item) => {
              const active = isActive(item.path);
              const isPro = premiumPaths.includes(item.path) && !isPremium;

              return (
                <button
                  key={item.path}
                  onClick={() => handleItemClick(item.path)}
                  className={`mfm-tile group flex flex-col items-start text-left ${active ? 'active' : ''}`}
                >
                  {/* Light sweep layer */}
                  <span className="mfm-sweep" />

                  {/* Top-right indicator */}
                  {active ? (
                    <span className="mfm-active-dot" />
                  ) : isPro ? (
                    <span className="mfm-pro">PRO</span>
                  ) : null}

                  {/* Icon w/ ambient glow ring */}
                  <div className={`mfm-icon-wrap ${item.isAdmin ? 'is-admin' : ''}`}>
                    <span className="mfm-icon-glow" />
                    <svg className="w-[22px] h-[22px] relative" viewBox="0 0 24 24" fill="none">
                      {item.icon}
                    </svg>
                  </div>

                  {/* Label with shimmer-on-hover */}
                  <span className={`mfm-label ${active ? 'active' : ''}`}>
                    {item.label}
                  </span>

                  {/* Description */}
                  {item.desc && (
                    <span className="text-[11.5px] text-white/40 mt-1.5 leading-snug line-clamp-2">
                      {item.desc}
                    </span>
                  )}

                  {/* Arrow */}
                  <span className="mfm-arrow">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default MoreFeaturesModal;