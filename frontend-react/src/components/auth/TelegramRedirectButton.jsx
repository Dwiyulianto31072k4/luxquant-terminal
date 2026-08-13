// src/components/auth/TelegramRedirectButton.jsx
//
// Telegram's OFFICIAL login widget in redirect mode (data-auth-url).
//
// This is deliberately Telegram's own iframe button rather than our styled one.
// The redirect flow is a documented widget feature; driving it ourselves would
// mean hand-building an oauth.telegram.org URL that Telegram does not document
// and could change without notice. On the one screen where sign-in is already
// failing, "official and stable" beats "matches our design system".
//
// Rendered only as a fallback — see LoginPage. The popup path stays primary
// because it is one tap; this one costs a full page navigation.
import { useEffect, useRef } from "react";

const BOT_USERNAME =
  import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "LuxQuantTerminalBot";

const TelegramRedirectButton = ({ className = "" }) => {
  const holder = useRef(null);

  useEffect(() => {
    const el = holder.current;
    if (!el || el.querySelector("script")) return;

    const s = document.createElement("script");
    s.async = true;
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.setAttribute("data-telegram-login", BOT_USERNAME);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "8");
    s.setAttribute("data-request-access", "write");
    // Absolute URL: Telegram redirects the top-level window here and appends
    // the signed fields as query params.
    s.setAttribute(
      "data-auth-url",
      `${window.location.origin}/auth/telegram/callback`
    );
    el.appendChild(s);
  }, []);

  return <div ref={holder} className={className} />;
};

export default TelegramRedirectButton;
