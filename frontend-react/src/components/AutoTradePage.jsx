// src/components/AutoTradePage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — AutoTrade Page v2 (Flowscan reskin)
// Container: header + engine status + PnL summary + tabs + content
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from "react";
import {
  listAccounts,
  listOrders,
  getEngineStatus,
} from "../services/autotradeApi";
import { useAuth } from "../context/AuthContext";

import ExchangeConnectModal from "./autotrade/ExchangeConnectModal";
import AccountCard from "./autotrade/AccountCard";
import AccountsOverview from "./autotrade/AccountsOverview";
import ConfigurationStudio from "./autotrade/ConfigurationStudio";
import PositionsBoard from "./autotrade/PositionsBoard";
import SignalsQueue from "./autotrade/SignalsQueue";
import PnLSummary from "./autotrade/PnLSummary";

const BOT_IP = "20.187.145.75";

const TABS = [
  { id: "accounts", label: "Accounts" },
  { id: "config", label: "Configure" },
  { id: "positions", label: "Positions" },
  { id: "queue", label: "Trade History" },
];

// ════════════════════════════════════════════════════════════════
// SECTION HEADER
// ════════════════════════════════════════════════════════════════
const SectionHeader = ({ label, small = false }) => (
  <div className="flex items-center gap-3">
    <span className="h-px w-8 bg-gold-primary/40" />
    <span
      className={`font-mono uppercase tracking-[0.25em] text-gold-primary/80 ${
        small ? "text-[10px]" : "text-[11px]"
      }`}
    >
      {label}
    </span>
    <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/20 to-transparent" />
  </div>
);

// ════════════════════════════════════════════════════════════════
// ENGINE STATUS STRIP
// ════════════════════════════════════════════════════════════════
const EngineStatusStrip = ({ engineStatus }) => {
  if (!engineStatus) return null;
  const running = engineStatus.running;

  return (
    <div
      className={`relative overflow-hidden rounded-md border ${
        running
          ? "bg-emerald-500/[0.04] border-emerald-500/20"
          : "bg-red-500/[0.04] border-red-500/20"
      }`}
    >
      <div
        className={`absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent ${
          running ? "via-emerald-500/40" : "via-red-500/40"
        } to-transparent`}
      />
      <div className="relative px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              running ? "bg-emerald-400 animate-pulse" : "bg-red-400"
            }`}
          />
          <span
            className={`font-mono text-[11px] uppercase tracking-[0.2em] font-semibold ${
              running ? "text-emerald-400" : "text-red-400"
            }`}
          >
            Engine {running ? "Active" : "Stopped"}
          </span>
        </div>

        <Divider />

        <StatusItem
          label="Enabled"
          value={engineStatus.enabled_configs ?? 0}
          unit="config"
        />
        <StatusItem
          label="Monitored"
          value={engineStatus.open_positions_monitored ?? 0}
          unit="position"
        />
      </div>
    </div>
  );
};

const Divider = () => (
  <span className="hidden sm:inline h-3 w-px bg-white/[0.08]" />
);

const StatusItem = ({ label, value, unit }) => (
  <div className="flex items-center gap-2 font-mono text-[11px]">
    <span className="text-text-muted/70 uppercase tracking-[0.15em] text-[10px]">
      {label}
    </span>
    <span className="text-white tabular-nums font-semibold">{value}</span>
    {unit && (
      <span className="text-text-muted/60 lowercase">
        {unit}
        {value === 1 ? "" : "s"}
      </span>
    )}
  </div>
);

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function AutoTradePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("accounts");
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [positions, setPositions] = useState([]);
  const [engineStatus, setEngineStatus] = useState(null);

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

  useEffect(() => {
    if (tab !== "positions") return;
    const t = setInterval(loadPositions, 20000);
    return () => clearInterval(t);
  }, [tab]);

  const handleConnect = async () => {
    await loadAccounts();
    setTab("accounts");
  };

  const handleDeleted = (id) => {
    setAccounts((acc) => acc.filter((a) => a.id !== id));
  };

  const handleConfigure = (account) => {
    setSelectedAccountId(account.id);
    setTab("config");
  };

  const userLabel = useMemo(() => {
    return (
      user?.name ||
      user?.full_name ||
      user?.username ||
      user?.email ||
      "Guest user"
    );
  }, [user]);

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-6">
      {/* ── Section Header ── */}
      <SectionHeader label="AutoTrade" />

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
            AutoTrade
          </h1>
          <p className="text-text-muted text-sm mt-1.5 font-mono">
            {accounts.length} exchange{accounts.length === 1 ? "" : "s"}{" "}
            connected
            <span className="text-text-muted/40"> · </span>
            {positions.length} open position{positions.length === 1 ? "" : "s"}
          </p>
        </div>

        <button
          onClick={() => setShowConnect(true)}
          className="group inline-flex items-center gap-2 px-4 py-2 rounded-md font-mono text-[11px] uppercase tracking-[0.2em] text-black transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(212,168,83,0.3)]"
          style={{
            background:
              "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
          }}
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          Connect Exchange
        </button>
      </div>

      {/* ── Engine Status Strip ── */}
      <EngineStatusStrip engineStatus={engineStatus} />

      {/* ── PnL Summary (4 stat cards) ── */}
      <PnLSummary />

      {/* ── Tabs (flat hairline) ── */}
      <div className="flex items-center gap-1 border-b border-white/[0.06]">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-4 py-2.5 text-[11px] font-mono uppercase tracking-[0.15em] transition-colors ${
                active
                  ? "text-gold-primary"
                  : "text-text-muted hover:text-white"
              }`}
            >
              {t.label}
              {active && (
                <span className="absolute bottom-0 inset-x-2 h-px bg-gold-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Error message ── */}
      {error && (
        <div className="relative overflow-hidden bg-red-500/[0.05] border border-red-500/25 rounded-md p-3">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
          <p className="text-[11px] font-mono text-red-400">{error}</p>
        </div>
      )}

      {/* ── Tab Content ── */}
      <div className="pt-2">
        {loading ? (
          <LoadingState />
        ) : (
          <>
            {/* ── Accounts tab ── */}
            {tab === "accounts" && (
              <div className="space-y-5">
                <AccountsOverview
                  userLabel={userLabel}
                  botIp={BOT_IP}
                  onConnect={() => setShowConnect(true)}
                />
              </div>
            )}

            {/* ── Config tab ── */}
            {tab === "config" && (
              <ConfigurationStudio
                accounts={accounts}
                selectedAccountId={selectedAccountId}
                onSelectAccount={setSelectedAccountId}
              />
            )}

            {/* ── Positions tab ── */}
            {tab === "positions" && (
              <PositionsBoard
                positions={positions}
                loading={loading}
                onClosed={loadPositions}
                onRefresh={loadPositions}
              />
            )}

            {/* ── Signals queue tab ── */}
            {tab === "queue" && <SignalsQueue />}
          </>
        )}
      </div>

      {/* ── Modal ── */}
      <ExchangeConnectModal
        isOpen={showConnect}
        onClose={() => setShowConnect(false)}
        onSuccess={handleConnect}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// LOADING / EMPTY STATES
// ════════════════════════════════════════════════════════════════
const LoadingState = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
    {[...Array(3)].map((_, i) => (
      <div
        key={i}
        className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md p-5"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/20 to-transparent" />
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-md bg-white/[0.04] animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-white/[0.05] rounded w-1/2 animate-pulse" />
            <div className="h-2.5 bg-white/[0.03] rounded w-3/4 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[...Array(3)].map((_, j) => (
            <div key={j} className="bg-white/[0.02] rounded p-2.5 space-y-1.5">
              <div className="h-2 bg-white/[0.04] rounded w-2/3 animate-pulse" />
              <div className="h-3 bg-white/[0.06] rounded w-3/4 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="h-20 bg-white/[0.02] rounded animate-pulse mb-3" />
        <div className="flex gap-2">
          <div className="h-8 flex-1 bg-white/[0.03] rounded animate-pulse" />
          <div className="h-8 flex-1 bg-white/[0.03] rounded animate-pulse" />
          <div className="h-8 w-10 bg-white/[0.03] rounded animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyAccountsState = ({ onConnect }) => (
  <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md p-12 text-center">
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <div className="w-14 h-14 mx-auto mb-4 rounded-md border border-gold-primary/20 flex items-center justify-center">
      <svg
        className="w-6 h-6 text-gold-primary/60"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
        />
      </svg>
    </div>
    <p className="text-white text-base font-medium mb-1.5">
      No exchanges connected
    </p>
    <p className="text-text-muted text-xs font-mono uppercase tracking-[0.15em] mb-5 max-w-md mx-auto leading-relaxed">
      Connect your first exchange to start auto-trading signals · Use Trade-only
      API keys for security
    </p>
    <button
      onClick={onConnect}
      className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-mono text-[11px] uppercase tracking-[0.2em] text-black transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(212,168,83,0.3)]"
      style={{
        background:
          "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
      }}
    >
      Connect Exchange
      <span className="inline-block transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </button>
  </div>
);

const EmptyPositionsState = () => (
  <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md p-12 text-center">
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <p className="text-white text-sm font-medium mb-1">No open positions</p>
    <p className="text-text-muted text-[10px] font-mono uppercase tracking-[0.2em]">
      Positions will appear here when autotrade executes signals
    </p>
  </div>
);
