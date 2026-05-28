// ════════════════════════════════════════════════════════════════════
// Finance Pagination — simple prev/next + page indicator
// ════════════════════════════════════════════════════════════════════

import { ChevronLeftIcon, ChevronRightIcon } from './icons-supplement';

export const FinancePagination = ({ page, totalPages, total, onChange }) => {
  if (totalPages <= 1) return null;

  const PageBtn = ({ disabled, onClick, children, title }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md text-[10.5px] font-semibold uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      style={{
        background: 'rgba(255,255,255,0.04)',
        color: '#c9b59e',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {children}
    </button>
  );

  return (
    <div
      className="flex items-center justify-between gap-3 pt-3 flex-wrap"
      style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
    >
      <p className="text-[10.5px]" style={{ color: '#6b5c52' }}>
        Page{' '}
        <span className="tabular-nums font-semibold" style={{ color: '#c9b59e' }}>
          {page}
        </span>{' '}
        of{' '}
        <span className="tabular-nums font-semibold" style={{ color: '#c9b59e' }}>
          {totalPages}
        </span>
        {total != null && (
          <>
            {' '}
            ·{' '}
            <span className="tabular-nums">{total.toLocaleString()}</span> total
          </>
        )}
      </p>
      <div className="flex items-center gap-1.5">
        <PageBtn
          disabled={page <= 1}
          onClick={() => onChange(Math.max(1, page - 1))}
          title="Previous page"
        >
          <ChevronLeftIcon size={11} />
          Prev
        </PageBtn>
        <PageBtn
          disabled={page >= totalPages}
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          title="Next page"
        >
          Next
          <ChevronRightIcon size={11} />
        </PageBtn>
      </div>
    </div>
  );
};
