// src/components/admin/users/ConfirmModal.jsx
// ════════════════════════════════════════════════════════════════
// Refactor → pakai <Modal> primitive + GoldButton/GhostButton.
// Props TETAP SAMA (drop-in replacement):
// title, message, onConfirm, onClose, confirmText, cancelText, variant
// variant="danger" → tombol konfirmasi merah + ikon peringatan
// variant="default" → tombol konfirmasi gold
// ════════════════════════════════════════════════════════════════

import { useState } from "react";
import Modal, { ModalFooter } from "../../ui/Modal";
import { GoldButton, GhostButton, DangerButton } from "../../autotrade/AutoTradeUI";

// Reusable danger icon (option A — soft glow). Can be moved to AutoTradeUI
// if it's reused by other danger modals.
export function DangerIcon() {
  return (
    <div className="relative h-11 w-11 flex-shrink-0">
      <div
        className="absolute -inset-[5px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(246,70,93,0.35) 0%, transparent 70%)",
        }}
      />
      <div className="relative flex h-11 w-11 items-center justify-center rounded-[13px] bg-[#F6465D]/12 text-[#F6465D] ring-1 ring-[#F6465D]/35">
        <svg
          viewBox="0 0 24 24"
          className="h-[21px] w-[21px]"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      </div>
    </div>
  );
}

export const ConfirmModal = ({
  title,
  message,
  onConfirm,
  onClose,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
}) => {
  const [loading, setLoading] = useState(false);
  const danger = variant === "danger";

  const handle = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="sm" accent={false} title={title}>
      <div className="flex items-start gap-3">
        {danger ? <DangerIcon /> : null}
        <p className="min-w-0 flex-1 whitespace-pre-line text-sm leading-relaxed text-text-muted">
          {message}
        </p>
      </div>

      <ModalFooter className="mt-5">
        <GhostButton onClick={onClose} disabled={loading} className="flex-1">
          {cancelText}
        </GhostButton>
        {danger ? (
          <DangerButton onClick={handle} disabled={loading} className="flex-1">
            {loading ? "Processing…" : confirmText}
          </DangerButton>
        ) : (
          <GoldButton onClick={handle} disabled={loading} className="flex-1">
            {loading ? "Processing…" : confirmText}
          </GoldButton>
        )}
      </ModalFooter>
    </Modal>
  );
};
