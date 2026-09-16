// src/components/HelpSupportModal.jsx
// ════════════════════════════════════════════════════════════════
// Help & Support — function-first support surface.
//
// Structure follows support-modal conventions (Intercom/Linear-style):
//   1. What this is (title) + expectation (response time up front)
//   2. What we can help with (topics)
//   3. How to get helped FAST (what to include — cuts the back-and-forth
//      that stretches "a few hours" into a day)
//   4. One primary channel (Telegram CTA), self-serve link (status page)
// The admin persona stays as a small human touch in the header — the old
// version led with a 96px glowing avatar and an ADMIN pill, which made the
// modal about the admin instead of the user's problem.
//
// Theme-safe: only tokens (accent/accent-fg, ink, text-*), no fixed colors,
// no surface-tokens-as-text. API unchanged: { isOpen, onClose }
// ════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Modal from "./ui/Modal";
import { TELEGRAM_ADMIN_URL, TelegramGlyph } from "../utils/supportContact";

const TOPICS = ["topic_bug", "topic_subscription", "topic_general"];

const HelpSupportModal = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (isOpen) setImgFailed(false);
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      {/* Header — person, small; availability is the headline info */}
      <div className="mb-5 flex items-center gap-3 text-left">
        <div className="h-11 w-11 shrink-0 rounded-full border border-accent/30 p-[2px]">
          {!imgFailed ? (
            <img
              src="/admin-avatar.png"
              alt={t("helpModal.adminName")}
              className="h-full w-full rounded-full bg-bg-primary object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-full bg-ink/[0.05]">
              <span className="text-xs font-bold text-accent">LQ</span>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-text-primary">
            {t("helpModal.adminName")}
          </h3>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-profit" />
            <span className="text-[11px] text-text-muted">{t("helpModal.onlineNote")}</span>
          </div>
        </div>
      </div>

      {/* Title + Description */}
      <h2 className="mb-1.5 text-xl font-bold text-text-primary">{t("helpModal.title")}</h2>
      <p className="mb-5 text-sm leading-relaxed text-text-secondary">
        {t("helpModal.description")}
      </p>

      {/* Topics */}
      <div className="mb-3 space-y-2 rounded-xl border border-ink/[0.05] bg-ink/[0.02] p-3 text-left">
        {TOPICS.map((key) => (
          <div key={key} className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-accent/12">
              <svg className="h-3 w-3 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-xs leading-snug text-text-secondary">
              {t(`helpModal.${key}`)}
            </span>
          </div>
        ))}
      </div>

      {/* Speed tip — what to include so the first reply is the fix */}
      <div className="mb-5 rounded-xl border border-accent/20 bg-accent/[0.06] p-3 text-left">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
          {t("helpModal.tipTitle")}
        </p>
        <p className="text-xs leading-snug text-text-secondary">{t("helpModal.tipBody")}</p>
      </div>

      {/* CTA — the one gold action */}
      <a
        href={TELEGRAM_ADMIN_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-accent py-3 text-sm font-bold text-accent-fg shadow-cta transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
      >
        <TelegramGlyph />
        <span>{t("helpModal.contactBtn")}</span>
        <svg
          className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </a>

      {/* Self-serve: live system status */}
      <div className="mt-3 text-center">
        <Link
          to="/status"
          onClick={onClose}
          className="text-[11px] text-text-muted underline-offset-2 transition-colors hover:text-text-secondary hover:underline"
        >
          {t("helpModal.statusLink")}
        </Link>
      </div>
    </Modal>
  );
};

export default HelpSupportModal;
