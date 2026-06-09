// src/components/autotrade/ExchangeConnectModal.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade · Connect Binance modal
// Save + validate API keys. Logic/props unchanged; redesigned UI
// with a clear permission checklist and reassurance copy.
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { checkBinanceKeys, saveBinanceKeys } from "../../services/autotradeApi";
import { Notice, GoldButton, GhostButton } from "./AutoTradeUI";

const INITIAL_FORM = { label: "", api_key: "", api_secret: "" };

const PERMISSIONS = [
  { label: "Enable Reading", required: true },
  { label: "Enable Futures", required: true },
  { label: "Enable Spot & Margin Trading", required: false },
  { label: "Enable Withdrawals", required: false, forbidden: true },
];

function SecretField({ label, value, onChange, placeholder }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 pr-14 font-mono text-sm text-white placeholder:text-text-muted/30 focus:border-gold-primary/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-white"
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
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-md border border-white/[0.08] bg-[#0a0805] shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      >
        <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/50 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold-primary/80">
              Exchange
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Connect Binance
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.02] text-lg text-text-muted hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Permission checklist */}
          <div className="rounded-md border border-gold-primary/20 bg-gold-primary/[0.04] p-4">
            <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary">
              Required permissions
            </p>
            <ul className="space-y-1.5">
              {PERMISSIONS.map((perm) => (
                <li
                  key={perm.label}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className={
                      perm.forbidden ? "text-red-400" : "text-emerald-400"
                    }
                  >
                    {perm.forbidden ? "✕" : "✓"}
                  </span>
                  <span
                    className={
                      perm.forbidden
                        ? "text-red-400/80"
                        : "text-gold-primary/90"
                    }
                  >
                    {perm.label}
                    {perm.forbidden ? " — never enable this" : ""}
                    {!perm.required && !perm.forbidden ? " (optional)" : ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-gold-primary/70">
              If you restrict the key to trusted IPs, whitelist your AutoTrade
              server IP — otherwise Binance rejects every request.
            </p>
          </div>

          <Notice tone="info">
            Your keys are encrypted at rest and never leave the AutoTrade
            backend. Funds stay in your Binance account — withdrawal access is
            not requested.
          </Notice>

          {/* Form */}
          <div className="space-y-1.5">
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
              Label
            </label>
            <input
              value={form.label}
              onChange={(event) =>
                setForm((current) => ({ ...current, label: event.target.value }))
              }
              placeholder="My Binance Account"
              className="w-full rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm text-white placeholder:text-text-muted/30 focus:border-gold-primary/40 focus:outline-none"
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
                : "Keys saved, but Binance rejected the validation check. Verify permissions and IP whitelist."}
            </Notice>
          ) : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-white/[0.06] p-4">
          <GhostButton onClick={onClose} disabled={saving} className="flex-1">
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
  );
}
