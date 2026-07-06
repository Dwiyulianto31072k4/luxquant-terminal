import { useEffect, useState } from "react";
import { getExecutions, getMe, getPortfolio } from "../services/autotradeApi";
import AssistantWidget from "./assistant/AssistantWidget";

function fmtUsd(value) {
  return Number(value || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-white/5 bg-bg-card p-4">
      <p className="mb-2 text-xs uppercase tracking-wider text-text-muted">{label}</p>
      <p className="text-2xl font-display font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-text-muted">{hint}</p>
    </div>
  );
}

export default function PortfolioPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [portfolio, setPortfolio] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const [portfolioResponse, executionsResponse, meResponse] = await Promise.all([
          getPortfolio(),
          getExecutions(),
          getMe(),
        ]);

        setPortfolio(portfolioResponse);
        setExecutions(executionsResponse?.items || []);
        setAccounts(meResponse?.exchange_accounts || []);
      } catch (err) {
        setError(err.message || "Failed to load portfolio");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-gold-primary/20 border-t-gold-primary" />
        <p className="text-sm text-text-muted">Loading portfolio...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-500/25 bg-red-500/[0.05] p-4 text-sm text-red-400">
        {error}
      </div>
    );
  }

  const spotValue = Number(portfolio?.spot?.portfolio_usdt || 0);
  const futuresValue = Number(portfolio?.futures?.portfolio_usdt || 0);
  const available =
    Number(portfolio?.spot?.available_usdt || 0) +
    Number(portfolio?.futures?.available_usdt || 0);
  const openFutures = portfolio?.futures?.positions?.length || 0;

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 flex items-center gap-3">
          <div className="h-6 w-1 rounded bg-gradient-to-b from-gold-light to-gold-dark" />
          <h1 className="text-2xl font-display font-bold text-white lg:text-3xl">
            Portfolio
          </h1>
        </div>
        <p className="text-sm text-text-muted">
          Documented API view across {accounts.length} linked exchange account
          {accounts.length === 1 ? "" : "s"}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Spot Value"
          value={fmtUsd(spotValue)}
          hint="Spot portfolio value"
        />
        <StatCard
          label="Futures Value"
          value={fmtUsd(futuresValue)}
          hint={`${openFutures} open positions`}
        />
        <StatCard
          label="Available"
          value={fmtUsd(available)}
          hint="Available USDT"
        />
        <StatCard
          label="Executions"
          value={String(executions.length)}
          hint="Recent execution jobs"
        />
      </div>

      <div className="rounded-2xl border border-white/5 bg-bg-card p-5">
        <h2 className="mb-3 text-base font-display font-bold text-white">
          Futures positions
        </h2>
        {(portfolio?.futures?.positions || []).length === 0 ? (
          <p className="text-sm text-text-muted">No open futures positions.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-text-muted/80">
                <tr>
                  {["Symbol", "Size", "Entry", "PnL", "Leverage", "Margin"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-[0.18em]"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {portfolio.futures.positions.map((position) => (
                  <tr key={position.symbol} className="border-t border-white/5">
                    <td className="px-3 py-2 font-mono text-white">{position.symbol}</td>
                    <td className="px-3 py-2 font-mono text-white">{position.positionAmt}</td>
                    <td className="px-3 py-2 font-mono text-white">{position.entryPrice}</td>
                    <td
                      className={`px-3 py-2 font-mono ${
                        Number(position.unrealizedProfit || 0) >= 0
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                    >
                      {position.unrealizedProfit}
                    </td>
                    <td className="px-3 py-2 font-mono text-white">{position.leverage}x</td>
                    <td className="px-3 py-2 font-mono text-white">{position.marginType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="portfolio" />
    </div>
  );
}
