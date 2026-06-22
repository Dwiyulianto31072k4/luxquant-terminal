// src/components/CryptoNewsPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Crypto News v6 (Editorial hierarchy redesign)
// Lead hero + secondary 2-up + scannable list rows (NN/g best practice)
// Desktop: lead → secondary → list. Mobile: lead → small left-thumb rows.
// Boxed gold-edge cards · brand favicons · info-dense · high-contrast chips
//
// NOTE (activity-tracking fix): semua fetch ke backend sekarang lewat
// instance `api` (src/services/authApi.js) bukan `fetch()` polos, supaya
// Bearer token tersisip otomatis (lewat axios interceptor) kalau user
// sedang login. Endpoint /crypto-news-feed/* tetap publik (boleh diakses
// tanpa login), tapi dengan ini ActivityTrackerMiddleware di backend bisa
// mencatat kunjungan halaman News untuk user yang sedang login.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { GoldButton, GhostButton } from "./autotrade/AutoTradeUI";
import Modal from "./ui/Modal";
import api from "../services/authApi";
import { useSearchParams } from "react-router-dom";

const PAGE_SIZE = 30;

// Brand assets (in /public — referenced by absolute path)
const LUXQUANT_LOGO = "/logo.png";
const TRADINGVIEW_IMAGE = "/news-flow-tradingview.jpg";

// Domains that should display their own promo/marketing image as full-bleed thumbnail
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

const hasBrandImage = (item) =>
  Object.keys(FULL_BLEED_BRAND_IMAGES).some((d) => item?.domain?.includes(d));

// "Visual" = has a real image OR a full-bleed brand promo (good enough to anchor a hero)
const hasVisual = (item) => !!getImageSrc(item) || hasBrandImage(item);

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

// BrandThumbnail — full-bleed brand image / LuxQuant logo / favicon glass card
const BrandThumbnail = ({ domain, isHeadline = false }) => {
  const color = getDomainColor(domain);

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

  if (isHeadline) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center select-none relative overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 50% 40%, rgba(212,168,83,0.18) 0%, rgba(212,168,83,0.04) 55%, rgba(0,0,0,0.4) 100%)",
        }}
      >
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
        <div
          className="absolute top-0 right-0 w-12 h-12 pointer-events-none"
          style={{
            background:
              "linear-gradient(135deg, transparent 50%, rgba(212,168,83,0.22) 50%)",
          }}
        />
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

  const faviconUrl = getFaviconUrl(domain, 128);
  return <FaviconGlassCard domain={domain} faviconUrl={faviconUrl} color={color} />;
};

const FaviconGlassCard = ({ domain, faviconUrl, color }) => {
  const [faviconFailed, setFaviconFailed] = useState(false);

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center select-none relative overflow-hidden"
      style={{
        background: `radial-gradient(circle at 35% 25%, ${color}28 0%, ${color}06 55%, ${color}14 100%)`,
      }}
    >
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

// RowThumb — compact thumbnail for list rows (image / brand promo / favicon / initials)
const RowThumb = ({ item }) => {
  const [failed, setFailed] = useState(false);
  const imgSrc = getImageSrc(item);
  const color = getDomainColor(item.domain);

  if (imgSrc) {
    return (
      <img
        src={imgSrc}
        alt=""
        loading="lazy"
        className="w-full h-full object-cover"
        onError={(e) => { e.target.style.display = "none"; }}
      />
    );
  }

  const brandKey = Object.keys(FULL_BLEED_BRAND_IMAGES).find((d) => item.domain?.includes(d));
  if (brandKey) {
    return (
      <img
        src={FULL_BLEED_BRAND_IMAGES[brandKey]}
        alt=""
        loading="lazy"
        className="w-full h-full object-cover"
        style={{ objectPosition: "10% center" }}
      />
    );
  }

  const fav = getFaviconUrl(item.domain, 64);
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ background: `${color}1a` }}>
      {fav && !failed ? (
        <img src={fav} alt="" className="w-7 h-7 object-contain" onError={() => setFailed(true)} />
      ) : (
        <span className="font-mono text-[11px] font-bold" style={{ color }}>
          {shortDomain(item.domain).slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
};

// Reusable gold hairline edges (left / right / top) — boxed card language
const GoldEdges = () => (
  <>
    <span className="absolute left-0 inset-y-0 w-px z-20 pointer-events-none" style={{ background: "linear-gradient(180deg, transparent, rgba(212,168,83,0.5), transparent)" }} />
    <span className="absolute right-0 inset-y-0 w-px z-20 pointer-events-none" style={{ background: "linear-gradient(180deg, transparent, rgba(212,168,83,0.5), transparent)" }} />
    <span className="absolute top-0 inset-x-0 h-px z-20 pointer-events-none" style={{ background: "linear-gradient(90deg, transparent, rgba(212,168,83,0.4), transparent)" }} />
  </>
);

// ════════════════════════════════════════════
// 3. NEWS DETAIL MODAL
// ════════════════════════════════════════════

const NewsModal = ({ item, onClose }) => {
  const [extract, setExtract] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!item?.id) return;
    setLoading(true);
    api.get(`/api/v1/crypto-news-feed/extract/${item.id}`)
      .then((res) => { if (res.data) setExtract(res.data); })
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
        <GoldButton
          onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}
          className="flex flex-1 items-center justify-center gap-2"
        >
          Read Full Article
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </GoldButton>
      )}
      <GhostButton onClick={close}>Close</GhostButton>
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

      <div className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-r from-[#0c0a10] to-transparent" />
      <div className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-l from-[#0c0a10] to-transparent" />

      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" style={{ boxShadow: "0 0 8px #ef4444" }} />
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-red-400/90">Live</span>
      </div>

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
// 5. EDITORIAL CARDS — LeadCard, SecondaryCard, ListRow
// ════════════════════════════════════════════

// LeadCard — hero. Desktop: image left (44%) + content. Mobile: image top + content.
const LeadCard = ({ item, onSelect }) => {
  const imgSrc = getImageSrc(item);
  const isHeadline = item.content_type === "headline";
  const hasVideo = !!getVideoSrc(item);

  return (
    <article
      onClick={() => onSelect(item)}
      className="group relative cursor-pointer rounded-md overflow-hidden bg-[#0a0805] border border-white/[0.08] hover:border-gold-primary/30 transition-all duration-300 flex flex-col lg:flex-row lg:min-h-[230px]"
      style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}
    >
      <GoldEdges />

      {/* Image */}
      <div className="relative w-full lg:w-[44%] flex-shrink-0 aspect-[16/10] lg:aspect-auto overflow-hidden bg-black/30">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <BrandThumbnail domain={item.domain} isHeadline={isHeadline} />
        )}
        {hasVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="flex items-center justify-center w-12 h-12 rounded-full bg-black/55 border border-white/30 backdrop-blur-sm">
              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 p-4 sm:p-5 flex flex-col justify-center gap-2.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-gold-primary/85">Lead Story</span>
        <h2
          className="text-white text-lg sm:text-xl lg:text-2xl leading-tight group-hover:text-gold-primary transition-colors line-clamp-3"
          style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, letterSpacing: "-0.02em" }}
        >
          {item.title}
        </h2>
        {item.description && (
          <p className="text-text-secondary/80 text-[12.5px] sm:text-[13px] leading-relaxed line-clamp-2">
            {item.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <DomainBadge domain={item.domain} size="lg" />
          <span className="text-text-muted text-[10px] font-mono">{timeAgo(item.created_at)}</span>
        </div>
      </div>
    </article>
  );
};

// SecondaryCard — medium card: landscape image top + title + meta (desktop tier)
const SecondaryCard = ({ item, onSelect }) => {
  const imgSrc = getImageSrc(item);
  const color = getDomainColor(item.domain);
  const isHeadline = item.content_type === "headline";
  const hasVideo = !!getVideoSrc(item);

  return (
    <article
      onClick={() => onSelect(item)}
      className="group relative cursor-pointer rounded-md overflow-hidden bg-[#0a0805] border border-white/[0.08] hover:border-gold-primary/30 hover:bg-white/[0.04] transition-all duration-300 flex flex-col"
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
    >
      <GoldEdges />

      <div className="relative w-full aspect-[16/10] overflow-hidden flex-shrink-0">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <BrandThumbnail domain={item.domain} isHeadline={isHeadline} />
        )}
        {imgSrc && (
          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        )}
        {hasVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-black/55 border border-white/30 backdrop-blur-sm">
              <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <h4
          className="text-white text-[13px] leading-snug line-clamp-2 group-hover:text-gold-primary transition-colors"
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

// ListRow — scannable horizontal row: thumbnail left + title + source · time
const ListRow = ({ item, onSelect }) => {
  const color = getDomainColor(item.domain);
  const hasVideo = !!getVideoSrc(item);

  return (
    <button
      onClick={() => onSelect(item)}
      className="group relative w-full flex gap-3 p-2.5 rounded-md text-left hover:bg-white/[0.03] transition-colors border-b border-white/[0.04] last:border-b-0"
    >
      {/* Gold left accent on hover */}
      <span
        className="absolute left-0 inset-y-2.5 w-px opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "linear-gradient(180deg, transparent, rgba(212,168,83,0.6), transparent)" }}
      />
      <div className="relative w-[72px] h-[72px] rounded-md overflow-hidden flex-shrink-0 bg-[#0a0805] border border-white/[0.06]">
        <RowThumb item={item} />
        {hasVideo && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-black/55 border border-white/30">
              <svg className="w-3 h-3 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <h4
          className="text-white text-[12.5px] leading-snug line-clamp-2 group-hover:text-gold-primary transition-colors"
          style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500 }}
          title={item.title}
        >
          {item.title}
        </h4>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color }}>
            {shortDomain(item.domain)}
          </span>
          <span className="text-text-muted/60 text-[9px] font-mono">· {timeAgo(item.created_at)}</span>
        </div>
      </div>
    </button>
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
// 8. LOADING SKELETON — editorial layout
// ════════════════════════════════════════════

const LoadingSkeleton = () => (
  <div className="flex flex-col lg:flex-row gap-4 sm:gap-5">
    <div className="flex-1 min-w-0 space-y-4">
      {/* Lead skeleton */}
      <div className="rounded-md bg-white/[0.02] border border-white/5 overflow-hidden animate-pulse flex flex-col lg:flex-row lg:min-h-[230px]">
        <div className="w-full lg:w-[44%] aspect-[16/10] lg:aspect-auto bg-white/5" />
        <div className="flex-1 p-5 space-y-3">
          <div className="h-2.5 w-20 bg-white/5 rounded" />
          <div className="h-5 w-5/6 bg-white/5 rounded" />
          <div className="h-3 w-full bg-white/5 rounded" />
          <div className="h-3 w-2/3 bg-white/5 rounded" />
        </div>
      </div>
      {/* Secondary skeleton */}
      <div className="hidden lg:grid lg:grid-cols-2 gap-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="rounded-md bg-white/[0.02] border border-white/5 overflow-hidden animate-pulse">
            <div className="aspect-[16/10] bg-white/5" />
            <div className="p-3 space-y-1.5">
              <div className="h-2.5 bg-white/5 rounded w-3/4" />
              <div className="h-2 bg-white/5 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
      {/* Rows skeleton */}
      <div className="space-y-1">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex gap-3 p-2.5 animate-pulse">
            <div className="w-[72px] h-[72px] rounded-md bg-white/5 flex-shrink-0" />
            <div className="flex-1 space-y-2 py-2">
              <div className="h-2.5 bg-white/5 rounded w-5/6" />
              <div className="h-2 bg-white/5 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
    <aside className="w-full lg:w-72 xl:w-80 flex-shrink-0">
      <div className="rounded-xl bg-white/[0.02] border border-white/5 h-52 animate-pulse" />
    </aside>
  </div>
);

// ════════════════════════════════════════════
// 9. FILTER BAR — search + type + category (high-contrast chips)
// ════════════════════════════════════════════

const FilterChip = ({ active, onClick, children, color }) => {
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
          : "bg-white/[0.05] text-white/80 border border-white/[0.13] hover:bg-white/[0.08] hover:text-white hover:border-white/25"
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
      className="text-[9px] font-mono tabular-nums px-1.5 py-px rounded ml-0.5"
      style={{
        background: active
          ? color
            ? `${color}25`
            : "rgba(212, 168, 83, 0.2)"
          : "rgba(255,255,255,0.1)",
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

      <div className="px-3 sm:px-4 py-3 flex flex-wrap items-center gap-1.5">
        {typeOptions.map((f) => {
          const isActive = activeFilter === f.k;
          return (
            <FilterChip key={f.k} active={isActive} onClick={() => onFilterChange(f.k)}>
              {f.label}
              <ChipCount value={f.count} active={isActive} />
            </FilterChip>
          );
        })}

        <span className="h-5 w-px mx-1.5 bg-white/[0.08]" aria-hidden="true" />

        <FilterChip active={!activeCategory} onClick={() => onCategoryChange(null)}>
          <span className="opacity-60">◆</span>
          <span>All</span>
        </FilterChip>

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
  const [allItems, setAllItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [trending, setTrending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Modal artikel URL-driven: ?article=<id>
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedArticleId = searchParams.get("article");
  const articleCacheRef = useRef(new Map());

  const [activeFilter, setActiveFilter] = useState("all");
  const [activeCategory, setActiveCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const searchTimeout = useRef(null);

  const fetchFeed = useCallback(
    async (pg = 1) => {
      try {
        setLoading(true);
        const params = {
          limit: PAGE_SIZE,
          offset: (pg - 1) * PAGE_SIZE,
        };
        if (activeFilter !== "all") params.content_type = activeFilter;
        if (searchQuery) params.search = searchQuery;
        const res = await api.get(`/api/v1/crypto-news-feed/feed`, { params });
        setAllItems(res.data.items || []);
        setTotal(res.data.total || 0);
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
        api.get(`/api/v1/crypto-news-feed/stats`),
        api.get(`/api/v1/crypto-news-feed/trending`),
      ]);
      setStats(sR.data);
      setTrending(tR.data);
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


  // ── Article modal (URL-driven, dgn cache spy modal ga ilang saat refresh) ──
  useEffect(() => {
    for (const it of allItems) {
      if (it && it.id != null) articleCacheRef.current.set(String(it.id), it);
    }
  }, [allItems]);

  const selectedItem = useMemo(() => {
    if (!selectedArticleId) return null;
    return (
      allItems.find((it) => String(it.id) === String(selectedArticleId)) ||
      articleCacheRef.current.get(String(selectedArticleId)) ||
      null
    );
  }, [selectedArticleId, allItems]);

  const openArticle = useCallback((item) => {
    if (!item || item.id == null) return;
    articleCacheRef.current.set(String(item.id), item);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("article", String(item.id));
      return next;
    });
  }, [setSearchParams]);

  const closeArticle = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("article");
      return next;
    });
  }, [setSearchParams]);

  // ── Handlers ───────────────────────────

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
  const itemsWithCategory = useMemo(() => {
    return allItems.map((item) => ({ ...item, _category: categorizeItem(item) }));
  }, [allItems]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    itemsWithCategory.forEach((item) => {
      if (item._category) counts[item._category] = (counts[item._category] || 0) + 1;
    });
    return counts;
  }, [itemsWithCategory]);

  const filteredItems = useMemo(() => {
    if (!activeCategory) return itemsWithCategory;
    return itemsWithCategory.filter((item) => item._category === activeCategory);
  }, [itemsWithCategory, activeCategory]);

  // Editorial hierarchy is used only on the unfiltered main feed (page 1)
  const heroEnabled =
    page === 1 && !searchQuery && !activeCategory && activeFilter === "all";

  // Partition into lead / secondary / list — prefer visual items for hero tiers
  const { lead, secondary, listItems } = useMemo(() => {
    if (!heroEnabled || filteredItems.length === 0) {
      return { lead: null, secondary: [], listItems: filteredItems };
    }
    const SECONDARY_COUNT = 4; // lead + 4 = 5 top stories
    const used = new Set();
    const leadItem = filteredItems.find(hasVisual) || filteredItems[0];
    if (leadItem) used.add(leadItem.id);

    const sec = [];
    for (const it of filteredItems) {
      if (sec.length >= SECONDARY_COUNT) break;
      if (used.has(it.id)) continue;
      if (hasVisual(it)) {
        sec.push(it);
        used.add(it.id);
      }
    }
    // backfill if fewer than SECONDARY_COUNT visual items available
    if (sec.length < SECONDARY_COUNT) {
      for (const it of filteredItems) {
        if (sec.length >= SECONDARY_COUNT) break;
        if (!used.has(it.id)) {
          sec.push(it);
          used.add(it.id);
        }
      }
    }
    const list = filteredItems.filter((it) => !used.has(it.id));
    return { lead: leadItem, secondary: sec, listItems: list };
  }, [filteredItems, heroEnabled]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const sectionLabel = activeCategory
    ? CATEGORY_RULES.find((c) => c.key === activeCategory)?.label
    : searchQuery
    ? "Results"
    : "Top Stories";

  // ── Render ─────────────────────────────
  return (
    <div className="space-y-5 sm:space-y-6">
      {selectedItem && <NewsModal item={selectedItem} onClose={closeArticle} />}

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
          <div className="flex-1 min-w-0 space-y-4">
            {/* Section label */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1 h-3 rounded-full bg-gold-primary" />
                <h2 className="text-[10px] font-mono uppercase tracking-[0.25em] text-text-muted">
                  {sectionLabel}
                </h2>
              </div>
              <span className="text-[10px] font-mono text-text-muted">
                {filteredItems.length} stories
              </span>
            </div>

            {/* LEAD HERO */}
            {lead && <LeadCard item={lead} onSelect={openArticle} />}

            {/* SECONDARY — top-stories tier (4 cards, steps down from lead) */}
            {secondary.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {secondary.map((it) => (
                  <SecondaryCard key={it.id} item={it} onSelect={openArticle} />
                ))}
              </div>
            )}

            {/* MORE STORIES — uniform image-card grid (replaces thin list rows) */}
            {listItems.length > 0 && (
              <div className="space-y-3 pt-2">
                {lead && (
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-3 rounded-full bg-gold-primary/70" />
                    <h3 className="text-[10px] font-mono uppercase tracking-[0.25em] text-text-muted">
                      More Stories
                    </h3>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {listItems.map((it) => (
                    <SecondaryCard key={it.id} item={it} onSelect={openArticle} />
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