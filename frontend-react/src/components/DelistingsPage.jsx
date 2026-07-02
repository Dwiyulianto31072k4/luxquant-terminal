// src/components/DelistingsPage.jsx
// Exchange Delisting Alerts — per-token, sortable/filterable, full-width,
// pagination, responsive (mobile prioritises coin · exchange · announced · peak),
// + shortcut to open the matching LuxQuant call.
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import delistingApi from '../services/delistingApi';
import CoinLogo from './CoinLogo';

const EX_META = {
  binance: { label: 'Binance', domain: 'binance.com', color: '#f0b90b' },
  bybit:   { label: 'Bybit',   domain: 'bybit.com',   color: '#f7a600' },
  okx:     { label: 'OKX',     domain: 'okx.com',     color: '#dfe1e6' },
};
const favicon = (d) => `https://www.google.com/s2/favicons?domain=${d}&sz=64`;

const timeAgo = (iso) => {
  if (!iso) return null;
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const fmtPrice = (p) => {
  if (p == null) return '—';
  if (p < 0.0001) return p.toFixed(8);
  if (p < 1) return p.toFixed(6);
  return p < 100 ? p.toFixed(4) : p.toFixed(2);
};

const PAGE_SIZE = 15;

export default function DelistingsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState({ rows: [], exchanges: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'delist_at', dir: 'desc' });
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    delistingApi.list({ limit: 200 })
      .then((d) => { if (alive) { setData(d || { rows: [], exchanges: [] }); setErr(null); } })
      .catch(() => { if (alive) setErr('Failed to load delistings'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => { setPage(1); }, [tab, q, sort]);

  const openCall = (e, id) => { e.stopPropagation(); if (id) navigate(`/signals?signal=${id}`); };

  const rows = useMemo(() => {
    let r = (data.rows || []).filter((x) => x.token); // hanya baris token; buang announcement-only
    if (tab !== 'all') r = r.filter((x) => x.exchange === tab);
    if (q.trim()) {
      const s = q.trim().toUpperCase();
      r = r.filter((x) => (x.token || '').includes(s) || (x.title || '').toUpperCase().includes(s));
    }
    const val = (x, k) => {
      switch (k) {
        case 'token': return x.token || '￿';
        case 'announced_at': return x.announced_at ? new Date(x.announced_at).getTime() : -Infinity;
        case 'delist_at': return x.delist_at ? new Date(x.delist_at).getTime() : -Infinity;
        case 'current_pct': return x.current_pct ?? -Infinity;
        case 'peak_pct': return x.peak_pct ?? -Infinity;
        default: return 0;
      }
    };
    return [...r].sort((a, b) => {
      const va = val(a, sort.key), vb = val(b, sort.key);
      const cmp = typeof va === 'string' ? String(va).localeCompare(String(vb)) : (va - vb);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [data, tab, q, sort]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageRows = rows.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  const toggleSort = (key) => setSort((s) => s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' });
  const SortHead = ({ label, k, align = 'right', className = '' }) => (
    <th className={`py-2.5 px-3 ${align === 'left' ? 'text-left' : 'text-right'} ${className}`}>
      <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${sort.key === k ? 'text-gold-primary' : 'text-white/35 hover:text-white/60'} ${align === 'left' ? '' : 'flex-row-reverse'}`}>
        {label}<span className="text-[7px]">{sort.key === k ? (sort.dir === 'desc' ? '▼' : '▲') : '⇅'}</span>
      </button>
    </th>
  );

  const CallBtn = ({ x, compact }) => x.call_signal_id ? (
    <button onClick={(e) => openCall(e, x.call_signal_id)}
      title={x.call_after_announce ? 'LuxQuant called this after the delisting — open call' : 'Open LuxQuant call'}
      className={`inline-flex items-center gap-1 rounded-md border font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 transition-all ${x.call_after_announce ? 'bg-gold-primary/15 border-gold-primary/40 text-gold-primary hover:bg-gold-primary/25' : 'bg-white/[0.04] border-white/12 text-white/60 hover:text-white'} ${compact ? '' : ''}`}>
      ⚡ Call
    </button>
  ) : null;

  return (
    <div className="w-full px-4 lg:px-8 py-6">
      {/* Header — deskripsi di bawah judul */}
      <div className="mb-5 max-w-3xl">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold-primary/70">Terminal · Alerts</span>
        <h1 className="font-display text-2xl lg:text-3xl font-normal text-white tracking-tight mt-1">Exchange Delistings</h1>
        <p className="text-[12px] text-white/50 leading-relaxed mt-2">
          Live delisting announcements from Binance, Bybit &amp; OKX.{' '}
          <span className="text-gold-primary/85 font-medium">Peak %</span> is the highest move a token made since the notice — the delist "relief pump" — not just the current price.
        </p>
      </div>

      {/* Tabs + search */}
      <div className="flex items-end justify-between gap-3 border-b border-white/[0.07] mb-4">
        <div className="flex items-center gap-4 sm:gap-5 overflow-x-auto no-scrollbar">
          {['all', ...(data.exchanges || [])].map((ex) => {
            const active = tab === ex;
            const label = ex === 'all' ? 'All' : (EX_META[ex]?.label || ex);
            return (
              <button key={ex} onClick={() => setTab(ex)}
                className={`whitespace-nowrap pb-3 pt-1 text-[14px] font-medium border-b-2 -mb-px transition-colors ${active ? 'text-white border-gold-primary' : 'text-white/50 border-transparent hover:text-white/80'}`}>
                <span className="inline-flex items-center gap-1.5">
                  {ex !== 'all' && EX_META[ex]?.domain && <img src={favicon(EX_META[ex].domain)} alt="" width={15} height={15} className="rounded-sm" loading="lazy" />}
                  {label}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative flex-shrink-0 w-36 sm:w-56 mb-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
            className="w-full pl-3 pr-3 py-1.5 bg-[#0a0506] border border-white/[0.08] rounded-md text-white placeholder-white/30 font-mono text-[11px] focus:border-gold-primary/40 focus:outline-none" />
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center font-mono text-[12px] text-white/40">Loading delistings…</div>
      ) : err ? (
        <div className="py-20 text-center font-mono text-[12px] text-red-400/70">{err}</div>
      ) : rows.length === 0 ? (
        <div className="py-20 text-center font-mono text-[12px] text-white/40">No delistings found.</div>
      ) : (
        <>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <SortHead label="Token" k="token" align="left" />
                <th className="py-2.5 px-3 text-left font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">Exchange</th>
                <th className="hidden md:table-cell py-2.5 px-3 text-right font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">Announce Px</th>
                <SortHead label="Since" k="current_pct" className="hidden lg:table-cell" />
                <SortHead label="Peak %" k="peak_pct" />
                <SortHead label="Announced" k="announced_at" />
                <SortHead label="Delist" k="delist_at" className="hidden md:table-cell" />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((x, i) => {
                const ex = EX_META[x.exchange] || { label: x.exchange, domain: '', color: '#d4a853' };
                return (
                  <tr key={`${x.id}-${x.token || i}`}
                    onClick={() => x.url && window.open(x.url, '_blank', 'noopener')}
                    className={`border-b border-white/[0.05] transition-colors ${x.url ? 'hover:bg-white/[0.03] cursor-pointer' : ''}`}>
                    {/* Token */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <CoinLogo pair={`${x.token}USDT`} size={22} />
                        <span className="font-mono text-[13px] font-semibold text-white" title={x.title}>{x.token}</span>
                        <CallBtn x={x} />
                      </div>
                    </td>
                    {/* Exchange — logo always, name from sm */}
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1.5">
                        {ex.domain && <img src={favicon(ex.domain)} alt="" width={14} height={14} className="rounded-sm flex-shrink-0" loading="lazy" />}
                        <span className="hidden sm:inline font-mono text-[11px]" style={{ color: ex.color }}>{ex.label}</span>
                      </span>
                    </td>
                    {/* Announce px */}
                    <td className="hidden md:table-cell py-2.5 px-3 text-right font-mono text-[11px] tabular-nums text-white/60">{fmtPrice(x.price_at_announce)}</td>
                    {/* Since announce */}
                    <td className="hidden lg:table-cell py-2.5 px-3 text-right font-mono text-[12px] tabular-nums font-medium">
                      {x.current_pct == null ? <span className="text-white/25">—</span> : (
                        <span className={x.current_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>{x.current_pct >= 0 ? '+' : ''}{x.current_pct.toFixed(2)}%</span>
                      )}
                    </td>
                    {/* Peak % */}
                    <td className="py-2.5 px-3 text-right">
                      {x.peak_pct == null ? (
                        <span className="text-white/25 font-mono text-[12px]" title="No live USDT spot market for this token">—</span>
                      ) : (
                        <span className={`font-mono text-[13px] tabular-nums font-bold ${x.peak_pct >= 20 ? 'text-gold-primary' : x.peak_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {x.peak_pct >= 0 ? '+' : ''}{x.peak_pct.toFixed(2)}%
                        </span>
                      )}
                    </td>
                    {/* Announced */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex flex-col items-end leading-tight">
                        <span className="font-mono text-[11px] text-white/70">{fmtDate(x.announced_at)}</span>
                        <span className="font-mono text-[9px] text-white/35">{timeAgo(x.announced_at)}</span>
                      </div>
                    </td>
                    {/* Delist */}
                    <td className="hidden md:table-cell py-2.5 px-3 text-right whitespace-nowrap font-mono text-[11px] text-white/60">{fmtDate(x.delist_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer: legend + pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
            <span className="font-mono text-[9px] text-white/30 leading-relaxed">
              <span className="text-white/45">—</span> = price/peak unavailable (no live USDT spot market). <span className="text-gold-primary/70">⚡ Call</span> = open LuxQuant's call for this token.
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-mono text-[10px] text-white/40">
                  {(curPage - 1) * PAGE_SIZE + 1}–{Math.min(curPage * PAGE_SIZE, rows.length)} of {rows.length}
                </span>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={curPage <= 1}
                  className="px-2.5 py-1 rounded-md border border-white/10 font-mono text-[10px] uppercase tracking-wider text-white/70 hover:text-white hover:border-gold-primary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Prev</button>
                <span className="font-mono text-[10px] tabular-nums text-white/60 px-1">{curPage}/{totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={curPage >= totalPages}
                  className="px-2.5 py-1 rounded-md border border-white/10 font-mono text-[10px] uppercase tracking-wider text-white/70 hover:text-white hover:border-gold-primary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Next</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
