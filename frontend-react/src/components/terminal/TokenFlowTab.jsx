// ════════════════════════════════════════════════════════════════
// TAB: TOKEN FLOW (call-centric) — CEX net-inflow per token, SPOT.
//
// Data: GET /api/v1/terminal/token-flow — Dune worker (Ethereum, 24h,
// refreshed ~every 6h). SCOPED to the base symbols of the pairs in `view`.
//
// Brand fit (halal / spot-first): pure spot capital movement.
//   net OUTFLOW (coins leaving exchanges) → accumulation → bullish (green)
//   net INFLOW  (coins moving to exchanges) → supply to sell → bearish (red)
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from "react";
import CoinLogo from "../CoinLogo";
import {
  API_BASE, authHeaders, POS, NEG, fmtMoney, SectionBand, Kpi, Warming, Chip,
} from "./vizShared";

const baseSym = (pair) =>
  (pair || "").replace(/USDT$|USDC$|BUSD$|USD$/i, "").toUpperCase();
const STABLES = new Set([
  "USDT", "USDC", "DAI", "USDE", "PYUSD", "TUSD", "FDUSD", "BUSD",
  "USDD", "FRAX", "GUSD", "LUSD", "USDS", "USD0", "CRVUSD", "USDT0", "RLUSD",
]);

function FlowRow({ r, max, color }) {
  const net = Math.abs(r.net_inflow_usd || 0);
  const w = max > 0 ? Math.max(3, (net / max) * 100) : 3;
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <CoinLogo pair={r.symbol} size={22} />
      <div className="w-14 shrink-0 text-[12.5px] text-white/90 truncate">{r.symbol}</div>
      <div className="flex-1 h-2 rounded-full bg-white/[0.04] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: color, opacity: 0.75 }} />
      </div>
      <div className="w-16 shrink-0 text-right font-mono text-[11px]" style={{ color }}>
        {fmtMoney(net)}
      </div>
    </div>
  );
}

function FlowColumn({ title, sub, rows, color }) {
  const max = rows.reduce((a, r) => Math.max(a, Math.abs(r.net_inflow_usd || 0)), 0);
  return (
    <div className="rounded-lg border border-white/[0.06] bg-[#0c0a07] p-3">
      <div className="mb-2">
        <div className="text-[13px] text-white/90">{title}</div>
        <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/70">{sub}</div>
      </div>
      {rows.length === 0 ? (
        <div className="py-6 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted/50">
          none in view
        </div>
      ) : (
        rows.map((r) => <FlowRow key={r.symbol} r={r} max={max} color={color} />)
      )}
    </div>
  );
}

export function TokenFlowTab({ view }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState("calls");   // "calls" (scoped) | "market"

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/terminal/token-flow`, { headers: authHeaders() });
        const j = await r.json();
        if (alive) setData(j);
      } catch {
        if (alive) setData({ items: [] });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const { bullish, bearish, totalOut, totalIn } = useMemo(() => {
    const viewBases = new Set((view || []).map((s) => baseSym(s.pair)));
    const rows = (data?.items || [])
      .filter((it) => !STABLES.has((it.symbol || "").toUpperCase()))    // stables carry no directional signal
      .filter((it) => scope === "market" || viewBases.size === 0 || viewBases.has(it.symbol));
    const bullish = rows
      .filter((r) => (r.net_inflow_usd || 0) < 0)
      .sort((a, b) => a.net_inflow_usd - b.net_inflow_usd)   // most negative first
      .slice(0, 12);
    const bearish = rows
      .filter((r) => (r.net_inflow_usd || 0) > 0)
      .sort((a, b) => b.net_inflow_usd - a.net_inflow_usd)
      .slice(0, 12);
    return {
      bullish, bearish,
      totalOut: rows.filter((r) => r.net_inflow_usd < 0).reduce((a, r) => a + r.net_inflow_usd, 0),
      totalIn: rows.filter((r) => r.net_inflow_usd > 0).reduce((a, r) => a + r.net_inflow_usd, 0),
    };
  }, [data, view, scope]);

  if (loading) return <Warming text="Loading token flow…" />;

  const empty = bullish.length === 0 && bearish.length === 0;

  return (
    <div className="space-y-4">
      <SectionBand
        title="Token Flow"
        desc="Spot capital moving in/out of exchanges (24h, on-chain, multi-chain). Coins LEAVING exchanges = accumulation (bullish); coins moving TO exchanges = potential selling (bearish). Not a futures signal."
      />

      <div className="flex items-center gap-1.5">
        <Chip active={scope === "calls"} onClick={() => setScope("calls")}>My calls</Chip>
        <Chip active={scope === "market"} onClick={() => setScope("market")}>Market</Chip>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Net leaving (accumulation)" value={fmtMoney(Math.abs(totalOut))} tone="text-emerald-400" />
        <Kpi label="Net to exchanges (selling)" value={fmtMoney(totalIn)} tone="text-red-400" />
      </div>

      {empty ? (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-4 py-10 text-center font-mono text-[11px] uppercase tracking-wider text-text-muted/70">
          {scope === "market"
            ? "No token-flow data yet — worker refreshes ~every 6h"
            : "No token-flow for your active calls — switch to Market to see all"}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <FlowColumn title="Leaving exchanges" sub="accumulation · bullish" rows={bullish} color={POS} />
          <FlowColumn title="Into exchanges" sub="selling pressure · bearish" rows={bearish} color={NEG} />
        </div>
      )}

      <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/50 px-1">
        Source: Dune (Ethereum spot, CEX-labelled) · 24h window · refreshed ~every 6h
      </div>
    </div>
  );
}

export default TokenFlowTab;
