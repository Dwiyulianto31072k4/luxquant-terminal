// Live — what the desk is doing right now.
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

export default function LiveTab({
  agg,
  view,
  deriv,
  openPair,
  statusMap,
  fcClamped,
}) {
  const { t } = useTranslation();
  const stdH = useChartHeight("std");
  const heroH = useChartHeight("hero");

  // Fitted to the data rather than set by hand. The anomaly cloud is heavily
  // skewed — 96% of coins move inside ±13% while one freshly listed pair prints
  // +98% — so a fixed ±30 either hides the tail or crushes everything else into
  // a dot. Percentile bounds, with outliers clamped to the rail so they are
  // still visible, keep both readable. Floors stop a quiet day from magnifying
  // noise into a storm.
  const zOpp = useZoom(-60, 60, 0, 120);

  const zPeak = useZoom(-20, 150, -60, 100);

  const oppNamed = useMemo(
    () => promote(agg.scatterOpp, [-60, 60], [0, 120], stdH, 18, (p) => p.y),
    [agg.scatterOpp, stdH]
  );

  const peakNamed = useMemo(
    () => promote(agg.peakPts, [-20, 150], [-60, 100], heroH, 20, (p) => p.x),
    [agg.peakPts, heroH]
  );

  const gainers = useMemo(
    () => [...agg.movers].sort((a, b) => b.v - a.v).slice(0, 8),
    [agg.movers]
  );

  const losers = useMemo(() => [...agg.movers].sort((a, b) => a.v - b.v).slice(0, 8), [agg.movers]);

  // robust live-performance metrics (ignore implausible suspects)
  const liveStats = useMemo(() => {
    const n = fcClamped.length;
    return {
      n,
      up: fcClamped.filter((v) => v > 0).length,
      down: fcClamped.filter((v) => v < 0).length,
      bigWin: fcClamped.filter((v) => v > 10).length,
      bigLoss: fcClamped.filter((v) => v < -10).length,
    };
  }, [fcClamped]);

  return (
    <>
            <>
              <SectionBand
                title={t("terminal.viz.sectionLive")}
                guide="live"
                desc={t("terminal.viz.sectionLiveDesc")}
              />

              {/* Strength metrics only. Three tiles, three columns — the
                  "In Profit" tile was removed because it measured unrealised
                  P&L on open calls: a number that moves with the market and
                  can read as failure purely because price came back, without
                  a single trade having actually closed. */}
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
                <Kpi
                  compact
                  label={t("terminal.viz.kBest")}
                  value={gainers[0] ? fmtPct(gainers[0].v) : "—"}
                  sub={gainers[0]?.pair?.replace(/USDT$/i, "") || "—"}
                  tone="text-positive"
                />
                <Kpi
                  compact
                  label={t("terminal.viz.kBigWin")}
                  value={liveStats.bigWin}
                  sub="Above +10% from entry"
                  tone="text-positive"
                />
                <Kpi
                  compact
                  label="Median winner"
                  value={(() => {
                    const wins = fcClamped.filter((v) => v > 0);
                    if (!wins.length) return "—";
                    const s = [...wins].sort((a, b) => a - b);
                    const m =
                      s.length % 2
                        ? s[(s.length - 1) / 2]
                        : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
                    return fmtPct(m);
                  })()}
                  sub="Among calls in profit"
                  tone="text-positive"
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                <XCard
                  title={t("terminal.viz.fcDistTitle")}
                  guide="fcDist"
                  desc={t("terminal.viz.fcDistDesc")}
                  render={(h) => (
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={makeBins(fcClamped, 2, -20, 20)}
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
                          <ReferenceLine x="0" stroke={GOLD} strokeDasharray="3 3" />
                          <Bar isAnimationActive={false} dataKey="count" name="signals" radius={[3, 3, 0, 0]}>
                            {makeBins(fcClamped, 2, -20, 20).map((b, i) => (
                              <Cell key={i} fill={b.mid >= 0 ? POS : NEG} fillOpacity={0.8} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                />

                <XCard
                  title={t("terminal.viz.oppTitle")}
                  guide="opp"
                  desc={t("terminal.viz.oppDesc")}
                  zoom={zOpp}
                  hint={t("terminal.viz.oppHint")}
                  render={(h) => (
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                          <CartesianGrid stroke={GRID} strokeDasharray="3 6" />
                          <XAxis
                            type="number"
                            dataKey="x"
                            tick={TICK}
                            axisLine={false}
                            tickLine={false}
                            unit="%"
                            domain={zOpp.domX}
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
                            domain={zOpp.domY}
                            allowDataOverflow
                            tickFormatter={fmtAxis}
                          />
                          <Tooltip
                            content={<ScatterTip xLabel="Δ call %" yLabel="upside left %" />}
                            cursor={{ strokeDasharray: "3 3", stroke: GOLD }}
                          />
                          <ReferenceLine x={0} stroke={GOLD} strokeDasharray="3 3" />
                          <Scatter
                            isAnimationActive={false}
                            data={namedLast(
                              agg.scatterOpp.map((p) => ({
                                ...p,
                                fill: RISK_COLORS[p.risk] || GRAYBAR,
                                sc: statusColorOf(statusMap, p.pair),
                                named: oppNamed.has(p.pair),
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

              <XCard
                title={t("terminal.viz.peakTitle")}
                guide="peak"
                desc={t("terminal.viz.peakDesc")}
                zoom={zPeak}
                size="hero"
                hint={t("terminal.viz.peakHint")}
                render={(h) => (
                  <div style={{ height: Math.max(h, 280) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                        <CartesianGrid stroke={GRID} />
                        <XAxis
                          type="number"
                          dataKey="x"
                          tick={TICK}
                          axisLine={false}
                          tickLine={false}
                          unit="%"
                          domain={zPeak.domX}
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
                          domain={zPeak.domY}
                          allowDataOverflow
                          tickFormatter={fmtAxis}
                        />
                        <Tooltip
                          content={<ScatterTip xLabel="peak %" yLabel="now %" />}
                          cursor={{ strokeDasharray: "3 3", stroke: GOLD }}
                        />
                        <ReferenceLine
                          segment={[
                            { x: 0, y: 0 },
                            { x: 150, y: 150 },
                          ]}
                          stroke="rgb(var(--ink) / 0.2)"
                          strokeDasharray="4 4"
                        />
                        <ReferenceLine y={0} stroke={GOLD} strokeDasharray="3 3" />
                        <Scatter
                          isAnimationActive={false}
                          data={namedLast(
                            agg.peakPts.map((p) => ({
                              ...p,
                              fill: p.win ? GOLD : p.y >= 0 ? POS : NEG,
                              sc: statusColorOf(statusMap, p.pair),
                              named: peakNamed.has(p.pair),
                            }))
                          )}
                          shape={<PairBubble onPair={openPair} />}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                )}
              />

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.topGainers")}
                  guide="topGainers"
                  desc={t("terminal.viz.topGainersDesc")}
                  render={() => <RankBars data={gainers} onPair={openPair} />}
                />
                <XCard
                  title={t("terminal.viz.topLosers")}
                  guide="topLosers"
                  desc={t("terminal.viz.topLosersDesc")}
                  render={() => <RankBars data={losers} onPair={openPair} />}
                />
              </div>

              {agg.suspects.length > 0 && (
                <XCard
                  title={t("terminal.viz.suspectTitle")}
                  guide="suspect"
                  desc={t("terminal.viz.suspectDesc")}
                  render={() => (
                    <div className="flex flex-wrap gap-1.5 py-2">
                      {agg.suspects.slice(0, 30).map((s) => (
                        <span
                          key={s.pair}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-sm border border-warning/25 bg-warning/[0.06] font-mono text-[10px]"
                        >
                          <CoinPill pair={s.pair} onPair={openPair} />
                          <span className="text-text-muted">{fmtPct(s.v, 0)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                />
              )}
            </>
    </>
  );
}
