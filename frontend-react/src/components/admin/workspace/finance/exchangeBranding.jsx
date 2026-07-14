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
 * Each brand: primary color, soft bg, official logo file, display name.
 * Keys are normalized lowercase (no spaces/dashes).
 * Logos live in /public/exchanges/ (served as /exchanges/*).
 */
export const EXCHANGE_BRANDS = {
  binance: {
    key: 'binance',
    name: 'Binance',
    primary: '#F0B90B',
    secondary: '#1E2026',
    glow: 'rgba(240,185,11,0.35)',
    bgFrom: 'rgba(240,185,11,0.16)',
    bgTo: 'rgba(30,32,38,0.55)',
    border: 'rgba(240,185,11,0.38)',
    logoBg: '#1E2026',
    logoFg: '#F0B90B',
    logoSrc: '/exchanges/binance.png',
  },
  indodax: {
    key: 'indodax',
    name: 'Indodax',
    primary: '#1E9CF0',
    secondary: '#06142B',
    glow: 'rgba(30,156,240,0.38)',
    bgFrom: 'rgba(30,156,240,0.18)',
    bgTo: 'rgba(6,20,43,0.55)',
    border: 'rgba(30,156,240,0.42)',
    logoBg: '#1E9CF0',
    logoFg: '#FFFFFF',
    logoSrc: '/exchanges/indodax.png',
  },
  bybit: {
    key: 'bybit',
    name: 'Bybit',
    primary: '#F7A600',
    secondary: '#121212',
    glow: 'rgba(247,166,0,0.32)',
    bgFrom: 'rgba(247,166,0,0.14)',
    bgTo: 'rgba(18,18,18,0.55)',
    border: 'rgba(247,166,0,0.36)',
    logoBg: '#121212',
    logoFg: '#F7A600',
    logoSrc: '/exchanges/bybit.png',
  },
  okx: {
    key: 'okx',
    name: 'OKX',
    primary: '#FFFFFF',
    secondary: '#000000',
    glow: 'rgba(255,255,255,0.18)',
    bgFrom: 'rgba(255,255,255,0.08)',
    bgTo: 'rgba(0,0,0,0.45)',
    border: 'rgba(255,255,255,0.22)',
    logoBg: '#000000',
    logoFg: '#FFFFFF',
    logoSrc: '/exchanges/okx.png',
  },
  mexc: {
    key: 'mexc',
    name: 'MEXC',
    primary: '#1463FF',
    secondary: '#0B1220',
    glow: 'rgba(20,99,255,0.35)',
    bgFrom: 'rgba(20,99,255,0.16)',
    bgTo: 'rgba(11,18,32,0.55)',
    border: 'rgba(20,99,255,0.40)',
    logoBg: '#F4F7FB',
    logoFg: '#1463FF',
    logoSrc: '/exchanges/mexc.png',
  },
  gate: {
    key: 'gate',
    name: 'Gate.io',
    primary: '#17E6A1',
    secondary: '#0A1A14',
    glow: 'rgba(23,230,161,0.28)',
    bgFrom: 'rgba(23,230,161,0.12)',
    bgTo: 'rgba(10,26,20,0.55)',
    border: 'rgba(23,230,161,0.34)',
    logoBg: '#0A1A14',
    logoFg: '#17E6A1',
    logoSrc: '/exchanges/gate.png',
  },
  gateio: {
    key: 'gate',
    name: 'Gate.io',
    primary: '#17E6A1',
    secondary: '#0A1A14',
    glow: 'rgba(23,230,161,0.28)',
    bgFrom: 'rgba(23,230,161,0.12)',
    bgTo: 'rgba(10,26,20,0.55)',
    border: 'rgba(23,230,161,0.34)',
    logoBg: '#0A1A14',
    logoFg: '#17E6A1',
    logoSrc: '/exchanges/gate.png',
  },
  kucoin: {
    key: 'kucoin',
    name: 'KuCoin',
    primary: '#23AF91',
    secondary: '#0C1A16',
    glow: 'rgba(35,175,145,0.3)',
    bgFrom: 'rgba(35,175,145,0.14)',
    bgTo: 'rgba(12,26,22,0.55)',
    border: 'rgba(35,175,145,0.34)',
    logoBg: '#0C1A16',
    logoFg: '#23AF91',
    logoSrc: '/exchanges/kucoin.png',
  },
  bitget: {
    key: 'bitget',
    name: 'Bitget',
    primary: '#00F0FF',
    secondary: '#0A1520',
    glow: 'rgba(0,240,255,0.28)',
    bgFrom: 'rgba(0,240,255,0.12)',
    bgTo: 'rgba(10,21,32,0.55)',
    border: 'rgba(0,240,255,0.34)',
    logoBg: '#0A1520',
    logoFg: '#00F0FF',
    logoSrc: '/exchanges/bitget.png',
  },
  htx: {
    key: 'htx',
    name: 'HTX',
    primary: '#2EBD85',
    secondary: '#0B1A14',
    glow: 'rgba(46,189,133,0.3)',
    bgFrom: 'rgba(46,189,133,0.14)',
    bgTo: 'rgba(11,26,20,0.55)',
    border: 'rgba(46,189,133,0.34)',
    logoBg: '#0B1A14',
    logoFg: '#2EBD85',
    logoSrc: '/exchanges/htx.png',
  },
  huobi: {
    key: 'htx',
    name: 'HTX',
    primary: '#2EBD85',
    secondary: '#0B1A14',
    glow: 'rgba(46,189,133,0.3)',
    bgFrom: 'rgba(46,189,133,0.14)',
    bgTo: 'rgba(11,26,20,0.55)',
    border: 'rgba(46,189,133,0.34)',
    logoBg: '#0B1A14',
    logoFg: '#2EBD85',
    logoSrc: '/exchanges/htx.png',
  },
};

const FALLBACK_BRAND = {
  key: 'unknown',
  name: 'Wallet',
  primary: '#d4a853',
  secondary: '#1a0d12',
  glow: 'rgba(212,168,83,0.28)',
  bgFrom: 'rgba(212,168,83,0.12)',
  bgTo: 'rgba(26,13,18,0.55)',
  border: 'rgba(212,168,83,0.32)',
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
        background: showImg ? '#0a0a0c' : brand.logoBg,
        boxShadow: `0 4px 16px ${brand.glow}, 0 0 0 1px ${brand.primary}33`,
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
        <>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              borderRadius: radius,
              background:
                'linear-gradient(145deg, rgba(255,255,255,0.28) 0%, transparent 48%, rgba(0,0,0,0.12) 100%)',
            }}
          />
          <Mark
            size={markSize}
            fg={brand.logoFg}
            letter={(brand.name || '?').charAt(0).toUpperCase()}
          />
        </>
      )}
    </div>
  );
};

/** Compact badge with logo + name — for table rows */
export const ExchangeBadge = ({ exchange, dense = false }) => {
  if (!exchange) return null;
  const brand = resolveExchangeBrand(exchange);
  const logoSize = dense ? 14 : 16;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-md ${
        dense ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'
      }`}
      style={{
        background: `${brand.primary}14`,
        color: brand.primary === '#FFFFFF' ? '#e8e8e8' : brand.primary,
        border: `1px solid ${brand.primary}33`,
      }}
      title={`Received into ${brand.name}`}
    >
      <ExchangeLogo exchange={exchange} size={logoSize} />
      <span className="uppercase tracking-wide">{brand.name}</span>
    </span>
  );
};

/* ── Meta chip ────────────────────────────────────────────────────── */

const MetaChip = ({ icon: Icon, label, value, accent }) => (
  <div
    className="flex flex-col gap-0.5 min-w-0 rounded-lg px-2.5 py-2"
    style={{
      background: 'rgba(0,0,0,0.28)',
      border: '1px solid rgba(255,255,255,0.06)',
    }}
  >
    <span
      className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] font-semibold"
      style={{ color: accent || 'rgba(255,255,255,0.42)' }}
    >
      {Icon && <Icon size={10} />}
      {label}
    </span>
    <span
      className="text-[11px] font-medium tabular-nums truncate"
      style={{ color: '#f5f0e8' }}
      title={typeof value === 'string' ? value : undefined}
    >
      {value || '—'}
    </span>
  </div>
);

/**
 * Premium hero card for PaymentDetailPanel.
 * Brand-colored surface + logo + amount + timestamps + network/plan.
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

  const textOnBrand =
    brand.primary === '#FFFFFF' ? '#e8e8e8' : brand.primary;

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: `linear-gradient(145deg, ${brand.bgFrom} 0%, ${brand.bgTo} 55%, rgba(10,5,6,0.92) 100%)`,
        border: `1px solid ${brand.border}`,
        boxShadow: `0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.03) inset`,
      }}
    >
      {/* Brand glow orbs */}
      <div
        className="absolute -top-16 -right-10 w-44 h-44 rounded-full pointer-events-none"
        style={{ background: brand.glow, filter: 'blur(40px)' }}
      />
      <div
        className="absolute -bottom-20 -left-10 w-40 h-40 rounded-full pointer-events-none"
        style={{ background: `${cfg.color}22`, filter: 'blur(36px)' }}
      />
      {/* subtle card sheen */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{
          background: `linear-gradient(to right, transparent, ${brand.primary}88, transparent)`,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, #fff 0.6px, transparent 0.7px)',
          backgroundSize: '14px 14px',
        }}
      />

      <div className="relative p-4 sm:p-5 space-y-4">
        {/* Top row: logo + brand + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <ExchangeLogo exchange={payment.wallet_to_exchange} size={48} />
            <div className="min-w-0">
              <p
                className="text-[10px] uppercase tracking-[0.16em] font-semibold mb-0.5"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                Received into
              </p>
              <p
                className="text-[17px] font-bold tracking-tight truncate leading-none"
                style={{ color: textOnBrand }}
              >
                {brand.name}
              </p>
              {payment.wallet_to_label && (
                <p
                  className="text-[10.5px] mt-1 truncate"
                  style={{ color: 'rgba(255,255,255,0.45)' }}
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
                background: cfg.bg,
                color: cfg.color,
                border: `1px solid ${cfg.border}`,
              }}
            >
              {cfg.label}
            </span>
            {payment.is_stale && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded inline-flex items-center gap-1 animate-pulse"
                style={{
                  background: 'rgba(248,113,113,0.12)',
                  color: '#f87171',
                  border: '1px solid rgba(248,113,113,0.32)',
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
                  background: 'rgba(212,168,83,0.12)',
                  color: '#d4a853',
                  border: '1px solid rgba(212,168,83,0.3)',
                }}
              >
                <StarIcon size={9} /> Manual
              </span>
            )}
          </div>
        </div>

        {/* Amount block */}
        <div className="pt-1">
          <p
            className="text-[9.5px] uppercase tracking-[0.14em] font-semibold mb-1.5"
            style={{ color: 'rgba(255,255,255,0.42)' }}
          >
            Final amount
          </p>
          <div className="flex items-end gap-2 flex-wrap">
            <p
              className="text-[38px] sm:text-[42px] font-light tabular-nums tracking-tight leading-none"
              style={{ color: '#fff', letterSpacing: '-0.03em' }}
            >
              {formatUSDT(payment.final_amount)}
            </p>
            <span
              className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 px-2 py-0.5 rounded-md"
              style={{
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.65)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              USDT
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            <span
              className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md"
              style={{
                background: `${brand.primary}18`,
                color: textOnBrand,
                border: `1px solid ${brand.primary}30`,
              }}
            >
              {network}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
            <span
              className="text-[10.5px] font-medium px-2 py-0.5 rounded-md"
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {planLabel}
            </span>
          </div>
        </div>

        {/* Time / payment meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
          <MetaChip
            icon={CalendarDotIcon}
            label="Payment date"
            value={
              payment.verified_at
                ? formatDateTimeLong(payment.verified_at)
                : 'Not verified yet'
            }
            accent={payment.verified_at ? '#d4a853' : undefined}
          />
          <MetaChip
            icon={ClockIcon}
            label="Recorded"
            value={formatDateTimeLong(payment.created_at)}
          />
          <MetaChip
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
