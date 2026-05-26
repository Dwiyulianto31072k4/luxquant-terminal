// src/components/admin/workspace/SidePanel.jsx
//
// Reusable slide-in panel from the right.
// Used for Add/Edit forms in Followup, Campaign, Todo tabs.
// Renders via React Portal at document.body — bypasses all stacking contexts.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../Icons';

/**
 * Props:
 *   isOpen: boolean
 *   onClose: () => void
 *   title: string
 *   subtitle?: string
 *   Icon?: SVG component
 *   width?: 'sm' | 'md' | 'lg'  (default 'md')
 *   footer?: React node  (sticky bottom action area)
 *   children: form content
 */
export const SidePanel = ({
  isOpen,
  onClose,
  title,
  subtitle,
  Icon,
  width = 'md',
  footer,
  children,
}) => {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const widthMap = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-2xl',
  };

  return createPortal(
    <div
      className="fixed inset-0 flex justify-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 2147483646,
      }}
    >
      <div
        className={`w-full ${widthMap[width]} h-full flex flex-col animate-in slide-in-from-right duration-200`}
        style={{
          background: '#0a0506',
          borderLeft: '1px solid rgba(212,168,83,0.22)',
          boxShadow: '-20px 0 50px -10px rgba(0,0,0,0.6)',
        }}
      >
        {/* ── HEADER ── */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0 relative"
          style={{
            background: 'linear-gradient(180deg, #14080d, #12090d)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{
              background:
                'linear-gradient(to right, transparent, rgba(212,168,83,0.35), transparent)',
            }}
          />
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: 'rgba(212,168,83,0.1)',
                  border: '1px solid rgba(212,168,83,0.22)',
                }}
              >
                <Icon size={14} style={{ color: '#d4a853' }} />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white tracking-tight leading-tight">
                {title}
              </h2>
              {subtitle && (
                <p className="text-[10px] leading-tight" style={{ color: '#6b5c52' }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:scale-105 shrink-0"
            style={{
              color: '#d4a853',
              background: 'rgba(212,168,83,0.08)',
              border: '1px solid rgba(212,168,83,0.22)',
            }}
            title="Close (Esc)"
            aria-label="Close"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {/* ── FOOTER (sticky) ── */}
        {footer && (
          <div
            className="px-5 py-3 shrink-0"
            style={{
              background: 'rgba(0,0,0,0.3)',
              borderTop: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
