import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next'; // <-- 1. Import i18n hook

/**
 * NewsPreviewModal - Centered article preview popup
 * Always centered (mobile + desktop), no scroll — content determines height
 * Single CTA: "Open Article"
 */
const NewsPreviewModal = ({ article, onClose }) => {
  const { t } = useTranslation(); // <-- 2. Inisialisasi fungsi t()
  
  const [isClosing, setIsClosing] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  // Helper terjemahan waktu yang dikirim dari props atau API
  const translateTimeAgo = (timeStr) => {
    if (!timeStr) return '';
    let res = timeStr.toLowerCase();
    res = res.replace('h ago', ` ${t('btc.h_ago')}`);
    res = res.replace('m ago', ` ${t('btc.m_ago')}`);
    res = res.replace('d ago', ` ${t('btc.d_ago')}`);
    return res;
  };

  if (!article) return null;

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 200);
  };

  const getSourceColor = (source) => {
    const s = source?.toLowerCase() || '';
    if (s.includes('coindesk')) return { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/20' };
    if (s.includes('cointelegraph')) return { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/20' };
    if (s.includes('decrypt')) return { bg: 'bg-green-500/15', text: 'text-green-400', border: 'border-green-500/20' };
    if (s.includes('bitcoin')) return { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/20' };
    return { bg: 'bg-gold-primary/15', text: 'text-gold-primary', border: 'border-gold-primary/20' };
  };

  const srcColor = getSourceColor(article.source);
  const hasImage = article.image && !imgFailed;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center px-4 news-overlay ${isClosing ? 'news-overlay-out' : ''}`}
      onClick={handleClose}
    >
      <style>{`
        .news-overlay {
          background: rgba(0,0,0,0);
          backdrop-filter: blur(0px);
          animation: newsOverlayIn .3s ease forwards;
        }
        .news-overlay-out {
          animation: newsOverlayOut .2s ease forwards;
        }
        .news-overlay-out .news-card {
          animation: newsCardOut .2s ease forwards;
        }
        @keyframes newsOverlayIn {
          to { background: rgba(0,0,0,.85); backdrop-filter: blur(8px); }
        }
        @keyframes newsOverlayOut {
          from { background: rgba(0,0,0,.85); backdrop-filter: blur(8px); }
          to { background: rgba(0,0,0,0); backdrop-filter: blur(0px); }
        }
        .news-card {
          animation: newsCardIn .3s cubic-bezier(.16,1,.3,1) forwards;
        }
        @keyframes newsCardIn {
          from { opacity: 0; transform: scale(.95) translateY(12px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes newsCardOut {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(.95) translateY(12px); }
        }
      `}</style>

      <div
        className="news-card relative w-full max-w-lg bg-[#0c0a0f] rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent z-10" />

        {/* Header — source + close */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${srcColor.bg} ${srcColor.text} border ${srcColor.border}`}>
              {article.source}
            </span>
            {article.time_ago && (
              <span className="text-text-muted text-[10px]">{translateTimeAgo(article.time_ago)}</span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-text-muted hover:text-white hover:bg-white/10 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Image — full width, natural ratio, height capped */}
        {hasImage && (
          <div className="relative w-full overflow-hidden bg-black/40">
            <img
              src={article.image}
              alt=""
              className="w-full h-auto object-cover max-h-52 sm:max-h-60"
              onError={() => setImgFailed(true)}
            />
            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[#0c0a0f] to-transparent" />
          </div>
        )}

        {/* Article body */}
        <div className="px-4 sm:px-5 pb-1 space-y-2.5">
          {/* Title */}
          <h2 className="text-white font-bold text-[15px] sm:text-lg leading-snug">
            {article.title}
          </h2>

          {/* Author */}
          {article.author && (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-gold-primary/20 to-gold-primary/5 flex items-center justify-center ring-1 ring-gold-primary/10">
                <svg className="w-2.5 h-2.5 text-gold-primary/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <span className="text-text-secondary text-[11px] font-medium">{article.author}</span>
              {article.time_ago && (
                <span className="text-text-muted text-[10px]">· {translateTimeAgo(article.time_ago)}</span>
              )}
            </div>
          )}

          {/* Description */}
          {article.description && (
            <p className="text-text-secondary/90 text-[13px] leading-relaxed">
              {article.description}
            </p>
          )}

          {/* Source card */}
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <div className={`w-8 h-8 rounded-lg ${srcColor.bg} flex items-center justify-center flex-shrink-0`}>
              <svg className={`w-4 h-4 ${srcColor.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-semibold">{article.source}</p>
              {/* Memanggil terjemahan "Crypto News" */}
              <p className="text-text-muted text-[10px]">{t('btc.crypto_news')}</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="px-4 pb-4 pt-2.5">
          <a
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-center gap-2.5 w-full py-3 bg-gradient-to-r from-gold-dark via-gold-primary to-gold-light text-bg-primary rounded-xl text-sm font-bold shadow-lg shadow-gold-primary/20 hover:shadow-gold-primary/40 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200"
          >
            {/* Memanggil terjemahan "Open Article" */}
            {t('btc.open_article')}
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
};

export default NewsPreviewModal;