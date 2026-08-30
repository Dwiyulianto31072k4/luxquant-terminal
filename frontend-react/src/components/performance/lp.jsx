// src/components/performance/lp.jsx
// ════════════════════════════════════════════════════════════════
// The landing page's visual language, made available inside the app.
//
// The Performance pages and the landing's Track Record section show the same
// book to the same person — one before signing in, one after — and they did not
// look like the same product. The landing reads as a document: an eyebrow, a
// headline carrying the number, a sentence of plain language, then open
// surfaces. The in-app page read as a control panel: everything boxed, mono
// type at 10px, figures at 19px inside bordered tiles.
//
// What actually creates the landing's quality, in order of how much it matters:
//
//   1. HIERARCHY   one number is the headline and everything else is smaller.
//                  Eight tiles of equal weight say nothing is important.
//   2. OPEN SPACE  a border around every group is the cheapest way to look
//                  cluttered. The landing file says it outright: "single open
//                  surface … no nested boxes".
//   3. RHYTHM      generous, growing gaps (mt-14 → lg:mt-20) instead of a
//                  uniform mb-4.
//   4. MOTION      figures count up and sections settle in as they arrive —
//                  reveal early, reset late, on stripe's ease-out-quart.
//
// The motion primitives are imported from the landing rather than copied, so
// the two surfaces cannot drift apart. They are pure JS — no `.lp-v2` scoped
// CSS — so they are safe to use here (see the portal-scope trap that made a
// landing CTA invisible when its styles were assumed to travel).
// ════════════════════════════════════════════════════════════════
import { useRef } from "react";
import { CountUp, LP_EASE, prefersStill, useInView } from "../landing/v2/sections/shared/reveal";

export { CountUp, LP_EASE, useInView, prefersStill };

/**
 * Settles its children in as they arrive on screen, and again on every return.
 * `delay` staggers siblings; keep it under ~200ms or the page feels slow rather
 * than composed.
 */
export function Reveal({ children, delay = 0, y = 14, className = "" }) {
  const ref = useRef(null);
  const inView = useInView(ref);
  const still = prefersStill();
  return (
    <div
      ref={ref}
      className={className}
      style={
        still
          ? undefined
          : {
              opacity: inView ? 1 : 0,
              transform: inView ? "none" : `translateY(${y}px)`,
              transition: `opacity .6s ${LP_EASE} ${delay}ms, transform .6s ${LP_EASE} ${delay}ms`,
              willChange: "opacity, transform",
            }
      }
    >
      {children}
    </div>
  );
}

/**
 * Eyebrow → title → lede, at the landing's scale.
 *
 * The eyebrow is what lets the title drop the "Section:" prefix, and the lede
 * is where the caveat goes — on the landing every headline number is followed
 * by a sentence saying what it does and does not mean, which is the habit worth
 * importing more than any colour.
 */
export function SectionHead({ eyebrow, title, lede, right = null, className = "" }) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0 max-w-2xl">
        {eyebrow && (
          <p className="text-[11px] font-medium tracking-wide text-text-muted sm:text-[12px]">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-2 text-[22px] font-extrabold leading-[1.2] tracking-[-0.02em] text-text-primary sm:text-[26px] lg:text-[30px]">
          {title}
        </h2>
        {lede && (
          <p className="mt-2.5 text-[13px] leading-[1.6] text-text-muted sm:text-[14.5px]">
            {lede}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

/**
 * The one number a section is about. Gold gradient across the digits, the way
 * the landing sets its win rate — used once per section, never twice, because
 * the emphasis is the whole point.
 */
export function HeroFigure({ value, label, tone = "gold", sub = null, info = null }) {
  const grad =
    tone === "loss"
      ? "from-loss via-loss to-loss/70"
      : tone === "profit"
        ? "from-profit via-profit to-profit/70"
        : "from-accent via-accent-light to-accent-dark";
  return (
    <div>
      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
        {label}
        {info}
      </p>
      <p className="mt-1.5 text-[38px] font-extrabold leading-none tracking-[-0.03em] sm:text-[46px]">
        <span className={`bg-gradient-to-br ${grad} bg-clip-text text-transparent`}>
          <CountUp text={value} easing="smooth" />
        </span>
      </p>
      {sub && <p className="mt-2 max-w-[34ch] text-[12px] leading-[1.55] text-text-muted">{sub}</p>}
    </div>
  );
}

/**
 * A supporting figure. No border and no fill — separation comes from space, and
 * from the label sitting in a quieter register than the value.
 *
 * `info` takes the InfoTip that used to ride on the bordered tile. Hierarchy
 * must not cost the definitions: a figure nobody can define is a figure nobody
 * can trust, and this is the page whose whole job is proof.
 */
export function Stat({ label, value, sub, tone = "default", animate = true, info = null }) {
  const toneCls =
    tone === "profit"
      ? "text-profit"
      : tone === "loss"
        ? "text-loss"
        : tone === "gold"
          ? "text-accent-text"
          : "text-text-primary";
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-text-muted">
        {label}
        {info}
      </p>
      <p className={`mt-1.5 text-[22px] font-bold leading-none tracking-[-0.02em] tabular-nums ${toneCls}`}>
        {animate ? <CountUp text={String(value)} /> : value}
      </p>
      {sub && <p className="mt-1.5 text-[11px] leading-[1.5] text-text-muted">{sub}</p>}
    </div>
  );
}

/**
 * Recharts `<defs>` for a gold area fill that fades out downward — the same
 * construction the landing uses so the two pages' charts read as one family.
 */
export function GoldAreaDefs({ id = "lpGold", color = "rgb(var(--accent))" }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={0.32} />
        <stop offset="55%" stopColor={color} stopOpacity={0.1} />
        <stop offset="100%" stopColor={color} stopOpacity={0} />
      </linearGradient>
      <linearGradient id={`${id}Line`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="rgb(var(--accent-light))" />
        <stop offset="100%" stopColor={color} />
      </linearGradient>
    </defs>
  );
}

/** Hairline used between open sections instead of wrapping each one in a box. */
export function Rule({ className = "" }) {
  return <div className={`h-px w-full bg-ink/[0.07] ${className}`} />;
}

/* ── weight ───────────────────────────────────────────────────────
   The first pass added air and the page still read as faint. Air was
   only half the problem: borders at 0.07 alpha, 4px bars, 10px mono
   labels and `font-light` on the headline numbers meant nothing had
   any presence to space out. These primitives carry the missing half.
   ───────────────────────────────────────────────────────────────── */

/** A card that is actually visible. Border at 0.10 rather than 0.07 — still
 *  quiet, but present on a light background where 0.07 disappears entirely. */
export function Panel({ children, className = "", pad = "p-5 sm:p-6" }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-ink/[0.10] bg-surface-raised ${pad} ${className}`}
    >
      {children}
    </div>
  );
}

/** Icon + title + subtitle. Title at 15px semibold, not 14px normal: a heading
 *  that weighs the same as its body text is not a heading. Subtitle drops the
 *  10px uppercase mono, which is a label style being used as prose. */
export function PanelHead({ icon = null, title, sub = null, right = null }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {icon}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-tight tracking-tight text-text-primary">
            {title}
          </h3>
          {sub && <p className="mt-1 text-[12px] leading-snug text-text-muted">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/**
 * One distribution row, at the landing's weight: a colour dot, a 13px semibold
 * label, a rounded 8px track, and the figures in readable type. The in-app
 * version of this was a 10px mono label over a 4px bar, which is why the whole
 * page looked washed out no matter how much space it was given.
 */
export function BarRow({ label, color, pct, value, right, muted = false, last = false }) {
  return (
    <div
      className={`flex items-center gap-3 py-3 ${last ? "" : "border-b border-ink/[0.07]"}`}
    >
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: color }} />
      <span
        className="w-12 flex-shrink-0 text-[13px] font-semibold tabular-nums"
        style={{ color: muted ? "rgb(var(--neg))" : "rgb(var(--fg))" }}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="h-2 overflow-hidden rounded-full bg-ink/[0.07]">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${Math.max(pct, 1.5)}%`, background: color }}
          />
        </div>
      </div>
      <div className="flex flex-shrink-0 items-baseline justify-end gap-2 tabular-nums">
        <span className="text-[13px] font-semibold text-text-primary">{value}</span>
        {right && <span className="w-[46px] text-right text-[12px] text-text-muted">{right}</span>}
      </div>
    </div>
  );
}
