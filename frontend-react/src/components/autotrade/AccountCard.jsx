// src/components/autotrade/AccountCard.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade Account Card v2 (Flowscan reskin)
// Flat hairline, semantic colors, mono typography
// ════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import {
  fetchAccountBalance,
  testAccountConnection,
  deleteAccount,
  toggleConfig,
  getConfig,
} from "../../services/autotradeApi";

const EXCHANGE_BRANDING = {
  binance: {
    color: "#f3ba2f",
    logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/270.png",
  },
  bybit: {
    color: "rgb(var(--warn))",
    logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/521.png",
  },
  okx: {
    color: "rgb(var(--fg))",
    logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/294.png",
  },
  bitget: {
    color: "#00e8b5",
    logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/513.png",
  },
  mexc: {
    color: "rgb(var(--tg))",
    logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/544.png",
  },
};

const fmtUsd = (n) => {
  const v = Number(n || 0);
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
};

export default function AccountCard({ account, onDelete, onConfigure, onUpdate }) {
  const [config, setConfig] = useState(null);
  const [balance, setBalance] = useState(account.balance_cache);
  const [loading, setLoading] = useState({ balance: false, test: false, toggle: false });
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    getConfig(account.id)
      .then(setConfig)
      .catch(() => {});
  }, [account.id]);

  const handleRefreshBalance = async () => {
    setLoading((p) => ({ ...p, balance: true }));
    try {
      const r = await fetchAccountBalance(account.id);
      setBalance({ spot: r.spot, futures: r.futures });
      onUpdate?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading((p) => ({ ...p, balance: false }));
    }
  };

  const handleTest = async () => {
    setLoading((p) => ({ ...p, test: true }));
    try {
      const r = await testAccountConnection(account.id);
      setTestResult(r);
      setTimeout(() => setTestResult(null), 4000);
    } finally {
      setLoading((p) => ({ ...p, test: false }));
    }
  };

  const handleToggle = async () => {
    if (!config) return;
    setLoading((p) => ({ ...p, toggle: true }));
    try {
      const r = await toggleConfig(account.id, !config.enabled);
      setConfig(r);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading((p) => ({ ...p, toggle: false }));
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Disconnect ${account.exchange_id.toUpperCase()} (${account.label})?`)) return;
    try {
      await deleteAccount(account.id);
      onDelete?.(account.id);
    } catch (e) {
      alert(e.message);
    }
  };

  const totalBalance = (balance?.spot?.total_usd || 0) + (balance?.futures?.total_usd || 0);

  const isEnabled = config?.enabled;
  const brand = EXCHANGE_BRANDING[account.exchange_id] || {
    color: "rgb(var(--accent-text))",
    logo: null,
  };

  return (
    <div className="relative overflow-hidden bg-surface-raised border border-ink/[0.06] rounded-md hover:border-ink/[0.12] transition-all">
      {/* Top hairline accent */}

      <div className="relative p-5">
        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md flex items-center justify-center overflow-hidden p-1 border border-ink/[0.06] bg-ink/[0.02]">
              {brand.logo ? (
                <img
                  src={brand.logo}
                  alt={account.exchange_id}
                  className="w-full h-full object-contain"
                  loading="lazy"
                  onError={(e) => {
                    e.target.style.display = "none";
                  }}
                />
              ) : (
                <span
                  className="w-full h-full flex items-center justify-center font-mono font-bold text-xs"
                  style={{ color: brand.color }}
                >
                  {account.exchange_id.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-text-primary font-semibold text-sm capitalize">
                  {account.exchange_id}
                </h3>
                {account.is_testnet && (
                  <span className="text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border bg-red-500/10 text-loss border-red-500/25">
                    Testnet
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono text-text-muted mt-0.5">
                {account.label || "Unnamed"}
              </p>
            </div>
          </div>

          {/* ── Toggle (flat, monochrome) ── */}
          <button
            onClick={handleToggle}
            disabled={loading.toggle || !config}
            className={`relative w-10 h-5 rounded-full transition-colors border ${
              isEnabled ? "bg-accent/80 border-accent" : "bg-ink/[0.04] border-ink/[0.08]"
            } disabled:opacity-50`}
            title={isEnabled ? "Autotrade ON" : "Autotrade OFF"}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${
                isEnabled ? "translate-x-[20px] bg-surface-raised" : "translate-x-0.5 bg-ink/40"
              }`}
            />
          </button>
        </div>

        {/* ── Info grid (Mode · API Key · Status) ── */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-ink/[0.02] border border-ink/[0.04] rounded p-2.5">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-text-muted mb-1">
              Mode
            </p>
            <p className="text-text-primary font-mono text-xs capitalize tabular-nums">
              {account.trading_mode}
            </p>
          </div>
          <div className="bg-ink/[0.02] border border-ink/[0.04] rounded p-2.5">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-text-muted mb-1">
              API Key
            </p>
            <p className="text-text-primary font-mono text-[11px] tabular-nums truncate">
              {account.api_key_masked || "••••"}
            </p>
          </div>
          <div className="bg-ink/[0.02] border border-ink/[0.04] rounded p-2.5">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-text-muted mb-1">
              Status
            </p>
            <p className={`font-mono text-xs ${isEnabled ? "text-accent" : "text-text-muted"}`}>
              {isEnabled ? "Active" : "Paused"}
            </p>
          </div>
        </div>

        {/* ── Balance ── */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-text-muted">
              Balance
            </span>
            <button
              onClick={handleRefreshBalance}
              disabled={loading.balance}
              className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted hover:text-text-primary disabled:opacity-50 flex items-center gap-1 transition-colors"
            >
              <svg
                className={`w-3 h-3 ${loading.balance ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992m0 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
              Refresh
            </button>
          </div>

          <div className="relative overflow-hidden bg-ink/[0.02] border border-ink/[0.06] rounded p-3.5">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted mb-1.5">
              Total USD
            </p>
            <p className="text-2xl font-mono tabular-nums text-text-primary">
              {fmtUsd(totalBalance)}
            </p>

            <div className="flex gap-4 mt-2.5 text-[10px] font-mono">
              <div className="flex items-center gap-1.5">
                <span className="text-text-muted/70 uppercase tracking-wider">Spot</span>
                <span className="text-text-primary/80 tabular-nums">
                  {fmtUsd(balance?.spot?.total_usd || 0)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-text-muted/70 uppercase tracking-wider">Futures</span>
                <span className="text-text-primary/80 tabular-nums">
                  {fmtUsd(balance?.futures?.total_usd || 0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Test result (semantic 3-tier) ── */}
        {testResult && (
          <div
            className={`mb-3 rounded border text-[11px] font-mono p-2.5 ${
              testResult.success
                ? "bg-profit/[0.05] border-profit/25 text-profit"
                : "bg-red-500/[0.05] border-red-500/25 text-loss"
            }`}
          >
            {testResult.success
              ? `Connection OK · ${testResult.markets_loaded} markets`
              : `Failed: ${testResult.error}`}
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex gap-2">
          <button
            onClick={handleTest}
            disabled={loading.test}
            className="flex-1 px-3 py-2 rounded-md border border-ink/[0.08] text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted hover:text-text-primary hover:border-ink/[0.15] disabled:opacity-50 transition-all"
          >
            {loading.test ? "Testing…" : "Test"}
          </button>
          <button
            onClick={() => onConfigure?.(account)}
            className="flex-1 px-3 py-2 rounded-md border border-ink/12 text-[10px] font-mono uppercase tracking-[0.15em] text-accent hover:bg-accent/10 hover:border-ink/15 transition-all"
          >
            Configure
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-2 rounded-md border border-red-500/25 text-loss hover:bg-red-500/[0.08] hover:border-red-500/40 transition-all"
            title="Disconnect"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
