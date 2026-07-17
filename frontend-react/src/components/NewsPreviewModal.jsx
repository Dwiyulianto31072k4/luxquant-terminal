// src/components/NewsPreviewModal.jsx
// Quiet article reader — solid black LQ News wire when no image (Bloomberg masthead).

import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "./ui/Modal";

const LUXQUANT_LOGO = "/logo.png";

const cleanText = (s) => {
  if (!s) return "";
  try {
    const el = document.createElement("textarea");
    el.innerHTML = String(s);
    return el.value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  } catch {
    return String(s).replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").trim();
  }
};

const WirePlaceholder = () => (
  <div className="relative w-full aspect-[16/9] max-h-56 flex flex-col items-center justify-center bg-[#050505] select-none">
    <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08]" />
    <img src={LUXQUANT_LOGO} alt="LuxQuant" className="w-14 h-14 object-contain opacity-95" />
    <span className="mt-2.5 font-mono text-[9px] uppercase tracking-[0.28em] text-white/75">
      LuxQuant
    </span>
    <span className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.22em] text-white/40">
      News
    </span>
  </div>
);

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

  const hasImage = article.image && !imgFailed;

  return (
    <Modal isOpen onClose={onClose} size="md" padded={false}>
      <div className="flex items-center gap-2 px-4 py-2.5 pr-12 border-b border-white/[0.06]">
        {article.source ? (
          <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
            {article.source}
          </span>
        ) : null}
        {article.time_ago && (
          <span className="font-mono text-[10px] text-text-muted/70">
            {translateTimeAgo(article.time_ago)}
          </span>
        )}
      </div>

      {hasImage ? (
        <div className="relative w-full overflow-hidden bg-black">
          <img
            src={article.image}
            alt=""
            className="h-auto max-h-56 w-full object-cover sm:max-h-60"
            onError={() => setImgFailed(true)}
          />
        </div>
      ) : (
        <WirePlaceholder />
      )}

      <div className="space-y-3 px-4 py-4 sm:px-5">
        <h2 className="font-display text-[15px] font-semibold leading-snug tracking-tight text-text-primary sm:text-lg">
          {article.title}
        </h2>

        {article.author && (
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
            By {article.author}
          </p>
        )}

        {article.description && (
          <p className="text-[13px] leading-relaxed text-text-secondary">
            {cleanText(article.description)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 pb-4">
        <a
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 h-10 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.1] text-[12px] font-semibold uppercase tracking-[0.12em] text-text-primary transition hover:bg-white/[0.14]"
        >
          {t("btc.open_article")}
          <svg className="h-3.5 w-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
        <button
          type="button"
          onClick={onClose}
          className="h-10 shrink-0 rounded-lg border border-white/[0.1] px-4 text-[12px] font-medium uppercase tracking-[0.1em] text-text-muted transition hover:border-white/20 hover:text-text-primary"
        >
          Close
        </button>
      </div>
    </Modal>
  );
};

export default NewsPreviewModal;
