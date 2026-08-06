// Unified landing CTA system — one scale, one hierarchy.
// Primary: gold fill · Secondary: soft/ghost · Chip: filters/tabs (use local).
//
// Heights (touch-safe):
//   md → h-11 (44px)  header / sticky / secondary
//   lg → h-12 (48px)  section CTAs
// Width:
//   auto | full | fullMobile (full max-w-md on phone, auto on sm+)

const SIZE = {
  md: "h-11 px-5 text-[13px] sm:text-[14px]",
  lg: "h-12 px-7 text-[15px]",
};

const WIDTH = {
  auto: "w-auto",
  full: "w-full",
  // Centered on mobile so it never hugs the left edge in open layouts.
  fullMobile: "mx-auto w-full max-w-sm sm:mx-0 sm:w-auto sm:max-w-none",
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  size = "lg",
  width = "auto",
  className = "",
  ...rest
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`${base} bg-accent text-accent-fg shadow-[0_4px_16px_rgb(var(--accent)/0.28)] hover:-translate-y-0.5 hover:bg-accent-light hover:shadow-[0_8px_22px_rgb(var(--accent)/0.34)] ${SIZE[size] || SIZE.lg} ${WIDTH[width] || WIDTH.auto} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  type = "button",
  size = "md",
  width = "auto",
  className = "",
  ...rest
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`${base} border border-ink/12 bg-ink/[0.03] font-medium text-text-primary/85 hover:border-ink/18 hover:bg-ink/[0.06] hover:text-text-primary ${SIZE[size] || SIZE.md} ${WIDTH[width] || WIDTH.auto} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Gold fill for <a> (external) — same visual as Primary. */
export function PrimaryLink({
  children,
  href,
  size = "lg",
  width = "auto",
  className = "",
  target,
  rel,
  onClick,
  ...rest
}) {
  return (
    <a
      href={href}
      target={target}
      rel={rel}
      onClick={onClick}
      className={`${base} bg-accent text-accent-fg shadow-[0_4px_16px_rgb(var(--accent)/0.28)] hover:-translate-y-0.5 hover:bg-accent-light hover:shadow-[0_8px_22px_rgb(var(--accent)/0.34)] ${SIZE[size] || SIZE.lg} ${WIDTH[width] || WIDTH.auto} ${className}`}
      {...rest}
    >
      {children}
    </a>
  );
}

/** Ghost/border link matching Secondary. */
export function SecondaryLink({
  children,
  href,
  size = "md",
  width = "auto",
  className = "",
  target,
  rel,
  onClick,
  ...rest
}) {
  return (
    <a
      href={href}
      target={target}
      rel={rel}
      onClick={onClick}
      className={`${base} border border-ink/12 bg-ink/[0.03] font-medium text-text-primary/85 hover:border-ink/18 hover:bg-ink/[0.06] hover:text-text-primary ${SIZE[size] || SIZE.md} ${WIDTH[width] || WIDTH.auto} ${className}`}
      {...rest}
    >
      {children}
    </a>
  );
}

export function BtnArrow({ className = "h-4 w-4" }) {
  return (
    <svg
      className={`${className} transition-transform duration-200 group-hover:translate-x-0.5`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
