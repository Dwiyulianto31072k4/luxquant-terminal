// src/components/ReferralPage.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { referralApi } from "../services/referralApi";
import { Z } from "../constants/zIndex";
import { buildReferralMiniAppUrl } from "../utils/telegramCampaign";

import CashoutRequestModal from "./referral/CashoutRequestModal";
import CashoutHistoryList from "./referral/CashoutHistoryList";
import { UsdtCoin } from "./referral/UsdtCoin";
import AssistantWidget from "./assistant/AssistantWidget";
import { Skeleton, ShimmerStyles } from "./ui/Loaders";
import { useDialog } from "../hooks/useDialog";

const BTN =
  "inline-flex h-10 items-center justify-center rounded-md border border-ink/12 bg-surface-raised px-4 text-xs font-semibold text-text-primary transition-colors hover:border-ink/20 hover:bg-ink/[0.05]";

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

const refereeStatus = (referee) => {
  if (referee.qualified_at) return referee.status === "subscribed" ? "subscribed" : "qualified";
  return referee.status || "pending";
};

const StatusBadge = ({ status }) => {
  const { t } = useTranslation();
  const config = {
    pending: { cls: "border-ink/12 bg-surface-secondary text-text-muted", key: "status_pending" },
    active: { cls: "border-profit/25 bg-profit/10 text-profit", key: "status_active" },
    qualified: { cls: "border-accent/30 bg-accent/10 text-accent", key: "status_qualified" },
    subscribed: { cls: "border-transparent bg-accent text-accent-fg", key: "status_subscribed" },
    churned: { cls: "border-ink/12 bg-surface-secondary text-text-muted", key: "status_churned" },
    cancelled: { cls: "border-loss/25 bg-loss/10 text-loss", key: "status_cancelled" },
  }[status] || { cls: "border-ink/12 bg-surface-secondary text-text-muted", key: status };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${config.cls}`}>
      {t(`referral.${config.key}`, { defaultValue: status })}
    </span>
  );
};

const formatRelativeTime = (iso) => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
};

const SCRIPT_PROOF = (link) =>
  `LuxQuant publishes every call since December 2023 — verify the record yourself. Join free with my link:\n${link}`;
const SCRIPT_MONEY = (link) =>
  `I earn USDT when you subscribe. You get 10% off your first payment. We both win:\n${link}`;

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

const ReferralPage = () => {
  const { t } = useTranslation();
  const [code, setCode] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [estimator, setEstimator] = useState({ monthly_usdt: 5, annual_usdt: 40, lifetime_usdt: 100, commission_pct: 10 });
  const [refereesPage, setRefereesPage] = useState({ items: [], total: 0, page: 1, has_more: false });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [refereesPageNum, setRefereesPageNum] = useState(1);
  const [cashoutBalance, setCashoutBalance] = useState(null);
  const [cashoutHistory, setCashoutHistory] = useState([]);
  const [showCashoutModal, setShowCashoutModal] = useState(false);
  const [script, setScript] = useState("proof");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, refereesRes, cashoutBalanceRes, cashoutHistoryRes] = await Promise.allSettled([
        referralApi.getStats(),
        referralApi.getReferees(1, 20),
        referralApi.getCashoutBalance(),
        referralApi.getCashoutHistory(50),
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
  const tgLink = code?.telegram_share_link || (code?.code ? buildReferralMiniAppUrl(code.code) : "");
  const qualified = funnel?.qualified || 0;
  const nextAt = funnel?.next_reward_at || 3;
  const progressPct = Math.min(100, (qualified / Math.max(nextAt, 1)) * 100);
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      {/* HERO — QR + offer */}
      <section className="overflow-hidden rounded-2xl border border-accent/20 bg-surface-raised p-5 sm:p-7">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr] lg:items-start">
          {code && (
            <div className="flex flex-col items-center gap-3">
              <div className="overflow-hidden rounded-lg border border-ink/10 bg-white p-2">
                <img
                  src={`${code.qr_url}?v=${encodeURIComponent(code.created_at || code.code)}`}
                  alt={`QR for ${code.code}`}
                  className="block h-40 w-40 sm:h-48 sm:w-48"
                />
              </div>
              <button type="button" onClick={handleDownloadQR} className={BTN}>
                {t("referral.download_qr")}
              </button>
            </div>
          )}

          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              <UsdtCoin size={16} />
              {t("referral.chip_full")}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              {t("referral.title")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted sm:text-base">
              {t("referral.subtitle")}
            </p>

            {code && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xl font-semibold tracking-wider text-accent sm:text-2xl">
                  {code.code}
                </span>
                <CopyButton
                  text={code.code}
                  label={t("referral.copy_code")}
                  onCopied={() => handleShareTracked("copy_link")}
                />
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(true)}
                  className="text-[11px] text-text-muted underline-offset-2 hover:underline"
                >
                  Customize
                </button>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate rounded-md border border-ink/12 bg-ink/[0.03] px-3 py-2.5 font-mono text-xs text-text-secondary">
                {shareLink}
              </div>
              <CopyButton
                text={shareLink}
                label={t("referral.copy_link")}
                onCopied={() => handleShareTracked("copy_link")}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={shareNative} className={BTN}>
                {t("referral.share")}
              </button>
              <button
                type="button"
                onClick={() =>
                  shareTo(
                    "whatsapp",
                    `https://wa.me/?text=${encodeURIComponent(`${SCRIPT_PROOF("")} ${shareLink}`)}`,
                  )
                }
                className={BTN}
              >
                {t("referral.share_whatsapp")}
              </button>
              <button
                type="button"
                onClick={() =>
                  shareTo(
                    "telegram",
                    `https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(SCRIPT_PROOF(""))}`,
                  )
                }
                className={BTN}
              >
                {t("referral.share_telegram")}
              </button>
              <button
                type="button"
                onClick={() =>
                  shareTo(
                    "twitter",
                    `https://twitter.com/intent/tweet?text=${encodeURIComponent(SCRIPT_PROOF(""))}&url=${encodeURIComponent(shareLink)}`,
                  )
                }
                className={BTN}
              >
                {t("referral.share_x")}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Dual reward — free = VIP */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-accent/20 bg-surface-raised p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                <UsdtCoin size={14} />
                {t("referral.earn_usdt")}
              </p>
              <p className="mt-2 text-sm text-text-muted">{t("referral.earn_usdt_body")}</p>
            </div>
            <UsdtCoin size={48} className="shrink-0" />
          </div>
          {hasEarnings ? (
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase text-text-muted">{t("referral.available")}</p>
                <p className="font-mono text-3xl font-semibold tabular-nums text-accent">
                  ${available.toFixed(2)} <span className="text-sm font-semibold">USDT</span>
                </p>
              </div>
              {canCashout && (
                <button type="button" onClick={() => setShowCashoutModal(true)} className={BTN}>
                  {t("referral.request_cashout")}
                </button>
              )}
            </div>
          ) : (
            <p className="mt-4 font-mono text-sm font-semibold text-accent">
              {t("referral.you_earn")} ${estimator.monthly_usdt} · ${estimator.annual_usdt} · $
              {estimator.lifetime_usdt} USDT
            </p>
          )}
        </div>

        <div className="rounded-xl border border-ink/[0.08] bg-surface-raised p-5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            {t("referral.unlock_access")}
          </p>
          <p className="mt-2 text-sm text-text-muted">{t("referral.unlock_body")}</p>
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="font-mono text-2xl font-semibold tabular-nums text-text-primary">
                {qualified}
                <span className="text-sm font-medium text-text-muted"> / {nextAt}</span>
              </span>
              <span className="text-[11px] text-text-muted">{t("referral.qualified")}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink/[0.06]">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="rounded-xl border border-ink/[0.08] bg-surface-raised p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold text-text-primary">{t("referral.how_title")}</h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <li key={n}>
              <p className="font-mono text-[10px] text-accent">0{n}</p>
              <p className="mt-1 text-sm font-semibold text-text-primary">{t(`referral.step${n}_title`)}</p>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">{t(`referral.step${n}_desc`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Estimator — never lead with $0.00 */}
      <section className="rounded-xl border border-ink/[0.08] bg-surface-raised p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold text-text-primary">{t("referral.estimator_title")}</h2>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {[
            { label: t("referral.estimator_monthly"), value: estimator.monthly_usdt },
            { label: t("referral.estimator_annual"), value: estimator.annual_usdt },
            { label: t("referral.estimator_lifetime"), value: estimator.lifetime_usdt },
          ].map((row) => (
            <div key={row.label} className="rounded-lg border border-ink/[0.06] bg-ink/[0.02] p-3 text-center">
              <div className="mb-1 flex justify-center">
                <UsdtCoin size={22} />
              </div>
              <p className="text-[10px] font-medium text-text-muted">{row.label}</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-accent sm:text-2xl">
                ${row.value}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">USDT</p>
            </div>
          ))}
        </div>
        {hasEarnings && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink/[0.06] pt-4 sm:grid-cols-3">
            <div>
              <p className="text-[10px] uppercase text-text-muted">{t("referral.available")}</p>
              <p className="font-mono text-lg font-semibold tabular-nums">${available.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-text-muted">{t("referral.lifetime_earned")}</p>
              <p className="font-mono text-lg font-semibold tabular-nums">${(earnings.lifetime_earned || 0).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-text-muted">{t("referral.this_month")}</p>
              <p className="font-mono text-lg font-semibold tabular-nums">${(earnings.this_month_earned || 0).toFixed(2)}</p>
            </div>
          </div>
        )}
      </section>

      {/* Share kit */}
      <section className="rounded-xl border border-ink/[0.08] bg-surface-raised p-5 sm:p-6">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">{t("referral.scripts_title")}</h2>
        <div className="mb-3 flex gap-1">
          {["proof", "money"].map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setScript(id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                script === id ? "bg-accent/12 text-accent" : "text-text-muted hover:text-text-primary"
              }`}
            >
              {t(id === "proof" ? "referral.script_proof" : "referral.script_money")}
            </button>
          ))}
        </div>
        <pre className="whitespace-pre-wrap rounded-lg border border-ink/10 bg-ink/[0.03] p-3 text-xs leading-relaxed text-text-secondary">
          {scriptText}
        </pre>
        <CopyButton
          text={scriptText}
          label={t("referral.copy_link")}
          onCopied={() => handleShareTracked("copy_link")}
          className="mt-3"
        />
      </section>

      {/* Tabs: people / cashouts */}
      <div className="flex gap-1 rounded-xl border border-ink/[0.04] bg-ink/[0.02] p-1">
        {[
          { id: "overview", label: t("referral.people_title") },
          { id: "cashouts", label: `${t("referral.cashouts")} (${cashoutHistory.length})` },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className="flex-1 rounded-lg px-3 py-2 text-xs font-medium sm:text-sm"
            style={{
              background: tab === item.id ? "rgb(var(--accent) / 0.12)" : "transparent",
              color: tab === item.id ? "rgb(var(--accent))" : "rgb(var(--fg-muted))",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="overflow-hidden rounded-2xl border border-ink/[0.06] bg-surface-raised">
          {refereesPage.items.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <p className="text-sm text-text-secondary">{t("referral.no_people")}</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-ink/[0.06]">
                {refereesPage.items.map((referee) => (
                  <div key={referee.user_id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/12 text-xs font-bold text-accent">
                      {referee.avatar_url ? (
                        <img src={referee.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        (referee.username || "?").slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-text-primary">@{referee.username}</span>
                        <StatusBadge status={refereeStatus(referee)} />
                      </div>
                      <p className="mt-0.5 text-xs text-text-muted">
                        Joined {formatRelativeTime(referee.joined_at)}
                        {referee.last_login_at && ` · ${formatRelativeTime(referee.last_login_at)}`}
                      </p>
                    </div>
                    {referee.total_commission_earned > 0 && (
                      <p className="flex-shrink-0 font-mono text-sm font-semibold tabular-nums text-accent">
                        ${Number(referee.total_commission_earned).toFixed(2)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {(refereesPageNum > 1 || refereesPage.has_more) && (
                <div className="flex items-center justify-between border-t border-ink/[0.06] px-4 py-3">
                  <button
                    type="button"
                    onClick={() => fetchRefereesPage(refereesPageNum - 1)}
                    disabled={refereesPageNum <= 1}
                    className="text-xs text-text-secondary disabled:opacity-30"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-text-muted">Page {refereesPageNum}</span>
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
            </>
          )}
        </div>
      )}

      {tab === "cashouts" && (
        <div className="rounded-2xl border border-ink/[0.06] bg-surface-raised p-5">
          <CashoutHistoryList items={cashoutHistory} onUpdate={fetchAll} />
        </div>
      )}

      <p className="pb-2 text-center text-[11px] text-text-muted">{t("referral.privacy")}</p>

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
