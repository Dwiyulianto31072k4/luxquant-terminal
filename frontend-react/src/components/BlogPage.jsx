// src/components/BlogPage.jsx
// Public blog: /blog (index) and /blog/:slug (article).
// Editorial layer for topical authority — indexable, cross-linked to glossary.
import { Link, useParams, Navigate } from "react-router-dom";
import Seo from "./Seo";
import { POSTS, getPost } from "../content/posts";
import { getTerm } from "../content/glossary";
import { PageHeader } from "./ui/PageHeader";

const SITE = "https://luxquant.tw";

const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "";

function Crumbs({ trail }) {
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-text-muted">
      {trail.map((c, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-text-primary/25">/</span>}
          {c.to ? (
            <Link to={c.to} className="hover:text-accent transition-colors">
              {c.label}
            </Link>
          ) : (
            <span className="text-text-primary/70">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function Block({ block }) {
  if (block.h2)
    return (
      <h2 className="mt-8 mb-3 font-display text-xl font-semibold text-text-primary">{block.h2}</h2>
    );
  if (block.list)
    return (
      <ul className="my-4 space-y-1.5 pl-1">
        {block.list.map((li, i) => (
          <li key={i} className="flex gap-2.5 text-[15px] text-text-primary/75">
            <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-accent/12" />
            <span>{li}</span>
          </li>
        ))}
      </ul>
    );
  return <p className="my-4 text-[15px] leading-relaxed text-text-primary/75">{block.p}</p>;
}

function PostPage({ slug }) {
  const post = getPost(slug);
  if (!post) return <Navigate to="/blog" replace />;

  const url = `${SITE}/blog/${post.slug}`;
  const relatedPosts = (post.related || []).map(getPost).filter(Boolean);
  const relatedTerms = (post.relatedTerms || []).map(getTerm).filter(Boolean);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      dateModified: post.updated || post.date,
      author: { "@type": "Organization", name: "LuxQuant" },
      publisher: {
        "@type": "Organization",
        name: "LuxQuant",
        logo: { "@type": "ImageObject", url: `${SITE}/favicon.png` },
      },
      mainEntityOfPage: url,
      image: `${SITE}/og-default.png`,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
  ];

  return (
    <article className="w-full px-1 py-4">
      <Seo
        title={`${post.title} | LuxQuant`}
        description={post.excerpt}
        path={`/blog/${post.slug}`}
        keywords={post.keywords}
        type="article"
        jsonLd={jsonLd}
      />
      <Crumbs
        trail={[{ label: "Home", to: "/" }, { label: "Blog", to: "/blog" }, { label: post.title }]}
      />

      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-accent">Blog</span>
      <h1 className="font-display text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight mt-1">
        {post.title}
      </h1>
      <p className="mt-2 font-mono text-[11px] text-text-muted">
        {fmtDate(post.date)} · {post.readingTime} read
      </p>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 min-w-0 max-w-3xl">
          <div>
            {post.body.map((b, i) => (
              <Block key={i} block={b} />
            ))}
          </div>

          {relatedTerms.length > 0 && (
            <div className="mt-10 border-t border-ink/[0.08] pt-5">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted mb-3">
                Terms in this article
              </h2>
              <div className="flex flex-wrap gap-2">
                {relatedTerms.map((r) => (
                  <Link
                    key={r.slug}
                    to={`/learn/${r.slug}`}
                    className="rounded-md border border-ink/[0.1] bg-ink/[0.03] px-3 py-1.5 text-[13px] text-text-primary/80 hover:border-ink/15 hover:text-accent transition-colors"
                  >
                    {r.term}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="lg:col-span-1 space-y-5">
          <div className="rounded-xl border border-ink/10 bg-accent/12 p-5">
            <p className="text-[15px] text-text-primary/80">See the data behind this article, live.</p>
            <Link
              to="/money-flow"
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-accent border border-ink/12 px-4 py-2 text-[13px] font-semibold text-accent-fg hover:opacity-90 transition-opacity"
            >
              Open LuxQuant Money Flow →
            </Link>
          </div>

          {relatedPosts.length > 0 && (
            <div className="rounded-xl border border-ink/10 bg-surface-secondary p-5">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted mb-3">
                Keep reading
              </h2>
              <div className="space-y-2.5">
                {relatedPosts.map((p) => (
                  <Link
                    key={p.slug}
                    to={`/blog/${p.slug}`}
                    className="block text-[14px] text-text-primary/80 hover:text-accent transition-colors"
                  >
                    {p.title} →
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}

function IndexPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "LuxQuant Blog",
    url: `${SITE}/blog`,
    blogPost: POSTS.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${SITE}/blog/${p.slug}`,
      datePublished: p.date,
    })),
  };

  return (
    <div className="w-full px-1 py-4">
      <Seo
        title="LuxQuant Blog — crypto money flow, on-chain & quant trading"
        description="Educational guides on crypto money flow, sector rotation, Bitcoin dominance, on-chain intelligence, and quantitative trading from the LuxQuant team."
        path="/blog"
        keywords="crypto blog, money flow, quant trading, btc dominance, on-chain analysis"
        jsonLd={jsonLd}
      />
      <Crumbs trail={[{ label: "Home", to: "/" }, { label: "Blog" }]} />

      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-accent">Blog</span>
      <PageHeader title="LuxQuant Blog" />
      <p className="mt-2 text-[14px] text-text-primary/55 max-w-2xl leading-relaxed">
        Guides on reading crypto money flow, on-chain intelligence, and quantitative trading — the
        thinking behind the terminal.
      </p>

      <div className="mt-7 space-y-3">
        {POSTS.map((p) => (
          <Link
            key={p.slug}
            to={`/blog/${p.slug}`}
            className="group block rounded-xl border border-ink/[0.07] bg-surface-raised p-5 hover:border-ink/12 hover:bg-ink/[0.02] transition-colors"
          >
            <p className="font-mono text-[11px] text-text-muted">
              {fmtDate(p.date)} · {p.readingTime} read
            </p>
            <h2 className="mt-1.5 text-[17px] font-semibold text-text-primary group-hover:text-accent transition-colors">
              {p.title}
            </h2>
            <p className="mt-1.5 text-[13.5px] text-text-primary/55 leading-relaxed">{p.excerpt}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 font-mono text-[12px] text-text-muted">
        New to the terms? Start with the{" "}
        <Link to="/learn" className="text-accent hover:text-accent">
          glossary →
        </Link>
      </div>
    </div>
  );
}

export default function BlogPage() {
  const { slug } = useParams();
  return slug ? <PostPage slug={slug} /> : <IndexPage />;
}
