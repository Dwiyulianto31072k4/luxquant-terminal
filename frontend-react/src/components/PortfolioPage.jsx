import { useEffect, useState } from "react";
import { getExecutions, getMe, getPortfolio } from "../services/autotradeApi";
import AssistantWidget from "./assistant/AssistantWidget";
import { Skeleton, ShimmerStyles } from "./ui/Loaders";

function fmtUsd(value) {
  return Number(value || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-ink/5 bg-bg-card p-4">
      <p className="mb-2 text-xs uppercase tracking-wider text-text-muted">{label}</p>
      <p className="text-2xl font-display font-bold text-text-primary">{value}</p>
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
      <div
        className="space-y-5 animate-[lqFadeIn_.25s_ease]"
        role="status"
        aria-label="Loading portfolio"
      >
        <ShimmerStyles />
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3 w-72 max-w-[80%]" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-ink/5 bg-bg-card p-4 space-y-2.5">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-2 w-16" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-ink/5 bg-bg-card p-5">
          <Skeleton className="h-4 w-36 mb-4" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="hidden sm:block h-4 w-16" />
                <Skeleton className="hidden md:block h-4 w-14" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-loss/25 bg-red-500/[0.05] p-4 text-sm text-loss">
        {error}
      </div>
    );
  }

  const spotValue = Number(portfolio?.spot?.portfolio_usdt || 0);
  const futuresValue = Number(portfolio?.futures?.portfolio_usdt || 0);
  const available =
    Number(portfolio?.spot?.available_usdt || 0) + Number(portfolio?.futures?.available_usdt || 0);
  const openFutures = portfolio?.futures?.positions?.length || 0;

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 flex items-center gap-3">
          <div className="h-6 w-1 rounded bg-gradient-to-b from-accent to-accent" />
          <h1 className="font-display text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight">
            Portfolio
          </h1>
        </div>
        <p className="text-sm text-text-muted">
          Documented API view across {accounts.length} linked exchange account
          {accounts.length === 1 ? "" : "s"}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Spot Value" value={fmtUsd(spotValue)} hint="Spot portfolio value" />
        <StatCard
          label="Futures Value"
          value={fmtUsd(futuresValue)}
          hint={`${openFutures} open positions`}
        />
        <StatCard label="Available" value={fmtUsd(available)} hint="Available USDT" />
        <StatCard
          label="Executions"
          value={String(executions.length)}
          hint="Recent execution jobs"
        />
      </div>

      <div className="rounded-2xl border border-ink/5 bg-bg-card p-5">
        <h2 className="mb-3 text-base font-display font-bold text-text-primary">
          Futures positions
        </h2>
        {(portfolio?.futures?.positions || []).length === 0 ? (
          <p className="text-sm text-text-muted">No open futures positions.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-text-muted/80">
                <tr>
                  {["Symbol", "Size", "Entry", "PnL", "Leverage", "Margin"].map((heading) => (
                    <th
                      key={heading}
                      className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-[0.18em]"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {portfolio.futures.positions.map((position) => (
                  <tr key={position.symbol} className="border-t border-ink/5">
                    <td className="px-3 py-2 font-mono text-text-primary">{position.symbol}</td>
                    <td className="px-3 py-2 font-mono text-text-primary">
                      {position.positionAmt}
                    </td>
                    <td className="px-3 py-2 font-mono text-text-primary">{position.entryPrice}</td>
                    <td
                      className={`px-3 py-2 font-mono ${
                        Number(position.unrealizedProfit || 0) >= 0 ? "text-profit" : "text-loss"
                      }`}
                    >
                      {position.unrealizedProfit}
                    </td>
                    <td className="px-3 py-2 font-mono text-text-primary">{position.leverage}x</td>
                    <td className="px-3 py-2 font-mono text-text-primary">{position.marginType}</td>
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
