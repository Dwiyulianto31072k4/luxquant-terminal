// src/components/admin/users/SendMessageModal.jsx
// ════════════════════════════════════════════════════════════════
// Send a custom admin message to a user via the bot (Telegram DM).
// Features: free textarea, quick templates, optional invite link.
// Backed by adminApi.sendMessage(userId, { text, withInvite }).
// ════════════════════════════════════════════════════════════════

import { useState } from "react";
import Modal, { ModalFooter } from "../../ui/Modal";
import { GoldButton, GhostButton } from "../../autotrade/AutoTradeUI";

const TEMPLATES = [
  {
    id: "reminder",
    label: "Reminder",
    text:
      "Hi! Just a friendly reminder from LuxQuant. Let us know if you have any questions \u2014 we're here to help.",
  },
  {
    id: "billing",
    label: "Billing",
    text:
      "Hi! This is a reminder that your LuxQuant subscription payment is due. Please renew to keep your VIP access active. Reach out if you need help.",
  },
  {
    id: "promo",
    label: "Promo",
    text:
      "Hi! \uD83C\uDF89 Special offer from LuxQuant just for you. Renew or upgrade now to keep getting real-time VIP signals and analysis. Limited time \u2014 don't miss out!",
  },
  {
    id: "join_vip",
    label: "Join VIP",
    text:
      "Hi! Your LuxQuant VIP subscription is active. Join the VIP signal group to get real-time signals, market announcements, and exclusive analysis.",
  },
];

export const SendMessageModal = ({ user, onClose, onSend }) => {
  const [text, setText] = useState("");
  const [withInvite, setWithInvite] = useState(false);
  const [loading, setLoading] = useState(false);

  const noTelegram = !user?.telegram_id;
  const charCount = text.length;
  const tooLong = charCount > 3500;
  const canSend = text.trim().length > 0 && !tooLong && !noTelegram && !loading;

  const applyTemplate = (t) => setText(t.text);

  const handleSend = async () => {
    if (!canSend) return;
    setLoading(true);
    try {
      await onSend({ text: text.trim(), withInvite });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="md">
      <div className="min-w-0">
        <h3 className="mb-1 text-base font-bold tracking-tight text-text-primary">
          Send message via bot
        </h3>
        <p className="mb-3 text-xs text-text-muted">
          DM <strong className="text-text-primary">@{user?.username}</strong> directly
          through the LuxQuant bot.
        </p>

        {noTelegram ? (
          <div
            className="rounded-lg p-3 text-xs"
            style={{
              background: "rgba(246,70,93,0.08)",
              border: "1px solid rgba(246,70,93,0.25)",
              color: "rgb(var(--neg))",
            }}
          >
            This user hasn't linked Telegram, so the bot can't message them.
            Ask them to connect Telegram first.
          </div>
        ) : (
          <>
            {/* Quick templates */}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className="rounded-md px-2 py-1 text-[10px] font-semibold"
                  style={{
                    background: "rgba(212,168,83,0.1)",
                    color: "rgb(var(--accent))",
                    border: "1px solid rgba(212,168,83,0.25)",
                  }}
                >
                  {t.label}
                </button>
              ))}
              {text && (
                <button
                  onClick={() => setText("")}
                  className="rounded-md px-2 py-1 text-[10px] font-semibold"
                  style={{ background: "rgba(255,255,255,0.04)", color: "rgb(var(--fg-muted))" }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Textarea */}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Type your message… (or pick a template above and edit it)"
              className="w-full resize-none rounded-lg p-3 text-sm text-text-primary outline-none"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${tooLong ? "rgba(246,70,93,0.5)" : "rgba(255,255,255,0.1)"}`,
              }}
            />
            <div className="mt-1 flex items-center justify-between">
              <label className="flex items-center gap-2 text-[11px] text-text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={withInvite}
                  onChange={(e) => setWithInvite(e.target.checked)}
                  className="accent-[#d4a853]"
                />
                Append VIP invite link (if active &amp; outside group)
              </label>
              <span
                className="text-[10px] tabular-nums"
                style={{ color: tooLong ? "#f87171" : "#6b5c52" }}
              >
                {charCount}/3500
              </span>
            </div>
          </>
        )}
      </div>

      <ModalFooter>
        <GhostButton onClick={onClose} disabled={loading} className="flex-1">
          Cancel
        </GhostButton>
        <GoldButton onClick={handleSend} disabled={!canSend} className="flex-1">
          {loading ? "Sending…" : "Send via bot"}
        </GoldButton>
      </ModalFooter>
    </Modal>
  );
};

export default SendMessageModal;
