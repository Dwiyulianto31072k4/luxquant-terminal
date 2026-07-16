// src/components/CoinUtilityModal.jsx
// ════════════════════════════════════════════════════════════════
// CoinUtilityModal — refactor ke <Modal> primitive.
// Shell standar dari Modal. Emoji diganti ikon SVG bersih (badge
// solid). Palet premium: gold dominan + neutral; warna lain hanya
// untuk makna (Has/No Utility, Risk). Logika data tidak diubah.
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Modal from "./ui/Modal";
import { Z } from "../constants/zIndex";
import CoinLogo from "./CoinLogo";

// ── Ikon SVG ─────────────────────────────────────────────────────
function Icon({ d, className = "h-3.5 w-3.5" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}
const IC = {
  layers: <><path d="M12 3 2 8l10 5 10-5-10-5z" /><path d="M2 12l10 5 10-5" /><path d="M2 16l10 5 10-5" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  tool: <><path d="M3 21l5-5" /><path d="M14 4a4 4 0 0 0 5 5l-9 9-5-5 9-9z" /></>,
  swap: <><path d="M7 7h11l-3-3" /><path d="M17 17H6l3 3" /></>,
  vote: <><path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></>,
  bank: <><path d="M3 21h18" /><path d="M5 21V10l7-5 7 5v11" /><path d="M9 21v-6h6v6" /></>,
  dollar: <><path d="M12 3v18" /><path d="M16 7.5C16 6 14.5 5 12 5S8 6 8 7.5 9.5 10 12 10s4 1 4 2.5S14.5 15 12 15s-4-1-4-2.5" /></>,
  store: <><path d="M4 9h16l-1-4H5L4 9z" /><path d="M5 9v10h14V9" /><path d="M9 19v-5h6v5" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M8 14s1.5 2 4 2 4-2 4-2" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 3.5" /><path d="M12 17h.01" /></>,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 0 0-4-10z" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  alert: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" /></>,
  check: <path d="M5 12l5 5L20 7" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
};

const TYPE_META = {
  layer1:     { d: IC.layers, label: "Layer 1" },
  layer2:     { d: IC.bolt,   label: "Layer 2" },
  utility:    { d: IC.tool,   label: "Utility Token" },
  defi:       { d: IC.swap,   label: "DeFi" },
  governance: { d: IC.vote,   label: "Governance" },
  rwa:        { d: IC.bank,   label: "Real World Asset" },
  stablecoin: { d: IC.dollar, label: "Stablecoin" },
  exchange:   { d: IC.store,  label: "Exchange Token" },
  privacy:    { d: IC.lock,   label: "Privacy" },
  memecoin:   { d: IC.smile,  label: "Memecoin" },
};

// Badge ikon solid (tinted + ring)
function IconBadge({ d, color = "#d4a853", size = 22 }) {
  return (
    <span
      className="flex flex-shrink-0 items-center justify-center rounded-md"
      style={{ width: size, height: size, background: `${color}1f`, color, boxShadow: `inset 0 0 0 1px ${color}40` }}
    >
      <Icon d={d} className="h-3.5 w-3.5" />
    </span>
  );
}

function SectionHead({ d, color = "#d4a853", children }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider sm:text-xs" style={{ color }}>
      <IconBadge d={d} color={color} size={20} />
      <span>{children}</span>
    </h3>
  );
}

const CoinUtilityModal = ({ pair, isOpen, onClose, prefetchedData, zIndex = Z.nestedModal }) => {
  const [coinData, setCoinData] = useState(prefetchedData || null);
  const [loading, setLoading] = useState(!prefetchedData);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !pair) return;
    if (prefetchedData) {
      setCoinData(prefetchedData);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/coins/${pair}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { if (!cancelled) setCoinData(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, pair, prefetchedData]);

  const meta = coinData
    ? TYPE_META[coinData.token_type] || { d: IC.help, label: coinData.token_type || "Unknown" }
    : null;

  const header = (
    <div className="flex min-w-0 items-center gap-2.5">
      <CoinLogo pair={pair} size={30} />
      <div className="min-w-0">
        <h2 className="truncate text-sm font-bold text-text-primary sm:text-base">
          {coinData?.base_symbol || pair}
          {coinData?.coingecko_id && (
            <span className="ml-2 text-[10px] font-normal text-text-muted">({coinData.coingecko_id})</span>
          )}
        </h2>
        <p className="truncate text-[10px] text-text-muted">
          {pair}
          {coinData?.market_cap_rank && (
            <span className="ml-2 text-gold-primary/70">Rank #{coinData.market_cap_rank}</span>
          )}
        </p>
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" padded={false} header={header} zIndex={zIndex}>
      <div className="px-3 py-4 sm:px-5 sm:py-5">
        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-24 rounded-xl bg-gold-primary/5" />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="h-28 rounded-xl bg-white/5" />
              <div className="h-28 rounded-xl bg-white/5" />
            </div>
            <div className="h-20 rounded-xl bg-white/5" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-center">
            <p className="text-sm text-rose-400">Failed to load: {error}</p>
          </div>
        )}

        {coinData && !coinData.is_categorized && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-line/25 bg-gold-primary/5 p-6 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gold-primary/10 text-gold-primary ring-1 ring-gold-primary/25">
              <Icon d={IC.clock} className="h-5 w-5" />
            </span>
            <p className="mb-1 text-sm font-semibold text-text-primary">Categorization pending</p>
            <p className="text-xs text-text-muted">This coin is queued for categorization. Check back soon.</p>
          </div>
        )}

        {coinData && coinData.is_categorized && (
          <div className="space-y-3 sm:space-y-4">
            {/* HERO */}
            <div className="space-y-3 rounded-xl border border-line/30 bg-gradient-to-br from-gold-primary/15 to-gold-primary/5 p-3 sm:p-4">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-line/30 bg-gold-primary/10 px-2.5 py-1 text-xs font-bold text-gold-primary">
                  <Icon d={meta.d} className="h-3.5 w-3.5" />
                  <span>{meta.label}</span>
                </span>
                {coinData.sector && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold capitalize text-text-primary/80">
                    {coinData.sector}
                  </span>
                )}
                {coinData.has_utility === true && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300">
                    <Icon d={IC.check} className="h-3 w-3" />
                    <span>Has Utility</span>
                  </span>
                )}
                {coinData.has_utility === false && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-300">
                    <Icon d={IC.alert} className="h-3 w-3" />
                    <span>No Utility</span>
                  </span>
                )}
              </div>
              {coinData.summary && (
                <p className="text-xs leading-relaxed text-text-primary/85 sm:text-sm">{coinData.summary}</p>
              )}
            </div>

            {/* Use Cases + Key Features */}
            {((coinData.use_cases && coinData.use_cases.length > 0) ||
              (coinData.key_features && coinData.key_features.length > 0)) && (
              <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
                {coinData.use_cases && coinData.use_cases.length > 0 && (
                  <div className="h-full rounded-xl border border-line/15 bg-surface-raised p-3 sm:p-4">
                    <SectionHead d={IC.bulb}>Use Cases</SectionHead>
                    <ul className="space-y-1.5">
                      {coinData.use_cases.map((uc, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-text-secondary sm:text-sm">
                          <span className="mt-0.5 text-gold-primary/60">•</span>
                          <span>{uc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {coinData.key_features && coinData.key_features.length > 0 && (
                  <div className="h-full rounded-xl border border-line/15 bg-surface-raised p-3 sm:p-4">
                    <SectionHead d={IC.gear}>Key Features</SectionHead>
                    <ul className="space-y-1.5">
                      {coinData.key_features.map((kf, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-text-secondary sm:text-sm">
                          <span className="mt-0.5 text-gold-primary/60">▸</span>
                          <span>{kf}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Utility Breakdown */}
            {coinData.utility_details && Object.keys(coinData.utility_details).length > 0 && (
              <div className="rounded-xl border border-line/15 bg-surface-raised p-3 sm:p-4">
                <SectionHead d={IC.tool}>Utility Breakdown</SectionHead>
                <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                  {Object.entries(coinData.utility_details).map(([key, value]) => (
                    <div key={key} className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gold-primary/80 sm:text-xs">
                        {key.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-text-secondary sm:text-sm">
                        {typeof value === "string" ? value : JSON.stringify(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk Notes */}
            {coinData.risk_notes && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 sm:p-4">
                <SectionHead d={IC.alert} color="#e0a82e">Risk Notes</SectionHead>
                <p className="text-xs leading-relaxed text-amber-200/90 sm:text-sm">{coinData.risk_notes}</p>
              </div>
            )}

            {/* Footer: source + website */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[9px] text-text-muted sm:text-[10px]">
                Source: <span className="font-mono">{coinData.metadata_source || "—"}</span>
              </span>
              {coinData.website && (
                <a
                  href={coinData.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[10px] text-gold-primary/80 transition-colors hover:text-gold-primary sm:text-xs"
                >
                  <Icon d={IC.globe} className="h-3.5 w-3.5" />
                  {new URL(coinData.website).hostname}
                </a>
              )}
            </div>

            {/* Disclaimer */}
            <div className="flex items-start gap-2 rounded-lg border border-white/5 bg-surface-raised p-3">
              <span className="mt-px text-gold-primary/60"><Icon d={IC.bulb} className="h-3.5 w-3.5" /></span>
              <p className="text-[9px] leading-relaxed text-text-muted sm:text-[10px]">
                This categorization is for educational purposes only and is automatically generated. Each user should make their own decisions based on personal values, risk tolerance, and applicable regulations. Categorization is not financial, legal, or religious advice.
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default CoinUtilityModal;
