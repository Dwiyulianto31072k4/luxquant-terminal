// src/components/AIArenaPage.jsx
// AI Arena v4 — BTC Intelligence Desk
// Full redesign: BLUF hero → Zones → Triple Screen → Chart → Pillars → Deep Analysis → Analyst Tape → What Changed → Previous Reports
import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/authApi';

// ════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════

const SENTIMENT_CONFIG = {
  bullish:  { color: '#4ade80', bg: 'rgba(74,222,128,0.06)',  border: 'rgba(74,222,128,0.15)', label: 'BULLISH',  icon: '🟢' },
  bearish:  { color: '#f87171', bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.15)', label: 'BEARISH',  icon: '🔴' },
  cautious: { color: '#fbbf24', bg: 'rgba(251,191,36,0.06)',  border: 'rgba(251,191,36,0.15)',  label: 'CAUTIOUS', icon: '🟡' },
  neutral:  { color: '#94a3b8', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.15)', label: 'NEUTRAL',  icon: '⚪' },
};

const TF_STATE_COLORS = {
  UPTREND: '#4ade80', STRONG_UPTREND: '#4ade80', BULLISH: '#4ade80',
  DOWNTREND: '#f87171', STRONG_DOWNTREND: '#f87171', BEARISH: '#f87171',
  SIDEWAYS: '#fbbf24', PULLBACK: '#fbbf24', NEUTRAL: '#fbbf24',
  OVERSOLD: '#22d3ee', OVERBOUGHT: '#f97316',
};

const MA_COLORS = {
  ema20: '#d4a853', ema21: '#d4a853', ema50: '#e87e38', ema55: '#e87e38',
  sma100: '#22d3ee', sma200: '#8b5cf6', ema200: '#8b5cf6',
};

const ZONE_COLORS = {
  demand: { bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.25)', text: '#4ade80', label: 'DEMAND ZONE' },
  fair_value: { bg: 'rgba(212,168,83,0.08)', border: 'rgba(212,168,83,0.25)', text: '#d4a853', label: 'FAIR VALUE' },
  supply: { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)', text: '#f87171', label: 'SUPPLY ZONE' },
};

const SOURCE_LINKS = {
  'Bybit': 'https://www.bybit.com/trade/usdt/BTCUSDT',
  'Coinglass': 'https://www.coinglass.com/open-interest/BTC',
  'Coinalyze': 'https://coinalyze.net/bitcoin/open-interest/',
  'BGeometrics': 'https://www.bgeometrics.com',
  'Alternative.me': 'https://alternative.me/crypto/fear-and-greed-index/',
  'Google News': 'https://news.google.com/search?q=bitcoin',
  'Farside': 'https://farside.co.uk/btc/',
  'Yahoo Finance': 'https://finance.yahoo.com/quote/BTC-USD',
};

const ALL_SOURCES = Object.keys(SOURCE_LINKS);

// ════════════════════════════════════════
// UTILITY
// ════════════════════════════════════════

function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtPrice(v) {
  if (!v || v === 0) return '—';
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
}

function parseSmartTags(text) {
  if (!text) return '';
  let parsed = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="text-gold-primary font-mono text-sm font-semibold">$1</span>');
  parsed = parsed.replace(/@(\w+)/g, '<a href="https://x.com/$1" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 font-semibold">@$1</a>');
  return parsed;
}


// ════════════════════════════════════════
// [1] HEADER
// ════════════════════════════════════════

function Header({ report, onRefresh, history, onSelectReport }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const sentimentCfg = SENTIMENT_CONFIG[report.sentiment] || SENTIMENT_CONFIG.neutral;

  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 lg:w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
        <div>
          <h2 className="font-display text-xl lg:text-2xl font-semibold text-white">AI Arena</h2>
          <p className="text-text-muted text-[10px] lg:text-xs mt-0.5">
            Multi-TF BTC Intelligence · DeepSeek R1
            {report.is_anomaly_triggered && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 text-[9px] font-bold">⚡ ANOMALY</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {/* Sentiment pill */}
        <div className="px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background: sentimentCfg.bg, color: sentimentCfg.color, border: `1px solid ${sentimentCfg.border}` }}>
          {sentimentCfg.icon} {sentimentCfg.label} · {report.confidence}%
        </div>
        {/* Bias */}
        <div className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-white/[0.04] text-text-muted border border-white/5">
          {report.bias_direction || 'NEUTRAL'}
        </div>
        {/* Generated ago */}
        <div className="text-[10px] text-text-muted">{timeAgo(report.timestamp)}</div>
        {/* Refresh */}
        <button onClick={onRefresh} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-text-muted hover:text-gold-primary transition-colors" title="Refresh">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
        {/* Previous reports dropdown */}
        {history.length > 1 && (
          <div className="relative">
            <button onClick={() => setDropdownOpen(!dropdownOpen)} className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium bg-white/[0.04] text-text-muted hover:bg-white/[0.08] border border-white/5 transition-colors flex items-center gap-1">
              Previous
              <svg className={`w-3 h-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-64 max-h-72 overflow-y-auto rounded-xl bg-bg-card border border-gold-primary/15 shadow-xl z-50">
                {history.map((r) => {
                  const s = SENTIMENT_CONFIG[r.sentiment] || SENTIMENT_CONFIG.neutral;
                  const t = new Date(r.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                  const isCurrent = r.id === report.id;
                  return (
                    <button key={r.id} onClick={() => { onSelectReport(r); setDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/[0.04] transition-colors ${isCurrent ? 'bg-gold-primary/10' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">{s.icon}</span>
                          <span className="text-[11px] text-white font-medium">{t}</span>
                          {r.is_anomaly_triggered && <span className="text-[8px] text-orange-400">⚡</span>}
                        </div>
                        <span className="text-[10px] font-mono" style={{ color: s.color }}>{s.label}</span>
                      </div>
                      <div className="text-[9px] text-text-muted mt-0.5 truncate">{r.bluf?.substring(0, 80) || r.id}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ════════════════════════════════════════
// [2] BLUF — BOTTOM LINE UP FRONT
// ════════════════════════════════════════

function BlufHero({ report }) {
  const sentimentCfg = SENTIMENT_CONFIG[report.sentiment] || SENTIMENT_CONFIG.neutral;
  const alignment = report.timeframe_alignment || {};
  const primaryBias = report.primary_bias || {};
  const whatChanged = report.what_changed;

  return (
    <div className="glass-card rounded-2xl p-5 lg:p-6 border border-gold-primary/15" style={{ background: sentimentCfg.bg }}>
      <div className="text-[10px] uppercase tracking-widest font-bold mb-3" style={{ color: sentimentCfg.color }}>
        Market Stance
      </div>

      {/* BLUF text */}
      <p className="text-white text-sm lg:text-base leading-relaxed mb-4 font-medium" dangerouslySetInnerHTML={{ __html: parseSmartTags(report.bluf || '') }} />

      {/* 3 key data points */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04]">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Bias</span>
          <span className="text-sm font-bold" style={{ color: sentimentCfg.color }}>
            {primaryBias.direction || report.bias_direction || 'NEUTRAL'} ({primaryBias.confidence || report.confidence}%)
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04]">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Alignment</span>
          <span className="text-sm font-bold text-white">
            {alignment.overall?.replace('_', ' ').toUpperCase() || 'N/A'}
            <span className="text-[10px] text-text-muted ml-1">
              ({alignment['1D']?.state?.[0] || '?'}·{alignment['4H']?.state?.[0] || '?'}·{alignment['1H']?.state?.[0] || '?'})
            </span>
          </span>
        </div>
        {whatChanged && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04]">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">Changed</span>
            <span className="text-[11px] text-text-secondary">
              {whatChanged.diffs?.filter(d => !d.unchanged).slice(0, 2).map(d => {
                if (d.metric === 'Price') return `Price ${d.delta_pct > 0 ? '+' : ''}${d.delta_pct}%`;
                if (d.metric === 'Fear & Greed') return `F&G ${d.from}→${d.to}`;
                return `${d.metric} changed`;
              }).join(' · ') || 'First report'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}


// ════════════════════════════════════════
// [3] ZONES TO WATCH
// ════════════════════════════════════════

function ZonesToWatch({ zones, currentPrice }) {
  if (!zones) return null;

  return (
    <div className="glass-card rounded-2xl p-4 lg:p-5 border border-gold-primary/10">
      <div className="text-[10px] uppercase tracking-widest font-bold text-gold-primary mb-3">Zones to Watch</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        {['demand', 'fair_value', 'supply'].map(key => {
          const zone = zones[key];
          if (!zone) return null;
          const cfg = ZONE_COLORS[key];
          return (
            <div key={key} className="rounded-xl p-3" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
              <div className="text-[9px] uppercase tracking-wider font-bold mb-1" style={{ color: cfg.text }}>{cfg.label}</div>
              <div className="text-lg font-bold font-mono text-white">
                {fmtPrice(zone.low)}–{fmtPrice(zone.high)}
              </div>
              <div className="text-[10px] text-text-muted mt-1 leading-snug">{zone.notes}</div>
            </div>
          );
        })}
      </div>
      {zones.confluence_note && (
        <div className="text-[11px] text-text-secondary italic px-1">
          {zones.confluence_note}
        </div>
      )}
    </div>
  );
}


// ════════════════════════════════════════
// [4] TRIPLE SCREEN STRIP
// ════════════════════════════════════════

function TripleScreenStrip({ alignment, tfSummary, onTFClick }) {
  if (!alignment) return null;

  const screens = [
    { tf: '1D', label: 'Tide',   data: alignment['1D'], tech: tfSummary?.['1D'] },
    { tf: '4H', label: 'Wave',   data: alignment['4H'], tech: tfSummary?.['4H'] },
    { tf: '1H', label: 'Ripple', data: alignment['1H'], tech: tfSummary?.['1H'] },
  ];

  return (
    <div className="glass-card rounded-2xl p-4 lg:p-5 border border-gold-primary/10">
      <div className="text-[10px] uppercase tracking-widest font-bold text-gold-primary mb-3">Triple Screen</div>
      <div className="grid grid-cols-3 gap-3">
        {screens.map(({ tf, label, data, tech }) => {
          const state = data?.state || 'NEUTRAL';
          const color = TF_STATE_COLORS[state] || '#fbbf24';
          const rsi = tech?.rsi_14;
          return (
            <button key={tf} onClick={() => onTFClick(tf)}
              className="text-center p-3 lg:p-4 rounded-xl transition-all hover:scale-[1.02] cursor-pointer"
              style={{ background: `${color}0A`, border: `1px solid ${color}25` }}>
              <div className="text-[10px] text-text-muted font-medium mb-1">{tf} ({label})</div>
              <div className="text-base lg:text-lg font-bold mb-1" style={{ color }}>{state}</div>
              {rsi != null && (
                <div className="text-[10px] text-text-muted">
                  RSI <span className={`font-bold ${rsi >= 70 ? 'text-red-400' : rsi <= 30 ? 'text-green-400' : 'text-gold-primary'}`}>{rsi}</span>
                </div>
              )}
              {data?.note && <div className="text-[9px] text-text-muted mt-1 leading-snug">{data.note}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}


// ════════════════════════════════════════
// [5] LIVE CHART
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

        // Zones to watch shading (horizontal price lines)
        const zones = chartData.zones_to_watch;
        if (zones) {
          const drawZone = (zone, color, opacity) => {
            if (!zone?.low || !zone?.high) return;
            // Draw as two horizontal lines (low + high)
            [zone.low, zone.high].forEach(val => {
              if (val > 0) {
                const s = chart.addSeries(LineSeries, { color, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
                s.setData(chartData.candles.map(c => ({ time: c.time, value: val })));
              }
            });
          };
          drawZone(zones.demand, '#4ade80', 0.1);
          drawZone(zones.supply, '#f87171', 0.1);
        }

        // Key levels horizontal lines
        const kl = chartData.key_levels;
        if (kl) {
          [{ k: 'strong_support', c: '#22c55e', st: 0 }, { k: 'support', c: '#86efac', st: 2 }, { k: 'resistance', c: '#fca5a5', st: 2 }, { k: 'strong_resistance', c: '#ef4444', st: 0 }]
            .forEach(({ k, c, st }) => {
              const val = kl[k];
              if (val && val > 0) {
                const s = chart.addSeries(LineSeries, { color: c, lineWidth: 1, lineStyle: st, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
                s.setData(chartData.candles.map(cd => ({ time: cd.time, value: val })));
              }
            });
        }

        // Liquidation levels
        const liq = chartData.liquidation_levels;
        if (liq) {
          if (liq.nearest_long_cluster) {
            const s = chart.addSeries(LineSeries, { color: '#f87171', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, title: 'Liq Long' });
            s.setData(chartData.candles.map(c => ({ time: c.time, value: liq.nearest_long_cluster })));
          }
          if (liq.nearest_short_cluster) {
            const s = chart.addSeries(LineSeries, { color: '#4ade80', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, title: 'Liq Short' });
            s.setData(chartData.candles.map(c => ({ time: c.time, value: liq.nearest_short_cluster })));
          }
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

      {/* Tech summary strip */}
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
// [6] THREE PILLARS
// ════════════════════════════════════════

function ThreePillars({ pillars }) {
  if (!pillars) return null;

  const items = [
    { key: 'trend', icon: '📈', label: 'Trend', color: '#4ade80' },
    { key: 'flow',  icon: '💧', label: 'Flow',  color: '#22d3ee' },
    { key: 'risk',  icon: '⚠️', label: 'Risk',  color: '#f87171' },
  ];

  return (
    <div className="glass-card rounded-2xl p-4 lg:p-5 border border-gold-primary/10">
      <div className="text-[10px] uppercase tracking-widest font-bold text-gold-primary mb-3">The Three Pillars</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {items.map(({ key, icon, label, color }) => {
          const content = pillars[key];
          if (!content) return null;
          return (
            <div key={key} className="rounded-xl p-4" style={{ background: `${color}06`, border: `1px solid ${color}15` }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{icon}</span>
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>{label}</span>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed" dangerouslySetInnerHTML={{ __html: parseSmartTags(content) }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ════════════════════════════════════════
// [7] DEEP ANALYSIS (5 sections, all open)
// ════════════════════════════════════════

function DeepAnalysis({ analysis, sections }) {
  // v4 uses deep_analysis{}, fallback to sections{} for v3 reports
  const content = analysis || {};
  const fallback = sections || {};

  const items = [
    { key: 'price_structure',       fallbackKey: 'market_overview',       icon: '📊', label: 'Price Structure' },
    { key: 'derivatives_liquidity', fallbackKey: 'derivatives_liquidity', icon: '⚡', label: 'Derivatives & Liquidity' },
    { key: 'onchain_sentiment',     fallbackKey: 'sentiment_onchain',     icon: '🔗', label: 'On-Chain & Sentiment' },
    { key: 'institutional_macro',   fallbackKey: null,                    icon: '🏦', label: 'Institutional & Macro' },
    { key: 'macro_catalysts',       fallbackKey: 'catalysts_stance',      icon: '🌍', label: 'News Catalysts' },
  ];

  const hasContent = items.some(i => content[i.key] || fallback[i.fallbackKey]);
  if (!hasContent) return null;

  return (
    <div className="glass-card rounded-2xl p-4 lg:p-5 border border-gold-primary/10">
      <div className="text-[10px] uppercase tracking-widest font-bold text-gold-primary mb-4">Deep Analysis</div>
      <div className="space-y-5">
        {items.map(({ key, fallbackKey, icon, label }) => {
          const text = content[key] || (fallbackKey ? fallback[fallbackKey] : null);
          if (!text) return null;
          return (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">{icon}</span>
                <span className="text-xs font-bold text-white uppercase tracking-wider">{label}</span>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed pl-6" dangerouslySetInnerHTML={{ __html: parseSmartTags(text) }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ════════════════════════════════════════
// [8] INSTITUTIONAL FLOW RADAR (v5)
// ════════════════════════════════════════

function InstitutionalFlowRadar({ flow, etfLive }) {
  // `flow` is the AI-analyzed snapshot from report.institutional_flow
  // `etfLive` is the live data from /etf-flows endpoint (optional - for fresh chart data)
  if (!flow) return null;

  const total = flow.etf_flow_today_usd_m;
  const isInflow = flow.streak_direction === 'inflow';
  const streakDays = flow.streak_days || 0;
  const cum7d = flow.cumulative_7d_usd_m;
  const cbPct = flow.coinbase_premium_pct;
  const cbSig = flow.coinbase_premium_signal;

  // Color map for premium signal
  const cbSignalColor = {
    'strong_buying': '#22c55e',
    'mild_buying': '#86efac',
    'neutral': '#94a3b8',
    'mild_selling': '#fca5a5',
    'strong_selling': '#ef4444',
  }[cbSig] || '#94a3b8';

  const cbSignalLabel = (cbSig || 'neutral').replace(/_/g, ' ');

  // Mini chart bars from etfLive history (last 7 days), fallback to top_contributors visual
  const history7d = etfLive?.flows?.history_7d || [];
  const maxAbs = history7d.length
    ? Math.max(...history7d.map(d => Math.abs(d.total || 0)))
    : 0;

  return (
    <div className="glass-card rounded-2xl p-4 lg:p-5 border border-gold-primary/10">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest font-bold text-gold-primary">
          🏦 Institutional Flow Radar
        </div>
        <div className="text-[10px] text-text-muted">Spot BTC ETFs · Coinbase Premium</div>
      </div>

      {/* Top metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="rounded-xl p-3 bg-white/[0.02] border border-white/5">
          <div className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Today's Net Flow</div>
          <div className={`text-lg font-bold ${total >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {total !== null && total !== undefined ? `${total >= 0 ? '+' : ''}$${total.toFixed(1)}M` : 'N/A'}
          </div>
        </div>
        <div className="rounded-xl p-3 bg-white/[0.02] border border-white/5">
          <div className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Streak</div>
          <div className={`text-lg font-bold ${isInflow ? 'text-green-400' : 'text-red-400'}`}>
            {streakDays > 0 ? `${streakDays}d ${isInflow ? '↑' : '↓'}` : '—'}
          </div>
          <div className="text-[9px] text-text-muted">{flow.streak_direction || 'none'}</div>
        </div>
        <div className="rounded-xl p-3 bg-white/[0.02] border border-white/5">
          <div className="text-[9px] text-text-muted uppercase tracking-wider mb-1">7d Cumulative</div>
          <div className={`text-lg font-bold ${cum7d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {cum7d !== null && cum7d !== undefined ? `${cum7d >= 0 ? '+' : ''}$${cum7d.toFixed(0)}M` : 'N/A'}
          </div>
        </div>
        <div className="rounded-xl p-3 bg-white/[0.02] border border-white/5">
          <div className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Coinbase Premium</div>
          <div className="text-lg font-bold" style={{ color: cbSignalColor }}>
            {cbPct !== null && cbPct !== undefined ? `${cbPct >= 0 ? '+' : ''}${cbPct.toFixed(3)}%` : 'N/A'}
          </div>
          <div className="text-[9px] capitalize" style={{ color: cbSignalColor }}>{cbSignalLabel}</div>
        </div>
      </div>

      {/* 7-day mini chart */}
      {history7d.length > 0 && maxAbs > 0 && (
        <div>
          <div className="text-[9px] text-text-muted uppercase tracking-wider mb-2">Last 7 Days</div>
          <div className="flex items-end justify-between gap-1 h-20">
            {history7d.map((d, i) => {
              const v = d.total || 0;
              const heightPct = (Math.abs(v) / maxAbs) * 90;
              const isPos = v >= 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end" style={{ height: '60px' }}>
                    {isPos && (
                      <div
                        className="w-full rounded-t-sm bg-gradient-to-t from-green-500 to-green-400"
                        style={{ height: `${heightPct}%` }}
                        title={`${d.date}: +$${v.toFixed(1)}M`}
                      />
                    )}
                    {!isPos && (
                      <div
                        className="w-full rounded-b-sm bg-gradient-to-b from-red-500 to-red-400"
                        style={{ height: `${heightPct}%` }}
                        title={`${d.date}: -$${Math.abs(v).toFixed(1)}M`}
                      />
                    )}
                  </div>
                  <div className="text-[8px] text-text-muted">{(d.date || '').slice(5)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top contributors */}
      {flow.top_contributors?.length > 0 && (
        <div className="mt-4">
          <div className="text-[9px] text-text-muted uppercase tracking-wider mb-2">Top Contributors</div>
          <div className="flex flex-wrap gap-2">
            {flow.top_contributors.map((tc, i) => {
              const v = tc.flow_usd_m;
              const isPos = v >= 0;
              return (
                <div key={i} className="px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{tc.fund}</span>
                  <span className={`text-[11px] font-medium ${isPos ? 'text-green-400' : 'text-red-400'}`}>
                    {isPos ? '+' : ''}${v.toFixed(1)}M
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Interpretation */}
      {flow.interpretation && (
        <p className="text-[12px] text-text-secondary leading-relaxed mt-4 italic border-l-2 border-gold-primary/30 pl-3">
          {flow.interpretation}
        </p>
      )}
    </div>
  );
}


// ════════════════════════════════════════
// [9] MACRO PULSE (v5)
// ════════════════════════════════════════

function MacroPulse({ macro, macroLive }) {
  if (!macro) return null;

  const regime = macro.regime || 'unknown';
  const regimeColor = {
    'risk_on':  '#4ade80',
    'risk_off': '#f87171',
    'mixed':    '#fbbf24',
  }[regime] || '#94a3b8';

  const regimeLabel = regime.replace(/_/g, ' ');

  // Build asset rows from macro snapshot + live data if available
  const assetsLive = macroLive?.assets || {};

  const rows = [
    { key: 'spx',   label: 'S&P 500',     deltaKey: 'spx_change_1d_pct',    corrKey: 'btc_spx_correlation_30d' },
    { key: 'dxy',   label: 'Dollar (DXY)', deltaKey: 'dxy_change_1d_pct',    corrKey: 'btc_dxy_correlation_30d' },
    { key: 'gold',  label: 'Gold',        deltaKey: 'gold_change_1d_pct',   corrKey: null },
    { key: 'us10y', label: 'US 10Y Yield', deltaKey: 'us10y_change_1d_pct', corrKey: null },
  ];

  return (
    <div className="glass-card rounded-2xl p-4 lg:p-5 border border-gold-primary/10">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest font-bold text-gold-primary">
          🌐 Macro Pulse
        </div>
        <div className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider" style={{
          color: regimeColor,
          backgroundColor: `${regimeColor}15`,
          border: `1px solid ${regimeColor}40`,
        }}>
          {regimeLabel}
        </div>
      </div>

      {/* Macro asset grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {rows.map(row => {
          const delta = macro[row.deltaKey];
          const corr = row.corrKey ? macro[row.corrKey] : null;
          const live = assetsLive[row.key] || {};
          const current = live.current;
          const isUp = (delta || 0) > 0;
          return (
            <div key={row.key} className="rounded-xl p-3 bg-white/[0.02] border border-white/5">
              <div className="text-[9px] text-text-muted uppercase tracking-wider mb-1">{row.label}</div>
              {current && (
                <div className="text-sm text-white font-medium">
                  {row.key === 'us10y' ? `${current.toFixed(2)}%` : current.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              )}
              <div className={`text-base font-bold ${isUp ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-text-muted'}`}>
                {delta !== null && delta !== undefined ? `${isUp ? '+' : ''}${delta.toFixed(2)}%` : '—'}
                <span className="text-[9px] text-text-muted font-normal ml-1">1D</span>
              </div>
              {corr !== null && corr !== undefined && (
                <div className="text-[10px] text-text-muted mt-1">
                  Corr 30D: <span className={Math.abs(corr) >= 0.4 ? (corr > 0 ? 'text-green-400/80' : 'text-red-400/80') : 'text-text-muted'}>
                    {corr >= 0 ? '+' : ''}{corr.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Interpretation */}
      {macro.interpretation && (
        <p className="text-[12px] text-text-secondary leading-relaxed mt-4 italic border-l-2 border-gold-primary/30 pl-3">
          {macro.interpretation}
        </p>
      )}
    </div>
  );
}


// ════════════════════════════════════════
// [9] WHAT CHANGED
// ════════════════════════════════════════

function WhatChanged({ data }) {
  if (!data || !data.diffs?.length) return null;

  return (
    <div className="glass-card rounded-2xl p-4 border border-gold-primary/10">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest font-bold text-gold-primary">What Changed</div>
        <div className="text-[10px] text-text-muted">vs {data.vs_previous_id} · {data.hours_ago ? `${data.hours_ago}h ago` : ''}</div>
      </div>
      <div className="flex flex-wrap gap-3">
        {data.diffs.map((d, i) => {
          if (d.unchanged) return null;
          const isPositive = typeof d.delta_pct === 'number' ? d.delta_pct > 0 : false;
          return (
            <div key={i} className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
              <div className="text-[9px] text-text-muted uppercase tracking-wider">{d.metric}</div>
              <div className="text-xs text-white font-medium mt-0.5">
                {d.from_fmt || String(d.from)} → {d.to_fmt || String(d.to)}
                {typeof d.delta_pct === 'number' && (
                  <span className={`ml-1 text-[10px] font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    ({isPositive ? '+' : ''}{d.delta_pct}%)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ════════════════════════════════════════
// [10] METRICS ROW (BTC Price, F&G, Key Stats)
// ════════════════════════════════════════

function MetricsRow({ report }) {
  const tfSummary = report.timeframes_summary || {};
  const liq = report.liquidation_hotspots || {};

  const items = [
    { label: 'BTC Price', value: `$${(report.btc_price || 0).toLocaleString()}`, color: '#d4a853' },
    { label: 'Fear & Greed', value: report.fear_greed ?? '—', color: report.fear_greed <= 25 ? '#f87171' : report.fear_greed <= 45 ? '#f97316' : report.fear_greed <= 55 ? '#fbbf24' : '#4ade80' },
    { label: 'RSI (4H)', value: tfSummary?.['4H']?.rsi_14 || '—', color: (tfSummary?.['4H']?.rsi_14 >= 70) ? '#f87171' : (tfSummary?.['4H']?.rsi_14 <= 30) ? '#4ade80' : '#d4a853' },
    { label: 'Cascade Risk', value: (liq.cascade_risk || '—').toUpperCase(), color: liq.cascade_risk === 'high' ? '#f87171' : liq.cascade_risk === 'medium' ? '#fbbf24' : '#4ade80' },
    { label: 'Sources', value: report.data_sources || '—', color: '#94a3b8' },
    { label: 'Generated', value: `${report.generated_in_seconds?.toFixed(0) || '?'}s`, color: '#94a3b8' },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
      {items.map(({ label, value, color }) => (
        <div key={label} className="glass-card rounded-xl p-2.5 border border-gold-primary/10">
          <div className="text-[9px] text-text-muted uppercase tracking-wider">{label}</div>
          <div className="text-base font-bold font-mono mt-0.5" style={{ color }}>{value}</div>
        </div>
      ))}
    </div>
  );
}


// ════════════════════════════════════════
// RISK FACTORS
// ════════════════════════════════════════

function RiskFactors({ factors }) {
  if (!factors?.length) return null;
  return (
    <div className="glass-card rounded-2xl p-4 border border-red-500/10">
      <div className="text-[10px] text-red-400 uppercase tracking-widest font-bold mb-2">Risk Factors</div>
      <div className="space-y-1.5">
        {factors.map((rf, i) => (
          <div key={i} className="flex items-start gap-2 text-sm text-text-secondary">
            <span className="text-red-400/60 mt-0.5 text-xs">⚠</span>
            <span>{rf}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


// ════════════════════════════════════════
// DATA SOURCES FOOTER
// ════════════════════════════════════════

function SourcesFooter({ report }) {
  return (
    <div className="text-center py-3 space-y-1">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {ALL_SOURCES.map(src => (
          <a key={src} href={SOURCE_LINKS[src]} target="_blank" rel="noopener noreferrer"
            className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-white/[0.03] text-text-muted hover:text-gold-primary hover:bg-gold-primary/10 transition-colors">
            {src}
          </a>
        ))}
      </div>
      <div className="text-text-muted text-[9px]">
        {report.id} · {report.data_sources} sources · {report.is_anomaly_triggered ? '⚡ anomaly' : 'scheduled'} · {new Date(report.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>
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
  const [activeTF, setActiveTF] = useState('4H');
  // v5: live ETF + macro data (fresh from public sources, not just AI snapshot)
  const [etfLive, setEtfLive] = useState(null);
  const [macroLive, setMacroLive] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      // Core report fetch (must succeed)
      const [latestRes, historyRes] = await Promise.all([
        api.get('/api/v1/ai-arena/latest'),
        api.get('/api/v1/ai-arena/history?limit=20'),
      ]);
      setReport(latestRes.data);
      setHistory(historyRes.data?.reports || []);

      // v5: Fetch live ETF + macro in background, non-blocking. Failure = silent.
      api.get('/api/v1/ai-arena/etf-flows').then(r => setEtfLive(r.data)).catch(() => {});
      api.get('/api/v1/ai-arena/macro-pulse').then(r => setMacroLive(r.data)).catch(() => {});
    } catch (err) {
      if (err.response?.status === 404) setError('first_report');
      else setError(err.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
        <h2 className="font-display text-2xl font-semibold text-white">AI Arena</h2>
      </div>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="glass-card rounded-2xl p-6 animate-pulse border border-gold-primary/10">
          <div className="h-4 bg-gold-primary/20 rounded w-40 mb-3" />
          <div className="h-20 bg-gold-primary/10 rounded" />
        </div>
      ))}
    </div>
  );

  if (error === 'first_report') return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="text-5xl mb-4">🧠</div>
      <h2 className="text-2xl font-display font-bold text-white mb-2">AI Arena</h2>
      <p className="text-text-muted max-w-md mb-6">First report is being generated. Multi-timeframe BTC analysis with DeepSeek R1.</p>
      <button onClick={fetchData} className="px-6 py-3 bg-gold-primary/20 text-gold-primary rounded-xl hover:bg-gold-primary/30 transition-all font-medium">Refresh</button>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <p className="text-red-400 mb-4">{error}</p>
      <button onClick={fetchData} className="px-5 py-2.5 bg-gold-primary/20 text-gold-primary rounded-xl hover:bg-gold-primary/30 transition-all font-medium">Retry</button>
    </div>
  );

  if (!report) return null;

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* [1] Header */}
      <Header report={report} onRefresh={fetchData} history={history} onSelectReport={setReport} />

      {/* [2] BLUF Hero */}
      <BlufHero report={report} />

      {/* Metrics Row */}
      <MetricsRow report={report} />

      {/* [3] Zones to Watch */}
      <ZonesToWatch zones={report.zones_to_watch} currentPrice={report.btc_price} />

      {/* [4] Triple Screen Strip */}
      <TripleScreenStrip
        alignment={report.timeframe_alignment}
        tfSummary={report.timeframes_summary}
        onTFClick={setActiveTF}
      />

      {/* [5] Live Chart */}
      <PriceChart activeTF={activeTF} onTFChange={setActiveTF} />

      {/* [6] Three Pillars */}
      <ThreePillars pillars={report.three_pillars} />

      {/* [7] Deep Analysis */}
      <DeepAnalysis analysis={report.deep_analysis} sections={report.sections} />

      {/* [8] Institutional Flow Radar (v5 — replaces Analyst Tape) */}
      <InstitutionalFlowRadar flow={report.institutional_flow} etfLive={etfLive} />

      {/* [8b] Macro Pulse (v5 NEW) */}
      <MacroPulse macro={report.macro_pulse} macroLive={macroLive} />

      {/* [9] What Changed */}
      <WhatChanged data={report.what_changed} />

      {/* Risk Factors */}
      <RiskFactors factors={report.risk_factors} />

      {/* Anomaly Info */}
      {report.is_anomaly_triggered && report.anomaly_reason && (
        <div className="glass-card rounded-2xl p-4 border border-orange-500/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-orange-400">⚡</span>
            <span className="text-[10px] text-orange-400 uppercase tracking-widest font-bold">Anomaly Triggered</span>
          </div>
          <p className="text-sm text-text-secondary">{report.anomaly_reason}</p>
        </div>
      )}

      {/* [10] Sources Footer */}
      <SourcesFooter report={report} />
    </div>
  );
}
