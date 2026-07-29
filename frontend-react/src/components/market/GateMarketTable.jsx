import { useState, useEffect, useMemo, useCallback } from "react";
import CoinLogo from "../CoinLogo";

/**
 * The market table that anchors the Home page, in the shape Gate's /price uses:
 * quick-filter chips, sortable numeric columns, a 24h sparkline per row, and a
 * dumbbell showing where the last price sits inside the 24h range.
 *
 * Row sparklines stay hand-drawn SVG rather than ECharts. A hundred canvas
 * instances — each with its own resize observer — costs far more than a hundred
 * 24-point polylines, and at 88x24 px nothing ECharts adds is visible.
 */

// VITE_API_URL is the ORIGIN ("https://luxquant.tw"), not an API root — writing
// `VITE_API_URL || "/api/v1"` yields https://luxquant.tw/market/coins, which the
// SPA fallback answers with index.html and the JSON parse dies on "<!DOCTYPE".
// Same relative base OverviewPage uses.
const API_BASE = "/api/v1";

const fmtPrice = (n) => {
  if (n == null) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.01) return n.toFixed(5);
  return n.toPrecision(4);
};

const fmtCompact = (n) => {
  if (!n) return "—";
  const units = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [size, suffix] of units) {
    if (n >= size) return `$${(n / size).toFixed(2)}${suffix}`;
  }
  return `$${n.toFixed(0)}`;
};

const CHANGE_FIELDS = {
  "1h": "price_change_percentage_1h_in_currency",
  "24h": "price_change_percentage_24h_in_currency",
  "7d": "price_change_percentage_7d_in_currency",
};

/** Quick filters that need nothing beyond the rows already loaded. */
const QUICK_FILTERS = [
  { id: "all", label: "All" },
  { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" },
  { id: "volume", label: "Top Volume" },
];

/** 24h price path. Flat/short series degrade to a centre line rather than NaN. */
const RowSpark = ({ points, up, w = 88, h = 26 }) => {
  const path = useMemo(() => {
    if (!Array.isArray(points) || points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min;
    const stepX = w / (points.length - 1);
    return points
      .map((p, i) => {
        const y = span === 0 ? h / 2 : h - ((p - min) / span) * (h - 2) - 1;
        return `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [points, w, h]);

  if (!path) {
    return <div className="h-[26px] w-[88px]" aria-hidden="true" />;
  }
  const stroke = up ? "rgb(var(--pos))" : "rgb(var(--neg))";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden="true">
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

/** Where the last price sits between the 24h low and high. */
const RangeDumbbell = ({ low, high, last }) => {
  if (low == null || high == null || last == null || high <= low) {
    return <span className="text-[11px] text-text-muted">—</span>;
  }
  const pct = Math.min(100, Math.max(0, ((last - low) / (high - low)) * 100));
  return (
    <div className="w-[150px]">
      <div className="relative h-[10px]">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-ink/25" />
        <div
          className="absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink/40 bg-surface-raised"
          style={{ left: `${pct}%` }}
          title={`${pct.toFixed(0)}% of the 24h range`}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-text-muted">
        <span>{fmtPrice(low)}</span>
        <span>{fmtPrice(high)}</span>
      </div>
    </div>
  );
};

const SortHead = ({ id, label, sort, setSort, align = "right" }) => {
  const active = sort.key === id;
  return (
    <button
      type="button"
      onClick={() => setSort((s) => ({ key: id, dir: s.key === id && s.dir === "desc" ? "asc" : "desc" }))}
      className={`flex w-full items-center gap-1 whitespace-nowrap text-[11px] font-medium transition-colors hover:text-text-primary ${
        align === "right" ? "justify-end" : "justify-start"
      } ${active ? "text-text-primary" : "text-text-muted"}`}
    >
      {label}
      <span className={`text-[8px] leading-none ${active ? "opacity-100" : "opacity-30"}`}>
        {active && sort.dir === "asc" ? "▲" : "▼"}
      </span>
    </button>
  );
};

const PageBtn = ({ onClick, disabled, label, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="flex h-7 w-7 items-center justify-center rounded-md text-[15px] leading-none text-text-secondary transition-colors hover:bg-ink/[0.06] hover:text-text-primary disabled:pointer-events-none disabled:opacity-25"
  >
    {children}
  </button>
);

/**
 * Page numbers to render, with `null` marking an elided run. Always shows the
 * first and last page plus the current one's neighbours, so the control keeps a
 * stable width instead of growing with the result count.
 */
const pageWindow = (current, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages = new Set([0, total - 1, current]);
  if (current - 1 > 0) pages.add(current - 1);
  if (current + 1 < total - 1) pages.add(current + 1);
  const sorted = [...pages].sort((a, b) => a - b);
  const out = [];
  let prev = null;
  for (const p of sorted) {
    if (prev !== null && p - prev > 1) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
};

const GateMarketTable = ({ pageSize = 10 }) => {
  const [coins, setCoins] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [changeWindow, setChangeWindow] = useState("24h"); // never name this `window`
  const [sort, setSort] = useState({ key: "market_cap", dir: "desc" });
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/market/coins?per_page=100&page=1`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      setCoins(Array.isArray(rows) ? rows : []);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 120000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [filter, changeWindow, sort.key, sort.dir]);

  const rows = useMemo(() => {
    if (!coins) return null;
    const field = CHANGE_FIELDS[changeWindow];
    let out = [...coins];

    if (filter === "gainers") out = out.filter((c) => (c[field] ?? 0) > 0);
    else if (filter === "losers") out = out.filter((c) => (c[field] ?? 0) < 0);

    const key = filter === "volume" ? "total_volume" : sort.key;
    const dir = filter === "volume" && sort.key === "market_cap" ? "desc" : sort.dir;
    const sortField = key === "change" ? field : key;

    out.sort((a, b) => {
      const av = a[sortField] ?? -Infinity;
      const bv = b[sortField] ?? -Infinity;
      return dir === "asc" ? av - bv : bv - av;
    });
    return out;
  }, [coins, filter, sort, changeWindow]);

  const pageCount = rows ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;
  // Changing a filter can leave you past the end of the new result set.
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows ? rows.slice(safePage * pageSize, safePage * pageSize + pageSize) : null;

  if (error && !coins) {
    return (
      <div className="rounded-xl border border-ink/[0.06] bg-surface-raised p-6 text-center text-[13px] text-text-muted">
        Market data unavailable ({error}).
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ink/[0.06] bg-surface-raised">
      {/* Filter chips + change-window selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/[0.06] px-4 py-3">
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                filter === f.id
                  ? "bg-accent text-accent-fg"
                  : "bg-ink/[0.04] text-text-secondary hover:bg-ink/[0.08]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-ink/[0.04] p-0.5">
          {Object.keys(CHANGE_FIELDS).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setChangeWindow(w)}
              className={`rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors ${
                changeWindow === w ? "bg-surface-raised text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* The table scrolls inside itself so the page body never scrolls sideways */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b border-ink/[0.06] text-text-muted">
              <th className="px-4 py-2.5 text-left text-[11px] font-medium">Name</th>
              <th className="px-3 py-2.5"><SortHead id="current_price" label="Last Price" sort={sort} setSort={setSort} /></th>
              <th className="px-3 py-2.5"><SortHead id="change" label={`Change % ${changeWindow}`} sort={sort} setSort={setSort} /></th>
              <th className="px-3 py-2.5 text-left text-[11px] font-medium">24h Chart</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-medium">24h Price Range</th>
              <th className="px-3 py-2.5"><SortHead id="total_volume" label="24h Volume" sort={sort} setSort={setSort} /></th>
              <th className="px-3 py-2.5"><SortHead id="market_cap" label="Market Cap" sort={sort} setSort={setSort} /></th>
            </tr>
          </thead>
          <tbody>
            {pageRows === null
              ? Array.from({ length: pageSize }).map((_, i) => (
                  <tr key={i} className="border-b border-ink/[0.04]">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-6 w-full animate-pulse rounded bg-ink/[0.05]" />
                    </td>
                  </tr>
                ))
              : pageRows.map((c) => {
                  const chg = c[CHANGE_FIELDS[changeWindow]];
                  const up = (chg ?? 0) >= 0;
                  return (
                    <tr key={c.id} className="border-b border-ink/[0.04] transition-colors last:border-0 hover:bg-ink/[0.02]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <CoinLogo pair={`${(c.symbol || "").toUpperCase()}USDT`} size={24} />
                          <div className="leading-tight">
                            <div className="text-[13px] font-medium text-text-primary">
                              {(c.symbol || "").toUpperCase()}
                              <span className="text-text-muted">/USDT</span>
                            </div>
                            <div className="text-[11px] text-text-muted">{c.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[13px] tabular-nums text-text-primary">
                        {fmtPrice(c.current_price)}
                      </td>
                      <td className={`px-3 py-3 text-right font-mono text-[13px] tabular-nums ${up ? "text-profit" : "text-loss"}`}>
                        {chg == null ? "—" : `${up ? "+" : ""}${chg.toFixed(2)}%`}
                      </td>
                      <td className="px-3 py-3">
                        <RowSpark points={c.spark24} up={up} />
                      </td>
                      <td className="px-3 py-3">
                        <RangeDumbbell low={c.low_24h} high={c.high_24h} last={c.current_price} />
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[13px] tabular-nums text-text-secondary">
                        {fmtCompact(c.total_volume)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[13px] tabular-nums text-text-secondary">
                        {fmtCompact(c.market_cap)}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* Pagination. Ten rows a page keeps the card a predictable height instead
          of a 50-row wall that pushes everything below it off the screen. */}
      {rows && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.06] px-4 py-3">
          <span className="font-mono text-[11px] tabular-nums text-text-muted">
            {safePage * pageSize + 1}–{Math.min(rows.length, safePage * pageSize + pageSize)} of {rows.length}
          </span>
          <div className="flex items-center gap-1">
            <PageBtn onClick={() => setPage(safePage - 1)} disabled={safePage === 0} label="Previous page">
              ‹
            </PageBtn>
            {pageWindow(safePage, pageCount).map((p, i) =>
              p === null ? (
                <span key={`gap-${i}`} className="px-1 text-[12px] text-text-muted">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  aria-current={p === safePage ? "page" : undefined}
                  className={`h-7 min-w-[28px] rounded-md px-2 font-mono text-[12px] tabular-nums transition-colors ${
                    p === safePage
                      ? "bg-accent text-accent-fg"
                      : "text-text-secondary hover:bg-ink/[0.06] hover:text-text-primary"
                  }`}
                >
                  {p + 1}
                </button>
              )
            )}
            <PageBtn
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= pageCount - 1}
              label="Next page"
            >
              ›
            </PageBtn>
          </div>
        </div>
      )}
    </div>
  );
};

export default GateMarketTable;
