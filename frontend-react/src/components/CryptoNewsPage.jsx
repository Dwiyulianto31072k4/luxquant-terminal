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
import NewsBody from "./NewsBody";
import { newsTitleLine } from "../utils/newsFormat";
import { SegGroup } from "./ui/SegGroup";
import { PageHeader } from "./ui/PageHeader";

const PAGE_SIZE = 28; // multiple of 4 → fills the desktop 4-col grid without lone trailing cards

// Brand assets (in /public — referenced by absolute path)
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
  // Relative paths served by our API (telegram screenshots, etc.)
  if (typeof url === "string" && url.startsWith("/")) return url;
  return url;
};

/** Reject obvious non-photo / broken placeholders after load attempts. */
const isLikelyBadImageHost = (url) => {
  if (!url) return true;
  const u = String(url).toLowerCase();
  // Generic 1×1 / tracking / known empty shells
  if (u.includes("1x1") || u.includes("pixel.gif") || u.includes("spacer")) return true;
  return false;
};

/** Brand cover when a source never ships image_url (TradingView News Flow, etc.). */
const getBrandCover = (item) => {
  const domain = String(item?.domain || "").toLowerCase();
  if (!domain) return null;
  for (const [d, img] of Object.entries(FULL_BLEED_BRAND_IMAGES)) {
    if (domain.includes(d)) return img;
  }
  return null;
};

/**
 * Best card image: article photo first, then known brand cover.
 * TradingView items almost never carry image_url — without this they render
 * as blank text cards even though we ship a proper News Flow cover.
 */
const getCardImage = (item) => {
  const raw = getImageSrc(item);
  if (raw && !isLikelyBadImageHost(raw)) return raw;
  return getBrandCover(item);
};

const getVideoSrc = (item) => {
  const url = item?.video_url;
  if (!url || (typeof url === "string" && url.trim() === "")) return null;
  return url;
};

const hasBrandImage = (item) =>
  Object.keys(FULL_BLEED_BRAND_IMAGES).some((d) => item?.domain?.includes(d));

// "Visual" = has a real image OR a full-bleed brand promo (good enough to anchor a hero)
const hasVisual = (item) => !!getCardImage(item);

// Auto-categorize by title keywords (lightweight, client-side)
// Topic chips. The feed decides which of these a story carries — see
// _TOPIC_PATTERNS in crypto_news_endpoint.py, which is the only place to change
// them. These entries exist for the label and icon, and the patterns are kept
// only to label a row served from a cache written before the field existed.
//
// A story can carry several: 262 of 1,298 do, and forcing one winner is what
// made "SEC sues Ripple" arbitrarily regulation or altcoins by rule order.
const CATEGORY_RULES = [
  { key: "bitcoin", label: "Bitcoin", icon: "\u20BF", patterns: [/\bbtc\b/i, /bitcoin/i, /satoshi/i] },
  { key: "ethereum", label: "Ethereum", icon: "\u039E", patterns: [/\beth\b/i, /ethereum/i, /vitalik/i] },
  { key: "altcoins", label: "Altcoins", icon: "\u25CE", patterns: [/\bsol\b|solana/i, /\bxrp\b|ripple/i, /cardano/i, /dogecoin/i, /altcoin/i] },
  { key: "stablecoins", label: "Stablecoins", icon: "\u2261", patterns: [/stablecoin/i, /tether|\busdt\b/i, /\busdc\b/i] },
  { key: "etf", label: "ETF", icon: "\u25A6", patterns: [/\betfs?\b/i, /spot etf/i] },
  { key: "regulation", label: "Regulation", icon: "\u00A7", patterns: [/\bsec\b|regulat/i, /lawsuit|court/i] },
  { key: "security", label: "Security", icon: "\u26A0", patterns: [/hack|exploit|breach/i, /scam|fraud/i] },
  { key: "defi", label: "DeFi", icon: "\u2b21", patterns: [/defi/i, /uniswap|aave/i] },
  { key: "macro", label: "Macro", icon: "\u229E", patterns: [/\bfed\b|fomc|inflation/i, /s&p 500|nasdaq/i] },
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

// Soft fill for missing art — no red tile, no logo stamp (looks empty/broken).
const BrandThumbnail = ({ domain, isHeadline = false, compact = false }) => {
  const fullBleedImageKey = Object.keys(FULL_BLEED_BRAND_IMAGES).find((d) => domain?.includes(d));
  if (fullBleedImageKey) {
    const imgUrl = FULL_BLEED_BRAND_IMAGES[fullBleedImageKey];
    return (
      <div className="h-full w-full overflow-hidden bg-black">
        <img
          src={imgUrl}
          alt={domain}
          className="h-full w-full object-cover"
          style={{ objectPosition: "10% center" }}
          loading="lazy"
        />
      </div>
    );
  }

  // Quiet surface only — never a logo hole. Text lives outside this block.
  return (
    <div
      className="relative h-full w-full overflow-hidden bg-ink/[0.04]"
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 opacity-80"
        style={{
          background:
            "linear-gradient(145deg, rgb(var(--ink) / 0.06) 0%, transparent 55%, rgb(var(--ink) / 0.04) 100%)",
        }}
      />
      {!compact && isHeadline ? (
        <span className="absolute bottom-2 left-2 font-mono text-[8px] uppercase tracking-[0.16em] text-text-muted/35">
          Wire
        </span>
      ) : null}
    </div>
  );
};

// ════════════════════════════════════════════
// 3. NEWS DETAIL MODAL — reader desk (solid chrome, responsive sheet/dialog)
// ════════════════════════════════════════════

/** Credit card for the account that published a story first. Links straight to
 *  that post when the channel is public, so readers can verify at the origin. */
const SourceCredit = ({ credit, faviconUrl }) => {
  const [markFailed, setMarkFailed] = useState(false);
  const initials = String(credit.name || "?")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const inner = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ink/[0.1] bg-surface-secondary">
        {faviconUrl && !markFailed ? (
          <img
            src={faviconUrl}
            alt=""
            /* A channel avatar is a full picture and should fill the tile;
               a favicon is a small glyph and needs breathing room. */
            className={
              credit.kind === "telegram"
                ? "h-full w-full object-cover"
                : "h-[18px] w-[18px] object-contain"
            }
            onError={() => setMarkFailed(true)}
          />
        ) : credit.kind === "telegram" ? (
          <svg className="h-[18px] w-[18px] text-text-muted" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
          </svg>
        ) : (
          <span className="font-mono text-[10px] font-semibold uppercase text-text-primary">
            {initials || "??"}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-text-primary">
          {credit.name}
        </span>
        <span className="block truncate font-mono text-[10px] text-text-muted">
          {credit.handle || (credit.url ? "Original publisher" : "Private channel")}
        </span>
      </span>
      {credit.url ? (
        <svg
          className="h-3.5 w-3.5 shrink-0 text-text-muted"
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
      ) : null}
    </>
  );

  const shell =
    "flex items-center gap-3 rounded-lg border border-ink/[0.1] bg-surface-secondary px-3 py-2.5";

  return credit.url ? (
    <a
      href={credit.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${shell} transition hover:border-ink/25`}
    >
      {inner}
    </a>
  ) : (
    <div className={shell}>{inner}</div>
  );
};

const NewsModal = ({ item, onClose }) => {
  const [extract, setExtract] = useState(null);
  const [loading, setLoading] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const [mediaRatio, setMediaRatio] = useState(null);

  useEffect(() => {
    if (!item?.id) return;
    setExtract(null);
    setImgFailed(false);
    setFaviconFailed(false);
    setMediaRatio(null);
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
  // The API builds summary as the first 600 chars of full_text, so rendering
  // both printed the same paragraph twice. Only keep the lead when it is
  // genuinely different text.
  const leadIsPrefix =
    !!summary &&
    !!fullText &&
    cleanText(fullText).startsWith(cleanText(summary).slice(0, 120));
  const leadText = fullText && leadIsPrefix ? null : summary;
  const bodyText = fullText && fullText !== summary ? fullText : leadText ? null : summary;
  const keywords = extract?.keywords || [];
  const authors = extract?.authors || [];
  const isPhoto = item.content_type === "photo";
  const isVideo = item.content_type === "video" || !!videoSrc;
  const credit = item.source || null;
  // Prefer the mark the API resolved (channel avatar, or the publisher's own
  // favicon behind a redirect) over guessing from a domain we may not have.
  const faviconUrl = credit?.icon || getFaviconUrl(item.domain, 64);
  const isTelegramCredit = credit?.kind === "telegram";
  const domainShort = shortDomain(item.domain) || credit?.name || "Wire";
  const domainLabel = (item.domain || credit?.name || "")
    .replace(/^www\./i, "")
    .split(".")[0]
    ?.toUpperCase();
  // categorizeItem hands back a key, not the rule, so the chip was rendering
  // empty for every story that did match a category.
  const categoryKey = categorizeItem(item);
  const category = categoryKey ? CATEGORY_RULES.find((c) => c.key === categoryKey) : null;
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
            className={
              isTelegramCredit
                ? "h-full w-full object-cover"
                : "h-4 w-4 object-contain sm:h-[18px] sm:w-[18px]"
            }
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
          {credit?.url ? (
            <a
              href={credit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-text-primary underline decoration-ink/25 underline-offset-[3px] transition hover:decoration-ink/60"
            >
              {credit.name}
            </a>
          ) : (
            <span className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-text-primary">
              {domainShort}
            </span>
          )}
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

  const footer = (_close) => (
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
    </div>
  );

  // Layout follows the picture. Measured across the live feed: RSS art is all
  // landscape (1.5–1.9), Telegram art is mostly 1:1 with a portrait tail, and
  // three quarters of stories carry no image at all. A landscape shot squeezed
  // into a side column reads tiny, and a square one stretched across the top
  // wastes the fold — so wide media goes on top, square and taller media sits
  // beside the text. Seed the guess by host so the layout doesn't jump on load.
  const seedRatio = imgSrc && String(imgSrc).startsWith("http") ? 1.6 : 1;
  const ratio = mediaRatio ?? seedRatio;
  const isSplit = !!imgSrc && !videoSrc && ratio < 1.15;
  // Three quarters of stories are wire headlines with no picture. A brand cover
  // is worth showing; an empty placeholder box is not, so those open as text.
  const brandCover = getBrandCover(item);
  const hasMedia = !!(videoSrc || imgSrc || brandCover);
  const heroMax = isSplit
    ? "max-h-[min(34vh,260px)] sm:max-h-[min(40vh,360px)] md:max-h-[min(78vh,620px)]"
    : "max-h-[min(34vh,260px)] sm:max-h-[min(38vh,340px)] md:max-h-[min(44vh,420px)]";

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="2xl"
      padded={false}
      accent={false}
      header={header}
      /* No article link means no action, and an empty footer bar just looks broken. */
      footer={item.url ? footer : undefined}
    >
      <div className={isSplit ? "md:grid md:grid-cols-[minmax(0,42%)_minmax(0,58%)]" : ""}>
      {/* Media panel — its shape follows the picture, see layout notes above */}
      {hasMedia ? (
      <div className={`relative w-full overflow-hidden bg-black ${isSplit ? "md:h-full" : ""}`}>
        {/* Blurred copy of the same image fills the leftover box, so an
            off-ratio picture never sits in dead black bars. */}
        {imgSrc && !videoSrc ? (
          <img
            src={imgSrc}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
          />
        ) : null}
        <div
          className={`relative flex min-h-[9.5rem] w-full items-center justify-center sm:min-h-[12rem] ${
            isSplit ? "md:h-full md:min-h-[24rem]" : ""
          } ${heroMax}`}
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
              className={`max-h-full w-full object-contain ${heroMax}`}
              onLoad={(e) => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                if (w && h) setMediaRatio(w / h);
              }}
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
          // Sits on the photo, so it keeps its own dark-on-light contrast
          // rather than theme tokens — ink/75 on scrim/75 rendered invisible.
          <span className="pointer-events-none absolute bottom-3 right-3 max-w-[55%] truncate rounded border border-white/15 bg-black/65 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white/85">
            {domainLabel}
          </span>
        ) : null}
      </div>
      ) : null}

      <div
        className={`space-y-5 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-6 ${
          isSplit
            ? "md:border-l md:border-ink/[0.07]"
            : "mx-auto w-full max-w-[46rem]" /* keep line length readable when text runs alone */
        }`}
      >
        {/* Headline block */}
        <header className="space-y-2.5">
          {category ? (
            <span className="inline-flex items-center gap-1.5 rounded border border-ink/[0.08] bg-ink/[0.03] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
              <span className="opacity-80">{category.icon}</span>
              {category.label}
            </span>
          ) : null}
          <h2 className="font-display text-[18px] font-semibold leading-[1.3] tracking-tight text-text-primary sm:text-[22px] sm:leading-[1.28] md:text-[24px]">
            {newsTitleLine(item.title)}
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
        ) : leadText ? (
          <section className="space-y-2">
            <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">
              Summary
            </h3>
            <NewsBody text={leadText} title={item.title} limit={900} />
          </section>
        ) : bodyText ? null : (
          <p className="font-mono text-[11px] text-text-muted/70">
            {isTelegramCredit
              ? "Posted straight to Telegram — open the original for full context."
              : "Full extract unavailable — open the original article."}
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

        {bodyText ? (
          <section className={`space-y-2.5 ${leadText ? "border-t border-ink/[0.07] pt-5" : ""}`}>
            {leadText ? (
              <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">
                Article preview
              </h3>
            ) : null}
            {/* Dulu `cleanText(bodyText)` — ia meratakan newline, jadi
                `whitespace-pre-line` tidak punya apa pun untuk dipertahankan dan
                daftar dari Telegram tampil sebagai satu paragraf panjang. */}
            <NewsBody text={bodyText} title={item.title} />
          </section>
        ) : null}

        {/* Attribution — who published this first, and where to read it there */}
        {credit ? (
          <section className="space-y-2.5 border-t border-ink/[0.07] pt-5">
            <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">
              {isTelegramCredit ? "Shared from" : "Source"}
            </h3>
            <SourceCredit credit={credit} faviconUrl={faviconUrl} />
          </section>
        ) : null}
      </div>
      </div>
    </Modal>
  );
};

// ════════════════════════════════════════════
// 4. PULSE TICKER — horizontal scrolling latest headlines
// ════════════════════════════════════════════

const sourceLabel = (item) =>
  shortDomain(item?.domain) ||
  (item?.source?.name ? String(item.source.name).slice(0, 18) : "") ||
  "Wire";

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

// ── Source chip (favicon or letter — never LuxQuant seal) ──
const SourceMark = ({ item, size = 18 }) => {
  const [failed, setFailed] = useState(false);
  // RSS rows carry no domain, so the card fell back to a bare letter. The API
  // resolves a real mark for every source — channel avatar or publisher icon.
  const resolved = item?.source?.icon;
  const fav = !failed ? resolved || (item?.domain ? getFaviconUrl(item.domain, 64) : null) : null;
  const letter = (sourceLabel(item) || "N").slice(0, 1).toUpperCase();

  if (fav) {
    return (
      <img
        src={fav}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 rounded-md ${
          item?.source?.kind === "telegram" ? "object-cover" : "object-contain"
        }`}
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-ink/[0.06] font-mono font-semibold text-text-muted"
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.48) }}
    >
      {letter}
    </span>
  );
};

// ── Card media: only real photos. On fail → hide (parent reflows to text). ──
const CardMedia = ({ src, hasVideo, tall = false }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed || isLikelyBadImageHost(src)) return null;
  return (
    <div
      className={`relative w-full overflow-hidden bg-ink/[0.05] ${
        tall ? "aspect-[16/10] max-h-[260px]" : "aspect-[16/10]"
      }`}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        onError={() => setFailed(true)}
      />
      {hasVideo && (
        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white">
          <svg className="ml-0.5 h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      )}
    </div>
  );
};

const cardShell =
  "group flex h-full w-full flex-col overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised text-left transition-all duration-200 hover:border-ink/[0.14] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgb(var(--scrim)_/_0.1)]";

// ── Featured (Bitcoin page): image optional · title ALWAYS below on solid surface ──
const FeaturedCard = ({ item, onSelect }) => {
  const src = getCardImage(item);
  const hasVideo = !!getVideoSrc(item);
  return (
    <article
      onClick={() => onSelect(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(item);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Read: ${newsTitleLine(item.title) || "article"}`}
      className="h-full cursor-pointer"
    >
      <div className={cardShell}>
        <CardMedia src={src} hasVideo={hasVideo} tall />
        <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <SourceMark item={item} size={16} />
            <span className="truncate text-[11px] font-medium uppercase tracking-wide text-text-secondary">
              {sourceLabel(item)}
            </span>
            <span className="text-text-muted/40">·</span>
            <span className="shrink-0 tabular-nums text-[11px] text-text-muted">
              {timeAgo(item.created_at)}
            </span>
          </div>
          <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-text-primary line-clamp-3 sm:text-[17px]">
            {newsTitleLine(item.title)}
          </h2>
          {item.description ? (
            <p className="text-[12.5px] leading-relaxed text-text-secondary line-clamp-2">
              {cleanText(item.description)}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
};

// ── Story card (grid): same rule — never title-on-image, never logo tile ──
const StoryCard = ({ item, onSelect }) => {
  const src = getCardImage(item);
  const hasVideo = !!getVideoSrc(item);
  // `title` di DB kadang memuat seluruh isi pesan, bukan judulnya saja.
  const title = newsTitleLine(item.title) || "Untitled";

  return (
    <button type="button" onClick={() => onSelect(item)} className={cardShell}>
      <CardMedia src={src} hasVideo={hasVideo} />
      <div className="flex min-h-[108px] flex-1 flex-col gap-2 p-3 sm:min-h-[118px] sm:p-3.5">
        <h3
          className="text-[12.5px] font-semibold leading-snug text-text-primary sm:text-[13.5px]"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: src ? 3 : 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {title}
        </h3>
        <div className="mt-auto flex items-center gap-2 border-t border-ink/[0.06] pt-2">
          <SourceMark item={item} size={14} />
          <span className="min-w-0 truncate text-[10px] font-medium uppercase tracking-wide text-text-secondary sm:text-[11px]">
            {sourceLabel(item)}
          </span>
          <span className="ml-auto shrink-0 tabular-nums text-[10px] text-text-muted sm:text-[11px]">
            {timeAgo(item.created_at)}
          </span>
        </div>
      </div>
    </button>
  );
};

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

const SideShell = ({ title, children }) => (
  <div className="overflow-hidden rounded-xl border border-ink/[0.06] bg-surface-raised">
    <div className="px-4 py-3">
      <h3 className="text-[14px] font-semibold text-text-primary">{title}</h3>
    </div>
    <div className="px-2 pb-2">{children}</div>
  </div>
);

const MarketDesk = ({ trending, stats, onSearchTopic }) => {
  const topDomains = stats?.top_domains?.slice(0, 7) || [];
  const topics = cleanTrendingTopics(trending, 10);
  return (
    <aside className="space-y-3">
      <SideShell title="Trending">
        {topics.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-text-muted">No topics yet</p>
        ) : (
          <ol className="space-y-px">
            {topics.map((t, i) => (
              <li key={t.topic}>
                <button
                  type="button"
                  onClick={() => onSearchTopic(t.topic)}
                  className="group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-ink/[0.04]"
                >
                  <span className="w-4 shrink-0 font-mono text-[10px] tabular-nums text-text-muted">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">
                    {t.topic}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-muted">
                    ×{t.count}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </SideShell>

      {topDomains.length > 0 && (
        <SideShell title="Sources">
          <ul className="space-y-px">
            {topDomains.map((d) => (
              <li
                key={d.domain}
                className="flex items-center justify-between rounded-lg px-2 py-2"
              >
                <span className="truncate pr-2 text-[13px] text-text-secondary">{d.domain}</span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-muted">
                  {d.count}
                </span>
              </li>
            ))}
          </ul>
        </SideShell>
      )}

      {stats && (
        <SideShell title="Desk pulse">
          <div className="grid grid-cols-3 gap-1.5 px-1 pb-1">
            {[
              { l: "1h", v: stats.last_hour },
              { l: "6h", v: stats.last_6h },
              { l: "All", v: stats.total },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-lg border border-ink/[0.06] bg-surface-secondary px-1.5 py-2.5 text-center"
              >
                <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  {s.l}
                </div>
                <div className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums text-text-primary">
                  {s.v ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </SideShell>
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
    <div className="overflow-hidden rounded-xl border border-ink/[0.06] bg-surface-raised">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="group flex w-full items-center justify-between px-3.5 py-3 sm:px-4"
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-9">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-ink/[0.06]">
              <div className="aspect-[16/10] bg-ink/[0.04]" />
              <div className="space-y-2 p-4">
                <div className="h-4 w-5/6 rounded bg-ink/[0.05]" />
                <div className="h-3 w-full rounded bg-ink/[0.03]" />
                <div className="h-3 w-1/3 rounded bg-ink/[0.03]" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-ink/[0.06]">
              <div className="aspect-[16/10] bg-ink/[0.04]" />
              <div className="h-8 bg-ink/[0.02]" />
            </div>
          ))}
        </div>
      </div>
      <div className="hidden space-y-3 lg:col-span-3 lg:block">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-40 rounded-xl border border-ink/[0.06] bg-ink/[0.03]" />
        ))}
      </div>
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
    { key: "all", label: "All", badge: stats?.total },
    { key: "article", label: "Articles", badge: stats?.articles },
    { key: "photo", label: "Photos", badge: stats?.photos },
    { key: "headline", label: "Headlines", badge: stats?.headlines },
  ];
  const topicOptions = [
    { key: "__all__", label: "Topics" },
    ...CATEGORY_RULES.map((cat) => ({
      key: cat.key,
      label: cat.label,
      badge: categoryCounts[cat.key],
    })),
  ];

  return (
    <div className="space-y-2.5 overflow-hidden rounded-xl border border-ink/[0.06] bg-surface-raised p-3 sm:p-3.5">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted/55"
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
          className="h-10 w-full rounded-lg border border-ink/[0.08] bg-surface-secondary pl-9 pr-9 text-[13px] text-text-primary placeholder:text-text-muted transition-colors focus:border-ink/20 focus:outline-none"
        />
        {searchInput && (
          <button
            type="button"
            onClick={onClearSearch}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-text-muted hover:bg-ink/[0.06] hover:text-text-primary"
            title="Clear search"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        <SegGroup
          size="sm"
          wrap
          aria-label="Content type"
          value={activeFilter}
          onChange={onFilterChange}
          options={typeOptions}
        />
        <SegGroup
          size="sm"
          wrap
          aria-label="Topic"
          value={activeCategory || "__all__"}
          onChange={(key) => onCategoryChange(key === "__all__" ? null : key)}
          options={topicOptions}
        />
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
        if (activeCategory) params.category = activeCategory;
        const res = await api.get(`/api/v1/crypto-news-feed/feed`, { params });
        setAllItems(res.data.items || []);
        setTotal(res.data.total || 0);
      } catch (err) {
        console.error("News feed error:", err);
      } finally {
        setLoading(false);
      }
    },
    [activeFilter, searchQuery, activeCategory]
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
  }, [activeFilter, searchQuery, activeCategory, page, fetchFeed, fetchMeta]);

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
    // The feed labels every row now. The local rules stay as a fallback for
    // rows served from a cache written before the field existed.
    return allItems.map((item) => ({
      ...item,
      // `category` is the first topic the feed matched; `topics` is all of
      // them. categorizeItem is only reached for rows cached before the feed
      // started labelling them.
      _category: item.category ?? categorizeItem(item),
    }));
  }, [allItems]);

  // Counting the loaded page said "Bitcoin 12" out of 346 and left Altcoins
  // blank while 52 altcoin stories waited behind it. These come from /stats,
  // over the whole window, and follow the active kind so the number always
  // matches what picking the chip would actually return.
  const categoryCounts = useMemo(() => {
    if (!stats) return {};
    if (activeFilter === "all") return stats.categories || {};
    return (stats.categories_by_type || {})[activeFilter] || {};
  }, [stats, activeFilter]);

  // Filtering here as well would narrow a page the server had already
  // narrowed — which is what emptied the grid: the topic was applied to the 28
  // rows on screen while the pager still counted every story in the feed.
  const filteredItems = itemsWithCategory;

  // Featured pair only on clean page-1 feed (Bitcoin-page pattern)
  const heroEnabled = page === 1 && !searchQuery && !activeCategory && activeFilter === "all";

  const { featured, gridItems } = useMemo(() => {
    // Prefer real article photos (not brand fillers) for featured + denser grid.
    const hasPhoto = (it) => !!getCardImage(it);

    if (!heroEnabled || filteredItems.length === 0) {
      // Even without hero: put photo stories first so the page looks full.
      const withP = [];
      const noP = [];
      for (const it of filteredItems) {
        (hasPhoto(it) ? withP : noP).push(it);
      }
      return { featured: [], gridItems: [...withP, ...noP] };
    }

    const used = new Set();
    const featured = [];
    for (const it of filteredItems) {
      if (featured.length >= 2) break;
      if (hasPhoto(it)) {
        featured.push(it);
        used.add(it.id);
      }
    }
    // Don't force text-only into featured — keep featured for real visuals only.
    const rest = filteredItems.filter((it) => !used.has(it.id));
    const withP = [];
    const noP = [];
    for (const it of rest) {
      (hasPhoto(it) ? withP : noP).push(it);
    }
    return { featured, gridItems: [...withP, ...noP] };
  }, [filteredItems, heroEnabled]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const sectionLabel = activeCategory
    ? CATEGORY_RULES.find((c) => c.key === activeCategory)?.label
    : searchQuery
      ? "Search results"
      : "Latest";

  // ── Render ─────────────────────────────
  return (
    <div className="space-y-3 pb-10 sm:space-y-4">
      {selectedItem && <NewsModal item={selectedItem} onClose={closeArticle} />}

      <PageHeader
        title="News"
        subtitle="Markets wire · live crypto headlines"
        right={
          stats?.total != null ? (
            <span className="font-mono text-[12px] tabular-nums text-text-muted">
              {Number(stats.total).toLocaleString()} stories
              {stats.last_hour != null ? (
                <span className="ml-2 text-text-secondary">
                  · <span className="font-semibold text-text-primary">{stats.last_hour}</span> / 1h
                </span>
              ) : null}
            </span>
          ) : null
        }
      />

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

      {loading ? (
        <LoadingSkeleton />
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-ink/[0.06] bg-surface-raised py-16 text-center">
          <p className="mb-1 text-base font-semibold text-text-primary">No results</p>
          <p className="max-w-sm text-[13px] text-text-muted">
            {searchQuery
              ? `Nothing matches “${searchQuery}”.`
              : activeCategory
                ? "No stories in this topic — clear the filter."
                : "The wire is quiet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-5">
          <div className="min-w-0 space-y-4 lg:col-span-9">
            {/* Featured — Bitcoin-page dual cards */}
            {featured.length > 0 && (
              <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {featured.map((it) => (
                  <FeaturedCard key={it.id} item={it} onSelect={openArticle} />
                ))}
              </section>
            )}

            {/* Mobile insights */}
            <div className="lg:hidden">
              <CollapsibleInsights
                trending={trending}
                stats={stats}
                onSearchTopic={handleSearchTopic}
              />
            </div>

            {/* Grid — Choose-news style cards */}
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-[14px] font-semibold text-text-primary">{sectionLabel}</h2>
                <span className="font-mono text-[11px] tabular-nums text-text-muted">
                  {gridItems.length} headlines
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3">
                {(gridItems.length > 0 ? gridItems : filteredItems).map((it) => (
                  <StoryCard key={it.id} item={it} onSelect={openArticle} />
                ))}
              </div>
              <div className="pt-2">
                <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
              </div>
            </section>
          </div>

          <div className="hidden lg:col-span-3 lg:block lg:sticky lg:top-16 lg:self-start">
            <MarketDesk trending={trending} stats={stats} onSearchTopic={handleSearchTopic} />
          </div>
        </div>
      )}

      <AssistantWidget pageId="crypto-news" />
    </div>
  );
};

export default CryptoNewsPage;
