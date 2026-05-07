// src/components/MoreFeaturesModal.jsx
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/**
 * MoreFeaturesModal v4 — Refined.
 *
 * Design principles (from Linear / Stripe / Cursor research):
 *   • Modal sits *brighter* than overlay → creates depth via tonal hierarchy
 *   • Edge lighting on container for dimensionality
 *   • Cursor-following spotlight per tile (premium feel without 3D tilt gimmick)
 *   • Animated gradient border that glows toward cursor
 *   • Hover state must be DISTINCT (not just opacity shift)
 *   • No fake technical chrome — content speaks
 *
 * Removed from v3:
 *   - Hex addresses (noise, no user value)
 *   - Fake breadcrumb (lied about context)
 *   - "FEATURE INDEX" pill (redundant with title)
 *   - Section dividers exposing internal jargon
 *   - "MODULES LOADED" terminal LARP
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

  // ─── Cursor-following spotlight (single mousemove for whole grid) ───
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

  // ─── Custom-crafted SVG icons ───────────────────────────────
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

  // ─── Flat feature list (no internal jargon exposed to user) ───
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
      <style>{`
        /* ─── Overlay ─── */
        .mfm-overlay {
          background: rgba(0,0,0,0);
          backdrop-filter: blur(0px);
          animation: mfmOverlayIn .35s ease forwards;
        }
        .mfm-overlay-out { animation: mfmOverlayOut .22s ease forwards; }
        .mfm-overlay-out .mfm-card { animation: mfmCardOut .22s ease forwards; }
        @keyframes mfmOverlayIn {
          to { background: rgba(0,0,0,.85); backdrop-filter: blur(12px); }
        }
        @keyframes mfmOverlayOut {
          from { background: rgba(0,0,0,.85); backdrop-filter: blur(12px); }
          to   { background: rgba(0,0,0,0); backdrop-filter: blur(0px); }
        }

        /* ─── Card: brighter than overlay (Linear principle) + warm ambient ─── */
        .mfm-card {
          animation: mfmCardIn .42s cubic-bezier(.16,1,.3,1) forwards;
          background:
            radial-gradient(ellipse 60% 40% at 20% 0%, rgba(212,168,83,0.08), transparent 60%),
            radial-gradient(ellipse 50% 40% at 90% 100%, rgba(180,80,40,0.06), transparent 60%),
            #131012;
          box-shadow:
            0 24px 80px -12px rgba(0,0,0,0.7),
            0 0 0 1px rgba(212,168,83,0.06),
            inset 0 1px 0 rgba(255,255,255,0.03);
        }
        @keyframes mfmCardIn {
          from { opacity: 0; transform: scale(.97) translateY(16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes mfmCardOut {
          from { opacity: 1; transform: scale(1); }
          to   { opacity: 0; transform: scale(.97) translateY(16px); }
        }

        /* ─── Edge lighting (subtle gold glow at top edge) ─── */
        .mfm-edge-light {
          position: absolute;
          top: 0;
          left: 10%;
          right: 10%;
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

        /* ─── Tile base ─── */
        .mfm-tile {
          --mx: 50%;
          --my: 50%;
          position: relative;
          padding: 18px 16px 16px;
          border-radius: 14px;
          background: rgba(255,255,255,0.018);
          border: 1px solid rgba(255,255,255,0.06);
          transition:
            transform .35s cubic-bezier(.16,1,.3,1),
            border-color .3s ease,
            background .3s ease;
          overflow: hidden;
          isolation: isolate;
        }

        /* ─── Cursor-following spotlight (radial fill at mouse pos) ─── */
        .mfm-tile::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(
            260px circle at var(--mx) var(--my),
            rgba(245,208,136,0.10),
            rgba(212,168,83,0.04) 40%,
            transparent 70%
          );
          opacity: 0;
          transition: opacity .35s ease;
          pointer-events: none;
          z-index: 0;
        }

        /* ─── Animated gradient border (mask trick, follows cursor) ─── */
        .mfm-tile::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1px;
          background: radial-gradient(
            220px circle at var(--mx) var(--my),
            rgba(245,208,136,0.55),
            rgba(212,168,83,0.15) 40%,
            transparent 70%
          );
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          transition: opacity .35s ease;
          pointer-events: none;
          z-index: 1;
        }

        .mfm-tile:hover {
          transform: translateY(-4px);
          background: rgba(212,168,83,0.025);
          border-color: rgba(212,168,83,0.18);
        }
        .mfm-tile:hover::before { opacity: 1; }
        .mfm-tile:hover::after  { opacity: 1; }
        .mfm-tile:hover .mfm-icon-wrap {
          transform: translateY(-2px) scale(1.06);
        }
        .mfm-tile:hover .mfm-icon-wrap::before { opacity: 1; }
        .mfm-tile:hover .mfm-arrow {
          opacity: 1;
          transform: translateX(0);
        }

        /* ─── Active state (distinct, not just opacity) ─── */
        .mfm-tile.active {
          background: rgba(212,168,83,0.05);
          border-color: rgba(212,168,83,0.4);
          box-shadow:
            0 0 0 1px rgba(212,168,83,0.2),
            0 8px 24px -8px rgba(212,168,83,0.25);
        }
        .mfm-tile.active::before { opacity: 1; }

        /* Tile content above pseudo-elements */
        .mfm-tile > * { position: relative; z-index: 2; }

        /* ─── Icon container ─── */
        .mfm-icon-wrap {
          position: relative;
          width: 44px;
          height: 44px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
          background: linear-gradient(135deg, rgba(245,208,136,0.10), rgba(168,121,56,0.04));
          border: 1px solid rgba(212,168,83,0.18);
          color: #f5d088;
          transition: transform .4s cubic-bezier(.16,1,.3,1);
        }
        .mfm-icon-wrap::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(circle at 30% 25%, rgba(253,230,168,0.25), transparent 60%);
          opacity: 0;
          transition: opacity .35s ease;
        }

        /* Admin variant — slightly warmer/red */
        .mfm-icon-wrap.is-admin {
          background: linear-gradient(135deg, rgba(245,160,100,0.12), rgba(180,70,40,0.04));
          border-color: rgba(220,120,80,0.25);
          color: #f5b088;
        }

        /* ─── PRO badge ─── */
        .mfm-pro {
          position: absolute;
          top: 12px;
          right: 12px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.12em;
          padding: 3px 7px;
          border-radius: 4px;
          background: linear-gradient(135deg, rgba(245,208,136,0.18), rgba(212,168,83,0.08));
          color: #f5d088;
          border: 1px solid rgba(212,168,83,0.3);
          font-family: 'Inter', system-ui, sans-serif;
        }

        /* ─── Active dot ─── */
        .mfm-active-dot {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #f5d088;
          box-shadow: 0 0 10px rgba(245,208,136,0.7);
        }

        /* ─── Arrow indicator (slides in on hover) ─── */
        .mfm-arrow {
          position: absolute;
          bottom: 14px;
          right: 14px;
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(245,208,136,0.7);
          opacity: 0;
          transform: translateX(-6px);
          transition: opacity .3s ease, transform .35s cubic-bezier(.16,1,.3,1);
        }

        /* ─── Scrollbar ─── */
        .mfm-body::-webkit-scrollbar { width: 6px; }
        .mfm-body::-webkit-scrollbar-track { background: transparent; }
        .mfm-body::-webkit-scrollbar-thumb {
          background: rgba(212,168,83,0.15);
          border-radius: 3px;
        }
        .mfm-body::-webkit-scrollbar-thumb:hover { background: rgba(212,168,83,0.3); }
      `}</style>

      <div
        className="mfm-card relative w-full max-w-5xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Edge lighting */}
        <span className="mfm-edge-light" />

        {/* ────────── HEADER ────────── */}
        <div className="relative px-7 sm:px-9 pt-9 pb-6 flex-shrink-0">
          {/* Close button */}
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

          {/* Headline + subtitle */}
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
        <div
          ref={gridRef}
          className="mfm-body flex-1 overflow-y-auto px-7 sm:px-9 pb-7"
        >
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
                  {/* Top-right indicator */}
                  {active ? (
                    <span className="mfm-active-dot" />
                  ) : isPro ? (
                    <span className="mfm-pro">PRO</span>
                  ) : null}

                  {/* Icon */}
                  <div className={`mfm-icon-wrap ${item.isAdmin ? 'is-admin' : ''}`}>
                    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none">
                      {item.icon}
                    </svg>
                  </div>

                  {/* Label */}
                  <span
                    className={`text-[13.5px] font-semibold leading-tight tracking-tight ${
                      active ? 'text-[#f5d088]' : 'text-white'
                    }`}
                  >
                    {item.label}
                  </span>

                  {/* Description */}
                  {item.desc && (
                    <span className="text-[11.5px] text-white/40 mt-1.5 leading-snug line-clamp-2">
                      {item.desc}
                    </span>
                  )}

                  {/* Arrow indicator on hover */}
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