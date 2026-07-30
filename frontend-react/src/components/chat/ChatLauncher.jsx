import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { chatApi } from "../../services/chatApi";

// The panel pulls in the thread hook and transport; nobody who never opens
// chat should pay for that in the initial bundle.
const ChatPanel = lazy(() => import("./ChatPanel"));

/**
 * Floating support-chat launcher. Mounted once, globally, for logged-in users.
 *
 * Sits above the "Ask AI" bubble (AssistantWidget), which 22 pages render at
 * bottom-right — the two must not overlap.
 */
const UNREAD_POLL_MS = 45000;

export default function ChatLauncher() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const fetchUnread = useCallback(() => {
    if (!isAuthenticated) return;
    chatApi
      .getUnreadCount()
      .then((d) => setUnread(d?.unread || 0))
      .catch(() => {
        // Silent: the dot is a nicety, not worth a console error per tick.
      });
  }, [isAuthenticated]);

  // Poll for the dot only while the panel is closed — once it's open the
  // thread's own transport is already fetching, and everything is read anyway.
  useEffect(() => {
    if (!isAuthenticated || open) return undefined;
    fetchUnread();
    const id = setInterval(fetchUnread, UNREAD_POLL_MS);
    const onFocus = () => fetchUnread();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [isAuthenticated, open, fetchUnread]);

  if (!isAuthenticated) return null;

  const close = () => {
    setOpen(false);
    setUnread(0);
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-[152px] right-4 z-[9997] flex h-12 w-12 items-center justify-center rounded-full border border-ink/10 bg-surface-raised text-text-primary shadow-[0_6px_24px_rgb(var(--scrim)_/_0.28)] transition-all hover:scale-105 hover:text-accent sm:bottom-[76px] sm:right-5"
          aria-label={t("chat.open") || "Chat with us"}
          title={t("chat.open") || "Chat with us"}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
          </svg>
          {unread > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-bold text-accent-fg ring-2 ring-surface-raised"
              aria-label={`${unread} unread`}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      )}

      {open && (
        <Suspense fallback={null}>
          <ChatPanel onClose={close} />
        </Suspense>
      )}
    </>
  );
}
