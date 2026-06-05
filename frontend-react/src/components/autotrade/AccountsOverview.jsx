function fmtUsd(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="relative overflow-hidden rounded-md border border-white/[0.06] bg-[#0a0805] p-4">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
      <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-muted/60">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}

function StatusPill({ tone = "neutral", children }) {
  const styles = {
    good: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
    warn: "border-gold-primary/25 bg-gold-primary/10 text-gold-primary",
    bad: "border-red-500/25 bg-red-500/10 text-red-400",
    neutral: "border-white/[0.08] bg-white/[0.02] text-text-muted",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.15em] ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

export default function AccountsOverview({
  user,
  health,
  exchangeAccounts,
  portfolio,
  onConnect,
}) {
  const totalBalance =
    Number(portfolio?.spot?.portfolio_usdt || 0) +
    Number(portfolio?.futures?.portfolio_usdt || 0);

  const availableBalance =
    Number(portfolio?.spot?.available_usdt || 0) +
    Number(portfolio?.futures?.available_usdt || 0);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-white/[0.06] bg-[#0a0805] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gold-primary/80">
              Account status
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {user?.email || "Connected user"}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Role: {user?.role || "user"} • Exchange accounts: {exchangeAccounts.length}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={health?.ok ? "good" : "bad"}>
              {health?.ok ? "API healthy" : "API unavailable"}
            </StatusPill>
            <StatusPill tone={health?.live_orders_enabled ? "good" : "warn"}>
              {health?.live_orders_enabled ? "Live orders on" : "Dry rails only"}
            </StatusPill>
            <button
              type="button"
              onClick={onConnect}
              className="rounded-md px-4 py-2 text-[11px] font-mono uppercase tracking-[0.2em] text-black"
              style={{
                background:
                  "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
              }}
            >
              Connect Binance
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          label="Portfolio"
          value={fmtUsd(totalBalance)}
          hint="Spot + futures portfolio value from `/me/portfolio`"
        />
        <MetricCard
          label="Available"
          value={fmtUsd(availableBalance)}
          hint="Available USDT for new orders"
        />
        <MetricCard
          label="Environment"
          value={health?.binance_environment || "unknown"}
          hint={health?.market_data_label || "Backend health metadata"}
        />
      </div>

      <div className="rounded-md border border-white/[0.06] bg-[#0a0805] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Linked exchange accounts</h3>
            <p className="mt-1 text-sm text-text-muted">
              Directly sourced from `GET /me`
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {exchangeAccounts.length === 0 ? (
            <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-4 text-sm text-text-muted">
              No exchange account has been saved yet.
            </div>
          ) : (
            exchangeAccounts.map((account) => {
              const statusTone =
                account.key_status === "valid"
                  ? "good"
                  : account.key_status === "invalid"
                    ? "bad"
                    : "warn";

              return (
                <div
                  key={`${account.exchange}-${account.label || "default"}`}
                  className="rounded-md border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {account.label || "Binance account"}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        {account.exchange} • API key:{" "}
                        {account.has_api_key ? "saved" : "missing"} • Secret:{" "}
                        {account.has_api_secret ? "saved" : "missing"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill tone={statusTone}>{account.key_status}</StatusPill>
                      {account.last_checked_at ? (
                        <StatusPill>
                          {new Date(account.last_checked_at).toLocaleString()}
                        </StatusPill>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
