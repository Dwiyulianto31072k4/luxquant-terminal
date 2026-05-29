// src/components/admin/workspace/SidePanel.jsx
//
// Centered modal dialog (formerly a slide-in side panel).
// Name retained for backward compatibility — all 4 callers
// (FollowupPanel, CampaignPanel, TodoPanel, PaymentDetailPanel)
// keep the same API: { isOpen, onClose, title, subtitle, Icon, width, footer, children }.
//
// Renders via React Portal at document.body — bypasses all stacking contexts.
//
// • Adaptive width via the `width` prop (sm | md | lg | xl)
// • Fullscreen on mobile (< sm breakpoint) for usability
// • Click backdrop or press Escape to close
// • Header pinned top, body scrolls, footer (if any) pinned bottom

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
 *   width?: 'sm' | 'md' | 'lg' | 'xl'  (default 'md')
 *   footer?: React node  (sticky bottom action area)
 *   children: body content
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

  // Lock body scroll while modal open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Width tokens — translated for centered modal usage.
  // sm = confirm dialogs, md = simple forms, lg = rich forms / detail,
  // xl = very wide (rare).
  const widthMap = {
    sm: 'max-w-md',     // ~448px
    md: 'max-w-2xl',    // ~672px
    lg: 'max-w-3xl',    // ~768px
    xl: 'max-w-5xl',    // ~896px
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-0 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 2147483646,
      }}
    >
      <div
        className={`relative w-full ${widthMap[width] || widthMap.md} flex flex-col animate-in fade-in zoom-in-95 duration-200 h-full sm:h-auto sm:max-h-[90vh] sm:rounded-2xl overflow-hidden`}
        style={{
          background: '#0a0506',
          border: '1px solid rgba(212,168,83,0.22)',
          boxShadow:
            '0 30px 80px -20px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.02)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── HEADER (pinned top) ── */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0 relative"
          style={{
            background: 'linear-gradient(180deg, #14080d, #12090d)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {/* Gold hairline at top */}
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
                <p
                  className="text-[10px] leading-tight truncate"
                  style={{ color: '#6b5c52' }}
                >
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

        {/* ── BODY (scrollable) ── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 min-h-0">
          {children}
        </div>

        {/* ── FOOTER (pinned bottom, optional) ── */}
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
