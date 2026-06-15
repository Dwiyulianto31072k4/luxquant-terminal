// src/components/ui/Modal.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — Modal primitive (shell standar)
// Diekstrak dari ExchangeConnectModal. Menyatukan SEMUA "cangkang"
// modal: overlay gelap, backdrop blur, Esc untuk tutup, klik-luar
// tutup, scroll-safe (clearance navbar/tab-bar), container #0a0805
// dengan gold hairline. Isi (children) bebas per modal.
//
// Pakai:
//   <Modal isOpen={open} onClose={close} title="Connect Binance">
//     ...isi...
//     <ModalFooter>
//       <GhostButton onClick={close}>Cancel</GhostButton>
//       <GoldButton onClick={save}>Save</GoldButton>
//     </ModalFooter>
//   </Modal>
// ════════════════════════════════════════════════════════════════

import { useEffect } from "react";

const SIZES = {
  sm: "max-w-md",       // konfirmasi, prompt singkat
  md: "max-w-lg",       // form standar 1 kolom
  lg: "max-w-2xl",      // form lebih besar / konten sedang
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
  accent = true,          // gold hairline di atas container (bahasa terminal)
  closeOnBackdrop = true,
  showClose = true,
  children,
  className = "",
}) {
  // Esc untuk menutup
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasHeader = Boolean(eyebrow || title || subtitle || icon);

  return (
    <div className="fixed inset-0 z-[100000] overflow-y-auto overscroll-contain">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Scroll-safe centering: clearance navbar (pt) + tab-bar (pb) di mobile */}
      <div
        onClick={closeOnBackdrop ? onClose : undefined}
        className="relative flex min-h-full items-start justify-center px-4 pt-20 pb-28 sm:items-center sm:py-10"
      >
        <div
          onClick={(event) => event.stopPropagation()}
          className={`relative w-full ${SIZES[size] || SIZES.md} overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0805] shadow-[0_30px_80px_rgba(0,0,0,0.6)] ${className}`}
        >
          {/* Gold hairline (bahasa desain terminal: Card / StatCard) */}
          {accent ? (
            <span className="pointer-events-none absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          ) : null}

          {/* Close */}
          {showClose ? (
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          ) : null}

          {/* Header opsional */}
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

          {/* Body */}
          <div className={hasHeader ? "px-6 py-6 lg:px-8" : "p-6 lg:p-8"}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// Footer standar: tombol rata kanan, full-width di mobile.
export function ModalFooter({ children, className = "" }) {
  return (
    <div className={`mt-7 flex gap-3 ${className}`}>
      {children}
    </div>
  );
}
