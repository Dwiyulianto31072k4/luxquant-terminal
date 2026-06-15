// src/components/CryptoNewsPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Crypto News v5 (Flowscan-density redesign)
// Uniform 1:1 dense grid · brand favicons · info-dense
// Replaces hero/featured/headline-card variants with single UniformCard.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Modal from "./ui/Modal";

const API_BASE = "/api/v1";
const PAGE_SIZE = 30;

// Brand assets (in /public — referenced by absolute path)
const LUXQUANT_LOGO = "/logo.png";
const TRADINGVIEW_IMAGE = "/news-flow-tradingview.jpg";

// Domains that should display their own promo/marketing image as full-bleed thumbnail
// (instead of the standard favicon-in-glass-card pattern)
const FULL_BLEED_BRAND_IMAGES = {
  "tradingview.com": TRADINGVIEW_IMAGE,
};

// ════════════════════════════════════════════
// 1. HELPERS — time, domain colors, categorization, favicon
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

const getDomainColor = (domain) => {
  if (!domain) return "#d4a24e";
  const key = Object.keys(DOMAIN_COLORS).find((d) => domain.includes(d));
  return key ? DOMAIN_COLORS[key] : "#d4a24e";
};

const shortDomain = (domain) => {
  if (!domain) return "";
  return domain
    .replace(".com", "")
    .replace(".co.in", "")
    .replace(".co", "")
    .replace(".org", "");
};

// Build favicon URL via Google's favicon service (cached, fast, reliable)
const getFaviconUrl = (domain, size = 128) => {
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
};

const getImageSrc = (item) => {
  const url = item?.image_url;
  if (!url || url === "webpage_photo" || (typeof url === "string" && url.trim() === "")) return null;
  return url;
};

const getVideoSrc = (item) => {
  const url = item?.video_url;
  if (!url || (typeof url === "string" && url.trim() === "")) return null;
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
// 2. ATOMS — DomainBadge, BrandThumbnail
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

// Note: Old CategoryChip removed — superseded by FilterChip in section 9

// BrandThumbnail — three modes:
//   1. FULL-BLEED BRAND IMAGE — for domains in FULL_BLEED_BRAND_IMAGES (e.g. TradingView).
//      Renders the brand image as a cover-fitted thumbnail, no wrapper card.
//   2. LUXQUANT LOGO — for headline content (no real image, no recognizable domain favicon).
//      Renders the LuxQuant 量子智引 logo centered on luxury gold gradient.
//   3. FAVICON GLASS CARD — fallback for all other domains. Fetches favicon from Google,
//      displays in a glass-effect card with domain name underneath.
const BrandThumbnail = ({ domain, isHeadline = false }) => {
  const color = getDomainColor(domain);

  // MODE 1: Full-bleed brand promo image (e.g. TradingView)
  const fullBleedImageKey = Object.keys(FULL_BLEED_BRAND_IMAGES).find((d) =>
    domain?.includes(d)
  );
  if (fullBleedImageKey) {
    const imgUrl = FULL_BLEED_BRAND_IMAGES[fullBleedImageKey];
    return (
      <div className="w-full h-full overflow-hidden bg-black">
        <img
          src={imgUrl}
          alt={domain}
          className="w-full h-full object-cover"
          style={{ objectPosition: "10% center" }}
          loading="lazy"
        />
      </div>
    );
  }

  // MODE 2: LuxQuant logo for headlines / aggregated news
  if (isHeadline) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center select-none relative overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 50% 40%, rgba(212,168,83,0.18) 0%, rgba(212,168,83,0.04) 55%, rgba(0,0,0,0.4) 100%)",
        }}
      >
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: `
              linear-gradient(rgba(212,168,83,0.04) 1px, transparent 1px),
              linear-gradient(90deg, rgba(212,168,83,0.04) 1px, transparent 1px)
            `,
            backgroundSize: "18px 18px",
          }}
        />
        {/* Gold corner accent */}
        <div
          className="absolute top-0 right-0 w-12 h-12 pointer-events-none"
          style={{
            background:
              "linear-gradient(135deg, transparent 50%, rgba(212,168,83,0.22) 50%)",
          }}
        />
        {/* LuxQuant logo */}
        <div className="relative z-10 flex flex-col items-center gap-2">
          <img
            src={LUXQUANT_LOGO}
            alt="LuxQuant"
            className="w-16 h-16 sm:w-20 sm:h-20 object-contain"
            style={{
              filter: "drop-shadow(0 4px 20px rgba(212,168,83,0.35))",
            }}
          />
          <span
            className="text-[9px] font-mono uppercase tracking-[0.25em]"
            style={{ color: "rgba(212,168,83,0.85)" }}
          >
            LuxQuant News
          </span>
        </div>
      </div>
    );
  }

  // MODE 3: Standard favicon-in-glass-card fallback
  const faviconUrl = getFaviconUrl(domain, 128);
  return <FaviconGlassCard domain={domain} faviconUrl={faviconUrl} color={color} />;
};

// Helper sub-component for MODE 3 (extracted to keep useState scoped correctly)
const FaviconGlassCard = ({ domain, faviconUrl, color }) => {
  const [faviconFailed, setFaviconFailed] = useState(false);

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center select-none relative overflow-hidden"
      style={{
        background: `radial-gradient(circle at 35% 25%, ${color}28 0%, ${color}06 55%, ${color}14 100%)`,
      }}
    >
      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "18px 18px",
        }}
      />
      {/* Corner accent */}
      <div
        className="absolute top-0 right-0 w-12 h-12 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, transparent 50%, ${color}25 50%)`,
        }}
      />
      <div className="relative z-10 flex flex-col items-center gap-1.5">
        {faviconUrl && !faviconFailed ? (
          <div
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center"
            style={{
              background: "rgba(255,255,255,0.06)",
              backdropFilter: "blur(8px)",
              border: `1px solid ${color}40`,
              boxShadow: `0 4px 20px ${color}30`,
            }}
          >
            <img
              src={faviconUrl}
              alt={domain}
              className="w-8 h-8 sm:w-9 sm:h-9 object-contain"
              onError={() => setFaviconFailed(true)}
            />
          </div>
        ) : (
          <div
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center font-bold text-xl"
            style={{
              background: `${color}25`,
              color,
              border: `1px solid ${color}50`,
              fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: "-0.05em",
            }}
          >
            {shortDomain(domain).slice(0, 2).toUpperCase()}
          </div>
        )}
        <span
          className="text-[9px] font-mono uppercase tracking-[0.2em] mt-1"
          style={{ color: `${color}cc` }}
        >
          {shortDomain(domain)}
        </span>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════
// 3. NEWS DETAIL MODAL
// ════════════════════════════════════════════

const NewsModal = ({ item, onClose }) => {
  const [extract, setExtract] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!item?.id) return;
    setLoading(true);
    fetch(`${API_BASE}/crypto-news-feed/extract/${item.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setExtract(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [item?.id]);

  if (!item) return null;

  const imgSrc = extract?.top_image || getImageSrc(item);
  const videoSrc = getVideoSrc(extract) || getVideoSrc(item);
  const summary = extract?.summary || item.description || null;
  const fullText = extract?.full_text || item.raw_text || null;
  const keywords = extract?.keywords || [];
  const authors = extract?.authors || [];
  const isPhoto = item.content_type === "photo";
  const color = getDomainColor(item.domain);

  const header = (
    <div className="flex items-center gap-2">
      <DomainBadge domain={item.domain} size="lg" />
      {isPhoto && (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">
          photo
        </span>
      )}
      <span className="text-text-muted text-[10px] font-mono">{timeAgo(item.created_at)}</span>
    </div>
  );

  const footer = (close) => (
    <div className="flex items-center justify-end gap-2">
      {item.url && (
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
      )}
      <button
        onClick={close}
        className="px-4 py-2.5 rounded-xl text-sm text-text-muted bg-white/[0.03] border border-white/5 hover:text-white hover:border-white/15 transition-all"
      >
        Close
      </button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      padded={false}
      accentColor={color}
      header={header}
      footer={footer}
    >
      {/* Image / Video / Placeholder — object-contain, full image visible */}
      <div className="relative w-full bg-black/40 flex items-center justify-center" style={{ maxHeight: "45vh", minHeight: "10rem" }}>
        {videoSrc ? (
          <video
            src={videoSrc}
            poster={imgSrc || undefined}
            controls
            autoPlay
            muted
            playsInline
            preload="metadata"
            ref={(el) => { if (el) el.muted = true; }}
            className="w-auto h-auto max-w-full max-h-[45vh] object-contain bg-black"
          />
        ) : imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            className="w-auto h-auto max-w-full max-h-[45vh] object-contain"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div className="w-full" style={{ aspectRatio: "16 / 9" }}>
            <BrandThumbnail domain={item.domain} isHeadline={item.content_type === "headline"} />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-5 space-y-4">
        <h2
          className="text-white text-lg sm:text-2xl leading-tight"
          style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, letterSpacing: "-0.02em" }}
        >
          {item.title}
        </h2>

        {authors.length > 0 && (
          <p className="text-text-muted text-[11px] font-mono">BY {authors.join(", ").toUpperCase()}</p>
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
              <span key={i} className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] border border-white/5 text-text-muted">
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
            <p className="text-text-muted text-[12px] leading-relaxed whitespace-pre-line">
              {fullText.slice(0, 800)}{fullText.length > 800 ? "…" : ""}
            </p>
          </div>
        )}
      </div>
    </Modal>
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
// 5. UNIFORM CARD — single card type for all items
// ════════════════════════════════════════════
//
// Layout (square 1:1):
//   ┌──────────────────────┐
//   │  [thumbnail or       │  ← image area (object-cover)
//   │   brand fallback]    │
//   │  [domain badge TL]   │
//   │  [photo badge TR]    │
//   ├──────────────────────┤
//   │  Title (2-line clamp)│  ← compact footer
//   │  domain · time       │
//   └──────────────────────┘
//
// All items use this — articles, photos, headlines — visually unified.

const UniformCard = ({ item, onSelect, variant = "default" }) => {
  const imgSrc = getImageSrc(item);
  const color = getDomainColor(item.domain);
  const isPhoto = item.content_type === "photo";
  const isHeadline = variant === "headline" || item.content_type === "headline";
  const hasVideo = !!getVideoSrc(item);

  return (
    <article
      onClick={() => onSelect(item)}
      className="group cursor-pointer rounded-xl overflow-hidden bg-white/[0.02] border border-white/5 hover:border-gold-primary/30 hover:bg-white/[0.04] transition-all duration-300 flex flex-col"
      style={{
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}
    >
      {/* Image / thumbnail area — square aspect */}
      <div className="relative w-full aspect-square overflow-hidden flex-shrink-0">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        ) : (
          <BrandThumbnail domain={item.domain} isHeadline={isHeadline} />
        )}

        {/* Subtle bottom gradient for badge legibility when image present */}
        {imgSrc && (
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        )}

        {/* Play badge for video items */}
        {hasVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-black/55 border border-white/30 backdrop-blur-sm">
              <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </div>
        )}

        {/* NEWS badge — top-right, only for headlines (kept as content type indicator) */}
        {isHeadline && !isPhoto && (
          <div className="absolute top-2 right-2 z-10">
            <span className="px-1.5 py-0.5 rounded text-[8px] font-mono uppercase tracking-[0.15em] backdrop-blur-sm bg-gold-primary/25 text-gold-primary border border-gold-primary/50">
              news
            </span>
          </div>
        )}

        {/* Hover overlay tint */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{
            background: `linear-gradient(180deg, ${color}00 60%, ${color}15 100%)`,
          }}
        />
      </div>

      {/* Footer — title + meta */}
      <div className="p-2.5 flex flex-col gap-1.5 flex-1">
        <h4
          className="text-white text-[11.5px] leading-snug line-clamp-2 group-hover:text-gold-primary transition-colors"
          style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500 }}
          title={item.title}
        >
          {item.title}
        </h4>
        <div className="flex items-center justify-between mt-auto pt-1 border-t border-white/5">
          <span className="text-text-muted text-[9px] font-mono uppercase tracking-wider truncate">
            {shortDomain(item.domain)}
          </span>
          <span className="text-text-muted/70 text-[9px] font-mono flex-shrink-0 ml-1">
            {timeAgo(item.created_at)}
          </span>
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
// 8. LOADING SKELETON — uniform grid
// ════════════════════════════════════════════

const LoadingSkeleton = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
      {[...Array(15)].map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-white/[0.02] border border-white/5 overflow-hidden animate-pulse"
        >
          <div className="aspect-square bg-white/5" />
          <div className="p-2.5 space-y-1.5">
            <div className="h-2.5 bg-white/5 rounded w-3/4" />
            <div className="h-2 bg-white/5 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ════════════════════════════════════════════
// 9. FILTER BAR — search + type + category (redesigned)
// ════════════════════════════════════════════
//
// Design principles:
// - Single visual container (1 card unifies all filter controls)
// - Consistent chip sizing (h-7, all chips identical height)
// - No inline form-style labels — segments separated by subtle divider
// - Search dominant at top; filter chips below with visual rhythm
// - Active state: gold accent (consistent with brand)
// - Hover state: subtle bg lift, no border flash

const FilterChip = ({ active, onClick, children, color }) => {
  // Unified chip — same dimensions for type & category filters
  // `color` optional: overrides active state color (used by category chips for per-category color)
  const baseClass =
    "inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-mono uppercase tracking-[0.08em] transition-all duration-200 whitespace-nowrap";
  if (active && color) {
    return (
      <button
        onClick={onClick}
        className={baseClass}
        style={{
          background: `${color}18`,
          color,
          border: `1px solid ${color}40`,
          boxShadow: `inset 0 0 0 1px ${color}08`,
        }}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`${baseClass} ${
        active
          ? "bg-gold-primary/15 text-gold-primary border border-gold-primary/40"
          : "bg-white/[0.02] text-text-muted border border-white/5 hover:bg-white/[0.04] hover:text-white hover:border-white/10"
      }`}
    >
      {children}
    </button>
  );
};

const ChipCount = ({ value, active, color }) => {
  if (value === undefined || value === null) return null;
  return (
    <span
      className="text-[9px] font-mono tabular-nums px-1.5 py-px rounded ml-0.5 opacity-80"
      style={{
        background: active
          ? color
            ? `${color}25`
            : "rgba(212, 168, 83, 0.2)"
          : "rgba(255,255,255,0.05)",
      }}
    >
      {value}
    </span>
  );
};

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
}) => {
  const typeOptions = [
    { k: "all", label: "All", count: stats?.total },
    { k: "article", label: "Articles", count: stats?.articles },
    { k: "photo", label: "Photos", count: stats?.photos },
    { k: "headline", label: "Headlines", count: stats?.headlines },
  ];

  return (
    <div
      className="rounded-2xl border border-white/[0.06] overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.018) 0%, rgba(255,255,255,0.008) 100%)",
      }}
    >
      {/* SEARCH ROW */}
      <div className="p-3 sm:p-4 border-b border-white/[0.04]">
        <div className="relative">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted/70"
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
            className="w-full pl-11 pr-10 py-2.5 rounded-lg bg-black/20 border border-white/[0.06] text-white text-[13px] placeholder:text-text-muted/40 focus:outline-none focus:border-gold-primary/30 focus:bg-black/30 transition-all"
          />
          {searchInput && (
            <button
              onClick={onClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-text-muted/60 hover:text-white hover:bg-white/5 transition-all"
              title="Clear search"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* FILTERS ROW — type chips + divider + category chips, all same height */}
      <div className="px-3 sm:px-4 py-3 flex flex-wrap items-center gap-1.5">
        {/* Type chips */}
        {typeOptions.map((f) => {
          const isActive = activeFilter === f.k;
          return (
            <FilterChip key={f.k} active={isActive} onClick={() => onFilterChange(f.k)}>
              {f.label}
              <ChipCount value={f.count} active={isActive} />
            </FilterChip>
          );
        })}

        {/* Subtle vertical divider between type & category */}
        <span
          className="h-5 w-px mx-1.5 bg-white/[0.08]"
          aria-hidden="true"
        />

        {/* Category: All */}
        <FilterChip
          active={!activeCategory}
          onClick={() => onCategoryChange(null)}
        >
          <span className="opacity-60">◆</span>
          <span>All</span>
        </FilterChip>

        {/* Per-category chips */}
        {CATEGORY_RULES.map((cat) => {
          const isActive = activeCategory === cat.key;
          const count = categoryCounts[cat.key];
          return (
            <FilterChip
              key={cat.key}
              active={isActive}
              color={isActive ? cat.color : undefined}
              onClick={() => onCategoryChange(isActive ? null : cat.key)}
            >
              <span
                className="leading-none text-[13px]"
                style={{ color: isActive ? cat.color : undefined, opacity: isActive ? 1 : 0.7 }}
              >
                {cat.icon}
              </span>
              <span>{cat.label}</span>
              <ChipCount value={count} active={isActive} color={isActive ? cat.color : undefined} />
            </FilterChip>
          );
        })}
      </div>
    </div>
  );
};

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

  const searchTimeout = useRef(null);

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

  // Pulse ticker: 12 latest non-photo (shown only on page 1, no search)
  const pulseItems = useMemo(() => {
    if (page !== 1 || searchQuery) return [];
    return allItems.filter((i) => i.content_type !== "photo").slice(0, 12);
  }, [allItems, page, searchQuery]);

  // Latest Headlines section (max 5, only when no search/category filter narrowing)
  const headlinesSection = useMemo(() => {
    if (page !== 1 || searchQuery || activeCategory || activeFilter === "headline") return [];
    return filteredItems.filter((i) => i.content_type === "headline").slice(0, 5);
  }, [filteredItems, page, searchQuery, activeCategory, activeFilter]);

  // Main grid: everything except items shown in Latest Headlines section
  const mainGridItems = useMemo(() => {
    const usedIds = new Set(headlinesSection.map((h) => h.id));
    return filteredItems.filter((i) => !usedIds.has(i.id));
  }, [filteredItems, headlinesSection]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── Render ─────────────────────────────
  return (
    <div className="space-y-5 sm:space-y-6">
      {selectedItem && <NewsModal item={selectedItem} onClose={() => setSelectedItem(null)} />}

      {/* HEADER */}
      <header className="pb-3 border-b border-white/5">
        <h1
          className="text-3xl sm:text-4xl text-white"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 600,
            letterSpacing: "-0.025em",
          }}
        >
          Crypto News
        </h1>
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
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
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
            {/* LATEST HEADLINES — uniform card grid, separate section */}
            {headlinesSection.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-3 rounded-full bg-gold-primary" />
                    <h2 className="text-[10px] font-mono uppercase tracking-[0.25em] text-text-muted">
                      Latest Headlines
                    </h2>
                  </div>
                  <span className="text-[10px] font-mono text-text-muted">
                    {headlinesSection.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                  {headlinesSection.map((item) => (
                    <UniformCard
                      key={item.id}
                      item={item}
                      onSelect={setSelectedItem}
                      variant="headline"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* MAIN GRID — uniform 5-column dense */}
            {mainGridItems.length > 0 && (
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
                    {mainGridItems.length} stories
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                  {mainGridItems.map((item) => (
                    <UniformCard key={item.id} item={item} onSelect={setSelectedItem} />
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

    </div>
  );
};

export default CryptoNewsPage;