// Unified landing CTA system — one scale, one hierarchy.
// Primary: gold fill · Secondary: soft/ghost · Chip: filters/tabs (use local).
//
// Heights (touch-safe):
//   md → h-11 (44px)  header / sticky / secondary
//   lg → h-12 (48px)  section CTAs
// Width:
//   auto | full | fullMobile (full max-w-md on phone, auto on sm+)

// Three steps, one step apart, no responsive size jumps. `md` used to be
// 13px growing to 14px at sm — a 1px change nobody can perceive, which is a
// rule that costs a breakpoint and buys nothing. Anything that needs a
// different size than these three is a straggler that should be moved onto the
// scale, not a fourth size.
// Measured off ternakklip.com, not estimated: section CTAs run 48-56px tall
// with 32px of horizontal padding, label weight 700, radius 16 on the big ones
// and 14 on the smaller pair. Sizes there are 14-16px — deliberately smaller
// than you would expect for a 52px button, which is what makes them read as
// solid blocks rather than as text with a box around it.
// Measured off konten.com, not scaled from what was here: their CTAs run
// h43 · 16px · padX 20 · radius 8, and every size below is that or a step down
// from it. The previous scale was 9px taller and 12px wider in padding, which
// is what made the buttons read as chunky next to theirs.
const SIZE = {
  sm: "h-9 px-4 text-[14px] rounded-[8px]",
  md: "h-10 px-5 text-[15px] rounded-[8px]",
  lg: "h-[43px] px-5 text-[16px] rounded-[8px]",
};

const WIDTH = {
  auto: "w-auto",
  full: "w-full",
  // Centered on mobile so it never hugs the left edge in open layouts.
  fullMobile: "mx-auto w-full max-w-sm sm:mx-0 sm:w-auto sm:max-w-none",
};

// `whitespace-nowrap`: these are flex children with the default shrink of 1, so
// a row that runs out of room squeezes the button until its label breaks in the
// middle — "Open / Terminal", "Join free / channel". A CTA that has folded in
// half reads as broken layout, and it happens to whichever label is longest, so
// it moves around as copy changes. Rows that cannot fit should wrap the buttons
// (see `flex-wrap` on the containers), never the words inside them.
// Surface finish, measured off konten.com. What makes those buttons read as a
// physical, lit object rather than a coloured rectangle is not the colour:
//
//   background: radial-gradient(63% 56% at 22% -11%, <light>, <base>)
//   box-shadow: inset 0 4px 8px rgba(255,255,255,.15),
//               inset 0 -4px 6px rgba(0,0,0,.16)
//
// The light source sits OUTSIDE the button — 11% above its top edge — so the
// face is brightest along the top and falls away downward. The two insets then
// do what a bevel does: a highlight where light lands, a shade where it does
// not. Every shadow on that page is `inset`; nothing is elevated off the page.
//
// Kept from the earlier ternakklip pass: the type scale and weight 700. Their
// buttons run 400–500, which would undo typography already settled on.
//
// Form language, measured off the reference (ternakklip.com) rather than eyeballed:
//   · radius 14–16px on section CTAs, pill reserved for small nav chips.
//     There, 16px is used 201 times and the pill only 8; here it was the exact
//     inverse — the pill was the page's dominant shape, used 50 times.
//   · label weight was set to 700 from that reference; konten.com runs 400–500
//     and the owner chose to match konten, so `base` now carries font-medium.
//   · no drop shadow at all. Across that entire page there are three real
//     shadows, and all three are coloured accents, never depth.
// The palette stays LuxQuant's — this borrows the geometry, not the skin.
const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

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
      className={`${base} lq-btn-primary text-accent-fg ${SIZE[size] || SIZE.lg} ${WIDTH[width] || WIDTH.auto} ${className}`}
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
      className={`${base} lq-btn-secondary text-text-primary/85 hover:text-text-primary ${SIZE[size] || SIZE.md} ${WIDTH[width] || WIDTH.auto} ${className}`}
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
      className={`${base} lq-btn-primary text-accent-fg ${SIZE[size] || SIZE.lg} ${WIDTH[width] || WIDTH.auto} ${className}`}
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
      className={`${base} lq-btn-secondary text-text-primary/85 hover:text-text-primary ${SIZE[size] || SIZE.md} ${WIDTH[width] || WIDTH.auto} ${className}`}
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
