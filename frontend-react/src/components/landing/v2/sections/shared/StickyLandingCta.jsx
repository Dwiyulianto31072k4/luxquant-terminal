// Mobile sticky CTA — logged-out visitors only.
// Value-first copy (not "Login"); tracks funnel.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { loginUrl } from "../../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../../utils/funnelAnalytics";

const GOLD_BTN = {
  background:
    "linear-gradient(135deg, rgb(var(--accent)) 0%, rgb(var(--accent)) 50%, rgb(var(--accent)) 100%)",
  color: "rgb(var(--accent-fg))",
};

export default function StickyLandingCta() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isAuthenticated) return undefined;
    const onScroll = () => setVisible(window.scrollY > 420);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isAuthenticated]);

  if (isAuthenticated || !visible) return null;

  const go = () => {
    trackFunnel("cta_click", { source: "sticky_mobile", path: "/" });
    navigate(loginUrl("/home", { source: "sticky_mobile" }));
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      <div className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-ink/10 bg-surface/95 p-2.5 shadow-[0_-8px_32px_rgb(var(--scrim)/0.35)] backdrop-blur-xl">
        <div className="min-w-0 flex-1 pl-1.5">
          <p className="truncate text-[13px] font-semibold text-text-primary">
            Free features · no card
          </p>
          <p className="truncate text-[11px] text-text-muted">Pulse, track record &amp; more · 30s</p>
        </div>
        <button
          type="button"
          onClick={go}
          className="shrink-0 rounded-full px-4 py-2.5 text-[13px] font-semibold shadow-[0_4px_14px_rgb(var(--accent)/0.28)]"
          style={GOLD_BTN}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
