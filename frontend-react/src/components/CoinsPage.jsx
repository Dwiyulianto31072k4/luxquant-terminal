// src/components/CoinsPage.jsx
// Public programmatic coin pages: /coins (index) and /coins/:slug (detail).
// Evergreen, crawlable content per coin; live price shown via link-out.
import { Link, useParams, Navigate } from "react-router-dom";
import Seo from "./Seo";
import { COINS, getCoin } from "../content/coins";

const SITE = "https://luxquant.tw";

function Crumbs({ trail }) {
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-text-muted">
      {trail.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-text-primary/25">/</span>}
          {c.to ? (
            <Link to={c.to} className="hover:text-gold-primary transition-colors">{c.label}</Link>
          ) : (
            <span className="text-text-primary/70">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function CoinDetail({ slug }) {
  const coin = getCoin(slug);
  if (!coin) return <Navigate to="/coins" replace />;

  const url = `${SITE}/coins/${coin.slug}`;
  const related = (coin.related || []).map(getCoin).filter(Boolean);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `${coin.name} (${coin.symbol}) — money flow, on-chain & signals`,
      url,
      description: coin.body[0],
      isPartOf: { "@type": "WebSite", name: "LuxQuant Terminal", url: `${SITE}/` },
      about: { "@type": "Thing", name: coin.name, alternateName: coin.symbol },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Coins", item: `${SITE}/coins` },
        { "@type": "ListItem", position: 3, name: `${coin.name} (${coin.symbol})`, item: url },
      ],
    },
  ];

  return (
    <div className="w-full max-w-3xl px-1 py-4">
      <Seo
        title={`${coin.name} (${coin.symbol}) — money flow, on-chain & signals | LuxQuant`}
        description={`${coin.name} (${coin.symbol}): ${coin.body[0].slice(0, 140)}`}
        path={`/coins/${coin.slug}`}
        keywords={`${coin.name}, ${coin.symbol}, ${coin.symbol} analysis, ${coin.name} on-chain, ${coin.name} money flow, luxquant`}
        type="article"
        jsonLd={jsonLd}
      />
      <Crumbs trail={[{ label: "Home", to: "/" }, { label: "Coins", to: "/coins" }, { label: coin.symbol }]} />

      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">Coins</span>
      <h1 className="font-display text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight mt-1">
        {coin.name} <span className="text-text-muted">({coin.symbol})</span>
      </h1>
      <p className="mt-1 font-mono text-[12px] text-text-muted">{coin.category}</p>

      <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-text-primary/75">
        {coin.body.map((p, i) => <p key={i}>{p}</p>)}
      </div>

      <div className="mt-8 rounded-xl border border-line/20 bg-gold-primary/[0.04] p-5">
        <h2 className="text-[15px] font-semibold text-text-primary">Track {coin.symbol} on LuxQuant</h2>
        <p className="mt-1.5 text-[13.5px] text-text-primary/70">Live money flow, on-chain whale activity, and algorithmic signals.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/money-flow" className="rounded-md bg-gold-primary/15 border border-line/40 px-4 py-2 text-[13px] font-medium text-gold-primary hover:bg-gold-primary/25 transition-colors">Open Money Flow →</Link>
          <Link to="/onchain" className="rounded-md border border-white/[0.1] px-4 py-2 text-[13px] text-text-primary/80 hover:border-line/40 hover:text-gold-primary transition-colors">On-Chain</Link>
          <Link to="/signals" className="rounded-md border border-white/[0.1] px-4 py-2 text-[13px] text-text-primary/80 hover:border-line/40 hover:text-gold-primary transition-colors">Signals</Link>
        </div>
        <p className="mt-3 text-[12px] text-text-muted">
          Live {coin.symbol} price &amp; markets: {" "}
          <a href={`https://www.coingecko.com/en/coins/${coin.cg}`} target="_blank" rel="noopener noreferrer" className="text-gold-primary/80 hover:text-gold-primary">view on CoinGecko →</a>
        </p>
      </div>

      {related.length > 0 && (
        <div className="mt-8 border-t border-white/[0.08] pt-5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted mb-3">Related coins</h2>
          <div className="flex flex-wrap gap-2">
            {related.map((r) => (
              <Link key={r.slug} to={`/coins/${r.slug}`}
                className="rounded-md border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-[13px] text-text-primary/80 hover:border-line/40 hover:text-gold-primary transition-colors">
                {r.name} ({r.symbol})
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 font-mono text-[12px] text-text-muted">
        Learn the concepts: <Link to="/learn/money-flow" className="text-gold-primary/80 hover:text-gold-primary">money flow</Link>,{" "}
        <Link to="/learn/btc-dominance" className="text-gold-primary/80 hover:text-gold-primary">BTC dominance</Link> ·{" "}
        <Link to="/coins" className="text-gold-primary/80 hover:text-gold-primary">all coins →</Link>
      </div>
    </div>
  );
}

function CoinsIndex() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Crypto Coins — LuxQuant",
      url: `${SITE}/coins`,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Coins", item: `${SITE}/coins` },
      ],
    },
  ];

  return (
    <div className="w-full px-1 py-4">
      <Seo
        title="Crypto Coins — money flow, on-chain & signals | LuxQuant"
        description="Track money flow, on-chain activity, and algorithmic signals for Bitcoin, Ethereum, Solana, and top crypto assets on LuxQuant."
        path="/coins"
        keywords="crypto coins, bitcoin, ethereum, solana, money flow, on-chain, crypto signals"
        jsonLd={jsonLd}
      />
      <Crumbs trail={[{ label: "Home", to: "/" }, { label: "Coins" }]} />

      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">Coins</span>
      <h1 className="font-display text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight mt-1">Crypto Coins</h1>
      <p className="mt-2 text-[14px] text-text-primary/55 max-w-2xl leading-relaxed">
        Money flow, on-chain intelligence, and algorithmic signals for the assets traders watch most.
      </p>

      <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {COINS.map((c) => (
          <Link key={c.slug} to={`/coins/${c.slug}`}
            className="group rounded-xl border border-white/[0.07] bg-surface-raised p-4 hover:border-line/30 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[15px] font-semibold text-text-primary group-hover:text-gold-primary transition-colors">{c.name}</h2>
              <span className="font-mono text-[12px] text-text-muted">{c.symbol}</span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-text-muted">{c.category}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 font-mono text-[12px] text-text-muted">
        New to the terms? Start with the <Link to="/learn" className="text-gold-primary/80 hover:text-gold-primary">glossary →</Link>
      </div>
    </div>
  );
}

export default function CoinsPage() {
  const { slug } = useParams();
  return slug ? <CoinDetail slug={slug} /> : <CoinsIndex />;
}
