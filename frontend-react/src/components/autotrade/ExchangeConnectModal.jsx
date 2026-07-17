// src/components/autotrade/ExchangeConnectModal.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade · Connect Binance modal
// Two-pane premium layout: left = guidance (permissions + IP + safety),
// right = key form. Stacks to one column on mobile, scroll-safe with
// navbar/tab-bar clearance. Logic/props unchanged.
//
// FIX (mobile "messy top" bug): the modal previously rendered as a
// regular child inside the page tree. If any ancestor (app shell /
// layout / sticky header) creates its own stacking context, a fixed
// z-[100000] element is only stacked *within that context* — not
// above the whole document. That let the real app navbar show through
// undimmed above the modal card. Rendering through a portal straight
// into document.body guarantees the backdrop always sits above every
// other element, including the navbar, on every device.
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { checkBinanceKeys, saveBinanceKeys } from "../../services/autotradeApi";
import { Notice, GoldButton, GhostButton } from "./AutoTradeUI";
import { BinanceIcon } from "./BrandIcons";

const INITIAL_FORM = { label: "", api_key: "", api_secret: "" };

// AutoTrade execution server. Whitelist this on the Binance API key when the
// key is IP-restricted, otherwise Binance rejects every spot/futures order.
const AUTOTRADE_SERVER_IP = "187.127.135.84";

const PERMISSIONS = [
  { label: "Enable Reading", state: "yes" },
  { label: "Enable Futures", state: "yes" },
  { label: "Enable Spot & Margin Trading", state: "optional" },
  { label: "Enable Withdrawals", state: "no" },
];

function PermIcon({ state }) {
  if (state === "no") {
    return (
      <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#F6465D]/12 text-[10px] text-[#F6465D]">
        ✕
      </span>
    );
  }
  return (
    <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#0ECB81]/12 text-[10px] text-[#0ECB81]">
      ✓
    </span>
  );
}

function ServerIpBlock() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(AUTOTRADE_SERVER_IP);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — user can copy manually */
    }
  };

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-accent/25 bg-accent/[0.08] px-3.5 py-3">
      <div className="min-w-0">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-accent">
          AutoTrade server IP
        </p>
        <p className="mt-0.5 select-all font-mono text-sm font-semibold tracking-wide text-text-primary">
          {AUTOTRADE_SERVER_IP}
        </p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="flex-shrink-0 rounded-md bg-accent px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-fg transition-opacity hover:opacity-90"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function SecretField({ label, value, onChange, placeholder }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-text-secondary">
        {label}
      </label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-ink/[0.12] bg-surface-secondary px-3.5 py-2.5 pr-14 font-mono text-sm font-medium text-text-primary placeholder:text-text-muted/40 transition-colors focus:border-ink/25 focus:outline-none focus:ring-2 focus:ring-ink/[0.06]"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold uppercase tracking-wide text-text-muted transition-colors hover:text-text-primary"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

export default function ExchangeConnectModal({ isOpen, onClose, onSuccess }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setForm(INITIAL_FORM);
    setSaving(false);
    setError("");
    setResult(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  // Lock background scroll while the modal is open so the page behind it
  // (navbar included) can't visibly scroll/shift under the backdrop.
  useEffect(() => {
    if (!isOpen) return undefined;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit = form.api_key.trim() && form.api_secret.trim();

  const handleSubmit = async () => {
    setSaving(true);
    setError("");
    setResult(null);
    try {
      await saveBinanceKeys({
        api_key: form.api_key.trim(),
        api_secret: form.api_secret.trim(),
        label: form.label.trim() || undefined,
      });
      const check = await checkBinanceKeys();
      setResult(check);
      if (!check.valid) {
        const hints = Array.isArray(check.hints) ? check.hints.filter(Boolean) : [];
        const serverIp = check.server_ip || AUTOTRADE_SERVER_IP;
        const detail =
          check.message ||
          hints.join(" ") ||
          "Saved keys, but Binance validation failed.";
        throw new Error(
          `${detail}${
            detail.toLowerCase().includes("ip")
              ? ""
              : ` Whitelist server IP ${serverIp} if the key is IP-restricted.`
          }`,
        );
      }
      onSuccess?.();
      setTimeout(() => onClose(), 900);
    } catch (err) {
      setError(err.message || "Failed to save Binance credentials");
    } finally {
      setSaving(false);
    }
  };

  const modal = (
    <div className="fixed inset-0 z-[100000] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-scrim/70 backdrop-blur-[2px]" onClick={onClose} />
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative z-10 flex max-h-[min(92dvh,100%)] w-full max-w-[840px] flex-col overflow-hidden rounded-t-2xl border border-ink/[0.1] bg-surface-raised shadow-2xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 justify-center pb-0 pt-2.5 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-ink/20" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="relative w-full">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-lg border border-ink/[0.08] bg-surface-secondary text-text-muted transition-colors hover:border-ink/15 hover:text-text-primary"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="grid lg:grid-cols-[0.95fr_1.05fr]">
            {/* LEFT: guidance */}
            <div className="border-b border-ink/[0.08] bg-surface-secondary/50 p-6 lg:border-b-0 lg:border-r lg:p-8">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                Exchange
              </p>
              <div className="mt-3 flex items-center gap-3 pr-10">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent ring-1 ring-accent/20">
                  <BinanceIcon className="h-6 w-6" />
                </span>
                <h2 className="text-[22px] font-semibold tracking-tight text-text-primary">
                  Connect Binance
                </h2>
              </div>
              <p className="mt-2.5 text-[13px] leading-6 text-text-secondary">
                Link your account with API keys. Funds stay on Binance —
                withdrawal access is never requested.
              </p>

              <div className="mt-7">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Required permissions
                </p>
                <ul className="mt-3 space-y-2.5">
                  {PERMISSIONS.map((perm) => (
                    <li key={perm.label} className="flex items-start gap-2.5">
                      <PermIcon state={perm.state} />
                      <span
                        className={`text-[13px] font-medium leading-5 ${
                          perm.state === "no"
                            ? "text-[#F6465D]"
                            : "text-text-primary"
                        }`}
                      >
                        {perm.label}
                        {perm.state === "optional" ? (
                          <span className="font-normal text-text-muted"> · optional</span>
                        ) : null}
                        {perm.state === "no" ? (
                          <span className="font-normal text-[#F6465D]/80"> · never enable</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-7 border-t border-ink/[0.08] pt-5">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  IP access restriction
                </p>
                <p className="mt-2 text-xs leading-5 text-text-secondary">
                  To enable spot &amp; futures trading on an IP-restricted key,
                  add the AutoTrade server IP below to your Binance API key.
                  Without it, Binance rejects every order.
                </p>
                <ServerIpBlock />
                <p className="mt-3 text-xs leading-5 text-text-muted">
                  Keys are encrypted at rest and never leave the AutoTrade
                  backend.
                </p>
              </div>
            </div>

            {/* RIGHT: form */}
            <div className="p-6 lg:p-8">
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-text-secondary">
                    Label
                  </label>
                  <input
                    value={form.label}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                    placeholder="My Binance Account"
                    className="w-full rounded-lg border border-ink/[0.12] bg-surface-secondary px-3.5 py-2.5 text-sm font-medium text-text-primary placeholder:text-text-muted/40 transition-colors focus:border-ink/25 focus:outline-none focus:ring-2 focus:ring-ink/[0.06]"
                  />
                </div>

                <SecretField
                  label="API key"
                  value={form.api_key}
                  placeholder="Paste your Binance API key"
                  onChange={(value) =>
                    setForm((current) => ({ ...current, api_key: value }))
                  }
                />
                <SecretField
                  label="API secret"
                  value={form.api_secret}
                  placeholder="Paste your Binance API secret"
                  onChange={(value) =>
                    setForm((current) => ({ ...current, api_secret: value }))
                  }
                />

                {result ? (
                  <Notice tone={result.valid ? "success" : "error"}>
                    {result.valid
                      ? "Binance keys validated successfully."
                      : "Keys saved, but Binance rejected validation. Check permissions and IP whitelist."}
                  </Notice>
                ) : null}
                {error ? <Notice tone="error">{error}</Notice> : null}
              </div>

              <div className="mt-8 flex gap-3">
                <GhostButton
                  onClick={onClose}
                  disabled={saving}
                  className="flex-1"
                >
                  Cancel
                </GhostButton>
                <GoldButton
                  onClick={handleSubmit}
                  disabled={!canSubmit || saving}
                  className="flex-1"
                >
                  {saving ? "Saving…" : "Save & Validate"}
                </GoldButton>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}