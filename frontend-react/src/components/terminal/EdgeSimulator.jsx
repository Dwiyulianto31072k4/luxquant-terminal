// ════════════════════════════════════════════════════════════════
// Edge Simulator — visual "where is the real edge" tab.
//
// Plots every confluence pattern by SAMPLE SIZE (x, log) vs HISTORICAL
// WIN RATE (y), colored by expected value, sized by sample. A gold
// baseline line marks the overall win rate, so users instantly SEE which
// setups genuinely beat the average with enough data to trust — vs
// small-sample noise. Click a pattern → the real signals behind it (with
// outcomes) drill in below.
//
// Data: /api/v1/analytics/edge-lab (pattern_ev, totals) + /drill.
// All real, resolved historical outcomes — no synthetic numbers.
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
 ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
 CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import CoinLogo from "../CoinLogo";
import { edgeLabApi } from "../../services/edgeLabApi";
import { GOLD, GRID, AXIS, TICK_SM, SectionBand, Kpi, Warming, useZoom, API_BASE, authHeaders } from "./vizShared";

const nice = (tag) => (tag || "").replaceAll("_", " ").toLowerCase();
const evColor = (ev) => (ev == null ? "rgb(var(--fg-muted))" : ev >= 0 ? "rgb(var(--pos))" : "rgb(var(--neg))");
const TIER = { reliable: "rgb(var(--pos))", moderate: "rgb(var(--accent))", unreliable: "rgb(var(--fg-muted))" };

function EdgeTip({ active, payload }) {
 if (!active || !payload?.length) return null;
 const p = payload[0]?.payload?.d;
 if (!p) return null;
 return (
 <div className="rounded-md bg-surface-secondary border border-ink/12 px-3 py-2 font-mono text-[10px] shadow-lg max-w-[250px]">
 <div className="text-text-primary mb-1">{nice(p.pattern)}</div>
 <div className="text-text-primary/60">Win rate: <span className="text-text-primary/90">{p.win_rate?.toFixed(1)}%</span></div>
 <div className="text-text-primary/60">Expected value: <span style={{ color: evColor(p.expected_value) }}>{p.expected_value == null ? "—" : (p.expected_value >= 0 ? "+" : "") + p.expected_value.toFixed(2) + "%/trade"}</span></div>
 <div className="text-text-primary/60">Sample: <span className="text-text-primary/90">{p.count}</span> · <span style={{ color: TIER[p.reliability] || "#9ca3af" }}>{p.reliability}</span></div>
 <div className="text-text-muted mt-1">click → signals behind it</div>
 </div>
 );
}

export function EdgeTab() {
 const { t } = useTranslation();
 const [days, setDays] = useState(30);
 const [data, setData] = useState(null);
 const [loading, setLoading] = useState(true);
 const [sel, setSel] = useState(null);
 const [drill, setDrill] = useState(null);
 const [drillLoading, setDrillLoading] = useState(false);

 useEffect(() => {
 let alive = true;
 setLoading(true);
 edgeLabApi.getEdgeLab(days, "all")
 .then((d) => { if (alive) { setData(d); setLoading(false); } })
 .catch(() => { if (alive) setLoading(false); });
 return () => { alive = false; };
 }, [days]);

 const pev = useMemo(() => (data?.pattern_ev || []).filter((p) => (p.count || 0) > 0), [data]);
 const baseline = data?.totals?.win_rate ?? null;

 // ── Edge Economics: expectancy, profit factor, realized R:R — period-filterable ──
 // analyze supports time_range (7d/30d/ytd/all); tier avg exit gains come from the
 // all-time journey aggregate (a "typical exit" figure, stable across windows).
 const [econ, setEcon] = useState(null);
 const [econRange, setEconRange] = useState("all");
 useEffect(() => {
 let alive = true;
 Promise.all([
 fetch(`${API_BASE}/api/v1/signals/analyze?time_range=${econRange}`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
 fetch(`${API_BASE}/api/v1/signals/journey-insights/ALL`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
 ]).then(([a, j]) => {
 if (!alive) return;
 const tierAvg = {};
 (j?.hit_rate_per_tp || []).forEach((h) => { tierAvg[h.tp] = h.avg_exit_gain_pct; });
 setEcon({ stats: a?.stats || null, tierAvg });
 });
 return () => { alive = false; };
 }, [econRange]);

 const economics = useMemo(() => {
 const s = econ?.stats, ta = econ?.tierAvg;
 if (!s || !ta) return null;
 const closed = s.closed_trades || ((s.tp1_count || 0) + (s.tp2_count || 0) + (s.tp3_count || 0) + (s.tp4_count || 0) + (s.sl_count || 0));
 if (!closed) return null;
 const tiers = [
 { k: "TP1", n: s.tp1_count || 0, avg: ta.TP1 ?? 0, color: "rgb(var(--pos))" },
 { k: "TP2", n: s.tp2_count || 0, avg: ta.TP2 ?? 0, color: "rgb(var(--pos))" },
 { k: "TP3", n: s.tp3_count || 0, avg: ta.TP3 ?? 0, color: "#86efac" },
 { k: "TP4", n: s.tp4_count || 0, avg: ta.TP4 ?? 0, color: GOLD },
 { k: "SL", n: s.sl_count || 0, avg: ta.SL ?? 0, color: "rgb(var(--neg))" },
 ];
 let grossWin = 0, grossLoss = 0, exp = 0;
 tiers.forEach((tt) => {
 exp += (tt.n / closed) * tt.avg;
 if (tt.avg >= 0) grossWin += tt.n * tt.avg; else grossLoss += tt.n * Math.abs(tt.avg);
 });
 const pf = grossLoss ? grossWin / grossLoss : null;
 const avgLoss = Math.abs(ta.SL ?? 0) || null;
 const avgR = avgLoss ? exp / avgLoss : null;
 return { closed, tiers, exp, pf, avgR, winRate: s.win_rate };
 }, [econ]);

 const openDrill = useCallback((pattern) => {
 setSel(pattern);
 setDrill(null);
 setDrillLoading(true);
 edgeLabApi.getDrill("pattern", pattern, days, "all", 200)
 .then((d) => setDrill(d))
 .catch(() => setDrill(null))
 .finally(() => setDrillLoading(false));
 }, [days]);

 const pts = useMemo(
 () => pev.map((p) => ({ x: Math.max(p.count, 1), y: p.win_rate ?? 0, z: Math.max(p.count, 1), d: p })),
 [pev]
 );
 const bestEV = useMemo(() => {
 const rel = pev.filter((p) => p.reliability !== "unreliable" && p.expected_value != null);
 return [...rel].sort((a, b) => b.expected_value - a.expected_value)[0] || null;
 }, [pev]);
 const posCount = pev.filter((p) => (p.expected_value ?? 0) > 0).length;

 // pan/zoom (seeded from the data extent; hook stays unconditional)
 const xsA = pts.map((p) => p.x), ysA = pts.map((p) => p.y);
 const zEdge = useZoom(
 xsA.length ? Math.min(...xsA) : 1, xsA.length ? Math.max(...xsA) : 10,
 ysA.length ? Math.min(...ysA) : 0, ysA.length ? Math.max(...ysA) : 100,
 );

 const Dot = (props) => {
 const { cx, cy, payload } = props;
 if (cx == null || cy == null) return null;
 const p = payload.d;
 const r = 5 + Math.min(15, Math.sqrt(p.count) * 1.1);
 const active = sel === p.pattern;
 const show = p.reliability === "reliable" || active;
 return (
 <g style={{ cursor: "pointer" }} onClick={() => openDrill(p.pattern)}>
 <circle cx={cx} cy={cy} r={r} fill={evColor(p.expected_value)} fillOpacity={active ? 0.85 : 0.5}
 stroke={active ? GOLD : "rgb(var(--scrim) / 0.35)"} strokeWidth={active ? 1.6 : 0.6} />
 {show && <text x={cx} y={cy - r - 3} textAnchor="middle" fontFamily="monospace" fontSize={8.5} fill="rgb(var(--ink) / 0.6)" pointerEvents="none">{nice(p.pattern)}</text>}
 </g>
 );
 };

 return (
 <>
 <SectionBand title={t("terminal.viz.tabEdge")} desc={t("terminal.viz.edgeDesc")} />

 <div className="flex items-center gap-1 rounded-md bg-surface-raised border border-ink/[0.1] p-0.5 w-fit">
 <span className="px-1.5 font-mono text-[8.5px] uppercase tracking-[0.15em] text-text-muted/70">{t("terminal.viz.edgeLookback")}</span>
 {[7, 30, 90].map((dv) => (
 <button key={dv} onClick={() => setDays(dv)}
 className={`px-2.5 py-1 rounded-sm font-mono text-[9.5px] uppercase tracking-wider transition-colors ${days === dv ? "bg-accent text-accent-fg font-semibold" : "text-text-muted hover:text-text-primary"}`}>
 {dv}d
 </button>
 ))}
 </div>

 {loading ? (
 <Warming text={t("terminal.viz.edgeLoading")} />
 ) : pev.length === 0 ? (
 <div className="rounded-2xl bg-surface-raised border border-ink/[0.07] py-16 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">{t("terminal.viz.edgeEmpty")}</div>
 ) : (
 <>
 <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
 <Kpi label={t("terminal.viz.edgeKBaseline")} value={baseline == null ? "—" : baseline.toFixed(1) + "%"} desc={t("terminal.viz.edgeKBaselineDesc")} tone="text-text-primary" />
 <Kpi label={t("terminal.viz.edgeKBreadth")} value={`${posCount}/${pev.length}`} desc={t("terminal.viz.edgeKBreadthDesc")} tone={posCount ? "text-positive" : undefined} />
 <Kpi label={t("terminal.viz.edgeKBest")} value={bestEV ? nice(bestEV.pattern) : "—"} desc={bestEV ? `+${bestEV.expected_value.toFixed(2)}%/trade · ${bestEV.win_rate?.toFixed(0)}% WR` : "—"} tone="text-positive" />
 <Kpi label={t("terminal.viz.edgeKSample")} value={data?.totals?.signals_resolved != null ? data.totals.signals_resolved.toLocaleString() : "—"} desc={t("terminal.viz.edgeKSampleDesc")} />
 </div>

 {/* ── Edge Economics — the money math (all-time) ── */}
 {economics && (
 <div className="relative rounded-2xl bg-surface-raised border border-ink/[0.07] overflow-hidden">
 <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink/12 to-transparent" />
 <div className="px-4 py-2.5 border-b border-ink/[0.12] bg-ink/[0.03]">
 <div className="flex items-center justify-between gap-3 flex-wrap">
 <div className="text-[12.5px] text-text-primary/90">Edge Economics</div>
 <div className="flex items-center gap-0.5 rounded-md bg-surface-raised border border-ink/[0.1] p-0.5">
 {[["7d", "7D"], ["30d", "30D"], ["ytd", "YTD"], ["all", "ALL"]].map(([v, lbl]) => (
 <button key={v} onClick={() => setEconRange(v)}
 className={`px-2.5 py-1 rounded-sm font-mono text-[9.5px] uppercase tracking-wider transition-colors ${econRange === v ? "bg-accent text-accent-fg font-semibold" : "text-text-muted hover:text-text-primary"}`}>
 {lbl}
 </button>
 ))}
 </div>
 </div>
 <div className="text-[10px] text-text-muted mt-0.5 leading-relaxed">Win rate alone is marketing. This is the money math: expected profit per trade, profit factor, realized reward:risk, and where winners exit.</div>
 </div>
 <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 p-3">
 <Kpi label="Expectancy / trade" value={(economics.exp >= 0 ? "+" : "") + economics.exp.toFixed(2) + "%"} desc="Avg % return per signal across every outcome." tone={economics.exp >= 0 ? "text-positive" : "text-negative"} />
 <Kpi label="Profit Factor" value={economics.pf == null ? "—" : economics.pf.toFixed(2)} desc="Gross win ÷ gross loss. >1 = profitable." tone={economics.pf >= 1.5 ? "text-positive" : undefined} />
 <Kpi label="Reward : Risk" value={economics.avgR == null ? "—" : economics.avgR.toFixed(2) + "R"} desc="Expectancy in units of the average loss." tone="text-text-primary" />
 <Kpi label="Win Rate" value={economics.winRate != null ? economics.winRate.toFixed(1) + "%" : "—"} desc={`${economics.closed.toLocaleString()} resolved`} />
 </div>
 <div className="px-4 pb-4 space-y-1.5">
 <div className="font-mono text-[9px] uppercase tracking-widest text-text-muted/60 mb-1">Where winners exit · share &amp; avg P/L</div>
 {economics.tiers.map((tt) => {
 const share = (tt.n / economics.closed) * 100;
 return (
 <div key={tt.k} className="flex items-center gap-2">
 <span className="w-9 font-mono text-[10px] font-bold" style={{ color: tt.color }}>{tt.k}</span>
 <div className="flex-1 h-3.5 rounded bg-ink/[0.04] overflow-hidden">
 <div className="h-full rounded" style={{ width: `${share}%`, background: tt.color, opacity: 0.85 }} />
 </div>
 <span className="w-12 text-right font-mono text-[10px] text-text-primary/70">{share.toFixed(0)}%</span>
 <span className="w-16 text-right font-mono text-[10px]" style={{ color: tt.avg >= 0 ? "rgb(var(--pos))" : "rgb(var(--neg))" }}>{tt.avg >= 0 ? "+" : ""}{tt.avg.toFixed(1)}%</span>
 </div>
 );
 })}
 </div>
 </div>
 )}

 <div className="relative rounded-2xl bg-surface-raised border border-ink/[0.07] overflow-hidden">
 <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink/12 to-transparent" />
 <div className="px-4 py-2.5 border-b border-ink/[0.12] bg-ink/[0.03]">
 <div className="text-[12.5px] text-text-primary/90">{t("terminal.viz.edgeMapTitle")}</div>
 <div className="text-[10px] text-text-muted mt-0.5 leading-relaxed">{t("terminal.viz.edgeMapDesc")}</div>
 </div>
 <div
 className="p-3" style={{ height: 460, touchAction: "none", cursor: "grab" }}
 ref={zEdge.ref} onPointerDown={zEdge.onPointerDown} onPointerMove={zEdge.onPointerMove}
 onPointerUp={zEdge.onPointerUp} onPointerLeave={zEdge.onPointerUp} onClickCapture={zEdge.onClickCapture}
 onDoubleClick={zEdge.reset} title="drag to pan · wheel to zoom · double-click to reset"
 >
 <ResponsiveContainer width="100%" height="100%">
 <ScatterChart margin={{ top: 16, right: 24, left: 10, bottom: 28 }}>
 <CartesianGrid stroke={GRID} strokeDasharray="2 4" />
 <XAxis type="number" dataKey="x" scale="log" domain={[Math.max(zEdge.domX[0], 0.9), zEdge.domX[1]]} allowDataOverflow
 tick={TICK_SM} axisLine={false} tickLine={false}
 tickFormatter={(v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : Math.round(v))}
 label={{ value: "SAMPLE SIZE (log)", position: "insideBottom", offset: -14, fill: AXIS, fontSize: 9.5, fontFamily: "monospace" }} />
 <YAxis type="number" dataKey="y" domain={zEdge.domY} allowDataOverflow tick={TICK_SM} axisLine={false} tickLine={false}
 tickFormatter={(v) => Math.round(v) + "%"}
 label={{ value: "WIN RATE", angle: -90, position: "insideLeft", offset: 8, fill: AXIS, fontSize: 9.5, fontFamily: "monospace" }} />
 <ZAxis type="number" dataKey="z" range={[30, 60]} />
 {baseline != null && (
 <ReferenceLine y={baseline} stroke="rgb(var(--accent) / 0.45)" strokeDasharray="5 5"
 label={{ value: `baseline ${baseline.toFixed(0)}%`, fill: AXIS, fontSize: 9, position: "insideTopRight" }} />
 )}
 <Tooltip cursor={{ strokeDasharray: "3 3", stroke: GOLD }} content={<EdgeTip />} />
 <Scatter data={pts} shape={<Dot />} isAnimationActive={false} />
 </ScatterChart>
 </ResponsiveContainer>
 </div>
 </div>

 {sel && (
 <div className="relative rounded-2xl bg-surface-raised border border-ink/[0.07] overflow-hidden">
 <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ink/12 to-transparent" />
 <div className="px-4 py-2.5 border-b border-ink/[0.06] flex items-center justify-between gap-3">
 <span className="text-[12.5px] text-text-primary/90">{t("terminal.viz.edgeDrillTitle")} <span className="text-accent">{nice(sel)}</span></span>
 <button onClick={() => { setSel(null); setDrill(null); }} className="font-mono text-[10px] text-text-muted hover:text-text-primary shrink-0">✕</button>
 </div>
 {drillLoading ? (
 <Warming text={t("terminal.viz.edgeDrillLoading")} />
 ) : drill?.signals?.length ? (
 <>
 <div className="p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-[380px] overflow-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink/20">
 {drill.signals.slice(0, 120).map((s, i) => {
 const win = s.outcome && s.outcome !== "sl";
 const pk = s.peak_pct;
 return (
 <div key={s.signal_id || i} className="flex items-center gap-2 rounded-lg bg-ink/[0.02] border border-ink/[0.06] px-2.5 py-1.5">
 <CoinLogo pair={s.pair} size={18} />
 <span className="font-mono text-[11px] text-text-primary/85 truncate">{(s.pair || "").replace(/USDT$/i, "")}</span>
 <span className={`ml-auto font-mono text-[9px] uppercase px-1.5 py-0.5 rounded-sm ${win ? "text-positive bg-positive/10" : "text-negative bg-negative/10"}`}>{win ? (s.outcome || "win") : "sl"}</span>
 {pk != null && <span className={`font-mono text-[10px] tabular-nums shrink-0 ${pk >= 0 ? "text-positive" : "text-negative"}`}>{pk >= 0 ? "+" : ""}{pk.toFixed(1)}%</span>}
 </div>
 );
 })}
 </div>
 {drill.win_rate != null && (
 <div className="px-4 py-2.5 border-t border-ink/[0.06] font-mono text-[10px] text-text-muted">
 {drill.count} signals · <span className="text-text-primary/80">{drill.win_rate.toFixed(1)}% win rate</span>
 {baseline != null && (
 <span> · vs baseline {baseline.toFixed(1)}% (<span style={{ color: drill.win_rate >= baseline ? "rgb(var(--pos))" : "rgb(var(--neg))" }}>{drill.win_rate >= baseline ? "+" : ""}{(drill.win_rate - baseline).toFixed(1)}pp</span>)</span>
 )}
 </div>
 )}
 </>
 ) : (
 <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">{t("terminal.viz.edgeDrillEmpty")}</div>
 )}
 </div>
 )}
 </>
 )}
 </>
 );
}

export default EdgeTab;
