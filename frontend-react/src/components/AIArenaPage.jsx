// src/components/AIArenaPage.jsx
// AI Arena v3.1 — Interactive Multi-TF Chart + Detailed Analyst Tweets
import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/authApi';

// ════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════

const SECTIONS = {
  market_overview:       { title: 'Market Overview',           emoji: '📊', sources: ['Bybit', 'BGeometrics'] },
  derivatives_liquidity: { title: 'Derivatives & Liquidity',   emoji: '⚡', sources: ['Coinglass', 'Coinalyze', 'Bybit'] },
  sentiment_onchain:     { title: 'Sentiment & On-Chain',      emoji: '🔗', sources: ['Alternative.me', 'BGeometrics'] },
  catalysts_stance:      { title: 'Catalysts & Stance',        emoji: '🏁', sources: ['Google News', 'X (Twitter)'] },
};
const SECTION_ORDER = ['market_overview', 'derivatives_liquidity', 'sentiment_onchain', 'catalysts_stance'];

const SENTIMENT_CONFIG = {
  bullish:  { color: '#4ade80', bg: 'rgba(74,222,128,0.06)',  border: 'rgba(74,222,128,0.2)',  label: 'BULLISH',  icon: '🟢' },
  bearish:  { color: '#f87171', bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.2)', label: 'BEARISH',  icon: '🔴' },
  cautious: { color: '#fbbf24', bg: 'rgba(251,191,36,0.06)',  border: 'rgba(251,191,36,0.2)',  label: 'CAUTIOUS', icon: '🟡' },
  neutral:  { color: '#94a3b8', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.2)', label: 'NEUTRAL',  icon: '⚪' },
};

const SOURCE_LINKS = {
  'Bybit': 'https://www.bybit.com/trade/usdt/BTCUSDT',
  'Coinglass': 'https://www.coinglass.com/open-interest/BTC',
  'Coinalyze': 'https://coinalyze.net/bitcoin/open-interest/',
  'BGeometrics': 'https://www.bgeometrics.com',
  'Alternative.me': 'https://alternative.me/crypto/fear-and-greed-index/',
  'Google News': 'https://news.google.com/search?q=bitcoin',
  'X (Twitter)': 'https://x.com/search?q=bitcoin',
};

const TF_ALIGNMENT_COLORS = {
  all_bullish: { color: '#4ade80', label: 'All Bullish', icon: '🟢' },
  all_bearish: { color: '#f87171', label: 'All Bearish', icon: '🔴' },
  mixed:       { color: '#fbbf24', label: 'Mixed',       icon: '🟡' },
  divergent:   { color: '#f97316', label: 'Divergent',    icon: '🟠' },
};

const MA_COLORS = {
  ema20: '#d4a853', ema21: '#d4a853', ema50: '#e87e38', ema55: '#e87e38',
  sma100: '#22d3ee', sma200: '#8b5cf6', ema200: '#8b5cf6',
};

// ════════════════════════════════════════
// INTERACTIVE CHART — Lightweight Charts
// ════════════════════════════════════════

function PriceChart({ activeTF, onTFChange }) {
  const containerRef = useRef(null);
  const rsiRef = useRef(null);
  const [chartData, setChartData] = useState(null);
  const [chartLoading, setChartLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    api.get(`/api/v1/ai-arena/chart-data?tf=${activeTF}`)
      .then(res => { if (!cancelled) { setChartData(res.data); setChartLoading(false); } })
      .catch(() => { if (!cancelled) setChartLoading(false); });
    return () => { cancelled = true; };
  }, [activeTF]);

  // Main chart
  useEffect(() => {
    if (!chartData?.candles?.length || !containerRef.current) return;
    let disposed = false;

    const initChart = async () => {
      try {
        const { createChart, LineSeries, CandlestickSeries, HistogramSeries } = await import('lightweight-charts');
        if (disposed || !containerRef.current) return;

        containerRef.current.innerHTML = '';
        const chart = createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height: 460,
          layout: { background: { color: 'transparent' }, textColor: '#6b5c52', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
          grid: { vertLines: { color: 'rgba(212,168,83,0.04)' }, horzLines: { color: 'rgba(212,168,83,0.04)' } },
          crosshair: { mode: 0, vertLine: { color: 'rgba(212,168,83,0.3)', width: 1, style: 2 }, horzLine: { color: 'rgba(212,168,83,0.3)', width: 1, style: 2 } },
          rightPriceScale: { borderColor: 'rgba(212,168,83,0.1)', scaleMargins: { top: 0.08, bottom: 0.15 } },
          timeScale: { borderColor: 'rgba(212,168,83,0.1)', timeVisible: true, secondsVisible: false },
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#4ade80', downColor: '#f87171', borderUpColor: '#4ade80', borderDownColor: '#f87171', wickUpColor: '#4ade80', wickDownColor: '#f87171',
        });
        candleSeries.setData(chartData.candles);

        const volSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
        volSeries.setData(chartData.volumes);

        // MA overlays
        Object.entries(chartData.ma_series || {}).forEach(([key, data]) => {
          if (!data?.length) return;
          const color = MA_COLORS[key] || '#888';
          const isSma = key.startsWith('sma');
          const series = chart.addSeries(LineSeries, { color, lineWidth: isSma ? 1 : 1.5, lineStyle: isSma ? 2 : 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
          series.setData(data);
        });

        // Liquidation levels (4H only)
        const liq = chartData.liquidation_levels;
        if (liq && activeTF === '4H') {
          if (liq.nearest_long_cluster) {
            const s = chart.addSeries(LineSeries, { color: '#f87171', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, title: 'Liq Long' });
            s.setData(chartData.candles.map(c => ({ time: c.time, value: liq.nearest_long_cluster })));
          }
          if (liq.nearest_short_cluster) {
            const s = chart.addSeries(LineSeries, { color: '#4ade80', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, title: 'Liq Short' });
            s.setData(chartData.candles.map(c => ({ time: c.time, value: liq.nearest_short_cluster })));
          }
        }

        // Key levels (4H only)
        const kl = chartData.key_levels;
        if (kl && activeTF === '4H') {
          [{ k: 'strong_support', c: '#22c55e', st: 0 }, { k: 'support', c: '#86efac', st: 2 }, { k: 'resistance', c: '#fca5a5', st: 2 }, { k: 'strong_resistance', c: '#ef4444', st: 0 }]
            .forEach(({ k, c, st }) => {
              const val = kl[k];
              if (val && val > 0) {
                const s = chart.addSeries(LineSeries, { color: c, lineWidth: 1, lineStyle: st, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
                s.setData(chartData.candles.map(cd => ({ time: cd.time, value: val })));
              }
            });
        }

        chart.timeScale().fitContent();
        const handleResize = () => { if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth }); };
        window.addEventListener('resize', handleResize);
        return () => { window.removeEventListener('resize', handleResize); disposed = true; chart.remove(); };
      } catch (e) { console.error('Chart init error:', e); }
    };

    const cleanup = initChart();
    return () => { disposed = true; cleanup?.then?.(fn => fn?.()); };
  }, [chartData, activeTF]);

  // RSI mini chart
  useEffect(() => {
    if (!chartData?.rsi_series?.length || !rsiRef.current) return;
    let disposed = false;
    const initRSI = async () => {
      const { createChart, LineSeries } = await import('lightweight-charts');
      if (disposed || !rsiRef.current) return;
      rsiRef.current.innerHTML = '';
      const chart = createChart(rsiRef.current, {
        width: rsiRef.current.clientWidth, height: 100,
        layout: { background: { color: 'transparent' }, textColor: '#6b5c52', fontFamily: "'JetBrains Mono', monospace", fontSize: 9 },
        grid: { vertLines: { color: 'rgba(212,168,83,0.03)' }, horzLines: { color: 'rgba(212,168,83,0.03)' } },
        rightPriceScale: { borderColor: 'rgba(212,168,83,0.1)', scaleMargins: { top: 0.05, bottom: 0.05 } },
        timeScale: { visible: false }, crosshair: { mode: 0 },
      });
      const rsiLine = chart.addSeries(LineSeries, { color: '#d4a853', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true });
      rsiLine.setData(chartData.rsi_series);
      const ob = chart.addSeries(LineSeries, { color: 'rgba(248,113,113,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      ob.setData(chartData.rsi_series.map(d => ({ time: d.time, value: 70 })));
      const os = chart.addSeries(LineSeries, { color: 'rgba(74,222,128,0.3)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      os.setData(chartData.rsi_series.map(d => ({ time: d.time, value: 30 })));
      chart.timeScale().fitContent();
      const handleResize = () => { if (rsiRef.current) chart.applyOptions({ width: rsiRef.current.clientWidth }); };
      window.addEventListener('resize', handleResize);
      return () => { window.removeEventListener('resize', handleResize); disposed = true; chart.remove(); };
    };
    const cleanup = initRSI();
    return () => { disposed = true; cleanup?.then?.(fn => fn?.()); };
  }, [chartData]);

  const tech = chartData?.technicals || {};
  const maKeys = Object.keys(chartData?.ma_series || {});

  return (
    <div className="glass-card rounded-2xl border border-gold-primary/10 overflow-hidden">
      {/* TF Tabs + Legend */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          {[{ key: '1D', label: 'Daily', sub: 'Tide' }, { key: '4H', label: '4H', sub: 'Wave' }, { key: '1H', label: '1H', sub: 'Ripple' }].map(tf => (
            <button key={tf.key} onClick={() => onTFChange(tf.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTF === tf.key ? 'bg-gold-primary/15 text-gold-primary border border-gold-primary/30' : 'text-text-muted hover:text-white hover:bg-white/[0.04] border border-transparent'}`}>
              {tf.label} <span className="text-[9px] opacity-60">({tf.sub})</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {maKeys.map(key => (
            <span key={key} className="flex items-center gap-1 text-[9px]">
              <span className="w-3 h-0.5 rounded inline-block" style={{ background: MA_COLORS[key] || '#888' }} />
              <span className="text-text-muted">{key.toUpperCase().replace('EMA', 'EMA ').replace('SMA', 'SMA ')}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        {chartLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-card/60 z-10">
            <div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-gold-primary/40 border-t-gold-primary rounded-full animate-spin" /><span className="text-text-muted text-sm">Loading {activeTF}...</span></div>
          </div>
        )}
        <div ref={containerRef} style={{ minHeight: 460 }} />
      </div>

      {/* RSI */}
      <div className="border-t border-white/5 px-4 py-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-text-muted font-semibold uppercase tracking-wider">RSI (14)</span>
          {tech.rsi_14 != null && (
            <span className={`text-[10px] font-bold ${tech.rsi_14 >= 70 ? 'text-red-400' : tech.rsi_14 <= 30 ? 'text-green-400' : 'text-gold-primary'}`}>
              {tech.rsi_14} {tech.rsi_14 >= 70 ? '· Overbought' : tech.rsi_14 <= 30 ? '· Oversold' : ''}
            </span>
          )}
        </div>
        <div ref={rsiRef} style={{ minHeight: 100 }} />
      </div>

      {/* Tech summary */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-white/5 overflow-x-auto text-[10px] text-text-muted">
        {tech.ema_bullish_cross != null && <span>EMA Cross: <span className={tech.ema_bullish_cross ? 'text-green-400' : 'text-red-400'}>{tech.ema_bullish_cross ? 'Bullish' : 'Bearish'}</span></span>}
        {tech.golden_cross != null && <span>Golden Cross: <span className={tech.golden_cross ? 'text-green-400' : 'text-red-400'}>{tech.golden_cross ? 'Yes' : 'No'}</span></span>}
        {tech.volume_ratio != null && <span>Vol: <span className="text-white">{tech.volume_ratio}x</span></span>}
        {tech.ema_spread_pct != null && <span>EMA Spread: <span className="text-white">{tech.ema_spread_pct}%</span></span>}
        {tech.trend && <span>Trend: <span className={tech.trend.includes('UP') ? 'text-green-400' : tech.trend.includes('DOWN') ? 'text-red-400' : 'text-yellow-400'}>{tech.trend}</span></span>}
        {tech.momentum_12h != null && <span>12h ROC: <span className={tech.momentum_12h > 0 ? 'text-green-400' : 'text-red-400'}>{tech.momentum_12h > 0 ? '+' : ''}{tech.momentum_12h}%</span></span>}
        {tech.divergence && <span>Divergence: <span className={tech.divergence === 'bullish' ? 'text-green-400' : 'text-red-400'}>{tech.divergence}</span></span>}
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// TF ALIGNMENT BADGE
// ════════════════════════════════════════

function TFAlignmentBadge({ alignment }) {
  if (!alignment) return null;
  const overall = alignment.alignment || 'mixed';
  const cfg = TF_ALIGNMENT_COLORS[overall] || TF_ALIGNMENT_COLORS.mixed;
  return (
    <div className="glass-card rounded-xl p-4 border border-gold-primary/10">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-gold-primary">Triple Screen</span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}33` }}>{cfg.icon} {cfg.label}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[{ tf: '1D', label: 'Tide', value: alignment['1D_trend'] }, { tf: '4H', label: 'Wave', value: alignment['4H_setup'] }, { tf: '1H', label: 'Ripple', value: alignment['1H_momentum'] }].map(({ tf, label, value }) => {
          const isBull = value?.toLowerCase()?.includes('bull') || value?.toLowerCase()?.includes('up');
          const isBear = value?.toLowerCase()?.includes('bear') || value?.toLowerCase()?.includes('down');
          const color = isBull ? '#4ade80' : isBear ? '#f87171' : '#fbbf24';
          return (
            <div key={tf} className="text-center p-2 rounded-lg" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
              <div className="text-[10px] text-text-muted font-medium">{tf} ({label})</div>
              <div className="text-xs font-bold mt-0.5" style={{ color }}>{value || '—'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// METRIC CARDS + FEAR GREED
// ════════════════════════════════════════

function MetricCard({ label, value, subValue, color = '#d4a853' }) {
  return (
    <div className="glass-card rounded-xl p-3 border border-gold-primary/10">
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="text-lg font-bold font-mono" style={{ color }}>{value}</div>
      {subValue && <div className="text-[10px] text-text-muted mt-0.5">{subValue}</div>}
    </div>
  );
}

function FearGreedGauge({ value }) {
  if (value == null) return null;
  const color = value <= 25 ? '#f87171' : value <= 45 ? '#f97316' : value <= 55 ? '#fbbf24' : value <= 75 ? '#a3e635' : '#4ade80';
  const label = value <= 25 ? 'Extreme Fear' : value <= 45 ? 'Fear' : value <= 55 ? 'Neutral' : value <= 75 ? 'Greed' : 'Extreme Greed';
  return (
    <div className="glass-card rounded-xl p-3 border border-gold-primary/10">
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Fear & Greed</div>
      <div className="flex items-center gap-3">
        <div className="text-2xl font-bold font-mono" style={{ color }}>{value}</div>
        <div className="flex-1"><div className="h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} /></div><div className="text-[10px] font-semibold mt-1" style={{ color }}>{label}</div></div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// KEY LEVELS BAR
// ════════════════════════════════════════

function KeyLevelsBar({ levels, currentPrice }) {
  if (!levels || !currentPrice) return null;
  const { strong_support, support, resistance, strong_resistance } = levels;
  const allLevels = [strong_support, support, currentPrice, resistance, strong_resistance].filter(Boolean);
  const min = Math.min(...allLevels) * 0.998;
  const max = Math.max(...allLevels) * 1.002;
  const range = max - min || 1;
  const pos = (v) => ((v - min) / range * 100);
  return (
    <div className="glass-card rounded-xl p-4 border border-gold-primary/10">
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-3">Key Levels</div>
      <div className="relative h-8 rounded-full bg-white/[0.03] border border-white/5">
        {strong_support > 0 && <LevelDot pos={pos(strong_support)} color="#22c55e" label={`$${(strong_support/1000).toFixed(1)}k`} />}
        {support > 0 && <LevelDot pos={pos(support)} color="#86efac" label={`$${(support/1000).toFixed(1)}k`} />}
        {resistance > 0 && <LevelDot pos={pos(resistance)} color="#fca5a5" label={`$${(resistance/1000).toFixed(1)}k`} />}
        {strong_resistance > 0 && <LevelDot pos={pos(strong_resistance)} color="#ef4444" label={`$${(strong_resistance/1000).toFixed(1)}k`} />}
        <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gold-primary border-2 border-bg-card z-10" style={{ left: `${pos(currentPrice)}%` }}>
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-gold-primary whitespace-nowrap">${(currentPrice/1000).toFixed(1)}k</div>
        </div>
      </div>
    </div>
  );
}
function LevelDot({ pos, color, label }) {
  return (<div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{ left: `${pos}%`, background: color }}><div className="absolute top-4 left-1/2 -translate-x-1/2 text-[8px] whitespace-nowrap" style={{ color }}>{label}</div></div>);
}

// ════════════════════════════════════════
// SECTION ACCORDION
// ════════════════════════════════════════

function SectionCard({ sectionKey, content, isOpen, onToggle }) {
  const config = SECTIONS[sectionKey];
  if (!config || !content) return null;
  const parseContent = (text) => {
    if (!text) return '';
    let parsed = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="text-gold-primary font-mono text-sm font-semibold">$1</span>');
    parsed = parsed.replace(/@(\w+)/g, '<a href="https://x.com/$1" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 font-semibold">@$1</a>');
    return parsed;
  };
  return (
    <div className="glass-card rounded-2xl border border-gold-primary/10 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-3"><span className="text-lg">{config.emoji}</span><span className="text-white font-semibold text-sm">{config.title}</span></div>
        <div className="flex items-center gap-2">
          {config.sources.map(src => (<a key={src} href={SOURCE_LINKS[src]} target="_blank" rel="noopener noreferrer" className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-white/[0.04] text-text-muted hover:text-gold-primary hover:bg-gold-primary/10 transition-colors" onClick={e => e.stopPropagation()}>{src}</a>))}
          <svg className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
      </button>
      {isOpen && (<div className="px-4 pb-4 border-t border-white/5"><div className="pt-3 text-text-secondary text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: parseContent(content) }} /></div>)}
    </div>
  );
}

// ════════════════════════════════════════
// REPORT TIMELINE
// ════════════════════════════════════════

function ReportTimeline({ reports, currentId, onSelect }) {
  if (!reports || reports.length <= 1) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
      {reports.map((r) => {
        const isCurrent = r.id === currentId;
        const isAnomaly = r.is_anomaly_triggered;
        const s = SENTIMENT_CONFIG[r.sentiment] || SENTIMENT_CONFIG.neutral;
        const time = new Date(r.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        return (
          <button key={r.id} onClick={() => onSelect(r)} className={`flex-shrink-0 px-3 py-2 rounded-lg text-[10px] font-medium transition-all ${isCurrent ? 'bg-gold-primary/15 text-gold-primary border border-gold-primary/30' : 'bg-white/[0.03] text-text-muted hover:bg-white/[0.06] border border-transparent'}`}>
            <div className="flex items-center gap-1">{isAnomaly && <span className="text-[8px]">⚡</span>}<span style={{ color: isCurrent ? s.color : undefined }}>{s.icon}</span><span>{time}</span></div>
          </button>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════

export default function AIArenaPage() {
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openSections, setOpenSections] = useState({ market_overview: true });
  const [activeTF, setActiveTF] = useState('4H');

  const fetchData = useCallback(async () => {
    try { setLoading(true); setError(null);
      const [latestRes, historyRes] = await Promise.all([api.get('/api/v1/ai-arena/latest'), api.get('/api/v1/ai-arena/history?limit=20')]);
      setReport(latestRes.data); setHistory(historyRes.data?.reports || []);
    } catch (err) { if (err.response?.status === 404) setError('first_report'); else setError(err.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  if (loading) return (
    <div className="space-y-4"><div className="flex items-center gap-3"><div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" /><h2 className="font-display text-2xl font-semibold text-white">AI Arena</h2></div>
      {[...Array(4)].map((_, i) => (<div key={i} className="glass-card rounded-2xl p-6 animate-pulse border border-gold-primary/10"><div className="h-4 bg-gold-primary/20 rounded w-40 mb-3" /><div className="h-20 bg-gold-primary/10 rounded" /></div>))}
    </div>
  );

  if (error === 'first_report') return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4"><div className="text-5xl mb-4">🧠</div><h2 className="text-2xl font-display font-bold text-white mb-2">AI Arena</h2><p className="text-text-muted max-w-md mb-6">First report is being generated. Multi-timeframe BTC analysis with DeepSeek R1.</p><button onClick={fetchData} className="px-6 py-3 bg-gold-primary/20 text-gold-primary rounded-xl hover:bg-gold-primary/30 transition-all font-medium">Refresh</button></div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4"><p className="text-red-400 mb-4">{error}</p><button onClick={fetchData} className="px-5 py-2.5 bg-gold-primary/20 text-gold-primary rounded-xl hover:bg-gold-primary/30 transition-all font-medium">Retry</button></div>
  );

  if (!report) return null;

  const sentimentCfg = SENTIMENT_CONFIG[report.sentiment] || SENTIMENT_CONFIG.neutral;
  const sections = report.sections || {};
  const keyLevels = report.key_levels || {};
  const liqHotspots = report.liquidation_hotspots || {};
  const alignment = report.timeframe_alignment;
  const tfSummary = report.timeframes_summary || {};

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3"><div className="w-10 lg:w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" /><div><h2 className="font-display text-xl lg:text-2xl font-semibold text-white">AI Arena</h2><p className="text-text-muted text-[10px] lg:text-xs mt-0.5">Multi-TF BTC Intelligence · DeepSeek R1{report.is_anomaly_triggered && <span className="ml-2 px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 text-[9px] font-bold">⚡ ANOMALY</span>}</p></div></div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: sentimentCfg.bg, color: sentimentCfg.color, border: `1px solid ${sentimentCfg.border}` }}>{sentimentCfg.icon} {sentimentCfg.label} · {report.confidence}%</div>
          <div className="px-3 py-2 rounded-xl text-xs font-bold bg-white/[0.04] text-text-muted border border-white/5">{report.bias_direction || 'NEUTRAL'}</div>
        </div>
      </div>

      <ReportTimeline reports={history} currentId={report.id} onSelect={(r) => setReport(r)} />

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricCard label="BTC Price" value={`$${(report.btc_price || 0).toLocaleString()}`} color="#d4a853" />
        <FearGreedGauge value={report.fear_greed} />
        <MetricCard label="RSI (4H)" value={tfSummary?.['4H']?.rsi_14 || '—'} subValue={tfSummary?.['4H']?.rsi_14 >= 70 ? 'Overbought' : tfSummary?.['4H']?.rsi_14 <= 30 ? 'Oversold' : 'Neutral'} color={tfSummary?.['4H']?.rsi_14 >= 70 ? '#f87171' : tfSummary?.['4H']?.rsi_14 <= 30 ? '#4ade80' : '#d4a853'} />
        <MetricCard label="Daily Trend" value={tfSummary?.['1D']?.trend || '—'} color={tfSummary?.['1D']?.trend?.includes('UP') ? '#4ade80' : tfSummary?.['1D']?.trend?.includes('DOWN') ? '#f87171' : '#fbbf24'} />
        <MetricCard label="Cascade Risk" value={liqHotspots.cascade_risk?.toUpperCase() || '—'} color={liqHotspots.cascade_risk === 'high' ? '#f87171' : liqHotspots.cascade_risk === 'medium' ? '#fbbf24' : '#4ade80'} />
        <MetricCard label="Generated" value={`${report.generated_in_seconds?.toFixed(0) || '?'}s`} subValue={new Date(report.timestamp).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })} />
      </div>

      {/* TF + Key Levels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TFAlignmentBadge alignment={alignment} />
        <KeyLevelsBar levels={keyLevels} currentPrice={report.btc_price} />
      </div>

      {/* Chart */}
      <PriceChart activeTF={activeTF} onTFChange={setActiveTF} />

      {/* Sections */}
      <div className="space-y-3">
        {SECTION_ORDER.map(key => (<SectionCard key={key} sectionKey={key} content={sections[key]} isOpen={!!openSections[key]} onToggle={() => toggleSection(key)} />))}
      </div>

      {/* Risk Factors */}
      {report.risk_factors?.length > 0 && (
        <div className="glass-card rounded-2xl p-4 border border-red-500/10">
          <div className="text-[10px] text-red-400 uppercase tracking-wider font-bold mb-2">Risk Factors</div>
          <div className="space-y-1.5">{report.risk_factors.map((rf, i) => (<div key={i} className="flex items-start gap-2 text-sm text-text-secondary"><span className="text-red-400/60 mt-0.5">⚠</span><span>{rf}</span></div>))}</div>
        </div>
      )}

      {/* Anomaly Info */}
      {report.is_anomaly_triggered && report.anomaly_reason && (
        <div className="glass-card rounded-2xl p-4 border border-orange-500/20">
          <div className="flex items-center gap-2 mb-2"><span className="text-orange-400">⚡</span><span className="text-[10px] text-orange-400 uppercase tracking-wider font-bold">Anomaly Triggered</span></div>
          <p className="text-sm text-text-secondary">{report.anomaly_reason}</p>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-text-muted text-[10px] py-2">{report.id} · {report.data_sources} sources · {report.is_anomaly_triggered ? '⚡ anomaly' : 'scheduled'}</div>
    </div>
  );
}
