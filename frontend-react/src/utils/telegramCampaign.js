// Telegram Mini App campaign payloads.
//
// Telegram Ads and Telegram channel links cannot carry normal UTM query
// parameters into a Mini App. Telegram does carry `startapp` as the signed
// `start_param`, though, so this compact format preserves acquisition without
// trusting a client-editable login body.

const MINI_APP_BASE =
  import.meta.env.VITE_TELEGRAM_MINI_APP_URL ||
  "https://t.me/LuxQuantTerminalBot/terminal";

const PREFIX_BY_MEDIUM = {
  paid_social: "lq1p",
  channel: "lq1c",
  auth_fallback: "lq1f",
  referral: "lq1r",
};

const MEDIUM_BY_PREFIX = {
  lq1p: "paid_social",
  lq1c: "channel",
  lq1f: "auth_fallback",
  lq1r: "referral",
};

const MAX_START_PARAM = 64;

export function telegramCampaignSlug(value, fallback = "unknown", maxLength = 24) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || fallback;
}

export function buildTelegramStartParam({
  medium = "auth_fallback",
  campaign = "login",
  content = "redirect",
} = {}) {
  const normalizedMedium = String(medium || "").toLowerCase();
  const prefix = PREFIX_BY_MEDIUM[normalizedMedium] || PREFIX_BY_MEDIUM.auth_fallback;
  const campaignSlug = telegramCampaignSlug(campaign, "campaign", 24);
  const contentSlug = telegramCampaignSlug(content, "creative", 28);
  return `${prefix}_${campaignSlug}_${contentSlug}`
    .slice(0, MAX_START_PARAM)
    .replace(/[_-]+$/g, "");
}

export function parseLuxQuantStartParam(value) {
  const raw = String(value || "").trim().toLowerCase();
  const parts = raw.split("_").filter(Boolean);
  const medium = MEDIUM_BY_PREFIX[parts[0]];
  if (!medium) return null;
  return {
    source: "telegram",
    medium,
    campaign: parts[1] || null,
    content: parts.slice(2).join("_") || null,
  };
}

export function buildTelegramMiniAppUrl(options = {}) {
  const startParam = buildTelegramStartParam(options);
  return `${MINI_APP_BASE}?startapp=${encodeURIComponent(startParam)}`;
}

export function buildReferralMiniAppUrl(code) {
  const slug = String(code || "")
    .trim()
    .toLowerCase()
    .slice(0, MAX_START_PARAM - 5);
  if (!slug) return MINI_APP_BASE;
  return `${MINI_APP_BASE}?startapp=${encodeURIComponent(`lq1r_${slug}`)}`;
}

export function referralCodeFromStartParam(value) {
  const raw = String(value || "").trim();
  if (!raw.toLowerCase().startsWith("lq1r_")) return null;
  const code = raw.slice(5).trim().toUpperCase();
  return code || null;
}

/**
 * Web-safe companion for a Telegram campaign.
 *
 * `/performance` is intentionally login-required. Paid visitors arriving in a
 * normal browser should see the public, verified track record first, then opt
 * into auth from a proof CTA. Keeping UTM in the query (before the hash) lets
 * first-touch attribution capture the campaign while `#performance` selects
 * the matching landing section.
 */
export function buildTelegramWebCampaignUrl({
  campaign = "telegram-ads",
  content = "unknown-creative",
} = {}) {
  const campaignSlug = telegramCampaignSlug(campaign, "campaign");
  const contentSlug = telegramCampaignSlug(content, "creative");
  const query = new URLSearchParams({
    utm_source: "telegram",
    utm_medium: "paid_social",
    utm_campaign: campaignSlug,
    utm_content: contentSlug,
  });
  return `https://luxquant.tw/?${query.toString()}#performance`;
}

export function buildTelegramFallbackUrl(acq) {
  const source = String(acq?.source || "").toLowerCase();
  const medium = String(acq?.medium || "").toLowerCase();
  const paidTelegram =
    source === "telegram" && ["paid", "paid_social", "ads", "cpc"].includes(medium);

  if (paidTelegram) {
    return buildTelegramMiniAppUrl({
      medium: "paid_social",
      campaign: acq?.campaign || "telegram-ads",
      content: acq?.content || "unknown-creative",
    });
  }

  return buildTelegramMiniAppUrl({
    medium: "auth_fallback",
    campaign: "login",
    content: "redirect",
  });
}

export const __TEST__ = {
  MAX_START_PARAM,
  MEDIUM_BY_PREFIX,
  PREFIX_BY_MEDIUM,
};
