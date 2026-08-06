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

## Soft gates (login required after teaser) — **ship first**

Safe for SEO because list/HTML remains public; only **depth** is gated.

| Gate | Behavior | Value promise |
|------|----------|---------------|
| **Top Gainers detail** | 1 free chart/session → then modal CTA | “Unlock full call charts” |
| **App feature nav** (header More, footer Product) | Immediate `/login?redirect=` | Land back on feature after auth |
| **Sticky mobile CTA** | After scroll > ~420px | “Save watchlist & get free alerts” |
| **Free-tier band** | Primary = Create free account; TG secondary | Stop pure off-site TG leak |

Implementation notes:
- Post-login redirect is stashed (`postLoginRedirect.js`) so Google/Discord no longer always dump to `/home`.
- Sign Up header now goes to `/login` (OAuth = signup), not legacy `/register`.

---

## Hard gates (already mostly true)

`LOGIN_REQUIRED` in `App.jsx` already covers the terminal shell:

`/signals`, `/terminal`, `/markets`, `/watchlist`, `/ai-arena`, `/orderbook`, `/journal`, …  

These routes are `noindex` when gated — correct for SEO.

**Do not** open these as fully public HTML without a dedicated public teaser page (duplicate content + moat leak).

---

## Premium gates (after login, not for UV→signup)

Keep premium on:

- Live signal levels / full active board
- Terminal scanners, money flow depth, autotrade, edge lab drill-downs
- VIP Telegram join

Free logged-in users should still get **enough** to form habit:

- Watchlist (save 3 coins)
- Notifications prefs
- Limited journey / closed call history
- Chat / support

If free has almost nothing, one-shot rate stays ~80%.

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
