import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import CoinLogo from './CoinLogo';

// ═══════════════════════════════════════════
// SHARED COIN INTELLIGENCE LOGIC + DETAIL MODAL
// Extracted from CoinIntelligence.jsx so SignalsTable can reuse the exact same
// verdict classification and the deep-analysis modal WITHOUT duplicating logic.
// CoinIntelligence.jsx now imports these from here.
//
// THEME NOTE: structural surfaces (frame, header, cards, section labels,
// scrollbar, table borders) follow the SignalModal gold design language.
// Colors that ENCODE DATA (verdict / severity / market condition / win-loss /
// score gauge / outcome bars / best-worst markers / correlated-SL) are kept
// intentionally — they are meaning, not decoration.
// ═══════════════════════════════════════════

// MARKET CONDITIONS (Good, Neutral, Bad) — semantic, do not goldify
export const FC = {
  good:    { bg: 'rgba(34,197,94,0.10)', border: '#22c55e', text: '#22c55e', label: 'Good' },
  neutral: { bg: 'rgba(234,179,8,0.10)', border: '#eab308', text: '#eab308', label: 'Neutral' },
  bad:     { bg: 'rgba(239,68,68,0.10)', border: '#ef4444', text: '#ef4444', label: 'Bad' },
};

export const mapMarketCondition = (flow) =>
  ({ high: 'good', mid: 'neutral', low: 'bad' }[flow] || 'neutral');

export const SEV = {
  danger:   { border: '#ef4444', bg: 'rgba(239,68,68,0.06)', text: '#ef4444' },
  warning:  { border: '#eab308', bg: 'rgba(234,179,8,0.06)',  text: '#eab308' },
  positive: { border: '#22c55e', bg: 'rgba(34,197,94,0.06)',  text: '#22c55e' },
  info:     { border: '#d4a853', bg: 'rgba(212,168,83,0.06)', text: '#d4a853' },
};

export const OC = {
  tp4: { bg: 'rgba(34,197,94,0.15)', tx: '#22c55e', l: 'TP4' }, tp3: { bg: 'rgba(132,204,22,0.15)', tx: '#84cc16', l: 'TP3' },
  tp2: { bg: 'rgba(234,179,8,0.15)', tx: '#eab308', l: 'TP2' }, tp1: { bg: 'rgba(96,165,250,0.15)', tx: '#60a5fa', l: 'TP1' },
  sl:  { bg: 'rgba(239,68,68,0.15)', tx: '#ef4444', l: 'SL' },
};

export const JC = { sl:'rgba(239,68,68,0.5)', tp1:'rgba(96,165,250,0.5)', tp2:'rgba(234,179,8,0.45)', tp3:'rgba(132,204,22,0.45)', tp4:'rgba(34,197,94,0.5)' };

export const wrc = w => w >= 70 ? '#22c55e' : w >= 50 ? '#eab308' : '#ef4444';
export const scoreColor = s => s >= 80 ? '#22c55e' : s >= 65 ? '#84cc16' : s >= 45 ? '#eab308' : s >= 25 ? '#f97316' : '#ef4444';
export const scoreGrade = s => s >= 80 ? 'Excellent' : s >= 65 ? 'Good' : s >= 45 ? 'Average' : s >= 25 ? 'Poor' : 'Very Poor';
export const primarySev = f => { for (const s of ['danger','warning','positive','info']) if (f?.some(x => x.severity === s)) return s; return 'info'; };
export const parseBold = t => t ? t.split(/(\*\*[^*]+\*\*)/).map((p,i) => p.startsWith('**') ? <span key={i} className="font-semibold text-text-primary drop-shadow-md">{p.slice(2,-2)}</span> : p) : t;
export const fmtDate = d => { if (!d) return ''; const p = d.split('-'); return p.length === 3 ? `${parseInt(p[2])} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(p[1])-1]}` : d; };

export const classifyCoin = c => {
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

export const RiskGauge = ({ score, size = 'sm' }) => {
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

export const MonthlyLineChart = ({ data }) => {
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
            <stop offset="0%" stopColor="#d4a853" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#d4a853" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f, i) => (
          <line key={i} x1={padX} x2={W - padX} y1={padY + f * (H - padY * 2)} y2={padY + f * (H - padY * 2)} stroke="rgba(212,168,83,0.06)" strokeWidth="0.5" />
        ))}
        <path d={areaD} fill="url(#wrGrad)" />
        <path d={pathD} fill="none" stroke="#d4a853" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="2.5" fill="#0a0506" stroke={wrc(p.wr)} strokeWidth="1.5" />
            <text x={p.x} y={p.y - 6} fill={wrc(p.wr)} fontSize="7" fontWeight="700" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">{p.wr}%</text>
            <text x={p.x} y={H + 12} fill="#6b5c52" fontSize="6" textAnchor="middle">{p.month?.slice(5)}</text>
          </g>
        ))}
        <text x={2} y={padY + 3} fill="#4a3f35" fontSize="5" fontFamily="'JetBrains Mono', monospace">{Math.round(maxWr)}%</text>
        <text x={2} y={H - padY + 3} fill="#4a3f35" fontSize="5" fontFamily="'JetBrains Mono', monospace">{Math.round(minWr)}%</text>
      </svg>
    </div>
  );
};

const Section = ({ title, children, className = "" }) => (
  <div className={`relative rounded-xl p-4 bg-white/[0.02] border border-white/[0.06] overflow-hidden ${className}`}>
    <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/25 to-transparent" />
    <p className="text-[9px] font-bold uppercase tracking-widest text-gold-primary/70 mb-3">{title}</p>
    {children}
  </div>
);

const StatBox = ({ label, value, color, icon = null }) => (
  <div className="flex flex-col justify-center">
    <p className="text-[8px] text-text-muted uppercase tracking-widest mb-1">{label}</p>
    <div className="flex items-center gap-1.5">
      <p className="font-mono font-bold text-[14px] drop-shadow-sm" style={{ color }}>{value}</p>
      {icon}
    </div>
  </div>
);

// ═══════════════════════════════════════════
// FULL PAGE MODAL (deep analysis)
// ═══════════════════════════════════════════
export const CoinDetailModal = ({ coin, currentFlow, onClose }) => {
  const [isClosing, setIsClosing] = useState(false);
  const [histPage, setHistPage] = useState(1); // pagination Signal History
  const HIST_PER_PAGE = 10;

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Animated close (mirrors SignalModal)
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => { setIsClosing(false); onClose(); }, 200);
  };

  // Escape to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!coin) return null;

  const verdict = classifyCoin(coin);
  const vc = verdict === 'avoid' ? '#ef4444' : '#22c55e';
  const st = SEV[primarySev(coin.anomaly_flags)];
  const rs = coin.risk_score || 0;

  const trendIcon = coin.win_rate_30d_trend === 'up' ?
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 7L5 4L8 7" stroke="#22c55e" strokeWidth="1.5"/><path d="M2 3L5 6L8 3" stroke="#22c55e" strokeWidth="1.5"/></svg> :
    coin.win_rate_30d_trend === 'down' ?
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3L5 6L8 3" stroke="#ef4444" strokeWidth="1.5"/><path d="M2 7L5 4L8 7" stroke="#ef4444" strokeWidth="1.5"/></svg> : null;

  const statCards = [
    { l:'Win Rate', v:`${coin.win_rate}%`, c:wrc(coin.win_rate), i: trendIcon },
    { l:'SL Rate', v:`${coin.sl_rate}%`, c:coin.sl_rate>=30?'#ef4444':'#8a8577' },
    { l:'Avg Outcome', v:coin.avg_outcome, c:coin.avg_outcome==='SL'?'#ef4444':'#d4a853' },
    { l:'Streak', v:`${coin.current_streak?.length||0}${coin.current_streak?.type==='win'?'W':'L'}`, c:coin.current_streak?.type==='win'?'#22c55e':'#ef4444' },
    { l:'R:R Ratio', v:coin.volatility?.rr_ratio?`${coin.volatility.rr_ratio}x`:'—', c:(coin.volatility?.rr_ratio||0)>=2?'#22c55e':(coin.volatility?.rr_ratio||0)>=1?'#eab308':'#ef4444' },
    { l:'30d WR', v:coin.win_rate_30d!=null?`${coin.win_rate_30d}%`:'—', c:coin.win_rate_30d!=null?wrc(coin.win_rate_30d):'#8a8577' },
  ];

  const content = (
    <>
      <div className={`cdm-overlay ${isClosing ? 'cdm-closing' : ''}`}>
        <div className="cdm-backdrop" onClick={handleClose} />
        <div className="cdm-container">
          <div className="cdm-content" style={{ '--vc': vc }}>
            {/* Drag handle (mobile) */}
            <div className="sm:hidden flex-shrink-0 flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* ── HEADER (sticky) ── */}
            <div className="flex-shrink-0 relative bg-surface-raised border-b border-line/30 px-4 py-3.5 z-10">
              {/* verdict-colored accent line (semantic) */}
              <div className="absolute top-0 inset-x-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${vc}, transparent)`, opacity: 0.7 }} />
              <div className="flex items-center gap-3 pr-10">
                <CoinLogo pair={coin.pair} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-xl text-text-primary tracking-tight">{coin.pair.replace('USDT','')}</span>
                    <span className="text-text-muted font-mono text-xs">USDT</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest"
                      style={{ background:`${vc}15`, color:vc, border:`1px solid ${vc}30` }}>
                      {verdict==='avoid' ? '⛔ Avoid' : '✅ Worth It'}
                    </span>
                  </div>
                  <p className="text-text-muted text-[11px] mt-1">
                    {coin.total_calls} Calls · {coin.closed_trades} Closed · {coin.open_trades} Open
                  </p>
                </div>
                {/* Score gauge (compact, in header) */}
                <div className="flex-col items-center flex-shrink-0 hidden sm:flex pr-2">
                  <RiskGauge score={rs} size="sm" />
                  <span className="text-[8px] font-bold uppercase tracking-widest mt-1" style={{ color:scoreColor(rs) }}>{scoreGrade(rs)}</span>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary bg-surface-raised hover:bg-red-500/20 border border-line/20 hover:border-red-500/50 rounded-lg transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* ── BODY (scroll) ── */}
            <div className="flex-1 min-h-0 overflow-y-auto cdm-scroll px-4 py-4 sm:px-5 sm:py-5">
              <div className="max-w-5xl mx-auto space-y-5">

                {/* Anomaly flag chips (severity = semantic) */}
                {coin.anomaly_flags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {coin.anomaly_flags.map((f,i) => (
                      <span key={i} className="text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
                        style={{ background:SEV[f.severity]?.bg, color:SEV[f.severity]?.text, border:`1px solid ${SEV[f.severity]?.border}30` }}>{f.tag}</span>
                    ))}
                  </div>
                )}

                {/* Stat cards (values = semantic) */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                  {statCards.map((s,i) => (
                    <div key={i} className="flex flex-col items-center justify-center py-3.5 px-2 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-line/25 transition-colors">
                      <p className="text-[8px] uppercase tracking-widest text-text-muted mb-1.5 text-center">{s.l}</p>
                      <div className="flex items-center gap-1">
                        <p className="font-mono font-extrabold text-[15px]" style={{ color:s.c }}>{s.v}</p>
                        {s.i}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Outcome distribution — donut multi-warna (data pct + count dipertahankan) */}
                <div className="relative rounded-xl border border-white/[0.06] p-4 bg-white/[0.02] overflow-hidden">
                  <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/25 to-transparent" />
                  <div className="flex justify-between items-end mb-1">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-gold-primary/70">Outcome Distribution</p>
                    <p className="text-[9px] text-text-muted font-mono">{coin.closed_trades} Total Closed</p>
                  </div>
                  {(() => {
                    const order = ['tp4','tp3','tp2','tp1','sl'];
                    const closed = coin.closed_trades || 0;
                    const reachTp = ['tp1','tp2','tp3','tp4'].reduce((a,k)=>a+(coin.outcome_dist?.[k]||0),0);
                    const reachPct = closed ? Math.round(reachTp/closed*100) : 0;
                    let acc = 0;
                    const segs = order.map(k => {
                      const v = coin.outcome_dist?.[k]||0;
                      const pct = closed ? (v/closed*100) : 0;
                      const s = { k, v, pct, offset: acc };
                      acc += pct; return s;
                    }).filter(s => s.v > 0);
                    return (
                      <div className="flex items-center gap-5 mt-2">
                        <svg width="118" height="118" viewBox="0 0 42 42" className="flex-shrink-0">
                          <circle cx="21" cy="21" r="15.915" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
                          {segs.map(s => (
                            <circle key={s.k} cx="21" cy="21" r="15.915" fill="none" stroke={JC[s.k]} strokeWidth="5"
                              strokeDasharray={`${s.pct} ${100 - s.pct}`} strokeDashoffset={25 - s.offset} strokeLinecap="butt" />
                          ))}
                          <text x="21" y="20.3" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="6" fontWeight="700" fill={wrc(reachPct)}>{reachPct}%</text>
                          <text x="21" y="25.5" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize="2.6" letterSpacing="0.4" fill="#8a8577">REACH TP</text>
                        </svg>
                        <div className="flex-1 grid grid-cols-1 gap-y-1.5 font-mono text-[11px]">
                          {order.map(k => {
                            const v = coin.outcome_dist?.[k]||0;
                            const pct = closed ? Math.round(v/closed*100) : 0;
                            return (
                              <div key={k} className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background:JC[k] }} />
                                <span className="text-text-primary/80">{OC[k]?.l || k.toUpperCase()}</span>
                                <span className="ml-auto tabular-nums text-text-primary/45">{pct}% · {v} tr</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* AI insight (left accent = severity, semantic) */}
                {coin.insight && (
                  <div className="relative p-4 pl-5 rounded-xl text-[13px] text-gray-300 leading-relaxed bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: st.text }} />
                    <div className="flex items-center gap-2 mb-2.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={st.text} strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color:st.text }}>AI Deep Analysis</p>
                    </div>
                    <p>{parseBold(coin.insight)}</p>
                  </div>
                )}

                {/* 2-col analysis grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Section title="LuxQuant Winrate by Market Condition" className="h-full">
                    <div className="grid grid-cols-3 gap-2 h-full">
                      {['high','mid','low'].map(apiFlow => {
                        const d = coin.flow_perf?.[apiFlow]||{calls:0,wins:0,losses:0,wr:0};
                        const marketCond = mapMarketCondition(apiFlow);
                        const fc = FC[marketCond];
                        const isNow = apiFlow === currentFlow;
                        return (
                          <div key={apiFlow} className={`p-3 rounded-lg text-center flex flex-col justify-center ${isNow ? 'shadow-inner' : ''}`}
                            style={{ background:isNow?fc.bg:'rgba(255,255,255,0.01)', border:`1px solid ${isNow?fc.border+'40':'rgba(212,168,83,0.08)'}` }}>
                            <p className="text-[8px] uppercase tracking-widest font-bold mb-1.5" style={{ color:isNow?fc.text:'#8a8577' }}>
                              {fc.label.toUpperCase()} MARKET {isNow&&<span className="animate-pulse">●</span>}
                            </p>
                            <p className="font-mono font-extrabold text-xl" style={{ color:d.calls>0?wrc(d.wr):'#4a3f35' }}>{d.calls>0?`${d.wr}%`:'—'}</p>
                            <p className="text-text-muted text-[9px] mt-1">{d.wins}W / {d.losses}L</p>
                          </div>
                        );
                      })}
                    </div>
                  </Section>

                  <Section title="Trend & Target Hit Rate" className="h-full flex flex-col justify-between">
                    {coin.monthly_trend?.length >= 2 && (
                      <div className="mb-3 flex-1">
                        <MonthlyLineChart data={coin.monthly_trend} />
                      </div>
                    )}
                    {coin.tp4_streaks?.total_tp4 > 0 && (
                      <div className="grid grid-cols-3 gap-3 text-center border-t border-line/10 pt-3">
                        <div><p className="text-[8px] text-text-muted uppercase tracking-widest mb-1">Total TP4</p><p className="font-mono font-bold text-lg text-[#22c55e]">{coin.tp4_streaks.total_tp4}</p></div>
                        <div className="border-l border-line/10"><p className="text-[8px] text-text-muted uppercase tracking-widest mb-1">Best Streak</p><p className="font-mono font-bold text-lg text-text-primary">{coin.tp4_streaks.longest_streak}</p></div>
                        <div className="border-l border-line/10"><p className="text-[8px] text-text-muted uppercase tracking-widest mb-1">Current</p><p className="font-mono font-bold text-lg" style={{ color:coin.tp4_streaks.current_tp4_streak>0?'#22c55e':'#8a8577' }}>{coin.tp4_streaks.current_tp4_streak}</p></div>
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

                {/* Day of week (best/worst markers = semantic) */}
                {coin.dow_analysis?.breakdown && Object.keys(coin.dow_analysis.breakdown).length > 0 && (
                  <Section title="Win Rate by Day of Week">
                    <div className="flex items-end justify-between gap-1.5 sm:gap-2">
                      {Object.entries(coin.dow_analysis.breakdown).map(([day,s]) => {
                        const isBest = coin.dow_analysis.best_day===day, isWorst = coin.dow_analysis.worst_day===day;
                        const wr = Math.round(s.wr);
                        const col = wrc(s.wr);
                        return (
                          <div key={day} className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
                            <span className="font-mono text-[10px] font-bold tabular-nums" style={{ color:col }}>{wr}%</span>
                            {/* bar track */}
                            <div className="w-full h-20 flex items-end rounded-md bg-white/[0.02] overflow-hidden">
                              <div
                                className="w-full rounded-t-md transition-all"
                                style={{
                                  height:`${Math.max(4, wr)}%`,
                                  background:`linear-gradient(180deg, ${col}, ${col}44)`,
                                  boxShadow: isBest ? `0 0 10px ${col}66` : isWorst ? '0 0 10px rgba(239,68,68,0.4)' : 'none',
                                }}
                              />
                            </div>
                            <div className="flex flex-col items-center">
                              <span className="text-[8px] text-gray-300 font-bold uppercase tracking-wide flex items-center gap-0.5">
                                {day}
                                {isBest && <span className="text-green-400 text-[7px]">▲</span>}
                                {isWorst && <span className="text-red-400 text-[7px]">▼</span>}
                              </span>
                              <span className="text-[7px] text-text-muted">{s.closed} tr</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Section>
                )}

                {/* Correlated SL risk (red = semantic, kept intact) */}
                {coin.correlated_pairs?.length > 0 && (
                  <div className="p-4 rounded-xl bg-red-500/[0.04] border border-red-500/10 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
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
                          <span className="text-[12px] font-mono font-bold text-text-primary tracking-wide">{cp.pair.replace('USDT','')}</span>
                          <span className="text-[9px] text-red-400 font-semibold bg-red-500/10 px-1.5 py-0.5 rounded">{cp.co_sl_count}× together</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Signal history — paginated (biar tidak kepanjangan) */}
                {coin.signal_history?.length > 0 && (() => {
                  const total = coin.signal_history.length;
                  const pages = Math.max(1, Math.ceil(total / HIST_PER_PAGE));
                  const page = Math.min(histPage, pages);
                  const start = (page - 1) * HIST_PER_PAGE;
                  const rows = coin.signal_history.slice(start, start + HIST_PER_PAGE);
                  return (
                  <div>
                    <div className="flex justify-between items-end mb-3">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-gold-primary/70">Signal History</p>
                      <p className="text-[10px] text-text-muted font-mono">{total} signals total</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                      <div className="overflow-x-auto cdm-scroll">
                        <table className="w-full text-left border-collapse min-w-[500px]">
                          <thead className="bg-surface-raised border-b border-line/15">
                            <tr>
                              {['Date','LuxQuant WR','Entry','Result','P/L'].map(h => (
                                <th key={h} className="px-4 py-3 text-[8px] uppercase tracking-widest text-gold-primary font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gold-primary/5">
                            {rows.map((s,i) => (
                              <tr key={start+i} className="hover:bg-gold-primary/[0.04] transition-colors">
                                <td className="px-4 py-2.5 font-mono text-[11px] text-gray-300 whitespace-nowrap">{fmtDate(s.date)}</td>
                                <td className="px-4 py-2.5 font-mono text-[12px] font-bold" style={{ color:s.platform_wr?wrc(s.platform_wr):'#555' }}>
                                  {s.platform_wr!=null?`${s.platform_wr}%`:'—'}
                                </td>
                                <td className="px-4 py-2.5 font-mono text-[11px] text-text-muted">{s.entry}</td>
                                <td className="px-4 py-2.5">
                                  {OC[s.outcome] && <span className="font-mono font-bold text-[10px] px-2.5 py-1 rounded" style={{ background:OC[s.outcome].bg, color:OC[s.outcome].tx }}>{OC[s.outcome].l}</span>}
                                </td>
                                <td className={`px-4 py-2.5 font-mono text-[12px] font-bold ${s.outcome!=='sl'?'text-green-400':'text-red-400'}`}>
                                  {s.pl_pct}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Pagination controls */}
                      {pages > 1 && (
                        <div className="flex items-center justify-between px-4 py-2.5 border-t border-line/10 bg-surface-raised">
                          <span className="font-mono text-[10px] text-text-muted">
                            {start + 1}–{Math.min(start + HIST_PER_PAGE, total)} of {total}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setHistPage((p) => Math.max(1, p - 1))}
                              disabled={page <= 1}
                              className="px-2.5 py-1 rounded-md border border-line/20 font-mono text-[10px] uppercase tracking-wider text-text-primary/70 hover:text-text-primary hover:border-line/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                              Prev
                            </button>
                            <span className="font-mono text-[10px] tabular-nums text-text-primary/60 px-1">{page}/{pages}</span>
                            <button
                              onClick={() => setHistPage((p) => Math.min(pages, p + 1))}
                              disabled={page >= pages}
                              className="px-2.5 py-1 rounded-md border border-line/20 font-mono text-[10px] uppercase tracking-wider text-text-primary/70 hover:text-text-primary hover:border-line/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })()}

                <div className="h-2"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .cdm-overlay { position: fixed; inset: 0; z-index: 100050; display: flex; align-items: flex-end; justify-content: center; isolation: isolate; }
        @supports(height:100dvh) { .cdm-overlay { height: 100dvh; } }
        .cdm-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.85); animation: cdmBI .25s ease-out; }
        .cdm-container { position: relative; z-index: 1; width: 100%; height: 100%; display: flex; align-items: flex-end; justify-content: center; padding: 0; pointer-events: none; }
        .cdm-container > * { pointer-events: auto; }
        .cdm-content { position: relative; width: 100%; max-width: 1000px; height: min(92dvh, 100%); max-height: min(92dvh, 100%); min-height: min(70dvh, 92dvh); background: #0a0805; border-top: 1px solid rgba(255,255,255,0.08); border-radius: 16px 16px 0 0; display: flex; flex-direction: column; overflow: hidden; animation: cdmUp .32s cubic-bezier(.16,1,.3,1); box-shadow: 0 -16px 48px rgba(0,0,0,.55); }

        @media(min-width:640px) {
          .cdm-overlay { align-items: center; }
          .cdm-container { align-items: center; padding: 16px; }
          .cdm-content { height: auto; min-height: 0; max-height: calc(100vh - 32px); border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 24px 64px rgba(0,0,0,.55); animation: cdmCI .3s cubic-bezier(.16,1,.3,1); }
        }
        @media(min-width:1024px) {
          .cdm-container { padding: 24px; }
          .cdm-content { max-height: 880px; }
        }

        .cdm-closing .cdm-backdrop { animation: cdmBO .2s ease-in forwards; }
        .cdm-closing .cdm-content { animation: cdmDn .2s ease-in forwards; }
        @media(min-width:640px) {
          .cdm-closing .cdm-content { animation: cdmCO .2s ease-in forwards; }
        }
        @keyframes cdmBI { from{opacity:0} to{opacity:1} }
        @keyframes cdmBO { from{opacity:1} to{opacity:0} }
        @keyframes cdmCI { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
        @keyframes cdmCO { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(.97)} }
        @keyframes cdmUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes cdmDn { from{transform:translateY(0)} to{transform:translateY(100%)} }

        .cdm-scroll::-webkit-scrollbar { width: 4px; height: 6px; }
        .cdm-scroll::-webkit-scrollbar-track { background: transparent; }
        .cdm-scroll::-webkit-scrollbar-thumb { background: rgba(212,168,83,.3); border-radius: 4px; }
        .cdm-scroll::-webkit-scrollbar-thumb:hover { background: rgba(212,168,83,.5); }
      `}</style>
    </>
  );

  return createPortal(content, document.body);
};