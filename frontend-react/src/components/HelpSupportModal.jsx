// src/components/HelpSupportModal.jsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * HelpSupportModal — centered modal with admin profile + Telegram CTA
 * Matches NewsPreviewModal style (overlay blur, fade animation, gold accents)
 */
const HelpSupportModal = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [isClosing, setIsClosing] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setImgFailed(false);
    }
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

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center px-4 hs-overlay ${isClosing ? 'hs-overlay-out' : ''}`}
      onClick={handleClose}
    >
      <style>{`
        .hs-overlay {
          background: rgba(0,0,0,0);
          backdrop-filter: blur(0px);
          animation: hsOverlayIn .3s ease forwards;
        }
        .hs-overlay-out { animation: hsOverlayOut .2s ease forwards; }
        .hs-overlay-out .hs-card { animation: hsCardOut .2s ease forwards; }
        @keyframes hsOverlayIn {
          to { background: rgba(0,0,0,.85); backdrop-filter: blur(8px); }
        }
        @keyframes hsOverlayOut {
          from { background: rgba(0,0,0,.85); backdrop-filter: blur(8px); }
          to { background: rgba(0,0,0,0); backdrop-filter: blur(0px); }
        }
        .hs-card { animation: hsCardIn .3s cubic-bezier(.16,1,.3,1) forwards; }
        @keyframes hsCardIn {
          from { opacity: 0; transform: scale(.95) translateY(12px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes hsCardOut {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(.95) translateY(12px); }
        }
        .hs-avatar-glow {
          box-shadow: 0 0 20px rgba(212,168,83,0.4), 0 0 40px rgba(212,168,83,0.15);
        }
      `}</style>

      <div
        className="hs-card relative w-full max-w-md bg-[#0c0a0f] rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent z-10" />

        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full text-text-muted hover:text-white hover:bg-white/10 transition-all z-20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Body */}
        <div className="px-6 sm:px-7 pt-8 pb-6 text-center">
          {/* Avatar */}
          <div className="flex justify-center mb-5">
            <div className="hs-avatar-glow w-24 h-24 rounded-full p-[3px] bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark">
              {!imgFailed ? (
                <img
                  src="/admin-avatar.png"
                  alt="LuxQuant Admin"
                  className="w-full h-full rounded-full object-cover bg-bg-primary"
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <div className="w-full h-full rounded-full bg-bg-primary flex items-center justify-center">
                  <span className="text-2xl font-bold text-gold-primary">LQ</span>
                </div>
              )}
            </div>
          </div>

          {/* Name + Role */}
          <h3 className="text-white font-bold text-lg mb-1">
            {t('helpModal.adminName')}
          </h3>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold-primary/10 border border-gold-primary/20 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-gold-primary text-[11px] font-semibold uppercase tracking-wider">
              {t('helpModal.adminRole')}
            </span>
          </div>

          {/* Title */}
          <h2 className="text-white font-bold text-xl mb-2">
            {t('helpModal.title')}
          </h2>

          {/* Description */}
          <p className="text-text-secondary text-sm leading-relaxed mb-5">
            {t('helpModal.description')}
          </p>

          {/* Topics list */}
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3 mb-5 text-left space-y-2">
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-md bg-gold-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-text-secondary text-xs leading-snug">{t('helpModal.topic_bug')}</span>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-md bg-gold-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-text-secondary text-xs leading-snug">{t('helpModal.topic_subscription')}</span>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-md bg-gold-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-text-secondary text-xs leading-snug">{t('helpModal.topic_general')}</span>
            </div>
          </div>

          {/* CTA */}
          <a
            href="https://t.me/luxquantadmin"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-center gap-2.5 w-full py-3 bg-gradient-to-r from-gold-dark via-gold-primary to-gold-light text-bg-primary rounded-xl text-sm font-bold shadow-lg shadow-gold-primary/20 hover:shadow-gold-primary/40 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            <span>{t('helpModal.contactBtn')}</span>
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

          {/* Sub note */}
          <p className="text-text-muted text-[10px] mt-3">
            {t('helpModal.responseNote')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default HelpSupportModal;