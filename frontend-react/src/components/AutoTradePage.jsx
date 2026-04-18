// src/components/AutoTradePage.jsx
import { useState, useEffect } from "react";
import {
  listAccounts,
  listOrders,
  getEngineStatus,
} from "../services/autotradeApi";

import ExchangeConnectModal from "./autotrade/ExchangeConnectModal";
import AccountCard from "./autotrade/AccountCard";
import ConfigPanel from "./autotrade/ConfigPanel";
import PositionCard from "./autotrade/PositionCard";
import SignalsQueue from "./autotrade/SignalsQueue";
import PnLSummary from "./autotrade/PnLSummary";

const TABS = [
  { id: "accounts", label: "Accounts" },
  { id: "config", label: "Configure" },
  { id: "positions", label: "Positions" },
  { id: "queue", label: "Signals Queue" },
];

export default function AutoTradePage() {
  const [tab, setTab] = useState("accounts");
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const [configuring, setConfiguring] = useState(null); // account being configured
  const [positions, setPositions] = useState([]);
  const [engineStatus, setEngineStatus] = useState(null);

  // Load initial accounts
  const loadAccounts = async () => {
    try {
      const r = await listAccounts();
      setAccounts(r.accounts || []);
    } catch (e) {
      setError(e.message);
    }
  };

  const loadPositions = async () => {
    try {
      const r = await listOrders({ status: "filled", page_size: 50 });
      const r2 = await listOrders({ status: "partial", page_size: 50 });
      setPositions([...(r.orders || []), ...(r2.orders || [])]);
    } catch (e) {
      console.error(e);
    }
  };

  const loadEngineStatus = async () => {
    try {
      const r = await getEngineStatus();
      setEngineStatus(r);
    } catch {}
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadAccounts(), loadPositions(), loadEngineStatus()]);
      setLoading(false);
    })();
  }, []);

  // Refresh positions every 20s
  useEffect(() => {
    if (tab !== "positions") return;
    const t = setInterval(loadPositions, 20000);
    return () => clearInterval(t);
  }, [tab]);

  const handleConnect = async (account) => {
    await loadAccounts();
    setTab("accounts");
  };

  const handleDeleted = (id) => {
    setAccounts((acc) => acc.filter((a) => a.id !== id));
  };

  const handleConfigure = (account) => {
    setConfiguring(account);
    setTab("config");
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-6 rounded bg-gradient-to-b from-gold-light to-gold-dark" />
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-white">
              AutoTrade
            </h1>
            {engineStatus && (
              <span
                className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${
                  engineStatus.running
                    ? "bg-green-500/15 text-green-400 border border-green-500/20"
                    : "bg-red-500/15 text-red-400 border border-red-500/20"
                }`}
                title={`${engineStatus.enabled_configs} enabled · ${engineStatus.open_positions_monitored} monitored`}
              >
                {engineStatus.running ? "Engine ON" : "Engine OFF"}
              </span>
            )}
          </div>
          <p className="text-sm text-text-muted">
            {accounts.length} exchange{accounts.length === 1 ? "" : "s"} connected ·{" "}
            {positions.length} open position{positions.length === 1 ? "" : "s"}
          </p>
        </div>

        <button
          onClick={() => setShowConnect(true)}
          className="px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2"
          style={{
            background: "linear-gradient(to right, #d4a853, #8b6914)",
            color: "#0a0506",
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Connect Exchange
        </button>
      </div>

      {/* PnL Summary — always visible above tabs */}
      <PnLSummary />

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-bg-card/50 rounded-xl border border-white/5 w-fit overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              tab === t.id
                ? "bg-gold-primary/10 text-gold-primary border border-gold-primary/20"
                : "text-text-secondary hover:text-white border border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Tab content */}
      <div>
        {loading ? (
          <div className="text-center py-16">
            <div className="w-10 h-10 border-2 border-gold-primary/20 border-t-gold-primary rounded-full animate-spin mx-auto mb-3" />
            <p className="text-text-muted text-sm">Loading…</p>
          </div>
        ) : (
          <>
            {/* Accounts tab */}
            {tab === "accounts" && (
              <>
                {accounts.length === 0 ? (
                  <div className="text-center py-16 bg-bg-card rounded-2xl border border-white/5">
                    <div className="w-16 h-16 rounded-2xl bg-gold-primary/10 border border-gold-primary/20 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-display font-bold text-white mb-2">
                      No exchanges connected yet
                    </h3>
                    <p className="text-sm text-text-muted max-w-md mx-auto mb-5">
                      Connect your first exchange to start auto-trading signals. Use Trade-only API keys for security.
                    </p>
                    <button
                      onClick={() => setShowConnect(true)}
                      className="px-5 py-2.5 rounded-xl font-semibold text-sm"
                      style={{
                        background: "linear-gradient(to right, #d4a853, #8b6914)",
                        color: "#0a0506",
                      }}
                    >
                      Connect Exchange
                    </button>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {accounts.map((a) => (
                      <AccountCard
                        key={a.id}
                        account={a}
                        onDelete={handleDeleted}
                        onConfigure={handleConfigure}
                        onUpdate={loadAccounts}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Config tab */}
            {tab === "config" && (
              <>
                {!configuring ? (
                  <div className="bg-bg-card border border-white/5 rounded-2xl p-6">
                    {accounts.length === 0 ? (
                      <p className="text-text-muted text-center">
                        Connect an exchange first to configure autotrade settings.
                      </p>
                    ) : (
                      <div>
                        <p className="text-sm text-text-secondary mb-3">
                          Select an account to configure:
                        </p>
                        <div className="grid md:grid-cols-2 gap-3">
                          {accounts.map((a) => (
                            <button
                              key={a.id}
                              onClick={() => setConfiguring(a)}
                              className="bg-white/[0.02] border border-white/5 hover:border-gold-primary/30 rounded-xl p-3 text-left transition-all"
                            >
                              <p className="text-white font-semibold capitalize">
                                {a.exchange_id} · {a.label}
                              </p>
                              <p className="text-xs text-text-muted mt-1 capitalize">
                                {a.trading_mode} · {a.is_testnet ? "Testnet" : "Live"}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <ConfigPanel
                    account={configuring}
                    onClose={() => setConfiguring(null)}
                  />
                )}
              </>
            )}

            {/* Positions tab */}
            {tab === "positions" && (
              <>
                {positions.length === 0 ? (
                  <div className="text-center py-16 bg-bg-card rounded-2xl border border-white/5">
                    <p className="text-text-muted text-sm">No open positions</p>
                    <p className="text-xs text-text-muted/70 mt-1">
                      Positions will appear here when autotrade executes signals.
                    </p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {positions.map((p) => (
                      <PositionCard
                        key={p.id}
                        order={p}
                        onClosed={() => loadPositions()}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Signals queue tab */}
            {tab === "queue" && <SignalsQueue />}
          </>
        )}
      </div>

      {/* Modal */}
      <ExchangeConnectModal
        isOpen={showConnect}
        onClose={() => setShowConnect(false)}
        onSuccess={handleConnect}
      />
    </div>
  );
}
