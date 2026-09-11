// ════════════════════════════════════════════════════════════════
// Shared signal filter logic — SINGLE SOURCE OF TRUTH
// Dipakai bareng oleh SignalsPage (Potential Trades) & SignalTerminalPage
// supaya filter di terminal PERSIS SAMA dengan tabel. Jangan duplikasi
// predikat di dua tempat — import dari sini.
// ════════════════════════════════════════════════════════════════

export const HOT_STREAK_MIN = 5;

export const DEFAULT_FILTERS = {
  searchPair: "",
  statusFilter: "all",
  riskFilter: "all",
  streakFilter: "all", // 'all' | 'hot'
  corrDecoupled: false,
  corrHighAlign: false,
  // Keep only the top N% of the visible book by Edge Score, or null for all.
  // A percentile rather than a score, on purpose — see edgeTopThreshold.
  edgeTop: null,
  selectedDates: [], // ['YYYY-MM-DD', ...]
  selectedTags: [],
  tagMatchMode: "any", // 'any' (OR) | 'all' (AND) — matches the signals desk
  showWatchlistOnly: false,
  sortBy: "created_at",
  sortOrder: "desc",
};

// ── Token-aware pair matching (copy dari SignalsPage) ──────────────
const QUOTE_ASSETS = ["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "USD", "BTC", "ETH"];
function splitPair(pairUpper) {
  for (const qa of QUOTE_ASSETS) {
    if (pairUpper.endsWith(qa) && pairUpper.length > qa.length) {
      return { base: pairUpper.slice(0, -qa.length), quote: qa };
    }
  }
  return { base: pairUpper, quote: "" };
}
export function pairMatchesQuery(pair, rawQuery) {
  if (!pair) return false;
  const q = (rawQuery || "").trim().toUpperCase();
  if (!q) return true;
  const P = pair.toUpperCase();
  for (const qa of QUOTE_ASSETS) {
    if (q.endsWith(qa) && q.length > qa.length) return P === q;
  }
  const { base } = splitPair(P);
  return base === q || base.startsWith(q);
}

// ── URL encode / decode ────────────────────────────────────────────
// Hanya field non-default yang di-serialize → URL tetap bersih.
export function filtersToParams(f) {
  const p = new URLSearchParams();
  if (f.searchPair) p.set("q", f.searchPair);
  if (f.statusFilter !== "all") p.set("status", f.statusFilter);
  if (f.riskFilter !== "all") p.set("risk", f.riskFilter);
  if (f.streakFilter !== "all") p.set("streak", f.streakFilter);
  if (f.corrDecoupled) p.set("dec", "1");
  if (f.corrHighAlign) p.set("align", "1");
  if (f.edgeTop) p.set("edgetop", String(f.edgeTop));
  if (f.selectedDates?.length) p.set("dates", f.selectedDates.join(","));
  if (f.selectedTags?.length) p.set("tags", f.selectedTags.join(","));
  if (f.tagMatchMode === "all") p.set("tagmode", "all");
  if (f.showWatchlistOnly) p.set("wl", "1");
  if (f.sortBy && f.sortBy !== "created_at") p.set("sort", f.sortBy);
  if (f.sortOrder && f.sortOrder !== "desc") p.set("order", f.sortOrder);
  return p;
}

export function parseFilters(searchParams) {
  const g = (k) => searchParams.get(k);
  return {
    ...DEFAULT_FILTERS,
    searchPair: g("q") || "",
    statusFilter: g("status") || "all",
    riskFilter: g("risk") || "all",
    streakFilter: g("streak") || "all",
    corrDecoupled: g("dec") === "1",
    corrHighAlign: g("align") === "1",
    edgeTop: g("edgetop") ? Number(g("edgetop")) || null : null,
    selectedDates: g("dates") ? g("dates").split(",").filter(Boolean) : [],
    selectedTags: g("tags") ? g("tags").split(",").filter(Boolean) : [],
    tagMatchMode: g("tagmode") === "all" ? "all" : "any",
    showWatchlistOnly: g("wl") === "1",
    sortBy: g("sort") || "created_at",
    sortOrder: g("order") || "desc",
  };
}

/** Score at the top-`pct`% boundary of `signals`, or null if too few scored.
 *
 *  A PERCENTILE, not a score threshold, and that is the whole point. Measured
 *  walk-forward over the tag era, the share of calls clearing an absolute
 *  score of 63.8 swung 14.1% (March) → 32.6% (May) → 15.8% (July), so a fixed
 *  bar makes the shortlist double in size some months and thin out in others.
 *  A percentile keeps it the same shape and self-calibrates as the score
 *  distribution drifts.
 *
 *  Returns null rather than a guess when fewer than MIN_SCORED_FOR_CUT rows
 *  carry a score; the caller then leaves the list alone instead of filtering
 *  on noise.
 */
export const MIN_SCORED_FOR_CUT = 10;

export function edgeTopThreshold(signals, edgeScoreMap, pct) {
  if (!pct || !edgeScoreMap) return null;
  const scores = [];
  for (const s of signals || []) {
    const sc = edgeScoreMap[s?.signal_id]?.score;
    if (typeof sc === "number" && Number.isFinite(sc)) scores.push(sc);
  }
  if (scores.length < MIN_SCORED_FOR_CUT) return null;
  scores.sort((a, b) => a - b);
  // Count from the top, not from the bottom: `keep` rows survive, so the
  // inclusive boundary is the lowest of them. Rounding up means a tiny
  // percentile still keeps one row rather than emptying the list.
  const keep = Math.max(1, Math.ceil((scores.length * pct) / 100));
  return scores[Math.max(0, scores.length - keep)];
}

// ── Predikat filter (faithful port dari SignalsPage.filtered) ───────
// ctx: { coinIntel, edgeScoreMap }
//
// There is deliberately no filter on a pair's own track record. The old
// `verdictFilter` passed 487 of 491 pairs, so it presented itself as a screen
// while screening out four coins — and reconstructed point-in-time across all
// 58,075 resolved calls, a pair's record carries no information about its next
// call. A legacy `?verdict=` in a shared URL is ignored rather than honoured.
export function applySignalFilters(signals, f, ctx = {}) {
  const { coinIntel = {} } = ctx;
  let out = [...(signals || [])];

  if (f.searchPair) out = out.filter((s) => pairMatchesQuery(s.pair, f.searchPair));

  if (!f.showWatchlistOnly && f.selectedDates?.length > 0) {
    out = out.filter((s) => s.created_at && f.selectedDates.includes(s.created_at.slice(0, 10)));
  }

  if (f.statusFilter === "updated") {
    out = out.filter((s) => s.last_update_at);
  } else if (f.statusFilter !== "all") {
    out = out.filter((s) => {
      const st = (s.status || "").toLowerCase();
      switch (f.statusFilter) {
        case "open":
          return st === "open";
        case "tp1":
          return st === "tp1";
        case "tp2":
          return st === "tp2";
        case "tp3":
          return st === "tp3";
        case "tp1_plus":
          return ["tp1", "tp2", "tp3", "tp4", "closed_win"].includes(st);
        case "tp2_plus":
          return ["tp2", "tp3", "tp4", "closed_win"].includes(st);
        case "full_tp":
          return st === "tp3" || st === "tp4" || st === "closed_win";
        case "tp4":
        case "closed_win":
          return st === "closed_win" || st === "tp4";
        case "sl":
        case "closed_loss":
          return st === "closed_loss" || st === "sl";
        default:
          return true;
      }
    });
  }

  if (f.riskFilter !== "all") {
    out = out.filter((s) => {
      const r = (s.risk_level || "").toLowerCase();
      switch (f.riskFilter) {
        case "low":
          return r.startsWith("low");
        case "normal":
          return r.startsWith("med") || r.startsWith("nor");
        case "high":
          return r.startsWith("high");
        case "unrated":
          return !r;
        default:
          return true;
      }
    });
  }

  if (f.streakFilter === "hot") {
    out = out.filter((s) => {
      const st = coinIntel[s.pair]?.current_streak;
      return st && st.type === "win" && st.length >= HOT_STREAK_MIN;
    });
  }

  if (f.corrDecoupled) out = out.filter((s) => s.btc_decoupled === true);
  if (f.corrHighAlign) out = out.filter((s) => (s.btc_align_score ?? -1) >= 70);

  // Edge cut BEFORE the tag filter, so "runner tag AND top 20%" means the top
  // 20% of the book — not the top 20% of the tagged rows. The measurement it
  // implements was taken that way round and the two are not the same set.
  // Callers without an Edge Score map (the market map builds none) leave the
  // book alone rather than emptying it. A shared ?edgetop= link opened there
  // shows every row; the chip still says the cut is on, so the state is
  // visible instead of silently wrong.
  if (f.edgeTop && ctx.edgeScoreMap) {
    const cut = edgeTopThreshold(out, ctx.edgeScoreMap, f.edgeTop);
    if (cut != null) {
      out = out.filter((s) => {
        const sc = ctx.edgeScoreMap?.[s.signal_id]?.score;
        return typeof sc === "number" && sc >= cut;
      });
    }
  }

  if (f.selectedTags?.length > 0) {
    out = out.filter((s) => {
      const tags = s.important_tags;
      if (!Array.isArray(tags)) return false;
      return f.tagMatchMode === "all"
        ? f.selectedTags.every((t) => tags.includes(t))
        : f.selectedTags.some((t) => tags.includes(t));
    });
  }

  return out;
}

// helper: parse market_cap string ("1.2B") → number
export function parseMcap(mcap) {
  if (!mcap) return 0;
  if (typeof mcap === "number") return mcap;
  const str = mcap.toString().toUpperCase();
  const num = parseFloat(str.replace(/[^0-9.]/g, "")) || 0;
  if (str.includes("T")) return num * 1e12;
  if (str.includes("B")) return num * 1e9;
  if (str.includes("M")) return num * 1e6;
  if (str.includes("K")) return num * 1e3;
  return num;
}

// helper: stop distance % dari entry, SIGNED exactly as the column prints it
// (a long's stop is below entry, so this is negative). Sorting the number the
// column shows is the whole point: "Stop" used to sort on the raw stop1 price,
// which compares 16.78 against 0.0982 across pairs and means nothing.
export function stopLossPct(s) {
  const entry = parseFloat(s?.entry);
  const stop = parseFloat(s?.stop1);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(stop) || stop <= 0) return null;
  return ((stop - entry) / entry) * 100;
}

// helper: max target % dari entry
export function maxTargetPct(s) {
  const targets = [s.target4, s.target3, s.target2, s.target1].filter(Boolean);
  if (!targets.length || !s.entry) return 0;
  const maxT = Math.max(...targets.map(Number));
  const entry = parseFloat(s.entry);
  return entry > 0 ? ((maxT - entry) / entry) * 100 : 0;
}
