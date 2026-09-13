// BTC correlation — how much of a move is just Bitcoin.
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

export default function BtcTab({
  agg,
  view,
  deriv,
  openPair,
  statusMap,
}) {
  const { t } = useTranslation();
  const stdH = useChartHeight("std");

  const zBeta = useZoom(-0.5, 2.5, -60, 60);

  const betaNamed = useMemo(
    () => promote(agg.scatterBeta, [-0.5, 2.5], [-60, 60], stdH, 18, (p) => Math.abs(p.y)),
    [agg.scatterBeta, stdH]
  );

  return (
    <>
            <>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <Kpi
                  label={t("terminal.viz.kAvgBeta")}
                  value={agg.avgBeta != null ? agg.avgBeta.toFixed(2) : "—"}
                  desc={t("terminal.viz.kAvgBetaDesc")}
                />
                <Kpi
                  label={t("terminal.viz.kDecoupled")}
                  value={agg.decoupled}
                  desc={t("terminal.viz.kDecoupledDesc")}
                  tone={undefined}
                />
                <Kpi
                  label={t("terminal.viz.kExtended")}
                  value={agg.extended}
                  desc={t("terminal.viz.kExtendedDesc")}
                  tone={undefined}
                />
                <Kpi
                  label={t("terminal.viz.kLeads")}
                  value={agg.leads}
                  desc={t("terminal.viz.kLeadsDesc")}
                  tone={undefined}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.betaDistTitle")}
                  guide="betaDist"
                  desc={t("terminal.viz.betaDistDesc")}
                  render={(h) => (
                    <>
                      <div style={{ height: h }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={makeBins(agg.betaVals, 0.25, 0, 2.5)}
                            margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                          >
                            <CartesianGrid stroke={GRID} vertical={false} />
                            <XAxis dataKey="x" tick={TICK_SM} axisLine={false} tickLine={false} />
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
                            <Bar isAnimationActive={false} dataKey="count" name="signals" radius={[2, 2, 0, 0]}>
                              {makeBins(agg.betaVals, 0.25, 0, 2.5).map((b, i) => (
                                <Cell
                                  key={i}
                                  fill={b.mid < 0.8 ? POS : b.mid <= 1.2 ? GOLD : NEG}
                                  fillOpacity={0.8}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <LegendChips
                        entries={[
                          {
                            key: "def",
                            label: t("terminal.viz.betaDef"),
                            value: agg.betaVals.filter((b) => b < 0.8).length,
                            color: POS,
                          },
                          {
                            key: "neu",
                            label: t("terminal.viz.betaNeu"),
                            value: agg.betaVals.filter((b) => b >= 0.8 && b <= 1.2).length,
                            color: GOLD,
                          },
                          {
                            key: "agg",
                            label: t("terminal.viz.betaAgg"),
                            value: agg.betaVals.filter((b) => b > 1.2).length,
                            color: NEG,
                          },
                        ]}
                      />
                    </>
                  )}
                />

                <XCard
                  title={t("terminal.viz.betaPerfTitle")}
                  guide="betaPerf"
                  desc={t("terminal.viz.betaPerfDesc")}
                  zoom={zBeta}
                  hint={t("terminal.viz.betaPerfHint")}
                  render={(h) => (
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                          <CartesianGrid stroke={GRID} />
                          <XAxis
                            type="number"
                            dataKey="x"
                            tick={TICK}
                            axisLine={false}
                            tickLine={false}
                            domain={zBeta.domX}
                            allowDataOverflow
                            tickFormatter={fmtAxis}
                          />
                          <YAxis
                            type="number"
                            dataKey="y"
                            tick={TICK}
                            axisLine={false}
                            tickLine={false}
                            unit="%"
                            domain={zBeta.domY}
                            allowDataOverflow
                            tickFormatter={fmtAxis}
                          />
                          <Tooltip
                            content={<ScatterTip xLabel="β 30d" yLabel="Δ call %" />}
                            cursor={{ strokeDasharray: "3 3", stroke: GOLD }}
                          />
                          <ReferenceLine y={0} stroke={GOLD} strokeDasharray="3 3" />
                          <ReferenceLine
                            x={1}
                            stroke="rgb(var(--ink) / 0.15)"
                            strokeDasharray="3 3"
                          />
                          <Scatter
                            isAnimationActive={false}
                            data={namedLast(
                              agg.scatterBeta.map((p) => ({
                                ...p,
                                fill: p.dec ? CYAN : GRAYBAR,
                                sc: statusColorOf(statusMap, p.pair),
                                named: betaNamed.has(p.pair),
                              }))
                            )}
                            shape={<PairBubble onPair={openPair} />}
                          />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.alignTitle")}
                  guide="align"
                  desc={t("terminal.viz.alignDesc")}
                  render={(h) => (
                    <div style={{ height: Math.min(h, 220) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={makeBins(agg.alignVals, 10, 0, 100)}
                          margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                        >
                          <CartesianGrid stroke={GRID} vertical={false} />
                          <XAxis dataKey="x" tick={TICK_SM} axisLine={false} tickLine={false} />
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
                            fill={PURPLE}
                            fillOpacity={0.8}
                            radius={[2, 2, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                />

                <XCard
                  title={t("terminal.viz.decListTitle")}
                  guide="decList"
                  desc={t("terminal.viz.decListDesc")}
                  render={() =>
                    agg.decoupledList.length === 0 ? (
                      <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        {t("terminal.viz.none")}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 py-2">
                        {agg.decoupledList.slice(0, 24).map((d) => (
                          <span
                            key={d.pair}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-sm border border-accent/25 bg-accent/[0.06] font-mono text-[10px]"
                          >
                            <CoinPill pair={d.pair} onPair={openPair} />
                            <span className={d.v >= 0 ? "text-positive" : "text-negative"}>
                              {fmtPct(d.v)}
                            </span>
                          </span>
                        ))}
                      </div>
                    )
                  }
                />
              </div>
            </>
    </>
  );
}
