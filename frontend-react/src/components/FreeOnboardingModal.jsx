// FreeOnboardingModal — one-time checklist after free signup.
// Goal: turn one-shot logins into multi-session habits with real free value.
// Premium users never see this (TelegramNudge handles VIP path).

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isEntitled } from "../utils/entitlement";
import { trackFunnel } from "../utils/funnelAnalytics";

const LS_KEY = "lq_free_onboarding_v1";
const DELAY_MS = 1200;

const readDone = () => {
  try {
    return localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
};
const markDone = () => {
  try {
    localStorage.setItem(LS_KEY, "1");
  } catch {
    /* ignore */
  }
};

const STEPS = [
  {
    id: "pulse",
    title: "Market Pulse & News",
    body: "Core free features — market moves and headlines without a subscription.",
    path: "/market-pulse",
    cta: "Open Pulse",
  },
  {
    id: "performance",
    title: "Verified track record",
    body: "Win rate, top gainers, and proof charts — free after login.",
    path: "/performance",
    cta: "Open Performance",
  },
  {
    id: "watchlist",
    title: "Watchlist",
    body: "Pin pairs you care about. Free personal list — no card required.",
    path: "/watchlist",
    cta: "Open Watchlist",
  },
  {
    id: "signals",
    title: "Signals board",
    body: "Browse calls and older track-record detail. Live entry/SL/TP levels stay Premium.",
    path: "/signals",
    cta: "Open Signals",
  },
];

export default function FreeOnboardingModal() {
  const { user, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !isAuthenticated || !user) return;
    if (isEntitled(user)) return; // paid / staff → skip
    if (readDone()) return;

    const t = setTimeout(() => {
      setOpen(true);
      trackFunnel("cta_click", { source: "free_onboarding_shown", path: window.location.pathname });
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [loading, isAuthenticated, user]);

  if (!open) return null;

  const dismiss = (action = "dismiss") => {
    markDone();
    setOpen(false);
    trackFunnel("cta_click", { source: `free_onboarding_${action}`, path: "/" });
  };

  const go = (step) => {
    markDone();
    setOpen(false);
    trackFunnel("cta_click", { source: `free_onboarding_${step.id}`, path: step.path });
    navigate(step.path);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-scrim/55 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="free-onboard-title"
      onClick={() => dismiss("backdrop")}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-ink/10 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-ink/[0.06] px-5 py-4 sm:px-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            Free features · start here
          </p>
          <h2 id="free-onboard-title" className="mt-1.5 text-lg font-bold text-text-primary">
            You&apos;re in — free tools to use today
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
            No card. Pulse, News, Performance, watchlist &amp; more. Premium is for live signal
            levels, Terminal, and Agent when you want more.
          </p>
        </div>

        <ul className="max-h-[min(52vh,420px)] space-y-2 overflow-y-auto px-4 py-4 sm:px-5">
          {STEPS.map((step, i) => (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => go(step)}
                className="flex w-full items-start gap-3 rounded-xl border border-ink/[0.07] bg-surface-secondary/40 px-3.5 py-3 text-left transition-colors hover:border-accent/35 hover:bg-surface-raised"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 font-mono text-[12px] font-bold text-accent">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-text-primary">
                    {step.title}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-text-muted">
                    {step.body}
                  </span>
                  <span className="mt-1.5 inline-block text-[11px] font-semibold text-accent">
                    {step.cta} →
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/[0.06] px-5 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={() => {
              dismiss("pricing");
              navigate("/pricing");
            }}
            className="text-[12px] font-medium text-text-muted underline-offset-2 hover:text-text-primary hover:underline"
          >
            See Premium later
          </button>
          <button
            type="button"
            onClick={() => dismiss("got_it")}
            className="rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg shadow-[0_4px_14px_rgb(var(--accent)/0.28)]"
          >
            Got it — explore
          </button>
        </div>
      </div>
    </div>
  );
}
