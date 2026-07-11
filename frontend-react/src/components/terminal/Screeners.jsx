// ════════════════════════════════════════════════════════════════
// Screeners — RSI Heatmap + ATR Levels over the 7-day active signals.
// Inspired by pro FX terminals, adapted to crypto. Both read the deriv
// blob (rsi / atr_pct / range24_pct) joined to the called pairs.
// ════════════════════════════════════════════════════════════════
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
} from "recharts";
import CoinLogo from "../CoinLogo";
import { GOLD, GRID, AXIS, TICK_SM, SectionBand, Kpi, Warming, ScrollArea, statusColorOf, useZoom } from "./vizShared";
import { useSignalStatus } from "../../context/SignalStatusContext";

const sym = (p) => (p || "").replace(/USDT$/i, "");
// stable pseudo-random x (0..1) per pair so dots spread horizontally and don't
// jump around on refresh
const hashX = (p) => {
  let h = 0;
  for (let i = 0; i < (p || "").length; i++) h = (p.charCodeAt(i) + ((h << 5) - h)) | 0;
  return (Math.abs(h) % 1000) / 1000;
};

function rows(view, deriv) {
  const seen = new Set();
  const out = [];
  (view || []).forEach((s) => {
    if (!s.pair || seen.has(s.pair)) return;
    const d = deriv?.pairs?.[s.pair];
    if (!d) return;
    seen.add(s.pair);
    out.push({ pair: s.pair, ...d });
  });
  return out;
}

// ── RSI HEATMAP ──────────────────────────────────────────────────
function RsiTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-md bg-[#120809] border border-gold-primary/25 px-3 py-2 font-mono text-[10px] shadow-lg">
      <div className="flex items-center gap-1.5 mb-1"><CoinLogo pair={d.pair} size={16} /><span className="text-white">{sym(d.pair)}</span></div>
      <div className="text-white/60">RSI(14 · 1h): <span className="text-white/90">{d.y.toFixed(1)}</span></div>
      <div className="text-white/45">{d.band}</div>
    </div>
  );
}

const rsiBand = (v) => (v >= 70 ? { k: "overbought", c: "#f87171" } : v >= 60 ? { k: "strong", c: "#fb7185" } : v > 40 ? { k: "neutral", c: "#9ca3af" } : v > 30 ? { k: "weak", c: "#86efac" } : { k: "oversold", c: "#34d399" });

export function RsiHeatmapTab({ view, deriv, openPair }) {
  const { t } = useTranslation();
  const { map: statusMap } = useSignalStatus() || {};
  const z = useZoom(0, 1, 0, 100);
  const rs = useMemo(() => rows(view, deriv).filter((r) => r.rsi != null), [view, deriv]);
  const data = useMemo(() => rs.map((r) => {
    const b = rsiBand(r.rsi);
    return { x: hashX(r.pair), y: r.rsi, pair: r.pair, band: b.k, fill: b.c, sc: statusColorOf(statusMap, r.pair) };
  }), [rs, statusMap]);
  const avg = rs.length ? rs.reduce((a, r) => a + r.rsi, 0) / rs.length : null;
  const ob = rs.filter((r) => r.rsi >= 70).length;
  const os = rs.filter((r) => r.rsi <= 30).length;

  if (deriv?.warming) return <Warming text={t("terminal.viz.derivWarming")} />;

  const Dot = (props) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    return (
      <g style={{ cursor: "pointer" }} onClick={() => openPair(payload.pair)}>
        <circle cx={cx} cy={cy} r={5} fill={payload.fill} fillOpacity={0.85} stroke={payload.sc || "rgba(0,0,0,0.5)"} strokeWidth={payload.sc ? 1.6 : 0.5} />
        <text x={cx} y={cy - 8} textAnchor="middle" fontFamily="monospace" fontSize={8} fill="rgba(255,255,255,0.55)" pointerEvents="none">{sym(payload.pair)}</text>
      </g>
    );
  };

  return (
    <>
      <SectionBand title="RSI Heatmap" desc="14-period RSI (1h) across every active call. Above 70 = overbought (stretched), below 30 = oversold. Dot ring = signal status." />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Kpi label="Average RSI" value={avg == null ? "—" : avg.toFixed(1)} desc="Mean across active calls." tone={avg >= 60 ? "text-negative" : avg <= 40 ? "text-positive" : undefined} />
        <Kpi label="Overbought ≥70" value={ob} desc="Stretched — mean-reversion risk." tone={ob ? "text-negative" : undefined} />
        <Kpi label="Oversold ≤30" value={os} desc="Beaten down — bounce watch." tone={os ? "text-positive" : undefined} />
        <Kpi label="Instruments" value={rs.length} desc="Called pairs with RSI." />
      </div>
      <div className="relative rounded-2xl bg-[#0a0805] border border-white/[0.07] overflow-hidden">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />
        <div className="p-3" style={{ height: 540, touchAction: "none", cursor: "grab" }}
          ref={z.ref} onPointerDown={z.onPointerDown} onPointerMove={z.onPointerMove} onPointerUp={z.onPointerUp} onPointerLeave={z.onPointerUp} onClickCapture={z.onClickCapture} onDoubleClick={z.reset}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 44, left: 4, bottom: 8 }}>
              <ReferenceArea y1={70} y2={100} fill="#f87171" fillOpacity={0.06} />
              <ReferenceArea y1={30} y2={70} fill="#9ca3af" fillOpacity={0.03} />
              <ReferenceArea y1={0} y2={30} fill="#34d399" fillOpacity={0.06} />
              <CartesianGrid stroke={GRID} strokeDasharray="2 4" horizontal vertical={false} />
              <XAxis type="number" dataKey="x" domain={z.domX} allowDataOverflow hide />
              <YAxis type="number" dataKey="y" domain={z.domY} allowDataOverflow ticks={[10, 20, 30, 40, 50, 60, 70, 80, 90]} tick={TICK_SM} axisLine={false} tickLine={false} />
              <ZAxis range={[40, 40]} />
              <ReferenceLine y={70} stroke="#f87171" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "overbought", fill: "#f87171", fontSize: 8, position: "right" }} />
              <ReferenceLine y={30} stroke="#34d399" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "oversold", fill: "#34d399", fontSize: 8, position: "right" }} />
              {avg != null && <ReferenceLine y={avg} stroke={GOLD} strokeDasharray="5 5" label={{ value: `avg ${avg.toFixed(0)}`, fill: GOLD, fontSize: 9, position: "right" }} />}
              <Tooltip cursor={{ strokeDasharray: "3 3", stroke: GOLD }} content={<RsiTip />} />
              <Scatter data={data} shape={<Dot />} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

// ── ATR LEVELS (daily range exhaustion) ──────────────────────────
const atrTier = (v) => (v >= 100 ? { k: "EXCEEDED", c: "#ef4444" } : v >= 80 ? { k: "CRITICAL", c: "#fb7185" } : v >= 60 ? { k: "HIGH", c: "#f59e0b" } : v >= 35 ? { k: "MODERATE", c: "#d4a853" } : { k: "FRESH", c: "#60a5fa" });

export function AtrLevelsTab({ view, deriv, openPair }) {
  const { t } = useTranslation();
  const { map: statusMap } = useSignalStatus() || {};
  const data = useMemo(() => {
    const out = [];
    rows(view, deriv).forEach((r) => {
      if (r.range24_pct == null || !r.atr_pct) return;
      // expected daily move ≈ 1h ATR × √24; exhaustion = today's realized range / expected
      const expDaily = r.atr_pct * 4.9;
      const exh = expDaily ? (r.range24_pct / expDaily) * 100 : null;
      if (exh == null) return;
      out.push({ pair: r.pair, exh, range: r.range24_pct, atr: r.atr_pct, tier: atrTier(exh) });
    });
    return out.sort((a, b) => b.exh - a.exh);
  }, [view, deriv]);

  const exceeded = data.filter((d) => d.exh >= 100).length;

  if (deriv?.warming) return <Warming text={t("terminal.viz.derivWarming")} />;
  if (!data.length) {
    return (
      <>
        <SectionBand title="ATR Levels" desc="How much of the expected daily range each call has already used." />
        <div className="rounded-2xl bg-[#0a0805] border border-white/[0.07] py-16 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">Warming up — range/ATR fills in after the next worker sweep.</div>
      </>
    );
  }
  const max = Math.max(...data.map((d) => d.exh), 120);

  return (
    <>
      <SectionBand title="ATR Levels" desc="Daily-range exhaustion: today's 24h range vs the expected daily move (1h ATR × √24). Near/over 100% = the coin has used up its typical range — momentum may be exhausted; fresh = room to run." />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Kpi label="Exceeded ≥100%" value={exceeded} desc="Used up their expected day — reversion risk." tone={exceeded ? "text-negative" : undefined} />
        <Kpi label="Most exhausted" value={data[0] ? `${data[0].exh.toFixed(0)}%` : "—"} desc={data[0] ? sym(data[0].pair) : "—"} tone="text-negative" />
        <Kpi label="Freshest" value={data[data.length - 1] ? `${data[data.length - 1].exh.toFixed(0)}%` : "—"} desc={data[data.length - 1] ? sym(data[data.length - 1].pair) : "—"} tone="text-positive" />
        <Kpi label="Instruments" value={data.length} desc="Called pairs with range + ATR." />
      </div>
      <div className="relative rounded-2xl bg-[#0a0805] border border-white/[0.07] overflow-hidden">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />
        <div className="px-4 py-2 flex items-center gap-3 border-b border-white/[0.05] font-mono text-[8.5px] uppercase tracking-wider text-text-muted/70">
          <span className="w-24">pair</span><span className="flex-1">exhaustion (100% = full expected day)</span><span className="w-14 text-right">used</span>
        </div>
        <ScrollArea max={600} className="px-3 py-2">
          {data.map((d) => {
            const sc = statusColorOf(statusMap, d.pair);
            const w = Math.min((d.exh / max) * 100, 100);
            return (
              <button key={d.pair} onClick={() => openPair(d.pair)} className="w-full flex items-center gap-2 py-1 group">
                <span className="w-24 flex items-center gap-1.5 shrink-0">
                  <CoinLogo pair={d.pair} size={15} />
                  <span className="font-mono text-[10.5px] text-white/85 group-hover:text-gold-primary truncate">{sym(d.pair)}</span>
                </span>
                <span className="flex-1 h-4 rounded-sm bg-white/[0.03] overflow-hidden relative">
                  <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${w}%`, background: d.tier.c, opacity: 0.85, outline: sc ? `1px solid ${sc}` : "none" }} />
                  <span className="absolute top-0 bottom-0 border-l border-dashed border-white/25" style={{ left: `${Math.min((100 / max) * 100, 100)}%` }} />
                </span>
                <span className="w-14 text-right font-mono text-[10.5px] tabular-nums" style={{ color: d.tier.c }}>{d.exh.toFixed(0)}%</span>
              </button>
            );
          })}
        </ScrollArea>
      </div>
    </>
  );
}
