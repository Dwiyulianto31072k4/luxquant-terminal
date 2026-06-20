// src/components/Seo.jsx
// Per-route SEO: distinct <title> + meta so Google can differentiate pages.
import { Helmet } from "react-helmet-async";

export default function Seo({ title, description, path = "/" }) {
  const url = `https://luxquant.tw${path}`;
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  );
}
