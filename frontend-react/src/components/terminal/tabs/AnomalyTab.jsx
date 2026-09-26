// Anomaly — price against turnover, the tab's own state and its own chart.
//
// Extracted from SignalsAnalytics, which was 2,764 lines for eight tabs. The
// size was the smaller problem: every hook here — the percentile fit, promote(),
// useZoom — ran on EVERY render of EVERY tab, because they sat at the top of the
// shared component. They now run when this tab is open and not otherwise.
import { useState, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import CoinLogo from "../../CoinLogo";
import AnomalyScatter from "./AnomalyScatter";
import { XCard, Kpi, SectionBand, STATUS_LABEL, RankBars, useChartHeight, GOLD, CYAN, fmtPct } from "../vizShared";
import { ANOM_SETUPS, ANOM_FILL } from "../anomSetups";
import { STRONG_TAGS, WARN_TAGS } from "../tagGlossary";


export default function AnomalyTab({
  agg,
  deriv,
  view,
  latestByPair,
  pairFc,
  statusMap,
  openPair,
  openSignalRow,
}) {
  const { t } = useTranslation();
  const heroH = useChartHeight("hero");
  const rsTop = useMemo(() => [...agg.rs].sort((a, b) => b.v - a.v).slice(0, 8), [agg.rs]);
  const rsBottom = useMemo(() => [...agg.rs].sort((a, b) => a.v - b.v).slice(0, 8), [agg.rs]);

  // `session` and `earlyEdge` came with the block: both were computed in the
  // shared component and read by this tab alone, so every other tab was paying
  // for them on every render.
  // ── live session layers — PRECOMPUTED server-side by the worker ──
  // (chg_15m & spike_15m ship in the blob → no client warm-up ever)
  const session = useMemo(() => {
    const seen = new Set();
    const movers15 = [];
    const spikes = [];
    view.forEach((s) => {
      if (!s.pair || seen.has(s.pair)) return;
      seen.add(s.pair);
      const d = deriv?.pairs?.[s.pair];
      if (!d) return;
      if (d.chg_15m != null) movers15.push({ pair: s.pair, v: d.chg_15m });
      if (d.spike_15m != null && d.spike_15m > 1.5) spikes.push({ pair: s.pair, v: d.spike_15m });
    });
    return {
      spikes: spikes.sort((a, b) => b.v - a.v).slice(0, 10),
      gain15: movers15.sort((a, b) => b.v - a.v).slice(0, 8),
      lose15: movers15.sort((a, b) => a.v - b.v).slice(0, 8),
      warming: !deriv || deriv.warming || movers15.length === 0,
    };
  }, [view, deriv]);

  // Early edge — strong/clean setups that have NOT run to high TP yet
  // (still open / TP1 / TP2, live P&L modest or red). Actionable scan list.
  const earlyEdge = useMemo(() => {
    const EARLY = new Set(["open", "tp1", "tp2"]);
    const seen = new Set();
    const out = [];
    Object.values(latestByPair).forEach((s) => {
      if (!s?.pair || seen.has(s.pair)) return;
      if (!EARLY.has(s.status)) return;
      const tags = s.v3?.tags || [];
      if (!tags.length || !STRONG_TAGS.some((x) => tags.includes(x))) return;
      if (tags.some((x) => WARN_TAGS.includes(x))) return;
      const fc = pairFc[s.pair];
      // Still early: under water, flat, or modest green — not already a runaway
      if (fc != null && fc > 18) return;
      const strength = tags.filter((x) => STRONG_TAGS.includes(x)).length;
      const score =
        strength * 12 +
        (tags.includes("SMC_GOLDEN_SETUP") ? 8 : 0) +
        (s.status === "open" ? 4 : s.status === "tp1" ? 2 : 0) +
        (fc == null ? 0 : fc < 0 ? 5 : Math.max(0, 6 - fc / 3));
      seen.add(s.pair);
      out.push({
        s,
        fc,
        status: s.status,
        score,
        golden: tags.includes("SMC_GOLDEN_SETUP"),
        htf: tags.includes("HTF_TREND_STRONG"),
        aligned: tags.includes("MTF_FULL_ALIGNED"),
      });
    });
    return out.sort((a, b) => b.score - a.score).slice(0, 18);
  }, [latestByPair, pairFc]);
  const [anomLayer, setAnomLayer] = useState("all");  const [anomLabels, setAnomLabels] = useState("focus");
  // Anomaly tab meta — hot list, legend counts, data-age freshness badge
  const anomMeta = useMemo(() => {
    const hotPts = agg.anomPts.filter((p) => p.hot).sort((a, b) => b.x - a.x);
    const decN = agg.anomPts.filter((p) => p.dec && !p.hot).length;
    const restN = agg.anomPts.filter((p) => !p.hot && !p.dec).length;
    const ageS = deriv?.generated_at
      ? Math.max(0, Math.round((Date.now() - Date.parse(deriv.generated_at)) / 1000))
      : null;
    const fresh = ageS != null && ageS < 90 && !deriv?.stale;
    // Live count per setup. Shown on every chip, including the zeroes: a
    // capitulation count of 0 on a green day is the answer to a question, not a
    // broken control, and hiding it would make the board look like it never has
    // one.
    const bySetup = {};
    ANOM_SETUPS.forEach((x) => {
      bySetup[x.id] = 0;
    });
    agg.anomPts.forEach((p) => {
      if (bySetup[p.setup] != null) bySetup[p.setup] += 1;
    });
    return { hotPts, hotN: hotPts.length, decN, restN, ageS, fresh, bySetup };
  }, [agg.anomPts, deriv?.generated_at, deriv?.stale]);

  const anomSetup = ANOM_SETUPS.find((x) => x.id === anomLayer) || null;

  // Which points the chart is showing. "all" is everything; "dec" is the
  // decoupled cut; anything else is one of the ANOM_SETUPS regimes.
  const anomChartPts = useMemo(() => {
    const pts = agg.anomPts || [];
    if (anomLayer === "all") return pts;
    if (anomLayer === "dec") return pts.filter((p) => p.dec);
    return pts.filter((p) => p.setup === anomLayer);
  }, [agg.anomPts, anomLayer]);
  // Y is zoomed and panned in log space, so the gesture stays linear and each
  // decade keeps the same height on screen.
  // The card's zoom buttons now drive the canvas chart. ECharts owns pan and
  // wheel-zoom itself; this only gives the three buttons something real to do,
  // and tells the card when there is a view worth resetting.
  const anomApi = useRef(null);
  const [anomZoomed, setAnomZoomed] = useState(false);
  const anomZoom = useMemo(
    () => ({
      zoomIn: () => {
        anomApi.current?.zoomIn();
        setAnomZoomed(true);
      },
      zoomOut: () => {
        anomApi.current?.zoomOut();
        setAnomZoomed(anomApi.current?.isZoomed() ?? false);
      },
      reset: () => {
        anomApi.current?.reset();
        setAnomZoomed(false);
      },
      zoomed: anomZoomed,
      nudge: false,
    }),
    [anomZoomed]
  );

  return (
    <>
              <SectionBand
                title={t("terminal.viz.sectionAnom")}
                guide="anomaly"
                desc={t("terminal.viz.sectionAnomDesc")}
                badge={
                  <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-ink/[0.08] bg-ink/[0.02] font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${anomMeta.fresh ? "bg-positive animate-pulse" : "bg-warning"}`}
                    />
                    {anomMeta.fresh ? "Live" : "Stale"}
                    {anomMeta.ageS != null && (
                      <span className="text-text-primary/50">· {anomMeta.ageS}s</span>
                    )}
                  </span>
                }
              />

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <Kpi
                  compact
                  label="Early edge"
                  value={earlyEdge.length}
                  sub={earlyEdge.length ? "Strong setup · ≤TP2" : t("terminal.viz.none")}
                  tone={earlyEdge.length ? "text-positive" : undefined}
                />
                <Kpi
                  compact
                  label={t("terminal.viz.kHot")}
                  value={anomMeta.hotN}
                  sub={anomMeta.hotN ? t("terminal.viz.kHotSub") : t("terminal.viz.none")}
                />
                <Kpi
                  compact
                  label={t("terminal.viz.kSpikes")}
                  value={session.spikes.length}
                  sub={
                    session.spikes.length ? t("terminal.viz.kSpikesSub") : t("terminal.viz.none")
                  }
                />
                <Kpi
                  compact
                  label={t("terminal.viz.kSession")}
                  value={anomMeta.ageS != null ? `${anomMeta.ageS}s` : "—"}
                  sub={
                    anomMeta.fresh ? t("terminal.viz.kSessionFresh") : t("terminal.viz.kSessionLag")
                  }
                  tone={
                    deriv?.stale
                      ? "text-warning"
                      : anomMeta.fresh
                        ? "text-positive"
                        : "text-warning"
                  }
                />
              </div>

              {/* Early edge desk — good structure not yet at high TP; click opens modal */}
              <div className="overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ink/[0.05] bg-ink/[0.015] px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-medium text-text-primary">
                        Early edge
                      </span>
                      <span className="rounded border border-ink/[0.08] bg-ink/[0.03] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-text-muted">
                        {earlyEdge.length}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10.5px] leading-snug text-text-muted">
                      Strong confluence still open / TP1 / TP2 — not extended. Tap a chip to open
                      call proof.
                    </p>
                  </div>
                </div>
                {earlyEdge.length === 0 ? (
                  <div className="px-3.5 py-8 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted/60">
                    No early-edge setups in the current window
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 p-3">
                    {earlyEdge.map(({ s, fc, status, golden, htf, aligned }) => (
                      <button
                        key={s.signal_id || s.pair}
                        type="button"
                        onClick={() => openSignalRow(s)}
                        className="group inline-flex items-center gap-1.5 rounded-lg border border-ink/[0.08] bg-ink/[0.03] py-1.5 pl-1.5 pr-2.5 transition-colors hover:border-ink/18 hover:bg-ink/[0.06]"
                      >
                        <CoinLogo pair={s.pair} size={18} />
                        <span className="font-mono text-[11.5px] font-semibold text-text-primary group-hover:text-text-primary">
                          {(s.pair || "").replace(/USDT$/i, "")}
                        </span>
                        <span className="rounded bg-ink/[0.06] px-1 py-px font-mono text-[10px] uppercase tracking-wide text-text-muted">
                          {STATUS_LABEL[status] || status}
                        </span>
                        {golden && (
                          <span className="rounded border border-ink/10 px-1 py-px font-mono text-[9.5px] uppercase text-text-primary/55">
                            golden
                          </span>
                        )}
                        {!golden && htf && (
                          <span className="font-mono text-[9.5px] uppercase text-text-muted">
                            htf
                          </span>
                        )}
                        {!golden && !htf && aligned && (
                          <span className="font-mono text-[9.5px] uppercase text-text-muted">
                            mtf
                          </span>
                        )}
                        <span
                          className={`font-mono text-[11px] tabular-nums ${
                            fc == null
                              ? "text-text-muted"
                              : fc >= 0
                                ? "text-positive"
                                : "text-negative"
                          }`}
                        >
                          {fc == null ? "—" : fmtPct(fc, 1)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {anomMeta.hotN > 0 && (
                <div className="overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                      {t("terminal.viz.hotNow")}
                    </span>
                    {anomMeta.hotPts.slice(0, 12).map((p) => (
                      <button
                        key={p.pair}
                        type="button"
                        onClick={() => openPair(p.pair)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-ink/[0.1] bg-ink/[0.04] py-1 pl-1.5 pr-2 transition-colors hover:border-ink/20 hover:bg-ink/[0.08]"
                      >
                        <CoinLogo pair={p.pair} size={15} />
                        <span className="font-mono text-[10.5px] text-text-primary/85">
                          {(p.pair || "").replace(/USDT$/i, "")}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-text-muted">
                          {fmtPct(p.x, 1)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Price vs volume — full width + large by default (not side-by-side) */}
              <XCard
                title={t("terminal.viz.anomTitle")}
                guide="anom"
                desc={t("terminal.viz.anomDesc")}
                zoom={anomZoom}
                size="hero"
                hint={t("terminal.viz.anomHint")}
                render={(h) => (
                  // h is the CHART's height, not the card's. It used to cap
                  // this whole box, so every row of chrome above the plot came
                  // out of the plot: with the setup strip and the colour key in
                  // place the chart was left about 250px of a 660px budget and
                  // 400 points were stacked into a band. The card grows to fit
                  // its chrome instead.
                  <div className="flex flex-col min-w-0">
                    {/* Setup shortcuts.
                        The old control was All / Hot / Other, and "Other 378"
                        is not a thing anyone looks for — it is the leftovers.
                        These are the five regimes of price against turnover,
                        each with the count it actually holds right now. */}
                    <div className="mb-2 flex flex-wrap items-center gap-1.5 shrink-0">
                      <span className="mr-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/60">
                        Setup
                      </span>
                      {[
                        { id: "all", label: "All", n: agg.anomPts.length, dot: null },
                        ...ANOM_SETUPS.map((x) => ({
                          id: x.id,
                          label: x.label,
                          n: anomMeta.bySetup?.[x.id] ?? 0,
                          dot: x.dot,
                        })),
                        // Decoupled is genuine but rare: 0 of the last 655
                        // calls, 0.9% of all history. An always-empty control
                        // teaches people it is broken, so it appears only when
                        // it has members. The setups above are different — they
                        // are regime-dependent, so a zero on one of those is
                        // today's answer and stays visible.
                        ...(anomMeta.decN > 0
                          ? [{ id: "dec", label: "Decoupled", n: anomMeta.decN, dot: "bg-[var(--viz-5)]" }]
                          : []),
                      ].map((opt) => {
                        const empty = opt.n === 0;
                        const on = anomLayer === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={empty}
                            onClick={() => setAnomLayer(opt.id)}
                            title={empty ? `No ${opt.label.toLowerCase()} on the board right now` : undefined}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                              on
                                ? "border-ink/18 bg-ink/[0.09] font-semibold text-text-primary"
                                : empty
                                  ? "cursor-not-allowed border-ink/[0.05] text-text-muted/40"
                                  : "border-ink/[0.07] text-text-muted hover:border-ink/14 hover:text-text-primary"
                            }`}
                          >
                            {opt.dot && (
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${opt.dot} ${empty ? "opacity-40" : ""}`}
                                aria-hidden
                              />
                            )}
                            {opt.label}
                            <span className="tabular-nums text-text-muted/70">{opt.n}</span>
                          </button>
                        );
                      })}
                      <span className="mx-1 h-3 w-px bg-ink/10" aria-hidden />
                      <span className="mr-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted/60">
                        Names
                      </span>
                      {[
                        { id: "focus", label: "Ranked" },
                        { id: "all", label: "Most names" },
                        { id: "off", label: "Off" },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setAnomLabels(opt.id)}
                          className={`rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                            anomLabels === opt.id
                              ? "border-ink/18 bg-ink/[0.09] font-semibold text-text-primary"
                              : "border-ink/[0.07] text-text-muted hover:border-ink/14 hover:text-text-primary"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                      <span className="ml-auto font-mono text-[10px] tabular-nums text-text-muted">
                        {anomChartPts.length} shown
                      </span>
                    </div>

                    {/* What the chosen setup is, and what it means. A filter
                        that only narrows a cloud teaches nothing; the reason it
                        is worth looking at belongs next to the button. */}
                    {anomSetup && (
                      <div className="mb-2 flex shrink-0 items-start gap-2.5 rounded-lg border border-ink/[0.07] bg-ink/[0.02] px-3 py-1.5">
                        <span
                          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${anomSetup.dot}`}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <span className="text-[12px] font-medium text-text-primary">
                            {anomSetup.label}
                          </span>
                          <span className="ml-2 font-mono text-[10.5px] text-text-muted">
                            {anomSetup.what}
                          </span>
                          <span className="ml-2 text-[11.5px] leading-snug text-text-muted">
                            {anomSetup.why}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAnomLayer("all")}
                          className="ml-auto shrink-0 rounded-md border border-ink/[0.08] px-2 py-1 font-mono text-[9.5px] uppercase tracking-wider text-text-muted transition-colors hover:border-ink/20 hover:text-text-primary"
                        >
                          Clear
                        </button>
                      </div>
                    )}

                    {/* The five setups were being explained in four places at
                        once: the buttons carry their counts, the strip above
                        explains whichever is selected, the legend under the plot
                        repeats them, and How to read has the long version. The
                        five-column key was the fourth copy and it cost about
                        160px of chart. What is left is the axis caption, which
                        nothing else says. */}
                    <div className="mb-2 shrink-0 rounded-lg border border-ink/[0.07] bg-ink/[0.02] px-2.5 py-1.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-text-muted/85">
                        <span>
                          <span className="text-text-primary/70">X</span> = 24h price change %
                        </span>
                        <span className="text-ink/15">·</span>
                        <span>
                          <span className="text-text-primary/70">Y</span> = volume / market cap %
                          (log)
                        </span>
                        <span className="text-ink/15">·</span>
                        <span>
                          <span className="text-warning/90">Orange line</span> = 3× median flow
                        </span>
                      </div>
                    </div>

                    <div className="min-w-0" style={{ height: h }}>
                      <AnomalyScatter
                        points={anomChartPts}
                        medFlow={agg.medFlow}
                        statusMap={statusMap}
                        onPair={openPair}
                        height={h}
                        labelMode={anomLabels}
                        maxNames={anomLayer === "all" ? 16 : 26}
                        onApi={(api) => {
                          anomApi.current = api;
                        }}
                      />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-center gap-3 border-t border-ink/[0.04] pt-1.5 shrink-0">
                      {/* The legend under the plot is where people look for
                          "what does this colour mean", so it carries the same
                          five setups as the buttons above and filters the same
                          way. It used to offer Hot / Decoupled / Other, which
                          named three of the six things the chart draws. */}
                      {[
                        ...ANOM_SETUPS.map((x) => ({
                          c: ANOM_FILL[x.id],
                          l: x.label,
                          n: anomMeta.bySetup?.[x.id] ?? 0,
                          id: x.id,
                        })),
                        ...(anomMeta.decN > 0
                          ? [{ c: CYAN, l: t("terminal.viz.legDec"), n: anomMeta.decN, id: "dec" }]
                          : []),
                      ].map((e) => (
                        <button
                          key={e.l}
                          type="button"
                          onClick={() => setAnomLayer(anomLayer === e.id ? "all" : e.id)}
                          className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                            anomLayer === e.id
                              ? "bg-ink/[0.08] text-text-primary"
                              : "text-text-muted hover:text-text-primary"
                          }`}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              background: e.c,
                              boxShadow:
                                e.c === GOLD ? "0 0 6px rgb(var(--accent) / 0.5)" : undefined,
                            }}
                          />
                          {e.l}
                          <span className="tabular-nums text-text-primary/45">{e.n}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              />

              <div className="grid grid-cols-1 gap-3">
                <XCard
                  title={t("terminal.viz.spikeTitle")}
                  guide="spike"
                  desc={t("terminal.viz.spikeDesc")}
                  size="hero"
                  render={() =>
                    session.spikes.length === 0 ? (
                      <div className="py-14 text-center">
                        <div className="mx-auto w-10 h-10 rounded-full border border-ink/[0.06] bg-ink/[0.02] flex items-center justify-center mb-3">
                          <span className="text-text-muted/50 text-lg leading-none">∅</span>
                        </div>
                        <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted leading-relaxed">
                          {session.warming
                            ? t("terminal.viz.spikeWarming")
                            : t("terminal.viz.none")}
                        </div>
                      </div>
                    ) : (
                      <RankBars
                        align="start"
                        // Volume intensity ≠ PnL — monochrome ink, never red/green
                        data={session.spikes.map((s) => ({
                          ...s,
                          color: "rgb(var(--fg) / 0.72)",
                        }))}
                        fmt={(v) => `${v.toFixed(1)}`}
                        suffix="×"
                        onPair={openPair}
                      />
                    )
                  }
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.rsUpTitle")}
                  guide="rsUp"
                  desc={t("terminal.viz.rsUpDesc")}
                  render={() => <RankBars data={rsTop} onPair={openPair} />}
                />
                <XCard
                  title={t("terminal.viz.rsDownTitle")}
                  guide="rsDown"
                  desc={t("terminal.viz.rsDownDesc")}
                  render={() => <RankBars data={rsBottom} onPair={openPair} />}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={`${t("terminal.viz.sessTitle")} ↑`}
                  guide="sess"
                  desc={t("terminal.viz.sessDesc")}
                  render={() =>
                    session.warming ? (
                      <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        {t("terminal.viz.spikeWarming")}
                      </div>
                    ) : (
                      <RankBars data={session.gain15} fmt={(v) => fmtPct(v, 2)} onPair={openPair} />
                    )
                  }
                />
                <XCard
                  title={`${t("terminal.viz.sessTitle")} ↓`}
                  guide="sess"
                  desc={t("terminal.viz.sessDesc")}
                  render={() =>
                    session.warming ? (
                      <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        {t("terminal.viz.spikeWarming")}
                      </div>
                    ) : (
                      <RankBars data={session.lose15} fmt={(v) => fmtPct(v, 2)} onPair={openPair} />
                    )
                  }
                />
              </div>
    </>
  );
}
