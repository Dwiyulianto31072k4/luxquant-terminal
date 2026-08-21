// Honours the destination a Mini App button promised.
//
// Renders nothing. Runs once per Mini App session, as early as the router
// allows, and only when start_param actually claims a page — so a plain
// launch (no startapp) is left exactly where the bot put it.

import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { isMiniApp } from "../utils/telegramWebApp";
import { startDestination, parseStartParam } from "../utils/miniAppStart";
import { trackFunnel } from "../utils/funnelAnalytics";
import { referralCodeFromStartParam } from "../utils/telegramCampaign";
import { saveRef } from "../utils/referralStorage";

const ONCE_KEY = "lq_miniapp_start_routed";

const MiniAppStartRoute = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isMiniApp()) return;

    // Once per tab. Without this the effect would fight the person every time
    // they navigated back to the launch route, which reads as a broken app.
    try {
      if (sessionStorage.getItem(ONCE_KEY)) return;
    } catch {
      /* private mode — fall through and just do it once per mount */
    }

    const startParam =
      window.Telegram?.WebApp?.initDataUnsafe?.start_param || null;

    const refCode = referralCodeFromStartParam(startParam);
    if (refCode) saveRef(refCode);

    // Report the arrival, the same way a web arrival reports itself.
    //
    // acqAttribution only reads URL query parameters, and a Mini App carries
    // its tag in start_param instead — so until now a Mini App tap recorded
    // NOTHING unless it also created an account. That blinded every button
    // aimed at people who already have one: apply_acq_to_user writes acq_*
    // only on first touch, so an existing user clicking through leaves no
    // trace at all. This event is the only place that click can exist.
    const parsed = parseStartParam(startParam);
    if (parsed) {
      trackFunnel("acq_land", {
        source: "telegram",
        path: window.location.pathname || "/",
        meta: {
          medium: parsed.medium || "miniapp",
          campaign: parsed.campaign,
          content: parsed.content,
        },
      });
    }

    // Mark done BEFORE the destination check. The flag used to be set only
    // when a destination was found, so a start_param whose key we do not know
    // left the guard unset and re-fired the arrival event on every mount.
    try {
      sessionStorage.setItem(ONCE_KEY, "1");
    } catch {
      /* ignore */
    }

    const dest = startDestination(startParam);
    if (!dest) return;

    // Already there (the bot may point at it directly) — nothing to do.
    if (location.pathname === dest) return;

    // replace, not push: the launch route is not somewhere the reader chose to
    // be, so it has no business in their back history.
    navigate(dest, { replace: true });
    // location is read once at mount on purpose; re-running on every navigation
    // is exactly what the once-guard exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

export default MiniAppStartRoute;
