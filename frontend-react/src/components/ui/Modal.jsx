// src/components/ui/Modal.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — Modal primitive (v3)
// Shell standar SEMUA modal. v3 nambah pola best-practice:
//   • Header sticky + body scroll + footer sticky (prop header/footer)
//   • Responsif penuh: 100dvh, max-h, scroll internal (tombol selalu
//     kelihatan, konten panjang scroll di dalam — bukan kepotong)
//   • accentColor: hairline atas bisa ikut warna kustom (mis. domain)
// Bawaan dari v2: animasi masuk/keluar, Esc, klik-luar, body-lock,
// portal ke <body>, container #0a0805 + gold hairline.
//
// Dua pola pakai:
//
// 1) Sederhana (footer ikut scroll) — untuk modal pendek:
//    <Modal isOpen={open} onClose={close} title="Hapus?">
//      <p>...</p>
//      <ModalFooter><GhostButton/>…<GoldButton/></ModalFooter>
//    </Modal>
//
// 2) Terstruktur (header & footer sticky) — untuk modal panjang:
//    <Modal isOpen={open} onClose={close} padded={false}
//      header={<Badge/>}
//      footer={(close) => <><CTA/><button onClick={close}>Close</button></>}>
//      ...konten panjang yang bisa scroll...
//    </Modal>
//
// footer/header bisa berupa node ATAU fungsi (close) => node.
// ════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const EXIT_MS = 200;

const SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-[820px]",
  "2xl": "max-w-[1100px]",
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
  placement = "center",   // "center" | "bottom" (bottom = sheet di mobile, dialog di desktop)
  accent = true,
  accentColor,
  animate = true,
  padded = true,
  usePortal = true,
  closeOnBackdrop = true,
  showClose = true,
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
  const hairlineBg = accentColor
    ? `linear-gradient(to right, transparent, ${accentColor}, transparent)`
    : "linear-gradient(to right, transparent, rgba(212,168,83,0.3), transparent)";

  const node = (
    <div
      onClick={closeOnBackdrop ? requestClose : undefined}
      className={`lqm-overlay ${closing ? "is-closing" : ""} ${animate ? "lqm-animate" : ""} fixed inset-0 z-[100000] flex justify-center ${placement === "bottom" ? "items-end p-0 sm:items-center sm:p-4" : "items-center p-4"}`}
    >
      <style>{`
        .lqm-overlay { background: rgba(0,0,0,0.8); }
        .lqm-overlay.lqm-animate { background: rgba(0,0,0,0); animation: lqmOverlayIn .25s ease forwards; }
        .lqm-overlay.lqm-animate.is-closing { animation: lqmOverlayOut ${EXIT_MS}ms ease forwards; }
        .lqm-overlay.lqm-animate .lqm-card { animation: lqmCardIn .3s cubic-bezier(.16,1,.3,1) forwards; }
        .lqm-overlay.lqm-animate.is-closing .lqm-card { animation: lqmCardOut ${EXIT_MS}ms ease forwards; }
        @keyframes lqmOverlayIn { from { background: rgba(0,0,0,0); backdrop-filter: blur(0px); } to { background: rgba(0,0,0,0.8); backdrop-filter: blur(6px); } }
        @keyframes lqmOverlayOut { from { background: rgba(0,0,0,0.8); backdrop-filter: blur(6px); } to { background: rgba(0,0,0,0); backdrop-filter: blur(0px); } }
        @keyframes lqmCardIn { from { opacity: 0; transform: scale(.96) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes lqmCardOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(.96) translateY(10px); } }
        .lqm-scroll::-webkit-scrollbar { width: 6px; }
        .lqm-scroll::-webkit-scrollbar-track { background: transparent; }
        .lqm-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 6px; }
        .lqm-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
        /* Bottom-sheet: slide up from bottom on mobile only (desktop keeps card scale-in) */
        @media (max-width: 639px) {
          .lqm-overlay.lqm-animate .lqm-card.lqm-sheet { animation: lqmSheetIn .34s cubic-bezier(.16,1,.3,1) forwards; }
          .lqm-overlay.lqm-animate.is-closing .lqm-card.lqm-sheet { animation: lqmSheetOut ${EXIT_MS}ms ease forwards; }
        }
        @keyframes lqmSheetIn { from { opacity: .5; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
        @keyframes lqmSheetOut { from { opacity: 1; transform: translateY(0); } to { opacity: .4; transform: translateY(100%); } }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={!animate ? { backdropFilter: "blur(6px)" } : undefined}
        className={`lqm-card relative flex w-full flex-col overflow-hidden border border-white/[0.08] bg-[#0a0805] shadow-[0_30px_80px_rgba(0,0,0,0.6)] ${SIZES[size] || SIZES.md} ${
          placement === "bottom"
            ? "lqm-sheet max-h-[90dvh] rounded-t-2xl sm:max-h-[calc(100dvh-4rem)] sm:rounded-2xl"
            : "max-h-[calc(100dvh-2rem)] rounded-2xl sm:max-h-[calc(100dvh-4rem)]"
        } ${className}`}
      >
        {placement === "bottom" ? (
          <div className="sm:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
            <span className="h-1 w-10 rounded-full bg-white/20" />
          </div>
        ) : null}

        {accent ? (
          <span
            className="pointer-events-none absolute top-0 inset-x-0 z-10 h-px"
            style={{ background: hairlineBg }}
          />
        ) : null}

        {showClose ? (
          <button
            onClick={requestClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        ) : null}

        {/* Header sticky (prop) */}
        {header ? (
          <div className={`flex-shrink-0 border-b border-white/[0.06] px-5 py-3.5 ${showClose ? "pr-12" : ""}`}>
            {renderSlot(header)}
          </div>
        ) : simpleHeader ? (
          <div className={`flex-shrink-0 px-6 pt-6 lg:px-8 lg:pt-8 ${showClose ? "pr-12" : ""}`}>
            {eyebrow ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-gold-primary/80">{eyebrow}</p>
            ) : null}
            {(icon || title) ? (
              <div className={`flex items-center gap-3 ${eyebrow ? "mt-3" : ""}`}>
                {icon ? <span className="flex-shrink-0">{icon}</span> : null}
                {title ? <h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2> : null}
              </div>
            ) : null}
            {subtitle ? <p className="mt-2 text-sm leading-6 text-text-muted">{subtitle}</p> : null}
          </div>
        ) : null}

        {/* Body scroll */}
        <div className="lqm-scroll min-h-0 flex-1 overflow-y-auto">
          {padded ? (
            <div className={simpleHeader || header ? "px-6 py-6 lg:px-8" : "p-6 lg:p-8"}>
              {children}
            </div>
          ) : (
            children
          )}
        </div>

        {/* Footer sticky (prop) */}
        {footer ? (
          <div className="flex-shrink-0 border-t border-white/[0.06] px-5 py-3">
            {renderSlot(footer)}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (usePortal && typeof document !== "undefined") {
    return createPortal(node, document.body);
  }
  return node;
}

// Footer inline (ikut scroll) — untuk modal pendek.
export function ModalFooter({ children, className = "" }) {
  return <div className={`mt-7 flex gap-3 ${className}`}>{children}</div>;
}
