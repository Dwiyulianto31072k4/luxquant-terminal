import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * CoinUtilityModal — full detail modal for coin categorization.
 *
 * Place at:
 *   /Users/dwiyulianto/Downloads/luxquant-fullstack/frontend-react/src/components/CoinUtilityModal.jsx
 *
 * Usage:
 *   <CoinUtilityModal pair={signal.pair} isOpen={showCoinDetail} onClose={() => setShowCoinDetail(false)} />
 *
 * Style matches SignalModal (gold theme, dark bg, mobile-friendly).
 */

const TOKEN_TYPE_META = {
  layer1:     { icon: "🏗️", label: "Layer 1",        color: "blue" },
  layer2:     { icon: "🚀", label: "Layer 2",        color: "blue" },
  utility:    { icon: "🔧", label: "Utility Token",  color: "cyan" },
  defi:       { icon: "💱", label: "DeFi",           color: "purple" },
  governance: { icon: "🗳️", label: "Governance",     color: "purple" },
  rwa:        { icon: "🏦", label: "Real World Asset", color: "amber" },
  stablecoin: { icon: "💵", label: "Stablecoin",     color: "emerald" },
  exchange:   { icon: "🏢", label: "Exchange Token", color: "yellow" },
  privacy:    { icon: "🔒", label: "Privacy",        color: "gray" },
  memecoin:   { icon: "🐶", label: "Memecoin",       color: "pink" },
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

const CoinUtilityModal = ({ pair, isOpen, onClose, prefetchedData }) => {
  const [coinData, setCoinData] = useState(prefetchedData || null);
  const [loading, setLoading] = useState(!prefetchedData);
  const [error, setError] = useState(null);
  const [isClosing, setIsClosing] = useState(false);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Fetch when opened (unless prefetched data provided)
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
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setCoinData(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, pair, prefetchedData]);

  // ESC key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) handleClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  if (!isOpen) return null;

  const meta = coinData
    ? TOKEN_TYPE_META[coinData.token_type] || {
        icon: "❓",
        label: coinData.token_type || "Unknown",
        color: "gray",
      }
    : null;

  const typeColorClass = meta ? COLOR_CLASSES[meta.color] : "";

  const modalContent = (
    <div
      className={`coin-modal-overlay ${isClosing ? "coin-modal-closing" : ""}`}
    >
      <div className="coin-modal-backdrop" onClick={handleClose} />
      <div className="coin-modal-container">
        <div className="coin-modal-content">
          {/* Drag handle (mobile) */}
          <div className="sm:hidden flex-shrink-0 flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          {/* HEADER */}
          <div className="flex-shrink-0 bg-[#0a0a0a] border-b border-gold-primary/30 px-4 py-3 z-10">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-2xl">{meta?.icon || "🪙"}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-white font-display text-base font-semibold truncate">
                    {coinData?.base_symbol || pair}
                    {coinData?.coingecko_id && (
                      <span className="ml-2 text-text-muted text-[10px] font-normal">
                        ({coinData.coingecko_id})
                      </span>
                    )}
                  </h2>
                  <p className="text-text-muted text-[10px] truncate">
                    {pair}
                    {coinData?.market_cap_rank && (
                      <span className="ml-2 text-gold-primary/70">
                        Rank #{coinData.market_cap_rank}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-white bg-[#0a0a0a] hover:bg-red-500/20 border border-gold-primary/20 hover:border-red-500/50 rounded-lg transition-all flex-shrink-0"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* BODY */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 sm:px-6 sm:py-5 bg-[#0a0a0a]">
            {loading && (
              <div className="space-y-3 animate-pulse">
                <div className="h-8 bg-white/5 rounded w-1/2" />
                <div className="h-20 bg-white/5 rounded" />
                <div className="h-32 bg-white/5 rounded" />
                <div className="h-32 bg-white/5 rounded" />
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
                <p className="text-red-400 text-sm">Failed to load: {error}</p>
              </div>
            )}

            {coinData && !coinData.is_categorized && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-center">
                <p className="text-yellow-400 text-sm font-semibold mb-1">
                  ⏳ Categorization pending
                </p>
                <p className="text-text-muted text-xs">
                  This coin is queued for categorization. Check back soon.
                </p>
              </div>
            )}

            {coinData && coinData.is_categorized && (
              <div className="space-y-4 sm:space-y-5">
                {/* Type & Sector chips */}
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${typeColorClass}`}
                  >
                    <span>{meta.icon}</span>
                    <span>{meta.label}</span>
                  </span>
                  {coinData.sector && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold bg-white/5 text-white/80 border-white/10 capitalize">
                      {coinData.sector}
                    </span>
                  )}
                  {coinData.has_utility === true && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold bg-green-500/15 text-green-300 border-green-500/30">
                      <span>✓</span>
                      <span>Has Utility</span>
                    </span>
                  )}
                  {coinData.has_utility === false && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold bg-orange-500/15 text-orange-300 border-orange-500/30">
                      <span>⚠️</span>
                      <span>No Utility</span>
                    </span>
                  )}
                </div>

                {/* Summary */}
                {coinData.summary && (
                  <div className="bg-[#111] rounded-xl p-3 sm:p-4 border border-gold-primary/15">
                    <h3 className="text-gold-primary text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                      <span>📝</span>
                      <span>Summary</span>
                    </h3>
                    <p className="text-text-secondary text-xs sm:text-sm leading-relaxed">
                      {coinData.summary}
                    </p>
                  </div>
                )}

                {/* Use Cases */}
                {coinData.use_cases && coinData.use_cases.length > 0 && (
                  <div className="bg-[#111] rounded-xl p-3 sm:p-4 border border-gold-primary/15">
                    <h3 className="text-gold-primary text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                      <span>💡</span>
                      <span>Use Cases</span>
                    </h3>
                    <ul className="space-y-1.5">
                      {coinData.use_cases.map((uc, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-xs sm:text-sm text-text-secondary"
                        >
                          <span className="text-gold-primary/60 mt-0.5">•</span>
                          <span>{uc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Key Features */}
                {coinData.key_features && coinData.key_features.length > 0 && (
                  <div className="bg-[#111] rounded-xl p-3 sm:p-4 border border-gold-primary/15">
                    <h3 className="text-gold-primary text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                      <span>⚙️</span>
                      <span>Key Features</span>
                    </h3>
                    <ul className="space-y-1.5">
                      {coinData.key_features.map((kf, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-xs sm:text-sm text-text-secondary"
                        >
                          <span className="text-blue-400/70 mt-0.5">▸</span>
                          <span>{kf}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Utility Details (object → key/value) */}
                {coinData.utility_details &&
                  Object.keys(coinData.utility_details).length > 0 && (
                    <div className="bg-[#111] rounded-xl p-3 sm:p-4 border border-gold-primary/15">
                      <h3 className="text-gold-primary text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                        <span>🔧</span>
                        <span>Utility Breakdown</span>
                      </h3>
                      <div className="space-y-2">
                        {Object.entries(coinData.utility_details).map(
                          ([key, value]) => (
                            <div key={key} className="flex flex-col gap-0.5">
                              <span className="text-cyan-300 text-[10px] sm:text-xs font-semibold uppercase tracking-wider">
                                {key.replace(/_/g, " ")}
                              </span>
                              <span className="text-text-secondary text-xs sm:text-sm">
                                {typeof value === "string"
                                  ? value
                                  : JSON.stringify(value)}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                {/* Risk Notes */}
                {coinData.risk_notes && (
                  <div className="bg-orange-500/5 rounded-xl p-3 sm:p-4 border border-orange-500/25">
                    <h3 className="text-orange-300 text-[10px] sm:text-xs uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                      <span>⚠️</span>
                      <span>Risk Notes</span>
                    </h3>
                    <p className="text-orange-200/90 text-xs sm:text-sm leading-relaxed">
                      {coinData.risk_notes}
                    </p>
                  </div>
                )}

                {/* Footer: Source + Website */}
                <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-white/5">
                  <span className="text-[9px] sm:text-[10px] text-text-muted">
                    Source:{" "}
                    <span className="font-mono">
                      {coinData.metadata_source || "—"}
                    </span>
                  </span>
                  {coinData.website && (
                    <a
                      href={coinData.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] sm:text-xs text-gold-primary/80 hover:text-gold-primary flex items-center gap-1"
                    >
                      🌐 {new URL(coinData.website).hostname}
                    </a>
                  )}
                </div>

                {/* Disclaimer */}
                <div className="bg-[#0d0d0d] rounded-lg p-3 border border-white/5">
                  <p className="text-[9px] sm:text-[10px] text-text-muted leading-relaxed">
                    💡 This categorization is for educational purposes only and
                    is automatically generated. Each user should make their own
                    decisions based on personal values, risk tolerance, and
                    applicable regulations. Categorization is not financial,
                    legal, or religious advice.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* STYLES */}
      <style>{`
        .coin-modal-overlay { position: fixed; inset: 0; z-index: 150000; display: flex; align-items: center; justify-content: center; isolation: isolate; }
        .coin-modal-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.85); }
        .coin-modal-container { position: relative; z-index: 1; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 0; }
        .coin-modal-content { position: relative; width: 100%; max-width: 640px; height: 100%; background: #0a0506; border: 1px solid rgba(212,168,83,0.4); display: flex; flex-direction: column; overflow: hidden; }

        @media(min-width:640px) {
          .coin-modal-container { padding: 16px; }
          .coin-modal-content { max-height: calc(100vh - 32px); border-radius: 16px; box-shadow: 0 25px 50px rgba(0,0,0,0.5), 0 0 40px rgba(212,168,83,0.15); }
        }
        @media(min-width:1024px) {
          .coin-modal-content { max-height: 800px; }
        }
        @media(max-width:639px) {
          .coin-modal-content { max-height: 100%; height: 100%; border-radius: 0; border: none; }
        }

        .coin-modal-backdrop { animation: coinBI .25s ease-out; }
        .coin-modal-content { animation: coinCI .3s cubic-bezier(.16,1,.3,1); }
        .coin-modal-closing .coin-modal-backdrop { animation: coinBO .2s ease-in forwards; }
        .coin-modal-closing .coin-modal-content { animation: coinCO .2s ease-in forwards; }
        @keyframes coinBI { from{opacity:0} to{opacity:1} }
        @keyframes coinBO { from{opacity:1} to{opacity:0} }
        @keyframes coinCI { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
        @keyframes coinCO { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(.97)} }
        @media(max-width:639px) {
          .coin-modal-content { animation: coinUp .3s cubic-bezier(.16,1,.3,1); }
          .coin-modal-closing .coin-modal-content { animation: coinDn .2s ease-in forwards; }
          @keyframes coinUp { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
          @keyframes coinDn { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(40px)} }
        }

        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(212,168,83,.3); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(212,168,83,.5); }
      `}</style>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default CoinUtilityModal;
