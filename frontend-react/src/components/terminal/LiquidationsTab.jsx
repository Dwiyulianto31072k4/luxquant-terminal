// ════════════════════════════════════════════════════════════════
// TAB: LIQUIDATIONS (call-centric treemap)
//
// Data: GET /api/v1/terminal/liquidations — precomputed by the Coinalyze
// worker (multi-exchange, aggregated). We SCOPE to the pairs currently in
// `view` (already filtered by WINDOW / SECTOR / RISK in SignalsAnalytics),
// so this shows liquidation pressure ONLY for live calls.
//
// Framing: RISK CONTEXT for spot-utility setups — NOT a futures signal.
//   size  = total liquidations (4H, USD)
//   color = side bias: shorts rekt (green, squeeze up) vs longs rekt (red)
//   gold dot = abnormal spike (robust-z ≥ threshold)
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from "react";
import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import CoinLogo from "../CoinLogo";
import { useSignalStatus } from "../../context/SignalStatusContext";
import {
  API_BASE, authHeaders, GOLD, POS, NEG,
  fmtMoney, SectionBand, Kpi, Warming, CoinPill, Chip,
} from "./vizShared";

const biasColor = (b) => (b > 0.15 ? POS : b < -0.15 ? NEG : GOLD);

const logoUrl = (name) => {
  const clean = (name || "").replace(/USDT$/i, "").toLowerCase().replace(/^1000/, "");
  return `https://assets.coincap.io/assets/icons/${clean}@2x.png`;
};
// dark outline so labels stay legible on any cell colour
const OUTLINE = { paintOrder: "stroke", stroke: "#0a0806", strokeWidth: 3, strokeLinejoin: "round" };

// custom treemap cell — recharts spreads the node's fields into props.
// Uses <foreignObject> to embed the real <CoinLogo> (logo + initials fallback,
// never a broken image). Gold border + CALL tag + click on LuxQuant calls.
function LiqCell(props) {
  const { x, y, width, height, name, bias = 0, spike, intensity = 0.3, called, onPick } = props;
  const size = props.size ?? props.value ?? 0;
  if (!name || width <= 1 || height <= 1) return null;
  const color = biasColor(bias);
  const sym = (name || "").replace(/USDT$/i, "");
  const med = width > 34 && height > 24;
  const big = width > 54 && height > 46;
  const logo = Math.min(26, Math.max(13, Math.min(width, height) * 0.26));
  return (
    <g style={{ cursor: called ? "pointer" : "default" }} onClick={() => onPick?.(name, called)}>
      <rect
        x={x} y={y} width={width} height={height} rx={2}
        style={{
          fill: color,
          fillOpacity: 0.16 + intensity * 0.5,
          stroke: called ? "rgba(212,168,83,0.95)" : "#0a0806",
          strokeWidth: 2,
        }}
      />
      {med && (
        <foreignObject x={x} y={y} width={width} height={height} style={{ pointerEvents: "none" }}>
          <div
            style={{
              width: "100%", height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 2, padding: 2,
              overflow: "hidden", boxSizing: "border-box",
            }}
          >
            {big && <CoinLogo pair={name} size={logo} />}
            <span style={{ color: "#fff", fontWeight: 700, fontSize: big ? 12.5 : 10.5, lineHeight: 1.05, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sym}
            </span>
            <span style={{ color: "#fff", opacity: 0.95, fontFamily: "ui-monospace, monospace", fontSize: big ? 11 : 9.5, lineHeight: 1.05 }}>
              {fmtMoney(size)}
            </span>
          </div>
        </foreignObject>
      )}
      {spike && med && <circle cx={x + width - 8} cy={y + 8} r={3.2} fill={GOLD} />}
      {called && med && (
        <text x={x + width - 5} y={y + height - 6} textAnchor="end" fill="#e8c877" fontSize={8} fontWeight={800} fontFamily="ui-monospace, monospace" letterSpacing="0.06em">
          CALL
        </text>
      )}
    </g>
  );
}

function LiqTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload || {};
  return (
    <div className="rounded-md border border-white/10 bg-surface-raised/95 px-3 py-2 text-[11px] shadow-xl">
      <div className="font-medium text-text-primary mb-1">{d.name}</div>
      <div className="font-mono text-text-muted">4H total: <span className="text-text-primary">{fmtMoney(d.size)}</span></div>
      <div className="font-mono" style={{ color: POS }}>shorts rekt: {fmtMoney(d.shorts)}</div>
      <div className="font-mono" style={{ color: NEG }}>longs rekt: {fmtMoney(d.longs)}</div>
      {d.spike && <div className="font-mono mt-1" style={{ color: GOLD }}>⚡ abnormal spike</div>}
    </div>
  );
}

export function LiquidationsTab({ view }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState("calls");   // "calls" (scoped) | "market"
  const statusCtx = useSignalStatus();
  const calledMap = statusCtx?.map;
  const pick = (pair, called) => { if (called && statusCtx?.openPair) statusCtx.openPair(pair); };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/terminal/liquidations`, { headers: authHeaders() });
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

  // scope to pairs in the current (filtered) view → call-centric
  const { nodes, totalLiq, spikes, top } = useMemo(() => {
    const byPair = {};
    (data?.items || []).forEach((it) => { byPair[it.pair] = it; });
    const viewPairs = new Set((view || []).map((s) => s.pair));
    const rows = Object.values(byPair)
      .filter((it) => scope === "market" || viewPairs.size === 0 || viewPairs.has(it.pair))
      .filter((it) => (it.total_4h || 0) > 0);
    const max = rows.reduce((a, r) => Math.max(a, r.total_4h || 0), 0) || 1;
    const nodes = rows
      .sort((a, b) => (b.total_4h || 0) - (a.total_4h || 0))
      .slice(0, 60)
      .map((r) => ({
        name: r.pair,
        size: r.total_4h,
        longs: r.liq_long_4h,
        shorts: r.liq_short_4h,
        bias: r.side_bias ?? 0,
        spike: !!r.spike,
        intensity: (r.total_4h || 0) / max,
        called: !!(calledMap && calledMap[(r.pair || "").toUpperCase()]),
      }));
    return {
      nodes,
      totalLiq: rows.reduce((a, r) => a + (r.total_4h || 0), 0),
      spikes: rows.filter((r) => r.spike).length,
      top: nodes[0] || null,
    };
  }, [data, view, scope, calledMap]);

  if (loading) return <Warming text="Loading liquidations…" />;

  return (
    <div className="space-y-4">
      <SectionBand
        title="Liquidations"
        desc="Where leverage got flushed — risk context. Green = shorts liquidated (squeeze up), red = longs liquidated. Not a futures signal."
      />

      <div className="flex items-center gap-1.5">
        <Chip active={scope === "calls"} onClick={() => setScope("calls")}>My calls</Chip>
        <Chip active={scope === "market"} onClick={() => setScope("market")}>Market</Chip>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Kpi label={scope === "market" ? "4H liq (market)" : "4H liq (calls)"} value={fmtMoney(totalLiq)} />
        <Kpi label="Spikes" value={spikes} tone={spikes > 0 ? "text-gold-primary" : undefined} />
        <Kpi label="Biggest" value={top ? `${top.name.replace("USDT", "")} · ${fmtMoney(top.size)}` : "—"} />
      </div>

      {nodes.length === 0 ? (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-4 py-10 text-center">
          <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted/70">
            {scope === "market"
              ? "No liquidation data yet — worker refreshes every ~10 min"
              : "No liquidations for your active calls — switch to Market to see all"}
          </div>
          <div className="mt-2 flex items-center justify-center gap-1.5 flex-wrap">
            {(view || []).slice(0, 10).map((s) => (
              <CoinPill key={s.pair} pair={s.pair} className="opacity-50" />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-white/[0.06] bg-surface-raised p-2">
          <ResponsiveContainer width="100%" height={400}>
            <Treemap
              data={nodes}
              dataKey="size"
              aspectRatio={4 / 3}
              stroke="#0a0806"
              content={<LiqCell onPick={pick} />}
              isAnimationActive={false}
            >
              <Tooltip content={<LiqTip />} />
            </Treemap>
          </ResponsiveContainer>
        </div>
      )}

      <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/50 px-1">
        Source: Coinalyze (multi-exchange, aggregated) · updated every ~10 min · relative index, not absolute
      </div>
    </div>
  );
}

export default LiquidationsTab;
