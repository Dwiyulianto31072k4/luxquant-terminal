// src/components/ui/Modal.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — Modal primitive (v2)
// Shell standar SEMUA modal. v2 nyerap boilerplate yang dulu ditulis
// ulang tiap modal:
//   • Overlay + backdrop blur + animasi masuk/keluar (fade + scale)
//   • Esc untuk tutup, klik-luar tutup, body-scroll-lock
//   • Render via portal ke <body> (aman dari transform/filter parent)
//   • Scroll-safe (clearance navbar/tab-bar di mobile)
//   • Container #0a0805 + gold hairline, container radius rounded-2xl
//
// Props isi (children) bebas per modal.
//
// Pakai:
//   <Modal isOpen={open} onClose={close} title="Connect Binance">
//     ...isi...
//     <ModalFooter>
//       <GhostButton onClick={close}>Cancel</GhostButton>
//       <GoldButton onClick={save}>Save</GoldButton>
//     </ModalFooter>
//   </Modal>
//
// Konten nempel-pinggir (gambar full-width): <Modal padded={false}>
// Matikan animasi: <Modal animate={false}>
// ════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const EXIT_MS = 200;

const SIZES = {
  sm: "max-w-md",       // konfirmasi, prompt singkat
  md: "max-w-lg",       // form / konten sedang
  lg: "max-w-2xl",      // konten besar
  xl: "max-w-[820px]",  // two-pane (spt ExchangeConnectModal)
};

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  eyebrow,
  icon,
  size = "md",
  accent = true,
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

  // Buka / tutup (eksternal via prop isOpen)
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      runExit(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Esc
  useEffect(() => {
    if (!mounted) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, closing]);

  // Body scroll lock
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

  // Close dari dalam (X / backdrop / Esc): animasi keluar lalu panggil onClose
  function requestClose() {
    runExit(true);
  }

  if (!mounted) return null;

  const hasHeader = Boolean(eyebrow || title || subtitle || icon);

  const node = (
    <div
      onClick={closeOnBackdrop ? requestClose : undefined}
      className={`lqm-overlay ${closing ? "is-closing" : ""} ${animate ? "lqm-animate" : ""} fixed inset-0 z-[100000] flex min-h-full items-start justify-center overflow-y-auto overscroll-contain px-4 pt-20 pb-28 sm:items-center sm:py-10`}
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
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={!animate ? { backdropFilter: "blur(6px)" } : undefined}
        className={`lqm-card relative w-full ${SIZES[size] || SIZES.md} overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0805] shadow-[0_30px_80px_rgba(0,0,0,0.6)] ${className}`}
      >
        {accent ? (
          <span className="pointer-events-none absolute top-0 inset-x-0 z-10 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
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

        {hasHeader ? (
          <div className="px-6 pt-6 lg:px-8 lg:pt-8">
            {eyebrow ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-gold-primary/80">
                {eyebrow}
              </p>
            ) : null}
            {(icon || title) ? (
              <div className={`flex items-center gap-3 ${eyebrow ? "mt-3" : ""}`}>
                {icon ? <span className="flex-shrink-0">{icon}</span> : null}
                {title ? (
                  <h2 className="text-2xl font-semibold tracking-tight text-white">
                    {title}
                  </h2>
                ) : null}
              </div>
            ) : null}
            {subtitle ? (
              <p className="mt-2 text-sm leading-6 text-text-muted">{subtitle}</p>
            ) : null}
          </div>
        ) : null}

        {padded ? (
          <div className={hasHeader ? "px-6 py-6 lg:px-8" : "p-6 lg:p-8"}>
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );

  if (usePortal && typeof document !== "undefined") {
    return createPortal(node, document.body);
  }
  return node;
}

// Footer standar: tombol rata kanan, full-width di mobile.
export function ModalFooter({ children, className = "" }) {
  return <div className={`mt-7 flex gap-3 ${className}`}>{children}</div>;
}
