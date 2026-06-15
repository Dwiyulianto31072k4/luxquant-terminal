// src/components/NewsPreviewModal.jsx
// ════════════════════════════════════════════════════════════════
// Refactor → pakai <Modal> primitive (v2).
// Shell (overlay, animasi, Esc, body-lock, portal, close, hairline)
// sekarang dari Modal. Sisanya konten asli: badge source, gambar
// full-width, body artikel, CTA "Open Article".
// API tetap sama: { article, onClose }
// ════════════════════════════════════════════════════════════════

import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "./ui/Modal";

const NewsPreviewModal = ({ article, onClose }) => {
  const { t } = useTranslation();
  const [imgFailed, setImgFailed] = useState(false);

  if (!article) return null;

  const translateTimeAgo = (timeStr) => {
    if (!timeStr) return "";
    let res = timeStr.toLowerCase();
    res = res.replace("h ago", ` ${t("btc.h_ago")}`);
    res = res.replace("m ago", ` ${t("btc.m_ago")}`);
    res = res.replace("d ago", ` ${t("btc.d_ago")}`);
    return res;
  };

  const getSourceColor = (source) => {
    const s = source?.toLowerCase() || "";
    if (s.includes("coindesk")) return { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/20" };
    if (s.includes("cointelegraph")) return { bg: "bg-cyan-500/15", text: "text-cyan-400", border: "border-cyan-500/20" };
    if (s.includes("decrypt")) return { bg: "bg-green-500/15", text: "text-green-400", border: "border-green-500/20" };
    if (s.includes("bitcoin")) return { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/20" };
    return { bg: "bg-gold-primary/15", text: "text-gold-primary", border: "border-gold-primary/20" };
  };

  const srcColor = getSourceColor(article.source);
  const hasImage = article.image && !imgFailed;

  return (
    <Modal isOpen onClose={onClose} size="md" padded={false}>
      {/* Header — source badge + time (close button dari Modal) */}
      <div className="flex items-center gap-2 px-4 py-2.5 pr-12">
        <span className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold ${srcColor.bg} ${srcColor.text} ${srcColor.border}`}>
          {article.source}
        </span>
        {article.time_ago && (
          <span className="text-[10px] text-text-muted">{translateTimeAgo(article.time_ago)}</span>
        )}
      </div>

      {/* Gambar full-width */}
      {hasImage && (
        <div className="relative w-full overflow-hidden bg-black/40">
          <img
            src={article.image}
            alt=""
            className="h-auto max-h-52 w-full object-cover sm:max-h-60"
            onError={() => setImgFailed(true)}
          />
          <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[#0a0805] to-transparent" />
        </div>
      )}

      {/* Body artikel */}
      <div className="space-y-2.5 px-4 pb-1 sm:px-5">
        <h2 className="text-[15px] font-bold leading-snug text-white sm:text-lg">
          {article.title}
        </h2>

        {article.author && (
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-gold-primary/20 to-gold-primary/5 ring-1 ring-gold-primary/10">
              <svg className="h-2.5 w-2.5 text-gold-primary/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span className="text-[11px] font-medium text-text-secondary">{article.author}</span>
            {article.time_ago && (
              <span className="text-[10px] text-text-muted">· {translateTimeAgo(article.time_ago)}</span>
            )}
          </div>
        )}

        {article.description && (
          <p className="text-[13px] leading-relaxed text-text-secondary/90">
            {article.description}
          </p>
        )}

        <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-2.5">
          <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${srcColor.bg}`}>
            <svg className={`h-4 w-4 ${srcColor.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white">{article.source}</p>
            <p className="text-[10px] text-text-muted">{t("btc.crypto_news")}</p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="px-4 pb-4 pt-2.5">
        <a
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-gold-dark via-gold-primary to-gold-light py-3 text-sm font-bold text-bg-primary shadow-lg shadow-gold-primary/20 transition-all duration-200 hover:scale-[1.01] hover:shadow-gold-primary/40 active:scale-[0.99]"
        >
          {t("btc.open_article")}
          <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </Modal>
  );
};

export default NewsPreviewModal;
