function fmtUsd(value) {
  return Number(value || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function Card({ label, value, hint, tone = "neutral" }) {
  const colors = {
    neutral: "text-white",
    gold: "text-gold-primary",
    good: "text-emerald-400",
    bad: "text-red-400",
  };

  return (
    <div className="relative overflow-hidden rounded-md border border-white/[0.06] bg-[#0a0805] p-4">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
      <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-muted/60">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold ${colors[tone]}`}>{value}</p>
      <p className="mt-1 text-xs text-text-muted">{hint}</p>
    </div>
  );
}

export default function PnLSummary({ portfolio, executions }) {
  const spotValue = Number(portfolio?.spot?.portfolio_usdt || 0);
  const futuresValue = Number(portfolio?.futures?.portfolio_usdt || 0);
  const available =
    Number(portfolio?.spot?.available_usdt || 0) +
    Number(portfolio?.futures?.available_usdt || 0);
  const openFutures = portfolio?.futures?.positions?.length || 0;
  const completed = executions.filter((item) => item.status === "completed").length;
  const failed = executions.filter((item) => item.status === "failed").length;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card
        label="Spot Value"
        value={fmtUsd(spotValue)}
        hint="Current spot portfolio value"
      />
      <Card
        label="Futures Value"
        value={fmtUsd(futuresValue)}
        hint={`${openFutures} open futures positions`}
        tone={openFutures > 0 ? "gold" : "neutral"}
      />
      <Card
        label="Available USDT"
        value={fmtUsd(available)}
        hint="Funds available for new orders"
      />
      <Card
        label="Executions"
        value={`${completed}/${executions.length}`}
        hint={`${failed} failed or skipped`}
        tone={failed > 0 ? "bad" : completed > 0 ? "good" : "neutral"}
      />
    </div>
  );
}
