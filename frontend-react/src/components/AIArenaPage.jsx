// src/components/AIArenaPage.jsx
import React, { useState, useEffect, useRef } from 'react';

// ════════════════════════════════════════
// SMART TAGS PARSER
// ════════════════════════════════════════
const renderSmartText = (text) => {
  if (!text) return "";
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(<span key={`t-${lastIndex}`}>{text.substring(lastIndex, match.index)}</span>);
    const label = match[1], target = match[2], isExt = target.startsWith('http');
    parts.push(
      <button key={`btn-${match.index}`}
        onClick={() => isExt ? window.open(target, '_blank', 'noopener') : window.dispatchEvent(new CustomEvent('navigate', { detail: target }))}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-[11px] font-mono transition-all border cursor-pointer ${
          isExt ? "bg-blue-500/8 border-blue-500/20 text-blue-400 hover:bg-blue-500/15" : "bg-gold-primary/8 border-gold-primary/20 text-gold-primary hover:bg-gold-primary/15"
        }`}>
        {label}
        <svg className="w-2.5 h-2.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={isExt ? "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" : "M13 7l5 5m0 0l-5 5m5-5H6"} />
        </svg>
      </button>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(<span key={`t-${lastIndex}`}>{text.substring(lastIndex)}</span>);
  return parts.length > 0 ? parts : text;
};

// ════════════════════════════════════════
// SECTION CONFIG
// ════════════════════════════════════════
const SECTIONS = {
  executive_summary:  { title: 'Executive Summary',    emoji: '📋', accent: '#D4A853' },
  price_action:       { title: 'Price Action',          emoji: '📈', accent: '#3B82F6' },
  technical_analysis: { title: 'Technical Analysis',    emoji: '📊', accent: '#A855F7' },
  derivatives_flow:   { title: 'Derivatives Insight',   emoji: '⚡', accent: '#EAB308' },
  onchain_network:    { title: 'On-Chain & Network',    emoji: '🔗', accent: '#22D3EE' },
  market_sentiment:   { title: 'Market Sentiment',      emoji: '🧭', accent: '#22C55E' },
  news_catalysts:     { title: 'News & Catalysts',      emoji: '📰', accent: '#F97316' },
  signal_performance: { title: 'Signal Performance',    emoji: '🎯', accent: '#34D399' },
  reasoning_log:      { title: 'AI Chain of Thought',   emoji: '🧠', accent: '#A855F7', isLog: true },
  market_stance:      { title: 'Market Stance',         emoji: '🏁', accent: '#D4A853' },
};

const SECTION_ORDER = [
  'executive_summary', 'derivatives_flow', 'technical_analysis', 'price_action',
  'onchain_network', 'market_sentiment', 'news_catalysts', 'signal_performance',
  'reasoning_log', 'market_stance'
];

// ════════════════════════════════════════
// EXPANDABLE SECTION
// ════════════════════════════════════════
const Section = ({ sectionKey, content, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const cfg = SECTIONS[sectionKey];
  if (!cfg || !content) return null;

  return (
    <div className="border-b border-white/[0.04] last:border-0">
      <button onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-5 py-3.5 transition-colors ${open ? 'bg-white/[0.03]' : 'hover:bg-white/[0.02]'}`}>
        <div className="flex items-center gap-3">
          <span className="text-base grayscale-[30%]">{cfg.emoji}</span>
          <span className={`text-[13px] font-semibold tracking-wide ${open ? 'text-white' : 'text-text-secondary'}`}>{cfg.title}</span>
        </div>
        <svg className={`w-4 h-4 text-text-muted/50 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-5 pb-5 pt-1 pl-[52px]">
          {cfg.isLog ? (
            <div className="font-mono text-[11px] leading-[2] whitespace-pre-wrap rounded-xl p-4"
              style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(168,85,247,0.12)' }}>
              {content.split('\n').map((line, i) => {
                const isStep = line.trim().startsWith('>');
                return (
                  <div key={i} className={isStep ? 'text-purple-300/80' : 'text-purple-300/40'}>
                    {isStep ? (<><span className="text-purple-500/50 select-none">{'❯ '}</span><span>{line.trim().replace(/^>\s*/, '')}</span></>) : <span>{line}</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[13px] text-text-muted/90 leading-[1.85] tracking-wide">{renderSmartText(content)}</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// REPORT CARD (Timeline Item)
// ════════════════════════════════════════
const ReportCard = ({ report, isLatest = false }) => {
  const sentimentMap = {
    bullish:  { color: '#22c55e', label: 'BULLISH',  dot: 'bg-emerald-400' },
    bearish:  { color: '#ef4444', label: 'BEARISH',  dot: 'bg-red-400' },
    cautious: { color: '#f59e0b', label: 'CAUTIOUS', dot: 'bg-amber-400' },
    neutral:  { color: '#6b7280', label: 'NEUTRAL',  dot: 'bg-gray-400' },
  };
  const s = sentimentMap[report.sentiment?.toLowerCase()] || sentimentMap.neutral;

  const biasMap = {
    LONG:    { color: '#22c55e', icon: '▲' },
    SHORT:   { color: '#ef4444', icon: '▼' },
    NEUTRAL: { color: '#6b7280', icon: '◆' },
  };
  const b = biasMap[report.bias_direction] || biasMap.NEUTRAL;

  const fmtTime = (iso) => {
    if (!iso) return '--:--';
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };
  const fmtDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
  };
  const fmtPrice = (v) => v ? `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—';

  return (
    <div className="relative pl-8 lg:pl-10 pb-6">
      {/* Timeline line */}
      <div className="absolute left-[14px] lg:left-[18px] top-6 bottom-0 w-[1.5px]" style={{ background: 'linear-gradient(to bottom, rgba(212,168,83,0.3), transparent)' }} />
      {/* Timeline dot */}
      <div className="absolute left-[7px] lg:left-[11px] top-4 w-4 h-4 rounded-full border-2 border-gold-primary/60 flex items-center justify-center z-10"
        style={{ background: '#0d0a07' }}>
        <div className={`w-1.5 h-1.5 rounded-full ${isLatest ? 'bg-gold-primary animate-pulse' : 'bg-gold-primary/40'}`} />
      </div>

      {/* Card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(22,14,18,0.85)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.05)' }}>
        
        {/* Card Header — clean, no model label */}
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex items-center gap-3">
            <span className="text-white font-mono text-sm font-bold tracking-tight">{fmtTime(report.timestamp)}</span>
            <span className="text-text-muted/40 text-xs font-mono">{fmtDate(report.timestamp)}</span>
          </div>
          {isLatest && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Latest</span>
          )}
        </div>

        {/* Confidence + Sentiment + Bias row */}
        <div className="px-5 py-3 flex flex-wrap items-center gap-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          {/* Confidence */}
          <div className="flex items-center gap-2.5">
            <span className="text-[9px] text-text-muted/50 uppercase tracking-widest font-bold">Confidence</span>
            <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${report.confidence || 0}%`, background: s.color }} />
            </div>
            <span className="text-xs font-mono font-bold" style={{ color: s.color }}>{report.confidence}%</span>
          </div>

          {/* Sentiment */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: `${s.color}10`, border: `1px solid ${s.color}30` }}>
            <div className={`w-1.5 h-1.5 rounded-full ${s.dot} animate-pulse`} />
            <span className="text-[10px] font-black tracking-wider" style={{ color: s.color }}>{s.label}</span>
          </div>

          {/* Bias */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: `${b.color}10`, border: `1px solid ${b.color}30` }}>
            <span className="text-xs" style={{ color: b.color }}>{b.icon}</span>
            <span className="text-[10px] font-black tracking-wider" style={{ color: b.color }}>BIAS: {report.bias_direction || 'N/A'}</span>
          </div>

          {/* Target Range */}
          {report.price_target_range && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[9px] text-text-muted/40 uppercase tracking-widest">Range</span>
              <span className="text-[11px] font-mono font-bold text-red-400/80">{fmtPrice(report.price_target_range.low)}</span>
              <span className="text-text-muted/30 text-[10px]">→</span>
              <span className="text-[11px] font-mono font-bold text-green-400/80">{fmtPrice(report.price_target_range.high)}</span>
            </div>
          )}
        </div>

        {/* Key Levels Mini Bar */}
        {report.key_levels && <KeyLevelsMini levels={report.key_levels} />}

        {/* Sections */}
        <div>
          {SECTION_ORDER.map((key, idx) => (
            <Section key={key} sectionKey={key} content={report.sections?.[key]} defaultOpen={idx === 0 && isLatest} />
          ))}
        </div>

        {/* Risk Factors */}
        {report.risk_factors?.length > 0 && (
          <div className="px-5 py-3" style={{ background: 'rgba(239,68,68,0.02)', borderTop: '1px solid rgba(239,68,68,0.06)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px]">⚠️</span>
              <span className="text-[9px] text-red-400/60 uppercase tracking-widest font-bold">Risk Factors</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {report.risk_factors.map((r, i) => (
                <span key={i} className="text-[11px] text-red-300/50 leading-relaxed px-2 py-0.5 rounded-md" style={{ background: 'rgba(239,68,68,0.05)' }}>
                  {r}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer meta — clean, no model */}
        <div className="px-5 py-2.5 flex items-center gap-4 text-[9px] text-text-muted/30" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
          {report.generated_in_seconds && <span>Generated in {report.generated_in_seconds}s</span>}
          {report.data_sources && <span>{report.data_sources} data sources</span>}
          <span>{report.id}</span>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// KEY LEVELS MINI BAR
// ════════════════════════════════════════
const KeyLevelsMini = ({ levels }) => {
  const allVals = [levels.strong_support, levels.support, levels.resistance, levels.strong_resistance].filter(Boolean);
  if (allVals.length < 2) return null;
  const min = Math.min(...allVals) * 0.998, max = Math.max(...allVals) * 1.002, range = max - min;
  const pos = (v) => ((v - min) / range * 100);
  const fmt = (v) => v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${v.toFixed(0)}`;

  return (
    <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="relative h-5 rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)' }}>
        {levels.strong_support && levels.support && (
          <div className="absolute top-0 bottom-0 rounded opacity-15" style={{ left: `${pos(levels.strong_support)}%`, width: `${pos(levels.support) - pos(levels.strong_support)}%`, background: '#22c55e' }} />
        )}
        {levels.resistance && levels.strong_resistance && (
          <div className="absolute top-0 bottom-0 rounded opacity-15" style={{ left: `${pos(levels.resistance)}%`, width: `${pos(levels.strong_resistance) - pos(levels.resistance)}%`, background: '#ef4444' }} />
        )}
        {[
          { val: levels.strong_support, color: '#22c55e' },
          { val: levels.support, color: '#4ade80' },
          { val: levels.resistance, color: '#f87171' },
          { val: levels.strong_resistance, color: '#ef4444' },
        ].filter(l => l.val).map((l, i) => (
          <div key={i} className="absolute top-0 bottom-0" style={{ left: `${pos(l.val)}%` }}>
            <div className="w-px h-full" style={{ background: l.color, opacity: 0.4 }} />
            <span className="absolute -bottom-3.5 -translate-x-1/2 text-[7px] font-mono font-bold whitespace-nowrap" style={{ color: l.color }}>{fmt(l.val)}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-4 px-0.5">
        <span className="text-[7px] text-green-400/40 font-mono tracking-wider">SUPPORT</span>
        <span className="text-[7px] text-red-400/40 font-mono tracking-wider">RESISTANCE</span>
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// COMPACT STICKY HEADER (shown on scroll)
// ════════════════════════════════════════
const CompactHeader = ({ visible, latestReport }) => {
  if (!latestReport) return null;

  const sentimentMap = {
    bullish:  { color: '#22c55e', label: 'BULLISH' },
    bearish:  { color: '#ef4444', label: 'BEARISH' },
    cautious: { color: '#f59e0b', label: 'CAUTIOUS' },
    neutral:  { color: '#6b7280', label: 'NEUTRAL' },
  };
  const s = sentimentMap[latestReport.sentiment?.toLowerCase()] || sentimentMap.neutral;

  return (
    <div
      className="flex items-center justify-between gap-3 transition-all duration-300 ease-out overflow-hidden"
      style={{
        maxHeight: visible ? '40px' : '0px',
        opacity: visible ? 1 : 0,
        paddingTop: visible ? '2px' : '0px',
        paddingBottom: visible ? '2px' : '0px',
      }}
    >
      <div className="flex items-center gap-3">
        <h2 className="text-base font-display font-black text-white tracking-tight">
          AI <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark">Arena</span>
        </h2>
        <div className="w-px h-3.5 bg-white/10" />
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: `${s.color}10`, border: `1px solid ${s.color}25` }}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: s.color }} />
          <span className="text-[9px] font-black tracking-wider" style={{ color: s.color }}>{s.label}</span>
        </div>
        <span className="text-[10px] font-mono text-text-muted/40">{latestReport.confidence}%</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[9px] text-emerald-400/70 font-bold uppercase tracking-widest">Live</span>
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════
export default function AIArenaPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const headerRef = useRef(null);

  const fetchReports = async () => {
    try {
      setError(null);
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8002';
      
      let data;
      try {
        const histRes = await fetch(`${baseUrl}/api/v1/ai-arena/history?limit=20`);
        if (histRes.ok) {
          data = await histRes.json();
          if (data.reports?.length > 0) {
            setReports(data.reports);
            return;
          }
        }
      } catch {}

      const res = await fetch(`${baseUrl}/api/v1/ai-arena/latest`);
      if (res.status === 404) { setReports([]); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const latest = await res.json();
      setReports([latest]);
    } catch (err) {
      console.error("AI Arena fetch error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
    const interval = setInterval(fetchReports, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full flex flex-col">

      {/* ══ HEADER ══ */}
      <div ref={headerRef} className="pb-4 pt-1">
          {/* Title */}
          <h1 className="text-3xl lg:text-4xl font-display font-black text-white tracking-tight mb-2">
            AI <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark">Arena</span>
          </h1>
          <p className="text-text-muted text-sm leading-relaxed max-w-2xl">
            Institutional-grade market report generated every hour by reasoning AI model.
            Analyzing Liquidation anomalies, Open Interest, and On-Chain Supply shifts.
          </p>
      </div>

      {/* ══ SCROLLABLE FEED ══ */}
      <div className="flex-1 pb-32 max-w-4xl">
        {loading && reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="relative w-12 h-12 mb-6">
              <div className="absolute inset-0 border-2 border-gold-primary/15 rounded-full" />
              <div className="absolute inset-0 border-t-2 border-gold-primary rounded-full animate-spin" />
            </div>
            <p className="text-text-muted text-xs font-mono tracking-[0.3em] uppercase animate-pulse">Syncing Intelligence...</p>
          </div>
        ) : reports.length > 0 ? (
          <div className="mt-4">
            {reports.map((rpt, idx) => (
              <ReportCard key={rpt.id || idx} report={rpt} isLatest={idx === 0} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 rounded-2xl mt-4" style={{ background: 'rgba(255,255,255,0.015)', border: '1px dashed rgba(255,255,255,0.08)' }}>
            <span className="text-3xl opacity-20 block mb-4">📡</span>
            <p className="text-text-muted text-sm font-medium mb-1">No intelligence stream available</p>
            <p className="text-text-muted/40 text-xs">Reports are generated every hour at :00</p>
            {error && <p className="text-red-400/50 text-xs mt-3">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}