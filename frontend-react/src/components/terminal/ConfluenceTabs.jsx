// ════════════════════════════════════════════════════════════════
// Confluence Screener + Post-Signal Intelligence tabs.
//
// Data (all verified real):
//   · item.v3 — refined direction, H4/H1/M15 trend + H4 strength and
//     the v3 TAGS vocabulary, extracted from signal_enrichment JSONB
//     (live_snapshot ?? entry_snapshot) by /terminal/screener
//   · deriv blob — live price / Δ from call / spike badges (worker)
//   · postsignal blob — per-pair historical avg move after a call
//     (24h/48h/7d from signal_journey.events, worker ~6h pass)
// ════════════════════════════════════════════════════════════════
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ScatterChart, Scatter, ReferenceLine,
} from "recharts";
import CoinLogo from "../CoinLogo";
import {
  GOLD, POS, NEG, CYAN, ORANGE, GRAYBAR, GRID, TICK, TICK_SM,
  fmtPct, median, makeBins,
  SectionBand, Kpi, XCard, useZoom, RankBars, CoinPill, DarkTip, ScatterTip,
  Warming, Chip,
} from "./vizShared";

// ── v3 tag knowledge (mirrors IMPORTANT_TAGS in enrichment_service_v3) ──
const REASON_PRIORITY = [
  "SMC_GOLDEN_SETUP", "FVG_NEAR_ENTRY", "OB_NEAR_ENTRY",
  "RSI_BULL_DIV_H1", "RSI_BEAR_DIV_H1", "RSI_HIDDEN_BULL_H1", "RSI_HIDDEN_BEAR_H1",
  "VOL_SPIKE_3X", "VOL_SPIKE_2X", "VOL_CLIMAX",
  "BROKE_RESISTANCE_RECENT", "BROKE_SUPPORT_RECENT", "AT_FIB_GOLDEN_ZONE",
  "MTF_FULL_ALIGNED", "HTF_TREND_STRONG",
  "FRESH_BREAKOUT", "DEEP_PULLBACK",
  "BB_SQUEEZE_H1", "BB_EXPANSION_H1",
  "PATTERN_BULLISH", "PATTERN_BEARISH", "HARMONIC_ALIGNED",
];
const WARNING_TAGS = [
  "LATE_ENTRY", "OVEREXTENDED", "PARABOLIC", "EXHAUSTION_CANDLE",
  "LIQ_VERY_LOW", "LIQ_LOW", "FUNDING_HEAVY_LONG", "FUNDING_HEAVY_SHORT",
  "RISK_OFF_REGIME", "HTF_TREND_EXHAUSTED", "PATTERN_CONFLICTING", "HARMONIC_CONFLICTING",
];
const EQ_TAGS = {
  FRESH_BREAKOUT: { tone: "text-positive border-positive/30 bg-positive/10" },
  DEEP_PULLBACK: { tone: "text-cyan-300 border-cyan-400/30 bg-cyan-400/10" },
  EXHAUSTION_CANDLE: { tone: "text-orange-300 border-orange-400/30 bg-orange-400/10" },
  PARABOLIC: { tone: "text-negative border-negative/30 bg-negative/10" },
  LATE_ENTRY: { tone: "text-warning border-warning/30 bg-warning/10" },
  OVEREXTENDED: { tone: "text-negative border-negative/30 bg-negative/10" },
};
const nice = (tag) => tag.replaceAll("_", " ").toLowerCase();

const TREND_DOT = { BULLISH: POS, BEARISH: NEG, RANGING: "#fbbf24" };

// confluence score = positive important reasons − warnings (for sorting)
function scoreOf(tags) {
  if (!tags?.length) return -99;
  let s = 0;
  tags.forEach((t) => {
    if (REASON_PRIORITY.includes(t)) s += t === "SMC_GOLDEN_SETUP" ? 3 : 1;
    if (WARNING_TAGS.includes(t)) s -= 1;
    if (t === "MTF_AGAINST_HTF") s -= 2;
  });
  return s;
}

// ════════════════════════════════════════════════════════════════
// SIGNAL CARD — the hero component
// ════════════════════════════════════════════════════════════════
function SignalCard({ s, live, ps, onPair, t }) {
  const v3 = s.v3 || {};
  const tags = v3.tags || [];
  const hasIntel = !!v3.direction;
  const dir = v3.direction || s.signal_direction || "—";
  const dirTone = dir === "BULLISH" ? "text-positive border-positive/30 bg-positive/10"
    : dir === "BEARISH" ? "text-negative border-negative/30 bg-negative/10"
    : "text-white/60 border-white/[0.1] bg-white/[0.05]";
  const htfStrong = v3.h4_strength === "STRONG" || tags.includes("HTF_TREND_STRONG");
  const align = tags.includes("MTF_FULL_ALIGNED") ? "FULL ALIGNED"
    : tags.includes("MTF_LTF_ALIGNED") ? "LTF ALIGNED"
    : tags.includes("MTF_AGAINST_HTF") ? "AGAINST HTF" : null;
  const alignTone = align === "FULL ALIGNED" ? "text-positive" : align === "AGAINST HTF" ? "text-negative" : "text-warning";
  const eq = Object.keys(EQ_TAGS).find((k) => tags.includes(k));
  const reasons = REASON_PRIORITY.filter((r) => tags.includes(r)).slice(0, 3);
  const warns = WARNING_TAGS.filter((w) => tags.includes(w)).slice(0, 3);
  const fc = live?.fc;
  const avg = ps?.avg_24h;
  const delta = fc != null && avg != null ? fc - avg : null;
  const spike = live?.spike;

  return (
    <button
      onClick={() => onPair(s.pair)}
      className="text-left rounded-lg bg-[#0c0a07] border border-white/[0.07] hover:border-gold-primary/25 transition-colors overflow-hidden flex flex-col"
    >
      <div className="h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
      {/* header */}
      <div className="px-3.5 pt-3 flex items-center gap-2">
        <CoinLogo pair={s.pair} size={22} />
        <span className="font-mono text-[13px] text-white/95 truncate">{s.pair}</span>
        <span className={`px-1.5 py-0.5 rounded-sm border font-mono text-[8.5px] uppercase tracking-wider ${dirTone}`}>{dir}</span>
        {htfStrong && (
          <span className="px-1.5 py-0.5 rounded-sm border border-gold-primary/35 bg-gold-primary/12 text-gold-primary font-mono text-[8.5px] uppercase tracking-wider">
            HTF STRONG
          </span>
        )}
        <span className={`ml-auto font-mono text-[12px] tabular-nums ${fc == null ? "text-text-muted/60" : fc >= 0 ? "text-positive" : "text-negative"}`}>
          {fc == null ? "—" : fmtPct(fc)}
        </span>
      </div>

      {/* MTF + alignment + entry quality */}
      <div className="px-3.5 mt-2 flex items-center gap-2 flex-wrap">
        {hasIntel ? (
          <span className="flex items-center gap-1.5">
            {[["4H", v3.h4], ["1H", v3.h1], ["15", v3.m15]].map(([lbl, tr]) => (
              <span key={lbl} className="flex items-center gap-0.5" title={`${lbl}: ${tr || "?"}`}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: TREND_DOT[tr] || "rgba(255,255,255,0.15)" }} />
                <span className="font-mono text-[8px] text-text-muted/70">{lbl}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="font-mono text-[8.5px] uppercase tracking-wider text-text-muted/50 border border-white/[0.06] rounded-sm px-1 py-0.5">
            {t("terminal.viz.confNoIntel")}
          </span>
        )}
        {align && <span className={`font-mono text-[8.5px] uppercase tracking-wider ${alignTone}`}>{align}</span>}
        {eq && (
          <span className={`px-1.5 py-0.5 rounded-sm border font-mono text-[8.5px] uppercase tracking-wider ${EQ_TAGS[eq].tone}`}>
            {nice(eq)}
          </span>
        )}
        {spike != null && spike > 3 && (
          <span className="px-1.5 py-0.5 rounded-sm border border-orange-400/30 bg-orange-400/10 text-orange-300 font-mono text-[8.5px] uppercase tracking-wider">
            vol ×{spike.toFixed(1)}
          </span>
        )}
      </div>

      {/* key reasons */}
      {reasons.length > 0 && (
        <div className="px-3.5 mt-2.5">
          <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-text-muted/60 mb-1">{t("terminal.viz.confReasons")}</div>
          {reasons.map((r) => (
            <div key={r} className="flex items-center gap-1.5 py-0.5">
              <span className="w-1 h-1 rounded-full bg-gold-primary shrink-0" />
              <span className="text-[10.5px] text-white/75 truncate">{nice(r)}</span>
            </div>
          ))}
        </div>
      )}

      {/* warnings */}
      {warns.length > 0 && (
        <div className="px-3.5 mt-1.5 flex items-center gap-1.5 flex-wrap">
          {warns.map((w) => (
            <span key={w} className="font-mono text-[8px] uppercase tracking-wider text-negative/80">⚠ {nice(w)}</span>
          ))}
        </div>
      )}

      {/* post-signal footer */}
      <div className="mt-auto px-3.5 py-2.5 mt-2.5 border-t border-white/[0.05] flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider">
        {avg != null ? (
          <>
            <span className="text-text-muted">{t("terminal.viz.confAvg")} <span className="text-white/70">{fmtPct(avg)}</span></span>
            {delta != null && (
              <span className={`ml-auto px-1.5 py-0.5 rounded-sm border ${delta >= 0 ? "text-positive border-positive/30 bg-positive/10" : "text-negative border-negative/30 bg-negative/10"}`}>
                {delta >= 0 ? t("terminal.viz.confOutperf") : t("terminal.viz.confUnderperf")} {fmtPct(Math.abs(delta), 1)}
              </span>
            )}
          </>
        ) : (
          <span className="text-text-muted/50">{t("terminal.viz.confNoHistory")}</span>
        )}
      </div>
    </button>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB: CONFLUENCE SCREENER (landing)
// ════════════════════════════════════════════════════════════════
const CONF_FILTERS = [
  ["htf", "confHtf", (tags) => tags.includes("HTF_TREND_STRONG")],
  ["aligned", "confAligned", (tags) => tags.includes("MTF_FULL_ALIGNED")],
  ["fresh", "confFresh", (tags) => tags.includes("FRESH_BREAKOUT")],
  ["pullback", "confPullback", (tags) => tags.includes("DEEP_PULLBACK")],
  ["golden", "confGolden", (tags) => tags.includes("SMC_GOLDEN_SETUP")],
  ["volspike", "confVolspike", (tags) => tags.includes("VOL_SPIKE_2X") || tags.includes("VOL_SPIKE_3X") || tags.includes("VOL_CLIMAX")],
  ["nowarn", "confNoWarn", (tags) => !tags.some((x) => WARNING_TAGS.includes(x))],
];

export function ConfluenceTab({ view, deriv, pairFc, postsignal, openPair }) {
  const { t } = useTranslation();
  const [on, setOn] = useState({});
  const toggle = (k) => setOn((o) => ({ ...o, [k]: !o[k] }));

  const cards = useMemo(() => {
    let out = view.filter((s) => s.v3?.tags);
    CONF_FILTERS.forEach(([k, , pred]) => {
      if (on[k]) out = out.filter((s) => pred(s.v3.tags || []));
    });
    return [...out].sort((a, b) => scoreOf(b.v3?.tags) - scoreOf(a.v3?.tags));
  }, [view, on]);

  const stats = useMemo(() => {
    const withV3 = view.filter((s) => s.v3?.tags?.length);
    return {
      htf: withV3.filter((s) => s.v3.tags.includes("HTF_TREND_STRONG")).length,
      aligned: withV3.filter((s) => s.v3.tags.includes("MTF_FULL_ALIGNED")).length,
      warned: withV3.filter((s) => s.v3.tags.some((x) => WARNING_TAGS.includes(x))).length,
    };
  }, [view]);

  const psPairs = postsignal?.pairs || {};

  return (
    <>
      <SectionBand title={t("terminal.viz.tabConfluence")} desc={t("terminal.viz.confSectionDesc")} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Kpi label={t("terminal.viz.kConfCount")} value={cards.length} desc={t("terminal.viz.kConfCountDesc")} tone="text-gold-primary" />
        <Kpi label={t("terminal.viz.kHtfStrong")} value={stats.htf} desc={t("terminal.viz.kHtfStrongDesc")} tone={stats.htf ? "text-positive" : undefined} />
        <Kpi label={t("terminal.viz.kFullAligned")} value={stats.aligned} desc={t("terminal.viz.kFullAlignedDesc")} tone={stats.aligned ? "text-cyan-400" : undefined} />
        <Kpi label={t("terminal.viz.kWarned")} value={stats.warned} desc={t("terminal.viz.kWarnedDesc")} tone={stats.warned ? "text-warning" : undefined} />
      </div>

      {/* confluence filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {CONF_FILTERS.map(([k, label]) => (
          <Chip key={k} active={!!on[k]} onClick={() => toggle(k)}>
            {t(`terminal.viz.${label}`)}
          </Chip>
        ))}
      </div>

      {/* card grid */}
      {cards.length === 0 ? (
        <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] py-16 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted leading-relaxed px-6">
          {t("terminal.viz.confEmpty")}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {cards.slice(0, 60).map((s) => (
            <SignalCard
              key={s.signal_id}
              s={s}
              t={t}
              onPair={openPair}
              live={{ fc: pairFc[s.pair], spike: deriv?.pairs?.[s.pair]?.spike_15m }}
              ps={psPairs[s.pair]}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB: POST-SIGNAL INTELLIGENCE
// ════════════════════════════════════════════════════════════════
export function PostSignalTab({ view, pairFc, postsignal, openPair }) {
  const { t } = useTranslation();
  const zPs = useZoom(-15, 15, -30, 30);
  const psPairs = postsignal?.pairs || {};
  const warming = !postsignal || postsignal.warming || Object.keys(psPairs).length === 0;

  const joined = useMemo(() => {
    const seen = new Set();
    const rows = [];
    view.forEach((s) => {
      if (!s.pair || seen.has(s.pair)) return;
      seen.add(s.pair);
      const ps = psPairs[s.pair];
      const fc = pairFc[s.pair];
      if (!ps || ps.avg_24h == null) return;
      rows.push({
        pair: s.pair,
        x: ps.avg_24h,
        y: fc ?? null,
        delta: fc != null ? fc - ps.avg_24h : null,
        tp1: ps.tp1_rate,
        n: ps.n,
      });
    });
    return rows;
  }, [view, psPairs, pairFc]);

  const withLive = joined.filter((r) => r.y != null);
  const leaders = [...withLive].sort((a, b) => b.delta - a.delta).slice(0, 8).map((r) => ({ pair: r.pair, v: r.delta }));
  const laggards = [...withLive].sort((a, b) => a.delta - b.delta).slice(0, 8).map((r) => ({ pair: r.pair, v: r.delta }));
  const outperfN = withLive.filter((r) => r.delta > 0).length;
  const avgVals = joined.map((r) => r.x);
  const tp1Vals = joined.map((r) => r.tp1).filter((v) => v != null);

  if (warming) {
    return (
      <>
        <SectionBand title={t("terminal.viz.tabPostsignal")} desc={t("terminal.viz.psSectionDesc")} />
        <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07]">
          <Warming text={t("terminal.viz.psWarming")} />
        </div>
      </>
    );
  }

  return (
    <>
      <SectionBand title={t("terminal.viz.tabPostsignal")} desc={t("terminal.viz.psSectionDesc")} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Kpi
          label={t("terminal.viz.psKOutperf")}
          value={withLive.length ? `${outperfN}/${withLive.length}` : "—"}
          desc={t("terminal.viz.psKOutperfDesc")}
          tone={outperfN > withLive.length / 2 ? "text-positive" : "text-negative"}
        />
        <Kpi label={t("terminal.viz.psKAvgMove")} value={fmtPct(median(avgVals))} desc={t("terminal.viz.psKAvgMoveDesc")} tone="text-gold-primary" />
        <Kpi label={t("terminal.viz.psKTp1")} value={tp1Vals.length ? `${median(tp1Vals).toFixed(0)}%` : "—"} desc={t("terminal.viz.psKTp1Desc")} />
        <Kpi label={t("terminal.viz.psKCoverage")} value={`${joined.length}`} desc={t("terminal.viz.psKCoverageDesc")} />
      </div>

      <XCard
        title={t("terminal.viz.psScatterTitle")}
        desc={t("terminal.viz.psScatterDesc")}
        zoom={zPs}
        hint={t("terminal.viz.psScatterHint")}
        render={(h) => (
          <div style={{ height: Math.max(h, 320) }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={GRID} />
                <XAxis type="number" dataKey="x" tick={TICK} axisLine={false} tickLine={false} unit="%" domain={zPs.domX} allowDataOverflow />
                <YAxis type="number" dataKey="y" tick={TICK} axisLine={false} tickLine={false} unit="%" domain={zPs.domY} allowDataOverflow />
                <Tooltip content={<ScatterTip xLabel="hist avg 24h %" yLabel="live now %" />} cursor={{ strokeDasharray: "3 3", stroke: GOLD }} />
                <ReferenceLine segment={[{ x: -15, y: -15 }, { x: 15, y: 15 }]} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                <ReferenceLine x={0} stroke="rgba(255,255,255,0.1)" />
                <Scatter data={withLive} fillOpacity={0.85} onClick={(p) => { const d = p?.payload || p; if (d?.pair) openPair(d.pair); }}>
                  {withLive.map((p, i) => (
                    <Cell key={i} cursor="pointer" fill={p.delta > 5 ? GOLD : p.delta > 0 ? POS : p.delta < -5 ? NEG : GRAYBAR} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <XCard title={t("terminal.viz.psLeadersTitle")} desc={t("terminal.viz.psLeadersDesc")} render={() => <RankBars data={leaders} onPair={openPair} fmt={(v) => fmtPct(v, 1)} />} />
        <XCard title={t("terminal.viz.psLaggardsTitle")} desc={t("terminal.viz.psLaggardsDesc")} render={() => <RankBars data={laggards} onPair={openPair} fmt={(v) => fmtPct(v, 1)} />} />
      </div>

      <XCard
        title={t("terminal.viz.psAvgDistTitle")}
        desc={t("terminal.viz.psAvgDistDesc")}
        render={(h) => (
          <div style={{ height: h }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={makeBins(avgVals, 2, -10, 14)} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="x" tick={TICK_SM} axisLine={false} tickLine={false} />
                <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<DarkTip />} cursor={{ fill: "rgba(212,168,83,0.05)" }} />
                <ReferenceLine x="0" stroke={GOLD} strokeDasharray="3 3" />
                <Bar dataKey="count" name="pairs" radius={[2, 2, 0, 0]}>
                  {makeBins(avgVals, 2, -10, 14).map((b, i) => (
                    <Cell key={i} fill={b.mid >= 0 ? POS : NEG} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      />
    </>
  );
}
