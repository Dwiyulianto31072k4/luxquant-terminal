// src/components/ui/BottomSheet.jsx
// Shared mobile bottom-sheet shell (same pattern as SignalStatusModal / MarketPulse).
// Mobile: pinned to bottom, rounded top, drag handle, safe-area footer.
// Desktop (sm+): centered card.
// Always portal to body so app bottom-nav never covers CTAs.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Z } from "../../constants/zIndex";

const EXIT_MS = 200;

/**
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {React.ReactNode} [props.header]
 * @param {React.ReactNode} [props.footer]
 * @param {React.ReactNode} props.children
 * @param {string} [props.maxWidth] Tailwind max-w class
 * @param {string} [props.className]
 * @param {string} [props.ariaLabel]
 * @param {boolean} [props.closeOnBackdrop]
 * @param {number} [props.zIndex]
 */
export default function BottomSheet({
  isOpen,
  onClose,
  header,
  footer,
  children,
  maxWidth = "max-w-lg",
  className = "",
  ariaLabel = "Dialog",
  closeOnBackdrop = true,
  zIndex = Z.modal,
}) {
  const [mounted, setMounted] = useState(isOpen);
  const [closing, setClosing] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      timer.current = setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, EXIT_MS);
    }
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!mounted) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(() => {
      setMounted(false);
      setClosing(false);
      onClose?.();
    }, EXIT_MS);
  }

  if (!mounted || typeof document === "undefined") return null;

  const node = (
    <div
      className={`lq-bs-root fixed inset-0 isolate ${closing ? "is-closing" : ""}`}
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="lq-bs-backdrop absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={closeOnBackdrop ? requestClose : undefined}
        aria-label="Close overlay"
      />

      <div
        className={`lq-bs-sheet absolute inset-x-0 bottom-0 z-10 mx-auto flex w-full flex-col rounded-t-3xl border-t border-white/12 bg-[#0c0a07] shadow-[0_-20px_60px_rgba(0,0,0,0.65)] sm:bottom-auto sm:top-1/2 sm:max-h-[min(90dvh,880px)] sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-white/[0.08] sm:bg-[#0a0805] sm:shadow-2xl ${maxWidth} ${className}`}
        style={{ maxHeight: "min(92dvh, 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-1 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>

        {header ? (
          <div className="shrink-0 border-b border-white/[0.06] px-5 py-3.5">{header}</div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {footer ? (
          <div
            className="shrink-0 border-t border-white/10 bg-[#0c0a07] px-4 pt-3 sm:bg-[#0a0805] sm:px-5"
            style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
          >
            {footer}
          </div>
        ) : null}
      </div>

      <style>{`
        .lq-bs-backdrop { animation: lqBsFade .2s ease-out; }
        .lq-bs-root.is-closing .lq-bs-backdrop { animation: lqBsFadeOut ${EXIT_MS}ms ease forwards; }
        .lq-bs-sheet { animation: lqBsUp .32s cubic-bezier(.16,1,.3,1); }
        .lq-bs-root.is-closing .lq-bs-sheet { animation: lqBsDn ${EXIT_MS}ms ease forwards; }
        @media (min-width: 640px) {
          .lq-bs-sheet { animation: lqBsPanel .28s cubic-bezier(.16,1,.3,1); }
          .lq-bs-root.is-closing .lq-bs-sheet { animation: lqBsPanelOut ${EXIT_MS}ms ease forwards; }
        }
        @keyframes lqBsFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes lqBsFadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes lqBsUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes lqBsDn { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes lqBsPanel {
          from { opacity: 0; transform: translateY(calc(-50% + 16px)) scale(.98); }
          to { opacity: 1; transform: translateY(-50%) scale(1); }
        }
        @keyframes lqBsPanelOut {
          from { opacity: 1; transform: translateY(-50%) scale(1); }
          to { opacity: 0; transform: translateY(calc(-50% + 12px)) scale(.98); }
        }
      `}</style>
    </div>
  );

  return createPortal(node, document.body);
}

/** Tailwind class helpers for bespoke overlays that can't use the component. */
export const sheetOverlayClass =
  "fixed inset-0 z-[100000] flex items-end justify-center sm:items-center p-0 sm:p-4 sm:p-6";
export const sheetCardClass =
  "relative w-full max-h-[min(92dvh,100%)] flex flex-col overflow-hidden rounded-t-3xl border-t border-white/12 bg-[#0a0805] shadow-[0_-20px_60px_rgba(0,0,0,0.65)] sm:rounded-2xl sm:border sm:border-white/[0.08] sm:shadow-2xl";
export const sheetHandle = (
  <div className="flex shrink-0 justify-center pt-2.5 pb-1 sm:hidden" aria-hidden="true">
    <div className="h-1 w-10 rounded-full bg-white/25" />
  </div>
);
