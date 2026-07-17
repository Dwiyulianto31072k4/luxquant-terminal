// src/components/NewsPreviewModal.jsx
// Quiet article reader — same shell as News desk (solid chrome, no blur on card).

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
 <div className="relative flex w-full max-h-[min(32vh,220px)] min-h-[9rem] flex-col items-center justify-center bg-[rgb(var(--surface))] select-none sm:max-h-[min(36vh,260px)] sm:min-h-[11rem]">
 <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-ink/[0.08]" />
 <img src={LUXQUANT_LOGO} alt="LuxQuant" className="h-14 w-14 object-contain opacity-95" />
 <span className="mt-2.5 font-mono text-[9px] uppercase tracking-[0.28em] text-ink/75">
 LuxQuant
 </span>
 <span className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.22em] text-ink/40">
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
 const sourceLabel = article.source
 ? String(article.source).replace(/^www\./i, "").split(".")[0]?.toUpperCase()
 : null;

 const header = (
 <div className="flex min-w-0 flex-wrap items-center gap-2">
 <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
 Wire
 </span>
 {article.source ? (
 <span className="inline-flex items-center gap-1.5 rounded-md border border-ink/[0.1] bg-surface-secondary px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
 <span className="h-1 w-1 rounded-full bg-ink/45" />
 {article.source}
 </span>
 ) : null}
 {article.time_ago ? (
 <span className="font-mono text-[10px] tabular-nums text-text-muted/80">
 {translateTimeAgo(article.time_ago)}
 </span>
 ) : null}
 </div>
 );

 const footer = (close) => (
 <div className="flex items-center gap-2">
 {article.link ? (
 <a
 href={article.link}
 target="_blank"
 rel="noopener noreferrer"
 className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-transparent bg-accent text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-fg transition hover:opacity-90 active:scale-[0.99]"
 >
 {t("btc.open_article")}
 <svg className="h-3.5 w-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
 </svg>
 </a>
 ) : null}
 <button
 type="button"
 onClick={close}
 className="h-11 shrink-0 rounded-md border border-ink/[0.12] bg-surface-secondary px-4 text-[12px] font-medium uppercase tracking-[0.1em] text-text-secondary transition hover:border-ink/25 hover:text-text-primary sm:px-5"
 >
 Close
 </button>
 </div>
 );

 return (
 <Modal
 isOpen
 onClose={onClose}
 size="reader"
 padded={false}
 accent={false}
 header={header}
 footer={footer}
 >
 {/* Hero */}
 <div className="relative w-full overflow-hidden bg-black">
 {hasImage ? (
 <div className="flex max-h-[min(36vh,280px)] min-h-[10rem] w-full items-center justify-center sm:max-h-[min(40vh,340px)] sm:min-h-[12rem]">
 <img
 src={article.image}
 alt=""
 className="max-h-[min(36vh,280px)] w-full object-cover sm:max-h-[min(40vh,340px)] sm:object-contain"
 onError={() => setImgFailed(true)}
 />
 </div>
 ) : (
 <WirePlaceholder />
 )}
 {sourceLabel ? (
 <span className="pointer-events-none absolute bottom-3 right-3 rounded border border-ink/10 bg-scrim/70 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink/70">
 {sourceLabel}
 </span>
 ) : null}
 <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-scrim/50 to-transparent" />
 </div>

 <div className="space-y-4 px-4 py-5 sm:space-y-5 sm:px-6 sm:py-6">
 <div className="space-y-2">
 <h2 className="font-display text-[17px] font-semibold leading-snug tracking-tight text-text-primary sm:text-[21px] sm:leading-[1.28]">
 {article.title}
 </h2>
 {article.author ? (
 <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
 By {article.author}
 </p>
 ) : null}
 </div>

 {article.description ? (
 <section className="space-y-2">
 <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-muted">
 Summary
 </h3>
 <p className="text-[14px] leading-relaxed text-text-secondary sm:text-[15px]">
 {cleanText(article.description)}
 </p>
 </section>
 ) : null}
 </div>
 </Modal>
 );
};

export default NewsPreviewModal;
