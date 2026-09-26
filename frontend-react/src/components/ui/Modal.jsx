// src/components/ui/Modal.jsx
// LuxQuant modal shell — timeless desk: solid surface, sticky chrome,
// responsive sheet (mobile) / dialog (desktop). Blur ONLY on backdrop layer.
//
// Patterns:
// 1) Simple: <Modal title="…">…<ModalFooter/></Modal>
// 2) Sticky: <Modal padded={false} header={…} footer={…}>scroll body</Modal>

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Z } from "../../constants/zIndex";
import { useDialog } from "../../hooks/useDialog";

const EXIT_MS = 200;

// Content-heavy sheets open at the full ("large") detent on a phone and stay
// there. Sized to their content they changed height every time a tab inside
// them did, so the grabber jumped up and down the screen under your thumb.
const TALL = new Set(["desk", "full"]);

// Swipe to dismiss, the way a phone sheet has closed since iOS 13: past a
// quarter of the sheet, or a flick, and it goes; anything less springs back.
const SWIPE_DISTANCE = 0.25;
const SWIPE_MAX_PX = 150;
const SWIPE_FLICK = 0.5; // px per ms
const PHONE_QUERY = "(max-width: 639.98px)";

function canTranslate() {
  // The drag moves the card with the individual `translate` property, because
  // the entry animation holds `transform` and an animation outranks an inline
  // style. Where `translate` is missing the gesture would move nothing, so it
  // is not offered at all.
  return typeof CSS !== "undefined" && CSS.supports?.("translate", "0 1px");
}

const SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-[820px]",
  "2xl": "max-w-[1100px]",
  // Same width as SignalModal — planners and other wide desks. Below `sm` a
  // sheet is the screen's own width: 96vw left a 9px strip of page down both
  // sides, which is a card floating in front of the app, not a sheet.
  desk: "max-w-full sm:max-w-[min(1280px,96vw)] xl:max-w-[1360px]",
  // Data desk — wide tables that are unreadable at any fixed width.
  full: "max-w-full sm:max-w-[98vw]",
  // Reading / news desk — narrow phone sheet · wide desktop reader
  reader: "max-w-full sm:max-w-[min(720px,92vw)] md:max-w-[min(800px,90vw)] lg:max-w-[840px]",
};

export default function Modal({ isOpen, onClose, title, subtitle, eyebrow, icon, header, footer, size = "md", placement = "bottom", animate = true, padded = true, usePortal = true, closeOnBackdrop = true, showClose = true, zIndex = Z.modal, children, className = "" }) {
  const [mounted, setMounted] = useState(isOpen);
  const [closing, setClosing] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      runExit(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Escape, background-scroll lock, focus trap and focus restore all come from
  // the shared hook. The lock it applies is reference-counted, which the local
  // version here was not: a dialog opened from inside another dialog used to
  // unlock the page on its way out while the outer one was still covering it.
  const cardRef = useRef(null);
  const scrimRef = useRef(null);
  const drag = useRef(null);
  useDialog({ isOpen: mounted && !closing, onClose: requestClose, ref: cardRef });

  useEffect(() => () => clearTimeout(timer.current), []);

  function runExit(callOnClose) {
    if (closing) return;
    if (!animate) {
      setMounted(false);
      if (callOnClose) onClose?.();
      return;
    }
    setClosing(true);
    timer.current = setTimeout(() => {
      setMounted(false);
      setClosing(false);
      if (callOnClose) onClose?.();
    }, EXIT_MS);
  }

  function requestClose() {
    runExit(true);
  }

  // Only a bottom sheet that may be dismissed casually — a dialog that refuses
  // the backdrop tap is refusing this too — and only where it is a sheet.
  const swipeable = placement === "bottom" && closeOnBackdrop;

  // The gesture is followed on the window from the moment the finger lands.
  // Listening only on the header lost every move that left it before the drag
  // was recognised — and the release too, which left a half-started drag
  // behind that swallowed every swipe after it.
  function endListeners(d) {
    window.removeEventListener("pointermove", d.onMove);
    window.removeEventListener("pointerup", d.onEnd);
    window.removeEventListener("pointercancel", d.onEnd);
  }

  function onDragStart(e) {
    if (!swipeable) return;
    if (e.button != null && e.button !== 0) return;
    if (typeof window === "undefined" || !window.matchMedia?.(PHONE_QUERY).matches) return;
    if (!canTranslate()) return;
    // A tap on a control inside the header stays a tap.
    if (e.target?.closest?.("button, a, input, select, textarea, label, [role='button'], [data-no-drag]")) return;
    const card = cardRef.current;
    if (!card) return;
    if (drag.current) endListeners(drag.current);
    const d = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      dy: 0,
      h: card.offsetHeight || 1,
      live: false,
      trail: [{ t: e.timeStamp, y: e.clientY }],
    };
    d.onMove = (ev) => onDragMove(ev, d);
    d.onEnd = (ev) => onDragEnd(ev, d);
    drag.current = d;
    window.addEventListener("pointermove", d.onMove);
    window.addEventListener("pointerup", d.onEnd);
    window.addEventListener("pointercancel", d.onEnd);
  }

  function onDragMove(e, d) {
    if (e.pointerId !== d.id || drag.current !== d) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.live) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      // Up or sideways is somebody reading, not dismissing.
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
        endListeners(d);
        drag.current = null;
        return;
      }
      d.live = true;
      cardRef.current.style.transition = "none";
      if (scrimRef.current) scrimRef.current.style.transition = "none";
    }
    d.dy = Math.max(0, dy);
    cardRef.current.style.translate = `0 ${d.dy}px`;
    if (scrimRef.current) {
      scrimRef.current.style.opacity = String(Math.max(0, 1 - d.dy / (d.h * 1.1)));
    }
    d.trail.push({ t: e.timeStamp, y: e.clientY });
    if (d.trail.length > 6) d.trail.shift();
  }

  function onDragEnd(e, d) {
    if (e.pointerId !== d.id) return;
    endListeners(d);
    if (drag.current === d) drag.current = null;
    if (!d.live) return;
    // A drag is not a tap: the click the browser derives from this release
    // must not land on whatever ended up under the finger — the backdrop
    // included.
    const swallow = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);

    const card = cardRef.current;
    const scrim = scrimRef.current;
    if (!card) return;
    const a = d.trail[0];
    const b = d.trail[d.trail.length - 1];
    const v = b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
    const go =
      e.type !== "pointercancel" &&
      (d.dy > Math.min(SWIPE_MAX_PX, d.h * SWIPE_DISTANCE) || (v > SWIPE_FLICK && d.dy > 24));
    if (go) {
      card.style.transition = "translate 220ms cubic-bezier(.3,.7,.4,1)";
      card.style.translate = `0 ${d.h + 24}px`;
      if (scrim) {
        scrim.style.transition = "opacity 220ms ease";
        scrim.style.opacity = "0";
      }
      clearTimeout(timer.current);
      // It has already left the screen, so it closes without the keyframe exit
      // — that one starts from the resting position and would bounce back up.
      timer.current = setTimeout(() => {
        setMounted(false);
        setClosing(false);
        onClose?.();
      }, 220);
    } else {
      card.style.transition = "translate 320ms cubic-bezier(.2,.9,.25,1)";
      card.style.translate = "0 0";
      if (scrim) {
        scrim.style.transition = "opacity 320ms ease";
        scrim.style.opacity = "";
      }
    }
  }

  // A drag in flight when the sheet unmounts must not leave window listeners.
  useEffect(
    () => () => {
      if (drag.current) endListeners(drag.current);
    },
    []
  );

  const dragHandlers = swipeable ? { onPointerDown: onDragStart } : {};

  if (!mounted) return null;

  const renderSlot = (slot) => (typeof slot === "function" ? slot(requestClose) : slot);

  const simpleHeader = !header && (eyebrow || title || subtitle || icon);
  const hasChrome = Boolean(header || simpleHeader);
  const node = (
    <div
      style={{ zIndex }}
      className={`lqm-root ${closing ? "is-closing" : ""} ${animate ? "lqm-animate" : ""} fixed inset-0`}
      role="presentation"
    >
      <style>{`
 .lqm-root.lqm-animate .lqm-scrim {
 animation: lqmOverlayIn .22s ease;
 }
 .lqm-root.lqm-animate.is-closing .lqm-scrim {
 animation: lqmOverlayOut ${EXIT_MS}ms ease forwards;
 }
 .lqm-root.lqm-animate .lqm-card {
 animation: lqmCardIn .28s cubic-bezier(.16,1,.3,1) forwards;
 }
 .lqm-root.lqm-animate.is-closing .lqm-card {
 animation: lqmCardOut ${EXIT_MS}ms ease forwards;
 }
 @keyframes lqmOverlayIn {
 from { opacity: 0; }
 to { opacity: 1; }
 }
 @keyframes lqmOverlayOut {
 from { opacity: 1; }
 to { opacity: 0; }
 }
 @keyframes lqmCardIn {
 from { opacity: 0; transform: scale(.97) translateY(12px); }
 to { opacity: 1; transform: scale(1) translateY(0); }
 }
 @keyframes lqmCardOut {
 from { opacity: 1; transform: scale(1); }
 to { opacity: 0; transform: scale(.97) translateY(10px); }
 }
 .lqm-scroll { scrollbar-width: thin; scrollbar-color: rgb(var(--ink) / 0.12) transparent; }
 .lqm-scroll::-webkit-scrollbar { width: 6px; }
 .lqm-scroll::-webkit-scrollbar-track { background: transparent; }
 .lqm-scroll::-webkit-scrollbar-thumb { background: rgb(var(--ink) / 0.1); border-radius: 6px; }
 .lqm-scroll::-webkit-scrollbar-thumb:hover { background: rgb(var(--ink) / 0.18); }
 /* A phone sheet slides, solid, the whole way — faded in from .6 it showed
    the page through itself for the first half of the rise. */
 @media (max-width: 639px) {
 .lqm-root.lqm-animate .lqm-card.lqm-sheet {
 animation: lqmSheetIn .32s cubic-bezier(.16,1,.3,1) forwards;
 }
 .lqm-root.lqm-animate.is-closing .lqm-card.lqm-sheet {
 animation: lqmSheetOut ${EXIT_MS}ms ease forwards;
 }
 }
 @keyframes lqmSheetIn {
 from { transform: translateY(100%); }
 to { transform: translateY(0); }
 }
 @keyframes lqmSheetOut {
 from { transform: translateY(0); }
 to { transform: translateY(100%); }
 }
 @media (max-width: 639px) {
 .lqm-card.lqm-sheet.lqm-tall { height: min(100%, var(--lq-modal-maxh)); }
 }
 `}</style>

      {/* Scrim — blur lives ONLY here, never on the card. `.lq-scrim` is fixed
          to the viewport, so it covers the strip behind the header too and the
          dialog never floats over a sharp, undimmed band. */}
      <div
        ref={scrimRef}
        className="lqm-scrim lq-scrim"
        onClick={closeOnBackdrop ? requestClose : undefined}
        aria-hidden="true"
      />

      {/* Layout frame — no backdrop-filter, so card chrome stays crisp.
          `.lq-modal-safe` is where the header clearance lives: it shortens the
          frame, not the scrim. */}
      <div
        className={`lq-modal-safe pointer-events-none absolute inset-0 flex justify-center ${
          /* Never use Tailwind p-0 here — it zeros padding-top and fights
             header clearance on mobile sheets. Horizontal-only reset. */
          placement === "bottom"
            ? "items-end px-0 pb-0 sm:items-center sm:px-4 sm:pb-4 sm:pt-0 md:px-6 md:pb-6"
            : "items-center px-3 pb-3 sm:px-4 sm:pb-4 md:px-6 md:pb-6"
        }`}
      >
        <div
          ref={cardRef}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          className={`lqm-card pointer-events-auto relative flex min-h-0 w-full flex-col overflow-hidden border border-ink/[0.09] shadow-[0_28px_80px_rgb(var(--scrim) / 0.35)] isolate ${
            SIZES[size] || SIZES.md
          } ${
            placement === "bottom"
              ? `lqm-sheet rounded-t-[20px] border-x-0 border-b-0 sm:rounded-2xl sm:border-x sm:border-b ${
                  TALL.has(size) ? "lqm-tall" : ""
                }`
              : "rounded-2xl"
          } ${className}`}
          style={{
            // Explicit solid surface — never translucent over blurred scrim.
            // Height budget comes from --lq-modal-maxh (header + gap + bottom
            // clearance) so the card never jams under the app chrome; body
            // scrolls inside instead.
            background: "rgb(var(--surface-raised))",
            maxHeight: "min(100%, var(--lq-modal-maxh), 920px)",
          }}
        >
          {placement === "bottom" ? (
            <div
              className={`flex shrink-0 justify-center pb-1 pt-2 sm:hidden ${
                swipeable ? "cursor-grab touch-none active:cursor-grabbing" : ""
              }`}
              aria-hidden="true"
              {...dragHandlers}
            >
              <span className="h-[5px] w-9 rounded-full bg-ink/20" />
            </div>
          ) : null}

          {/* The tinted hairline that used to sit here is gone. `accent` and
              `accentColor` are still accepted so the dozen call sites keep
              working, but nothing paints a coloured rim on a modal any more:
              every panel is one flat surface from edge to edge, and the state
              those colours encoded is already spelled out in the header. */}

          {/* Sticky header — solid, isolation, never under page blur */}
          {header ? (
            <div
              className={`relative z-20 flex shrink-0 items-center border-b border-ink/[0.07] px-4 py-3 sm:px-5 sm:py-3.5 ${
                placement === "bottom" ? "pt-1.5 sm:pt-3.5" : ""
              } ${showClose ? "pr-12 sm:pr-14" : ""} ${swipeable ? "touch-pan-x" : ""}`}
              style={{ background: "rgb(var(--surface-raised))" }}
              {...dragHandlers}
            >
              <div className="min-w-0 flex-1">{renderSlot(header)}</div>
            </div>
          ) : simpleHeader ? (
            <div
              className={`relative z-20 shrink-0 border-b border-ink/[0.07] px-4 pb-3.5 sm:px-6 sm:py-4 ${
                placement === "bottom" ? "pt-1 sm:pt-4" : "pt-4"
              } ${showClose ? "pr-14" : ""} ${swipeable ? "touch-pan-x" : ""}`}
              style={{ background: "rgb(var(--surface-raised))" }}
              {...dragHandlers}
            >
              {eyebrow ? (
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  {eyebrow}
                </p>
              ) : null}
              {icon || title ? (
                <div className={`flex items-center gap-3 ${eyebrow ? "mt-2" : ""}`}>
                  {icon ? <span className="shrink-0">{icon}</span> : null}
                  {title ? (
                    <h2 className="font-display text-[17px] font-semibold leading-snug tracking-tight text-text-primary sm:text-xl">
                      {title}
                    </h2>
                  ) : null}
                </div>
              ) : null}
              {subtitle ? (
                <p className="mt-1 text-[13px] leading-snug text-text-muted sm:mt-1.5 sm:text-sm sm:leading-relaxed">
                  {subtitle}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Close — solid chrome chip, always above content */}
          {showClose ? (
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className={`absolute right-3 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-ink/12 bg-surface-secondary text-text-secondary transition-colors hover:border-ink/25 hover:text-text-primary sm:right-4 sm:rounded-md ${
                placement === "bottom"
                  ? "top-4 sm:top-3"
                  : hasChrome
                    ? "top-2.5 sm:top-3"
                    : "top-3 sm:top-3.5"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          ) : null}

          {/* Body scroll */}
          <div className="lqm-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {padded ? (
              <div
                className={`px-4 pt-4 ${footer ? "pb-4" : ""} ${
                  hasChrome ? "sm:px-6 sm:py-6" : "sm:p-6"
                }`}
              >
                {children}
              </div>
            ) : (
              children
            )}
            {/* On a phone the sheet runs to the last pixel, so the end of the
                content has to clear the home indicator itself. A footer owns
                that padding when there is one. */}
            {!footer ? (
              <div
                aria-hidden="true"
                className={padded ? "sm:hidden" : "h-0 sm:hidden"}
                style={{ height: padded ? "max(16px, env(safe-area-inset-bottom, 0px))" : "env(safe-area-inset-bottom, 0px)" }}
              />
            ) : null}
          </div>

          {/* Sticky footer — solid + safe-area */}
          {footer ? (
            <div
              className="relative z-20 shrink-0 border-t border-ink/[0.07] px-4 pt-3 sm:px-5"
              style={{
                background: "rgb(var(--surface-raised))",
                paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))",
              }}
            >
              {renderSlot(footer)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (usePortal && typeof document !== "undefined") {
    return createPortal(node, document.body);
  }
  return node;
}

export function ModalFooter({ children, className = "" }) {
  return <div className={`mt-6 flex gap-3 ${className}`}>{children}</div>;
}
