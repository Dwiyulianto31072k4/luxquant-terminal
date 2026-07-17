// src/components/subscription/SubscribeViaAdminModal.jsx
// ════════════════════════════════════════════════════════════════
// Refactor → shell <Modal> dgn header & footer sticky.
// header = ikon Telegram + judul | footer = CTA gold solid
// body (scroll) = plan summary + textarea pesan
// Logika (build message, copy, open telegram) tidak diubah.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import Modal from "../ui/Modal";
import { GoldButton } from "../autotrade/AutoTradeUI";

const ADMIN_TELEGRAM_USERNAME = "luxquantadmin";

const TelegramGlyph = ({ className }) => (
 <svg className={className} fill="currentColor" viewBox="0 0 24 24">
 <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
 </svg>
);

const SubscribeViaAdminModal = ({ isOpen, onClose, plan, paymentId = null }) => {
 useTranslation();
 const { user } = useAuth();
 const [copied, setCopied] = useState(false);

 const defaultMessage = useMemo(() => {
 if (!plan) return "";
 const planName = plan.label || plan.name || "Subscription";
 const price = plan.price_usdt || "?";
 const duration = plan.duration_days ? `${plan.duration_days} days` : "lifetime access";
 const username = user?.username || "guest";
 const email = user?.email || "(not provided)";
 const referralCode = user?.referral_code_used;
 const paymentLine = paymentId ? `🧾 Invoice ID: #${paymentId}\n` : "";
 const referralLine = referralCode ? `🎟️ Referral: ${referralCode}\n` : "";
 return `Hi LuxQuant Admin! 👋

I'd like to subscribe via manual/admin assistance.

📦 Plan: ${planName} ($${price} USDT / ${duration})
👤 Username: @${username}
📧 Email: ${email}
${referralLine}${paymentLine}
Could you please help me complete the payment? Thanks!`;
 }, [plan, user, paymentId]);

 const [message, setMessage] = useState(defaultMessage);

 useEffect(() => {
 if (isOpen) setMessage(defaultMessage);
 }, [isOpen, defaultMessage]);

 const handleOpenTelegram = () => {
 const url = `https://t.me/${ADMIN_TELEGRAM_USERNAME}?text=${encodeURIComponent(message)}`;
 window.open(url, "_blank", "noopener,noreferrer");
 };

 const handleCopy = async () => {
 try {
 await navigator.clipboard.writeText(message);
 setCopied(true);
 setTimeout(() => setCopied(false), 1800);
 } catch (e) {
 console.error("Copy failed:", e);
 }
 };

 if (!plan) return null;

 const planName = plan.label || plan.name || "Subscription";
 const price = plan.price_usdt || "?";
 const duration = plan.duration_days ? `${plan.duration_days}-day access` : "Lifetime access";

 const header = (
 <div className="flex items-center gap-3">
 <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg ring-1 ring-accent/28">
 <TelegramGlyph className="h-5 w-5" />
 </span>
 <div className="min-w-0">
 <p className="mb-0.5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-text-muted">Manual Payment</p>
 <h2 className="text-base font-bold tracking-tight text-text-primary sm:text-lg">Subscribe via Admin</h2>
 <p className="text-[11px] text-text-muted">Reach our admin on Telegram for assisted payment</p>
 </div>
 </div>
 );

 const footer = (
 <div>
 <GoldButton onClick={handleOpenTelegram} className="flex w-full items-center justify-center gap-2.5 !py-3 !text-sm">
 <TelegramGlyph className="h-4 w-4" />
 <span>Open Telegram &amp; Send</span>
 </GoldButton>
 <p className="mt-2.5 text-center text-[10px] text-text-muted">Admin typically responds within a few hours</p>
 </div>
 );

 return (
 <Modal isOpen={isOpen} onClose={onClose} size="md" padded={false} header={header} footer={footer}>
 <div className="px-6 py-4 sm:px-7">
 {/* Plan summary */}
 <div className="relative mb-4 overflow-hidden rounded-xl border border-ink/08 bg-surface-raised px-4 py-3">
 <span className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(to right, transparent, rgb(var(--accent) / 0.25), transparent)" }} />
 <div className="flex items-center justify-between gap-3">
 <div className="min-w-0">
 <p className="text-[10px] uppercase tracking-wider text-text-muted">Selected Plan</p>
 <p className="mt-0.5 truncate text-sm font-semibold text-text-primary">{planName}</p>
 <p className="text-[10.5px] text-text-muted">{duration}</p>
 </div>
 <div className="shrink-0 text-right">
 <p className="text-[10px] uppercase tracking-wider text-text-muted">Price</p>
 <p className="mt-0.5 text-base font-bold tabular-nums text-accent">
 ${price} <span className="text-[11px] font-normal text-text-muted">USDT</span>
 </p>
 </div>
 </div>
 </div>

 {/* Editable message */}
 <div className="mb-2 flex items-center justify-between">
 <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Message Preview (editable)</p>
 <button
 onClick={handleCopy}
 className="flex items-center gap-1 text-[10px] font-semibold transition-colors"
 style={{ color: copied ? "#34d399" : "rgb(var(--accent))" }}
 >
 {copied ? (
 <>
 <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
 <polyline points="20 6 9 17 4 12" />
 </svg>
 Copied
 </>
 ) : "Copy text"}
 </button>
 </div>

 <textarea
 value={message}
 onChange={(e) => setMessage(e.target.value)}
 rows={9}
 className="w-full resize-none rounded-xl border border-ink/08 bg-surface-raised px-4 py-3 font-mono text-[12px] leading-relaxed text-text-primary outline-none transition-colors focus:border-ink/12"
 style={{ minHeight: "180px", maxHeight: "260px" }}
 />
 <p className="mt-2 text-[10px] text-text-muted">
 This message will be pre-filled in Telegram. You can review and edit before sending.
 </p>
 </div>
 </Modal>
 );
};

export default SubscribeViaAdminModal;
