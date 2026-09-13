// Sectors — where capital sits and where it moved.
//
// Extracted from SignalsAnalytics along with the rest of the tabs. Whatever
// this tab computes now runs only while it is open.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ScatterChart,
  Scatter,
  ReferenceLine,
} from "recharts";
import CoinLogo from "../../CoinLogo";
import {
  XCard,
  Kpi,
  Chip,
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
  useZoom,
  useChartHeight,
  statusColorOf,
  fmtPct,
  fmtMoney,
  fmtAxis,
  median,
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
} from "../vizShared";

export default function SectorsTab({
  agg,
  view,
  deriv,
  setF,
  openPair,
  openSignalRow,
  pairFc,
  selSectors,
}) {
  const { t } = useTranslation();

  return (
    <>
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.radarTitle")}
                  guide="radar"
                  desc={t("terminal.viz.radarDesc")}
                  render={(h) => (
                    <div style={{ height: Math.max(h, 260) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart
                          data={agg.sectors.filter((s) => s.sector !== "unclassified").slice(0, 7)}
                          outerRadius="72%"
                        >
                          <PolarGrid stroke="rgb(var(--ink) / 0.12)" />
                          <PolarAngleAxis
                            dataKey="sector"
                            tick={{
                              fill: AXIS,
                              fontSize: 11,
                              fontFamily: "JetBrains Mono",
                              fontWeight: 600,
                            }}
                          />
                          {/* Solid accent radar — not washed slate on bright */}
                          <Radar
                            dataKey="count"
                            name="signals"
                            stroke="rgb(var(--accent))"
                            strokeWidth={2}
                            fill="rgb(var(--accent))"
                            fillOpacity={0.28}
                          />
                          <Tooltip content={<DarkTip />} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                />
                <XCard
                  title={t("terminal.viz.sectorCountTitle")}
                  guide="sectorCount"
                  desc={t("terminal.viz.sectorCountDesc")}
                  render={() => (
                    <SectorBars
                      data={agg.sectors.slice(0, 12)}
                      dataKey="count"
                      color={() => "rgb(var(--fg) / 0.72)"}
                      fmt={(v) => v}
                      onPick={(sec) => setF({ sectors: selSectors.includes(sec) ? "" : sec })}
                    />
                  )}
                />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.sectorFcTitle")}
                  guide="sectorFc"
                  desc={t("terminal.viz.sectorFcDesc")}
                  render={() => (
                    <SectorBars
                      data={agg.sectors.filter((s) => s.medFc != null).slice(0, 12)}
                      dataKey="medFc"
                      color={(v) => (v >= 0 ? POS : NEG)}
                      fmt={(v) => fmtPct(v)}
                      onPick={(sec) => setF({ sectors: selSectors.includes(sec) ? "" : sec })}
                      diverging
                    />
                  )}
                />
                <XCard
                  title={t("terminal.viz.sectorTgtTitle")}
                  guide="sectorTgt"
                  desc={t("terminal.viz.sectorTgtDesc")}
                  render={() => (
                    <SectorBars
                      data={agg.sectors.filter((s) => s.medTgt != null).slice(0, 12)}
                      dataKey="medTgt"
                      color={() => POS}
                      fmt={(v) => fmtPct(v, 0)}
                      onPick={(sec) => setF({ sectors: selSectors.includes(sec) ? "" : sec })}
                    />
                  )}
                />
              </div>

              {/* Sector signal desk — drill active sector filter to pairs → SignalModal */}
              {(() => {
                const activeSec = selSectors[0] || null;
                const sectorSignals = activeSec
                  ? view
                      .filter((s) => (s.sector || "unclassified") === activeSec)
                      .slice()
                      .sort((a, b) => {
                        const fa = pairFc[a.pair];
                        const fb = pairFc[b.pair];
                        if (fa == null && fb == null) return 0;
                        if (fa == null) return 1;
                        if (fb == null) return -1;
                        return fb - fa;
                      })
                  : [];
                const seen = new Set();
                const unique = [];
                sectorSignals.forEach((s) => {
                  if (seen.has(s.pair)) return;
                  seen.add(s.pair);
                  unique.push(s);
                });
                return (
                  <div className="overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/[0.05] bg-ink/[0.015] px-3.5 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12.5px] font-medium text-text-primary">
                            Sector signals
                          </span>
                          {activeSec && (
                            <span className="inline-flex items-center gap-1 rounded border border-ink/[0.1] bg-ink/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-text-primary/80">
                              <span className="opacity-70">
                                <SectorGlyph sector={activeSec} />
                              </span>
                              {activeSec}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[10.5px] text-text-muted">
                          {activeSec
                            ? `${unique.length} pairs · click a row to open call proof`
                            : "Click a sector bar above to drill into its signals."}
                        </p>
                      </div>
                      {activeSec && (
                        <button
                          type="button"
                          onClick={() => setF({ sectors: "" })}
                          className="font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-text-primary"
                        >
                          Clear filter
                        </button>
                      )}
                    </div>
                    {!activeSec ? (
                      <div className="px-4 py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted/55">
                        Select a sector to list signals
                      </div>
                    ) : unique.length === 0 ? (
                      <div className="px-4 py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted/55">
                        No signals in this sector for the current window
                      </div>
                    ) : (
                      <div className="max-h-[360px] divide-y divide-ink/[0.04] overflow-y-auto [scrollbar-width:thin]">
                        {unique.slice(0, 48).map((s) => {
                          const fc = pairFc[s.pair];
                          return (
                            <button
                              key={s.signal_id || s.pair}
                              type="button"
                              onClick={() => openSignalRow(s)}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-ink/[0.03]"
                            >
                              <CoinLogo pair={s.pair} size={22} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate font-mono text-[12.5px] font-semibold text-text-primary">
                                    {(s.pair || "").replace(/USDT$/i, "")}
                                  </span>
                                  <span className="rounded bg-ink/[0.05] px-1 py-px font-mono text-[10px] uppercase text-text-muted">
                                    {STATUS_LABEL[s.status] || s.status}
                                  </span>
                                </div>
                                <p className="mt-0.5 font-mono text-[9.5px] text-text-muted">
                                  {s.risk_norm || "—"} risk
                                  {s.max_target_pct != null
                                    ? ` · max +${Number(s.max_target_pct).toFixed(0)}%`
                                    : ""}
                                </p>
                              </div>
                              <span
                                className={`font-mono text-[12px] font-semibold tabular-nums ${
                                  fc == null
                                    ? "text-text-muted"
                                    : fc >= 0
                                      ? "text-positive"
                                      : "text-negative"
                                }`}
                              >
                                {fc == null ? "—" : fmtPct(fc, 1)}
                              </span>
                              <svg
                                className="h-3.5 w-3.5 text-text-primary/20"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.75}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
    </>
  );
}
