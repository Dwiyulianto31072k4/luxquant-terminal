// src/components/ReferralPage.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { referralApi } from "../services/referralApi";

import CashoutRequestModal from "./referral/CashoutRequestModal";
import CashoutHistoryList from "./referral/CashoutHistoryList";
import AssistantWidget from "./assistant/AssistantWidget";
import { Skeleton, ShimmerStyles } from "./ui/Loaders";
import { PageHeader } from "./ui/PageHeader";
import { useDialog } from "../hooks/useDialog";

// ════════════════════════════════════════════════════════════════════
// Helper Components
// ════════════════════════════════════════════════════════════════════

const CopyButton = ({ text, label = "Copy", onCopied, className = "" }) => {
  const [copied, setCopied] = useState(false);

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
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
        copied
          ? "border-profit/25 bg-profit/10 text-profit"
          : "border-transparent bg-accent text-accent-fg hover:opacity-90"
      } ${className}`}
    >
      {copied ? (
        <>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
};

const StatusBadge = ({ status }) => {
  const config = {
    pending: { cls: "border-accent/25 bg-accent/10 text-accent", label: "Pending" },
    active: { cls: "border-profit/25 bg-profit/10 text-profit", label: "Active" },
    subscribed: { cls: "border-transparent bg-accent text-accent-fg", label: "Subscribed" },
    churned: { cls: "border-ink/12 bg-surface-secondary text-text-muted", label: "Churned" },
    cancelled: { cls: "border-loss/25 bg-loss/10 text-loss", label: "Cancelled" },
  }[status] || { cls: "border-ink/12 bg-surface-secondary text-text-muted", label: status };

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${config.cls}`}
    >
      {config.label}
    </span>
  );
};

const formatRelativeTime = (iso) => {
  if (!iso) return "Never";
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};

// ════════════════════════════════════════════════════════════════════
// Stat Card
// ════════════════════════════════════════════════════════════════════

const StatCard = ({ label, value, subtitle, accent = false }) => (
  <div
    className={`rounded-lg border p-4 sm:p-5 ${accent ? "border-accent/25 bg-surface-raised" : "border-ink/[0.08] bg-surface-raised"}`}
  >
    <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
      {label}
    </p>
    <p
      className={`font-mono text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl ${accent ? "text-accent" : "text-text-primary"}`}
    >
      {value}
    </p>
    {subtitle && <p className="mt-1 text-xs text-text-muted">{subtitle}</p>}
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Funnel Bar Visualization
// ════════════════════════════════════════════════════════════════════

const FunnelBar = ({ funnel }) => {
  const max = Math.max(funnel.signed_up, 1);
  const stages = [
    {
      key: "signed_up",
      label: "Signed Up",
      value: funnel.signed_up,
      color: "rgb(var(--fg-muted))",
    },
    { key: "active", label: "Active", value: funnel.active, color: "rgb(var(--pos-text))" },
    {
      key: "subscribed",
      label: "Subscribed",
      value: funnel.subscribed,
      color: "rgb(var(--accent-text))",
    },
    { key: "churned", label: "Churned", value: funnel.churned, color: "rgb(var(--neg-text))" },
  ];

  return (
    <div className="space-y-3">
      {stages.map((stage) => {
        const pct = (stage.value / max) * 100;
        return (
          <div key={stage.key}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-text-secondary">{stage.label}</span>
              <span className="text-sm font-semibold tabular-nums" style={{ color: stage.color }}>
                {stage.value}
              </span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ background: "rgb(var(--ink) / 0.04)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, background: stage.color, opacity: 0.85 }}
              />
            </div>
          </div>
        );
      })}

      {(funnel.activation_rate > 0 || funnel.subscription_rate > 0) && (
        <div
          className="flex items-center gap-4 pt-3 mt-3 border-t"
          style={{ borderColor: "rgb(var(--ink) / 0.06)" }}
        >
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider mb-0.5 text-text-muted">
              Activation
            </p>
            <p className="text-sm font-semibold text-profit">{funnel.activation_rate}%</p>
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wider mb-0.5 text-text-muted">
              Subscription
            </p>
            <p className="text-sm font-semibold text-accent">{funnel.subscription_rate}%</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// Referee Row
// ════════════════════════════════════════════════════════════════════

const RefereeRow = ({ referee }) => {
  const initials = referee.username.slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 rounded-lg hover:bg-ink/[0.02] transition-colors">
      {/* Avatar */}
      <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden bg-accent/12 text-accent">
        {referee.avatar_url ? (
          <img
            src={referee.avatar_url}
            alt={referee.username}
            className="w-full h-full object-cover"
          />
        ) : (
          initials
        )}
      </div>

      {/* Identity + Status */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate text-text-primary">
            @{referee.username}
          </span>
          <StatusBadge status={referee.status} />
        </div>
        <p className="text-xs mt-0.5 text-text-muted">
          Joined {formatRelativeTime(referee.joined_at)}
          {referee.last_login_at && ` · Last login ${formatRelativeTime(referee.last_login_at)}`}
        </p>
      </div>

      {/* Earnings */}
      <div className="text-right flex-shrink-0">
        <p
          className="text-sm font-semibold tabular-nums"
          style={{
            color:
              referee.total_commission_earned > 0 ? "rgb(var(--accent))" : "rgb(var(--fg-muted))",
          }}
        >
          ${referee.total_commission_earned.toFixed(2)}
        </p>
        <p className="text-[10px] text-text-muted">
          {referee.total_payments} payment{referee.total_payments !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// Custom Slug Generator Modal
// ════════════════════════════════════════════════════════════════════

const GenerateModal = ({ isOpen, onClose, onGenerated }) => {
  // Escape / background-scroll lock / focus trap / focus restore — hooks/useDialog.
  const dialogRef = useRef(null);
  useDialog({ isOpen: isOpen, onClose: onClose, ref: dialogRef });

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

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Generate referral code"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4"
      style={{ background: "rgb(var(--scrim) / 0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[min(92dvh,100%)] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-b-0 sm:border-b p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        style={{ background: "rgb(var(--surface-hover))", borderColor: "rgb(var(--accent) / 0.2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center -mt-2 mb-3 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-ink/25" />
        </div>
        <h3 className="text-lg font-bold mb-2 text-text-primary">Create Your Referral Code</h3>
        <p className="text-sm mb-5 text-text-muted">
          Pick a custom code (4-20 chars, letters/numbers/dash) or auto-generate.
        </p>

        <input
          type="text"
          value={customCode}
          onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
          placeholder="DWI-2026"
          maxLength={20}
          className="w-full px-4 py-3 rounded-xl text-sm font-medium tracking-wide outline-none transition-colors"
          style={{
            background: "rgb(var(--ink) / 0.04)",
            border: `1px solid ${error ? "rgba(239,68,68,0.4)" : "rgb(var(--accent) / 0.2)"}`,
            color: "rgb(var(--fg))",
          }}
        />

        {error && <p className="text-xs mt-2 text-loss">{error}</p>}

        <p className="text-[11px] mt-2 text-text-muted">
          Examples: <code>DWI-2026</code>, <code>LUXKING</code>, <code>crypto_pro</code>
        </p>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: "rgb(var(--ink) / 0.04)",
              color: "rgb(var(--fg-muted))",
              border: "1px solid rgb(var(--ink) / 0.06)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => handleSubmit(false)}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: "rgb(var(--accent) / 0.1)",
              color: "rgb(var(--accent-text))",
              border: "1px solid rgb(var(--ink) / 0.12)",
            }}
          >
            {loading ? "..." : "Auto-generate"}
          </button>
          <button
            onClick={() => handleSubmit(true)}
            disabled={loading || customCode.length < 4}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{
              background:
                customCode.length >= 4
                  ? "rgb(var(--surface-raised))) 0%, rgb(var(--accent)) 100%)"
                  : "rgb(var(--accent) / 0.1)",
              color: customCode.length >= 4 ? "rgb(var(--surface))" : "rgb(var(--fg-muted))",
              border: "none",
              cursor: customCode.length < 4 ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "..." : "Use Custom"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════

const ReferralPage = () => {
  const { t } = useTranslation();

  // Data
  const [code, setCode] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [refereesPage, setRefereesPage] = useState({
    items: [],
    total: 0,
    page: 1,
    has_more: false,
  });

  // UI
  // UI
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview"); // overview | referees | cashouts
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [refereesPageNum, setRefereesPageNum] = useState(1);

  // Cashout state
  const [cashoutBalance, setCashoutBalance] = useState(null);
  const [cashoutHistory, setCashoutHistory] = useState([]);
  const [showCashoutModal, setShowCashoutModal] = useState(false);

  // ─── Fetch initial data ───
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, refereesRes, cashoutBalanceRes, cashoutHistoryRes] =
        await Promise.allSettled([
          referralApi.getStats(),
          referralApi.getReferees(1, 20),
          referralApi.getCashoutBalance(),
          referralApi.getCashoutHistory(50),
        ]);

      if (statsRes.status === "fulfilled" && statsRes.value) {
        setCode(statsRes.value.code);
        setFunnel(statsRes.value.funnel);
        setEarnings(statsRes.value.earnings);
      }
      if (refereesRes.status === "fulfilled") {
        setRefereesPage(refereesRes.value);
      }
      if (cashoutBalanceRes.status === "fulfilled") {
        setCashoutBalance(cashoutBalanceRes.value);
      }
      if (cashoutHistoryRes.status === "fulfilled") {
        setCashoutHistory(cashoutHistoryRes.value.items || []);
      }
    } catch (err) {
      console.error("Referral data load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ─── Pagination for referees ───
  const fetchRefereesPage = async (page) => {
    try {
      const res = await referralApi.getReferees(page, 20);
      setRefereesPage(res);
      setRefereesPageNum(page);
    } catch (e) {
      console.error("Failed to load referees page:", e);
    }
  };

  // ─── Track share / qr download ───
  const handleShareTracked = async (channel) => {
    if (!code?.code) return;
    try {
      await referralApi.trackShare(code.code, channel);
      // Update local share_count
      setCode((prev) =>
        prev
          ? {
              ...prev,
              share_count:
                channel === "qr_download" ? prev.share_count : (prev.share_count || 0) + 1,
              qr_count: channel === "qr_download" ? (prev.qr_count || 0) + 1 : prev.qr_count,
            }
          : prev
      );
    } catch (e) {
      console.error("Track share failed:", e);
    }
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

  const shareToTwitter = () => {
    if (!code) return;
    handleShareTracked("twitter");
    const text = `Join LuxQuant Terminal — get 10% off using my referral link 🚀`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(code.share_link)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const shareToTelegram = () => {
    if (!code) return;
    handleShareTracked("telegram");
    const text = `Join LuxQuant Terminal — get 10% off using my link`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(code.share_link)}&text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // ─── LOADING ───
  if (loading) {
    return (
      <div
        className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6 animate-[lqFadeIn_.25s_ease]"
        role="status"
        aria-label="Loading referral data"
      >
        <ShimmerStyles />
        {/* Hero code / QR card */}
        <div className="rounded-2xl border border-ink/[0.06] p-5 sm:p-7">
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
            <Skeleton className="h-40 w-40 sm:h-48 sm:w-48 !rounded-xl mx-auto lg:mx-0" />
            <div className="space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-56 max-w-[80%]" />
              <Skeleton className="h-10 w-full max-w-md" />
              <div className="flex gap-2">
                <Skeleton className="h-9 w-28" />
                <Skeleton className="h-9 w-28" />
              </div>
            </div>
          </div>
        </div>
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-ink/[0.05] p-4 space-y-2.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>
        {/* History list */}
        <div className="rounded-2xl border border-ink/[0.06] p-5">
          <Skeleton className="h-4 w-32 mb-4" />
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 !rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-2 w-1/2" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── EMPTY STATE (no code yet) ───
  if (!code) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 sm:py-20 text-center">
        <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-6 border border-ink/[0.1] bg-surface-secondary">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgb(var(--accent))"
            strokeWidth="2"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
        </div>
        <PageHeader title="Start Your Referral Program" />
        <p className="text-sm sm:text-base mb-8 max-w-md mx-auto text-text-muted">
          Share your link, earn 10% commission on every payment from people you invite. Pick a
          custom code or auto-generate one.
        </p>
        <button
          type="button"
          onClick={() => setShowGenerateModal(true)}
          className="rounded-md border border-transparent bg-accent px-6 py-3 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
        >
          Create My Referral Code
        </button>

        <GenerateModal
          isOpen={showGenerateModal}
          onClose={() => setShowGenerateModal(false)}
          onGenerated={(c) => {
            setCode(c);
            fetchAll();
          }}
        />
      </div>
    );
  }

  // ─── MAIN UI ───
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* HEADER + CODE CARD */}
      <div className="overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised">
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 p-5 sm:p-7">
          {/* QR Code */}
          <div className="flex flex-col items-center lg:items-start gap-3">
            <div className="overflow-hidden rounded-lg border border-ink/[0.1] bg-surface-secondary">
              <img
                src={`${code.qr_url}?v=${encodeURIComponent(code.created_at || code.code)}`}
                alt={`QR for ${code.code}`}
                className="w-40 h-40 sm:w-48 sm:h-48 block"
                style={{ background: "rgb(var(--fg))" }}
              />
            </div>
            <button
              type="button"
              onClick={handleDownloadQR}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-transparent bg-accent px-3 py-2 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download QR
            </button>
          </div>

          {/* Code & Link */}
          <div className="flex flex-col justify-between gap-4 min-w-0">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2 text-text-muted">
                Your Referral Code
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="font-mono text-2xl font-semibold tracking-wider text-accent sm:text-3xl">
                  {code.code}
                </h2>
                <CopyButton
                  text={code.code}
                  label="Copy code"
                  onCopied={() => handleShareTracked("copy_link")}
                />
              </div>

              {/* Share metrics */}
              <div className="flex items-center gap-4 mt-3 text-xs text-text-muted">
                <span>📤 Shared {code.share_count || 0}×</span>
                <span>📥 QR {code.qr_count || 0}×</span>
                <span>🎯 Used {code.times_used || 0}×</span>
              </div>
            </div>

            {/* Share Link */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2 text-text-muted">
                Share Link
              </p>
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 px-3 py-2.5 rounded-lg text-xs sm:text-sm overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{
                    background: "rgb(var(--ink) / 0.04)",
                    border: "1px solid rgb(var(--ink) / 0.06)",
                    color: "rgb(var(--fg-secondary))",
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  {code.share_link}
                </div>
                <CopyButton
                  text={code.share_link}
                  label="Copy"
                  onCopied={() => handleShareTracked("copy_link")}
                />
              </div>
            </div>

            {/* Share buttons */}
            <div className="flex gap-2">
              <button
                onClick={shareToTwitter}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-ink/[0.04]"
                style={{
                  background: "rgb(var(--ink) / 0.02)",
                  border: "1px solid rgb(var(--ink) / 0.06)",
                  color: "rgb(var(--fg-secondary))",
                }}
              >
                Share on X
              </button>
              <button
                onClick={shareToTelegram}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors hover:bg-ink/[0.04]"
                style={{
                  background: "rgb(var(--ink) / 0.02)",
                  border: "1px solid rgb(var(--ink) / 0.06)",
                  color: "rgb(var(--fg-secondary))",
                }}
              >
                Share on Telegram
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* EARNINGS CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Available Balance"
          value={`$${(earnings?.available_balance || 0).toFixed(2)}`}
          subtitle="Ready to redeem"
          accent
        />
        <StatCard
          label="Lifetime Earned"
          value={`$${(earnings?.lifetime_earned || 0).toFixed(2)}`}
          subtitle="All-time commission"
        />
        <StatCard
          label="This Month"
          value={`$${(earnings?.this_month_earned || 0).toFixed(2)}`}
          subtitle="Last 30 days"
        />
        <StatCard
          label="Total Redeemed"
          value={`$${(earnings?.total_redeemed || 0).toFixed(2)}`}
          subtitle="Already used"
        />
      </div>

      {/* CASHOUT ACTION BAR (Layer 8) */}
      {cashoutBalance && (
        <div
          className="rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between"
          style={{
            background: "rgb(var(--surface-raised)), rgb(var(--accent) / 0.02))",
            border: "1px solid rgb(var(--line) / 0.15)",
          }}
        >
          <div className="flex items-start gap-3 flex-1">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgb(var(--accent) / 0.1)" }}
            >
              <svg
                className="w-5 h-5 text-accent"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold mb-1 text-text-primary">Withdraw to USDT</h4>
              <p className="text-xs leading-relaxed text-text-muted">
                {cashoutBalance.active_cashout ? (
                  <>
                    You have an active cashout (#{cashoutBalance.active_cashout.id}, status:{" "}
                    <span style={{ color: "rgb(var(--warn))" }}>
                      {cashoutBalance.active_cashout.status}
                    </span>
                    ). Check history tab.
                  </>
                ) : cashoutBalance.can_request_cashout ? (
                  "Convert your referral credit balance to USDT via Telegram admin."
                ) : (
                  "Earn referral commission first to be able to withdraw."
                )}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCashoutModal(true)}
            disabled={!cashoutBalance.can_request_cashout}
            className="px-5 py-2.5 rounded-lg text-xs font-bold transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            style={{
              background: cashoutBalance.can_request_cashout
                ? "rgb(var(--surface-raised))), #a07c2e)"
                : "rgb(var(--accent) / 0.08)",
              color: cashoutBalance.can_request_cashout
                ? "rgb(var(--surface))"
                : "rgb(var(--fg-muted))",
              boxShadow: cashoutBalance.can_request_cashout
                ? "0 2px 12px rgb(var(--accent) / 0.2)"
                : "none",
            }}
          >
            Request Cashout
          </button>
        </div>
      )}

      {/* TABS */}
      <div
        className="flex gap-1 p-1 rounded-xl"
        style={{ background: "rgb(var(--ink) / 0.02)", border: "1px solid rgb(var(--ink) / 0.04)" }}
      >
        {[
          { id: "overview", label: "Overview" },
          { id: "referees", label: `Referees (${refereesPage.total})` },
          { id: "cashouts", label: `Cashouts (${cashoutHistory.length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all"
            style={{
              background: tab === t.id ? "rgb(var(--accent) / 0.12)" : "transparent",
              color: tab === t.id ? "rgb(var(--accent))" : "#8a7a6e",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: OVERVIEW (Funnel) */}
      {tab === "overview" && funnel && (
        <div
          className="rounded-2xl border p-5 sm:p-6"
          style={{ background: "rgb(var(--ink) / 0.02)", borderColor: "rgb(var(--ink) / 0.06)" }}
        >
          <h3 className="text-base font-semibold mb-1 text-text-primary">Conversion Funnel</h3>
          <p className="text-xs mb-5 text-text-muted">
            How your referees move from signup to subscription.
          </p>
          <FunnelBar funnel={funnel} />
        </div>
      )}

      {/* TAB: REFEREES */}
      {tab === "referees" && (
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: "rgb(var(--ink) / 0.02)", borderColor: "rgb(var(--ink) / 0.06)" }}
        >
          {refereesPage.items.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm mb-2 text-text-secondary">No referees yet</p>
              <p className="text-xs text-text-muted">
                Share your link to start earning commission.
              </p>
            </div>
          ) : (
            <>
              <div
                className="px-3 sm:px-4 py-3 border-b"
                style={{ borderColor: "rgb(var(--ink) / 0.06)" }}
              >
                <p className="text-xs text-text-muted">
                  Showing {refereesPage.items.length} of {refereesPage.total} referees
                </p>
              </div>

              <div className="divide-y" style={{ "--tw-divide-opacity": 0.04 }}>
                {refereesPage.items.map((referee) => (
                  <RefereeRow key={referee.user_id} referee={referee} />
                ))}
              </div>

              {/* Pagination */}
              {(refereesPageNum > 1 || refereesPage.has_more) && (
                <div
                  className="flex items-center justify-between px-4 py-3 border-t"
                  style={{ borderColor: "rgb(var(--ink) / 0.06)" }}
                >
                  <button
                    onClick={() => fetchRefereesPage(refereesPageNum - 1)}
                    disabled={refereesPageNum <= 1}
                    className="px-3 py-1.5 rounded-md text-xs transition-colors disabled:opacity-30"
                    style={{
                      background: "rgb(var(--ink) / 0.04)",
                      color: "rgb(var(--fg-secondary))",
                    }}
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-text-muted">Page {refereesPageNum}</span>
                  <button
                    onClick={() => fetchRefereesPage(refereesPageNum + 1)}
                    disabled={!refereesPage.has_more}
                    className="px-3 py-1.5 rounded-md text-xs transition-colors disabled:opacity-30"
                    style={{
                      background: "rgb(var(--ink) / 0.04)",
                      color: "rgb(var(--fg-secondary))",
                    }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB: CASHOUTS (Layer 8) */}
      {tab === "cashouts" && (
        <div
          className="rounded-2xl border p-5 sm:p-6"
          style={{ background: "rgb(var(--ink) / 0.02)", borderColor: "rgb(var(--ink) / 0.06)" }}
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold mb-1 text-text-primary">Cashout Requests</h3>
              <p className="text-xs text-text-muted">History of your USDT withdrawal requests.</p>
            </div>
            {cashoutBalance?.can_request_cashout && (
              <button
                onClick={() => setShowCashoutModal(true)}
                className="px-4 py-2 rounded-lg text-xs font-bold transition-transform hover:scale-105"
                style={{
                  background: "linear-gradient(135deg, rgb(var(--accent)), #a07c2e)",
                  color: "rgb(var(--accent-fg))",
                }}
              >
                + New Request
              </button>
            )}
          </div>
          <CashoutHistoryList items={cashoutHistory} onUpdate={fetchAll} />
        </div>
      )}

      {/* PRIVACY DISCLOSURE */}
      <div className="text-center pt-4 pb-2">
        <p className="text-[11px] text-text-muted">
          Privacy: when someone uses your referral link, their username, avatar, signup date, and
          login activity are visible to you.
        </p>
      </div>

      {/* CASHOUT MODAL (Layer 8) */}
      <CashoutRequestModal
        isOpen={showCashoutModal}
        onClose={() => setShowCashoutModal(false)}
        availableBalance={cashoutBalance?.balance_usdt || 0}
        onSuccess={() => fetchAll()}
      />

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="referral" />
    </div>
  );
};

export default ReferralPage;
