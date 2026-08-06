# Login conversion — gate policy (SEO-safe)

Last updated: 2026-08-06  
Goal: raise **visitor → account → returning login** without killing organic traffic on `luxquant.tw`.

## Baseline (prod snapshot)

| Metric (30d) | Value |
|--------------|------:|
| Cloudflare UV | ~11.0k |
| Signups | ~258 (~2.3% UV) |
| One-shot login among new users | ~80% |
| WAU (login) | ~103 |
| Live paid subs | ~22 |

Bottleneck is **conversion quality**, not traffic volume.

---

## Funnel events (instrumented)

Client → `POST /api/v1/funnel/event` (+ local ring buffer).

| Event | When |
|-------|------|
| `landing_view` | Landing V2 mount |
| `cta_click` | Header / sticky / free-tier / footer / hero pill |
| `soft_gate_shown` | Guest hits Top Gainers detail limit |
| `soft_gate_login_click` | Guest accepts soft-gate CTA |
| `auth_page_view` | `/login` open |
| `auth_start` | Google / Telegram / Discord click |
| `auth_success` | OAuth/Telegram success |
| `auth_error` | Provider error (not cancel) |
| `post_login_land` | Land after auth (with redirect path) |

Admin dashboard: **Workspace → Growth → Login conversion · 30d**  
API: `GET /api/v1/workspace/growth/conversion?days=30`

---

## What stays public (SEO + trust)

Do **not** login-wall these:

| Surface | Why public |
|---------|------------|
| `/` landing (hero, proof, top gainers **list**, performance summary numbers) | Organic + share + CF cache |
| `/blog`, `/learn`, `/pricing`, `/status` | Content SEO |
| `/api/public/v1/*` (API key) | Partner distribution |
| Top gainer **cards** (pair + % + peak lag) | Proof without full moat |
| OG share HTML for bots on `/signals?signal=` | Social previews (nginx → OG route) |

Crawlers must still see meaningful text/numbers on `/`. Prefer SSR/prerender already in deploy for landing HTML.

---

## Soft gates (login required after teaser)

Safe for SEO because list/HTML remains public; only **depth** is gated.

| Gate | Behavior | Value promise |
|------|----------|---------------|
| **Top Gainers detail** | 1 free chart/session → then modal CTA | Free account → Signals + watchlist |
| **App feature nav** | Immediate `/login?redirect=` | Land on that feature after auth |
| **Sticky mobile CTA** | After scroll > ~420px | Free · signals & watchlist |
| **Free-tier band** | Primary = free account; TG secondary | Dual path, not TG-only |

Implementation notes:
- Post-login redirect stashed (`postLoginRedirect.js`) through OAuth.
- Default land after signup CTA = **`/signals`** (free value), not empty `/home`.
- `FreeOnboardingModal` once for free roles after login.

---

## Free account product (after login) — habit layer

| Free (login) | Premium only |
|--------------|--------------|
| **Signals** (full levels on calls **>7d**; live redacted) | Live entry/SL/TP levels |
| **Watchlist** | — |
| Performance, Pulse, News, Journal, Tips, Notifications, Referral | Terminal, Markets, Order book, Money flow, On-chain, AI Arena, Agent, Portfolio, API keys, Calendar, Whale, Delistings |

Backend already enforces levels via `has_active_access` + `PUBLIC_AFTER_DAYS = 7`.

---

## Hard gates

`LOGIN_REQUIRED` still wraps the app shell. Routes are `noindex` when gated.

**Do not** open full live signals as anonymous HTML without a dedicated public teaser.

---

## Recommended next gates (not shipped yet)

| Priority | Gate | Risk | Expected impact |
|----------|------|------|-----------------|
| P1 | Post-login 60s checklist modal (TG link + 3 stars + 1 alert) | Low | Multi-login rate ↑ |
| P1 | Country capture on first login (`country_code`) | Low | Geo optimization |
| P2 | Public `/signals` teaser page (top 5 closed, redacted levels) with CTA | Med | SEO + conversion |
| P2 | Rate-limit unauthenticated `signals/detail` API (not only UI) | Low | Prevent API scrape bypass of soft gate |
| P3 | Email capture optional after Google for lifecycle | Med | Re-engagement |

---

## What not to do

1. **Hard-login the entire landing** — kills CF UV → signup experiments and SEO.
2. **Only push Telegram free channel** without account CTA — off-site leak (fixed dual CTA).
3. **Ignore redirect after OAuth** — was live bug; feature CTAs felt broken.
4. **Count CF requests as users** — 4M req ≠ engaged traders.

---

## Success metrics (weekly)

See `conversion-weekly.sql` and Growth tab.

| KPI | Now (approx) | 4-week target |
|-----|-------------:|---------------|
| UV → signup | ~2.3% | 4–6% |
| New multi-login (7d) | ~20% | ≥40% |
| WAU / total users | ~12% | 20–25% |
| Soft-gate login CTR | n/a | ≥25% of shown |
| CTA → auth_start | n/a | ≥35% |
