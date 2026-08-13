// src/utils/coinPage.js
//
// "Does this coin have a public /coins/:slug page?" — the question every
// landing surface has to answer before it offers a link to one.
//
// Only ~625 coins have a page (the curated set plus every pair with >=20
// signals), while the landing page can reach any pair through search or the
// leaderboard. Checking the generated slug list is what keeps a per-coin CTA
// from pointing at a page that was never built.
//
// COIN_SLUGS is deliberately its own module: importing coins.generated.js to
// answer a yes/no question would pull ~120KB of blurbs and stats into the
// landing bundle.
import { COIN_SLUGS } from "../content/coinSlugs.generated";

const PAGE_SLUGS = new Set(COIN_SLUGS);

// scripts/gen-coins.mjs slugifies the symbol; POL's page kept its `matic` slug
// from before the rename, so the symbol and the slug disagree for that one.
const SLUG_ALIAS = { POL: "matic" };

/** BTCUSDT → "btc" (or null when no page exists for it). */
export function coinPageSlug(pair) {
  const symbol = String(pair || "")
    .replace(/USDT$/i, "")
    .toUpperCase();
  if (!symbol) return null;
  const slug = SLUG_ALIAS[symbol] || symbol.toLowerCase().replace(/[^a-z0-9]/g, "");
  return PAGE_SLUGS.has(slug) ? slug : null;
}

/** BTCUSDT → "/coins/btc" (or null). */
export function coinPagePath(pair) {
  const slug = coinPageSlug(pair);
  return slug ? `/coins/${slug}` : null;
}
