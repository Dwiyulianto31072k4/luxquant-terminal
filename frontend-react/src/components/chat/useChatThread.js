// src/components/chat/useChatThread.js
import { useCallback, useEffect, useRef, useState } from "react";
import { chatApi } from "../../services/chatApi";
import { createTransport } from "../../services/chatTransport";

/**
 * Owns the chat thread: history, cursor, optimistic send, and read cursor.
 *
 * Messages are keyed and ordered by `seq` — a gapless per-conversation counter
 * from the server — never by row id, which can commit out of order and make a
 * cursor silently skip a message.
 *
 * The hook does not know whether messages arrive by polling or by socket; it
 * hands a fetcher to chatTransport and reacts to batches.
 */
const newClientMsgId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Merge a batch into the thread: replace optimistic echoes, drop repeats.
 *  Exported for tests — this is the only non-trivial logic in the widget. */
export function mergeMessages(prev, incoming) {
  if (!incoming.length) return prev;

  const next = prev.slice();
  for (const msg of incoming) {
    // The server's copy of a message we sent optimistically — swap it in place
    // so the bubble doesn't jump position when it settles.
    const optimisticAt = msg.client_msg_id
      ? next.findIndex((m) => m.pending && m.client_msg_id === msg.client_msg_id)
      : -1;
    if (optimisticAt !== -1) {
      next[optimisticAt] = msg;
      continue;
    }
    if (next.some((m) => m.seq != null && m.seq === msg.seq)) continue;
    next.push(msg);
  }

  // Pending sends have no seq yet and belong at the bottom.
  next.sort((a, b) => {
    if (a.seq == null) return 1;
    if (b.seq == null) return -1;
    return a.seq - b.seq;
  });
  return next;
}

export function useChatThread({ active }) {
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [status, setStatus] = useState("open");
  const [welcome, setWelcome] = useState(null);
  const [awayMessage, setAwayMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Cursor lives in a ref as well as state: the transport reads it on every
  // tick and must see the newest value, not one captured in a stale closure.
  const cursorRef = useRef(0);
  const transportRef = useRef(null);
  const readSentRef = useRef(0);

  const applyBatch = useCallback((batch, meta) => {
    if (batch.length) {
      setMessages((prev) => mergeMessages(prev, batch));
      const top = Math.max(...batch.map((m) => m.seq || 0));
      if (top > cursorRef.current) cursorRef.current = top;
    }
    if (meta?.status) setStatus(meta.status);
  }, []);

  // ── open: one round trip for thread + tail ────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await chatApi.getConversation();
      setConversationId(data.conversation_id);
      setStatus(data.status || "open");
      setWelcome(data.welcome_message || null);
      setAwayMessage(data.away_enabled ? data.away_message : null);
      setMessages(data.messages || []);
      cursorRef.current = data.last_seq || 0;
      setLoaded(true);
    } catch (e) {
      setError(e?.response?.data?.detail || "Couldn't load the conversation.");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── send: optimistic, idempotent ──────────────────────────────────
  const send = useCallback(
    async (text) => {
      const body = (text || "").trim();
      if (!body || sending) return;

      const clientMsgId = newClientMsgId();
      const optimistic = {
        id: `tmp-${clientMsgId}`,
        seq: null,
        sender: "user",
        body,
        kind: "text",
        client_msg_id: clientMsgId,
        created_at: new Date().toISOString(),
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);
      setSending(true);
      setError(null);

      try {
        const data = await chatApi.sendMessage(body, clientMsgId);
        const saved = data.message;
        setMessages((prev) => mergeMessages(prev, [saved]));
        if (saved.seq > cursorRef.current) cursorRef.current = saved.seq;
        // A reply often lands right after we send — don't wait a full tick.
        transportRef.current?.poke();
      } catch (e) {
        // Mark the bubble failed rather than dropping it: the text the person
        // typed stays on screen and can be retried.
        setMessages((prev) =>
          prev.map((m) =>
            m.client_msg_id === clientMsgId ? { ...m, pending: false, failed: true } : m
          )
        );
        setError(e?.response?.data?.detail || "Message didn't send.");
      } finally {
        setSending(false);
      }
    },
    [sending]
  );

  const retry = useCallback(
    (clientMsgId) => {
      const msg = messages.find((m) => m.client_msg_id === clientMsgId && m.failed);
      if (!msg) return;
      setMessages((prev) => prev.filter((m) => m.client_msg_id !== clientMsgId));
      send(msg.body);
    },
    [messages, send]
  );

  // ── transport lifecycle: only while the panel is open ─────────────
  useEffect(() => {
    if (!active || !loaded) return undefined;

    const transport = createTransport({
      fetchSince: (cursor) => chatApi.getMessages(cursor),
      onBatch: applyBatch,
      onError: () => {
        // A dropped poll is normal on flaky mobile data — the next tick
        // re-asks from the same cursor, so nothing is lost. Staying silent
        // avoids an error banner that flickers on every subway tunnel.
      },
    });
    transportRef.current = transport;
    transport.start(() => cursorRef.current);

    return () => {
      transport.stop();
      transportRef.current = null;
    };
  }, [active, loaded, applyBatch]);

  // ── read cursor: whatever is on screen while the panel is open ────
  useEffect(() => {
    if (!active || !conversationId) return;
    const top = cursorRef.current;
    if (top > readSentRef.current) {
      readSentRef.current = top;
      chatApi.markRead(top).catch(() => {
        // Non-critical: the next open re-sends a cursor at least this high.
        readSentRef.current = 0;
      });
    }
  }, [active, conversationId, messages]);

  return {
    messages,
    conversationId,
    status,
    welcome,
    awayMessage,
    loading,
    sending,
    error,
    loaded,
    load,
    send,
    retry,
  };
}

export default useChatThread;
