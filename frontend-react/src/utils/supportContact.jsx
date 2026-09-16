// The one place the support handle lives.
//
// It was written out by hand in ClaimPage and HelpSupportModal, and the chat
// panel was about to be a third — which is how the same link drifts apart, the
// way the vs-BTC chart kept labelling AERO with a stale mark after CoinLogo had
// been corrected. Change the handle here and every surface follows.
//
// This matters more than it looks: the admin has been typing "@luxquantadmin"
// into the in-app chat by hand to move people to Telegram. That is the journey
// this button is for.

/** Support account, without the @. */
export const TELEGRAM_ADMIN_HANDLE = "luxquantadmin";

/** Deep link. t.me opens the Telegram app when it is installed and the web
 *  client when it is not, so one href covers phone and desktop.
 *
 *  VITE_TG_URL_ADMIN wins when set — LoginPage already honoured that override
 *  and it would be wrong to quietly take it away from the one surface that had
 *  it. It is unset in both envs today, so the literal below is what ships. */
export const TELEGRAM_ADMIN_URL =
  import.meta.env?.VITE_TG_URL_ADMIN || `https://t.me/${TELEGRAM_ADMIN_HANDLE}`;

/** Telegram's mark. Single path, `currentColor`, so it inherits the button. */
export function TelegramGlyph({ className = "h-4 w-4" }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}
