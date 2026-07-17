// src/components/Seo.jsx
// Per-route SEO: distinct <title> + meta so Google can differentiate pages.
// Supports OG/Twitter image, keywords, canonical, robots (noindex for gated
// pages), and optional JSON-LD structured data for rich results.
import { Helmet } from "react-helmet-async";

const SITE = "https://luxquant.tw";
// Lightweight 1200×630 crawl-friendly OG (prefer over multi-MB originals)
const DEFAULT_IMAGE = `${SITE}/og-default-1200.png`;

export default function Seo({
 title,
 description,
 path = "/",
 image = DEFAULT_IMAGE,
 keywords,
 noindex = false,
 type = "website",
 jsonLd,
}) {
 const url = `${SITE}${path}`;
 const img = image?.startsWith("http") ? image : `${SITE}${image}`;

 return (
 <Helmet>
 <title>{title}</title>
 <meta name="description" content={description} />
 {keywords ? <meta name="keywords" content={keywords} /> : null}
 <link rel="canonical" href={url} />

 {/* Crawl directive — noindex keeps login-gated / thin pages out of Google */}
 <meta
 name="robots"
 content={noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"}
 />

 {/* Open Graph */}
 <meta property="og:type" content={type} />
 <meta property="og:site_name" content="LuxQuant Terminal" />
 <meta property="og:title" content={title} />
 <meta property="og:description" content={description} />
 <meta property="og:url" content={url} />
 <meta property="og:image" content={img} />

 {/* Twitter / X */}
 <meta name="twitter:card" content="summary_large_image" />
 <meta name="twitter:title" content={title} />
 <meta name="twitter:description" content={description} />
 <meta name="twitter:image" content={img} />

 {/* Optional structured data (BreadcrumbList, FAQPage, Product, …) */}
 {jsonLd ? (
 <script type="application/ld+json">
 {JSON.stringify(jsonLd)}
 </script>
 ) : null}
 </Helmet>
 );
}
