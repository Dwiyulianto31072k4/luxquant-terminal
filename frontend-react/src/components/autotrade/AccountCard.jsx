// src/components/autotrade/AccountCard.jsx
import { useState, useEffect } from "react";
import {
  fetchAccountBalance,
  testAccountConnection,
  deleteAccount,
  toggleConfig,
  getConfig,
} from "../../services/autotradeApi";

const EXCHANGE_BRANDING = {
  binance: { color: "#f3ba2f", logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/270.png" },
  bybit:   { color: "#f7a600", logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/521.png" },
  okx:     { color: "#ffffff", logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/294.png" },
  bitget:  { color: "#00e8b5", logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/513.png" },
  mexc:    { color: "#1972e2", logo: "https://s2.coinmarketcap.com/static/img/exchanges/64x64/544.png" },
};

export default function AccountCard({ account, onDelete, onConfigure, onUpdate }) {
  const [config, setConfig] = useState(null);
  const [balance, setBalance] = useState(account.balance_cache);
  const [loading, setLoading] = useState({ balance: false, test: false, toggle: false });
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    getConfig(account.id).then(setConfig).catch(() => {});
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

  const totalBalance =
    (balance?.spot?.total_usd || 0) + (balance?.futures?.total_usd || 0);

  const isEnabled = config?.enabled;
  const brand = EXCHANGE_BRANDING[account.exchange_id] || { color: "#d4a853", logo: null };
  const exchangeColor = brand.color;

  return (
    <div className="bg-bg-card border border-white/5 rounded-2xl p-5 hover:border-gold-primary/20 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden p-1"
            style={{
              background: `${exchangeColor}15`,
              border: `1px solid ${exchangeColor}30`,
            }}
          >
            {brand.logo ? (
              <img
                src={brand.logo}
                alt={account.exchange_id}
                className="w-full h-full object-contain"
                loading="lazy"
                onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
              />
            ) : null}
            <span
              className="w-full h-full items-center justify-center font-bold text-sm"
              style={{
                color: exchangeColor,
                display: brand.logo ? "none" : "flex",
              }}
            >
              {account.exchange_id.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-white font-semibold capitalize">{account.exchange_id}</h3>
              {account.is_testnet && (
                <span className="text-[9px] font-bold bg-orange-500/15 text-orange-400 px-1.5 py-0.5 rounded">
                  TESTNET
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted">{account.label || "Unnamed"}</p>
          </div>
        </div>

        {/* Auto toggle */}
        <button
          onClick={handleToggle}
          disabled={loading.toggle || !config}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            isEnabled ? "bg-green-500" : "bg-white/10"
          }`}
          title={isEnabled ? "Autotrade is ON" : "Autotrade is OFF"}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              isEnabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Trading mode + API info */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-xs">
        <div className="bg-white/[0.02] rounded-lg p-2">
          <p className="text-text-muted mb-0.5">Mode</p>
          <p className="text-white font-medium capitalize">{account.trading_mode}</p>
        </div>
        <div className="bg-white/[0.02] rounded-lg p-2">
          <p className="text-text-muted mb-0.5">API Key</p>
          <p className="text-white font-mono text-[11px]">{account.api_key_masked || "••••"}</p>
        </div>
        <div className="bg-white/[0.02] rounded-lg p-2">
          <p className="text-text-muted mb-0.5">Autotrade</p>
          <p className={`font-medium ${isEnabled ? "text-green-400" : "text-text-secondary"}`}>
            {isEnabled ? "Active" : "Paused"}
          </p>
        </div>
      </div>

      {/* Balance */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Balance</p>
          <button
            onClick={handleRefreshBalance}
            disabled={loading.balance}
            className="text-xs text-gold-primary hover:text-gold-light disabled:opacity-50 flex items-center gap-1"
          >
            <svg
              className={`w-3.5 h-3.5 ${loading.balance ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992m0 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Refresh
          </button>
        </div>
        <div className="bg-gradient-to-br from-white/[0.04] to-white/[0.02] rounded-xl p-3 border border-white/5">
          <p className="text-xs text-text-muted mb-1">Total USD</p>
          <p className="text-2xl font-display font-bold text-white">
            ${totalBalance.toFixed(2)}
          </p>
          <div className="flex gap-3 mt-2 text-[11px]">
            {balance?.spot && (
              <div>
                <span className="text-text-muted">Spot: </span>
                <span className="text-text-secondary">${balance.spot.total_usd?.toFixed(2) || "0.00"}</span>
              </div>
            )}
            {balance?.futures && (
              <div>
                <span className="text-text-muted">Futures: </span>
                <span className="text-text-secondary">${balance.futures.total_usd?.toFixed(2) || "0.00"}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`mb-3 rounded-lg p-2 border text-xs ${
            testResult.success
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {testResult.success
            ? `✓ Connection OK — ${testResult.markets_loaded} markets`
            : `✗ ${testResult.error}`}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleTest}
          disabled={loading.test}
          className="flex-1 px-3 py-2 rounded-lg border border-white/10 text-xs font-semibold text-text-secondary hover:bg-white/5 disabled:opacity-50"
        >
          {loading.test ? "Testing…" : "Test"}
        </button>
        <button
          onClick={() => onConfigure?.(account)}
          className="flex-1 px-3 py-2 rounded-lg border border-gold-primary/20 text-xs font-semibold text-gold-primary hover:bg-gold-primary/10"
        >
          Configure
        </button>
        <button
          onClick={handleDelete}
          className="px-3 py-2 rounded-lg border border-red-500/20 text-xs font-semibold text-red-400 hover:bg-red-500/10"
          title="Disconnect"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      </div>
    </div>
  );
}
