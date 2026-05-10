// src/components/subscription/SubscribeViaAdminModal.jsx
import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';

const ADMIN_TELEGRAM_USERNAME = 'luxquantadmin';

/**
 * SubscribeViaAdminModal
 *
 * Reusable modal for "Pay via Admin" alternative to crypto payment.
 *
 * Used in:
 *   - PricingPage: triggered from "Subscribe via Admin" link on each plan card
 *   - PaymentPage: triggered from "Need help?" alternative section
 *
 * Props:
 *   isOpen      : boolean
 *   onClose     : () => void
 *   plan        : { id, name, label, price_usdt, duration_days } — required
 *   paymentId   : optional, if invoice already created (PaymentPage flow)
 */
const SubscribeViaAdminModal = ({ isOpen, onClose, plan, paymentId = null }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isClosing, setIsClosing] = useState(false);

  // ─── Build default message (memoized so it doesn't reset on every render) ───
  const defaultMessage = useMemo(() => {
    if (!plan) return '';

    const planName = plan.label || plan.name || 'Subscription';
    const price = plan.price_usdt || '?';
    const duration = plan.duration_days
      ? `${plan.duration_days} days`
      : 'lifetime access';

    const username = user?.username || 'guest';
    const email = user?.email || '(not provided)';
    const referralCode = user?.referral_code_used;
    const paymentLine = paymentId ? `🧾 Invoice ID: #${paymentId}\n` : '';
    const referralLine = referralCode ? `🎟️ Referral: ${referralCode}\n` : '';

    return `Hi LuxQuant Admin! 👋

I'd like to subscribe via manual/admin assistance.

📦 Plan: ${planName} ($${price} USDT / ${duration})
👤 Username: @${username}
📧 Email: ${email}
${referralLine}${paymentLine}
Could you please help me complete the payment? Thanks!`;
  }, [plan, user, paymentId]);

  // ─── Editable message state ───
  const [message, setMessage] = useState(defaultMessage);

  // Reset message when modal opens (or plan changes)
  useEffect(() => {
    if (isOpen) {
      setMessage(defaultMessage);
      document.body.style.overflow = 'hidden';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, defaultMessage]);

  // ESC to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  const handleOpenTelegram = () => {
    const encoded = encodeURIComponent(message);
    const url = `https://t.me/${ADMIN_TELEGRAM_USERNAME}?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  if (!isOpen || !plan) return null;

  const modalContent = (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center px-4 py-6 sva-overlay ${isClosing ? 'sva-overlay-out' : ''}`}
      onClick={handleClose}
    >
      <style>{`
        .sva-overlay {
          background: rgba(0,0,0,0);
          backdrop-filter: blur(0px);
          animation: svaIn .3s ease forwards;
        }
        .sva-overlay-out { animation: svaOut .2s ease forwards; }
        .sva-overlay-out .sva-card { animation: svaCardOut .2s ease forwards; }
        @keyframes svaIn {
          to { background: rgba(0,0,0,.85); backdrop-filter: blur(8px); }
        }
        @keyframes svaOut {
          from { background: rgba(0,0,0,.85); backdrop-filter: blur(8px); }
          to { background: rgba(0,0,0,0); backdrop-filter: blur(0px); }
        }
        .sva-card {
          animation: svaCardIn .35s cubic-bezier(.16,1,.3,1) forwards;
          background:
            radial-gradient(ellipse at top, rgba(212,168,83,0.06), transparent 60%),
            #0c0a0f;
        }
        @keyframes svaCardIn {
          from { opacity: 0; transform: scale(.95) translateY(12px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes svaCardOut {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(.95) translateY(12px); }
        }
        .sva-textarea {
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
          font-size: 12px;
          line-height: 1.6;
        }
        .sva-textarea::-webkit-scrollbar { width: 6px; }
        .sva-textarea::-webkit-scrollbar-track { background: transparent; }
        .sva-textarea::-webkit-scrollbar-thumb {
          background: rgba(212,168,83,0.15);
          border-radius: 3px;
        }
      `}</style>

      <div
        className="sva-card relative w-full max-w-lg max-h-[92vh] rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/80 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent z-10" />

        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full text-text-muted hover:text-white hover:bg-white/10 transition-all z-20"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* ─── Header ─── */}
        <div className="px-6 sm:px-7 pt-7 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(212,168,83,0.12)', border: '1px solid rgba(212,168,83,0.25)' }}>
              <svg className="w-5 h-5" style={{ color: '#d4a853' }} fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-white font-bold text-base sm:text-lg">
                Subscribe via Admin
              </h2>
              <p className="text-[11px]" style={{ color: '#8a7a6e' }}>
                Manual payment assistance via Telegram
              </p>
            </div>
          </div>

          {/* Plan summary */}
          <div className="rounded-xl px-4 py-3 mt-3"
            style={{ background: 'rgba(10,5,6,0.6)', border: '1px solid rgba(212,168,83,0.08)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: '#534a42' }}>Selected Plan</p>
                <p className="text-sm font-semibold text-white mt-0.5">
                  {plan.label || plan.name || 'Subscription'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider" style={{ color: '#534a42' }}>Price</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: '#d4a853' }}>
                  ${plan.price_usdt || '?'} <span className="text-[11px] font-normal" style={{ color: '#8a7a6e' }}>USDT</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Editable message ─── */}
        <div className="px-6 sm:px-7 flex-1 min-h-0 flex flex-col pb-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#8a7a6e' }}>
              Message Preview (editable)
            </p>
            <button
              onClick={handleCopy}
              className="text-[10px] font-medium transition-colors hover:text-white"
              style={{ color: '#d4a853' }}
            >
              Copy text
            </button>
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={10}
            className="sva-textarea w-full px-4 py-3 rounded-xl text-white outline-none transition-colors resize-none"
            style={{
              background: 'rgba(10,5,6,0.6)',
              border: '1px solid rgba(212,168,83,0.08)',
              minHeight: '180px',
              maxHeight: '280px',
            }}
            onFocus={(e) => e.target.style.borderColor = 'rgba(212,168,83,0.25)'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(212,168,83,0.08)'}
          />

          <p className="text-[10px] mt-2" style={{ color: '#534a42' }}>
            This message will be pre-filled in Telegram. You can review and edit before sending.
          </p>
        </div>

        {/* ─── Footer / CTA ─── */}
        <div className="px-6 sm:px-7 py-4 mt-2"
          style={{ borderTop: '1px solid rgba(212,168,83,0.06)', background: 'rgba(0,0,0,0.2)' }}>
          <button
            onClick={handleOpenTelegram}
            className="group flex items-center justify-center gap-2.5 w-full py-3 bg-gradient-to-r from-gold-dark via-gold-primary to-gold-light text-bg-primary rounded-xl text-sm font-bold shadow-lg shadow-gold-primary/20 hover:shadow-gold-primary/40 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            <span>Open Telegram & Send</span>
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>

          <p className="text-[10px] text-center mt-2.5" style={{ color: '#534a42' }}>
            Admin typically responds within a few hours
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default SubscribeViaAdminModal;
