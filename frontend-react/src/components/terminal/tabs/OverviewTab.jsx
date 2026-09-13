// Overview — the desk at a glance.
//
// Extracted from SignalsAnalytics, which carried eight tabs and ran every one
// of their hooks on every render. What this tab computes now runs only while it
// is open.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  FunnelChart,
  Funnel,
  LabelList,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import CoinLogo from "../../CoinLogo";
import {
  XCard,
  Kpi,
  Chip,
  SegControl,
  SectionBand,
  SectorBars,
  SectorGlyph,
  RankBars,
  Donut,
  ScrollArea,
  StatusTag,
  CoinPill,
  Methodology,
  DarkTip,
  ScatterTip,
  LegendChips,
  CoinBubble,
  PairBubble,
  promote,
  namedLast,
  useZoom,
  useChartHeight,
  pctBound,
  pctRange,
  clampTo,
  clampRange,
  fitBound,
  makeBins,
  median,
  statusColorOf,
  reliabilityFromSample,
  fmtPct,
  fmtMoney,
  fmtAxis,
  heatPct,
  heatBias,
  heatLabelColor,
  GOLD,
  POS,
  NEG,
  CYAN,
  PURPLE,
  GRAYBAR,
  GRID,
  AXIS,
  MUTED,
  TICK,
  TICK_SM,
  SERIES,
  STATUS_COLORS,
  STATUS_LABEL,
  STATUS_ORDER,
  RISK_COLORS,
  TIER_COLORS,
  TIER_LABELS,
} from "../vizShared";
import { STRONG_TAGS, WARN_TAGS } from "../tagGlossary";

// Market Regime — composite risk-on/off (altseason · BTC.D · closed win rate · funding)
// Live "in profit %" is intentionally excluded — momentum noise, not edge quality.
function RegimeGauge({ macro, deriv, winRate, closedN, tpHitPct }) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const btcDom = macro?.btc_dominance ?? null;
  const alt = macro?.altseason_index ?? null;
  const fund = deriv?.pairs
    ? Object.values(deriv.pairs)
        .map((p) => p.funding)
        .filter((v) => v != null)
    : [];
  const avgFund = fund.length ? fund.reduce((a, b) => a + b, 0) / fund.length : null;

  const altScore = alt != null ? clamp(alt, 0, 100) : null;
  const domScore = btcDom != null ? clamp(((65 - btcDom) / 20) * 100, 0, 100) : null;
  // Prefer resolved win rate; fall back to TP1+ hit rate when few closes
  const edgeScore = winRate != null ? winRate : tpHitPct != null ? tpHitPct : null;
  const fundScore = avgFund != null ? clamp(50 + avgFund * 100 * 500, 0, 100) : null;

  const parts = [
    [altScore, 0.35],
    [domScore, 0.25],
    [edgeScore, 0.25],
    [fundScore, 0.15],
  ].filter(([v]) => v != null);
  const wsum = parts.reduce((a, [, w]) => a + w, 0) || 1;
  const regime = parts.length ? parts.reduce((a, [v, w]) => a + v * w, 0) / wsum : null;
  // Semantic color only — no gold brand glow for neutral zone
  const regColor = regime == null ? "#94a3b8" : regime >= 65 ? POS : regime >= 45 ? "#94a3b8" : NEG;
  const label =
    regime == null
      ? "—"
      : regime >= 65
        ? "Risk-on"
        : regime >= 52
          ? "Constructive"
          : regime >= 42
            ? "Neutral"
            : "Risk-off";

  const edgeLabel = winRate != null ? "Win rate" : "TP1+ rate";
  const edgeRaw = winRate != null ? `${winRate}%` : tpHitPct != null ? `${tpHitPct}%` : "—";
  const edgeBar = edgeScore;
  const edgeSub =
    winRate != null && closedN
      ? `${closedN} resolved`
      : winRate == null && tpHitPct != null
        ? "reached TP1+"
        : null;

  const comp = (lbl, score, raw, sub) => (
    <div className="rounded-lg border border-ink/[0.05] bg-ink/[0.02] px-2.5 py-2">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-text-muted/80">
        {lbl}
      </div>
      <div className="mt-0.5 font-mono text-[13px] tabular-nums text-text-primary">{raw}</div>
      {sub && <div className="mt-0.5 font-mono text-[9.5px] text-text-muted/55">{sub}</div>}
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink/[0.06]">
        <div
          className="h-full rounded-full bg-text-primary/55"
          style={{ width: `${score || 0}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-ink/[0.06] bg-ink/[0.02] p-3.5">
      <div className="mb-2.5 flex items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
            Market regime
          </div>
          <div
            className="mt-1 font-mono text-[26px] tabular-nums leading-none"
            style={{ color: regColor }}
          >
            {regime == null ? "—" : Math.round(regime)}
            <span className="text-[12px] text-text-muted/50"> / 100</span>
          </div>
          <div className="mt-1 text-[12px] font-medium" style={{ color: regColor }}>
            {label}
          </div>
        </div>
        <div className="hidden max-w-[11rem] text-right text-[10px] leading-snug text-text-muted/60 sm:block">
          Backdrop for position sizing · edge from resolved outcomes
        </div>
      </div>
      <div
        className="relative h-2 overflow-hidden rounded-full"
        style={{
          background: "linear-gradient(90deg,rgb(var(--neg)),rgb(148 163 184),rgb(var(--pos)))",
        }}
      >
        {regime != null && (
          <div
            className="absolute top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white shadow"
            style={{ left: `${regime}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9.5px] uppercase tracking-wider text-text-muted/50">
        <span>Risk-off</span>
        <span>Neutral</span>
        <span>Risk-on</span>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {comp("Altseason", altScore, alt != null ? alt.toFixed(0) : "—")}
        {comp("BTC dominance", domScore, btcDom != null ? `${btcDom.toFixed(1)}%` : "—")}
        {comp(edgeLabel, edgeBar, edgeRaw, edgeSub)}
        {comp("Avg funding", fundScore, avgFund != null ? `${(avgFund * 100).toFixed(3)}%` : "—")}
      </div>
    </div>
  );
}

export default function OverviewTab({
  agg,
  view,
  deriv,
  openPair,
  macro,
  filters,
  setF,
  selSectors,
  selRisks,
  tpHitPct,
  latestByPair,
  pairFc,
}) {
  const { t } = useTranslation();

  // "coiled" = high-confluence, clean setups still sitting near entry (not pumped)
  const coiledCount = useMemo(() => {
    let n = 0;
    Object.values(latestByPair).forEach((s) => {
      const tags = s.v3?.tags || [];
      if (!tags.length || !STRONG_TAGS.some((x) => tags.includes(x))) return;
      if (tags.some((x) => WARN_TAGS.includes(x))) return;
      const fc = pairFc[s.pair];
      if (fc == null || fc < -5 || fc > 6) return;
      n += 1;
    });
    return n;
  }, [latestByPair, pairFc]);

  return (
    <>
            <>
              <RegimeGauge
                macro={macro}
                deriv={deriv}
                winRate={agg.winRate}
                closedN={agg.closedN}
                tpHitPct={tpHitPct}
              />
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <Kpi
                  compact
                  label={t("terminal.viz.kActive")}
                  value={view.length}
                  sub="Last 7 days"
                />
                <Kpi
                  compact
                  label="Win rate"
                  value={agg.winRate == null ? "—" : `${agg.winRate}%`}
                  sub={agg.closedN ? `${agg.closedN} resolved (TP4 vs SL)` : "Awaiting closes"}
                  tone={agg.winRate != null && agg.winRate >= 55 ? "text-positive" : undefined}
                />
                <Kpi
                  compact
                  label={t("terminal.viz.kTpReached")}
                  value={tpHitPct == null ? "—" : `${tpHitPct}%`}
                  sub="Hit TP1 or better"
                  tone="text-positive"
                />
                <Kpi
                  compact
                  label={t("terminal.viz.kCoiled")}
                  value={coiledCount}
                  sub="Near entry · high quality"
                />
              </div>

              <XCard
                title={t("terminal.viz.flowTitle")}
                guide="flow"
                desc={t("terminal.viz.flowDesc")}
                render={(h) => (
                  <>
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={agg.days}
                          margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                        >
                          <CartesianGrid stroke={GRID} vertical={false} />
                          <XAxis dataKey="day" tick={TICK} axisLine={false} tickLine={false} />
                          <YAxis
                            tick={TICK}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip
                            content={<DarkTip />}
                            cursor={{ fill: "rgb(var(--accent) / 0.06)" }}
                          />
                          {STATUS_ORDER.map((k, i) => (
                            <Bar isAnimationActive={false}
                              key={k}
                              dataKey={k}
                              name={STATUS_LABEL[k]}
                              stackId="s"
                              fill={STATUS_COLORS[k]}
                              radius={i === STATUS_ORDER.length - 1 ? [2, 2, 0, 0] : 0}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <LegendChips
                      entries={STATUS_ORDER.map((k) => ({
                        key: k,
                        label: STATUS_LABEL[k],
                        value: agg.statusMix[k],
                        color: STATUS_COLORS[k],
                      }))}
                      activeKey={filters.st}
                      onPick={(k) => setF({ st: filters.st === k ? "all" : k })}
                    />
                  </>
                )}
              />

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <XCard
                  title={t("terminal.viz.funnelTitle")}
                  guide="funnel"
                  desc={t("terminal.viz.funnelDesc")}
                  render={(h) => (
                    <div style={{ height: h }} className="min-w-0 w-full overflow-hidden">
                      <ResponsiveContainer width="100%" height="100%">
                        <FunnelChart margin={{ top: 8, right: 72, left: 4, bottom: 8 }}>
                          <Tooltip content={<DarkTip />} />
                          <Funnel dataKey="value" data={agg.funnel} isAnimationActive={false}>
                            <LabelList
                              position="right"
                              dataKey="name"
                              fill={AXIS}
                              stroke="none"
                              fontSize={10}
                              fontFamily="JetBrains Mono"
                              formatter={(name) => name}
                            />
                          </Funnel>
                        </FunnelChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                />
                <XCard
                  title={t("terminal.viz.statusTitle")}
                  guide="statusMix"
                  desc={t("terminal.viz.statusDesc")}
                  render={(h) => (
                    <Donut
                      h={Math.max(150, h - 50)}
                      data={STATUS_ORDER.map((k) => ({
                        key: k,
                        name: STATUS_LABEL[k],
                        value: agg.statusMix[k],
                        color: STATUS_COLORS[k],
                      }))}
                      active={filters.st}
                      onPick={(k) => setF({ st: filters.st === k ? "all" : k })}
                    />
                  )}
                />
                <XCard
                  title={t("terminal.viz.riskTitle")}
                  guide="riskMix"
                  desc={t("terminal.viz.riskDesc")}
                  render={(h) => (
                    <Donut
                      h={Math.max(150, h - 50)}
                      data={Object.entries(agg.riskMix).map(([k, v]) => ({
                        key: k,
                        name: k,
                        value: v,
                        color: RISK_COLORS[k],
                      }))}
                      active={selRisks.length === 1 ? selRisks[0] : null}
                      onPick={(k) =>
                        setF({ risks: selRisks.length === 1 && selRisks[0] === k ? "" : k })
                      }
                    />
                  )}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.tt1Title")}
                  guide="tt1"
                  desc={t("terminal.viz.tt1Desc")}
                  hint={
                    agg.maeMed != null
                      ? `${t("terminal.viz.maeNote")}: ${fmtPct(agg.maeMed)}`
                      : undefined
                  }
                  render={(h) => (
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={makeBins(agg.tt1Vals, 4, 0, 48)}
                          margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                        >
                          <CartesianGrid stroke={GRID} vertical={false} />
                          <XAxis
                            dataKey="x"
                            tick={TICK_SM}
                            axisLine={false}
                            tickLine={false}
                            unit="h"
                          />
                          <YAxis
                            tick={TICK}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip
                            content={<DarkTip />}
                            cursor={{ fill: "rgb(var(--accent) / 0.06)" }}
                          />
                          <Bar isAnimationActive={false}
                            dataKey="count"
                            name="signals"
                            fill={CYAN}
                            fillOpacity={0.75}
                            radius={[2, 2, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                />
                <XCard
                  title={t("terminal.viz.equityTitle")}
                  guide="equity"
                  desc={t("terminal.viz.equityDesc")}
                  render={(h) => (
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={agg.days.map((d) => ({
                            day: d.day,
                            tp1: d.tp1 || 0,
                            tp2: d.tp2 || 0,
                            tp3: d.tp3 || 0,
                            tp4: d.closed_win || 0,
                            sl: -(d.closed_loss || 0),
                          }))}
                          margin={{ top: 6, right: 8, left: -18, bottom: 0 }}
                          stackOffset="sign"
                        >
                          <CartesianGrid stroke={GRID} vertical={false} />
                          <XAxis dataKey="day" tick={TICK} axisLine={false} tickLine={false} />
                          <YAxis
                            tick={TICK}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip
                            content={<DarkTip />}
                            cursor={{ fill: "rgb(var(--accent) / 0.06)" }}
                          />
                          <ReferenceLine y={0} stroke="rgb(var(--ink) / 0.2)" />
                          <Bar isAnimationActive={false}
                            dataKey="tp1"
                            name="TP1"
                            stackId="a"
                            fill="#2dd4a0"
                            fillOpacity={0.9}
                          />
                          <Bar isAnimationActive={false}
                            dataKey="tp2"
                            name="TP2"
                            stackId="a"
                            fill="rgb(var(--pos))"
                            fillOpacity={0.9}
                          />
                          <Bar isAnimationActive={false}
                            dataKey="tp3"
                            name="TP3"
                            stackId="a"
                            fill="#86efac"
                            fillOpacity={0.9}
                          />
                          <Bar isAnimationActive={false}
                            dataKey="tp4"
                            name="TP4"
                            stackId="a"
                            fill={GOLD}
                            fillOpacity={0.95}
                            radius={[2, 2, 0, 0]}
                          />
                          <Bar isAnimationActive={false}
                            dataKey="sl"
                            name="SL"
                            stackId="a"
                            fill={NEG}
                            fillOpacity={0.9}
                            radius={[0, 0, 2, 2]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                />
              </div>

              <XCard
                title={t("terminal.viz.sectorCountTitle")}
                guide="sectorCount"
                desc={t("terminal.viz.sectorCountDesc")}
                render={() => (
                  <SectorBars
                    data={agg.sectors.slice(0, 12)}
                    dataKey="count"
                    color={() => GOLD}
                    fmt={(v) => v}
                    onPick={(sec) => setF({ sectors: selSectors.includes(sec) ? "" : sec })}
                  />
                )}
              />
            </>
    </>
  );
}
