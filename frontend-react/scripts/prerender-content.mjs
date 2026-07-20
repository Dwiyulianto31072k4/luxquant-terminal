// scripts/prerender-content.mjs
// ────────────────────────────────────────────────────────────────
// Lightweight static prerender for the PUBLIC CONTENT pages (/learn, /blog).
// Pure Node — no headless browser — so it can never hang on WebGL/three.js and
// never break the build. Runs as a `postbuild` step: it reads the built
// dist/index.html shell and writes a static HTML file per content route with
// real, crawlable <head> meta + JSON-LD + visible article text injected into
// #root (React replaces it on mount). nginx serves these via try_files.
//
// Fail-safe: any error is caught and the process still exits 0, so a problem
// here can never fail the deploy.
// ────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = "https://luxquant.tw";
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "../dist");

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function withHead(base, { path, title, description, jsonLd }) {
  const url = SITE + path;
  let html = base;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(
    /<meta name="description"[^>]*>/,
    `<meta name="description" content="${esc(description)}" />`
  );
  if (/<link rel="canonical"[^>]*>/.test(html)) {
    html = html.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}" />`);
  } else {
    html = html.replace("</head>", `  <link rel="canonical" href="${url}" />\n</head>`);
  }
  html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(title)}" />`);
  html = html.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(description)}" />`);
  html = html.replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}" />`);
  const blocks = (Array.isArray(jsonLd) ? jsonLd : [jsonLd]).filter(Boolean);
  if (blocks.length) {
    const ld = blocks.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n");
    html = html.replace("</head>", `${ld}\n</head>`);
  }
  return html;
}

function injectBody(html, bodyHtml) {
  // Replace the preboot loader between the markers with crawlable content.
  const re = /<!--prerender:start-->[\s\S]*?<!--prerender:end-->/;
  const inject = `<div id="prerender-content">${bodyHtml}</div>`;
  return re.test(html) ? html.replace(re, inject) : html;
}

const crumb = (items) =>
  `<nav aria-label="Breadcrumb"><ol>${items
    .map((c) => (c.to ? `<li><a href="${c.to}">${esc(c.label)}</a></li>` : `<li>${esc(c.label)}</li>`))
    .join("")}</ol></nav>`;

const breadcrumbLd = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((c, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: c.label,
    item: SITE + (c.to || c.self),
  })),
});

async function main() {
  if (!existsSync(DIST)) return;
  const base = readFileSync(resolve(DIST, "index.html"), "utf8");

  const { GLOSSARY } = await import("../src/content/glossary.js");
  const { POSTS } = await import("../src/content/posts.js");
  const { COINS, ALL_COINS, COIN_STATS } = await import("../src/content/coins.js");
  const { LANDING_FAQ, landingFaqJsonLd } = await import("../src/content/faq.js");
  const termBy = (slug) => GLOSSARY.find((t) => t.slug === slug);
  const postBy = (slug) => POSTS.find((p) => p.slug === slug);
  const coinBy = (slug) => ALL_COINS.find((c) => c.slug === slug);
  const sinceLbl = (d) => {
    if (!d) return "";
    const dt = new Date(d + "T00:00:00Z");
    return dt.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  };
  // Build the crawlable, unique content for one coin — curated body if present,
  // otherwise a data-driven paragraph from the real track record.
  const coinMeta = (c) => {
    const st = COIN_STATS[c.slug] || null;
    const since = st ? sinceLbl(st.since) : "";
    const isGen = !c.body;
    const paras = c.body || (st
      ? [
          `LuxQuant's algorithm has published ${st.n.toLocaleString()} ${c.symbol} trade signals since ${since}.` +
            (st.wr != null ? ` Across ${st.resolved} resolved calls, ${c.symbol} carries a ${st.wr}% win rate` : "") +
            (st.avgPeak != null ? ` — the average call reached a peak of +${st.avgPeak}% from entry` : "") +
            (st.best != null ? `, and the strongest ${c.symbol} call ran +${st.best}%.` : "."),
          `Each ${c.symbol} signal ships with a full plan — exact entry, staged take-profits (TP1–TP4) and a hard stop-loss — all timestamped and publicly auditable on LuxQuant.`,
        ]
      : [`Track ${c.name} (${c.symbol}) money flow, on-chain activity and algorithmic signals on LuxQuant.`]);
    const category = c.category || (st ? `${c.symbol}/USDT · ${st.n.toLocaleString()} signals tracked` : c.symbol);
    const title = isGen
      ? `${c.symbol} signal track record — ${st ? st.n.toLocaleString() + " LuxQuant calls" : "LuxQuant"}${st && st.wr != null ? `, ${st.wr}% win rate` : ""} | LuxQuant`
      : `${c.name} (${c.symbol}) — money flow, on-chain & signals | LuxQuant`;
    const description = isGen && st
      ? `LuxQuant has called ${c.symbol} ${st.n.toLocaleString()} times since ${since}${st.wr != null ? ` at a ${st.wr}% win rate` : ""}${st.avgPeak != null ? `, avg peak +${st.avgPeak}%` : ""}. Timestamped, verifiable signals with entry, TP1–TP4 and stop-loss.`
      : `${c.name} (${c.symbol}): ${paras[0].slice(0, 140)}`;
    const statLine = st
      ? `<p><strong>${c.symbol} track record on LuxQuant${since ? ` (since ${esc(since)})` : ""}:</strong> ` +
        [`${st.n.toLocaleString()} signals called`, st.wr != null && `${st.wr}% win rate`, st.avgPeak != null && `+${st.avgPeak}% average peak`, st.best != null && `+${st.best}% best call`]
          .filter(Boolean).map(esc).join(" · ") + `.</p>`
      : "";
    return { st, paras, category, title, description, statLine };
  };

  const pages = [];

  // ── Homepage (overwrites dist/index.html with crawlable body + FAQ schema) ──
  pages.push({
    path: "/",
    title: "LuxQuant Terminal — Quantitative Crypto Intelligence",
    description:
      "LuxQuant Terminal turns market data into a quantitative edge with algorithmic analysis, on-chain intelligence, and risk scoring. Trade smarter, with confidence. Informed by data, decided by you.",
    jsonLd: [landingFaqJsonLd(SITE)],
    body:
      `<h1>LuxQuant Terminal — Quantitative Crypto Intelligence</h1>` +
      `<p>A 24/7 quantitative crypto terminal: algorithmic signals with a transparent track record, money-flow and sector rotation, on-chain intelligence, risk scoring, and AI research. Free tier available.</p>` +
      `<nav aria-label="Popular pages"><ul>` +
      [
        ["Market Overview", "/home"],
        ["Pricing & Plans", "/pricing"],
        ["Crypto Coins", "/coins"],
        ["Bitcoin (BTC)", "/coins/btc"],
        ["Ethereum (ETH)", "/coins/eth"],
        ["Solana (SOL)", "/coins/sol"],
        ["Crypto & Quant Glossary", "/learn"],
        ["Blog", "/blog"],
        ["Status", "/status"],
      ]
        .map(([label, href]) => `<li><a href="${href}">${esc(label)}</a></li>`)
        .join("") +
      `</ul></nav>` +
      `<h2>Frequently asked questions</h2>` +
      LANDING_FAQ.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("") +
      `<h2>Learn the concepts</h2><ul>${GLOSSARY.slice(0, 8)
        .map((t) => `<li><a href="/learn/${t.slug}">${esc(t.term)}</a> — ${esc(t.short)}</li>`)
        .join("")}</ul>` +
      `<p><a href="/login">Open app</a> · <a href="/pricing">View pricing</a> · <a href="https://t.me/LuxQuantSignal">Telegram signals</a></p>`,
  });

  // ── Market Overview teaser (public doorway; full app may require login client-side) ──
  pages.push({
    path: "/home",
    title: "Market Overview — Live Crypto Data & Analytics | LuxQuant Terminal",
    description:
      "Live crypto market overview: top movers, sector rotation, and quantitative analytics from LuxQuant Terminal. Real-time data, decided by you.",
    jsonLd: [
      breadcrumbLd([{ label: "Home", to: "/" }, { label: "Market Overview", self: "/home" }]),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Market Overview — LuxQuant Terminal",
        url: `${SITE}/home`,
        description:
          "Live crypto market overview with top movers and quantitative analytics.",
        isPartOf: { "@type": "WebSite", url: `${SITE}/` },
      },
    ],
    body:
      crumb([{ label: "Home", to: "/" }, { label: "Market Overview" }]) +
      `<h1>Market Overview</h1>` +
      `<p>Live crypto market overview from LuxQuant Terminal — top performers, market context, and quantitative analytics. Sign in for the full live terminal.</p>` +
      `<ul>` +
      `<li><a href="/coins">Browse crypto coins</a></li>` +
      `<li><a href="/learn">Crypto &amp; quant glossary</a></li>` +
      `<li><a href="/blog">Educational blog</a></li>` +
      `<li><a href="/pricing">Pricing &amp; plans</a></li>` +
      `</ul>` +
      `<p><a href="/login?redirect=%2Fhome">Sign in to open the live overview</a></p>`,
  });

  // ── Pricing ──
  pages.push({
    path: "/pricing",
    title: "Pricing & Plans — LuxQuant Terminal",
    description:
      "Compare LuxQuant Terminal plans. Free tier to start; premium unlocks algorithmic signals, AutoTrade, on-chain intelligence, and AI research.",
    jsonLd: [
      breadcrumbLd([{ label: "Home", to: "/" }, { label: "Pricing", self: "/pricing" }]),
      {
        "@context": "https://schema.org",
        "@type": "Product",
        name: "LuxQuant Terminal",
        description:
          "Quantitative crypto trading terminal with algorithmic signals, AutoTrade, on-chain intelligence, and AI research.",
        brand: { "@type": "Brand", name: "LuxQuant" },
        image: `${SITE}/logo-512.png`,
        url: `${SITE}/pricing`,
        offers: {
          "@type": "AggregateOffer",
          lowPrice: "0",
          priceCurrency: "USD",
          offerCount: "3",
          availability: "https://schema.org/InStock",
        },
      },
    ],
    body:
      crumb([{ label: "Home", to: "/" }, { label: "Pricing" }]) +
      `<h1>Pricing &amp; Plans</h1>` +
      `<p>LuxQuant Terminal pricing: start free, upgrade when you need full signals, AutoTrade, on-chain intelligence, and AI research.</p>` +
      `<ul>` +
      `<li><strong>Free tier</strong> — explore the product and core market views.</li>` +
      `<li><strong>Premium</strong> — algorithmic signals, AutoTrade, on-chain, AI research.</li>` +
      `</ul>` +
      `<p><a href="/login">Create account</a> · <a href="/">Back to homepage</a> · <a href="/learn">Glossary</a></p>`,
  });

  // ── Status ──
  pages.push({
    path: "/status",
    title: "LuxQuant Status — Platform & API Uptime",
    description:
      "Live operational status for the LuxQuant Terminal platform, API, and data services. Real-time uptime and incident history.",
    jsonLd: [
      breadcrumbLd([{ label: "Home", to: "/" }, { label: "Status", self: "/status" }]),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "LuxQuant Status",
        url: `${SITE}/status`,
        description: "Platform and API operational status for LuxQuant Terminal.",
      },
    ],
    body:
      crumb([{ label: "Home", to: "/" }, { label: "Status" }]) +
      `<h1>LuxQuant Status</h1>` +
      `<p>Operational status for the LuxQuant Terminal platform, API, and data services. Open this page in the app for live uptime and incident history.</p>` +
      `<p><a href="/">luxquant.tw</a> · <a href="/pricing">Pricing</a></p>`,
  });

  // ── Learn index ──
  pages.push({
    path: "/learn",
    title: "Crypto & Quant Glossary — money flow, dominance, on-chain | LuxQuant",
    description:
      "Plain-English definitions of the crypto and quantitative-trading terms behind LuxQuant: money flow, flow intensity, BTC dominance, altseason, sector rotation, and more.",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "DefinedTermSet",
        name: "LuxQuant Crypto & Quant Glossary",
        url: `${SITE}/learn`,
        hasDefinedTerm: GLOSSARY.map((t) => ({ "@type": "DefinedTerm", name: t.term, url: `${SITE}/learn/${t.slug}` })),
      },
      breadcrumbLd([{ label: "Home", to: "/" }, { label: "Learn", self: "/learn" }]),
    ],
    body:
      crumb([{ label: "Home", to: "/" }, { label: "Learn" }]) +
      `<h1>Crypto &amp; Quant Glossary</h1>` +
      `<p>Plain-English definitions of the concepts behind the LuxQuant Terminal.</p>` +
      `<ul>${GLOSSARY.map((t) => `<li><a href="/learn/${t.slug}">${esc(t.term)}</a> — ${esc(t.short)}</li>`).join("")}</ul>` +
      `<p>Prefer long-form? Read the <a href="/blog">LuxQuant blog</a>.</p>`,
  });

  // ── Learn terms ──
  for (const t of GLOSSARY) {
    const related = (t.related || []).map(termBy).filter(Boolean);
    pages.push({
      path: `/learn/${t.slug}`,
      title: `${t.term} — meaning & how it works | LuxQuant`,
      description: t.short,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "DefinedTerm",
          name: t.term,
          description: t.short,
          url: `${SITE}/learn/${t.slug}`,
          inDefinedTermSet: `${SITE}/learn`,
        },
        breadcrumbLd([{ label: "Home", to: "/" }, { label: "Learn", to: "/learn" }, { label: t.term, self: `/learn/${t.slug}` }]),
      ],
      body:
        crumb([{ label: "Home", to: "/" }, { label: "Learn", to: "/learn" }, { label: t.term }]) +
        `<h1>${esc(t.term)}</h1>` +
        (t.aka ? `<p>Also known as: ${esc(t.aka)}</p>` : "") +
        t.body.map((p) => `<p>${esc(p)}</p>`).join("") +
        (related.length
          ? `<h2>Related terms</h2><ul>${related.map((r) => `<li><a href="/learn/${r.slug}">${esc(r.term)}</a></li>`).join("")}</ul>`
          : "") +
        `<p><a href="/money-flow">Open LuxQuant Money Flow</a></p>` +
        `<p><a href="/learn">Back to glossary</a></p>`,
    });
  }

  // ── Blog index ──
  pages.push({
    path: "/blog",
    title: "LuxQuant Blog — crypto money flow, on-chain & quant trading",
    description:
      "Educational guides on crypto money flow, sector rotation, Bitcoin dominance, on-chain intelligence, and quantitative trading from the LuxQuant team.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "LuxQuant Blog",
      url: `${SITE}/blog`,
      blogPost: POSTS.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: `${SITE}/blog/${p.slug}`, datePublished: p.date })),
    },
    body:
      crumb([{ label: "Home", to: "/" }, { label: "Blog" }]) +
      `<h1>LuxQuant Blog</h1>` +
      `<ul>${POSTS.map((p) => `<li><a href="/blog/${p.slug}">${esc(p.title)}</a> — ${esc(p.excerpt)}</li>`).join("")}</ul>` +
      `<p>New to the terms? Start with the <a href="/learn">glossary</a>.</p>`,
  });

  // ── Blog posts ──
  const blockHtml = (b) =>
    b.h2 ? `<h2>${esc(b.h2)}</h2>` : b.list ? `<ul>${b.list.map((li) => `<li>${esc(li)}</li>`).join("")}</ul>` : `<p>${esc(b.p)}</p>`;

  for (const p of POSTS) {
    const relTerms = (p.relatedTerms || []).map(termBy).filter(Boolean);
    const relPosts = (p.related || []).map(postBy).filter(Boolean);
    pages.push({
      path: `/blog/${p.slug}`,
      title: `${p.title} | LuxQuant`,
      description: p.excerpt,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: p.title,
          description: p.excerpt,
          datePublished: p.date,
          dateModified: p.updated || p.date,
          author: { "@type": "Organization", name: "LuxQuant" },
          publisher: {
            "@type": "Organization",
            name: "LuxQuant",
            logo: { "@type": "ImageObject", url: `${SITE}/logo-512.png`, width: 512, height: 512 },
          },
          mainEntityOfPage: `${SITE}/blog/${p.slug}`,
          image: `${SITE}/og-default-1200.png`,
        },
        breadcrumbLd([{ label: "Home", to: "/" }, { label: "Blog", to: "/blog" }, { label: p.title, self: `/blog/${p.slug}` }]),
      ],
      body:
        crumb([{ label: "Home", to: "/" }, { label: "Blog", to: "/blog" }, { label: p.title }]) +
        `<h1>${esc(p.title)}</h1>` +
        `<p>${esc(p.date)} · ${esc(p.readingTime)} read</p>` +
        p.body.map(blockHtml).join("") +
        (relTerms.length
          ? `<h2>Terms in this article</h2><ul>${relTerms.map((r) => `<li><a href="/learn/${r.slug}">${esc(r.term)}</a></li>`).join("")}</ul>`
          : "") +
        (relPosts.length
          ? `<h2>Keep reading</h2><ul>${relPosts.map((r) => `<li><a href="/blog/${r.slug}">${esc(r.title)}</a></li>`).join("")}</ul>`
          : "") +
        `<p><a href="/money-flow">Open LuxQuant Money Flow</a></p>`,
    });
  }

  // ── Coins index ──
  pages.push({
    path: "/coins",
    title: "Crypto Coins — money flow, on-chain & signals | LuxQuant",
    description:
      "Track money flow, on-chain activity, and algorithmic signals for Bitcoin, Ethereum, Solana, and top crypto assets on LuxQuant.",
    jsonLd: [
      { "@context": "https://schema.org", "@type": "CollectionPage", name: "Crypto Coins — LuxQuant", url: `${SITE}/coins` },
      breadcrumbLd([{ label: "Home", to: "/" }, { label: "Coins", self: "/coins" }]),
    ],
    body:
      crumb([{ label: "Home", to: "/" }, { label: "Coins" }]) +
      `<h1>Crypto Coins — ${ALL_COINS.length.toLocaleString()} tracked pairs</h1>` +
      `<p>Money flow, on-chain intelligence, and algorithmic signal track records for every pair LuxQuant covers.</p>` +
      `<ul>${ALL_COINS.map((c) => {
        const st = COIN_STATS[c.slug];
        const tail = c.category ? esc(c.category) : st ? `${st.n} signals, ${st.wr != null ? st.wr + "% WR" : "tracked"}` : "tracked";
        return `<li><a href="/coins/${c.slug}">${esc(c.name)} (${esc(c.symbol)})</a> — ${tail}</li>`;
      }).join("")}</ul>`,
  });

  // ── Coin detail (curated + generated) ──
  for (const c of ALL_COINS) {
    const m = coinMeta(c);
    const relatedSlugs = c.related || ["btc", "eth", "sol", "bnb"].filter((x) => x !== c.slug).slice(0, 4);
    const related = relatedSlugs.map(coinBy).filter(Boolean);
    pages.push({
      path: `/coins/${c.slug}`,
      title: m.title,
      description: m.description,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `${c.name} (${c.symbol}) — LuxQuant signals & track record`,
          url: `${SITE}/coins/${c.slug}`,
          description: m.paras[0],
          isPartOf: { "@type": "WebSite", name: "LuxQuant Terminal", url: `${SITE}/` },
          about: { "@type": "Thing", name: c.name, alternateName: c.symbol },
        },
        breadcrumbLd([{ label: "Home", to: "/" }, { label: "Coins", to: "/coins" }, { label: `${c.name} (${c.symbol})`, self: `/coins/${c.slug}` }]),
      ],
      body:
        crumb([{ label: "Home", to: "/" }, { label: "Coins", to: "/coins" }, { label: c.symbol }]) +
        `<h1>${esc(c.name)}${c.name !== c.symbol ? ` (${esc(c.symbol)})` : ""}</h1>` +
        `<p>${esc(m.category)}</p>` +
        m.statLine +
        m.paras.map((p) => `<p>${esc(p)}</p>`).join("") +
        `<p><a href="/signals">${esc(c.symbol)} signals</a> · <a href="/performance">Full track record</a> · <a href="/money-flow">Money Flow</a> · <a href="/onchain">On-Chain</a></p>` +
        (c.cg ? `<p>Live ${esc(c.symbol)} price &amp; markets: <a href="https://www.coingecko.com/en/coins/${c.cg}" rel="noopener">view on CoinGecko</a>.</p>` : "") +
        (related.length
          ? `<h2>Related coins</h2><ul>${related.map((r) => `<li><a href="/coins/${r.slug}">${esc(r.name)} (${esc(r.symbol)})</a></li>`).join("")}</ul>`
          : "") +
        `<p><a href="/learn/money-flow">Learn: money flow</a> · <a href="/coins">All coins</a></p>`,
    });
  }

  let n = 0;
  for (const page of pages) {
    const html = injectBody(withHead(base, page), page.body);
    const dir = resolve(DIST, "." + page.path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "index.html"), html, "utf8");
    n++;
  }

  // ── Sitemap: every prerendered public route (incl. all coin pages) ──
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  const urls = [];
  const addUrl = (path, priority) => {
    if (seen.has(path)) return;
    seen.add(path);
    const loc = path === "/" ? `${SITE}/` : SITE + path;
    urls.push(`  <url><loc>${loc}</loc><lastmod>${today}</lastmod><priority>${priority}</priority></url>`);
  };
  addUrl("/", "1.0");
  addUrl("/pricing", "0.9");
  addUrl("/coins", "0.8");
  addUrl("/learn", "0.7");
  addUrl("/blog", "0.6");
  for (const page of pages) {
    const p = page.path;
    const pr = p.startsWith("/coins/") ? "0.6" : p.startsWith("/learn/") || p.startsWith("/blog/") ? "0.5" : "0.6";
    addUrl(p, pr);
  }
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join("\n") +
    `\n</urlset>\n`;
  writeFileSync(resolve(DIST, "sitemap.xml"), sitemap, "utf8");

  console.log(`[prerender] wrote ${n} static content pages + sitemap (${urls.length} urls)`);
}

main().catch((e) => {
  console.warn("[prerender] skipped (non-fatal):", e && e.message ? e.message : e);
  process.exit(0);
});
