# Guide: Tutorials

The **Tutorials** page (`/tips`) is a short course on how to use LuxQuant — not a
generic trading school, and not the public glossary at `/learn`.

`/learn` answers "what does this word mean". `/tips` answers "how do I use this
product, and what do these numbers actually claim".

> Note: Tutorials are educational material, not personalized financial advice.

## Layout

- A numbered **module spine** on the left (six modules, in the order they are useful).
- The selected module's **lessons** on the right, with a progress tick (sign-in to save).
- **Continue** (or **Start**) jumps to the first unfinished lesson.
- Deep link: `/tips?lesson=<slug>` opens that lesson in the reader. The app uses this
  from Signals (the Tutorials control next to Guide), from the Signals Guide modal
  ("Full course"), and from free-account onboarding.

## The six modules

1. **Start here** — what LuxQuant gives you, the map of the terminal, first 60 seconds on a call.
2. **Reading a call** — entry / TP1–TP4 / SL, statuses and the journey, the signal workspace, Compare (R:R from the live price).
3. **What the numbers mean** — the trust module. Win rate = reached at least TP1 (not "profitable trades"). Peak ≠ realised. Verdict / streak / Edge. BTC ρ and β. Claims we will not make.
4. **The tools** — Home / Signals / Pulse, Terminal, BTC Compass (not a signal service), flow & on-chain, Performance Hub, journal / watchlist / portfolio.
5. **Automation** — the Agent: what it does, dry-run then live, skips vs gates.
6. **Your account** — free vs Premium, Telegram optional, notifications, Ask AI vs human chat, referral, Shariah screening, API keys.

Lessons are short (about 3–5 minutes). Format is a property of a lesson, not a shelf;
the shelf is the track. Official lessons are authored in `backend/knowledge/tutorials/`
and seeded into `resources` on API boot.

## How to use it

Send a confused user to the matching lesson, not to the module list:

- "what does win rate mean" → `/tips?lesson=win-rate`
- "is +300% profit" → `/tips?lesson=peak-vs-realised`
- "should I follow Compass as a signal" → `/tips?lesson=btc-compass`
- "why isn't the Agent trading" → `/tips?lesson=when-it-skips`
- "how do I read a call" → `/tips?lesson=anatomy-of-a-call`
- "what do free accounts actually see" → `/tips?lesson=the-map`

Sign-in is required to open `/tips`. A paid plan is not. Progress ticks need a session.

## Note

Tutorials explain the product. They are not a recommendation to buy or sell, and they
do not change any number on Signals or Performance.
