// src/utils/currencyHelpers.js
/**
 * Currency conversion & formatting utilities.
 *
 * Rates come from /api/v1/fx/rates (USDT-as-base).
 * Conversion formula: local_price = usdt_price * rates[currency]
 *
 * Format uses native Intl.NumberFormat with currency style.
 * Adaptive precision for micro-cap altcoins (e.g., Rp 0,000234).
 */

// ─────────────────────────────────────────────────────────────────────
// Currency display metadata
// ─────────────────────────────────────────────────────────────────────

// Currencies with no decimal places by convention (IDR, JPY, KRW, VND, etc.)
const NO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "VND", "IDR", "CLP", "HUF", "PYG", "XPF"]);

// Flag emoji mapping for popular currencies (used in picker dropdowns)
export const CURRENCY_FLAGS = {
  USD: "🇺🇸",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  JPY: "🇯🇵",
  CNY: "🇨🇳",
  IDR: "🇮🇩",
  TWD: "🇹🇼",
  KRW: "🇰🇷",
  INR: "🇮🇳",
  SGD: "🇸🇬",
  MYR: "🇲🇾",
  THB: "🇹🇭",
  VND: "🇻🇳",
  PHP: "🇵🇭",
  AED: "🇦🇪",
  SAR: "🇸🇦",
  TRY: "🇹🇷",
  BRL: "🇧🇷",
  MXN: "🇲🇽",
  RUB: "🇷🇺",
  ZAR: "🇿🇦",
  AUD: "🇦🇺",
  CAD: "🇨🇦",
  CHF: "🇨🇭",
  HKD: "🇭🇰",
  NZD: "🇳🇿",
  SEK: "🇸🇪",
  NOK: "🇳🇴",
  DKK: "🇩🇰",
  PLN: "🇵🇱",
  CZK: "🇨🇿",
  ILS: "🇮🇱",
  NGN: "🇳🇬",
  PKR: "🇵🇰",
  BDT: "🇧🇩",
  LKR: "🇱🇰",
  MMK: "🇲🇲",
  UAH: "🇺🇦",
  ARS: "🇦🇷",
  CLP: "🇨🇱",
  KWD: "🇰🇼",
  BHD: "🇧🇭",
  GEL: "🇬🇪",
  HUF: "🇭🇺",
  VEF: "🇻🇪",
  BMD: "🇧🇲",
};

// Browser locale hint per currency (improves Intl formatting)
const CURRENCY_LOCALES = {
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  JPY: "ja-JP",
  IDR: "id-ID",
  TWD: "zh-TW",
  KRW: "ko-KR",
  INR: "en-IN",
  CNY: "zh-CN",
  SGD: "en-SG",
  MYR: "ms-MY",
  THB: "th-TH",
  VND: "vi-VN",
  PHP: "en-PH",
  AED: "ar-AE",
  SAR: "ar-SA",
  TRY: "tr-TR",
  BRL: "pt-BR",
  MXN: "es-MX",
  RUB: "ru-RU",
};

// ─────────────────────────────────────────────────────────────────────
// Conversion
// ─────────────────────────────────────────────────────────────────────

/**
 * Convert USDT-denominated price to local currency.
 *
 * @param {number} usdtPrice - Price in USDT (e.g., 0.3526)
 * @param {string} currency - Target ISO 4217 code (e.g., "IDR")
 * @param {Object} rates - Rates object from FX API: { USD: 1.0, IDR: 17549.81, ... }
 * @returns {number|null} Local price, or null if rate unavailable
 */
export const convertPrice = (usdtPrice, currency, rates) => {
  if (usdtPrice == null || !rates || !currency) return null;
  const rate = rates[currency?.toUpperCase()];
  if (!rate || rate <= 0) return null;
  return usdtPrice * rate;
};

// ─────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────

/**
 * Decide how many decimals to show based on magnitude.
 * Used for both crypto micro-prices and fiat conversions.
 */
const pickDecimals = (value, currency) => {
  const abs = Math.abs(value);
  const isNoDecimal = NO_DECIMAL_CURRENCIES.has(currency);

  // For currencies that traditionally don't use decimals
  if (isNoDecimal) {
    if (abs < 1) return 4; // very tiny: Rp 0,0035 (shows precision)
    if (abs < 100) return 2; // small: Rp 50,25
    return 0; // normal: Rp 5.892
  }

  // For decimal currencies (USD, EUR, etc.)
  if (abs >= 1) return 2; // $1.23, $123.45
  if (abs >= 0.01) return 4; // $0.0123
  if (abs >= 0.0001) return 6; // $0.000123
  return 8; // $0.00000123
};

/**
 * Format a local-currency price with adaptive precision.
 *
 * Examples:
 * formatLocalPrice(5892.5, 'IDR') → "Rp 5.892"
 * formatLocalPrice(0.000234, 'IDR') → "Rp 0,0002"
 * formatLocalPrice(1.23, 'USD') → "$1.23"
 * formatLocalPrice(0.00001234, 'USD') → "$0.00001234"
 *
 * @param {number} value - Numeric value in local currency
 * @param {string} currency - ISO 4217 code
 * @param {Object} options - { showCode: false, compact: false }
 * @returns {string} Formatted price string
 */
export const formatLocalPrice = (value, currency, options = {}) => {
  if (value == null || !isFinite(value)) return "—";

  const code = (currency || "USD").toUpperCase();
  const locale = CURRENCY_LOCALES[code] || "en-US";
  const decimals = pickDecimals(value, code);

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      ...(options.compact && Math.abs(value) >= 1_000_000
        ? { notation: "compact", compactDisplay: "short" }
        : {}),
    }).format(value);
  } catch {
    // Fallback for browsers/locales that don't support this currency
    const formatted = value.toFixed(decimals);
    return options.showCode === false ? formatted : `${formatted} ${code}`;
  }
};

/**
 * Format USDT price with adaptive precision (existing convention).
 * Mirrors backend signal pricing format.
 */
export const formatUsdtPrice = (value) => {
  if (value == null || !isFinite(value)) return "—";
  const abs = Math.abs(value);
  let decimals;
  if (abs >= 1) decimals = 4;
  else if (abs >= 0.01) decimals = 4;
  else if (abs >= 0.0001) decimals = 6;
  else decimals = 8;
  return value.toFixed(decimals);
};

/**
 * Compact display: USDT + local in one string.
 * Used for inline previews.
 *
 * Example: formatBothPrices(0.3526, 'IDR', rates) → "0.3526 / Rp 6.190"
 */
export const formatBothPrices = (usdtPrice, currency, rates) => {
  const usdt = formatUsdtPrice(usdtPrice);
  if (!currency || currency === "USD" || !rates) return usdt;
  const local = convertPrice(usdtPrice, currency, rates);
  if (local == null) return usdt;
  return `${usdt} / ${formatLocalPrice(local, currency)}`;
};
