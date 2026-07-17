// src/components/admin/workspace/SidePanel.jsx
// Shared wrapper for admin panels (Followup / Campaign / Todo /
// PaymentDetail). Delegates to the standard <Modal> primitive —
// solid chrome, no gold hairline, uniform animation/Esc/scroll-lock/portal.
// API PRESERVED: { isOpen, onClose, title, subtitle, Icon, width,
// footer, children }

import Modal from '../../ui/Modal';

// width lama → size <Modal>
//   sm max-w-md(448)  md max-w-2xl(672)  lg max-w-3xl(768)  xl max-w-5xl(896)
//   Modal: sm 448 · md 512 · lg 672 · xl 820 · 2xl 1100
const WIDTH_TO_SIZE = { sm: 'sm', md: 'lg', lg: 'xl', xl: '2xl' };

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
  const size = WIDTH_TO_SIZE[width] || 'lg';

  const header = (
    <div className="flex min-w-0 items-center gap-2.5">
      {Icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink/[0.1] bg-ink/[0.04]">
          <Icon size={14} className="text-text-muted" />
        </span>
      )}
      <div className="min-w-0">
        <h2 className="text-sm font-semibold leading-tight tracking-tight text-text-primary">
          {title}
        </h2>
        {subtitle && (
          <p className="truncate text-[10px] leading-tight text-text-muted">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size={size}
      padded={false}
      accent={false}
      header={header}
      footer={footer}
    >
      <div className="px-5 py-5">{children}</div>
    </Modal>
  );
};
