// src/components/subscription/PaymentPage.jsx
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import subscriptionApi from "../../services/subscriptionApi";
import SubscribeViaAdminModal from "./SubscribeViaAdminModal";

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
const SectionLabel = ({ label, accent = "#d4a853" }) => (
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
      background: "rgba(15,8,10,0.6)",
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
  const { refreshUser } = useAuth();
  const { invoice, plan } = location.state || {};

  const [txHash, setTxHash] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(null);
  const [timeLeft, setTimeLeft] = useState("");
  const [showAdminModal, setShowAdminModal] = useState(false);

  const walletAddress =
    invoice?.wallet_to || invoice?.payment?.wallet_to || "";
  const amount = invoice?.amount_usdt || invoice?.payment?.amount_usdt || "";
  const expiresAt = invoice?.expires_at || invoice?.payment?.expires_at || "";
  const paymentId = invoice?.payment?.id || invoice?.id || null;
  const planLabel =
    plan?.label ||
    invoice?.plan?.label ||
    invoice?.plan?.name ||
    "Subscription";

  useEffect(() => {
    if (!invoice) navigate("/pricing");
  }, [invoice, navigate]);

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
      setTimeLeft(`${hours}h  ${minutes}m  ${seconds}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, t]);

  const handleCopy = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(String(text));
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleVerify = async () => {
    if (!txHash.trim() || !paymentId) return;
    setVerifying(true);
    setResult(null);

    try {
      const res = await subscriptionApi.verifyPayment(paymentId, txHash.trim());
      setResult(res);

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
        message:
          err.response?.data?.detail || "Verification failed, please try again",
      });
    } finally {
      setVerifying(false);
    }
  };

  const isExpired = timeLeft === t("payment.expired");

  if (!invoice) return null;

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
            background:
              "radial-gradient(ellipse, rgba(212,168,83,0.04) 0%, transparent 70%)",
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
                style={{ background: isExpired ? "#f87171" : "#d4a853" }}
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
              <span style={{ color: "rgb(var(--accent))" }}>{planLabel}</span>
              <span className="mx-2" style={{ color: "rgb(var(--fg-muted))" }}>·</span>
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
                background: isExpired
                  ? "rgba(239,68,68,0.06)"
                  : "rgba(212,168,83,0.06)",
                border: `1px solid ${isExpired ? "rgba(239,68,68,0.2)" : "rgba(212,168,83,0.15)"}`,
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
              <span
                className="text-xs font-semibold"
                style={{ color: "rgb(var(--accent))" }}
              >
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
              className={`text-lg sm:text-xl font-mono font-bold tracking-wider ${isExpired ? "text-red-400" : ""}`}
              style={!isExpired ? { color: "rgb(var(--accent))" } : {}}
            >
              {timeLeft || t("payment.calculating")}
            </div>
            <div className="text-[10px] mt-1" style={{ color: "rgb(var(--fg-muted))" }}>
              24h payment window
            </div>
          </StatCard>
        </div>

        {/* ════════════════════════════════════════════════
            MAIN GRID — 2 col on desktop, stacked mobile
            ════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
          {/* ═══ LEFT: Transfer Details ═══ */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "rgba(15,8,10,0.6)",
              border: "1px solid rgb(var(--line) / 0.08)",
            }}
          >
            <div
              className="h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(212,168,83,0.2), transparent)",
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
                  background: "rgba(10,5,6,0.6)",
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
                      background: "rgba(212,168,83,0.08)",
                      color: "rgb(var(--accent))",
                      border: "1px solid rgb(var(--line) / 0.15)",
                    }}
                  >
                    {copied === "wallet"
                      ? t("payment.copied")
                      : t("payment.copy")}
                  </button>
                </div>
                <p className="text-sm font-mono text-text-primary/90 break-all leading-relaxed select-all">
                  {walletAddress || "—"}
                </p>
              </div>

              {/* Amount mirror */}
              <div
                className="rounded-xl p-4 mb-3"
                style={{
                  background: "rgba(10,5,6,0.6)",
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
                        style={{ color: "rgb(var(--accent))" }}
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
                      background: "rgba(212,168,83,0.08)",
                      color: "rgb(var(--accent))",
                      border: "1px solid rgb(var(--line) / 0.15)",
                    }}
                  >
                    {copied === "amount"
                      ? t("payment.copied")
                      : t("payment.copy")}
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
                  style={{ color: "rgb(var(--accent))" }}
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
                  Sending other tokens or using other networks (ERC-20, TRC-20)
                  will result in permanent loss of funds.
                </p>
              </div>
            </div>
          </div>

          {/* ═══ RIGHT: Submit Transaction ═══ */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "rgba(15,8,10,0.6)",
              border: "1px solid rgb(var(--line) / 0.08)",
            }}
          >
            <div
              className="h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(212,168,83,0.2), transparent)",
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
                  After completing the transfer, paste your transaction hash
                  below to verify and activate your subscription.
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
                    onChange={(e) => setTxHash(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-4 py-3.5 rounded-xl text-text-primary text-xs font-mono focus:outline-none transition-all"
                    style={{
                      background: "rgba(10,5,6,0.6)",
                      border: "1px solid rgb(var(--line) / 0.08)",
                    }}
                    onFocus={(e) =>
                      (e.target.style.borderColor = "rgba(212,168,83,0.3)")
                    }
                    onBlur={(e) =>
                      (e.target.style.borderColor = "rgba(212,168,83,0.08)")
                    }
                  />
                </div>

                <button
                  onClick={handleVerify}
                  disabled={
                    verifying || !txHash.trim() || isExpired || !paymentId
                  }
                  className="w-full py-4 rounded-xl text-sm font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden group"
                  style={{
                    background: "linear-gradient(135deg, #d4a853, #a07c2e)",
                    color: "rgb(var(--surface))",
                    boxShadow: "0 4px 24px rgba(212,168,83,0.15)",
                  }}
                >
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      background:
                        "linear-gradient(135deg, rgb(var(--ink) / 0.1), transparent)",
                    }}
                  />
                  <span className="relative">
                    {verifying ? (
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
                          ? "rgba(34,197,94,0.04)"
                          : "rgba(239,68,68,0.04)",
                      border: `1px solid ${
                        result.status === "confirmed"
                          ? "rgba(34,197,94,0.2)"
                          : "rgba(239,68,68,0.2)"
                      }`,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                          background:
                            result.status === "confirmed"
                              ? "rgba(34,197,94,0.1)"
                              : "rgba(239,68,68,0.1)",
                        }}
                      >
                        <svg
                          className="w-4 h-4"
                          style={{
                            color:
                              result.status === "confirmed"
                                ? "#22c55e"
                                : "#f87171",
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
                              d="M6 18L18 6M6 6l12 12"
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
                                ? "#22c55e"
                                : "#f87171",
                          }}
                        >
                          {result.status === "confirmed"
                            ? "Payment confirmed!"
                            : "Verification failed"}
                        </h4>
                        <p className="text-xs" style={{ color: "rgb(var(--fg-muted))" }}>
                          {result.status === "confirmed"
                            ? `${result.subscription?.plan_label || planLabel} is now active. Redirecting…`
                            : result.message}
                        </p>
                        {result.can_retry && (
                          <p
                            className="text-[10px] mt-2"
                            style={{ color: "rgb(var(--fg-muted))" }}
                          >
                            You can submit a new TX hash to retry.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════
            ALTERNATIVE: Subscribe via Admin
            ════════════════════════════════════════════════ */}
        <div
          className="rounded-2xl overflow-hidden mb-6"
          style={{
            background: "rgba(212,168,83,0.03)",
            border: "1px solid rgb(var(--line) / 0.1)",
          }}
        >
          <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(212,168,83,0.1)" }}
              >
                <svg
                  className="w-5 h-5"
                  style={{ color: "rgb(var(--accent))" }}
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-text-primary mb-1">
                  Prefer manual assistance?
                </h4>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "rgb(var(--fg-muted))" }}
                >
                  Contact our admin via Telegram for bank transfer, manual
                  payment, or any payment-related questions.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowAdminModal(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.02] flex-shrink-0"
              style={{
                background: "rgba(212,168,83,0.08)",
                border: "1px solid rgb(var(--line) / 0.25)",
                color: "rgb(var(--accent))",
              }}
            >
              Subscribe via Admin
            </button>
          </div>
        </div>

        {/* Modal */}
        <SubscribeViaAdminModal
          isOpen={showAdminModal}
          onClose={() => setShowAdminModal(false)}
          plan={
            plan || invoice?.plan || { label: planLabel, price_usdt: amount }
          }
          paymentId={paymentId}
        />

        {/* Footer */}
        <div className="text-center space-y-2">
          <p className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
            Payment will be verified on-chain via BSCScan. Activation is
            instant.
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
