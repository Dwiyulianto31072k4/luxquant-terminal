# LuxQuant Theming Guide

How to build any feature so it looks correct in **all three themes** — Luxquant
(warm gold), Dark (Binance-neutral), and Bright (paper light). Follow this and
your feature adapts automatically; ignore it and it breaks in at least one theme.

---

## 0. The golden rules (read this even if you read nothing else)

1. **Never hardcode a colour that defines appearance.** No `#fff`, `text-white`,
   `bg-[#0a0805]`, `style={{ color: '#8a7a6e' }}`, `rgba(255,255,255,.06)` for
   surfaces / text / borders. Use a **token** (see §2).
2. **Colour = meaning, never decoration.** A colour is allowed to be a fixed hex
   ONLY if it is brand identity (Binance/Telegram/Discord) or chart data
   (candle green/red). Everything else must be a token.
3. **Accent/green/red used as _text_ or _icon_ is NOT the same token as the
   _fill_.** Text uses `text-accent` / `text-profit` / `text-loss` (which the
   theme darkens for Bright). Fills use `bg-accent` / `bg-profit` (which stay
   bright). See §4.
4. **Overlays and hairlines use `ink`, not `white`.** `border-ink/10`,
   `bg-ink/[0.04]` — white on dark themes, black on Bright. `border-white/10`
   disappears on Bright.
5. **Static container borders use `line`, not gold.** Gold (`accent`) is
   reserved for interactive states (buttons, active tabs), not resting boxes.
6. **Every page header uses `ui/PageHeader`. Every modal uses `ui/Modal`.**
7. **Verify contrast before shipping** (§10). Body text must clear WCAG AA 4.5:1
   in every theme.

---

## 1. How the system works

- The active theme is the `data-theme` attribute on `<html>`
  (`luxquant` | `dark` | `bright`), set by `ThemeProvider`
  (`src/context/ThemeContext.jsx`) and pre-painted by the anti-flash script in
  `index.html`.
- `src/styles/index.css` defines **semantic tokens as RGB channels** (e.g.
  `--surface: 11 14 17`) inside one block per theme. Channels (not `#hex`) so
  Tailwind can apply opacity: `bg-surface/70` → `rgb(var(--surface) / 0.7)`.
- `tailwind.config.js` maps each token to a utility via
  `withAlpha('--x') = rgb(var(--x) / <alpha-value>)`.
- Change a token's value in one theme block → every component using that token
  updates in that theme. No per-component `if (theme === …)` branches.

Files that matter:

| File | Role |
|---|---|
| `src/styles/index.css` | Token definitions per theme + a few theme-aware CSS classes |
| `tailwind.config.js` | Token → Tailwind utility mapping (`withAlpha`) |
| `src/context/ThemeContext.jsx` | Active theme, gating, route rules, `useTheme()` |
| `index.html` | Anti-flash pre-paint (must mirror ThemeContext rules) |
| `src/utils/themeColors.js` | Theme colours for canvas / TradingView / embeds that can't read CSS vars |
| `src/components/ui/PageHeader.jsx` | The one page/section header standard |
| `src/components/ui/StatCard.jsx`, `SegGroup.jsx` | Shared KPI card / segmented control |
| `src/components/admin/designSystem.js` | Admin token layer (already theme-aware) |

---

## 2. Token reference

Use the **Tailwind class** in JSX. Reach for the raw `rgb(var(--x))` only in
inline `style={{}}` when a utility can't express it.

### Surfaces (backgrounds)
| Class | Token | Meaning |
|---|---|---|
| `bg-surface` | `--surface` | Page background |
| `bg-surface-secondary` | `--surface-secondary` | Sunken areas, inputs |
| `bg-surface-raised` | `--surface-raised` | Cards, panels, modals |
| `bg-surface-hover` | `--surface-hover` | Hover fill |

### Text
| Class | Token | Meaning |
|---|---|---|
| `text-text-primary` | `--fg` | Primary text / values |
| `text-text-secondary` | `--fg-secondary` | Secondary text |
| `text-text-muted` | `--fg-muted` | Labels, captions (AA-safe in all themes) |

### Accent (brand gold / Binance yellow)
| Class | Token | Use for |
|---|---|---|
| `bg-accent` / `bg-gold-primary` | `--accent` | **Fills** — CTA buttons, active pills (bright yellow) |
| `text-accent-fg` | `--accent-fg` | Text/icon **on** a solid yellow button (dark ink) |
| `text-accent` | `--accent-text`\* | **Accent text / icons** — readable in every theme |
| `bg-accent/10`, `border-accent/40` | `--accent` | Tints & interactive borders |

\* `text-accent` compiles to `--accent`, but a Bright CSS override in `index.css`
remaps `.text-accent` → `--accent-text` (dark amber) because yellow text on
white fails WCAG. **So always use the `text-accent` class for accent text** — it
self-corrects. If you need accent text in an inline style, use
`rgb(var(--accent-text))`, not `rgb(var(--accent))`.

### Semantic data (PnL)
| Class | Token | Use for |
|---|---|---|
| `bg-profit` / `bg-loss` | `--pos` / `--neg` | Green/red **fills** (bars, chips, heatmap) |
| `text-profit`/`text-positive`, `text-loss`/`text-negative` | `--pos-text`/`--neg-text`\* | Green/red **text** (+5%, −3%) |
| `text-warning` | `--warn` | Warning text |

\* Same pattern as accent: a Bright override remaps the `text-*` classes to the
darker `--pos-text`/`--neg-text` so green/red text stays readable on white.
Fills keep the bright Binance colours. Inline: use `rgb(var(--pos-text))`.

### Overlays, borders, scrims
| Class | Token | Meaning |
|---|---|---|
| `border-ink/10`, `bg-ink/[0.04]` | `--ink` | Hairlines / translucent overlays — **white on dark, black on Bright** |
| `text-ink-inv` / `bg-ink-inv` | `--ink-inv` | Inverse ink (rare) |
| `border-line` | `--line` | Resting container borders (gold in Luxquant, neutral in Dark/Bright) |
| `bg-scrim/70` | `--scrim` | Modal/page dimmers (always near-black) |
| `text-brand-telegram` | `--tg` | Telegram brand blue |

---

## 3. Building a new feature — the pattern

```jsx
// ✅ CORRECT — everything is a token
<div className="bg-surface-raised border border-ink/10 rounded-xl p-4">
  <p className="text-text-muted text-[10px] uppercase tracking-wider">Revenue</p>
  <p className="text-text-primary text-2xl font-bold tabular-nums">$12,480</p>
  <p className="text-profit text-sm">+4.2%</p>
  <button className="mt-3 bg-accent text-accent-fg rounded-lg px-4 py-2 font-semibold">
    Withdraw
  </button>
</div>
```

```jsx
// ❌ WRONG — breaks in Bright (white text invisible, gold border on resting box,
//    white overlay vanishes, yellow % unreadable)
<div className="bg-[#0a0805] border border-gold-primary/40 rounded-xl p-4">
  <p style={{ color: '#8a7a6e' }}>Revenue</p>
  <p style={{ color: '#fff' }}>$12,480</p>
  <p style={{ color: '#0ECB81' }}>+4.2%</p>
</div>
```

Rule of thumb while writing a component: **if you typed a `#`, `white`, `black`,
or `rgba(` for a visible colour, stop and pick a token instead.**

---

## 4. The fill-vs-text split (most common mistake)

`--accent`, `--pos`, `--neg` are **bright** so they pop as fills. On Bright's
white canvas those same colours are ~1.7–3:1 as _text_ = unreadable. That's why
there are separate `-text` tokens and Bright overrides:

- **Fill / background / bar / chip bg:** `bg-accent`, `bg-profit/10`, `bg-loss` → bright colour. ✅
- **Text / icon / value:** `text-accent`, `text-profit`, `text-loss` → auto-darkens in Bright. ✅
- **Inline text colour:** `rgb(var(--accent-text))`, `rgb(var(--pos-text))`, `rgb(var(--neg-text))`. Never `rgb(var(--accent))` as a text colour.

---

## 5. Exceptions — colours that stay fixed hex (do NOT tokenize)

- **Brand identity:** Binance `#F6465D`/`#0ECB81`/`#F0B90B`, Telegram `#229ED9`,
  Discord `#5865F2`, Google `#4285F4`, Instagram gradient, exchange logos.
- **Chart / canvas data series** (TradingView colours, heatmap cell colours,
  candle up/down) — these are data, identical across themes.
- White text **on a solid coloured element** (e.g. white on a red button) is
  fine — it's not on a theme surface.

When in doubt: does this colour mean *a brand* or *a data value*? If yes, keep it.
Otherwise, token.

---

## 6. Canvas / TradingView / embeds

Anything that can't read CSS variables (canvas globe, TradingView widget, QR)
uses `src/utils/themeColors.js`:

```js
import { getActiveTheme, subscribeTheme } from '../utils/themeColors';
// read once, and re-render on theme change:
const unsub = subscribeTheme((theme) => redraw(theme));
```

Pattern used by the landing globe (`GlobalReach.jsx`): keep two colour sets and
swap per frame based on `getActiveTheme()`; light-gold arcs become dark amber in
Bright so they're visible on white.

---

## 7. Shared components (don't hand-roll these)

- **Page / section headers:** `import { PageHeader, SectionHeader } from './ui/PageHeader'`.
  Standard is `h1 = font-display text-2xl lg:text-3xl font-semibold
  text-text-primary tracking-tight` + optional subtitle. No decorative
  eyebrow+rule-line rows, no gradient headline text.
- **KPI tiles:** `ui/StatCard` (`tone="profit|loss|accent|default"`).
- **Segmented controls / tabs:** `ui/SegGroup`.
- **Admin surface:** import tokens from `admin/designSystem.js`
  (`surface`, `typography.body`, `semantic`) — already CSS-var based. Don't
  hardcode `#fff`/warm-grey text in admin components (it goes invisible on
  Bright — this bug has bitten us).

---

## 8. Modal conventions

- Use `ui/Modal` (provides the **X** close chip, scrim, Esc, focus trap).
- **One dismiss affordance.** If the modal has the X, do **not** add a redundant
  footer "Close" button. Keep the X.
- A footer **"Cancel"** paired with a primary action (Submit/Confirm/Delete) is
  fine — that's a meaningful action pair, not a redundant close.
- Dimmer = `bg-scrim/70` (or `admin` elevation tokens), never `bg-black/70`.

---

## 9. Themes, routes, and gating (`ThemeContext.jsx`)

- Themes: `luxquant` (default), `dark`, `bright`.
- **Public:** every user (even logged-out) can switch. `BRIGHT_ADMIN_ONLY`
  currently `false` → all three themes available to all roles in-app.
- **Marketing routes** (`/`, `/login`, `/register`) offer only **Luxquant + Dark**
  (`isMarketingRoute`). A stored Bright preference is preserved but rendered as
  Dark there.
- `useTheme()` returns `{ theme, setTheme, themes, canSwitchTheme }` where
  `themes` is the route-aware selectable list — **use it** to render pickers, so
  the right options show per context.
- Pickers: `LandingThemePicker` (HeaderV2, desktop), `ThemeAppearancePicker`
  (`ThemeToggle.jsx`, profile menu).
- **If you touch the anti-flash rules, mirror them in `index.html`** or the first
  paint will flash the wrong theme.

---

## 10. Contrast / WCAG — verify before shipping

Targets: body/label text ≥ **4.5:1**, large text (≥24px bold) ≥ **3:1**, against
the surface it sits on. The token palette is tuned to pass; you only break it by
hardcoding.

Quick in-browser check (dev server, any page):

```js
const cs = getComputedStyle(document.documentElement);
const rgb = (v) => cs.getPropertyValue(v).trim().split(' ').map(Number);
const L = ([r,g,b]) => { const f=x=>{x/=255;return x<=.03928?x/12.92:((x+.055)/1.055)**2.4}; return .2126*f(r)+.7152*f(g)+.0722*f(b); };
const ratio = (a,b)=>{const [hi,lo]=[L(a),L(b)].sort((x,y)=>y-x);return ((hi+.05)/(lo+.05)).toFixed(2);};
document.documentElement.dataset.theme='bright';
ratio(rgb('--fg-muted'), rgb('--surface'));   // must be ≥ 4.5
```

Also: build (`npm run build`) and eyeball the feature in **all three** themes
(toggle `document.documentElement.dataset.theme`), especially **Bright** (that's
where hardcoded colours show up).

---

## 11. Adding a new token or theme

- **New token:** add the channel line to **all three** theme blocks in
  `index.css`, then map it in `tailwind.config.js` with `withAlpha('--x')`.
  If it's an accent/semantic colour that will be used as text, add a `-text`
  variant + a `[data-theme="bright"]` override (mirror `--accent-text`).
- **New theme:** add a `[data-theme="yourtheme"]` block defining every token,
  add it to `THEMES`/selectable lists in `ThemeContext.jsx`, `THEME_COLOR`, the
  anti-flash `ok` array, and the picker swatches.

---

## 12. Bulk migration (codemod) recipe

When retrofitting old code, a small Node codemod over `.jsx` is the tool:
match hardcoded colours, map to tokens, **guard the exceptions** (skip
comparisons like `=== '#FFFFFF'`, SVG `fill`, brand-tile backgrounds), dry-run
first, then apply + build. This is how the codebase was standardized (text
colours, surfaces, inline styles, admin). Keep changes to `color:`/text where
possible; leave `fill`/`background` brand cases alone.

---

## 13. Pitfalls we've actually hit (don't repeat)

- `text-white` / `color:'#fff'` on a card → invisible on Bright. Use `text-text-primary` / `rgb(var(--fg))`.
- `text-accent` / yellow as text on white → ~1.7:1. It's handled by the class override; never inline `rgb(var(--accent))` for text.
- `text-profit`/green as text on white → ~2:1. Same fix via `-text` tokens.
- Warm-grey text (`#8a7a6e`, `#c9b59e`) → washed on Bright. Use `--fg-muted`/`--fg-secondary`.
- `border-gold-primary/40` on a resting card → gold glow everywhere in Dark/Bright. Use `border-line`.
- `border-white/10`, `bg-white/[0.06]` → vanish on Bright. Use `border-ink/10`, `bg-ink/[0.04]`.
- Warm/maroon `rgba(139,26,26,…)` glow → red tint in Dark/Bright. Make it a theme-aware CSS class (neutral off-Luxquant).
- Modal with X **and** a footer "Close" → redundant. Keep the X only.

---

## TL;DR checklist for a new feature

- [ ] No `#hex` / `white` / `black` / `rgba()` for surfaces, text, borders.
- [ ] Surfaces `bg-surface*`, text `text-text-*`, borders `border-ink/x` or `border-line`.
- [ ] Accent/PnL **fills** use `bg-accent`/`bg-profit`; **text** uses `text-accent`/`text-profit`.
- [ ] Header via `ui/PageHeader`; modal via `ui/Modal` (X only).
- [ ] Brand & chart colours left as fixed hex (that's correct).
- [ ] Built, and eyeballed in Luxquant + Dark + Bright; muted text passes 4.5:1.
