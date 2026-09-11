// src/components/BillingBar.jsx
//
// The one billing fact a signed-in user needs told, in the shell rather than
// behind the bell.
//
// A1 measured why this exists: checkout_pending was read 3 times out of 324,
// and only 24% of active users ever open the notification centre at all. A
// message about money that depends on someone clicking a bell icon is a
// message that does not arrive.
//
// Rules it holds itself to, all of them learned the hard way elsewhere in this
// app:
//
//   · ONE bar. The endpoint returns at most one fact for the same reason.
//   · It can be dismissed, and the dismissal sticks per state. An invoice
//     nobody can silence is an argument with the page.
//   · No animation, no pulse. WCAG 2.2.2 and plain habituation: a thing that
//     moves forever stops being read within a day. Presence comes from
//     elevation and a single accent edge, not motion.
//   · It never renders for a signed-out visitor, and never on the landing.

import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/authApi";

const DISMISS_KEY = "lq_billing_bar_dismissed";

// Surfaces that are height-locked or deliberately chrome-free. Same list the
// footer uses, for the same reason: a bar that appears over a trade terminal
// is a bar that pushes the chart off-screen.
const HIDDEN_PREFIXES = ["/terminal", "/admin", "/payment", "/pricing", "/login", "/signup"];

function phrase(state) {
  if (state.kind === "invoice_open") {
    const h = state.hours_left ?? 0;
    const when =
      h <= 1 ? "within the hour" : h < 24 ? `in about ${Math.round(h)} hours` : `in ${Math.round(h / 24)} days`;
    const amount =
      state.amount == null ? "" : ` — ${Number(state.amount).toLocaleString()} USDT`;
    return {
      title: `Your ${state.plan || "LuxQuant"} invoice is still open${amount}`,
      body: `Nothing has been charged yet. It expires ${when}.`,
    };
  }
  if (state.kind === "expiring") {
    const d = state.days_left ?? 0;
    const when = d < 1 ? "today" : d < 2 ? "tomorrow" : `in ${Math.round(d)} days`;
    return {
      title: `Your access ends ${when}`,
      body: "Renew before then and nothing changes — same group, same terminal.",
    };
  }
  if (state.kind === "ended") {
    return {
      title: "Your subscription has ended",
      body: "Renewing adds you straight back to the VIP group and the terminal.",
    };
  }
  return null;
}

export default function BillingBar() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [state, setState] = useState(null);
  const [dismissed, setDismissed] = useState("");

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) || "");
    } catch {
      // Private windows and blocked site data throw on access. A bar that
      // cannot remember a dismissal is worse than no bar only if it also
      // crashes the shell, so this failure stays silent.
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setState(null);
      return undefined;
    }
    let alive = true;
    api
      .get("/api/v1/billing/state")
      .then((r) => alive && setState(r.data))
      .catch(() => alive && setState(null));
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  const dismiss = useCallback(() => {
    if (!state) return;
    // Keyed on the state, not a plain flag: dismissing "invoice open" must not
    // also silence "your access ended" three weeks later.
    const key = `${state.kind}:${state.expires_at || state.expired_at || Math.round(state.hours_left || 0)}`;
    setDismissed(key);
    try {
      localStorage.setItem(DISMISS_KEY, key);
    } catch {
      /* see above */
    }
  }, [state]);

  if (!isAuthenticated || !state?.kind) return null;
  if (HIDDEN_PREFIXES.some((p) => location.pathname.startsWith(p))) return null;

  const key = `${state.kind}:${state.expires_at || state.expired_at || Math.round(state.hours_left || 0)}`;
  if (dismissed === key) return null;

  const copy = phrase(state);
  if (!copy) return null;

  return (
    <div
      role="status"
      className="border-b border-accent/25 bg-surface-raised"
      data-lq-billing-bar
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <span className="h-6 w-0.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-text-primary">{copy.title}</p>
          <p className="truncate text-[12px] text-text-muted">{copy.body}</p>
        </div>
        <Link
          to={state.action?.href || "/pricing"}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-accent-fg transition hover:brightness-105"
        >
          {state.action?.label || "Renew"}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-1 shrink-0 rounded-lg p-1.5 text-text-muted transition hover:bg-ink/[0.06] hover:text-text-primary"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
