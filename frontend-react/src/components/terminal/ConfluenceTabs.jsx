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
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import CoinLogo from "../CoinLogo";
import {
  POS, NEG, fmtPct,
  SectionBand, Kpi, Chip, ScrollArea, StatusTag,
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
function SignalCard({ s, live, ps, onPair, t }) {
  const v3 = s.v3 || {};
  const tags = v3.tags || [];
  const hasIntel = !!v3.direction;
  const dir = v3.direction || s.signal_direction || "—";
  const bull = dir === "BULLISH";
  const bear = dir === "BEARISH";
  const dirTone = bull ? "text-[#08160c] bg-positive border-positive"
    : bear ? "text-[#180808] bg-negative border-negative"
    : "text-white/70 bg-white/10 border-white/15";
  const edge = bull ? "before:bg-positive" : bear ? "before:bg-negative" : "before:bg-white/25";
  const cardTint = bull ? "from-positive/[0.06]" : bear ? "from-negative/[0.06]" : "from-white/[0.03]";
  const htfStrong = v3.h4_strength === "STRONG" || tags.includes("HTF_TREND_STRONG");
  const align = tags.includes("MTF_FULL_ALIGNED") ? "FULL ALIGNED"
    : tags.includes("MTF_LTF_ALIGNED") ? "LTF ALIGNED"
    : tags.includes("MTF_AGAINST_HTF") ? "AGAINST HTF" : null;
  const alignTone = align === "FULL ALIGNED" ? "text-[#08160c] bg-positive" : align === "AGAINST HTF" ? "text-[#180808] bg-negative" : "text-[#1a1206] bg-warning";
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
      className={`relative text-left rounded-xl bg-gradient-to-b ${cardTint} to-transparent border border-white/[0.08] hover:border-gold-primary/35 transition-colors overflow-hidden flex flex-col
        before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] ${edge}`}
    >
      {/* header */}
      <div className="pl-4 pr-3 pt-3 flex items-center gap-2">
        <CoinLogo pair={s.pair} size={24} />
        <div className="min-w-0 flex flex-col">
          <span className="font-mono text-[13px] text-white/95 leading-none truncate">{s.pair}</span>
          <span className="mt-1 flex items-center gap-1">
            <span className={`px-1.5 py-0.5 rounded-sm border font-mono text-[8.5px] uppercase tracking-wider font-semibold ${dirTone}`}>{dir}</span>
            {htfStrong && (
              <span className="px-1.5 py-0.5 rounded-sm bg-gold-primary text-[#17110a] font-mono text-[8.5px] uppercase tracking-wider font-semibold">
                HTF STRONG
              </span>
            )}
          </span>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <span className={`font-mono text-[13px] tabular-nums leading-none ${fc == null ? "text-text-muted/60" : fc >= 0 ? "text-positive" : "text-negative"}`}>
            {fc == null ? "—" : fmtPct(fc)}
          </span>
          <span className="flex items-center gap-1">
            <span className="font-mono text-[7.5px] uppercase tracking-[0.15em] text-text-muted/50">{t("terminal.viz.confLast")}</span>
            <StatusTag status={s.status} />
          </span>
        </div>
      </div>

      {/* MTF + alignment + entry quality */}
      <div className="pl-4 pr-3 mt-2.5 flex items-center gap-2 flex-wrap">
        {hasIntel ? (
          <span className="flex items-center gap-2">
            {[["4H", v3.h4], ["1H", v3.h1], ["15", v3.m15]].map(([lbl, tr]) => (
              <span key={lbl} className="flex items-center gap-1" title={`${lbl}: ${tr || "?"}`}>
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
        {align && <span className={`px-1.5 py-0.5 rounded-sm font-mono text-[8.5px] uppercase tracking-wider font-semibold ${alignTone}`}>{align}</span>}
        {eq && (
          <span className={`px-1.5 py-0.5 rounded-sm border font-mono text-[8.5px] uppercase tracking-wider font-semibold ${EQ_TAGS[eq].tone}`}>
            {nice(eq)}
          </span>
        )}
        {spike != null && spike > 3 && (
          <span className="px-1.5 py-0.5 rounded-sm bg-orange-400 text-[#1a0e04] font-mono text-[8.5px] uppercase tracking-wider font-semibold">
            vol ×{spike.toFixed(1)}
          </span>
        )}
      </div>

      {/* key reasons — as soft pills, not a raw bullet list */}
      {reasons.length > 0 && (
        <div className="pl-4 pr-3 mt-2.5">
          <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-text-muted/55 mb-1.5">{t("terminal.viz.confReasons")}</div>
          <div className="flex flex-wrap gap-1">
            {reasons.map((r) => (
              <span key={r} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-gold-primary/[0.07] border border-gold-primary/15 text-[9.5px] text-white/80">
                <span className="w-1 h-1 rounded-full bg-gold-primary/80" />
                {nice(r)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* warnings — small outlined chips */}
      {warns.length > 0 && (
        <div className="pl-4 pr-3 mt-2 flex items-center gap-1 flex-wrap">
          {warns.map((w) => (
            <span key={w} className="px-1.5 py-0.5 rounded-[4px] bg-negative/[0.08] border border-negative/25 text-negative/90 font-mono text-[8px] uppercase tracking-wider">
              {nice(w)}
            </span>
          ))}
        </div>
      )}

      {/* footer — historical context */}
      <div className="mt-auto pl-4 pr-3 py-2.5 mt-2.5 border-t border-white/[0.05] flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider">
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
            <span className="text-[12.5px] text-white/95">{t("terminal.viz.coiledTitle")}</span>
            <span className="font-mono text-[9.5px] uppercase tracking-wider text-text-muted">{coiled.length} {t("terminal.viz.coiledUnit")}</span>
          </div>
          <div className="px-4 pb-1 -mt-1 text-[10.5px] text-text-muted leading-relaxed">{t("terminal.viz.coiledDesc")}</div>
          <div className="p-3 flex flex-wrap gap-2">
            {coiled.map(({ s, fc, golden, htf }) => (
              <button
                key={s.signal_id}
                onClick={() => openPair(s.pair)}
                className="flex items-center gap-2 rounded-lg bg-[#0c0a07] border border-white/[0.08] hover:border-gold-primary/35 px-2.5 py-1.5 transition-colors"
              >
                <CoinLogo pair={s.pair} size={18} />
                <span className="font-mono text-[11px] text-white/90">{s.pair}</span>
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
      {cards.length === 0 ? (
        <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] py-16 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted leading-relaxed px-6">
          {t("terminal.viz.confEmpty")}
        </div>
      ) : (
        <ScrollArea max={720}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {cards.slice(0, 90).map((s) => (
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
        </ScrollArea>
      )}
    </>
  );
}
