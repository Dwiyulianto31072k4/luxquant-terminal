// src/components/DelistingsPage.jsx
// Exchange Delisting Alerts — data terstruktur per-token, sortable/filterable.
// Metrik utama: PEAK % sejak announce (pump-after-delist), bukan harga sekarang.
import { useState, useEffect, useMemo } from 'react';
import delistingApi from '../services/delistingApi';
import CoinLogo from './CoinLogo';

const EX_META = {
  binance: { label: 'Binance', color: '#f0b90b' },
  bybit:   { label: 'Bybit',   color: '#f7a600' },
  okx:     { label: 'OKX',     color: '#dfe1e6' },
};

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

export default function DelistingsPage() {
  const [data, setData] = useState({ rows: [], exchanges: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState({ key: 'peak_pct', dir: 'desc' });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    delistingApi.list({ limit: 150 })
      .then((d) => { if (alive) { setData(d || { rows: [], exchanges: [] }); setErr(null); } })
      .catch(() => { if (alive) setErr('Failed to load delistings'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => {
    let r = data.rows || [];
    if (tab !== 'all') r = r.filter((x) => x.exchange === tab);
    if (q.trim()) {
      const s = q.trim().toUpperCase();
      r = r.filter((x) => (x.token || '').includes(s) || (x.title || '').toUpperCase().includes(s));
    }
    const val = (x, k) => {
      switch (k) {
        case 'token': return x.token || '';
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

  const toggleSort = (key) => setSort((s) => s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' });
  const SortHead = ({ label, k, align = 'right' }) => (
    <th className={`py-2.5 px-3 ${align === 'left' ? 'text-left' : 'text-right'}`}>
      <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${sort.key === k ? 'text-gold-primary' : 'text-white/35 hover:text-white/60'} ${align === 'left' ? '' : 'flex-row-reverse'}`}>
        {label}<span className="text-[7px]">{sort.key === k ? (sort.dir === 'desc' ? '▼' : '▲') : '⇅'}</span>
      </button>
    </th>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6">
      <div className="mb-5">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold-primary/70">Terminal · Alerts</span>
        <h1 className="font-display text-2xl lg:text-3xl font-normal text-white tracking-tight mt-1">Exchange Delistings</h1>
        <p className="font-mono text-[11px] text-white/45 mt-1.5 leading-relaxed max-w-2xl">
          Live delisting announcements from major exchanges. <span className="text-white/65">Peak %</span> = highest move a token made since the notice (the delist "relief pump"), not just the current price.
        </p>
      </div>

      {/* Tabs + search */}
      <div className="flex items-end justify-between gap-4 border-b border-white/[0.07] mb-4">
        <div className="flex items-center gap-5 overflow-x-auto no-scrollbar">
          {['all', ...(data.exchanges || [])].map((ex) => {
            const active = tab === ex;
            const label = ex === 'all' ? 'All' : (EX_META[ex]?.label || ex);
            return (
              <button key={ex} onClick={() => setTab(ex)}
                className={`whitespace-nowrap pb-3 pt-1 text-[14px] font-medium border-b-2 -mb-px transition-colors ${active ? 'text-white border-gold-primary' : 'text-white/50 border-transparent hover:text-white/80'}`}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="relative flex-shrink-0 w-44 lg:w-56 mb-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search token..."
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <SortHead label="Token" k="token" align="left" />
                <th className="py-2.5 px-3 text-left font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">Exchange</th>
                <th className="py-2.5 px-3 text-right font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">Announce Px</th>
                <SortHead label="Since Announce" k="current_pct" />
                <SortHead label="Peak %" k="peak_pct" />
                <SortHead label="Announced" k="announced_at" />
                <SortHead label="Delist Date" k="delist_at" />
              </tr>
            </thead>
            <tbody>
              {rows.map((x, i) => {
                const ex = EX_META[x.exchange] || { label: x.exchange, color: '#d4a853' };
                return (
                  <tr key={`${x.id}-${x.token || i}`}
                    onClick={() => x.url && window.open(x.url, '_blank', 'noopener')}
                    className={`border-b border-white/[0.05] transition-colors ${x.url ? 'hover:bg-white/[0.03] cursor-pointer' : ''}`}>
                    {/* Token */}
                    <td className="py-2.5 px-3">
                      {x.token ? (
                        <div className="flex items-center gap-2">
                          <CoinLogo pair={`${x.token}USDT`} size={20} />
                          <div className="min-w-0">
                            <span className="font-mono text-[12px] font-semibold text-white">{x.token}</span>
                            <p className="font-mono text-[9px] text-white/35 truncate max-w-[240px]" title={x.title}>{x.title}</p>
                          </div>
                        </div>
                      ) : (
                        <span className="font-mono text-[11px] text-white/50 line-clamp-1 max-w-[300px]" title={x.title}>{x.title}</span>
                      )}
                    </td>
                    {/* Exchange */}
                    <td className="py-2.5 px-3">
                      <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-white/10" style={{ color: ex.color }}>{ex.label}</span>
                    </td>
                    {/* Announce price */}
                    <td className="py-2.5 px-3 text-right font-mono text-[11px] tabular-nums text-white/60">{fmtPrice(x.price_at_announce)}</td>
                    {/* Since announce (current) */}
                    <td className="py-2.5 px-3 text-right font-mono text-[12px] tabular-nums font-medium">
                      {x.current_pct == null ? <span className="text-white/25">—</span> : (
                        <span className={x.current_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>{x.current_pct >= 0 ? '+' : ''}{x.current_pct.toFixed(2)}%</span>
                      )}
                    </td>
                    {/* Peak % (the pump) */}
                    <td className="py-2.5 px-3 text-right">
                      {x.peak_pct == null ? <span className="text-white/25 font-mono text-[12px]">—</span> : (
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
                    {/* Delist date */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono text-[11px] text-white/60">{fmtDate(x.delist_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
