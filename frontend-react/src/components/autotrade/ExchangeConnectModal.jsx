// src/components/autotrade/ExchangeConnectModal.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — Connect Exchange Modal v2 (Flowscan reskin)
// Narrow (560px), vertical exchange list, step-by-step structure
// ════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import {
  listSupportedExchanges,
  createAccount,
  testAccountConnection,
} from "../../services/autotradeApi";

// ── Exchange branding (only color, no decorative bg/border noise) ──
const EXCHANGE_BRANDING = {
  binance: { color: "#f3ba2f", logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/270.png" },
  bybit:   { color: "#f7a600", logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/521.png" },
  okx:     { color: "#ffffff", logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/294.png" },
  bitget:  { color: "#00e8b5", logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/513.png" },
  mexc:    { color: "#1972e2", logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/544.png" },
};

const FALLBACK_EXCHANGES = [
  { id: "binance", name: "Binance", has_spot: true, has_futures: true, max_leverage: 125, needs_passphrase: false, native_trailing_futures: true, has_add_margin: true },
  { id: "bybit", name: "Bybit", has_spot: true, has_futures: true, max_leverage: 100, needs_passphrase: false, native_trailing_futures: true, has_add_margin: true },
  { id: "okx", name: "OKX", has_spot: true, has_futures: true, max_leverage: 125, needs_passphrase: true, native_trailing_futures: true, has_add_margin: true },
  { id: "bitget", name: "Bitget", has_spot: true, has_futures: true, max_leverage: 125, needs_passphrase: true, native_trailing_futures: true, has_add_margin: true },
  { id: "mexc", name: "MEXC", has_spot: true, has_futures: true, max_leverage: 200, needs_passphrase: false, native_trailing_futures: false, has_add_margin: false },
];


// ════════════════════════════════════════════════════════════════
// SECTION HEADER (small inline label)
// ════════════════════════════════════════════════════════════════
const SectionLabel = ({ children, step }) => (
  <div className="flex items-center gap-3 mb-3">
    <span className="h-px w-6 bg-gold-primary/40" />
    {step && (
      <>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-gold-primary/60">
          Step {step}
        </span>
        <span className="h-px w-3 bg-white/[0.08]" />
      </>
    )}
    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
      {children}
    </span>
    <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/20 to-transparent" />
  </div>
);


// ════════════════════════════════════════════════════════════════
// EYE ICON (show/hide password)
// ════════════════════════════════════════════════════════════════
const EyeIcon = ({ hidden }) =>
  hidden ? (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  ) : (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );


// ════════════════════════════════════════════════════════════════
// EXCHANGE ROW — vertical list (denser, more info)
// ════════════════════════════════════════════════════════════════
const ExchangeRow = ({ exchange, isSelected, onSelect }) => {
  const brand = EXCHANGE_BRANDING[exchange.id] || { color: "#d4a853", logo: null };

  return (
    <button
      onClick={() => onSelect(exchange.id)}
      className={`group relative w-full flex items-center gap-3 p-3 rounded-md border transition-all ${
        isSelected
          ? "bg-gold-primary/[0.05] border-gold-primary/30"
          : "bg-[#0a0805] border-white/[0.06] hover:border-white/[0.12]"
      }`}
    >
      {/* Top hairline for selected */}
      {isSelected && (
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/50 to-transparent" />
      )}

      {/* Logo */}
      <div className="shrink-0 w-9 h-9 rounded-md bg-white/[0.03] border border-white/[0.06] flex items-center justify-center overflow-hidden p-1">
        {brand.logo ? (
          <img
            src={brand.logo}
            alt={exchange.name}
            className="w-full h-full object-contain"
            loading="lazy"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <span
            className="w-full h-full flex items-center justify-center font-mono font-bold text-sm"
            style={{ color: brand.color }}
          >
            {exchange.name.slice(0, 1)}
          </span>
        )}
      </div>

      {/* Name + capabilities */}
      <div className="flex-1 min-w-0 text-left">
        <p className={`font-semibold text-sm font-mono ${isSelected ? "text-gold-primary" : "text-white"}`}>
          {exchange.name}
        </p>
        <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/70 mt-0.5">
          Max {exchange.max_leverage}× leverage
        </p>
      </div>

      {/* Capability badges */}
      <div className="shrink-0 flex items-center gap-1">
        {exchange.has_spot && (
          <span className="text-[8px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border bg-white/[0.04] border-white/[0.08] text-white/70">
            Spot
          </span>
        )}
        {exchange.has_futures && (
          <span className="text-[8px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border bg-white/[0.04] border-white/[0.08] text-white/70">
            Futures
          </span>
        )}
        {exchange.native_trailing_futures && (
          <span className="hidden sm:inline text-[8px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border bg-gold-primary/10 border-gold-primary/25 text-gold-primary">
            Trail
          </span>
        )}
      </div>

      {/* Selected check */}
      {isSelected && (
        <div className="shrink-0 w-4 h-4 rounded-full bg-gold-primary flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-[#0a0805]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
      )}
    </button>
  );
};


// ════════════════════════════════════════════════════════════════
// TRADING MODE BUTTON
// ════════════════════════════════════════════════════════════════
const ModeButton = ({ value, label, hint, isSelected, isDisabled, onClick }) => (
  <button
    type="button"
    onClick={() => !isDisabled && onClick(value)}
    disabled={isDisabled}
    className={`relative overflow-hidden p-3 rounded-md border text-left transition-all ${
      isDisabled
        ? "bg-white/[0.01] border-white/[0.04] opacity-30 cursor-not-allowed"
        : isSelected
        ? "bg-gold-primary/[0.06] border-gold-primary/30"
        : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]"
    }`}
  >
    {isSelected && (
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
    )}
    <p className={`font-mono text-xs font-semibold uppercase tracking-[0.1em] ${
      isSelected ? "text-gold-primary" : "text-white"
    }`}>
      {label}
    </p>
    <p className="text-[10px] font-mono text-text-muted/70 mt-0.5">{hint}</p>
  </button>
);


// ════════════════════════════════════════════════════════════════
// API INPUT (with eye toggle)
// ════════════════════════════════════════════════════════════════
const ApiInput = ({ label, value, onChange, placeholder, shown, onToggle }) => (
  <div>
    <label className="block text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted mb-1.5">
      {label}
    </label>
    <div className="relative">
      <input
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 pr-10 bg-white/[0.02] border border-white/[0.06] rounded-md text-sm text-white font-mono placeholder:text-text-muted/30 focus:outline-none focus:border-gold-primary/40 transition-colors"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors"
        tabIndex={-1}
      >
        <EyeIcon hidden={!shown} />
      </button>
    </div>
  </div>
);


// ════════════════════════════════════════════════════════════════
// MAIN MODAL
// ════════════════════════════════════════════════════════════════
export default function ExchangeConnectModal({ isOpen, onClose, onSuccess }) {
  const [step, setStep] = useState("form");
  const [exchanges, setExchanges] = useState(FALLBACK_EXCHANGES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const [form, setForm] = useState({
    exchange_id: "binance",
    label: "",
    trading_mode: "both",
    api_key: "",
    api_secret: "",
    passphrase: "",
    is_testnet: false,
    custom_base_url: "",
  });

  useEffect(() => {
    if (isOpen) {
      setExchanges(FALLBACK_EXCHANGES);
      listSupportedExchanges()
        .then((r) => {
          if (r.exchanges?.length) setExchanges(r.exchanges);
        })
        .catch(() => {});
      setStep("form");
      setError("");
      setTestResult(null);
      setForm({
        exchange_id: "binance",
        label: "",
        trading_mode: "both",
        api_key: "",
        api_secret: "",
        passphrase: "",
        is_testnet: false,
        custom_base_url: "",
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    if (isOpen) window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const selectedExchange = exchanges.find((e) => e.id === form.exchange_id);
  const needsPassphrase = selectedExchange?.needs_passphrase;

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.custom_base_url) delete payload.custom_base_url;
      if (!payload.passphrase) delete payload.passphrase;
      if (!payload.label) delete payload.label;

      const account = await createAccount(payload);
      setStep("testing");
      const test = await testAccountConnection(account.id);
      setTestResult(test);

      if (test.success) {
        setStep("success");
        setTimeout(() => {
          onSuccess?.(account);
          onClose();
        }, 1500);
      } else {
        setError(`Connection test failed: ${test.error}`);
        setStep("form");
      }
    } catch (e) {
      setError(e.message || "Failed to connect exchange");
      setStep("form");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = form.api_key && form.api_secret && (!needsPassphrase || form.passphrase);

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[560px] bg-[#0a0805] border border-white/[0.08] rounded-md overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)] max-h-[92vh] flex flex-col"
      >
        {/* Top hairline accent */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/50 to-transparent z-10" />

        {/* ── HEADER ── */}
        <div className="relative px-5 py-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white tracking-tight">
              Connect Exchange
            </h2>
            <p className="text-[10px] font-mono text-text-muted/80 mt-0.5">
              Trade-only API keys · secrets encrypted
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-md border border-white/[0.06] bg-white/[0.02] flex items-center justify-center text-text-muted hover:text-white hover:border-white/[0.15] transition-all font-mono text-sm"
          >
            ✕
          </button>
        </div>

        {/* ── BODY (scrollable) ── */}
        <div className="flex-1 overflow-y-auto">
          {/* TESTING STATE */}
          {step === "testing" && (
            <div className="flex flex-col items-center py-16 px-6">
              <div className="w-10 h-10 mb-4 border-2 border-gold-primary/20 border-t-gold-primary rounded-full animate-spin" />
              <p className="text-white text-sm font-medium mb-1">Testing connection…</p>
              <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted">
                Verifying credentials with {selectedExchange?.name}
              </p>
            </div>
          )}

          {/* SUCCESS STATE */}
          {step === "success" && (
            <div className="flex flex-col items-center py-16 px-6">
              <div className="w-12 h-12 mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-white text-sm font-medium mb-1">Connected successfully</p>
              {testResult?.markets_loaded > 0 && (
                <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted">
                  {testResult.markets_loaded} markets loaded
                </p>
              )}
            </div>
          )}

          {/* FORM STATE */}
          {step === "form" && (
            <div className="p-5 space-y-5">
              {/* ── Step 01: Exchange ── */}
              <div>
                <SectionLabel step="01">Select Exchange</SectionLabel>
                <div className="space-y-1.5">
                  {exchanges.map((ex) => (
                    <ExchangeRow
                      key={ex.id}
                      exchange={ex}
                      isSelected={form.exchange_id === ex.id}
                      onSelect={(id) => setForm({ ...form, exchange_id: id })}
                    />
                  ))}
                </div>
              </div>

              {/* ── Step 02: Mode ── */}
              <div>
                <SectionLabel step="02">Trading Mode</SectionLabel>
                <div className="grid grid-cols-3 gap-2">
                  <ModeButton
                    value="spot"
                    label="Spot"
                    hint="No leverage"
                    isSelected={form.trading_mode === "spot"}
                    isDisabled={!selectedExchange?.has_spot}
                    onClick={(v) => setForm({ ...form, trading_mode: v })}
                  />
                  <ModeButton
                    value="futures"
                    label="Futures"
                    hint="With leverage"
                    isSelected={form.trading_mode === "futures"}
                    isDisabled={!selectedExchange?.has_futures}
                    onClick={(v) => setForm({ ...form, trading_mode: v })}
                  />
                  <ModeButton
                    value="both"
                    label="Both"
                    hint="Spot + Futures"
                    isSelected={form.trading_mode === "both"}
                    isDisabled={false}
                    onClick={(v) => setForm({ ...form, trading_mode: v })}
                  />
                </div>
              </div>

              {/* ── Step 03: Credentials ── */}
              <div>
                <SectionLabel step="03">API Credentials</SectionLabel>
                <div className="space-y-3">
                  {/* Account label */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted mb-1.5">
                      Account Label <span className="text-text-muted/40 normal-case">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={form.label}
                      onChange={(e) => setForm({ ...form, label: e.target.value })}
                      placeholder={`My ${selectedExchange?.name || "Exchange"} Account`}
                      className="w-full px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-md text-sm text-white placeholder:text-text-muted/30 focus:outline-none focus:border-gold-primary/40 transition-colors font-mono"
                    />
                  </div>

                  <ApiInput
                    label="API Key"
                    value={form.api_key}
                    onChange={(v) => setForm({ ...form, api_key: v })}
                    placeholder="Paste API key here"
                    shown={showKey}
                    onToggle={() => setShowKey(!showKey)}
                  />

                  <ApiInput
                    label="API Secret"
                    value={form.api_secret}
                    onChange={(v) => setForm({ ...form, api_secret: v })}
                    placeholder="Paste API secret here"
                    shown={showSecret}
                    onToggle={() => setShowSecret(!showSecret)}
                  />

                  {needsPassphrase && (
                    <ApiInput
                      label={`Passphrase · required for ${selectedExchange?.name}`}
                      value={form.passphrase}
                      onChange={(v) => setForm({ ...form, passphrase: v })}
                      placeholder="API passphrase"
                      shown={showPass}
                      onToggle={() => setShowPass(!showPass)}
                    />
                  )}

                  {/* Testnet toggle */}
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-md bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-colors">
                    <input
                      type="checkbox"
                      checked={form.is_testnet}
                      onChange={(e) => setForm({ ...form, is_testnet: e.target.checked })}
                      className="w-3.5 h-3.5 accent-gold-primary"
                    />
                    <div className="flex-1">
                      <p className="text-[11px] font-mono uppercase tracking-[0.15em] text-white font-semibold">
                        Use Testnet
                      </p>
                      <p className="text-[10px] font-mono text-text-muted/70 mt-0.5">
                        Practice without real funds
                      </p>
                    </div>
                    {form.is_testnet && (
                      <span className="text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/25">
                        Testnet
                      </span>
                    )}
                  </label>
                </div>
              </div>

              {/* ── Security warning ── */}
              <div className="relative overflow-hidden bg-gold-primary/[0.04] border border-gold-primary/20 rounded-md p-3">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gold-primary/90 font-semibold mb-1.5">
                  Security
                </p>
                <p className="text-[11px] font-mono leading-relaxed text-gold-primary/80">
                  Enable only <span className="text-gold-primary font-bold">Read</span> + <span className="text-gold-primary font-bold">Trade</span> permissions.
                  Never allow <span className="text-red-400 font-bold">Withdraw</span> — LuxQuant doesn't need it
                  and it would be a security risk.
                </p>
              </div>

              {/* ── Error inline (above footer) ── */}
              {error && (
                <div className="relative overflow-hidden bg-red-500/[0.05] border border-red-500/25 rounded-md p-3">
                  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-red-400 font-semibold mb-1">
                    Connection Failed
                  </p>
                  <p className="text-[11px] font-mono text-red-400/90 leading-relaxed break-words">
                    {error}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── FOOTER (sticky) ── */}
        {step === "form" && (
          <div className="shrink-0 border-t border-white/[0.06] bg-[#0a0805] p-4 flex gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-md border border-white/[0.08] text-[11px] font-mono uppercase tracking-[0.2em] text-text-muted hover:text-white hover:border-white/[0.15] disabled:opacity-50 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !canSubmit}
              className="group flex-1 px-4 py-2.5 rounded-md font-mono text-[11px] uppercase tracking-[0.2em] transition-all disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_8px_24px_rgba(212,168,83,0.3)]"
              style={
                canSubmit && !loading
                  ? {
                      background: "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
                      color: "#0a0506",
                    }
                  : {
                      background: "rgba(255,255,255,0.04)",
                      color: "rgba(155,155,155,0.5)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }
              }
            >
              {loading ? "Connecting…" : (
                <span className="inline-flex items-center gap-2">
                  Connect &amp; Test
                  <span className="inline-block transition-transform group-enabled:group-hover:translate-x-0.5">→</span>
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
