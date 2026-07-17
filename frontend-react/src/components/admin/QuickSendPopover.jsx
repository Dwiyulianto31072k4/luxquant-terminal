// src/components/admin/QuickSendPopover.jsx
//
// Template-driven message composer.
//
// Two modes (preserved from original):
// • inline=true → block element rendered inside the UserDetailDrawer.
// • inline=false → fullscreen floating modal (rare, used when triggered
// standalone from elsewhere).
//
// • Polished preview card, channel pill, deep-link button.
// • Full English copy.

import { useState, useEffect, useCallback } from "react";
import { adminApi } from "../../services/adminApi";
import {
  TelegramIcon,
  DiscordIcon,
  EmailIcon,
  CopyIcon,
  CheckIcon,
  SendIcon,
  CloseIcon,
  ExternalLinkIcon,
} from "./Icons";
import { GoldButton } from "../autotrade/AutoTradeUI";

const CHANNEL_LABELS = {
  telegram: { Icon: TelegramIcon, label: "Telegram", color: "#229ED9" },
  discord: { Icon: DiscordIcon, label: "Discord", color: "#5865F2" },
  email: { Icon: EmailIcon, label: "Email", color: "rgb(var(--warn))" },
  generic: { Icon: CopyIcon, label: "Copy Only", color: "rgb(var(--fg-muted))" },
};

export const QuickSendPopover = ({ user, templates, reach, onClose, inline = false }) => {
  const [selectedId, setSelectedId] = useState(null);
  const [rendered, setRendered] = useState(null);
  const [loading, setLoading] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [copied, setCopied] = useState(false);

  // Pick first non-custom template by default
  useEffect(() => {
    if (templates && templates.length > 0 && !selectedId) {
      const first = templates.find((t) => t.id !== "custom");
      if (first) setSelectedId(first.id);
    }
  }, [templates, selectedId]);

  const renderTemplate = useCallback(
    async (templateId, custom = null) => {
      if (!templateId || !user?.id) return;
      setLoading(true);
      try {
        const result = await adminApi.renderOutreachTemplate(templateId, user.id, custom);
        setRendered(result);
      } catch (err) {
        console.error("Render failed:", err);
        setRendered(null);
      } finally {
        setLoading(false);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    if (selectedId === "custom") {
      if (customMessage.trim().length > 0) {
        renderTemplate(selectedId, customMessage);
      } else {
        // Show an empty shell so the user still sees channel/deep_link
        setRendered({
          template_id: "custom",
          channel: reach.telegram.available
            ? "telegram"
            : reach.discord.available
              ? "discord"
              : reach.email.available
                ? "email"
                : "generic",
          subject: null,
          body: "",
          deep_link: reach.telegram.deep_link || reach.discord.deep_link || reach.email.deep_link,
          fallback_link: null,
          can_send: false,
        });
      }
    } else if (selectedId) {
      renderTemplate(selectedId);
    }
  }, [selectedId, customMessage, renderTemplate, reach]);

  const handleCopy = async () => {
    if (!rendered?.body) return;
    try {
      let text = rendered.body;
      if (rendered.subject) {
        text = `Subject: ${rendered.subject}\n\n${rendered.body}`;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      console.error("Copy failed:", e);
    }
  };

  const handleSend = async () => {
    await handleCopy();
    if (rendered?.deep_link) {
      window.open(rendered.deep_link, "_blank", "noopener,noreferrer");
    }
    if (onClose && !inline) onClose();
  };

  const channelInfo = rendered ? CHANNEL_LABELS[rendered.channel] || CHANNEL_LABELS.generic : null;
  const ChannelIcon = channelInfo?.Icon;

  /* ── Inner content shared by both modes ── */
  const content = (
    <div
      className={
        inline ? "" : "w-full max-w-2xl rounded-2xl flex flex-col overflow-hidden max-h-[85vh]"
      }
      style={
        inline
          ? {}
          : {
              background: "rgb(var(--surface-secondary))",
              border: "1px solid rgb(var(--line) / 0.25)",
              boxShadow:
                "0 25px 50px -12px rgb(var(--scrim) / 0.9), 0 0 0 1px rgb(var(--accent) / 0.08)",
            }
      }
    >
      {/* Modal header (floating mode only) */}
      {!inline && (
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0 relative"
          style={{
            background: "linear-gradient(180deg, #14080d, #12090d)",
            borderBottom: "1px solid rgb(var(--ink) / 0.06)",
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{
              background:
                "linear-gradient(to right, transparent, rgb(var(--accent) / 0.35), transparent)",
            }}
          />
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-text-primary tracking-tight">Quick Send</h3>
            <p className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
              To: @{user.username}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:scale-105 transition-all shrink-0"
            style={{
              color: "rgb(var(--accent-text))",
              background: "rgb(var(--accent) / 0.08)",
              border: "1px solid rgb(var(--line) / 0.22)",
            }}
            title="Close (Esc)"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      <div className={inline ? "space-y-4" : "flex-1 overflow-y-auto p-5 space-y-4"}>
        {/* Template picker */}
        <div>
          <p
            className="text-[10px] uppercase tracking-wider font-semibold mb-2"
            style={{ color: "rgb(var(--ink) / 0.4)" }}
          >
            Pick Template
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {templates.map((t) => {
              const isSelected = selectedId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className="text-left p-2.5 rounded-lg border transition-all"
                  style={{
                    background: isSelected ? "rgb(var(--accent) / 0.08)" : "rgb(var(--ink) / 0.02)",
                    borderColor: isSelected ? "rgb(var(--accent) / 0.4)" : "rgb(var(--ink) / 0.05)",
                  }}
                >
                  <p
                    className="text-[11px] font-semibold tracking-tight"
                    style={{ color: isSelected ? "rgb(var(--accent))" : "#fff" }}
                  >
                    {t.label}
                  </p>
                  <p className="text-[10px] truncate" style={{ color: "rgb(var(--fg-muted))" }}>
                    {t.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom message input (only when 'custom' selected) */}
        {selectedId === "custom" && (
          <div>
            <p
              className="text-[10px] uppercase tracking-wider font-semibold mb-1.5"
              style={{ color: "rgb(var(--ink) / 0.4)" }}
            >
              Compose Custom Message
            </p>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={5}
              placeholder={
                `Hi {username},\n\n` +
                `You can also use placeholders like {plan_name}, {expires_at}, etc.`
              }
              className="w-full px-3 py-2 rounded-md text-xs text-text-primary focus:outline-none resize-none font-mono"
              style={{
                background: "rgb(var(--scrim) / 0.3)",
                border: "1px solid rgb(var(--ink) / 0.1)",
              }}
            />
            <p className="text-[10px] mt-1" style={{ color: "rgb(var(--fg-muted))" }}>
              Placeholders:{" "}
              {
                "{username} {plan_name} {expires_at} {expires_in_days} {last_login} {first_login} {referrer_username}"
              }
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-6">
            <div
              className="inline-flex items-center gap-2 text-xs"
              style={{ color: "rgb(var(--fg-muted))" }}
            >
              <div
                className="w-3 h-3 border-2 rounded-full animate-spin"
                style={{
                  borderColor: "rgb(var(--accent) / 0.3)",
                  borderTopColor: "rgb(var(--accent))",
                }}
              />
              Rendering…
            </div>
          </div>
        )}

        {/* Preview card */}
        {!loading && rendered && (
          <div
            className="rounded-lg overflow-hidden"
            style={{
              background: "rgb(var(--scrim) / 0.3)",
              border: "1px solid rgb(var(--ink) / 0.05)",
            }}
          >
            {/* Preview header */}
            <div
              className="flex items-center justify-between px-3 py-2 gap-2"
              style={{
                background: "rgb(var(--ink) / 0.02)",
                borderBottom: "1px solid rgb(var(--ink) / 0.04)",
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {ChannelIcon && <ChannelIcon size={12} colored />}
                <span
                  className="text-[10px] uppercase tracking-wider font-semibold shrink-0"
                  style={{ color: channelInfo?.color }}
                >
                  via {channelInfo?.label}
                </span>
                {!rendered.can_send && (
                  <span
                    className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ml-1 shrink-0"
                    style={{
                      background: "rgba(248,113,113,0.12)",
                      color: "rgb(var(--neg))",
                      border: "1px solid rgba(248,113,113,0.25)",
                    }}
                  >
                    Copy only
                  </span>
                )}
              </div>
              {rendered.deep_link && (
                <a
                  href={rendered.deep_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] hover:underline truncate ml-2 max-w-[40%] font-mono shrink-0"
                  style={{ color: "#8a8a93" }}
                >
                  <span className="truncate">{rendered.deep_link.replace(/^https?:\/\//, "")}</span>
                  <ExternalLinkIcon size={10} />
                </a>
              )}
            </div>

            {/* Email subject */}
            {rendered.subject && (
              <div
                className="px-3 py-2"
                style={{ borderBottom: "1px solid rgb(var(--ink) / 0.04)" }}
              >
                <p
                  className="text-[10px] uppercase tracking-wider font-semibold mb-0.5"
                  style={{ color: "rgb(var(--ink) / 0.4)" }}
                >
                  Subject
                </p>
                <p className="text-xs text-text-primary">{rendered.subject}</p>
              </div>
            )}

            {/* Body */}
            <div className="px-3 py-2.5 max-h-64 overflow-y-auto">
              <pre
                className="text-xs whitespace-pre-wrap font-sans"
                style={{ color: "rgb(var(--fg-secondary))", lineHeight: "1.5" }}
              >
                {rendered.body || (
                  <span style={{ color: "rgb(var(--fg-muted))" }}>
                    (empty — type your message above)
                  </span>
                )}
              </pre>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!loading && rendered && rendered.body && (
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 py-2 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 hover:scale-[1.02]"
              style={{
                background: copied ? "rgba(52,211,153,0.12)" : "rgb(var(--ink) / 0.04)",
                color: copied ? "#34d399" : "#fff",
                border: `1px solid ${copied ? "rgba(52,211,153,0.3)" : "rgb(var(--ink) / 0.1)"}`,
              }}
            >
              {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
            {rendered.deep_link && (
              <GoldButton
                onClick={handleSend}
                className="flex-1 flex items-center justify-center gap-1.5"
              >
                <SendIcon size={12} />
                Send → {channelInfo?.label}
              </GoldButton>
            )}
          </div>
        )}
      </div>
    </div>
  );

  /* ── Inline mode: render block as-is ── */
  if (inline) return content;

  /* ── Floating mode: render as overlay ── */
  return (
    <div
      className="fixed inset-0 z-[99999] flex items-end justify-center sm:items-center p-0 sm:p-4"
      style={{
        background: "rgb(var(--scrim) / 0.7)",
        backdropFilter: "blur(6px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose && onClose()}
    >
      <div className="w-full max-w-lg max-h-[min(92dvh,100%)] overflow-y-auto rounded-t-3xl sm:rounded-2xl sm:max-w-none">
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-ink/25" />
        </div>
        {content}
      </div>
    </div>
  );
};
