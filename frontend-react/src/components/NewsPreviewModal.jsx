import { useState, useEffect } from 'react';

/**
 * NewsPreviewModal - Telegram-style article preview popup
 * Shows article preview (title, image, description) with "Open Article" button
 * Attempts iframe loading as fallback, handles blocked sites gracefully
 * 
 * Usage:
 *   <NewsPreviewModal article={selectedArticle} onClose={() => setSelectedArticle(null)} />
 * 
 * article shape: { title, description, image, link, source, author, time_ago }
 */
const NewsPreviewModal = ({ article, onClose }) => {
  const [viewMode, setViewMode] = useState('preview'); // 'preview' | 'iframe'
  const [iframeLoading, setIframeLoading] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  if (!article) return null;

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ESC to close
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleTryIframe = () => {
    setViewMode('iframe');
    setIframeLoading(true);
    setIframeError(false);
  };

  const handleIframeLoad = () => {
    setIframeLoading(false);
  };

  // Detect iframe block (heuristic: timeout after 8s)
  useEffect(() => {
    if (viewMode !== 'iframe') return;
    const timeout = setTimeout(() => {
      // If still loading after 8s, likely blocked
      if (iframeLoading) {
        setIframeError(true);
        setIframeLoading(false);
      }
    }, 8000);
    return () => clearTimeout(timeout);
  }, [viewMode, iframeLoading]);

  // Source color mapping
  const getSourceColor = (source) => {
    const s = source?.toLowerCase() || '';
    if (s.includes('coindesk')) return { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/20' };
    if (s.includes('cointelegraph')) return { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/20' };
    if (s.includes('decrypt')) return { bg: 'bg-green-500/15', text: 'text-green-400', border: 'border-green-500/20' };
    if (s.includes('bitcoin')) return { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/20' };
    return { bg: 'bg-gold-primary/15', text: 'text-gold-primary', border: 'border-gold-primary/20' };
  };

  const srcColor = getSourceColor(article.source);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <style>{`
        @keyframes newsModalIn{from{opacity:0;transform:translateY(30px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes newsModalInDesktop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
        .news-modal-mobile{animation:newsModalIn .3s cubic-bezier(.4,0,.2,1)}
        .news-modal-desktop{animation:newsModalInDesktop .25s ease-out}
      `}</style>

      <div
        className="relative w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] bg-bg-secondary rounded-t-2xl sm:rounded-2xl border border-gold-primary/15 shadow-2xl shadow-black/60 flex flex-col overflow-hidden news-modal-mobile sm:news-modal-desktop sm:mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top gold accent */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent z-10" />

        {/* Mobile drag indicator */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gold-primary/10 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${srcColor.bg} ${srcColor.text} border ${srcColor.border}`}>
              {article.source}
            </span>
            {article.time_ago && (
              <span className="text-text-muted text-[10px]">{article.time_ago}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {viewMode === 'iframe' && (
              <button
                onClick={() => setViewMode('preview')}
                className="p-2 text-text-muted hover:text-gold-primary hover:bg-gold-primary/10 rounded-xl transition-all text-[10px] font-semibold"
              >
                Preview
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
              title="Close (Esc)"
            >
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        {viewMode === 'preview' ? (
          <div className="flex-1 overflow-y-auto">
            {/* Image */}
            {article.image && (
              <div className="relative w-full h-48 sm:h-56 overflow-hidden bg-black/30">
                <img
                  src={article.image}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-bg-secondary/90 via-transparent to-transparent" />
              </div>
            )}

            {/* Article Info */}
            <div className="px-5 py-4 space-y-3">
              {/* Title */}
              <h2 className="text-white font-display font-bold text-lg sm:text-xl leading-snug">
                {article.title}
              </h2>

              {/* Author + time */}
              <div className="flex items-center gap-2 flex-wrap">
                {article.author && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-gold-primary/15 flex items-center justify-center">
                      <svg className="w-3 h-3 text-gold-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <span className="text-text-secondary text-xs font-medium">{article.author}</span>
                  </div>
                )}
                {article.time_ago && (
                  <span className="text-text-muted text-xs">· {article.time_ago}</span>
                )}
              </div>

              {/* Description */}
              {article.description && (
                <p className="text-text-secondary text-sm leading-relaxed">
                  {article.description}
                </p>
              )}

              {/* Divider */}
              <div className="h-px bg-gold-primary/10" />

              {/* Source info */}
              <div className="flex items-center gap-3 py-1">
                <div className={`w-8 h-8 rounded-xl ${srcColor.bg} flex items-center justify-center`}>
                  <svg className={`w-4 h-4 ${srcColor.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white text-xs font-semibold">{article.source}</p>
                  <p className="text-text-muted text-[10px]">Crypto News</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Iframe View */
          <div className="flex-1 relative bg-white rounded-b-2xl overflow-hidden">
            {iframeLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-bg-secondary z-10">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin" />
                  <p className="text-text-muted text-xs">Loading article...</p>
                </div>
              </div>
            )}
            {iframeError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-bg-secondary z-10">
                <div className="text-center px-6">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-yellow-500/10 flex items-center justify-center">
                    <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <p className="text-text-secondary text-sm mb-1">This site doesn't allow embedding</p>
                  <p className="text-text-muted text-xs mb-4">Open it directly in a new tab instead</p>
                  <a
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary rounded-xl text-sm font-bold hover:shadow-gold-glow transition-all"
                  >
                    Open in New Tab
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            ) : (
              <iframe
                src={article.link}
                className="w-full h-full border-none"
                title={article.title}
                onLoad={handleIframeLoad}
                sandbox="allow-same-origin allow-scripts allow-popups"
              />
            )}
          </div>
        )}

        {/* Bottom Actions */}
        {viewMode === 'preview' && (
          <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-t border-gold-primary/10 bg-bg-primary/50 flex-shrink-0">
            <button
              onClick={handleTryIframe}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/5 border border-white/10 text-text-secondary rounded-xl text-sm font-medium hover:text-white hover:bg-white/10 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Read Here
            </button>
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary rounded-xl text-sm font-bold hover:shadow-gold-glow transition-all"
            >
              Open Article
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsPreviewModal;