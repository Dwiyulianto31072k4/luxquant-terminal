// src/components/subscription/SubscribeViaAdminModal.jsx
//
// Reusable user-facing modal for "Pay via Admin" — alternative to crypto payment.
//
// Used in:
//   • PricingPage  — triggered from "Subscribe via Admin" link on plan cards
//   • PaymentPage  — triggered from "Need help?" section
//
// Props:
//   isOpen     : boolean
//   onClose    : () => void
//   plan       : { id, name, label, price_usdt, duration_days }   — required
//   paymentId  : optional invoice id (PaymentPage flow)

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';

const ADMIN_TELEGRAM_USERNAME = 'luxquantadmin';

const SubscribeViaAdminModal = ({
  isOpen,
  onClose,
  plan,
  paymentId = null,
}) => {
  // useTranslation kept for future i18n; current copy is in-line English
  // so it matches the rest of the redesigned product surface.
  useTranslation();
  const { user } = useAuth();
  const [isClosing, setIsClosing] = useState(false);
  const [copied, setCopied] = useState(false);

  /* ── Build default message ── */
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

  const [message, setMessage] = useState(defaultMessage);

  /* ── Reset message on open + lock body scroll ── */
  useEffect(() => {
    if (isOpen) {
      setMessage(defaultMessage);
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isOpen, defaultMessage]);

  /* ── Escape to close ── */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
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
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  if (!isOpen || !plan) return null;

  const planName = plan.label || plan.name || 'Subscription';
  const price = plan.price_usdt || '?';
  const duration = plan.duration_days
    ? `${plan.duration_days}-day access`
    : 'Lifetime access';

  const modalContent = (
    <div
      className={`sva-overlay fixed inset-0 z-[9999] flex items-center justify-center px-4 py-6 ${
        isClosing ? 'sva-overlay-out' : ''
      }`}
      onClick={handleClose}
    >
      <style>{`
        .sva-overlay {
          background: rgba(0,0,0,0);
          backdrop-filter: blur(0px);
          animation: svaIn .25s ease forwards;
        }
        .sva-overlay-out { animation: svaOut .2s ease forwards; }
        .sva-overlay-out .sva-card { animation: svaCardOut .2s ease forwards; }
        @keyframes svaIn {
          to { background: rgba(0,0,0,.78); backdrop-filter: blur(8px); }
        }
        @keyframes svaOut {
          from { background: rgba(0,0,0,.78); backdrop-filter: blur(8px); }
          to { background: rgba(0,0,0,0); backdrop-filter: blur(0px); }
        }
        .sva-card {
          animation: svaCardIn .3s cubic-bezier(.16,1,.3,1) forwards;
          background:
            radial-gradient(ellipse at top, rgba(212,168,83,0.08), transparent 60%),
            #0a0506;
        }
        @keyframes svaCardIn {
          from { opacity: 0; transform: scale(.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes svaCardOut {
          from { opacity: 1; transform: scale(1); }
          to   { opacity: 0; transform: scale(.96) translateY(8px); }
        }
        .sva-textarea {
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
          font-size: 12px;
          line-height: 1.6;
        }
        .sva-textarea::-webkit-scrollbar { width: 6px; }
        .sva-textarea::-webkit-scrollbar-track { background: transparent; }
        .sva-textarea::-webkit-scrollbar-thumb {
          background: rgba(212,168,83,0.2);
          border-radius: 3px;
        }
      `}</style>

      <div
        className="sva-card relative w-full max-w-lg max-h-[92vh] rounded-2xl overflow-hidden flex flex-col"
        style={{
          border: '1px solid rgba(212,168,83,0.22)',
          boxShadow:
            '0 25px 50px -12px rgba(0,0,0,0.9), 0 0 0 1px rgba(212,168,83,0.06), 0 0 60px -10px rgba(212,168,83,0.12)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gold hairline at top */}
        <div
          className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
          style={{
            background:
              'linear-gradient(to right, transparent, rgba(212,168,83,0.45), transparent)',
          }}
        />

        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:scale-105 z-20"
          style={{
            color: '#d4a853',
            background: 'rgba(212,168,83,0.08)',
            border: '1px solid rgba(212,168,83,0.22)',
          }}
          title="Close (Esc)"
          aria-label="Close"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* ─── HEADER ─── */}
        <div className="px-6 sm:px-7 pt-7 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'rgba(212,168,83,0.12)',
                border: '1px solid rgba(212,168,83,0.28)',
              }}
            >
              {/* Telegram glyph */}
              <svg
                className="w-5 h-5"
                style={{ color: '#d4a853' }}
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p
                className="text-[9.5px] uppercase tracking-[0.18em] font-bold mb-0.5"
                style={{ color: 'rgba(212,168,83,0.7)' }}
              >
                Manual Payment
              </p>
              <h2 className="text-white font-bold text-base sm:text-lg tracking-tight">
                Subscribe via Admin
              </h2>
              <p className="text-[11px]" style={{ color: '#8a7a6e' }}>
                Reach our admin on Telegram for assisted payment
              </p>
            </div>
          </div>

          {/* Plan summary card */}
          <div
            className="rounded-xl px-4 py-3 mt-3 relative overflow-hidden"
            style={{
              background: 'rgba(10,5,6,0.6)',
              border: '1px solid rgba(212,168,83,0.10)',
            }}
          >
            <div
              className="absolute inset-x-0 top-0 h-px pointer-events-none"
              style={{
                background:
                  'linear-gradient(to right, transparent, rgba(212,168,83,0.25), transparent)',
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: '#534a42' }}
                >
                  Selected Plan
                </p>
                <p className="text-sm font-semibold text-white mt-0.5 truncate">
                  {planName}
                </p>
                <p className="text-[10.5px]" style={{ color: '#6b5c52' }}>
                  {duration}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: '#534a42' }}
                >
                  Price
                </p>
                <p
                  className="text-base font-bold mt-0.5 tabular-nums"
                  style={{ color: '#d4a853' }}
                >
                  ${price}{' '}
                  <span
                    className="text-[11px] font-normal"
                    style={{ color: '#8a7a6e' }}
                  >
                    USDT
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ─── EDITABLE MESSAGE ─── */}
        <div className="px-6 sm:px-7 flex-1 min-h-0 flex flex-col pb-2">
          <div className="flex items-center justify-between mb-2">
            <p
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: '#8a7a6e' }}
            >
              Message Preview (editable)
            </p>
            <button
              onClick={handleCopy}
              className="text-[10px] font-semibold transition-colors flex items-center gap-1"
              style={{ color: copied ? '#34d399' : '#d4a853' }}
            >
              {copied ? (
                <>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied
                </>
              ) : (
                'Copy text'
              )}
            </button>
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={10}
            className="sva-textarea w-full px-4 py-3 rounded-xl text-white outline-none transition-colors resize-none"
            style={{
              background: 'rgba(10,5,6,0.6)',
              border: '1px solid rgba(212,168,83,0.10)',
              minHeight: '180px',
              maxHeight: '280px',
            }}
            onFocus={(e) =>
              (e.target.style.borderColor = 'rgba(212,168,83,0.30)')
            }
            onBlur={(e) =>
              (e.target.style.borderColor = 'rgba(212,168,83,0.10)')
            }
          />

          <p className="text-[10px] mt-2" style={{ color: '#534a42' }}>
            This message will be pre-filled in Telegram. You can review and
            edit before sending.
          </p>
        </div>

        {/* ─── FOOTER CTA ─── */}
        <div
          className="px-6 sm:px-7 py-4 mt-2"
          style={{
            borderTop: '1px solid rgba(212,168,83,0.08)',
            background: 'rgba(0,0,0,0.25)',
          }}
        >
          <button
            onClick={handleOpenTelegram}
            className="group flex items-center justify-center gap-2.5 w-full py-3 rounded-xl text-sm font-bold shadow-lg transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background:
                'linear-gradient(135deg, #8b6914, #d4a853, #e6c068)',
              color: '#0a0506',
              boxShadow:
                '0 10px 30px -8px rgba(212,168,83,0.4), 0 0 0 1px rgba(212,168,83,0.4)',
            }}
          >
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
            <span>Open Telegram &amp; Send</span>
            <svg
              className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </button>

          <p
            className="text-[10px] text-center mt-2.5"
            style={{ color: '#534a42' }}
          >
            Admin typically responds within a few hours
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default SubscribeViaAdminModal;
