// Mobile sticky CTA — logged-out visitors only.
// Hidden while soft-gate sheet is open so the two never stack.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { loginUrl } from "../../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../../utils/funnelAnalytics";
import { CTA } from "../../landingCopy";

const GOLD_BTN = {
  background:
    "linear-gradient(135deg, rgb(var(--accent)) 0%, rgb(var(--accent)) 50%, rgb(var(--accent)) 100%)",
  color: "rgb(var(--accent-fg))",
};

export default function StickyLandingCta() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [softGateOpen, setSoftGateOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated) return undefined;
    const onScroll = () => setVisible(window.scrollY > 420);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isAuthenticated]);

  // Soft-gate sheet and sticky CTA are mutually exclusive.
  useEffect(() => {
    const onOpen = () => setSoftGateOpen(true);
    const onClose = () => setSoftGateOpen(false);
    window.addEventListener("lq-soft-gate-open", onOpen);
    window.addEventListener("lq-soft-gate-close", onClose);
    return () => {
      window.removeEventListener("lq-soft-gate-open", onOpen);
      window.removeEventListener("lq-soft-gate-close", onClose);
    };
  }, []);

  if (isAuthenticated || !visible || softGateOpen) return null;

  const go = () => {
    trackFunnel("cta_click", { source: "sticky_mobile", path: "/" });
    navigate(loginUrl("/home", { source: "sticky_mobile" }));
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      <div className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-ink/10 bg-surface/95 p-2.5 shadow-[0_-8px_32px_rgb(var(--scrim)/0.35)] backdrop-blur-xl">
        <div className="min-w-0 flex-1 pl-1.5">
          <p className="truncate text-[13px] font-semibold text-text-primary">
            {CTA.stickyTitle}
          </p>
          <p className="truncate text-[11px] text-text-muted">{CTA.stickySub}</p>
        </div>
        <button
          type="button"
          onClick={go}
          className="shrink-0 rounded-full px-4 py-2.5 text-[13px] font-semibold shadow-[0_4px_14px_rgb(var(--accent)/0.28)]"
          style={GOLD_BTN}
        >
          {CTA.stickyBtn}
        </button>
      </div>
    </div>
  );
}
