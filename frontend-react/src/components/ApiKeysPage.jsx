// src/components/ApiKeysPage.jsx
// ════════════════════════════════════════════════════════════════
// API Keys — subscriber self-service: generate/manage keys + full
// in-page API documentation for the LuxQuant Public Data API.
//
// Layout:
//   - Header (eyebrow + title + subtitle)
//   - Stat cards (Access / Active keys / Rate limit / Endpoints) w/ icons
//   - Non-subscriber upsell
//   - Just-created key banner (shown once)
//   - Keys panel (Stripe-style): header + "New key" action that reveals an
//     inline create form, then a table of keys (Name / Key / Activity / —),
//     collapsing to stacked cards on mobile, with revoked-trim toggle
//   - Quick start + Security & limits (two cards)
//   - API Documentation (Stripe/X-style): sticky table-of-contents on the
//     left with scrollspy, content on the right. Endpoints are collapsible
//     cards with parameter + field reference; code examples use language
//     tabs. Mobile gets a sticky horizontal chip nav.
//
// Management UI is i18n (apiKeys.* namespace). Documentation content is
// English (standard for API docs). All cards translucent over luxury-bg.
//
// Backend (JWT):  POST/GET/PATCH/DELETE /api/v1/api-keys
// Data API (key): https://luxquant.tw/api/public/v1/...
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiKeysApi } from "../services/api";

const PUBLIC_BASE = "https://luxquant.tw/api/public/v1";
const MAX_REVOKED_VISIBLE = 3;
const KEY_CAP = 2;
const RATE_LIMIT = 60;

// Stat-card glyphs (heroicons outline paths).
const ICON_ACCESS =
  "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z";
const ICON_KEY =
  "M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z";
const ICON_BOLT = "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z";
const ICON_CODE =
  "M17.25 6.75L22.5 12l-5.25 5.25M6.75 17.25L1.5 12l5.25-5.25m7.5-3l-4.5 16.5";

// Shared grid template for the keys table (stacks below sm).
const KEY_GRID =
  "sm:grid sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_auto] sm:items-center sm:gap-4";

// ── Verified signal status values (matches backend ?status= filter) ──
const STATUS_VALUES = [
  ["open", "Signal still running — no target or stop hit yet."],
  ["tp1", "Reached target 1 then stopped advancing."],
  ["tp2", "Reached target 2 then stopped advancing."],
  ["tp3", "Reached target 3 then stopped advancing."],
  ["closed_win", "Closed in profit (hit final target / TP4)."],
  ["closed_loss", "Closed at a loss (stop-loss hit)."],
];

// ── Example payloads (signals trio = verified exact shapes) ──
const EX_SIGNALS = `{
  "items": [
    {
      "signal_id": "cbc5315b-3910-48ba-8216-3b72a6987ddf",
      "pair": "SKYAIUSDT",
      "status": "open",
      "risk_level": "Normal",
      "entry": 0.1945,
      "target1": 0.1999,
      "target2": 0.2052,
      "target3": 0.2213,
      "target4": 0.2481,
      "stop1": 0.183,
      "stop2": 0.1516,
      "market_cap": "187.0",
      "volume_rank_num": 42,
      "volume_rank_den": 500,
      "created_at": "2026-06-06T02:40:06+00:00"
    }
  ],
  "count": 1,
  "cursor": "2026-06-06T02:40:06+00:00"
}`;

const EX_UPDATES = `{
  "items": [
    {
      "signal_id": "fc3daeda-de43-4f30-ba24-803855a1c35a",
      "pair": "WMTUSDT",
      "event": "tp2",
      "price": 120.27,
      "update_at": "2026-06-06T05:12:00+00:00"
    }
  ],
  "count": 1,
  "cursor": "2026-06-06T05:12:00+00:00"
}`;

const EX_DETAIL = `{
  "signal_id": "cbc5315b-3910-48ba-8216-3b72a6987ddf",
  "pair": "SKYAIUSDT",
  "status": "tp2",
  "risk_level": "Normal",
  "entry": 0.1945,
  "target1": 0.1999, "target2": 0.2052,
  "target3": 0.2213, "target4": 0.2481,
  "stop1": 0.183, "stop2": 0.1516,
  "market_cap": "187.0",
  "volume_rank_num": 42, "volume_rank_den": 500,
  "created_at": "2026-06-06T02:40:06+00:00",
  "updates": [
    { "event": "tp1", "price": 0.1999, "update_at": "2026-06-06T03:01:00+00:00" },
    { "event": "tp2", "price": 0.2052, "update_at": "2026-06-06T03:48:00+00:00" }
  ]
}`;

const EX_CURL = `curl "${PUBLIC_BASE}/signals?status=open&limit=50" \\
  -H "Authorization: Bearer lq_live_YOUR_KEY"`;

const EX_PYTHON = `import requests

KEY  = "lq_live_YOUR_KEY"
BASE = "${PUBLIC_BASE}"
H    = {"Authorization": f"Bearer {KEY}"}

# 1) list open signals
r = requests.get(f"{BASE}/signals",
                 headers=H,
                 params={"status": "open", "limit": 50})
r.raise_for_status()
data = r.json()
for s in data["items"]:
    print(s["pair"], s["status"], s["entry"])

# 2) take a signal_id and pull its price-action journey
if data["items"]:
    sid = data["items"][0]["signal_id"]
    journey = requests.get(f"{BASE}/journey/{sid}", headers=H).json()
    print(journey)`;

const EX_JS = `const KEY  = "lq_live_YOUR_KEY";
const BASE = "${PUBLIC_BASE}";
const H    = { Authorization: \`Bearer \${KEY}\` };

// Poll the TP/SL event feed forward using the cursor.
// 15s interval = 4 req/min, well within the 60/min limit.
let cursor = null;
async function poll() {
  const url = new URL(\`\${BASE}/signals/updates\`);
  if (cursor) url.searchParams.set("since", cursor);
  url.searchParams.set("limit", "100");

  const res = await fetch(url, { headers: H });
  if (res.status === 429) return;            // rate limited; back off
  const data = await res.json();

  for (const ev of data.items) {
    console.log(ev.pair, ev.event, ev.price, ev.update_at);
  }
  if (data.cursor) cursor = data.cursor;     // advance only on data
}
setInterval(poll, 15000);`;

// Per-endpoint reference. Signals trio = exact verified shapes; batch-2
// (journey/enrichment/correlation/pulse) verified against public_data.py,
// including field reference tables.
const ENDPOINTS = [
  {
    method: "GET",
    path: "/signals",
    summary: "List / poll signals (newest first, or forward by cursor).",
    params: [
      [
        "status",
        "string",
        "no",
        "Filter by status: open · tp1 · tp2 · tp3 · closed_win · closed_loss. Invalid value -> 400.",
      ],
      [
        "pair",
        "string",
        "no",
        "Filter by trading pair, e.g. BTCUSDT (case-insensitive).",
      ],
      [
        "risk_level",
        "string",
        "no",
        "Filter by risk tier, e.g. Low / Medium / High / Normal.",
      ],
      [
        "since",
        "ISO8601",
        "no",
        "Return signals created AFTER this timestamp (forward polling, ascending order).",
      ],
      ["limit", "int", "no", "1-200, default 50."],
    ],
    example: EX_SIGNALS,
    notes:
      "Without `since`, results are newest-first. With `since`, results are oldest-first so you can page forward using the returned `cursor`.",
  },
  {
    method: "GET",
    path: "/signals/updates",
    summary: "Cross-signal feed of TP/SL events as they happen.",
    params: [
      [
        "since",
        "ISO8601",
        "no",
        "Return events with update_at AFTER this timestamp (forward polling).",
      ],
      ["limit", "int", "no", "1-500, default 100."],
    ],
    example: EX_UPDATES,
    notes:
      "`event` is normalized to one of: tp1, tp2, tp3, tp4, sl. Always ascending by `update_at`. Use `cursor` to advance.",
  },
  {
    method: "GET",
    path: "/signals/{id}",
    summary: "Full detail for one signal, including its TP/SL update history.",
    params: [
      [
        "{id}",
        "path",
        "yes",
        "The signal_id returned by /signals (a UUID, NOT a pair name).",
      ],
    ],
    example: EX_DETAIL,
    notes:
      "Returns 404 if the signal does not exist OR is before the public data start date (the two are intentionally indistinguishable).",
  },
  {
    method: "GET",
    path: "/journey/{id}",
    summary:
      "Price-action journey: MAE/MFE, time-to-TP1, time above entry, realized vs missed potential.",
    params: [["{id}", "path", "yes", "signal_id from /signals."]],
    fields: [
      [
        "available / reason",
        'When false, analytics are not ready yet (reason: "no_journey_yet"). Treat as normal, not an error.',
      ],
      ["direction", "Trade direction context for the signal."],
      [
        "coverage_status / coverage_from / coverage_until",
        "How complete the tracked price window is, and the time range it spans.",
      ],
      [
        "overall_mae_pct / overall_mfe_pct",
        "Maximum adverse and maximum favorable excursion (%) over the signal\u2019s life.",
      ],
      [
        "initial_mae_pct",
        "Worst drawdown before the first favorable progress.",
      ],
      [
        "time_to_tp1_seconds",
        "Seconds from entry until the first target was hit.",
      ],
      [
        "time_to_outcome_seconds",
        "Seconds from entry until the final outcome.",
      ],
      [
        "pct_time_above_entry",
        "Share of tracked time price stayed above entry (%).",
      ],
      [
        "tp_then_sl / tps_hit_before_sl",
        "Whether it hit a target then stopped out, and how many targets were hit before any SL.",
      ],
      [
        "realized_outcome_pct / missed_potential_pct",
        "Actual realized result, and extra move that was available but not captured (%).",
      ],
      ["events", "Ordered timeline of price-action events."],
    ],
    example: `// not computed yet (usually a very new signal):
{ "signal_id": "...", "available": false, "reason": "no_journey_yet" }

// once computed, fields include:
{
  "signal_id": "...", "pair": "SKYAIUSDT", "direction": "...",
  "coverage_status": "...", "coverage_from": "...", "coverage_until": "...",
  "overall_mae_pct": -4.2, "overall_mfe_pct": 12.8,
  "initial_mae_pct": -1.1,
  "time_to_tp1_seconds": 2880, "time_to_outcome_seconds": 14400,
  "pct_time_above_entry": 71.0,
  "tp_then_sl": false, "tps_hit_before_sl": 2,
  "realized_outcome_pct": 5.4, "missed_potential_pct": 7.4,
  "events": [ ... ]
}`,
    notes:
      'Derived analytics. Until the worker has processed a (usually very new) signal it returns { "available": false, "reason": "no_journey_yet" } rather than an error — handle that as normal.',
  },
  {
    method: "GET",
    path: "/enrichment/{id}",
    summary:
      "Multi-timeframe technical enrichment: entry snapshot + live snapshot + facts/tags.",
    params: [["{id}", "path", "yes", "signal_id from /signals."]],
    fields: [
      ["status", "One of: enriched · not_enriched · legacy_only."],
      [
        "signal_info",
        "Entry, target1-4, stop1, current_status and created_at.",
      ],
      [
        "entry_snapshot",
        "Multi-timeframe TA facts & tags captured at signal creation.",
      ],
      ["live_snapshot", "Latest TA facts & tags."],
      [
        "live_updated_at / analyzed_at",
        "When the live snapshot and the analysis were last refreshed (ISO-8601).",
      ],
      ["version", "Enrichment schema version."],
    ],
    example: `// status is one of: enriched | not_enriched | legacy_only
{
  "signal_id": "...",
  "pair": "SKYAIUSDT",
  "status": "enriched",
  "signal_info": {
    "entry": 0.1945, "target1": 0.1999, "target2": 0.2052,
    "target3": 0.2213, "target4": 0.2481, "stop1": 0.183,
    "current_status": "open", "created_at": "2026-06-06T02:40:06+00:00"
  },
  "entry_snapshot": { ... },
  "live_snapshot": { ... },
  "live_updated_at": "2026-06-06T05:00:00+00:00",
  "analyzed_at": "2026-06-06T02:41:00+00:00",
  "version": 3
}`,
    notes:
      'New signals return { "status": "not_enriched" } until processed; older ones may be "legacy_only" (no entry snapshot). Related: /enrichment/{id}/history and /enrichment/{id}/export/prompt.',
  },
  {
    method: "GET",
    path: "/enrichment/{id}/history",
    summary: "Time-series of enrichment snapshots for a signal.",
    params: [
      ["{id}", "path", "yes", "signal_id from /signals."],
      ["limit", "int", "no", "1-200, default 50."],
    ],
    example: `{ "signal_id": "...", "pair": "SKYAIUSDT", "count": 0, "history": [] }`,
    notes:
      "Returns { count: 0, history: [] } when nothing has been recorded yet.",
  },
  {
    method: "GET",
    path: "/enrichment/{id}/export/prompt",
    summary: "Ready-to-feed Markdown + analysis prompt for your own LLM/agent.",
    params: [["{id}", "path", "yes", "signal_id from /signals."]],
    example: `# (plain text, not JSON — Content-Type: text/plain)
#
# <Markdown summary of the signal's facts & tags>
#
# ---
#
# Based on the data above, please analyze this trading signal:
# 1. Is this a high-quality entry based on the facts and tags?
# 2. What are the main risks to consider?
# 3. What position sizing approach would you suggest (conservative/normal/aggressive)?
# 4. What are the key levels and conditions to watch for invalidation?
# 5. How does the current market context (BTC, dominance, F&G) affect this trade?`,
    notes:
      "Response Content-Type is text/plain (Markdown), not JSON. The 5 analysis questions are appended verbatim so you can pass the whole body straight to an LLM.",
  },
  {
    method: "GET",
    path: "/btc-correlation/recent",
    summary:
      "Recent BTC-correlation analytics across signals (alignment, beta, decoupling).",
    params: [
      ["limit", "int", "no", "1-100, default 20."],
      [
        "decoupled_only",
        "bool",
        "no",
        "Only signals flagged as decoupled from BTC.",
      ],
      [
        "extended_only",
        "bool",
        "no",
        "Only signals flagged as in an extended move.",
      ],
    ],
    fields: [
      [
        "corr_1h_7d / corr_4h_30d",
        "Correlation to BTC over a short (1h/7d) and a longer (4h/30d) window.",
      ],
      [
        "beta_30d / downside_beta",
        "Sensitivity to BTC moves overall, and specifically during BTC drops.",
      ],
      ["r_squared_30d", "How much of the coin\u2019s movement BTC explains."],
      [
        "corr_zscore",
        "How unusual the current correlation is vs the coin\u2019s own history.",
      ],
      [
        "tail_corr_btc_down / tail_corr_btc_up",
        "Correlation specifically in BTC down-tails and up-tails.",
      ],
      [
        "lead_lag_hours",
        "Whether the coin tends to lead (+) or lag (-) BTC, in hours.",
      ],
      [
        "volatility_ratio / coin_volatility_pct",
        "Coin volatility relative to BTC, and the coin\u2019s own volatility (%).",
      ],
      [
        "momentum_divergence_7d",
        "Momentum gap between the coin and BTC over 7 days.",
      ],
      [
        "is_extended / is_decoupled",
        "Flags: the move looks overextended; the coin is moving independently of BTC.",
      ],
      [
        "btc_context / interpretation / confidence",
        "Human-readable context, a summary, and a confidence label.",
      ],
      ["sample_size", "Number of data points behind the statistics."],
      [
        "data_source / snapshot_at / analyzed_at",
        "Provenance and timestamps for the analysis.",
      ],
    ],
    example: `{
  "count": 1,
  "items": [
    {
      "signal_id": "...", "pair": "SKYAIUSDT",
      "corr_1h_7d": 0.42, "corr_4h_30d": 0.51,
      "beta_30d": 1.18, "r_squared_30d": 0.33, "corr_zscore": -0.7,
      "tail_corr_btc_down": 0.61, "tail_corr_btc_up": 0.38,
      "downside_beta": 1.35, "lead_lag_hours": -2.0,
      "volatility_ratio": 1.4, "coin_volatility_pct": 6.2,
      "momentum_divergence_7d": 0.12,
      "is_extended": false, "is_decoupled": true,
      "btc_context": "...", "interpretation": "...",
      "confidence": "...", "sample_size": 168,
      "data_source": "...",
      "snapshot_at": "2026-06-06T05:00:00+00:00",
      "analyzed_at": "2026-06-06T05:01:00+00:00"
    }
  ]
}`,
    notes:
      "Per-signal variant: /btc-correlation/{id} (uses signal_id). Field names shown are exact; numeric values are illustrative.",
  },
  {
    method: "GET",
    path: "/btc-correlation/{id}",
    summary: "BTC-correlation analytics for one signal.",
    params: [["{id}", "path", "yes", "signal_id from /signals."]],
    example: `// same object shape as one item of /btc-correlation/recent
{ "signal_id": "...", "pair": "...", "beta_30d": 1.18, "is_decoupled": true, ... }`,
    notes: "404 if not found or not yet computed.",
  },
  {
    method: "GET",
    path: "/market-pulse/feed",
    summary: "Realtime market-pulse event stream (significant moves).",
    params: [
      ["source", "string", "no", "pulse | price_movement."],
      ["pair", "string", "no", "Filter by pair."],
      ["timeframe", "string", "no", "5m | 1h | 2h | 4h | 1d."],
      ["direction", "string", "no", "bullish | bearish."],
      ["limit", "int", "no", "1-500, default 100."],
    ],
    fields: [
      ["pair / base_symbol", "Trading pair and its base asset."],
      ["direction", "bullish or bearish."],
      ["pct_change", "Size of the move (%)."],
      ["timeframe", "Window the move occurred over."],
      ["event_type", "Category of the pulse event."],
      ["move_seconds", "How fast the move happened, in seconds."],
      ["created_at", "When the event was recorded (ISO-8601)."],
    ],
    example: `{
  "events": [
    {
      "pair": "BTCUSDT", "base_symbol": "BTC",
      "direction": "bullish", "pct_change": 1.8,
      "timeframe": "1h", "event_type": "...",
      "move_seconds": 120,
      "created_at": "2026-06-06T05:00:00+00:00"
    }
  ],
  "count": 1
}`,
    notes:
      "Internal source identifiers (source_msg_id, channel ids, raw text) are redacted. Aggregate variant: /market-pulse/stats.",
  },
  {
    method: "GET",
    path: "/market-pulse/stats",
    summary:
      "Aggregate market regime: 1h/24h totals, bull/bear ratio, biggest move, heatmap.",
    params: [],
    example: `// JSON aggregate object (counts, ratios, biggest move, heatmap).
// Contains no per-message identifiers.`,
    notes: 'No parameters. Good for a single "market mood" widget.',
  },
];

// Stable anchor id from an endpoint path.
const epId = (path) =>
  "ep-" +
  path
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

const EP_LIST = ENDPOINTS.map((ep) => ({ ...ep, _id: epId(ep.path) }));

// Table-of-contents structure (the "Endpoints" section nests each route).
const SECTIONS = [
  { id: "doc-auth", label: "Authentication" },
  { id: "doc-base", label: "Base URL" },
  { id: "doc-rate", label: "Rate limits" },
  { id: "doc-format", label: "Response format" },
  { id: "doc-codes", label: "Status codes" },
  { id: "doc-ids", label: "Using signal_id" },
  {
    id: "doc-endpoints",
    label: "Endpoints",
    children: EP_LIST.map((ep) => ({ id: ep._id, label: ep.path })),
  },
  { id: "doc-status", label: "Status values" },
  { id: "doc-examples", label: "Code examples" },
  { id: "doc-best", label: "Best practices" },
];

const DOC_SECTION_IDS = SECTIONS.map((s) => s.id);

function deriveActiveAccess(user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "premium" || user.role === "subscriber") {
    if (!user.subscription_expires_at) return true;
    return new Date(user.subscription_expires_at) > new Date();
  }
  return false;
}

function accessLabel(user, t) {
  const role = user?.role;
  if (role === "admin")
    return t("apiKeys.tier_admin", { defaultValue: "Admin" });
  if (role === "premium" || role === "subscriber") {
    if (!user.subscription_expires_at)
      return t("apiKeys.tier_lifetime", { defaultValue: "Lifetime" });
    return role === "subscriber"
      ? t("apiKeys.tier_subscriber", { defaultValue: "Subscriber" })
      : t("apiKeys.tier_premium", { defaultValue: "Premium" });
  }
  return t("apiKeys.tier_free", { defaultValue: "Free" });
}

function fmtDate(s) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtRelative(s, t) {
  if (!s) return t("apiKeys.never");
  const d = new Date(s);
  if (isNaN(d)) return t("apiKeys.never");
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("apiKeys.just_now");
  if (m < 60) return `${m}m ${t("apiKeys.ago")}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${t("apiKeys.ago")}`;
  const days = Math.floor(h / 24);
  return `${days}d ${t("apiKeys.ago")}`;
}

// Scrollspy: returns the id of the last section whose top has crossed the
// offset line. Classic, robust for an in-page TOC.
function useScrollSpy(ids, offset = 96) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let raf = 0;
    const compute = () => {
      raf = 0;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= offset) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [ids, offset]);
  return active;
}

function scrollToId(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Presentational helpers ──────────────────────────────────────────

const StatCard = ({ label, value, accent, icon }) => (
  <div className="rounded-xl px-4 py-3 border border-white/5 bg-white/[0.02]">
    <div className="flex items-center gap-1.5 mb-1">
      {icon && (
        <svg
          className="w-3.5 h-3.5 text-text-muted flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d={icon}
          />
        </svg>
      )}
      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
        {label}
      </p>
    </div>
    <p className={`text-lg font-semibold ${accent || "text-white"}`}>{value}</p>
  </div>
);

const SectionHead = ({ children }) => (
  <h2 className="text-[10px] sm:text-[11px] font-mono uppercase tracking-[0.22em] text-gold-primary/70 mb-3">
    {children}
  </h2>
);

// One key as a Stripe-style table row (stacks on mobile).
const KeyRow = ({ k, onRevoke, revoking, t }) => (
  <div
    className={`px-4 sm:px-5 py-3.5 border-t border-white/[0.05] ${KEY_GRID} ${k.is_active ? "" : "opacity-60"}`}
  >
    {/* Name + status */}
    <div className="min-w-0 flex items-center gap-2">
      <span className="text-white text-sm font-medium truncate">
        {k.name || t("apiKeys.untitled")}
      </span>
      {k.is_active ? (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex-shrink-0">
          {t("apiKeys.status_active")}
        </span>
      ) : (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-red-500/15 text-red-400 border border-red-500/20 flex-shrink-0">
          {t("apiKeys.status_revoked")}
        </span>
      )}
    </div>

    {/* Token */}
    <code className="block font-mono text-[12px] text-text-secondary mt-1.5 sm:mt-0 truncate">
      {k.key_prefix}
      {"\u2022".repeat(8)}
    </code>

    {/* Activity */}
    <div className="text-[11px] text-text-muted mt-1.5 sm:mt-0">
      {t("apiKeys.created")} {fmtDate(k.created_at)}
      {k.is_active && (
        <>
          {" "}
          · {t("apiKeys.last_used")} {fmtRelative(k.last_used_at, t)}
        </>
      )}
    </div>

    {/* Action */}
    <div className="mt-2.5 sm:mt-0 sm:justify-self-end">
      {k.is_active && (
        <button
          onClick={() => onRevoke(k.id)}
          disabled={revoking}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-red-400/80 border border-red-500/25 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 whitespace-nowrap"
        >
          {revoking ? t("apiKeys.revoking") : t("apiKeys.revoke")}
        </button>
      )}
    </div>
  </div>
);

// Single-language code block with its own copy button.
const CodeBlock = ({
  code,
  lang = "bash",
  copyLabel = "Copy",
  copiedLabel = "Copied",
}) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="rounded-lg bg-black/40 border border-white/5 overflow-hidden my-2">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
          {lang}
        </span>
        <button
          onClick={copy}
          className="text-[10px] font-semibold text-gold-primary hover:text-gold-light transition-colors"
        >
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <pre className="px-3 py-3 font-mono text-[11px] leading-relaxed text-text-secondary whitespace-pre-wrap break-all">
        {code}
      </pre>
    </div>
  );
};

// Multi-language code block with tabs (curl / Python / JS).
const CodeTabs = ({ tabs, copyLabel = "Copy", copiedLabel = "Copied" }) => {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const cur = tabs[active] || tabs[0];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cur.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="rounded-lg bg-black/40 border border-white/5 overflow-hidden my-2">
      <div className="flex items-center justify-between border-b border-white/5">
        <div className="flex">
          {tabs.map((tb, i) => (
            <button
              key={tb.label}
              onClick={() => {
                setActive(i);
                setCopied(false);
              }}
              className={`px-3 py-1.5 text-[11px] font-mono transition-colors border-b-2 -mb-px ${
                i === active
                  ? "text-gold-primary border-gold-primary"
                  : "text-text-muted hover:text-text-secondary border-transparent"
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>
        <button
          onClick={copy}
          className="px-3 text-[10px] font-semibold text-gold-primary hover:text-gold-light transition-colors"
        >
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <pre className="px-3 py-3 font-mono text-[11px] leading-relaxed text-text-secondary whitespace-pre-wrap break-all">
        {cur.code}
      </pre>
    </div>
  );
};

// Documentation section wrapper.
const DocSection = ({ id, title, children }) => (
  <section id={id} className="scroll-mt-24">
    <h3 className="text-white font-semibold text-[15px] mb-2 flex items-center gap-2">
      <span className="w-1 h-3.5 rounded-full bg-gold-primary/70" />
      {title}
    </h3>
    <div className="text-text-secondary text-[13px] leading-relaxed space-y-2 pl-3">
      {children}
    </div>
  </section>
);

// Inline mono token.
const Mono = ({ children }) => (
  <code className="font-mono text-[12px] text-gold-light bg-black/30 px-1.5 py-0.5 rounded border border-white/[0.06]">
    {children}
  </code>
);

// Parameter table for an endpoint.
const ParamTable = ({ rows }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
          <th className="py-1.5 pr-3 font-medium">Param</th>
          <th className="py-1.5 pr-3 font-medium">Type</th>
          <th className="py-1.5 pr-3 font-medium">Req</th>
          <th className="py-1.5 font-medium">Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, type, req, desc]) => (
          <tr key={name} className="border-t border-white/[0.05] align-top">
            <td className="py-2 pr-3">
              <code className="font-mono text-[11px] text-gold-primary/90 whitespace-nowrap">
                {name}
              </code>
            </td>
            <td className="py-2 pr-3 text-[11px] text-text-muted whitespace-nowrap">
              {type}
            </td>
            <td className="py-2 pr-3 text-[11px]">
              {req === "yes" ? (
                <span className="text-amber-400/80">yes</span>
              ) : (
                <span className="text-text-muted">no</span>
              )}
            </td>
            <td className="py-2 text-[12px] text-text-secondary">{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// Field reference table (name -> meaning) for richer endpoint docs.
const FieldTable = ({ rows }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
          <th className="py-1.5 pr-3 font-medium">Field</th>
          <th className="py-1.5 font-medium">Meaning</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, meaning]) => (
          <tr key={name} className="border-t border-white/[0.05] align-top">
            <td className="py-2 pr-3">
              <code className="font-mono text-[11px] text-gold-primary/90 whitespace-nowrap">
                {name}
              </code>
            </td>
            <td className="py-2 text-[12px] text-text-secondary">{meaning}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// One endpoint as a collapsible card. Open state is controlled by the parent
// so the TOC can expand a card when its sub-link is clicked.
const EndpointCard = ({ ep, open, onToggle, copyLabel, copiedLabel }) => (
  <div
    id={ep._id}
    className="scroll-mt-24 rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden"
  >
    <button
      onClick={onToggle}
      aria-expanded={open}
      className="w-full flex items-center justify-between gap-2 p-4 text-left hover:bg-white/[0.02] transition-colors"
    >
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className="font-mono text-[10px] font-bold text-emerald-400/80 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
          {ep.method}
        </span>
        <code className="font-mono text-[13px] text-gold-primary/90 break-all">
          {ep.path}
        </code>
      </div>
      <svg
        className={`w-4 h-4 text-text-muted flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M19.5 8.25l-7.5 7.5-7.5-7.5"
        />
      </svg>
    </button>

    {open && (
      <div className="px-4 pb-4 pt-3 border-t border-white/5 space-y-3">
        <p className="text-text-secondary text-[13px]">{ep.summary}</p>

        {ep.params?.length > 0 && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1">
              Parameters
            </p>
            <ParamTable rows={ep.params} />
          </div>
        )}

        {ep.fields?.length > 0 && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1">
              Response fields
            </p>
            <FieldTable rows={ep.fields} />
          </div>
        )}

        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1">
            Example response
          </p>
          <CodeBlock
            code={ep.example}
            lang="json"
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
          />
        </div>

        {ep.notes && (
          <p className="text-[11px] text-text-muted leading-relaxed">
            <span className="text-gold-primary/60">Note:</span> {ep.notes}
          </p>
        )}
      </div>
    )}
  </div>
);

// Sticky table-of-contents (desktop). Highlights the active section; when
// the Endpoints section is active, its routes expand as sub-links.
const TocSidebar = ({ active, onNavigate, onEndpointNav }) => (
  <nav className="text-[12px]" aria-label="API documentation sections">
    <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mb-2 px-2">
      On this page
    </p>
    <ul className="space-y-0.5">
      {SECTIONS.map((s) => {
        const isActive = active === s.id;
        return (
          <li key={s.id}>
            <button
              onClick={() => onNavigate(s.id)}
              className={`w-full text-left px-2 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
                isActive
                  ? "text-gold-primary bg-gold-primary/10"
                  : "text-text-secondary hover:text-white hover:bg-white/[0.03]"
              }`}
            >
              <span
                className={`w-1 h-1 rounded-full flex-shrink-0 ${isActive ? "bg-gold-primary" : "bg-white/20"}`}
              />
              <span className="truncate">{s.label}</span>
            </button>
            {s.children && isActive && (
              <ul className="mt-0.5 ml-3 border-l border-white/10 space-y-0.5">
                {s.children.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => onEndpointNav(c.id)}
                      className="w-full text-left pl-3 pr-2 py-1 rounded-md font-mono text-[11px] text-text-muted hover:text-gold-light hover:bg-white/[0.03] transition-colors truncate"
                    >
                      {c.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  </nav>
);

// Sticky horizontal chip nav (mobile).
const TocChips = ({ active, onNavigate }) => (
  <div className="lg:hidden sticky top-14 z-20 -mx-5 sm:-mx-6 px-5 sm:px-6 py-2 mb-4 bg-bg-primary/95 backdrop-blur-sm border-b border-white/5">
    <div
      className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: "none" }}
    >
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          onClick={() => onNavigate(s.id)}
          className={`px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap transition-colors flex-shrink-0 border ${
            active === s.id
              ? "bg-gold-primary/15 text-gold-primary border-gold-primary/30"
              : "bg-white/[0.03] text-text-secondary border-white/5"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Main page
// ════════════════════════════════════════════════════════════════════

const ApiKeysPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const hasAccess = deriveActiveAccess(user);

  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [showAllRevoked, setShowAllRevoked] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // Docs: scrollspy + collapsible endpoints.
  const activeSection = useScrollSpy(DOC_SECTION_IDS);
  const [openEndpoints, setOpenEndpoints] = useState(
    () => new Set([EP_LIST[0]._id]),
  );
  const toggleEndpoint = (id) =>
    setOpenEndpoints((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const navigateToEndpoint = (id) => {
    setOpenEndpoints((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    window.requestAnimationFrame(() => scrollToId(id));
  };

  const activeCount = keys.filter((k) => k.is_active).length;
  const atLimit = activeCount >= KEY_CAP;

  const activeKeys = keys.filter((k) => k.is_active);
  const revokedKeys = keys
    .filter((k) => !k.is_active)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  const visibleRevoked = showAllRevoked
    ? revokedKeys
    : revokedKeys.slice(0, MAX_REVOKED_VISIBLE);
  const displayedKeys = [...activeKeys, ...visibleRevoked];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiKeysApi.list();
      setKeys(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.response?.data?.detail || t("apiKeys.err_load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (creating || atLimit) return;
    setCreating(true);
    setError(null);
    try {
      const created = await apiKeysApi.create(name.trim() || null);
      setJustCreated(created);
      setCopied(false);
      setName("");
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(e?.response?.data?.detail || t("apiKeys.err_create"));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!window.confirm(t("apiKeys.confirm_revoke"))) return;
    setRevokingId(id);
    setError(null);
    try {
      await apiKeysApi.revoke(id);
      if (justCreated && justCreated.id === id) setJustCreated(null);
      await load();
    } catch (e) {
      setError(e?.response?.data?.detail || t("apiKeys.err_revoke"));
    } finally {
      setRevokingId(null);
    }
  };

  const copyKey = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  const copyLabel = t("apiKeys.copy");
  const copiedLabel = t("apiKeys.copied");

  return (
    <div className="max-w-6xl mx-auto px-1 sm:px-2 lg:px-0 space-y-6">
      {/* ── Header ── */}
      <header>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1 h-3 rounded-full bg-gold-primary" />
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-gold-primary/80">
            {t("apiKeys.eyebrow")}
          </span>
        </div>
        <h1
          className="text-3xl sm:text-4xl text-white"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 600,
            letterSpacing: "-0.025em",
          }}
        >
          {t("apiKeys.title")}
        </h1>
        <p className="text-text-muted text-xs sm:text-sm mt-1.5 max-w-2xl">
          {t("apiKeys.subtitle")}
        </p>
      </header>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <StatCard
          label={t("apiKeys.stat_access", { defaultValue: "Access" })}
          value={accessLabel(user, t)}
          accent={hasAccess ? "text-emerald-400" : "text-text-secondary"}
          icon={ICON_ACCESS}
        />
        <StatCard
          label={t("apiKeys.stat_active", { defaultValue: "Active keys" })}
          value={`${activeCount} / ${KEY_CAP}`}
          accent={atLimit ? "text-amber-400" : "text-white"}
          icon={ICON_KEY}
        />
        <StatCard
          label={t("apiKeys.stat_rate", { defaultValue: "Rate limit" })}
          value={`${RATE_LIMIT}/min`}
          icon={ICON_BOLT}
        />
        <StatCard
          label={t("apiKeys.stat_endpoints", { defaultValue: "Endpoints" })}
          value={String(EP_LIST.length)}
          icon={ICON_CODE}
        />
      </div>

      {/* ── Non-subscriber upsell ── */}
      {!hasAccess && (
        <div
          className="rounded-2xl p-5 border border-gold-primary/20 relative overflow-hidden"
          style={{
            background:
              "linear-gradient(160deg, rgba(212,168,83,0.08), rgba(255,255,255,0.01))",
          }}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-gold-primary/10 border border-gold-primary/25">
              <svg
                className="w-5 h-5 text-gold-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold text-sm">
                {t("apiKeys.locked_title")}
              </h3>
              <p className="text-text-secondary text-[13px] mt-1">
                {t("apiKeys.locked_desc")}
              </p>
              <button
                onClick={() => navigate("/pricing")}
                className="mt-3 px-4 py-2 rounded-lg text-[13px] font-bold bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary hover:shadow-gold-glow transition-all"
              >
                {t("apiKeys.upgrade_cta")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl px-4 py-3 text-[13px] text-red-400 border border-red-500/25 bg-red-500/10">
          {error}
        </div>
      )}

      {/* ── Just-created key (once, full width) ── */}
      {justCreated && (
        <div
          className="rounded-2xl p-5 border border-gold-primary/40 relative overflow-hidden"
          style={{
            background:
              "linear-gradient(160deg, rgba(212,168,83,0.10), rgba(255,255,255,0.01))",
          }}
        >
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/60 to-transparent" />
          <div className="flex items-center gap-2 mb-2">
            <svg
              className="w-4 h-4 text-gold-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-white font-semibold text-sm">
              {t("apiKeys.created_title")}
            </h3>
          </div>
          <p className="text-amber-400/90 text-[12px] mb-3">
            ⚠ {t("apiKeys.created_warn")}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2.5 rounded-lg font-mono text-[12px] sm:text-[13px] text-gold-light bg-black/40 border border-white/10 break-all">
              {justCreated.key}
            </code>
            <button
              onClick={() => copyKey(justCreated.key)}
              className="px-3 py-2.5 rounded-lg text-[12px] font-semibold bg-gold-primary/15 text-gold-primary border border-gold-primary/30 hover:bg-gold-primary/25 transition-colors whitespace-nowrap"
            >
              {copied ? copiedLabel : copyLabel}
            </button>
          </div>
          <button
            onClick={() => setJustCreated(null)}
            className="mt-3 text-[12px] text-text-muted hover:text-text-secondary transition-colors"
          >
            {t("apiKeys.dismiss")}
          </button>
        </div>
      )}

      {/* ── Keys panel (Stripe-style table) ── */}
      <section className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/5">
          <div>
            <h2 className="text-[11px] font-mono uppercase tracking-[0.22em] text-gold-primary/70">
              {t("apiKeys.your_keys")}
            </h2>
            <p className="text-[11px] text-text-muted mt-0.5">
              {activeCount}/{KEY_CAP} {t("apiKeys.active")}
            </p>
          </div>
          {hasAccess && (
            <button
              onClick={() => setShowCreate((v) => !v)}
              className={`px-4 py-2 rounded-lg text-[13px] font-bold transition-all whitespace-nowrap ${
                showCreate
                  ? "text-text-secondary border border-white/10 hover:text-white hover:bg-white/[0.03]"
                  : "bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary hover:shadow-gold-glow"
              }`}
            >
              {showCreate
                ? t("apiKeys.cancel", { defaultValue: "Cancel" })
                : t("apiKeys.new_key", { defaultValue: "+ New key" })}
            </button>
          )}
        </div>

        {/* Inline create form */}
        {hasAccess && showCreate && (
          <div className="px-5 py-4 border-b border-white/5 bg-white/[0.01]">
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-text-muted mb-2">
              {t("apiKeys.create_title")}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder={t("apiKeys.name_placeholder")}
                maxLength={60}
                autoFocus
                className="flex-1 px-3 py-2.5 rounded-lg text-sm text-white bg-white/[0.03] border border-white/10 placeholder:text-text-muted/70 focus:outline-none focus:border-gold-primary/40 focus:ring-1 focus:ring-gold-primary/20 transition-colors"
              />
              <button
                onClick={handleCreate}
                disabled={creating || atLimit}
                className="px-5 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary hover:shadow-gold-glow transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {creating ? t("apiKeys.creating") : t("apiKeys.create_btn")}
              </button>
            </div>
            {atLimit && (
              <p className="text-amber-400/80 text-[11px] mt-2">
                {t("apiKeys.limit_warn")}
              </p>
            )}
          </div>
        )}

        {/* Table header (sm+) */}
        {!loading && keys.length > 0 && (
          <div
            className={`hidden ${KEY_GRID} px-5 py-2.5 text-[10px] font-mono uppercase tracking-wider text-text-muted bg-white/[0.01] border-b border-white/5`}
          >
            <span>{t("apiKeys.col_name", { defaultValue: "Name" })}</span>
            <span>{t("apiKeys.col_key", { defaultValue: "Key" })}</span>
            <span>
              {t("apiKeys.col_activity", { defaultValue: "Activity" })}
            </span>
            <span />
          </div>
        )}

        {/* Rows */}
        {loading ? (
          <div className="py-10 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-gold-primary/30 border-t-gold-primary animate-spin" />
          </div>
        ) : keys.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-text-muted text-sm">{t("apiKeys.empty")}</p>
          </div>
        ) : (
          <div>
            {displayedKeys.map((k) => (
              <KeyRow
                key={k.id}
                k={k}
                onRevoke={handleRevoke}
                revoking={revokingId === k.id}
                t={t}
              />
            ))}

            {revokedKeys.length > MAX_REVOKED_VISIBLE && (
              <div className="px-5 py-3 border-t border-white/[0.05]">
                <button
                  onClick={() => setShowAllRevoked((v) => !v)}
                  className="w-full py-2 rounded-lg text-[12px] font-medium text-text-muted hover:text-text-secondary border border-white/5 hover:border-white/10 bg-white/[0.01] hover:bg-white/[0.03] transition-colors"
                >
                  {showAllRevoked
                    ? t("apiKeys.show_less", { defaultValue: "Show less" })
                    : t("apiKeys.show_all_revoked", {
                        defaultValue: "Show all revoked ({{n}})",
                        n: revokedKeys.length,
                      })}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Quick start + Security (two cards) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Quick start */}
        <div className="rounded-2xl p-5 border border-white/5 bg-white/[0.02]">
          <SectionHead>{t("apiKeys.usage_title")}</SectionHead>
          <p className="text-text-secondary text-[13px] mb-3">
            {t("apiKeys.usage_desc")}
          </p>
          <CodeBlock
            code={EX_CURL}
            lang="bash"
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
          />
          <p className="text-[11px] text-text-muted mt-2 leading-relaxed">
            Base URL: <Mono>{PUBLIC_BASE}</Mono>
          </p>
          <p className="text-[11px] text-text-muted mt-3">
            {t("apiKeys.usage_note")}
          </p>
        </div>

        {/* Security & limits */}
        <div className="rounded-2xl p-5 border border-white/5 bg-white/[0.02]">
          <SectionHead>
            {t("apiKeys.security_title", { defaultValue: "Security & limits" })}
          </SectionHead>
          <ul className="space-y-2.5 text-[12px] text-text-secondary">
            <li className="flex items-start gap-2">
              <span className="text-gold-primary/70 mt-0.5">·</span>
              <span>
                {t("apiKeys.security_rate", {
                  defaultValue:
                    "Each account is capped at 60 requests/min — shared across all your keys.",
                })}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gold-primary/70 mt-0.5">·</span>
              <span>
                {t("apiKeys.security_cap", {
                  defaultValue: "Up to 2 active keys at a time.",
                })}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gold-primary/70 mt-0.5">·</span>
              <span>
                {t("apiKeys.security_share", {
                  defaultValue:
                    "Keys are personal. Sharing or reselling access may get them revoked.",
                })}
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          FULL API DOCUMENTATION (sticky-TOC + content)
          ══════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl p-5 sm:p-6 border border-white/5 bg-white/[0.02]">
        {/* Doc header */}
        <div className="pb-3 mb-4 border-b border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-3 rounded-full bg-gold-primary" />
            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-gold-primary/80">
              Reference
            </span>
          </div>
          <h2
            className="text-2xl text-white"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            API Documentation
          </h2>
          <p className="text-text-muted text-[13px] mt-1.5 leading-relaxed">
            Comprehensive documentation to integrate LuxQuant’s proprietary
            AI-powered trading algorithm and advanced quantitative market
            intelligence into your applications, trading bots, dashboards, and
            quantitative systems. Core endpoints deliver precise, real-time data
            with stable schemas, while our enriched analytics layers provide
            deep insights generated by our 24/7 market-scanning algorithm —
            engineered for seamless integration into professional trading
            infrastructure.
          </p>
        </div>

        {/* Mobile sticky chip nav */}
        <TocChips active={activeSection} onNavigate={scrollToId} />

        {/* Two-column: sticky TOC + content */}
        <div className="grid grid-cols-1 lg:grid-cols-[190px_minmax(0,1fr)] gap-6">
          {/* Sidebar TOC (desktop) */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <TocSidebar
                active={activeSection}
                onNavigate={scrollToId}
                onEndpointNav={navigateToEndpoint}
              />
            </div>
          </aside>

          {/* Content */}
          <div className="min-w-0 space-y-7">
            {/* Authentication */}
            <DocSection id="doc-auth" title="Authentication">
              <p>Every request must carry your API key. Preferred header:</p>
              <CodeBlock
                code={`Authorization: Bearer lq_live_YOUR_KEY`}
                lang="http"
                copyLabel={copyLabel}
                copiedLabel={copiedLabel}
              />
              <p>
                Alternatively you may send it as{" "}
                <Mono>X-API-Key: lq_live_YOUR_KEY</Mono>. The key is shown only
                once at creation — store it like a password. If it leaks, revoke
                it from this page and generate a new one.
              </p>
              <p className="text-text-muted text-[12px]">
                Access requires an active subscription. If your subscription
                lapses, the key stops working automatically until it is renewed.
              </p>
            </DocSection>

            {/* Base URL */}
            <DocSection id="doc-base" title="Base URL">
              <CodeBlock
                code={PUBLIC_BASE}
                lang="text"
                copyLabel={copyLabel}
                copiedLabel={copiedLabel}
              />
              <p>
                All endpoints below are relative to this base. All responses are
                JSON (except <Mono>/export/prompt</Mono>, which is plain text).
              </p>
            </DocSection>

            {/* Rate limits */}
            <DocSection id="doc-rate" title="Rate limits">
              <p>
                Requests are limited to{" "}
                <Mono>{RATE_LIMIT}/min per account</Mono> (a sliding 60-second
                window), shared across all of your keys. Each response includes:
              </p>
              <ul className="list-none space-y-1 pl-1">
                <li>
                  · <Mono>X-RateLimit-Limit</Mono> — your per-minute ceiling.
                </li>
                <li>
                  · <Mono>X-RateLimit-Remaining</Mono> — requests left in the
                  current window.
                </li>
              </ul>
              <p>
                When the limit is exceeded you get HTTP <Mono>429</Mono> with a{" "}
                <Mono>Retry-After</Mono> header. Polling every 10–15 seconds
                keeps you comfortably within the limit.
              </p>
            </DocSection>

            {/* Response format & pagination */}
            <DocSection
              id="doc-format"
              title="Response format & forward pagination"
            >
              <p>
                List endpoints return an envelope:{" "}
                <Mono>{`{ items: [...], count: N, cursor: "..." }`}</Mono>.
              </p>
              <p>
                To follow new data over time, save <Mono>cursor</Mono> from each
                response and pass it back as the <Mono>since</Mono> parameter on
                the next call. With <Mono>since</Mono>, results come
                oldest-first so nothing is skipped; without it, you get the
                newest items first.
              </p>
              <p className="text-text-muted text-[12px]">
                Timestamps are ISO-8601 (e.g.{" "}
                <Mono>2026-06-06T05:12:00+00:00</Mono>). Only advance your
                stored cursor when a response actually returns data.
              </p>
            </DocSection>

            {/* Status codes */}
            <DocSection id="doc-codes" title="Status & error codes">
              <ul className="list-none space-y-1.5">
                <li>
                  <span className="text-emerald-400 font-mono text-[12px]">
                    200
                  </span>{" "}
                  — OK. Body contains the requested data.
                </li>
                <li>
                  <span className="text-amber-400 font-mono text-[12px]">
                    400
                  </span>{" "}
                  — Bad request, e.g. an invalid <Mono>status</Mono> value. The
                  body lists what's valid.
                </li>
                <li>
                  <span className="text-red-400 font-mono text-[12px]">
                    401
                  </span>{" "}
                  — Missing / invalid / revoked key.
                </li>
                <li>
                  <span className="text-red-400 font-mono text-[12px]">
                    403
                  </span>{" "}
                  — Key valid but subscription inactive.
                </li>
                <li>
                  <span className="text-red-400 font-mono text-[12px]">
                    404
                  </span>{" "}
                  — Resource not found (or outside the public data window).
                </li>
                <li>
                  <span className="text-amber-400 font-mono text-[12px]">
                    429
                  </span>{" "}
                  — Rate limit exceeded; see <Mono>Retry-After</Mono>.
                </li>
              </ul>
              <p className="text-text-muted text-[12px]">
                Errors share the shape <Mono>{`{ "detail": "message" }`}</Mono>.
              </p>
            </DocSection>

            {/* signal_id clarification */}
            <DocSection id="doc-ids" title="Working with signal_id">
              <p>
                Endpoints written as <Mono>{`/journey/{id}`}</Mono>,{" "}
                <Mono>{`/enrichment/{id}`}</Mono>, and{" "}
                <Mono>{`/btc-correlation/{id}`}</Mono> expect a{" "}
                <Mono>signal_id</Mono> — <span className="text-white">not</span>{" "}
                a pair name like <Mono>BTCUSDT</Mono>.
              </p>
              <p>The flow is always:</p>
              <ol className="list-decimal pl-5 space-y-1 text-[12px]">
                <li>
                  Call <Mono>/signals</Mono>.
                </li>
                <li>
                  Take <Mono>signal_id</Mono> from any item in the response (a
                  UUID like <Mono>cbc5315b-3910-…</Mono>).
                </li>
                <li>
                  Use that value in the <Mono>{`{id}`}</Mono> endpoints.
                </li>
              </ol>
            </DocSection>

            {/* Endpoints */}
            <DocSection id="doc-endpoints" title="Endpoints">
              <p className="text-text-muted text-[12px] -mt-1">
                Tap a card to expand parameters, response fields, and an
                example. Signals endpoints have exact schemas; analytics
                endpoints show exact field names with illustrative values.
              </p>
              <div className="space-y-3 not-prose">
                {EP_LIST.map((ep) => (
                  <EndpointCard
                    key={ep._id}
                    ep={ep}
                    open={openEndpoints.has(ep._id)}
                    onToggle={() => toggleEndpoint(ep._id)}
                    copyLabel={copyLabel}
                    copiedLabel={copiedLabel}
                  />
                ))}
              </div>
            </DocSection>

            {/* Status values */}
            <DocSection id="doc-status" title="Signal status values">
              <p>
                The <Mono>status</Mono> field on a signal — and the values
                accepted by <Mono>?status=</Mono> on <Mono>/signals</Mono>:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <tbody>
                    {STATUS_VALUES.map(([val, desc]) => (
                      <tr
                        key={val}
                        className="border-t border-white/[0.05] align-top"
                      >
                        <td className="py-2 pr-4">
                          <code className="font-mono text-[11px] text-gold-primary/90 whitespace-nowrap">
                            {val}
                          </code>
                        </td>
                        <td className="py-2 text-[12px] text-text-secondary">
                          {desc}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DocSection>

            {/* Code examples */}
            <DocSection id="doc-examples" title="Code examples">
              <p className="text-text-muted text-[12px]">
                Same task in three languages — list open signals, then drill
                into one. Switch tabs to copy your preferred language.
              </p>
              <CodeTabs
                tabs={[
                  { label: "curl", code: EX_CURL },
                  { label: "python", code: EX_PYTHON },
                  { label: "javascript", code: EX_JS },
                ]}
                copyLabel={copyLabel}
                copiedLabel={copiedLabel}
              />
              <p className="text-text-muted text-[12px] mt-1">
                The JavaScript sample shows the recommended pattern: poll{" "}
                <Mono>/signals/updates</Mono> with a cursor on a 15s interval
                rather than re-fetching everything.
              </p>
            </DocSection>

            {/* Best practices */}
            <DocSection id="doc-best" title="Best practices & FAQ">
              <ul className="list-none space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-gold-primary/60 mt-0.5">·</span>
                  <span>
                    <span className="text-white">Poll, don't hammer.</span>{" "}
                    10–15s intervals are plenty and stay within the 60/min
                    limit.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gold-primary/60 mt-0.5">·</span>
                  <span>
                    <span className="text-white">Use the cursor.</span>{" "}
                    Re-fetching everything wastes your rate budget;{" "}
                    <Mono>since</Mono> only returns what's new.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gold-primary/60 mt-0.5">·</span>
                  <span>
                    <span className="text-white">
                      Handle "not ready" states.
                    </span>{" "}
                    Analytics endpoints can return{" "}
                    <Mono>{`{ available: false }`}</Mono> /{" "}
                    <Mono>{`{ status: "not_enriched" }`}</Mono> for very new
                    signals — treat that as a normal, non-error response.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gold-primary/60 mt-0.5">·</span>
                  <span>
                    <span className="text-white">
                      Keep the key server-side.
                    </span>{" "}
                    Don't embed it in a browser/client app where others can read
                    it.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gold-primary/60 mt-0.5">·</span>
                  <span>
                    <span className="text-white">One identity per key.</span>{" "}
                    Sharing or reselling access can get the key flagged and
                    revoked.
                  </span>
                </li>
              </ul>
            </DocSection>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeysPage;
