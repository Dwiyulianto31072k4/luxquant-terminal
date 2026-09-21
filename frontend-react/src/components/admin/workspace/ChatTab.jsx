// ════════════════════════════════════════════════════════════════════
// ChatTab — admin inbox for the in-app support chat
// The inbox is the page; a conversation opens as a large modal over it, the
// same shell as the signal modal. It used to be a right-hand pane sized
// 100dvh − 10rem inside a workspace whose header and live-pulse strip already
// took more than that, so the reply box sat below the fold on every screen.
// Postgres is the source of truth, so a reply typed here and (phase 2) a reply
// typed in the Telegram topic mirror land in the same thread.
// Backend: /api/v1/admin/chat
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "../../../hooks/useDialog";
import { adminApi } from "../../../services/adminApi";
import { DISCORD_PREMIUM_LABEL } from "../users/helpers";
import { adminChatApi } from "../../../services/adminChatApi";
import { NEUTRAL } from "../designSystem";
import { Surface, Avatar, Badge, EmptyState, LoadingState, SearchInput, Spinner } from "../primitives";
import { SearchIcon } from "../Icons";
import Modal from "../../ui/Modal";
import { Z } from "../../../constants/zIndex";
import {
  ChatImageLightbox,
  ChatImageSendModal,
  ChatMessageBody,
  isChatImage,
} from "../../chat/ChatMessageContent";

// Conversations refresh faster than the workspace shell's 60s: a stale support
// list is a slow reply, which is the one metric this feature lives on.
const LIST_POLL_MS = 30000;
const THREAD_POLL_MS = 5000;

const FILTERS = [
  { id: "all", label: "All", params: {} },
  { id: "needs_reply", label: "Needs reply", params: { needsReplyOnly: true } },
  { id: "unread", label: "Unread", params: { unreadOnly: true } },
  { id: "awaiting_read", label: "Awaiting read", params: { awaitingReadOnly: true } },
  { id: "active_unread", label: "Active · unread", params: { activeUnreadOnly: true } },
  { id: "open", label: "Open", params: { status: "open" } },
  { id: "closed", label: "Closed", params: { status: "closed" } },
];

const READ_STATE_META = {
  needs_reply: { label: "Needs reply", cls: "bg-loss/15 text-loss border-loss/25" },
  unread: { label: "Unread", cls: "bg-accent/15 text-accent border-accent/25" },
  active_unread: { label: "Active · unread", cls: "bg-accent/20 text-accent border-accent/35" },
  awaiting_read: { label: "Awaiting read", cls: "bg-ink/[0.06] text-text-muted border-ink/10" },
  seen: { label: "Seen", cls: "bg-profit/12 text-profit border-profit/20" },
  empty: { label: "Empty", cls: "bg-ink/[0.04] text-text-muted border-ink/8" },
};

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
  if (row.subscription_source === "discord_premium") return DISCORD_PREMIUM_LABEL;
  if (!row.subscription_expires_at) return "Lifetime";
  const exp = new Date(row.subscription_expires_at);
  return exp < new Date() ? `Expired ${fmtDate(exp)}` : `Until ${fmtDate(exp)}`;
};

const inputCls =
  "w-full rounded-xl border border-ink/[0.08] bg-surface-raised px-3 py-2.5 text-xs text-text-primary " +
  "placeholder:text-text-muted/50 focus:outline-none focus:border-ink/15 transition-colors";

// ── Start a chat with someone who has never written in ──────────────
const NewChatModal = ({ isOpen, onClose, onStarted }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null);
  const [thread, setThread] = useState(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setResults([]);
    setPicked(null);
    setThread(null);
    setBody("");
    setErr("");
  }, [isOpen]);

  // Debounced so typing a username doesn't fire a request per keystroke.
  useEffect(() => {
    if (!isOpen || picked) return undefined;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return undefined;
    }
    setSearching(true);
    const t = setTimeout(() => {
      adminApi
        .getUsers({ search: q, pageSize: 8 })
        .then((d) => setResults(d.users || []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, isOpen, picked]);

  const pick = async (u) => {
    setPicked(u);
    setErr("");
    try {
      setThread(await adminChatApi.getUserThread(u.id));
    } catch {
      setThread(null);
    }
  };

  const send = async () => {
    const text = body.trim();
    if (!text || sending || !picked) return;
    setSending(true);
    setErr("");
    try {
      const r = await adminChatApi.startConversation(picked.id, text, newClientMsgId());
      onStarted(r.conversation_id);
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Couldn't start the chat.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Start a chat"
      subtitle="Reaches any account — no Telegram, Discord or email needed"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          {err && <span className="mr-auto text-[11px] text-neg-text">{err}</span>}
          <button onClick={onClose} className="px-3 py-2 text-xs text-text-muted hover:text-text-primary">
            Cancel
          </button>
          <button
            onClick={send}
            disabled={sending || !picked || !body.trim()}
            className="lq-cta-md px-4 py-2 text-xs disabled:opacity-30"
          >
            {sending ? <Spinner size={13} /> : "Send"}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {!picked ? (
          <>
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search username or email…"
              Icon={SearchIcon}
              autoFocus
            />
            {searching && <LoadingState label="Searching…" />}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <p className="py-4 text-center text-xs text-text-muted">No users match that.</p>
            )}
            <div className="max-h-64 overflow-y-auto custom-scrollbar rounded-xl border border-ink/[0.07] bg-surface-raised">
              {results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => pick(u)}
                  className="flex w-full items-center gap-2.5 border-b border-ink/[0.06] px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-ink/[0.03]"
                >
                  <span className="truncate text-xs font-semibold text-text-primary">{u.username}</span>
                  <Badge variant="role" value={u.role} size="xs">
                    {u.role}
                  </Badge>
                  <span className="ml-auto truncate font-mono text-[10px] text-text-muted">
                    {u.email}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5 rounded-xl border border-ink/[0.08] bg-surface-secondary/40 px-3 py-2.5">
              <span className="text-xs font-semibold text-text-primary">{picked.username}</span>
              <Badge variant="role" value={picked.role} size="xs">
                {picked.role}
              </Badge>
              {thread?.exists && (
                <span className="font-mono text-[10px] text-text-muted">
                  {thread.message_count} message{thread.message_count === 1 ? "" : "s"} already
                </span>
              )}
              <button
                onClick={() => {
                  setPicked(null);
                  setThread(null);
                }}
                className="ml-auto font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-text-primary"
              >
                Change
              </button>
            </div>
            <textarea
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Hi ${picked.username} — …`}
              autoFocus
              className={`${inputCls} resize-none`}
            />
            <p className="text-[10px] leading-relaxed text-text-muted">
              They'll see it in the chat panel. If they don't open it within a couple of minutes
              they get a notification, plus a Telegram DM when the bot can reach them.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
};

// ── Settings ────────────────────────────────────────────────────────
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const labelCls = "block text-[10px] uppercase tracking-wider text-text-primary/40 font-mono mb-1.5";

const SettingsModal = ({ isOpen, onClose }) => {
  const [form, setForm] = useState(null);
  const [hoursOn, setHoursOn] = useState(false);
  const [tz, setTz] = useState("Asia/Jakarta");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  const [days, setDays] = useState([0, 1, 2, 3, 4]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setErr("");
    adminChatApi
      .getSettings()
      .then((s) => {
        setForm(s);
        const oh = s.office_hours;
        if (oh?.days?.length) {
          setHoursOn(true);
          setTz(oh.tz || "Asia/Jakarta");
          setStart(oh.days[0].start || "09:00");
          setEnd(oh.days[0].end || "18:00");
          setDays(oh.days.map((d) => Number(d.d)));
        } else {
          setHoursOn(false);
        }
      })
      .catch((e) => setErr(e?.response?.data?.detail || "Couldn't load settings."));
  }, [isOpen]);

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await adminChatApi.updateSettings({
        away_enabled: !!form.away_enabled,
        away_message: form.away_message || null,
        welcome_message: form.welcome_message || null,
        nudge_after_min: Number(form.nudge_after_min) || 0,
        autoreply_cooldown_min: Number(form.autoreply_cooldown_min) || 0,
        // null means "always away" — the honest default for a one-person desk.
        office_hours: hoursOn && days.length ? { tz, days: days.map((d) => ({ d, start, end })) } : null,
      });
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (i) =>
    setDays((prev) => (prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort()));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Chat settings"
      subtitle="Away replies, follow-up timing, and the greeting users see"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          {err && <span className="mr-auto text-[11px] text-neg-text">{err}</span>}
          <button onClick={onClose} className="px-3 py-2 text-xs text-text-muted hover:text-text-primary">
            Cancel
          </button>
          <button onClick={save} disabled={saving || !form} className="lq-cta-md px-4 py-2 text-xs disabled:opacity-30">
            {saving ? <Spinner size={13} /> : "Save"}
          </button>
        </div>
      }
    >
      {!form ? (
        <LoadingState label="Loading settings…" />
      ) : (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Welcome message</label>
            <textarea
              rows={2}
              value={form.welcome_message || ""}
              onChange={(e) => setForm({ ...form, welcome_message: e.target.value })}
              placeholder="Shown in an empty chat panel before anyone types."
              className={`${inputCls} resize-none`}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={!!form.away_enabled}
              onChange={(e) => setForm({ ...form, away_enabled: e.target.checked })}
            />
            <span className="text-xs text-text-primary">Send an away reply when nobody is at the desk</span>
          </label>

          {form.away_enabled && (
            <div className="space-y-3 border-l-2 border-ink/[0.08] pl-3">
              <div>
                <label className={labelCls}>Away message</label>
                <textarea
                  rows={3}
                  value={form.away_message || ""}
                  onChange={(e) => setForm({ ...form, away_message: e.target.value })}
                  placeholder="Leave blank to use the default."
                  className={`${inputCls} resize-none`}
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={hoursOn} onChange={(e) => setHoursOn(e.target.checked)} />
                <span className="text-xs text-text-primary">Only outside office hours</span>
              </label>
              <p className="text-[10px] leading-relaxed text-text-muted">
                Off means every message gets the away reply — the honest setting for a one-person
                desk. Turn it on only if you reliably answer live during these hours.
              </p>

              {hoursOn && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className={labelCls}>Timezone</label>
                      <input value={tz} onChange={(e) => setTz(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>From</label>
                      <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>To</label>
                      <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((d, i) => (
                      <button
                        key={d}
                        onClick={() => toggleDay(i)}
                        className={`rounded-xl border px-2.5 py-1.5 font-mono text-[10px] transition-colors ${
                          days.includes(i)
                            ? "border-ink/14 bg-surface-secondary text-text-primary"
                            : "border-ink/[0.07] bg-surface-raised text-text-muted hover:border-ink/12 hover:text-text-primary"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className={labelCls}>Don't repeat the away reply for (minutes)</label>
                <input
                  type="number"
                  min={0}
                  value={form.autoreply_cooldown_min ?? 120}
                  onChange={(e) => setForm({ ...form, autoreply_cooldown_min: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Alert me when someone has waited (minutes)</label>
            <input
              type="number"
              min={0}
              value={form.nudge_after_min ?? 30}
              onChange={(e) => setForm({ ...form, nudge_after_min: e.target.value })}
              className={inputCls}
            />
            <p className="mt-1 text-[10px] text-text-muted">
              Sends you a Telegram DM and an in-app alert. 0 turns it off.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ── Tab ─────────────────────────────────────────────────────────────
export const ChatTab = ({ canWrite = true, onRefreshUnread }) => {
  const [items, setItems] = useState([]);
  const [listTotal, setListTotal] = useState(0);
  const [inboxLimit, setInboxLimit] = useState(60);
  const [loadingList, setLoadingList] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState(null); // conversation row
  const [messages, setMessages] = useState([]);
  const [userLastReadSeq, setUserLastReadSeq] = useState(0);
  const [loadingThread, setLoadingThread] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [hasMoreBefore, setHasMoreBefore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [mediaSending, setMediaSending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const scrollRef = useRef(null);
  const preserveScrollRef = useRef(null);
  const cursorRef = useRef(0);
  const replyFileRef = useRef(null);
  const threadRef = useRef(null);
  const replyRef = useRef(null);
  // Bulk read is confirmed rather than instant: it clears the whole queue and
  // there is no per-thread undo for it.
  const [confirmReadAll, setConfirmReadAll] = useState(false);
  const [readingAll, setReadingAll] = useState(false);
  const selectedIdRef = useRef(null);

  // ── list ──────────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    const f = FILTERS.find((x) => x.id === filter) || FILTERS[0];
    try {
      const data = await adminChatApi.listConversations({
        ...f.params,
        search: search.trim() || null,
        limit: inboxLimit,
      });
      setItems(data.items || []);
      setListTotal(Number(data.total) || 0);
    } catch {
      setItems([]);
    } finally {
      setLoadingList(false);
    }
  }, [filter, search, inboxLimit]);

  useEffect(() => {
    setInboxLimit(60);
  }, [filter, search]);

  useEffect(() => {
    setLoadingList(true);
    loadList();
  }, [loadList]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") loadList();
    }, LIST_POLL_MS);
    return () => clearInterval(id);
  }, [loadList]);

  // ── thread ────────────────────────────────────────────────────────
  const openConversation = useCallback(async (row) => {
    setSelected(row);
    setDeleteTarget(null);
    setPendingImage(null);
    setLightboxImage(null);
    selectedIdRef.current = row.id;
    setMessages([]);
    setUserLastReadSeq(Number(row.user_last_read_seq) || 0);
    setErr("");
    cursorRef.current = 0;
    setLoadingThread(true);
    try {
      const data = await adminChatApi.getMessages(row.id, 0);
      // A slow response for a conversation the admin already clicked away from
      // must not paint over the one they're looking at now.
      if (selectedIdRef.current !== row.id) return;
      setMessages(data.messages || []);
      cursorRef.current = Math.max(0, ...(data.messages || []).map((m) => Number(m.seq) || 0));
      setHasMoreBefore(!!data.has_more_before);
      setUserLastReadSeq(Number(data.user_last_read_seq) || 0);
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
        if (selectedIdRef.current !== selected.id) return;
        if (data.user_last_read_seq != null) {
          setUserLastReadSeq((prev) => Math.max(prev, Number(data.user_last_read_seq) || 0));
        }
        const batch = [...(data.messages || []), ...(data.message_updates || [])];
        if (!batch.length) return;
        setMessages((prev) => {
          const bySeq = new Map(prev.map((m) => [m.seq, m]));
          batch.forEach((m) => bySeq.set(m.seq, { ...(bySeq.get(m.seq) || {}), ...m }));
          return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
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
    // loadingThread too: the first batch arrives while the loading state is
    // still on screen, so scrolling on `messages` alone lands above the newest
    // message once the list actually renders.
  }, [messages, loadingThread]);

  const loadOlder = async () => {
    if (!selected || loadingOlder || !hasMoreBefore) return;
    const firstSeq = Math.min(...messages.map((m) => Number(m.seq)).filter(Number.isFinite));
    if (!Number.isFinite(firstSeq)) return;
    const node = scrollRef.current;
    if (node) preserveScrollRef.current = { height: node.scrollHeight, top: node.scrollTop };
    setLoadingOlder(true);
    setErr("");
    try {
      const data = await adminChatApi.getMessages(selected.id, 0, 100, firstSeq);
      const batch = data.messages || [];
      if (selectedIdRef.current !== selected.id) return;
      setMessages((prev) => {
        const bySeq = new Map([...batch, ...prev].map((m) => [m.seq, m]));
        return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
      });
      setHasMoreBefore(!!data.has_more_before);
      if (!batch.length) preserveScrollRef.current = null;
    } catch (e) {
      preserveScrollRef.current = null;
      setErr(e?.response?.data?.detail || "Couldn't load older messages.");
    } finally {
      setLoadingOlder(false);
    }
  };

  const sendReply = async (bodyOverride = null, kind = "text") => {
    // An override is a string or it is nothing. Checked by type rather than
    // against null: a handler wired by reference hands this a React event,
    // which is not null, and .trim() on it throws above the try block where
    // nothing catches it — the button just stops working, silently.
    const fromInput = typeof bodyOverride !== "string";
    const body = (fromInput ? reply : bodyOverride).trim();
    if (!body || sending || !selected) return;
    setSending(true);
    setErr("");
    try {
      const data = await adminChatApi.sendMessage(selected.id, body, newClientMsgId(), kind);
      setMessages((prev) => [...prev, data.message]);
      cursorRef.current = Math.max(cursorRef.current, data.message.seq);
      if (fromInput) setReply("");
      loadList();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Reply didn't send.");
    } finally {
      setSending(false);
    }
  };

  // Upload, then send the URL as an image message — same two-step the user
  // panel uses, so a failed send never re-uploads the file.
  const sendImage = async (file) => {
    if (!file || sending || !selected) return;
    setErr("");
    try {
      const { url } = await adminChatApi.uploadImage(file);
      if (!url) throw new Error("Upload returned no URL");
      await sendReply(url, "image");
    } catch (e) {
      setErr(e?.response?.data?.detail || "Couldn't send that image.");
      throw e;
    }
  };

  const sendPendingImage = async () => {
    if (!pendingImage || mediaSending) return;
    setMediaSending(true);
    try {
      await sendImage(pendingImage);
      setPendingImage(null);
    } catch {
      // Keep the preview open; sendImage owns the visible error message.
    } finally {
      setMediaSending(false);
    }
  };

  const deleteMessage = async () => {
    if (!selected || !deleteTarget || deleting) return;
    setDeleting(true);
    setErr("");
    try {
      const data = await adminChatApi.deleteMessage(selected.id, deleteTarget.id);
      setMessages((prev) =>
        prev.map((message) => (message.id === deleteTarget.id ? data.message : message))
      );
      if (isChatImage(deleteTarget) && lightboxImage === deleteTarget.body) setLightboxImage(null);
      setDeleteTarget(null);
      loadList();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Couldn't delete that message.");
    } finally {
      setDeleting(false);
    }
  };

  const closeThread = useCallback(() => {
    setSelected(null);
    selectedIdRef.current = null;
    setReply("");
    setErr("");
  }, []);

  // Escape, focus trap, scroll lock and focus return all come from useDialog.
  // Escape is left to the image lightbox and the confirm dialogs while they are
  // up, so pressing it there closes that layer, not the whole conversation.
  useDialog({
    isOpen: !!selected,
    onClose: closeThread,
    ref: threadRef,
    closeOnEscape: !lightboxImage && !pendingImage && !deleteTarget,
  });

  // Walk the inbox without leaving the conversation: the same order as the
  // list behind the modal, so "next" is always the row underneath.
  const selectedIndex = useMemo(
    () => (selected ? items.findIndex((row) => row.id === selected.id) : -1),
    [items, selected]
  );
  const prevRow = selectedIndex > 0 ? items[selectedIndex - 1] : null;
  const nextRow = selectedIndex >= 0 && selectedIndex < items.length - 1 ? items[selectedIndex + 1] : null;

  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (e) => {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      const target = e.key === "ArrowUp" ? prevRow : nextRow;
      if (!target) return;
      e.preventDefault();
      openConversation(target);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected, prevRow, nextRow, openConversation]);

  // Put the cursor in the reply box once the thread has loaded, so the admin
  // can read the last message and start typing without reaching for the mouse.
  useEffect(() => {
    if (selected && !loadingThread && canWrite) {
      requestAnimationFrame(() => replyRef.current?.focus({ preventScroll: true }));
    }
  }, [selected, loadingThread, canWrite]);

  const markAllRead = async () => {
    if (readingAll) return;
    setReadingAll(true);
    setErr("");
    try {
      const data = await adminChatApi.markAllRead();
      setConfirmReadAll(false);
      // Refresh both the list and the tab badge — the badge is owned by the
      // parent, so clearing here without telling it leaves a stale 99+.
      await loadList();
      onRefreshUnread?.();
      if (!data?.cleared) setErr("Nothing was unread.");
    } catch (e) {
      setErr(e?.response?.data?.detail || "Couldn't mark everything read.");
    } finally {
      setReadingAll(false);
    }
  };

  const markUnread = async () => {
    if (!selected) return;
    setErr("");
    try {
      await adminChatApi.markUnread(selected.id);
      // Close the thread first. The open-thread poll marks read on every tick,
      // so staying here would undo this within a second.
      setSelected(null);
      selectedIdRef.current = null;
      await loadList();
      onRefreshUnread?.();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Couldn't mark it unread.");
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

  const displayName = selected ? selected.username || `#${selected.user_id}` : "";
  const dayGroups = groupByDay(messages);

  const threadModal = selected
    ? createPortal(
        <div className="lq-chat-overlay">
          <div className="lq-chat-backdrop" onClick={closeThread} aria-hidden="true" />
          <div className="lq-chat-container">
            <div
              ref={threadRef}
              className="lq-chat-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={`Conversation with ${displayName}`}
              tabIndex={-1}
            >
              {/* ── Header: who, where in the inbox, what can be done ── */}
              <header className="flex shrink-0 items-center gap-3 border-b border-ink/[0.08] bg-surface-raised px-3 py-2.5 sm:px-5 sm:py-3">
                <Avatar src={selected.avatar_url} name={displayName} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <h2 className="truncate text-[15px] font-semibold text-text-primary sm:text-base">{displayName}</h2>
                    <Badge variant="role" value={selected.role} size="xs">{selected.role}</Badge>
                    {selected.status === "closed" ? (
                      <span className="rounded border border-ink/10 bg-ink/[0.05] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-text-muted">Closed</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-text-muted">
                    {selected.user_active_unread ? "Online recently" : `Last active ${fmtAgo(selected.last_active_at)}`}
                    {" · "}
                    {planLabel(selected)}
                  </p>
                </div>

                <div className="hidden items-center gap-1 sm:flex">
                  <IconButton
                    label={prevRow ? `Previous: ${prevRow.username || `#${prevRow.user_id}`} (Alt+↑)` : "No previous conversation"}
                    onClick={() => prevRow && openConversation(prevRow)}
                    disabled={!prevRow}
                  >
                    <path d="M6 12.5 10 8.5l4 4" />
                  </IconButton>
                  <span className="min-w-[3.5rem] text-center font-mono text-[11px] text-text-muted">
                    {selectedIndex >= 0 ? `${selectedIndex + 1} / ${items.length}` : "—"}
                  </span>
                  <IconButton
                    label={nextRow ? `Next: ${nextRow.username || `#${nextRow.user_id}`} (Alt+↓)` : "No next conversation"}
                    onClick={() => nextRow && openConversation(nextRow)}
                    disabled={!nextRow}
                  >
                    <path d="M6 8.5 10 12.5l4-4" />
                  </IconButton>
                </div>

                {canWrite ? (
                  <div className="flex items-center gap-1 border-l border-ink/[0.08] pl-2 sm:pl-3">
                    <IconButton label="Mark unread and close" onClick={markUnread}>
                      <path d="M3 5.5h14v9H3zM3.5 6l6.5 5 6.5-5" />
                    </IconButton>
                    <IconButton
                      label={selected.status === "closed" ? "Reopen thread" : "Close thread (nothing owed)"}
                      onClick={toggleClosed}
                      active={selected.status === "closed"}
                    >
                      {selected.status === "closed" ? (
                        <path d="M4 10.5 8 14.5 16 5.5" />
                      ) : (
                        <path d="M4 5.5h12v11H4zM3 3.5h14v3H3zM8 9h4" />
                      )}
                    </IconButton>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={closeThread}
                  aria-label="Close conversation (Esc)"
                  title="Close (Esc)"
                  className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/[0.1] bg-surface-secondary text-text-muted transition-colors hover:border-ink/20 hover:text-text-primary"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                    <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </button>
              </header>

              <div className="flex min-h-0 flex-1">
                {/* ── Conversation ── */}
                <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <div
                    ref={scrollRef}
                    className="lq-chat-messages custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6"
                  >
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
                      {!loadingThread && hasMoreBefore && (
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={loadOlder}
                            disabled={loadingOlder}
                            className="rounded-full border border-ink/[0.08] bg-surface-raised px-3.5 py-1.5 text-[12px] text-text-muted shadow-sm transition-colors hover:text-text-primary disabled:opacity-50"
                          >
                            {loadingOlder ? "Loading…" : "Load earlier messages"}
                          </button>
                        </div>
                      )}
                      {loadingThread ? (
                        <LoadingState label="Loading messages…" />
                      ) : messages.length === 0 ? (
                        <div className="py-16 text-center">
                          <p className="text-[14px] font-medium text-text-primary">No messages yet</p>
                          <p className="mt-1 text-[13px] text-text-muted">Say hello — it lands in their app chat and Telegram.</p>
                        </div>
                      ) : (
                        dayGroups.map((group) => (
                          <div key={group.key} className="flex flex-col gap-3">
                            <div className="flex items-center gap-3 py-1" role="separator" aria-label={group.label}>
                              <span className="h-px flex-1 bg-ink/[0.08]" aria-hidden="true" />
                              <span className="text-[11px] font-medium text-text-muted">{group.label}</span>
                              <span className="h-px flex-1 bg-ink/[0.08]" aria-hidden="true" />
                            </div>
                            {group.items.map((m) => (
                              <MessageBubble
                                key={m.id}
                                m={m}
                                who={m.sender === "user" ? displayName : m.sender}
                                seen={m.sender === "admin" && m.seq != null ? userLastReadSeq >= m.seq : null}
                                canDelete={canWrite && m.sender !== "system" && !m.deleted && !m.expired && !["deleted", "expired_image"].includes(m.kind)}
                                onDelete={() => setDeleteTarget(m)}
                                onOpenImage={setLightboxImage}
                              />
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* ── Composer: always on screen, never below the fold ── */}
                  <div
                    style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
                    className="shrink-0 border-t border-ink/[0.08] bg-surface-raised px-3 pt-3 sm:px-6"
                  >
                    <div className="mx-auto w-full max-w-3xl">
                      {err && <p className="mb-2 px-1 text-[12px] text-loss" role="alert">{err}</p>}
                      {!canWrite ? (
                        <p className="py-2 text-center text-[12px] text-text-muted">View-only staff cannot reply.</p>
                      ) : (
                        <>
                          <div className="flex items-end gap-2 rounded-2xl border border-ink/[0.1] bg-surface-secondary/50 p-1.5 transition-colors focus-within:border-accent/50 focus-within:bg-surface-raised">
                            <input
                              ref={replyFileRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                // Reset first so picking the same file twice still fires.
                                e.target.value = "";
                                if (f) setPendingImage(f);
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => replyFileRef.current?.click()}
                              disabled={sending || mediaSending}
                              title="Attach an image"
                              aria-label="Attach an image"
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-ink/5 hover:text-text-primary disabled:opacity-30"
                            >
                              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                              </svg>
                            </button>
                            <textarea
                              ref={replyRef}
                              rows={1}
                              value={reply}
                              onChange={(e) => {
                                setReply(e.target.value);
                                e.target.style.height = "auto";
                                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                                  e.preventDefault();
                                  sendReply();
                                }
                              }}
                              placeholder={`Reply to ${displayName}…`}
                              aria-label={`Reply to ${displayName}`}
                              /* 15px is also the floor below which iOS zooms the
                                 whole page on focus. */
                              className="lq-chat-input max-h-[200px] min-h-10 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-[1.45] text-text-primary placeholder:text-text-muted/60 focus:outline-none"
                            />
                            <button
                              // Wrapped, not passed by reference: React hands the
                              // click event to the first parameter (bodyOverride).
                              onClick={() => sendReply()}
                              disabled={sending || !reply.trim()}
                              className="lq-cta-md flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] disabled:opacity-35 sm:px-4"
                            >
                              {sending ? (
                                <Spinner size={14} />
                              ) : (
                                <>
                                  <span className="hidden sm:inline">Send</span>
                                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                                    <path d="M3.5 10 16 4.5l-3.5 11-2.1-4-6.9-1.5Zm6.9 1.5L16 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </>
                              )}
                            </button>
                          </div>
                          <p className="mt-1.5 hidden px-1 text-[11px] text-text-muted sm:block">
                            <kbd className="lq-kbd">Enter</kbd> send · <kbd className="lq-kbd">Shift</kbd>+<kbd className="lq-kbd">Enter</kbd> new line · <kbd className="lq-kbd">Alt</kbd>+<kbd className="lq-kbd">↑</kbd>/<kbd className="lq-kbd">↓</kbd> other conversations · <kbd className="lq-kbd">Esc</kbd> close
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </section>

                {/* ── Who this is: everything needed to answer well ── */}
                <aside className="custom-scrollbar hidden w-[300px] shrink-0 overflow-y-auto border-l border-ink/[0.08] bg-surface-secondary/30 xl:block">
                  <ContextPanel row={selected} messages={messages} />
                </aside>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
    <style>{`
      /* ── Conversation modal: the signal modal's shell ─────────────────── */
      .lq-chat-overlay { position: fixed; inset: 0; z-index: 200000; display: flex; isolation: isolate; }
      @supports (height: 100dvh) { .lq-chat-overlay { height: 100dvh; } }
      .lq-chat-backdrop {
        position: absolute; inset: 0;
        background: rgb(var(--scrim) / var(--lq-scrim-alpha));
        backdrop-filter: blur(var(--lq-scrim-blur));
        -webkit-backdrop-filter: blur(var(--lq-scrim-blur));
        animation: lqChatFade .18s ease-out;
      }
      .lq-chat-container {
        position: relative; z-index: 1; width: 100%; height: 100%;
        display: flex; align-items: flex-end; justify-content: center;
        padding: var(--lq-modal-top) 0 0; pointer-events: none;
      }
      .lq-chat-container > * { pointer-events: auto; }
      .lq-chat-sheet {
        position: relative; width: 100%; max-width: 100%;
        height: min(var(--lq-modal-maxh), 100%); max-height: min(var(--lq-modal-maxh), 100%);
        display: flex; flex-direction: column; overflow: hidden;
        background: rgb(var(--surface-raised)); color: rgb(var(--fg));
        border-top: 1px solid rgb(var(--ink) / 0.12); border-radius: 16px 16px 0 0;
        box-shadow: 0 -12px 40px rgb(var(--scrim) / 0.4);
        animation: lqChatRise .22s cubic-bezier(.2,.8,.2,1);
      }
      .lq-chat-sheet:focus { outline: none; }
      @media (min-width: 640px) {
        .lq-chat-container { align-items: center; padding: var(--lq-modal-top) 16px 16px; }
        .lq-chat-sheet {
          max-width: 1120px; border-radius: 16px; border: 1px solid rgb(var(--ink) / 0.12);
          height: min(var(--lq-modal-maxh), 900px, 100%); max-height: min(var(--lq-modal-maxh), 900px, 100%);
          box-shadow: 0 24px 64px rgb(var(--scrim) / 0.45);
        }
      }
      @media (min-width: 1024px) {
        .lq-chat-container { padding: var(--lq-modal-top) 24px 24px; }
        .lq-chat-sheet { height: min(88dvh, 880px, 100%); }
      }
      @media (min-width: 1280px) { .lq-chat-sheet { max-width: 1240px; } }
      .lq-chat-messages { background: rgb(var(--surface-secondary) / 0.35); }
      /* The composer frame carries the focus state (focus-within border), so the
         global focus ring on the textarea inside it would draw a second box. */
      .lq-chat-sheet .lq-chat-input:focus,
      .lq-chat-sheet .lq-chat-input:focus-visible { outline: none !important; box-shadow: none !important; }
      .lq-kbd {
        display: inline-block; min-width: 1.25rem; padding: 0 .3rem; border-radius: 4px;
        border: 1px solid rgb(var(--ink) / 0.14); background: rgb(var(--surface-raised));
        font: 500 10px/1.5 var(--font-mono, ui-monospace, monospace); text-align: center;
      }
      @keyframes lqChatFade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes lqChatRise { from { opacity: 0; transform: translateY(12px) scale(.99); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) {
        .lq-chat-backdrop, .lq-chat-sheet { animation: none; }
      }

      /* ── Inbox below lg: one screen tall, the list scrolls inside ─────────
         Without a fixed height the whole page scrolled, taking the search and
         filters away with it, and the product bottom nav sat over the last
         rows. The old rule hid ".bottom-nav", a class nothing carries, so the
         nav was never actually hidden; Header's nav now has .lq-bottom-nav. */
      @media (max-width: 1023px) {
        body.lq-admin-chat-active .lq-bottom-nav { display: none !important; }
        body.lq-admin-chat-active main:has(.admin-chat-workspace) { padding-bottom: 0 !important; }
        .admin-chat-workspace {
          height: calc(100dvh - var(--lq-header-h) - 0.75rem) !important;
          min-height: 0 !important;
          overflow: hidden !important;
          padding-bottom: 0.75rem !important;
        }
        .admin-chat-workspace .admin-workspace-content,
        .admin-chat-workspace .admin-workspace-view { min-height: 0 !important; height: 100% !important; }
        /* The content pane reserves room for the bottom nav, which is hidden here. */
        .admin-chat-workspace .admin-workspace-content { padding-bottom: 0 !important; }
      }
    `}</style>
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
      zIndex={Z.lightbox}
      title="Delete this message?"
      subtitle="The sequence and read receipts stay intact"
      size="sm"
      footer={
        <div className="flex w-full justify-end gap-2">
          <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting} className="px-3 py-2 text-xs text-text-muted hover:text-text-primary">Cancel</button>
          <button type="button" onClick={deleteMessage} disabled={deleting} className="rounded-lg bg-loss px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{deleting ? "Deleting…" : "Delete message"}</button>
        </div>
      }
    >
      <p className="line-clamp-4 text-xs leading-relaxed text-text-muted">
        {isChatImage(deleteTarget) ? "The image file and its message will be removed." : deleteTarget?.body}
      </p>
    </Modal>
    <Modal
      isOpen={confirmReadAll}
      onClose={() => setConfirmReadAll(false)}
      title="Mark everything read?"
      subtitle="Clears the unread badge across the whole inbox"
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setConfirmReadAll(false)}
            className="px-3 py-2 text-xs text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={markAllRead}
            disabled={readingAll}
            className="lq-cta-md px-4 py-2 text-[11px] uppercase tracking-wider disabled:opacity-50"
          >
            {readingAll ? "Marking…" : "Mark all read"}
          </button>
        </div>
      }
    >
      <p className="text-xs leading-relaxed text-text-muted">
        This only moves your own read markers — nobody is replied to and nothing
        is sent. Threads still waiting on a reply stay in the{" "}
        <span className="text-text-primary">Needs reply</span> filter, so they
        will not be lost.
      </p>
    </Modal>
    <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    <NewChatModal
      isOpen={newChatOpen}
      onClose={() => setNewChatOpen(false)}
      onStarted={async (conversationId) => {
        // Refresh the inbox, then open the thread we just created so the admin
        // lands inside the conversation instead of hunting for it in the list.
        const data = await adminChatApi
          .listConversations({ limit: 100 })
          .catch(() => null);
        if (data?.items) {
          setItems(data.items);
          const row = data.items.find((c) => c.id === conversationId);
          if (row) openConversation(row);
        }
      }}
    />
    {threadModal}

    {/* ── The inbox is the page ── */}
    <Surface padding="p-0" className="admin-chat-shell flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3 border-b border-ink/[0.07] p-3 sm:p-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 flex-1 lg:max-w-md">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search username or email…"
              Icon={SearchIcon}
            />
          </div>
          {canWrite && (
            <button
              onClick={() => setNewChatOpen(true)}
              className="lq-cta-md shrink-0 px-3.5 py-2 text-[12px] font-semibold"
            >
              + New chat
            </button>
          )}
        </div>
        <div className="no-scrollbar flex flex-nowrap items-center gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                filter === f.id
                  ? "bg-surface-secondary text-text-primary shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.1)]"
                  : "text-text-muted hover:bg-ink/[0.04] hover:text-text-primary"
              }`}
            >
              {f.label}
            </button>
          ))}
          {canWrite && (
            <>
              <span className="mx-1 h-4 w-px shrink-0 bg-ink/10" aria-hidden="true" />
              <button
                onClick={() => setConfirmReadAll(true)}
                title="Mark every conversation as read"
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] text-text-muted transition-colors hover:bg-ink/[0.04] hover:text-text-primary"
              >
                Read all
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                title="Chat settings"
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] text-text-muted transition-colors hover:bg-ink/[0.04] hover:text-text-primary"
              >
                Settings
              </button>
            </>
          )}
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {loadingList ? (
          <div className="p-4">
            <LoadingState label="Loading conversations…" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={search.trim() ? "No one matches that search" : "No conversations here"}
            description={search.trim() ? "Try a username or an email address." : "When someone starts a chat from the app, it lands here."}
            tone={NEUTRAL}
          />
        ) : (
          <>
            <ul role="list" className="divide-y divide-ink/[0.06]">
              {items.map((row) => (
                <li key={row.id}>
                  <InboxRow row={row} active={selected?.id === row.id} onOpen={() => openConversation(row)} />
                </li>
              ))}
            </ul>
            {items.length < listTotal && (
              <div className="p-3">
                <button
                  type="button"
                  onClick={() => setInboxLimit((value) => Math.min(value + 60, 200))}
                  disabled={inboxLimit >= 200}
                  className="w-full rounded-xl border border-ink/[0.08] bg-surface-raised px-3 py-2.5 text-[12px] text-text-muted transition-colors hover:bg-ink/[0.03] hover:text-text-primary disabled:opacity-40"
                >
                  {inboxLimit >= 200 ? `${listTotal - items.length} more — refine the search` : `Load more · ${items.length} of ${listTotal}`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Surface>
    </>
  );
};

// ── Inbox row: one line to decide whether to open it ──────────────────
const InboxRow = ({ row, active, onOpen }) => {
  const state = READ_STATE_META[row.read_state] || READ_STATE_META.empty;
  const adminUnread = row.admin_unread ?? row.unread ?? 0;
  const name = row.username || `#${row.user_id}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-3 text-left transition-colors sm:px-4 lg:grid-cols-[auto_minmax(180px,240px)_minmax(0,1fr)_auto] ${
        active ? "bg-accent/[0.08]" : adminUnread > 0 ? "bg-accent/[0.035] hover:bg-accent/[0.07]" : "hover:bg-ink/[0.03]"
      }`}
    >
      <Avatar src={row.avatar_url} name={name} size="md" />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`truncate text-[14px] text-text-primary ${adminUnread > 0 ? "font-semibold" : "font-medium"}`}>{name}</span>
          <Badge variant="role" value={row.role} size="xs">{row.role}</Badge>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <span className={`truncate rounded border px-1.5 py-0.5 text-[10px] font-medium ${state.cls}`}>{state.label}</span>
          {row.user_active_unread ? (
            <span className="truncate rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">Was online</span>
          ) : null}
        </div>
        {/* Below lg the preview sits under the name instead of in its own column. */}
        <p className="mt-1 truncate text-[13px] text-text-muted lg:hidden">
          {row.last_sender === "admin" && <span className="text-text-muted/70">You: </span>}
          {row.last_body || <span className="italic text-text-muted/60">No messages yet</span>}
        </p>
      </div>
      <p className="hidden min-w-0 truncate text-[13px] text-text-muted lg:block">
        {row.last_sender === "admin" && <span className="text-text-muted/70">You: </span>}
        {row.last_body || <span className="italic text-text-muted/60">No messages yet</span>}
        {row.awaiting_read && row.user_unread > 0 ? (
          <span className="ml-2 text-[11px] text-text-muted/70">· {row.user_unread} unread by them</span>
        ) : null}
      </p>
      <div className="flex flex-col items-end gap-1.5 self-start pt-0.5">
        <span className={`font-mono text-[11px] ${adminUnread > 0 ? "font-semibold text-accent-text" : "text-text-muted"}`}>
          {fmtAgo(row.last_message_at)}
        </span>
        {adminUnread > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 font-mono text-[10px] font-bold text-accent-fg">
            {adminUnread > 99 ? "99+" : adminUnread}
          </span>
        ) : null}
      </div>
    </button>
  );
};

// ── One message ──────────────────────────────────────────────────────
const MessageBubble = ({ m, who, seen, canDelete, onDelete, onOpenImage }) => {
  const mine = m.sender !== "user";
  const system = m.sender === "system";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`group relative flex max-w-[88%] flex-col sm:max-w-[78%] ${mine ? "items-end" : "items-start"}`}>
        <div
          className={`break-words rounded-2xl text-[15px] leading-[1.5] ${
            isChatImage(m) ? "overflow-hidden p-1" : "px-4 py-2.5"
          } ${
            system
              ? "border border-dashed border-ink/[0.12] bg-transparent text-[14px] italic text-text-muted"
              : mine
                ? "rounded-br-md bg-accent/[0.16] text-text-primary shadow-[inset_0_0_0_1px_rgb(var(--accent)/0.22)]"
                : "rounded-bl-md border border-ink/[0.08] bg-surface-raised text-text-primary shadow-sm"
          }`}
        >
          <ChatMessageBody
            message={m}
            onOpenImage={onOpenImage}
            imageClassName="max-h-[min(52dvh,460px)] max-w-[min(72vw,420px)]"
          />
        </div>
        <div className={`mt-1 flex items-center gap-1.5 px-1 text-[11px] text-text-muted ${mine ? "flex-row-reverse" : ""}`}>
          <span>{fmtTime(m.created_at)}</span>
          <span aria-hidden="true">·</span>
          <span className="font-medium">{who}</span>
          {seen === null ? null : (
            <span
              className={seen ? "text-profit" : "text-text-muted/60"}
              title={seen ? "They opened the chat and saw this" : "Delivered, not opened yet"}
            >
              {seen ? "✓✓ Seen" : "✓ Delivered"}
            </span>
          )}
          {canDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="ml-1 rounded px-1 text-text-muted/70 transition-opacity hover:text-loss sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
              aria-label="Delete message"
              title="Delete message"
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

// ── Right rail: the person, not the thread ──────────────────────────
const ContextPanel = ({ row, messages }) => {
  const state = READ_STATE_META[row.read_state] || null;
  const fromThem = messages.filter((m) => m.sender === "user").length;
  const fromUs = messages.filter((m) => m.sender === "admin").length;
  const first = messages.find((m) => m.created_at);
  const name = row.username || `#${row.user_id}`;
  const facts = [
    ["Plan", planLabel(row)],
    ["Role", row.role],
    ["Joined", fmtDate(row.user_created_at)],
    ["Last active", fmtAgo(row.last_active_at) === "now" ? "Just now" : `${fmtAgo(row.last_active_at)} ago`],
    [
      "Telegram",
      row.telegram_username ? `@${row.telegram_username}` : row.telegram_id ? `id ${row.telegram_id}` : "Not linked",
    ],
    ["Their inbox", row.user_unread > 0 ? `${row.user_unread} unread` : "Caught up"],
  ];
  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-col items-center text-center">
        <Avatar src={row.avatar_url} name={name} size="lg" />
        <p className="mt-2.5 text-[15px] font-semibold text-text-primary">{name}</p>
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
          <Badge variant="role" value={row.role} size="xs">{row.role}</Badge>
          {state ? <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${state.cls}`}>{state.label}</span> : null}
        </div>
      </div>

      <dl className="divide-y divide-ink/[0.06] rounded-xl border border-ink/[0.08] bg-surface-raised">
        {facts.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
            <dt className="text-[12px] text-text-muted">{k}</dt>
            <dd className="min-w-0 truncate text-right text-[13px] font-medium text-text-primary">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="rounded-xl border border-ink/[0.08] bg-surface-raised p-3.5">
        <p className="text-[12px] text-text-muted">This conversation</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-surface-secondary/60 py-2">
            <p className="text-[18px] font-semibold text-text-primary">{fromThem}</p>
            <p className="text-[11px] text-text-muted">from them</p>
          </div>
          <div className="rounded-lg bg-surface-secondary/60 py-2">
            <p className="text-[18px] font-semibold text-text-primary">{fromUs}</p>
            <p className="text-[11px] text-text-muted">from us</p>
          </div>
        </div>
        <p className="mt-2.5 text-[12px] text-text-muted">
          Status <span className="font-medium text-text-primary">{row.status}</span>
          {first ? <> · loaded since {fmtDate(first.created_at)}</> : null}
        </p>
      </div>
    </div>
  );
};

// ── Small pieces ─────────────────────────────────────────────────────
const IconButton = ({ label, onClick, disabled, active, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    aria-pressed={active || undefined}
    className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
      active ? "bg-accent/15 text-accent-text" : "text-text-muted hover:bg-ink/5 hover:text-text-primary"
    }`}
  >
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden="true">
      {children}
    </svg>
  </button>
);

const dayLabel = (d) => {
  const today = new Date();
  const that = new Date(d);
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(that)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return that.toLocaleDateString("en-GB", {
    weekday: diff < 7 ? "long" : undefined,
    day: "numeric",
    month: "short",
    year: that.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
};

const groupByDay = (messages) => {
  const groups = [];
  messages.forEach((m) => {
    const d = m.created_at ? new Date(m.created_at) : null;
    const key = d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : "unknown";
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(m);
    else groups.push({ key, label: d ? dayLabel(d) : "Earlier", items: [m] });
  });
  return groups;
};

export default ChatTab;
