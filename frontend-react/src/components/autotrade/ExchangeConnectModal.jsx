// src/components/autotrade/ExchangeConnectModal.jsx
import { useState, useEffect } from "react";
import {
  listSupportedExchanges,
  createAccount,
  testAccountConnection,
} from "../../services/autotradeApi";

// Icons
const IconKey = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
  </svg>
);
const IconX = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const IconShield = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
  </svg>
);

// Exchange branding — real logos via CDN + brand color for accents
const EXCHANGE_BRANDING = {
  binance: {
    color: "#f3ba2f",
    bg: "rgba(243,186,47,0.1)",
    border: "rgba(243,186,47,0.3)",
    logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/270.png",
  },
  bybit: {
    color: "#f7a600",
    bg: "rgba(247,166,0,0.1)",
    border: "rgba(247,166,0,0.3)",
    logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/521.png",
  },
  okx: {
    color: "#ffffff",
    bg: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.18)",
    logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/294.png",
  },
  bitget: {
    color: "#00e8b5",
    bg: "rgba(0,232,181,0.1)",
    border: "rgba(0,232,181,0.3)",
    logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/513.png",
  },
  mexc: {
    color: "#1972e2",
    bg: "rgba(25,114,226,0.1)",
    border: "rgba(25,114,226,0.3)",
    logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/544.png",
  },
};

// Fallback when backend /exchanges is unreachable
const FALLBACK_EXCHANGES = [
  { id: "binance", name: "Binance", has_spot: true, has_futures: true, max_leverage: 125, needs_passphrase: false, native_trailing_futures: true, has_add_margin: true },
  { id: "bybit", name: "Bybit", has_spot: true, has_futures: true, max_leverage: 100, needs_passphrase: false, native_trailing_futures: true, has_add_margin: true },
  { id: "okx", name: "OKX", has_spot: true, has_futures: true, max_leverage: 125, needs_passphrase: true, native_trailing_futures: true, has_add_margin: true },
  { id: "bitget", name: "Bitget", has_spot: true, has_futures: true, max_leverage: 125, needs_passphrase: true, native_trailing_futures: true, has_add_margin: true },
  { id: "mexc", name: "MEXC", has_spot: true, has_futures: true, max_leverage: 200, needs_passphrase: false, native_trailing_futures: false, has_add_margin: false },
];

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

  if (!isOpen) return null;

  const selectedExchange = exchanges.find((e) => e.id === form.exchange_id);
  const needsPassphrase = selectedExchange?.needs_passphrase;
  const branding = EXCHANGE_BRANDING[form.exchange_id] || EXCHANGE_BRANDING.binance;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div
        className="relative max-w-2xl w-full max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl"
        style={{
          background: "linear-gradient(145deg, #0d0a10 0%, #14101a 100%)",
          border: "1px solid rgba(212,168,83,0.15)",
        }}
      >
        {/* Top glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-1 rounded-full blur-xl opacity-60 pointer-events-none"
          style={{ background: branding.color }}
        />

        {/* Header */}
        <div className="relative flex items-center justify-between p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, rgba(212,168,83,0.15), rgba(139,105,20,0.05))",
                border: "1px solid rgba(212,168,83,0.25)",
                color: "#d4a853",
              }}
            >
              <IconKey />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold text-white">Connect Exchange</h2>
              <p className="text-xs text-text-muted mt-0.5">
                Trade-only API keys. Your secrets are encrypted.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-white hover:bg-white/5 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {step === "testing" && (
            <div className="flex flex-col items-center py-12">
              <div className="relative w-16 h-16 mb-4">
                <div className="absolute inset-0 rounded-full blur-xl opacity-60 animate-pulse" style={{ background: branding.color }} />
                <div className="relative w-16 h-16 border-[3px] border-gold-primary/20 border-t-gold-primary rounded-full animate-spin" />
              </div>
              <p className="text-white font-semibold">Testing connection…</p>
              <p className="text-xs text-text-muted mt-1">
                Verifying API credentials with {selectedExchange?.name}
              </p>
            </div>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center py-12">
              <div className="relative w-16 h-16 mb-4">
                <div className="absolute inset-0 rounded-full bg-green-500/30 blur-xl" />
                <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white shadow-lg shadow-green-500/30">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
              </div>
              <p className="text-white font-semibold text-lg">Connected!</p>
              {testResult?.usdt_free !== undefined && testResult.usdt_free >= 0 && (
                <p className="text-xs text-text-muted mt-1">
                  USDT available: ${testResult.usdt_free.toFixed(2)}
                </p>
              )}
              {testResult?.markets_loaded > 0 && (
                <p className="text-[11px] text-text-muted mt-0.5">
                  {testResult.markets_loaded} markets loaded
                </p>
              )}
            </div>
          )}

          {step === "form" && (
            <>
              {/* Exchange picker — premium card grid */}
              <div>
                <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-3">
                  Select Exchange
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {exchanges.map((ex) => {
                    const brand = EXCHANGE_BRANDING[ex.id] || EXCHANGE_BRANDING.binance;
                    const isSelected = form.exchange_id === ex.id;
                    return (
                      <button
                        key={ex.id}
                        onClick={() => setForm({ ...form, exchange_id: ex.id })}
                        className="group relative p-3 rounded-xl transition-all duration-200"
                        style={{
                          background: isSelected ? brand.bg : "rgba(255,255,255,0.02)",
                          border: `1px solid ${isSelected ? brand.border : "rgba(255,255,255,0.05)"}`,
                          transform: isSelected ? "translateY(-2px)" : "none",
                          boxShadow: isSelected ? `0 8px 24px ${brand.bg}` : "none",
                        }}
                      >
                        <div className="flex flex-col items-center gap-1.5">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden p-1"
                            style={{
                              background: brand.bg,
                              border: `1px solid ${brand.border}`,
                            }}
                          >
                            {brand.logo ? (
                              <img
                                src={brand.logo}
                                alt={ex.name}
                                className="w-full h-full object-contain"
                                loading="lazy"
                                onError={(e) => {
                                  e.target.style.display = "none";
                                  e.target.nextSibling.style.display = "flex";
                                }}
                              />
                            ) : null}
                            <span
                              className="w-full h-full flex items-center justify-center text-base font-black"
                              style={{
                                color: brand.color,
                                display: brand.logo ? "none" : "flex",
                              }}
                            >
                              {ex.name.slice(0, 1)}
                            </span>
                          </div>
                          <span
                            className="text-[11px] font-bold"
                            style={{ color: isSelected ? brand.color : "#9ca3af" }}
                          >
                            {ex.name}
                          </span>
                          {isSelected && (
                            <div
                              className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                              style={{ background: brand.color, color: "#0a0506" }}
                            >
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedExchange && (
                  <div
                    className="mt-3 p-3 rounded-xl text-xs flex items-center justify-between flex-wrap gap-2"
                    style={{ background: branding.bg, border: `1px solid ${branding.border}` }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold" style={{ color: branding.color }}>
                        {selectedExchange.name}
                      </span>
                      <span className="text-text-muted">·</span>
                      <span className="text-text-secondary">
                        Max {selectedExchange.max_leverage}x leverage
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {selectedExchange.has_spot && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white">SPOT</span>
                      )}
                      {selectedExchange.has_futures && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-white">FUTURES</span>
                      )}
                      {selectedExchange.native_trailing_futures && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gold-primary/15 text-gold-primary">
                          NATIVE TRAIL
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Label */}
              <div>
                <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">
                  Account Label{" "}
                  <span className="text-text-muted/50 normal-case font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder={`My ${selectedExchange?.name || "Exchange"} Account`}
                  className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/5 rounded-xl text-sm text-white placeholder:text-text-muted/40 focus:outline-none focus:border-gold-primary/30 transition-colors"
                />
              </div>

              {/* Trading mode */}
              <div>
                <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">
                  Trading Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      v: "spot",
                      label: "Spot",
                      hint: "No leverage",
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                        </svg>
                      ),
                    },
                    {
                      v: "futures",
                      label: "Futures",
                      hint: "Leverage",
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                        </svg>
                      ),
                    },
                    {
                      v: "both",
                      label: "Both",
                      hint: "Spot + Futures",
                      icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                        </svg>
                      ),
                    },
                  ].map((opt) => {
                    const disabled =
                      (opt.v === "spot" && !selectedExchange?.has_spot) ||
                      (opt.v === "futures" && !selectedExchange?.has_futures);
                    const isSelected = form.trading_mode === opt.v;
                    return (
                      <button
                        key={opt.v}
                        disabled={disabled}
                        onClick={() => setForm({ ...form, trading_mode: opt.v })}
                        className="p-3 rounded-xl text-left transition-all"
                        style={{
                          background: isSelected ? "rgba(212,168,83,0.1)" : "rgba(255,255,255,0.02)",
                          border: `1px solid ${isSelected ? "rgba(212,168,83,0.4)" : "rgba(255,255,255,0.05)"}`,
                          opacity: disabled ? 0.35 : 1,
                          cursor: disabled ? "not-allowed" : "pointer",
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span style={{ color: isSelected ? "#d4a853" : "#9ca3af" }}>{opt.icon}</span>
                          <p className="text-sm font-bold" style={{ color: isSelected ? "#d4a853" : "#ffffff" }}>
                            {opt.label}
                          </p>
                        </div>
                        <p className="text-[10px] text-text-muted">{opt.hint}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Credentials */}
              <div className="space-y-3">
                {/* API Key */}
                <div>
                  <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      value={form.api_key}
                      onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                      placeholder="Paste your API key"
                      className="w-full px-4 py-2.5 pr-11 bg-white/[0.03] border border-white/5 rounded-xl text-sm text-white font-mono placeholder:text-text-muted/40 focus:outline-none focus:border-gold-primary/30 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white"
                    >
                      {showKey ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* API Secret */}
                <div>
                  <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">
                    API Secret
                  </label>
                  <div className="relative">
                    <input
                      type={showSecret ? "text" : "password"}
                      value={form.api_secret}
                      onChange={(e) => setForm({ ...form, api_secret: e.target.value })}
                      placeholder="••••••••••••••••"
                      className="w-full px-4 py-2.5 pr-11 bg-white/[0.03] border border-white/5 rounded-xl text-sm text-white font-mono placeholder:text-text-muted/40 focus:outline-none focus:border-gold-primary/30 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white"
                    >
                      {showSecret ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Passphrase (OKX/Bitget only) */}
                {needsPassphrase && (
                  <div
                    className="rounded-xl p-3"
                    style={{ background: branding.bg, border: `1px solid ${branding.border}` }}
                  >
                    <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: branding.color }}>
                      <IconShield />
                      Passphrase required for {selectedExchange?.name}
                    </label>
                    <div className="relative">
                      <input
                        type={showPass ? "text" : "password"}
                        value={form.passphrase}
                        onChange={(e) => setForm({ ...form, passphrase: e.target.value })}
                        placeholder="API passphrase"
                        className="w-full px-4 py-2.5 pr-11 bg-black/30 border border-white/10 rounded-lg text-sm text-white font-mono placeholder:text-text-muted/40 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white text-sm"
                      >
                        {showPass ? "🙈" : "👁"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Testnet toggle */}
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
                <input
                  type="checkbox"
                  checked={form.is_testnet}
                  onChange={(e) => setForm({ ...form, is_testnet: e.target.checked })}
                  className="w-4 h-4 accent-gold-primary"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Use Testnet</p>
                  <p className="text-xs text-text-muted">Practice without real funds</p>
                </div>
                {form.is_testnet && (
                  <span className="text-[9px] font-bold bg-orange-500/15 text-orange-400 px-2 py-0.5 rounded">
                    TESTNET
                  </span>
                )}
              </label>

              {/* Permissions warning */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: "linear-gradient(135deg, rgba(234,179,8,0.1), rgba(234,179,8,0.05))",
                  border: "1px solid rgba(234,179,8,0.25)",
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="text-yellow-400 mt-0.5 shrink-0">
                    <IconShield />
                  </div>
                  <div className="text-xs leading-relaxed">
                    <p className="text-yellow-400 font-bold mb-1">API Permissions</p>
                    <p className="text-yellow-400/80">
                      Only enable <b>Read</b> + <b>Trade</b> on your exchange. <b>Never</b> allow{" "}
                      <b>Withdraw</b> — LuxQuant doesn't need it and it would be a security risk.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
                  <div className="text-red-400 mt-0.5 shrink-0">
                    <IconX />
                  </div>
                  <p className="text-xs text-red-400 leading-relaxed">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {step === "form" && (
          <div className="flex gap-2 p-5 border-t border-white/5 bg-black/20">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-text-secondary hover:bg-white/5 font-semibold text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !canSubmit}
              className="flex-1 px-4 py-3 rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              style={{
                background: canSubmit
                  ? "linear-gradient(to right, #d4a853, #b8891f)"
                  : "rgba(255,255,255,0.05)",
                color: canSubmit ? "#0a0506" : "#6b7280",
                boxShadow: canSubmit ? "0 8px 24px rgba(212,168,83,0.25)" : "none",
              }}
            >
              {loading ? "Connecting…" : "Connect & Test"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
