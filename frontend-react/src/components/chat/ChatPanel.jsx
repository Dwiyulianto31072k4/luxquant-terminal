import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../../hooks/useDialog";
import { useChatThread } from "./useChatThread";
import Modal from "../ui/Modal";
import {
  ChatImageLightbox,
  ChatImageSendModal,
  ChatMessageBody,
  isChatImage,
} from "./ChatMessageContent";

/**
 * Support chat panel — a direct line to the LuxQuant team.
 *
 * Mobile: full-width bottom sheet. Desktop: narrow column anchored bottom
 * right. Deliberately narrower than AssistantWidget: this is a 1:1
 * conversation, not a wide AI console.
 */
function timeLabel(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Date dividers, plus the grouping WhatsApp uses.
 *
 * Consecutive messages from the same sender close together read as one turn,
 * so only the last of a run gets a tail and a timestamp. Without that, five
 * quick lines look like five separate interruptions.
 */
const GROUP_WINDOW_MS = 3 * 60 * 1000;

function withDayBreaks(messages) {
  const out = [];
  let lastDay = null;
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i];
    const day = m.created_at ? new Date(m.created_at).toDateString() : null;
    if (day && day !== lastDay) {
      out.push({ _divider: true, key: `d-${day}`, day });
      lastDay = day;
    }
    const next = messages[i + 1];
    const sameRun =
      next &&
      next.sender === m.sender &&
      next.created_at &&
      m.created_at &&
      new Date(next.created_at) - new Date(m.created_at) < GROUP_WINDOW_MS &&
      new Date(next.created_at).toDateString() === day;
    out.push({ ...m, _last: !sameRun });
  }
  return out;
}

export default function ChatPanel({ onClose }) {
  const { t } = useTranslation();
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const preserveScrollRef = useRef(null);
  const fileRef = useRef(null);
  const [input, setInput] = useState("");
  const [lightboxImage, setLightboxImage] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [mediaSending, setMediaSending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useDialog({ isOpen: true, onClose, ref: panelRef });

  const {
    messages, status, welcome, awayMessage,
    loading, sending, error, loaded, adminLastReadSeq,
    hasMoreBefore, loadingOlder,
    load, send, sendImage, loadOlder, deleteMessage, retry,
  } = useChatThread({ active: true });

  useEffect(() => {
    load();
  }, [load]);

  // Stick to the bottom as the thread grows.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (preserveScrollRef.current) {
      const { height, top } = preserveScrollRef.current;
      preserveScrollRef.current = null;
      requestAnimationFrame(() => {
        node.scrollTop = top + (node.scrollHeight - height);
      });
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [messages, loading]);

  const closed = status === "closed";

  const submit = () => {
    const text = input.trim();
    if (!text || sending || closed) return;
    setInput("");
    send(text);
  };

  const rows = withDayBreaks(messages);

  const loadPrevious = async () => {
    const node = scrollRef.current;
    if (node) preserveScrollRef.current = { height: node.scrollHeight, top: node.scrollTop };
    const count = await loadOlder();
    if (!count) preserveScrollRef.current = null;
  };

  const sendPendingImage = async () => {
    if (!pendingImage || mediaSending) return;
    setMediaSending(true);
    try {
      await sendImage(pendingImage);
      setPendingImage(null);
    } catch {
      // The hook owns the user-facing error; keep the preview open for retry.
    } finally {
      setMediaSending(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteMessage(deleteTarget.id);
      setDeleteTarget(null);
      if (isChatImage(deleteTarget) && lightboxImage === deleteTarget.body) setLightboxImage(null);
    } catch {
      // Error is rendered by the hook; keep confirmation open so it can retry.
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <ChatImageLightbox src={lightboxImage} onClose={() => setLightboxImage(null)} />
      <ChatImageSendModal
        file={pendingImage}
        sending={mediaSending}
        onCancel={() => setPendingImage(null)}
        onSend={sendPendingImage}
      />
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Delete this message?"
        subtitle="It will be replaced by a deleted-message marker"
        size="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} className="px-3 py-2 text-xs text-text-muted hover:text-text-primary">Cancel</button>
            <button type="button" onClick={confirmDelete} disabled={deleting} className="rounded-lg bg-loss px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{deleting ? "Deleting…" : "Delete"}</button>
          </div>
        }
      >
        <p className="line-clamp-3 text-xs leading-relaxed text-text-muted">{isChatImage(deleteTarget) ? "This image will be removed." : deleteTarget?.body}</p>
      </Modal>
      <div
        className="lq-chat-scrim hidden sm:block fixed inset-0 z-[9998] bg-scrim/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t("chat.title") || "Chat with us"}
        className="lq-sheet fixed inset-0 z-[9999] flex h-[100dvh] w-full flex-col overflow-hidden border-0 bg-surface-raised shadow-[0_-8px_40px_rgb(var(--scrim)_/_0.35)] sm:inset-x-auto sm:inset-y-auto sm:bottom-6 sm:right-6 sm:h-[min(720px,calc(100dvh-3rem))] sm:w-[440px] sm:max-w-[92vw] sm:rounded-2xl sm:border sm:border-ink/12 sm:shadow-[0_25px_60px_rgb(var(--scrim)_/_0.35)]"
      >
        {/* Phone-only grab handle. The panel was already pinned to the bottom
            edge but arrived without motion or affordance, so it read as a screen
            that had always been there rather than a sheet that just opened. */}
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink/10 bg-surface-raised px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold leading-none text-text-primary">
                {t("chat.title") || "Chat with us"}
              </p>
              <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {t("chat.subtitle") || "LuxQuant team"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/10 text-text-muted transition-all hover:bg-ink/5 hover:text-text-primary"
            aria-label={t("chat.close") || "Close"}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Away notice — set expectations before someone waits on a reply. */}
        {awayMessage && !closed && (
          <div className="border-b border-ink/10 bg-accent/[0.07] px-4 py-2.5">
            <p className="text-[12px] leading-relaxed text-text-primary/80">{awayMessage}</p>
          </div>
        )}

        {/* Thread */}
        <div
          ref={scrollRef}
          className="lq-chat-thread custom-scrollbar flex-1 overflow-y-auto px-3 py-3"
        >
          {loaded && hasMoreBefore && (
            <div className="flex justify-center pb-2">
              <button
                type="button"
                onClick={loadPrevious}
                disabled={loadingOlder}
                className="rounded-full border border-ink/10 bg-surface-raised px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-text-muted shadow-sm transition-colors hover:text-text-primary disabled:opacity-50"
              >
                {loadingOlder ? "Loading…" : "Load older messages"}
              </button>
            </div>
          )}
          {loading && !loaded && (
            <p className="py-8 text-center text-[12px] text-text-muted">
              {t("chat.loading") || "Loading…"}
            </p>
          )}

          {loaded && messages.length === 0 && (
            <div className="space-y-3 py-4">
              <p className="text-[13px] leading-relaxed text-text-primary/75">
                {welcome ||
                  t("chat.empty") ||
                  "Ask us anything — how a signal works, billing, or which plan fits you."}
              </p>
            </div>
          )}

          {rows.map((m) =>
            m._divider ? (
              <div key={m.key} className="flex justify-center py-1.5">
                <span className="rounded-lg bg-ink/[0.06] px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-text-muted">
                  {m.day}
                </span>
              </div>
            ) : (
              <div
                key={m.id ?? `s-${m.seq}`}
                className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"} ${
                  m._last ? "mb-1.5" : "mb-0.5"
                }`}
              >
                <div
                  className={`group relative max-w-[80%] shadow-sm ${
                    m.sender === "system"
                      ? "rounded-lg bg-ink/[0.04] italic"
                      : m.sender === "user"
                        ? `bg-accent text-accent-fg ${m._last ? "rounded-2xl rounded-br-sm" : "rounded-2xl"}`
                        : // One step above the thread wallpaper, which is plain
                          // --surface: an incoming bubble painted in --surface
                          // is the same colour as what it sits on and vanishes.
                          `border border-ink/[0.07] bg-surface-raised text-text-primary ${
                            m._last ? "rounded-2xl rounded-bl-sm" : "rounded-2xl"
                          }`
                  } ${m.pending ? "opacity-60" : ""} ${m.failed ? "ring-1 ring-neg/40" : ""} ${
                    isChatImage(m) ? "overflow-hidden p-1" : "px-3 py-2"
                  }`}
                >
                  <ChatMessageBody
                    message={m}
                    onOpenImage={setLightboxImage}
                    imageClassName="max-h-[360px] max-w-[260px]"
                  />

                  {/* Meta rides inside the bubble, bottom-right, the way every
                      messenger does it — floated so short lines wrap around it
                      instead of leaving a hole. */}
                  <span
                    className={`pointer-events-none select-none whitespace-nowrap text-[9px] ${
                      isChatImage(m)
                        ? "absolute bottom-2 right-2 rounded-md bg-black/45 px-1.5 py-0.5 text-white"
                        : `float-right ml-2 mt-1 ${
                            m.sender === "user" ? "text-accent-fg/65" : "text-text-muted/70"
                          }`
                    }`}
                  >
                    {m.pending ? t("chat.sending") || "sending…" : timeLabel(m.created_at)}
                    {m.sender === "user" && !m.pending && !m.failed && m.seq != null && (
                      <span
                        className={`ml-1 ${
                          isChatImage(m)
                            ? "text-white"
                            : adminLastReadSeq >= m.seq
                              ? "text-sky-500"
                              : "text-accent-fg/65"
                        }`}
                        title={
                          adminLastReadSeq >= m.seq
                            ? t("chat.seen")
                            : t("chat.delivered")
                        }
                      >
                        {adminLastReadSeq >= m.seq ? "✓✓" : "✓"}
                      </span>
                    )}
                  </span>

                  {m.failed && (
                    <button
                      onClick={() => retry(m.client_msg_id)}
                      className="ml-2 text-[9px] uppercase tracking-wider text-neg-text underline"
                    >
                      {t("chat.retry") || "retry"}
                    </button>
                  )}
                  {m.sender === "user" && !m.pending && !m.failed && !m.deleted && !m.expired && !["deleted", "expired_image"].includes(m.kind) && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(m)}
                      className={`absolute -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-ink/10 bg-surface-raised text-text-muted shadow-sm transition-all hover:text-loss sm:opacity-0 sm:group-hover:opacity-100 ${m.sender === "user" ? "-left-7" : "-right-7"}`}
                      aria-label="Delete message"
                      title="Delete message"
                    >
                      <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3"><path d="M4.5 5.5h11m-7.5 0V4h4v1.5m-6 0 .7 10h6.6l.7-10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  )}
                </div>
              </div>
            )
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-ink/10 bg-surface-raised p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {error && (
            <p className="mb-2 px-1 text-[11px] text-neg-text">{error}</p>
          )}
          {closed ? (
            <p className="px-1 py-2 text-center text-[12px] text-text-muted">
              {t("chat.closed") || "This conversation has been closed."}
            </p>
          ) : (
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  // Reset first: picking the same file twice must still fire.
                  e.target.value = "";
                  if (f) setPendingImage(f);
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={sending}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-ink/10 text-text-muted transition-colors hover:bg-ink/5 hover:text-text-primary disabled:opacity-30"
                aria-label={t("chat.attach")}
                title={t("chat.attach")}
              >
                <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                data-autofocus
                placeholder={t("chat.placeholder") || "Type a message…"}
                className="max-h-24 flex-1 resize-none rounded-xl border border-ink/10 bg-surface-raised px-3.5 py-2.5 text-[13px] text-text-primary placeholder:text-text-muted/60 focus:border-ink/15 focus:outline-none"
              />
              <button
                onClick={submit}
                disabled={sending || !input.trim()}
                className="lq-cta-md h-10 w-10 flex-shrink-0 disabled:opacity-30"
                aria-label={t("chat.send") || "Send"}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
