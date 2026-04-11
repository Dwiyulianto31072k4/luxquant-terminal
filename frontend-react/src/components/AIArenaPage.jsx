// src/components/AIArenaPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/authApi';

// ════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════

const SECTIONS = {
  market_overview:       { title: 'Market Overview',           emoji: '📊', priority: 1, sources: ['Bybit', 'BGeometrics'] },
  derivatives_liquidity: { title: 'Derivatives & Liquidity',   emoji: '⚡', priority: 2, sources: ['Coinglass', 'Coinalyze', 'Bybit'] },
  sentiment_onchain:     { title: 'Sentiment & On-Chain',      emoji: '🔗', priority: 3, sources: ['Alternative.me', 'BGeometrics'] },
  catalysts_stance:      { title: 'Catalysts & Stance',        emoji: '🏁', priority: 4, sources: ['Google News', 'X (Twitter)'] },
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

// ════════════════════════════════════════
// CHART — Lightweight Charts (TradingView)
// ════════════════════════════════════════

function PriceChart({ chartData }) {
  const containerRef = useRef(null);

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
          height: 420,
          layout: {
            background: { color: 'transparent' },
            textColor: '#6b5c52',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
          },
          grid: {
            vertLines: { color: 'rgba(212,168,83,0.04)' },
            horzLines: { color: 'rgba(212,168,83,0.04)' },
          },
          crosshair: {
            mode: 0,
            vertLine: { color: 'rgba(212,168,83,0.3)', width: 1, style: 2 },
            horzLine: { color: 'rgba(212,168,83,0.3)', width: 1, style: 2 },
          },
          rightPriceScale: {
            borderColor: 'rgba(212,168,83,0.1)',
            scaleMargins: { top: 0.1, bottom: 0.2 },
          },
          timeScale: {
            borderColor: 'rgba(212,168,83,0.1)',
            timeVisible: true,
            secondsVisible: false,
          },
        });

        // Candlestick
        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#4ade80',
          downColor: '#f87171',
          borderUpColor: '#4ade80',
          borderDownColor: '#f87171',
          wickUpColor: '#4ade80',
          wickDownColor: '#f87171',
        });
        candleSeries.setData(chartData.candles);

        // Volume
        const volSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'vol',
        });
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
        volSeries.setData(chartData.volumes);

        const tech = chartData.technicals || {};

        // EMA 20 — solid gold (short-term signal)
        if (tech.ema_20 && chartData.candles.length > 20) {
          const ema20Series = chart.addSeries(LineSeries, {
            color: '#d4a853',
            lineWidth: 1.5,
            lineStyle: 0,
            title: 'EMA 20',
          });
          // Approximate: use last N candle closes to compute EMA line
          ema20Series.setData(computeEMALine(chartData.candles, 20));
        }

        // EMA 50 — solid blue (medium-term signal)
        if (tech.ema_50 && chartData.candles.length > 50) {
          const ema50Series = chart.addSeries(LineSeries, {
            color: '#60a5fa',
            lineWidth: 1.5,
            lineStyle: 0,
            title: 'EMA 50',
          });
          ema50Series.setData(computeEMALine(chartData.candles, 50));
        }

        // SMA 100 — dashed teal (long-term reference)
        if (tech.sma_100 && chartData.candles.length > 100) {
          const sma100Series = chart.addSeries(LineSeries, {
            color: '#2dd4bf',
            lineWidth: 1,
            lineStyle: 2,
            title: 'SMA 100',
          });
          sma100Series.setData(computeSMALine(chartData.candles, 100));
        }

        // SMA 200 — dashed purple (institutional reference)
        if (tech.sma_200 && chartData.candles.length > 200) {
          const sma200Series = chart.addSeries(LineSeries, {
            color: '#a78bfa',
            lineWidth: 1,
            lineStyle: 2,
            title: 'SMA 200',
          });
          sma200Series.setData(computeSMALine(chartData.candles, 200));
        }

        // Liquidation level lines
        const liq = chartData.liquidation_levels || {};
        if (liq.peak_long_liq && liq.peak_long_liq > 0) {
          candleSeries.createPriceLine({
            price: liq.peak_long_liq,
            color: 'rgba(248,113,113,0.5)',
            lineWidth: 1,
            lineStyle: 1,
            axisLabelVisible: true,
            title: `Long Liq ≈$${(liq.peak_long_liq/1000).toFixed(1)}k`,
          });
        }
        if (liq.peak_short_liq && liq.peak_short_liq > 0) {
          candleSeries.createPriceLine({
            price: liq.peak_short_liq,
            color: 'rgba(74,222,128,0.5)',
            lineWidth: 1,
            lineStyle: 1,
            axisLabelVisible: true,
            title: `Short Liq ≈$${(liq.peak_short_liq/1000).toFixed(1)}k`,
          });
        }

        chart.timeScale().fitContent();

        const handleResize = () => chart.applyOptions({ width: containerRef.current?.clientWidth || 600 });
        window.addEventListener('resize', handleResize);

        return () => {
          disposed = true;
          window.removeEventListener('resize', handleResize);
          chart.remove();
        };
      } catch (err) {
        console.error('Chart init failed:', err);
      }
    };

    initChart();
    return () => { disposed = true; };
  }, [chartData]);

  return (
    <div ref={containerRef} style={{
      width: '100%', height: 420, borderRadius: 12,
      border: '1px solid rgba(212,168,83,0.08)',
      background: 'rgba(15,12,8,0.4)',
    }} />
  );
}

// ════════════════════════════════════════
// MA LINE COMPUTATION (for chart overlay)
// ════════════════════════════════════════

function computeEMALine(candles, period) {
  if (candles.length < period) return [];
  const closes = candles.map(c => c.close);
  const multiplier = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result = [];
  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
    result.push({ time: candles[i].time, value: Math.round(ema * 10) / 10 });
  }
  return result;
}

function computeSMALine(candles, period) {
  if (candles.length < period) return [];
  const closes = candles.map(c => c.close);
  const result = [];
  for (let i = period - 1; i < closes.length; i++) {
    const sum = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result.push({ time: candles[i].time, value: Math.round((sum / period) * 10) / 10 });
  }
  return result;
}

// ════════════════════════════════════════
// SMART TAG PARSER
// ════════════════════════════════════════

function parseSmartTags(text) {
  if (!text) return null;
  const parts = [];
  let lastIndex = 0;
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`t${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    const value = match[1];
    const ref = match[2];
    if (ref.startsWith('http')) {
      parts.push(
        <a key={`l${match.index}`} href={ref} target="_blank" rel="noopener noreferrer"
           style={{ color: '#d4a853', textDecoration: 'underline', textDecorationColor: 'rgba(212,168,83,0.3)' }}>
          {value}
        </a>
      );
    } else {
      parts.push(
        <span key={`m${match.index}`} style={{
          color: '#d4a853', fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.9em', fontWeight: 600,
          background: 'rgba(212,168,83,0.08)', padding: '1px 5px', borderRadius: 4,
        }}>{value}</span>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(<span key="end">{text.slice(lastIndex)}</span>);
  return parts.length > 0 ? parts : text;
}

// ════════════════════════════════════════
// SOURCE BADGE
// ════════════════════════════════════════

function SourceBadges({ sources }) {
  if (!sources?.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, paddingTop: 8,
                  borderTop: '1px solid rgba(212,168,83,0.06)' }}>
      <span style={{ fontSize: 10, color: '#6b5c52', marginRight: 2 }}>📡</span>
      {sources.map(s => (
        <a key={s} href={SOURCE_LINKS[s] || '#'} target="_blank" rel="noopener noreferrer"
           style={{
             fontSize: 10, color: '#8a7c6e', textDecoration: 'none',
             background: 'rgba(212,168,83,0.04)', padding: '2px 7px', borderRadius: 10,
             border: '1px solid rgba(212,168,83,0.08)',
             transition: 'all 0.2s',
           }}
           onMouseEnter={e => { e.target.style.color = '#d4a853'; e.target.style.borderColor = 'rgba(212,168,83,0.2)'; }}
           onMouseLeave={e => { e.target.style.color = '#8a7c6e'; e.target.style.borderColor = 'rgba(212,168,83,0.08)'; }}
        >{s}</a>
      ))}
    </div>
  );
}

// ════════════════════════════════════════
// REPORT SECTION (Expandable)
// ════════════════════════════════════════

function ReportSection({ sectionKey, content, isOpen, onToggle }) {
  const cfg = SECTIONS[sectionKey];
  if (!cfg || !content) return null;

  return (
    <div style={{
      background: isOpen ? 'rgba(212,168,83,0.03)' : 'transparent',
      borderRadius: 12, border: '1px solid rgba(212,168,83,0.08)',
      transition: 'all 0.3s ease', marginBottom: 8,
    }}>
      <button onClick={onToggle} style={{
        width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10,
        background: 'none', border: 'none', cursor: 'pointer', color: '#c4b8a8',
        fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14, fontWeight: 600,
        textAlign: 'left',
      }}>
        <span style={{ fontSize: 16 }}>{cfg.emoji}</span>
        <span style={{ flex: 1 }}>{cfg.title}</span>
        <span style={{
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s', fontSize: 12, opacity: 0.5,
        }}>▼</span>
      </button>
      {isOpen && (
        <div style={{
          padding: '0 18px 16px 18px',
          lineHeight: 1.8, color: '#a89b8c',
          fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13.5,
        }}>
          {parseSmartTags(content)}
          <SourceBadges sources={cfg.sources} />
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════
// METRIC CARD
// ════════════════════════════════════════

function MetricCard({ label, value, sub, color, estimated }) {
  return (
    <div style={{
      background: 'rgba(212,168,83,0.03)', borderRadius: 10,
      border: '1px solid rgba(212,168,83,0.08)', padding: '12px 14px',
      minWidth: 130, flex: '1 1 130px',
    }}>
      <div style={{ fontSize: 10, color: '#6b5c52', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        {label}
        {estimated && <span style={{ color: '#fbbf24', marginLeft: 4, fontSize: 9 }}>⚠ EST</span>}
      </div>
      <div style={{
        fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
        color: color || '#d4a853',
      }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#6b5c52', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ════════════════════════════════════════
// FEAR & GREED GAUGE (SVG)
// ════════════════════════════════════════

function FearGreedGauge({ value, classification }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const angle = -90 + (v / 100) * 180;
  const color = v <= 25 ? '#f87171' : v <= 45 ? '#fb923c' : v <= 55 ? '#fbbf24' : v <= 75 ? '#a3e635' : '#4ade80';

  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox="0 0 200 120" style={{ width: 160, height: 100 }}>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(212,168,83,0.1)" strokeWidth="12" strokeLinecap="round" />
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
              strokeDasharray={`${v * 2.51} 251`} />
        <line x1="100" y1="100" x2={100 + 60 * Math.cos((angle * Math.PI) / 180)}
              y2={100 + 60 * Math.sin((angle * Math.PI) / 180)}
              stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="100" cy="100" r="4" fill={color} />
        <text x="100" y="88" textAnchor="middle" fill={color} fontSize="22" fontWeight="700"
              fontFamily="'JetBrains Mono', monospace">{v}</text>
      </svg>
      <div style={{ fontSize: 11, color: color, fontWeight: 600, marginTop: -8 }}>
        {classification || (v <= 25 ? 'Extreme Fear' : v <= 45 ? 'Fear' : v <= 55 ? 'Neutral' : v <= 75 ? 'Greed' : 'Extreme Greed')}
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// CHART LEGEND
// ════════════════════════════════════════

function ChartLegend() {
  const items = [
    { label: 'EMA 20', color: '#d4a853', style: 'solid' },
    { label: 'EMA 50', color: '#60a5fa', style: 'solid' },
    { label: 'SMA 100', color: '#2dd4bf', style: 'dashed' },
    { label: 'SMA 200', color: '#a78bfa', style: 'dashed' },
  ];
  return (
    <div style={{ display: 'flex', gap: 14, padding: '8px 0', flexWrap: 'wrap' }}>
      {items.map(i => (
        <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 18, height: 0, borderTop: `2px ${i.style} ${i.color}`,
          }} />
          <span style={{ fontSize: 10, color: '#6b5c52' }}>{i.label}</span>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ width: 18, height: 0, borderTop: '2px dashed rgba(248,113,113,0.5)' }} />
        <span style={{ fontSize: 10, color: '#6b5c52' }}>Liq levels (est.)</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════

export default function AIArenaPage() {
  const [report, setReport] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openSections, setOpenSections] = useState({ market_overview: true });
  const [generating, setGenerating] = useState(false);

  // Fetch report
  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/v1/ai-arena/latest');
      setReport(res.data);
      setError(null);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('first_run');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch chart data
  const fetchChartData = useCallback(async () => {
    try {
      setChartLoading(true);
      const res = await api.get('/api/v1/ai-arena/chart-data');
      setChartData(res.data);
    } catch (err) {
      console.error('Chart data fetch failed:', err);
    } finally {
      setChartLoading(false);
    }
  }, []);

  // Trigger report generation
  const triggerGeneration = useCallback(async () => {
    try {
      setGenerating(true);
      await api.post('/api/v1/ai-arena/run');
      await fetchReport();
    } catch (err) {
      console.error('Report generation failed:', err);
    } finally {
      setGenerating(false);
    }
  }, [fetchReport]);

  useEffect(() => {
    fetchReport();
    fetchChartData();
    // Refresh chart every 5 min
    const interval = setInterval(fetchChartData, 300000);
    return () => clearInterval(interval);
  }, [fetchReport, fetchChartData]);

  const toggleSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div style={styles.page}>
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#6b5c52' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18 }}>Loading AI Arena...</div>
        </div>
      </div>
    );
  }

  // ── First run / no report ──
  if (error === 'first_run' || (!report && !error)) {
    return (
      <div style={styles.page}>
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🧠</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: '#c4b8a8', marginBottom: 8 }}>
            AI Arena — First Report
          </h2>
          <p style={{ color: '#6b5c52', fontSize: 13, marginBottom: 24 }}>
            No report generated yet. Click below to trigger the first analysis.
            <br/>This takes ~2 minutes (gather data → compress → DeepSeek analysis).
          </p>
          <button onClick={triggerGeneration} disabled={generating} style={{
            background: generating ? 'rgba(212,168,83,0.1)' : 'rgba(212,168,83,0.15)',
            color: '#d4a853', border: '1px solid rgba(212,168,83,0.3)',
            padding: '10px 28px', borderRadius: 8, cursor: generating ? 'wait' : 'pointer',
            fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, fontWeight: 600,
          }}>
            {generating ? '⏳ Generating...' : '🚀 Generate First Report'}
          </button>
        </div>
        {/* Still show chart even without report */}
        {chartData && (
          <div style={{ marginTop: 20 }}>
            <ChartLegend />
            <PriceChart chartData={chartData} />
          </div>
        )}
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div style={styles.page}>
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#f87171' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
          <div>Error: {error}</div>
        </div>
      </div>
    );
  }

  // ── Main report view ──
  const sent = SENTIMENT_CONFIG[report.sentiment] || SENTIMENT_CONFIG.neutral;
  const tech = chartData?.technicals || {};
  const fg = report.fear_greed || chartData?.fear_greed?.value;
  const fgClass = chartData?.fear_greed?.classification || '';
  const liq = chartData?.liquidation_levels || {};
  const oiData = chartData?.oi || {};

  return (
    <div style={styles.page}>

      {/* ══ HEADER: Sentiment + Confidence ══ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: sent.bg, color: sent.color, border: `1px solid ${sent.border}`,
            padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {sent.icon} {sent.label}
          </span>
          {report.bias_direction && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: '#8a7c6e',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              BIAS: {report.bias_direction}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#6b5c52' }}>Confidence</span>
          <div style={{
            width: 80, height: 6, borderRadius: 3,
            background: 'rgba(212,168,83,0.1)',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${report.confidence || 0}%`, height: '100%',
              background: sent.color, borderRadius: 3, transition: 'width 0.5s ease',
            }} />
          </div>
          <span style={{
            fontSize: 12, fontWeight: 700, color: sent.color,
            fontFamily: "'JetBrains Mono', monospace",
          }}>{report.confidence}%</span>
        </div>
      </div>

      {/* ══ CHART ══ */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 style={{
            fontFamily: "'Playfair Display', serif", fontSize: 16, color: '#c4b8a8',
            margin: 0,
          }}>BTC/USDT · 4H</h3>
          <ChartLegend />
        </div>
        {chartLoading ? (
          <div style={{ height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b5c52' }}>
            Loading chart...
          </div>
        ) : chartData ? (
          <PriceChart chartData={chartData} />
        ) : (
          <div style={{ height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b5c52' }}>
            Chart data unavailable
          </div>
        )}
      </div>

      {/* ══ METRIC CARDS ══ */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20,
      }}>
        <MetricCard
          label="Price"
          value={`$${(report.btc_price || chartData?.current_price || 0).toLocaleString()}`}
          sub={`24h: $${tech.high_24h?.toLocaleString() || '?'} — $${tech.low_24h?.toLocaleString() || '?'}`}
        />
        <MetricCard
          label="Fear & Greed"
          value={fg || '—'}
          sub={fgClass}
          color={fg <= 25 ? '#f87171' : fg <= 45 ? '#fb923c' : fg <= 55 ? '#fbbf24' : fg <= 75 ? '#a3e635' : '#4ade80'}
        />
        <MetricCard
          label="RSI (14)"
          value={tech.rsi_14 || '—'}
          sub={tech.rsi_14 > 70 ? 'Overbought' : tech.rsi_14 < 30 ? 'Oversold' : 'Neutral zone'}
          color={tech.rsi_14 > 70 ? '#f87171' : tech.rsi_14 < 30 ? '#4ade80' : '#d4a853'}
        />
        <MetricCard
          label="EMA Spread"
          value={tech.ema_spread_pct ? `${tech.ema_spread_pct > 0 ? '+' : ''}${tech.ema_spread_pct}%` : '—'}
          sub={tech.ema_bullish_cross ? '🟢 EMA20 > EMA50' : '🔴 EMA20 < EMA50'}
          color={tech.ema_bullish_cross ? '#4ade80' : '#f87171'}
        />
        <MetricCard
          label="Volume Ratio"
          value={tech.volume_ratio ? `${tech.volume_ratio}x` : '—'}
          sub="vs 20d avg"
          color={tech.volume_ratio > 1.5 ? '#4ade80' : tech.volume_ratio < 0.5 ? '#f87171' : '#d4a853'}
        />
        <MetricCard
          label="Aggregated OI"
          value={oiData.coinglass?.total_oi_usd
            ? `$${(oiData.coinglass.total_oi_usd / 1e9).toFixed(1)}B`
            : '—'}
          sub={oiData.coinglass?.exchange_count
            ? `${oiData.coinglass.exchange_count} exchanges`
            : oiData.best_source || ''}
          color="#d4a853"
        />
      </div>

      {/* ══ KEY LEVELS BAR ══ */}
      {report.key_levels && <KeyLevelsBar levels={report.key_levels} price={report.btc_price || chartData?.current_price} />}

      {/* ══ LIQUIDATION HOTSPOTS ══ */}
      {(liq.peak_long_liq || report.liquidation_hotspots) && (
        <div style={{
          background: 'rgba(212,168,83,0.03)', borderRadius: 12,
          border: '1px solid rgba(212,168,83,0.08)', padding: '14px 18px',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 14 }}>💥</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#c4b8a8' }}>Liquidation Hotspots</span>
            <span style={{
              fontSize: 9, color: '#fbbf24', background: 'rgba(251,191,36,0.1)',
              padding: '1px 6px', borderRadius: 8, marginLeft: 4,
            }}>ESTIMATED</span>
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 10, color: '#f87171' }}>▼ Nearest Long Liq</span>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f87171', fontFamily: "'JetBrains Mono'" }}>
                ${(liq.peak_long_liq || report.liquidation_hotspots?.nearest_long_cluster || 0).toLocaleString()}
              </div>
            </div>
            <div>
              <span style={{ fontSize: 10, color: '#4ade80' }}>▲ Nearest Short Liq</span>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#4ade80', fontFamily: "'JetBrains Mono'" }}>
                ${(liq.peak_short_liq || report.liquidation_hotspots?.nearest_short_cluster || 0).toLocaleString()}
              </div>
            </div>
            <div>
              <span style={{ fontSize: 10, color: '#6b5c52' }}>Cascade Risk</span>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fbbf24', fontFamily: "'JetBrains Mono'" }}>
                {report.liquidation_hotspots?.cascade_risk?.toUpperCase() || 'N/A'}
              </div>
            </div>
          </div>
          <SourceBadges sources={['Coinglass', 'Coinalyze']} />
        </div>
      )}

      {/* ══ FEAR & GREED GAUGE ══ */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{
          background: 'rgba(212,168,83,0.03)', borderRadius: 12,
          border: '1px solid rgba(212,168,83,0.08)', padding: '14px 20px',
          flex: '0 0 200px', textAlign: 'center',
        }}>
          <FearGreedGauge value={fg} classification={fgClass} />
          <SourceBadges sources={['Alternative.me']} />
        </div>

        {/* Risk Factors */}
        {report.risk_factors?.length > 0 && (
          <div style={{
            background: 'rgba(212,168,83,0.03)', borderRadius: 12,
            border: '1px solid rgba(212,168,83,0.08)', padding: '14px 18px',
            flex: 1, minWidth: 200,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#c4b8a8', marginBottom: 8 }}>⚠️ Risk Factors</div>
            {report.risk_factors.map((r, i) => (
              <div key={i} style={{ fontSize: 12, color: '#8a7c6e', padding: '3px 0', lineHeight: 1.5 }}>
                <span style={{ color: '#f87171', marginRight: 6 }}>•</span>{r}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ REPORT SECTIONS (4 sections) ══ */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{
          fontFamily: "'Playfair Display', serif", fontSize: 16, color: '#c4b8a8',
          margin: '0 0 12px 0',
        }}>Analysis Report</h3>
        {SECTION_ORDER.map(key => (
          <ReportSection
            key={key}
            sectionKey={key}
            content={report.sections?.[key]}
            isOpen={!!openSections[key]}
            onToggle={() => toggleSection(key)}
          />
        ))}
      </div>

      {/* ══ FOOTER — Report metadata ══ */}
      <div style={{
        borderTop: '1px solid rgba(212,168,83,0.08)', paddingTop: 12,
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        <span style={{ fontSize: 10, color: '#4a4039' }}>
          Report {report.id} · Generated in {report.generated_in_seconds}s · {report.data_sources} sources
        </span>
        <span style={{ fontSize: 10, color: '#4a4039' }}>
          {new Date(report.timestamp).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// KEY LEVELS BAR
// ════════════════════════════════════════

function KeyLevelsBar({ levels, price }) {
  if (!levels || !price) return null;
  const { strong_support, support, resistance, strong_resistance } = levels;
  const allLevels = [strong_support, support, price, resistance, strong_resistance].filter(Boolean);
  if (allLevels.length < 3) return null;

  const min = Math.min(...allLevels) * 0.998;
  const max = Math.max(...allLevels) * 1.002;
  const range = max - min;
  const pos = (v) => ((v - min) / range) * 100;

  return (
    <div style={{
      background: 'rgba(212,168,83,0.03)', borderRadius: 12,
      border: '1px solid rgba(212,168,83,0.08)', padding: '14px 18px',
      marginBottom: 16,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#c4b8a8', marginBottom: 10 }}>📐 Key Levels</div>
      <div style={{ position: 'relative', height: 32, background: 'rgba(212,168,83,0.04)', borderRadius: 6 }}>
        {/* Price marker */}
        <div style={{
          position: 'absolute', left: `${pos(price)}%`, top: -2, transform: 'translateX(-50%)',
          background: '#d4a853', color: '#0f0c08', fontSize: 9, fontWeight: 700,
          padding: '2px 6px', borderRadius: 4, fontFamily: "'JetBrains Mono'",
          zIndex: 5,
        }}>${price.toLocaleString()}</div>
        {/* Level markers */}
        {[
          { v: strong_support, label: 'S2', color: '#4ade80' },
          { v: support, label: 'S1', color: '#86efac' },
          { v: resistance, label: 'R1', color: '#fca5a5' },
          { v: strong_resistance, label: 'R2', color: '#f87171' },
        ].map(({ v, label, color }) => v && (
          <div key={label} style={{
            position: 'absolute', left: `${pos(v)}%`, bottom: -2, transform: 'translateX(-50%)',
            fontSize: 9, color, fontWeight: 600, fontFamily: "'JetBrains Mono'",
          }}>
            <div style={{ textAlign: 'center' }}>{label}</div>
            <div style={{ fontSize: 8 }}>${(v/1000).toFixed(1)}k</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// STYLES
// ════════════════════════════════════════

const styles = {
  page: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '20px 16px',
  },
};
