// src/components/HelpSupportModal.jsx
// ════════════════════════════════════════════════════════════════
// Refactor → pakai <Modal> primitive (v2).
// Shell (overlay, animasi, Esc, body-lock, portal, close, hairline)
// dari Modal. Sisanya konten asli: avatar admin, role, topik,
// CTA Telegram. API tetap sama: { isOpen, onClose }
// ════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Modal from "./ui/Modal";

const TOPICS = ["topic_bug", "topic_subscription", "topic_general"];

const HelpSupportModal = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (isOpen) setImgFailed(false);
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="text-center">
        {/* Avatar */}
        <div className="mb-5 flex justify-center">
          <div
            className="h-24 w-24 rounded-full bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark p-[3px]"
            style={{ boxShadow: "0 0 20px rgba(212,168,83,0.4), 0 0 40px rgba(212,168,83,0.15)" }}
          >
            {!imgFailed ? (
              <img
                src="/admin-avatar.png"
                alt="LuxQuant Admin"
                className="h-full w-full rounded-full bg-bg-primary object-cover"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full bg-bg-primary">
                <span className="text-2xl font-bold text-gold-primary">LQ</span>
              </div>
            )}
          </div>
        </div>

        {/* Name + Role */}
        <h3 className="mb-1 text-lg font-bold text-text-primary">{t("helpModal.adminName")}</h3>
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-gold-primary/20 bg-gold-primary/10 px-2.5 py-1">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gold-primary">
            {t("helpModal.adminRole")}
          </span>
        </div>

        {/* Title + Description */}
        <h2 className="mb-2 text-xl font-bold text-text-primary">{t("helpModal.title")}</h2>
        <p className="mb-5 text-sm leading-relaxed text-text-secondary">
          {t("helpModal.description")}
        </p>

        {/* Topics */}
        <div className="mb-5 space-y-2 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3 text-left">
          {TOPICS.map((key) => (
            <div key={key} className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-gold-primary/10">
                <svg className="h-3 w-3 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-xs leading-snug text-text-secondary">{t(`helpModal.${key}`)}</span>
            </div>
          ))}
        </div>

        {/* CTA Telegram */}
        <a
          href="https://t.me/luxquantadmin"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-gold-dark via-gold-primary to-gold-light py-3 text-sm font-bold text-bg-primary shadow-lg shadow-gold-primary/20 transition-all duration-200 hover:scale-[1.01] hover:shadow-gold-primary/40 active:scale-[0.99]"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
          </svg>
          <span>{t("helpModal.contactBtn")}</span>
          <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>

        <p className="mt-3 text-[10px] text-text-muted">{t("helpModal.responseNote")}</p>
      </div>
    </Modal>
  );
};

export default HelpSupportModal;
