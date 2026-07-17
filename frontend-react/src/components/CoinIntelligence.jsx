import { useState, useEffect, useMemo, useCallback } from 'react';
import CoinLogo from './CoinLogo';
import {
 FC, mapMarketCondition, SEV, wrc, fmtDate,
 RiskGauge, classifyCoin, CoinDetailModal,
} from './coinIntelShared';

const API_BASE = import.meta.env.VITE_API_URL || '';

// NOTE: Theme constants, classifyCoin, RiskGauge, and CoinDetailModal now live
// in ./coinIntelShared so SignalsTable can reuse the exact same logic/modal.
// Only the components used solely by this page (MarketConditionLineChart, CoinRow)
// remain local.

// ═══════════════════════════════════════════
// MARKET CONDITION LINE CHART (local — only used here)
// ═══════════════════════════════════════════
const MarketConditionLineChart = ({ timeline }) => {
 if (!timeline || timeline.length < 2) return null;
 const data = [...timeline].reverse();
 const W = 500, H = 70, padX = 15, padY = 10;
 const minWr = 0, maxWr = 100;
 const range = maxWr - minWr;
 const points = data.map((d, i) => {
 const marketCond = mapMarketCondition(d.flow);
 return {
 x: padX + (i / (data.length - 1)) * (W - padX * 2),
 y: padY + (1 - (d.wr - minWr) / range) * (H - padY * 2),
 wr: d.wr, marketCond, date: d.date,
 };
 });
 const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
 const areaD = `${pathD} L${points[points.length-1].x},${H} L${points[0].x},${H} Z`;

 return (
 <div className="relative">
 <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" style={{ height: '100px' }}>
 <defs>
 <linearGradient id="flowGrad" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.1" />
 <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0" />
 </linearGradient>
 </defs>
 {[0, 0.5, 1].map((f, i) => (
 <line key={i} x1={padX} x2={W - padX} y1={padY + f * (H - padY * 2)} y2={padY + f * (H - padY * 2)} stroke="rgb(var(--ink) / 0.03)" strokeWidth="0.5" />
 ))}
 <path d={areaD} fill="url(#flowGrad)" />
 <path d={pathD} fill="none" stroke="rgb(var(--accent))" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
 {points.map((p, i) => (
 <g key={i}>
 <circle cx={p.x} cy={p.y} r="2.5" fill="rgb(var(--surface))" stroke={FC[p.marketCond]?.border || FC.neutral.border} strokeWidth="1.5" />
 <text x={p.x} y={H + 15} fill="#6b5c52" fontSize="7" textAnchor="middle">{fmtDate(p.date)}</text>
 <text x={p.x} y={p.y - 7} fill={FC[p.marketCond]?.text || FC.neutral.text} fontSize="8" fontWeight="700" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">{Math.round(p.wr)}%</text>
 </g>
 ))}
 <text x={2} y={padY + 4} fill="#4a3f35" fontSize="6" fontFamily="'JetBrains Mono', monospace">100%</text>
 <text x={2} y={H - padY + 4} fill="#4a3f35" fontSize="6" fontFamily="'JetBrains Mono', monospace">0%</text>
 </svg>
 </div>
 );
};

// ═══════════════════════════════════════════
// COIN ROW (local — main list)
// ═══════════════════════════════════════════
const CoinRow = ({ coin, rank, verdict, onClick }) => {
 const vc = verdict === 'avoid' ? '#ef4444' : '#22c55e';
 const rs = coin.risk_score || 0;
 return (
 <div onClick={onClick}
 className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all hover:bg-ink/[0.03] active:scale-[0.99] group"
 style={{ borderLeft: `2px solid ${vc}40` }}>
 <span className="w-5 text-center text-[10px] font-bold flex-shrink-0" style={{ color: rank <= 3 ? 'rgb(var(--accent))' : '#6b5c52' }}>{rank}</span>
 <CoinLogo pair={coin.pair} size={28} />
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-1.5">
 <span className="font-mono font-bold text-[13px] text-text-primary tracking-wide">{coin.pair.replace('USDT','')}</span>
 {coin.anomaly_flags?.slice(0,2).map((f,i) => (
 <span key={i} className="text-[6px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider" style={{ background:SEV[f.severity]?.bg, color:SEV[f.severity]?.text, border:`1px solid ${SEV[f.severity]?.border}30` }}>{f.tag}</span>
 ))}
 </div>
 <p className="text-[9px] text-gray-500 mt-0.5">{coin.closed_trades} trades · Avg: <span className={coin.avg_outcome==='SL'?'text-loss':'text-green-400'}>{coin.avg_outcome}</span></p>
 </div>
 <RiskGauge score={rs} size="sm" />
 <div className="text-right flex-shrink-0 w-16">
 <p className="font-mono font-bold text-[14px]" style={{ color:wrc(coin.win_rate) }}>{coin.win_rate}%</p>
 {coin.current_streak?.length > 0 ? (
 <p className="text-[8px] font-bold mt-0.5" style={{ color: coin.current_streak.type==='win'?'#22c55e':'#ef4444' }}>
 {coin.current_streak.length}{coin.current_streak.type==='win'?'W':'L'}
 </p>
 ) : <p className="text-[8px] text-gray-600 mt-0.5">-</p>}
 </div>
 <svg width="6" height="10" viewBox="0 0 6 10" fill="none" className="opacity-0 group-hover:opacity-40 transition-opacity ml-2">
 <path d="M1 1L5 5L1 9" stroke="#8a8577" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
 </svg>
 </div>
 );
};

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════
const CoinIntelligence = ({ selectedDates = [] }) => {
 const [data, setData] = useState(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState(null);
 const [collapsed, setCollapsed] = useState(false);
 const [selectedCoin, setSelectedCoin] = useState(null);

 const fetchData = useCallback(async () => {
 try {
 const token = localStorage.getItem('access_token');
 const headers = token ? { Authorization: `Bearer ${token}` } : {};
 const res = await fetch(`${API_BASE}/api/v1/signals/coin-intel`, { headers });
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 setData(await res.json()); setError(null);
 } catch (err) { setError(err.message); } finally { setLoading(false); }
 }, []);

 useEffect(() => { fetchData(); const iv = setInterval(fetchData, 90000); return () => clearInterval(iv); }, [fetchData]);

 const { worthIt, avoid, dateLabel } = useMemo(() => {
 if (!data) return { worthIt:[], avoid:[], dateLabel:'' };
 const all = [...(data.top_coins||[]), ...(data.rest_coins||[])];

 let filtered = all;
 if (selectedDates && selectedDates.length > 0) {
 filtered = all.filter(c =>
 c.active_days?.some(day => selectedDates.includes(day))
 );
 }

 const w = [], a = [];
 for (const c of filtered) {
 const v = classifyCoin(c);
 if (v==='avoid') a.push(c);
 else if (v==='worth_it') w.push(c);
 }
 w.sort((x,y) => (y.risk_score||0)-(x.risk_score||0));
 a.sort((x,y) => y.sl_rate-x.sl_rate);

 let label = 'All 7 Days';
 if (selectedDates && selectedDates.length > 0) {
 const today = new Date().toISOString().slice(0,10);
 const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);

 if (selectedDates.length === 1) {
 if (selectedDates[0] === today) label = 'Today';
 else if (selectedDates[0] === yesterday) label = 'Yesterday';
 else {
 const d = new Date(selectedDates[0]+'T00:00:00');
 label = d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
 }
 } else {
 label = `Selected: ${selectedDates.length} Days`;
 }
 }
 return { worthIt:w.slice(0,10), avoid:a.slice(0,10), dateLabel:label };
 }, [data, selectedDates]);

 if (loading) return (
 <div className="glass-card rounded-xl p-4 border border-ink/08 mb-4 animate-pulse">
 <div className="h-4 bg-accent/12 rounded w-40 mb-2" /><div className="h-3 bg-accent/10 rounded w-56" />
 </div>
 );
 if (error || !data) return null;
 if (worthIt.length===0 && avoid.length===0) return null;

 return (
 <div className="mb-8 space-y-4">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setCollapsed(!collapsed)}>
 <div className="w-8 h-[3px] bg-gradient-to-r from-accent to-transparent rounded-full shadow-[0_0_8px_rgb(var(--accent) / 0.5)]" />
 <div className="flex items-center gap-3">
 <h3 className="text-text-primary text-base font-bold tracking-wide group-hover:text-accent transition-colors">Coin Intelligence</h3>
 <span className="text-[9px] font-mono text-accent bg-accent/10 px-2.5 py-1 rounded-md border border-ink/10 shadow-inner">{dateLabel}</span>
 <div className="flex gap-1.5">
 {avoid.length > 0 && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm" style={{ background:SEV.danger.bg, color:SEV.danger.text, border:`1px solid ${SEV.danger.border}30` }}>{avoid.length} Avoid</span>}
 {worthIt.length > 0 && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm" style={{ background:SEV.positive.bg, color:SEV.positive.text, border:`1px solid ${SEV.positive.border}30` }}>{worthIt.length} Worth It</span>}
 </div>
 <svg width="12" height="12" viewBox="0 0 10 10" fill="none" className={`transition-transform duration-300 opacity-50 group-hover:opacity-100 ${collapsed?'-rotate-90':''}`}>
 <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
 </svg>
 </div>
 </div>
 {!collapsed && <p className="text-[10px] text-gray-500 font-medium hidden sm:block">Click any coin for deep analysis</p>}
 </div>

 {!collapsed && (
 <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
 <div className="bg-surface-raised border border-ink/[0.05] rounded-xl p-4 shadow-sm">
 <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
 <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">LuxQuant Winrate (Last 7 Days)</p>

 {/* LEGEND MARKET CONDITION */}
 <div className="flex gap-4 text-[9px] text-gray-500 font-medium">
 <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full shadow-sm" style={{ background:FC.good.border }} />Good Market (≥70%)</div>
 <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full shadow-sm" style={{ background:FC.neutral.border }} />Neutral Market (50-70%)</div>
 <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full shadow-sm" style={{ background:FC.bad.border }} />Bad Market (&lt;50%)</div>
 </div>

 </div>
 <div className="bg-ink/[0.01] border border-ink/[0.02] rounded-xl p-3 overflow-x-auto">
 <div className="min-w-[400px]">
 <MarketConditionLineChart timeline={data.flow_timeline} />
 </div>
 </div>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 <div className="bg-surface-raised rounded-xl border border-green-500/20 shadow-lg overflow-hidden flex flex-col">
 <div className="flex items-center gap-3 px-4 py-3 border-b border-green-500/20 bg-gradient-to-r from-green-500/10 to-transparent">
 <div className="w-1 h-4 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]" />
 <h4 className="text-green-400 text-[11px] font-bold uppercase tracking-widest drop-shadow-sm">Worth It</h4>
 <span className="text-gray-400 text-[9px] hidden sm:block">— strong track record</span>
 </div>
 <div className="py-2 flex-1">
 {worthIt.length === 0 ? <p className="text-gray-500 text-[11px] text-center py-10">No standout coins for {dateLabel}</p> :
 worthIt.map((c,i) => <CoinRow key={c.pair} coin={c} rank={i+1} verdict="worth_it" onClick={() => setSelectedCoin(c)} />)
 }
 </div>
 </div>

 <div className="bg-surface-raised rounded-xl border border-red-500/20 shadow-lg overflow-hidden flex flex-col">
 <div className="flex items-center gap-3 px-4 py-3 border-b border-red-500/20 bg-gradient-to-r from-red-500/10 to-transparent">
 <div className="w-1 h-4 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
 <h4 className="text-loss text-[11px] font-bold uppercase tracking-widest drop-shadow-sm">Avoid</h4>
 <span className="text-gray-400 text-[9px] hidden sm:block">— red flags detected</span>
 </div>
 <div className="py-2 flex-1">
 {avoid.length === 0 ? <p className="text-gray-500 text-[11px] text-center py-10">No red flags for {dateLabel}</p> :
 avoid.map((c,i) => <CoinRow key={c.pair} coin={c} rank={i+1} verdict="avoid" onClick={() => setSelectedCoin(c)} />)
 }
 </div>
 </div>
 </div>
 </div>
 )}

 {selectedCoin && <CoinDetailModal coin={selectedCoin} currentFlow={data.current_flow} onClose={() => setSelectedCoin(null)} />}
 </div>
 );
};

export default CoinIntelligence;
