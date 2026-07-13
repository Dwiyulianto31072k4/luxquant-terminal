// src/components/LearnPage.jsx
// Public glossary: /learn (index) and /learn/:slug (term).
// Programmatic SEO surface — indexable, text-first, cross-linked.
import { Link, useParams, Navigate } from "react-router-dom";
import Seo from "./Seo";
import { GLOSSARY, getTerm } from "../content/glossary";

const SITE = "https://luxquant.tw";

function Crumbs({ trail }) {
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-text-muted">
      {trail.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-white/25">/</span>}
          {c.to ? (
            <Link to={c.to} className="hover:text-gold-primary transition-colors">{c.label}</Link>
          ) : (
            <span className="text-white/70">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function TermPage({ slug }) {
  const term = getTerm(slug);
  if (!term) return <Navigate to="/learn" replace />;

  const url = `${SITE}/learn/${term.slug}`;
  const related = (term.related || []).map(getTerm).filter(Boolean);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "DefinedTerm",
      name: term.term,
      description: term.short,
      url,
      inDefinedTermSet: `${SITE}/learn`,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Learn", item: `${SITE}/learn` },
        { "@type": "ListItem", position: 3, name: term.term, item: url },
      ],
    },
  ];

  return (
    <div className="w-full max-w-3xl px-1 py-4">
      <Seo
        title={`${term.term} — meaning & how it works | LuxQuant`}
        description={term.short}
        path={`/learn/${term.slug}`}
        keywords={`${term.term}, ${term.aka || ""}, crypto, luxquant`}
        type="article"
        jsonLd={jsonLd}
      />
      <Crumbs trail={[{ label: "Home", to: "/" }, { label: "Learn", to: "/learn" }, { label: term.term }]} />

      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold-primary/70">Glossary</span>
      <h1 className="font-display text-2xl lg:text-3xl font-semibold text-white tracking-tight mt-1">{term.term}</h1>
      {term.aka && <p className="mt-1 font-mono text-[12px] text-text-muted">Also known as: {term.aka}</p>}

      <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-white/75">
        {term.body.map((p, i) => <p key={i}>{p}</p>)}
      </div>

      {related.length > 0 && (
        <div className="mt-10 border-t border-white/[0.08] pt-5">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted mb-3">Related terms</h2>
          <div className="flex flex-wrap gap-2">
            {related.map((r) => (
              <Link key={r.slug} to={`/learn/${r.slug}`}
                className="rounded-md border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-[13px] text-white/80 hover:border-gold-primary/40 hover:text-gold-primary transition-colors">
                {r.term}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 rounded-xl border border-gold-primary/20 bg-gold-primary/[0.04] p-5">
        <p className="text-[15px] text-white/80">See {term.term.toLowerCase()} live in the terminal.</p>
        <Link to="/money-flow" className="mt-3 inline-flex items-center gap-2 rounded-md bg-gold-primary/15 border border-gold-primary/40 px-4 py-2 text-[13px] font-medium text-gold-primary hover:bg-gold-primary/25 transition-colors">
          Open LuxQuant Money Flow →
        </Link>
      </div>

      <div className="mt-8">
        <Link to="/learn" className="font-mono text-[12px] text-text-muted hover:text-gold-primary transition-colors">← Back to glossary</Link>
      </div>
    </div>
  );
}

function IndexPage() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "DefinedTermSet",
      name: "LuxQuant Crypto & Quant Glossary",
      url: `${SITE}/learn`,
      hasDefinedTerm: GLOSSARY.map((t) => ({
        "@type": "DefinedTerm",
        name: t.term,
        url: `${SITE}/learn/${t.slug}`,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Learn", item: `${SITE}/learn` },
      ],
    },
  ];

  return (
    <div className="w-full px-1 py-4">
      <Seo
        title="Crypto & Quant Glossary — money flow, dominance, on-chain | LuxQuant"
        description="Plain-English definitions of the crypto and quantitative-trading terms behind LuxQuant: money flow, flow intensity, BTC dominance, altseason, sector rotation, DEX pressure, and more."
        path="/learn"
        keywords="crypto glossary, quant trading terms, money flow, btc dominance, altseason index"
        jsonLd={jsonLd}
      />
      <Crumbs trail={[{ label: "Home", to: "/" }, { label: "Learn" }]} />

      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold-primary/70">Learn · Glossary</span>
      <h1 className="font-display text-2xl lg:text-3xl font-semibold text-white tracking-tight mt-1">Crypto &amp; Quant Glossary</h1>
      <p className="mt-2 text-[14px] text-white/55 max-w-2xl leading-relaxed">
        Plain-English definitions of the concepts behind the LuxQuant Terminal — the same metrics you'll see across Money Flow, On-Chain, and Signals.
      </p>

      <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {GLOSSARY.map((t) => (
          <Link key={t.slug} to={`/learn/${t.slug}`}
            className="group rounded-xl border border-white/[0.07] bg-[#0a0805] p-4 hover:border-gold-primary/30 hover:bg-white/[0.02] transition-colors">
            <h2 className="text-[15px] font-semibold text-white group-hover:text-gold-primary transition-colors">{t.term}</h2>
            <p className="mt-1.5 text-[13px] text-white/55 leading-relaxed line-clamp-3">{t.short}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 font-mono text-[12px] text-text-muted">
        Prefer long-form? Read the <Link to="/blog" className="text-gold-primary/80 hover:text-gold-primary">LuxQuant blog →</Link>
      </div>
    </div>
  );
}

export default function LearnPage() {
  const { slug } = useParams();
  return slug ? <TermPage slug={slug} /> : <IndexPage />;
}
