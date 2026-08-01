import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDialog } from "../../hooks/useDialog";
import { useChatThread } from "./useChatThread";

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

/** Insert a date divider whenever the day changes. */
function withDayBreaks(messages) {
  const out = [];
  let lastDay = null;
  for (const m of messages) {
    const day = m.created_at ? new Date(m.created_at).toDateString() : null;
    if (day && day !== lastDay) {
      out.push({ _divider: true, key: `d-${day}`, day });
      lastDay = day;
    }
    out.push(m);
  }
  return out;
}

export default function ChatPanel({ onClose }) {
  const { t } = useTranslation();
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const [input, setInput] = useState("");

  useDialog({ isOpen: true, onClose, ref: panelRef });

  const {
    messages, status, welcome, awayMessage,
    loading, sending, error, loaded, load, send, retry,
  } = useChatThread({ active: true });

  useEffect(() => {
    load();
  }, [load]);

  // Stick to the bottom as the thread grows.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const closed = status === "closed";

  const submit = () => {
    const text = input.trim();
    if (!text || sending || closed) return;
    setInput("");
    send(text);
  };

  const rows = withDayBreaks(messages);

  return (
    <>
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
        className="lq-sheet fixed inset-x-0 bottom-0 z-[9999] flex h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-ink/12 bg-surface-raised shadow-[0_-8px_40px_rgb(var(--scrim)_/_0.35)] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[560px] sm:w-[400px] sm:max-w-[92vw] sm:rounded-2xl sm:shadow-[0_25px_60px_rgb(var(--scrim)_/_0.35)]"
      >
        {/* Phone-only grab handle. The panel was already pinned to the bottom
            edge but arrived without motion or affordance, so it read as a screen
            that had always been there rather than a sheet that just opened. */}
        <div className="flex shrink-0 justify-center pt-2 pb-0.5 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-ink/25" />
        </div>

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
        <div ref={scrollRef} className="custom-scrollbar flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
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
              <div key={m.key} className="flex items-center gap-2 py-1">
                <span className="h-px flex-1 bg-ink/8" />
                <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted/70">
                  {m.day}
                </span>
                <span className="h-px flex-1 bg-ink/8" />
              </div>
            ) : (
              <div
                key={m.id ?? `s-${m.seq}`}
                className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[85%]">
                  <div
                    className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      m.sender === "user"
                        ? "bg-accent font-medium text-accent-fg"
                        : m.sender === "system"
                          ? "border border-ink/5 bg-ink/[0.03] italic text-text-muted"
                          : "border border-ink/5 bg-ink/[0.05] text-text-primary/90"
                    } ${m.pending ? "opacity-60" : ""} ${m.failed ? "opacity-70 ring-1 ring-neg/40" : ""}`}
                  >
                    {m.body}
                  </div>
                  <div
                    className={`mt-0.5 flex items-center gap-1.5 px-1 ${
                      m.sender === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <span className="font-mono text-[9px] text-text-muted/60">
                      {m.pending ? t("chat.sending") || "sending…" : timeLabel(m.created_at)}
                    </span>
                    {m.failed && (
                      <button
                        onClick={() => retry(m.client_msg_id)}
                        className="font-mono text-[9px] uppercase tracking-wider text-neg-text hover:underline"
                      >
                        {t("chat.retry") || "retry"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-ink/10 bg-surface-raised p-3 pb-24 sm:pb-3">
          {error && (
            <p className="mb-2 px-1 text-[11px] text-neg-text">{error}</p>
          )}
          {closed ? (
            <p className="px-1 py-2 text-center text-[12px] text-text-muted">
              {t("chat.closed") || "This conversation has been closed."}
            </p>
          ) : (
            <div className="flex items-end gap-2">
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
