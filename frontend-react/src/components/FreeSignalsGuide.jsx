// Free Signals walkthrough — in-page, not a modal.
// Scrolls the free desk: pulse → a recent VIP call → finished calls to verify.
// Sticky coach stays in sync if they scroll by hand. Dismissible per session.

import { useEffect, useMemo, useState } from "react";
import { trackFunnel } from "../utils/funnelAnalytics";

const STORAGE_KEY = "lq:signals:free-guide";
export const DESK_ID = "signals-desk";
export const RECENT_ID = "signals-recent-call";
export const FINISHED_ID = "signals-finished";

function readHidden() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHidden() {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* private mode */
  }
}

function writeShown() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function scrollToSignalsStop(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.add("lq-guide-hit");
  window.setTimeout(() => el.classList.remove("lq-guide-hit"), 1400);
  return true;
}

export function buildFreeStops(hasRecent) {
  const recent = {
    id: RECENT_ID,
    kicker: "Recent call",
    title: "A recent VIP call",
    hint: "This is a real recent call, shown the way a subscriber sees it. Tap any row to check it on a chart.",
    nextLabel: "See finished calls",
    nextId: FINISHED_ID,
  };
  const finished = {
    id: FINISHED_ID,
    kicker: "Finished tape",
    title: "Finished calls you can verify",
    hint: "These already hit their target. Open a row for the timestamped proof. Calls still running open with VIP.",
    nextLabel: "See VIP",
    nextId: null,
    pricing: true,
  };
  const desk = {
    id: DESK_ID,
    kicker: "Desk pulse",
    title: "Today's read, up top",
    hint: "BTC Compass and the desk snapshot. Live open calls stay with VIP — next is a real call you can check.",
    nextLabel: hasRecent ? "See a recent call" : "See finished calls",
    nextId: hasRecent ? RECENT_ID : FINISHED_ID,
  };
  return hasRecent ? [desk, recent, finished] : [desk, finished];
}

function ChevronDown({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronUp({ className = "h-4 w-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M18 15l-6-6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** In-flow cue between sections — big tap target on mobile, quiet on desktop. */
export function FreeScrollCue({ label, targetId, className = "" }) {
  if (!targetId) return null;
  return (
    <button
      type="button"
      onClick={() => {
        trackFunnel("cta_click", { source: "signals_free_cue", path: "/signals" });
        scrollToSignalsStop(targetId);
      }}
      className={`group flex w-full flex-col items-center gap-1 rounded-xl py-2.5 text-center transition-colors hover:bg-ink/[0.03] ${className}`}
    >
      <span className="text-[11.5px] font-medium text-text-muted group-hover:text-text-primary">
        {label}
      </span>
      <span
        className="lq-tap-cue flex h-8 w-8 items-center justify-center rounded-full border motion-reduce:animate-none"
        style={{
          borderColor: "rgb(var(--accent) / 0.4)",
          color: "rgb(var(--accent-text))",
          background: "rgb(var(--accent) / 0.1)",
        }}
      >
        <ChevronDown className="h-4 w-4" />
      </span>
    </button>
  );
}

/** One compact upsell instead of three stacked lock cards. */
export function VipToolsPreview({ onUnlock, onSeeCall }) {
  const tiles = [
    { t: "Quick path", d: "Reorder the desk around how you want to trade today." },
    { t: "Edge playbook", d: "Which setups have actually been paying, scored." },
    { t: "Learn from the past", d: "Today’s open calls, ranked against what already ran." },
  ];
  return (
    <div
      className="scroll-mt-28 overflow-hidden rounded-xl border"
      style={{
        borderColor: "rgb(var(--accent) / 0.22)",
        background: "rgb(var(--accent) / 0.05)",
      }}
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="min-w-0">
          <p
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "rgb(var(--accent-text))" }}
          >
            Inside VIP · the live desk
          </p>
          <p className="mt-1 text-[13.5px] font-semibold text-text-primary">
            Subscribers follow calls as they print — not after they finish.
          </p>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-text-muted">
            Path, edge score, and history pointed at what is open right now. The
            tape below is the finished sample — running calls stay on this desk.
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-3">
          {tiles.map((x) => (
            <li
              key={x.t}
              className="rounded-lg border border-ink/[0.07] bg-surface-raised/70 px-3 py-2.5"
            >
              <p className="text-[12px] font-semibold text-text-primary">{x.t}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-text-muted">{x.d}</p>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onUnlock}
            className="rounded-lg px-4 py-2 text-[12px] font-semibold transition-all hover:brightness-110"
            style={{ background: "rgb(var(--accent))", color: "rgb(var(--accent-fg))" }}
          >
            See VIP
          </button>
          <button
            type="button"
            onClick={onSeeCall}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/10 bg-surface-raised px-3.5 py-2 text-[12px] font-medium text-text-primary transition-colors hover:bg-ink/[0.04]"
          >
            See finished calls
            <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FreeSignalsGuide({ enabled, hasRecent, onUpgrade, restartNonce = 0 }) {
  const stops = useMemo(() => buildFreeStops(hasRecent), [hasRecent]);
  const [hidden, setHidden] = useState(readHidden);
  const [step, setStep] = useState(0);
  const current = stops[step] || stops[0];

  useEffect(() => {
    if (restartNonce > 0) {
      writeShown();
      setHidden(false);
    }
  }, [restartNonce]);

  useEffect(() => {
    if (!enabled || hidden) return undefined;
    trackFunnel("cta_shown", { source: "signals_free_guide", path: "/signals" });
    return undefined;
  }, [enabled, hidden]);

  useEffect(() => {
    if (!enabled || hidden) return undefined;
    const els = stops.map((s) => document.getElementById(s.id)).filter(Boolean);
    if (!els.length) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible?.target?.id) return;
        const i = stops.findIndex((s) => s.id === visible.target.id);
        if (i >= 0) setStep(i);
      },
      { root: null, rootMargin: "-18% 0px -42% 0px", threshold: [0.15, 0.35, 0.6] }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [enabled, hidden, stops]);

  if (!enabled || hidden || !current) return null;

  const go = (id, source) => {
    trackFunnel("cta_click", { source, path: "/signals" });
    if (!id) {
      onUpgrade?.();
      return;
    }
    const i = stops.findIndex((s) => s.id === id);
    if (i >= 0) setStep(i);
    scrollToSignalsStop(id);
  };

  const dismiss = () => {
    writeHidden();
    setHidden(true);
    trackFunnel("cta_dismiss", { source: "signals_free_guide", path: "/signals" });
  };

  const prev = step > 0 ? stops[step - 1] : null;
  const n = stops.length;

  return (
    <div className="pointer-events-none fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] left-3 right-[5.75rem] z-[60] lg:bottom-5 lg:left-4 lg:right-auto">
      <div className="pointer-events-auto w-full max-w-[26rem]">
        <div
          className="rounded-2xl border shadow-[0_12px_40px_rgb(var(--scrim)_/_0.28)]"
          style={{
            borderColor: "rgb(var(--accent) / 0.28)",
            background: "rgb(var(--surface-raised) / 0.94)",
            backdropFilter: "blur(16px)",
          }}
        >
          <div className="flex items-start gap-3 px-3.5 pb-3 pt-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em]"
                  style={{
                    background: "rgb(var(--accent) / 0.16)",
                    color: "rgb(var(--accent-text))",
                  }}
                >
                  {step + 1} / {n}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                  {current.kicker}
                </span>
              </div>
              <p className="text-[13px] font-semibold leading-snug text-text-primary">
                {current.title}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
                {current.hint}
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss walkthrough"
              className="shrink-0 rounded-md px-1.5 py-1 text-[15px] leading-none text-text-muted transition-colors hover:text-text-primary"
            >
              &times;
            </button>
          </div>

          <div className="flex items-center gap-1.5 border-t border-ink/[0.06] px-3 py-2">
            <button
              type="button"
              disabled={!prev}
              onClick={() => prev && go(prev.id, "signals_free_guide_back")}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink/10 text-text-muted transition-colors enabled:hover:bg-ink/[0.04] enabled:hover:text-text-primary disabled:opacity-30"
              aria-label="Previous section"
            >
              <ChevronUp />
            </button>
            <div className="flex flex-1 items-center justify-center gap-1.5 px-1">
              {stops.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={s.title}
                  aria-current={i === step ? "step" : undefined}
                  onClick={() => go(s.id, "signals_free_guide_dot")}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === step ? 18 : 6,
                    background:
                      i === step
                        ? "rgb(var(--accent))"
                        : "rgb(var(--ink) / 0.18)",
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                go(current.nextId, current.pricing ? "signals_free_guide_vip" : "signals_free_guide_next")
              }
              className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-all hover:brightness-110"
              style={{ background: "rgb(var(--accent))", color: "rgb(var(--accent-fg))" }}
            >
              <span className="truncate">{current.nextLabel}</span>
              {current.pricing ? null : <ChevronDown className="h-4 w-4 shrink-0" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function revealFreeGuide() {
  writeShown();
}
