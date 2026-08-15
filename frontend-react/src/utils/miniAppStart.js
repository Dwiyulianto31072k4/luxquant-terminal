// Where a Mini App tap should land.
//
// Telegram passes `startapp` through as start_param, shaped "{event}_{coin}_{key}"
// by caption_builder._startapp. Until now nothing on the client read it: the
// backend took it for attribution and the reader was dropped on whatever page
// the bot's Mini App URL points at. So a button promising "See how far winners
// run" opened the app's default screen, and the promise the click was made on
// went unmet at the exact moment the person arrived.
//
// The `path` in caption_builder's button tuples only survives on the web branch
// (`_utm(base + path, ...)`); `_startapp(et, coin, key)` never receives it. The
// key does imply the destination though, so the mapping is reconstructed here
// rather than adding a fourth segment to start_param — which would land in
// `acq_content` and break the campaign grouping.
//
// Keep in step with FREE_CTA_RECORD / FREE_CTA_PLAIN in
// /root/luxquant-x-poster/caption_builder.py.
import { parseLuxQuantStartParam } from "./telegramCampaign";

const KEY_DESTINATIONS = {
  results: "/performance",
  wr_coin: "/performance",
  how_far: "/performance",
  record: "/performance",
  one_tap: "/performance",
  terminal: "/home",
  // VIP asks a compact question, so it gets the compact page. /pricing is
  // public — not in LOGIN_REQUIRED — and the reader is authenticated anyway
  // inside the Mini App, so nothing here can hit a wall.
  vip_inside: "/pricing",
  vip_gets: "/pricing",
  vip_see: "/pricing",
  // BUY_CTA still reaches the site over the web branch and lands on the long
  // explainer. Mapped anyway so a future switch cannot fall through silently.
  how_works: "/",
  vip_what: "/",
  how_call: "/",
};

// Longest first. Half these keys contain an underscore themselves, so "take the
// last segment" turns a bare `wr_coin` into `coin` and `how_far` into `far` —
// the same trap the campaign grouping hit. Suffix-match the whole known key.
const KEYS = Object.keys(KEY_DESTINATIONS).sort((a, b) => b.length - a.length);

/**
 * @param {string|null|undefined} startParam raw Telegram start_param
 * @returns {string|null} an in-app path, or null when nothing is claimed
 */
export function startDestination(startParam) {
  const s = String(startParam || "").trim().toLowerCase();
  if (!s) return null;
  const campaign = parseLuxQuantStartParam(s);
  if (campaign) {
    return campaign.medium === "auth_fallback" ? "/home" : "/performance";
  }
  const key = KEYS.find((k) => s === k || s.endsWith(`_${k}`));
  return key ? KEY_DESTINATIONS[key] : null;
}

export const __TEST__ = { KEY_DESTINATIONS, KEYS };

/**
 * Split a start_param the way the backend does, so a Mini App arrival can be
 * reported with the same shape a web arrival gets.
 *
 * telegram_auth.py takes bits[0] as the campaign and rejoins the rest as the
 * content — keep these in step or the dashboard will group one surface
 * differently from the other.
 *
 * @param {string|null|undefined} startParam
 * @returns {{campaign: string, content: string}|null}
 */
const EVENT_PREFIXES = ["closed_loss", "closed_win", "tp1", "tp2", "tp3", "tp4", "post"]
  .sort((a, b) => b.length - a.length);

export function parseStartParam(startParam) {
  const s = String(startParam || "").trim().toLowerCase();
  if (!s) return null;
  const campaign = parseLuxQuantStartParam(s);
  if (campaign) return campaign;
  // Longest known event first. A plain split on "_" turns "closed_win_..."
  // into campaign "closed", because the event name contains an underscore too.
  const ev = EVENT_PREFIXES.find((e) => s === e || s.startsWith(`${e}_`));
  if (ev) {
    const content = s.slice(ev.length + 1);
    return { campaign: ev, content: content || null, medium: "miniapp" };
  }
  const bits = s.split("_");
  if (bits.length < 2) return null;
  return { campaign: bits[0], content: bits.slice(1).join("_"), medium: "miniapp" };
}
