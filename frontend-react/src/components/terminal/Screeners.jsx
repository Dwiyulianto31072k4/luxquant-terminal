// ════════════════════════════════════════════════════════════════
// Screeners — RSI Heatmap + ATR Levels over the 7-day active signals.
// Inspired by pro FX terminals, adapted to crypto. Both read the deriv
// blob (rsi / atr_pct / range24_pct) joined to the called pairs.
// ════════════════════════════════════════════════════════════════
import { useMemo, useState } from "react";
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
// Multi-timeframe swing framework: 1H (entry timing) / 4H (primary) / 1D (trend).
const RSI_TFS = ["1h", "4h", "1d"];
const rsiOf = (r, tf) => (r?.[`rsi_${tf}`] != null ? r[`rsi_${tf}`] : r?.rsi);

function RsiTip({ active, payload, tf }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-md bg-surface-secondary border border-line/25 px-3 py-2 font-mono text-[10px] shadow-lg">
      <div className="flex items-center gap-1.5 mb-1"><CoinLogo pair={d.pair} size={16} /><span className="text-text-primary">{sym(d.pair)}</span></div>
      <div className="text-text-primary/60">RSI(14 · {tf}): <span className="text-text-primary/90">{d.y.toFixed(1)}</span></div>
      {d.pctb != null && <div className="text-text-primary/60">%B: <span className="text-text-primary/90">{d.pctb.toFixed(0)}</span> <span className="text-text-primary/40">{d.pctb >= 100 ? "above upper band" : d.pctb <= 0 ? "below lower band" : "in band"}</span></div>}
      <div className="text-text-primary/45">{d.band}{d.rsi != null && d.pctb != null && d.rsi <= 30 && d.pctb <= 5 ? " · double-oversold ✓" : d.rsi != null && d.pctb != null && d.rsi >= 70 && d.pctb >= 95 ? " · double-overbought ✗" : ""}</div>
    </div>
  );
}

// Solid Binance stops — distinct bands (strong ≠ full overbought red)
const rsiBand = (v) =>
  v >= 70 ? { k: "overbought", c: "#F6465D" }
  : v >= 60 ? { k: "strong", c: "#F0B90B" }      // stretched but not extreme — accent, not red
  : v > 40 ? { k: "neutral", c: "rgb(var(--fg) / 0.42)" }
  : v > 30 ? { k: "weak", c: "#3DDC97" }         // soft pos between mid and oversold
  : { k: "oversold", c: "#0ECB81" };

export function RsiHeatmapTab({ view, deriv, openPair }) {
  const { t } = useTranslation();
  const { map: statusMap } = useSignalStatus() || {};
  const [tf, setTf] = useState("4h"); // 4h = primary swing timeframe
  const z = useZoom(0, 1, 0, 100);
  const rs = useMemo(() => rows(view, deriv).filter((r) => rsiOf(r, tf) != null), [view, deriv, tf]);
  const data = useMemo(() => rs.map((r) => {
    const v = rsiOf(r, tf);
    const b = rsiBand(v);
    return { x: hashX(r.pair), y: v, pair: r.pair, band: b.k, fill: b.c, rsi: v, pctb: r[`pctb_${tf}`], sc: statusColorOf(statusMap, r.pair) };
  }), [rs, statusMap, tf]);
  const avg = rs.length ? rs.reduce((a, r) => a + rsiOf(r, tf), 0) / rs.length : null;
  const ob = rs.filter((r) => rsiOf(r, tf) >= 70).length;
  const os = rs.filter((r) => rsiOf(r, tf) <= 30).length;

  if (deriv?.warming) return <Warming text={t("terminal.viz.derivWarming")} />;

  const Dot = (props) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    return (
      <g style={{ cursor: "pointer" }} onClick={() => openPair(payload.pair)}>
        <circle
          cx={cx} cy={cy} r={5.5}
          fill={payload.fill} fillOpacity={0.95}
          stroke={payload.sc || "rgba(0,0,0,0.28)"}
          strokeWidth={payload.sc ? 1.8 : 0.7}
        />
        <text
          x={cx} y={cy - 9} textAnchor="middle"
          fontFamily="ui-monospace, monospace" fontSize={8.5} fontWeight={600}
          fill="rgb(var(--fg) / 0.72)"
          stroke="rgb(var(--surface-raised))" strokeWidth={2.4} paintOrder="stroke"
          pointerEvents="none"
        >
          {sym(payload.pair)}
        </text>
      </g>
    );
  };

  return (
    <>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <SectionBand title="RSI Heatmap" desc={`14-period RSI (${tf}) across every active call. Above 70 = overbought (stretched), below 30 = oversold. Dot ring = signal status.`} />
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-mono text-[8.5px] uppercase tracking-wider text-text-muted/70 mr-1">Timeframe</span>
          {RSI_TFS.map((f) => (
            <button key={f} onClick={() => setTf(f)}
              className={`rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${tf === f ? "border-transparent bg-accent text-accent-fg" : "border-ink/10 bg-surface-raised text-text-muted hover:border-ink/20 hover:text-text-primary"}`}>
              {f}{f === "4h" ? "★" : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Kpi label="Average RSI" value={avg == null ? "—" : avg.toFixed(1)} desc="Mean across active calls." tone={avg >= 60 ? "text-negative" : avg <= 40 ? "text-positive" : undefined} />
        <Kpi label="Overbought ≥70" value={ob} desc="Stretched — mean-reversion risk." tone={ob ? "text-negative" : undefined} />
        <Kpi label="Oversold ≤30" value={os} desc="Beaten down — bounce watch." tone={os ? "text-positive" : undefined} />
        <Kpi label="Instruments" value={rs.length} desc="Called pairs with RSI." />
      </div>
      <div className="relative rounded-2xl bg-surface-raised border border-ink/[0.07] overflow-hidden">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink/12 to-transparent" />
        <div className="p-3" style={{ height: 540, touchAction: "none", cursor: "grab" }}
          ref={z.ref} onPointerDown={z.onPointerDown} onPointerMove={z.onPointerMove} onPointerUp={z.onPointerUp} onPointerLeave={z.onPointerUp} onClickCapture={z.onClickCapture} onDoubleClick={z.reset}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 44, left: 4, bottom: 8 }}>
              <ReferenceArea y1={70} y2={100} fill="#F6465D" fillOpacity={0.07} />
              <ReferenceArea y1={30} y2={70} fill="rgb(var(--ink))" fillOpacity={0.03} />
              <ReferenceArea y1={0} y2={30} fill="#0ECB81" fillOpacity={0.07} />
              <CartesianGrid stroke={GRID} strokeDasharray="2 4" horizontal vertical={false} />
              <XAxis type="number" dataKey="x" domain={z.domX} allowDataOverflow hide />
              <YAxis type="number" dataKey="y" domain={z.domY} allowDataOverflow ticks={[10, 20, 30, 40, 50, 60, 70, 80, 90]} tick={TICK_SM} axisLine={false} tickLine={false} />
              <ZAxis range={[40, 40]} />
              <ReferenceLine y={70} stroke="rgb(var(--neg))" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "overbought", fill: "rgb(var(--neg))", fontSize: 8, position: "right" }} />
              <ReferenceLine y={30} stroke="rgb(var(--pos))" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "oversold", fill: "rgb(var(--pos))", fontSize: 8, position: "right" }} />
              {avg != null && <ReferenceLine y={avg} stroke={GOLD} strokeDasharray="5 5" label={{ value: `avg ${avg.toFixed(0)}`, fill: GOLD, fontSize: 9, position: "right" }} />}
              <Tooltip cursor={{ strokeDasharray: "3 3", stroke: GOLD }} content={<RsiTip tf={tf} />} />
              <Scatter data={data} shape={<Dot />} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

// ── ATR LEVELS (daily range exhaustion) ──────────────────────────
const atrTier = (v) => (v >= 100 ? { k: "EXCEEDED", c: "rgb(var(--neg))" } : v >= 80 ? { k: "CRITICAL", c: "rgb(var(--neg))" } : v >= 60 ? { k: "HIGH", c: "rgb(var(--warn))" } : v >= 35 ? { k: "MODERATE", c: "rgb(var(--accent))" } : { k: "FRESH", c: "rgb(56 189 248)" });

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
        <div className="rounded-2xl bg-surface-raised border border-ink/[0.07] py-16 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">Warming up — range/ATR fills in after the next worker sweep.</div>
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
      <div className="relative rounded-2xl bg-surface-raised border border-ink/[0.07] overflow-hidden">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink/12 to-transparent" />
        <div className="px-4 py-2 flex items-center gap-3 border-b border-ink/[0.05] font-mono text-[8.5px] uppercase tracking-wider text-text-muted/70">
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
                  <span className="font-mono text-[10.5px] text-text-primary/85 group-hover:text-text-primary truncate">{sym(d.pair)}</span>
                </span>
                <span className="flex-1 h-4 rounded-sm bg-ink/[0.03] overflow-hidden relative">
                  <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${w}%`, background: d.tier.c, opacity: 0.85, outline: sc ? `1px solid ${sc}` : "none" }} />
                  <span className="absolute top-0 bottom-0 border-l border-dashed border-ink/25" style={{ left: `${Math.min((100 / max) * 100, 100)}%` }} />
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

// ── VOLATILITY SQUEEZE (Bollinger Band-Width percentile) ─────────
// Low band-width percentile = the coin's range has contracted vs its own
// history → "coiling" before a breakout. Distinct from the positioning
// Squeeze tab (funding × L/S); this is pure volatility structure.
const sqzTier = (v) => (v <= 10 ? { k: "COILED", c: "rgb(34 211 238)" } : v <= 25 ? { k: "TIGHT", c: "rgb(var(--pos))" } : v <= 50 ? { k: "NORMAL", c: "rgb(var(--accent))" } : v <= 75 ? { k: "LOOSE", c: "rgb(var(--warn))" } : { k: "EXPANDED", c: "rgb(var(--neg))" });

export function VolSqueezeTab({ view, deriv, openPair }) {
  const { t } = useTranslation();
  const { map: statusMap } = useSignalStatus() || {};
  const [tf, setTf] = useState("4h");
  const data = useMemo(() => {
    const out = [];
    rows(view, deriv).forEach((r) => {
      const bw = r[`bbwpct_${tf}`];
      if (bw == null) return;
      out.push({ pair: r.pair, bw, pctb: r[`pctb_${tf}`], tier: sqzTier(bw) });
    });
    return out.sort((a, b) => a.bw - b.bw); // tightest first
  }, [view, deriv, tf]);

  const coiled = data.filter((d) => d.bw <= 10).length;
  if (deriv?.warming) return <Warming text={t("terminal.viz.derivWarming")} />;

  return (
    <>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <SectionBand title="Volatility Squeeze" desc={`Bollinger band-width percentile (${tf}) vs each coin's own recent history. Low = range has contracted → coiling before expansion. Ring = signal status.`} />
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-mono text-[8.5px] uppercase tracking-wider text-text-muted/70 mr-1">Timeframe</span>
          {RSI_TFS.map((f) => (
            <button key={f} onClick={() => setTf(f)}
              className={`rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${tf === f ? "border-transparent bg-accent text-accent-fg" : "border-ink/10 bg-surface-raised text-text-muted hover:border-ink/20 hover:text-text-primary"}`}>
              {f}{f === "4h" ? "★" : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Kpi label="Coiled ≤10%" value={coiled} desc="Tightest ranges — breakout fuel." tone={coiled ? "text-positive" : undefined} />
        <Kpi label="Most coiled" value={data[0] ? `${data[0].bw.toFixed(0)}%` : "—"} desc={data[0] ? sym(data[0].pair) : "—"} tone="text-positive" />
        <Kpi label="Most expanded" value={data.length ? `${data[data.length - 1].bw.toFixed(0)}%` : "—"} desc={data.length ? sym(data[data.length - 1].pair) : "—"} tone="text-negative" />
        <Kpi label="Instruments" value={data.length} desc="Called pairs with band width." />
      </div>
      {!data.length ? (
        <div className="rounded-2xl bg-surface-raised border border-ink/[0.07] py-16 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">Warming up — band width fills in after the next worker sweep.</div>
      ) : (
        <div className="relative rounded-2xl bg-surface-raised border border-ink/[0.07] overflow-hidden">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink/12 to-transparent" />
          <div className="px-4 py-2 flex items-center gap-3 border-b border-ink/[0.05] font-mono text-[8.5px] uppercase tracking-wider text-text-muted/70">
            <span className="w-24">pair</span><span className="flex-1">coiling (full bar = tightest range)</span><span className="w-14 text-right">bw %ile</span>
          </div>
          <ScrollArea max={600} className="px-3 py-2">
            {data.map((d) => {
              const sc = statusColorOf(statusMap, d.pair);
              const w = Math.max(4, 100 - d.bw); // tighter → longer bar
              return (
                <button key={d.pair} onClick={() => openPair(d.pair)} className="w-full flex items-center gap-2 py-1 group">
                  <span className="w-24 flex items-center gap-1.5 shrink-0">
                    <CoinLogo pair={d.pair} size={15} />
                    <span className="font-mono text-[10.5px] text-text-primary/85 group-hover:text-text-primary truncate">{sym(d.pair)}</span>
                  </span>
                  <span className="flex-1 h-4 rounded-sm bg-ink/[0.03] overflow-hidden relative">
                    <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${w}%`, background: d.tier.c, opacity: 0.85, outline: sc ? `1px solid ${sc}` : "none" }} />
                  </span>
                  <span className="w-14 text-right font-mono text-[10.5px] tabular-nums" style={{ color: d.tier.c }}>{d.bw.toFixed(0)}%</span>
                </button>
              );
            })}
          </ScrollArea>
        </div>
      )}
    </>
  );
}

// ── ORDER FLOW (Cumulative Volume Delta) ─────────────────────────
// Y = net taker USD (buy − sell) over 1h; X = 24h price change. The
// divergence quadrants are the read: price up + CVD down = a rally being
// sold into (distribution); price down + CVD up = quiet accumulation.
const fmtUsd = (v) => {
  const a = Math.abs(v); const s = v < 0 ? "-" : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
};

function FlowTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-md bg-surface-secondary border border-line/25 px-3 py-2 font-mono text-[10px] shadow-lg">
      <div className="flex items-center gap-1.5 mb-1"><CoinLogo pair={d.pair} size={16} /><span className="text-text-primary">{sym(d.pair)}</span></div>
      <div className="text-text-primary/60">CVD 1h: <span className={d.y >= 0 ? "text-positive" : "text-negative"}>{fmtUsd(d.y)}</span></div>
      <div className="text-text-primary/60">Price 24h: <span className={d.x >= 0 ? "text-positive" : "text-negative"}>{d.x.toFixed(1)}%</span></div>
      {d.imb != null && <div className="text-text-primary/60">Book: <span className={d.imb >= 0 ? "text-positive" : "text-negative"}>{d.imb >= 0 ? "+" : ""}{d.imb.toFixed(0)}%</span> <span className="text-text-primary/40">{d.imb >= 0 ? "bid-stacked" : "ask-stacked"}</span></div>}
      <div className="text-text-primary/45">{d.tag}</div>
    </div>
  );
}

export function OrderFlowTab({ view, deriv, cvd, ob, openPair }) {
  const { t } = useTranslation();
  const { map: statusMap } = useSignalStatus() || {};

  const book = ob?.pairs || {};
  const rowsD = useMemo(() => {
    const seen = new Set();
    const flow = cvd?.pairs || {};
    const out = [];
    (view || []).forEach((s) => {
      if (!s.pair || seen.has(s.pair)) return;
      const c = flow[s.pair];
      const d = deriv?.pairs?.[s.pair];
      if (!c || c.cvd_1h == null) return;
      seen.add(s.pair);
      const x = d?.price_chg_24h ?? 0;
      const y = c.cvd_1h;
      const tag = x >= 0 && y < 0 ? "distribution — sold into strength"
        : x < 0 && y > 0 ? "accumulation — bought on weakness"
          : x >= 0 && y >= 0 ? "healthy up — buyers confirm"
            : "healthy down — sellers confirm";
      out.push({ pair: s.pair, x, y, tag, imb: book[s.pair]?.imb, sc: statusColorOf(statusMap, s.pair) });
    });
    return out;
  }, [view, deriv, cvd, book, statusMap]);

  const bookRows = useMemo(() => rowsD.filter((r) => r.imb != null).map((r) => ({ pair: r.pair, imb: r.imb })), [rowsD]);
  const bidStacked = useMemo(() => [...bookRows].sort((a, b) => b.imb - a.imb).slice(0, 6), [bookRows]);
  const askStacked = useMemo(() => [...bookRows].sort((a, b) => a.imb - b.imb).slice(0, 6), [bookRows]);

  const dom = useMemo(() => {
    if (!rowsD.length) return { x: [-10, 10], y: [-1e6, 1e6] };
    const xs = rowsD.map((r) => r.x), ys = rowsD.map((r) => r.y);
    const xa = Math.max(Math.abs(Math.min(...xs)), Math.abs(Math.max(...xs)), 2);
    const ya = Math.max(Math.abs(Math.min(...ys)), Math.abs(Math.max(...ys)), 1000);
    return { x: [-xa * 1.15, xa * 1.15], y: [-ya * 1.15, ya * 1.15] };
  }, [rowsD]);

  const z = useZoom(dom.x[0], dom.x[1], dom.y[0], dom.y[1]);
  const distrib = rowsD.filter((r) => r.x >= 0 && r.y < 0).sort((a, b) => a.y - b.y).slice(0, 6);
  const accum = rowsD.filter((r) => r.x < 0 && r.y > 0).sort((a, b) => b.y - a.y).slice(0, 6);

  if (cvd?.warming) return <Warming text="Warming up — order flow streams in after the trade-feed connects." />;
  if (!rowsD.length) return (<><SectionBand title="Order Flow (CVD)" desc="Cumulative volume delta vs price. Streaming in…" /><div className="rounded-2xl bg-surface-raised border border-ink/[0.07] py-16 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">Waiting for the trade feed…</div></>);

  const Dot = (props) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    const c = payload.y >= 0 ? "rgb(var(--pos))" : "rgb(var(--neg))";
    return (
      <g style={{ cursor: "pointer" }} onClick={() => openPair(payload.pair)}>
        <circle cx={cx} cy={cy} r={5} fill={c} fillOpacity={0.8} stroke={payload.sc || "rgb(var(--scrim) / 0.35)"} strokeWidth={payload.sc ? 1.6 : 0.5} />
        <text x={cx} y={cy - 8} textAnchor="middle" fontFamily="monospace" fontSize={8} fill="rgb(var(--ink) / 0.55)" pointerEvents="none">{sym(payload.pair)}</text>
      </g>
    );
  };

  return (
    <>
      <SectionBand title="Order Flow (CVD)" desc="Net aggressive buying (green) vs selling (red) over 1h, plotted against 24h price. Watch the divergence corners: price up + CVD down = rally being sold into; price down + CVD up = quiet accumulation." />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Kpi label="Divergences" value={distrib.length + accum.length} desc="Price & flow disagree — highest-signal." tone={distrib.length + accum.length ? "text-warning" : undefined} />
        <Kpi label="Distribution" value={distrib.length} desc="Up on falling CVD — reversal risk." tone={distrib.length ? "text-negative" : undefined} />
        <Kpi label="Accumulation" value={accum.length} desc="Down on rising CVD — bounce watch." tone={accum.length ? "text-positive" : undefined} />
        <Kpi label="Instruments" value={rowsD.length} desc="Called pairs with live flow." />
      </div>
      <div className="relative rounded-2xl bg-surface-raised border border-ink/[0.07] overflow-hidden">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink/12 to-transparent" />
        <div className="p-3" style={{ height: 520, touchAction: "none", cursor: "grab" }}
          ref={z.ref} onPointerDown={z.onPointerDown} onPointerMove={z.onPointerMove} onPointerUp={z.onPointerUp} onPointerLeave={z.onPointerUp} onClickCapture={z.onClickCapture} onDoubleClick={z.reset}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="2 4" />
              <XAxis type="number" dataKey="x" domain={z.domX} allowDataOverflow tick={TICK_SM} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(0)}%`} />
              <YAxis type="number" dataKey="y" domain={z.domY} allowDataOverflow tick={TICK_SM} axisLine={false} tickLine={false} tickFormatter={fmtUsd} width={52} />
              <ZAxis range={[40, 40]} />
              <ReferenceLine x={0} stroke="rgb(var(--ink) / 0.25)" />
              <ReferenceLine y={0} stroke="rgb(var(--ink) / 0.25)" />
              <Tooltip cursor={{ strokeDasharray: "3 3", stroke: GOLD }} content={<FlowTip />} />
              <Scatter data={rowsD} shape={<Dot />} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-2">
        <div className="rounded-2xl bg-surface-raised border border-ink/[0.07] p-3">
          <div className="font-mono text-[9px] uppercase tracking-wider text-negative/80 mb-2">Distribution — up but sold into</div>
          {distrib.length ? distrib.map((d) => (
            <button key={d.pair} onClick={() => openPair(d.pair)} className="w-full flex items-center justify-between py-1 group">
              <span className="flex items-center gap-1.5"><CoinLogo pair={d.pair} size={14} /><span className="font-mono text-[10.5px] text-text-primary/85 group-hover:text-text-primary">{sym(d.pair)}</span></span>
              <span className="font-mono text-[10px] text-negative tabular-nums">{fmtUsd(d.y)}</span>
            </button>
          )) : <div className="font-mono text-[10px] text-text-muted py-2">None right now.</div>}
        </div>
        <div className="rounded-2xl bg-surface-raised border border-ink/[0.07] p-3">
          <div className="font-mono text-[9px] uppercase tracking-wider text-positive/80 mb-2">Accumulation — down but bought</div>
          {accum.length ? accum.map((d) => (
            <button key={d.pair} onClick={() => openPair(d.pair)} className="w-full flex items-center justify-between py-1 group">
              <span className="flex items-center gap-1.5"><CoinLogo pair={d.pair} size={14} /><span className="font-mono text-[10.5px] text-text-primary/85 group-hover:text-text-primary">{sym(d.pair)}</span></span>
              <span className="font-mono text-[10px] text-positive tabular-nums">{fmtUsd(d.y)}</span>
            </button>
          )) : <div className="font-mono text-[10px] text-text-muted py-2">None right now.</div>}
        </div>
      </div>

      {bookRows.length > 0 && (
        <>
          <SectionBand title="Order Book Pressure" desc="Passive intent from the live Binance book: resting bids vs asks (top-20 levels). Bid-stacked = buyers defending below; ask-stacked = sellers capping above. Pairs with aggressive CVD are the strongest reads." />
          <div className="grid md:grid-cols-2 gap-2">
            <div className="rounded-2xl bg-surface-raised border border-ink/[0.07] p-3">
              <div className="font-mono text-[9px] uppercase tracking-wider text-positive/80 mb-2">Bid-stacked — support below</div>
              {bidStacked.map((d) => (
                <button key={d.pair} onClick={() => openPair(d.pair)} className="w-full flex items-center gap-2 py-1 group">
                  <span className="w-20 flex items-center gap-1.5 shrink-0"><CoinLogo pair={d.pair} size={14} /><span className="font-mono text-[10.5px] text-text-primary/85 group-hover:text-text-primary truncate">{sym(d.pair)}</span></span>
                  <span className="flex-1 h-3 rounded-sm bg-ink/[0.03] overflow-hidden relative"><span className="absolute inset-y-0 left-0 rounded-sm bg-positive/70" style={{ width: `${Math.min(Math.abs(d.imb), 100)}%` }} /></span>
                  <span className="w-12 text-right font-mono text-[10px] text-positive tabular-nums">+{d.imb.toFixed(0)}%</span>
                </button>
              ))}
            </div>
            <div className="rounded-2xl bg-surface-raised border border-ink/[0.07] p-3">
              <div className="font-mono text-[9px] uppercase tracking-wider text-negative/80 mb-2">Ask-stacked — resistance above</div>
              {askStacked.map((d) => (
                <button key={d.pair} onClick={() => openPair(d.pair)} className="w-full flex items-center gap-2 py-1 group">
                  <span className="w-20 flex items-center gap-1.5 shrink-0"><CoinLogo pair={d.pair} size={14} /><span className="font-mono text-[10.5px] text-text-primary/85 group-hover:text-text-primary truncate">{sym(d.pair)}</span></span>
                  <span className="flex-1 h-3 rounded-sm bg-ink/[0.03] overflow-hidden relative"><span className="absolute inset-y-0 left-0 rounded-sm bg-negative/70" style={{ width: `${Math.min(Math.abs(d.imb), 100)}%` }} /></span>
                  <span className="w-12 text-right font-mono text-[10px] text-negative tabular-nums">{d.imb.toFixed(0)}%</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
