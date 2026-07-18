// src/hooks/useDialog.js
// ════════════════════════════════════════════════════════════════
// The four behaviours every modal owes the person using it, in one place.
//
// An audit of all 252 components found 41 modal-ish surfaces, of which 20 had
// no Escape key, 22 never locked background scroll (so the page slid around
// underneath), and 29 announced nothing to a screen reader. The shared
// ui/Modal primitive already got the first three right — but only 16 files use
// it, and rewriting the other ~40 into it would mean touching the markup of
// every dialog in the product. This hook adds the behaviour without moving a
// single element, so a hand-rolled modal becomes correct by adding one line.
//
// Follows the WAI-ARIA APG dialog pattern: focus enters the dialog, is trapped
// while it is open, Escape dismisses, and focus returns to whatever opened it.
// ════════════════════════════════════════════════════════════════
import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

// Scroll lock is reference-counted on purpose. A modal that opens another modal
// is common here (a signal row opens the detail, which opens a chart), and if
// each one restored body.overflow on its own way out, dismissing the inner one
// would unlock the page while the outer was still covering it.
let lockCount = 0;
let savedOverflow = "";
let savedPaddingRight = "";

function lockScroll() {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    savedPaddingRight = document.body.style.paddingRight;
    // Removing the scrollbar shifts the whole page a few pixels; pad it back so
    // the layout doesn't visibly jump the moment a dialog opens.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPaddingRight;
  }
}

/**
 * @param {object}   opts
 * @param {boolean}  opts.isOpen
 * @param {function} opts.onClose      called on Escape
 * @param {object}   [opts.ref]        the dialog container; enables focus trap
 * @param {boolean}  [opts.closeOnEscape=true]
 * @param {boolean}  [opts.scrollLock=true]
 * @param {boolean}  [opts.restoreFocus=true]
 */
export function useDialog({
  isOpen,
  onClose,
  ref,
  closeOnEscape = true,
  scrollLock = true,
  restoreFocus = true,
} = {}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const openerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    // Remember what had focus so it can be handed back on close — otherwise
    // focus falls to the top of the document and keyboard users lose their place.
    openerRef.current = document.activeElement;

    if (scrollLock) lockScroll();

    const onKeyDown = (e) => {
      if (closeOnEscape && e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !ref?.current) return;

      const items = Array.from(ref.current.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];

      // Wrap at both ends so Tab can never walk out into the page behind.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!ref.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    // Move focus in, one frame later so the dialog has rendered. Prefer an
    // element that opted in via data-autofocus; otherwise the container itself,
    // which keeps long dialogs scrolled to their top rather than jumping to
    // whatever control happens to be first.
    const raf = requestAnimationFrame(() => {
      const root = ref?.current;
      if (!root) return;
      const target =
        root.querySelector("[data-autofocus]") ||
        (root.hasAttribute("tabindex") ? root : null) ||
        root.querySelector(FOCUSABLE);
      target?.focus?.({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      if (scrollLock) unlockScroll();
      if (restoreFocus) {
        const opener = openerRef.current;
        if (opener && typeof opener.focus === "function" && document.contains(opener)) {
          opener.focus({ preventScroll: true });
        }
      }
    };
  }, [isOpen, closeOnEscape, scrollLock, restoreFocus, ref]);
}

export default useDialog;
