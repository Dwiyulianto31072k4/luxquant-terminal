// src/components/CryptoNewsPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Crypto News v4 (Bloomberg × Linear redesign)
// Magazine-grade aggregator with masonry, auto-categorization,
// branded placeholders, ticker pulse, density toggle, keyboard nav.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const API_BASE = "/api/v1";
const PAGE_SIZE = 24;

// ════════════════════════════════════════════
// 1. HELPERS — time, domain colors, categorization
// ════════════════════════════════════════════

const timeAgo = (dateStr) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const diff = Math.floor((Date.now() - d) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return "";
  }
};

const DOMAIN_COLORS = {
  "tradingview.com": "#2962FF",
  "cointelegraph.com": "#FFB800",
  "coindesk.com": "#6366f1",
  "decrypt.co": "#10b981",
  "bitcoinworld.co.in": "#f59e0b",
  "bitcoinmagazine.com": "#ef4444",
  "theblock.co": "#8b5cf6",
  "cryptoslate.com": "#06b6d4",
  "newsbtc.com": "#F7931A",
  "beincrypto.com": "#22c55e",
  "cryptobriefing.com": "#3b82f6",
  "coinpedia.org": "#14b8a6",
  "u.today": "#f97316",
  "bitget.com": "#00f0ff",
};

const DOMAIN_ABBREV = {
  "tradingview.com": "TV",
  "cointelegraph.com": "CT",
  "coindesk.com": "CD",
  "decrypt.co": "DE",
  "bitcoinworld.co.in": "BW",
  "bitcoinmagazine.com": "BM",
  "theblock.co": "TB",
  "cryptoslate.com": "CS",
  "newsbtc.com": "NB",
  "beincrypto.com": "BI",
  "cryptobriefing.com": "CB",
  "coinpedia.org": "CP",
  "u.today": "UT",
  "bitget.com": "BG",
};

const getDomainColor = (domain) => {
  if (!domain) return "#d4a24e";
  const key = Object.keys(DOMAIN_COLORS).find((d) => domain.includes(d));
  return key ? DOMAIN_COLORS[key] : "#d4a24e";
};

const getDomainAbbrev = (domain) => {
  if (!domain) return "?";
  const key = Object.keys(DOMAIN_ABBREV).find((d) => domain.includes(d));
  return key ? DOMAIN_ABBREV[key] : domain.slice(0, 2).toUpperCase();
};

const shortDomain = (domain) => {
  if (!domain) return "";
  return domain
    .replace(".com", "")
    .replace(".co.in", "")
    .replace(".co", "")
    .replace(".org", "");
};

const getImageSrc = (item) => {
  const url = item?.image_url;
  if (!url || url === "webpage_photo" || (typeof url === "string" && url.trim() === "")) return null;
  return url;
};

// Auto-categorize by title keywords (lightweight, client-side)
const CATEGORY_RULES = [
  { key: "bitcoin", label: "Bitcoin", icon: "₿", color: "#F7931A", patterns: [/\bbtc\b/i, /\bbitcoin\b/i, /satoshi/i] },
  { key: "ethereum", label: "Ethereum", icon: "Ξ", color: "#627EEA", patterns: [/\beth\b/i, /\bethereum\b/i, /vitalik/i] },
  { key: "altcoins", label: "Altcoins", icon: "◎", color: "#9945FF", patterns: [/\bsol\b|solana/i, /\bxrp\b|ripple/i, /cardano|\bada\b/i, /\bdoge\b|dogecoin/i, /toncoin|\bton\b/i, /altcoin/i] },
  { key: "macro", label: "Macro", icon: "⊞", color: "#22c55e", patterns: [/fed|fomc|rate cut|inflation/i, /etf flow|spot etf/i, /sec\b|regulation|cftc/i, /\bm2\b|liquidity/i] },
  { key: "defi", label: "DeFi", icon: "⬡", color: "#06b6d4", patterns: [/defi|tvl|yield|staking/i, /\buni\b|uniswap|aave|curve/i, /lending|liquidity pool/i] },
  { key: "listings", label: "Listings", icon: "▲", color: "#f59e0b", patterns: [/listing|listed on|upbit|kucoin|binance listing/i, /token unlock|airdrop/i] },
];

const categorizeItem = (item) => {
  const title = (item?.title || "") + " " + (item?.description || "");
  for (const cat of CATEGORY_RULES) {
    for (const p of cat.patterns) {
      if (p.test(title)) return cat.key;
    }
  }
  return null;
};

// ════════════════════════════════════════════
// 2. ATOMS — DomainBadge, CategoryChip, ImagePlaceholder
// ════════════════════════════════════════════

const DomainBadge = ({ domain, size = "sm" }) => {
  if (!domain) return null;
  const color = getDomainColor(domain);
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono uppercase tracking-[0.12em] ${
        size === "lg" ? "text-[10px]" : "text-[9px]"
      }`}
      style={{ background: `${color}1a`, color, border: `1px solid ${color}33` }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
      {shortDomain(domain)}
    </span>
  );
};

const CategoryChip = ({ catKey, active, onClick, count }) => {
  const cat = CATEGORY_RULES.find((c) => c.key === catKey);
  if (!cat) return null;
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition-all duration-200 ${
        active
          ? "border"
          : "bg-white/[0.02] border border-white/5 text-text-muted hover:bg-white/[0.04] hover:text-white"
      }`}
      style={
        active
          ? {
              background: `${cat.color}15`,
              borderColor: `${cat.color}40`,
              color: cat.color,
              boxShadow: `inset 0 0 0 1px ${cat.color}10`,
            }
          : undefined
      }
    >
      <span className="text-sm leading-none" style={{ color: active ? cat.color : "currentColor" }}>
        {cat.icon}
      </span>
      <span>{cat.label}</span>
      {count !== undefined && count > 0 && (
        <span
          className="text-[9px] px-1 rounded font-mono"
          style={{ background: active ? `${cat.color}25` : "rgba(255,255,255,0.05)" }}
        >
          {count}
        </span>
      )}
    </button>
  );
};

const ImagePlaceholder = ({ domain, className = "", size = "md" }) => {
  const color = getDomainColor(domain);
  const abbrev = getDomainAbbrev(domain);
  const fontSize = size === "lg" ? "clamp(3rem, 7vw, 5rem)" : size === "sm" ? "clamp(1.5rem, 4vw, 2.5rem)" : "clamp(2.5rem, 6vw, 4rem)";
  return (
    <div
      className={`w-full h-full flex items-center justify-center select-none relative overflow-hidden ${className}`}
      style={{
        background: `radial-gradient(circle at 30% 20%, ${color}30 0%, ${color}08 45%, ${color}18 100%)`,
      }}
    >
      {/* Subtle grid overlay for texture */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
          `,
          backgroundSize: "20px 20px",
        }}
      />
      {/* Noise overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><filter id='n'><feTurbulence baseFrequency='0.9'/></filter><rect width='100' height='100' filter='url(%23n)'/></svg>")`,
        }}
      />
      {/* Brand mark */}
      <div className="relative flex flex-col items-center gap-1.5 z-10">
        <span
          style={{
            fontFamily: "Fraunces, Georgia, serif",
            fontSize,
            fontWeight: 700,
            color: `${color}d6`,
            letterSpacing: "-0.05em",
            lineHeight: 1,
            textShadow: `0 4px 24px ${color}60`,
          }}
        >
          {abbrev}
        </span>
        <span
          className="text-[9px] font-mono uppercase tracking-[0.25em]"
          style={{ color: `${color}80` }}
        >
          {shortDomain(domain)}
        </span>
      </div>
      {/* Corner accent */}
      <div
        className="absolute top-0 right-0 w-16 h-16"
        style={{
          background: `linear-gradient(135deg, transparent 50%, ${color}20 50%)`,
        }}
      />
    </div>
  );
};

// ════════════════════════════════════════════
// 3. NEWS DETAIL MODAL
// ════════════════════════════════════════════

const NewsModal = ({ item, onClose }) => {
  const [extract, setExtract] = useState(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!item?.id) return;
    setLoading(true);
    fetch(`${API_BASE}/crypto-news-feed/extract/${item.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setExtract(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [item?.id]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  if (!item) return null;

  const imgSrc = extract?.top_image || getImageSrc(item);
  const summary = extract?.summary || item.description || null;
  const fullText = extract?.full_text || item.raw_text || null;
  const keywords = extract?.keywords || [];
  const authors = extract?.authors || [];
  const isPhoto = item.content_type === "photo";
  const color = getDomainColor(item.domain);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 ${
        closing ? "news-modal-out" : "news-modal-in"
      }`}
      onClick={handleClose}
    >
      <style>{`
        .news-modal-in { background: rgba(0,0,0,0); backdrop-filter: blur(0px); animation: nmOverlayIn .3s ease forwards; }
        .news-modal-out { animation: nmOverlayOut .2s ease forwards; }
        .news-modal-out .nm-card { animation: nmCardOut .2s ease forwards; }
        @keyframes nmOverlayIn { to { background: rgba(8,4,12,.86); backdrop-filter: blur(12px); } }
        @keyframes nmOverlayOut { from { background: rgba(8,4,12,.86); backdrop-filter: blur(12px); } to { background: rgba(0,0,0,0); backdrop-filter: blur(0px); } }
        .nm-card { animation: nmCardIn .35s cubic-bezier(.16,1,.3,1) forwards; }
        @keyframes nmCardIn { from { opacity: 0; transform: scale(.96) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes nmCardOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(.96) translateY(20px); } }
        .nm-scroll::-webkit-scrollbar { width: 6px; }
        .nm-scroll::-webkit-scrollbar-track { background: transparent; }
        .nm-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 6px; }
        .nm-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
      `}</style>

      <div
        className="nm-card relative w-full max-w-2xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
        style={{
          background: "linear-gradient(180deg, rgba(20,16,28,0.98), rgba(12,10,16,0.98))",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-px z-10"
          style={{ background: `linear-gradient(to right, transparent, ${color}80, transparent)` }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <DomainBadge domain={item.domain} size="lg" />
            {isPhoto && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">
                photo
              </span>
            )}
            <span className="text-text-muted text-[10px] font-mono">{timeAgo(item.created_at)}</span>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-text-muted hover:text-white transition-all"
            title="Close (Esc)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="nm-scroll overflow-y-auto flex-1">
          {/* Image / Placeholder */}
          <div className="relative w-full h-56 sm:h-72 overflow-hidden bg-black/40">
            {imgSrc ? (
              <img
                src={imgSrc}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
            ) : (
              <ImagePlaceholder domain={item.domain} size="lg" />
            )}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0c0a10] to-transparent" />
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            <h2
              className="text-white text-lg sm:text-2xl leading-tight"
              style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 600, letterSpacing: "-0.02em" }}
            >
              {item.title}
            </h2>

            {authors.length > 0 && (
              <p className="text-text-muted text-[11px] font-mono">
                BY {authors.join(", ").toUpperCase()}
              </p>
            )}

            {loading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 bg-white/5 rounded w-full" />
                <div className="h-3 bg-white/5 rounded w-5/6" />
                <div className="h-3 bg-white/5 rounded w-4/6" />
              </div>
            ) : summary ? (
              <div className="space-y-2">
                <h3 className="text-white text-[10px] font-mono uppercase tracking-[0.2em] flex items-center gap-1.5">
                  <span className="w-1 h-3 rounded-full" style={{ background: color }} />
                  Summary
                </h3>
                <p className="text-text-secondary text-[13px] leading-relaxed">{summary}</p>
              </div>
            ) : null}

            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((kw, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] border border-white/5 text-text-muted"
                  >
                    #{kw}
                  </span>
                ))}
              </div>
            )}

            {fullText && fullText !== summary && (
              <div className="space-y-2">
                <h3 className="text-white text-[10px] font-mono uppercase tracking-[0.2em] flex items-center gap-1.5">
                  <span className="w-1 h-3 rounded-full" style={{ background: color }} />
                  Article Preview
                </h3>
                <p className="text-text-muted text-[12px] leading-relaxed line-clamp-[8] whitespace-pre-line">
                  {fullText.slice(0, 800)}
                  {fullText.length > 800 ? "…" : ""}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-white/5 flex-shrink-0">
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90"
              style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
            >
              Read Full Article
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          ) : (
            <div className="flex-1 flex items-center justify-center px-4 py-2.5 rounded-xl text-sm text-text-muted bg-white/[0.03]">
              No external link
            </div>
          )}
          <button
            onClick={handleClose}
            className="px-4 py-2.5 rounded-xl text-sm text-text-muted bg-white/[0.03] border border-white/5 hover:text-white hover:border-white/15 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════
// 4. PULSE TICKER — horizontal scrolling latest headlines
// ════════════════════════════════════════════

const PulseTicker = ({ items, onSelect }) => {
  if (!items || items.length === 0) return null;
  const ticker = items.slice(0, 12);

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/5 bg-black/20 group">
      <style>{`
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track { animation: tickerScroll 80s linear infinite; }
        .group:hover .ticker-track { animation-play-state: paused; }
      `}</style>

      {/* Left fade */}
      <div className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-r from-[#0c0a10] to-transparent" />
      {/* Right fade */}
      <div className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-l from-[#0c0a10] to-transparent" />

      {/* Live label */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" style={{ boxShadow: "0 0 8px #ef4444" }} />
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-red-400/90">Live</span>
      </div>

      {/* Ticker */}
      <div className="flex ticker-track py-2.5 pl-24" style={{ width: "fit-content" }}>
        {[...ticker, ...ticker].map((item, i) => (
          <button
            key={`${item.id}-${i}`}
            onClick={() => onSelect(item)}
            className="flex items-center gap-2 px-4 mr-2 whitespace-nowrap text-[12px] hover:text-gold-primary transition-colors group/item"
          >
            <span
              className="w-1 h-1 rounded-full flex-shrink-0"
              style={{ background: getDomainColor(item.domain) }}
            />
            <span className="text-text-muted font-mono text-[10px] uppercase">
              {shortDomain(item.domain)}
            </span>
            <span className="text-white/70 group-hover/item:text-gold-primary transition-colors max-w-[420px] truncate">
              {item.title}
            </span>
            <span className="text-text-muted/60 text-[10px] font-mono">{timeAgo(item.created_at)}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════
// 5. NEWS CARDS — variants by importance & content
// ════════════════════════════════════════════

// HERO CARD — Top of page, big & dramatic
const HeroCard = ({ item, onSelect }) => {
  const imgSrc = getImageSrc(item);
  const color = getDomainColor(item.domain);
  return (
    <div
      onClick={() => onSelect(item)}
      className="group relative cursor-pointer rounded-2xl overflow-hidden border border-white/5 hover:border-gold-primary/30 transition-all duration-500 h-full min-h-[360px] flex flex-col"
      style={{
        background: "linear-gradient(180deg, rgba(20,16,28,0.6), rgba(12,10,16,0.4))",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      }}
    >
      {/* Image area */}
      <div className="relative flex-1 overflow-hidden">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        ) : (
          <ImagePlaceholder domain={item.domain} size="lg" />
        )}
        {/* Strong gradient overlay for text legibility */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.95) 100%)",
          }}
        />
        {/* Top corner badges */}
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <DomainBadge domain={item.domain} size="lg" />
          <span
            className="text-[9px] font-mono uppercase tracking-[0.25em] px-2 py-0.5 rounded"
            style={{
              background: "rgba(212, 168, 83, 0.15)",
              color: "#d4a853",
              border: "1px solid rgba(212, 168, 83, 0.3)",
            }}
          >
            ★ Featured
          </span>
        </div>
        {/* Bottom content */}
        <div className="absolute inset-x-0 bottom-0 p-6 z-10">
          <h2
            className="text-white text-xl sm:text-2xl lg:text-3xl leading-tight line-clamp-3 mb-3 group-hover:text-gold-primary transition-colors duration-300"
            style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 600, letterSpacing: "-0.02em" }}
          >
            {item.title}
          </h2>
          {item.description && (
            <p className="text-white/70 text-[13px] leading-relaxed line-clamp-2 mb-3">
              {item.description}
            </p>
          )}
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="text-text-muted">{timeAgo(item.created_at)}</span>
            <span className="text-text-muted/50">·</span>
            <span style={{ color }} className="group-hover:underline underline-offset-2">
              Read story →
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// FEATURED CARD — second tier, medium prominence
const FeaturedCard = ({ item, onSelect }) => {
  const imgSrc = getImageSrc(item);
  const color = getDomainColor(item.domain);
  return (
    <div
      onClick={() => onSelect(item)}
      className="group cursor-pointer rounded-xl overflow-hidden bg-white/[0.02] border border-white/5 hover:border-gold-primary/25 hover:bg-white/[0.03] transition-all duration-300 flex flex-col h-full"
    >
      <div className="relative h-32 overflow-hidden flex-shrink-0">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        ) : (
          <ImagePlaceholder domain={item.domain} size="md" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute top-2 left-2">
          <DomainBadge domain={item.domain} />
        </div>
      </div>
      <div className="p-3 flex flex-col flex-1">
        <h3
          className="text-white text-[13px] leading-snug line-clamp-3 group-hover:text-gold-primary transition-colors flex-1"
          style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 500 }}
        >
          {item.title}
        </h3>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
          <span className="text-text-muted text-[10px] font-mono">{timeAgo(item.created_at)}</span>
          <span
            className="text-[10px] font-mono group-hover:translate-x-0.5 transition-transform"
            style={{ color }}
          >
            →
          </span>
        </div>
      </div>
    </div>
  );
};

// REGULAR CARD — standard grid item
const RegularCard = ({ item, onSelect, dense = false }) => {
  const imgSrc = getImageSrc(item);
  const color = getDomainColor(item.domain);
  const isPhoto = item.content_type === "photo";

  return (
    <article
      onClick={() => onSelect(item)}
      className="group cursor-pointer rounded-xl overflow-hidden bg-white/[0.02] border border-white/5 hover:border-gold-primary/25 hover:bg-white/[0.035] transition-all duration-300 flex flex-col h-full"
    >
      <div className={`relative overflow-hidden flex-shrink-0 ${dense ? "h-28" : "h-36"}`}>
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            className="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        ) : (
          <ImagePlaceholder domain={item.domain} size="md" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <div className="absolute top-2 left-2">
          <DomainBadge domain={item.domain} />
        </div>
        {isPhoto && (
          <div className="absolute top-2 right-2">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-mono uppercase tracking-wider bg-purple-500/30 text-purple-300 border border-purple-500/40">
              photo
            </span>
          </div>
        )}
      </div>
      <div className={`flex flex-col flex-1 ${dense ? "p-2.5" : "p-3"}`}>
        <h4
          className={`text-white leading-snug line-clamp-3 group-hover:text-gold-primary transition-colors flex-1 ${
            dense ? "text-[11px]" : "text-[12.5px]"
          }`}
          style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 500 }}
        >
          {item.title}
        </h4>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
          <span className="text-text-muted text-[10px] font-mono">{timeAgo(item.created_at)}</span>
          <span
            className="text-[10px] font-mono opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
            style={{ color }}
          >
            Details →
          </span>
        </div>
      </div>
    </article>
  );
};

// HEADLINE CARD — text-only, gold accent, no image
const HeadlineCard = ({ item, onSelect }) => {
  const color = getDomainColor(item.domain);
  return (
    <article
      onClick={() => onSelect(item)}
      className="group cursor-pointer p-4 rounded-xl bg-white/[0.015] border border-white/5 hover:bg-white/[0.03] transition-all duration-300 relative overflow-hidden"
      style={{ borderLeft: `2px solid ${color}80` }}
    >
      {/* Glow on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `linear-gradient(90deg, ${color}10 0%, transparent 60%)` }}
      />
      <div className="relative flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-2">
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-[0.15em]"
              style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
            >
              ⚡ Headline
            </span>
            <DomainBadge domain={item.domain} />
          </div>
          <h4
            className="text-white text-[12.5px] leading-snug line-clamp-3 group-hover:text-gold-primary transition-colors"
            style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 500 }}
          >
            {item.title}
          </h4>
          <div className="mt-2 text-[10px] font-mono text-text-muted">
            {timeAgo(item.created_at)}
          </div>
        </div>
      </div>
    </article>
  );
};

// ════════════════════════════════════════════
// 6. SIDEBAR — Trending, Sources, Activity
// ════════════════════════════════════════════

const TrendingSidebar = ({ trending, stats, onSearchTopic }) => {
  const topDomains = stats?.top_domains?.slice(0, 6) || [];
  const maxDC = topDomains.length > 0 ? topDomains[0].count : 1;

  return (
    <div className="space-y-3">
      {/* TRENDING NOW */}
      {trending?.trending?.length > 0 && (
        <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4 relative overflow-hidden">
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(212, 168, 83, 0.5), transparent)" }}
          />
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1 h-3 rounded-full bg-gold-primary" />
            <h3 className="text-white text-[10px] font-mono uppercase tracking-[0.2em]">Trending Now</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {trending.trending.slice(0, 14).map((t, i) => (
              <button
                key={t.topic}
                onClick={() => onSearchTopic(t.topic)}
                className={`px-2 py-1 rounded text-[10px] font-mono transition-all hover:scale-[1.04] ${
                  i < 3
                    ? "bg-gold-primary/15 text-gold-primary border border-gold-primary/30"
                    : "bg-white/[0.04] text-text-muted border border-white/5 hover:text-white hover:border-white/15"
                }`}
              >
                {i < 3 && (
                  <span
                    className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gold-primary/20 text-gold-primary text-[8px] font-bold mr-1"
                    style={{ verticalAlign: "middle" }}
                  >
                    {i + 1}
                  </span>
                )}
                {t.topic}
                <span className="text-[8px] opacity-50 ml-1">×{t.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TOP SOURCES */}
      {topDomains.length > 0 && (
        <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1 h-3 rounded-full bg-gold-primary" />
            <h3 className="text-white text-[10px] font-mono uppercase tracking-[0.2em]">Top Sources</h3>
          </div>
          <div className="space-y-2.5">
            {topDomains.map((d) => {
              const color = getDomainColor(d.domain);
              return (
                <div key={d.domain} className="space-y-1 group">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: color, boxShadow: `0 0 4px ${color}` }}
                      />
                      <span className="text-[11px] text-text-secondary truncate group-hover:text-white transition-colors">
                        {d.domain}
                      </span>
                    </div>
                    <span className="text-[10px] text-text-muted font-mono tabular-nums">{d.count}</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(d.count / maxDC) * 100}%`,
                        background: `linear-gradient(90deg, ${color}cc, ${color}66)`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ACTIVITY */}
      {stats && (
        <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1 h-3 rounded-full bg-gold-primary" />
            <h3 className="text-white text-[10px] font-mono uppercase tracking-[0.2em]">Activity</h3>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { l: "1H", v: stats.last_hour },
              { l: "6H", v: stats.last_6h },
              { l: "3D", v: stats.total },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-md bg-white/[0.02] border border-white/5 p-2 text-center"
              >
                <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted">
                  {s.l}
                </div>
                <div className="text-white font-mono font-bold tabular-nums text-[15px] mt-0.5">
                  {s.v}
                </div>
              </div>
            ))}
          </div>
          {stats.hourly?.length > 0 && (
            <div>
              <p className="text-[9px] font-mono text-text-muted uppercase tracking-[0.2em] mb-2">
                24h Pulse
              </p>
              <div className="flex items-end gap-0.5 h-12">
                {stats.hourly
                  .slice()
                  .reverse()
                  .slice(0, 24)
                  .map((h, i) => {
                    const max = Math.max(...stats.hourly.map((x) => x.count), 1);
                    const isPeak = h.count >= max * 0.7;
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-t transition-all hover:opacity-100"
                        style={{
                          height: `${Math.max((h.count / max) * 100, 6)}%`,
                          background: isPeak
                            ? "linear-gradient(180deg, #d4a853, rgba(212,168,83,0.4))"
                            : "linear-gradient(180deg, rgba(212,168,83,0.4), rgba(212,168,83,0.1))",
                          boxShadow: isPeak ? "0 0 6px rgba(212,168,83,0.5)" : "none",
                        }}
                        title={`${h.count} articles`}
                      />
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════
// 7. PAGINATION
// ════════════════════════════════════════════

const Pagination = ({ page, totalPages, onChange }) => {
  if (totalPages <= 1) return null;
  const getPages = () => {
    const p = [];
    const s = Math.max(1, page - 2);
    const e = Math.min(totalPages, page + 2);
    if (s > 1) {
      p.push(1);
      if (s > 2) p.push("...");
    }
    for (let i = s; i <= e; i++) p.push(i);
    if (e < totalPages) {
      if (e < totalPages - 1) p.push("...");
      p.push(totalPages);
    }
    return p;
  };
  return (
    <div className="flex items-center justify-center gap-1 pt-6">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-2 rounded-lg text-[11px] font-mono bg-white/[0.03] border border-white/5 text-text-muted hover:text-white hover:border-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        ← Prev
      </button>
      {getPages().map((p, i) =>
        p === "..." ? (
          <span key={`d${i}`} className="text-text-muted text-[11px] px-1">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`w-9 h-9 rounded-lg text-[11px] font-mono font-medium transition-all ${
              p === page
                ? "bg-gold-primary/20 text-gold-primary border border-gold-primary/40"
                : "bg-white/[0.03] border border-white/5 text-text-muted hover:text-white hover:border-white/15"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-2 rounded-lg text-[11px] font-mono bg-white/[0.03] border border-white/5 text-text-muted hover:text-white hover:border-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        Next →
      </button>
    </div>
  );
};

// ════════════════════════════════════════════
// 8. LOADING SKELETON
// ════════════════════════════════════════════

const LoadingSkeleton = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="md:col-span-2 h-72 rounded-2xl bg-white/[0.02] border border-white/5 animate-pulse" />
      <div className="space-y-3">
        <div className="h-[140px] rounded-xl bg-white/[0.02] border border-white/5 animate-pulse" />
        <div className="h-[140px] rounded-xl bg-white/[0.02] border border-white/5 animate-pulse" />
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-white/[0.02] border border-white/5 overflow-hidden animate-pulse"
        >
          <div className="h-36 bg-white/5" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-white/5 rounded w-3/4" />
            <div className="h-3 bg-white/5 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ════════════════════════════════════════════
// 9. FILTER BAR
// ════════════════════════════════════════════

const FilterBar = ({
  searchInput,
  onSearchChange,
  onClearSearch,
  activeFilter,
  onFilterChange,
  activeCategory,
  onCategoryChange,
  categoryCounts,
  stats,
  density,
  onDensityChange,
}) => (
  <div className="space-y-3">
    {/* Top row — search + density toggle */}
    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
      <div className="relative flex-1 max-w-xl">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search news, topics, sources…"
          className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white/[0.02] border border-white/10 text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-gold-primary/40 focus:ring-1 focus:ring-gold-primary/20 transition-all"
        />
        {searchInput && (
          <button
            onClick={onClearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Density toggle */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.02] border border-white/5">
        {[
          { k: "comfortable", label: "Comfy" },
          { k: "compact", label: "Dense" },
        ].map((o) => (
          <button
            key={o.k}
            onClick={() => onDensityChange(o.k)}
            className={`px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all ${
              density === o.k
                ? "bg-gold-primary/15 text-gold-primary"
                : "text-text-muted hover:text-white"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>

    {/* Type filters */}
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-text-muted/60 mr-1">
        Type
      </span>
      {[
        { k: "all", label: "All", count: stats?.total },
        { k: "article", label: "Articles", count: stats?.articles },
        { k: "photo", label: "Photos", count: stats?.photos },
        { k: "headline", label: "Headlines", count: stats?.headlines },
      ].map((f) => (
        <button
          key={f.k}
          onClick={() => onFilterChange(f.k)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono transition-all duration-200 ${
            activeFilter === f.k
              ? "bg-gold-primary/15 text-gold-primary border border-gold-primary/40"
              : "bg-white/[0.02] text-text-muted border border-white/5 hover:text-white hover:border-white/15"
          }`}
        >
          {f.label}
          {f.count !== undefined && (
            <span
              className={`text-[9px] px-1 rounded font-mono ${
                activeFilter === f.k ? "bg-gold-primary/20" : "bg-white/5"
              }`}
            >
              {f.count}
            </span>
          )}
        </button>
      ))}
    </div>

    {/* Category filters */}
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-text-muted/60 mr-1">
        Category
      </span>
      <button
        onClick={() => onCategoryChange(null)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition-all ${
          !activeCategory
            ? "bg-gold-primary/15 text-gold-primary border border-gold-primary/40"
            : "bg-white/[0.02] border border-white/5 text-text-muted hover:text-white"
        }`}
      >
        ◆ All
      </button>
      {CATEGORY_RULES.map((cat) => (
        <CategoryChip
          key={cat.key}
          catKey={cat.key}
          active={activeCategory === cat.key}
          onClick={() => onCategoryChange(activeCategory === cat.key ? null : cat.key)}
          count={categoryCounts[cat.key]}
        />
      ))}
    </div>
  </div>
);

// ════════════════════════════════════════════
// 10. MAIN COMPONENT
// ════════════════════════════════════════════

const CryptoNewsPage = () => {
  // ── State ──────────────────────────────
  const [allItems, setAllItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [trending, setTrending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState(null);

  const [activeFilter, setActiveFilter] = useState("all");
  const [activeCategory, setActiveCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [density, setDensity] = useState(() => {
    try {
      return localStorage.getItem("luxquant.news.density") || "comfortable";
    } catch {
      return "comfortable";
    }
  });

  const searchTimeout = useRef(null);

  // ── Persist density ────────────────────
  useEffect(() => {
    try {
      localStorage.setItem("luxquant.news.density", density);
    } catch {}
  }, [density]);

  // ── Fetch ──────────────────────────────
  const fetchFeed = useCallback(
    async (pg = 1) => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          limit: PAGE_SIZE,
          offset: (pg - 1) * PAGE_SIZE,
        });
        if (activeFilter !== "all") params.set("content_type", activeFilter);
        if (searchQuery) params.set("search", searchQuery);
        const res = await fetch(`${API_BASE}/crypto-news-feed/feed?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setAllItems(data.items || []);
        setTotal(data.total || 0);
      } catch (err) {
        console.error("News feed error:", err);
      } finally {
        setLoading(false);
      }
    },
    [activeFilter, searchQuery]
  );

  const fetchMeta = useCallback(async () => {
    try {
      const [sR, tR] = await Promise.all([
        fetch(`${API_BASE}/crypto-news-feed/stats`),
        fetch(`${API_BASE}/crypto-news-feed/trending`),
      ]);
      if (sR.ok) setStats(await sR.json());
      if (tR.ok) setTrending(await tR.json());
    } catch (err) {
      console.error("News meta error:", err);
    }
  }, []);

  useEffect(() => {
    fetchFeed(page);
    fetchMeta();
    const iv = setInterval(() => {
      fetchFeed(page);
      fetchMeta();
    }, 60000);
    return () => clearInterval(iv);
  }, [activeFilter, searchQuery, page, fetchFeed, fetchMeta]);

  // ── Handlers ───────────────────────────
  const handleSearchInput = (val) => {
    setSearchInput(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearchQuery(val);
      setPage(1);
    }, 400);
  };
  const handleClearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    setPage(1);
  };
  const handleSearchTopic = (topic) => {
    setSearchInput(topic);
    setSearchQuery(topic);
    setPage(1);
  };
  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
    setPage(1);
  };
  const handleCategoryChange = (cat) => {
    setActiveCategory(cat);
    setPage(1);
  };
  const handlePageChange = (p) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Derived state ──────────────────────
  // Auto-categorize all items once
  const itemsWithCategory = useMemo(() => {
    return allItems.map((item) => ({ ...item, _category: categorizeItem(item) }));
  }, [allItems]);

  // Counts per category
  const categoryCounts = useMemo(() => {
    const counts = {};
    itemsWithCategory.forEach((item) => {
      if (item._category) counts[item._category] = (counts[item._category] || 0) + 1;
    });
    return counts;
  }, [itemsWithCategory]);

  // Filter by selected category
  const filteredItems = useMemo(() => {
    if (!activeCategory) return itemsWithCategory;
    return itemsWithCategory.filter((item) => item._category === activeCategory);
  }, [itemsWithCategory, activeCategory]);

  // Hero: first article with image + description
  const heroItem = useMemo(() => {
    if (page !== 1 || activeFilter !== "all" || searchQuery) return null;
    return filteredItems.find(
      (i) =>
        i.content_type === "article" &&
        i.description &&
        getImageSrc(i)
    );
  }, [filteredItems, page, activeFilter, searchQuery]);

  // 2 featured: next 2 articles for top-right stack
  const featuredItems = useMemo(() => {
    if (!heroItem) return [];
    return filteredItems
      .filter((i) => i.id !== heroItem.id && i.content_type === "article")
      .slice(0, 2);
  }, [filteredItems, heroItem]);

  // Pulse ticker: 12 latest non-photo
  const pulseItems = useMemo(() => {
    if (page !== 1 || searchQuery) return [];
    return allItems.filter((i) => i.content_type !== "photo").slice(0, 12);
  }, [allItems, page, searchQuery]);

  // Grid items: rest
  const gridItems = useMemo(() => {
    const used = new Set([heroItem?.id, ...featuredItems.map((f) => f.id)].filter(Boolean));
    return filteredItems.filter((i) => !used.has(i.id));
  }, [filteredItems, heroItem, featuredItems]);

  // Headlines (separate small grid)
  const headlines = useMemo(
    () => gridItems.filter((i) => i.content_type === "headline").slice(0, 4),
    [gridItems]
  );
  const nonHeadlineGrid = useMemo(
    () => gridItems.filter((i) => i.content_type !== "headline"),
    [gridItems]
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── Render ─────────────────────────────
  return (
    <div className="space-y-5 sm:space-y-6">
      {selectedItem && <NewsModal item={selectedItem} onClose={() => setSelectedItem(null)} />}

      {/* HEADER */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-2 border-b border-white/5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-3 rounded-full bg-gold-primary" />
            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-gold-primary/80">
              Live Feed
            </span>
          </div>
          <h1
            className="text-3xl sm:text-4xl text-white"
            style={{
              fontFamily: "Fraunces, Georgia, serif",
              fontWeight: 600,
              letterSpacing: "-0.025em",
            }}
          >
            Crypto News
          </h1>
          <p className="text-text-muted text-xs sm:text-sm mt-1">
            Real-time aggregator · 3-day rolling window · auto-refresh 60s
          </p>
        </div>
        {stats && (
          <div className="flex flex-wrap gap-2">
            {[
              { l: "Total", v: stats.total },
              { l: "Articles", v: stats.articles },
              { l: "Photos", v: stats.photos },
              { l: "1H", v: stats.last_hour },
            ].map((s) => (
              <div
                key={s.l}
                className="flex flex-col items-center px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/5 min-w-[64px]"
              >
                <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted">
                  {s.l}
                </span>
                <span className="text-white text-sm font-mono font-bold tabular-nums">{s.v}</span>
              </div>
            ))}
          </div>
        )}
      </header>

      {/* PULSE TICKER */}
      {pulseItems.length > 0 && <PulseTicker items={pulseItems} onSelect={setSelectedItem} />}

      {/* FILTERS */}
      <FilterBar
        searchInput={searchInput}
        onSearchChange={handleSearchInput}
        onClearSearch={handleClearSearch}
        activeFilter={activeFilter}
        onFilterChange={handleFilterChange}
        activeCategory={activeCategory}
        onCategoryChange={handleCategoryChange}
        categoryCounts={categoryCounts}
        stats={stats}
        density={density}
        onDensityChange={setDensity}
      />

      {/* CONTENT */}
      {loading ? (
        <LoadingSkeleton />
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center mb-4">
            <span className="text-3xl opacity-30">🔍</span>
          </div>
          <p
            className="text-white text-base mb-1"
            style={{ fontFamily: "Fraunces, Georgia, serif" }}
          >
            No results found
          </p>
          <p className="text-text-muted text-xs">
            {searchQuery
              ? `No news matches "${searchQuery}"`
              : activeCategory
              ? "Try a different category or clear filters"
              : "No news available yet"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-5">
          <div className="flex-1 min-w-0 space-y-5">
            {/* HERO + 2 FEATURED */}
            {heroItem && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <HeroCard item={heroItem} onSelect={setSelectedItem} />
                </div>
                <div className="grid grid-rows-2 gap-3">
                  {featuredItems.map((item) => (
                    <FeaturedCard key={item.id} item={item} onSelect={setSelectedItem} />
                  ))}
                </div>
              </div>
            )}

            {/* HEADLINES STRIP */}
            {headlines.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-3 rounded-full bg-gold-primary" />
                  <h2 className="text-[10px] font-mono uppercase tracking-[0.25em] text-text-muted">
                    Latest Headlines
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
                  {headlines.map((item) => (
                    <HeadlineCard key={item.id} item={item} onSelect={setSelectedItem} />
                  ))}
                </div>
              </div>
            )}

            {/* MAIN GRID */}
            {nonHeadlineGrid.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-3 rounded-full bg-gold-primary" />
                    <h2 className="text-[10px] font-mono uppercase tracking-[0.25em] text-text-muted">
                      {activeCategory
                        ? CATEGORY_RULES.find((c) => c.key === activeCategory)?.label
                        : "All Stories"}
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono text-text-muted">
                    {nonHeadlineGrid.length} stories
                  </span>
                </div>
                <div
                  className={`grid gap-3 ${
                    density === "compact"
                      ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
                      : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                  }`}
                >
                  {nonHeadlineGrid.map((item) => (
                    <RegularCard
                      key={item.id}
                      item={item}
                      onSelect={setSelectedItem}
                      dense={density === "compact"}
                    />
                  ))}
                </div>
              </div>
            )}

            <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
          </div>

          {/* SIDEBAR */}
          <aside className="w-full lg:w-72 xl:w-80 flex-shrink-0">
            <div className="lg:sticky lg:top-20">
              <TrendingSidebar
                trending={trending}
                stats={stats}
                onSearchTopic={handleSearchTopic}
              />
            </div>
          </aside>
        </div>
      )}

      {/* FOOTER */}
      <div className="flex items-center justify-center gap-2 py-3 mt-4 border-t border-white/5">
        <span
          className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"
          style={{ boxShadow: "0 0 6px #22c55e" }}
        />
        <span className="text-text-muted text-[10px] font-mono uppercase tracking-wider">
          Auto-refresh 60s · Page {page} of {totalPages || 1}
        </span>
      </div>
    </div>
  );
};

export default CryptoNewsPage;
