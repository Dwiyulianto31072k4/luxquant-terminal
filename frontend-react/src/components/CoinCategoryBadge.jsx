import { useEffect, useState } from "react";

/**
 * CoinCategoryBadge v2 — Inline pill + tagline format
 *
 * Place at:
 *   /Users/dwiyulianto/Downloads/luxquant-fullstack/frontend-react/src/components/CoinCategoryBadge.jsx
 *
 * Usage in SignalModal header:
 *   <CoinCategoryBadge pair={signal?.pair} onClick={() => setShowCoinUtility(true)} />
 *
 * Renders (full mode):
 *   ✓ Utility · Infrastructure  Decentralized oracle network →
 *   ⚠ Meme · Hype-driven  Click for risks →
 *
 * Renders (compact mode — fallback for tight spaces):
 *   [✓ Utility]
 *
 * Fetches /api/v1/coins/{pair} once, caches in module-level Map.
 */

// Module-level cache to avoid refetching when modal reopens for same pair
const coinCache = new Map();

// ───────────────────────────────────────────────────────────────
// META: token type → label, sector → label, default tagline
// ───────────────────────────────────────────────────────────────

const TOKEN_TYPE_META = {
  layer1:     { label: "Layer 1",     status: "utility", defaultTag: "Blockchain infrastructure" },
  layer2:     { label: "Layer 2",     status: "utility", defaultTag: "Scaling solution" },
  utility:    { label: "Utility",     status: "utility", defaultTag: "Real utility token" },
  defi:       { label: "DeFi",        status: "utility", defaultTag: "Decentralized finance protocol" },
  governance: { label: "Governance",  status: "utility", defaultTag: "Protocol governance token" },
  rwa:        { label: "RWA",         status: "utility", defaultTag: "Real-world asset backed" },
  stablecoin: { label: "Stablecoin",  status: "utility", defaultTag: "Price-stable asset" },
  exchange:   { label: "Exchange",    status: "utility", defaultTag: "Exchange native token" },
  privacy:    { label: "Privacy",     status: "utility", defaultTag: "Privacy-focused crypto" },
  memecoin:   { label: "Meme",        status: "speculation", defaultTag: "Hype-driven, click for risks" },
};

const SECTOR_LABEL = {
  infrastructure: "Infrastructure",
  defi:           "DeFi",
  gamefi:         "GameFi",
  nft:            "NFT",
  metaverse:      "Metaverse",
  ai:             "AI",
  socialfi:       "SocialFi",
  payments:       "Payments",
  rwa:            "RWA",
  privacy:        "Privacy",
  hype:           "Hype-driven",
  other:          "Other",
};

// ───────────────────────────────────────────────────────────────
// HELPERS
// ───────────────────────────────────────────────────────────────

/**
 * Pick the best tagline from coin data.
 * Priority: top use_case → summary (truncated) → meta.defaultTag
 */
const buildTagline = (coinData, meta) => {
  // 1. Prefer first use case (most actionable, ~50 chars)
  const useCases = Array.isArray(coinData.use_cases) ? coinData.use_cases : [];
  if (useCases.length > 0 && typeof useCases[0] === "string") {
    return truncate(useCases[0], 60);
  }

  // 2. Fallback: summary truncated
  if (coinData.summary && typeof coinData.summary === "string") {
    return truncate(coinData.summary, 60);
  }

  // 3. Last resort: generic per token type
  return meta.defaultTag;
};

const truncate = (str, max) => {
  if (!str) return "";
  const s = String(str).trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
};

// ───────────────────────────────────────────────────────────────
// COMPONENT
// ───────────────────────────────────────────────────────────────

const CoinCategoryBadge = ({ pair, onClick, compact = false }) => {
  const [coinData, setCoinData] = useState(() => coinCache.get(pair) || null);
  const [loading, setLoading] = useState(!coinCache.has(pair));

  useEffect(() => {
    if (!pair) return;

    if (coinCache.has(pair)) {
      setCoinData(coinCache.get(pair));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/v1/coins/${pair}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && data.is_categorized) {
          coinCache.set(pair, data);
          setCoinData(data);
        } else {
          coinCache.set(pair, null);
          setCoinData(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[CoinCategoryBadge] fetch failed:", err);
          setCoinData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pair]);

  // While loading or no data → render nothing (avoid layout flash)
  if (loading || !coinData) return null;

  const meta = TOKEN_TYPE_META[coinData.token_type] || {
    label: coinData.token_type || "Unknown",
    status: "unknown",
    defaultTag: "Click for details",
  };

  const sectorLabel =
    SECTOR_LABEL[coinData.sector] ||
    (coinData.sector
      ? coinData.sector.charAt(0).toUpperCase() + coinData.sector.slice(1)
      : null);

  // Determine status (utility vs speculation)
  const isSpeculation =
    coinData.has_utility === false || meta.status === "speculation";

  const tagline = buildTagline(coinData, meta);

  // ─────────────────────────────────────────────────────────────
  // COMPACT MODE — single pill (used in tight spaces, e.g. signal cards)
  // ─────────────────────────────────────────────────────────────
  if (compact) {
    const compactClass = isSpeculation
      ? "bg-orange-500/15 text-orange-300 border-orange-500/30"
      : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";

    return (
      <span
        onClick={(e) => {
          e.stopPropagation();
          if (onClick) onClick(coinData);
        }}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] sm:text-[10px] font-bold tracking-wide cursor-pointer hover:opacity-80 transition-opacity ${compactClass}`}
        title={tagline}
      >
        <span>{isSpeculation ? "⚠" : "✓"}</span>
        <span>{meta.label}</span>
      </span>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // FULL MODE — inline pill + tagline (for signal modal header)
  // ─────────────────────────────────────────────────────────────

  // Status pill: green for utility, amber for speculation
  const statusPillClass = isSpeculation
    ? "bg-orange-500/15 text-orange-300 border-orange-500/30"
    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";

  const statusIcon = isSpeculation ? "⚠" : "✓";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) onClick(coinData);
      }}
      className="group flex items-center gap-1.5 sm:gap-2 max-w-full text-left rounded-md hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors px-1 -mx-1 py-0.5"
      title="Click for full categorization details"
    >
      {/* Status + Type pill (e.g., "✓ Utility" or "⚠ Meme") */}
      <span
        className={`flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] sm:text-[10px] font-bold tracking-wide ${statusPillClass}`}
      >
        <span>{statusIcon}</span>
        <span>{meta.label}</span>
      </span>

      {/* Sector chip (subtle, secondary) */}
      {sectorLabel && (
        <span className="flex-shrink-0 hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] sm:text-[10px] font-medium bg-white/[0.04] text-white/60 border-white/10">
          {sectorLabel}
        </span>
      )}

      {/* Tagline (truncated, hidden on very narrow screens) */}
      <span className="hidden md:inline text-[10px] sm:text-[11px] text-text-muted truncate min-w-0">
        {tagline}
      </span>

      {/* Arrow hint */}
      <span className="flex-shrink-0 text-[11px] text-gold-primary/60 group-hover:text-gold-primary group-hover:translate-x-0.5 transition-all">
        →
      </span>
    </button>
  );
};

export default CoinCategoryBadge;
