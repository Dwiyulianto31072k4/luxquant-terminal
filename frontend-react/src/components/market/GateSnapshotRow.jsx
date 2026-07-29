import CoinLogo from "../CoinLogo";

/**
 * Gate's signature four-card strip: three coin lists and the ETF flow, sitting
 * above the market table. Everything here is fed from state the Home page has
 * already fetched, so the row costs no extra request.
 */

const fmtPrice = (n) => {
  if (n == null) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.01) return n.toFixed(5);
  return n.toPrecision(4);
};

const fmtFlow = (n) => {
  if (n == null) return "—";
  const m = n / 1e6;
  return `${n >= 0 ? "+" : "-"}$${Math.abs(m).toFixed(2)}M`;
};

const Card = ({ icon, title, children, action }) => (
  <div className="flex flex-col rounded-xl border border-ink/[0.06] bg-surface-raised p-4">
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <h3 className="truncate text-[14px] font-semibold text-text-primary">{title}</h3>
      </div>
      {action}
    </div>
    <div className="flex-1">{children}</div>
  </div>
);

const CoinRow = ({ coin }) => {
  const chg = coin.price_change_percentage_24h;
  const up = (chg ?? 0) >= 0;
  const sym = (coin.symbol || "").toUpperCase();
  return (
    <div className="flex items-center justify-between gap-2 py-[7px]">
      <div className="flex min-w-0 items-center gap-2">
        <CoinLogo pair={`${sym}USDT`} size={20} />
        <span className="truncate text-[13px] font-medium text-text-primary">
          {sym}
          <span className="text-text-muted"> / USDT</span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-mono text-[13px] tabular-nums text-text-primary">
          {fmtPrice(coin.current_price)}
        </span>
        <span
          className={`w-[68px] text-right font-mono text-[13px] tabular-nums ${up ? "text-profit" : "text-loss"}`}
        >
          {chg == null ? "—" : `${up ? "+" : ""}${chg.toFixed(2)}%`}
        </span>
      </div>
    </div>
  );
};

const Flame = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 text-loss" fill="currentColor" aria-hidden="true">
    <path d="M12 2c.5 3 2.5 4.5 4 6.2 1.6 1.8 2 3.4 2 5.3a6 6 0 1 1-12 0c0-1.3.4-2.4 1-3.2.2 1.2 1 2 2 2.2-.5-2.6.6-4.8 3-6.5-.4-1.4-.3-2.7 0-4z" />
  </svg>
);
const Bolt = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 text-profit" fill="currentColor" aria-hidden="true">
    <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />
  </svg>
);
const Sparkle = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 text-accent" fill="currentColor" aria-hidden="true">
    <path d="M12 2.5 13.8 9l6.2 1.8-6.2 1.8L12 19l-1.8-6.4L4 10.8 10.2 9 12 2.5z" />
  </svg>
);

const GateSnapshotRow = ({ hot, gainers, etf }) => {
  const btcFlow = etf?.btc?.records?.[0]?.netFlow;
  const ethFlow = etf?.eth?.records?.[0]?.netFlow;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card icon={<Flame />} title="Hot Coins">
        {hot?.length ? (
          hot.slice(0, 3).map((c) => <CoinRow key={c.id || c.symbol} coin={c} />)
        ) : (
          <div className="py-6 text-center text-[12px] text-text-muted">Loading…</div>
        )}
      </Card>

      <Card icon={<Bolt />} title="Gainers">
        {gainers?.length ? (
          gainers.slice(0, 3).map((c) => <CoinRow key={c.id || c.symbol} coin={c} />)
        ) : (
          <div className="py-6 text-center text-[12px] text-text-muted">Loading…</div>
        )}
      </Card>

      {/* Deliberately inert. Gate fills this from its own listings calendar; we
          have no listings feed, and a card that invents rows would be worse
          than one that says so. */}
      <Card icon={<Sparkle />} title="New Listing">
        <div className="flex h-full min-h-[86px] flex-col items-center justify-center gap-1 text-center">
          <span className="text-[12px] text-text-muted">No listings feed yet</span>
          <span className="text-[11px] text-text-muted/60">This card activates once one is wired up</span>
        </div>
      </Card>

      <Card icon={null} title="Crypto ETF Net Flow">
        {etf ? (
          <div className="space-y-3 pt-1">
            <div>
              <div className="flex items-center gap-1.5 text-[12px] text-text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-[#f7931a]" />
                Bitcoin ETF Net Flow
              </div>
              <div
                className={`mt-0.5 font-mono text-[19px] font-semibold tabular-nums ${
                  (btcFlow ?? 0) >= 0 ? "text-profit" : "text-loss"
                }`}
              >
                {fmtFlow(btcFlow)}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[12px] text-text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-[#627eea]" />
                Ethereum ETF Net Flow
              </div>
              <div
                className={`mt-0.5 font-mono text-[19px] font-semibold tabular-nums ${
                  (ethFlow ?? 0) >= 0 ? "text-profit" : "text-loss"
                }`}
              >
                {fmtFlow(ethFlow)}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-[12px] text-text-muted">Loading…</div>
        )}
      </Card>
    </div>
  );
};

export default GateSnapshotRow;
