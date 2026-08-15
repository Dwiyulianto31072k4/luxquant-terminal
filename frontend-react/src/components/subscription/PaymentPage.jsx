// src/components/subscription/PaymentPage.jsx
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import subscriptionApi from "../../services/subscriptionApi";
import { loginUrl } from "../../utils/postLoginRedirect";
import SubscribeViaAdminModal from "./SubscribeViaAdminModal";
import { trackGrowth } from "../../utils/growthAnalytics";

// ═══════════════════════════════════════════
// Tether icon (USDT)
// ═══════════════════════════════════════════
const UsdtIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="16" fill="#26A17B" />
    <path
      d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.658 0-.809 2.902-1.486 6.79-1.66v2.644c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06v-2.643c3.88.173 6.775.85 6.775 1.658 0 .81-2.895 1.485-6.775 1.657m0-3.59v-2.366h5.414V7.819H8.595v3.608h5.414v2.365c-4.4.202-7.709 1.074-7.709 2.118 0 1.044 3.309 1.915 7.709 2.118v7.582h3.913v-7.584c4.393-.202 7.694-1.073 7.694-2.116 0-1.043-3.301-1.914-7.694-2.117"
      fill="#fff"
    />
  </svg>
);

const BNBIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="16" fill="#F3BA2F" />
    <path
      d="M12.116 14.404l3.884-3.884 3.886 3.886 2.26-2.26L16 6 9.856 12.144l2.26 2.26zM6 16l2.26-2.26L10.52 16l-2.26 2.26L6 16zm6.116 1.596L16 21.48l3.886-3.886 2.26 2.259L16 26l-6.144-6.144-.003-.003 2.263-2.257zM21.48 16l2.26-2.26L26 16l-2.26 2.26L21.48 16zm-3.188-.002h.002V16L16 18.294l-2.291-2.29-.004-.004.004-.003.401-.402.195-.195L16 13.706l2.293 2.293z"
      fill="#fff"
    />
  </svg>
);

// Section label (pattern from Pulse / Potential Trades pages)
const SectionLabel = ({ label, accent = "rgb(var(--accent))" }) => (
  <div className="flex items-center gap-2 mb-3">
    <div className="w-1 h-1 rounded-full" style={{ background: accent }} />
    <span
      className="text-[10px] font-bold uppercase tracking-[0.15em]"
      style={{ color: "rgb(var(--fg-muted))" }}
    >
      {label}
    </span>
  </div>
);

// Stat card for top metrics row
const StatCard = ({ label, children }) => (
  <div
    className="rounded-xl p-4 sm:p-5"
    style={{
      background: "rgb(var(--surface-raised))",
      border: "1px solid rgb(var(--line) / 0.06)",
    }}
  >
    <p
      className="text-[10px] font-semibold uppercase tracking-wider mb-2.5"
      style={{ color: "rgb(var(--fg-muted))" }}
    >
      {label}
    </p>
    {children}
  </div>
);

// ═══════════════════════════════════════════
// Main PaymentPage
// ═══════════════════════════════════════════
const PaymentPage = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { refreshUser, isAuthenticated } = useAuth();
  const { invoice: stateInvoice, plan: statePlan } = location.state || {};

  // An invoice reached this page only through router state, so a reload, a new
  // tab, or a link from a reminder lost it — and the bounce to /pricing below
  // meant starting again, which mints a SECOND invoice and cancels the first.
  // `recovered` is the same invoice fetched back from the server.
  const [recovered, setRecovered] = useState(null);
  const [recovering, setRecovering] = useState(!stateInvoice);
  const invoice = stateInvoice || recovered;
  const plan = statePlan || recovered?.plan || null;

  const [txHash, setTxHash] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [showAdminModal, setShowAdminModal] = useState(false);

  const walletAddress = invoice?.wallet_to || invoice?.payment?.wallet_to || "";
  const amount = invoice?.amount_usdt || invoice?.payment?.amount_usdt || "";
  const expiresAt = invoice?.expires_at || invoice?.payment?.expires_at || "";
  const paymentId = invoice?.payment?.id || invoice?.id || null;
  // Derived, not typed: a hardcoded "24h payment window" sat under a 72h
  // countdown and contradicted it on screen.
  const windowHours = (() => {
    const created = invoice?.payment?.created_at || invoice?.created_at;
    if (!created || !expiresAt) return null;
    const h = Math.round(
      (new Date(expiresAt).getTime() - new Date(created).getTime()) / 3600000
    );
    return Number.isFinite(h) && h > 0 ? h : null;
  })();
  const planLabel = plan?.label || invoice?.plan?.label || invoice?.plan?.name || "Subscription";

  useEffect(() => {
    if (!paymentId) return;
    trackGrowth("checkout_viewed", {
      source: stateInvoice ? "invoice_created" : "invoice_recovered",
      entity_type: "payment",
      entity_id: paymentId,
      once: `checkout:${paymentId}`,
    });
  }, [paymentId, stateInvoice]);

  // Ask the server for the open checkout before giving up on it. Only bounce
  // when there genuinely isn't one.
  useEffect(() => {
    if (stateInvoice) return undefined;
    // The reminder link is opened in whatever browser Telegram hands it to,
    // which very often has no session. Sending them to /pricing there loses
    // the invoice they were told to finish; sending them to sign in and
    // straight back here does not.
    if (!isAuthenticated) {
      navigate(loginUrl("/payment", { source: "invoice_reminder" }), { replace: true });
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const open = await subscriptionApi.getPendingInvoice();
        if (cancelled) return;
        if (open) setRecovered(open);
        else navigate("/pricing");
      } catch {
        if (!cancelled) navigate("/pricing");
      } finally {
        if (!cancelled) setRecovering(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stateInvoice, isAuthenticated, navigate]);

  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const now = new Date();
      const expires = new Date(expiresAt);
      const diff = expires - now;
      if (diff <= 0) {
        setTimeLeft(t("payment.expired"));
        clearInterval(interval);
        return;
      }
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, t]);

  const handleCopy = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(String(text));
    trackGrowth(label === "wallet" ? "wallet_address_copied" : "payment_amount_copied", {
      source: "payment_page",
      entity_type: "payment",
      entity_id: paymentId,
      once: `payment-copy:${label}:${paymentId}`,
    });
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  // Cleared on unmount and whenever the customer acts, so a queued re-check
  // can never fire against a page that has moved on.
  const autoRetryRef = useRef([]);
  const clearAutoRetry = () => {
    autoRetryRef.current.forEach(clearTimeout);
    autoRetryRef.current = [];
  };
  useEffect(() => clearAutoRetry, []);

  const handleVerify = async (isAuto = false) => {
    if (!txHash.trim() || !paymentId) return;
    if (!isAuto) clearAutoRetry();
    trackGrowth("transaction_submitted", {
      source: isAuto ? "payment_page:auto_retry" : "payment_page",
      entity_type: "payment",
      entity_id: paymentId,
      meta: { auto_retry: Boolean(isAuto) },
      once: `transaction:${paymentId}`,
    });
    setVerifying(true);
    if (!isAuto) setResult(null);

    try {
      const res = await subscriptionApi.verifyPayment(paymentId, txHash.trim());
      setResult(res);

      // "retryable" means the node could not answer yet — usually the block is
      // still confirming. That resolves itself, so wait for it instead of
      // making the customer notice and paste the hash again. A genuine
      // rejection is final and is not retried.
      if (res.status !== "confirmed" && res.retryable && !isAuto) {
        autoRetryRef.current = [20000, 40000, 60000].map((ms) =>
          setTimeout(() => handleVerify(true), ms)
        );
      }
      if (res.status === "confirmed") clearAutoRetry();

      if (res.status === "confirmed") {
        if (res.user && refreshUser) {
          await refreshUser(res.user);
        } else if (refreshUser) {
          await refreshUser();
        }
        setTimeout(() => navigate("/"), 3000);
      }
    } catch (err) {
      setResult({
        status: "error",
        message: err.response?.data?.detail || "Verification failed, please try again",
      });
    } finally {
      setVerifying(false);
    }
  };

  const isExpired = timeLeft === t("payment.expired");

  if (!invoice) return null;

  // Recovering the invoice from the server. Rendering the checkout with no
  // wallet, no amount and a blank countdown for that moment looks like the
  // page is broken, which is the worst possible read on a payment screen.
  if (recovering && !invoice) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-text-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          <span className="text-sm">{t("payment.loading_invoice", "Loading your invoice…")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
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

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* ════════════════════════════════════════════════
 HEADER — adopt Pulse / Potential Trades style
 ════════════════════════════════════════════════ */}
        <div className="mb-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: isExpired ? "#f87171" : "rgb(var(--accent))" }}
              />
              <span
                className="text-[10px] font-bold uppercase tracking-[0.2em]"
                style={{ color: "rgb(var(--fg-muted))" }}
              >
                Payment Invoice
              </span>
            </div>
            <h1
              className="text-3xl sm:text-4xl lg:text-5xl font-bold text-text-primary tracking-tight leading-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Complete Your Payment
            </h1>
            <p className="text-sm mt-2" style={{ color: "rgb(var(--fg-muted))" }}>
              <span style={{ color: "rgb(var(--accent-text))" }}>{planLabel}</span>
              <span className="mx-2" style={{ color: "rgb(var(--fg-muted))" }}>
                ·
              </span>
              <span className="font-mono font-semibold text-text-primary">
                {amount || "?"} USDT
              </span>
            </p>
          </div>

          {/* Status pill */}
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{
                background: isExpired ? "rgba(239,68,68,0.06)" : "rgb(var(--accent) / 0.06)",
                border: `1px solid ${isExpired ? "rgba(239,68,68,0.2)" : "rgb(var(--accent) / 0.15)"}`,
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: isExpired ? "#f87171" : "#22c55e" }}
              />
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: isExpired ? "#f87171" : "#22c55e" }}
              >
                {isExpired ? "Expired" : "Awaiting Payment"}
              </span>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════
 TOP STAT ROW — 4 cards summary
 ════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <StatCard label="Amount Due">
            <div className="flex items-baseline gap-2">
              <span
                className="text-2xl sm:text-3xl font-bold text-text-primary"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {amount || "—"}
              </span>
              <span className="text-xs font-semibold" style={{ color: "rgb(var(--accent-text))" }}>
                USDT
              </span>
            </div>
          </StatCard>

          <StatCard label="Currency">
            <div className="flex items-center gap-2.5">
              <UsdtIcon size={26} />
              <div>
                <div className="text-sm font-bold text-text-primary">USDT</div>
                <div className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
                  Tether USD
                </div>
              </div>
            </div>
          </StatCard>

          <StatCard label="Network">
            <div className="flex items-center gap-2.5">
              <BNBIcon size={26} />
              <div>
                <div className="text-sm font-bold text-text-primary">BSC</div>
                <div className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
                  BEP-20
                </div>
              </div>
            </div>
          </StatCard>

          <StatCard label="Expires In">
            <div
              className={`text-lg sm:text-xl font-mono font-bold tracking-wider ${isExpired ? "text-loss" : ""}`}
              style={!isExpired ? { color: "rgb(var(--accent-text))" } : {}}
            >
              {timeLeft || t("payment.calculating")}
            </div>
            <div className="text-[10px] mt-1" style={{ color: "rgb(var(--fg-muted))" }}>
              {windowHours ? `${windowHours}h payment window` : "Payment window"}
            </div>
          </StatCard>
        </div>

        {/* ════════════════════════════════════════════════
 MAIN GRID — 2 col on desktop, stacked mobile
 ════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
          {/* Placed BEFORE the transfer details on purpose: the moment someone
              decides they cannot use this rail is the moment they open the
              invoice, not the moment they reach the bottom of it. */}
          <div
            className="lg:col-span-2 rounded-2xl overflow-hidden mb-1"
            style={{
              background: "rgb(var(--accent) / 0.04)",
              border: "1px solid rgb(var(--accent) / 0.18)",
            }}
          >
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgb(var(--accent) / 0.12)" }}
                >
                  <svg
                    className="w-4.5 h-4.5"
                    style={{ color: "rgb(var(--accent-text))", width: 18, height: 18 }}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-text-primary mb-0.5">
                    Don&rsquo;t have USDT, or prefer a bank transfer?
                  </h4>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "rgb(var(--fg-muted))" }}
                  >
                    Message an admin on Telegram and we will arrange bank transfer or
                    another method by hand. Same plan, same price.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAdminModal(true)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold transition-all hover:brightness-110 flex-shrink-0"
                style={{
                  background: "rgb(var(--accent))",
                  color: "rgb(var(--accent-fg))",
                }}
              >
                Pay another way
              </button>
            </div>
          </div>

          {/* ═══ LEFT: Transfer Details ═══ */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "rgb(var(--surface-raised))",
              border: "1px solid rgb(var(--line) / 0.08)",
            }}
          >
            <div
              className="h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgb(var(--accent) / 0.2), transparent)",
              }}
            />
            <div className="p-5 sm:p-7">
              <SectionLabel label="Transfer Details" />
              <h2
                className="text-lg sm:text-xl font-bold text-text-primary mb-5 tracking-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Send USDT to wallet
              </h2>

              {/* Wallet Address */}
              <div
                className="rounded-xl p-4 mb-3"
                style={{
                  background: "rgb(var(--surface-secondary))",
                  border: "1px solid rgb(var(--line) / 0.06)",
                }}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: "rgb(var(--fg-muted))" }}
                  >
                    Wallet Address
                  </span>
                  <button
                    onClick={() => handleCopy(walletAddress, "wallet")}
                    disabled={!walletAddress}
                    className="px-3 py-1 rounded-md text-[10px] font-semibold transition-all disabled:opacity-20 hover:scale-[1.02]"
                    style={{
                      background: "rgb(var(--accent) / 0.08)",
                      color: "rgb(var(--accent-text))",
                      border: "1px solid rgb(var(--line) / 0.15)",
                    }}
                  >
                    {copied === "wallet" ? t("payment.copied") : t("payment.copy")}
                  </button>
                </div>
                <p className="text-sm font-mono text-text-primary/90 break-all leading-relaxed select-all">
                  {walletAddress || "—"}
                </p>
                {/* The rotating address is the single most suspicious-looking
                    thing on this page to anyone who checks. Naming it first
                    turns it from a red flag into a reason to trust us. */}
                <p
                  className="mt-2.5 text-[11px] leading-relaxed"
                  style={{ color: "rgb(var(--fg-muted))" }}
                >
                  <span className="font-semibold text-text-primary/90">
                    This address was issued for this invoice only.
                  </span>{" "}
                  It is how we match your transfer to your account, so do not reuse it
                  for a later payment.
                </p>
              </div>

              {/* Amount mirror */}
              <div
                className="rounded-xl p-4 mb-3"
                style={{
                  background: "rgb(var(--surface-secondary))",
                  border: "1px solid rgb(var(--line) / 0.06)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                      style={{ color: "rgb(var(--fg-muted))" }}
                    >
                      Exact Amount
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span
                        className="text-2xl font-bold text-text-primary"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {amount || "—"}
                      </span>
                      <span
                        className="text-xs font-semibold"
                        style={{ color: "rgb(var(--accent-text))" }}
                      >
                        USDT
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopy(String(amount), "amount")}
                    disabled={!amount}
                    className="px-3 py-1.5 rounded-md text-[10px] font-semibold transition-all disabled:opacity-20 hover:scale-[1.02]"
                    style={{
                      background: "rgb(var(--accent) / 0.08)",
                      color: "rgb(var(--accent-text))",
                      border: "1px solid rgb(var(--line) / 0.15)",
                    }}
                  >
                    {copied === "amount" ? t("payment.copied") : t("payment.copy")}
                  </button>
                </div>
              </div>

              {/* Network warning */}
              <div
                className="flex items-start gap-2.5 p-3.5 rounded-xl"
                style={{
                  background: "rgba(234,179,8,0.04)",
                  border: "1px solid rgba(234,179,8,0.12)",
                }}
              >
                <svg
                  className="w-4 h-4 flex-shrink-0 mt-0.5"
                  style={{ color: "rgb(var(--accent-text))" }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                <p
                  className="text-[11px] leading-relaxed"
                  style={{ color: "rgb(var(--fg-muted))" }}
                >
                  <span className="font-semibold text-text-primary/90">
                    Only send USDT via BSC (BEP-20).
                  </span>{" "}
                  Sending other tokens or using other networks (ERC-20, TRC-20) will result in
                  permanent loss of funds.
                </p>
              </div>

            </div>
          </div>

          {/* ═══ RIGHT: Submit Transaction ═══ */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "rgb(var(--surface-raised))",
              border: "1px solid rgb(var(--line) / 0.08)",
            }}
          >
            <div
              className="h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgb(var(--accent) / 0.2), transparent)",
              }}
            />
            <div className="p-5 sm:p-7">
              <SectionLabel label="Verify Payment" />
              <h2
                className="text-lg sm:text-xl font-bold text-text-primary mb-5 tracking-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Submit transaction hash
              </h2>

              <div className="space-y-4">
                <p
                  className="text-[11px] leading-relaxed"
                  style={{ color: "rgb(var(--fg-muted))" }}
                >
                  After completing the transfer, paste your transaction hash below to verify and
                  activate your subscription.
                </p>

                <div>
                  <label
                    className="block text-[10px] font-semibold uppercase tracking-wider mb-2"
                    style={{ color: "rgb(var(--fg-muted))" }}
                  >
                    TX Hash
                  </label>
                  <input
                    type="text"
                    value={txHash}
                    onChange={(e) => {
                      // A queued re-check closes over the hash that was in the
                      // box when it was scheduled. If the customer edits it,
                      // that pending call would fire with the old value and
                      // overwrite their new result with a stale failure.
                      clearAutoRetry();
                      setTxHash(e.target.value);
                    }}
                    placeholder="0x..."
                    className="w-full px-4 py-3.5 rounded-xl text-text-primary text-xs font-mono focus:outline-none transition-all"
                    style={{
                      background: "rgb(var(--surface-secondary))",
                      border: "1px solid rgb(var(--line) / 0.08)",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "rgb(var(--accent) / 0.3)")}
                    onBlur={(e) => (e.target.style.borderColor = "rgb(var(--accent) / 0.08)")}
                  />
                </div>

                <button
                  onClick={() => handleVerify()}
                  disabled={verifying || !txHash.trim() || isExpired || !paymentId}
                  className="w-full py-4 rounded-xl text-sm font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden group"
                  style={{
                    background: "linear-gradient(135deg, rgb(var(--accent)), #a07c2e)",
                    color: "rgb(var(--accent-fg))",
                    boxShadow: "0 4px 24px rgb(var(--accent) / 0.15)",
                  }}
                >
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      background: "linear-gradient(135deg, rgb(var(--ink) / 0.1), transparent)",
                    }}
                  />
                  <span className="relative">
                    {verifying ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
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
                        Verifying on-chain...
                      </span>
                    ) : (
                      "Verify Payment"
                    )}
                  </span>
                </button>

                {/* Result inline */}
                {result && (
                  <div
                    className="rounded-xl p-4"
                    style={{
                      background:
                        result.status === "confirmed"
                          ? "rgb(var(--pos) / 0.06)"
                          : "rgb(var(--accent) / 0.06)",
                      border: `1px solid ${
                        result.status === "confirmed"
                          ? "rgb(var(--pos) / 0.25)"
                          : "rgb(var(--accent) / 0.3)"
                      }`,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                          background:
                            result.status === "confirmed"
                              ? "rgb(var(--pos) / 0.12)"
                              : "rgb(var(--accent) / 0.14)",
                        }}
                      >
                        <svg
                          className="w-4 h-4"
                          style={{
                            color:
                              result.status === "confirmed"
                                ? "rgb(var(--pos-text))"
                                : "rgb(var(--accent-text))",
                          }}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          {result.status === "confirmed" ? (
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          ) : (
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          )}
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4
                          className="text-sm font-bold mb-1"
                          style={{
                            color:
                              result.status === "confirmed"
                                ? "rgb(var(--pos-text))"
                                : "rgb(var(--accent-text))",
                          }}
                        >
                          {result.status === "confirmed"
                            ? "Payment confirmed!"
                            : "We're still looking for it"}
                        </h4>

                        {result.status === "confirmed" ? (
                          <p className="text-xs" style={{ color: "rgb(var(--fg-muted))" }}>
                            {`${result.subscription?.plan_label || planLabel} is now active. Redirecting…`}
                          </p>
                        ) : (
                          <div className="space-y-2.5">
                            <p
                              className="text-xs font-medium"
                              style={{ color: "rgb(var(--fg-secondary))" }}
                            >
                              Your funds are safe. We have saved your transaction hash
                              and nothing is lost.
                            </p>
                            <p className="text-xs" style={{ color: "rgb(var(--fg-muted))" }}>
                              There are three reasons this happens:
                            </p>
                            <ul
                              className="text-xs space-y-1.5 pl-4 list-disc"
                              style={{ color: "rgb(var(--fg-muted))" }}
                            >
                              <li>
                                <b style={{ color: "rgb(var(--fg-secondary))" }}>
                                  The network is still confirming.
                                </b>{" "}
                                Give it a few minutes and check again.
                              </li>
                              <li>
                                {/* This one is not the customer's fault and cannot be
                                    retried into working: some exchanges settle a
                                    withdrawal internally when the destination is one of
                                    their own addresses, so no chain transaction is ever
                                    created and no on-chain lookup can ever find it. */}
                                <b style={{ color: "rgb(var(--fg-secondary))" }}>
                                  You sent it from an exchange that settled it internally.
                                </b>{" "}
                                MEXC, Bybit and others do this when the destination is
                                one of their own addresses — the transfer never reaches
                                the blockchain, so no lookup can find it. Retrying will
                                not help; send us the withdrawal ID instead.
                              </li>
                              <li>
                                <b style={{ color: "rgb(var(--fg-secondary))" }}>
                                  It went to a different network or amount.
                                </b>{" "}
                                We only receive USDT on BNB Smart Chain (BEP-20).
                              </li>
                            </ul>

                            {result.retryable && (
                              <p
                                className="text-[11px] font-medium"
                                style={{ color: "rgb(var(--accent-text))" }}
                              >
                                We&rsquo;re checking again automatically over the next
                                minute — you can leave this page open.
                              </p>
                            )}

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setShowAdminModal(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
                                style={{
                                  background: "rgb(var(--accent))",
                                  color: "rgb(var(--accent-fg))",
                                }}
                              >
                                Send this to an admin
                              </button>
                              {result.can_retry && (
                                <span
                                  className="text-[11px]"
                                  style={{ color: "rgb(var(--fg-muted))" }}
                                >
                                  or paste the hash again in a few minutes
                                </span>
                              )}
                            </div>

                            {result.message && (
                              <p
                                className="text-[10.5px] pt-1"
                                style={{ color: "rgb(var(--fg-muted))" }}
                              >
                                Technical detail: {result.message}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
              {/* What happens after they press send — answered before they press
                  send, which is the only time it reassures anyone. */}
              <div
                className="mt-4 rounded-xl p-4"
                style={{
                  background: "rgb(var(--surface-secondary))",
                  border: "1px solid rgb(var(--line) / 0.06)",
                }}
              >
                <p
                  className="text-[10px] font-semibold uppercase tracking-wider mb-2.5"
                  style={{ color: "rgb(var(--fg-muted))" }}
                >
                  After you send
                </p>
                <ul className="space-y-2 text-[11.5px] leading-relaxed">
                  <li className="flex gap-2.5">
                    <span style={{ color: "rgb(var(--pos-text))" }}>&#10003;</span>
                    <span style={{ color: "rgb(var(--fg-muted))" }}>
                      Paste your transaction hash and we check it against the chain.
                      <span className="text-text-primary/90">
                        {" "}
                        Most payments confirm automatically in under a minute.
                      </span>
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <span style={{ color: "rgb(var(--pos-text))" }}>&#10003;</span>
                    <span style={{ color: "rgb(var(--fg-muted))" }}>
                      Access opens the moment it confirms — no waiting for a human.
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <span style={{ color: "rgb(var(--accent-text))" }}>&#8226;</span>
                    <span style={{ color: "rgb(var(--fg-muted))" }}>
                      If it does not confirm, your funds are safe and your hash is kept.
                      A real person will match it by hand —{" "}
                      <button
                        type="button"
                        onClick={() => setShowAdminModal(true)}
                        className="font-semibold underline underline-offset-2"
                        style={{ color: "rgb(var(--accent-text))" }}
                      >
                        message an admin
                      </button>
                      .
                    </span>
                  </li>
                </ul>
              </div>
          </div>
        </div>

        <SubscribeViaAdminModal
          isOpen={showAdminModal}
          onClose={() => setShowAdminModal(false)}
          plan={plan || invoice?.plan || { label: planLabel, price_usdt: amount }}
          paymentId={paymentId}
        />

        {/* Footer */}
        <div className="text-center space-y-2">
          <p className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
            Payment will be verified on-chain via BSCScan. Activation is instant.
          </p>
          <button
            onClick={() => navigate("/pricing")}
            className="text-xs transition-colors hover:text-text-primary"
            style={{ color: "rgb(var(--fg-muted))" }}
          >
            ← Back to pricing
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;
