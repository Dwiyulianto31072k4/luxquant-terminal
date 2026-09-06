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
  try_free: "/home",
  // The brand name inside the closing line, wrapped as a link. Kept apart from
  // the button keys so a tap on the prose is never counted as a tap on the
  // free-row button, and because it is the only exit that survives a copied
  // post -- a republished caption loses the inline keyboard entirely.
  tail_link: "/home",
  // The same name, made tappable inside the narrative sentence instead of the
  // closing line. Separate key on purpose: these two sit at opposite ends of
  // the post, and in a few weeks the click counts will say which position is
  // worth keeping and which is clutter.
  brand_link: "/home",
  // The free product no button had ever named. /watchlist is LOGIN_REQUIRED
  // and deliberately NOT in PREMIUM_REQUIRED: a free account picks coins and
  // gets "$COIN has been called" with the entry the moment a signal opens on
  // one. 72 of those alerts have gone to free accounts already, and 5 of 1,223
  // free users have ever found the screen.
  alert_gen: "/watchlist",
  alerts_gen: "/watchlist",
  // Held behind TG_COIN_ALERT_ROUTING in caption_builder until this screen can
  // prefill the coin from start_param. Mapped now so enabling the flag is one
  // change on one side, not two that have to land together.
  alert_coin: "/watchlist",
  watch_coin: "/watchlist",
  // VIP asks a compact question, so it gets the compact page. /pricing is
  // public — not in LOGIN_REQUIRED — and the reader is authenticated anyway
  // inside the Mini App, so nothing here can hit a wall.
  vip_inside: "/pricing",
  vip_gets: "/pricing",
  vip_see: "/pricing",
  vip_get: "/pricing",
  vip_sub: "/pricing",
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

// Keys whose label names one specific coin. For these the path alone is not the
// promise: "Alert me on $BOME" landing on an empty watchlist is a broken one,
// and a broken promise on arrival is the failure the whole channel-button
// rewrite exists to stop.
//
// Why this matters more than any other route here. Measured 2026-09-06 over 120
// days: of 1,002 accounts, the 11 who ever added a coin averaged 8.3 logins
// against 1.7, came back three or more times at 82% against 12%, and paid at
// 64% against 8%. Only 2 of 670 signups in 60 days did it on the day they
// joined. Whatever the causal direction — and n=11 cannot settle that — this is
// the one action worth spending an arrival on, and every second of friction
// between the tap and the coin being added is spent against it.
const COIN_PREFILL_KEYS = new Set(["alert_coin", "watch_coin"]);

// Telegram reviews the first screen reached by each sponsored message. These
// three ads make different promises, so their signed start_param is rendered
// in place at /terminal by TelegramAdTerminalEntry. Returning no redirect here
// is deliberate: automatically forwarding every ad to one generic page was
// rejected under the "irrelevant destinations" rule.
const TELEGRAM_AD_CAMPAIGN = "tg-proof-scale-aug26";
const TELEGRAM_AD_VARIANTS = new Set([
  "proof-timestamps",
  "signal-process",
  "terminal-context",
]);

export function telegramAdVariant(startParam) {
  const campaign = parseLuxQuantStartParam(String(startParam || "").trim().toLowerCase());
  if (
    campaign?.medium !== "paid_social" ||
    campaign?.campaign !== TELEGRAM_AD_CAMPAIGN ||
    !TELEGRAM_AD_VARIANTS.has(campaign?.content)
  ) {
    return null;
  }
  return campaign.content;
}

/**
 * @param {string|null|undefined} startParam raw Telegram start_param
 * @returns {string|null} an in-app path, or null when nothing is claimed
 */
export function startDestination(startParam) {
  const s = String(startParam || "").trim().toLowerCase();
  if (!s) return null;
  if (telegramAdVariant(s)) return null;
  const campaign = parseLuxQuantStartParam(s);
  if (campaign) {
    if (campaign.medium === "auth_fallback") return "/home";
    if (campaign.medium === "referral") return "/performance";
    return "/performance";
  }
  const key = KEYS.find((k) => s === k || s.endsWith(`_${k}`));
  if (!key) return null;
  const dest = KEY_DESTINATIONS[key];
  if (!COIN_PREFILL_KEYS.has(key)) return dest;
  // content is "{coin}_{key}"; the key is a known suffix, so what precedes it
  // is the ticker. Anything that is not a plain ticker is dropped rather than
  // passed on — the screen would only reject it, after the arrival was spent.
  const content = parseStartParam(s)?.content || "";
  const coin = content.slice(0, -(key.length + 1)).toUpperCase();
  return /^[A-Z0-9]{2,15}$/.test(coin) ? `${dest}?add=${coin}` : dest;
}

export const __TEST__ = {
  KEY_DESTINATIONS,
  KEYS,
  TELEGRAM_AD_CAMPAIGN,
  TELEGRAM_AD_VARIANTS,
};

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
