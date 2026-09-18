// frontend-react/src/components/auth/ReferralBanner.jsx
import { useEffect, useState } from "react";
import { getStoredRefValidated, saveRefFromURL } from "../../utils/referralStorage";

/**
 * Banner yang muncul kalau user mendarat dengan ?ref=XYZ valid.
 *
 * Usage:
 * <ReferralBanner /> // auto-detect dari localStorage
 *
 * Atau dengan custom styling:
 * <ReferralBanner className="my-4" />
 *
 * Banner cuma render kalau ref valid. Otherwise return null.
 */
// A floating banner that covers the page while it scrolls must be closable,
// and must stay closed for the visit once the reader has seen it.
const DISMISS_KEY = "lq-ref-banner-dismissed";
const readDismissed = () => {
  try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
};

export default function ReferralBanner({ className = "", floating = false }) {
  const [refData, setRefData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(() => floating && readDismissed());

  useEffect(() => {
    let cancelled = false;
    // React runs this child effect before the landing page's own effect, which
    // is where ?ref= used to be saved — so a first visit from an invite link
    // read an empty store and never showed the banner. Capture it here first;
    // saving the same code twice is harmless.
    saveRefFromURL();
    (async () => {
      const result = await getStoredRefValidated();
      if (!cancelled) {
        setRefData(result);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !refData || !refData.valid || dismissed) return null;

  const username = refData.referrer_username || "a friend";
  const discount = refData.discount_pct || 10;

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
  };

  // Over the landing's hero video a translucent tint borrows the colour of
  // whatever frame is behind it — on the golden shots the text disappeared.
  // Floating, it gets its own near-opaque dark surface, blurred, with the gold
  // kept to the border so the text sits on a known background.
  const surface = floating
    ? {
        background: "rgb(var(--surface-raised) / 0.94)",
        borderColor: "rgb(var(--accent) / 0.5)",
        boxShadow: "0 12px 32px rgb(0 0 0 / 0.45)",
        backdropFilter: "blur(14px) saturate(140%)",
        WebkitBackdropFilter: "blur(14px) saturate(140%)",
      }
    : {
        background:
          "linear-gradient(135deg, rgb(var(--accent) / 0.12) 0%, rgb(var(--accent) / 0.04) 100%)",
        borderColor: "rgb(var(--accent) / 0.3)",
      };

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${className}`}
      style={surface}
      role="status"
      aria-live="polite"
    >
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base"
        style={{ background: "rgb(var(--accent) / 0.2)" }}
      >
        🎉
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: "rgb(var(--accent-text))" }}>
          Invited by @{username}
        </p>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: floating ? "rgb(var(--fg))" : "rgb(var(--fg-secondary))" }}>
          Join free and verify the public record. You also get {discount}% off if you later subscribe.
        </p>
      </div>
      {floating ? (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close invitation banner"
          className="flex-shrink-0 -mr-1 -mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
          style={{ color: "rgb(var(--fg-secondary))" }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
