// src/components/AnnouncementModal.jsx
// ════════════════════════════════════════════════════════════════
// Admin-driven announcement modal (user-facing, global).
//   Fetches the single most relevant active announcement from the
//   backend, which already applies audience targeting + per-user
//   frequency (max_shows + cooldown + stop-after-action).
//
//   Frontend just: fetch → show after delay → report seen/dismiss/act.
//   No localStorage; the server is the source of truth for frequency.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/authApi';

const INITIAL_DELAY_MS = 5000;

const AnnouncementModal = () => {
  const { isAuthenticated } = useAuth();
  const [ann, setAnn] = useState(null);
  const [visible, setVisible] = useState(false);

  // fetch the active announcement once authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await api.get('/api/v1/announcements/active');
        const data = res.data;
        if (!cancelled && data && data.id) {
          // wait a beat so it doesn't slam the user on load
          setTimeout(() => {
            if (cancelled) return;
            setAnn(data);
            setVisible(true);
            // record that it was shown (bumps shows + cooldown)
            api.post(`/api/v1/announcements/${data.id}/seen`).catch(() => {});
          }, INITIAL_DELAY_MS);
        }
      } catch {
        /* no announcement / not logged in — silent */
      }
    })();

    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (ann?.id) api.post(`/api/v1/announcements/${ann.id}/dismiss`).catch(() => {});
  }, [ann]);

  const act = useCallback(() => {
    if (ann?.id) api.post(`/api/v1/announcements/${ann.id}/act`).catch(() => {});
    setVisible(false);
    // navigation handled by the <a> href; internal paths use normal nav
  }, [ann]);

  if (!visible || !ann) return null;

  const isInternal = ann.cta_url && ann.cta_url.startsWith('/');

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center p-0 sm:p-4"
      style={{ background: 'rgba(5,5,6,0.72)', backdropFilter: 'blur(4px)' }}
      onClick={dismiss}
    >
      <div
        className="relative w-full max-w-sm max-h-[min(92dvh,100%)] flex flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl animate-[annSheetUp_.32s_cubic-bezier(.16,1,.3,1)]"
        style={{
          background: 'linear-gradient(160deg, #0d0405, #0a0506)',
          border: '1px solid rgba(212,168,83,0.18)',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.65)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`@keyframes annSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}@media(min-width:640px){@keyframes annSheetUp{from{opacity:0;transform:scale(.97) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}}`}</style>
        <div className="flex shrink-0 justify-center pt-2.5 pb-1 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        {/* close */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-md flex items-center justify-center text-white/70 hover:text-white bg-black/30 hover:bg-black/50 transition-colors"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* optional image */}
          {ann.image_url && (
            <div className="w-full" style={{ maxHeight: 200, overflow: 'hidden' }}>
              <img
                src={ann.image_url}
                alt=""
                className="w-full object-cover"
                style={{ maxHeight: 200 }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
          )}

          <div className="p-6 pt-4">
            {/* title */}
            <h3
              className="text-white text-lg font-semibold leading-snug"
              style={{ fontFamily: '"Playfair Display", serif' }}
            >
              {ann.title}
            </h3>

            {/* body */}
            {ann.body && (
              <p className="text-text-muted/75 text-xs mt-2 leading-relaxed whitespace-pre-line">
                {ann.body}
              </p>
            )}
          </div>
        </div>

        {/* sticky CTA footer — never covered by bottom nav / home indicator */}
        <div
          className="shrink-0 border-t border-white/[0.06] px-6 pt-3 flex flex-col gap-2"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))' }}
        >
          {ann.cta_label && ann.cta_url && (
            <a
              href={ann.cta_url}
              onClick={act}
              target={isInternal ? undefined : '_blank'}
              rel={isInternal ? undefined : 'noopener,noreferrer'}
              className="w-full py-2.5 rounded-md font-mono text-[11px] uppercase tracking-wider font-bold text-center transition-all"
              style={{
                background: 'linear-gradient(135deg, #d4a853, #b8893c)',
                color: '#0a0506',
                border: '1px solid rgba(212,168,83,0.3)',
              }}
            >
              {ann.cta_label}
            </a>
          )}
          <button
            onClick={dismiss}
            className="w-full py-2 rounded-md font-mono text-[10px] uppercase tracking-wider text-text-muted/50 hover:text-text-muted/80 transition-colors"
          >
            {ann.cta_label ? 'Dismiss' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementModal;
