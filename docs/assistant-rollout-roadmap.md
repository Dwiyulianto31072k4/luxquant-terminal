# LuxQuant Assistant — Rollout Roadmap & Dev Notes

Plan for extending the context-aware assistant (currently live on Potential Trades)
to the rest of the app, with a priority order and the exact steps to add each page.

> Core principle for cost: **one small knowledge-base file per page** (`page_id`).
> Each question only injects that page's guide — never the whole app — so input
> tokens (and cost) stay low. Do NOT merge pages into one big KB.

---

## 1. How the per-page KB keeps tokens cheap

- Backend `PAGES` maps `page_id -> { file, label, suggestions }`.
- A question on `signals` loads only `knowledge/signals-page.md` (~1.5–2k tokens).
- The static guide sits at the FRONT of the prompt, so DeepSeek prompt-caching bills
  it at the cheap cache-hit rate on repeat questions.
- Guideline: keep each page guide **under ~2k tokens**. If a page's guide would grow
  much larger (lots of sub-features/data), that single page graduates to retrieval
  (pgvector) — but only that page, not the whole app.

**Cost per page is independent.** Adding pages does not make existing pages more
expensive.

---

## 2. Feature inventory (from routing)

User-facing pages: Home/Overview, Potential Trades (signals), AutoTrade, AI Research
(AI Arena), Pulse (market-pulse), News (crypto-news), On-Chain, Bitcoin, Markets,
Journal, Money Flow, Delistings, Whale Alert, Macro Calendar, Order Book, Watchlist,
Performance Hub (performance / daily / edge-lab), Portfolio, Tips, Referral, API Keys,
Profile, Notifications, Pricing/Payment.

Admin: User Management, Management System (Workspace).

---

## 3. Prioritization

Scored on: **traffic** (how many users land there), **confusion** (jargon / data
density → how often users need help), **effort** (KB writing cost), and **risk**
(financial-advice exposure — higher risk needs tighter guardrails).

### P0 — Done
| Page | page_id | Status |
|---|---|---|
| Potential Trades | `signals` | ✅ Live (widget + full KB + cost tracking) |

### P1 — Do next (highest value, users get confused here most)
| Page | page_id | Why | Effort |
|---|---|---|---|
| **AutoTrade** | `autotrade` | High-stakes, lots of setup questions (API keys, risk %, copy settings). Confusion is costly. Guardrail: explain setup only, never advise trade sizing as advice. | Medium |
| **AI Research (AI Arena)** | `ai-research` | Feature-rich and novel; users won't know what the arena/verdicts mean. | Medium |
| **Bitcoin (BTC Compass)** | `bitcoin` | Dense terminology (invalidation/target, drivers, funding). Already partly documented in the signals KB — reuse. | Low |
| **Markets** | `markets` | High traffic landing; lots of columns/metrics to explain. | Low–Med |

### P2 — Valuable, moderate traffic
| Page | page_id | Why |
|---|---|---|
| **Performance Hub** | `performance` | Win-rate/track-record questions ("how is this calculated?"). Trust-building. |
| **Money Flow** | `money-flow` | Niche concept; needs a "what am I looking at" explainer. |
| **On-Chain** | `onchain` | Jargon-heavy (flows, addresses, metrics). |
| **Journal** | `journal` | How-to (logging trades, tags) — pure product help, low risk. |
| **Watchlist** | `watchlist` | Simple, but pairs well with signals. |

### P3 — Lower priority / low traffic / simple
Pulse, News, Delistings, Whale Alert, Macro Calendar, Order Book, Portfolio, Tips,
Referral, API Keys, Profile, Notifications, Pricing. Most are self-explanatory or
low-traffic; add KBs opportunistically.

### Admin (separate track)
Management System pages could get an internal assistant later (ops help), but keep it
behind admin auth and a distinct `feature` label for cost tracking.

---

## 4. Suggested build order

1. **AutoTrade** — biggest confusion + support-ticket saver.
2. **AI Research** — showcase feature; drives engagement.
3. **Bitcoin + Markets** — cheap wins, high traffic, KB partly written.
4. Then P2 batch (Performance, Money Flow, On-Chain, Journal).
5. P3 opportunistically.

Do them one page per PR to keep reviews small and costs observable per feature in the
AI Cost tab.

---

## 5. Dev checklist — adding the assistant to a new page

Roughly 20–40 min per page once the KB is written.

**Backend**
1. Write `backend/knowledge/<page>-page.md` — how to use the page, what each metric
   means, glossary, and the standard "not financial advice" note. Keep < ~2k tokens.
2. In `backend/app/api/routes/assistant.py`, add an entry to `PAGES`:
   ```python
   "autotrade": {
       "file": "autotrade-page.md",
       "label": "AutoTrade",
       "suggestions": ["...", "..."],  # 6–8 English starter questions
   },
   ```
   (No new endpoint needed — `/assistant/chat` and `/suggestions` already handle any
   registered `page_id`.)

**Frontend**
3. Mount the widget on that page's component:
   ```jsx
   import AssistantWidget from './assistant/AssistantWidget';
   // ...at the end of the page's JSX:
   <AssistantWidget pageId="autotrade" />
   ```

**Ops**
4. Restart backend (guides are cached in-process).
5. If you edited an existing guide, flush cached answers:
   `redis-cli --scan --pattern 'lq:assistant:ans:*' | xargs -r redis-cli del`

**Cost tracking is automatic** — every page uses the same `assistant` feature label,
so all pages roll up in the AI Cost tab. (Optional: pass a per-page feature label if
you want cost split by page.)

---

## 6. Guardrail notes per risk level

- **Low risk** (Journal, Watchlist, Profile, Referral): pure how-to. Standard prompt
  is enough.
- **Medium risk** (Markets, On-Chain, Money Flow, Performance): explain data, refuse
  buy/sell. Standard prompt is enough.
- **High risk** (AutoTrade, AI Research, Bitcoin): users may ask "should I turn this
  on / how much size". Keep the hard refusal on financial advice; explain *mechanics*
  and *settings*, not decisions. Consider adding a page-specific line to that guide's
  intro reinforcing the boundary.

---

## 7. When to graduate from "inject guide" to retrieval (pgvector)

Stay with the simple inject-the-guide approach while:
- each page guide is small (< ~2k tokens), AND
- there are a manageable number of pages.

Switch a page (or the whole system) to retrieval + semantic cache
(see `docs/llm-cost-efficiency-research.md`) when:
- a single page's content is too big to inject cheaply, OR
- you want cross-page answers ("compare Markets vs Money Flow"), OR
- volume grows enough that semantic-cache savings clearly beat the added complexity.

Until then, per-page injection is the cheapest and simplest path.

---

## 8. Quick reference — page_id map (proposed)

| Page | Component | page_id |
|---|---|---|
| Potential Trades | SignalsPage | `signals` ✅ |
| AutoTrade | AutoTradePage | `autotrade` |
| AI Research | AIArenaPageV6 | `ai-research` |
| Bitcoin | BitcoinPage | `bitcoin` |
| Markets | MarketsPage | `markets` |
| Performance | PerformanceHub | `performance` |
| Money Flow | MoneyFlowPage | `money-flow` |
| On-Chain | OnchainPage | `onchain` |
| Journal | JournalPage | `journal` |
| Watchlist | WatchlistPage | `watchlist` |
| Pulse | MarketPulsePage | `market-pulse` |
| News | CryptoNewsPage | `crypto-news` |
