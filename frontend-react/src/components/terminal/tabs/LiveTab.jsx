// Live — what the desk is doing right now.
//
// Extracted from SignalsAnalytics, which carried eight tabs and ran every one
// of their hooks on every render. What this tab computes now runs only while it
// is open.
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import CoinLogo from "../../CoinLogo";
import TerminalScatter from "./TerminalScatter";
import { XCard, Kpi, SectionBand, RankBars, CoinPill, promote, useChartHeight, ChartLens, pctRange, statusColorOf, fmtPct, GOLD, POS, NEG, GRAYBAR, RISK_COLORS } from "../vizShared";

// Where the book stands — what replaced the P&L histogram.
//
// That chart binned 449 "active" calls by distance from entry, and the shape it
// drew was a pile around zero. Measured, here is why: of those 449 only SEVEN
// have never touched a target. The rest are 98 at TP1, 220 at TP2 and 124 at
// TP3, sitting there for a median of ~63 hours. So the histogram was not
// showing live opportunity, it was showing three-day-old winners drifting back
// toward their entries — and drawing them as if distance-from-entry were still
// the question.
//
// The rung a call has reached IS the question, and nothing on this desk showed
// it. Age sits beside each rung because a TP2 from 63 hours ago and a TP2 from
// this morning are not the same call.
const RUNGS = [
  { key: "open", label: "Open", color: "rgb(var(--ink) / 0.35)" },
  { key: "tp1", label: "TP1", color: "rgb(var(--pos) / 0.5)" },
  { key: "tp2", label: "TP2", color: "rgb(var(--pos) / 0.75)" },
  { key: "tp3", label: "TP3", color: "rgb(var(--pos))" },
];

function medianHours(list) {
  const xs = list
    .map((s) => {
      const t = s?.created_at ? new Date(s.created_at).getTime() : NaN;
      return Number.isFinite(t) ? (Date.now() - t) / 3600000 : null;
    })
    .filter((x) => x != null && x >= 0)
    .sort((a, b) => a - b);
  if (!xs.length) return null;
  return xs[Math.floor(xs.length / 2)];
}

const fmtAge = (h) =>
  h == null ? "—" : h < 24 ? `${Math.round(h)}h` : `${(h / 24).toFixed(1)}d`;

export function LadderPanel({ view }) {
  const rows = useMemo(() => {
    const by = Object.fromEntries(RUNGS.map((r) => [r.key, []]));
    for (const s of view || []) {
      const k = String(s?.status || "").toLowerCase();
      if (by[k]) by[k].push(s);
    }
    const total = RUNGS.reduce((n, r) => n + by[r.key].length, 0);
    return { total, list: RUNGS.map((r) => ({ ...r, n: by[r.key].length, age: medianHours(by[r.key]) })) };
  }, [view]);

  if (!rows.total) return null;

  return (
    <div className="space-y-2">
      {rows.list.map((r) => (
        <div key={r.key} className="flex items-center gap-2.5">
          <span className="w-9 shrink-0 font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {r.label}
          </span>
          <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(r.n / rows.total) * 100}%`, background: r.color }}
            />
          </span>
          <span className="w-9 shrink-0 text-right font-mono text-[12px] tabular-nums text-text-primary">
            {r.n}
          </span>
          <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-text-muted/80">
            {fmtAge(r.age)}
          </span>
        </div>
      ))}
      <p className="pt-1 text-[10px] leading-relaxed text-text-muted">
        Right column is the median age at that rung. Only <strong className="text-text-primary">Open</strong>{" "}
        has never touched a target — everything below it already paid once.
      </p>
    </div>
  );
}

const hoursSince = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? (Date.now() - t) / 3600000 : null;
};

const fmtMins = (sec) => (sec == null ? "—" : sec < 60 ? `${Math.round(sec)}s` : `${Math.round(sec / 60)}m`);

const RUNG_TONE = {
  open: "text-text-muted border-ink/15",
  tp1: "text-positive border-positive/30",
  tp2: "text-positive border-positive/30",
  tp3: "text-accent border-accent/40",
};

/** The shortlist. See the note beside `stillRunning` in SignalsAnalytics for the
 *  measurement this rule rests on — and the width control that rules out the
 *  obvious confound. */
export function StillRunning({ rows, onPair }) {
  if (!rows?.length) return null;
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => {
        const down = r.fc < 0;
        return (
          <button
            key={r.signal_id || r.pair}
            type="button"
            onClick={() => onPair?.(r.pair)}
            className="flex items-center gap-2.5 rounded-lg border border-ink/[0.06] bg-ink/[0.02] px-2.5 py-2 text-left transition-colors hover:border-ink/15 hover:bg-ink/[0.04]"
          >
            <CoinLogo pair={r.pair} size={26} />

            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="truncate font-mono text-[13px] font-semibold text-text-primary">
                  {String(r.pair).replace(/USDT$/i, "")}
                </span>
                <span
                  className={`shrink-0 rounded border px-1 font-mono text-[9px] uppercase ${
                    RUNG_TONE[r.status] || "text-text-muted border-ink/15"
                  }`}
                >
                  {r.status}
                </span>
              </span>
              {/* Why it is on this list, and how old it is — a fast TP1 from
                  five days ago and one from this morning are not the same. */}
              <span className="mt-0.5 block font-mono text-[9.5px] text-text-muted">
                TP1 in {fmtMins(r.tt1)} · called {fmtAge(hoursSince(r.created_at))} ago
              </span>
            </span>

            <span className="shrink-0 text-right">
              {/* The live distance leads and is coloured. It used to sit in grey
                  beside the room figure, so a call 26% under water read exactly
                  like one sitting on its entry. */}
              <span
                className={`block font-mono text-[13px] tabular-nums ${
                  down ? "text-negative" : "text-positive"
                }`}
                title="Live price against the entry of this call"
              >
                {r.fc >= 0 ? "+" : ""}
                {r.fc.toFixed(1)}%
              </span>
              <span
                className="mt-0.5 block font-mono text-[9.5px] text-text-muted"
                title="Distance still to run to the last target"
              >
                {r.left.toFixed(1)}% to go
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function LiveTab({ agg, view, openPair, statusMap, fcClamped }) {
  const { t } = useTranslation();
  const stdH = useChartHeight("std");
  const heroH = useChartHeight("hero");

  // Fitted to the data rather than set by hand. The anomaly cloud is heavily
  // skewed — 96% of coins move inside ±13% while one freshly listed pair prints
  // +98% — so a fixed ±30 either hides the tail or crushes everything else into
  // a dot. Percentile bounds, with outliers clamped to the rail so they are
  // still visible, keep both readable. Floors stop a quiet day from magnifying
  // noise into a storm.
  // Per-chart lens. Zoom magnifies a crowd; it does not thin one — the labels
  // that collide at 1x collide at 3x. These say WHICH points to draw.
  const [oppLayer, setOppLayer] = useState("all");
  const [oppLabels, setOppLabels] = useState("focus");
  const [peakLayer, setPeakLayer] = useState("all");
  const [peakLabels, setPeakLabels] = useState("focus");

  // Fitted to the data, not typed in. Both of these carried hard-coded domains
  // while the anomaly chart already had percentile fitting for exactly this
  // fault. Measured on 446 active calls: peak is median 4.8%, p95 20.1%, p98
  // 34.3% — and max 198.9%, with FOUR calls past 50% and two past 100%. The
  // axis ran to 150%, so it was sized for two points and squeezed the other 444
  // into the leftmost eighth of the canvas.
  //
  // Percentile bounds with outliers CLAMPED to the rail, never dropped: a
  // hidden outlier is a lie, a stacked one still says "there is more past here".
  const oppDomX = useMemo(
    () => pctRange(agg.scatterOpp.map((p) => p.x), 0.97, 0, 24),
    [agg.scatterOpp]
  );
  const oppDomY = useMemo(
    () => pctRange(agg.scatterOpp.map((p) => p.y), 0.97, 0, 24),
    [agg.scatterOpp]
  );
  const peakDomX = useMemo(
    () => pctRange(agg.peakPts.map((p) => p.x), 0.97, 0, 24),
    [agg.peakPts]
  );
  const peakDomY = useMemo(
    () => pctRange(agg.peakPts.map((p) => p.y), 0.97, 0, 24),
    [agg.peakPts]
  );

  // Layers named for what the chart already claims to show. The opportunity
  // map's own subtitle says "top-left = near entry with large remaining
  // target", so "near entry" is a layer rather than something to squint for.
  const oppPts = useMemo(() => {
    const p = agg.scatterOpp;
    if (oppLayer === "near") return p.filter((x) => Math.abs(x.x) <= 5);
    if (oppLayer === "up") return p.filter((x) => x.x > 0);
    if (oppLayer === "down") return p.filter((x) => x.x < 0);
    return p;
  }, [agg.scatterOpp, oppLayer]);

  // Peak vs current is read against the diagonal: y below x means the move came
  // and went. "Gave back" is that region, made selectable instead of inferred.
  const peakPts = useMemo(() => {
    const p = agg.peakPts;
    if (peakLayer === "gave") return p.filter((x) => x.x - x.y >= 5);
    if (peakLayer === "held") return p.filter((x) => x.x - x.y < 5);
    if (peakLayer === "down") return p.filter((x) => x.y < 0);
    return p;
  }, [agg.peakPts, peakLayer]);

  const labelMax = (mode) => (mode === "off" ? 0 : mode === "all" ? 400 : 18);

  // ECharts owns the wheel and the drag now; these shims only give the card's
  // three buttons something real to do, and tell it when there is a view worth
  // resetting. Same arrangement AnomalyTab uses.
  const oppApi = useRef(null);
  const peakApi = useRef(null);
  const [oppZoomed, setOppZoomed] = useState(false);
  const [peakZoomed, setPeakZoomed] = useState(false);
  const mkZoom = (ref, zoomed, setZoomed) => ({
    zoomIn: () => {
      ref.current?.zoomIn();
      setZoomed(true);
    },
    zoomOut: () => {
      ref.current?.zoomOut();
      setZoomed(ref.current?.isZoomed() ?? false);
    },
    reset: () => {
      ref.current?.reset();
      setZoomed(false);
    },
    zoomed,
    nudge: false,
  });
  const zOpp = useMemo(() => mkZoom(oppApi, oppZoomed, setOppZoomed), [oppZoomed]);
  const zPeak = useMemo(() => mkZoom(peakApi, peakZoomed, setPeakZoomed), [peakZoomed]);

  const oppNamed = useMemo(
    () => promote(oppPts, oppDomX, oppDomY, stdH, labelMax(oppLabels), (p) => p.y),
    [oppPts, oppDomX, oppDomY, stdH, oppLabels]
  );

  const peakNamed = useMemo(
    () => promote(peakPts, peakDomX, peakDomY, heroH, labelMax(peakLabels), (p) => p.x),
    [peakPts, peakDomX, peakDomY, heroH, peakLabels]
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
              {/* The shortlist goes ABOVE the recap. The tab opened on top
                  gainer / winners / median winner, which are all answers to
                  "how did we do" — a fine thing to know and the wrong thing to
                  lead with on a screen people open to decide what to look at
                  next. */}
              <XCard
                title={t("terminal.viz.runningTitle")}
                desc={t("terminal.viz.runningDesc")}
                size="compact"
                render={() =>
                  agg.stillRunning?.length ? (
                    <StillRunning rows={agg.stillRunning} onPair={openPair} />
                  ) : (
                    <p className="py-6 text-center text-[11px] text-text-muted">
                      {t("terminal.viz.runningEmpty")}
                    </p>
                  )
                }
              />

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
                {/* height={0}: four bars are not a chart, and the chart-sized
                    box left ~70% of this card empty with the rows pinned to its
                    bottom edge. */}
                <XCard
                  title={t("terminal.viz.ladderTitle")}
                  desc={t("terminal.viz.ladderDesc")}
                  height={0}
                  render={() => (
                    <div className="px-1 pt-1">
                      <LadderPanel view={view} />
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
                    <>
                      <ChartLens
                        layers={[
                          { id: "all", label: "All" },
                          { id: "near", label: "Near entry", hint: "Within 5% of the called price" },
                          { id: "up", label: "In profit" },
                          { id: "down", label: "Under entry" },
                        ]}
                        layer={oppLayer}
                        onLayer={setOppLayer}
                        labels={oppLabels}
                        onLabels={setOppLabels}
                        shown={oppPts.length}
                      />
                    <TerminalScatter
                      points={oppPts.map((p) => ({
                        ...p,
                        fill: RISK_COLORS[p.risk] || GRAYBAR,
                        sc: statusColorOf(statusMap, p.pair),
                      }))}
                      named={oppNamed}
                      domX={oppDomX}
                      domY={oppDomY}
                      height={h}
                      labelMode={oppLabels}
                      onPair={openPair}
                      onApi={(api) => {
                        oppApi.current = api;
                      }}
                      tip={(pt) =>
                        `${String(pt.name).replace(/USDT$/i, "")}<br/>from entry ${pt.value[0].toFixed(1)}%<br/>room left ${pt.value[1].toFixed(1)}%`
                      }
                    />
                    </>
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
                  <>
                    <ChartLens
                      layers={[
                        { id: "all", label: "All" },
                        {
                          id: "gave",
                          label: "Gave back",
                          hint: "Peak is at least 5pp above where it sits now",
                        },
                        { id: "held", label: "Holding" },
                        { id: "down", label: "Under entry" },
                      ]}
                      layer={peakLayer}
                      onLayer={setPeakLayer}
                      labels={peakLabels}
                      onLabels={setPeakLabels}
                      shown={peakPts.length}
                    />
                  <TerminalScatter
                    points={peakPts.map((p) => ({
                      ...p,
                      fill: p.win ? GOLD : p.y >= 0 ? POS : NEG,
                      sc: statusColorOf(statusMap, p.pair),
                    }))}
                    named={peakNamed}
                    domX={peakDomX}
                    domY={peakDomY}
                    height={Math.max(h, 280)}
                    labelMode={peakLabels}
                    diagonal
                    onPair={openPair}
                    onApi={(api) => {
                      peakApi.current = api;
                    }}
                    tip={(pt) =>
                      `${String(pt.name).replace(/USDT$/i, "")}<br/>peak ${pt.value[0].toFixed(1)}%<br/>now ${pt.value[1].toFixed(1)}%`
                    }
                  />
                  </>
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
