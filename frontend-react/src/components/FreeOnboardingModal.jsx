// FreeOnboardingModal — first 60s after free signup: land on real free value.
// Premium / staff skip (TelegramNudge handles VIP).

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isEntitled } from "../utils/entitlement";
import { trackFunnel } from "../utils/funnelAnalytics";

const LS_KEY = "lq_free_onboarding_v2";
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

// Order is the whole design, and it changed on evidence.
//
// This list used to open on the performance archive and put the watchlist
// third. Measured over 60 days it took 246 clicks on the top row against 18 on
// the watchlist row, so 39% of the only attention every new account ever gives
// us was being spent on reading rather than doing.
//
// Measured 2026-09-06 over 120 days and 1,002 accounts, the 11 people who ever
// added a coin averaged 8.3 logins against 1.7, returned three or more times at
// 82% against 12%, and paid at 64% against 8%. Two of 670 signups in 60 days
// did it on the day they joined. n=11 cannot prove the direction of that, and
// engaged people may simply be the ones who add coins -- but it is the only
// behaviour in the product that separates the two groups at all, and the way to
// test it is to drive the action and watch whether the retention follows.
//
// So the action goes first and the proof goes second. Two rows that earned
// almost nothing (tutorials at 3 clicks, invite at 0) make way for the two
// questions this modal never answered: what is this, and what does it cost.
const STEPS = [
  {
    id: "watchlist",
    title: "Get told when a coin is called",
    // The payoff stated plainly. "Arm the value" described the mechanism to
    // somebody who does not yet know there is one.
    body: "Pick a coin. LuxQuant messages you the moment a signal opens on it, with the entry. Free.",
    path: "/watchlist",
    cta: "Pick a coin",
  },
  {
    id: "performance",
    title: "Verify one resolved call",
    body: "Open the timestamped entry, targets, stop and final outcome.",
    path: "/performance?onboarding=proof",
    cta: "Verify proof",
  },
  {
    id: "how",
    title: "See how LuxQuant works",
    body: "The whole story: what the system does, what is free, and what VIP adds.",
    path: "/",
    cta: "Read it",
  },
  {
    id: "vip",
    // Same sentence the free channel's closing line uses, so the message a
    // reader met in the post is the one that greets them in the app.
    title: "See what VIP adds",
    body: "Free shows the call after TP2. VIP shows the entry when it is published.",
    path: "/pricing",
    cta: "See plans",
  },
  {
    id: "pulse",
    title: "Read the market",
    body: "Use Pulse, flow and research after you have verified the signal process.",
    path: "/market-pulse",
    cta: "Open Pulse",
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
      trackFunnel("cta_shown", {
        source: "free_onboarding",
        path: window.location.pathname,
      });
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [loading, isAuthenticated, user]);

  if (!open) return null;

  const dismiss = (action = "dismiss") => {
    markDone();
    setOpen(false);
    // A dismissal is not a click on a call to action.
    trackFunnel("cta_dismiss", { source: `free_onboarding_${action}`, path: "/" });
  };

  const go = (step) => {
    markDone();
    setOpen(false);
    trackFunnel("cta_click", { source: `free_onboarding_${step.id}`, path: step.path });
    navigate(step.path);
  };

  // The primary button is the first row, whatever it is. It used to be hard-wired
  // to the archive under the name `startProof`.
  const startFirst = () => go(STEPS[0]);

  return (
    <div
      className="lq-modal-safe fixed inset-0 z-[90] flex items-end justify-center bg-scrim/55 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="free-onboard-title"
      onClick={() => dismiss("backdrop")}
    >
      <div
        className="w-full max-w-md overflow-y-auto overscroll-contain rounded-[1.25rem] border border-ink/10 bg-surface shadow-2xl"
        style={{ maxHeight: "min(100%, var(--lq-modal-maxh))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <p className="text-[11px] font-medium tracking-wide text-accent">You&apos;re in · free</p>
          <h2
            id="free-onboard-title"
            className="mt-1.5 text-xl font-semibold tracking-tight text-text-primary"
          >
            Verify the process, then arm one alert
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-text-muted">
            Start with a resolved signal that cannot change after the fact. Save it, then explore
            Pulse, Terminal and research at your own pace.
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
            onClick={startFirst}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-accent text-[15px] font-semibold text-accent-fg shadow-[0_4px_16px_rgb(var(--accent)/0.28)]"
          >
            {STEPS[0].cta}
          </button>
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              // Was dismiss("pricing"), which filed everyone who tapped it under
              // cta_dismiss. 20 people did so in 60 days and every one of them
              // was counted as walking away from the product rather than
              // toward the paid tier -- the single most misleading row in the
              // conversion report.
              onClick={() => go({ id: "pricing", path: "/pricing" })}
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
