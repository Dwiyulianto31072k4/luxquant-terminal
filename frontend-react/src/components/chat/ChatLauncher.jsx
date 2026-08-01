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

const newClientMsgId = () =>
  `usr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Decorative mark for the peek card.
 *
 * A reply arrow curving out of a speech bubble — it says "someone answered, and
 * you can answer back" without a line of copy, which is the whole job. Drawn
 * inline in currentColor so it themes with everything else and costs no request.
 */
const ReplyMark = ({ className = "" }) => (
  <svg viewBox="0 0 44 44" fill="none" className={className} aria-hidden="true">
    <rect x="2" y="6" width="30" height="22" rx="7" className="fill-accent/12" />
    <rect
      x="2.75"
      y="6.75"
      width="28.5"
      height="20.5"
      rx="6.25"
      className="stroke-accent/35"
      strokeWidth="1.5"
    />
    <path d="M9.5 28.5 8 35l6.5-4.2" className="fill-accent/12 stroke-accent/35" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="11.5" cy="17" r="1.9" className="fill-accent" />
    <circle cx="17.5" cy="17" r="1.9" className="fill-accent/70" />
    <circle cx="23.5" cy="17" r="1.9" className="fill-accent/40" />
    <path
      d="M28 38c6.2 0 11-3.6 11-9.2 0-3-1.5-5.4-3.6-6.9"
      className="stroke-accent"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M31.6 25.6 35.4 21.6 39.4 25.2"
      className="stroke-accent"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function ChatLauncher() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [preview, setPreview] = useState(null);
  // Dismissing hides the card until the next reply arrives, not for ever — the
  // seq in the key means a newer message brings it back on its own.
  const [dismissedFor, setDismissedFor] = useState(null);
  const [quick, setQuick] = useState("");
  const [sending, setSending] = useState(false);

  const fetchUnread = useCallback(() => {
    if (!isAuthenticated) return;
    chatApi
      .getUnreadCount()
      .then((d) => {
        setUnread(d?.unread || 0);
        setPreview(d?.preview || null);
      })
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
    setPreview(null);
  };

  const previewKey = preview?.created_at || null;
  const showPeek = !open && unread > 0 && preview && dismissedFor !== previewKey;

  const sendQuick = async () => {
    const text = quick.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await chatApi.sendMessage(text, newClientMsgId());
      setQuick("");
      // Replying is reading. Clearing here rather than waiting for the next
      // poll means the card does not sit there for another 45 seconds telling
      // someone about a message they have just answered.
      setUnread(0);
      setPreview(null);
    } catch {
      // Fall back to the full panel, where the failure is visible and the
      // draft is not silently lost.
      setOpen(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {showPeek && (
        <div className="lq-sheet fixed bottom-[212px] right-4 z-[9996] w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-ink/12 bg-surface-raised shadow-[0_12px_40px_rgb(var(--scrim)_/_0.35)] sm:bottom-[136px] sm:right-5">
          <div className="flex items-start gap-3 px-3.5 pt-3.5">
            <ReplyMark className="h-11 w-11 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
                {t("chat.title") || "LuxQuant Support"}
              </p>
              <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-text-primary">
                {preview.body}
                {preview.truncated ? "…" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDismissedFor(previewKey)}
              className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-text-muted transition-colors hover:text-text-primary"
              aria-label="Dismiss"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-ink/[0.07] p-2.5">
            <input
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendQuick()}
              placeholder={t("chat.replyPlaceholder") || "Reply…"}
              className="min-w-0 flex-1 rounded-lg border border-ink/10 bg-surface-primary px-3 py-2 text-[12.5px] text-text-primary outline-none placeholder:text-text-muted/60 focus:border-accent"
            />
            <button
              type="button"
              onClick={sendQuick}
              disabled={sending || !quick.trim()}
              className="shrink-0 rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-accent-fg transition-opacity disabled:opacity-40"
            >
              {sending ? "…" : t("chat.send") || "Send"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="shrink-0 rounded-lg border border-ink/10 px-2.5 py-2 text-[12px] text-text-secondary transition-colors hover:border-accent hover:text-accent"
              title={t("chat.open") || "Open chat"}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M7 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      )}

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
