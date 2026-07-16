// src/components/ui/PageHeader.jsx
//
// ── THE header standard ─────────────────────────────────────────────
// Single source of truth for page / section heading typography so every
// page reads identically (size, weight, casing, colour) in every theme.
//
//   PageHeader     — h1 level. Eyebrow (mono gold + rule lines) · title ·
//                    optional subtitle/meta · optional right-side slot.
//   SectionHeader  — h2 level. Smaller, same voice.
//
// Typography scale (do NOT hand-roll headings elsewhere — use these):
//   eyebrow   font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80
//   h1        font-display text-2xl lg:text-3xl font-semibold tracking-tight text-text-primary
//   h1 sub    text-sm text-text-secondary
//   h2        font-display text-lg sm:text-xl font-semibold tracking-tight text-text-primary
//   h2 sub    text-xs text-text-muted
// Colours are theme tokens, so Luxquant/Dark both render correctly.

export function Eyebrow({ children, className = "" }) {
  if (!children) return null;
  return (
    <div className={`flex items-center gap-3 mb-3 ${className}`}>
      <span className="h-px w-8 bg-gold-primary/40" />
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
        {children}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/40 via-white/[0.06] to-transparent" />
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  meta, // custom node under the title (counts, timestamps, …)
  right, // right-side slot (actions / status pills)
  className = "",
}) {
  return (
    <div className={`flex flex-col md:flex-row md:items-end md:justify-between gap-4 ${className}`}>
      <div className="min-w-0 flex-1">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="font-display text-2xl lg:text-3xl font-semibold tracking-tight text-text-primary">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{subtitle}</p>
        ) : null}
        {meta ? <div className="mt-1.5">{meta}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function SectionHeader({ title, desc, right, className = "", as: Tag = "h2" }) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <Tag className="font-display text-lg sm:text-xl font-semibold tracking-tight text-text-primary">
          {title}
        </Tag>
        {desc ? <p className="mt-0.5 text-xs text-text-muted">{desc}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export default PageHeader;
