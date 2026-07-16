// ════════════════════════════════════════════════════════════════
// Confluence Screener — the hero landing tab.
//
// Data (all verified real):
//   · item.v3 — refined direction, H4/H1/M15 trend + H4 strength and
//     the v3 TAGS vocabulary, extracted from signal_enrichment JSONB
//     (live_snapshot ?? entry_snapshot) by /terminal/screener
//   · deriv blob — live price / Δ from call / spike badges (worker)
//   · postsignal blob — per-pair historical avg move after a call
//     (used only as light context on the card footer)
//   · item.status — the signal's latest lifecycle state (open/tp1…/sl)
// ════════════════════════════════════════════════════════════════
import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import CoinLogo from "../CoinLogo";
import {
  POS, NEG, fmtPct, API_BASE, authHeaders,
  SectionBand, Kpi, Chip, ScrollArea, StatusTag,
} from "./vizShared";

const baseSym = (pair) => (pair || "").replace(/USDT$|USDC$|BUSD$|USD$/i, "").toUpperCase();

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
  FRESH_BREAKOUT: { tone: "text-[#08160c] bg-positive border-positive" },
  DEEP_PULLBACK: { tone: "text-[#06232b] bg-cyan-400 border-cyan-400" },
  EXHAUSTION_CANDLE: { tone: "text-[#1a1206] bg-orange-400 border-orange-400" },
  PARABOLIC: { tone: "text-[#180808] bg-negative border-negative" },
  LATE_ENTRY: { tone: "text-[#1a1206] bg-warning border-warning" },
  OVEREXTENDED: { tone: "text-[#180808] bg-negative border-negative" },
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
// flow-context chips from the new Liquidations + Token Flow feeds (risk context)
function flowChipsOf(flow) {
  const out = [];
  const liq = flow?.liq;
  if (liq) {
    if (liq.spike) out.push({ k: "liq spike", cls: "bg-gold-primary/15 border-gold-primary/30 text-gold-primary" });
    else if ((liq.side_bias || 0) > 0.4) out.push({ k: "shorts flushed", cls: "bg-positive/10 border-positive/30 text-positive" });
    else if ((liq.side_bias || 0) < -0.4) out.push({ k: "longs flushed", cls: "bg-negative/10 border-negative/30 text-negative" });
  }
  const tf = flow?.tf;
  if (tf) {
    const net = tf.net_inflow_usd || 0;
    if (net < 0) out.push({ k: "spot accumulation", cls: "bg-positive/10 border-positive/30 text-positive" });
    else if (net > 0) out.push({ k: "spot selling", cls: "bg-negative/10 border-negative/30 text-negative" });
  }
  return out;
}

// direction-aware flow score: does on-chain flow + liquidation SUPPORT this signal?
// CALIBRATED weights (see scripts/backtest_flow.py):
//   W_TF  = token-flow. Backtest (14d, Ethereum): accumulation 87.4% vs selling
//           84.3% win → +3.1pp edge (weak, not conclusive) → small 0.3, gentle tiebreaker.
//   W_LIQ = liquidation. NOT backtestable yet (Coinalyze deletes intraday history);
//           conservative placeholder — recalibrate from flow_snapshots once it fills.
const W_TF = 0.3;
const W_LIQ = 0.5;
function flowScoreOf(dir, flow) {
  const s = dir === "BULLISH" ? 1 : dir === "BEARISH" ? -1 : 0;
  let b = 0;
  if (flow?.tf) b += ((flow.tf.net_inflow_usd || 0) < 0 ? 1 : -1) * W_TF;   // outflow = accumulation (+)
  if (flow?.liq) {
    if ((flow.liq.side_bias || 0) > 0.4) b += W_LIQ;                        // shorts flushed → squeeze up
    else if ((flow.liq.side_bias || 0) < -0.4) b -= W_LIQ;                  // longs flushed → down
  }
  const score = s * b;
  return { score, conflict: score < 0, support: score > 0 };
}

// Fear & Greed — horizontal gradient gauge (red→green) with a marker at value
function FngBadge({ value, label }) {
  if (value == null) return null;
  const color = value <= 25 ? "#f87171" : value <= 45 ? "#f97316"
    : value <= 55 ? "#fbbf24" : value <= 75 ? "#a3e635" : "#34d399";
  const pos = Math.max(2, Math.min(98, value));
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#0a0805] border border-white/[0.07] px-4 py-3 flex items-center gap-4">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />
      <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-text-muted shrink-0">Fear &amp; Greed</span>
      <div className="relative flex-1 min-w-[120px]">
        <div className="h-2 rounded-full" style={{ background: "linear-gradient(90deg,#f87171,#f97316,#fbbf24,#a3e635,#34d399)" }} />
        <div
          className="absolute top-1/2 w-3.5 h-3.5 rounded-full border-2 border-[#0a0805] shadow"
          style={{ left: `${pos}%`, transform: "translate(-50%,-50%)", background: "#fff" }}
        />
        <div className="mt-1 flex justify-between font-mono text-[7.5px] uppercase tracking-wider text-text-muted/40">
          <span>Fear</span><span>Greed</span>
        </div>
      </div>
      <div className="shrink-0 flex items-baseline gap-1.5">
        <span className="font-mono tabular-nums text-[24px] leading-none" style={{ color }}>{value}</span>
        <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color }}>{label}</span>
      </div>
    </div>
  );
}

function SignalCard({ s, live, ps, flow, onPair, onOpen, t }) {
  const v3 = s.v3 || {};
  const tags = v3.tags || [];
  const hasIntel = !!v3.direction;
  const dir = v3.direction || s.signal_direction || "—";
  const bull = dir === "BULLISH";
  const bear = dir === "BEARISH";
  const dirColor = bull ? POS : bear ? NEG : "#9a958d";
  const htfStrong = v3.h4_strength === "STRONG" || tags.includes("HTF_TREND_STRONG");
  const align = tags.includes("MTF_FULL_ALIGNED") ? "full aligned"
    : tags.includes("MTF_LTF_ALIGNED") ? "ltf aligned"
    : tags.includes("MTF_AGAINST_HTF") ? "against HTF" : null;
  const eq = Object.keys(EQ_TAGS).find((k) => tags.includes(k));
  const reasons = REASON_PRIORITY.filter((r) => tags.includes(r)).slice(0, 3);
  const warns = WARNING_TAGS.filter((w) => tags.includes(w)).slice(0, 2);
  const flowChips = flowChipsOf(flow);
  const fscore = flowScoreOf(dir, flow);
  const fc = live?.fc;
  const sub = [bull ? "Bullish" : bear ? "Bearish" : "Neutral", htfStrong && "HTF strong", align]
    .filter(Boolean).join(" · ");

  return (
    <button
      onClick={() => (onOpen ? onOpen(s) : onPair(s.pair))}
      className="group relative text-left rounded-2xl bg-[#0a0805] border border-white/[0.07] hover:border-gold-primary/30 hover:shadow-[0_14px_34px_rgba(0,0,0,0.5)] transition-all overflow-hidden flex flex-col"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />

      {/* header — pair + direction (muted) · price (color = meaning) · status */}
      <div className="px-4 pt-4 flex items-center gap-3">
        <CoinLogo pair={s.pair} size={30} />
        <div className="min-w-0">
          <div className="font-mono text-[15px] text-text-primary/95 leading-none truncate">{s.pair}</div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-muted truncate">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dirColor }} />
            <span className="truncate">{sub}</span>
          </div>
        </div>
        <div className="ml-auto text-right shrink-0">
          <div className="font-mono text-[17px] tabular-nums leading-none" style={{ color: fc == null ? "#6f6b66" : fc >= 0 ? POS : NEG }}>
            {fc == null ? "—" : fmtPct(fc)}
          </div>
          <div className="mt-1.5 flex justify-end">
            <StatusTag status={s.status} />
          </div>
        </div>
      </div>

      {/* multi-timeframe trend + entry quality — the confluence core, muted */}
      <div className="px-4 mt-3 flex items-center gap-3 font-mono text-[10px]">
        {hasIntel ? (
          <span className="flex items-center gap-2">
            {[["4H", v3.h4], ["1H", v3.h1], ["15", v3.m15]].map(([lbl, tr]) => (
              <span key={lbl} title={`${lbl}: ${tr || "?"}`} style={{ color: TREND_DOT[tr] || "rgba(255,255,255,0.28)" }}>
                {lbl}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-text-muted/40">no intel</span>
        )}
        {eq && <span className="text-text-muted/70">{nice(eq)}</span>}
      </div>

      {/* key reasons — quiet, dot-separated (no pills) */}
      {reasons.length > 0 && (
        <div className="px-4 mt-2.5 text-[11.5px] text-text-primary/65 leading-relaxed">
          {reasons.map(nice).join("  ·  ")}
        </div>
      )}

      {/* footer — risk warnings (left) + flow verdict (right); avg/outperf removed */}
      <div className="mt-auto px-4 pt-2.5 pb-3.5 mt-3 border-t border-white/[0.05] flex items-center gap-2 font-mono text-[9.5px] min-h-[15px]">
        {warns.length > 0 && (
          <span className="flex items-center gap-1.5 min-w-0" style={{ color: "#c98b6b" }}>
            <span className="w-1 h-1 rounded-full shrink-0" style={{ background: "#c98b6b" }} />
            <span className="truncate">{warns.map(nice).join(" · ")}</span>
          </span>
        )}
        {flowChips.length > 0 && (
          <span className="ml-auto flex items-center gap-1.5 shrink-0"
            style={{ color: fscore.conflict ? NEG : fscore.support ? POS : "#8f8b85" }}>
            <span>{flowChips.map((c) => c.k).join(" · ")}</span>
            <span>{fscore.conflict ? "⚠" : fscore.support ? "✓" : ""}</span>
          </span>
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

export function ConfluenceTab({ view, deriv, pairFc, postsignal, openPair, openSignalRow }) {
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

  // Liquidations + Token Flow feeds → per-card "flow context" chips
  const [liqMap, setLiqMap] = useState({});
  const [flowMap, setFlowMap] = useState({});
  const [fng, setFng] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [lq, tf, bt] = await Promise.all([
          fetch(`${API_BASE}/api/v1/terminal/liquidations`, { headers: authHeaders() }).then((r) => r.json()),
          fetch(`${API_BASE}/api/v1/terminal/token-flow`, { headers: authHeaders() }).then((r) => r.json()),
          fetch(`${API_BASE}/api/v1/market/bitcoin`, { headers: authHeaders() }).then((r) => r.json()).catch(() => null),
        ]);
        if (!alive) return;
        const lm = {}; (lq?.items || []).forEach((i) => { lm[i.pair] = i; });
        const fm = {}; (tf?.items || []).forEach((i) => { fm[i.symbol] = i; });
        setLiqMap(lm); setFlowMap(fm);
        if (bt?.fearGreed?.value != null) setFng({ value: bt.fearGreed.value, label: bt.fearGreed.label });
      } catch { /* keep empty → simply no flow chips */ }
    })();
    return () => { alive = false; };
  }, []);

  // re-rank by base confluence score + flow score (liq/token-flow support)
  const rankedCards = useMemo(() => {
    if (!Object.keys(liqMap).length && !Object.keys(flowMap).length) return cards;
    return [...cards].sort((a, b) => {
      const fa = flowScoreOf(a.v3?.direction || a.signal_direction, { liq: liqMap[a.pair], tf: flowMap[baseSym(a.pair)] }).score;
      const fb = flowScoreOf(b.v3?.direction || b.signal_direction, { liq: liqMap[b.pair], tf: flowMap[baseSym(b.pair)] }).score;
      return (scoreOf(b.v3?.tags) + fb) - (scoreOf(a.v3?.tags) + fa);
    });
  }, [cards, liqMap, flowMap]);

  // "Coiled" — strong, clean setups still sitting near entry (not pumped yet)
  const coiled = useMemo(() => {
    const STRONG = ["HTF_TREND_STRONG", "MTF_FULL_ALIGNED", "SMC_GOLDEN_SETUP"];
    const seen = new Set();
    const out = [];
    view.forEach((s) => {
      if (!s.pair || seen.has(s.pair)) return;
      const tags = s.v3?.tags || [];
      if (!tags.length || !STRONG.some((x) => tags.includes(x))) return;
      if (tags.some((x) => WARNING_TAGS.includes(x))) return;
      const fc = pairFc[s.pair];
      if (fc == null || fc < -5 || fc > 6) return;
      seen.add(s.pair);
      out.push({ s, fc, golden: tags.includes("SMC_GOLDEN_SETUP"), htf: tags.includes("HTF_TREND_STRONG") });
    });
    return out.sort((a, b) => scoreOf(b.s.v3?.tags) - scoreOf(a.s.v3?.tags)).slice(0, 24);
  }, [view, pairFc]);

  return (
    <>
      <SectionBand title={t("terminal.viz.tabConfluence")} desc={t("terminal.viz.confSectionDesc")} />

      {fng?.value != null && <FngBadge value={fng.value} label={fng.label} />}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
        <Kpi label={t("terminal.viz.kConfCount")} value={cards.length} desc={t("terminal.viz.kConfCountDesc")} tone="text-gold-primary" />
        <Kpi label={t("terminal.viz.kHtfStrong")} value={stats.htf} desc={t("terminal.viz.kHtfStrongDesc")} tone={stats.htf ? "text-positive" : undefined} />
        <Kpi label={t("terminal.viz.kFullAligned")} value={stats.aligned} desc={t("terminal.viz.kFullAlignedDesc")} tone={stats.aligned ? "text-cyan-400" : undefined} />
        <Kpi label={t("terminal.viz.kWarned")} value={stats.warned} desc={t("terminal.viz.kWarnedDesc")} tone={stats.warned ? "text-warning" : undefined} />
      </div>

      {/* Coiled — good setups that haven't moved yet (the opportunity) */}
      {coiled.length > 0 && (
        <div className="rounded-lg border border-gold-primary/20 bg-gradient-to-b from-gold-primary/[0.06] to-transparent overflow-hidden">
          <div className="h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
          <div className="px-4 py-2.5 flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] text-text-primary/95">{t("terminal.viz.coiledTitle")}</span>
            <span className="font-mono text-[9.5px] uppercase tracking-wider text-text-muted">{coiled.length} {t("terminal.viz.coiledUnit")}</span>
          </div>
          <div className="px-4 pb-1 -mt-1 text-[10.5px] text-text-muted leading-relaxed">{t("terminal.viz.coiledDesc")}</div>
          <div className="p-3 flex flex-wrap gap-2">
            {coiled.map(({ s, fc, golden, htf }) => (
              <button
                key={s.signal_id}
                onClick={() => (openSignalRow ? openSignalRow(s) : openPair(s.pair))}
                className="flex items-center gap-2 rounded-lg bg-[#0c0a07] border border-white/[0.08] hover:border-gold-primary/35 px-2.5 py-1.5 transition-colors"
              >
                <CoinLogo pair={s.pair} size={18} />
                <span className="font-mono text-[11px] text-text-primary/90">{s.pair}</span>
                {golden && <span className="px-1 rounded-sm bg-gold-primary/15 text-gold-primary font-mono text-[7.5px] uppercase tracking-wider">golden</span>}
                {!golden && htf && <span className="px-1 rounded-sm bg-gold-primary/15 text-gold-primary font-mono text-[7.5px] uppercase tracking-wider">htf</span>}
                <span className={`font-mono text-[10.5px] tabular-nums ${fc >= 0 ? "text-positive" : "text-negative"}`}>{fmtPct(fc)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* confluence filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {CONF_FILTERS.map(([k, label]) => (
          <Chip key={k} active={!!on[k]} onClick={() => toggle(k)}>
            {t(`terminal.viz.${label}`)}
          </Chip>
        ))}
      </div>

      {/* card grid — bounded, scrolls inside */}
      {rankedCards.length === 0 ? (
        <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] py-16 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted leading-relaxed px-6">
          {t("terminal.viz.confEmpty")}
        </div>
      ) : (
        <ScrollArea max={720}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {rankedCards.slice(0, 90).map((s) => (
              <SignalCard
                key={s.signal_id}
                s={s}
                t={t}
                onPair={openPair}
                onOpen={openSignalRow}
                live={{ fc: pairFc[s.pair], spike: deriv?.pairs?.[s.pair]?.spike_15m }}
                ps={psPairs[s.pair]}
                flow={{ liq: liqMap[s.pair], tf: flowMap[baseSym(s.pair)] }}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </>
  );
}
