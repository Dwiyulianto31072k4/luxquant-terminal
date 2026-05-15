// frontend-react/src/components/referral/CashoutRequestModal.jsx
import { useState, useEffect } from 'react';
import { referralApi } from '../../services/referralApi';

/**
 * CashoutRequestModal
 *
 * Modal for user to submit a cashout request.
 * Hard reserve: balance immediately deducted on submit; refunded if rejected/cancelled.
 *
 * Props:
 *   isOpen: boolean
 *   onClose: () => void
 *   availableBalance: number  (in USDT)
 *   onSuccess: (cashout) => void  // callback after successful submit
 */
const CashoutRequestModal = ({
  isOpen,
  onClose,
  availableBalance = 0,
  onSuccess,
}) => {
  const [amount, setAmount] = useState('');
  const [telegram, setTelegram] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setAmount(String(availableBalance || ''));
      setTelegram('');
      setNote('');
      setError('');
      setSuccess(null);
      setSubmitting(false);
    }
  }, [isOpen, availableBalance]);

  if (!isOpen) return null;

  const handleAmountChange = (e) => {
    const v = e.target.value;
    // Allow only digits + 1 decimal
    if (/^\d*\.?\d{0,2}$/.test(v)) {
      setAmount(v);
      setError('');
    }
  };

  const handleTelegramChange = (e) => {
    // Strip leading @ if user types it
    const v = e.target.value.replace(/^@/, '');
    setTelegram(v);
    setError('');
  };

  const setMaxAmount = () => {
    setAmount(String(availableBalance));
  };

  const validate = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      return 'Amount harus lebih besar dari 0.';
    }
    if (amt > availableBalance) {
      return `Saldo tidak cukup. Tersedia: $${availableBalance.toFixed(2)}`;
    }
    if (!telegram || telegram.length < 5) {
      return 'Telegram username minimal 5 karakter.';
    }
    if (!/^[a-zA-Z0-9_]{5,32}$/.test(telegram)) {
      return 'Telegram username hanya boleh huruf, angka, dan underscore (5-32 char).';
    }
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const result = await referralApi.requestCashout({
        amountUsdt: parseFloat(amount),
        telegramUsername: telegram,
        note: note.trim() || null,
      });

      setSuccess(result);

      if (onSuccess) {
        onSuccess(result);
      }

      // Auto-close after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Gagal submit cashout. Coba lagi.');
      setSubmitting(false);
    }
  };

  const amountNum = parseFloat(amount) || 0;
  const isValid =
    amountNum > 0 && amountNum <= availableBalance && telegram.length >= 5;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ 
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={() => !submitting && !success && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border overflow-hidden"
        style={{
          background: 'linear-gradient(168deg, rgba(212,168,83,0.06) 0%, #0e0608 60%)',
          borderColor: 'rgba(212,168,83,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent line */}
        <div
          className="h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(212,168,83,0.5), transparent)',
          }}
        />

        <div className="p-6 sm:p-7">
          {/* Header */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: '#d4a853' }}
              />
              <span
                className="text-[10px] font-bold uppercase tracking-[0.2em]"
                style={{ color: '#534a42' }}
              >
                Request Cashout
              </span>
            </div>
            <h3
              className="text-xl font-bold tracking-tight"
              style={{ color: '#e8d9c7', fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Withdraw Your Balance
            </h3>
            <p className="text-xs mt-2 leading-relaxed" style={{ color: '#8a7a6e' }}>
              Admin akan kontak kamu via Telegram untuk koordinasi pengiriman.
            </p>
          </div>

          {/* SUCCESS STATE */}
          {success ? (
            <div className="text-center py-6">
              <div
                className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4"
                style={{
                  background: 'rgba(34,197,94,0.12)',
                  border: '1px solid rgba(34,197,94,0.3)',
                }}
              >
                <svg
                  className="w-7 h-7"
                  style={{ color: '#22c55e' }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h4 className="text-base font-bold mb-2" style={{ color: '#22c55e' }}>
                Cashout #{success.id} Submitted!
              </h4>
              <p className="text-xs leading-relaxed mb-4" style={{ color: '#a09080' }}>
                Saldo ${success.amount_usdt.toFixed(2)} telah di-reserve.
                <br />
                Admin akan DM kamu di{' '}
                <span style={{ color: '#d4a853' }}>@{success.destination_telegram}</span>{' '}
                untuk koordinasi.
              </p>
              <p className="text-[11px]" style={{ color: '#6b5c52' }}>
                Status: <span style={{ color: '#fbbf24' }}>pending review</span>
              </p>
            </div>
          ) : (
            <>
              {/* Available Balance */}
              <div
                className="rounded-xl p-4 mb-5"
                style={{
                  background: 'rgba(212,168,83,0.04)',
                  border: '1px solid rgba(212,168,83,0.12)',
                }}
              >
                <p
                  className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                  style={{ color: '#6b5c52' }}
                >
                  Available Balance
                </p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs" style={{ color: '#6b5c52' }}>$</span>
                  <span
                    className="text-3xl font-bold tabular-nums"
                    style={{ color: '#d4a853', fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {availableBalance.toFixed(2)}
                  </span>
                  <span className="text-xs" style={{ color: '#6b5c52' }}>USDT</span>
                </div>
              </div>

              {/* Amount Input */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: '#534a42' }}
                  >
                    Amount to Withdraw
                  </label>
                  <button
                    type="button"
                    onClick={setMaxAmount}
                    className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded transition-colors"
                    style={{
                      color: '#d4a853',
                      background: 'rgba(212,168,83,0.08)',
                    }}
                  >
                    Max
                  </button>
                </div>
                <div className="relative">
                  <span
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-sm"
                    style={{ color: '#6b5c52' }}
                  >
                    $
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder="0.00"
                    disabled={submitting}
                    className="w-full pl-8 pr-16 py-3.5 rounded-xl text-base font-semibold outline-none transition-colors"
                    style={{
                      background: 'rgba(10,5,6,0.6)',
                      border: '1px solid rgba(212,168,83,0.08)',
                      color: '#e8d9c7',
                      fontFamily: "'Space Grotesk', sans-serif",
                    }}
                    onFocus={(e) =>
                      (e.target.style.borderColor = 'rgba(212,168,83,0.3)')
                    }
                    onBlur={(e) =>
                      (e.target.style.borderColor = 'rgba(212,168,83,0.08)')
                    }
                  />
                  <span
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold"
                    style={{ color: '#6b5c52' }}
                  >
                    USDT
                  </span>
                </div>
              </div>

              {/* Telegram Username */}
              <div className="mb-4">
                <label
                  className="block text-[10px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: '#534a42' }}
                >
                  Your Telegram Username
                </label>
                <div className="relative">
                  <span
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-sm"
                    style={{ color: '#6b5c52' }}
                  >
                    @
                  </span>
                  <input
                    type="text"
                    value={telegram}
                    onChange={handleTelegramChange}
                    placeholder="username"
                    maxLength={32}
                    disabled={submitting}
                    className="w-full pl-9 pr-4 py-3.5 rounded-xl text-sm font-mono outline-none transition-colors"
                    style={{
                      background: 'rgba(10,5,6,0.6)',
                      border: '1px solid rgba(212,168,83,0.08)',
                      color: '#e8d9c7',
                    }}
                    onFocus={(e) =>
                      (e.target.style.borderColor = 'rgba(212,168,83,0.3)')
                    }
                    onBlur={(e) =>
                      (e.target.style.borderColor = 'rgba(212,168,83,0.08)')
                    }
                  />
                </div>
                <p className="text-[10px] mt-1.5" style={{ color: '#6b5c52' }}>
                  Admin akan DM kamu via username ini untuk koordinasi.
                </p>
              </div>

              {/* Optional Note */}
              <div className="mb-5">
                <label
                  className="block text-[10px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: '#534a42' }}
                >
                  Note (optional)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Preferred network, time zone, dll. (optional)"
                  maxLength={500}
                  disabled={submitting}
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl text-xs outline-none transition-colors resize-none"
                  style={{
                    background: 'rgba(10,5,6,0.6)',
                    border: '1px solid rgba(212,168,83,0.08)',
                    color: '#e8d9c7',
                  }}
                  onFocus={(e) =>
                    (e.target.style.borderColor = 'rgba(212,168,83,0.3)')
                  }
                  onBlur={(e) =>
                    (e.target.style.borderColor = 'rgba(212,168,83,0.08)')
                  }
                />
              </div>

              {/* Hard Reserve Warning */}
              <div
                className="flex items-start gap-2.5 p-3 rounded-lg mb-5"
                style={{
                  background: 'rgba(234,179,8,0.04)',
                  border: '1px solid rgba(234,179,8,0.12)',
                }}
              >
                <svg
                  className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
                  style={{ color: '#d4a853' }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p
                  className="text-[11px] leading-relaxed"
                  style={{ color: '#a09080' }}
                >
                  <span className="font-semibold text-white/90">
                    Hard reserve:
                  </span>{' '}
                  saldo akan langsung di-reserve saat submit. Bisa di-cancel
                  selama status pending; di-refund kalau admin reject.
                </p>
              </div>

              {/* Error */}
              {error && (
                <div
                  className="rounded-lg p-3 mb-4"
                  style={{
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.2)',
                  }}
                >
                  <p className="text-xs" style={{ color: '#f87171' }}>
                    {error}
                  </p>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    color: '#8a7a6e',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !isValid}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden group"
                  style={{
                    background: isValid
                      ? 'linear-gradient(135deg, #d4a853, #a07c2e)'
                      : 'rgba(212,168,83,0.1)',
                    color: isValid ? '#0a0506' : '#6b5c52',
                    boxShadow: isValid ? '0 4px 24px rgba(212,168,83,0.2)' : 'none',
                  }}
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-4 w-4"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Submitting...
                    </span>
                  ) : (
                    'Submit Cashout'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CashoutRequestModal;
