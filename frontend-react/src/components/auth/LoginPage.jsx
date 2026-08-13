// src/components/auth/LoginPage.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ensureTelegram } from "../../utils/telegramLoader";
import TelegramRedirectButton from "./TelegramRedirectButton";
import { inMiniAppContext, inTelegramWebView } from "../../utils/telegramWebApp";
import LeftBrandPanel, { AssetCoins } from "./LeftBrandPanel";
import ReferralBanner from "./ReferralBanner";
import { stashPostLoginRedirect, consumePostLoginRedirect } from "../../utils/postLoginRedirect";
import { trackFunnel } from "../../utils/funnelAnalytics";
import {
  clearAuthRescueState,
  getFailedAuthProviders,
  markFailedAuthProvider,
  providerFromAuthError,
} from "../../utils/authRescue";
import { LEGAL_UPDATED, PRIVACY_SECTIONS, TERMS_SECTIONS } from "../../content/legal";

// Which door to offer next when one fails. Ordered by evidence, not by the
// layout: Telegram converts 2.2x Google so it is offered back first; Google has
// the highest measured success rate; Discord is last — 2 attempts in the entire
// record is too little to send anyone there ahead of the other two.
const FALLBACK_ORDER = ["telegram", "google", "discord"];
const PROVIDER_LABEL = { telegram: "Telegram", google: "Google", discord: "Discord" };

// The human door. Same handle the channel's "Ask the team" button uses, so a
// reader who has seen one recognises the other.
const ADMIN_URL =
  import.meta.env?.VITE_TG_URL_ADMIN || "https://t.me/luxquantadmin";

// The backend's redirect codes carry their provider as a prefix
// (google_token_failed, discord_*). Codes that apply to any door — account
// _inactive — have none, and are reported without inventing one.
const OAUTH_ERROR_PROVIDER = (code) => providerFromAuthError(code) || "(unknown)";

const LoginPage = () => {
  const { t } = useTranslation();
  const a = (key) => t(`auth.${key}`);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [legalDoc, setLegalDoc] = useState(null);
  // Which login button is "active" (white). Default = first (Telegram); follows
  // hover. Reset to null on leaving the group → falls back to the first.
  const [hoverIdx, setHoverIdx] = useState(null);
  // "More Options" — mobile bottom sheet / desktop inline expand (holds Discord).
  const [showMore, setShowMore] = useState(false);
  // Referral code (collapsible, MEXC-style).
  const [refOpen, setRefOpen] = useState(false);
  const [refCode, setRefCode] = useState("");
  // Telegram widget readiness — tombol Telegram dikunci sampai script siap,
  // supaya klik pertama tidak pernah jatuh ke error "not-ready".
  const [telegramReady, setTelegramReady] = useState(!!window.Telegram?.Login?.auth);
  // The popup never opened for this browser. We cannot know that in
  // advance — Telegram's in-app browser is indistinguishable from Safari
  // by user-agent — so we only learn it after the first attempt, and then
  // offer the flow that does not need a popup at all.
  // Doors that already failed in this tab. Persisted through refresh and OAuth
  // redirects, then cleared on success; a new browser session starts clean.
  const [failedProviders, setFailedProviders] = useState(getFailedAuthProviders);
  const failedProvidersRef = useRef(failedProviders);
  // A Telegram attempt that has gone quiet for a while but has NOT been given
  // up on. telegramLoader waits 90s before it rejects — right for the reject,
  // because a real sign-in can take that long when someone has to open Telegram,
  // confirm, and come back. Wrong for the person: in an in-app browser the popup
  // can never talk back to its opener, so those 90 seconds are spent watching a
  // spinner that will never resolve. Measured 2026-08-09: 8 of 38 Telegram
  // attempts ended with neither a success nor an error — that silence is this.
  //
  // So: offer the other door early, and do NOT cancel the attempt underneath.
  // If the popup does come back at 40s it still works; if it never does, they
  // had a way out at 18 instead of 90.
  const [telegramSlow, setTelegramSlow] = useState(false);
  const [telegramWebView, setTelegramWebView] = useState(() => inTelegramWebView());
  const [popupBlocked, setPopupBlocked] = useState(
    () => {
      try {
        return (
          sessionStorage.getItem("lq_tg_popup_blocked") === "1" ||
          inTelegramWebView()
        );
      } catch {
        return inTelegramWebView();
      }
    }
  );
  const { loginWithGoogle, loginWithTelegram, loginWithMiniApp, loginWithDiscord, error, setError, isAuthenticated } =
    useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const attemptLocks = useRef({});

  // State updates do not disable a button until React renders again. A ref lock
  // closes that small double-click window and adds a short cooldown after an
  // immediate provider rejection, preventing retry storms from one visitor.
  const lockAttempt = useCallback((provider, cooldownMs = 1800) => {
    const now = Date.now();
    if ((attemptLocks.current[provider] || 0) > now) return false;
    attemptLocks.current[provider] = now + cooldownMs;
    return true;
  }, []);

  // One place decides what comes next and persists it across OAuth redirects.
  const noteFailure = useCallback((provider, source = "login") => {
    const current = failedProvidersRef.current;
    if (current.includes(provider)) return null;
    const next = markFailedAuthProvider(provider);
    failedProvidersRef.current = next;
    setFailedProviders(next);
    const offered = FALLBACK_ORDER.find((candidate) => !next.includes(candidate)) || null;
    if (offered) {
      trackFunnel("auth_fallback_offered", {
        provider: offered,
        source,
        meta: { after: provider },
      });
    }
    return offered;
  }, []);

  // Capture ?redirect= so OAuth round-trips and Telegram still land correctly.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const redirect = params.get("redirect");
    if (redirect) stashPostLoginRedirect(redirect);
    trackFunnel("auth_page_view", {
      source: params.get("src") || "login",
      path: location.pathname + location.search,
    });

    // A failed OAuth round-trip comes back here as ?error=<code> and used to
    // vanish: the callback component only reports success, so a provider could
    // sit at zero recorded failures while people were being turned away. A
    // cancellation is the person's own choice, not a fault, so it is excluded —
    // counting it would drown the failures that matter.
    const code = params.get("error");
    if (code && !code.endsWith("_cancelled")) {
      const provider = OAUTH_ERROR_PROVIDER(code);
      trackFunnel("auth_error", {
        provider,
        source: "oauth_redirect",
        meta: { message: code },
      });
      if (provider !== "(unknown)") noteFailure(provider, "oauth_redirect");
      setError(
        `${PROVIDER_LABEL[provider] || "That provider"} sign-in did not complete. Choose another method below.`
      );
      const clean = new URLSearchParams(location.search);
      clean.delete("error");
      navigate(
        { pathname: location.pathname, search: clean.toString() ? `?${clean}` : "" },
        { replace: true }
      );
    }
  }, [location.pathname, location.search, navigate, noteFailure, setError]);

  // A refresh used to erase the visible rescue prompt even though the provider
  // failure was retained by the browser. Restore the prompt from session state.
  useEffect(() => {
    if (!isAuthenticated && failedProviders.length > 0 && !error) {
      setError("Sign-in did not complete. Choose another method below.");
    }
  }, [error, failedProviders.length, isAuthenticated, setError]);

  useEffect(() => {
    if (!isAuthenticated) return;
    clearAuthRescueState();
    const dest = consumePostLoginRedirect("/home");
    trackFunnel("post_login_land", { path: dest });
    navigate(dest, { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const onBlocked = () => setPopupBlocked(true);
    window.addEventListener("lq:tg-popup-blocked", onBlocked);
    return () => window.removeEventListener("lq:tg-popup-blocked", onBlocked);
  }, []);

  // Preload Telegram widget on mount; unlock the button once ready.
  useEffect(() => {
    let alive = true;
    ensureTelegram()
      .then(() => {
        if (alive) setTelegramReady(true);
      })
      .catch(() => {
        /* tetap terkunci; user pakai Google/Discord */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!telegramLoading) {
      setTelegramSlow(false);
      return undefined;
    }
    const t = setTimeout(() => setTelegramSlow(true), 18_000);
    return () => clearTimeout(t);
  }, [telegramLoading]);

  const handleGoogleLogin = async () => {
    if (!lockAttempt("google")) return;
    setGoogleLoading(true);
    setError(null);
    trackFunnel("auth_start", { provider: "google", source: "login" });
    try {
      await loginWithGoogle();
    } catch (err) {
      if (err.message !== "cancelled") {
        const message = err?.response?.data?.detail || err?.message || "Google sign-in failed";
        trackFunnel("auth_error", { provider: "google", meta: { message } });
        noteFailure("google");
        console.error("Google login error:", err);
      }
    } finally {
      attemptLocks.current.google = Date.now() + 1200;
      setGoogleLoading(false);
    }
  };

  const handleTelegramLogin = async () => {
    // Telegram's ordinary in-app browser exposes TelegramWebviewProxy but no
    // signed Mini App initData. It cannot use Mini App auth, and its popup is
    // unreliable. Keep the official redirect door visible instead of creating
    // an immediate, unwinnable auth error.
    if (telegramWebView || inTelegramWebView()) {
      setTelegramWebView(true);
      if (!popupBlocked) {
        trackFunnel("auth_fallback_offered", {
          provider: "telegram",
          source: "login_webview",
          meta: { reason: "telegram_webview" },
        });
      }
      setPopupBlocked(true);
      return;
    }

    if (!lockAttempt("telegram")) return;

    setTelegramLoading(true);
    setError(null);
    trackFunnel("auth_start", { provider: "telegram", source: "login" });
    try {
      // Inside Telegram, the popup flow is the one that fails. Telegram already
      // signed this person's identity — use it instead of opening a window.
      if (inMiniAppContext()) {
        const mini = await loginWithMiniApp();
        trackFunnel("auth_success", {
          provider: "telegram",
          source: "login_miniapp",
          meta: { is_new: !!mini?.is_new_user },
        });
        return;
      }
      const tg = await loginWithTelegram();
      clearAuthRescueState();
      // Navigate happens via isAuthenticated effect (consumePostLoginRedirect).
      trackFunnel("auth_success", {
        provider: "telegram",
        source: "login",
        meta: { is_new: !!tg?.is_new_user },
      });
    } catch (err) {
      if (err.message !== "cancelled") {
        const message =
          err?.response?.data?.detail || err?.reason || err?.message || "Telegram sign-in failed";
        trackFunnel("auth_error", {
          provider: "telegram",
          meta: { message, mode: inMiniAppContext() ? "miniapp_manual" : "popup" },
        });
        noteFailure("telegram");
        console.error("Telegram login error:", err);
      }
    } finally {
      attemptLocks.current.telegram = Date.now() + 1200;
      setTelegramLoading(false);
    }
  };

  const handleDiscordLogin = async () => {
    if (!lockAttempt("discord")) return;
    setDiscordLoading(true);
    setError(null);
    trackFunnel("auth_start", { provider: "discord", source: "login" });
    try {
      await loginWithDiscord();
    } catch (err) {
      const message = err?.response?.data?.detail || err?.message || "Discord sign-in failed";
      trackFunnel("auth_error", { provider: "discord", meta: { message } });
      noteFailure("discord");
      console.error("Discord login error:", err);
    } finally {
      attemptLocks.current.discord = Date.now() + 1200;
      setDiscordLoading(false);
    }
  };

  const fallbackHandlers = {
    telegram: handleTelegramLogin,
    google: handleGoogleLogin,
    discord: handleDiscordLogin,
  };
  // Nothing to offer once every door has been tried — at that point another
  // button is noise, and the contact route in the footer is the real answer.
  const fallbackOffer = failedProviders.length
    ? FALLBACK_ORDER.find((p) => !failedProviders.includes(p))
    : null;

  if (isAuthenticated) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "rgb(var(--surface))" }}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div
              className="absolute inset-0 border-2 rounded-full"
              style={{ borderColor: "rgb(var(--accent) / 0.2)" }}
            />
            <div
              className="absolute inset-0 border-2 border-transparent rounded-full animate-spin"
              style={{ borderTopColor: "rgb(var(--accent))" }}
            />
          </div>
          <p className="text-sm font-medium" style={{ color: "rgb(var(--fg-muted))" }}>
            {a("redirecting")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="lux-warm-auth min-h-screen flex flex-col lg:flex-row overflow-x-hidden">
      {/* Desktop left panel — brand hero */}
      <LeftBrandPanel />

      {/* RIGHT — seamless form column (no nested card) */}
      <div className="w-full lg:w-[45%] flex items-start justify-center lg:items-center relative flex-1 px-5 sm:px-8 py-0 lg:px-12 xl:px-16 lg:py-10">
        {/* Soft gold hairline between brand + form (desktop) */}
        <div
          className="hidden lg:block absolute left-0 top-[8%] bottom-[8%] w-px pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, transparent, rgb(var(--accent) / 0.22) 40%, rgb(var(--accent) / 0.22) 60%, transparent)",
          }}
        />

        <style>{`
 @keyframes lq-blink { 50% { opacity: 0; } }
 @keyframes lq-card-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
 @keyframes lq-item-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
 .lq-card-enter { animation: lq-card-in 0.48s cubic-bezier(0.16,1,0.3,1) both; }
 .lq-login-btn:focus-visible { outline: 2px solid rgb(var(--accent) / 0.55); outline-offset: 2px; }
 @keyframes lq-modal-fade { from { opacity: 0; } to { opacity: 1; } }
 @keyframes lq-modal-pop { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
 @keyframes lq-sheet-up { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
 .lq-terms-scroll::-webkit-scrollbar { width: 5px; }
 .lq-terms-scroll::-webkit-scrollbar-track { background: transparent; }
 .lq-terms-scroll::-webkit-scrollbar-thumb { background: rgb(var(--accent) / 0.25); border-radius: 999px; }
 @media (prefers-reduced-motion: reduce) {
 .lq-card-enter { animation: none !important; }
 }
 `}</style>

        {/* LOGO MOBILE */}
        <div className="lg:hidden absolute top-4 left-4 sm:top-8 sm:left-8 flex items-center gap-2.5 z-30">
          <img
            src="/logo.png"
            alt="LuxQuant"
            style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover" }}
          />
          <span
            className="text-text-primary font-bold tracking-wide"
            style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 17 }}
          >
            LuxQuant
          </span>
        </div>

        {/* CONTENT — flat column, same surface as the page (no double card) */}
        <div className="lq-card-enter relative z-10 w-full max-w-[400px] flex flex-col min-h-[100svh] pt-[11vh] pb-8 lg:min-h-0 lg:pt-0 lg:pb-0">
          {/* ── Desktop heading ── */}
          <div className="mb-8 hidden lg:block text-left">
            <p
              className="mb-3 font-mono uppercase tracking-[0.2em]"
              style={{ color: "rgb(var(--accent-text))", fontSize: 11 }}
            >
              Sign in
            </p>
            <h1
              className="font-bold"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                color: "rgb(var(--fg))",
                lineHeight: 1.2,
                fontSize: "clamp(22px, 2.2vw, 28px)",
              }}
            >
              {a("login_subtitle")}
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed" style={{ color: "rgb(var(--fg-muted))" }}>
              Continue with Telegram, Google, or Discord — same edge, every device.
            </p>
          </div>

          {/* ── Mobile hero — mirrors left brand panel ── */}
          <div className="lg:hidden text-center">
            <h1
              className="mx-auto font-bold"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                color: "rgb(var(--fg))",
                lineHeight: 1.12,
                fontSize: "clamp(31px, 8.6vw, 42px)",
                maxWidth: "14ch",
              }}
            >
              Detect <span style={{ color: "rgb(var(--accent-text))" }}>Crypto</span> &amp;
              Tokenized <span style={{ color: "rgb(var(--accent-text))" }}>TradFi</span> Moves
            </h1>
            <AssetCoins size={38} className="mt-8" />
          </div>

          {error && (
            <div
              className="mb-4 p-3.5 rounded-xl text-sm"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "rgb(var(--neg-text))",
              }}
            >
              <div className="flex items-center gap-3">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ flexShrink: 0 }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {error}
              </div>
              {/* The door that just failed is still on screen and looks no
                  different, so the common move is to press it again. Name the
                  next one instead. */}
              {/* One failure: name the next door. The one that just failed is
                  still on screen and looks no different, so the common move is
                  to press it again. */}
              {failedProviders.length === 1 && fallbackOffer && (
                <button
                  type="button"
                  onClick={() => {
                    trackFunnel("auth_fallback_taken", {
                      provider: fallbackOffer,
                      source: "login",
                    });
                    fallbackHandlers[fallbackOffer]?.();
                  }}
                  className="mt-3 w-full rounded-lg border border-ink/15 bg-surface-raised px-3 py-2 text-[13px] font-semibold text-text-primary transition-colors hover:bg-ink/[0.04]"
                >
                  Try {PROVIDER_LABEL[fallbackOffer]} instead
                </button>
              )}

              {/* Two failures: stop offering doors and offer a person.
                  Waiting for all THREE to fail would mean almost nobody ever
                  sees this — Discord is tried once in the entire record — so
                  the human becomes the main action here and Discord stays
                  beside it as the last self-serve option.
                  ~50% of paid subscriptions are set up by the team, so this is
                  a working path, not a consolation. */}
              {failedProviders.length >= 2 && (
                <div className="mt-3 rounded-xl border border-accent/30 bg-accent/[0.06] p-3">
                  <p className="mb-2 text-[11.5px] leading-snug text-text-muted">
                    Sign-in has failed twice. Message the team and we will get
                    you in — we can set the account up from our side.
                  </p>
                  <a
                    href={ADMIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      trackFunnel("auth_fallback_taken", {
                        provider: "team",
                        source: "login_exhausted",
                        meta: { failed: failedProviders.join(",") },
                      })
                    }
                    className="block w-full rounded-lg bg-accent px-3 py-2 text-center text-[13px] font-semibold text-accent-fg transition-opacity hover:opacity-90"
                  >
                    Message the team
                  </a>
                  {fallbackOffer && (
                    <button
                      type="button"
                      onClick={() => {
                        trackFunnel("auth_fallback_taken", {
                          provider: fallbackOffer,
                          source: "login_last_resort",
                        });
                        fallbackHandlers[fallbackOffer]?.();
                      }}
                      className="mt-2 w-full text-[11.5px] font-medium text-text-muted underline-offset-2 transition-colors hover:text-text-primary hover:underline"
                    >
                      or try {PROVIDER_LABEL[fallbackOffer]}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <ReferralBanner className="mb-4" />

          {/* ════════ DESKTOP — flat provider list ════════ */}
          <div className="hidden lg:block">
            <div className="space-y-3" onMouseLeave={() => setHoverIdx(null)}>
              {!telegramWebView && (
                <LoginButton
                  active={(hoverIdx ?? 0) === 0}
                  onHover={() => setHoverIdx(0)}
                  icon={<TelegramIcon />}
                  text={a("continue_telegram")}
                  onClick={handleTelegramLogin}
                  loading={!telegramReady || telegramLoading}
                  loadingText={!telegramReady ? a("preparing") : a("connecting")}
                />
              )}
              {popupBlocked && (
                <div className="rounded-xl border border-accent/30 bg-accent/[0.06] p-3">
                  <p className="mb-2 text-[11.5px] leading-snug text-text-muted">
                    {telegramWebView
                      ? "Continue securely with Telegram below — this browser uses the redirect flow."
                      : "This browser blocked the Telegram sign-in window. Use the button below instead — it opens Telegram directly."}
                  </p>
                  <TelegramRedirectButton className="flex justify-center" />
                </div>
              )}
              {telegramSlow && !popupBlocked && (
                <div className="rounded-xl border border-ink/12 bg-ink/[0.03] p-3">
                  <p className="mb-2 text-[11.5px] leading-snug text-text-muted">
                    Still waiting on Telegram. It may still come through — or you
                    can sign in with Google now, which does not need a pop-up.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      trackFunnel("auth_fallback_taken", {
                        provider: "google",
                        source: "login_slow",
                      });
                      handleGoogleLogin();
                    }}
                    className="w-full rounded-lg border border-ink/15 bg-surface-raised px-3 py-2 text-[13px] font-semibold text-text-primary transition-colors hover:bg-ink/[0.04]"
                  >
                    Continue with Google instead
                  </button>
                </div>
              )}
              <LoginButton
                active={(hoverIdx ?? 0) === 1}
                onHover={() => setHoverIdx(1)}
                icon={<GoogleIcon />}
                text={a("continue_google")}
                onClick={handleGoogleLogin}
                loading={googleLoading}
                loadingText={a("connecting")}
              />

              {/* More Options — ghost + expand Discord */}
              <div className="relative">
                <button
                  type="button"
                  onMouseEnter={() => setHoverIdx(2)}
                  onClick={() => setShowMore((v) => !v)}
                  className="lq-login-btn relative w-full rounded-2xl font-semibold flex items-center justify-center transition-all duration-250"
                  style={{
                    padding: "14px 22px",
                    background:
                      (hoverIdx ?? 0) === 2
                        ? "rgb(var(--ink) / 0.07)"
                        : "transparent",
                    border: "1px solid rgb(var(--ink) / 0.12)",
                    color: "rgb(var(--fg-secondary))",
                    fontSize: "clamp(13.5px, 1.7vw, 15px)",
                  }}
                >
                  <span>More options</span>
                  <svg
                    className="absolute right-5 h-4 w-4 transition-transform duration-300"
                    style={{
                      transform: showMore ? "rotate(180deg)" : "none",
                      color: "rgb(var(--fg-muted))",
                    }}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {showMore && (
                  <div
                    className="mt-2 overflow-hidden rounded-2xl"
                    style={{
                      background: "rgb(var(--ink) / 0.04)",
                      border: "1px solid rgb(var(--ink) / 0.1)",
                      animation: "lq-item-in 0.26s cubic-bezier(0.16,1,0.3,1) both",
                    }}
                  >
                    <button
                      type="button"
                      onClick={handleDiscordLogin}
                      disabled={discordLoading}
                      className="lq-login-btn relative w-full flex items-center justify-center font-semibold transition-colors disabled:opacity-50"
                      style={{
                        padding: "15px 22px",
                        color: "rgb(var(--fg))",
                        fontSize: "clamp(13.5px, 1.7vw, 15px)",
                        background: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgb(var(--ink) / 0.06)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <span
                        className="absolute left-5 flex items-center justify-center"
                        style={{ width: 22, height: 22 }}
                      >
                        <DiscordIcon />
                      </span>
                      <span>{discordLoading ? a("connecting") : a("continue_discord")}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Referral Code (Optional) */}
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setRefOpen((v) => !v)}
                className="flex items-center gap-1.5 transition-colors"
                style={{
                  color: "rgb(var(--fg-muted))",
                  fontSize: 13,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Referral code (optional)
                <svg
                  className="h-3.5 w-3.5 transition-transform duration-300"
                  style={{ transform: refOpen ? "rotate(180deg)" : "none" }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {refOpen && (
                <input
                  value={refCode}
                  onChange={(e) => setRefCode(e.target.value)}
                  placeholder="Enter invitation code (case-sensitive)"
                  className="mt-2.5 w-full rounded-xl px-4 py-3 outline-none transition-colors"
                  style={{
                    background: "rgb(var(--ink) / 0.04)",
                    border: "1px solid rgb(var(--ink) / 0.12)",
                    color: "rgb(var(--fg))",
                    fontSize: 14,
                    animation: "lq-item-in 0.25s ease both",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgb(var(--accent) / 0.45)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgb(var(--ink) / 0.12)";
                  }}
                />
              )}
            </div>

            {/* Terms only — no bogus "already have account" on login */}
            <p
              className="mt-8 text-center leading-relaxed"
              style={{ color: "rgb(var(--fg-muted))", fontSize: 12 }}
            >
              By continuing, you agree to our{" "}
              <button
                type="button"
                onClick={() => setLegalDoc("terms")}
                className="underline underline-offset-2 font-medium"
                style={{
                  color: "rgb(var(--fg-secondary))",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 12,
                }}
              >
                User Agreement
              </button>{" "}
              and{" "}
              <button
                type="button"
                onClick={() => setLegalDoc("privacy")}
                className="underline underline-offset-2 font-medium"
                style={{
                  color: "rgb(var(--fg-secondary))",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 12,
                }}
              >
                Privacy Policy
              </button>
            </p>
          </div>

          {/* ════════ MOBILE ════════ */}
          <div className="lg:hidden flex flex-1 flex-col mt-11">
            <p
              className="mx-auto mb-6 text-center"
              style={{
                color: "rgb(var(--fg-muted))",
                fontWeight: 400,
                fontSize: "clamp(12.5px, 3.4vw, 14px)",
                maxWidth: "32ch",
                lineHeight: 1.5,
              }}
            >
              {a("login_subtitle")}
            </p>

            {!telegramWebView && (
              <PillButton
                variant="primary"
                icon={<TelegramIcon />}
                text={a("continue_telegram")}
                onClick={handleTelegramLogin}
                loading={!telegramReady || telegramLoading}
                loadingText={!telegramReady ? a("preparing") : a("connecting")}
              />
            )}

            {popupBlocked && (
              <div className="rounded-xl border border-accent/30 bg-accent/[0.06] p-3">
                <p className="mb-2 text-[11.5px] leading-snug text-text-muted">
                  {telegramWebView
                    ? "Continue securely with Telegram below — this browser uses the redirect flow."
                    : "This browser blocked the Telegram sign-in window. Use the button below instead — it opens Telegram directly."}
                </p>
                <TelegramRedirectButton className="flex justify-center" />
              </div>
            )}

            {telegramSlow && !popupBlocked && (
              <div className="rounded-xl border border-ink/12 bg-ink/[0.03] p-3">
                <p className="mb-2 text-[11.5px] leading-snug text-text-muted">
                  Still waiting on Telegram. It may still come through — or you
                  can sign in with Google now, which does not need a pop-up.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    trackFunnel("auth_fallback_taken", {
                      provider: "google",
                      source: "login_slow",
                    });
                    handleGoogleLogin();
                  }}
                  className="w-full rounded-lg border border-ink/15 bg-surface-raised px-3 py-2 text-[13px] font-semibold text-text-primary transition-colors hover:bg-ink/[0.04]"
                >
                  Continue with Google instead
                </button>
              </div>
            )}

            <div className="my-4 flex items-center gap-4">
              <div className="h-px flex-1" style={{ background: "rgb(var(--ink) / 0.12)" }} />
              <span style={{ color: "rgb(var(--fg-muted))", fontSize: 13 }}>or</span>
              <div className="h-px flex-1" style={{ background: "rgb(var(--ink) / 0.12)" }} />
            </div>

            <PillButton
              variant="secondary"
              icon={<GoogleIcon />}
              text={a("continue_google")}
              onClick={handleGoogleLogin}
              loading={googleLoading}
              loadingText={a("connecting")}
            />

            <button
              type="button"
              onClick={() => setShowMore(true)}
              className="mt-5 w-full py-2.5 text-center font-semibold transition-colors"
              style={{
                color: "rgb(var(--fg-muted))",
                fontSize: 15,
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "rgb(var(--fg))";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgb(var(--fg-muted))";
              }}
            >
              More options
            </button>

            <p
              className="mt-auto pt-12 text-center leading-relaxed"
              style={{ color: "rgb(var(--fg-muted))", fontSize: 12 }}
            >
              {a("login_terms")}{" "}
              <button
                type="button"
                onClick={() => setLegalDoc("terms")}
                className="underline underline-offset-2"
                style={{
                  color: "rgb(var(--fg-secondary))",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {a("terms")}
              </button>
            </p>
          </div>
        </div>

        {legalDoc && <TermsModal kind={legalDoc} onClose={() => setLegalDoc(null)} />}

        {/* MOBILE — More options sheet */}
        {showMore && (
          <div className="fixed inset-0 z-[9998] lg:hidden" onClick={() => setShowMore(false)}>
            <div
              className="absolute inset-0"
              style={{
                background: "rgb(var(--scrim) / 0.45)",
                animation: "lq-modal-fade 0.2s ease-out",
              }}
            />
            <div
              className="absolute inset-x-0 bottom-0 rounded-t-[1.75rem] px-5 pb-9 pt-3"
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "rgb(var(--surface-secondary))",
                borderTop: "1px solid rgb(var(--ink) / 0.08)",
                boxShadow: "0 -20px 60px rgb(var(--scrim) / 0.4)",
                animation: "lq-sheet-up 0.34s cubic-bezier(0.16,1,0.3,1)",
              }}
            >
              <div
                className="mx-auto mb-5 h-1 w-10 rounded-full"
                style={{ background: "rgb(var(--ink) / 0.2)" }}
              />
              <h3
                className="mb-4 font-bold text-text-primary"
                style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18 }}
              >
                More options
              </h3>
              <PillButton
                variant="secondary"
                icon={<DiscordIcon />}
                text={a("continue_discord")}
                onClick={handleDiscordLogin}
                loading={discordLoading}
                loadingText={a("connecting")}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Pill Button (mobile) — primary = solid ink, secondary = soft surface ── */
const PillButton = ({
  icon,
  text,
  onClick,
  loading = false,
  loadingText = "Connecting...",
  variant = "secondary",
}) => {
  // Keep legacy aliases (white/dark) working if anything still passes them.
  const primary = variant === "primary" || variant === "white";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="relative w-full rounded-2xl font-semibold flex items-center justify-center transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        padding: "16px 22px",
        fontSize: "clamp(14px, 4.2vw, 16px)",
        background: primary ? "rgb(var(--fg))" : "rgb(var(--ink) / 0.06)",
        color: primary ? "rgb(var(--surface))" : "rgb(var(--fg))",
        border: primary
          ? "1px solid transparent"
          : "1px solid rgb(var(--ink) / 0.12)",
        boxShadow: primary ? "0 12px 28px rgb(var(--scrim) / 0.28)" : "none",
      }}
    >
      {loading ? (
        <span className="flex items-center gap-2.5">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          {loadingText}
        </span>
      ) : (
        <>
          <span
            className="absolute left-5 flex items-center justify-center"
            style={{ width: 22, height: 22 }}
          >
            {icon}
          </span>
          <span>{text}</span>
        </>
      )}
    </button>
  );
};

/* ── Terms / Privacy modal — copy lives in content/legal.js ── */
const TermsModal = ({ onClose, kind = "terms" }) => {
  const isPrivacy = kind === "privacy";
  const title = isPrivacy ? "Privacy Policy" : "Terms & Conditions";
  const subtitle = isPrivacy
    ? "How we collect, use, and store account data"
    : "Please read these terms carefully before using LuxQuant Terminal";
  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="lq-modal-safe lq-scrim-bg fixed inset-0 z-[99999] flex items-end justify-center sm:items-center p-0 sm:p-6"
      style={{ animation: "lq-modal-fade 0.2s ease-out" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="lux-warm-auth-sheet relative w-full max-w-2xl flex flex-col rounded-t-3xl sm:rounded-[1.75rem] overflow-hidden"
        style={{
          maxHeight: "min(var(--lq-modal-maxh), 100%)",
          border: "1px solid rgb(var(--ink) / 0.08)",
          animation: "lq-modal-pop 0.3s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-0 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-ink/25" />
        </div>

        {/* Gold hairline */}
        <div
          className="absolute top-0 left-[8%] right-[8%] h-px pointer-events-none"
          style={{
            background:
              "linear-gradient(to right, transparent, rgb(var(--accent) / 0.5), transparent)",
          }}
        />

        {/* Header */}
        <div
          className="flex items-start justify-between px-6 sm:px-9 pt-7 sm:pt-9 pb-5"
          style={{ borderBottom: "1px solid rgb(var(--ink) / 0.07)" }}
        >
          <div>
            <h2
              className="text-xl sm:text-2xl font-bold text-text-primary mb-1.5"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {title}
            </h2>
            <p className="text-sm" style={{ color: "rgb(var(--fg-muted))" }}>
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center rounded-full transition-colors duration-200 flex-shrink-0 ml-4"
            style={{
              width: 36,
              height: 36,
              color: "rgb(var(--fg-muted))",
              background: "rgb(var(--ink) / 0.04)",
              border: "1px solid rgb(var(--ink) / 0.08)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "rgb(var(--fg))";
              e.currentTarget.style.borderColor = "rgb(var(--ink) / 0.22)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgb(var(--fg-muted))";
              e.currentTarget.style.borderColor = "rgb(var(--ink) / 0.08)";
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="lq-terms-scroll overflow-y-auto px-6 sm:px-9 py-6" style={{ flex: 1 }}>
          <p
            className="mb-6 text-xs uppercase font-semibold"
            style={{ color: "rgb(var(--accent-text))", letterSpacing: "0.18em" }}
          >
            Last updated · {LEGAL_UPDATED}
          </p>
          {sections.map((s) => (
            <div key={s.title} className="mb-6">
              <h3
                className="text-sm font-semibold text-text-primary mb-2"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {s.title}
              </h3>
              <p className="text-[13px] leading-relaxed" style={{ color: "rgb(var(--fg-muted))" }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="px-6 sm:px-9 py-4 flex items-center justify-end"
          style={{
            borderTop: "1px solid rgb(var(--ink) / 0.07)",
            background: "rgb(var(--scrim) / 0.25)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-full text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
            style={{
              padding: "12px 30px",
              background: "rgb(var(--fg))",
              color: "rgb(var(--surface))",
              boxShadow: "0 10px 24px rgb(var(--scrim) / 0.35)",
            }}
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Login Button (desktop) ──
   Token-based: active = solid fg pill; idle = soft glass on the warm auth surface.
   No hardcoded MEXC light greys that clash with the dark brand panel. */
const LoginButton = ({
  icon,
  text,
  onClick,
  loading = false,
  loadingText = "Connecting...",
  active = false,
  onHover,
}) => (
  <button
    type="button"
    onClick={onClick}
    onMouseEnter={onHover}
    disabled={loading}
    className="lq-login-btn relative w-full rounded-2xl font-semibold transition-all duration-250 flex items-center justify-center active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
    style={{
      padding: "15px 22px",
      background: active ? "rgb(var(--fg))" : "rgb(var(--ink) / 0.05)",
      border: active
        ? "1px solid transparent"
        : "1px solid rgb(var(--ink) / 0.12)",
      color: active ? "rgb(var(--surface))" : "rgb(var(--fg))",
      boxShadow: active ? "0 12px 28px rgb(var(--scrim) / 0.28)" : "none",
      fontSize: "clamp(13.5px, 1.7vw, 15px)",
    }}
  >
    {loading ? (
      <span className="flex items-center gap-2.5">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        {loadingText}
      </span>
    ) : (
      <>
        <span
          className="absolute left-5 flex items-center justify-center"
          style={{ width: 22, height: 22 }}
        >
          {icon}
        </span>
        <span>{text}</span>
      </>
    )}
  </button>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const TelegramIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#29ABE2">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

const DiscordIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#5865F2">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
  </svg>
);

export default LoginPage;
