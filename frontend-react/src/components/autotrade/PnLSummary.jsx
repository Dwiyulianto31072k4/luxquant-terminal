// src/components/autotrade/PnLSummary.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade balance / execution summary (top strip)
// ════════════════════════════════════════════════════════════════

import { StatCard, fmtUsd } from "./AutoTradeUI";

export default function PnLSummary({ portfolio, executions = [] }) {
  const spotValue = Number(portfolio?.spot?.portfolio_usdt || 0);
  const futuresValue = Number(portfolio?.futures?.portfolio_usdt || 0);
  const available =
    Number(portfolio?.spot?.available_usdt || 0) +
    Number(portfolio?.futures?.available_usdt || 0);

  const openFutures = portfolio?.futures?.positions?.length || 0;
  const completed = executions.filter((e) => e.status === "completed").length;
  const failed = executions.filter(
    (e) => e.status === "failed" || e.status === "skipped",
  ).length;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Spot Value"
        value={fmtUsd(spotValue)}
        sub="Spot wallet"
      />
      <StatCard
        label="Futures Value"
        value={fmtUsd(futuresValue)}
        sub={`${openFutures} open position${openFutures === 1 ? "" : "s"}`}
        valueColor={openFutures > 0 ? "text-gold-primary" : "text-white"}
        accent={openFutures > 0}
      />
      <StatCard
        label="Available"
        value={fmtUsd(available)}
        sub="Free for new orders"
      />
      <StatCard
        label="Executions"
        value={`${completed}/${executions.length}`}
        sub={failed > 0 ? `${failed} failed / skipped` : "all clear"}
        valueColor={
          failed > 0
            ? "text-[#F6465D]"
            : completed > 0
              ? "text-[#0ECB81]"
              : "text-white"
        }
      />
    </div>
  );
}
