// src/components/MoreFeaturesModal.jsx
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/**
 * MoreFeaturesModal v3 — "Quantitative Pipeline" aesthetic
 *
 * Design language inspired by LuxQuant landing page:
 *   • Serif headline with dual-tone gold gradient
 *   • Mono breadcrumb readout (// PATH → PATH → ...)
 *   • Hex addressing per tile (0x01..0x12)
 *   • L-shaped corner brackets on tiles
 *   • Technical status pills ([ PRO ], ● ACTIVE)
 *   • Radial ambient glow (warm red/gold) bleeding from corners
 *   • Section dividers (// PRIMARY, // SECONDARY, // UTILITY)
 *   • Terminal-style footer readout
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
    }, 220);
  };

  const handleItemClick = (path) => {
    handleClose();
    setTimeout(() => onNavigate(path), 80);
  };

  if (!isOpen) return null;

  // ─── Custom-crafted SVG icons (carried over from v2) ──────────
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

  // ─── Feature catalog grouped by tier ───────────────────────────
  const groups = [
    {
      key: 'primary',
      label: 'PRIMARY',
      sub: 'core_modules',
      items: [
        { path: '/home',      icon: Icon.home,      label: t('mfm.home'),      desc: t('mfm.home_desc') },
        { path: '/signals',   icon: Icon.signals,   label: t('mfm.signals'),   desc: t('mfm.signals_desc') },
        { path: '/autotrade', icon: Icon.autotrade, label: t('mfm.autotrade'), desc: t('mfm.autotrade_desc') },
        { path: '/ai-arena',  icon: Icon.aiArena,   label: t('mfm.ai_arena'),  desc: t('mfm.ai_arena_desc') },
        { path: '/bitcoin',   icon: Icon.bitcoin,   label: t('mfm.bitcoin'),   desc: t('mfm.bitcoin_desc') },
      ],
    },
    {
      key: 'secondary',
      label: 'SECONDARY',
      sub: 'analytics_layer',
      items: [
        { path: '/market-pulse', icon: Icon.pulse,    label: t('mfm.pulse'),    desc: t('mfm.pulse_desc') },
        { path: '/crypto-news',  icon: Icon.news,     label: t('mfm.news'),     desc: t('mfm.news_desc') },
        { path: '/onchain',      icon: Icon.onchain,  label: t('mfm.onchain'),  desc: t('mfm.onchain_desc') },
        { path: '/markets',      icon: Icon.markets,  label: t('mfm.markets'),  desc: t('mfm.markets_desc') },
        { path: '/journal',      icon: Icon.journal,  label: t('mfm.journal'),  desc: t('mfm.journal_desc') },
      ],
    },
    {
      key: 'utility',
      label: 'UTILITY',
      sub: 'support_modules',
      items: [
        { path: '/portfolio', icon: Icon.portfolio, label: t('mfm.portfolio'), desc: t('mfm.portfolio_desc') },
        { path: '/analytics', icon: Icon.analytics, label: t('mfm.analytics'), desc: t('mfm.analytics_desc') },
        { path: '/orderbook', icon: Icon.orderbook, label: t('mfm.orderbook'), desc: t('mfm.orderbook_desc') },
        { path: '/calendar',  icon: Icon.calendar,  label: t('mfm.calendar'),  desc: t('mfm.calendar_desc') },
        { path: '/whale',     icon: Icon.whale,     label: t('mfm.whale'),     desc: t('mfm.whale_desc') },
        { path: '/tips',      icon: Icon.tips,      label: t('mfm.tips'),      desc: t('mfm.tips_desc') },
        { path: '/watchlist', icon: Icon.watchlist, label: t('mfm.watchlist'), desc: t('mfm.watchlist_desc') },
        { path: '/referral',  icon: Icon.referral,  label: t('mfm.referral'),  desc: t('mfm.referral_desc') },
      ],
    },
    ...(isAdmin ? [{
      key: 'admin',
      label: 'ADMIN',
      sub: 'restricted_access',
      items: [
        { path: '/admin', icon: Icon.admin, label: t('mfm.admin'), desc: t('mfm.admin_desc') },
      ],
    }] : []),
  ];

  // Flat list with global hex addressing
  let hexCounter = 0;
  const flatItems = groups.flatMap(g =>
    g.items.map(it => {
      hexCounter += 1;
      return { ...it, tier: g.key, hex: `0x${hexCounter.toString(16).toUpperCase().padStart(2, '0')}` };
    })
  );
  const totalCount = flatItems.length;

  // Build breadcrumb readout from primary tier paths
  const breadcrumb = groups[0].items
    .slice(0, 4)
    .map(i => i.path.replace('/', '').replace('-', '_').toUpperCase())
    .join('  →  ');

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
          to { background: rgba(0,0,0,.88); backdrop-filter: blur(10px); }
        }
        @keyframes mfmOverlayOut {
          from { background: rgba(0,0,0,.88); backdrop-filter: blur(10px); }
          to   { background: rgba(0,0,0,0);   backdrop-filter: blur(0px); }
        }

        /* ─── Card with warm radial ambient ─── */
        .mfm-card {
          animation: mfmCardIn .4s cubic-bezier(.16,1,.3,1) forwards;
          background:
            radial-gradient(ellipse 80% 50% at 15% 0%, rgba(180,40,30,0.16), transparent 55%),
            radial-gradient(ellipse 70% 60% at 90% 110%, rgba(212,168,83,0.10), transparent 55%),
            radial-gradient(ellipse 100% 60% at 50% 50%, rgba(40,20,15,0.4), transparent 70%),
            #0a0708;
        }
        @keyframes mfmCardIn {
          from { opacity: 0; transform: scale(.97) translateY(14px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes mfmCardOut {
          from { opacity: 1; transform: scale(1); }
          to   { opacity: 0; transform: scale(.97) translateY(14px); }
        }

        /* ─── Typography ─── */
        .mfm-serif {
          font-family: 'Playfair Display', 'Cormorant Garamond', Georgia, serif;
          font-feature-settings: 'liga' 1, 'kern' 1;
          letter-spacing: -0.02em;
        }
        .mfm-mono {
          font-family: 'JetBrains Mono', 'IBM Plex Mono', 'SF Mono', ui-monospace, monospace;
          font-feature-settings: 'liga' 0;
        }
        .mfm-gold-grad {
          background: linear-gradient(135deg, #f5d088 0%, #d4a853 40%, #a87938 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
        }

        /* ─── Pill (• SYSTEM ARCHITECTURE style) ─── */
        .mfm-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 5px 12px;
          border-radius: 999px;
          border: 1px solid rgba(212,168,83,0.25);
          background: rgba(212,168,83,0.04);
          font-size: 10px;
          letter-spacing: 0.18em;
          color: #c89143;
        }
        .mfm-pill-dot {
          width: 5px; height: 5px; border-radius: 999px;
          background: #d4a853;
          box-shadow: 0 0 8px rgba(212,168,83,0.7);
        }

        /* ─── Breadcrumb readout ─── */
        .mfm-breadcrumb {
          display: inline-block;
          padding: 7px 16px;
          border: 1px solid rgba(212,168,83,0.18);
          background: rgba(20,12,8,0.5);
          border-radius: 6px;
          font-size: 11px;
          color: rgba(245,208,136,0.65);
          letter-spacing: 0.08em;
        }
        .mfm-breadcrumb .arrow { color: rgba(212,168,83,0.5); margin: 0 2px; }
        .mfm-breadcrumb .slash { color: rgba(168,121,56,0.7); margin-right: 6px; }

        /* ─── Section divider ─── */
        .mfm-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 18px 0 14px;
        }
        .mfm-divider-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          letter-spacing: 0.22em;
          color: rgba(212,168,83,0.7);
          white-space: nowrap;
        }
        .mfm-divider-label .num {
          color: rgba(168,121,56,0.55);
        }
        .mfm-divider-line {
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, rgba(212,168,83,0.25), transparent);
        }
        .mfm-divider-count {
          font-size: 10px;
          letter-spacing: 0.15em;
          color: rgba(168,121,56,0.55);
          white-space: nowrap;
        }

        /* ─── Tile ─── */
        .mfm-tile {
          position: relative;
          padding: 14px 12px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.05);
          background: linear-gradient(180deg, rgba(255,255,255,0.012), rgba(255,255,255,0.002));
          transition: transform .28s cubic-bezier(.16,1,.3,1),
                      border-color .25s ease,
                      background .25s ease,
                      box-shadow .25s ease;
          overflow: hidden;
        }
        .mfm-tile::before {
          /* warm ambient inner glow */
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(ellipse 80% 60% at 50% -20%, rgba(212,168,83,0.0), transparent 60%);
          transition: background .3s ease;
          pointer-events: none;
        }
        .mfm-tile:hover {
          transform: translateY(-3px);
          border-color: rgba(212,168,83,0.3);
          background: linear-gradient(180deg, rgba(212,168,83,0.05), rgba(212,168,83,0.01));
          box-shadow:
            0 10px 28px -10px rgba(212,168,83,0.28),
            0 0 0 1px rgba(212,168,83,0.06),
            inset 0 1px 0 rgba(255,255,255,0.04);
        }
        .mfm-tile:hover::before {
          background: radial-gradient(ellipse 80% 60% at 50% -20%, rgba(212,168,83,0.18), transparent 60%);
        }
        .mfm-tile:hover .mfm-corner { opacity: 1; }
        .mfm-tile:hover .mfm-icon-wrap { transform: scale(1.05); }
        .mfm-tile:hover .mfm-hex { color: rgba(212,168,83,0.85); }

        .mfm-tile.active {
          border-color: rgba(212,168,83,0.5);
          background: linear-gradient(180deg, rgba(212,168,83,0.07), rgba(212,168,83,0.015));
          box-shadow:
            0 0 0 1px rgba(212,168,83,0.25),
            0 4px 18px -4px rgba(212,168,83,0.32),
            inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .mfm-tile.active .mfm-corner { opacity: 1; }
        .mfm-tile.active .mfm-hex { color: rgba(212,168,83,0.9); }

        /* ─── L-shaped corner brackets ─── */
        .mfm-corner {
          position: absolute;
          width: 10px;
          height: 10px;
          border-color: rgba(212,168,83,0.6);
          opacity: 0.25;
          transition: opacity .25s ease;
          pointer-events: none;
        }
        .mfm-corner.tl { top: 6px; left: 6px;  border-top: 1px solid; border-left: 1px solid; }
        .mfm-corner.tr { top: 6px; right: 6px; border-top: 1px solid; border-right: 1px solid; }
        .mfm-corner.bl { bottom: 6px; left: 6px;  border-bottom: 1px solid; border-left: 1px solid; }
        .mfm-corner.br { bottom: 6px; right: 6px; border-bottom: 1px solid; border-right: 1px solid; }

        /* ─── Hex address ─── */
        .mfm-hex {
          font-size: 9px;
          letter-spacing: 0.1em;
          color: rgba(168,121,56,0.55);
          transition: color .25s ease;
        }

        /* ─── Icon container ─── */
        .mfm-icon-wrap {
          position: relative;
          width: 46px;
          height: 46px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 6px auto 12px;
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
        .mfm-icon-wrap.t-primary {
          background:
            radial-gradient(circle at 30% 25%, rgba(253,230,168,0.18), transparent 65%),
            rgba(212,168,83,0.10);
          color: #f5d088;
        }
        .mfm-icon-wrap.t-primary::after {
          background: linear-gradient(135deg, rgba(253,230,168,0.5), rgba(212,168,83,0.2), rgba(139,105,20,0.35));
        }
        .mfm-icon-wrap.t-secondary {
          background:
            radial-gradient(circle at 30% 25%, rgba(245,208,136,0.14), transparent 65%),
            rgba(200,145,67,0.08);
          color: #d4a853;
        }
        .mfm-icon-wrap.t-secondary::after {
          background: linear-gradient(135deg, rgba(245,208,136,0.4), rgba(200,145,67,0.18), rgba(122,86,16,0.3));
        }
        .mfm-icon-wrap.t-utility {
          background:
            radial-gradient(circle at 30% 25%, rgba(232,184,122,0.12), transparent 65%),
            rgba(168,121,56,0.07);
          color: #c89143;
        }
        .mfm-icon-wrap.t-utility::after {
          background: linear-gradient(135deg, rgba(232,184,122,0.35), rgba(168,121,56,0.15), rgba(94,61,9,0.25));
        }
        .mfm-icon-wrap.t-admin {
          background:
            radial-gradient(circle at 30% 25%, rgba(245,180,120,0.18), transparent 65%),
            rgba(200,100,60,0.08);
          color: #e8a878;
        }
        .mfm-icon-wrap.t-admin::after {
          background: linear-gradient(135deg, rgba(245,180,120,0.45), rgba(200,100,60,0.18), rgba(120,50,20,0.3));
        }

        /* ─── Status pills (technical) ─── */
        .mfm-status {
          position: absolute;
          top: 6px;
          right: 22px;
          font-size: 8.5px;
          letter-spacing: 0.12em;
          padding: 2px 6px;
          border-radius: 3px;
          background: rgba(212,168,83,0.12);
          color: #d4a853;
          border: 1px solid rgba(212,168,83,0.28);
        }
        .mfm-status-active {
          position: absolute;
          top: 6px;
          right: 22px;
          font-size: 8.5px;
          letter-spacing: 0.14em;
          color: #6ee7a8;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .mfm-status-active::before {
          content: '';
          width: 5px; height: 5px;
          border-radius: 999px;
          background: #6ee7a8;
          box-shadow: 0 0 6px rgba(110,231,168,0.7);
        }

        /* ─── Footer terminal readout ─── */
        .mfm-footer-readout {
          font-size: 10px;
          letter-spacing: 0.15em;
          color: rgba(168,121,56,0.7);
        }
        .mfm-footer-readout .bracket { color: rgba(168,121,56,0.45); }
        .mfm-footer-readout .num { color: #d4a853; }

        .mfm-kbd {
          display: inline-block;
          padding: 2px 6px;
          font-size: 9.5px;
          letter-spacing: 0.08em;
          border: 1px solid rgba(212,168,83,0.25);
          border-radius: 4px;
          background: rgba(20,12,8,0.5);
          color: rgba(245,208,136,0.7);
          margin: 0 2px;
        }

        /* ─── Scrollbar ─── */
        .mfm-body::-webkit-scrollbar { width: 6px; }
        .mfm-body::-webkit-scrollbar-track { background: transparent; }
        .mfm-body::-webkit-scrollbar-thumb {
          background: rgba(212,168,83,0.18);
          border-radius: 3px;
        }
        .mfm-body::-webkit-scrollbar-thumb:hover { background: rgba(212,168,83,0.32); }
      `}</style>

      <div
        className="mfm-card relative w-full max-w-6xl max-h-[90vh] rounded-2xl border border-white/[0.06] shadow-2xl shadow-black/90 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent line — gold gradient */}
        <div
          className="absolute top-0 left-0 right-0 h-px z-10"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(212,168,83,0.5), rgba(245,208,136,0.7), rgba(212,168,83,0.5), transparent)' }}
        />

        {/* ────────── HEADER ────────── */}
        <div className="relative px-6 sm:px-9 pt-7 pb-5 border-b border-white/[0.05] flex-shrink-0">
          {/* Close button */}
          <button
            onClick={handleClose}
            aria-label="Close"
            className="absolute top-5 right-5 w-9 h-9 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/[0.06] transition-all"
            style={{ border: '1px solid rgba(212,168,83,0.15)' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Section pill */}
          <div className="flex items-center mb-4">
            <span className="mfm-pill mfm-mono">
              <span className="mfm-pill-dot" />
              <span>{t('mfm.section_label', { defaultValue: 'FEATURE INDEX' })}</span>
            </span>
          </div>

          {/* Serif headline */}
          <h2 className="mfm-serif text-white text-3xl sm:text-4xl lg:text-[44px] font-bold leading-[1.05] mb-3">
            {t('mfm.title_lead', { defaultValue: 'More' })}{' '}
            <span className="mfm-gold-grad italic">
              {t('mfm.title_accent', { defaultValue: 'Features' })}
            </span>
          </h2>

          {/* Mono breadcrumb */}
          <div className="mfm-breadcrumb mfm-mono mt-1">
            <span className="slash">//</span>
            {breadcrumb.split('  →  ').map((seg, i, arr) => (
              <span key={i}>
                {seg}
                {i < arr.length - 1 && <span className="arrow">  →  </span>}
              </span>
            ))}
            <span className="arrow">  →  </span>
            <span style={{ color: 'rgba(168,121,56,0.6)' }}>...</span>
          </div>
        </div>

        {/* ────────── BODY ────────── */}
        <div className="mfm-body flex-1 overflow-y-auto px-6 sm:px-9 py-5">
          {groups.map((group, gIdx) => {
            const groupNumber = `0${gIdx + 1}`.slice(-2);
            return (
              <div key={group.key} className={gIdx > 0 ? 'mt-2' : ''}>
                {/* Section divider */}
                <div className="mfm-divider">
                  <span className="mfm-divider-label mfm-mono">
                    <span className="num">{groupNumber}</span>
                    <span style={{ color: 'rgba(168,121,56,0.5)' }}>//</span>
                    <span>{group.label}</span>
                    <span style={{ color: 'rgba(168,121,56,0.4)', marginLeft: 4 }}>· {group.sub}</span>
                  </span>
                  <span className="mfm-divider-line" />
                  <span className="mfm-divider-count mfm-mono">
                    [ {group.items.length.toString().padStart(2, '0')} ]
                  </span>
                </div>

                {/* Tile grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {group.items.map((item) => {
                    const meta = flatItems.find(f => f.path === item.path);
                    const active = isActive(item.path);
                    const isPro = premiumPaths.includes(item.path) && !isPremium;

                    return (
                      <button
                        key={item.path}
                        onClick={() => handleItemClick(item.path)}
                        className={`mfm-tile group flex flex-col items-center text-center ${active ? 'active' : ''}`}
                      >
                        {/* L-shaped corner brackets */}
                        <span className="mfm-corner tl" />
                        <span className="mfm-corner tr" />
                        <span className="mfm-corner bl" />
                        <span className="mfm-corner br" />

                        {/* Hex address */}
                        <div className="absolute top-2 left-2.5 mfm-hex mfm-mono">
                          {meta?.hex}
                        </div>

                        {/* Status pill */}
                        {active ? (
                          <span className="mfm-status-active mfm-mono">ACTIVE</span>
                        ) : isPro ? (
                          <span className="mfm-status mfm-mono">PRO</span>
                        ) : null}

                        {/* Icon container */}
                        <div className={`mfm-icon-wrap t-${group.key}`}>
                          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                            {item.icon}
                          </svg>
                        </div>

                        {/* Label */}
                        <span
                          className={`text-[12.5px] sm:text-[13px] font-semibold leading-tight tracking-tight px-1 ${
                            active ? 'text-[#f5d088]' : 'text-white'
                          }`}
                        >
                          {item.label}
                        </span>

                        {/* Description */}
                        {item.desc && (
                          <span className="text-[10px] text-white/40 mt-1.5 leading-snug line-clamp-2 hidden sm:block px-1">
                            {item.desc}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ────────── FOOTER ────────── */}
        <div className="relative px-6 sm:px-9 py-3.5 border-t border-white/[0.05] flex items-center justify-between flex-shrink-0">
          <span className="mfm-footer-readout mfm-mono">
            <span className="bracket">[</span>{' '}
            <span className="num">{totalCount.toString().padStart(2, '0')}</span>{' '}
            MODULES LOADED{' '}
            <span className="bracket">]</span>
            <span style={{ color: 'rgba(110,231,168,0.7)', marginLeft: 12 }}>● SYNCED</span>
          </span>
          <span className="mfm-footer-readout mfm-mono hidden sm:flex items-center">
            <span>PRESS</span>
            <span className="mfm-kbd">ESC</span>
            <span>TO CLOSE</span>
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default MoreFeaturesModal;