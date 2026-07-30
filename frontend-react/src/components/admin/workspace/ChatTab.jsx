// ════════════════════════════════════════════════════════════════════
// ChatTab — admin inbox for the in-app support chat
// Two panes: conversation list (left) + thread with user context (right).
// Postgres is the source of truth, so a reply typed here and (phase 2) a reply
// typed in the Telegram topic mirror land in the same thread.
// Backend: /api/v1/admin/chat
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from "react";
import { adminChatApi } from "../../../services/adminChatApi";
import { palette, NEUTRAL } from "../designSystem";
import { Surface, Badge, EmptyState, LoadingState, SearchInput, Spinner } from "../primitives";
import { SearchIcon, TelegramIcon } from "../Icons";

// Conversations refresh faster than the workspace shell's 60s: a stale support
// list is a slow reply, which is the one metric this feature lives on.
const LIST_POLL_MS = 15000;
const THREAD_POLL_MS = 5000;

const FILTERS = [
  { id: "all", label: "All", params: {} },
  { id: "unread", label: "Unread", params: { unreadOnly: true } },
  { id: "open", label: "Open", params: { status: "open" } },
  { id: "closed", label: "Closed", params: { status: "closed" } },
];

const newClientMsgId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `a-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const fmtAgo = (iso) => {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtTime = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

const planLabel = (row) => {
  if (row.role === "free") return "Free";
  if (!row.subscription_expires_at) return "Lifetime";
  const exp = new Date(row.subscription_expires_at);
  return exp < new Date() ? `Expired ${fmtDate(exp)}` : `Until ${fmtDate(exp)}`;
};

const inputCls =
  "w-full px-3 py-2 rounded-md bg-ink/[0.03] border border-ink/[0.08] text-text-primary text-xs " +
  "placeholder:text-text-primary/30 focus:outline-none focus:border-ink/20 transition-colors";

// ── Left pane row ───────────────────────────────────────────────────
const ConversationRow = ({ row, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full border-b border-ink/[0.06] px-3 py-2.5 text-left transition-colors ${
      active ? "bg-ink/[0.06]" : "hover:bg-ink/[0.03]"
    }`}
  >
    <div className="mb-1 flex items-center gap-2">
      <span className="truncate text-xs font-semibold text-text-primary">
        {row.username || `#${row.user_id}`}
      </span>
      <Badge variant="role" value={row.role} size="xs">
        {row.role}
      </Badge>
      <span className="ml-auto shrink-0 font-mono text-[10px] text-text-muted">
        {fmtAgo(row.last_message_at)}
      </span>
      {row.unread > 0 && (
        <span
          className="flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold"
          style={{ background: palette.red[400], color: "rgb(var(--surface))" }}
        >
          {row.unread > 99 ? "99+" : row.unread}
        </span>
      )}
    </div>
    <p className="truncate text-[11px] text-text-muted">
      {row.last_sender === "admin" && <span className="text-text-primary/40">You: </span>}
      {row.last_body || <span className="italic opacity-60">No messages yet</span>}
    </p>
  </button>
);

// ── Right pane: who am I talking to ─────────────────────────────────
const UserContextStrip = ({ row }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-ink/[0.08] px-4 py-2.5">
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-text-primary">
        {row.username || `#${row.user_id}`}
      </span>
      <Badge variant="role" value={row.role} size="xs">
        {row.role}
      </Badge>
    </div>
    <Meta label="Plan" value={planLabel(row)} />
    <Meta label="Joined" value={fmtDate(row.user_created_at)} />
    <Meta label="Last active" value={fmtAgo(row.last_active_at)} />
    <div className="flex items-center gap-1.5">
      <TelegramIcon size={12} colored={!!row.telegram_id} />
      <span className="font-mono text-[10px] text-text-muted">
        {row.telegram_username
          ? `@${row.telegram_username}`
          : row.telegram_id
            ? `id:${row.telegram_id}`
            : "not linked"}
      </span>
    </div>
  </div>
);

const Meta = ({ label, value }) => (
  <div className="flex items-baseline gap-1.5">
    <span className="font-mono text-[9px] uppercase tracking-wider text-text-primary/40">
      {label}
    </span>
    <span className="text-[11px] text-text-primary/80">{value}</span>
  </div>
);

// ── Tab ─────────────────────────────────────────────────────────────
export const ChatTab = ({ canWrite = true, onRefreshUnread }) => {
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState(null); // conversation row
  const [messages, setMessages] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  const scrollRef = useRef(null);
  const cursorRef = useRef(0);
  const selectedIdRef = useRef(null);

  // ── list ──────────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    const f = FILTERS.find((x) => x.id === filter) || FILTERS[0];
    try {
      const data = await adminChatApi.listConversations({
        ...f.params,
        search: search.trim() || null,
        limit: 100,
      });
      setItems(data.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoadingList(false);
    }
  }, [filter, search]);

  useEffect(() => {
    setLoadingList(true);
    loadList();
  }, [loadList]);

  useEffect(() => {
    const id = setInterval(loadList, LIST_POLL_MS);
    return () => clearInterval(id);
  }, [loadList]);

  // ── thread ────────────────────────────────────────────────────────
  const openConversation = useCallback(async (row) => {
    setSelected(row);
    selectedIdRef.current = row.id;
    setMessages([]);
    setErr("");
    cursorRef.current = 0;
    setLoadingThread(true);
    try {
      const data = await adminChatApi.getMessages(row.id, 0);
      // A slow response for a conversation the admin already clicked away from
      // must not paint over the one they're looking at now.
      if (selectedIdRef.current !== row.id) return;
      setMessages(data.messages || []);
      cursorRef.current = data.last_seq || 0;
      if (data.last_seq) {
        await adminChatApi.markRead(row.id, data.last_seq);
        loadList();
        onRefreshUnread?.();
      }
    } catch {
      setErr("Couldn't load this conversation.");
    } finally {
      if (selectedIdRef.current === row.id) setLoadingThread(false);
    }
  }, [loadList, onRefreshUnread]);

  // Tail poll for the open thread.
  useEffect(() => {
    if (!selected) return undefined;
    const id = setInterval(async () => {
      try {
        const data = await adminChatApi.getMessages(selected.id, cursorRef.current);
        const batch = data.messages || [];
        if (!batch.length || selectedIdRef.current !== selected.id) return;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.seq));
          return [...prev, ...batch.filter((m) => !seen.has(m.seq))];
        });
        cursorRef.current = Math.max(cursorRef.current, ...batch.map((m) => m.seq));
        await adminChatApi.markRead(selected.id, cursorRef.current);
        onRefreshUnread?.();
      } catch {
        // Transient — the next tick re-asks from the same cursor.
      }
    }, THREAD_POLL_MS);
    return () => clearInterval(id);
  }, [selected, onRefreshUnread]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendReply = async () => {
    const body = reply.trim();
    if (!body || sending || !selected) return;
    setSending(true);
    setErr("");
    try {
      const data = await adminChatApi.sendMessage(selected.id, body, newClientMsgId());
      setMessages((prev) => [...prev, data.message]);
      cursorRef.current = Math.max(cursorRef.current, data.message.seq);
      setReply("");
      loadList();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Reply didn't send.");
    } finally {
      setSending(false);
    }
  };

  const toggleClosed = async () => {
    if (!selected) return;
    const next = selected.status === "closed" ? "open" : "closed";
    try {
      await adminChatApi.setStatus(selected.id, next);
      setSelected({ ...selected, status: next });
      loadList();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Couldn't change status.");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* ── Left: inbox ── */}
      <Surface className="flex h-[640px] flex-col overflow-hidden">
        <div className="space-y-2 border-b border-ink/[0.08] p-3">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search username or email…"
            Icon={SearchIcon}
          />
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  filter === f.id
                    ? "bg-ink/[0.1] text-text-primary"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loadingList ? (
            <div className="p-4">
              <LoadingState label="Loading conversations…" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="No conversations"
              description="When someone starts a chat from the app, it lands here."
              tone={NEUTRAL}
            />
          ) : (
            items.map((row) => (
              <ConversationRow
                key={row.id}
                row={row}
                active={selected?.id === row.id}
                onClick={() => openConversation(row)}
              />
            ))
          )}
        </div>
      </Surface>

      {/* ── Right: thread ── */}
      <Surface className="flex h-[640px] flex-col overflow-hidden">
        {!selected ? (
          <EmptyState
            title="Pick a conversation"
            description="Select someone on the left to read and reply."
            tone={NEUTRAL}
            className="my-auto"
          />
        ) : (
          <>
            <UserContextStrip row={selected} />

            <div className="flex items-center gap-2 border-b border-ink/[0.06] px-4 py-1.5">
              <Badge variant="status" value={selected.status} size="xs">
                {selected.status}
              </Badge>
              {canWrite && (
                <button
                  onClick={toggleClosed}
                  className="ml-auto font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-text-primary"
                >
                  {selected.status === "closed" ? "Reopen" : "Close thread"}
                </button>
              )}
            </div>

            <div
              ref={scrollRef}
              className="custom-scrollbar flex-1 space-y-2.5 overflow-y-auto px-4 py-4"
            >
              {loadingThread ? (
                <LoadingState label="Loading messages…" />
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-xs text-text-muted">No messages yet.</p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.sender === "user" ? "justify-start" : "justify-end"}`}
                  >
                    <div className="max-w-[70%]">
                      <div
                        className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                          m.sender === "user"
                            ? "border border-ink/[0.06] bg-ink/[0.05] text-text-primary/90"
                            : m.sender === "system"
                              ? "border border-ink/[0.06] bg-ink/[0.03] italic text-text-muted"
                              : "bg-accent font-medium text-accent-fg"
                        }`}
                      >
                        {m.body}
                      </div>
                      <div
                        className={`mt-0.5 flex gap-1.5 px-1 ${
                          m.sender === "user" ? "justify-start" : "justify-end"
                        }`}
                      >
                        <span className="font-mono text-[9px] text-text-muted/60">
                          {m.sender === "user" ? selected.username : m.sender} · {fmtTime(m.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-ink/[0.08] p-3">
              {err && <p className="mb-2 px-1 text-[11px] text-neg-text">{err}</p>}
              {!canWrite ? (
                // View-only staff can read every thread but not reply — the
                // server rejects the write anyway, so don't offer the box.
                <p className="py-1 text-center text-[11px] text-text-muted">
                  View-only staff cannot reply.
                </p>
              ) : (
                <div className="flex items-end gap-2">
                  <textarea
                    rows={2}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    placeholder="Write a reply…  (Enter to send, Shift+Enter for a new line)"
                    className={`${inputCls} max-h-32 flex-1 resize-none`}
                  />
                  <button
                    onClick={sendReply}
                    disabled={sending || !reply.trim()}
                    className="lq-cta-md h-10 px-4 text-xs disabled:opacity-30"
                  >
                    {sending ? <Spinner size={13} /> : "Send"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </Surface>
    </div>
  );
};

export default ChatTab;
