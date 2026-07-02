// src/components/DelistingsPage.jsx
// Exchange Delisting Alerts — token sering pump setelah pengumuman delisting.
import { useState, useEffect, useMemo } from 'react';
import delistingApi from '../services/delistingApi';
import CoinLogo from './CoinLogo';

const EX_META = {
  binance: { label: 'Binance', color: '#f0b90b' },
  bybit:   { label: 'Bybit',   color: '#f7a600' },
  okx:     { label: 'OKX',     color: '#ffffff' },
};

const timeAgo = (iso) => {
  if (!iso) return null;
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

export default function DelistingsPage() {
  const [data, setData] = useState({ events: [], exchanges: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    delistingApi.list({ limit: 100 })
      .then((d) => { if (alive) { setData(d || { events: [], exchanges: [] }); setErr(null); } })
      .catch(() => { if (alive) setErr('Failed to load delistings'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const events = useMemo(
    () => tab === 'all' ? data.events : data.events.filter((e) => e.exchange === tab),
    [data, tab]
  );

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6">
      {/* Header */}
      <div className="mb-5">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold-primary/70">Terminal · Alerts</span>
        <h1 className="font-display text-2xl lg:text-3xl font-normal text-white tracking-tight mt-1">Exchange Delistings</h1>
        <p className="font-mono text-[11px] text-white/45 mt-1.5 leading-relaxed max-w-2xl">
          Live delisting announcements from major exchanges. Tokens often see sharp volatility (a short squeeze / relief pump) right after a delisting notice — this tracks the price move since each announcement.
        </p>
      </div>

      {/* Exchange tabs */}
      <div className="flex items-center gap-5 border-b border-white/[0.07] mb-4 overflow-x-auto no-scrollbar">
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

      {loading ? (
        <div className="py-20 text-center font-mono text-[12px] text-white/40">Loading delistings…</div>
      ) : err ? (
        <div className="py-20 text-center font-mono text-[12px] text-red-400/70">{err}</div>
      ) : events.length === 0 ? (
        <div className="py-20 text-center font-mono text-[12px] text-white/40">No delisting announcements yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08]">
                {['Announcement', 'Exchange', 'Tokens', 'Announced', 'Delist Date', 'Move Since'].map((h, i) => (
                  <th key={h} className={`py-2.5 px-3 font-mono text-[9px] uppercase tracking-[0.14em] text-white/35 ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const ex = EX_META[e.exchange] || { label: e.exchange, color: '#d4a853' };
                const move = e.best_move_pct;
                return (
                  <tr key={e.id}
                    onClick={() => e.url && window.open(e.url, '_blank', 'noopener')}
                    className={`border-b border-white/[0.05] transition-colors ${e.url ? 'hover:bg-white/[0.03] cursor-pointer' : ''}`}>
                    {/* Announcement title */}
                    <td className="py-3 px-3 max-w-[340px]">
                      <p className="text-[12px] text-white/85 leading-snug line-clamp-2">{e.title}</p>
                    </td>
                    {/* Exchange */}
                    <td className="py-3 px-3">
                      <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-white/10" style={{ color: ex.color }}>{ex.label}</span>
                    </td>
                    {/* Tokens */}
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap items-center gap-1.5 max-w-[220px]">
                        {(e.symbols || []).length === 0 ? (
                          <span className="text-white/25 text-[11px]">—</span>
                        ) : e.symbols.slice(0, 6).map((s) => (
                          <span key={s.symbol} className="inline-flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded px-1.5 py-0.5">
                            <CoinLogo pair={`${s.symbol}USDT`} size={13} />
                            <span className="font-mono text-[10px] text-white/75">{s.symbol}</span>
                            {s.pct != null && (
                              <span className={`font-mono text-[9px] tabular-nums ${s.pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{s.pct >= 0 ? '+' : ''}{s.pct.toFixed(1)}%</span>
                            )}
                          </span>
                        ))}
                        {(e.symbols || []).length > 6 && <span className="text-white/35 text-[10px] font-mono">+{e.symbols.length - 6}</span>}
                      </div>
                    </td>
                    {/* Announced */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="flex flex-col items-end leading-tight">
                        <span className="font-mono text-[11px] text-white/70">{fmtDate(e.announced_at)}</span>
                        <span className="font-mono text-[9px] text-white/35">{timeAgo(e.announced_at)}</span>
                      </div>
                    </td>
                    {/* Delist date */}
                    <td className="py-3 px-3 text-right whitespace-nowrap font-mono text-[11px] text-white/60">{fmtDate(e.delist_at)}</td>
                    {/* Best move since announce */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      {move == null ? <span className="text-white/25 text-[11px]">—</span> : (
                        <span className={`font-mono text-[13px] tabular-nums font-bold ${move >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{move >= 0 ? '+' : ''}{move.toFixed(2)}%</span>
                      )}
                    </td>
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
