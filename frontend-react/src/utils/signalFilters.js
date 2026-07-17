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
  verdictFilter: "all", // 'all' | 'worth_it' | 'avoid'
  selectedDates: [], // ['YYYY-MM-DD', ...]
  selectedTags: [],
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
  if (f.verdictFilter !== "all") p.set("verdict", f.verdictFilter);
  if (f.selectedDates?.length) p.set("dates", f.selectedDates.join(","));
  if (f.selectedTags?.length) p.set("tags", f.selectedTags.join(","));
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
    verdictFilter: g("verdict") || "all",
    selectedDates: g("dates") ? g("dates").split(",").filter(Boolean) : [],
    selectedTags: g("tags") ? g("tags").split(",").filter(Boolean) : [],
    showWatchlistOnly: g("wl") === "1",
    sortBy: g("sort") || "created_at",
    sortOrder: g("order") || "desc",
  };
}

// ── Predikat filter (faithful port dari SignalsPage.filtered) ───────
// ctx: { coinIntel, verdictByPair }
export function applySignalFilters(signals, f, ctx = {}) {
  const { coinIntel = {}, verdictByPair = {} } = ctx;
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
  if (f.verdictFilter !== "all") out = out.filter((s) => verdictByPair[s.pair] === f.verdictFilter);

  if (f.selectedTags?.length > 0) {
    out = out.filter((s) => {
      const tags = s.important_tags;
      if (!Array.isArray(tags)) return false;
      return f.selectedTags.some((t) => tags.includes(t));
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

// helper: max target % dari entry
export function maxTargetPct(s) {
  const targets = [s.target4, s.target3, s.target2, s.target1].filter(Boolean);
  if (!targets.length || !s.entry) return 0;
  const maxT = Math.max(...targets.map(Number));
  const entry = parseFloat(s.entry);
  return entry > 0 ? ((maxT - entry) / entry) * 100 : 0;
}
