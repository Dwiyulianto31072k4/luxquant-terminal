# LuxQuant — SEO & Organic Growth Strategy

_Goal: move from "ranks only for the brand name" to a compounding organic engine that ranks for what traders actually search — and converts that traffic into signups. Playbook modeled on how top SaaS/crypto companies win search in 2026._

---

## 1. Where you are now (diagnosis from Search Console)

| Signal | Reading | What it means |
|---|---|---|
| 76 clicks / 340 impressions / CTR 22.4% / avg pos ~4 (90d) | Small but healthy CTR | People who see you click — the problem is **volume**, not the snippet |
| Top queries: `luxquant`, `lux quant`, `quant lux`, `luxe quant`… | **100% branded** | You only appear when someone already knows the name. Zero discovery from non-branded search |
| 4 pages indexed / 3 not indexed | Almost nothing crawlable | Reasons: *redirect*, *alternate page w/ canonical*, *crawled – currently not indexed* |
| Video not indexed — "thumbnail URL not available" | Hero video has no poster/schema | Missing `VideoObject` + poster image |
| Favicon = globe in SERP | Logo not shown | Transparent gold-on-white is invisible at 16–32px + site is new |
| Site first seen by Google ~20 Jun 2026 | Brand new property | Some of this is just **time** (authority compounds over months) |

### The one root cause
**Your product is a login wall.** Market Pulse, News, Bitcoin, Markets, Signals, On-Chain, etc. are all gated — so a crawler sees a login shell, not content. On top of that it's a **client-rendered React SPA**, so even the public pages ship an almost-empty HTML body and land in Google's slow "render later" queue ("crawled – currently not indexed").

> No public content → nothing to rank for except your name. This is the whole game to fix.

---

## 2. The strategy in one line

**Build a public, crawlable content engine — editorial depth + programmatic breadth — on a prerendered foundation, then funnel social traffic into it and convert readers into users.**

Two engines, run together (this is what top SaaS SEO teams do):

- **Programmatic layer** — hundreds/thousands of data-driven pages at scale (LuxQuant's superpower: you already have the data). Captures high-volume, high-intent long-tail search.
- **Editorial layer** — pillar + cluster guides that build *topical authority*, earn backlinks, and make Google trust the domain.

Timeline reality: meaningful organic lift takes **3–6 months**; the compounding curve kicks in around month 6–12. Start now.

---

## 3. The seven pillars

### Pillar A — Technical foundation (crawlability)
The table-stakes layer. **Done today** (this session):
- ✅ `robots.txt` created (was missing) — allows crawl, blocks private/app areas, points to sitemap.
- ✅ `sitemap.xml` cleaned to public pages only (was 3 URLs, some gated).
- ✅ Branded **SVG favicon** on a dark tile (fixes the invisible-logo problem) + proper `<link>` set.
- ✅ Per-route `<title>`/meta already exists via `<Seo>` (react-helmet) — needs rolling out to every public page.

**Still to do (highest impact):**
1. **Prerendering / SSG for public pages.** This is the #1 fix for "only 4 indexed." Use `vite-plugin-prerender`/`prerender` (Puppeteer at build) or `react-snap` to output real static HTML for `/`, `/home`, `/pricing`, `/status`, and every new public content page. Crawlers get full HTML; users still get the SPA. Teams that do this see "crawled – not indexed" collapse within ~6 weeks.
2. **Fix the redirect / duplicate-canonical** pages GSC flagged (pick one canonical host — `luxquant.tw` non-www — and 301 the rest; self-canonical every page).
3. **Video**: add a `poster` image to the hero video + `VideoObject` structured data (fixes "thumbnail not available").

### Pillar B — Un-gate a public content surface
You don't have to open the product. Create a **public marketing/content namespace** that never requires login:
- `/blog/*` — editorial guides (see Pillar D).
- `/learn/*` or `/glossary/*` — definitions & explainers.
- Public, read-only **data pages** (see Pillar C) — a teaser of the terminal with a clear "Sign in for live/full" CTA.

This is the doorway: rank publicly → prove value → convert to login.

### Pillar C — Programmatic SEO (your moat)
You already compute the data. Turn it into indexable pages at scale, from templates:

| Template | Example URL | Target search |
|---|---|---|
| Per-coin overview | `/coins/bitcoin`, `/coins/solana` | "solana price analysis", "sol on-chain" |
| Per-narrative / sector | `/narratives/ai-agents`, `/narratives/rwa` | "best RWA coins", "AI agent tokens" |
| Delisting alerts | `/delistings/binance` | "binance delisting [token]" |
| Whale / on-chain | `/whales/ethereum` | "ethereum whale transactions today" |
| Glossary | `/learn/what-is-flow-intensity` | "what is flow intensity crypto" |

Rules that keep pSEO safe (not spam): each page needs a **unique data view + a sentence or two of context**, internal links to related pages, and real utility. Chase **long-tail intent**, not broad head terms you can't win yet.

### Pillar D — Editorial / topical authority
Pick 3–4 pillars you can genuinely own, then cluster around them:
- **Pillar: "Crypto money flow / sector rotation"** → clusters: what is sector rotation, how to read BTC dominance, altseason index explained, DEX buy/sell pressure, etc.
- **Pillar: "Quant trading signals"** → how signals work, risk scoring, TP/SL, win-rate vs BTC.
- **Pillar: "On-chain intelligence"** → whale tracking, smart money, liquidations.

Each pillar = one deep hub page + 6–12 interlinked cluster articles. This is what makes Google treat you as an authority, not a tool with a homepage.

### Pillar E — Structured data (rich results)
Add JSON-LD per page type so you win rich SERP features:
- `Organization` + `WebSite` (+ Sitelinks Searchbox) — already partially in `index.html`.
- `BreadcrumbList` on every deep page.
- `FAQPage` on guides & pricing.
- `Article`/`BlogPosting` on blog.
- `Product` + `Offer` + `AggregateRating` on `/pricing`.
- `VideoObject` on pages with video.

### Pillar F — Social → conversion funnel
You already have ~1.8K IG followers and Telegram/Discord. Wire them into the SEO engine:
- **TOFU (discovery):** Reels/Shorts of live calls & sector rotation → cheap reach (IG Reels CPA ~$6 vs ~$23 for banners, per 2026 data).
- **MOFU (consideration):** each social post links to a **public content page** (not the login wall) — the blog/coin/narrative pages you're building. This feeds both referral traffic *and* SEO signals.
- **BOFU (conversion):** every public page has one clear CTA → sign in / start free. Track social → page → signup.
- **Community loop:** Telegram/Discord for retention + organic word-of-mouth (your branded search is already climbing because of this — keep feeding it).

### Pillar G — Off-page & brand
- Get listed: CoinGecko/CoinMarketCap "tools", crypto tool directories, Product Hunt, relevant subreddits.
- Earn backlinks with **data PR**: publish shareable stats ("Top 5 avg gain 22.4%", weekly sector-rotation report) that journalists/bloggers cite.
- Consistent NAP/brand across IG, X, TradingView, YouTube so Google builds a strong entity for "LuxQuant".

---

## 4. 90-day roadmap (prioritized)

**Phase 0 — Foundation (this week) ✅ mostly done**
- robots.txt, sitemap, favicon, canonical host, submit sitemap in GSC, request re-index of key pages.
- Add prerendering to the build. *(biggest single lever)*

**Phase 1 — Weeks 2–4: public doorway**
- Ship `/blog` + `/learn` (public, prerendered) with the `<Seo>` component on every page.
- Publish 5 cornerstone guides (one per pillar topic).
- Add BreadcrumbList + Article + FAQ schema.

**Phase 2 — Weeks 4–8: programmatic**
- Build the per-coin and per-narrative templates from your existing APIs (public read-only + "sign in for live").
- Generate 50–200 pages, internally linked, in the sitemap.

**Phase 3 — Weeks 8–12: authority & distribution**
- 2–3 new cluster articles/week around the pillars.
- Data-PR post + directory listings + 5–10 quality backlinks.
- Social funnel: every post → public page → CTA; measure signups.

---

## 5. KPIs to watch (in this order)

1. **Indexed pages** (GSC → Pages) — should climb from 4 → dozens → hundreds.
2. **Non-branded impressions & clicks** (GSC → Performance, filter out "lux*") — this is the real scoreboard.
3. **Unique ranking queries** — breadth of terms you appear for.
4. **Avg position** on target clusters.
5. **Organic → signup conversion** (GA4/Plausible event on the CTA).
6. Referring domains (backlink growth).

---

## 6. The logo/favicon fix (what changed + what you must do)

**Why it was a globe:** your `logo.png` is a gold brush mark on a **transparent** background at 6250×6250. On Google's white results page it renders faint/invisible at favicon size, so Google shows the fallback globe (and the site is new, so it also hasn't fully recrawled).

**Done this session:**
- Added `public/favicon.svg` — the gold logo on a dark rounded tile (high contrast, sharp at any size; SVG is Google's preferred 2026 format).
- Updated `index.html` to reference the SVG first, with PNG + apple-touch-icon fallbacks and `mask-icon`.

**You still need to:**
1. Deploy, then in GSC use **URL Inspection → Request indexing** on `https://luxquant.tw/`. Favicon refresh can take days–weeks.
2. (Optional, best compatibility) generate raster favicons with a dark background from `logo.png`:
   ```bash
   # run in frontend-react/public (needs ImageMagick)
   for s in 48 96 192 512; do \
     magick logo.png -resize ${s}x${s} -background "#0a0506" -gravity center -extent ${s}x${s} favicon-${s}.png; \
   done
   magick favicon-48.png favicon-96.png favicon.ico
   ```
   Then add `<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png">` etc.

---

## 7. TL;DR

You're not "bad at SEO" — you have **almost nothing public to rank**. Fix crawlability (prerender), open a **public content surface**, scale it with **programmatic + editorial** content built on your data, add **structured data**, and pipe **social → public pages → signups**. Do that consistently for 3–6 months and non-branded organic becomes your most reliable acquisition channel.
