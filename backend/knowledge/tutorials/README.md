# Tutorials curriculum

Source of truth for `/tips`. Each `NN-slug.md` file is one lesson.

- Frontmatter: `slug`, `track`, `order`, `title`, `excerpt`, `level`, `minutes`.
- Tracks (from `app.services.learn.TRACKS`): `start` · `read-a-call` · `numbers` · `tools` · `automation` · `account`.
- Body is Markdown in the subset `mdRender.jsx` understands: headings, bold, italic, lists, quotes, links, `code`, `---`. **No tables.**
- Internal product links are `[Signals](/signals)` — the reader navigates in-app.
- Seeded into `resources` (tag `curriculum`) on API boot. Re-running overwrites official slugs only.

Do not invent numbers here. Definitions of win rate, peak, verdict, Compass, and the Agent come from `docs/social-content-truth-sheet.md` and the page guides in `backend/knowledge/`.
