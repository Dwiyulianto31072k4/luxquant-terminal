/**
 * The user's support thread, inside the user drawer.
 *
 * Support already has a full inbox, but answering someone almost always starts
 * from their record — you look up who they are, what they paid, whether their
 * bot is running, and only then reply. Making them leave the drawer to find the
 * same person again in a second list is the step that gets skipped, and the
 * reply with it.
 *
 * Deliberately a compact thread rather than the inbox view: this is the tail of
 * the conversation and a box to answer in. Anything more belongs in the inbox.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { adminChatApi } from "../../../services/adminChatApi";

const POLL_MS = 6000;

const newClientMsgId = () =>
  `adm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const fmtStamp = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString([], { day: "2-digit", month: "short" })} ${time}`;
};

const waitedLabel = (iso) => {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

export const ChatTab = ({ userId, canWrite = true }) => {
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  const load = useCallback(
    async ({ quiet } = {}) => {
      if (!userId) return;
      if (!quiet) setLoading(true);
      try {
        const t = await adminChatApi.getUserThread(userId);
        setThread(t);
        if (t?.exists && t.conversation_id) {
          const m = await adminChatApi.getMessages(t.conversation_id, 0, 200);
          setMessages(m?.messages || []);
          // Opening the thread is reading it. Leaving the badge lit after an
          // admin has plainly seen the messages just makes the badge a lie.
          if (t.unread > 0 && m?.last_seq) {
            await adminChatApi.markRead(t.conversation_id, m.last_seq);
          }
        } else {
          setMessages([]);
        }
        setErr("");
      } catch (e) {
        setErr(e?.response?.data?.detail || e?.message || "Could not load the thread");
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    load();
    const id = setInterval(() => load({ quiet: true }), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setErr("");
    try {
      if (thread?.exists && thread.conversation_id) {
        await adminChatApi.sendMessage(thread.conversation_id, text, newClientMsgId());
      } else {
        await adminChatApi.startConversation(userId, text, newClientMsgId());
      }
      setBody("");
      await load({ quiet: true });
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || "Could not send");
    } finally {
      setBusy(false);
    }
  };

  const lastMsg = messages[messages.length - 1];
  const awaitingReply = lastMsg && lastMsg.sender === "user";

  return (
    <div className="space-y-3">
      {awaitingReply ? (
        <div className="rounded-lg border border-[#F0B90B]/40 bg-[#F0B90B]/[0.07] px-3 py-2">
          <p className="text-[12px] text-text-primary">
            Waiting for a reply
            {waitedLabel(lastMsg.created_at) ? ` · ${waitedLabel(lastMsg.created_at)}` : ""}
          </p>
        </div>
      ) : null}

      <div className="max-h-[46vh] min-h-[180px] space-y-2 overflow-y-auto rounded-xl border border-ink/[0.08] bg-surface-raised p-3">
        {loading ? (
          <p className="text-[12px] text-text-muted">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-[12px] text-text-muted">
            No messages yet. Anything sent here starts the thread and reaches the
            user the same way the inbox does.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender === "admin";
            return (
              <div key={m.seq ?? m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] rounded-xl px-3 py-2 ${
                    mine
                      ? "bg-accent/15 text-text-primary"
                      : "border border-ink/[0.08] bg-surface-primary text-text-primary"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed">
                    {m.body}
                  </p>
                  <p className="mt-1 text-right font-mono text-[9px] text-text-muted">
                    {m.sender}
                    {m.visibility === "admin_only" ? " · internal" : ""} · {fmtStamp(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {err ? <p className="text-[11px] text-[#F6465D]">{err}</p> : null}

      {canWrite ? (
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
            }}
            rows={2}
            placeholder="Write a reply…  (⌘/Ctrl + Enter to send)"
            className="min-w-0 flex-1 rounded-lg border border-ink/12 bg-surface-primary px-3 py-2 text-[12px] text-text-primary outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !body.trim()}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-[12px] font-medium text-surface-primary disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-text-muted">Read-only access.</p>
      )}
    </div>
  );
};
