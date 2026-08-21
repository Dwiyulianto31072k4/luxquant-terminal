// Free Signals walkthrough — in the page, never an overlay.
// Floating cards fight Ask AI, chat, and the mobile tab bar.
// A slim sticky strip under the app header + quiet in-section next is enough.

import { useEffect, useMemo, useState } from "react";
import { trackFunnel } from "../utils/funnelAnalytics";

export const DESK_ID = "signals-desk";
export const RECENT_ID = "signals-recent-call";
export const FINISHED_ID = "signals-finished";

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
    short: "Recent call",
    nextLabel: "See finished calls",
    nextId: FINISHED_ID,
  };
  const finished = {
    id: FINISHED_ID,
    short: "Finished",
    nextLabel: "See VIP",
    nextId: null,
    pricing: true,
  };
  const desk = {
    id: DESK_ID,
    short: "Compass",
    nextLabel: hasRecent ? "See a recent call" : "See finished calls",
    nextId: hasRecent ? RECENT_ID : FINISHED_ID,
  };
  return hasRecent ? [desk, recent, finished] : [desk, finished];
}

function ChevronDown({ className = "h-3.5 w-3.5" }) {
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

/** Quiet in-flow next — one line, no bouncing disc. */
export function FreeScrollCue({ label, targetId, className = "" }) {
  if (!targetId) return null;
  return (
    <div className={`flex justify-center py-1 ${className}`}>
      <button
        type="button"
        onClick={() => {
          trackFunnel("cta_click", { source: "signals_free_cue", path: "/signals" });
          scrollToSignalsStop(targetId);
        }}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-text-muted transition-colors hover:bg-ink/[0.04] hover:text-text-primary"
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Compact VIP upsell — one row, no extra next-button competing with the strip. */
export function VipToolsPreview({ onUnlock }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
      style={{
        borderColor: "rgb(var(--accent) / 0.2)",
        background: "rgb(var(--accent) / 0.05)",
      }}
    >
      <div className="min-w-0">
        <p
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "rgb(var(--accent-text))" }}
        >
          Inside VIP
        </p>
        <p className="mt-0.5 text-[13px] font-semibold text-text-primary">
          Follow calls as they print — path, edge, and history on what is open now.
        </p>
      </div>
      <button
        type="button"
        onClick={onUnlock}
        className="shrink-0 self-start rounded-lg px-4 py-2 text-[12px] font-semibold transition-all hover:brightness-110 sm:self-auto"
        style={{ background: "rgb(var(--accent))", color: "rgb(var(--accent-fg))" }}
      >
        See VIP
      </button>
    </div>
  );
}

/** Slim sticky strip under the app header. Does not cover Ask AI or the tab bar. */
export function FreeDeskStrip({ hasRecent, onUpgrade }) {
  const stops = useMemo(() => buildFreeStops(hasRecent), [hasRecent]);
  const [step, setStep] = useState(0);
  const current = stops[step] || stops[0];

  useEffect(() => {
    trackFunnel("cta_shown", { source: "signals_free_guide", path: "/signals" });
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
      { root: null, rootMargin: "-20% 0px -50% 0px", threshold: [0.2, 0.45] }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [stops]);

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

  if (!current) return null;

  return (
    <div className="sticky top-14 z-20 lg:top-16">
      <div
        className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5 shadow-sm sm:gap-3 sm:px-3"
        style={{
          borderColor: "rgb(var(--accent) / 0.22)",
          background: "rgb(var(--surface-raised) / 0.94)",
          backdropFilter: "blur(12px)",
        }}
      >
        <ol className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar sm:gap-1">
          {stops.map((s, i) => {
            const on = i === step;
            return (
              <li key={s.id} className="flex shrink-0 items-center">
                {i > 0 ? (
                  <span className="px-1.5 text-[11px] text-ink/20" aria-hidden>
                    /
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => go(s.id, "signals_free_guide_dot")}
                  aria-current={on ? "step" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] transition-colors sm:px-2 ${
                    on
                      ? "font-semibold text-text-primary"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-semibold"
                    style={
                      on
                        ? {
                            background: "rgb(var(--accent))",
                            color: "rgb(var(--accent-fg))",
                          }
                        : {
                            background: "rgb(var(--ink) / 0.08)",
                            color: "rgb(var(--fg-muted))",
                          }
                    }
                  >
                    {i + 1}
                  </span>
                  <span className="hidden sm:inline">{s.short}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={() =>
            go(
              current.nextId,
              current.pricing ? "signals_free_guide_vip" : "signals_free_guide_next"
            )
          }
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold sm:px-3"
          style={{ background: "rgb(var(--accent))", color: "rgb(var(--accent-fg))" }}
        >
          <span className="max-w-[11rem] truncate sm:max-w-none">{current.nextLabel}</span>
          {current.pricing ? null : <ChevronDown />}
        </button>
      </div>
    </div>
  );
}
