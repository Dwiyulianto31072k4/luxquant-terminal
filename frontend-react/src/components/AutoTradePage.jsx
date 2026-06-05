import { useEffect, useMemo, useState } from "react";
import {
  getExecutions,
  getHealth,
  getMe,
  getPortfolio,
  getSignals,
  getStrategyConfigs,
} from "../services/autotradeApi";
import { useAuth } from "../context/AuthContext";

import ExchangeConnectModal from "./autotrade/ExchangeConnectModal";
import AccountsOverview from "./autotrade/AccountsOverview";
import ConfigurationStudio from "./autotrade/ConfigurationStudio";
import PositionsBoard from "./autotrade/PositionsBoard";
import SignalsQueue from "./autotrade/SignalsQueue";
import PnLSummary from "./autotrade/PnLSummary";

const TABS = [
  { id: "accounts", label: "Accounts" },
  { id: "config", label: "Configure" },
  { id: "positions", label: "Positions" },
  { id: "history", label: "Executions" },
];

function SectionHeader({ label }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px w-8 bg-gold-primary/40" />
      <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-gold-primary/80">
        {label}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/20 to-transparent" />
    </div>
  );
}

function EngineStatusStrip({ health, config }) {
  if (!health) return null;

  const active = Boolean(config?.is_active);

  return (
    <div
      className={`rounded-md border px-4 py-3 ${
        active
          ? "border-emerald-500/20 bg-emerald-500/[0.04]"
          : "border-gold-primary/20 bg-gold-primary/[0.04]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono uppercase tracking-[0.15em]">
        <span className={active ? "text-emerald-400" : "text-gold-primary"}>
          Strategy {active ? "Active" : "Paused"}
        </span>
        <span className="text-text-muted">Mode {health.trading_mode || "—"}</span>
        <span className="text-text-muted">
          Binance {health.binance_environment || "—"}
        </span>
        <span className="text-text-muted">
          Market {health.market_data_market || "—"}
        </span>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="rounded-md border border-white/[0.06] bg-[#0a0805] p-5"
        >
          <div className="h-3 w-24 animate-pulse rounded bg-white/[0.05]" />
          <div className="mt-4 h-8 w-2/3 animate-pulse rounded bg-white/[0.06]" />
          <div className="mt-3 h-16 animate-pulse rounded bg-white/[0.03]" />
        </div>
      ))}
    </div>
  );
}

export default function AutoTradePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("accounts");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const [health, setHealth] = useState(null);
  const [meData, setMeData] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [signalsById, setSignalsById] = useState({});
  const [strategyConfig, setStrategyConfig] = useState(null);

  const load = async () => {
    setError("");
    setLoading(true);

    try {
      const [healthResponse, meResponse, portfolioResponse, strategyResponse, executionsResponse, signalsResponse] =
        await Promise.all([
          getHealth(),
          getMe(),
          getPortfolio(),
          getStrategyConfigs(),
          getExecutions(),
          getSignals(),
        ]);

      setHealth(healthResponse);
      setMeData(meResponse);
      setPortfolio(portfolioResponse);
      setStrategyConfig(strategyResponse?.items?.[0] || null);
      setExecutions(executionsResponse?.items || []);
      setSignalsById(
        Object.fromEntries(
          (signalsResponse?.items || []).map((signal) => [signal.id, signal]),
        ),
      );
    } catch (err) {
      setError(err.message || "Failed to load AutoTrade data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const exchangeAccounts = meData?.exchange_accounts || [];
  const currentUser = meData?.user || user;

  const summaryText = useMemo(() => {
    const totalAccounts = exchangeAccounts.length;
    const totalExecutions = executions.length;
    return `${totalAccounts} exchange${totalAccounts === 1 ? "" : "s"} connected • ${totalExecutions} execution jobs`;
  }, [exchangeAccounts.length, executions.length]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8">
      <SectionHeader label="AutoTrade" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            AutoTrade
          </h1>
          <p className="mt-1.5 text-sm font-mono text-text-muted">{summaryText}</p>
        </div>

        <button
          onClick={() => setShowConnect(true)}
          className="rounded-md px-4 py-2 text-[11px] font-mono uppercase tracking-[0.2em] text-black"
          style={{
            background:
              "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
          }}
        >
          Connect Binance
        </button>
      </div>

      <EngineStatusStrip health={health} config={strategyConfig} />

      <PnLSummary portfolio={portfolio} executions={executions} />

      <div className="flex items-center gap-1 border-b border-white/[0.06]">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`relative px-4 py-2.5 text-[11px] font-mono uppercase tracking-[0.15em] ${
                active ? "text-gold-primary" : "text-text-muted hover:text-white"
              }`}
            >
              {item.label}
              {active ? (
                <span className="absolute inset-x-2 bottom-0 h-px bg-gold-primary" />
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/25 bg-red-500/[0.05] p-3 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="pt-2">
          {tab === "accounts" ? (
            <AccountsOverview
              user={currentUser}
              health={health}
              exchangeAccounts={exchangeAccounts}
              portfolio={portfolio}
              onConnect={() => setShowConnect(true)}
            />
          ) : null}

          {tab === "config" ? (
            <ConfigurationStudio
              config={strategyConfig}
              hasConnectedAccount={exchangeAccounts.length > 0}
              onSaved={load}
            />
          ) : null}

          {tab === "positions" ? <PositionsBoard portfolio={portfolio} /> : null}

          {tab === "history" ? (
            <SignalsQueue
              executions={executions}
              signalsById={signalsById}
              onRetried={load}
            />
          ) : null}
        </div>
      )}

      <ExchangeConnectModal
        isOpen={showConnect}
        onClose={() => setShowConnect(false)}
        onSuccess={load}
      />
    </div>
  );
}
