// src/components/admin/users/ConfirmModal.jsx
//
// Lightweight confirmation modal. Variants:
//   variant="danger" — destructive (red, "ban", "revoke")
//   variant="default" — neutral (white text on subtle surface)
//

import { useState } from 'react';
import { palette, surface, tint, elevation, radius } from '../designSystem';
import { CloseIcon, AlertTriangleIcon } from '../Icons';

export const ConfirmModal = ({
  title,
  message,
  onConfirm,
  onClose,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
}) => {
  const [loading, setLoading] = useState(false);

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

  const danger = variant === 'danger';
  const accent = danger ? palette.red[400] : palette.gold[300];

  return (
    <div
      className="fixed inset-0 z-[200000] flex items-center justify-center p-4"
      style={{ background: surface.glass.bgOverlay, backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden relative"
        style={{
          background: surface.glass.bg,
          border: `1px solid ${tint(accent, 0.25)}`,
          boxShadow: elevation.modal,
        }}
      >
        {/* Top accent line */}
        <div
          className="absolute inset-x-0 top-0 h-px pointer-events-none"
          style={{
            background: `linear-gradient(to right, transparent, ${tint(accent, 0.5)}, transparent)`,
          }}
        />

        {/* Body */}
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            {danger && (
              <div className="relative shrink-0">
                <div
                  className="absolute inset-0 rounded-full blur-md opacity-40"
                  style={{ background: accent }}
                />
                <div
                  className="relative w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: tint(accent, 0.1),
                    border: `1px solid ${tint(accent, 0.3)}`,
                  }}
                >
                  <AlertTriangleIcon size={18} style={{ color: accent }} />
                </div>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-white mb-1.5 tracking-tight">{title}</h3>
              <p className="text-xs whitespace-pre-line" style={{ color: '#a8967e' }}>
                {message}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
              style={{ color: '#8a7a6e' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <CloseIcon size={14} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex gap-2 px-6 py-3"
          style={{
            background: 'rgba(0,0,0,0.3)',
            borderTop: `1px solid ${surface.base.border}`,
          }}
        >
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2 text-[11px] font-semibold uppercase tracking-wider disabled:opacity-50"
            style={{
              color: '#8a7a6e',
              border: `1px solid ${surface.base.border}`,
              borderRadius: radius.md,
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={handle}
            disabled={loading}
            className="flex-1 py-2 text-[11px] font-bold uppercase tracking-wider disabled:opacity-50"
            style={{
              background: danger ? tint(accent, 0.18) : 'rgba(255,255,255,0.05)',
              color: danger ? accent : '#fff',
              border: `1px solid ${danger ? tint(accent, 0.4) : surface.base.border}`,
              borderRadius: radius.md,
            }}
          >
            {loading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
