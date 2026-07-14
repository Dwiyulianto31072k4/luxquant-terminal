// ════════════════════════════════════════════════════════════════════
// Exchange branding — logos, brand colors, and premium payment cards
// Used by PaymentDetailPanel + PaymentsTable.
// ════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { formatDateTimeLong, formatRelative, formatUSDT, getStatusConfig } from './helpers';
import { AlertTriangleIcon, StarIcon, ClockIcon } from '../../Icons';
import { CalendarDotIcon, TimerIcon } from '../CategoryIcons';

/* ── Brand palette + mark ─────────────────────────────────────────── */

/**
 * Official-ish brand tokens (researched from each exchange UI):
 *  · Binance  — Yellow #F0B90B / #FCD535 on Shark #0B0E11 / #1E2329
 *  · Gate.io  — Mint #17E6A1 + Blue #2354E6 on deep navy surface
 *  · MEXC     — Ocean Blue #1463FF on dark slate
 *  · Indodax  — Sky Blue #1E9CF0
 *  · Bybit    — Orange #F7A600 on pure black
 *  · OKX      — White on black
 *
 * Surfaces use SOLID hex (no glass/rgba fills) so cards don't look washed.
 * Keys are normalized lowercase (no spaces/dashes).
 * Logos live in /public/exchanges/ (served as /exchanges/*).
 */
export const EXCHANGE_BRANDS = {
  binance: {
    key: 'binance',
    name: 'Binance',
    primary: '#F0B90B',
    accent: '#FCD535',
    surface: '#0B0E11',
    surfaceRaised: '#1E2329',
    surfaceInset: '#181A20',
    border: '#2B3139',
    borderAccent: '#F0B90B',
    text: '#EAECEF',
    textMuted: '#848E9C',
    logoBg: '#0B0E11',
    logoFg: '#F0B90B',
    logoSrc: '/exchanges/binance.png',
  },
  indodax: {
    key: 'indodax',
    name: 'Indodax',
    primary: '#1E9CF0',
    accent: '#4DB3F5',
    surface: '#071018',
    surfaceRaised: '#0D1B2A',
    surfaceInset: '#0A1622',
    border: '#1A3348',
    borderAccent: '#1E9CF0',
    text: '#E8F4FC',
    textMuted: '#7BA3BE',
    logoBg: '#1E9CF0',
    logoFg: '#FFFFFF',
    logoSrc: '/exchanges/indodax.png',
  },
  bybit: {
    key: 'bybit',
    name: 'Bybit',
    primary: '#F7A600',
    accent: '#FFB11A',
    surface: '#0D0D0D',
    surfaceRaised: '#1A1A1A',
    surfaceInset: '#141414',
    border: '#2A2A2A',
    borderAccent: '#F7A600',
    text: '#F5F5F5',
    textMuted: '#8C8C8C',
    logoBg: '#0D0D0D',
    logoFg: '#F7A600',
    logoSrc: '/exchanges/bybit.png',
  },
  okx: {
    key: 'okx',
    name: 'OKX',
    primary: '#FFFFFF',
    accent: '#CCCCCC',
    surface: '#000000',
    surfaceRaised: '#121212',
    surfaceInset: '#0A0A0A',
    border: '#2A2A2A',
    borderAccent: '#FFFFFF',
    text: '#FFFFFF',
    textMuted: '#8C8C8C',
    logoBg: '#000000',
    logoFg: '#FFFFFF',
    logoSrc: '/exchanges/okx.png',
  },
  mexc: {
    key: 'mexc',
    name: 'MEXC',
    primary: '#1463FF',
    accent: '#3D7FFF',
    surface: '#070B14',
    surfaceRaised: '#0F1729',
    surfaceInset: '#0B1220',
    border: '#1A2744',
    borderAccent: '#1463FF',
    text: '#E8EEF9',
    textMuted: '#7A8BA8',
    logoBg: '#F4F7FB',
    logoFg: '#1463FF',
    logoSrc: '/exchanges/mexc.png',
  },
  gate: {
    key: 'gate',
    name: 'Gate.io',
    primary: '#17E6A1',
    accent: '#2354E6',
    surface: '#0A0F14',
    surfaceRaised: '#111B22',
    surfaceInset: '#0D141A',
    border: '#1C2A33',
    borderAccent: '#17E6A1',
    text: '#E8F7F1',
    textMuted: '#6F8A7E',
    logoBg: '#FFFFFF',
    logoFg: '#2354E6',
    logoSrc: '/exchanges/gate.png',
  },
  gateio: {
    key: 'gate',
    name: 'Gate.io',
    primary: '#17E6A1',
    accent: '#2354E6',
    surface: '#0A0F14',
    surfaceRaised: '#111B22',
    surfaceInset: '#0D141A',
    border: '#1C2A33',
    borderAccent: '#17E6A1',
    text: '#E8F7F1',
    textMuted: '#6F8A7E',
    logoBg: '#FFFFFF',
    logoFg: '#2354E6',
    logoSrc: '/exchanges/gate.png',
  },
  kucoin: {
    key: 'kucoin',
    name: 'KuCoin',
    primary: '#23AF91',
    accent: '#2DD4B0',
    surface: '#0A1210',
    surfaceRaised: '#12201C',
    surfaceInset: '#0E1916',
    border: '#1C332C',
    borderAccent: '#23AF91',
    text: '#E6F7F2',
    textMuted: '#6F8F86',
    logoBg: '#0A1210',
    logoFg: '#23AF91',
    logoSrc: '/exchanges/kucoin.png',
  },
  bitget: {
    key: 'bitget',
    name: 'Bitget',
    primary: '#00F0FF',
    accent: '#00C2CC',
    surface: '#070C12',
    surfaceRaised: '#0E1720',
    surfaceInset: '#0A1218',
    border: '#1A2A36',
    borderAccent: '#00F0FF',
    text: '#E6FBFD',
    textMuted: '#6A8A90',
    logoBg: '#070C12',
    logoFg: '#00F0FF',
    logoSrc: '/exchanges/bitget.png',
  },
  htx: {
    key: 'htx',
    name: 'HTX',
    primary: '#2EBD85',
    accent: '#3DD49A',
    surface: '#0A1210',
    surfaceRaised: '#12201A',
    surfaceInset: '#0E1914',
    border: '#1C332A',
    borderAccent: '#2EBD85',
    text: '#E6F7EF',
    textMuted: '#6F8F80',
    logoBg: '#0A1210',
    logoFg: '#2EBD85',
    logoSrc: '/exchanges/htx.png',
  },
  huobi: {
    key: 'htx',
    name: 'HTX',
    primary: '#2EBD85',
    accent: '#3DD49A',
    surface: '#0A1210',
    surfaceRaised: '#12201A',
    surfaceInset: '#0E1914',
    border: '#1C332A',
    borderAccent: '#2EBD85',
    text: '#E6F7EF',
    textMuted: '#6F8F80',
    logoBg: '#0A1210',
    logoFg: '#2EBD85',
    logoSrc: '/exchanges/htx.png',
  },
};

const FALLBACK_BRAND = {
  key: 'unknown',
  name: 'Wallet',
  primary: '#d4a853',
  accent: '#e0bc6a',
  surface: '#12090d',
  surfaceRaised: '#1a0d12',
  surfaceInset: '#160a0e',
  border: '#2d1a20',
  borderAccent: '#d4a853',
  text: '#f5f0e8',
  textMuted: '#8a7a6e',
  logoBg: '#d4a853',
  logoFg: '#1a0d12',
  logoSrc: null,
};

export const normalizeExchangeKey = (name) => {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/[\s._-]+/g, '')
    .replace(/\.io$/, 'io');
};

export const resolveExchangeBrand = (name) => {
  if (!name) return { ...FALLBACK_BRAND, name: 'Unknown' };
  const key = normalizeExchangeKey(name);
  const brand = EXCHANGE_BRANDS[key];
  if (brand) return { ...brand, name: brand.name || name };
  // fuzzy: starts-with match
  for (const [k, b] of Object.entries(EXCHANGE_BRANDS)) {
    if (key.includes(k) || k.includes(key)) return { ...b };
  }
  return {
    ...FALLBACK_BRAND,
    name: String(name),
    key: key || 'unknown',
  };
};

export const brandColor = (name) => resolveExchangeBrand(name).primary;

/* ── Logo marks (inline SVG — crisp at any size) ──────────────────── */

const BinanceMark = ({ size = 28, fg = '#1E2026' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
    {/* Classic Binance diamond lattice */}
    <path d="M32 8L38.5 14.5L32 21L25.5 14.5L32 8Z" fill={fg} />
    <path d="M45.5 21.5L52 28L45.5 34.5L39 28L45.5 21.5Z" fill={fg} />
    <path d="M18.5 21.5L25 28L18.5 34.5L12 28L18.5 21.5Z" fill={fg} />
    <path d="M32 35L38.5 41.5L32 48L25.5 41.5L32 35Z" fill={fg} />
    <path d="M32 21.5L45.5 35L32 48.5L18.5 35L32 21.5Z" fill={fg} opacity={0.92} />
    <path d="M52 35L58.5 41.5L52 48L45.5 41.5L52 35Z" fill={fg} />
    <path d="M12 35L18.5 41.5L12 48L5.5 41.5L12 35Z" fill={fg} />
    <path d="M32 48.5L38.5 55L32 61.5L25.5 55L32 48.5Z" fill={fg} />
  </svg>
);

const IndodaxMark = ({ size = 28, fg = '#FFFFFF' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
    {/* Stylized "I" + coin ring — Indodax-inspired */}
    <circle cx="32" cy="32" r="22" stroke={fg} strokeWidth="3.5" opacity={0.9} />
    <rect x="28" y="18" width="8" height="28" rx="2.5" fill={fg} />
    <circle cx="32" cy="14" r="3.5" fill={fg} />
    <path
      d="M20 44c3.5 6 8.5 9 12 9s8.5-3 12-9"
      stroke={fg}
      strokeWidth="3"
      strokeLinecap="round"
      opacity={0.75}
    />
  </svg>
);

const BybitMark = ({ size = 28, fg = '#121212' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
    <path
      d="M14 18h16c8 0 14 5 14 13s-6 13-14 13H24v12H14V18zm10 8v10h5c3.5 0 6-2 6-5s-2.5-5-6-5h-5z"
      fill={fg}
    />
    <circle cx="48" cy="46" r="6" fill={fg} />
  </svg>
);

const OkxMark = ({ size = 28, fg = '#000000' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
    <rect x="10" y="10" width="16" height="16" rx="2" fill={fg} />
    <rect x="38" y="10" width="16" height="16" rx="2" fill={fg} />
    <rect x="24" y="24" width="16" height="16" rx="2" fill={fg} />
    <rect x="10" y="38" width="16" height="16" rx="2" fill={fg} />
    <rect x="38" y="38" width="16" height="16" rx="2" fill={fg} />
  </svg>
);

const MexcMark = ({ size = 28, fg = '#0B1220' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
    <path
      d="M12 46V18h8l12 18 12-18h8v28h-8V32L32 48 20 32v14h-8z"
      fill={fg}
    />
  </svg>
);

const GateMark = ({ size = 28, fg = '#0A1A14' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
    <circle cx="32" cy="32" r="20" stroke={fg} strokeWidth="4" />
    <path d="M22 32h20M32 22v20" stroke={fg} strokeWidth="4" strokeLinecap="round" />
  </svg>
);

const KucoinMark = ({ size = 28, fg = '#FFFFFF' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
    <circle cx="32" cy="32" r="8" fill={fg} />
    <circle cx="16" cy="18" r="5" fill={fg} opacity={0.85} />
    <circle cx="48" cy="18" r="5" fill={fg} opacity={0.85} />
    <circle cx="16" cy="46" r="5" fill={fg} opacity={0.85} />
    <circle cx="48" cy="46" r="5" fill={fg} opacity={0.85} />
    <path d="M20 22l8 6M44 22l-8 6M20 42l8-6M44 42l-8-6" stroke={fg} strokeWidth="2.5" opacity={0.7} />
  </svg>
);

const BitgetMark = ({ size = 28, fg = '#0A1520' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
    <path d="M14 44L32 12l18 32H14z" fill={fg} opacity={0.9} />
    <path d="M24 44l8-14 8 14H24z" fill={fg} opacity={0.45} />
  </svg>
);

const HtxMark = ({ size = 28, fg = '#FFFFFF' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
    <path d="M18 16h10v14h14V16h10v32H42V38H28v10H18V16z" fill={fg} />
  </svg>
);

const FallbackMark = ({ size = 28, fg = '#1a0d12', letter = '?' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
    <text
      x="32"
      y="40"
      textAnchor="middle"
      fontSize="28"
      fontWeight="800"
      fontFamily="system-ui,sans-serif"
      fill={fg}
    >
      {letter}
    </text>
  </svg>
);

const MARK_BY_KEY = {
  binance: BinanceMark,
  indodax: IndodaxMark,
  bybit: BybitMark,
  okx: OkxMark,
  mexc: MexcMark,
  gate: GateMark,
  kucoin: KucoinMark,
  bitget: BitgetMark,
  htx: HtxMark,
};

/**
 * Square logo tile — prefers official raster logo from /exchanges/*,
 * falls back to brand SVG mark if image missing/broken.
 */
export const ExchangeLogo = ({ exchange, size = 40, className = '' }) => {
  const brand = resolveExchangeBrand(exchange);
  const Mark = MARK_BY_KEY[brand.key] || FallbackMark;
  const markSize = Math.round(size * 0.58);
  const radius = Math.max(8, Math.round(size * 0.22));
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = Boolean(brand.logoSrc) && !imgFailed;

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: brand.logoBg || brand.surface,
        border: `1px solid ${brand.borderAccent || brand.primary}`,
        boxShadow: `0 2px 8px ${brand.surface}CC`,
      }}
      title={brand.name}
      aria-label={`${brand.name} logo`}
    >
      {showImg ? (
        <img
          src={brand.logoSrc}
          alt={`${brand.name} logo`}
          width={size}
          height={size}
          draggable={false}
          onError={() => setImgFailed(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <Mark
          size={markSize}
          fg={brand.logoFg}
          letter={(brand.name || '?').charAt(0).toUpperCase()}
        />
      )}
    </div>
  );
};

/** Compact badge with logo + name — for table rows */
export const ExchangeBadge = ({ exchange, dense = false }) => {
  if (!exchange) return null;
  const brand = resolveExchangeBrand(exchange);
  const logoSize = dense ? 14 : 16;
  const labelColor = brand.primary === '#FFFFFF' ? brand.text : brand.primary;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-md ${
        dense ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'
      }`}
      style={{
        background: brand.surfaceRaised,
        color: labelColor,
        border: `1px solid ${brand.border}`,
      }}
      title={`Received into ${brand.name}`}
    >
      <ExchangeLogo exchange={exchange} size={logoSize} />
      <span className="uppercase tracking-wide">{brand.name}</span>
    </span>
  );
};

/* ── Meta chip (solid inset surface) ──────────────────────────────── */

const MetaChip = ({ icon: Icon, label, value, accent, brand }) => (
  <div
    className="flex flex-col gap-0.5 min-w-0 rounded-lg px-2.5 py-2"
    style={{
      background: brand.surfaceInset,
      border: `1px solid ${brand.border}`,
    }}
  >
    <span
      className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] font-semibold"
      style={{ color: accent || brand.textMuted }}
    >
      {Icon && <Icon size={10} />}
      {label}
    </span>
    <span
      className="text-[11px] font-medium tabular-nums truncate"
      style={{ color: brand.text }}
      title={typeof value === 'string' ? value : undefined}
    >
      {value || '—'}
    </span>
  </div>
);

/**
 * Premium hero card for PaymentDetailPanel.
 * SOLID brand surface (no glass/transparency) matching each exchange UI.
 */
export const ExchangePaymentHero = ({ payment }) => {
  if (!payment) return null;

  const brand = resolveExchangeBrand(payment.wallet_to_exchange);
  const cfg = getStatusConfig(payment.status);
  const planLabel =
    payment.plan?.name ||
    payment.plan?.label ||
    (payment.plan_id != null ? `Plan #${payment.plan_id}` : '—');
  const network = payment.network || '—';
  const age =
    payment.age_hours != null
      ? payment.age_hours < 1
        ? `${Math.round(payment.age_hours * 60)}m`
        : `${payment.age_hours}h`
      : formatRelative(payment.created_at);

  const nameColor = brand.primary === '#FFFFFF' ? brand.text : brand.primary;

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: brand.surface,
        border: `1px solid ${brand.borderAccent}`,
        boxShadow: `0 8px 28px ${brand.surface}F0, inset 0 1px 0 ${brand.surfaceRaised}`,
      }}
    >
      {/* Solid brand rail (left) — exchange product-card language */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: brand.primary }}
      />
      {/* Subtle solid top accent strip (not transparent blur) */}
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, ${brand.primary}, ${brand.accent || brand.primary}, ${brand.surface})`,
        }}
      />
      {/* Solid raised panel block behind amount — no glass */}
      <div
        className="absolute right-0 top-0 w-[42%] h-full pointer-events-none"
        style={{
          background: `linear-gradient(115deg, ${brand.surface} 0%, ${brand.surfaceRaised} 100%)`,
        }}
      />

      <div className="relative p-4 sm:p-5 space-y-4 pl-5">
        {/* Top row: logo + brand + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <ExchangeLogo exchange={payment.wallet_to_exchange} size={48} />
            <div className="min-w-0">
              <p
                className="text-[10px] uppercase tracking-[0.16em] font-semibold mb-0.5"
                style={{ color: brand.textMuted }}
              >
                Received into
              </p>
              <p
                className="text-[17px] font-bold tracking-tight truncate leading-none"
                style={{ color: nameColor }}
              >
                {brand.name}
              </p>
              {payment.wallet_to_label && (
                <p
                  className="text-[10.5px] mt-1 truncate font-mono"
                  style={{ color: brand.textMuted }}
                  title={payment.wallet_to_label}
                >
                  {payment.wallet_to_label}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span
              className="text-[9.5px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded"
              style={{
                background: brand.surfaceInset,
                color: cfg.color,
                border: `1px solid ${brand.border}`,
              }}
            >
              {cfg.label}
            </span>
            {payment.is_stale && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                style={{
                  background: brand.surfaceInset,
                  color: '#f87171',
                  border: `1px solid ${brand.border}`,
                }}
              >
                <AlertTriangleIcon size={9} />
                Stale {payment.age_hours}h
              </span>
            )}
            {payment.is_manual && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                style={{
                  background: brand.surfaceInset,
                  color: brand.primary,
                  border: `1px solid ${brand.border}`,
                }}
              >
                <StarIcon size={9} /> Manual
              </span>
            )}
          </div>
        </div>

        {/* Amount block */}
        <div className="pt-0.5">
          <p
            className="text-[9.5px] uppercase tracking-[0.14em] font-semibold mb-1.5"
            style={{ color: brand.textMuted }}
          >
            Final amount
          </p>
          <div className="flex items-end gap-2 flex-wrap">
            <p
              className="text-[38px] sm:text-[42px] font-semibold tabular-nums tracking-tight leading-none"
              style={{ color: brand.text, letterSpacing: '-0.03em' }}
            >
              {formatUSDT(payment.final_amount)}
            </p>
            <span
              className="text-[11px] font-bold uppercase tracking-wider mb-1.5 px-2 py-0.5 rounded-md"
              style={{
                background: brand.surfaceRaised,
                color: brand.primary,
                border: `1px solid ${brand.borderAccent}`,
              }}
            >
              USDT
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            <span
              className="text-[10.5px] font-bold px-2 py-0.5 rounded-md"
              style={{
                background: brand.surfaceRaised,
                color: brand.primary,
                border: `1px solid ${brand.borderAccent}`,
              }}
            >
              {network}
            </span>
            <span style={{ color: brand.border }}>·</span>
            <span
              className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md"
              style={{
                background: brand.surfaceInset,
                color: brand.text,
                border: `1px solid ${brand.border}`,
              }}
            >
              {planLabel}
            </span>
          </div>
        </div>

        {/* Time / payment meta grid — solid inset chips */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
          <MetaChip
            brand={brand}
            icon={CalendarDotIcon}
            label="Payment date"
            value={
              payment.verified_at
                ? formatDateTimeLong(payment.verified_at)
                : 'Not verified yet'
            }
            accent={payment.verified_at ? brand.primary : brand.textMuted}
          />
          <MetaChip
            brand={brand}
            icon={ClockIcon}
            label="Recorded"
            value={formatDateTimeLong(payment.created_at)}
          />
          <MetaChip
            brand={brand}
            icon={TimerIcon}
            label={payment.status === 'pending' ? 'Age' : 'Relative'}
            value={age || '—'}
            accent={payment.is_stale ? '#f87171' : brand.primary}
          />
        </div>
      </div>
    </div>
  );
};
