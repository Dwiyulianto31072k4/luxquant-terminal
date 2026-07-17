// src/components/CryptoNewsPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Crypto News (Terminal desk / Bloomberg monochrome)
// Lead hero + stack + mid-band + wire list. Solid accent CTAs only.
// Domain chrome is monochrome — no rainbow source colors or glass wash.
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

const shortDomain = (domain) => {
  if (!domain) return "";
  return domain.replace(".com", "").replace(".co.in", "").replace(".co", "").replace(".org", "");
};

const getFaviconUrl = (domain, size = 128) => {
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
};

const getImageSrc = (item) => {
  const url = item?.image_url;
  if (!url || url === "webpage_photo" || (typeof url === "string" && url.trim() === ""))
    return null;
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
  {
    key: "bitcoin",
    label: "Bitcoin",
    icon: "₿",
    patterns: [/\bbtc\b/i, /\bbitcoin\b/i, /satoshi/i],
  },
  {
    key: "ethereum",
    label: "Ethereum",
    icon: "Ξ",
    patterns: [/\beth\b/i, /\bethereum\b/i, /vitalik/i],
  },
  {
    key: "altcoins",
    label: "Altcoins",
    icon: "◎",
    patterns: [
      /\bsol\b|solana/i,
      /\bxrp\b|ripple/i,
      /cardano|\bada\b/i,
      /\bdoge\b|dogecoin/i,
      /toncoin|\bton\b/i,
      /altcoin/i,
    ],
  },
  {
    key: "macro",
    label: "Macro",
    icon: "⊞",
    patterns: [
      /fed|fomc|rate cut|inflation/i,
      /etf flow|spot etf/i,
      /sec\b|regulation|cftc/i,
      /\bm2\b|liquidity/i,
    ],
  },
  {
    key: "defi",
    label: "DeFi",
    icon: "⬡",
    patterns: [/defi|tvl|yield|staking/i, /\buni\b|uniswap|aave|curve/i, /lending|liquidity pool/i],
  },
  {
    key: "listings",
    label: "Listings",
    icon: "▲",
    patterns: [/listing|listed on|upbit|kucoin|binance listing/i, /token unlock|airdrop/i],
  },
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
      className={`inline-flex items-center gap-1.5 rounded border border-ink/[0.1] bg-ink/[0.04] font-mono uppercase tracking-[0.12em] text-text-muted ${
        size === "lg" ? "px-2 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[9px]"
      }`}
    >
      <span className="h-1 w-1 rounded-full bg-ink/45" />
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
    return el.value
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return String(s)
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .trim();
  }
};

// BrandThumbnail — solid black "wire" card (Bloomberg-style masthead).
// No gold glow / grid / corner fold — logo + wordmark only.
const BrandThumbnail = ({ domain, isHeadline = false, compact = false }) => {
  const fullBleedImageKey = Object.keys(FULL_BLEED_BRAND_IMAGES).find((d) => domain?.includes(d));
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
    <div className="relative w-full h-full flex flex-col items-center justify-center select-none overflow-hidden bg-[rgb(var(--surface))]">
      {/* subtle top rule — terminal masthead, not a glow */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-ink/[0.08]" />
      <div
        className={`relative z-10 flex flex-col items-center ${compact ? "gap-1.5" : "gap-2.5"}`}
      >
        <img
          src={LUXQUANT_LOGO}
          alt="LuxQuant"
          className={`object-contain opacity-95 ${compact ? "w-9 h-9" : "w-14 h-14 sm:w-16 sm:h-16"}`}
        />
        <div className="flex flex-col items-center gap-0.5">
          <span
            className={`font-mono uppercase tracking-[0.28em] text-ink/75 ${
              compact ? "text-[7px]" : "text-[9px] sm:text-[10px]"
            }`}
          >
            LuxQuant
          </span>
          <span
            className={`font-mono uppercase tracking-[0.22em] text-ink/40 ${
              compact ? "text-[6.5px]" : "text-[8px]"
            }`}
          >
            News
          </span>
        </div>
      </div>
      {isHeadline ? (
        <span className="absolute bottom-2 left-2 font-mono text-[8px] uppercase tracking-[0.16em] text-ink/35">
          Wire
        </span>
      ) : null}
    </div>
  );
};

// ════════════════════════════════════════════
// 3. NEWS DETAIL MODAL — reader desk (solid chrome, responsive sheet/dialog)
// ════════════════════════════════════════════

const NewsModal = ({ item, onClose }) => {
  const [extract, setExtract] = useState(null);
  const [loading, setLoading] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);

  useEffect(() => {
    if (!item?.id) return;
    setExtract(null);
    setImgFailed(false);
    setFaviconFailed(false);
    setLoading(true);
    api
      .get(`/api/v1/crypto-news-feed/extract/${item.id}`)
      .then((res) => {
        if (res.data) setExtract(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [item?.id]);

  if (!item) return null;

  const imgSrc = !imgFailed ? extract?.top_image || getImageSrc(item) : null;
  const videoSrc = getVideoSrc(extract) || getVideoSrc(item);
  const summary = extract?.summary || item.description || null;
  const fullText = extract?.full_text || item.raw_text || null;
  const keywords = extract?.keywords || [];
  const authors = extract?.authors || [];
  const isPhoto = item.content_type === "photo";
  const isVideo = item.content_type === "video" || !!videoSrc;
  const faviconUrl = getFaviconUrl(item.domain, 64);
  const domainShort = shortDomain(item.domain) || item.source || "Wire";
  const domainLabel = (item.domain || item.source || "")
    .replace(/^www\./i, "")
    .split(".")[0]
    ?.toUpperCase();
  const category = categorizeItem(item);
  const published = item.created_at
    ? (() => {
        try {
          return new Date(item.created_at).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        } catch {
          return null;
        }
      })()
    : null;

  const header = (
    <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
      {/* Source mark */}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ink/[0.1] bg-surface-secondary sm:h-9 sm:w-9">
        {faviconUrl && !faviconFailed ? (
          <img
            src={faviconUrl}
            alt=""
            className="h-4 w-4 object-contain sm:h-[18px] sm:w-[18px]"
            onError={() => setFaviconFailed(true)}
          />
        ) : (
          <span className="font-mono text-[10px] font-semibold uppercase text-text-primary">
            {domainShort.slice(0, 2).toUpperCase()}
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-text-primary">
            {domainShort}
          </span>
          <span className="h-1 w-1 shrink-0 rounded-full bg-ink/25" />
          <span className="font-mono text-[10px] tabular-nums text-text-muted">
            {timeAgo(item.created_at)}
          </span>
          {isPhoto ? (
            <span className="rounded border border-ink/10 bg-ink/[0.04] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-muted">
              photo
            </span>
          ) : null}
          {isVideo ? (
            <span className="rounded border border-ink/10 bg-ink/[0.04] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-muted">
              video
            </span>
          ) : null}
        </div>
        {published ? (
          <p className="mt-0.5 truncate font-mono text-[10px] text-text-muted/70">
            {published}
            {category?.label ? ` · ${category.label}` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );

  const footer = (close) => (
    <div className="flex items-stretch gap-2">
      {item.url ? (
        <button
          type="button"
          onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-transparent bg-accent text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-fg transition hover:opacity-90 active:scale-[0.99]"
        >
          Read full article
          <svg
            className="h-3.5 w-3.5 opacity-70"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </button>
      ) : null}
      <button
        type="button"
        onClick={close}
        className="h-11 shrink-0 rounded-md border border-ink/[0.12] bg-surface-secondary px-4 text-[12px] font-medium uppercase tracking-[0.1em] text-text-secondary transition hover:border-ink/25 hover:text-text-primary sm:px-5"
      >
        Close
      </button>
    </div>
  );

  const heroMax = "max-h-[min(34vh,260px)] sm:max-h-[min(40vh,360px)] md:max-h-[min(42vh,400px)]";

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="reader"
      padded={false}
      accent={false}
      header={header}
      footer={footer}
    >
      {/* Hero media — full-bleed, scales with viewport */}
      <div className="relative w-full overflow-hidden bg-black">
        <div
          className={`flex min-h-[9.5rem] w-full items-center justify-center sm:min-h-[12rem] ${heroMax}`}
        >
          {videoSrc ? (
            <video
              src={videoSrc}
              poster={imgSrc || undefined}
              controls
              autoPlay
              muted
              playsInline
              preload="metadata"
              ref={(el) => {
                if (el) el.muted = true;
              }}
              className={`w-full bg-black object-contain ${heroMax}`}
            />
          ) : imgSrc ? (
            <img
              src={imgSrc}
              alt=""
              className={`w-full object-cover sm:object-contain ${heroMax}`}
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className={`w-full ${heroMax}`} style={{ aspectRatio: "16 / 9" }}>
              <BrandThumbnail domain={item.domain} isHeadline={item.content_type === "headline"} />
            </div>
          )}
        </div>
        {/* Bottom scrim + source chip — solid black, no page blur */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-scrim/70 via-scrim/25 to-transparent" />
        {domainLabel ? (
          <span className="pointer-events-none absolute bottom-3 right-3 rounded border border-ink/12 bg-scrim/75 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink/75">
            {domainLabel}
          </span>
        ) : null}
      </div>

      <div className="space-y-5 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-6">
        {/* Headline block */}
        <header className="space-y-2.5">
          {category ? (
            <span className="inline-flex items-center gap-1.5 rounded border border-ink/[0.08] bg-ink/[0.03] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
              <span className="opacity-80">{category.icon}</span>
              {category.label}
            </span>
          ) : null}
          <h2 className="font-display text-[18px] font-semibold leading-[1.3] tracking-tight text-text-primary sm:text-[22px] sm:leading-[1.28] md:text-[24px]">
            {item.title}
          </h2>
          {authors.length > 0 ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
              By {authors.join(", ")}
            </p>
          ) : null}
        </header>

        {/* Body */}
        {loading ? (
          <div className="lqsk-group space-y-2.5">
            <ShimmerStyles />
            <div className="h-3 w-full rounded bg-ink/5" />
            <div className="h-3 w-5/6 rounded bg-ink/5" />
            <div className="h-3 w-4/6 rounded bg-ink/5" />
            <div className="h-3 w-3/4 rounded bg-ink/5" />
          </div>
        ) : summary ? (
          <section className="space-y-2">
            <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">
              Summary
            </h3>
            <p className="text-[14px] leading-[1.7] text-text-secondary sm:text-[15px] sm:leading-[1.75]">
              {cleanText(summary)}
            </p>
          </section>
        ) : (
          <p className="font-mono text-[11px] text-text-muted/70">
            Full extract unavailable — open the original article.
          </p>
        )}

        {keywords.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {keywords.slice(0, 12).map((kw, i) => (
              <span
                key={i}
                className="rounded-md border border-ink/[0.1] bg-surface-secondary px-2 py-0.5 font-mono text-[10px] font-semibold text-text-muted"
              >
                #{kw}
              </span>
            ))}
          </div>
        ) : null}

        {fullText && fullText !== summary ? (
          <section className="space-y-2.5 border-t border-ink/[0.07] pt-5">
            <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">
              Article preview
            </h3>
            <p className="whitespace-pre-line text-[13px] leading-[1.75] text-text-muted sm:text-[13.5px]">
              {cleanText(fullText).slice(0, 1400)}
              {fullText.length > 1400 ? "…" : ""}
            </p>
          </section>
        ) : null}
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
    <div className="group relative overflow-hidden rounded-lg border border-ink/[0.07] bg-surface-raised">
      <style>{`
 @keyframes tickerScroll {
 0% { transform: translateX(0); }
 100% { transform: translateX(-50%); }
 }
 .ticker-track { animation: tickerScroll 80s linear infinite; }
 .group:hover .ticker-track { animation-play-state: paused; }
 `}</style>

      <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-16 bg-gradient-to-r from-surface-raised to-transparent" />
      <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-16 bg-gradient-to-l from-surface-raised to-transparent" />

      <div className="absolute left-3 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-profit" />
        </span>
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-profit">
          Live
        </span>
      </div>

      <div className="ticker-track flex py-2.5 pl-24" style={{ width: "fit-content" }}>
        {[...ticker, ...ticker].map((item, i) => (
          <button
            key={`${item.id}-${i}`}
            type="button"
            onClick={() => onSelect(item)}
            className="group/item mr-2 flex items-center gap-2 whitespace-nowrap px-4 text-[12px] transition-colors hover:text-text-primary"
          >
            <span className="h-1 w-1 flex-shrink-0 rounded-full bg-ink/40" />
            <span className="font-mono text-[10px] uppercase text-text-muted">
              {shortDomain(item.domain)}
            </span>
            <span className="max-w-[420px] truncate text-text-primary/80 transition-colors group-hover/item:text-text-primary">
              {item.title}
            </span>
            <span className="font-mono text-[10px] tabular-nums text-text-muted">
              {timeAgo(item.created_at)}
            </span>
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
  shortDomain(item?.domain) || (item?.source ? String(item.source).slice(0, 18) : "") || "Wire";

// Media with real fallback (never leave a blank black hole after img error)
const MediaBlock = ({ item, className = "", playSize = "md", compact = false }) => {
  const raw = getImageSrc(item);
  const [failed, setFailed] = useState(false);
  const isHeadline = item.content_type === "headline";
  const hasVideo = !!getVideoSrc(item);
  const brandKey = Object.keys(FULL_BLEED_BRAND_IMAGES).find((d) => item?.domain?.includes(d));
  const showPhoto = !!raw && !failed;
  const playCls = playSize === "sm" ? "w-6 h-6" : "w-9 h-9";
  const iconCls = playSize === "sm" ? "w-2.5 h-2.5" : "w-3.5 h-3.5";

  return (
    <div className={`relative overflow-hidden bg-[rgb(var(--surface))] ${className}`}>
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
            className={`flex items-center justify-center rounded-full bg-scrim/60 border border-ink/25 ${playCls}`}
          >
            <svg
              className={`${iconCls} text-text-primary ml-0.5`}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
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
      <h2 className="font-display text-[18px] sm:text-[20px] lg:text-[22px] font-semibold leading-[1.22] tracking-tight text-text-primary group-hover:text-text-primary transition-colors line-clamp-3">
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
    className="group w-full flex gap-2.5 text-left py-2 first:pt-0 last:pb-0 border-b border-ink/[0.06] last:border-b-0"
  >
    <MediaBlock
      item={item}
      className="w-[72px] h-[54px] shrink-0 rounded-sm"
      playSize="sm"
      compact
    />
    <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
      <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-text-muted">
        {sourceLabel(item)}
        <span className="text-text-muted/35"> · </span>
        {timeAgo(item.created_at)}
      </span>
      <h3 className="font-display text-[13px] font-semibold leading-snug text-text-primary line-clamp-2 group-hover:text-text-primary transition-colors">
        {item.title}
      </h3>
    </div>
  </button>
);

// Mid-band cards — guaranteed image frame height
const SecondaryCard = ({ item, onSelect }) => (
  <article onClick={() => onSelect(item)} className="group cursor-pointer flex flex-col min-w-0">
    <MediaBlock item={item} className="w-full aspect-[16/10] rounded-sm" playSize="sm" compact />
    <div className="pt-2 space-y-1">
      <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-text-muted">
        {sourceLabel(item)}
        <span className="text-text-muted/35"> · </span>
        {timeAgo(item.created_at)}
      </span>
      <h3 className="font-display text-[13px] font-semibold leading-snug text-text-primary line-clamp-2 group-hover:text-text-primary transition-colors">
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
    className="group grid grid-cols-[48px_minmax(0,1fr)] sm:grid-cols-[48px_48px_84px_minmax(0,1fr)] gap-x-2.5 w-full py-1.5 text-left border-b border-ink/[0.05] hover:bg-ink/[0.025] transition-colors items-center"
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
    <span className="font-display text-[13px] font-medium leading-snug text-text-primary group-hover:text-text-primary transition-colors line-clamp-2 sm:line-clamp-1 min-w-0">
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
    className="group relative w-full flex gap-2.5 py-2 text-left border-b border-ink/[0.05]"
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
      <h4 className="font-display text-[13px] font-medium leading-snug line-clamp-2 text-text-primary group-hover:text-text-primary transition-colors">
        {item.title}
      </h4>
    </div>
  </button>
);

// Right rail — compact desk
// Client-side safety: never show source handles as "topics"
const isSourceyTopic = (topic) => {
  const t = String(topic || "")
    .toLowerCase()
    .replace(/^\$/, "");
  if (!t || t.length < 2) return true;
  if (t.includes("official") || t.includes("bot") || t.endsWith("news")) return true;
  if (t.includes("spectator") || t.includes("telegram") || t.includes("channel")) return true;
  // camelCase-ish long handles (BossBotOfficial)
  if (
    t.length >= 12 &&
    /^[a-z0-9]+$/.test(t) &&
    !["ethereum", "bitcoin", "solana", "cardano"].includes(t)
  ) {
    // still allow pure tickers like BITCOIN
    if (
      !/^(btc|eth|sol|xrp|bnb|ada|doge|ton|link|avax|dot|matic|near|apt|sui|pepe|wld|arb|op)$/i.test(
        t
      )
    ) {
      const hasVowel = /[aeiou]/.test(t);
      const looksHandle = hasVowel && t.length >= 14;
      if (looksHandle) return true;
    }
  }
  return false;
};

const cleanTrendingTopics = (trending, limit = 10) => {
  const raw = trending?.trending || [];
  return raw.filter((t) => !isSourceyTopic(t.topic)).slice(0, limit);
};

const MarketDesk = ({ trending, stats, onSearchTopic }) => {
  const topDomains = stats?.top_domains?.slice(0, 7) || [];
  const topics = cleanTrendingTopics(trending, 10);
  return (
    <aside className="space-y-4">
      <div>
        <h3 className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted border-b border-ink/[0.1] pb-1.5 mb-1">
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
                  className="group flex w-full items-baseline gap-2 py-1.5 border-b border-ink/[0.045] text-left hover:bg-ink/[0.02]"
                >
                  <span className="font-mono text-[10px] tabular-nums text-text-muted/45 w-3.5 shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 text-[12px] leading-snug text-text-primary/90 group-hover:text-text-primary transition-colors line-clamp-1">
                    {t.topic}
                  </span>
                  <span className="font-mono text-[9.5px] tabular-nums text-text-muted/45">
                    ×{t.count}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {topDomains.length > 0 && (
        <div>
          <h3 className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted border-b border-ink/[0.1] pb-1.5 mb-1">
            Sources
          </h3>
          <ul>
            {topDomains.map((d) => (
              <li
                key={d.domain}
                className="flex items-center justify-between py-1.5 border-b border-ink/[0.045]"
              >
                <span className="text-[11.5px] text-text-secondary truncate pr-2">{d.domain}</span>
                <span className="font-mono text-[10px] tabular-nums text-text-muted shrink-0">
                  {d.count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats && (
        <div>
          <h3 className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted border-b border-ink/[0.1] pb-1.5 mb-1.5">
            Desk pulse
          </h3>
          <div className="grid grid-cols-3 gap-px bg-ink/[0.06] border border-ink/[0.06]">
            {[
              { l: "1h", v: stats.last_hour },
              { l: "6h", v: stats.last_6h },
              { l: "All", v: stats.total },
            ].map((s) => (
              <div key={s.l} className="bg-surface-raised px-1.5 py-2 text-center">
                <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-text-muted">
                  {s.l}
                </div>
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
  const topics = cleanTrendingTopics(trending, 14);

  return (
    <div
      className={
        horizontal
          ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start"
          : "space-y-3"
      }
    >
      {topics.length > 0 && (
        <div className="relative overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised p-3.5">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-text-muted text-[10px] font-mono uppercase tracking-[0.16em]">
              Trending
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t, i) => (
              <button
                key={t.topic}
                type="button"
                onClick={() => onSearchTopic(t.topic)}
                className={`rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold transition-colors ${
                  i < 3
                    ? "border-transparent bg-accent text-accent-fg"
                    : "border-ink/[0.1] bg-surface-secondary text-text-muted hover:border-ink/18 hover:text-text-primary"
                }`}
              >
                {i < 3 && (
                  <span className="mr-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/15 text-[8px] font-bold text-accent-fg align-middle">
                    {i + 1}
                  </span>
                )}
                {t.topic}
                <span className={`ml-1 text-[8px] ${i < 3 ? "text-accent-fg/75" : "opacity-50"}`}>
                  ×{t.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {topDomains.length > 0 && (
        <div className="rounded-lg border border-ink/[0.08] bg-surface-raised p-3.5">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-text-primary text-[10px] font-mono uppercase tracking-[0.2em]">
              Top Sources
            </h3>
          </div>
          <div className="space-y-2.5">
            {topDomains.map((d) => (
              <div key={d.domain} className="group space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink/35" />
                    <span className="truncate text-[11px] text-text-secondary transition-colors group-hover:text-text-primary">
                      {d.domain}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] tabular-nums text-text-muted">
                    {d.count}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-ink/[0.08]">
                  <div
                    className="h-full rounded-full bg-ink/45 transition-all duration-500"
                    style={{ width: `${(d.count / maxDC) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats && (
        <div className="rounded-lg border border-ink/[0.08] bg-surface-raised p-3.5">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-text-primary text-[10px] font-mono uppercase tracking-[0.2em]">
              Activity
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { l: "1H", v: stats.last_hour },
              { l: "6H", v: stats.last_6h },
              { l: "3D", v: stats.total },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-md border border-ink/[0.08] bg-surface-secondary p-2 text-center"
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
                          background: isPeak ? "rgb(var(--ink) / 0.55)" : "rgb(var(--ink) / 0.22)",
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
// Progressive disclosure: default collapsed, state persisted.
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

  const trendCount = cleanTrendingTopics(trending, 20).length;
  const srcCount = stats?.top_domains?.length || 0;

  return (
    <div className="overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised">
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
        <div className="px-3 sm:px-4 pb-4 pt-2 border-t border-ink/[0.06]">
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
        className="rounded-md border border-ink/[0.1] bg-surface-secondary px-3 py-2 font-mono text-[11px] font-semibold text-text-muted transition-colors hover:border-ink/18 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
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
            className={`h-9 w-9 rounded-md font-mono text-[11px] font-semibold transition-colors ${
              p === page
                ? "border border-transparent bg-accent text-accent-fg"
                : "border border-ink/[0.1] bg-surface-secondary text-text-muted hover:border-ink/18 hover:text-text-primary"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded-md border border-ink/[0.1] bg-surface-secondary px-3 py-2 font-mono text-[11px] font-semibold text-text-muted transition-colors hover:border-ink/18 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
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
            <div className="aspect-[16/10] bg-ink/5" />
            <div className="h-3 w-24 bg-ink/5 rounded" />
            <div className="h-6 w-5/6 bg-ink/5 rounded" />
            <div className="h-3 w-full bg-ink/5 rounded" />
          </div>
          <div className="col-span-5 space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-[88px] h-[66px] bg-ink/5 shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-2 w-20 bg-ink/5 rounded" />
                  <div className="h-3 w-full bg-ink/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2 pt-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-10 bg-ink/[0.03] border-b border-ink/[0.04]" />
          ))}
        </div>
      </div>
      <div className="lg:col-span-4 space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-8 bg-ink/[0.03] border-b border-ink/[0.04]" />
        ))}
      </div>
    </div>
    <div className="lg:hidden space-y-4">
      <div className="aspect-[16/10] bg-ink/5" />
      <div className="h-5 w-4/5 bg-ink/5 rounded" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="w-[76px] h-[58px] bg-ink/5 shrink-0" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-2.5 bg-ink/5 rounded w-full" />
            <div className="h-2 bg-ink/5 rounded w-1/3" />
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

// Desk segment chip — solid yellow when active (Binance CTA)
const FilterChip = ({ active, onClick, children, icon }) => {
  const base =
    "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors";

  if (active) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} border border-transparent bg-accent text-accent-fg`}
      >
        {icon && <Icon name={icon} className="h-3 w-3 opacity-90" />}
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} border border-transparent text-text-muted hover:bg-ink/[0.04] hover:text-text-primary`}
    >
      {icon && <Icon name={icon} className="h-3 w-3 opacity-70" />}
      {children}
    </button>
  );
};

const ChipCount = ({ value, active }) => {
  if (value === undefined || value === null) return null;
  return (
    <span
      className={`ml-1 font-mono text-[10px] tabular-nums ${
        active ? "text-accent-fg/80" : "text-text-muted/55"
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
          className="h-9 w-full rounded-md border border-ink/[0.1] bg-surface-raised pl-9 pr-9 font-mono text-[12px] text-text-primary placeholder:text-text-muted transition-colors focus:border-ink/20 focus:outline-none"
        />
        {searchInput && (
          <button
            type="button"
            onClick={onClearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-ink/[0.06]"
            title="Clear search"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2 min-w-0">
        <div
          className="inline-flex flex-wrap items-center gap-0.5 rounded-md border border-ink/[0.1] bg-surface-secondary p-0.5"
          role="tablist"
          aria-label="Content type"
        >
          {typeOptions.map((f) => {
            const isActive = activeFilter === f.k;
            return (
              <FilterChip
                key={f.k}
                active={isActive}
                onClick={() => onFilterChange(f.k)}
                icon={f.icon}
              >
                {f.label}
                <ChipCount value={f.count} active={isActive} />
              </FilterChip>
            );
          })}
        </div>

        <div
          className="inline-flex min-w-0 flex-wrap items-center gap-0.5 overflow-x-auto rounded-md border border-ink/[0.1] bg-surface-secondary p-0.5 no-scrollbar"
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

  const openArticle = useCallback(
    (item) => {
      if (!item || item.id == null) return;
      articleCacheRef.current.set(String(item.id), item);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("article", String(item.id));
        return next;
      });
    },
    [setSearchParams]
  );

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
  const heroEnabled = page === 1 && !searchQuery && !activeCategory && activeFilter === "all";

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
      <header className="mb-3 flex flex-col gap-3 border-b border-ink/[0.08] pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-text-primary lg:text-[28px]">
            News
          </h1>
          <p className="mt-1.5 text-[13px] text-text-secondary">
            Markets wire · live crypto headlines
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3 font-mono text-[11px] tabular-nums text-text-muted">
          {stats?.last_hour != null && (
            <span>
              <span className="text-text-muted">1h </span>
              <span className="font-semibold text-text-primary">{stats.last_hour}</span>
            </span>
          )}
          {stats?.total != null && (
            <span>
              <span className="text-text-muted">Idx </span>
              <span className="font-semibold text-text-primary">
                {Number(stats.total).toLocaleString()}
              </span>
            </span>
          )}
          <div className="flex h-8 items-center gap-2 rounded-md border border-ink/[0.1] bg-surface-raised px-2.5">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-profit" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-profit">
              Live
            </span>
          </div>
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
        <div className="flex flex-col items-center justify-center py-16 text-center border-y border-ink/[0.06]">
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
                <section className="grid grid-cols-12 gap-5 border-b border-ink/[0.09] pb-4">
                  <div className="col-span-12 md:col-span-7 min-w-0">
                    <LeadCard item={layout.lead} onSelect={openArticle} />
                  </div>
                  <div className="col-span-12 md:col-span-5 md:border-l md:border-ink/[0.07] md:pl-4 min-w-0 flex flex-col">
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted mb-1 pb-1.5 border-b border-ink/[0.07]">
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
                <section className="border-b border-ink/[0.09] pb-4">
                  <div className="grid grid-cols-4 gap-3">
                    {layout.midBand.map((it) => (
                      <SecondaryCard key={it.id} item={it} onSelect={openArticle} />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="flex items-baseline justify-between border-b border-ink/[0.1] pb-1.5 mb-0.5">
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
              <MarketDesk trending={trending} stats={stats} onSearchTopic={handleSearchTopic} />
            </div>
          </div>

          {/* Mobile */}
          <div className="lg:hidden space-y-3">
            {layout.lead && <LeadCard item={layout.lead} onSelect={openArticle} />}
            {layout.secondary.length > 0 && (
              <div className="border-t border-ink/[0.07] pt-0.5">
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
            <div className="border-t border-ink/[0.09] pt-0.5">
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
