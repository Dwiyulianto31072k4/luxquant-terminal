import { useEffect, useState } from "react";

/**
 * CoinCategoryBadge — compact chip displaying coin type & utility status.
 *
 * Place at:
 *   /Users/dwiyulianto/Downloads/luxquant-fullstack/frontend-react/src/components/CoinCategoryBadge.jsx
 *
 * Usage in SignalModal header:
 *   <CoinCategoryBadge pair={signal?.pair} onClick={() => setShowCoinDetail(true)} />
 *
 * Renders: [🏗️ L1] [✓ Has Utility]   or   [🐶 Meme] [⚠️ No Utility]
 *
 * Fetches /api/v1/coins/{pair} once, caches in module-level Map.
 */

// Module-level cache to avoid refetching when modal reopens for same pair
const coinCache = new Map();

const TOKEN_TYPE_META = {
  layer1:     { icon: "🏗️", label: "L1",        color: "blue" },
  layer2:     { icon: "🚀", label: "L2",        color: "blue" },
  utility:    { icon: "🔧", label: "Utility",   color: "cyan" },
  defi:       { icon: "💱", label: "DeFi",      color: "purple" },
  governance: { icon: "🗳️", label: "Gov",       color: "purple" },
  rwa:        { icon: "🏦", label: "RWA",       color: "amber" },
  stablecoin: { icon: "💵", label: "Stable",    color: "emerald" },
  exchange:   { icon: "🏢", label: "Exchange",  color: "yellow" },
  privacy:    { icon: "🔒", label: "Privacy",   color: "gray" },
  memecoin:   { icon: "🐶", label: "Meme",      color: "pink" },
};

const COLOR_CLASSES = {
  blue:    "bg-blue-500/15 text-blue-300 border-blue-500/30",
  cyan:    "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  purple:  "bg-purple-500/15 text-purple-300 border-purple-500/30",
  amber:   "bg-amber-500/15 text-amber-300 border-amber-500/30",
  emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  yellow:  "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  gray:    "bg-gray-500/15 text-gray-300 border-gray-500/30",
  pink:    "bg-pink-500/15 text-pink-300 border-pink-500/30",
};

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
    icon: "❓",
    label: coinData.token_type || "Unknown",
    color: "gray",
  };

  const typeColorClass = COLOR_CLASSES[meta.color] || COLOR_CLASSES.gray;

  // Utility indicator
  const utilityChip =
    coinData.has_utility === true
      ? {
          icon: "✓",
          label: compact ? "Util" : "Has Utility",
          class: "bg-green-500/15 text-green-300 border-green-500/30",
        }
      : coinData.has_utility === false
        ? {
            icon: "⚠",
            label: compact ? "Spec" : "No Utility",
            class: "bg-orange-500/15 text-orange-300 border-orange-500/30",
          }
        : null;

  return (
    <div
      className="flex items-center gap-1 sm:gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) onClick(coinData);
      }}
      title="Click for details"
    >
      {/* Token type chip */}
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] sm:text-[10px] font-bold tracking-wide ${typeColorClass}`}
      >
        <span className="text-[10px]">{meta.icon}</span>
        <span>{meta.label}</span>
      </span>

      {/* Utility chip */}
      {utilityChip && (
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] sm:text-[10px] font-bold ${utilityChip.class}`}
        >
          <span>{utilityChip.icon}</span>
          {!compact && <span>{utilityChip.label}</span>}
        </span>
      )}
    </div>
  );
};

export default CoinCategoryBadge;
