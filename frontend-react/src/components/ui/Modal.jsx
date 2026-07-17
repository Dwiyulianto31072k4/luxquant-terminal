// src/components/ui/Modal.jsx
// LuxQuant modal shell — timeless desk: solid surface, sticky chrome,
// responsive sheet (mobile) / dialog (desktop). Blur ONLY on backdrop layer.
//
// Patterns:
// 1) Simple:  <Modal title="…">…<ModalFooter/></Modal>
// 2) Sticky:  <Modal padded={false} header={…} footer={…}>scroll body</Modal>

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Z } from "../../constants/zIndex";

const EXIT_MS = 200;

const SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-[820px]",
  "2xl": "max-w-[1100px]",
  // Reading / news desk — narrow phone sheet · wide desktop reader
  reader: "max-w-full sm:max-w-[min(720px,92vw)] md:max-w-[min(800px,90vw)] lg:max-w-[840px]",
};

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  eyebrow,
  icon,
  header,
  footer,
  size = "md",
  placement = "bottom", // bottom sheet mobile · centered desktop
  accent = false, // default off — no gold edge
  accentColor,
  animate = true,
  padded = true,
  usePortal = true,
  closeOnBackdrop = true,
  showClose = true,
  zIndex = Z.modal,
  children,
  className = "",
}) {
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

  useEffect(() => {
    if (!mounted) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, closing]);

  useEffect(() => {
    if (!mounted) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

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

  if (!mounted) return null;

  const renderSlot = (slot) =>
    typeof slot === "function" ? slot(requestClose) : slot;

  const simpleHeader = !header && (eyebrow || title || subtitle || icon);
  const hasChrome = Boolean(header || simpleHeader);
  const hairlineBg = accentColor
    ? `linear-gradient(to right, transparent, ${accentColor}, transparent)`
    : "linear-gradient(to right, transparent, rgba(255,255,255,0.12), transparent)";

  const node = (
    <div
      style={{ zIndex }}
      className={`lqm-root ${closing ? "is-closing" : ""} ${animate ? "lqm-animate" : ""} fixed inset-0`}
      role="presentation"
    >
      <style>{`
        .lqm-root.lqm-animate .lqm-scrim {
          animation: lqmOverlayIn .22s ease forwards;
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
        .lqm-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.12) transparent; }
        .lqm-scroll::-webkit-scrollbar { width: 6px; }
        .lqm-scroll::-webkit-scrollbar-track { background: transparent; }
        .lqm-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 6px; }
        .lqm-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }
        @media (max-width: 639px) {
          .lqm-root.lqm-animate .lqm-card.lqm-sheet {
            animation: lqmSheetIn .32s cubic-bezier(.16,1,.3,1) forwards;
          }
          .lqm-root.lqm-animate.is-closing .lqm-card.lqm-sheet {
            animation: lqmSheetOut ${EXIT_MS}ms ease forwards;
          }
        }
        @keyframes lqmSheetIn {
          from { opacity: .6; transform: translateY(100%); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lqmSheetOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: .5; transform: translateY(100%); }
        }
      `}</style>

      {/* Scrim — blur lives ONLY here, never on the card */}
      <div
        className="lqm-scrim absolute inset-0 bg-black/80"
        style={{
          WebkitBackdropFilter: "blur(10px)",
          backdropFilter: "blur(10px)",
        }}
        onClick={closeOnBackdrop ? requestClose : undefined}
        aria-hidden="true"
      />

      {/* Layout frame — no backdrop-filter, so card chrome stays crisp */}
      <div
        className={`pointer-events-none absolute inset-0 flex justify-center ${
          placement === "bottom"
            ? "items-end p-0 sm:items-center sm:p-4 md:p-6"
            : "items-center p-3 sm:p-4 md:p-6"
        }`}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          className={`lqm-card pointer-events-auto relative flex w-full flex-col overflow-hidden border border-white/[0.1] shadow-[0_28px_80px_rgba(0,0,0,0.65)] isolate ${
            SIZES[size] || SIZES.md
          } ${
            placement === "bottom"
              ? "lqm-sheet max-h-[min(94dvh,100%)] rounded-t-2xl border-b-0 sm:max-h-[min(90dvh,920px)] sm:rounded-xl sm:border-b"
              : "max-h-[min(92dvh,calc(100dvh-1.5rem))] rounded-xl sm:max-h-[min(90dvh,920px)]"
          } ${className}`}
          style={{
            // Explicit solid surface — never translucent over blurred scrim
            background: "rgb(var(--surface-raised))",
          }}
        >
          {placement === "bottom" ? (
            <div className="flex shrink-0 justify-center pb-0.5 pt-2.5 sm:hidden" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-white/25" />
            </div>
          ) : null}

          {accent ? (
            <span
              className="pointer-events-none absolute inset-x-0 top-0 z-30 h-px"
              style={{ background: hairlineBg }}
            />
          ) : null}

          {/* Sticky header — solid, isolation, never under page blur */}
          {header ? (
            <div
              className={`relative z-20 flex shrink-0 items-center border-b border-white/[0.07] px-4 py-3 sm:px-5 sm:py-3.5 ${
                showClose ? "pr-12 sm:pr-14" : ""
              }`}
              style={{ background: "rgb(var(--surface-raised))" }}
            >
              <div className="min-w-0 flex-1">{renderSlot(header)}</div>
            </div>
          ) : simpleHeader ? (
            <div
              className={`relative z-20 shrink-0 border-b border-white/[0.07] px-5 py-4 sm:px-6 ${
                showClose ? "pr-12 sm:pr-14" : ""
              }`}
              style={{ background: "rgb(var(--surface-raised))" }}
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
                    <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
                      {title}
                    </h2>
                  ) : null}
                </div>
              ) : null}
              {subtitle ? (
                <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{subtitle}</p>
              ) : null}
            </div>
          ) : null}

          {/* Close — solid chrome chip, always above content */}
          {showClose ? (
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className={`absolute right-3 z-30 flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] text-text-muted transition hover:border-white/20 hover:bg-white/[0.06] hover:text-text-primary sm:right-4 ${
                placement === "bottom" && !hasChrome
                  ? "top-3 sm:top-3.5"
                  : hasChrome
                    ? "top-2.5 sm:top-3"
                    : "top-3 sm:top-3.5"
              }`}
              style={{ background: "rgb(var(--surface-raised))" }}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          ) : null}

          {/* Body scroll */}
          <div className="lqm-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {padded ? (
              <div className={hasChrome ? "px-5 py-5 sm:px-6 sm:py-6" : "p-5 sm:p-6"}>
                {children}
              </div>
            ) : (
              children
            )}
          </div>

          {/* Sticky footer — solid + safe-area */}
          {footer ? (
            <div
              className="relative z-20 shrink-0 border-t border-white/[0.07] px-4 pt-3 sm:px-5"
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
