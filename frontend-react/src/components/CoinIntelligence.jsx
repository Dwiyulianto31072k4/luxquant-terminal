import { useState, useEffect, useMemo, useCallback } from 'react';
import CoinLogo from './CoinLogo';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ═══════════════════════════════════════════
// THEME CONSTANTS & MAPPERS
// ═══════════════════════════════════════════

// MARKET CONDITIONS (Good, Neutral, Bad)
const FC = {
  good:    { bg: 'rgba(34,197,94,0.10)', border: '#22c55e', text: '#22c55e', label: 'Good' },
  neutral: { bg: 'rgba(234,179,8,0.10)', border: '#eab308', text: '#eab308', label: 'Neutral' },
  bad:     { bg: 'rgba(239,68,68,0.10)', border: '#ef4444', text: '#ef4444', label: 'Bad' },
};

// Map API flow to UI conditions
const mapMarketCondition = (flow) => {
  return { high: 'good', mid: 'neutral', low: 'bad' }[flow] || 'neutral';
};

const SEV = {
  danger:   { border: '#ef4444', bg: 'rgba(239,68,68,0.06)', text: '#ef4444' },
  warning:  { border: '#eab308', bg: 'rgba(234,179,8,0.06)',  text: '#eab308' },
  positive: { border: '#22c55e', bg: 'rgba(34,197,94,0.06)',  text: '#22c55e' },
  info:     { border: '#d4a853', bg: 'rgba(212,168,83,0.06)', text: '#d4a853' },
};
const OC = {
  tp4: { bg: 'rgba(34,197,94,0.15)', tx: '#22c55e', l: 'TP4' }, tp3: { bg: 'rgba(132,204,22,0.15)', tx: '#84cc16', l: 'TP3' },
  tp2: { bg: 'rgba(234,179,8,0.15)', tx: '#eab308', l: 'TP2' }, tp1: { bg: 'rgba(96,165,250,0.15)', tx: '#60a5fa', l: 'TP1' },
  sl:  { bg: 'rgba(239,68,68,0.15)', tx: '#ef4444', l: 'SL' },
};
const JC = { sl:'rgba(239,68,68,0.5)', tp1:'rgba(96,165,250,0.5)', tp2:'rgba(234,179,8,0.45)', tp3:'rgba(132,204,22,0.45)', tp4:'rgba(34,197,94,0.5)' };
const wrc = w => w >= 70 ? '#22c55e' : w >= 50 ? '#eab308' : '#ef4444';
const scoreColor = s => s >= 80 ? '#22c55e' : s >= 65 ? '#84cc16' : s >= 45 ? '#eab308' : s >= 25 ? '#f97316' : '#ef4444';
const scoreGrade = s => s >= 80 ? 'Excellent' : s >= 65 ? 'Good' : s >= 45 ? 'Average' : s >= 25 ? 'Poor' : 'Very Poor';
const primarySev = f => { for (const s of ['danger','warning','positive','info']) if (f?.some(x => x.severity === s)) return s; return 'info'; };
const parseBold = t => t ? t.split(/(\*\*[^*]+\*\*)/).map((p,i) => p.startsWith('**') ? <span key={i} className="font-semibold text-white drop-shadow-md">{p.slice(2,-2)}</span> : p) : t;
const fmtDate = d => { if (!d) return ''; const p = d.split('-'); return p.length === 3 ? `${parseInt(p[2])} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(p[1])-1]}` : d; };

const classifyCoin = c => {
  const f = c.anomaly_flags||[], ft = f.map(x=>x.type), hd = f.some(x=>x.severity==='danger'), hw = f.some(x=>x.severity==='warning'), hp = f.some(x=>x.severity==='positive');
  if (hd) return 'avoid'; if (ft.includes('wr_decline')&&c.win_rate<70) return 'avoid'; if (ft.includes('flow_underperformer')) return 'avoid';
  if (c.sl_rate>=30&&c.closed_trades>=5) return 'avoid'; if (hw&&!hp&&c.win_rate<75) return 'avoid';
  if (c.win_rate>=80&&c.closed_trades>=5) return 'worth_it'; if (hp&&!hd) return 'worth_it';
  if (ft.includes('hot_streak')&&c.current_streak?.length>=5) return 'worth_it'; if (c.win_rate>=85) return 'worth_it';
  if (c.win_rate<65&&c.closed_trades>=5) return 'avoid'; return hp ? 'worth_it' : 'neutral';
};


// ═══════════════════════════════════════════
// MICRO COMPONENTS
// ═══════════════════════════════════════════

const RiskGauge = ({ score, size = 'sm' }) => {
  const c = scoreColor(score), pct = Math.min(score, 100), isSm = size === 'sm';
  return (
    <div className={`relative ${isSm ? 'w-8 h-8' : 'w-16 h-16'}`}>
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={isSm ? "3" : "2.5"} />
        <circle cx="18" cy="18" r="15" fill="none" stroke={c} strokeWidth={isSm ? "3" : "2.5"}
          strokeDasharray={`${pct * 0.94} 100`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-mono font-bold ${isSm ? 'text-[8px]' : 'text-[15px]'}`} style={{ color: c }}>{score}</span>
      </div>
    </div>
  );
};

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
            <stop offset="0%" stopColor="#d4a853" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#d4a853" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f, i) => (
          <line key={i} x1={padX} x2={W - padX} y1={padY + f * (H - padY * 2)} y2={padY + f * (H - padY * 2)} stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
        ))}
        <path d={areaD} fill="url(#flowGrad)" />
        <path d={pathD} fill="none" stroke="#d4a853" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="2.5" fill="#0a0506" stroke={FC[p.marketCond]?.border || FC.neutral.border} strokeWidth="1.5" />
            <text x={p.x} y={H + 15} fill="#6b5c52" fontSize="7" textAnchor="middle">{fmtDate(p.date)}</text>
            <text x={p.x} y={p.y - 7} fill={FC[p.marketCond]?.text || FC.neutral.text} fontSize="8" fontWeight="700" fontFamily="monospace" textAnchor="middle">{Math.round(p.wr)}%</text>
          </g>
        ))}
        <text x={2} y={padY + 4} fill="#4a3f35" fontSize="6" fontFamily="monospace">100%</text>
        <text x={2} y={H - padY + 4} fill="#4a3f35" fontSize="6" fontFamily="monospace">0%</text>
      </svg>
    </div>
  );
};

const MonthlyLineChart = ({ data }) => {
  if (!data || data.length < 2) return null;
  const W = 280, H = 60, padX = 8, padY = 8;
  const minWr = Math.max(0, Math.min(...data.map(d => d.wr)) - 10);
  const maxWr = Math.min(100, Math.max(...data.map(d => d.wr)) + 10);
  const range = maxWr - minWr || 1;
  const points = data.map((d, i) => ({
    x: padX + (i / (data.length - 1)) * (W - padX * 2),
    y: padY + (1 - (d.wr - minWr) / range) * (H - padY * 2),
    wr: d.wr, month: d.month, closed: d.closed,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaD = `${pathD} L${points[points.length-1].x},${H} L${points[0].x},${H} Z`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" style={{ height: '90px' }}>
        <defs>
          <linearGradient id="wrGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f, i) => (
          <line key={i} x1={padX} x2={W - padX} y1={padY + f * (H - padY * 2)} y2={padY + f * (H - padY * 2)} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
        ))}
        <path d={areaD} fill="url(#wrGrad)" />
        <path d={pathD} fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="2.5" fill="#0a0506" stroke={wrc(p.wr)} strokeWidth="1.5" />
            <text x={p.x} y={p.y - 6} fill={wrc(p.wr)} fontSize="7" fontWeight="700" fontFamily="monospace" textAnchor="middle">{p.wr}%</text>
            <text x={p.x} y={H + 12} fill="#6b5c52" fontSize="6" textAnchor="middle">{p.month?.slice(5)}</text>
          </g>
        ))}
        <text x={2} y={padY + 3} fill="#4a3f35" fontSize="5" fontFamily="monospace">{Math.round(maxWr)}%</text>
        <text x={2} y={H - padY + 3} fill="#4a3f35" fontSize="5" fontFamily="monospace">{Math.round(minWr)}%</text>
      </svg>
    </div>
  );
};

const Section = ({ title, children, className = "" }) => (
  <div className={`rounded-xl p-4 bg-white/[0.015] border border-white/[0.03] ${className}`}>
    <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500 mb-3">{title}</p>
    {children}
  </div>
);

const StatBox = ({ label, value, color, icon = null }) => (
  <div className="flex flex-col justify-center">
    <p className="text-[7px] text-gray-500 uppercase tracking-widest mb-1">{label}</p>
    <div className="flex items-center gap-1.5">
      <p className="font-mono font-bold text-[14px] drop-shadow-sm" style={{ color }}>{value}</p>
      {icon}
    </div>
  </div>
);

// ═══════════════════════════════════════════
// COIN ROW (Main List)
// ═══════════════════════════════════════════

const CoinRow = ({ coin, rank, verdict, onClick }) => {
  const vc = verdict === 'avoid' ? '#ef4444' : '#22c55e';
  const rs = coin.risk_score || 0;
  return (
    <div onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all hover:bg-white/[0.03] active:scale-[0.99] group"
      style={{ borderLeft: `2px solid ${vc}40` }}>
      <span className="w-5 text-center text-[10px] font-bold flex-shrink-0" style={{ color: rank <= 3 ? '#d4a853' : '#6b5c52' }}>{rank}</span>
      <CoinLogo pair={coin.pair} size={28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-bold text-[13px] text-white tracking-wide">{coin.pair.replace('USDT','')}</span>
          {coin.anomaly_flags?.slice(0,2).map((f,i) => (
            <span key={i} className="text-[6px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider" style={{ background:SEV[f.severity]?.bg, color:SEV[f.severity]?.text, border:`1px solid ${SEV[f.severity]?.border}30` }}>{f.tag}</span>
          ))}
        </div>
        <p className="text-[9px] text-gray-500 mt-0.5">{coin.closed_trades} trades · Avg: <span className={coin.avg_outcome==='SL'?'text-red-400':'text-green-400'}>{coin.avg_outcome}</span></p>
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
// FULL PAGE MODAL (The Proper "Dialog" Pop-up)
// ═══════════════════════════════════════════

const CoinDetailModal = ({ coin, currentFlow, onClose }) => {
  if (!coin) return null;
  const verdict = classifyCoin(coin);
  const vc = verdict==='avoid' ? '#ef4444' : '#22c55e';
  const st = SEV[primarySev(coin.anomaly_flags)];
  const rs = coin.risk_score || 0;

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const trendIcon = coin.win_rate_30d_trend === 'up' ?
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 7L5 4L8 7" stroke="#22c55e" strokeWidth="1.5"/><path d="M2 3L5 6L8 3" stroke="#22c55e" strokeWidth="1.5"/></svg> :
    coin.win_rate_30d_trend === 'down' ?
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3L5 6L8 3" stroke="#ef4444" strokeWidth="1.5"/><path d="M2 7L5 4L8 7" stroke="#ef4444" strokeWidth="1.5"/></svg> : null;

  return (
    <>
      <style>{`
        .modal-body-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .modal-body-scroll::-webkit-scrollbar-track { background: transparent; }
        .modal-body-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 10px; }
        .modal-body-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.25); }
      `}</style>

      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-10">
        <div className="absolute inset-0 bg-[#060304]/85 backdrop-blur-md" onClick={onClose} />

        <div className="relative w-full max-w-[960px] max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border border-white/10 z-10 overflow-hidden bg-gradient-to-b from-[#140a0c] to-[#0a0506] animate-in fade-in zoom-in-95 duration-200">
          <div className="absolute top-0 left-0 right-0 h-1 z-30" style={{ background: `linear-gradient(90deg, transparent 0%, ${vc} 50%, transparent 100%)`, opacity: 0.8 }} />

          {/* 1. HEADER AREA */}
          <div className="flex-shrink-0 relative z-20 px-6 py-5 border-b border-white/[0.06] bg-[#0a0506]/95 backdrop-blur">
            <button onClick={onClose} className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors z-30">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l12 12m0-12L1 13"/></svg>
            </button>

            <div className="flex items-center gap-5 pr-12">
              <CoinLogo pair={coin.pair} size={54} />
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono font-bold text-3xl text-white tracking-tight drop-shadow-md">{coin.pair.replace('USDT','')}</span>
                  <span className="text-gray-500 font-mono text-sm mt-1">USDT</span>
                  <span className="text-[10px] font-bold px-3 py-1 rounded-md uppercase tracking-widest ml-1 shadow-sm"
                    style={{ background:`${vc}15`, color:vc, border:`1px solid ${vc}30` }}>
                    {verdict==='avoid' ? '⛔ Avoid' : '✅ Worth It'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <p className="text-gray-400 text-[11px] mr-2">{coin.total_calls} Calls &bull; {coin.closed_trades} Closed &bull; {coin.open_trades} Open</p>
                  {coin.anomaly_flags?.map((f,i) => (
                    <span key={i} className="text-[8px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider"
                      style={{ background:SEV[f.severity]?.bg, color:SEV[f.severity]?.text, border:`1px solid ${SEV[f.severity]?.border}30` }}>{f.tag}</span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-center flex-shrink-0 hidden sm:flex">
                <RiskGauge score={rs} size="lg" />
                <span className="text-[9px] font-bold uppercase tracking-widest mt-1.5" style={{ color:scoreColor(rs) }}>{scoreGrade(rs)}</span>
              </div>
            </div>
          </div>

          {/* 2. BODY AREA (SCROLLABLE) */}
          <div className="flex-1 overflow-y-auto modal-body-scroll p-6 space-y-6">

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[
                { l:'Win Rate', v:`${coin.win_rate}%`, c:wrc(coin.win_rate), i: trendIcon },
                { l:'SL Rate', v:`${coin.sl_rate}%`, c:coin.sl_rate>=30?'#ef4444':'#8a8577' },
                { l:'Avg Outcome', v:coin.avg_outcome, c:coin.avg_outcome==='SL'?'#ef4444':'#d4a853' },
                { l:'Streak', v:`${coin.current_streak?.length||0}${coin.current_streak?.type==='win'?'W':'L'}`, c:coin.current_streak?.type==='win'?'#22c55e':'#ef4444' },
                { l:'R:R Ratio', v:coin.volatility?.rr_ratio?`${coin.volatility.rr_ratio}x`:'—', c:(coin.volatility?.rr_ratio||0)>=2?'#22c55e':(coin.volatility?.rr_ratio||0)>=1?'#eab308':'#ef4444' },
                { l:'30d WR', v:coin.win_rate_30d!=null?`${coin.win_rate_30d}%`:'—', c:coin.win_rate_30d!=null?wrc(coin.win_rate_30d):'#8a8577' },
              ].map((s,i) => (
                <div key={i} className="flex flex-col items-center justify-center py-4 px-2 rounded-xl bg-white/[0.015] border border-white/[0.03] hover:bg-white/[0.03] transition-colors">
                  <p className="text-[8px] uppercase tracking-widest text-gray-500 mb-1.5">{s.l}</p>
                  <div className="flex items-center gap-1.5">
                    <p className="font-mono font-extrabold text-[16px] drop-shadow-sm" style={{ color:s.c }}>{s.v}</p>
                    {s.i}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-white/[0.03] p-4 bg-white/[0.01]">
              <div className="flex justify-between items-end mb-2.5">
                <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Outcome Distribution</p>
                <p className="text-[9px] text-gray-500 font-mono">{coin.closed_trades} Total Closed</p>
              </div>
              <div className="flex h-[14px] rounded-full overflow-hidden gap-[2px]">
                {['sl','tp1','tp2','tp3','tp4'].map(k => {
                  const v = coin.outcome_dist?.[k]||0; if (!v) return null;
                  const pct = Math.round(v/coin.closed_trades*100);
                  return <div key={k} className="relative group flex items-center justify-center transition-all hover:brightness-110" style={{ flex:v, background:JC[k], borderRadius:'4px' }}>
                    {pct>6 && <span className="text-[8px] font-bold text-white/90 font-mono tracking-tighter">{pct}%</span>}
                    <div className="absolute bottom-full mb-1.5 px-2 py-1 rounded-md text-[9px] font-mono bg-black/90 text-white opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 pointer-events-none">
                      {OC[k]?.l} : {pct}% ({v} tr)
                    </div>
                  </div>;
                })}
              </div>
            </div>

            {coin.insight && (
              <div className="relative p-5 rounded-xl text-[13px] text-gray-300 leading-relaxed bg-white/[0.015] border border-white/[0.04]">
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: st.text }} />
                <div className="flex items-center gap-2 mb-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={st.text} strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color:st.text }}>AI Deep Analysis</p>
                </div>
                <p>{parseBold(coin.insight)}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              <Section title="LuxQuant Winrate by Market Condition" className="h-full">
                <div className="grid grid-cols-3 gap-2 h-full">
                  {['high','mid','low'].map(apiFlow => {
                    const d = coin.flow_perf?.[apiFlow]||{calls:0,wins:0,losses:0,wr:0};
                    const marketCond = mapMarketCondition(apiFlow);
                    const fc = FC[marketCond];
                    const isNow = apiFlow === currentFlow;
                    return (
                      <div key={apiFlow} className={`p-3 rounded-lg text-center flex flex-col justify-center ${isNow ? 'shadow-inner' : ''}`}
                        style={{ background:isNow?fc.bg:'rgba(255,255,255,0.01)', border:`1px solid ${isNow?fc.border+'40':'rgba(255,255,255,0.03)'}` }}>
                        <p className="text-[8px] uppercase tracking-widest font-bold mb-1.5" style={{ color:isNow?fc.text:'#8a8577' }}>
                          {fc.label.toUpperCase()} MARKET {isNow&&<span className="animate-pulse">●</span>}
                        </p>
                        <p className="font-mono font-extrabold text-xl drop-shadow-sm" style={{ color:d.calls>0?wrc(d.wr):'#4a3f35' }}>{d.calls>0?`${d.wr}%`:'—'}</p>
                        <p className="text-gray-500 text-[9px] mt-1">{d.wins}W / {d.losses}L</p>
                      </div>
                    );
                  })}
                </div>
              </Section>

              <Section title="Trend & Target Hit Rate" className="h-full flex flex-col justify-between">
                {coin.monthly_trend?.length >= 2 && (
                  <div className="mb-4 flex-1">
                    <MonthlyLineChart data={coin.monthly_trend} />
                  </div>
                )}
                {coin.tp4_streaks?.total_tp4 > 0 && (
                  <div className="grid grid-cols-3 gap-3 text-center border-t border-white/[0.05] pt-3">
                    <div><p className="text-[8px] text-gray-500 uppercase tracking-widest mb-1">Total TP4</p><p className="font-mono font-bold text-lg text-[#22c55e]">{coin.tp4_streaks.total_tp4}</p></div>
                    <div className="border-l border-white/[0.05]"><p className="text-[8px] text-gray-500 uppercase tracking-widest mb-1">Best Streak</p><p className="font-mono font-bold text-lg text-white">{coin.tp4_streaks.longest_streak}</p></div>
                    <div className="border-l border-white/[0.05]"><p className="text-[8px] text-gray-500 uppercase tracking-widest mb-1">Current</p><p className="font-mono font-bold text-lg" style={{ color:coin.tp4_streaks.current_tp4_streak>0?'#22c55e':'#8a8577' }}>{coin.tp4_streaks.current_tp4_streak}</p></div>
                  </div>
                )}
              </Section>

              {coin.volatility?.profile!=='unknown' && (
                <Section title="Volatility Profile">
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                    <StatBox label="Profile" value={coin.volatility.profile} color={coin.volatility.profile==='stable'?'#22c55e':coin.volatility.profile==='volatile'?'#ef4444':'#eab308'} />
                    <StatBox label="P/L StdDev" value={`${coin.volatility.pl_stddev}%`} color="#fff" />
                    <StatBox label="Avg Win" value={`+${coin.volatility.avg_win_pl}%`} color="#22c55e" />
                    <StatBox label="Avg Loss" value={`${coin.volatility.avg_loss_pl}%`} color="#ef4444" />
                  </div>
                </Section>
              )}

              {coin.entry_quality?.score!=='unknown' && (
                <Section title="Entry Quality Metrics">
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                    <StatBox label="Score" value={coin.entry_quality.score} color={coin.entry_quality.score==='excellent'?'#22c55e':coin.entry_quality.score==='poor'?'#ef4444':'#d4a853'} />
                    <StatBox label="Avg TP Level" value={`${coin.entry_quality.avg_tp_level}/4`} color="#fff" />
                    <StatBox label="Hits > TP1" value={`${coin.entry_quality.reaches_potential}%`} color={coin.entry_quality.reaches_potential>=60?'#22c55e':'#eab308'} />
                    <StatBox label="Full Target Rate" value={`${coin.entry_quality.full_target_rate}%`} color={coin.entry_quality.full_target_rate>=20?'#22c55e':'#8a8577'} />
                  </div>
                </Section>
              )}

              {coin.recovery && (
                <Section title="Recovery Behavior">
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                    <StatBox label="Avg Signal to Recover" value={`${coin.recovery.avg_signals_to_recover} sig`} color={coin.recovery.speed_label==='fast'?'#22c55e':coin.recovery.speed_label==='slow'?'#ef4444':'#eab308'} />
                    <StatBox label="Fastest Recovery" value={`${coin.recovery.fastest_recovery} sig`} color="#22c55e" />
                    <StatBox label="Slowest Recovery" value={`${coin.recovery.slowest_recovery} sig`} color="#ef4444" />
                    <StatBox label="Total Recoveries" value={`${coin.recovery.total_recoveries}`} color="#6b5c52" />
                  </div>
                </Section>
              )}

              {coin.hour_analysis?.has_pattern && (
                <Section title="Best Entry Timing (UTC)">
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                    <StatBox label="Best Hour" value={`${coin.hour_analysis.best_hour}:00`} color="#22c55e" />
                    <StatBox label="Hour WR" value={`${coin.hour_analysis.best_hour_wr}%`} color={wrc(coin.hour_analysis.best_hour_wr)} />
                    <StatBox label="Best Block" value={coin.hour_analysis.best_block?.split(' ')[0]||'—'} color="#d4a853" />
                    <StatBox label="Block WR" value={`${coin.hour_analysis.best_block_wr}%`} color={wrc(coin.hour_analysis.best_block_wr)} />
                  </div>
                </Section>
              )}
            </div>

            {coin.dow_analysis?.breakdown && Object.keys(coin.dow_analysis.breakdown).length > 0 && (
              <Section title="Win Rate by Day of Week">
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {Object.entries(coin.dow_analysis.breakdown).map(([day,s]) => {
                    const isBest = coin.dow_analysis.best_day===day, isWorst = coin.dow_analysis.worst_day===day;
                    return (
                      <div key={day} className="text-center rounded-lg py-2.5 border border-transparent transition-all hover:border-white/10" style={{ background: isBest ? 'rgba(34,197,94,0.05)' : isWorst ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.015)' }}>
                        <div className="flex items-center justify-center text-[12px] font-mono font-bold mb-1.5" style={{ color:wrc(s.wr) }}>
                          {Math.round(s.wr)}%
                        </div>
                        <p className="text-[8px] text-gray-400 font-bold uppercase tracking-wide">{day}</p>
                        <p className="text-[7px] text-gray-600 mt-0.5">{s.closed} tr</p>
                        {isBest && <div className="mx-auto mt-1.5 w-8 h-0.5 rounded-full bg-green-500 shadow-[0_0_5px_#22c55e]" />}
                        {isWorst && <div className="mx-auto mt-1.5 w-8 h-0.5 rounded-full bg-red-500 shadow-[0_0_5px_#ef4444]" />}
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {coin.correlated_pairs?.length > 0 && (
              <div className="p-5 rounded-xl bg-red-500/[0.04] border border-red-500/10 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Correlated SL Risk</p>
                  </div>
                  <p className="text-[11px] text-gray-400">These coins tend to hit SL on the same days. Avoid simultaneous positions.</p>
                </div>
                <div className="flex gap-2.5 flex-wrap">
                  {coin.correlated_pairs.map((cp,i) => (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-red-500/[0.08] border border-red-500/20">
                      <CoinLogo pair={cp.pair} size={18} />
                      <span className="text-[12px] font-mono font-bold text-white tracking-wide">{cp.pair.replace('USDT','')}</span>
                      <span className="text-[9px] text-red-400 font-semibold bg-red-500/10 px-1.5 py-0.5 rounded">{cp.co_sl_count}× together</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {coin.signal_history?.length > 0 && (
              <div className="mt-4">
                <div className="flex justify-between items-end mb-3">
                  <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500">Signal History</p>
                  <p className="text-[10px] text-gray-500 font-mono">Last {coin.signal_history.length} signals</p>
                </div>
                <div className="rounded-xl border border-white/[0.05] bg-black/20 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead className="bg-[#0a0506] border-b border-white/[0.05]">
                        <tr>
                          {['Date','LuxQuant WR','Entry','Result','P/L'].map(h => (
                            <th key={h} className="px-4 py-3.5 text-[8px] uppercase tracking-widest text-[#d4a853] font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.02]">
                        {coin.signal_history.map((s,i) => (
                          <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3 font-mono text-[11px] text-gray-300 whitespace-nowrap">{fmtDate(s.date)}</td>
                            <td className="px-4 py-3 font-mono text-[12px] font-bold" style={{ color:s.platform_wr?wrc(s.platform_wr):'#555' }}>
                              {s.platform_wr!=null?`${s.platform_wr}%`:'—'}
                            </td>
                            <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{s.entry}</td>
                            <td className="px-4 py-3">
                              {OC[s.outcome] && <span className="font-mono font-bold text-[10px] px-2.5 py-1 rounded" style={{ background:OC[s.outcome].bg, color:OC[s.outcome].tx }}>{OC[s.outcome].l}</span>}
                            </td>
                            <td className={`px-4 py-3 font-mono text-[12px] font-bold ${s.outcome!=='sl'?'text-green-400':'text-red-400'}`}>
                              {s.pl_pct}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            
            <div className="h-6"></div>

          </div>
        </div>
      </div>
    </>
  );
};


// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════

// Changed the prop from 'dateFilter' (string) to 'selectedDates' (array)
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
    
    // Check if the array has dates, otherwise show all
    let filtered = all;
    if (selectedDates && selectedDates.length > 0) {
      filtered = all.filter(c => 
        // If the coin has active_days, check if any of the selectedDates are in it
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
      
      // If only 1 day is selected, show its name
      if (selectedDates.length === 1) {
        if (selectedDates[0] === today) label = 'Today';
        else if (selectedDates[0] === yesterday) label = 'Yesterday';
        else { 
          const d = new Date(selectedDates[0]+'T00:00:00'); 
          label = d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}); 
        }
      } else {
        // If multiple days are selected
        label = `Selected: ${selectedDates.length} Days`;
      }
    }
    return { worthIt:w.slice(0,10), avoid:a.slice(0,10), dateLabel:label };
  }, [data, selectedDates]);

  if (loading) return (
    <div className="glass-card rounded-xl p-4 border border-gold-primary/10 mb-4 animate-pulse">
      <div className="h-4 bg-gold-primary/10 rounded w-40 mb-2" /><div className="h-3 bg-gold-primary/5 rounded w-56" />
    </div>
  );
  if (error || !data) return null;
  if (worthIt.length===0 && avoid.length===0) return null;

  return (
    <div className="mb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setCollapsed(!collapsed)}>
          <div className="w-8 h-[3px] bg-gradient-to-r from-[#d4a853] to-transparent rounded-full shadow-[0_0_8px_rgba(212,168,83,0.5)]" />
          <div className="flex items-center gap-3">
            <h3 className="text-white text-base font-bold tracking-wide group-hover:text-[#d4a853] transition-colors">Coin Intelligence</h3>
            <span className="text-[9px] font-mono text-[#d4a853] bg-[#d4a853]/10 px-2.5 py-1 rounded-md border border-[#d4a853]/20 shadow-inner">{dateLabel}</span>
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
          <div className="bg-[#0f080a] border border-white/[0.05] rounded-xl p-4 shadow-sm">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">LuxQuant Winrate (Last 7 Days)</p>
              
              {/* LEGEND MARKET CONDITION */}
              <div className="flex gap-4 text-[9px] text-gray-500 font-medium">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full shadow-sm" style={{ background:FC.good.border }} />Good Market (≥70%)</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full shadow-sm" style={{ background:FC.neutral.border }} />Neutral Market (50-70%)</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full shadow-sm" style={{ background:FC.bad.border }} />Bad Market (&lt;50%)</div>
              </div>

            </div>
            <div className="bg-white/[0.01] border border-white/[0.02] rounded-xl p-3 overflow-x-auto">
              <div className="min-w-[400px]">
                <MarketConditionLineChart timeline={data.flow_timeline} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#0f080a] rounded-xl border border-green-500/20 shadow-lg overflow-hidden flex flex-col">
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

            <div className="bg-[#0f080a] rounded-xl border border-red-500/20 shadow-lg overflow-hidden flex flex-col">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-red-500/20 bg-gradient-to-r from-red-500/10 to-transparent">
                <div className="w-1 h-4 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
                <h4 className="text-red-400 text-[11px] font-bold uppercase tracking-widest drop-shadow-sm">Avoid</h4>
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