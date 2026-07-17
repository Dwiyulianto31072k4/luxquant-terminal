// src/components/admin/users/UsersPagination.jsx
//
// Paginates the users table. Sits below it.
//

import { palette, surface, tint, motion } from "../designSystem";
import { ChevronLeftIcon, ChevronRightIcon } from "../Icons";

const PaginationButton = ({ onClick, disabled, children, active = false, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="inline-flex items-center justify-center min-w-[32px] h-7 px-2.5 rounded-md text-[10px] font-bold uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed"
    style={{
      color: active ? palette.gold[300] : "rgb(var(--fg-muted))",
      background: active ? tint(palette.gold[300], 0.1) : "transparent",
      border: `1px solid ${active ? tint(palette.gold[300], 0.35) : surface.base.border}`,
      transition: motion.base,
    }}
    onMouseEnter={(e) => {
      if (!disabled && !active) {
        e.currentTarget.style.background = "rgb(var(--ink) / 0.03)";
        e.currentTarget.style.color = "rgb(var(--fg-secondary))";
      }
    }}
    onMouseLeave={(e) => {
      if (!disabled && !active) {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "rgb(var(--fg-muted))";
      }
    }}
  >
    {children}
  </button>
);

export const UsersPagination = ({ page, totalPages, total, onChange }) => {
  if (totalPages <= 1) return null;

  return (
    <div
      className="flex items-center justify-between px-3 py-2.5"
      style={{
        borderTop: `1px solid ${surface.base.border}`,
        background: "rgb(var(--ink) / 0.012)",
      }}
    >
      <p className="text-[10px] tabular-nums" style={{ color: "rgb(var(--fg-muted))" }}>
        Page <span className="text-text-primary font-bold">{page}</span> of {totalPages}
        <span className="mx-2" style={{ color: "rgb(var(--fg-muted))" }}>
          ·
        </span>
        <span className="text-text-primary font-bold">{total}</span> total
      </p>
      <div className="flex items-center gap-1">
        <PaginationButton onClick={() => onChange(1)} disabled={page <= 1} title="First page">
          ⟪
        </PaginationButton>
        <PaginationButton
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          title="Previous"
        >
          <ChevronLeftIcon size={11} />
        </PaginationButton>
        <span
          className="px-2 text-[10px] font-bold tabular-nums"
          style={{ color: palette.gold[300] }}
        >
          {page} / {totalPages}
        </span>
        <PaginationButton
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          title="Next"
        >
          <ChevronRightIcon size={11} />
        </PaginationButton>
        <PaginationButton
          onClick={() => onChange(totalPages)}
          disabled={page >= totalPages}
          title="Last page"
        >
          ⟫
        </PaginationButton>
      </div>
    </div>
  );
};
