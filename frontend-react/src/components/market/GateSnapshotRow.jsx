import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import CoinLogo from "../CoinLogo";
import { API_BASE, authHeaders } from "../terminal/vizShared";

/**
 * The four-card strip above the market table.
 *
 * Two cards are plain market context (Hot Coins, Gainers); two are LuxQuant's
 * own terminal signal surfaced publicly on Home — Volume Spikes and Token Flow.
 * Every card carries an arrow to its full view, which is where the terminal's
 * depth (and the reason to subscribe) actually lives.
 */

const fmtPrice = (n) => {
  if (n == null) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.01) return n.toFixed(5);
  return n.toPrecision(4);
};

const fmtUsd = (n) => {
  const a = Math.abs(n || 0);
  if (a >= 1e9) return `$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(a / 1e3).toFixed(0)}K`;
  return `$${a.toFixed(0)}`;
};

const Arrow = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

/**
 * One card. `to` turns the header into a link — the arrow is the affordance
 * that there is more behind it.
 */
const Card = ({ icon, title, to, note, children }) => (
  <div className="flex flex-col rounded-xl border border-ink/[0.06] bg-surface-raised p-4 transition-colors hover:border-ink/[0.12]">
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <h3 className="truncate text-[14px] font-semibold text-text-primary">{title}</h3>
      </div>
      {to ? (
        <Link
          to={to}
          aria-label={`Open ${title}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-ink/[0.06] hover:text-text-primary"
        >
          <Arrow />
        </Link>
      ) : null}
    </div>
    <div className="flex-1">{children}</div>
    {note ? <div className="mt-2.5 text-[10.5px] text-text-muted/70">{note}</div> : null}
  </div>
);

const Empty = ({ label = "Loading…" }) => (
  <div className="flex h-full min-h-[92px] items-center justify-center text-[12px] text-text-muted">
    {label}
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
        <span className="font-mono text-[13px] tabular-nums text-text-primary">{fmtPrice(coin.current_price)}</span>
        <span className={`w-[64px] text-right font-mono text-[13px] tabular-nums ${up ? "text-profit" : "text-loss"}`}>
          {chg == null ? "—" : `${up ? "+" : ""}${chg.toFixed(2)}%`}
        </span>
      </div>
    </div>
  );
};

/** Bar rows share a geometry so the two data cards line up with the coin cards. */
const BarRow = ({ symbol, value, label, ratio, tone }) => (
  <div className="flex items-center gap-2 py-[7px]">
    <CoinLogo pair={`${symbol}USDT`} size={20} />
    <span className="w-[52px] shrink-0 truncate text-[12.5px] text-text-primary">{symbol}</span>
    <div className="relative h-[6px] min-w-0 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${Math.max(4, Math.min(100, ratio * 100))}%`, background: tone }}
      />
    </div>
    <span className="w-[54px] shrink-0 text-right font-mono text-[12.5px] tabular-nums text-text-secondary">
      {label ?? value}
    </span>
  </div>
);

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
const Pulse = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </svg>
);
const Swap = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
  </svg>
);

const GateSnapshotRow = ({ hot, gainers }) => {
  const [spikes, setSpikes] = useState(null);
  const [flow, setFlow] = useState(null);

  useEffect(() => {
    let alive = true;

    const loadSpikes = async () => {
      try {
        // spike_15m is precomputed by the terminal worker and shipped in the
        // derivatives blob keyed by pair — NOT on the screener's signal rows.
        // The Anomaly tab narrows this to called pairs; Home wants the whole
        // market, so we rank every pair in the blob.
        const r = await fetch(`${API_BASE}/api/v1/terminal/derivatives`, {
          headers: authHeaders(),
        });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        const pairs = j?.pairs || {};
        const rows = Object.entries(pairs)
          .map(([pair, d]) => ({ pair: pair.toUpperCase(), v: d?.spike_15m }))
          .filter((x) => x.v != null && x.v > 1.5)
          .sort((a, b) => b.v - a.v)
          .slice(0, 3);
        if (alive) setSpikes(rows);
      } catch {
        if (alive) setSpikes([]);
      }
    };

    const loadFlow = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/terminal/token-flow`, { headers: authHeaders() });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (alive) setFlow(j.items || []);
      } catch {
        if (alive) setFlow([]);
      }
    };

    loadSpikes();
    loadFlow();
    const iv = setInterval(() => {
      loadSpikes();
      loadFlow();
    }, 300000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  // Negative net_inflow_usd = leaving exchanges = accumulation. Those are the
  // rows worth surfacing; selling pressure lives in the full tab.
  const leaving = useMemo(() => {
    if (!flow) return null;
    return flow
      .filter((r) => (r.net_inflow_usd ?? 0) < 0)
      .sort((a, b) => (a.net_inflow_usd ?? 0) - (b.net_inflow_usd ?? 0))
      .slice(0, 3)
      .map((r) => ({ symbol: (r.symbol || "").toUpperCase(), usd: Math.abs(r.net_inflow_usd) }));
  }, [flow]);

  const maxSpike = spikes?.[0]?.v || 1;
  const maxFlow = leaving?.[0]?.usd || 1;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card icon={<Flame />} title="Hot Coins" to="/markets">
        {hot?.length ? hot.slice(0, 3).map((c) => <CoinRow key={c.id || c.symbol} coin={c} />) : <Empty />}
      </Card>

      <Card icon={<Bolt />} title="Gainers" to="/markets">
        {gainers?.length ? gainers.slice(0, 3).map((c) => <CoinRow key={c.id || c.symbol} coin={c} />) : <Empty />}
      </Card>

      <Card
        icon={<Pulse />}
        title="Volume Spikes"
        to="/terminal/scan?tab=anomaly"
        note="Notional traded vs each coin's typical pace · 15m"
      >
        {spikes === null ? (
          <Empty />
        ) : spikes.length ? (
          spikes.map((s) => (
            <BarRow
              key={s.pair}
              symbol={s.pair.replace(/USDT$/, "")}
              ratio={s.v / maxSpike}
              label={`${s.v.toFixed(1)}×`}
              tone="rgb(var(--accent))"
            />
          ))
        ) : (
          <Empty label="No spike above 1.5× right now" />
        )}
      </Card>

      <Card
        icon={<Swap />}
        title="Token Flow"
        to="/terminal/scan?tab=tokenflow"
        note="Spot leaving exchanges — accumulation · 24h"
      >
        {leaving === null ? (
          <Empty />
        ) : leaving.length ? (
          leaving.map((r) => (
            <BarRow
              key={r.symbol}
              symbol={r.symbol}
              ratio={r.usd / maxFlow}
              label={fmtUsd(r.usd)}
              tone="rgb(var(--pos))"
            />
          ))
        ) : (
          <Empty label="No net accumulation in this window" />
        )}
      </Card>
    </div>
  );
};

export default GateSnapshotRow;
