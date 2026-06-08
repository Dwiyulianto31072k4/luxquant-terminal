import { useEffect, useState } from "react";
import {
  checkBinanceKeys,
  saveBinanceKeys,
} from "../../services/autotradeApi";

const INITIAL_FORM = {
  label: "",
  api_key: "",
  api_secret: "",
};

function SecretField({ label, value, onChange }) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 pr-10 text-sm text-white font-mono placeholder:text-text-muted/30 focus:outline-none focus:border-gold-primary/40"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-white"
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
        className="relative w-full max-w-[560px] overflow-hidden rounded-md border border-white/[0.08] bg-[#0a0805] shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/50 to-transparent" />

        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Connect Binance</h2>
            <p className="mt-0.5 text-[10px] font-mono text-text-muted/80">
              Uses `PUT /me/exchange-accounts/binance` then `/check`
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md border border-white/[0.06] bg-white/[0.02] text-text-muted hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-md border border-gold-primary/20 bg-gold-primary/[0.04] p-3">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gold-primary mb-1">
              Required permissions
            </p>
            <p className="text-sm text-gold-primary/80">
              Enable `Read` and `Trade` only. Do not enable withdrawals.
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted mb-1.5">
              Label
            </label>
            <input
              value={form.label}
              onChange={(event) =>
                setForm((current) => ({ ...current, label: event.target.value }))
              }
              placeholder="My Binance Account"
              className="w-full rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm text-white font-mono placeholder:text-text-muted/30 focus:outline-none focus:border-gold-primary/40"
            />
          </div>

          <SecretField
            label="API key"
            value={form.api_key}
            onChange={(value) =>
              setForm((current) => ({ ...current, api_key: value }))
            }
          />

          <SecretField
            label="API secret"
            value={form.api_secret}
            onChange={(value) =>
              setForm((current) => ({ ...current, api_secret: value }))
            }
          />

          {result && (
            <div
              className={`rounded-md border p-3 text-sm ${
                result.valid
                  ? "border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-400"
                  : "border-red-500/25 bg-red-500/[0.05] text-red-400"
              }`}
            >
              {result.valid
                ? "Binance keys validated successfully."
                : "Binance returned an invalid key response."}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-500/25 bg-red-500/[0.05] p-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-white/[0.06] p-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-md border border-white/[0.08] px-4 py-2.5 text-[11px] font-mono uppercase tracking-[0.2em] text-text-muted hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="flex-1 rounded-md px-4 py-2.5 text-[11px] font-mono uppercase tracking-[0.2em] text-black disabled:opacity-40"
            style={{
              background:
                "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
            }}
          >
            {saving ? "Saving..." : "Save & Validate"}
          </button>
        </div>
      </div>
    </div>
  );
}
