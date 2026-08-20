import { lazy, Suspense } from "react";

import { telegramAdVariant } from "../../utils/miniAppStart";

const TelegramAdDestination = lazy(() => import("./TelegramAdDestination"));

function DestinationLoader() {
  return (
    <div className="min-h-screen bg-bg-primary px-5 py-8 text-text-primary">
      <div className="mx-auto max-w-6xl animate-pulse space-y-5">
        <div className="h-10 w-40 rounded-xl bg-ink/[0.06]" />
        <div className="h-56 rounded-3xl bg-ink/[0.05]" />
        <div className="h-72 rounded-3xl bg-ink/[0.04]" />
      </div>
    </div>
  );
}

/**
 * Telegram Ads moderation reviews the first screen opened by the sponsored
 * message. Keep the user on the exact /terminal deep link and render the
 * matching public experience here; do not automatically redirect to another
 * landing page.
 */
export default function TelegramAdTerminalEntry({ children }) {
  const startParam =
    typeof window !== "undefined"
      ? window.Telegram?.WebApp?.initDataUnsafe?.start_param || null
      : null;
  const variant = telegramAdVariant(startParam);

  if (!variant) return children;

  return (
    <Suspense fallback={<DestinationLoader />}>
      <TelegramAdDestination variant={variant} />
    </Suspense>
  );
}
