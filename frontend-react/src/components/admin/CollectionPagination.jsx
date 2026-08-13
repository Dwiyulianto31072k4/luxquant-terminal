import { useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "./Icons";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getPages = (page, totalPages) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  const result = [];
  sorted.forEach((value, index) => {
    if (index && value - sorted[index - 1] > 1) result.push(`gap-${value}`);
    result.push(value);
  });
  return result;
};

export const useCollectionPagination = (items, initialPageSize = 12) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage((current) => clamp(current, 1, totalPages));
  }, [totalPages]);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const changePageSize = (next) => {
    setPageSize(Number(next));
    setPage(1);
  };

  return {
    page,
    pageSize,
    total,
    totalPages,
    pagedItems,
    setPage,
    setPageSize: changePageSize,
    resetPage: () => setPage(1),
  };
};

const PageButton = ({ children, active = false, disabled = false, onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    aria-current={active ? "page" : undefined}
    className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-[10px] font-bold tabular-nums transition disabled:cursor-not-allowed disabled:opacity-30 ${
      active
        ? "border-ink bg-ink text-surface-raised shadow-sm"
        : "border-ink/[0.08] bg-surface-raised text-text-muted hover:border-ink/[0.16] hover:bg-ink/[0.04] hover:text-text-primary"
    }`}
  >
    {children}
  </button>
);

export const CollectionPagination = ({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  itemLabel = "items",
  loading = false,
  className = "",
}) => {
  if (!total) return null;

  const safePages = Math.max(1, totalPages);
  const current = clamp(page, 1, safePages);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  const pages = getPages(current, safePages);

  return (
    <div className={`mt-3 flex flex-col gap-2.5 rounded-xl border border-ink/[0.07] bg-ink/[0.018] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-text-muted">
        <span className="tabular-nums">
          Showing <strong className="font-semibold text-text-primary">{from.toLocaleString()}–{to.toLocaleString()}</strong> of{" "}
          <strong className="font-semibold text-text-primary">{total.toLocaleString()}</strong> {itemLabel}
        </span>
        {onPageSizeChange && (
          <label className="inline-flex items-center gap-1.5">
            <span className="sr-only">Rows per page</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-7 rounded-md border border-ink/[0.08] bg-surface-raised px-2 text-[9.5px] font-semibold text-text-primary outline-none focus:border-accent/35"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size} / page</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {safePages > 1 && <div className="flex items-center gap-1 self-end sm:self-auto">
        <PageButton disabled={current <= 1 || loading} onClick={() => onPageChange(1)} label="First page">«</PageButton>
        <PageButton disabled={current <= 1 || loading} onClick={() => onPageChange(current - 1)} label="Previous page"><ChevronLeftIcon size={12} /></PageButton>
        <div className="hidden items-center gap-1 sm:flex">
          {pages.map((value) =>
            typeof value === "string" ? (
              <span key={value} className="min-w-5 text-center text-[10px] text-text-muted">…</span>
            ) : (
              <PageButton key={value} active={value === current} disabled={loading} onClick={() => onPageChange(value)} label={`Page ${value}`}>{value}</PageButton>
            )
          )}
        </div>
        <span className="px-1.5 text-[10px] font-semibold tabular-nums text-text-muted sm:hidden">{current}/{safePages}</span>
        <PageButton disabled={current >= safePages || loading} onClick={() => onPageChange(current + 1)} label="Next page"><ChevronRightIcon size={12} /></PageButton>
        <PageButton disabled={current >= safePages || loading} onClick={() => onPageChange(safePages)} label="Last page">»</PageButton>
      </div>}
    </div>
  );
};
