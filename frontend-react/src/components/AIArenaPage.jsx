// src/components/AIArenaPage.jsx
// AI Arena v3 — Multi-TF, Chart Image, Anomaly Badges, Contextual
import React, { useState, useEffect, useCallback } from 'react';
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

const TF_ALIGNMENT_COLORS = {
  all_bullish: { color: '#4ade80', label: 'All Bullish', icon: '🟢' },
  all_bearish: { color: '#f87171', label: 'All Bearish', icon: '🔴' },
  mixed:       { color: '#fbbf24', label: 'Mixed',       icon: '🟡' },
  divergent:   { color: '#f97316', label: 'Divergent',    icon: '🟠' },
};

const BASE_URL = import.meta.env.VITE_API_URL || '';

// ════════════════════════════════════════
// CHART IMAGE COMPONENT
// ════════════════════════════════════════

function ChartImage({ reportId }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgUrl = `${BASE_URL}/api/v1/ai-arena/chart-image/${reportId}`;

  if (error) {
    return (
      <div className="glass-card rounded-2xl p-8 border border-gold-primary/10 flex items-center justify-center min-h-[200px]">
        <p className="text-text-muted text-sm">Chart image not available for this report</p>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl border border-gold-primary/10 overflow-hidden relative">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-card/80 z-10">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-gold-primary/40 border-t-gold-primary rounded-full animate-spin" />
            <span className="text-text-muted text-sm">Loading chart...</span>
          </div>
        </div>
      )}
      <img
        src={imgUrl}
        alt="BTC Multi-Timeframe Analysis"
        className="w-full h-auto"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        style={{ minHeight: loaded ? 'auto' : '400px' }}
      />
    </div>
  );
}

// ════════════════════════════════════════
// TIMEFRAME ALIGNMENT BADGE
// ════════════════════════════════════════

function TFAlignmentBadge({ alignment }) {
  if (!alignment) return null;
  const overall = alignment.alignment || 'mixed';
  const cfg = TF_ALIGNMENT_COLORS[overall] || TF_ALIGNMENT_COLORS.mixed;

  return (
    <div className="glass-card rounded-xl p-4 border border-gold-primary/10">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-gold-primary">Triple Screen</span>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}33` }}>
          {cfg.icon} {cfg.label}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { tf: '1D', label: 'Tide', value: alignment['1D_trend'] },
          { tf: '4H', label: 'Wave', value: alignment['4H_setup'] },
          { tf: '1H', label: 'Ripple', value: alignment['1H_momentum'] },
        ].map(({ tf, label, value }) => {
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
// METRIC CARDS
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
  const pct = value / 100;
  const color = value <= 25 ? '#f87171' : value <= 45 ? '#f97316' : value <= 55 ? '#fbbf24' : value <= 75 ? '#a3e635' : '#4ade80';
  const label = value <= 25 ? 'Extreme Fear' : value <= 45 ? 'Fear' : value <= 55 ? 'Neutral' : value <= 75 ? 'Greed' : 'Extreme Greed';

  return (
    <div className="glass-card rounded-xl p-3 border border-gold-primary/10">
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Fear & Greed</div>
      <div className="flex items-center gap-3">
        <div className="text-2xl font-bold font-mono" style={{ color }}>{value}</div>
        <div className="flex-1">
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, background: color }} />
          </div>
          <div className="text-[10px] font-semibold mt-1" style={{ color }}>{label}</div>
        </div>
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
  return (
    <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{ left: `${pos}%`, background: color }}>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[8px] whitespace-nowrap" style={{ color }}>{label}</div>
    </div>
  );
}

// ════════════════════════════════════════
// SECTION ACCORDION
// ════════════════════════════════════════

function SectionCard({ sectionKey, content, isOpen, onToggle }) {
  const config = SECTIONS[sectionKey];
  if (!config || !content) return null;

  // Parse smart tags: [value](tab_name) → clickable styled text
  const parseContent = (text) => {
    if (!text) return '';
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="text-gold-primary font-mono text-sm font-semibold">$1</span>');
  };

  return (
    <div className="glass-card rounded-2xl border border-gold-primary/10 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-lg">{config.emoji}</span>
          <span className="text-white font-semibold text-sm">{config.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {config.sources.map(src => (
            <a key={src} href={SOURCE_LINKS[src]} target="_blank" rel="noopener noreferrer"
               className="px-1.5 py-0.5 rounded text-[8px] font-medium bg-white/[0.04] text-text-muted hover:text-gold-primary hover:bg-gold-primary/10 transition-colors"
               onClick={e => e.stopPropagation()}>
              {src}
            </a>
          ))}
          <svg className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 border-t border-white/5">
          <div className="pt-3 text-text-secondary text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: parseContent(content) }} />
        </div>
      )}
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
          <button key={r.id} onClick={() => onSelect(r)}
            className={`flex-shrink-0 px-3 py-2 rounded-lg text-[10px] font-medium transition-all ${isCurrent ? 'bg-gold-primary/15 text-gold-primary border border-gold-primary/30' : 'bg-white/[0.03] text-text-muted hover:bg-white/[0.06] border border-transparent'}`}>
            <div className="flex items-center gap-1">
              {isAnomaly && <span className="text-[8px]">⚡</span>}
              <span style={{ color: isCurrent ? s.color : undefined }}>{s.icon}</span>
              <span>{time}</span>
            </div>
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

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [latestRes, historyRes] = await Promise.all([
        api.get('/api/v1/ai-arena/latest'),
        api.get('/api/v1/ai-arena/history?limit=20'),
      ]);

      setReport(latestRes.data);
      setHistory(historyRes.data?.reports || []);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('first_report');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Loading
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-2xl font-semibold text-white">AI Arena</h2>
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass-card rounded-2xl p-6 animate-pulse border border-gold-primary/10">
            <div className="h-4 bg-gold-primary/20 rounded w-40 mb-3" />
            <div className="h-20 bg-gold-primary/10 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // First report
  if (error === 'first_report') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="text-5xl mb-4">🧠</div>
        <h2 className="text-2xl font-display font-bold text-white mb-2">AI Arena</h2>
        <p className="text-text-muted max-w-md mb-6">First report is being generated. Multi-timeframe BTC analysis with DeepSeek R1 — this takes about 3 minutes.</p>
        <button onClick={fetchData} className="px-6 py-3 bg-gold-primary/20 text-gold-primary rounded-xl hover:bg-gold-primary/30 transition-all font-medium">Refresh</button>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <p className="text-red-400 mb-4">{error}</p>
        <button onClick={fetchData} className="px-5 py-2.5 bg-gold-primary/20 text-gold-primary rounded-xl hover:bg-gold-primary/30 transition-all font-medium">Retry</button>
      </div>
    );
  }

  if (!report) return null;

  const sentimentCfg = SENTIMENT_CONFIG[report.sentiment] || SENTIMENT_CONFIG.neutral;
  const sections = report.sections || {};
  const keyLevels = report.key_levels || {};
  const liqHotspots = report.liquidation_hotspots || {};
  const alignment = report.timeframe_alignment;
  const tfSummary = report.timeframes_summary || {};

  return (
    <div className="space-y-4 lg:space-y-5">

      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 lg:w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <div>
            <h2 className="font-display text-xl lg:text-2xl font-semibold text-white">AI Arena</h2>
            <p className="text-text-muted text-[10px] lg:text-xs mt-0.5">
              Multi-TF BTC Intelligence · DeepSeek R1
              {report.is_anomaly_triggered && <span className="ml-2 px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 text-[9px] font-bold">⚡ ANOMALY TRIGGERED</span>}
            </p>
          </div>
        </div>

        {/* Sentiment badge */}
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: sentimentCfg.bg, color: sentimentCfg.color, border: `1px solid ${sentimentCfg.border}` }}>
            {sentimentCfg.icon} {sentimentCfg.label} · {report.confidence}%
          </div>
          <div className="px-3 py-2 rounded-xl text-xs font-bold bg-white/[0.04] text-text-muted border border-white/5">
            {report.bias_direction || 'NEUTRAL'}
          </div>
        </div>
      </div>

      {/* ═══ Timeline ═══ */}
      <ReportTimeline reports={history} currentId={report.id} onSelect={(r) => setReport(r)} />

      {/* ═══ Metric Cards Row ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricCard label="BTC Price" value={`$${(report.btc_price || 0).toLocaleString()}`} color="#d4a853" />
        <FearGreedGauge value={report.fear_greed} />
        <MetricCard label="RSI (4H)" value={tfSummary?.['4H']?.rsi_14 || '—'} subValue={tfSummary?.['4H']?.rsi_14 >= 70 ? 'Overbought' : tfSummary?.['4H']?.rsi_14 <= 30 ? 'Oversold' : 'Neutral'} color={tfSummary?.['4H']?.rsi_14 >= 70 ? '#f87171' : tfSummary?.['4H']?.rsi_14 <= 30 ? '#4ade80' : '#d4a853'} />
        <MetricCard label="Daily Trend" value={tfSummary?.['1D']?.trend || '—'} color={tfSummary?.['1D']?.trend?.includes('UP') ? '#4ade80' : tfSummary?.['1D']?.trend?.includes('DOWN') ? '#f87171' : '#fbbf24'} />
        <MetricCard label="Cascade Risk" value={liqHotspots.cascade_risk?.toUpperCase() || '—'} color={liqHotspots.cascade_risk === 'high' ? '#f87171' : liqHotspots.cascade_risk === 'medium' ? '#fbbf24' : '#4ade80'} />
        <MetricCard label="Generated" value={`${report.generated_in_seconds?.toFixed(0) || '?'}s`} subValue={new Date(report.timestamp).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })} />
      </div>

      {/* ═══ TF Alignment + Key Levels ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TFAlignmentBadge alignment={alignment} />
        <KeyLevelsBar levels={keyLevels} currentPrice={report.btc_price} />
      </div>

      {/* ═══ Chart Image ═══ */}
      {report.id && <ChartImage reportId={report.id} />}

      {/* ═══ Analysis Sections ═══ */}
      <div className="space-y-3">
        {SECTION_ORDER.map(key => (
          <SectionCard
            key={key}
            sectionKey={key}
            content={sections[key]}
            isOpen={!!openSections[key]}
            onToggle={() => toggleSection(key)}
          />
        ))}
      </div>

      {/* ═══ Risk Factors ═══ */}
      {report.risk_factors && report.risk_factors.length > 0 && (
        <div className="glass-card rounded-2xl p-4 border border-red-500/10">
          <div className="text-[10px] text-red-400 uppercase tracking-wider font-bold mb-2">Risk Factors</div>
          <div className="space-y-1.5">
            {report.risk_factors.map((rf, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                <span className="text-red-400/60 mt-0.5">⚠</span>
                <span>{rf}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Anomaly Info ═══ */}
      {report.is_anomaly_triggered && report.anomaly_reason && (
        <div className="glass-card rounded-2xl p-4 border border-orange-500/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-orange-400">⚡</span>
            <span className="text-[10px] text-orange-400 uppercase tracking-wider font-bold">Anomaly Triggered Report</span>
          </div>
          <p className="text-sm text-text-secondary">{report.anomaly_reason}</p>
        </div>
      )}

      {/* ═══ Footer ═══ */}
      <div className="text-center text-text-muted text-[10px] py-2">
        {report.id} · {report.data_sources} data sources · {report.data_errors?.length > 0 ? `${report.data_errors.length} errors` : 'no errors'}
        {report.is_anomaly_triggered ? ' · ⚡ anomaly trigger' : ' · scheduled'}
      </div>
    </div>
  );
}
