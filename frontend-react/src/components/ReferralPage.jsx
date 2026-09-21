// src/components/ReferralPage.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { referralApi } from "../services/referralApi";
import { Z } from "../constants/zIndex";

import CashoutRequestModal from "./referral/CashoutRequestModal";
import CashoutHistoryList from "./referral/CashoutHistoryList";
import AssistantWidget from "./assistant/AssistantWidget";
import { Skeleton, ShimmerStyles } from "./ui/Loaders";
import {
  Eyebrow,
  Panel,
  StatTile,
  StatusChip,
  FunnelBars,
  ChannelBars,
  ReferralNetwork,
  UnlockProgress,
} from "./referral/ReferralUI";
import { useDialog } from "../hooks/useDialog";

const BTN =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-ink/12 bg-surface-raised px-3 text-xs font-semibold text-text-primary transition-colors hover:border-ink/20 hover:bg-ink/[0.05]";

const IconShare = () => (
  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5" />
  </svg>
);
const IconWhatsApp = () => (
  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.5 14.4c-.3-.1-1.8-.9-2-.9s-.5-.1-.7.2-.8.9-1 1.1-.4.2-.7.1a8.1 8.1 0 0 1-2.4-1.5 8.8 8.8 0 0 1-1.6-2c-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.5s0-.4 0-.5l-.9-2.2c-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.5 1.1 2.9 1.2 3.1a13.4 13.4 0 0 0 5.1 5c.7.3 1.3.4 1.8.3s1.6-.7 1.8-1.3.2-1.2.1-1.3-.3-.2-.6-.3zM12.1 21.5h-.1A9.5 9.5 0 0 1 5.2 4.8a9.5 9.5 0 0 1 13.5 13.4 9.5 9.5 0 0 1-6.6 3.3zm8.2-17.6A11.5 11.5 0 1 0 12 23.5l.2-.1 4.3 1.1-1.2-4.1A11.5 11.5 0 0 0 20.3 3.9z" />
  </svg>
);
const IconTelegram = () => (
  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21.2 3.4 2.9 10.5c-1.3.5-1.2 1.2-.2 1.5l4.7 1.5 10.8-6.8c.5-.3 1-.1.6.2l-8.8 7.9-.3 4.7c.5 0 .7-.2 1-.5l2.4-2.3 5 3.7c.9.5 1.6.2 1.8-.9l3.3-15.5c.3-1.4-.5-2-1.5-1.6z" />
  </svg>
);
const IconX = () => (
  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const CopyButton = ({ text, label, onCopied, className = "" }) => {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      console.error("Copy failed:", e);
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`${BTN} ${
        copied ? "border-profit/25 bg-profit/10 text-profit hover:bg-profit/10" : ""
      } ${className}`}
    >
      {copied ? t("referral.copied") : label}
    </button>
  );
};

// These are the words a person actually sends. No long dash: it is the
// clearest tell that a message was not typed by the person sharing it.
const SCRIPT_PROOF = (link) =>
  `LuxQuant publishes every call since December 2023, so you can verify the record yourself. Join free with my link:\n${link}`;
const SCRIPT_MONEY = (link) =>
  `I earn USDT when you subscribe. You get 5% off your first payment. We both win:\n${link}`;

const GenerateModal = ({ isOpen, onClose, onGenerated }) => {
  const dialogRef = useRef(null);
  useDialog({ isOpen, onClose, ref: dialogRef });
  const [customCode, setCustomCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (useCustom) => {
    setError("");
    setLoading(true);
    try {
      const code = useCustom ? customCode.trim().toUpperCase() : null;
      const result = await referralApi.generateCode(code);
      onGenerated(result);
      onClose();
      setCustomCode("");
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to generate code");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Custom referral code"
      className="lq-modal-safe lq-scrim-bg fixed inset-0 flex items-end justify-center sm:items-center p-0 sm:p-4"
      style={{ zIndex: Z.modal }}
      onClick={onClose}
    >
      <div
        className="lq-sheet w-full max-w-md max-h-[min(var(--lq-modal-maxh),100%)] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-b-0 sm:border-b bg-surface-raised p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-2 text-text-primary">Custom code</h3>
        <p className="text-sm mb-5 text-text-muted">
          4–20 characters, letters, numbers, dash. Optional — a random code already works.
        </p>
        <input
          type="text"
          value={customCode}
          onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
          placeholder="YOUR-CODE"
          maxLength={20}
          className="w-full rounded-xl border border-ink/12 bg-ink/[0.04] px-4 py-3 text-sm font-medium tracking-wide text-text-primary outline-none"
        />
        {error && <p className="text-xs mt-2 text-loss">{error}</p>}
        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-ink/10 px-4 py-2.5 text-sm text-text-muted">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={loading || customCode.length < 4}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-fg disabled:opacity-40"
          >
            {loading ? "…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// Plan prices are whole dollars; 1000 reads better with a separator, and a
// stray .00 from the API would read as precision nobody asked for.
const ReferralPage = () => {
  const { t } = useTranslation();
  const [code, setCode] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [estimator, setEstimator] = useState({
    monthly_usdt: 5,
    annual_usdt: 50,
    lifetime_usdt: 100,
    commission_pct: 5,
    monthly_price: 50,
    annual_price: 500,
    lifetime_price: 1000,
  });
  const [refereesPage, setRefereesPage] = useState({ items: [], total: 0, page: 1, has_more: false });
  const [loading, setLoading] = useState(true);
  const [shareBreakdown, setShareBreakdown] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [refereesPageNum, setRefereesPageNum] = useState(1);
  const [cashoutBalance, setCashoutBalance] = useState(null);
  const [cashoutHistory, setCashoutHistory] = useState([]);
  const [showCashoutModal, setShowCashoutModal] = useState(false);
  const [script, setScript] = useState("proof");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, refereesRes, cashoutBalanceRes, cashoutHistoryRes, shareRes] = await Promise.allSettled([
        referralApi.getStats(),
        referralApi.getReferees(1, 20),
        referralApi.getCashoutBalance(),
        referralApi.getCashoutHistory(50),
        referralApi.getShareBreakdown(90).catch(() => null),
      ]);
      if (statsRes.status === "fulfilled" && statsRes.value) {
        setCode(statsRes.value.code);
        setFunnel(statsRes.value.funnel);
        setEarnings(statsRes.value.earnings);
        if (statsRes.value.estimator) setEstimator(statsRes.value.estimator);
      }
      if (!(statsRes.status === "fulfilled" && statsRes.value?.code)) {
        try {
          const c = await referralApi.getMyCode();
          if (c) setCode(c);
        } catch {
          /* ignore */
        }
      }
      if (refereesRes.status === "fulfilled") setRefereesPage(refereesRes.value);
      if (cashoutBalanceRes.status === "fulfilled") setCashoutBalance(cashoutBalanceRes.value);
      if (cashoutHistoryRes.status === "fulfilled") setCashoutHistory(cashoutHistoryRes.value.items || []);
      if (shareRes.status === "fulfilled") setShareBreakdown(shareRes.value);
    } catch (err) {
      console.error("Referral data load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const shareLink = code?.share_link || "";
  const qualified = funnel?.qualified || 0;
  const paid = funnel?.paid || 0;
  const needUse = funnel?.unlock_qualified_need || 3;
  const needPaid = funnel?.unlock_paid_need || 1;
  const unlockDone = Boolean(funnel?.unlock_complete);
  const hasEarnings = (earnings?.lifetime_earned || 0) > 0;
  const available = earnings?.available_balance || 0;
  const canCashout = Boolean(cashoutBalance?.can_request_cashout);

  const handleShareTracked = async (channel) => {
    if (!code?.code) return;
    try {
      await referralApi.trackShare(code.code, channel);
      setCode((prev) =>
        prev
          ? {
              ...prev,
              share_count: channel === "qr_download" ? prev.share_count : (prev.share_count || 0) + 1,
              qr_count: channel === "qr_download" ? (prev.qr_count || 0) + 1 : prev.qr_count,
            }
          : prev,
      );
    } catch (e) {
      console.error("Track share failed:", e);
    }
  };

  const scriptText =
    script === "money" ? SCRIPT_MONEY(shareLink) : SCRIPT_PROOF(shareLink);

  const shareNative = async () => {
    handleShareTracked("other");
    const payload = { title: "LuxQuant", text: SCRIPT_PROOF(""), url: shareLink };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${SCRIPT_PROOF("")}\n${shareLink}`);
    } catch {
      /* ignore */
    }
  };

  const shareTo = (channel, url) => {
    handleShareTracked(channel);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDownloadQR = async () => {
    if (!code?.qr_url) return;
    handleShareTracked("qr_download");
    try {
      const response = await fetch(code.qr_url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `luxquant-${code.code}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download QR failed:", e);
    }
  };

  const fetchRefereesPage = async (page) => {
    try {
      const res = await referralApi.getReferees(page, 20);
      setRefereesPage(res);
      setRefereesPageNum(page);
    } catch (e) {
      console.error("Failed to load referees page:", e);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6" role="status" aria-label="Loading referral">
        <ShimmerStyles />
        <Skeleton className="h-40 w-full !rounded-2xl" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-32 !rounded-xl" />
          <Skeleton className="h-32 !rounded-xl" />
        </div>
      </div>
    );
  }

  // ── derived ────────────────────────────────────────────────────────
  const commissionPct = code?.commission_pct ?? estimator?.commission_pct ?? 5;
  const invited = funnel?.signed_up || 0;
  const activeCount = funnel?.active || 0;
  const subscribedCount = funnel?.subscribed || 0;
  const referees = refereesPage.items || [];
  const channels = shareBreakdown?.channels || [];

  // 682 of 686 code holders have never referred anyone, so the empty page IS
  // the page for almost everyone. Panels appear as they earn the right to
  // exist rather than standing there full of zeros.
  const started = invited > 0 || hasEarnings;
  // A hub with two spokes says less than a two-row list. Below this the list
  // is the better form and the network simply is not drawn.
  const NETWORK_MIN = 8;

  const CHANNEL_LABEL = {
    telegram: "Telegram",
    whatsapp: "WhatsApp",
    twitter: "X",
    copy_link: "Copied link",
    qr_download: "QR code",
    native: "Share sheet",
    other: "Other",
  };

  return (
    <div className="relative">
      {/* A plane for the cards to sit on, the way /payment does it. Without
          it the panels float on the raw page background and the column never
          reads as a composed page. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          style={{
            position: "absolute",
            top: "-15%",
            left: "30%",
            width: "900px",
            height: "600px",
            background: "radial-gradient(ellipse, rgb(var(--accent) / 0.04) 0%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 pb-12 sm:px-6 sm:py-12 lg:px-8">
        {/* ── HEADER ─────────────────────────────────────────────── */}
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Eyebrow live>{t("referral.chip_full", "Invite · Earn USDT")}</Eyebrow>
            <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-text-primary sm:text-4xl lg:text-5xl">
              {t("referral.page_title", "Invite friends. Earn USDT.")}
            </h1>
            <p className="mt-2 text-sm" style={{ color: "rgb(var(--fg-muted))" }}>
              {t("referral.page_sub", "{{pct}}% of every payment they make, renewals included", {
                pct: commissionPct,
              })}
            </p>
          </div>

          {hasEarnings && (
            <button
              type="button"
              onClick={() => setShowCashoutModal(true)}
              disabled={!canCashout}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-full px-6 font-display text-sm font-bold shadow-cta transition-transform active:scale-[0.985] disabled:opacity-40"
              style={{ background: "rgb(var(--accent))", color: "rgb(var(--accent-fg))" }}
            >
              {t("referral.withdraw_cta", "Withdraw")} {available.toFixed(2)} USDT
            </button>
          )}
        </div>

        {/* ── STATS ──────────────────────────────────────────────── */}
        {started && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile
              label={t("referral.stat_available", "Available")}
              value={available.toFixed(2)}
              unit="USDT"
              hint={t("referral.stat_available_hint", "Ready to withdraw")}
            />
            <StatTile
              label={t("referral.stat_lifetime", "Lifetime earned")}
              value={(earnings?.lifetime_earned || 0).toFixed(2)}
              unit="USDT"
              hint={t("referral.stat_lifetime_hint", "Since you joined")}
            />
            <StatTile
              label={t("referral.stat_invited", "People invited")}
              value={invited}
              hint={t("referral.stat_invited_hint", "Signed up with your link")}
            />
            <StatTile
              label={t("referral.stat_subscribed", "Subscribed")}
              value={subscribedCount}
              tone="rgb(var(--pos))"
              hint={t("referral.stat_subscribed_hint", "They pay, you earn")}
            />
          </div>
        )}

        {/* ── LINK + PEOPLE ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          <Panel label={t("referral.your_link", "Your link")}>
            {!code ? (
              <div className="py-2">
                <p className="mb-3 text-xs text-text-secondary">
                  {t("referral.no_code_yet", "You do not have a code yet.")}
                </p>
                <button type="button" onClick={() => setShowGenerateModal(true)} className={BTN}>
                  {t("referral.create_code", "Create my link")}
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="shrink-0 self-center sm:self-start">
                    <div className="rounded-xl border border-ink/10 bg-white p-2">
                      <img
                        src={`${code.qr_url}?v=${encodeURIComponent(code.created_at || code.code)}`}
                        alt={`QR for ${code.code}`}
                        className="h-[104px] w-[104px]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadQR}
                      className="mt-2 w-full text-center text-[11px] font-semibold text-text-secondary hover:text-text-primary"
                    >
                      {t("referral.download_qr", "Download QR")}
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "rgb(var(--fg-muted))" }}
                    >
                      {t("referral.code_label", "Code")}
                    </p>
                    <p className="font-mono text-2xl font-bold tracking-wide text-accent-text">
                      {code.code}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <CopyButton text={code.code} label={t("referral.copy_code", "Copy code")} />
                      <button
                        type="button"
                        onClick={() => setShowGenerateModal(true)}
                        className={BTN}
                      >
                        {t("referral.customize", "Customize")}
                      </button>
                    </div>

                    <p
                      className="mt-4 text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "rgb(var(--fg-muted))" }}
                    >
                      {t("referral.link_label", "Link")}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-lg px-3 py-2 font-mono text-[11px] text-text-secondary"
                            style={{ background: "rgb(var(--ink) / 0.04)" }}>
                        {shareLink}
                      </code>
                      <CopyButton text={shareLink} label={t("referral.copy", "Copy")} />
                    </div>
                  </div>
                </div>

                {/* The message first, then where to send it. Picking a
                    platform before knowing what it will say is the wrong
                    order, and it is why most people never send anything. */}
                <div className="mt-5 border-t border-ink/[0.06] pt-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "rgb(var(--fg-muted))" }}
                    >
                      {t("referral.message_label", "Your message")}
                    </p>
                    <div className="flex gap-1">
                      {[
                        { id: "proof", label: t("referral.script_proof", "Proof") },
                        { id: "money", label: t("referral.script_money", "Money") },
                      ].map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setScript(o.id)}
                          className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors"
                          style={{
                            background: script === o.id ? "rgb(var(--accent) / 0.14)" : "transparent",
                            color: script === o.id ? "rgb(var(--accent-text))" : "rgb(var(--fg-muted))",
                          }}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="rounded-lg px-3 py-2.5 text-xs leading-relaxed text-text-secondary"
                     style={{ background: "rgb(var(--ink) / 0.03)" }}>
                    {scriptText}
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <button type="button" onClick={shareNative} className={`${BTN} w-full`}>
                      <IconShare />
                      {t("referral.share", "Share")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        shareTo(
                          "whatsapp",
                          `https://wa.me/?text=${encodeURIComponent(`${scriptText}`)}`,
                        )
                      }
                      className={`${BTN} w-full`}
                    >
                      <IconWhatsApp />
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        shareTo(
                          "telegram",
                          `https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(SCRIPT_PROOF(""))}`,
                        )
                      }
                      className={`${BTN} w-full`}
                    >
                      <IconTelegram />
                      Telegram
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        shareTo(
                          "twitter",
                          `https://twitter.com/intent/tweet?text=${encodeURIComponent(SCRIPT_PROOF(""))}&url=${encodeURIComponent(shareLink)}`,
                        )
                      }
                      className={`${BTN} w-full`}
                    >
                      <IconX />
                      X
                    </button>
                  </div>
                </div>
              </>
            )}
          </Panel>

          {started ? (
            <Panel
              label={t("referral.your_people", "Your people")}
              action={
                <span className="font-mono text-[11px] tabular-nums" style={{ color: "rgb(var(--fg-muted))" }}>
                  {refereesPage.total || referees.length}
                </span>
              }
            >
              <div className="space-y-2">
                {referees.map((r) => (
                  <div
                    key={r.user_id}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: "rgb(var(--ink) / 0.03)" }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-text-primary">{r.username}</p>
                      <p className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
                        {new Date(r.joined_at).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                        {r.login_count > 0 && ` · ${r.login_count} sign-ins`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[11px] tabular-nums" style={{ color: "rgb(var(--fg-muted))" }}>
                        {Number(r.total_commission_earned || 0).toFixed(2)} USDT
                      </span>
                      <StatusChip status={r.status} />
                    </div>
                  </div>
                ))}
              </div>

              {(refereesPage.has_more || refereesPageNum > 1) && (
                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => fetchRefereesPage(refereesPageNum - 1)}
                    disabled={refereesPageNum <= 1}
                    className="text-xs text-text-secondary disabled:opacity-30"
                  >
                    ← Prev
                  </button>
                  <span className="font-mono text-[11px]" style={{ color: "rgb(var(--fg-muted))" }}>
                    {refereesPageNum}
                  </span>
                  <button
                    type="button"
                    onClick={() => fetchRefereesPage(refereesPageNum + 1)}
                    disabled={!refereesPage.has_more}
                    className="text-xs text-text-secondary disabled:opacity-30"
                  >
                    Next →
                  </button>
                </div>
              )}
            </Panel>
          ) : (
            <Panel label={t("referral.how_it_works", "How it works")}>
              <ol className="space-y-4">
                {[
                  t("referral.step_1", "Send your link to someone who trades."),
                  t("referral.step_2", "They subscribe and save {{pct}}% on their first payment.", {
                    pct: code?.discount_pct ?? 5,
                  }),
                  t("referral.step_3", "You earn {{pct}}% in USDT, and again every time they renew.", {
                    pct: commissionPct,
                  }),
                ].map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold"
                      style={{ background: "rgb(var(--accent) / 0.14)", color: "rgb(var(--accent-text))" }}
                    >
                      {i + 1}
                    </span>
                    <p className="pt-0.5 text-xs leading-relaxed text-text-secondary">{step}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-5 border-t border-ink/[0.06] pt-4 text-[11px] leading-relaxed"
                 style={{ color: "rgb(var(--fg-muted))" }}>
                {t(
                  "referral.how_footnote",
                  "Your earnings arrive as USDT, not points, so you can withdraw them.",
                )}
              </p>
            </Panel>
          )}
        </div>

        {/* ── CHARTS ─────────────────────────────────────────────── */}
        {started && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
            <Panel label={t("referral.your_funnel", "Your funnel")}>
              <FunnelBars invited={invited} active={activeCount} subscribed={subscribedCount} />
            </Panel>

            <Panel label={t("referral.where_shared", "Where you shared it")}>
              {channels.length > 0 ? (
                <>
                  <ChannelBars channels={channels} labelOf={(c) => CHANNEL_LABEL[c] || c} />
                  {shareBreakdown?.tracked_since && (
                    <p className="mt-3 text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
                      {t("referral.tracked_since", "Counted since")}{" "}
                      {new Date(shareBreakdown.tracked_since).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs leading-relaxed" style={{ color: "rgb(var(--fg-muted))" }}>
                  {t(
                    "referral.no_shares_yet",
                    "Nothing tracked yet. Every share from here on is counted by platform.",
                  )}
                </p>
              )}
            </Panel>
          </div>
        )}

        {referees.length >= NETWORK_MIN && (
          <div className="mt-4">
            <Panel label={t("referral.your_network", "Your network")}>
              <ReferralNetwork
                centre={t("referral.you", "You")}
                referees={referees}
                total={refereesPage.total || referees.length}
              />
            </Panel>
          </div>
        )}

        {/* ── UNLOCK ─────────────────────────────────────────────── */}
        {!unlockDone && (
          <div className="mt-4">
            <Panel label={t("referral.unlock_access", "Unlock access")}>
              <p className="mb-4 text-xs leading-relaxed text-text-secondary">
                {t(
                  "referral.unlock_body",
                  "{{a}} friends who actually use LuxQuant, plus {{b}} who subscribes, unlocks 7 days of full Terminal access for you.",
                  { a: needUse, b: needPaid },
                )}
              </p>
              <UnlockProgress
                rows={[
                  {
                    label: t("referral.unlock_use", "Friends actually using LuxQuant"),
                    have: qualified,
                    need: needUse,
                  },
                  {
                    label: t("referral.unlock_paid", "Friends who subscribed"),
                    have: paid,
                    need: needPaid,
                  },
                ]}
              />
            </Panel>
          </div>
        )}

        {/* ── CASHOUTS ───────────────────────────────────────────── */}
        {cashoutHistory.length > 0 && (
          <div className="mt-4">
            <Panel label={t("referral.withdrawals", "Withdrawals")}>
              <CashoutHistoryList items={cashoutHistory} onUpdate={fetchAll} />
            </Panel>
          </div>
        )}

        <p className="mt-8 text-center text-[11px]" style={{ color: "rgb(var(--fg-muted))" }}>
          {t("referral.privacy")}
        </p>
      </div>

      <GenerateModal
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        onGenerated={(c) => {
          setCode(c);
          fetchAll();
        }}
      />
      <CashoutRequestModal
        isOpen={showCashoutModal}
        onClose={() => setShowCashoutModal(false)}
        availableBalance={available}
        onSuccess={() => fetchAll()}
      />
      <AssistantWidget pageId="referral" />
    </div>
  );
};

export default ReferralPage;
