/**
 * A transient prompt when someone has written in and nobody has answered.
 *
 * The unread badge already exists and is not the same thing: glancing at a
 * conversation clears it without replying, and the person waiting only
 * experiences the reply. Measured 2026-08-01, one user had been waiting 30
 * hours with the badge showing nothing wrong.
 *
 * So this asks a different question — who spoke last — and it appears rather
 * than sits, because a number in a corner is easy to stop seeing. It stays
 * dismissed for a while after being closed: a nudge that cannot be silenced
 * becomes something you learn to ignore, which is the same as not having it.
 *
 * "Who spoke last" cannot tell a question from a goodbye, though. A thread
 * ending "oke siap" has nothing owed and still qualifies forever, and one did:
 * a finished conversation reappeared every ten minutes for fourteen days
 * because Later only snoozes and nothing here could say the matter was
 * settled. Hence Done — it closes the conversation, which is the only state
 * the query actually respects.
 */
import { useCallback, useEffect, useState } from "react";
import { adminChatApi } from "../../services/adminChatApi";

const POLL_MS = 30000;
// Long enough that dismissing means "not now" rather than "every 30 seconds".
const SNOOZE_MS = 10 * 60 * 1000;
// Below this, someone is probably mid-conversation and does not need chasing.
const MIN_WAIT_SECONDS = 120;

const waited = (seconds) => {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
};

// /awaiting-reply names the key `conversation_id`; older shapes used `id`.
// Read both so neither side can silently break the other again.
const convId = (c) => c?.conversation_id ?? c?.id ?? null;

export const AwaitingReplyNudge = ({ onOpenChat }) => {
  const [rows, setRows] = useState([]);
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  // Closing is what the awaiting-reply query filters on (status <> 'closed'),
  // so this is the one action that removes a settled thread for good rather
  // than deferring it by ten minutes.
  const markDone = useCallback(
    async (conversationId) => {
      setClosing(true);
      if (conversationId == null) return;
      try {
        await adminChatApi.setStatus(conversationId, "closed");
        setRows((prev) => prev.filter((c) => convId(c) !== conversationId));
      } catch (e) {
        // Leave the row in place; a failed close should not look like a
        // successful one. But say something: this swallowed a 422 for the
        // whole life of the button — /awaiting-reply returns the key as
        // `conversation_id` and this read `.id`, so every Done posted to
        // /conversations/undefined and no thread was ever closed.
        console.error("[awaiting-reply] close failed:", e?.response?.status, e?.message);
      } finally {
        setClosing(false);
      }
    },
    [],
  );

  const poll = useCallback(async () => {
    try {
      const r = await adminChatApi.getAwaitingReply(5);
      const waiting = (r?.conversations || []).filter(
        (c) => (c.waiting_seconds || 0) >= MIN_WAIT_SECONDS,
      );
      setRows(waiting);
    } catch {
      // Silent by design: a missing nudge is not worth console noise, and this
      // polls often enough that one failure is invisible.
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    setVisible(rows.length > 0 && Date.now() > snoozedUntil);
  }, [rows, snoozedUntil]);

  if (!visible) return null;

  const oldest = rows[0];
  const oldestId = convId(oldest);
  const others = rows.length - 1;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[300] flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-xl border border-[#F0B90B]/40 bg-surface-raised/95 px-4 py-3 shadow-2xl backdrop-blur">
        <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#F0B90B]" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-text-primary">
            {rows.length === 1
              ? "Someone is waiting for a reply"
              : `${rows.length} people are waiting for a reply`}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-text-muted">
            {oldest.username || oldest.email || `user ${oldest.user_id}`} · waiting{" "}
            {waited(oldest.waiting_seconds)}
            {others > 0 ? ` · and ${others} more` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSnoozedUntil(Date.now() + SNOOZE_MS);
              onOpenChat?.();
            }}
            className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-surface-primary"
          >
            Open chat
          </button>
          <button
            type="button"
            onClick={() => markDone(oldestId)}
            disabled={closing}
            className="rounded-lg border border-ink/12 px-2.5 py-1.5 text-[12px] text-text-secondary hover:text-text-primary disabled:opacity-50"
            title="Nothing is owed here — close the conversation and stop asking"
          >
            {closing ? "…" : "Done"}
          </button>
          <button
            type="button"
            onClick={() => setSnoozedUntil(Date.now() + SNOOZE_MS)}
            className="rounded-lg border border-ink/12 px-2.5 py-1.5 text-[12px] text-text-muted hover:text-text-secondary"
            title="Hide for 10 minutes"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
};
