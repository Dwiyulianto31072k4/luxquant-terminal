// frontend-react/src/components/referral/CashoutRequestModal.jsx
// ════════════════════════════════════════════════════════════════
// Refactor → shell <Modal> + tombol GoldButton/GhostButton.
// Logika (validate, submit, hard-reserve, success auto-close) utuh.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { referralApi } from "../../services/referralApi";
import Modal from "../ui/Modal";
import { GoldButton, GhostButton } from "../autotrade/AutoTradeUI";

const CashoutRequestModal = ({ isOpen, onClose, availableBalance = 0, onSuccess }) => {
  const [amount, setAmount] = useState("");
  const [telegram, setTelegram] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setAmount(String(availableBalance || ""));
      setTelegram("");
      setNote("");
      setError("");
      setSuccess(null);
      setSubmitting(false);
    }
  }, [isOpen, availableBalance]);

  const handleAmountChange = (e) => {
    const v = e.target.value;
    if (/^\d*\.?\d{0,2}$/.test(v)) {
      setAmount(v);
      setError("");
    }
  };
  const handleTelegramChange = (e) => {
    setTelegram(e.target.value.replace(/^@/, ""));
    setError("");
  };
  const setMaxAmount = () => setAmount(String(availableBalance));

  const validate = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return "Amount must be greater than 0.";
    if (amt > availableBalance) return `Insufficient balance. Available: $${availableBalance.toFixed(2)}`;
    if (!telegram || telegram.length < 5) return "Telegram username must be at least 5 characters.";
    if (!/^[a-zA-Z0-9_]{5,32}$/.test(telegram)) return "Telegram username can only contain letters, numbers, and underscores (5–32 chars).";
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) return setError(validationError);
    setSubmitting(true);
    setError("");
    try {
      const result = await referralApi.requestCashout({
        amountUsdt: parseFloat(amount),
        telegramUsername: telegram,
        note: note.trim() || null,
      });
      setSuccess(result);
      if (onSuccess) onSuccess(result);
      setTimeout(() => onClose(), 2500);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to submit cashout. Please try again.");
      setSubmitting(false);
    }
  };

  const guardedClose = () => { if (!submitting && !success) onClose(); };

  const amountNum = parseFloat(amount) || 0;
  const isValid = amountNum > 0 && amountNum <= availableBalance && telegram.length >= 5;

  const inputCls =
    "w-full rounded-xl border border-white/[0.08] bg-surface-raised px-4 py-3.5 text-text-primary outline-none transition-colors focus:border-gold-primary/40 disabled:opacity-50";

  const footer = (
    <div className="flex gap-3">
      <GhostButton onClick={guardedClose} disabled={submitting} className="flex-1">Cancel</GhostButton>
      <GoldButton onClick={handleSubmit} disabled={submitting || !isValid} className="flex-1 flex items-center justify-center gap-2">
        {submitting ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
            Submitting…
          </>
        ) : "Submit Cashout"}
      </GoldButton>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={guardedClose}
      size="md"
      closeOnBackdrop={!submitting && !success}
      eyebrow="Request Cashout"
      title="Withdraw Your Balance"
      subtitle="Admin will contact you on Telegram to coordinate the transfer."
      footer={success ? undefined : footer}
    >
      {success ? (
        <div className="py-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)" }}>
            <svg className="h-7 w-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h4 className="mb-2 text-base font-bold text-emerald-400">Cashout #{success.id} Submitted!</h4>
          <p className="mb-4 text-xs leading-relaxed text-text-secondary">
            ${success.amount_usdt.toFixed(2)} has been reserved.<br />
            Admin will DM you at <span className="text-gold-primary">@{success.destination_telegram}</span> to coordinate.
          </p>
          <p className="text-[11px] text-text-muted">Status: <span className="text-amber-400">pending review</span></p>
        </div>
      ) : (
        <>
          {/* Available balance */}
          <div className="mb-5 rounded-xl border border-line/12 bg-surface-raised p-4">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Available Balance</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-text-muted">$</span>
              <span className="text-3xl font-bold tabular-nums text-gold-primary" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{availableBalance.toFixed(2)}</span>
              <span className="text-xs text-text-muted">USDT</span>
            </div>
          </div>

          {/* Amount */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Amount to Withdraw</label>
              <button type="button" onClick={setMaxAmount} className="rounded bg-gold-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-primary transition-colors hover:bg-gold-primary/20">Max</button>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-text-muted">$</span>
              <input type="text" inputMode="decimal" value={amount} onChange={handleAmountChange} placeholder="0.00" disabled={submitting}
                className={`${inputCls} pl-8 pr-16 text-base font-semibold`} style={{ fontFamily: "'Space Grotesk', sans-serif" }} />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-text-muted">USDT</span>
            </div>
          </div>

          {/* Telegram */}
          <div className="mb-4">
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-text-muted">Your Telegram Username</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-text-muted">@</span>
              <input type="text" value={telegram} onChange={handleTelegramChange} placeholder="username" maxLength={32} disabled={submitting}
                className={`${inputCls} pl-9 pr-4 font-mono text-sm`} />
            </div>
            <p className="mt-1.5 text-[10px] text-text-muted">Admin will DM you at this username to coordinate.</p>
          </div>

          {/* Note */}
          <div className="mb-5">
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-text-muted">Note (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Preferred network, time zone, etc. (optional)" maxLength={500} disabled={submitting} rows={2}
              className={`${inputCls} resize-none text-xs`} />
          </div>

          {/* Hard reserve warning */}
          <div className="mb-5 flex items-start gap-2.5 rounded-lg p-3" style={{ background: "rgba(234,179,8,0.04)", border: "1px solid rgba(234,179,8,0.12)" }}>
            <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[11px] leading-relaxed text-text-secondary">
              <span className="font-semibold text-text-primary/90">Hard reserve:</span> your balance is reserved immediately on submit. You can cancel while it’s pending, and it’s refunded if the admin rejects it.
            </p>
          </div>

          {error && (
            <div className="mb-1 rounded-lg p-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <p className="text-xs text-rose-400">{error}</p>
            </div>
          )}
        </>
      )}
    </Modal>
  );
};

export default CashoutRequestModal;
