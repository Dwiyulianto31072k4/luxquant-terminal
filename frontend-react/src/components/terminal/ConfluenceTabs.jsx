// ════════════════════════════════════════════════════════════════
// Confluence Screener — the hero landing tab.
//
// Data (all verified real):
// · item.v3 — refined direction, H4/H1/M15 trend + H4 strength and
// the v3 TAGS vocabulary, extracted from signal_enrichment JSONB
// (live_snapshot ?? entry_snapshot) by /terminal/screener
// · deriv blob — live price / Δ from call / spike badges (worker)
// · postsignal blob — per-pair typical move after a call (avg_peak / avg_mae).
// Drives the "room left" badge AND the ranking: setups with most of their
// usual move still ahead sort first, spent ones sink. See rankOf() for why
// we deliberately do NOT rank on tag win-rate.
// · item.status — the signal's latest lifecycle state (open/tp1…/sl)
// ════════════════════════════════════════════════════════════════
import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import CoinLogo from "../CoinLogo";
import { useUiPrefs } from "../../hooks/useUiPrefs";
import { DisplaySettings, TERMINAL_DISPLAY_DEFAULTS } from "./DisplaySettings";
import { CompareTray } from "./CompareTray";
import { tagHint } from "./tagGlossary";
import {
  POS,
  NEG,
  GOLD,
  MUTED,
  ORANGE,
  fmtPct,
  API_BASE,
  authHeaders,
  SectionBand,
  Kpi,
  Chip,
  ScrollArea,
  StatusTag,
} from "./vizShared";

const baseSym = (pair) => (pair || "").replace(/USDT$|USDC$|BUSD$|USD$/i, "").toUpperCase();

// ── v3 tag knowledge (mirrors IMPORTANT_TAGS in enrichment_service_v3) ──
const REASON_PRIORITY = [
  "SMC_GOLDEN_SETUP",
  "FVG_NEAR_ENTRY",
  "OB_NEAR_ENTRY",
  "RSI_BULL_DIV_H1",
  "RSI_BEAR_DIV_H1",
  "RSI_HIDDEN_BULL_H1",
  "RSI_HIDDEN_BEAR_H1",
  "VOL_SPIKE_3X",
  "VOL_SPIKE_2X",
  "VOL_CLIMAX",
  "BROKE_RESISTANCE_RECENT",
  "BROKE_SUPPORT_RECENT",
  "AT_FIB_GOLDEN_ZONE",
  "MTF_FULL_ALIGNED",
  "HTF_TREND_STRONG",
  "FRESH_BREAKOUT",
  "DEEP_PULLBACK",
  "BB_SQUEEZE_H1",
  "BB_EXPANSION_H1",
  "PATTERN_BULLISH",
  "PATTERN_BEARISH",
  "HARMONIC_ALIGNED",
];
const WARNING_TAGS = [
  "LATE_ENTRY",
  "OVEREXTENDED",
  "PARABOLIC",
  "EXHAUSTION_CANDLE",
  "LIQ_VERY_LOW",
  "LIQ_LOW",
  "FUNDING_HEAVY_LONG",
  "FUNDING_HEAVY_SHORT",
  "RISK_OFF_REGIME",
  "HTF_TREND_EXHAUSTED",
  "PATTERN_CONFLICTING",
  "HARMONIC_CONFLICTING",
];
// Equality / lifecycle tags — monochrome desk; green/red only for risk semantics
const EQ_TAGS = {
  FRESH_BREAKOUT: { tone: "text-positive bg-positive/10 border-positive/30" },
  DEEP_PULLBACK: { tone: "text-text-secondary bg-ink/[0.05] border-ink/10" },
  EXHAUSTION_CANDLE: { tone: "text-negative bg-negative/10 border-negative/25" },
  PARABOLIC: { tone: "text-negative bg-negative/10 border-negative/25" },
  LATE_ENTRY: { tone: "text-text-muted bg-ink/[0.05] border-ink/10" },
  OVEREXTENDED: { tone: "text-negative bg-negative/10 border-negative/25" },
};
const nice = (tag) => tag.replaceAll("_", " ").toLowerCase();
const TREND_DOT = { BULLISH: POS, BEARISH: NEG, RANGING: "rgb(var(--fg-muted))" };

// confluence score = positive important reasons − warnings (for sorting)
// NOTE: hand-weighted fallback, used only when a pair has no post-call
// history yet. Primary ranking is room-left (see rankOf).
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

// ⚠️ DO NOT rank by tag win-rate / EV. Verified against 90d of production
// data: the top tags by both WR and EV are LATE_ENTRY (90.1%), PARABOLIC
// (89.1%) and OVEREXTENDED (86.8%) — ABOVE SMC_GOLDEN_SETUP (87.4%).
// That's a confound, not an edge: those tags are attached to coins that are
// already flying, and peak_pct measures the coin's move, so a parabolic coin
// scores high by construction. Ranking on it would surface the most dangerous
// setups first. Tag stats stay available as context, never as the sort key.
//
// What actually matters to someone deciding RIGHT NOW is how much of the
// typical post-call move is still ahead of them. That comes from the per-pair
// postsignal blob (avg_peak) minus the distance already travelled (fc), and
// is not confounded by tag definitions.
function roomLeftOf(fc, ps) {
  const peak = ps?.avg_peak;
  if (!(peak > 0)) return null;
  const travelled = fc == null ? 0 : fc;
  return { peak, left: peak - travelled, mae: ps?.avg_mae ?? null, n: ps?.n ?? null };
}

// Sort: most room left first, warnings pushed down. Falls back to the
// hand-weighted score when a pair has no post-call history yet.
function rankOf(tags, fc, ps) {
  const list = tags || [];
  const warn =
    list.filter((t) => WARNING_TAGS.includes(t)).length * 2 +
    (list.includes("MTF_AGAINST_HTF") ? 4 : 0);
  const room = roomLeftOf(fc, ps);
  if (!room) return scoreOf(list) - warn;
  // Normalise room to a comparable scale, then apply the same warning penalty.
  return room.left - warn + Math.min(scoreOf(list), 6) * 0.5;
}

// ════════════════════════════════════════════════════════════════
// SIGNAL CARD — the hero component
// ════════════════════════════════════════════════════════════════
// flow-context chips from the new Liquidations + Token Flow feeds (risk context)
function flowChipsOf(flow) {
  const out = [];
  const liq = flow?.liq;
  if (liq) {
    if (liq.spike) out.push({ k: "liq spike", cls: "bg-ink/[0.06] border-ink/10 text-text-muted" });
    else if ((liq.side_bias || 0) > 0.4)
      out.push({ k: "shorts flushed", cls: "bg-positive/10 border-positive/30 text-positive" });
    else if ((liq.side_bias || 0) < -0.4)
      out.push({ k: "longs flushed", cls: "bg-negative/10 border-negative/30 text-negative" });
  }
  const tf = flow?.tf;
  if (tf) {
    const net = tf.net_inflow_usd || 0;
    if (net < 0)
      out.push({ k: "spot accumulation", cls: "bg-positive/10 border-positive/30 text-positive" });
    else if (net > 0)
      out.push({ k: "spot selling", cls: "bg-negative/10 border-negative/30 text-negative" });
  }
  return out;
}

// direction-aware flow score: does on-chain flow + liquidation SUPPORT this signal?
// CALIBRATED weights (see scripts/backtest_flow.py):
// W_TF = token-flow. Backtest (14d, Ethereum): accumulation 87.4% vs selling
// 84.3% win → +3.1pp edge (weak, not conclusive) → small 0.3, gentle tiebreaker.
// W_LIQ = liquidation. NOT backtestable yet (Coinalyze deletes intraday history);
// conservative placeholder — recalibrate from flow_snapshots once it fills.
const W_TF = 0.3;
const W_LIQ = 0.5;
function flowScoreOf(dir, flow) {
  const s = dir === "BULLISH" ? 1 : dir === "BEARISH" ? -1 : 0;
  let b = 0;
  if (flow?.tf) b += ((flow.tf.net_inflow_usd || 0) < 0 ? 1 : -1) * W_TF; // outflow = accumulation (+)
  if (flow?.liq) {
    if ((flow.liq.side_bias || 0) > 0.4)
      b += W_LIQ; // shorts flushed → squeeze up
    else if ((flow.liq.side_bias || 0) < -0.4) b -= W_LIQ; // longs flushed → down
  }
  const score = s * b;
  return { score, conflict: score < 0, support: score > 0 };
}

// Fear & Greed Index — CNN-style gradient gauge
function FngBadge({ value, label }) {
  if (value == null) return null;
  const color =
    value <= 25 ? NEG : value <= 45 ? ORANGE : value <= 55 ? GOLD : value <= 75 ? "#a3e635" : POS;
  const pos = Math.max(2, Math.min(98, value));
  return (
    <div className="rounded-xl border border-ink/[0.06] bg-ink/[0.02] px-3.5 py-2.5 flex items-center gap-3">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted shrink-0">
        Fear &amp; Greed
      </span>
      <div className="relative flex-1 min-w-[100px]">
        <div
          className="h-1.5 rounded-full"
          style={{ background: "linear-gradient(90deg,#ef4444,#f59e0b,#eab308,#a3e635,#22c55e)" }}
        />
        <div
          className="absolute top-1/2 w-3 h-3 rounded-full border-2 border-surface shadow"
          style={{
            left: `${pos}%`,
            transform: "translate(-50%,-50%)",
            background: "rgb(var(--fg))",
          }}
        />
      </div>
      <div className="shrink-0 flex items-baseline gap-1.5">
        <span className="font-mono tabular-nums text-[22px] leading-none" style={{ color }}>
          {value}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color }}>
          {label}
        </span>
      </div>
    </div>
  );
}

function SignalCard({ s, live, ps, flow, prefs, pinned, onPin, onPair, onOpen, t }) {
  const v3 = s.v3 || {};
  const tags = v3.tags || [];
  const hasIntel = !!v3.direction;
  const dir = v3.direction || s.signal_direction || "—";
  const bull = dir === "BULLISH";
  const bear = dir === "BEARISH";
  const dirColor = bull ? POS : bear ? NEG : "#9a958d";
  const htfStrong = v3.h4_strength === "STRONG" || tags.includes("HTF_TREND_STRONG");
  const align = tags.includes("MTF_FULL_ALIGNED")
    ? "full aligned"
    : tags.includes("MTF_LTF_ALIGNED")
      ? "ltf aligned"
      : tags.includes("MTF_AGAINST_HTF")
        ? "against HTF"
        : null;
  const eq = Object.keys(EQ_TAGS).find((k) => tags.includes(k));
  const reasons = REASON_PRIORITY.filter((r) => tags.includes(r)).slice(0, 3);
  const warns = WARNING_TAGS.filter((w) => tags.includes(w)).slice(0, 2);
  const flowChips = flowChipsOf(flow);
  const fscore = flowScoreOf(dir, flow);
  const fc = live?.fc;
  const sub = [bull ? "Bullish" : bear ? "Bearish" : "Neutral", htfStrong && "HTF strong", align]
    .filter(Boolean)
    .join(" · ");

  // How much of this pair's typical post-call move is still ahead of you.
  // This is the decision-relevant number — see the note above rankOf() for why
  // we deliberately do NOT rank or badge by tag win-rate.
  const room = roomLeftOf(fc, ps);
  const pctLeft = room && room.peak > 0 ? (room.left / room.peak) * 100 : null;
  const roomTone = pctLeft == null ? MUTED : pctLeft >= 60 ? POS : pctLeft >= 25 ? GOLD : NEG;
  const late = room != null && room.left <= 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => (onOpen ? onOpen(s) : onPair(s.pair))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen ? onOpen(s) : onPair(s.pair);
        }
      }}
      className="group relative cursor-pointer text-left rounded-xl bg-ink/[0.02] border border-ink/[0.06] hover:border-ink/[0.12] hover:bg-ink/[0.035] focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent transition-all overflow-hidden flex flex-col"
    >
      {/* header — pair · direction · PnL · status */}
      <div className="px-3.5 pt-3.5 flex items-center gap-2.5">
        <CoinLogo pair={s.pair} size={28} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[14px] text-text-primary leading-none truncate">
            {s.pair.replace(/USDT$/i, "")}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-text-muted truncate">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dirColor }} />
            <span className="truncate">{sub}</span>
          </div>
        </div>
        <div className="ml-auto text-right shrink-0">
          <div
            className="font-mono text-[16px] tabular-nums leading-none"
            style={{ color: fc == null ? "rgb(var(--ink) / 0.35)" : fc >= 0 ? POS : NEG }}
          >
            {fc == null ? "—" : fmtPct(fc)}
          </div>
          <div className="mt-1.5 flex justify-end">
            <StatusTag status={s.status} />
          </div>
        </div>
        {/* Pin sits IN the header row — floating it over the corner covered
            the % value, which is the first thing you read on a card. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPin?.(s);
          }}
          title={pinned ? "Remove from comparison" : "Pin to compare"}
          aria-label={pinned ? "Remove from comparison" : "Pin to compare"}
          aria-pressed={!!pinned}
          className={`-mr-1 flex h-7 w-7 shrink-0 items-center justify-center self-start rounded-md border transition-colors ${
            pinned
              ? "border-accent/40 bg-accent/15 text-accent"
              : "border-transparent text-text-muted/50 hover:border-ink/15 hover:text-text-primary"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 17v5M9 10.8V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6.8a2 2 0 0 0 .6 1.4l1.1 1.1a1 1 0 0 1 .3.7v.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V15a1 1 0 0 1 .3-.7l1.1-1.1a2 2 0 0 0 .6-1.4z" />
          </svg>
        </button>
      </div>

      {/* Multi-timeframe alignment */}
      {prefs.term_mtf !== false && (
        <div className="px-3.5 mt-2.5 flex items-center gap-3 font-mono text-[10px]">
          {hasIntel ? (
            <span className="flex items-center gap-2">
              {[
                ["4H", v3.h4],
                ["1H", v3.h1],
                ["15m", v3.m15],
              ].map(([lbl, tr]) => (
                <span
                  key={lbl}
                  title={`${lbl}: ${tr || "?"}`}
                  style={{ color: TREND_DOT[tr] || "rgb(var(--ink) / 0.28)" }}
                >
                  {lbl}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-text-muted/40">No setup data</span>
          )}
          {eq && <span className="text-text-muted/70">{nice(eq)}</span>}
        </div>
      )}

      {prefs.term_reasons !== false && reasons.length > 0 && (
        <div className="px-3.5 mt-2 text-[11px] leading-relaxed text-text-primary/60">
          {reasons.map((r, i) => (
            <span key={r}>
              {i > 0 && " · "}
              {/* hover any tag for a plain-English explanation */}
              <span
                title={tagHint(r) || undefined}
                className={
                  tagHint(r)
                    ? "cursor-help decoration-dotted underline-offset-2 hover:underline"
                    : undefined
                }
              >
                {nice(r)}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Room left — how much of the typical post-call move is still ahead of
          you. The decision-relevant number when taking a setup RIGHT NOW. */}
      {prefs.term_room !== false && room && (
        <div className="px-3.5 mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[9.5px]">
          <span
            className="rounded border px-1.5 py-0.5"
            style={{
              color: roomTone,
              borderColor: `color-mix(in srgb, ${roomTone} 35%, transparent)`,
              background: `color-mix(in srgb, ${roomTone} 10%, transparent)`,
            }}
            title={
              `This pair typically peaks near +${room.peak.toFixed(1)}% after a call` +
              (room.n ? ` (n=${room.n})` : "") +
              `. It's already ${fc == null ? "—" : fmtPct(fc)} from entry, so roughly ` +
              `${room.left > 0 ? `+${room.left.toFixed(1)}%` : "none"} of that move is still ahead.` +
              (room.mae ? ` Typical drawdown against you: ${room.mae.toFixed(1)}%.` : "")
            }
          >
            {late ? "no room left" : `+${room.left.toFixed(1)}% room`}
          </span>
          <span className="text-text-muted truncate">typ peak +{room.peak.toFixed(1)}%</span>
          {late && (
            <span
              className="ml-auto shrink-0 text-warning"
              title="The usual move is already behind you — chasing here carries the worst risk/reward."
            >
              late entry
            </span>
          )}
        </div>
      )}

      <div className="mt-auto px-3.5 pt-2 pb-3 mt-2.5 border-t border-ink/[0.04] flex items-center gap-2 font-mono text-[9.5px] min-h-[14px]">
        {prefs.term_warnings !== false && warns.length > 0 && (
          <span className="flex items-center gap-1.5 min-w-0 text-warning">
            <span className="w-1 h-1 rounded-full shrink-0 bg-warning" />
            <span className="truncate">
              {warns.map((w, i) => (
                <span key={w}>
                  {i > 0 && " · "}
                  <span
                    title={tagHint(w) || undefined}
                    className={
                      tagHint(w)
                        ? "cursor-help decoration-dotted underline-offset-2 hover:underline"
                        : undefined
                    }
                  >
                    {nice(w)}
                  </span>
                </span>
              ))}
            </span>
          </span>
        )}
        {prefs.term_flow !== false && flowChips.length > 0 && (
          <span
            className="ml-auto flex items-center gap-1.5 shrink-0"
            style={{
              color: fscore.conflict ? NEG : fscore.support ? POS : "rgb(var(--ink) / 0.4)",
            }}
          >
            <span>{flowChips.map((c) => c.k).join(" · ")}</span>
            <span>{fscore.conflict ? "!" : fscore.support ? "✓" : ""}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB: CONFLUENCE SCREENER (landing)
// ════════════════════════════════════════════════════════════════
// What each filter actually keeps — the chip labels are trader shorthand.
const CONF_FILTER_HINTS = {
  htf: "HTF = Higher TimeFrame. Keeps only setups where the 4-hour trend is strong, so the bigger picture backs the trade.",
  aligned:
    "Keeps setups where all three charts (4H, 1H, 15m) point the same way — the cleanest agreement.",
  fresh: "Keeps setups that just broke out, so the move is early rather than already run.",
  pullback:
    "Keeps setups that pulled back deep into the trend — better entry price, but it has to hold.",
  golden:
    "Keeps 'golden setups' — several smart-money conditions lining up at once. Our highest-quality pattern.",
  volspike:
    "Keeps setups with volume running 2–3× normal, i.e. real participation behind the move.",
  nowarn:
    "Keeps only setups with no risk warnings at all (no late entry, parabolic, thin liquidity…).",
};

const CONF_FILTERS = [
  ["htf", "confHtf", (tags) => tags.includes("HTF_TREND_STRONG")],
  ["aligned", "confAligned", (tags) => tags.includes("MTF_FULL_ALIGNED")],
  ["fresh", "confFresh", (tags) => tags.includes("FRESH_BREAKOUT")],
  ["pullback", "confPullback", (tags) => tags.includes("DEEP_PULLBACK")],
  ["golden", "confGolden", (tags) => tags.includes("SMC_GOLDEN_SETUP")],
  [
    "volspike",
    "confVolspike",
    (tags) =>
      tags.includes("VOL_SPIKE_2X") || tags.includes("VOL_SPIKE_3X") || tags.includes("VOL_CLIMAX"),
  ],
  ["nowarn", "confNoWarn", (tags) => !tags.some((x) => WARNING_TAGS.includes(x))],
];

export function ConfluenceTab({ view, deriv, pairFc, postsignal, openPair, openSignalRow }) {
  const { t } = useTranslation();
  const { prefs } = useUiPrefs(TERMINAL_DISPLAY_DEFAULTS);
  const [pins, setPins] = useState([]); // signal_ids, max 6 (see CompareTray)
  const [cmpOpen, setCmpOpen] = useState(false);
  const togglePin = (sig) =>
    setPins((cur) =>
      cur.includes(sig.signal_id)
        ? cur.filter((x) => x !== sig.signal_id)
        : cur.length >= 6
          ? cur
          : [...cur, sig.signal_id]
    );
  const [on, setOn] = useState({});
  const toggle = (k) => setOn((o) => ({ ...o, [k]: !o[k] }));

  const cards = useMemo(() => {
    let out = view.filter((s) => s.v3?.tags);
    CONF_FILTERS.forEach(([k, , pred]) => {
      if (on[k]) out = out.filter((s) => pred(s.v3.tags || []));
    });
    // Rank by how much of the typical post-call move is still ahead.
    const ps = postsignal?.pairs || {};
    return [...out].sort(
      (a, b) =>
        rankOf(b.v3?.tags, pairFc[b.pair], ps[b.pair]) -
        rankOf(a.v3?.tags, pairFc[a.pair], ps[a.pair])
    );
  }, [view, on, postsignal, pairFc]);

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
          fetch(`${API_BASE}/api/v1/terminal/liquidations`, { headers: authHeaders() }).then((r) =>
            r.json()
          ),
          fetch(`${API_BASE}/api/v1/terminal/token-flow`, { headers: authHeaders() }).then((r) =>
            r.json()
          ),
          fetch(`${API_BASE}/api/v1/market/bitcoin`, { headers: authHeaders() })
            .then((r) => r.json())
            .catch(() => null),
        ]);
        if (!alive) return;
        const lm = {};
        (lq?.items || []).forEach((i) => {
          lm[i.pair] = i;
        });
        const fm = {};
        (tf?.items || []).forEach((i) => {
          fm[i.symbol] = i;
        });
        setLiqMap(lm);
        setFlowMap(fm);
        if (bt?.fearGreed?.value != null)
          setFng({ value: bt.fearGreed.value, label: bt.fearGreed.label });
      } catch {
        /* keep empty → simply no flow chips */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // re-rank by base confluence score + flow score (liq/token-flow support)
  const rankedCards = useMemo(() => {
    if (!Object.keys(liqMap).length && !Object.keys(flowMap).length) return cards;
    return [...cards].sort((a, b) => {
      const fa = flowScoreOf(a.v3?.direction || a.signal_direction, {
        liq: liqMap[a.pair],
        tf: flowMap[baseSym(a.pair)],
      }).score;
      const fb = flowScoreOf(b.v3?.direction || b.signal_direction, {
        liq: liqMap[b.pair],
        tf: flowMap[baseSym(b.pair)],
      }).score;
      return scoreOf(b.v3?.tags) + fb - (scoreOf(a.v3?.tags) + fa);
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
      out.push({
        s,
        fc,
        golden: tags.includes("SMC_GOLDEN_SETUP"),
        htf: tags.includes("HTF_TREND_STRONG"),
      });
    });
    return out.sort((a, b) => scoreOf(b.s.v3?.tags) - scoreOf(a.s.v3?.tags)).slice(0, 24);
  }, [view, pairFc]);

  const cleanN = Math.max(0, view.filter((s) => s.v3?.tags?.length).length - stats.warned);

  return (
    <div className="space-y-2.5">
      <SectionBand
        title={t("terminal.viz.tabConfluence")}
        guide="confluence"
        desc={t("terminal.viz.confSectionDesc")}
        badge={<DisplaySettings />}
      />

      {prefs.term_fng !== false && fng?.value != null && (
        <FngBadge value={fng.value} label={fng.label} />
      )}

      {prefs.term_kpis !== false && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
          <Kpi compact label="Setups" value={cards.length} sub="Matching filters" />
          <Kpi
            compact
            label="HTF strong"
            value={stats.htf}
            sub="4H (higher timeframe) trend strong"
          />
          <Kpi compact label="Fully aligned" value={stats.aligned} sub="4H · 1H · 15m all agree" />
          <Kpi compact label="Clean setups" value={cleanN} sub="No risk warnings" />
        </div>
      )}

      {coiled.length > 0 && (
        <div className="rounded-xl border border-ink/[0.06] bg-ink/[0.02] overflow-hidden">
          <div className="px-3.5 py-2 flex items-baseline justify-between gap-3 border-b border-ink/[0.04]">
            <span className="text-[12.5px] font-medium text-text-primary">
              {t("terminal.viz.coiledTitle")}
            </span>
            <span className="font-mono text-[9.5px] uppercase tracking-wider text-text-muted">
              {coiled.length}
            </span>
          </div>
          <div className="px-3.5 pt-1.5 text-[10.5px] text-text-muted leading-snug">
            {t("terminal.viz.coiledDesc")}
          </div>
          <div className="p-2.5 flex flex-wrap gap-1.5">
            {coiled.map(({ s, fc, golden, htf }) => (
              <button
                key={s.signal_id}
                type="button"
                onClick={() => (openSignalRow ? openSignalRow(s) : openPair(s.pair))}
                className="flex items-center gap-1.5 rounded-lg bg-ink/[0.03] border border-ink/[0.07] hover:border-ink/15 px-2 py-1.5 transition-colors"
              >
                <CoinLogo pair={s.pair} size={16} />
                <span className="font-mono text-[11px] text-text-primary/90">
                  {s.pair.replace(/USDT$/i, "")}
                </span>
                {golden && (
                  <span className="px-1 rounded bg-ink/[0.06] text-text-secondary font-mono text-[7.5px] uppercase">
                    golden
                  </span>
                )}
                {!golden && htf && (
                  <span className="px-1 rounded bg-ink/[0.06] text-text-muted font-mono text-[7.5px] uppercase">
                    htf
                  </span>
                )}
                <span
                  className={`font-mono text-[10.5px] tabular-nums ${fc >= 0 ? "text-positive" : "text-negative"}`}
                >
                  {fmtPct(fc)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 flex-wrap">
        {CONF_FILTERS.map(([k, label]) => (
          <Chip
            key={k}
            active={!!on[k]}
            onClick={() => toggle(k)}
            size="xs"
            title={CONF_FILTER_HINTS[k]}
          >
            {t(`terminal.viz.${label}`)}
          </Chip>
        ))}
      </div>

      {rankedCards.length === 0 ? (
        <div className="rounded-xl border border-ink/[0.06] bg-ink/[0.02] py-14 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted px-6">
          {t("terminal.viz.confEmpty")}
        </div>
      ) : (
        <ScrollArea max={720}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {rankedCards.slice(0, 90).map((s) => (
              <SignalCard
                key={s.signal_id}
                s={s}
                t={t}
                onPair={openPair}
                onOpen={openSignalRow}
                live={{ fc: pairFc[s.pair], spike: deriv?.pairs?.[s.pair]?.spike_15m }}
                ps={psPairs[s.pair]}
                prefs={prefs}
                pinned={pins.includes(s.signal_id)}
                onPin={togglePin}
                flow={{ liq: liqMap[s.pair], tf: flowMap[baseSym(s.pair)] }}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Side-by-side comparison of the pinned setups */}
      <CompareTray
        open={cmpOpen}
        setOpen={setCmpOpen}
        onClear={() => setPins([])}
        onRemove={(id) => setPins((c) => c.filter((x) => x !== id))}
        onOpen={openSignalRow}
        items={pins
          .map((id) => view.find((v) => v.signal_id === id))
          .filter(Boolean)
          .map((sig) => {
            const tags = sig.v3?.tags || [];
            return {
              s: sig,
              fc: pairFc[sig.pair],
              room: roomLeftOf(pairFc[sig.pair], psPairs[sig.pair]),
              reasons: REASON_PRIORITY.filter((r) => tags.includes(r)).slice(0, 3),
              warnings: WARNING_TAGS.filter((w) => tags.includes(w)),
            };
          })}
      />
    </div>
  );
}
