// Mobile sticky CTA — logged-out only. Hidden while soft-gate is open.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { loginUrl } from "../../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../../utils/funnelAnalytics";
import { CTA, DEST } from "../../landingCopy";
import { PrimaryButton } from "./LandingButtons";

export default function StickyLandingCta() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [softGateOpen, setSoftGateOpen] = useState(false);
  const shownTracked = useRef(false);

  useEffect(() => {
    if (isAuthenticated) return undefined;
    const onScroll = () => setVisible(window.scrollY > 420);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isAuthenticated]);

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

  // One impression per session for conversion dashboard.
  useEffect(() => {
    if (!visible || softGateOpen || isAuthenticated || shownTracked.current) return;
    shownTracked.current = true;
    // cta_shown, not cta_click: this fires when the bar becomes visible, and
    // counting it as a click made the funnel's own denominator its numerator.
    trackFunnel("cta_shown", {
      source: "sticky_mobile",
      path: "/",
    });
  }, [visible, softGateOpen, isAuthenticated]);

  if (isAuthenticated || !visible || softGateOpen) return null;

  const go = () => {
    trackFunnel("cta_click", { source: "sticky_mobile", path: "/" });
    navigate(loginUrl(DEST.record, { source: "sticky_mobile" }));
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      <div className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-ink/10 bg-surface/95 p-2.5 backdrop-blur-xl">
        <div className="min-w-0 flex-1 pl-1">
          <p className="truncate text-[13px] font-semibold text-text-primary">
            {CTA.stickyTitle}
          </p>
          <p className="truncate text-[11px] text-text-muted">{CTA.stickySub}</p>
        </div>
        <PrimaryButton size="md" onClick={go} className="shrink-0 !min-w-[6.75rem] !px-5">
          {CTA.stickyBtn}
        </PrimaryButton>
      </div>
    </div>
  );
}
