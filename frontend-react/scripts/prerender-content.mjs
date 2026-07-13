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
  const { COINS } = await import("../src/content/coins.js");
  const termBy = (slug) => GLOSSARY.find((t) => t.slug === slug);
  const postBy = (slug) => POSTS.find((p) => p.slug === slug);
  const coinBy = (slug) => COINS.find((c) => c.slug === slug);

  const pages = [];

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
          publisher: { "@type": "Organization", name: "LuxQuant", logo: { "@type": "ImageObject", url: `${SITE}/favicon.png` } },
          mainEntityOfPage: `${SITE}/blog/${p.slug}`,
          image: `${SITE}/og-default.png`,
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
      `<h1>Crypto Coins</h1>` +
      `<p>Money flow, on-chain intelligence, and algorithmic signals for the assets traders watch most.</p>` +
      `<ul>${COINS.map((c) => `<li><a href="/coins/${c.slug}">${esc(c.name)} (${esc(c.symbol)})</a> — ${esc(c.category)}</li>`).join("")}</ul>`,
  });

  // ── Coin detail ──
  for (const c of COINS) {
    const related = (c.related || []).map(coinBy).filter(Boolean);
    pages.push({
      path: `/coins/${c.slug}`,
      title: `${c.name} (${c.symbol}) — money flow, on-chain & signals | LuxQuant`,
      description: c.body[0].slice(0, 155),
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `${c.name} (${c.symbol}) — money flow, on-chain & signals`,
          url: `${SITE}/coins/${c.slug}`,
          description: c.body[0],
          isPartOf: { "@type": "WebSite", name: "LuxQuant Terminal", url: `${SITE}/` },
        },
        breadcrumbLd([{ label: "Home", to: "/" }, { label: "Coins", to: "/coins" }, { label: `${c.name} (${c.symbol})`, self: `/coins/${c.slug}` }]),
      ],
      body:
        crumb([{ label: "Home", to: "/" }, { label: "Coins", to: "/coins" }, { label: c.symbol }]) +
        `<h1>${esc(c.name)} (${esc(c.symbol)})</h1>` +
        `<p>${esc(c.category)}</p>` +
        c.body.map((p) => `<p>${esc(p)}</p>`).join("") +
        `<p><a href="/money-flow">Open Money Flow</a> · <a href="/onchain">On-Chain</a> · <a href="/signals">Signals</a></p>` +
        `<p>Live ${esc(c.symbol)} price &amp; markets: <a href="https://www.coingecko.com/en/coins/${c.cg}" rel="noopener">view on CoinGecko</a>.</p>` +
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
  console.log(`[prerender] wrote ${n} static content pages`);
}

main().catch((e) => {
  console.warn("[prerender] skipped (non-fatal):", e && e.message ? e.message : e);
  process.exit(0);
});
