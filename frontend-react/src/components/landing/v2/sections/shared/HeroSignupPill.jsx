import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ensureTelegram } from "../../../../../utils/telegramLoader";
import { useAuth } from "../../../../../context/AuthContext";
import { loginUrl, stashPostLoginRedirect, consumePostLoginRedirect } from "../../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../../utils/funnelAnalytics";
import { CTA } from "../../landingCopy";

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="#229ED9" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.56 8.23-1.86 8.78c-.14.62-.51.77-1.03.48l-2.85-2.1-1.37 1.32c-.15.15-.28.28-.58.28l.2-2.9 5.28-4.77c.23-.2-.05-.32-.36-.12l-6.52 4.11-2.81-.88c-.61-.19-.62-.61.13-.9l10.98-4.24c.51-.18.96.12.79.94z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.4c-.24 1.26-.96 2.33-2.04 3.05l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.49 0-.72-.06-1.41-.19-2.01H12z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.76 0 5.07-.91 6.76-2.47l-3.3-2.56c-.91.61-2.08.97-3.46.97-2.66 0-4.91-1.8-5.72-4.22H2.88v2.65A10.2 10.2 0 0 0 12 22z"
      />
      <path
        fill="#4285F4"
        d="M6.28 13.72A6.13 6.13 0 0 1 5.96 12c0-.6.11-1.18.32-1.72V7.63H2.88A10.2 10.2 0 0 0 1.8 12c0 1.64.39 3.19 1.08 4.37l3.4-2.65z"
      />
      <path
        fill="#FBBC05"
        d="M12 6.06c1.5 0 2.84.52 3.9 1.53l2.92-2.92C17.06 3.03 14.75 2 12 2 7.98 2 4.5 4.3 2.88 7.63l3.4 2.65C7.09 7.86 9.34 6.06 12 6.06z"
      />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="#5865F2" aria-hidden="true">
      <path d="M20.32 4.57A19.79 19.79 0 0 0 15.43 3c-.24.42-.51.99-.7 1.44a18.3 18.3 0 0 0-5.46 0A12.6 12.6 0 0 0 8.56 3 19.74 19.74 0 0 0 3.68 4.58C.58 9.2-.26 13.7.16 18.14a19.9 19.9 0 0 0 6.03 3.05c.49-.66.92-1.37 1.29-2.11-.71-.27-1.39-.6-2.03-.98.17-.13.34-.26.5-.4a14.2 14.2 0 0 0 12.1 0c.16.14.33.27.5.4-.64.38-1.32.71-2.03.98.37.74.8 1.45 1.29 2.11a19.87 19.87 0 0 0 6.03-3.05c.5-5.15-.84-9.6-3.52-13.57ZM8.02 15.41c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42 2.17 1.09 2.15 2.42c0 1.33-.95 2.42-2.15 2.42Zm7.96 0c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42 2.17 1.09 2.15 2.42c0 1.33-.95 2.42-2.15 2.42Z" />
    </svg>
  );
}

export default function HeroSignupPill({
  text = CTA.pill,
  shortText = CTA.pillShort,
  className = "",
  source = "hero_pill",
  redirect = "/home",
}) {
  const navigate = useNavigate();
  const { isAuthenticated, loginWithGoogle, loginWithTelegram, loginWithDiscord } = useAuth();

  // The Telegram widget has to be present before the first tap or the click
  // reports "still loading" — which on this page would just look broken.
  useEffect(() => {
    if (isAuthenticated) return;
    ensureTelegram().catch(() => {});
  }, [isAuthenticated]);

  // One-tap OAuth from the hero (not /login page) + funnel + post-login redirect.
  const goGoogle = () => {
    if (isAuthenticated) {
      navigate("/home");
      return;
    }
    stashPostLoginRedirect(redirect);
    trackFunnel("cta_click", { source: `${source}:google`, path: "/" });
    trackFunnel("auth_start", { provider: "google", source });
    loginWithGoogle().catch(() => navigate(loginUrl(redirect, { source: `${source}:google` })));
  };

  const goTelegram = () => {
    if (isAuthenticated) {
      navigate("/home");
      return;
    }
    stashPostLoginRedirect(redirect);
    trackFunnel("cta_click", { source: `${source}:telegram`, path: "/" });
    trackFunnel("auth_start", { provider: "telegram", source });
    loginWithTelegram()
      .then(() => {
        trackFunnel("auth_success", { provider: "telegram", source });
        const dest = consumePostLoginRedirect(redirect);
        trackFunnel("post_login_land", { path: dest, provider: "telegram" });
        navigate(dest);
      })
      .catch((err) => {
        // "cancelled" is the user closing the popup — nothing to say about it.
        if (err?.message !== "cancelled") {
          trackFunnel("auth_error", { provider: "telegram", source });
          navigate(loginUrl(redirect, { source: `${source}:telegram` }));
        }
      });
  };

  const goDiscord = () => {
    if (isAuthenticated) {
      navigate("/home");
      return;
    }
    stashPostLoginRedirect(redirect);
    trackFunnel("cta_click", { source: `${source}:discord`, path: "/" });
    trackFunnel("auth_start", { provider: "discord", source });
    loginWithDiscord().catch(() => navigate(loginUrl(redirect, { source: `${source}:discord` })));
  };

  const goPlatform = (cta = "signup") => {
    if (isAuthenticated) {
      navigate("/home");
      return;
    }
    trackFunnel("cta_click", { source: `${source}:${cta}`, path: "/" });
    navigate(loginUrl(redirect, { source: `${source}:${cta}` }));
  };

  // Signed in there is one action and nothing to choose between, so the capsule
  // — which exists to hold a choice — would be an empty frame.
  if (isAuthenticated) {
    return (
      <div className={["mx-auto flex w-full max-w-[400px] justify-center sm:max-w-[440px]", className].join(" ")}>
        <button
          type="button"
          onClick={() => navigate("/home")}
          className="inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-accent-light via-accent to-accent-dark px-8 text-[14px] font-semibold text-accent-fg shadow-[0_6px_18px_rgb(var(--accent)_/_0.3)] transition-all duration-300 hover:-translate-y-px hover:shadow-[0_10px_24px_rgb(var(--accent)_/_0.42)]"
        >
          {CTA.openApp}
        </button>
      </div>
    );
  }

  return (
    <div
      className={[
        "mx-auto flex w-full max-w-[400px] items-center gap-1.5 rounded-full border border-ink/20",
        "bg-ink/[0.96] p-1.5 shadow-[0_10px_24px_rgb(var(--scrim)_/_0.24)] backdrop-blur-md",
        "sm:max-w-[440px] sm:gap-2",
        className,
      ].join(" ")}
    >
      {/* Label still tappable → full login page with redirect preserved. */}
      <button
        type="button"
        onClick={() => goPlatform("text")}
        className="flex h-11 min-w-0 flex-1 items-center truncate rounded-full px-3.5 text-left text-[13px] font-medium text-accent-fg/80 outline-none transition-colors hover:text-accent-fg sm:px-4 sm:text-[14px]"
        title={text}
      >
        <span className="truncate sm:hidden">{shortText}</span>
        <span className="hidden truncate sm:inline">{text}</span>
      </button>

      <button
        type="button"
        onClick={goTelegram}
        aria-label="Continue with Telegram"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] transition-colors duration-200 hover:bg-ink/[0.12]"
      >
        <TelegramIcon />
      </button>

      <button
        type="button"
        onClick={goGoogle}
        aria-label="Continue with Google"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] transition-colors duration-200 hover:bg-ink/[0.12]"
      >
        <GoogleIcon />
      </button>

      <button
        type="button"
        onClick={goDiscord}
        aria-label="Continue with Discord"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] transition-colors duration-200 hover:bg-ink/[0.12]"
      >
        <DiscordIcon />
      </button>
    </div>
  );
}
