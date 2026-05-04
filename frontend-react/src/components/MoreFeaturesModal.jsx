// src/components/MoreFeaturesModal.jsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * MoreFeaturesModal — App-launcher style grid showing ALL platform features.
 * Replaces the dropdown "More" in header with a fullscreen grid modal.
 *
 * Props:
 *   isOpen      — boolean
 *   onClose     — fn() to close modal
 *   onNavigate  — fn(path) handler from AppShell (preserves PremiumGate logic)
 *   isActive    — fn(path) → boolean (current route check)
 *   isPremium   — boolean (current user premium status)
 *   isAdmin     — boolean (current user admin)
 *   premiumPaths — array of paths that require premium
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
    // Slight delay so close animation can begin before navigation
    setTimeout(() => onNavigate(path), 80);
  };

  if (!isOpen) return null;

  // ─── Feature catalog ───────────────────────────────────────────
  // Icons inline as SVG strings — no external dependencies.
  const features = [
    // ── Main / Header items ──
    {
      path: '/home',
      label: t('mfm.home'),
      desc: t('mfm.home_desc'),
      gradient: 'from-emerald-500/20 to-emerald-600/5',
      iconColor: 'text-emerald-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />,
    },
    {
      path: '/signals',
      label: t('mfm.signals'),
      desc: t('mfm.signals_desc'),
      gradient: 'from-gold-primary/25 to-gold-dark/5',
      iconColor: 'text-gold-primary',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />,
    },
    {
      path: '/autotrade',
      label: t('mfm.autotrade'),
      desc: t('mfm.autotrade_desc'),
      gradient: 'from-blue-500/20 to-blue-600/5',
      iconColor: 'text-blue-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />,
    },
    {
      path: '/ai-arena',
      label: t('mfm.ai_arena'),
      desc: t('mfm.ai_arena_desc'),
      gradient: 'from-purple-500/25 to-purple-600/5',
      iconColor: 'text-purple-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />,
    },
    {
      path: '/market-pulse',
      label: t('mfm.pulse'),
      desc: t('mfm.pulse_desc'),
      gradient: 'from-pink-500/20 to-pink-600/5',
      iconColor: 'text-pink-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />,
    },
    {
      path: '/crypto-news',
      label: t('mfm.news'),
      desc: t('mfm.news_desc'),
      gradient: 'from-cyan-500/20 to-cyan-600/5',
      iconColor: 'text-cyan-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />,
    },
    {
      path: '/onchain',
      label: t('mfm.onchain'),
      desc: t('mfm.onchain_desc'),
      gradient: 'from-indigo-500/20 to-indigo-600/5',
      iconColor: 'text-indigo-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />,
    },
    {
      path: '/bitcoin',
      label: t('mfm.bitcoin'),
      desc: t('mfm.bitcoin_desc'),
      gradient: 'from-orange-500/25 to-amber-600/5',
      iconColor: 'text-orange-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
    },
    {
      path: '/markets',
      label: t('mfm.markets'),
      desc: t('mfm.markets_desc'),
      gradient: 'from-teal-500/20 to-teal-600/5',
      iconColor: 'text-teal-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />,
    },
    {
      path: '/journal',
      label: t('mfm.journal'),
      desc: t('mfm.journal_desc'),
      gradient: 'from-rose-500/20 to-rose-600/5',
      iconColor: 'text-rose-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />,
    },
    // ── Tools ──
    {
      path: '/portfolio',
      label: t('mfm.portfolio'),
      desc: t('mfm.portfolio_desc'),
      gradient: 'from-yellow-500/20 to-yellow-600/5',
      iconColor: 'text-yellow-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />,
    },
    {
      path: '/analytics',
      label: t('mfm.analytics'),
      desc: t('mfm.analytics_desc'),
      gradient: 'from-green-500/20 to-green-600/5',
      iconColor: 'text-green-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />,
    },
    {
      path: '/orderbook',
      label: t('mfm.orderbook'),
      desc: t('mfm.orderbook_desc'),
      gradient: 'from-sky-500/20 to-sky-600/5',
      iconColor: 'text-sky-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4h18M3 8h18M3 12h12M3 16h8M3 20h4" />,
    },
    {
      path: '/calendar',
      label: t('mfm.calendar'),
      desc: t('mfm.calendar_desc'),
      gradient: 'from-red-500/20 to-red-600/5',
      iconColor: 'text-red-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />,
    },
    {
      path: '/whale',
      label: t('mfm.whale'),
      desc: t('mfm.whale_desc'),
      gradient: 'from-blue-400/25 to-blue-600/5',
      iconColor: 'text-blue-300',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7zm10-3a3 3 0 100 6 3 3 0 000-6z" />,
    },
    {
      path: '/tips',
      label: t('mfm.tips'),
      desc: t('mfm.tips_desc'),
      gradient: 'from-amber-500/20 to-amber-600/5',
      iconColor: 'text-amber-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />,
    },
    {
      path: '/watchlist',
      label: t('mfm.watchlist'),
      desc: t('mfm.watchlist_desc'),
      gradient: 'from-yellow-400/25 to-amber-600/5',
      iconColor: 'text-yellow-300',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />,
    },
    {
      path: '/referral',
      label: t('mfm.referral'),
      desc: t('mfm.referral_desc'),
      gradient: 'from-fuchsia-500/20 to-fuchsia-600/5',
      iconColor: 'text-fuchsia-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />,
    },
    // ── Admin (conditional) ──
    ...(isAdmin ? [{
      path: '/admin',
      label: t('mfm.admin'),
      desc: t('mfm.admin_desc'),
      gradient: 'from-red-500/25 to-red-700/5',
      iconColor: 'text-red-400',
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />,
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
        .mfm-card { animation: mfmCardIn .3s cubic-bezier(.16,1,.3,1) forwards; }
        @keyframes mfmCardIn {
          from { opacity: 0; transform: scale(.96) translateY(12px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes mfmCardOut {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(.96) translateY(12px); }
        }
        .mfm-tile {
          transition: transform .2s ease, background .2s ease, border-color .2s ease;
        }
        .mfm-tile:hover {
          transform: translateY(-2px);
        }
      `}</style>

      <div
        className="mfm-card relative w-full max-w-5xl max-h-[88vh] bg-[#0c0a0f] rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/80 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent z-10" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/[0.05] flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg sm:text-xl">
              {t('mfm.title')}
            </h2>
            <p className="text-text-muted text-xs mt-0.5">
              {t('mfm.subtitle')}
            </p>
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

        {/* Grid body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {features.map((item) => {
              const active = isActive(item.path);
              const isPro = premiumPaths.includes(item.path) && !isPremium;

              return (
                <button
                  key={item.path}
                  onClick={() => handleItemClick(item.path)}
                  className={`mfm-tile relative group flex flex-col items-center text-center p-3 sm:p-4 rounded-xl border ${
                    active
                      ? 'bg-gold-primary/10 border-gold-primary/30'
                      : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.12]'
                  }`}
                >
                  {/* PRO badge */}
                  {isPro && (
                    <span className="absolute top-1.5 right-1.5 text-[8px] font-bold px-1 py-0.5 rounded bg-gold-primary/15 text-gold-primary/80 border border-gold-primary/20 leading-none">
                      PRO
                    </span>
                  )}

                  {/* Active dot */}
                  {active && (
                    <span className="absolute top-2 left-2 w-1.5 h-1.5 bg-gold-primary rounded-full" />
                  )}

                  {/* Icon container with gradient bg */}
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br ${item.gradient} border border-white/[0.06] flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform`}>
                    <svg
                      className={`w-6 h-6 sm:w-7 sm:h-7 ${item.iconColor}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      {item.icon}
                    </svg>
                  </div>

                  {/* Label */}
                  <span className={`text-[12px] sm:text-[13px] font-semibold leading-tight ${
                    active ? 'text-gold-primary' : 'text-white'
                  }`}>
                    {item.label}
                  </span>

                  {/* Description */}
                  {item.desc && (
                    <span className="text-[10px] text-text-muted mt-1 leading-snug line-clamp-2 hidden sm:block">
                      {item.desc}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer hint */}
        <div className="px-5 sm:px-6 py-3 border-t border-white/[0.05] flex items-center justify-between text-[11px] text-text-muted flex-shrink-0">
          <span>{t('mfm.footer_count', { count: features.length })}</span>
          <span className="hidden sm:inline">{t('mfm.footer_hint')}</span>
        </div>
      </div>
    </div>
  );
};

export default MoreFeaturesModal;