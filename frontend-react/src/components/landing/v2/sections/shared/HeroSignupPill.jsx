import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ensureTelegram } from "../../../../../utils/telegramLoader";
import { useAuth } from "../../../../../context/AuthContext";
import { loginUrl, stashPostLoginRedirect, consumePostLoginRedirect } from "../../../../../utils/postLoginRedirect";
import { trackFunnel } from "../../../../../utils/funnelAnalytics";
import {
  clearAuthRescueState,
  markFailedAuthProvider,
} from "../../../../../utils/authRescue";
import { CTA, DEST } from "../../landingCopy";
import { PrimaryButton } from "./LandingButtons";

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

// One impression per source per page load. The hero slider gives its slide
// wrapper a changing `key`, so every 11-second auto-rotate unmounts and
// remounts this pill — a component-level ref reset with it and fired a fresh
// impression each time. An idle desktop tab was reporting a new "seen" every
// 11s, which would have made "did they see a CTA?" answer yes for everyone.
const seenSources = new Set();

export default function HeroSignupPill({
  text = CTA.pill,
  shortText = CTA.pillShort,
  className = "",
  source = "hero_pill",
  redirect = DEST.record,
}) {
  const navigate = useNavigate();
  const { isAuthenticated, loginWithGoogle, loginWithTelegram, loginWithDiscord } = useAuth();
  const rootRef = useRef(null);

  // The Telegram widget has to be present before the first tap or the click
  // reports "still loading" — which on this page would just look broken.
  useEffect(() => {
    if (isAuthenticated) return;
    ensureTelegram().catch(() => {});
  }, [isAuthenticated]);

  // This is the biggest CTA on the site — 39% of every landing click comes from
  // this pill — and until recently only the mobile sticky bar reported being
  // seen, so desktop had no impression signal at all.
  //
  // It is what turns "81% of landing sessions click nothing" from a number
  // into a diagnosis: seen-and-ignored is a copy problem, never-seen is a
  // layout problem, and the two have opposite fixes. Which is exactly why it
  // fires on VISIBILITY, not on mount: one of these pills lives inside the
  // Terminal section's "More" panel, which is mounted at opacity 0 from first
  // paint. On mount it reported an impression for a button nobody could see,
  // and "never saw it" is the answer the layout fix depends on.
  useEffect(() => {
    if (isAuthenticated || seenSources.has(source)) return undefined;
    const el = rootRef.current;

    const fire = () => {
      if (seenSources.has(source)) return;
      seenSources.add(source);
      trackFunnel("cta_shown", { source, path: "/" });
    };

    if (!el || typeof IntersectionObserver === "undefined") {
      fire();
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // Half of the pill in view — the same bar the sticky bar's scroll
        // threshold approximates, so the two sources stay comparable.
        if (entries.some((e) => e.isIntersecting)) {
          fire();
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isAuthenticated, source]);

  // One-tap OAuth from the hero (not /login page) + funnel + post-login redirect.
  const goGoogle = () => {
    if (isAuthenticated) {
      navigate("/home");
      return;
    }
    stashPostLoginRedirect(redirect);
    trackFunnel("cta_click", { source: `${source}:google`, path: "/" });
    trackFunnel("auth_start", { provider: "google", source });
    loginWithGoogle().catch((err) => {
      markFailedAuthProvider("google");
      trackFunnel("auth_error", {
        provider: "google",
        source,
        meta: { message: err?.response?.data?.detail || err?.message || "Google sign-in failed" },
      });
      navigate(loginUrl(redirect, { source: `${source}:google` }));
    });
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
      .then((result) => {
        clearAuthRescueState();
        trackFunnel("auth_success", {
          provider: "telegram",
          source,
          meta: { is_new: !!result?.is_new_user },
        });
        const dest = consumePostLoginRedirect(redirect);
        trackFunnel("post_login_land", { path: dest, provider: "telegram" });
        navigate(dest);
      })
      .catch((err) => {
        // "cancelled" is the user closing the popup — nothing to say about it.
        if (err?.message !== "cancelled") {
          markFailedAuthProvider("telegram");
          trackFunnel("auth_error", {
            provider: "telegram",
            source,
            meta: {
              message:
                err?.response?.data?.detail ||
                err?.reason ||
                err?.message ||
                "Telegram sign-in failed",
            },
          });
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
    loginWithDiscord().catch((err) => {
      markFailedAuthProvider("discord");
      trackFunnel("auth_error", {
        provider: "discord",
        source,
        meta: { message: err?.response?.data?.detail || err?.message || "Discord sign-in failed" },
      });
      navigate(loginUrl(redirect, { source: `${source}:discord` }));
    });
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
      <div
        className={["mx-auto flex w-full max-w-[400px] justify-center sm:max-w-[440px]", className].join(
          " "
        )}
      >
        <PrimaryButton size="lg" onClick={() => navigate("/home")}>
          {CTA.openApp}
        </PrimaryButton>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={[
        "mx-auto flex w-full max-w-[400px] items-center gap-1.5 rounded-full border border-ink/20",
        "bg-ink/[0.96] p-1.5 backdrop-blur-md",
        "sm:max-w-[440px] sm:gap-2",
        className,
      ].join(" ")}
    >
      {/* Label still tappable → full login page with redirect preserved. */}
      <button
        type="button"
        onClick={() => goPlatform("text")}
        className="flex h-11 min-w-0 flex-1 items-center truncate rounded-full px-3.5 text-left text-[14px] font-semibold text-accent-fg/80 outline-none transition-colors hover:text-accent-fg sm:px-4"
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
