// src/components/autotrade/ExchangeConnectModal.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade · Connect Binance modal
// Two-pane premium layout: left = guidance (permissions + safety),
// right = key form. Stacks to one column on mobile, scroll-safe with
// navbar/tab-bar clearance. Logic/props unchanged.
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { checkBinanceKeys, saveBinanceKeys } from "../../services/autotradeApi";
import { Notice, GoldButton, GhostButton } from "./AutoTradeUI";
import { BinanceIcon } from "./BrandIcons";

const INITIAL_FORM = { label: "", api_key: "", api_secret: "" };

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

function SecretField({ label, value, onChange, placeholder }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-text-secondary">
        {label}
      </label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 pr-14 font-mono text-sm text-white placeholder:text-text-muted/30 transition-colors focus:border-gold-primary/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium uppercase tracking-wide text-text-muted transition-colors hover:text-white"
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
        throw new Error("Saved keys, but Binance validation failed.");
      }
      onSuccess?.();
      setTimeout(() => onClose(), 900);
    } catch (err) {
      setError(err.message || "Failed to save Binance credentials");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] overflow-y-auto overscroll-contain">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        onClick={onClose}
        className="relative flex min-h-full items-start justify-center px-4 pt-20 pb-28 sm:items-center sm:py-10"
      >
        <div
          onClick={(event) => event.stopPropagation()}
          className="relative w-full max-w-[820px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0805] shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
        >
          {/* Close */}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="grid lg:grid-cols-[0.92fr_1.08fr]">
            {/* LEFT: guidance */}
            <div className="border-b border-white/[0.06] p-6 lg:border-b-0 lg:border-r lg:p-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-gold-primary/80">
                Exchange
              </p>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F3BA2F]/10 text-[#F3BA2F]">
                  <BinanceIcon className="h-6 w-6" />
                </span>
                <h2 className="text-2xl font-semibold tracking-tight text-white">
                  Connect Binance
                </h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-text-muted">
                Link your account with API keys. Funds stay on Binance —
                withdrawal access is never requested.
              </p>

              <div className="mt-7">
                <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted/70">
                  Required permissions
                </p>
                <ul className="mt-3 space-y-2.5">
                  {PERMISSIONS.map((perm) => (
                    <li key={perm.label} className="flex items-start gap-2.5">
                      <PermIcon state={perm.state} />
                      <span
                        className={`text-sm leading-5 ${
                          perm.state === "no"
                            ? "text-[#F6465D]/90"
                            : "text-text-secondary"
                        }`}
                      >
                        {perm.label}
                        {perm.state === "optional" ? (
                          <span className="text-text-muted/60"> · optional</span>
                        ) : null}
                        {perm.state === "no" ? (
                          <span className="text-[#F6465D]/60"> · never enable</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-7 space-y-3 border-t border-white/[0.06] pt-5">
                <p className="text-xs leading-5 text-text-muted">
                  Keys are encrypted at rest and never leave the AutoTrade
                  backend.
                </p>
                <p className="text-xs leading-5 text-text-muted">
                  If you restrict the key to trusted IPs, whitelist your
                  AutoTrade server IP — otherwise Binance rejects every request.
                </p>
              </div>
            </div>

            {/* RIGHT: form */}
            <div className="p-6 lg:p-8">
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-text-secondary">
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
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-sm text-white placeholder:text-text-muted/30 transition-colors focus:border-gold-primary/40 focus:outline-none"
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

              <div className="mt-7 flex gap-3">
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
  );
}
