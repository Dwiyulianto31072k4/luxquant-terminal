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
import {
  API_BASE, authHeaders, GOLD, POS, NEG,
  fmtMoney, SectionBand, Kpi, Warming, CoinPill,
} from "./vizShared";

const biasColor = (b) => (b > 0.15 ? POS : b < -0.15 ? NEG : GOLD);

const logoUrl = (name) => {
  const clean = (name || "").replace(/USDT$/i, "").toLowerCase().replace(/^1000/, "");
  return `https://assets.coincap.io/assets/icons/${clean}@2x.png`;
};
// dark outline so labels stay legible on any cell colour
const OUTLINE = { paintOrder: "stroke", stroke: "#0a0806", strokeWidth: 3, strokeLinejoin: "round" };

// custom treemap cell — recharts spreads the node's fields into props
function LiqCell(props) {
  const { x, y, width, height, name, bias = 0, spike, intensity = 0.3 } = props;
  const size = props.size ?? props.value ?? 0;
  if (width <= 0 || height <= 0) return null;
  const color = biasColor(bias);
  const sym = (name || "").replace(/USDT$/i, "");
  const med = width > 40 && height > 26;    // room for text
  const big = width > 58 && height > 52;     // room for logo + text
  const logo = Math.min(22, Math.max(13, Math.min(width, height) * 0.24));
  const textY = big ? y + logo + 20 : y + 16;
  return (
    <g>
      <rect
        x={x} y={y} width={width} height={height} rx={2}
        style={{ fill: color, fillOpacity: 0.16 + intensity * 0.5, stroke: "#0a0806", strokeWidth: 2 }}
      />
      {big && (
        <image
          href={logoUrl(name)}
          x={x + 6} y={y + 6} width={logo} height={logo}
          preserveAspectRatio="xMidYMid slice"
        />
      )}
      {med && (
        <text x={x + 6} y={textY} fill="#ffffff" fontSize={12.5} fontWeight={700}
          style={{ ...OUTLINE, fontStyle: "normal" }}>
          {sym}
        </text>
      )}
      {med && (
        <text x={x + 6} y={textY + 15} fill="#ffffff" fontSize={11} fontWeight={600}
          className="font-mono" opacity={0.95} style={OUTLINE}>
          {fmtMoney(size)}
        </text>
      )}
      {spike && med && <circle cx={x + width - 8} cy={y + 8} r={3.2} fill={GOLD} />}
    </g>
  );
}

function LiqTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload || {};
  return (
    <div className="rounded-md border border-white/10 bg-[#0c0a07]/95 px-3 py-2 text-[11px] shadow-xl">
      <div className="font-medium text-white mb-1">{d.name}</div>
      <div className="font-mono text-text-muted">4H total: <span className="text-white">{fmtMoney(d.size)}</span></div>
      <div className="font-mono" style={{ color: POS }}>shorts rekt: {fmtMoney(d.shorts)}</div>
      <div className="font-mono" style={{ color: NEG }}>longs rekt: {fmtMoney(d.longs)}</div>
      {d.spike && <div className="font-mono mt-1" style={{ color: GOLD }}>⚡ abnormal spike</div>}
    </div>
  );
}

export function LiquidationsTab({ view }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

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
      .filter((it) => viewPairs.size === 0 || viewPairs.has(it.pair))
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
      }));
    return {
      nodes,
      totalLiq: rows.reduce((a, r) => a + (r.total_4h || 0), 0),
      spikes: rows.filter((r) => r.spike).length,
      top: nodes[0] || null,
    };
  }, [data, view]);

  if (loading) return <Warming text="Loading liquidations…" />;

  return (
    <div className="space-y-4">
      <SectionBand
        title="Liquidations"
        desc="Where leverage got flushed — risk context for your live calls. Green = shorts liquidated (squeeze up), red = longs liquidated. Not a futures signal."
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="4H liq (calls)" value={fmtMoney(totalLiq)} />
        <Kpi label="Spikes" value={spikes} tone={spikes > 0 ? "text-gold-primary" : undefined} />
        <Kpi label="Biggest" value={top ? `${top.name.replace("USDT", "")} · ${fmtMoney(top.size)}` : "—"} />
      </div>

      {nodes.length === 0 ? (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-4 py-10 text-center">
          <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted/70">
            No liquidation data for the pairs in view yet
          </div>
          <div className="mt-2 flex items-center justify-center gap-1.5 flex-wrap">
            {(view || []).slice(0, 10).map((s) => (
              <CoinPill key={s.pair} pair={s.pair} className="opacity-50" />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-white/[0.06] bg-[#0c0a07] p-2">
          <ResponsiveContainer width="100%" height={400}>
            <Treemap
              data={nodes}
              dataKey="size"
              aspectRatio={4 / 3}
              stroke="#0a0806"
              content={<LiqCell />}
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
