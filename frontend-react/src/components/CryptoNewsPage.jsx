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
import Modal from "./ui/Modal";
import api from "../services/authApi";
import { useSearchParams } from "react-router-dom";
import AssistantWidget from "./assistant/AssistantWidget";
import { ShimmerStyles } from "./ui/Loaders";

const PAGE_SIZE = 28; // multiple of 4 → fills the desktop 4-col grid without lone trailing cards

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
  { key: "listings", label: "Listings", icon: "▲", color: "rgb(var(--warn))", patterns: [/listing|listed on|upbit|kucoin|binance listing/i, /token unlock|airdrop/i] },
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
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border border-white/[0.1] bg-white/[0.04] font-mono uppercase tracking-[0.12em] text-text-muted ${
        size === "lg" ? "px-2 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[9px]"
      }`}
    >
      <span className="h-1 w-1 rounded-full bg-white/45" />
      {shortDomain(domain)}
    </span>
  );
};

// Decode HTML entities that sometimes leak into summaries (&nbsp; etc.)
const cleanText = (s) => {
  if (!s) return "";
  try {
    const el = document.createElement("textarea");
    el.innerHTML = String(s);
    return el.value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  } catch {
    return String(s).replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").trim();
  }
};

// BrandThumbnail — solid black "wire" card (Bloomberg-style masthead).
// No gold glow / grid / corner fold — logo + wordmark only.
const BrandThumbnail = ({ domain, isHeadline = false, compact = false }) => {
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

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center select-none overflow-hidden bg-[#050505]">
      {/* subtle top rule — terminal masthead, not a glow */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08]" />
      <div className={`relative z-10 flex flex-col items-center ${compact ? "gap-1.5" : "gap-2.5"}`}>
        <img
          src={LUXQUANT_LOGO}
          alt="LuxQuant"
          className={`object-contain opacity-95 ${compact ? "w-9 h-9" : "w-14 h-14 sm:w-16 sm:h-16"}`}
        />
        <div className="flex flex-col items-center gap-0.5">
          <span
            className={`font-mono uppercase tracking-[0.28em] text-white/75 ${
              compact ? "text-[7px]" : "text-[9px] sm:text-[10px]"
            }`}
          >
            LuxQuant
          </span>
          <span
            className={`font-mono uppercase tracking-[0.22em] text-white/40 ${
              compact ? "text-[6.5px]" : "text-[8px]"
            }`}
          >
            News
          </span>
        </div>
      </div>
      {isHeadline ? (
        <span className="absolute bottom-2 left-2 font-mono text-[8px] uppercase tracking-[0.16em] text-white/35">
          Wire
        </span>
      ) : null}
    </div>
  );
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
const RowThumb = ({ item }) => (
  <MediaBlock item={item} className="absolute inset-0" playSize="sm" compact />
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
    <div className="flex items-center gap-2">
      {item.url && (
        <button
          type="button"
          onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}
          className="flex flex-1 h-10 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.1] text-[12px] font-semibold uppercase tracking-[0.12em] text-text-primary transition hover:bg-white/[0.14] active:scale-[0.99]"
        >
          Read full article
          <svg className="h-3.5 w-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      )}
      <button
        type="button"
        onClick={close}
        className="h-10 shrink-0 rounded-lg border border-white/[0.1] px-4 text-[12px] font-medium uppercase tracking-[0.1em] text-text-muted transition hover:border-white/20 hover:text-text-primary"
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
      header={header}
      footer={footer}
    >
      {/* Image / Video / solid LQ News wire card */}
      <div className="relative w-full bg-[#050505] flex items-center justify-center" style={{ maxHeight: "42vh", minHeight: "11rem" }}>
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
            className="w-auto h-auto max-w-full max-h-[42vh] object-contain bg-black"
          />
        ) : imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            className="w-auto h-auto max-w-full max-h-[42vh] object-contain"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div className="w-full" style={{ aspectRatio: "16 / 9", maxHeight: "42vh" }}>
            <BrandThumbnail domain={item.domain} isHeadline={item.content_type === "headline"} />
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">
        <h2 className="font-display text-lg sm:text-2xl font-semibold tracking-tight leading-snug text-text-primary">
          {item.title}
        </h2>

        {authors.length > 0 && (
          <p className="text-text-muted text-[11px] font-mono uppercase tracking-[0.12em]">
            By {authors.join(", ")}
          </p>
        )}

        {loading ? (
          <div className="lqsk-group space-y-2">
            <ShimmerStyles />
            <div className="h-3 bg-white/5 rounded w-full" />
            <div className="h-3 bg-white/5 rounded w-5/6" />
            <div className="h-3 bg-white/5 rounded w-4/6" />
          </div>
        ) : summary ? (
          <div className="space-y-2">
            <h3 className="text-text-muted text-[10px] font-mono uppercase tracking-[0.16em]">
              Summary
            </h3>
            <p className="text-text-secondary text-[13.5px] leading-relaxed">{cleanText(summary)}</p>
          </div>
        ) : null}

        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((kw, i) => (
              <span key={i} className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] border border-white/[0.07] text-text-muted">
                #{kw}
              </span>
            ))}
          </div>
        )}

        {fullText && fullText !== summary && (
          <div className="space-y-2 border-t border-white/[0.06] pt-4">
            <h3 className="text-text-muted text-[10px] font-mono uppercase tracking-[0.16em]">
              Article preview
            </h3>
            <p className="text-text-muted text-[12.5px] leading-relaxed whitespace-pre-line">
              {cleanText(fullText).slice(0, 800)}{fullText.length > 800 ? "…" : ""}
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

      <div className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-r from-surface-secondary to-transparent" />
      <div className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-l from-surface-secondary to-transparent" />

      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" style={{ boxShadow: "0 0 8px #ef4444" }} />
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-red-400/90">Live</span>
      </div>

      <div className="flex ticker-track py-2.5 pl-24" style={{ width: "fit-content" }}>
        {[...ticker, ...ticker].map((item, i) => (
          <button
            key={`${item.id}-${i}`}
            onClick={() => onSelect(item)}
            className="flex items-center gap-2 px-4 mr-2 whitespace-nowrap text-[12px] hover:text-text-primary transition-colors group/item"
          >
            <span
              className="w-1 h-1 rounded-full flex-shrink-0"
              style={{ background: getDomainColor(item.domain) }}
            />
            <span className="text-text-muted font-mono text-[10px] uppercase">
              {shortDomain(item.domain)}
            </span>
            <span className="text-text-primary/70 group-hover/item:text-text-primary transition-colors max-w-[420px] truncate">
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
// 5. BLOOMBERG EDITORIAL LAYOUT ATOMS
// ════════════════════════════════════════════

const sourceLabel = (item) =>
  shortDomain(item?.domain) ||
  (item?.source ? String(item.source).slice(0, 18) : "") ||
  "Wire";

// Media with real fallback (never leave a blank black hole after img error)
const MediaBlock = ({ item, className = "", playSize = "md", compact = false }) => {
  const raw = getImageSrc(item);
  const [failed, setFailed] = useState(false);
  const isHeadline = item.content_type === "headline";
  const hasVideo = !!getVideoSrc(item);
  const brandKey = Object.keys(FULL_BLEED_BRAND_IMAGES).find((d) =>
    item?.domain?.includes(d)
  );
  const showPhoto = !!raw && !failed;
  const playCls = playSize === "sm" ? "w-6 h-6" : "w-9 h-9";
  const iconCls = playSize === "sm" ? "w-2.5 h-2.5" : "w-3.5 h-3.5";

  return (
    <div className={`relative overflow-hidden bg-[#050505] ${className}`}>
      {showPhoto ? (
        <img
          src={raw}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          onError={() => setFailed(true)}
        />
      ) : brandKey ? (
        <img
          src={FULL_BLEED_BRAND_IMAGES[brandKey]}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: "10% center" }}
        />
      ) : (
        <div className="absolute inset-0">
          <BrandThumbnail domain={item.domain} isHeadline={isHeadline} compact={compact} />
        </div>
      )}
      {hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span
            className={`flex items-center justify-center rounded-full bg-black/60 border border-white/25 ${playCls}`}
          >
            <svg className={`${iconCls} text-white ml-0.5`} fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
      )}
    </div>
  );
};

// Lead — classic top media + headline (clean, not awkward side-by-side stretch)
const LeadCard = ({ item, onSelect }) => (
  <article onClick={() => onSelect(item)} className="group cursor-pointer h-full flex flex-col">
    <MediaBlock
      item={item}
      className="w-full aspect-[16/10] max-h-[220px] sm:max-h-[240px]"
      playSize="md"
    />
    <div className="pt-2.5 space-y-1.5 flex-1">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
          {sourceLabel(item)}
        </span>
        <span className="text-text-muted/35">·</span>
        <span className="font-mono text-[9px] text-text-muted/65">{timeAgo(item.created_at)}</span>
      </div>
      <h2 className="font-display text-[18px] sm:text-[20px] lg:text-[22px] font-semibold leading-[1.22] tracking-tight text-text-primary group-hover:text-white transition-colors line-clamp-3">
        {item.title}
      </h2>
      {item.description ? (
        <p className="text-[12.5px] leading-snug text-text-secondary line-clamp-2">
          {cleanText(item.description)}
        </p>
      ) : null}
    </div>
  </article>
);

// Stack beside lead
const StackStory = ({ item, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(item)}
    className="group w-full flex gap-2.5 text-left py-2 first:pt-0 last:pb-0 border-b border-white/[0.06] last:border-b-0"
  >
    <MediaBlock item={item} className="w-[72px] h-[54px] shrink-0 rounded-sm" playSize="sm" compact />
    <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
      <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-text-muted">
        {sourceLabel(item)}
        <span className="text-text-muted/35"> · </span>
        {timeAgo(item.created_at)}
      </span>
      <h3 className="font-display text-[13px] font-semibold leading-snug text-text-primary line-clamp-2 group-hover:text-white transition-colors">
        {item.title}
      </h3>
    </div>
  </button>
);

// Mid-band cards — guaranteed image frame height
const SecondaryCard = ({ item, onSelect }) => (
  <article onClick={() => onSelect(item)} className="group cursor-pointer flex flex-col min-w-0">
    <MediaBlock
      item={item}
      className="w-full aspect-[16/10] rounded-sm"
      playSize="sm"
      compact
    />
    <div className="pt-2 space-y-1">
      <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-text-muted">
        {sourceLabel(item)}
        <span className="text-text-muted/35"> · </span>
        {timeAgo(item.created_at)}
      </span>
      <h3 className="font-display text-[13px] font-semibold leading-snug text-text-primary line-clamp-2 group-hover:text-white transition-colors">
        {item.title}
      </h3>
    </div>
  </article>
);

// Wire with thumbnail so previews always show below the fold
const WireRow = ({ item, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(item)}
    className="group grid grid-cols-[48px_minmax(0,1fr)] sm:grid-cols-[48px_48px_84px_minmax(0,1fr)] gap-x-2.5 w-full py-1.5 text-left border-b border-white/[0.05] hover:bg-white/[0.025] transition-colors items-center"
  >
    <span className="font-mono text-[10px] tabular-nums text-text-muted/80 self-start pt-1">
      {timeAgo(item.created_at).replace(" ago", "")}
    </span>
    <MediaBlock
      item={item}
      className="hidden sm:block w-12 h-9 shrink-0 rounded-sm"
      playSize="sm"
      compact
    />
    <span className="hidden sm:block font-mono text-[9.5px] uppercase tracking-[0.1em] text-text-muted/70 truncate self-start pt-1">
      {sourceLabel(item)}
    </span>
    <span className="font-display text-[13px] font-medium leading-snug text-text-primary group-hover:text-white transition-colors line-clamp-2 sm:line-clamp-1 min-w-0">
      <span className="sm:hidden font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted mr-1.5">
        {sourceLabel(item)}
      </span>
      {item.title}
    </span>
  </button>
);

const ListRow = ({ item, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(item)}
    className="group relative w-full flex gap-2.5 py-2 text-left border-b border-white/[0.05]"
  >
    <MediaBlock
      item={item}
      className="w-[68px] h-[52px] shrink-0 rounded-sm"
      playSize="sm"
      compact
    />
    <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
      <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-text-muted">
        {sourceLabel(item)} · {timeAgo(item.created_at)}
      </span>
      <h4 className="font-display text-[13px] font-medium leading-snug line-clamp-2 text-text-primary group-hover:text-white transition-colors">
        {item.title}
      </h4>
    </div>
  </button>
);

// Right rail — compact desk
const MarketDesk = ({ trending, stats, onSearchTopic }) => {
  const topDomains = stats?.top_domains?.slice(0, 7) || [];
  const topics = trending?.trending?.slice(0, 10) || [];
  return (
    <aside className="space-y-4">
      <div>
        <h3 className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted border-b border-white/[0.1] pb-1.5 mb-1">
          Trending
        </h3>
        {topics.length === 0 ? (
          <p className="text-[11px] text-text-muted/60 py-2">No topics yet</p>
        ) : (
          <ol>
            {topics.map((t, i) => (
              <li key={t.topic}>
                <button
                  type="button"
                  onClick={() => onSearchTopic(t.topic)}
                  className="group flex w-full items-baseline gap-2 py-1.5 border-b border-white/[0.045] text-left hover:bg-white/[0.02]"
                >
                  <span className="font-mono text-[10px] tabular-nums text-text-muted/45 w-3.5 shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 text-[12px] leading-snug text-text-primary/90 group-hover:text-white transition-colors line-clamp-1">
                    {t.topic}
                  </span>
                  <span className="font-mono text-[9.5px] tabular-nums text-text-muted/45">×{t.count}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {topDomains.length > 0 && (
        <div>
          <h3 className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted border-b border-white/[0.1] pb-1.5 mb-1">
            Sources
          </h3>
          <ul>
            {topDomains.map((d) => (
              <li
                key={d.domain}
                className="flex items-center justify-between py-1.5 border-b border-white/[0.045]"
              >
                <span className="text-[11.5px] text-text-secondary truncate pr-2">{d.domain}</span>
                <span className="font-mono text-[10px] tabular-nums text-text-muted shrink-0">{d.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats && (
        <div>
          <h3 className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted border-b border-white/[0.1] pb-1.5 mb-1.5">
            Desk pulse
          </h3>
          <div className="grid grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06]">
            {[
              { l: "1h", v: stats.last_hour },
              { l: "6h", v: stats.last_6h },
              { l: "All", v: stats.total },
            ].map((s) => (
              <div key={s.l} className="bg-surface-raised px-1.5 py-2 text-center">
                <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-text-muted">{s.l}</div>
                <div className="mt-0.5 font-mono text-[14px] font-semibold tabular-nums text-text-primary">
                  {s.v ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
};

// ════════════════════════════════════════════
// 6. SIDEBAR — Trending, Sources, Activity
// ════════════════════════════════════════════

const TrendingSidebar = ({ trending, stats, onSearchTopic, horizontal = false }) => {
  const topDomains = stats?.top_domains?.slice(0, 6) || [];
  const maxDC = topDomains.length > 0 ? topDomains[0].count : 1;

  return (
    <div className={horizontal ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start" : "space-y-3"}>
      {trending?.trending?.length > 0 && (
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-text-muted text-[10px] font-mono uppercase tracking-[0.16em]">Trending</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {trending.trending.slice(0, 14).map((t, i) => (
              <button
                key={t.topic}
                type="button"
                onClick={() => onSearchTopic(t.topic)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono transition-colors ${
                  i < 3
                    ? "bg-white/[0.08] text-text-primary border border-white/12"
                    : "bg-white/[0.03] text-text-muted border border-white/[0.06] hover:text-text-primary hover:border-white/12"
                }`}
              >
                {i < 3 && (
                  <span
                    className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-white/10 text-text-primary text-[8px] font-bold mr-1"
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
            
            <h3 className="text-text-primary text-[10px] font-mono uppercase tracking-[0.2em]">Top Sources</h3>
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
                      <span className="text-[11px] text-text-secondary truncate group-hover:text-text-primary transition-colors">
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
            
            <h3 className="text-text-primary text-[10px] font-mono uppercase tracking-[0.2em]">Activity</h3>
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
                <div className="text-text-primary font-mono font-bold tabular-nums text-[15px] mt-0.5">
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
                            ? "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.2))"
                            : "linear-gradient(180deg, rgba(255,255,255,0.25), rgba(255,255,255,0.08))",
                          boxShadow: "none",
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
// 6b. COLLAPSIBLE INSIGHTS — Trending/Sources/Activity below search
//     Progressive disclosure: default collapsed, state persisted.
// ════════════════════════════════════════════

const INSIGHTS_KEY = "luxquant.news.insightsOpen";

const CollapsibleInsights = ({ trending, stats, onSearchTopic }) => {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(INSIGHTS_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(INSIGHTS_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const trendCount = trending?.trending?.length || 0;
  const srcCount = stats?.top_domains?.length || 0;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-surface-raised overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3.5 sm:px-4 py-3 group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted group-hover:text-text-primary/80 transition-colors">
            Market insights
          </span>
          <span className="hidden sm:inline font-mono text-[10px] text-text-muted/55 truncate">
            {trendCount} trending · {srcCount} sources · {stats?.total ?? 0} stories
          </span>
        </div>
        <span className="flex items-center gap-2 flex-shrink-0">
          <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted/55">
            {open ? "Hide" : "Show"}
          </span>
          <svg
            className={`w-4 h-4 text-text-muted transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="px-3 sm:px-4 pb-4 pt-2 border-t border-white/[0.06]">
          <TrendingSidebar
            trending={trending}
            stats={stats}
            onSearchTopic={onSearchTopic}
            horizontal
          />
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
        className="px-3 py-2 rounded-lg text-[11px] font-mono bg-white/[0.03] border border-white/5 text-text-muted hover:text-text-primary hover:border-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
                ? "bg-white/[0.1] text-text-primary border border-white/15"
                : "bg-white/[0.03] border border-white/5 text-text-muted hover:text-text-primary hover:border-white/15"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-2 rounded-lg text-[11px] font-mono bg-white/[0.03] border border-white/5 text-text-muted hover:text-text-primary hover:border-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
  <div className="lqsk-group">
    <ShimmerStyles />
    <div className="hidden lg:grid lg:grid-cols-12 lg:gap-8">
      <div className="lg:col-span-8 space-y-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-7 space-y-3">
            <div className="aspect-[16/10] bg-white/5" />
            <div className="h-3 w-24 bg-white/5 rounded" />
            <div className="h-6 w-5/6 bg-white/5 rounded" />
            <div className="h-3 w-full bg-white/5 rounded" />
          </div>
          <div className="col-span-5 space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-[88px] h-[66px] bg-white/5 shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-2 w-20 bg-white/5 rounded" />
                  <div className="h-3 w-full bg-white/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2 pt-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-10 bg-white/[0.03] border-b border-white/[0.04]" />
          ))}
        </div>
      </div>
      <div className="lg:col-span-4 space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-8 bg-white/[0.03] border-b border-white/[0.04]" />
        ))}
      </div>
    </div>
    <div className="lg:hidden space-y-4">
      <div className="aspect-[16/10] bg-white/5" />
      <div className="h-5 w-4/5 bg-white/5 rounded" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="w-[76px] h-[58px] bg-white/5 shrink-0" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-2.5 bg-white/5 rounded w-full" />
            <div className="h-2 bg-white/5 rounded w-1/3" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ════════════════════════════════════════════
// 9. FILTER BAR — search + type + category (solid chips, SVG icons)
// ════════════════════════════════════════════

// Monochrome SVG icon set for filter rails
const Icon = ({ name, className = "w-3.5 h-3.5", style }) => {
  const s = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  const fillProps = { fill: "currentColor" };
  switch (name) {
    case "all":
      return (
        <svg viewBox="0 0 24 24" className={className} style={style} {...s}>
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="8" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
          <rect x="13" y="13" width="8" height="8" rx="2" />
        </svg>
      );
    case "article":
      return (
        <svg viewBox="0 0 24 24" className={className} style={style} {...s}>
          <path d="M4 5h13v14H6a2 2 0 0 1-2-2V5Z" />
          <path d="M17 8h3v9a2 2 0 0 1-2 2" />
          <path d="M7 8.5h7M7 12h7M7 15.5h4" />
        </svg>
      );
    case "photo":
      return (
        <svg viewBox="0 0 24 24" className={className} style={style} {...s}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9" r="1.5" />
          <path d="M21 16l-5-5L5 20" />
        </svg>
      );
    case "headline":
      return (
        <svg viewBox="0 0 24 24" className={className} style={style} {...s}>
          <path d="M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1Z" />
          <path d="M17.5 9a3 3 0 0 1 0 6" />
        </svg>
      );
    case "sparkles":
      return (
        <svg viewBox="0 0 24 24" className={className} style={style} {...s}>
          <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.4L12 17l-1.9-5.6L4.5 10l5.6-1.4L12 3Z" />
        </svg>
      );
    case "bitcoin":
      return (
        <svg viewBox="0 0 24 24" className={className} style={style} {...fillProps}>
          <path d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548v-.002zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.084v.006z" />
        </svg>
      );
    case "ethereum":
      return (
        <svg viewBox="0 0 24 24" className={className} style={style} {...fillProps}>
          <path d="M11.944 17.97L4.58 13.62 11.943 24l7.37-10.38-7.372 4.35h.003zM12.056 0L4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z" />
        </svg>
      );
    case "altcoins":
      return (
        <svg viewBox="0 0 24 24" className={className} style={style} {...s}>
          <circle cx="9" cy="9" r="5.5" />
          <path d="M14.4 6.2A5.5 5.5 0 1 1 16.2 17" />
        </svg>
      );
    case "macro":
      return (
        <svg viewBox="0 0 24 24" className={className} style={style} {...s}>
          <path d="M3 21h18M5 10l7-5 7 5M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8" />
        </svg>
      );
    case "defi":
      return (
        <svg viewBox="0 0 24 24" className={className} style={style} {...s}>
          <path d="M12 2.5l8.5 4.9v9.2L12 21.5l-8.5-4.9V7.4L12 2.5Z" />
          <path d="M12 7.5l4 2.3v4.4L12 16.5l-4-2.3V9.8L12 7.5Z" />
        </svg>
      );
    case "listings":
      return (
        <svg viewBox="0 0 24 24" className={className} style={style} {...s}>
          <path d="M11 3H4a1 1 0 0 0-1 1v7l9.5 9.5a1 1 0 0 0 1.4 0l6.6-6.6a1 1 0 0 0 0-1.4L11 3Z" />
          <circle cx="7.2" cy="7.2" r="1.3" />
        </svg>
      );
    default:
      return null;
  }
};

// Quiet segment chip — monochrome active (Bloomberg terminal style)
const FilterChip = ({ active, onClick, children, icon }) => {
  const base =
    "inline-flex items-center gap-1 h-7 px-2 rounded-md text-[10.5px] font-medium tracking-wide transition-colors whitespace-nowrap";

  if (active) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} bg-white/[0.1] text-text-primary shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]`}
      >
        {icon && <Icon name={icon} className="w-3 h-3 opacity-80" />}
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} text-text-muted hover:text-text-primary hover:bg-white/[0.04]`}
    >
      {icon && <Icon name={icon} className="w-3 h-3 opacity-70" />}
      {children}
    </button>
  );
};

const ChipCount = ({ value, active }) => {
  if (value === undefined || value === null) return null;
  return (
    <span
      className={`text-[10px] font-mono tabular-nums ml-1 ${
        active ? "text-text-primary/70" : "text-text-muted/55"
      }`}
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
    { k: "all", label: "All", count: stats?.total, icon: "all" },
    { k: "article", label: "Articles", count: stats?.articles, icon: "article" },
    { k: "photo", label: "Photos", count: stats?.photos, icon: "photo" },
    { k: "headline", label: "Headlines", count: stats?.headlines, icon: "headline" },
  ];

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/55"
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
          placeholder="Search headlines, topics, sources…"
          className="w-full h-9 pl-9 pr-9 rounded-lg border border-white/[0.08] bg-surface-raised text-text-primary text-[12.5px] placeholder:text-text-muted/45 focus:outline-none focus:border-white/18 transition-colors"
        />
        {searchInput && (
          <button
            type="button"
            onClick={onClearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/[0.06]"
            title="Clear search"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2 min-w-0">
        <div
          className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-white/[0.07] bg-white/[0.015] p-0.5"
          role="tablist"
          aria-label="Content type"
        >
          {typeOptions.map((f) => {
            const isActive = activeFilter === f.k;
            return (
              <FilterChip key={f.k} active={isActive} onClick={() => onFilterChange(f.k)} icon={f.icon}>
                {f.label}
                <ChipCount value={f.count} active={isActive} />
              </FilterChip>
            );
          })}
        </div>

        <div
          className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-white/[0.07] bg-white/[0.015] p-0.5 min-w-0 overflow-x-auto no-scrollbar"
          role="tablist"
          aria-label="Topic"
        >
          <FilterChip active={!activeCategory} onClick={() => onCategoryChange(null)}>
            Topics
          </FilterChip>
          {CATEGORY_RULES.map((cat) => {
            const isActive = activeCategory === cat.key;
            const count = categoryCounts[cat.key];
            return (
              <FilterChip
                key={cat.key}
                active={isActive}
                icon={cat.key}
                onClick={() => onCategoryChange(isActive ? null : cat.key)}
              >
                {cat.label}
                <ChipCount value={count} active={isActive} />
              </FilterChip>
            );
          })}
        </div>
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
  const { lead, secondary, midBand, listItems } = useMemo(() => {
    if (!heroEnabled || filteredItems.length === 0) {
      return { lead: null, secondary: [], midBand: [], listItems: filteredItems };
    }
    // Compact desk: 1 lead + 4 stack (fills side column) + 4 mid-band + wire
    const STACK_COUNT = 4;
    const MID_BAND = 4;
    const used = new Set();
    const leadItem = filteredItems.find(hasVisual) || filteredItems[0];
    if (leadItem) used.add(leadItem.id);

    const sec = [];
    for (const it of filteredItems) {
      if (sec.length >= STACK_COUNT) break;
      if (used.has(it.id)) continue;
      if (hasVisual(it)) {
        sec.push(it);
        used.add(it.id);
      }
    }
    if (sec.length < STACK_COUNT) {
      for (const it of filteredItems) {
        if (sec.length >= STACK_COUNT) break;
        if (!used.has(it.id)) {
          sec.push(it);
          used.add(it.id);
        }
      }
    }

    // Prefer visual stories for mid-band so the photo strip never looks empty
    const mid = [];
    for (const it of filteredItems) {
      if (mid.length >= MID_BAND) break;
      if (used.has(it.id)) continue;
      if (hasVisual(it)) {
        mid.push(it);
        used.add(it.id);
      }
    }
    if (mid.length < MID_BAND) {
      for (const it of filteredItems) {
        if (mid.length >= MID_BAND) break;
        if (!used.has(it.id)) {
          mid.push(it);
          used.add(it.id);
        }
      }
    }

    const list = filteredItems.filter((it) => !used.has(it.id));
    return { lead: leadItem, secondary: sec, midBand: mid, listItems: list };
  }, [filteredItems, heroEnabled]);

  // When hero is off, treat all as list wire
  const layout = heroEnabled
    ? { lead, secondary, midBand, listItems }
    : {
        lead: null,
        secondary: [],
        midBand: [],
        listItems: filteredItems,
      };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const sectionLabel = activeCategory
    ? CATEGORY_RULES.find((c) => c.key === activeCategory)?.label
    : searchQuery
    ? "Search results"
    : "Top stories";

  // ── Render ─────────────────────────────
  return (
    <div className="pb-6">
      {selectedItem && <NewsModal item={selectedItem} onClose={closeArticle} />}

      {/* Masthead — single tight row */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-white/[0.1] pb-2 mb-2.5">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="font-display text-[22px] sm:text-[24px] font-semibold tracking-tight text-text-primary leading-none">
            News
          </h1>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted hidden sm:inline">
            Markets wire
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] text-text-muted">
          {stats?.last_hour != null && (
            <span>
              <span className="text-text-muted/45">1h </span>
              <span className="tabular-nums text-text-primary/85">{stats.last_hour}</span>
            </span>
          )}
          {stats?.total != null && (
            <span>
              <span className="text-text-muted/45">Idx </span>
              <span className="tabular-nums text-text-primary/85">
                {Number(stats.total).toLocaleString()}
              </span>
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-positive" />
            Live
          </span>
        </div>
      </header>

      <div className="mb-3">
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
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border-y border-white/[0.06]">
          <p className="font-display text-text-primary text-base mb-1">No results</p>
          <p className="text-text-muted text-xs max-w-sm">
            {searchQuery
              ? `Nothing matches “${searchQuery}”.`
              : activeCategory
              ? "No stories in this topic — clear the filter."
              : "The wire is quiet."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop: 9+3 denser columns */}
          <div className="hidden lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
            <div className="lg:col-span-9 min-w-0 space-y-5">
              {layout.lead && (
                <section className="grid grid-cols-12 gap-5 border-b border-white/[0.09] pb-4">
                  <div className="col-span-12 md:col-span-7 min-w-0">
                    <LeadCard item={layout.lead} onSelect={openArticle} />
                  </div>
                  <div className="col-span-12 md:col-span-5 md:border-l md:border-white/[0.07] md:pl-4 min-w-0 flex flex-col">
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted mb-1 pb-1.5 border-b border-white/[0.07]">
                      Also on the wire
                    </p>
                    <div className="flex-1">
                      {layout.secondary.map((it) => (
                        <StackStory key={it.id} item={it} onSelect={openArticle} />
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {layout.midBand?.length > 0 && (
                <section className="border-b border-white/[0.09] pb-4">
                  <div className="grid grid-cols-4 gap-3">
                    {layout.midBand.map((it) => (
                      <SecondaryCard key={it.id} item={it} onSelect={openArticle} />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="flex items-baseline justify-between border-b border-white/[0.1] pb-1.5 mb-0.5">
                  <h2 className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
                    {layout.lead ? "Latest" : sectionLabel}
                  </h2>
                  <span className="font-mono text-[9px] tabular-nums text-text-muted/45">
                    {layout.listItems.length} headlines
                  </span>
                </div>
                <div>
                  {(layout.listItems.length > 0
                    ? layout.listItems
                    : !layout.lead
                      ? filteredItems
                      : []
                  ).map((it) => (
                    <WireRow key={it.id} item={it} onSelect={openArticle} />
                  ))}
                </div>
                <div className="pt-3">
                  <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
                </div>
              </section>
            </div>

            <div className="lg:col-span-3 lg:sticky lg:top-16 self-start">
              <MarketDesk
                trending={trending}
                stats={stats}
                onSearchTopic={handleSearchTopic}
              />
            </div>
          </div>

          {/* Mobile */}
          <div className="lg:hidden space-y-3">
            {layout.lead && <LeadCard item={layout.lead} onSelect={openArticle} />}
            {layout.secondary.length > 0 && (
              <div className="border-t border-white/[0.07] pt-0.5">
                {layout.secondary.map((it) => (
                  <StackStory key={it.id} item={it} onSelect={openArticle} />
                ))}
              </div>
            )}
            <CollapsibleInsights
              trending={trending}
              stats={stats}
              onSearchTopic={handleSearchTopic}
            />
            <div className="border-t border-white/[0.09] pt-0.5">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted py-1.5">
                {layout.lead ? "Latest" : sectionLabel}
              </p>
              {[...(layout.midBand || []), ...layout.listItems].map((it) => (
                <ListRow key={it.id} item={it} onSelect={openArticle} />
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
          </div>
        </>
      )}

      <AssistantWidget pageId="crypto-news" />
    </div>
  );
};

export default CryptoNewsPage;