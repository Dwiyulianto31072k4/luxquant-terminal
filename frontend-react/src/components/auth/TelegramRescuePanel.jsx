import TelegramRedirectButton from "./TelegramRedirectButton";
import { getStoredAcq } from "../../utils/acqAttribution";
import { trackFunnel } from "../../utils/funnelAnalytics";
import { buildTelegramFallbackUrl } from "../../utils/telegramCampaign";

export const TelegramMiniAppLink = ({
  label = "Open securely in Telegram",
  className = "",
  source = "login_rescue",
}) => {
  const acq = getStoredAcq();
  const href = buildTelegramFallbackUrl(acq);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        trackFunnel("auth_fallback_taken", {
          provider: "telegram",
          source,
          meta: {
            mode: "miniapp",
            campaign: acq?.campaign || null,
            content: acq?.content || null,
          },
        })
      }
      className={className}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden>
        <path d="M21.9 4.6 18.8 19c-.2 1-1 1.2-1.8.7l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-4.9 8.8-8c.4-.3-.1-.5-.6-.2L6.6 12.7 2 11.2c-1-.3-1-1 .2-1.5L20.4 2.7c.9-.3 1.7.2 1.5 1.9Z" />
      </svg>
      <span>{label}</span>
    </a>
  );
};

const TelegramRescuePanel = ({ reason = "blocked", onGoogle }) => (
  <div className="rounded-xl border border-accent/30 bg-accent/[0.06] p-3">
    <p className="text-[11.5px] leading-snug text-text-muted">
      {reason === "webview"
        ? "This Telegram browser cannot complete popup sign-in. Open the Mini App instead — Telegram signs you in automatically."
        : reason === "slow"
          ? "Telegram is taking longer than expected. Keep the popup open, or use the Mini App now without waiting."
          : "This browser blocked the Telegram popup. Continue in the Mini App without restarting your signup."}
    </p>

    <TelegramMiniAppLink
      label="Open LuxQuant in Telegram"
      source={`login_${reason}`}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#229ED9] px-3 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
    />

    {onGoogle && (
      <button
        type="button"
        onClick={onGoogle}
        className="mt-2 w-full rounded-lg border border-ink/15 bg-surface-raised px-3 py-2 text-[12px] font-semibold text-text-primary transition-colors hover:bg-ink/[0.04]"
      >
        Continue with Google instead
      </button>
    )}

    <div className="mt-3 border-t border-ink/[0.08] pt-2.5 text-center">
      <p className="mb-2 text-[10px] text-text-muted">Or stay in this browser</p>
      <TelegramRedirectButton className="flex justify-center" />
    </div>
  </div>
);

export default TelegramRescuePanel;
