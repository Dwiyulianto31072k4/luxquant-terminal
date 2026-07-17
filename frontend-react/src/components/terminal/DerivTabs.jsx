// ════════════════════════════════════════════════════════════════
// Derivatives & vs-BTC tabs for Signals Analytics.
//
// Data: `deriv` blob from GET /api/v1/terminal/derivatives —
// precomputed in the background by app/services/terminal_worker.py
// (funding · OI + Δ · long/short · taker · RSI · volume Δ per pair).
// Never empty: endpoint serves fresh → stale → {warming:true}.
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip, Cell, ScatterChart, Scatter, ReferenceLine, ReferenceArea,
  LineChart, Line, Legend,
} from "recharts";
import CoinLogo from "../CoinLogo";
import {
  API_BASE, GOLD, POS, NEG, CYAN, PURPLE, ORANGE, GRAYBAR, GRID, AXIS, SERIES,
  TICK, TICK_SM, fmtPct, fmtMoney, makeBins, median,
  SectionBand, Kpi, XCard, useZoom, RankBars, CoinPill, DarkTip, ScatterTip,
  LegendChips, Warming, Chip, SegControl, ScrollArea, statusColorOf, fmtAxis,
} from "./vizShared";
import { useSignalStatus } from "../../context/SignalStatusContext";

// join view pairs with the deriv blob → one row per unique pair
function usePairRows(view, deriv, pairFc) {
  return useMemo(() => {
    const seen = new Set();
    const rows = [];
    const noDeriv = [];
    (view || []).forEach((s) => {
      if (!s.pair || seen.has(s.pair)) return;
      seen.add(s.pair);
      const d = deriv?.pairs?.[s.pair];
      if (!d) return;
      const row = { pair: s.pair, sector: s.sector, fc: pairFc[s.pair] ?? null, ...d };
      if (d.has_deriv) rows.push(row);
      else noDeriv.push(row);
    });
    return { rows, noDeriv };
  }, [view, deriv, pairFc]);
}

const NoDerivStrip = ({ noDeriv, onPair }) => {
  const { t } = useTranslation();
  if (!noDeriv.length) return null;
  return (
    <div className="rounded-lg border border-ink/[0.06] bg-ink/[0.01] px-4 py-2.5 flex items-center gap-2 flex-wrap">
      <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted/70 shrink-0">
        {t("terminal.viz.noDeriv")} · {noDeriv.length}
      </span>
      {noDeriv.slice(0, 12).map((d) => (
        <CoinPill key={d.pair} pair={d.pair} onPair={onPair} className="opacity-60" />
      ))}
      {noDeriv.length > 12 && (
        <span className="font-mono text-[9px] text-text-muted/60">+{noDeriv.length - 12}</span>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// TAB: OPEN INTEREST
// ════════════════════════════════════════════════════════════════
export function OITab({ view, deriv, pairFc, openPair }) {
  const { map: statusMap } = useSignalStatus() || {};
  const { t } = useTranslation();
  const { rows, noDeriv } = usePairRows(view, deriv, pairFc);
  const zQuad = useZoom(-20, 20, -15, 15);

  // clamp to the visible window so a freshly-listed pair with a huge OI jump
  // can't blow the axis up to 500,000% (outliers pin to the edge, still shown)
  const clampQ = (v, a, b) => Math.max(a, Math.min(b, v));
  const quad = useMemo(
    () => rows
      .filter((r) => r.oi_chg_1h != null && r.price_chg_24h != null)
      .map((r) => ({ x: clampQ(r.price_chg_24h, -20, 20), y: clampQ(r.oi_chg_1h, -15, 15), pair: r.pair })),
    [rows],
  );
  const oiTotal = rows.reduce((a, r) => a + (r.oi || 0), 0);
  const gain = [...rows].filter((r) => r.oi_chg_1h != null).sort((a, b) => b.oi_chg_1h - a.oi_chg_1h);
  const top = gain.slice(0, 8).map((r) => ({ pair: r.pair, v: r.oi_chg_1h }));
  const bottom = gain.slice(-8).reverse().map((r) => ({ pair: r.pair, v: r.oi_chg_1h }));
  // fallback so the tab is NEVER empty while OI-Δ is still warming:
  // rank the biggest leveraged books by notional (always present in the blob)
  const hasDelta = gain.length > 0;
  const bigOi = [...rows]
    .filter((r) => (r.oi || 0) > 0)
    .sort((a, b) => b.oi - a.oi)
    .slice(0, 14)
    .map((r) => ({ pair: r.pair, v: r.oi, color: GOLD }));

  if (deriv?.warming) return <Warming text={t("terminal.viz.derivWarming")} />;

  return (
    <>
      <SectionBand title={t("terminal.viz.tabOi")} desc={t("terminal.viz.oiSectionDesc")} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Kpi label={t("terminal.viz.kOiTotal")} value={fmtMoney(oiTotal)} desc={t("terminal.viz.kOiTotalDesc")} />
        <Kpi label={t("terminal.viz.kOiBuild")} value={gain[0] ? fmtPct(gain[0].oi_chg_1h) : "—"} desc={gain[0]?.pair} tone="text-positive" />
        <Kpi label={t("terminal.viz.kOiUnwind")} value={gain.length ? fmtPct(gain[gain.length - 1].oi_chg_1h) : "—"} desc={gain[gain.length - 1]?.pair} tone="text-negative" />
        <Kpi label={t("terminal.viz.kDerivCov")} value={`${rows.length}/${rows.length + noDeriv.length}`} desc={t("terminal.viz.kDerivCovDesc")} />
      </div>

      {hasDelta ? (
        <>
          <XCard
            title={t("terminal.viz.oiQuadTitle")}
            desc={t("terminal.viz.oiQuadDesc")}
            zoom={zQuad}
            hint={t("terminal.viz.oiQuadHint")}
            render={(h) => (
              <div style={{ height: Math.max(h, 300) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <ReferenceArea x1={0} x2={zQuad.domX[1]} y1={0} y2={zQuad.domY[1]} fill={POS} fillOpacity={0.04} />
                    <ReferenceArea x1={zQuad.domX[0]} x2={0} y1={0} y2={zQuad.domY[1]} fill={NEG} fillOpacity={0.04} />
                    <CartesianGrid stroke={GRID} />
                    <XAxis type="number" dataKey="x" tick={TICK} axisLine={false} tickLine={false} unit="%" domain={zQuad.domX} allowDataOverflow tickFormatter={(v) => Math.round(v)} />
                    <YAxis type="number" dataKey="y" tick={TICK} axisLine={false} tickLine={false} unit="%" domain={zQuad.domY} allowDataOverflow tickFormatter={(v) => Math.round(v)} />
                    <Tooltip content={<ScatterTip xLabel="price 24h %" yLabel="OI Δ1h %" />} cursor={{ strokeDasharray: "3 3", stroke: GOLD }} />
                    <ReferenceLine x={0} stroke="rgb(var(--ink) / 0.15)" />
                    <ReferenceLine y={0} stroke="rgb(var(--ink) / 0.15)" />
                    <Scatter data={quad} fillOpacity={0.85} onClick={(p) => { const d = p?.payload || p; if (d?.pair) openPair(d.pair); }}>
                      {quad.map((p, i) => { const sc = statusColorOf(statusMap, p.pair); return (
                        <Cell
                          key={i}
                          cursor="pointer"
                          fill={p.x >= 0 && p.y >= 0 ? POS : p.x < 0 && p.y >= 0 ? NEG : p.x >= 0 ? CYAN : ORANGE}
                          stroke={sc || undefined}
                          strokeWidth={sc ? 2 : 0}
                        />
                      ); })}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <XCard title={t("terminal.viz.oiTopTitle")} desc={t("terminal.viz.oiTopDesc")} render={() => <RankBars data={top} onPair={openPair} />} />
            <XCard title={t("terminal.viz.oiBottomTitle")} desc={t("terminal.viz.oiBottomDesc")} render={() => <RankBars data={bottom} onPair={openPair} />} />
          </div>
        </>
      ) : (
        <XCard
          title={t("terminal.viz.oiBigTitle")}
          desc={t("terminal.viz.oiBigDesc")}
          render={() => (
            <ScrollArea max={420}>
              <RankBars data={bigOi} onPair={openPair} fmt={fmtMoney} />
            </ScrollArea>
          )}
        />
      )}

      <NoDerivStrip noDeriv={noDeriv} onPair={openPair} />
    </>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB: LONG / SHORT
// ════════════════════════════════════════════════════════════════
const _liqAgo = (ts) => { const s = Math.max(0, Date.now() / 1000 - ts); return s < 60 ? `${s | 0}s` : `${(s / 60) | 0}m`; };

export function LongShortTab({ view, deriv, pairFc, openPair, liq }) {
  const { map: statusMap } = useSignalStatus() || {};
  const { t } = useTranslation();
  const { rows, noDeriv } = usePairRows(view, deriv, pairFc);
  const zDiv = useZoom(0, 4, 0, 4);
  // Histogram bin drill — click a bar → list pairs in that L/S band → open call
  const [lsBin, setLsBin] = useState(null); // { lo, hi, mid }

  const lsrVals = useMemo(
    () => rows.map((r) => r.lsr).filter((v) => v != null),
    [rows],
  );
  const lsrBins = useMemo(
    () => makeBins(lsrVals.map((v) => Math.min(v, 4)), 0.25, 0, 4),
    [lsrVals],
  );
  const binPairs = useMemo(() => {
    if (!lsBin) return [];
    return rows
      .filter((r) => r.lsr != null && r.lsr >= lsBin.lo && r.lsr < lsBin.hi)
      .map((r) => ({ pair: r.pair, lsr: r.lsr, fc: pairFc?.[r.pair] ?? r.fc }))
      .sort((a, b) => (b.lsr ?? 0) - (a.lsr ?? 0));
  }, [lsBin, rows, pairFc]);
  const crowdedLong = rows.filter((r) => (r.lsr ?? 0) > 2.5);
  const crowdedShort = rows.filter((r) => r.lsr != null && r.lsr < 0.7);
  const divPts = rows
    .filter((r) => r.lsr != null && r.top_lsr != null)
    .map((r) => ({
      x: Math.min(r.lsr, 4), y: Math.min(r.top_lsr, 4), pair: r.pair,
      smart: (r.lsr > 1.5 && r.top_lsr < 0.9) || (r.lsr < 0.8 && r.top_lsr > 1.3),
    }));
  const takers = [...rows]
    .filter((r) => r.taker != null)
    .map((r) => ({ pair: r.pair, v: (r.taker - 1) * 100 }))
    .sort((a, b) => b.v - a.v);

  const smartN = divPts.filter((p) => p.smart).length;
  const buyTakers = takers.filter((r) => r.v > 0).length;
  // shorts liquidated = price ripped higher (bullish flush / squeeze fuel)
  const shortsFlushedUsd = liq && !liq.warming ? (liq.short_usd_5m || 0) : null;
  const events = (liq?.events || []).slice(0, 24);

  if (deriv?.warming) return <Warming text={t("terminal.viz.derivWarming")} />;

  return (
    <div className="space-y-2.5">
      <SectionBand title={t("terminal.viz.tabLs")} desc={t("terminal.viz.lsSectionDesc")} />

      {/* Strength-focused KPIs (no “loser” framing) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Kpi
          compact
          label={t("terminal.viz.kSmartDiv")}
          value={smartN}
          sub={t("terminal.viz.kSmartDivDesc")}
          tone="text-gold-primary"
          accent={GOLD}
        />
        <Kpi
          compact
          label={t("terminal.viz.kCrowdShort")}
          value={crowdedShort.length}
          sub="squeeze fuel · upside"
          tone={crowdedShort.length ? "text-positive" : undefined}
          accent={crowdedShort.length ? POS : undefined}
        />
        <Kpi
          compact
          label="Buy takers"
          value={buyTakers}
          sub="pairs with buy pressure"
          tone={buyTakers ? "text-positive" : undefined}
          accent={buyTakers ? POS : undefined}
        />
        <Kpi
          compact
          label="Shorts flushed · 5m"
          value={shortsFlushedUsd != null ? fmtMoney(shortsFlushedUsd) : "—"}
          sub="squeeze fuel · upside"
          tone={shortsFlushedUsd ? "text-positive" : undefined}
          accent={shortsFlushedUsd ? POS : undefined}
        />
      </div>

      {/* Live liquidation tape */}
      <div className="rounded-xl border border-ink/[0.06] bg-ink/[0.02] overflow-hidden">
        <div className="px-3.5 py-2 border-b border-ink/[0.04] flex items-center justify-between gap-2">
          <div>
            <div className="text-[12.5px] font-medium text-text-primary/90">Liquidations · live</div>
            <div className="text-[10px] text-text-muted/70">Forced closes stream · big prints = local extremes</div>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums">
            <span className="text-negative">{fmtMoney(liq?.long_usd_5m || 0)} <span className="text-[9px] text-text-muted">L</span></span>
            <span className="text-positive">{fmtMoney(liq?.short_usd_5m || 0)} <span className="text-[9px] text-text-muted">S</span></span>
          </div>
        </div>
        {liq?.warming || !liq ? (
          <div className="py-8 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Connecting live tape…
          </div>
        ) : events.length === 0 ? (
          <div className="py-8 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Quiet — no liquidations in the last window
          </div>
        ) : (
          <div className="max-h-[260px] overflow-auto divide-y divide-ink/[0.03] [scrollbar-width:thin]">
            {events.map((e, i) => (
              <div key={`${e.pair}-${e.ts}-${i}`} className="flex items-center gap-2 px-3 py-1.5 hover:bg-ink/[0.02]">
                <CoinLogo pair={e.pair} size={15} />
                <span className="font-mono text-[11px] text-text-primary/85 w-16 truncate">{(e.pair || "").replace(/USDT$/i, "")}</span>
                <span
                  className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ color: e.side === "long" ? NEG : POS, background: `${e.side === "long" ? NEG : POS}18` }}
                >
                  {e.side}
                </span>
                <span className="ml-auto font-mono text-[11px] tabular-nums" style={{ color: e.side === "long" ? NEG : POS }}>
                  {fmtMoney(e.usd)}
                </span>
                <span className="w-8 text-right font-mono text-[9px] text-text-muted/60">{_liqAgo(e.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
        <XCard
          title={t("terminal.viz.lsrDistTitle")}
          desc={`${t("terminal.viz.lsrDistDesc")} Click a bar to list pairs → open call.`}
          height={320}
          render={(h) => (
            <div className="flex flex-col" style={{ height: h }}>
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={lsrBins}
                    margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                    style={{ cursor: "pointer" }}
                  >
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="x" tick={TICK_SM} axisLine={false} tickLine={false} />
                    <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<DarkTip />} cursor={{ fill: "rgb(var(--ink) / 0.06)" }} />
                    <ReferenceLine x="1" stroke="rgb(var(--ink) / 0.25)" strokeDasharray="3 3" />
                    <Bar
                      dataKey="count"
                      name="pairs"
                      radius={[3, 3, 0, 0]}
                      onClick={(data) => {
                        const p = data?.payload || data;
                        if (!p || p.count === 0) return;
                        const lo = Number(p.x);
                        const hi = lo + 0.25;
                        setLsBin({ lo, hi, mid: p.mid ?? (lo + hi) / 2 });
                      }}
                    >
                      {lsrBins.map((b, i) => (
                        <Cell
                          key={i}
                          fill={b.mid > 2.5 ? NEG : b.mid < 0.7 ? POS : "rgb(148 163 184)"}
                          fillOpacity={lsBin && Math.abs(lsBin.mid - b.mid) < 0.01 ? 1 : 0.75}
                          stroke={lsBin && Math.abs(lsBin.mid - b.mid) < 0.01 ? "rgb(var(--ink) / 0.5)" : "transparent"}
                          strokeWidth={1}
                          cursor="pointer"
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {lsBin && (
                <div className="mt-2 shrink-0 rounded-lg border border-ink/[0.07] bg-ink/[0.02]">
                  <div className="flex items-center justify-between gap-2 border-b border-ink/[0.05] px-2.5 py-1.5">
                    <span className="font-mono text-[10px] text-text-muted">
                      L/S {lsBin.lo.toFixed(2)}–{lsBin.hi.toFixed(2)}
                      <span className="ml-1.5 text-text-primary/70">{binPairs.length} pairs</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setLsBin(null)}
                      className="font-mono text-[9px] uppercase tracking-wider text-text-muted hover:text-text-primary"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="max-h-[120px] overflow-y-auto divide-y divide-ink/[0.04] [scrollbar-width:thin]">
                    {binPairs.length === 0 ? (
                      <div className="px-2.5 py-3 text-center font-mono text-[10px] text-text-muted">No pairs in band</div>
                    ) : (
                      binPairs.slice(0, 40).map((p) => (
                        <button
                          key={p.pair}
                          type="button"
                          onClick={() => openPair?.(p.pair)}
                          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition hover:bg-ink/[0.04]"
                        >
                          <CoinLogo pair={p.pair} size={16} />
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-primary">
                            {(p.pair || "").replace(/USDT$/i, "")}
                          </span>
                          <span className="font-mono text-[10px] tabular-nums text-text-muted">
                            L/S {p.lsr?.toFixed?.(2) ?? "—"}
                          </span>
                          <span
                            className={`font-mono text-[10px] tabular-nums ${
                              p.fc == null ? "text-text-muted" : p.fc >= 0 ? "text-positive" : "text-negative"
                            }`}
                          >
                            {p.fc == null ? "—" : fmtPct(p.fc, 1)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        />

        <XCard
          title={t("terminal.viz.lsDivTitle")}
          desc={t("terminal.viz.lsDivDesc")}
          zoom={zDiv}
          hint={t("terminal.viz.lsDivHint")}
          render={(h) => (
            <div style={{ height: h }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} />
                  <XAxis type="number" dataKey="x" tick={TICK} axisLine={false} tickLine={false} domain={zDiv.domX} allowDataOverflow tickFormatter={fmtAxis} />
                  <YAxis type="number" dataKey="y" tick={TICK} axisLine={false} tickLine={false} domain={zDiv.domY} allowDataOverflow tickFormatter={fmtAxis} />
                  <Tooltip content={<ScatterTip xLabel="retail LSR" yLabel="top-trader LSR" />} cursor={{ strokeDasharray: "3 3", stroke: GOLD }} />
                  <ReferenceLine x={1} stroke="rgb(var(--ink) / 0.15)" strokeDasharray="3 3" />
                  <ReferenceLine y={1} stroke="rgb(var(--ink) / 0.15)" strokeDasharray="3 3" />
                  <Scatter data={divPts} fillOpacity={0.85} onClick={(p) => { const d = p?.payload || p; if (d?.pair) openPair(d.pair); }}>
                    {divPts.map((p, i) => { const sc = statusColorOf(statusMap, p.pair); return (
                      <Cell key={i} fill={p.smart ? GOLD : GRAYBAR} stroke={sc || undefined} strokeWidth={sc ? 2 : 0} cursor="pointer" />
                    ); })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <XCard
          title={t("terminal.viz.takerTitle")}
          desc={t("terminal.viz.takerDesc")}
          render={() => <RankBars data={takers.slice(0, 8)} onPair={openPair} fmt={(v) => fmtPct(v, 1)} />}
        />
        <XCard
          title={t("terminal.viz.crowdedTitle")}
          desc={t("terminal.viz.crowdedDesc")}
          render={() => (
            <div className="py-2 space-y-3">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-negative/80 mb-1.5">
                  {t("terminal.viz.kCrowdLong")} — LSR &gt; 2.5
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {crowdedLong.length === 0 && <span className="font-mono text-[10px] text-text-muted">{t("terminal.viz.none")}</span>}
                  {crowdedLong.slice(0, 12).map((r) => (
                    <span key={r.pair} className="flex items-center gap-1.5 px-2 py-1 rounded-sm border border-negative/25 bg-negative/[0.06] font-mono text-[10px]">
                      <CoinPill pair={r.pair} onPair={openPair} />
                      <span className="text-negative">{r.lsr?.toFixed(2)}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-positive/80 mb-1.5">
                  {t("terminal.viz.kCrowdShort")} — LSR &lt; 0.7
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {crowdedShort.length === 0 && <span className="font-mono text-[10px] text-text-muted">{t("terminal.viz.none")}</span>}
                  {crowdedShort.slice(0, 12).map((r) => (
                    <span key={r.pair} className="flex items-center gap-1.5 px-2 py-1 rounded-sm border border-positive/25 bg-positive/[0.06] font-mono text-[10px]">
                      <CoinPill pair={r.pair} onPair={openPair} />
                      <span className="text-positive">{r.lsr?.toFixed(2)}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        />
      </div>

      <NoDerivStrip noDeriv={noDeriv} onPair={openPair} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB: FUNDING & SQUEEZE
// ════════════════════════════════════════════════════════════════
export function FundingTab({ view, deriv, pairFc, openPair }) {
  const { map: statusMap } = useSignalStatus() || {};
  const { t } = useTranslation();
  const { rows, noDeriv } = usePairRows(view, deriv, pairFc);
  const zFund = useZoom(-0.15, 0.15, -30, 30);

  const withF = rows.filter((r) => r.funding != null).map((r) => ({ ...r, fPct: r.funding * 100 }));
  const sorted = [...withF].sort((a, b) => a.fPct - b.fPct);
  const negTop = sorted.slice(0, 8).map((r) => ({ pair: r.pair, v: r.fPct }));
  const posTop = sorted.slice(-8).reverse().map((r) => ({ pair: r.pair, v: r.fPct }));

  // perp premium / basis (mark vs index) — rich = greed, inverted = stress
  const withB = rows.filter((r) => r.basis != null);
  const bSorted = [...withB].sort((a, b) => a.basis - b.basis);
  const basisRich = bSorted.slice(-8).reverse().map((r) => ({ pair: r.pair, v: r.basis }));
  const basisCheap = bSorted.slice(0, 8).map((r) => ({ pair: r.pair, v: r.basis }));
  const fmtBasis = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}%`;

  // squeeze composite: shorts paying + OI building + price rising
  const shortSqueeze = withF
    .filter((r) => r.fPct < -0.005 && (r.oi_chg_1h ?? 0) > 1 && (r.price_chg_24h ?? 0) > 0)
    .sort((a, b) => a.fPct - b.fPct);
  const longSqueeze = withF
    .filter((r) => r.fPct > 0.02 && (r.oi_chg_1h ?? 0) > 1 && (r.price_chg_24h ?? 0) < 0)
    .sort((a, b) => b.fPct - a.fPct);

  const fundFc = withF
    .filter((r) => r.fc != null)
    .map((r) => ({ x: r.fPct, y: r.fc, pair: r.pair, neg: r.fPct < 0 }));

  if (deriv?.warming) return <Warming text={t("terminal.viz.derivWarming")} />;

  return (
    <>
      <SectionBand title={t("terminal.viz.tabFunding")} desc={t("terminal.viz.fundSectionDesc")} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Kpi label={t("terminal.viz.kFundNeg")} value={negTop[0] ? `${negTop[0].v.toFixed(3)}%` : "—"} desc={negTop[0]?.pair} tone="text-positive" />
        <Kpi label={t("terminal.viz.kFundPos")} value={posTop[0] ? `+${posTop[0].v.toFixed(3)}%` : "—"} desc={posTop[0]?.pair} tone="text-negative" />
        <Kpi label={t("terminal.viz.kShortSq")} value={shortSqueeze.length} desc={t("terminal.viz.kShortSqDesc")} tone={shortSqueeze.length ? "text-gold-primary" : undefined} />
        <Kpi label={t("terminal.viz.kLongSq")} value={longSqueeze.length} desc={t("terminal.viz.kLongSqDesc")} tone={longSqueeze.length ? "text-orange-400" : undefined} />
      </div>

      {withB.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <XCard title="Perp Premium — richest (mark &gt; index)" desc="Perp trading above spot/index — greed / crowded longs paying up to hold." render={() => <RankBars data={basisRich} onPair={openPair} fmt={fmtBasis} />} />
          <XCard title="Perp Premium — cheapest / inverted" desc="Perp at or below index — discount, unwinding, or stress." render={() => <RankBars data={basisCheap} onPair={openPair} fmt={fmtBasis} />} />
        </div>
      )}

      <XCard
        title={t("terminal.viz.squeezeTitle")}
        desc={t("terminal.viz.squeezeDesc")}
        render={() => (
          <div className="py-2 space-y-3">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-gold-primary/80 mb-1.5">
                {t("terminal.viz.shortSqList")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {shortSqueeze.length === 0 && <span className="font-mono text-[10px] text-text-muted">{t("terminal.viz.none")}</span>}
                {shortSqueeze.slice(0, 10).map((r) => (
                  <span key={r.pair} className="flex items-center gap-1.5 px-2 py-1 rounded-sm border border-line/30 bg-gold-primary/[0.08] font-mono text-[10px]">
                    <CoinPill pair={r.pair} onPair={openPair} />
                    <span className="text-text-muted">f {r.fPct.toFixed(3)}%</span>
                    <span className="text-positive">OI {fmtPct(r.oi_chg_1h)}</span>
                    <span className="text-positive">{fmtPct(r.price_chg_24h)}</span>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-orange-400/80 mb-1.5">
                {t("terminal.viz.longSqList")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {longSqueeze.length === 0 && <span className="font-mono text-[10px] text-text-muted">{t("terminal.viz.none")}</span>}
                {longSqueeze.slice(0, 10).map((r) => (
                  <span key={r.pair} className="flex items-center gap-1.5 px-2 py-1 rounded-sm border border-orange-400/30 bg-orange-400/[0.08] font-mono text-[10px]">
                    <CoinPill pair={r.pair} onPair={openPair} />
                    <span className="text-text-muted">f +{r.fPct.toFixed(3)}%</span>
                    <span className="text-negative">{fmtPct(r.price_chg_24h)}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <XCard title={t("terminal.viz.fundNegTitle")} desc={t("terminal.viz.fundNegDesc")} render={() => <RankBars data={negTop} onPair={openPair} fmt={(v) => `${v.toFixed(3)}%`} />} />
        <XCard title={t("terminal.viz.fundPosTitle")} desc={t("terminal.viz.fundPosDesc")} render={() => <RankBars data={posTop} onPair={openPair} fmt={(v) => `+${v.toFixed(3)}%`} />} />
      </div>

      <XCard
        title={t("terminal.viz.fundFcTitle")}
        desc={t("terminal.viz.fundFcDesc")}
        zoom={zFund}
        render={(h) => (
          <div style={{ height: Math.max(h, 280) }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={GRID} />
                <XAxis type="number" dataKey="x" tick={TICK} axisLine={false} tickLine={false} unit="%" domain={zFund.domX} allowDataOverflow tickFormatter={fmtAxis} />
                <YAxis type="number" dataKey="y" tick={TICK} axisLine={false} tickLine={false} unit="%" domain={zFund.domY} allowDataOverflow tickFormatter={fmtAxis} />
                <Tooltip content={<ScatterTip xLabel="funding %" yLabel="Δ call %" />} cursor={{ strokeDasharray: "3 3", stroke: GOLD }} />
                <ReferenceLine x={0} stroke={GOLD} strokeDasharray="3 3" />
                <ReferenceLine y={0} stroke="rgb(var(--ink) / 0.15)" strokeDasharray="3 3" />
                <Scatter data={fundFc} fillOpacity={0.85} onClick={(p) => { const d = p?.payload || p; if (d?.pair) openPair(d.pair); }}>
                  {fundFc.map((p, i) => { const sc = statusColorOf(statusMap, p.pair); return (
                    <Cell key={i} fill={p.neg ? POS : GRAYBAR} stroke={sc || undefined} strokeWidth={sc ? 2 : 0} cursor="pointer" />
                  ); })}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      />

      <NoDerivStrip noDeriv={noDeriv} onPair={openPair} />
    </>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB: vs BTC — rebased trend chart + RSI board + volume Δ
// ════════════════════════════════════════════════════════════════
const LINE_COLORS = SERIES.filter((c) => c !== GOLD);

// end-of-line label: coin logo + symbol at the tip of each rebased line
const makeEndLabel = (sym, color, total) => (props) => {
  const { x, y, index, value } = props;
  if (value == null || index !== total - 1 || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const name = sym.replace(/USDT$/, "");
  const icon = name.toLowerCase().replace(/^1000/, "");
  const url = `https://assets.coincap.io/assets/icons/${icon}@2x.png`;
  const cid = `lqclip-${icon}`;
  const cx = x + 12, r = 7;
  return (
    <g style={{ pointerEvents: "none" }}>
      <defs><clipPath id={cid}><circle cx={cx} cy={y} r={r} /></clipPath></defs>
      <circle cx={cx} cy={y} r={r + 1} fill="#0a0806" />
      <image href={url} x={cx - r} y={y - r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${cid})`} />
      <circle cx={cx} cy={y} r={r} fill="none" stroke={color} strokeWidth={1.25} opacity={0.65} />
      <text x={cx + r + 3} y={y + 3.5} fill={color} fontSize={9.5} fontFamily="JetBrains Mono" fontWeight="600">{name}</text>
    </g>
  );
};
const WINDOWS = { "24h": { interval: "15m", limit: 96 }, "48h": { interval: "30m", limit: 96 }, "7d": { interval: "2h", limit: 84 } };

export function VsBtcTab({ view, deriv, pairFc, openPair, movers }) {
  const { t } = useTranslation();
  const { rows, noDeriv } = usePairRows(view, deriv, pairFc);
  const [win, setWin] = useState("24h");
  const [sel, setSel] = useState(null); // null = not initialized yet
  const [series, setSeries] = useState({});
  const [q, setQ] = useState("");

  // default: top-10 movers by |live Δ from call|
  useEffect(() => {
    if (sel != null || !movers?.length) return;
    setSel(movers.slice(0, 10).map((m) => m.pair));
  }, [movers, sel]);

  const selected = sel || [];
  const allSymbols = useMemo(() => ["BTCUSDT", ...selected.filter((p) => p !== "BTCUSDT")], [selected]);

  // fetch klines for BTC + selection (cached per symbol+window in-memory)
  useEffect(() => {
    let alive = true;
    const { interval, limit } = WINDOWS[win];
    (async () => {
      const out = {};
      await Promise.all(allSymbols.map(async (sym) => {
        try {
          const r = await fetch(`${API_BASE}/api/v1/market/klines?symbol=${sym}&interval=${interval}&limit=${limit}`);
          if (r.ok) {
            const raw = await r.json();
            if (Array.isArray(raw) && raw.length > 2) {
              out[sym] = raw.map((k) => ({ t: k[0], c: +k[4] }));
            }
          }
        } catch { /* noop */ }
      }));
      if (alive) setSeries(out);
    })();
    return () => { alive = false; };
  }, [allSymbols.join(","), win]); // eslint-disable-line react-hooks/exhaustive-deps

  // rebase every series to 100 at window start
  const chartData = useMemo(() => {
    const btc = series.BTCUSDT;
    if (!btc?.length) return [];
    return btc.map((k, i) => {
      const row = { t: new Date(k.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
      allSymbols.forEach((sym) => {
        const s = series[sym];
        if (s && s[i] && s[0]?.c) row[sym] = +((s[i].c / s[0].c) * 100).toFixed(2);
      });
      return row;
    });
  }, [series, allSymbols]);

  const searchOpts = useMemo(() => {
    if (!q) return [];
    const Q = q.toUpperCase();
    const pool = [...new Set((view || []).map((s) => s.pair))];
    return pool.filter((p) => p.includes(Q) && !selected.includes(p)).slice(0, 8);
  }, [q, view, selected]);

  // RSI board from deriv blob
  const rsiRows = rows.filter((r) => r.rsi != null);
  const oversold = rsiRows.filter((r) => r.rsi < 30).sort((a, b) => a.rsi - b.rsi);
  const overbought = rsiRows.filter((r) => r.rsi > 70).sort((a, b) => b.rsi - a.rsi);
  const volChg = [...rows]
    .filter((r) => r.vol_chg_1h != null)
    .map((r) => ({ pair: r.pair, v: r.vol_chg_1h }))
    .sort((a, b) => b.v - a.v);

  return (
    <div className="space-y-2.5">
      <SectionBand title={t("terminal.viz.tabVsbtc")} desc={t("terminal.viz.vsSectionDesc")} />

      <XCard
        title={t("terminal.viz.vsChartTitle")}
        desc={t("terminal.viz.vsChartDesc")}
        height={380}
        render={(h) => (
          <>
            <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
              <SegControl
                value={win}
                onChange={setWin}
                options={Object.keys(WINDOWS).map((w) => ({ id: w, label: w }))}
              />
              <span className="h-4 w-px bg-ink/[0.08]" />
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-gold-primary/25 bg-gold-primary/[0.08] font-mono text-[10px]">
                <CoinLogo pair="BTCUSDT" size={14} />
                <span className="text-gold-primary">BTC</span>
              </span>
              {selected.map((p, i) => (
                <span key={p} className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-ink/[0.08] bg-ink/[0.02] font-mono text-[10px]">
                  <CoinLogo pair={p} size={14} />
                  <span style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>{p.replace(/USDT$/i, "")}</span>
                  <button type="button" onClick={() => setSel(selected.filter((x) => x !== p))} className="text-text-muted hover:text-negative">×</button>
                </span>
              ))}
              <div className="relative">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("terminal.viz.vsAdd")}
                  className="w-28 bg-ink/[0.03] border border-ink/[0.08] rounded-md px-2 py-1 text-[10.5px] text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-ink/18 font-mono"
                />
                {searchOpts.length > 0 && (
                  <div className="absolute z-40 mt-1 left-0 min-w-[160px] rounded-lg bg-surface border border-ink/[0.1] shadow-xl p-1">
                    {searchOpts.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { if (selected.length < 10) setSel([...selected, p]); setQ(""); }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-ink/[0.05] font-mono text-[10.5px] text-text-primary/85"
                      >
                        <CoinLogo pair={p} size={14} /> {p.replace(/USDT$/i, "")}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ height: Math.max(h, 300) }}>
              {chartData.length === 0 ? (
                <Warming text={t("terminal.viz.vsLoading")} />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 6, right: 66, left: -14, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="3 6" />
                    <XAxis dataKey="t" tick={TICK_SM} axisLine={false} tickLine={false} minTickGap={40} />
                    <YAxis tick={TICK} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                    <Tooltip content={<DarkTip />} />
                    <ReferenceLine y={100} stroke="rgb(var(--ink) / 0.12)" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="BTCUSDT" name="BTC" stroke={GOLD} strokeWidth={2.2} dot={false} label={makeEndLabel("BTCUSDT", GOLD, chartData.length)} isAnimationActive={false} />
                    {selected.map((p, i) => (
                      <Line key={p} type="monotone" dataKey={p} name={p.replace(/USDT$/i, "")} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={1.5} dot={false} label={makeEndLabel(p, LINE_COLORS[i % LINE_COLORS.length], chartData.length)} isAnimationActive={false} />
                    ))}
                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
        <XCard
          title={t("terminal.viz.rsiTitle")}
          desc={t("terminal.viz.rsiDesc")}
          height={300}
          render={(h) => (
            <>
              <div style={{ height: Math.min(h, 200) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={makeBins(rsiRows.map((r) => r.rsi), 10, 0, 100)} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="x" tick={TICK_SM} axisLine={false} tickLine={false} />
                    <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<DarkTip />} cursor={{ fill: "rgb(var(--accent) / 0.06)" }} />
                    <Bar dataKey="count" name="pairs" radius={[2, 2, 0, 0]}>
                      {makeBins(rsiRows.map((r) => r.rsi), 10, 0, 100).map((b, i) => (
                        <Cell key={i} fill={b.mid < 30 ? POS : b.mid > 70 ? NEG : GOLD} fillOpacity={0.75} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-positive/80">RSI&lt;30</span>
                  {oversold.length === 0 && <span className="font-mono text-[10px] text-text-muted">{t("terminal.viz.none")}</span>}
                  {oversold.slice(0, 8).map((r) => (
                    <span key={r.pair} className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm border border-positive/25 bg-positive/[0.06] font-mono text-[10px]">
                      <CoinPill pair={r.pair} onPair={openPair} /> <span className="text-positive">{r.rsi}</span>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-negative/80">RSI&gt;70</span>
                  {overbought.length === 0 && <span className="font-mono text-[10px] text-text-muted">{t("terminal.viz.none")}</span>}
                  {overbought.slice(0, 8).map((r) => (
                    <span key={r.pair} className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm border border-negative/25 bg-negative/[0.06] font-mono text-[10px]">
                      <CoinPill pair={r.pair} onPair={openPair} /> <span className="text-negative">{r.rsi}</span>
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        />

        <XCard
          title={t("terminal.viz.volChgTitle")}
          desc={t("terminal.viz.volChgDesc")}
          height={300}
          render={() =>
            volChg.length === 0 ? (
              <Warming text={t("terminal.viz.derivWarming")} />
            ) : (
              <RankBars align="start" data={volChg.slice(0, 10)} onPair={openPair} />
            )
          }
        />
      </div>

      <NoDerivStrip noDeriv={noDeriv} onPair={openPair} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB: MOMENTUM — relative strength + volume acceleration (worker score)
// ════════════════════════════════════════════════════════════════
export function MomentumTab({ view, deriv, pairFc, openPair }) {
  const { map: statusMap } = useSignalStatus() || {};
  const { t } = useTranslation();
  const { rows } = usePairRows(view, deriv, pairFc);
  const zM = useZoom(-15, 15, -40, 60);

  const scored = rows.filter((r) => r.momentum != null);
  const accelerating = scored.filter((r) => r.momentum >= 65).length;
  const fading = scored.filter((r) => r.momentum < 35).length;
  const medM = scored.length ? median(scored.map((r) => r.momentum)) : null;
  const topMom = [...scored].sort((a, b) => b.momentum - a.momentum);
  const byMom = topMom.slice(0, 10).map((r) => ({ pair: r.pair, v: r.momentum, color: GOLD }));
  const byRs = [...rows].filter((r) => r.rs_btc != null).sort((a, b) => b.rs_btc - a.rs_btc).slice(0, 10).map((r) => ({ pair: r.pair, v: r.rs_btc }));
  const byAccel = [...rows].filter((r) => r.vol_chg_1h != null).sort((a, b) => b.vol_chg_1h - a.vol_chg_1h).slice(0, 10).map((r) => ({ pair: r.pair, v: r.vol_chg_1h }));
  const scatter = rows
    .filter((r) => r.rs_btc != null && r.vol_chg_1h != null)
    .map((r) => ({ x: r.rs_btc, y: r.vol_chg_1h, mom: r.momentum ?? 0, pair: r.pair }));

  if (deriv?.warming) return <Warming text={t("terminal.viz.derivWarming")} />;

  return (
    <>
      <SectionBand title={t("terminal.viz.tabMomentum")} desc={t("terminal.viz.momSectionDesc")} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Kpi label={t("terminal.viz.kAccel")} value={accelerating} desc={t("terminal.viz.kAccelDesc")} tone={accelerating ? "text-positive" : undefined} />
        <Kpi label={t("terminal.viz.kMedMom")} value={medM == null ? "—" : Math.round(medM)} desc={t("terminal.viz.kMedMomDesc")} tone="text-gold-primary" />
        <Kpi label={t("terminal.viz.kStrongest")} value={topMom[0] ? Math.round(topMom[0].momentum) : "—"} desc={topMom[0]?.pair} tone="text-positive" />
        <Kpi label={t("terminal.viz.kFading")} value={fading} desc={t("terminal.viz.kFadingDesc")} tone={fading ? "text-negative" : undefined} />
      </div>

      <XCard
        title={t("terminal.viz.momScatterTitle")}
        desc={t("terminal.viz.momScatterDesc")}
        zoom={zM}
        hint={t("terminal.viz.momScatterHint")}
        render={(h) => (
          <div style={{ height: Math.max(h, 320) }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <ReferenceArea x1={0} x2={zM.domX[1]} y1={0} y2={zM.domY[1]} fill={POS} fillOpacity={0.04} />
                <CartesianGrid stroke={GRID} />
                <XAxis type="number" dataKey="x" tick={TICK} axisLine={false} tickLine={false} unit="%" domain={zM.domX} allowDataOverflow tickFormatter={fmtAxis} />
                <YAxis type="number" dataKey="y" tick={TICK} axisLine={false} tickLine={false} unit="%" domain={zM.domY} allowDataOverflow tickFormatter={fmtAxis} />
                <Tooltip content={<ScatterTip xLabel="RS vs BTC %" yLabel="vol accel 1h %" />} cursor={{ strokeDasharray: "3 3", stroke: GOLD }} />
                <ReferenceLine x={0} stroke="rgb(var(--ink) / 0.15)" />
                <ReferenceLine y={0} stroke="rgb(var(--ink) / 0.15)" />
                <Scatter data={scatter} fillOpacity={0.85} onClick={(p) => { const d = p?.payload || p; if (d?.pair) openPair(d.pair); }}>
                  {scatter.map((p, i) => { const sc = statusColorOf(statusMap, p.pair); return (
                    <Cell key={i} cursor="pointer" fill={p.mom >= 65 ? GOLD : p.mom >= 50 ? POS : p.x < 0 ? NEG : GRAYBAR} stroke={sc || undefined} strokeWidth={sc ? 2 : 0} />
                  ); })}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <XCard title={t("terminal.viz.momTopTitle")} desc={t("terminal.viz.momTopDesc")} render={() => <RankBars data={byMom} onPair={openPair} fmt={(v) => Math.round(v)} />} />
        <XCard title={t("terminal.viz.momRsTitle")} desc={t("terminal.viz.momRsDesc")} render={() => <RankBars data={byRs} onPair={openPair} fmt={(v) => fmtPct(v, 1)} />} />
        <XCard title={t("terminal.viz.momAccelTitle")} desc={t("terminal.viz.momAccelDesc")} render={() => <RankBars data={byAccel} onPair={openPair} fmt={(v) => fmtPct(v, 0)} />} />
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB: SQUEEZE — how crowded/extended one side is (worker score)
// ════════════════════════════════════════════════════════════════
export function SqueezeTab({ view, deriv, pairFc, openPair }) {
  const { map: statusMap } = useSignalStatus() || {};
  const { t } = useTranslation();
  const { rows } = usePairRows(view, deriv, pairFc);
  const zSq = useZoom(0, 4, -0.5, 0.5);

  const scored = rows.filter((r) => r.squeeze != null);
  const crowdedLong = scored.filter((r) => r.squeeze_side === "long" && r.squeeze >= 45);
  const crowdedShort = scored.filter((r) => r.squeeze_side === "short" && r.squeeze >= 45);
  const medS = scored.length ? median(scored.map((r) => r.squeeze)) : null;
  const topS = [...scored].sort((a, b) => b.squeeze - a.squeeze);
  const longList = [...crowdedLong].sort((a, b) => b.squeeze - a.squeeze).slice(0, 10).map((r) => ({ pair: r.pair, v: r.squeeze, color: NEG }));
  const shortList = [...crowdedShort].sort((a, b) => b.squeeze - a.squeeze).slice(0, 10).map((r) => ({ pair: r.pair, v: r.squeeze, color: POS }));
  const scatter = rows
    .filter((r) => r.lsr != null && r.funding != null)
    .map((r) => ({ x: Math.min(r.lsr, 4), y: r.funding * 100, z: Math.max(r.oi || 1, 1), side: r.squeeze_side, pair: r.pair }));

  if (deriv?.warming) return <Warming text={t("terminal.viz.derivWarming")} />;

  return (
    <>
      <SectionBand title={t("terminal.viz.tabSqueeze")} desc={t("terminal.viz.sqSectionDesc")} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Kpi label={t("terminal.viz.kCrowdedLong")} value={crowdedLong.length} desc={t("terminal.viz.kCrowdedLongDesc")} tone={crowdedLong.length ? "text-negative" : undefined} />
        <Kpi label={t("terminal.viz.kCrowdedShort")} value={crowdedShort.length} desc={t("terminal.viz.kCrowdedShortDesc")} tone={crowdedShort.length ? "text-positive" : undefined} />
        <Kpi label={t("terminal.viz.kTopSqueeze")} value={topS[0] ? Math.round(topS[0].squeeze) : "—"} desc={topS[0]?.pair} tone="text-gold-primary" />
        <Kpi label={t("terminal.viz.kMedSqueeze")} value={medS == null ? "—" : Math.round(medS)} desc={t("terminal.viz.kMedSqueezeDesc")} />
      </div>

      <XCard
        title={t("terminal.viz.sqScatterTitle")}
        desc={t("terminal.viz.sqScatterDesc")}
        hint={t("terminal.viz.sqScatterHint")}
        zoom={zSq}
        render={(h) => (
          <div style={{ height: Math.max(h, 320) }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={GRID} />
                <XAxis type="number" dataKey="x" tick={TICK} axisLine={false} tickLine={false} domain={zSq.domX} allowDataOverflow tickFormatter={fmtAxis} label={{ value: "L/S ratio", position: "insideBottom", offset: -4, fill: AXIS, fontSize: 9, fontFamily: "monospace" }} />
                <YAxis type="number" dataKey="y" tick={TICK} axisLine={false} tickLine={false} unit="%" domain={zSq.domY} allowDataOverflow tickFormatter={fmtAxis} label={{ value: "funding", angle: -90, position: "insideLeft", fill: AXIS, fontSize: 9, fontFamily: "monospace" }} />
                <ZAxis type="number" dataKey="z" range={[24, 400]} />
                <Tooltip content={<ScatterTip xLabel="L/S ratio" yLabel="funding %" />} cursor={{ strokeDasharray: "3 3", stroke: GOLD }} />
                <ReferenceLine x={1} stroke="rgb(var(--ink) / 0.15)" />
                <ReferenceLine y={0} stroke="rgb(var(--ink) / 0.15)" />
                <Scatter data={scatter} fillOpacity={0.6} onClick={(p) => { const d = p?.payload || p; if (d?.pair) openPair(d.pair); }}>
                  {scatter.map((p, i) => { const sc = statusColorOf(statusMap, p.pair); return (
                    <Cell key={i} cursor="pointer" fill={p.side === "long" ? NEG : p.side === "short" ? POS : GRAYBAR} stroke={sc || undefined} strokeWidth={sc ? 2 : 0} />
                  ); })}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <XCard title={t("terminal.viz.sqLongTitle")} desc={t("terminal.viz.sqLongDesc")} render={() => <RankBars data={longList} onPair={openPair} fmt={(v) => Math.round(v)} />} />
        <XCard title={t("terminal.viz.sqShortTitle")} desc={t("terminal.viz.sqShortDesc")} render={() => <RankBars data={shortList} onPair={openPair} fmt={(v) => Math.round(v)} />} />
      </div>
    </>
  );
}
