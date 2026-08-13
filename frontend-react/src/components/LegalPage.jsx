// Public Terms / Privacy pages — same copy as the login modal.
import { Link, Navigate, useLocation } from "react-router-dom";
import Seo from "./Seo";
import { LEGAL_UPDATED, PRIVACY_SECTIONS, TERMS_SECTIONS } from "../content/legal";

const DOCS = {
  "/terms": {
    title: "Terms & Conditions",
    eyebrow: "Legal",
    description: "Terms of use for LuxQuant Terminal — including risk, subscriptions, and optional Agent assistance.",
    sections: TERMS_SECTIONS,
  },
  "/privacy": {
    title: "Privacy Policy",
    eyebrow: "Legal",
    description: "How LuxQuant collects, uses, and stores account data and exchange API keys.",
    sections: PRIVACY_SECTIONS,
  },
};

export default function LegalPage() {
  const { pathname } = useLocation();
  const doc = DOCS[pathname];
  if (!doc) return <Navigate to="/terms" replace />;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <Seo title={`${doc.title} — LuxQuant`} description={doc.description} path={pathname} />

      <nav className="mb-6 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-text-muted">
        <Link to="/" className="transition-colors hover:text-accent">
          Home
        </Link>
        <span className="text-text-primary/25">/</span>
        <span className="text-text-primary/70">{doc.title}</span>
      </nav>

      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-accent">{doc.eyebrow}</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-text-primary sm:text-4xl">
        {doc.title}
      </h1>
      <p className="mt-2 text-sm text-text-muted">Last updated · {LEGAL_UPDATED}</p>

      <div className="mt-8 space-y-7">
        {doc.sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-[15px] font-semibold text-text-primary">{section.title}</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">{section.body}</p>
          </section>
        ))}
      </div>

      <p className="mt-10 text-[12px] text-text-muted">
        Also see{" "}
        {pathname === "/terms" ? (
          <Link to="/privacy" className="underline underline-offset-2 hover:text-text-primary">
            Privacy Policy
          </Link>
        ) : (
          <Link to="/terms" className="underline underline-offset-2 hover:text-text-primary">
            Terms & Conditions
          </Link>
        )}
        .
      </p>
    </div>
  );
}
