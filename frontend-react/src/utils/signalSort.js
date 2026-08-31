// ════════════════════════════════════════════════════════════════
// Multi-level signal sort — as deep and stable as a desk needs.
//
// Chain example: verdict ↓ → edge_score ↓ → created_at ↓
//   1) Worth / Neutral / Avoid (as-of-entry LOO when provided)
//   2) Edge Score within same verdict
//   3) Newest call as final tiebreak
//
// Interactions (table headers):
//   click        → primary only (toggle if already primary)
//   Shift/⌘/Ctrl → add / cycle that level in the chain (max MAX_SORTS)
// ════════════════════════════════════════════════════════════════

export const MAX_SORTS = 4;
export const DEFAULT_SORTS = Object.freeze([{ field: "created_at", order: "desc" }]);

export const SORT_LABELS = {
  edge_score: "Edge",
  created_at: "Called",
  last_update: "Updated",
  verdict: "Verdict",
  win_rate: "Win rate",
  win_streak: "Win streak",
  max_target: "Max target %",
  volume: "Volume",
  btc_corr: "BTC align",
  risk_level: "Risk",
  status: "Status",
  pair: "Pair",
  entry: "Entry",
  current_price: "Price",
  market_cap: "MCap",
  stop_loss: "Stop",
};

/** Fields where missing/null always sink (not treated as 0). */
const NULLS_LAST = new Set([
  "win_streak",
  "btc_corr",
  "win_rate",
  "verdict",
  "edge_score",
]);

/** Live metrics: 0 / missing sink. */
const ZERO_SINKS = new Set(["volume", "current_price"]);

export function isDefaultSorts(sorts) {
  const s = normalizeSorts(sorts);
  return s.length === 1 && s[0].field === "created_at" && s[0].order === "desc";
}

export function normalizeSorts(input) {
  if (!input) return [...DEFAULT_SORTS];
  let list = input;
  if (!Array.isArray(list)) {
    if (typeof list === "object" && list.field) list = [list];
    else return [...DEFAULT_SORTS];
  }
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item || !item.field) continue;
    const field = String(item.field);
    if (seen.has(field)) continue;
    seen.add(field);
    const order = item.order === "asc" ? "asc" : "desc";
    out.push({ field, order });
    if (out.length >= MAX_SORTS) break;
  }
  return out.length ? out : [...DEFAULT_SORTS];
}

export function sortsFromLegacy(sortBy, sortOrder) {
  return normalizeSorts([
    { field: sortBy || "created_at", order: sortOrder === "asc" ? "asc" : "desc" },
  ]);
}

export function primaryOf(sorts) {
  const s = normalizeSorts(sorts);
  return s[0] || { field: "created_at", order: "desc" };
}

/** URL: "verdict:desc,edge_score:desc,created_at:desc" */
export function encodeSorts(sorts) {
  const s = normalizeSorts(sorts);
  if (isDefaultSorts(s)) return "";
  return s.map((x) => `${x.field}:${x.order}`).join(",");
}

export function decodeSorts(str) {
  if (!str || typeof str !== "string") return [...DEFAULT_SORTS];
  // Legacy single field: "edge_score" or "edge_score:desc"
  const parts = str.split(",").map((p) => p.trim()).filter(Boolean);
  const parsed = parts.map((p) => {
    const [field, ord] = p.split(":");
    return { field: field?.trim(), order: ord === "asc" ? "asc" : "desc" };
  });
  return normalizeSorts(parsed);
}

/**
 * Click handler pure update.
 * @param {Array} sorts current chain
 * @param {string} field column
 * @param {{ additive?: boolean }} opts Shift/⌘/Ctrl → additive
 */
export function applySortClick(sorts, field, opts = {}) {
  const cur = normalizeSorts(sorts);
  const additive = !!opts.additive;
  const idx = cur.findIndex((s) => s.field === field);

  if (additive) {
    if (idx >= 0) {
      // Cycle order of that level in place
      const next = cur.map((s, i) =>
        i === idx ? { ...s, order: s.order === "desc" ? "asc" : "desc" } : s
      );
      return next;
    }
    if (cur.length >= MAX_SORTS) {
      // Replace last slot
      return [...cur.slice(0, MAX_SORTS - 1), { field, order: "desc" }];
    }
    return [...cur, { field, order: "desc" }];
  }

  // Plain click: toggle if primary, else become sole primary
  if (idx === 0) {
    return [{ field, order: cur[0].order === "desc" ? "asc" : "desc" }];
  }
  return [{ field, order: "desc" }];
}

export function removeSortLevel(sorts, field) {
  const next = normalizeSorts(sorts).filter((s) => s.field !== field);
  return next.length ? next : [...DEFAULT_SORTS];
}

export function toggleSortLevel(sorts, field) {
  const cur = normalizeSorts(sorts);
  const idx = cur.findIndex((s) => s.field === field);
  if (idx < 0) return applySortClick(cur, field, { additive: true });
  return cur.map((s, i) =>
    i === idx ? { ...s, order: s.order === "desc" ? "asc" : "desc" } : s
  );
}

export function setPrimarySort(field, order = "desc") {
  return normalizeSorts([{ field, order }]);
}

/**
 * Make `field` the primary sort while keeping the levels already in the chain
 * as tiebreakers below it.
 *
 * The toolbar dropdown used to call setPrimarySort, which returns a chain of
 * one — so picking a field there silently threw away every level the user had
 * built with Shift+click. The only warning was a title tooltip reading
 * "replaces chain", which nobody sees. The two controls now compose: headers
 * build the chain, the dropdown re-heads it.
 *
 * Re-picking a field already in the chain keeps the direction it had, rather
 * than snapping it back to desc.
 */
export function promoteSortField(sorts, field, order = null) {
  const cur = normalizeSorts(sorts);
  const existing = cur.find((s) => s.field === field);
  const rest = cur.filter((s) => s.field !== field);
  return normalizeSorts([
    { field, order: order || existing?.order || "desc" },
    ...rest,
  ]);
}

export function formatSortChain(sorts) {
  return normalizeSorts(sorts)
    .map((s, i) => {
      const lab = SORT_LABELS[s.field] || s.field;
      const arrow = s.order === "asc" ? "↑" : "↓";
      return `${i + 1} ${lab} ${arrow}`;
    })
    .join(" · ");
}

// ── Value extractors ─────────────────────────────────────────────

function parseMcap(mcap) {
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

function maxTargetPct(s) {
  const targets = [s.target4, s.target3, s.target2, s.target1].filter(Boolean);
  if (!targets.length || !s.entry) return 0;
  const maxT = Math.max(...targets.map(Number));
  const entry = parseFloat(s.entry);
  return entry > 0 ? ((maxT - entry) / entry) * 100 : 0;
}

function riskRank(r) {
  const rl = (r || "").toLowerCase();
  if (rl.startsWith("low")) return 1;
  if (rl.startsWith("med") || rl.startsWith("nor")) return 2;
  if (rl.startsWith("high")) return 3;
  return 4;
}

const STATUS_RANK = {
  open: 0,
  tp1: 1,
  tp2: 2,
  tp3: 3,
  closed_win: 4,
  tp4: 4,
  closed_loss: 5,
  sl: 5,
};

/**
 * Verdict category for sort: Worth > Neutral > Avoid (desc).
 * Uses getVerdictForSignal when provided (LOO-safe).
 */
function verdictCategory(signal, ctx) {
  let v = null;
  if (typeof ctx.getVerdictForSignal === "function") {
    v = ctx.getVerdictForSignal(signal);
  } else if (ctx.verdictByPair && signal?.pair) {
    v = ctx.verdictByPair[signal.pair];
  }
  if (v === "worth_it") return 2;
  if (v === "neutral") return 1;
  if (v === "avoid") return 0;
  return null;
}

function verdictScore(signal, ctx) {
  const coin = ctx.coinIntel?.[signal?.pair];
  if (!coin || coin.risk_score == null || coin.risk_score === "") return null;
  const n = Number(coin.risk_score);
  return Number.isFinite(n) ? n : null;
}

/**
 * @returns {{ v: number|string|null, kind: 'num'|'str' }}
 */
export function sortValue(signal, field, ctx = {}) {
  const getPrice = ctx.getPriceVal || (() => 0);
  const getVol = ctx.getVolVal || (() => 0);
  const getStreak = ctx.getStreakVal || (() => null);
  const getWr = ctx.getWinRateVal || (() => null);
  const edgeMap = ctx.edgeScoreMap || {};

  switch (field) {
    case "pair":
      return { v: (signal.pair || "").toLowerCase(), kind: "str" };
    case "current_price":
      return { v: getPrice(signal.pair), kind: "num" };
    case "entry":
      return { v: parseFloat(signal.entry) || 0, kind: "num" };
    case "max_target":
      return { v: maxTargetPct(signal), kind: "num" };
    case "stop_loss":
      return { v: parseFloat(signal.stop1) || 0, kind: "num" };
    case "status":
      return {
        v: STATUS_RANK[(signal.status || "").toLowerCase()] ?? 9,
        kind: "num",
      };
    case "risk_level":
      return { v: riskRank(signal.risk_level), kind: "num" };
    case "market_cap":
      return { v: parseMcap(signal.market_cap), kind: "num" };
    case "volume":
      return { v: getVol(signal.pair), kind: "num" };
    case "win_streak":
      return { v: getStreak(signal.pair), kind: "num" };
    case "win_rate":
      return { v: getWr(signal.pair), kind: "num" };
    case "btc_corr":
      return { v: signal.btc_align_score ?? null, kind: "num" };
    case "verdict": {
      // Composite: category * 1000 + risk_score so Worth tops, then score within band.
      // Missing category → null (sinks).
      const cat = verdictCategory(signal, ctx);
      if (cat == null) return { v: null, kind: "num" };
      const sc = verdictScore(signal, ctx);
      const scorePart = sc != null ? Math.min(999, Math.max(0, sc)) : 0;
      return { v: cat * 1000 + scorePart, kind: "num" };
    }
    case "edge_score":
      return { v: edgeMap[signal.signal_id]?.score ?? null, kind: "num" };
    case "last_update": {
      const ts = signal.last_update_at ? new Date(signal.last_update_at).getTime() : 0;
      return { v: ts || null, kind: "num" };
    }
    case "created_at":
    default: {
      // "Called" is a time, and the column shows one, so sort the time.
      //
      // This used to return call_message_id. On clean data that is a perfect
      // chronological proxy — the ids are handed out in order — which is why
      // nothing looked wrong for a long time. It stops being one the moment a
      // row lands with an odd timestamp: eleven rows stored as "+02" instead of
      // UTC were enough to displace 541 rows, the worst by 170 places. Reading
      // the timestamp means the column can only ever be as wrong as the data.
      //
      // Ties fall through to tiebreak() below, which still uses the id.
      const ts = signal.created_at ? new Date(signal.created_at).getTime() : 0;
      return { v: Number.isFinite(ts) ? ts : 0, kind: "num" };
    }
  }
}

function compareOne(a, b, field, order, ctx) {
  const { v: va, kind } = sortValue(a, field, ctx);
  const { v: vb } = sortValue(b, field, ctx);

  // Missing handling
  if (NULLS_LAST.has(field) || field === "last_update") {
    const hasA = va !== null && va !== undefined;
    const hasB = vb !== null && vb !== undefined;
    if (hasA !== hasB) return hasA ? -1 : 1;
  }
  if (ZERO_SINKS.has(field)) {
    const hasA = va != null && Number(va) > 0;
    const hasB = vb != null && Number(vb) > 0;
    if (hasA !== hasB) return hasA ? -1 : 1;
  }

  if (kind === "str") {
    const sa = String(va || "");
    const sb = String(vb || "");
    const r = sa.localeCompare(sb);
    return order === "asc" ? r : -r;
  }

  const na = Number(va) || 0;
  const nb = Number(vb) || 0;
  if (na === nb) return 0;
  const cmp = na < nb ? -1 : 1;
  return order === "asc" ? cmp : -cmp;
}

function tiebreak(a, b) {
  return (b.call_message_id || 0) - (a.call_message_id || 0);
}

/**
 * Stable multi-key sort. Mutates a copy; returns new array.
 * @param {object[]} signals
 * @param {Array<{field,order}>} sorts
 * @param {object} ctx getters + maps
 */
export function sortSignals(signals, sorts, ctx = {}) {
  const chain = normalizeSorts(sorts);
  const list = [...(signals || [])];
  list.sort((a, b) => {
    for (const { field, order } of chain) {
      const c = compareOne(a, b, field, order, ctx);
      if (c !== 0) return c;
    }
    return tiebreak(a, b);
  });
  return list;
}

/** Human order label for primary field. */
export function orderLabel(field, order) {
  const isTime = field === "created_at" || field === "last_update";
  const isAlpha = field === "pair";
  const isRisk = field === "risk_level";
  const isStatus = field === "status";
  if (order === "desc") {
    if (isTime) return "Newest";
    if (isAlpha) return "Z–A";
    if (isRisk) return "High";
    if (isStatus) return "Latest";
    if (field === "verdict") return "Worth first";
    return "Highest";
  }
  if (isTime) return "Oldest";
  if (isAlpha) return "A–Z";
  if (isRisk) return "Low";
  if (isStatus) return "Early";
  if (field === "verdict") return "Avoid first";
  return "Lowest";
}

/** Recipe presets for multi-sort. */
export const MULTI_SORT_PRESETS = [
  {
    id: "worth_edge",
    label: "Worth → Edge",
    hint: "Verdict then Edge Score",
    sorts: [
      { field: "verdict", order: "desc" },
      { field: "edge_score", order: "desc" },
      { field: "created_at", order: "desc" },
    ],
  },
  {
    id: "edge_called",
    label: "Edge → Called",
    hint: "Edge Score then newest",
    sorts: [
      { field: "edge_score", order: "desc" },
      { field: "created_at", order: "desc" },
    ],
  },
  {
    id: "open_edge",
    label: "Status → Edge",
    hint: "Lifecycle then Edge",
    sorts: [
      { field: "status", order: "asc" },
      { field: "edge_score", order: "desc" },
    ],
  },
  {
    id: "wr_edge",
    label: "WR → Edge",
    hint: "Pair win rate then Edge",
    sorts: [
      { field: "win_rate", order: "desc" },
      { field: "edge_score", order: "desc" },
    ],
  },
];
