import api from "./api";

export const signalAlertApi = {
  catalog: async () => (await api.get("/signal-filters/catalog")).data,
  preview: async (criteria, signal) => {
    const { data } = await api.post("/signal-filters/preview", { criteria }, { signal });
    return data;
  },
  list: async () => {
    const { data } = await api.get("/signal-filters/");
    return data;
  },
  create: async (body) => {
    const { data } = await api.post("/signal-filters/", body);
    return data;
  },
  patch: async (id, body) => {
    const { data } = await api.patch(`/signal-filters/${id}`, body);
    return data;
  },
  remove: async (id) => {
    await api.delete(`/signal-filters/${id}`);
  },
};

export function emptyCriteria() {
  return {
    tags: [],
    tag_match: "any",
    exclude_tags: [],
    exclude_confound: false,
    runners: false,
    risk_level: [],
    status: [],
    rating: [],
    min_confidence: null,
    direction: [],
    pairs: [],
    exclude_pairs: [],
    min_mcap: null,
    max_mcap: null,
    max_volume_rank: null,
    min_sl_pct: null,
    max_sl_pct: null,
    btc_decoupled: false,
    min_btc_align: null,
    edge_top: null,
    smc_golden: false,
  };
}

const NAME_TO_BASE = {
  BITCOIN: "BTC",
  ETHEREUM: "ETH",
  SOLANA: "SOL",
  RIPPLE: "XRP",
  DOGECOIN: "DOGE",
  CARDANO: "ADA",
  POLKADOT: "DOT",
  AVALANCHE: "AVAX",
  LITECOIN: "LTC",
  TRON: "TRX",
  POLYGON: "POL",
  MATIC: "POL",
  BINANCE: "BNB",
  CHAINLINK: "LINK",
};

/** One wire format: BASEUSDT. BTC, BTCUSDT, bitcoin → BTCUSDT. */
export function toUsdtPair(raw) {
  let u = String(raw || "")
    .toUpperCase()
    .trim()
    .replace(/[-/_\s]/g, "");
  if (!u) return "";
  if (NAME_TO_BASE[u]) u = NAME_TO_BASE[u];
  if (u.endsWith("USDT")) return u;
  if (u.endsWith("USDC") || u.endsWith("BUSD") || u.endsWith("USD")) {
    const base = u.replace(/USDC$|BUSD$|USD$/, "");
    return base ? `${base}USDT` : "";
  }
  return `${u}USDT`;
}

export function pairBase(pair) {
  const p = toUsdtPair(pair);
  return p.endsWith("USDT") ? p.slice(0, -4) : p;
}

export function collectAlertCriteria(desk = {}, extra = {}) {
  const c = { ...emptyCriteria(), ...extra };
  if (desk.selectedTags?.length) {
    c.tags = [...desk.selectedTags];
    c.tag_match = desk.tagMatchMode === "all" ? "all" : "any";
  }
  if (desk.riskFilter && desk.riskFilter !== "all") c.risk_level = [desk.riskFilter];
  if (desk.statusFilter && desk.statusFilter !== "all") c.status = [desk.statusFilter];
  const pair = toUsdtPair(desk.searchPair || "");
  if (pair) c.pairs = [pair];
  if (desk.corrDecoupled) c.btc_decoupled = true;
  if (desk.corrHighAlign) c.min_btc_align = 70;
  return c;
}

export function criteriaIsEmpty(c) {
  if (!c || typeof c !== "object") return true;
  if (c.runners || c.btc_decoupled || c.exclude_confound) return false;
  const has = (k) => Array.isArray(c[k]) && c[k].length;
  return !(
    has("tags") ||
    has("exclude_tags") ||
    has("risk_level") ||
    has("status") ||
    has("rating") ||
    has("direction") ||
    has("pairs") ||
    has("exclude_pairs") ||
    c.min_confidence ||
    c.min_mcap ||
    c.max_mcap ||
    c.max_volume_rank ||
    c.min_sl_pct ||
    c.max_sl_pct ||
    c.min_btc_align ||
    c.edge_top ||
    c.smc_golden
  );
}

export function criteriaToDeskState(c = {}, meta = {}) {
  // Preserve every rule. The backend also evaluates these for notifications.
  // `meta` carries which saved screen this is and whether it is actually
  // alerting, so the desk can say so instead of an anonymous "Custom · active".
  // A screen with unsaved edits arrives with no name on purpose: the rules on
  // screen are no longer the rules that name refers to.
  return {
    extra: {
      criteria: structuredClone(c),
      name: meta.name || null,
      notify: !!meta.notify,
      telegram: !!meta.telegram,
    },
    searchPair: "",
  };
}

export const MCAP_PRESETS = [
  { key: "any", label: "Any size", min: null, max: null },
  { key: "micro", label: "< $50m", min: null, max: 5e7 },
  { key: "mid", label: "$50m–300m", min: 5e7, max: 3e8 },
  { key: "large", label: "$300m–2b", min: 3e8, max: 2e9 },
  { key: "mega", label: "> $2b", min: 2e9, max: null },
];
