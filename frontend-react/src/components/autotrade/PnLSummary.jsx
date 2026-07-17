// src/components/autotrade/PnLSummary.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade balance / execution summary (top strip)
// ════════════════════════════════════════════════════════════════

import { StatCard, fmtUsd } from "./AutoTradeUI";

export default function PnLSummary({ portfolio, executions = [], tradeSummary = {} }) {
  const spotValue = Number(portfolio?.spot?.portfolio_usdt || 0);
  const futuresValue = Number(portfolio?.futures?.portfolio_usdt || 0);
  const available =
    Number(portfolio?.spot?.available_usdt || 0) + Number(portfolio?.futures?.available_usdt || 0);

  const openFutures = portfolio?.futures?.positions?.length || 0;
  const openSpot = portfolio?.spot?.tracked_positions?.length || 0;
  const skipped = executions.filter((e) => e.status === "skipped").length;
  const failed = executions.filter((e) => e.status === "failed").length;
  const reconciliation = executions.filter((e) => e.status === "reconciliation_required").length;
  const executionIssues = [
    failed > 0 ? `${failed} failed` : "",
    skipped > 0 ? `${skipped} skipped` : "",
    reconciliation > 0 ? `${reconciliation} reconcile` : "",
  ].filter(Boolean);

  const openLive = tradeSummary.open_live_positions || 0;
  const closedLive = tradeSummary.closed_live_trades || 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Spot Value"
        value={fmtUsd(spotValue)}
        sub={`${openSpot} AutoTrade position${openSpot === 1 ? "" : "s"}`}
        valueColor={openSpot > 0 ? "text-accent" : "text-text-primary"}
        accent={openSpot > 0}
      />
      <StatCard
        label="Futures Value"
        value={fmtUsd(futuresValue)}
        sub={`${openFutures} open position${openFutures === 1 ? "" : "s"}`}
        valueColor={openFutures > 0 ? "text-accent" : "text-text-primary"}
        accent={openFutures > 0}
      />
      <StatCard label="Available" value={fmtUsd(available)} sub="Free for new orders" />
      <StatCard
        label="Live Trades"
        value={`${openLive} / ${closedLive}`}
        sub={executionIssues.length > 0 ? executionIssues.join(" · ") : "Open / closed live"}
        valueColor={
          failed > 0 || reconciliation > 0
            ? "text-[#F6465D]"
            : skipped > 0
              ? "text-accent"
              : Number(closedLive) > 0
                ? "text-[#0ECB81]"
                : "text-text-primary"
        }
      />
    </div>
  );
}
