// FreeOnboardingModal — first 60s after free signup: land on real free value.
// Premium / staff skip (TelegramNudge handles VIP).

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isEntitled } from "../utils/entitlement";
import { trackFunnel } from "../utils/funnelAnalytics";

const LS_KEY = "lq_free_onboarding_v1";
const DELAY_MS = 900;

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
    title: "Market Pulse",
    body: "Live market temperature — free, no card.",
    path: "/market-pulse",
    cta: "Open Pulse",
  },
  {
    id: "performance",
    title: "Track record",
    body: "Win rate & proof charts you can audit.",
    path: "/performance",
    cta: "Open Performance",
  },
  {
    id: "watchlist",
    title: "Watchlist",
    body: "Pin pairs you care about — personal & free.",
    path: "/watchlist",
    cta: "Open Watchlist",
  },
];

export default function FreeOnboardingModal() {
  const { user, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !isAuthenticated || !user) return;
    if (isEntitled(user)) return;
    if (readDone()) return;

    const t = setTimeout(() => {
      setOpen(true);
      trackFunnel("cta_click", {
        source: "free_onboarding_shown",
        path: window.location.pathname,
        meta: { impression: true },
      });
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

  const startPulse = () => go(STEPS[0]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-scrim/55 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="free-onboard-title"
      onClick={() => dismiss("backdrop")}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-[1.25rem] border border-ink/10 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <p className="text-[11px] font-medium tracking-wide text-accent">You&apos;re in · free</p>
          <h2
            id="free-onboard-title"
            className="mt-1.5 text-xl font-semibold tracking-tight text-text-primary"
          >
            Start with free tools today
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-text-muted">
            No card. Pulse, track record, watchlist &amp; more. Live signal levels stay Premium.
          </p>
        </div>

        <ul className="mt-4 space-y-1.5 px-4 sm:px-5">
          {STEPS.map((step, i) => (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => go(step)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-ink/[0.04]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.05] text-[12px] font-semibold tabular-nums text-accent">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-text-primary">
                    {step.title}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-text-muted">{step.body}</span>
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-accent">{step.cta} →</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-col gap-2 border-t border-ink/[0.06] px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={startPulse}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-accent text-[15px] font-semibold text-accent-fg shadow-[0_4px_16px_rgb(var(--accent)/0.28)]"
          >
            Open Market Pulse
          </button>
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => {
                dismiss("pricing");
                navigate("/pricing");
              }}
              className="text-[12px] font-medium text-text-muted underline-offset-2 hover:text-text-primary hover:underline"
            >
              Premium later
            </button>
            <button
              type="button"
              onClick={() => dismiss("got_it")}
              className="text-[12px] font-medium text-text-muted hover:text-text-primary"
            >
              Explore myself
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
