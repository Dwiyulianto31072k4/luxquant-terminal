import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDialog } from "../../hooks/useDialog";
import { useChatThread } from "./useChatThread";
import Modal from "../ui/Modal";
import { Z } from "../../constants/zIndex";
import { TELEGRAM_ADMIN_URL, TelegramGlyph } from "../../utils/supportContact";
import {
  ChatImageLightbox,
  ChatImageSendModal,
  ChatMessageBody,
  isChatImage,
} from "./ChatMessageContent";

/**
 * Support chat — a direct line to the LuxQuant team.
 *
 * The signal modal's shell, not a corner widget. The old panel was pinned
 * bottom-right at z 9999 while the site header paints at 300000, so on desktop
 * its top — title and close button included — slid under the header, and on a
 * phone the "full-screen" sheet started beneath the bar with no visible way
 * out. Now the overlay sits at the signal-shell layer and the card is held
 * clear of the header by --lq-modal-top, exactly like SignalModal:
 *
 *   phone   a bottom sheet from under the header to the screen edge
 *   desktop a wide centred dialog; from lg a side column carries Telegram,
 *           quick questions and links, so the thread keeps its width
 */
function timeLabel(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function dayLabel(dayString) {
  const d = new Date(dayString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

/** Date dividers, plus the grouping WhatsApp uses.
 *
 * Consecutive messages from the same sender close together read as one turn,
 * so only the last of a run gets a tail. Without that, five quick lines look
 * like five separate interruptions.
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

const ChatGlyph = ({ className = "h-4 w-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
  </svg>
);

export default function ChatPanel({ onClose }) {
  const { t } = useTranslation();
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const preserveScrollRef = useRef(null);
  const fileRef = useRef(null);
  const [input, setInput] = useState("");
  const [lightboxImage, setLightboxImage] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [mediaSending, setMediaSending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Phones have no hover: a tap on your own bubble reveals its delete button,
  // instead of a bin floating beside every message you ever sent.
  const [activeId, setActiveId] = useState(null);

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

  // The page behind must not scroll along with the thread.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

  // Grow the composer with its text, up to a few lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // Empty: leave it to rows=1. Measuring on mount caught the sheet mid-layout
    // and pinned an empty box at the 132px cap.
    if (!input) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [input]);

  const closed = status === "closed";
  const away = !!awayMessage && !closed;

  const submit = () => {
    const text = input.trim();
    if (!text || sending || closed) return;
    setInput("");
    send(text);
  };

  const ask = (text) => {
    setInput(text);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const rows = withDayBreaks(messages);
  const quick = [t("chat.quick1"), t("chat.quick2"), t("chat.quick3"), t("chat.quick4")];

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
      setActiveId(null);
      if (isChatImage(deleteTarget) && lightboxImage === deleteTarget.body) setLightboxImage(null);
    } catch {
      // Error is rendered by the hook; keep confirmation open so it can retry.
    } finally {
      setDeleting(false);
    }
  };

  const deletable = (m) =>
    m.sender === "user" && !m.pending && !m.failed && !m.deleted && !m.expired &&
    !["deleted", "expired_image"].includes(m.kind);

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
        zIndex={Z.nestedModal}
        footer={
          <div className="flex w-full justify-end gap-2">
            <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} className="px-3 py-2 text-xs text-text-muted hover:text-text-primary">Cancel</button>
            <button type="button" onClick={confirmDelete} disabled={deleting} className="rounded-lg bg-loss px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{deleting ? "Deleting…" : "Delete"}</button>
          </div>
        }
      >
        <p className="line-clamp-3 text-xs leading-relaxed text-text-muted">{isChatImage(deleteTarget) ? "This image will be removed." : deleteTarget?.body}</p>
      </Modal>

      {createPortal(
        <div className="lq-uchat-overlay">
          <div className="lq-uchat-backdrop" onClick={onClose} aria-hidden="true" />
          <div className="lq-uchat-container">
            <div
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={t("chat.supportTitle")}
              className="lq-uchat-sheet"
            >
              {/* ── Header: who you are talking to, whether they're here, out ── */}
              <header className="flex shrink-0 items-center gap-3 border-b border-ink/[0.08] bg-surface-raised px-4 py-3 sm:px-5">
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg">
                  <ChatGlyph className="h-5 w-5" />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-surface-raised ${away ? "bg-text-muted" : "bg-profit"}`}
                    aria-hidden="true"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[15px] font-semibold leading-tight text-text-primary sm:text-base">
                    {t("chat.supportTitle")}
                  </h2>
                  <p className="mt-0.5 truncate text-[12px] text-text-muted">
                    {closed ? t("chat.closed") : away ? t("chat.statusAway") : t("chat.statusHere")}
                  </p>
                </div>
                {/* Telegram lives in the side column from lg; below that it is
                    a compact button here rather than a full-width blue bar
                    eating a fifth of a phone screen. */}
                <a
                  href={TELEGRAM_ADMIN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#229ED9] px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#1E8CC0] lg:hidden"
                  aria-label={t("chat.tgCta")}
                  title={t("chat.tgNote")}
                >
                  <TelegramGlyph className="h-4 w-4" />
                  <span className="hidden min-[360px]:inline">{t("chat.tgShort")}</span>
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink/[0.1] text-text-muted transition-colors hover:bg-ink/[0.05] hover:text-text-primary"
                  aria-label={t("chat.close")}
                  title={`${t("chat.close")} (Esc)`}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </header>

              <div className="flex min-h-0 flex-1">
                {/* ── Conversation ───────────────────────────────────────── */}
                <section className="flex min-w-0 flex-1 flex-col">
                  <div
                    ref={scrollRef}
                    className="lq-chat-thread custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) setActiveId(null);
                    }}
                  >
                    <div className="mx-auto w-full max-w-[720px]">
                      {loaded && hasMoreBefore && (
                        <div className="flex justify-center pb-3">
                          <button
                            type="button"
                            onClick={loadPrevious}
                            disabled={loadingOlder}
                            className="rounded-full border border-ink/10 bg-surface-raised px-3.5 py-1.5 text-[11px] font-medium text-text-muted shadow-sm transition-colors hover:text-text-primary disabled:opacity-50"
                          >
                            {loadingOlder ? t("chat.loading") : "Load older messages"}
                          </button>
                        </div>
                      )}
                      {loading && !loaded && (
                        <p className="py-10 text-center text-[13px] text-text-muted">{t("chat.loading")}</p>
                      )}

                      {loaded && messages.length === 0 && (
                        <div className="mx-auto max-w-[440px] py-8 text-center">
                          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                            <ChatGlyph className="h-6 w-6" />
                          </span>
                          <p className="mt-3 text-[16px] font-semibold text-text-primary">{t("chat.emptyTitle")}</p>
                          <p className="mt-1 text-[13px] leading-relaxed text-text-muted">{welcome || t("chat.empty")}</p>
                          <div className="mt-4 flex flex-wrap justify-center gap-2 lg:hidden">
                            {quick.map((q) => (
                              <button
                                key={q}
                                type="button"
                                onClick={() => ask(q)}
                                className="rounded-full border border-ink/[0.12] bg-surface-raised px-3 py-1.5 text-[12px] text-text-primary transition-colors hover:border-accent/50 hover:bg-accent/[0.06]"
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {rows.map((m) => {
                        if (m._divider) {
                          return (
                            <div key={m.key} className="flex justify-center py-2">
                              <span className="rounded-full bg-ink/[0.06] px-3 py-1 text-[11px] font-medium text-text-muted">
                                {dayLabel(m.day)}
                              </span>
                            </div>
                          );
                        }

                        // Automatic notes (away replies, status changes) are the
                        // system talking, not the team: a quiet centred line,
                        // not a big italic bubble that outweighs real replies.
                        if (m.sender === "system") {
                          return (
                            <div key={m.id ?? `s-${m.seq}`} className="my-2 flex justify-center">
                              <p className="max-w-[88%] rounded-xl bg-ink/[0.04] px-3 py-1.5 text-center text-[12px] leading-relaxed text-text-muted">
                                {m.body}
                                <span className="ml-1.5 text-[10px] text-text-muted/70">{timeLabel(m.created_at)}</span>
                              </p>
                            </div>
                          );
                        }

                        const mine = m.sender === "user";
                        const key = m.id ?? `s-${m.seq}`;
                        const showDelete = deletable(m);
                        return (
                          <div
                            key={key}
                            className={`group flex items-center gap-1.5 ${mine ? "justify-end" : "justify-start"} ${m._last ? "mb-2" : "mb-0.5"}`}
                          >
                            {mine && showDelete && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(m)}
                                className={`flex h-7 shrink-0 items-center gap-1 rounded-full border border-ink/10 bg-surface-raised px-2 text-[11px] text-text-muted shadow-sm transition-all hover:text-loss ${
                                  activeId === key ? "opacity-100" : "pointer-events-none opacity-0 sm:pointer-events-auto sm:group-hover:opacity-100"
                                }`}
                                aria-label="Delete message"
                              >
                                <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3" aria-hidden="true"><path d="M4.5 5.5h11m-7.5 0V4h4v1.5m-6 0 .7 10h6.6l.7-10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                <span className="sm:hidden">{t("chat.tapToDelete")}</span>
                              </button>
                            )}
                            <div
                              onClick={() => showDelete && setActiveId((v) => (v === key ? null : key))}
                              className={`relative max-w-[82%] shadow-sm sm:max-w-[70%] ${
                                mine
                                  ? `bg-accent text-accent-fg ${m._last ? "rounded-2xl rounded-br-md" : "rounded-2xl"}`
                                  : // One step above the thread wallpaper (--surface):
                                    // a bubble in --surface vanishes into it.
                                    `border border-ink/[0.07] bg-surface-raised text-text-primary ${m._last ? "rounded-2xl rounded-bl-md" : "rounded-2xl"}`
                              } ${m.pending ? "opacity-60" : ""} ${m.failed ? "ring-1 ring-neg/40" : ""} ${
                                isChatImage(m) ? "overflow-hidden p-1" : "px-3.5 py-2 text-[14px] leading-relaxed"
                              }`}
                            >
                              <ChatMessageBody
                                message={m}
                                onOpenImage={setLightboxImage}
                                imageClassName="max-h-[360px] max-w-[260px]"
                              />
                              {/* Meta rides inside the bubble, bottom-right, the way
                                  every messenger does it — floated so short lines
                                  wrap around it instead of leaving a hole. */}
                              <span
                                className={`pointer-events-none select-none whitespace-nowrap text-[10px] ${
                                  isChatImage(m)
                                    ? "absolute bottom-2 right-2 rounded-md bg-black/45 px-1.5 py-0.5 text-white"
                                    : `float-right ml-2.5 mt-1.5 ${mine ? "text-accent-fg/65" : "text-text-muted/70"}`
                                }`}
                              >
                                {m.pending ? t("chat.sending") : timeLabel(m.created_at)}
                                {mine && !m.pending && !m.failed && m.seq != null && (
                                  <span
                                    className={`ml-1 ${
                                      isChatImage(m) ? "text-white" : adminLastReadSeq >= m.seq ? "text-sky-600" : "text-accent-fg/65"
                                    }`}
                                    title={adminLastReadSeq >= m.seq ? t("chat.seen") : t("chat.delivered")}
                                  >
                                    {adminLastReadSeq >= m.seq ? "✓✓" : "✓"}
                                  </span>
                                )}
                              </span>
                              {m.failed && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    retry(m.client_msg_id);
                                  }}
                                  className="ml-2 text-[11px] font-medium text-neg-text underline"
                                >
                                  {t("chat.retry")}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Composer ── */}
                  <div className="shrink-0 border-t border-ink/[0.08] bg-surface-raised px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
                    <div className="mx-auto w-full max-w-[720px]">
                      {error && <p className="mb-2 px-1 text-[12px] text-neg-text">{error}</p>}
                      {closed ? (
                        <p className="px-1 py-2 text-center text-[13px] text-text-muted">{t("chat.closed")}</p>
                      ) : (
                        <>
                          <div className="flex items-end gap-2 rounded-2xl border border-ink/[0.12] bg-surface px-2 py-1.5 transition-colors focus-within:border-accent/60">
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
                              type="button"
                              onClick={() => fileRef.current?.click()}
                              disabled={sending}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-ink/[0.06] hover:text-text-primary disabled:opacity-30"
                              aria-label={t("chat.attach")}
                              title={t("chat.attach")}
                            >
                              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                              </svg>
                            </button>
                            <textarea
                              ref={inputRef}
                              rows={1}
                              value={input}
                              onChange={(e) => setInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                                  e.preventDefault();
                                  submit();
                                }
                              }}
                              data-autofocus
                              placeholder={t("chat.placeholder")}
                              className="lq-uchat-input min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-[14px] leading-snug text-text-primary placeholder:text-text-muted/60 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={submit}
                              disabled={sending || !input.trim()}
                              className="lq-cta-md h-9 w-9 shrink-0 rounded-xl disabled:opacity-30"
                              aria-label={t("chat.send")}
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                              </svg>
                            </button>
                          </div>
                          <p className="mt-1.5 hidden px-1 text-[11px] text-text-muted sm:block">{t("chat.enterHint")}</p>
                        </>
                      )}
                    </div>
                  </div>
                </section>

                {/* ── Side column (lg+) ─────────────────────────────────────── */}
                <aside className="hidden w-[300px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-ink/[0.08] bg-surface-raised p-4 lg:flex">
                  <a
                    href={TELEGRAM_ADMIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block rounded-xl bg-[#229ED9] p-4 text-white transition-colors hover:bg-[#1E8CC0]"
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                        <TelegramGlyph className="h-4 w-4" />
                      </span>
                      <span className="text-[14px] font-bold">{t("chat.tgCardTitle")}</span>
                    </span>
                    <span className="mt-2 block text-[12.5px] leading-relaxed text-white/95">{t("chat.tgCardBody")}</span>
                    <span className="mt-3 inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1E8CC0]">
                      {t("chat.tgCardCta")}
                      <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  </a>

                  {!closed && (
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{t("chat.quickTitle")}</p>
                      <div className="flex flex-col gap-1.5">
                        {quick.map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => ask(q)}
                            className="rounded-lg border border-ink/[0.1] px-3 py-2 text-left text-[12.5px] text-text-primary transition-colors hover:border-accent/50 hover:bg-accent/[0.06]"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{t("chat.linksTitle")}</p>
                    <div className="flex flex-col">
                      {[
                        ["/tips", t("chat.linkTutorials")],
                        ["/pricing", t("chat.linkPricing")],
                      ].map(([to, label]) => (
                        <Link
                          key={to}
                          to={to}
                          onClick={onClose}
                          className="flex items-center justify-between rounded-lg px-2 py-2 text-[13px] text-text-primary transition-colors hover:bg-ink/[0.05]"
                        >
                          {label}
                          <svg className="h-3.5 w-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                          </svg>
                        </Link>
                      ))}
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </div>

          <style>{`
            /* The signal modal's shell: overlay below the header (300000), the
               card held clear of it by --lq-modal-top, the scrim full-bleed. */
            .lq-uchat-overlay { position: fixed; inset: 0; z-index: ${Z.signalShell}; display: flex; isolation: isolate; }
            @supports (height: 100dvh) { .lq-uchat-overlay { height: 100dvh; } }
            .lq-uchat-backdrop {
              position: absolute; inset: 0;
              background: rgb(var(--scrim) / var(--lq-scrim-alpha));
              backdrop-filter: blur(var(--lq-scrim-blur));
              -webkit-backdrop-filter: blur(var(--lq-scrim-blur));
              animation: lqUchatFade .18s ease-out;
            }
            .lq-uchat-container {
              position: relative; z-index: 1; width: 100%; height: 100%;
              display: flex; align-items: flex-end; justify-content: center;
              padding: var(--lq-modal-top) 0 0; pointer-events: none;
            }
            .lq-uchat-container > * { pointer-events: auto; }
            .lq-uchat-sheet {
              position: relative; width: 100%;
              height: min(var(--lq-modal-maxh), 100%); max-height: min(var(--lq-modal-maxh), 100%);
              display: flex; flex-direction: column; overflow: hidden;
              background: rgb(var(--surface-raised));
              border-top: 1px solid rgb(var(--ink) / 0.12); border-radius: 18px 18px 0 0;
              box-shadow: 0 -12px 40px rgb(var(--scrim) / 0.4);
              animation: lqUchatRise .24s cubic-bezier(.2,.8,.2,1);
            }
            .lq-uchat-sheet:focus { outline: none; }
            @media (min-width: 640px) {
              .lq-uchat-container { align-items: center; padding: var(--lq-modal-top) 16px 16px; }
              .lq-uchat-sheet {
                max-width: 760px; border-radius: 18px; border: 1px solid rgb(var(--ink) / 0.12);
                height: min(var(--lq-modal-maxh), 820px, 100%); max-height: min(var(--lq-modal-maxh), 820px, 100%);
                box-shadow: 0 24px 64px rgb(var(--scrim) / 0.45);
              }
            }
            @media (min-width: 1024px) {
              .lq-uchat-container { padding: var(--lq-modal-top) 24px 24px; }
              .lq-uchat-sheet { max-width: 1080px; }
            }
            /* The composer frame shows focus (focus-within); the global ring on
               the textarea inside would draw a second box. */
            .lq-uchat-sheet .lq-uchat-input:focus,
            .lq-uchat-sheet .lq-uchat-input:focus-visible { outline: none !important; box-shadow: none !important; }
            @keyframes lqUchatFade { from { opacity: 0; } to { opacity: 1; } }
            @keyframes lqUchatRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
            @media (prefers-reduced-motion: reduce) {
              .lq-uchat-backdrop, .lq-uchat-sheet { animation: none; }
            }
          `}</style>
        </div>,
        document.body
      )}
    </>
  );
}
