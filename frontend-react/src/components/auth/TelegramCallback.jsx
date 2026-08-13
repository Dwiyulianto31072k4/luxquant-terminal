// src/components/auth/TelegramCallback.jsx
//
// Landing point for Telegram's REDIRECT auth mode (data-auth-url).
//
// Why this exists: the JS widget (Telegram.Login.auth) opens a popup and waits
// for it to talk back to the opener. Inside an in-app browser that conversation
// can simply never happen — and Telegram's own iOS browser is indistinguishable
// from Safari by user-agent (Telegram-iOS issue #736, still open), so we cannot
// even detect the case in advance. Redirect mode replaces the popup with a
// top-level navigation: nothing to block, nothing to postMessage back.
//
// Telegram appends its signed fields as query params. Everything else about the
// login is identical to the popup path, so this deliberately calls the SAME
// authApi.telegramLogin the popup flow uses rather than a parallel one.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../services/authApi";
import { syncCryptobotAuth } from "../../services/autotradeApi";
import { consumePostLoginRedirect } from "../../utils/postLoginRedirect";
import { trackFunnel } from "../../utils/funnelAnalytics";
import { getStoredAcq } from "../../utils/acqAttribution";
import { getStoredRef, clearStoredRef } from "../../utils/referralStorage";
import { clearAuthRescueState, markFailedAuthProvider } from "../../utils/authRescue";

// Exactly the fields Telegram signs. Anything else we might have put on the URL
// is ours and must not reach the backend as if it were Telegram data.
const TG_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "username",
  "photo_url",
  "auth_date",
  "hash",
];

const TelegramCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const ran = useRef(false);
  const [error, setError] = useState(null);
  const [rescueNeeded, setRescueNeeded] = useState(false);

  useEffect(() => {
    // StrictMode double-invokes effects in dev; a second POST would burn the
    // one-time auth payload and fail.
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(location.search);
    const payload = {};
    for (const k of TG_FIELDS) {
      const v = params.get(k);
      if (v !== null && v !== "") payload[k] = v;
    }

    // Reaching this route at all means the redirect button was used — the
    // popup-blocked escape hatch. The button itself is a Telegram widget in an
    // iframe, so its click is unobservable from our side; arriving here is the
    // only reliable signal that anyone took the offer. Without it the recovery
    // path looked unused when it had simply never been instrumented.
    trackFunnel("auth_fallback_taken", {
      provider: "telegram",
      source: "redirect",
    });

    // Telegram sends the reader back here with an EMPTY query string when they
    // close or decline the sign-in. That is a person changing their mind, not a
    // broken link — recording it as auth_error put cancellations in the failure
    // column and made the door look more broken than it is. Partial fields are
    // a different thing and still count as an error.
    const hasAny = Array.from(params.keys()).length > 0;
    if (!payload.hash || !payload.id) {
      if (!hasAny) {
        setError("Sign-in was cancelled. You can try again below.");
        trackFunnel("auth_abandoned", {
          provider: "telegram",
          meta: { mode: "redirect", reason: "no_params" },
        });
        return;
      }
      setRescueNeeded(true);
      setError("This sign-in link is incomplete. Please start again.");
      trackFunnel("auth_error", {
        provider: "telegram",
        meta: { message: "redirect callback missing fields", mode: "redirect" },
      });
      return;
    }

    // Backend types these as int; query params arrive as strings.
    payload.id = Number(payload.id);
    payload.auth_date = Number(payload.auth_date);

    (async () => {
      try {
        const referralCode = getStoredRef();
        const acq = getStoredAcq();
        const result = await authApi.telegramLogin(payload, referralCode, acq);

        localStorage.setItem("access_token", result.access_token);
        localStorage.setItem("refresh_token", result.refresh_token);
        if (result.cryptobot_token) {
          await syncCryptobotAuth(result.cryptobot_token);
        }
        if (referralCode) clearStoredRef();
        if (acq) authApi.claimAcq(acq).catch(() => {});

        setUser(result.user);
        clearAuthRescueState();
        trackFunnel("auth_success", {
          provider: "telegram",
          meta: { mode: "redirect", is_new: !!result.is_new_user },
        });

        navigate(consumePostLoginRedirect(), { replace: true });
      } catch (err) {
        const message =
          err.response?.data?.detail || "Telegram sign-in failed. Please try again.";
        setRescueNeeded(true);
        setError(message);
        trackFunnel("auth_error", {
          provider: "telegram",
          meta: { message, mode: "redirect" },
        });
      }
    })();
  }, [location.search, navigate, setUser]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      {error ? (
        <>
          <p className="text-[14px] font-semibold text-loss">{error}</p>
          <button
            type="button"
            onClick={() => {
              if (rescueNeeded) markFailedAuthProvider("telegram");
              navigate(
                rescueNeeded ? "/login?error=telegram_redirect_failed" : "/login",
                { replace: true }
              );
            }}
            className="lq-btn-primary rounded-lg px-4 py-2 text-[13px]"
          >
            Back to sign in
          </button>
        </>
      ) : (
        <>
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink/20 border-t-accent" />
          <p className="text-[13px] text-text-muted">Signing you in with Telegram…</p>
        </>
      )}
    </div>
  );
};

export default TelegramCallback;
