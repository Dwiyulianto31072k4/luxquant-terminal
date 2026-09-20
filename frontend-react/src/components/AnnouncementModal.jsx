// src/components/AnnouncementModal.jsx
// ════════════════════════════════════════════════════════════════
// Admin-driven campaign modal (user-facing, global).
// Fetches the single most relevant active announcement from the
// backend, which already applies audience targeting + per-user
// frequency (max_shows + cooldown + stop-after-action).
//
// Frontend just: fetch → show after delay → report seen/dismiss/act.
// No localStorage; the server is the source of truth for frequency.
//
// Layout is the app-store campaign card: the artwork is an inset
// rounded tile rather than a full-bleed banner, the badge rides on
// the artwork, and the CTA is one pill the thumb can't miss. The
// artwork therefore has to survive being cropped on both edges —
// it is `object-cover` in a fixed 16:10 box, so anything that must
// be read (text in the image) belongs in the middle, not the rim.
//
// The card is exported on its own because it is the only part worth
// looking at: `src/__preview` renders <CampaignCard> against fixtures
// at several widths, which needs neither a session nor the network.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useId } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/authApi";
import { useDialog } from "../hooks/useDialog";

const INITIAL_DELAY_MS = 5000;

export const CampaignCard = ({ ann, onDismiss, onAct, dialogRef }) => {
  // A broken image URL must remove the whole tile, not just the <img>:
  // hiding the image alone leaves its 16:10 box as an empty grey slab.
  const [artOk, setArtOk] = useState(true);
  const titleId = useId();

  useEffect(() => {
    setArtOk(true);
  }, [ann?.image_url]);

  if (!ann) return null;

  const isInternal = ann.cta_url && ann.cta_url.startsWith("/");
  const hasArt = !!ann.image_url && artOk;
  const badge = (ann.badge || "").trim();

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="relative w-full max-w-[420px] max-h-[min(var(--lq-modal-maxh),100%)] flex flex-col overflow-hidden rounded-t-[28px] sm:rounded-3xl animate-[annSheetUp_.32s_cubic-bezier(.16,1,.3,1)] bg-surface-raised"
      style={{
        border: "1px solid rgb(var(--ink) / 0.1)",
        boxShadow: "0 -20px 60px rgb(var(--scrim) / 0.35)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <style>{`@keyframes annSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}@media(min-width:640px){@keyframes annSheetUp{from{opacity:0;transform:scale(.97) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}}`}</style>
      <div className="flex shrink-0 justify-center pt-2.5 pb-1 sm:hidden" aria-hidden="true">
        <div className="h-1 w-10 rounded-full bg-ink/25" />
      </div>

      {/* close — over the artwork it needs its own dark disc, because the image
          behind it is arbitrary. `--ink` is white on the dark desks but slate on
          Bright, so the glyph would vanish on a light photo; the disc is always
          dark (--scrim) and the glyph always light. With no artwork the button
          sits on a theme surface and uses theme tokens. */}
      <button
        onClick={onDismiss}
        className={
          "absolute z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors " +
          (hasArt
            ? "top-5 right-5 sm:top-6 sm:right-6 bg-scrim/55 hover:bg-scrim/75 backdrop-blur-sm"
            : "top-4 right-4 text-text-muted hover:text-text-primary hover:bg-ink/[0.06]")
        }
        style={hasArt ? { color: "#fff" } : undefined}
        aria-label="Close"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* artwork tile — inset, not full-bleed */}
        {hasArt && (
          <div className="px-3 pt-3 sm:px-4 sm:pt-4">
            <div
              className="relative overflow-hidden rounded-2xl"
              // 16:10 is the shape, but not at any cost: on a landscape phone
              // (measured 740x380) the tile filled the whole scroll area and
              // pushed the title below the fold, so the card opened as a
              // picture with no message. The cap lets the art lose height —
              // object-cover crops it — and keeps the headline on screen. It
              // does not bite on a normal portrait phone.
              style={{
                aspectRatio: "16 / 10",
                maxHeight: "min(38vh, 260px)",
                border: "1px solid rgb(var(--ink) / 0.08)",
              }}
            >
              <img
                src={ann.image_url}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setArtOk(false)}
              />
              {badge && (
                <span
                  className="absolute bottom-3 left-3 rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: "rgb(var(--accent))",
                    color: "rgb(var(--accent-fg))",
                    boxShadow: "0 2px 10px rgb(var(--scrim) / 0.45)",
                  }}
                >
                  {badge}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="px-5 pb-1 pt-4 sm:px-6">
          {/* no artwork to ride on — the badge becomes a chip above the title */}
          {badge && !hasArt && (
            <span
              className="mb-2.5 inline-block rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider"
              style={{ background: "rgb(var(--accent))", color: "rgb(var(--accent-fg))" }}
            >
              {badge}
            </span>
          )}

          {/* title */}
          <h3
            id={titleId}
            className="font-display text-[21px] font-bold leading-[1.18] tracking-tight text-text-primary sm:text-[23px]"
          >
            {ann.title}
          </h3>

          {/* body */}
          {ann.body && (
            <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-text-secondary">
              {ann.body}
            </p>
          )}
        </div>
      </div>

      {/* sticky CTA footer — never covered by bottom nav / home indicator */}
      <div
        className="shrink-0 px-5 pt-4 sm:px-6 flex flex-col gap-1"
        style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom, 0px))" }}
      >
        {ann.cta_label && ann.cta_url && (
          <a
            href={ann.cta_url}
            onClick={onAct}
            target={isInternal ? undefined : "_blank"}
            // rel is a SPACE-separated token list. Comma-separated, the browser
            // reads one unknown token and applies neither — so this link looked
            // protected while the opened page kept window.opener access and could
            // navigate this tab somewhere else.
            rel={isInternal ? undefined : "noopener noreferrer"}
            className="w-full rounded-full py-3.5 text-center font-display text-[14px] font-bold shadow-cta transition-transform active:scale-[0.985]"
            style={{
              // Was a literal #b8893c. This card now renders on Bright too, where a
              // browner bronze reads as a different gold from the rest of the app;
              // --accent-dark is the token the gold CTAs already share.
              background:
                "linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-dark)))",
              color: "rgb(var(--accent-fg))",
            }}
          >
            {ann.cta_label}
          </a>
        )}
        <button
          onClick={onDismiss}
          className="w-full rounded-full py-2.5 text-[12.5px] font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          {ann.cta_label ? "Dismiss" : "Got it"}
        </button>
      </div>
    </div>
  );
};

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
        const res = await api.get("/api/v1/announcements/active");
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

    return () => {
      cancelled = true;
    };
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

  // Escape to dismiss, background scroll locked, focus trapped and handed
  // back to whatever opened this. See hooks/useDialog.
  // Declared ABOVE the early return: hooks must run on every render, and this
  // component bails out with `return null` while hidden.
  const dialogRef = useRef(null);
  useDialog({ isOpen: visible && !!ann, onClose: dismiss, ref: dialogRef });

  if (!visible || !ann) return null;

  return (
    <div
      className="lq-modal-safe lq-scrim-bg fixed inset-0 z-[9999] flex items-end justify-center sm:items-center p-0 sm:p-4"
      onClick={dismiss}
    >
      <CampaignCard ann={ann} onDismiss={dismiss} onAct={act} dialogRef={dialogRef} />
    </div>
  );
};

export default AnnouncementModal;
