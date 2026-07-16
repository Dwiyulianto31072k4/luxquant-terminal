// src/components/resources/ResourceReader.jsx
// Full-screen reader for a resource: article (HTML/Markdown), PDF, or video.
// ("link" resources open externally and never reach this component.)
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { resourcesApi, pdfUrl, youtubeEmbedUrl, coverUrl } from '../../services/resourcesApi';
import { renderRich } from './mdRender';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const ResourceReader = ({ resource: initial, onClose, onNavigate }) => {
  const [resource, setResource] = useState(initial);
  const [loading, setLoading] = useState(!initial?.content && initial?.type === 'article');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  // Article cards arrive without the body — fetch the full record once.
  useEffect(() => {
    let alive = true;
    if (initial?.type === 'article' && !initial?.content) {
      setLoading(true);
      resourcesApi.get(initial.slug || initial.id)
        .then((full) => { if (alive) setResource(full); })
        .catch(() => {})
        .finally(() => { if (alive) setLoading(false); });
    }
    return () => { alive = false; };
  }, [initial]);

  const isPdf = resource.type === 'pdf';
  const isVideo = resource.type === 'video';
  const isArticle = resource.type === 'article';

  const embedSrc = isVideo ? youtubeEmbedUrl(resource.source_url) : null;
  const videoBody = resource.content || resource.excerpt;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center bg-black/85 backdrop-blur-sm p-0 sm:p-6 lg:p-10" onClick={onClose}>
      <div
        className={`relative w-full bg-bg-secondary rounded-t-3xl sm:rounded-2xl border-t border-gold-primary/20 sm:border shadow-[0_-20px_60px_rgba(0,0,0,0.65)] sm:shadow-2xl flex flex-col overflow-hidden ${
          isArticle ? 'max-w-3xl h-[min(92dvh,100%)] max-h-[min(92dvh,100%)]' : 'max-w-5xl h-[min(92dvh,100%)] max-h-[min(92dvh,100%)]'
        }`}
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'modalIn .25s ease-out' }}
      >
        <style>{`@keyframes modalIn{from{transform:translateY(100%)}to{transform:translateY(0)}}@media(min-width:640px){@keyframes modalIn{from{opacity:0;transform:scale(.98) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}}`}</style>
        <div className="flex shrink-0 justify-center pt-2.5 pb-0 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent z-10" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gold-primary/10 bg-bg-primary/50 flex-shrink-0">
          <button onClick={onClose} className="p-2 -ml-1 text-text-muted hover:text-text-primary hover:bg-white/5 rounded-xl transition-all flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-xs font-medium hidden sm:inline">Back</span>
          </button>
          <div className="flex items-center gap-1">
            {isPdf && (
              <>
                <a href={pdfUrl(resource)} download onClick={(e) => e.stopPropagation()} className="p-2 text-text-muted hover:text-gold-primary hover:bg-gold-primary/10 rounded-xl transition-all" title="Download">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                </a>
                <a href={pdfUrl(resource)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-2 text-text-muted hover:text-gold-primary hover:bg-gold-primary/10 rounded-xl transition-all" title="Open in new tab">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              </>
            )}
            {isVideo && resource.source_url && (
              <a href={resource.source_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-2 text-text-muted hover:text-gold-primary hover:bg-gold-primary/10 rounded-xl transition-all" title="Open on source">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            )}
            <button onClick={onClose} className="p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all" title="Close (Esc)">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        {isPdf && (
          <div className="flex-1 overflow-hidden bg-[#525659] rounded-b-2xl">
            <iframe src={`${pdfUrl(resource)}#toolbar=0&navpanes=0&view=FitH`} className="w-full h-full border-none" title={resource.title} />
          </div>
        )}

        {isVideo && (
          <div className="flex-1 overflow-y-auto">
            <div className="w-full bg-black" style={{ aspectRatio: '16/9' }}>
              {embedSrc ? (
                <iframe src={embedSrc} className="w-full h-full border-none" title={resource.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              ) : resource.embed_html ? (
                <div className="w-full h-full flex items-center justify-center" dangerouslySetInnerHTML={{ __html: resource.embed_html }} />
              ) : null}
            </div>
            <div className="px-5 sm:px-8 py-6 max-w-3xl mx-auto">
              <span className="text-[11px] uppercase tracking-wider text-gold-primary font-bold">{resource.category}</span>
              <h1 className="text-xl sm:text-2xl font-bold text-text-primary mt-1 mb-2">{resource.title}</h1>
              <div className="text-xs text-text-muted mb-4 pb-4 border-b border-white/10">
                {resource.author_name && <span>{resource.author_name} · </span>}{fmtDate(resource.published_at || resource.created_at)}
              </div>
              {videoBody && (
                <div className="resource-prose text-text-secondary text-[15px]">{renderRich(videoBody)}</div>
              )}
            </div>
          </div>
        )}

        {isArticle && (
          <div className="flex-1 overflow-y-auto">
            {coverUrl(resource) && (
              <div className="w-full h-52 sm:h-64 overflow-hidden">
                <img src={coverUrl(resource)} alt={resource.title} className="w-full h-full object-cover" />
              </div>
            )}
            <article className="px-5 sm:px-10 py-8 max-w-3xl mx-auto">
              <span className="text-[11px] uppercase tracking-wider text-gold-primary font-bold">{resource.category}</span>
              <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mt-2 mb-3 leading-tight">{resource.title}</h1>
              <div className="flex items-center gap-2 text-xs text-text-muted mb-6 pb-6 border-b border-white/10">
                {resource.author_name && <span className="text-text-secondary font-medium">{resource.author_name}</span>}
                <span>·</span>
                <span>{fmtDate(resource.published_at || resource.created_at)}</span>
                {resource.reading_time && <><span>·</span><span>{resource.reading_time} min read</span></>}
              </div>
              {loading ? (
                <div className="space-y-3 animate-pulse">
                  {[...Array(6)].map((_, i) => <div key={i} className="h-4 rounded bg-white/5" style={{ width: `${70 + (i % 3) * 10}%` }} />)}
                </div>
              ) : resource.content_format === 'markdown' ? (
                <div className="resource-prose text-text-secondary text-[15px] leading-relaxed">
                  {renderRich(resource.content || '')}
                </div>
              ) : (
                <div
                  className="resource-prose text-text-secondary text-[15px] leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: resource.content || '<p class="text-text-muted">No content.</p>' }}
                />
              )}
            </article>
            <style>{`
              .resource-prose h2{font-size:1.4rem;font-weight:700;color:#fff;margin:1.4em 0 .5em}
              .resource-prose h3{font-size:1.15rem;font-weight:600;color:#fff;margin:1.1em 0 .4em}
              .resource-prose p{margin:.8em 0}
              .resource-prose ul{list-style:disc;padding-left:1.5em;margin:.8em 0}
              .resource-prose ol{list-style:decimal;padding-left:1.5em;margin:.8em 0}
              .resource-prose li{margin:.3em 0}
              .resource-prose a{color:#d4a853;text-decoration:underline}
              .resource-prose img{max-width:100%;border-radius:12px;margin:1em 0}
              .resource-prose blockquote{border-left:3px solid rgba(212,168,83,.5);padding-left:1em;margin:1em 0;color:#c9b59e;font-style:italic}
              .resource-prose code{background:rgba(255,255,255,.08);padding:.1em .4em;border-radius:4px;font-size:.9em}
            `}</style>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ResourceReader;
