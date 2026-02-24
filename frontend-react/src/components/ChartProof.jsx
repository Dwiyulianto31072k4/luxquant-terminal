import { useState } from 'react';

/**
 * ChartProof - Before/After chart screenshot viewer
 * 
 * Props:
 *   entryChartUrl  - URL for entry screenshot (Before)
 *   latestChartUrl - URL for latest update screenshot (After) 
 *   pair           - Trading pair name
 *   status         - Signal status (open, tp1, tp2, etc.)
 *   variant        - 'thumbnail' | 'card' | 'modal' (controls size/layout)
 */
const ChartProof = ({ entryChartUrl, latestChartUrl, pair, status, variant = 'card' }) => {
  const [activeView, setActiveView] = useState(latestChartUrl ? 'after' : 'before');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState('');
  const [imgError, setImgError] = useState({});

  const hasAfter = !!latestChartUrl;
  const hasBefore = !!entryChartUrl;

  if (!hasBefore && !hasAfter) return null;

  const currentUrl = activeView === 'after' && hasAfter ? latestChartUrl : entryChartUrl;

  const handleImageError = (key) => {
    setImgError(prev => ({ ...prev, [key]: true }));
  };

  const openLightbox = (url) => {
    setLightboxSrc(url);
    setLightboxOpen(true);
  };

  // ═══════════════════════════════════════
  // THUMBNAIL variant (for signal table rows / gainer rows)
  // ═══════════════════════════════════════
  if (variant === 'thumbnail') {
    const thumbUrl = hasAfter ? latestChartUrl : entryChartUrl;
    if (imgError[thumbUrl]) return null;

    return (
      <>
        <div 
          className="relative w-16 h-10 rounded-md overflow-hidden cursor-pointer group border border-gold-primary/20 hover:border-gold-primary/50 transition-all flex-shrink-0"
          onClick={(e) => { e.stopPropagation(); openLightbox(thumbUrl); }}
        >
          <img 
            src={thumbUrl} 
            alt={`${pair} chart`}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
            onError={() => handleImageError(thumbUrl)}
            loading="lazy"
          />
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <svg className="w-3 h-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </div>
          {/* Status indicator dot */}
          {hasAfter && (
            <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-green-400 shadow-sm shadow-green-400/50" />
          )}
        </div>

        {/* Lightbox */}
        {lightboxOpen && <Lightbox src={lightboxSrc} pair={pair} onClose={() => setLightboxOpen(false)} />}
      </>
    );
  }

  // ═══════════════════════════════════════
  // CARD variant (for signal cards with Before/After toggle)
  // ═══════════════════════════════════════
  if (variant === 'card') {
    return (
      <>
        <div className="mt-2.5">
          {/* Before/After Toggle */}
          {hasAfter && hasBefore && (
            <div className="flex items-center gap-1 mb-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); setActiveView('before'); }}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-all ${
                  activeView === 'before'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                    : 'text-text-muted hover:text-white border border-transparent'
                }`}
              >
                Before
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveView('after'); }}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-all ${
                  activeView === 'after'
                    ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                    : 'text-text-muted hover:text-white border border-transparent'
                }`}
              >
                After
              </button>
              <span className="text-text-muted/40 text-[9px] ml-auto">
                {activeView === 'before' ? 'Entry' : status?.toUpperCase() || 'Latest'}
              </span>
            </div>
          )}

          {/* Chart Image */}
          {currentUrl && !imgError[currentUrl] && (
            <div 
              className="relative rounded-lg overflow-hidden border border-gold-primary/10 cursor-pointer group"
              onClick={(e) => { e.stopPropagation(); openLightbox(currentUrl); }}
            >
              <img 
                src={currentUrl}
                alt={`${pair} ${activeView === 'before' ? 'entry' : 'latest'} chart`}
                className="w-full h-auto object-contain group-hover:brightness-110 transition-all"
                onError={() => handleImageError(currentUrl)}
                loading="lazy"
              />
              {/* Zoom icon */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                </div>
              </div>
            </div>
          )}
        </div>

        {lightboxOpen && <Lightbox src={lightboxSrc} pair={pair} onClose={() => setLightboxOpen(false)} />}
      </>
    );
  }

  // ═══════════════════════════════════════
  // MODAL variant (large Before/After comparison for SignalModal)
  // ═══════════════════════════════════════
  if (variant === 'modal') {
    return (
      <div className="space-y-3">
        {/* Toggle Buttons */}
        <div className="flex items-center gap-2">
          {hasBefore && (
            <button
              onClick={() => setActiveView('before')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeView === 'before'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40 shadow-sm shadow-blue-500/10'
                  : 'bg-bg-card text-text-muted border border-gold-primary/10 hover:text-white hover:border-gold-primary/30'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              Before (Entry)
            </button>
          )}
          {hasAfter && (
            <button
              onClick={() => setActiveView('after')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeView === 'after'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/40 shadow-sm shadow-green-500/10'
                  : 'bg-bg-card text-text-muted border border-gold-primary/10 hover:text-white hover:border-gold-primary/30'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-green-400" />
              After ({status?.toUpperCase() || 'Latest'})
            </button>
          )}
        </div>

        {/* Chart Image - Large */}
        {currentUrl && !imgError[currentUrl] ? (
          <div 
            className="relative rounded-xl overflow-hidden border border-gold-primary/10 cursor-pointer group"
            onClick={() => openLightbox(currentUrl)}
          >
            <img 
              src={currentUrl}
              alt={`${pair} ${activeView} chart`}
              className="w-full h-auto object-contain"
              onError={() => handleImageError(currentUrl)}
              loading="lazy"
            />
            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="px-3 py-1.5 rounded-lg bg-black/70 text-white text-xs font-medium flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                Full Screen
              </div>
            </div>
            {/* Before/After label overlay */}
            <div className="absolute top-3 left-3">
              <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                activeView === 'before' 
                  ? 'bg-blue-500/80 text-white' 
                  : 'bg-green-500/80 text-white'
              }`}>
                {activeView === 'before' ? 'ENTRY' : status?.toUpperCase() || 'LATEST'}
              </span>
            </div>
          </div>
        ) : (
          <div className="glass-card rounded-xl p-12 border border-gold-primary/10 text-center">
            <div className="w-16 h-16 rounded-full bg-bg-card flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">📷</span>
            </div>
            <p className="text-text-muted text-sm">Chart screenshot not available</p>
            <p className="text-text-muted/50 text-xs mt-1">Will be captured when a new signal comes in</p>
          </div>
        )}

        {/* Lightbox fullscreen */}
        {lightboxOpen && <Lightbox src={lightboxSrc} pair={pair} onClose={() => setLightboxOpen(false)} />}
      </div>
    );
  }

  return null;
};


// ═══════════════════════════════════════
// Lightbox (fullscreen overlay)
// ═══════════════════════════════════════
const Lightbox = ({ src, pair, onClose }) => {
  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Close button */}
      <button 
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
        onClick={onClose}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Pair name */}
      <div className="absolute top-4 left-4 text-white/60 text-sm font-mono">
        {pair}
      </div>

      {/* Image */}
      <img 
        src={src}
        alt={`${pair} chart fullscreen`}
        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
};


export default ChartProof;