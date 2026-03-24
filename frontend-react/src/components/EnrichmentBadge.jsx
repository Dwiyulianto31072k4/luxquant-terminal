/**
 * EnrichmentBadge — Confidence Score display for SignalModal
 * 
 * Usage:
 *   <EnrichmentBadge enrichment={signalDetail?.enrichment} layout="compact" />  // header
 *   <EnrichmentBadge enrichment={signalDetail?.enrichment} layout="full" />     // trade tab
 */
import { useState } from 'react';

const RATING_CONFIG = {
  STRONG:   { color: 'text-green-400',  bg: 'bg-green-500/15', border: 'border-green-500/30', emoji: '🟢' },
  MODERATE: { color: 'text-lime-400',   bg: 'bg-lime-500/15',  border: 'border-lime-500/30',  emoji: '🟡' },
  WEAK:     { color: 'text-yellow-400', bg: 'bg-yellow-500/15',border: 'border-yellow-500/30',emoji: '🟠' },
  LOW:      { color: 'text-orange-400', bg: 'bg-orange-500/15',border: 'border-orange-500/30',emoji: '🔴' },
  AVOID:    { color: 'text-red-400',    bg: 'bg-red-500/15',   border: 'border-red-500/30',   emoji: '⛔' },
};

const SCORE_LABELS = {
  mtf: 'Trend Alignment',
  momentum: 'Momentum',
  context: 'Market Context',
  freshness: 'Freshness',
  pattern: 'Patterns',
  smc: 'Smart Money',
};

const EnrichmentBadge = ({ enrichment, layout = 'full' }) => {
  const [expanded, setExpanded] = useState(false);

  if (!enrichment || enrichment.confidence_score === undefined) return null;

  const { confidence_score, rating, regime, score_breakdown, 
          mtf_h4_trend, mtf_h1_trend, mtf_m15_trend, signal_direction,
          btc_trend, btc_dom_trend, fear_greed, atr_percentile,
          confluence_notes, warnings, analyzed_at, enrichment_version } = enrichment;

  const cfg = RATING_CONFIG[rating] || RATING_CONFIG.AVOID;

  // === COMPACT (for header) ===
  if (layout === 'compact') {
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${cfg.bg} border ${cfg.border}`}
           title={`Confidence: ${confidence_score}/100 (${rating})`}>
        <span className="text-[10px]">{cfg.emoji}</span>
        <span className={`text-[10px] font-mono font-bold ${cfg.color}`}>{confidence_score}</span>
        <span className={`text-[9px] font-semibold ${cfg.color}`}>{rating}</span>
      </div>
    );
  }

  // === FULL (for trade tab) ===
  const breakdown = score_breakdown || {};
  const breakdownEntries = Object.entries(breakdown).filter(([_, v]) => v && v.max > 0);

  const trendBadge = (label, value) => {
    if (!value) return null;
    const c = value === 'BULLISH' || value === 'RISING' ? 'text-green-400 bg-green-500/10' 
            : value === 'BEARISH' || value === 'FALLING' ? 'text-red-400 bg-red-500/10' 
            : 'text-gray-400 bg-white/5';
    return (
      <div className="flex items-center gap-1" key={label}>
        <span className="text-text-muted text-[9px]">{label}</span>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${c}`}>{value}</span>
      </div>
    );
  };

  return (
    <div className={`bg-[#0d0d0d] rounded-xl border ${cfg.border} overflow-hidden`}>
      {/* Header — always visible */}
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`relative w-12 h-12 rounded-full border-2 ${cfg.border} flex items-center justify-center ${cfg.bg}`}>
            <span className={`text-lg font-mono font-bold ${cfg.color}`}>{confidence_score}</span>
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${cfg.color}`}>{rating}</span>
              {regime && regime !== 'skip' && (
                <span className="text-[9px] text-text-muted bg-white/5 px-1.5 py-0.5 rounded">
                  {regime.replace('_', ' ')}
                </span>
              )}
              {signal_direction && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  signal_direction === 'BULLISH' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                }`}>
                  {signal_direction === 'BULLISH' ? '▲ LONG' : '▼ SHORT'}
                </span>
              )}
            </div>
            <p className="text-text-muted text-[10px] mt-0.5">
              Confidence Score • {enrichment_version || 'v2.1'}
            </p>
          </div>
        </div>
        <svg className={`w-4 h-4 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable Detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
          
          {/* Score Breakdown Bars */}
          {breakdownEntries.length > 0 && (
            <div className="space-y-2">
              <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium">Score Breakdown</p>
              {breakdownEntries.map(([key, val]) => {
                const pct = val.max > 0 ? (val.score / val.max) * 100 : 0;
                const barColor = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] text-text-secondary">{SCORE_LABELS[key] || key}</span>
                      <span className="text-[10px] font-mono text-white">{val.score}/{val.max}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor} transition-all`} 
                           style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* MTF Trends */}
          {(mtf_h4_trend || mtf_h1_trend || mtf_m15_trend) && (
            <div className="bg-[#111]/80 rounded-lg p-2.5 border border-white/5">
              <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-2">Multi-Timeframe</p>
              <div className="flex flex-wrap gap-2">
                {trendBadge('H4', mtf_h4_trend)}
                {trendBadge('H1', mtf_h1_trend)}
                {trendBadge('M15', mtf_m15_trend)}
              </div>
            </div>
          )}

          {/* Market Context */}
          {(btc_trend || fear_greed !== null || atr_percentile !== null) && (
            <div className="bg-[#111]/80 rounded-lg p-2.5 border border-white/5">
              <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-2">Market Context</p>
              <div className="flex flex-wrap gap-2">
                {trendBadge('BTC', btc_trend)}
                {trendBadge('DOM', btc_dom_trend)}
                {fear_greed !== null && (
                  <div className="flex items-center gap-1">
                    <span className="text-text-muted text-[9px]">F&G</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      fear_greed < 25 ? 'text-red-400 bg-red-500/10' 
                      : fear_greed > 75 ? 'text-green-400 bg-green-500/10' 
                      : 'text-yellow-400 bg-yellow-500/10'
                    }`}>{fear_greed}</span>
                  </div>
                )}
                {atr_percentile !== null && (
                  <div className="flex items-center gap-1">
                    <span className="text-text-muted text-[9px]">Vol</span>
                    <span className="text-[9px] font-mono text-white bg-white/5 px-1.5 py-0.5 rounded">
                      P{Math.round(atr_percentile)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Confluence Notes */}
          {confluence_notes && (
            <div className="bg-[#111]/80 rounded-lg p-2.5 border border-white/5">
              <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-1.5">Confluence</p>
              <div className="flex flex-wrap gap-1.5">
                {confluence_notes.split(' | ').map((note, i) => (
                  <span key={i} className={`text-[9px] px-2 py-0.5 rounded-full border ${
                    note.startsWith('⚠') 
                      ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' 
                      : 'text-text-secondary bg-white/5 border-white/10'
                  }`}>{note}</span>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {warnings && warnings.length > 0 && (
            <div className="bg-red-500/5 rounded-lg p-2.5 border border-red-500/15">
              <p className="text-red-400 text-[9px] uppercase tracking-wider font-medium mb-1.5">⚠ Warnings</p>
              {warnings.map((w, i) => (
                <p key={i} className="text-red-300/80 text-[10px]">• {w}</p>
              ))}
            </div>
          )}

          {/* Footer */}
          {analyzed_at && (
            <p className="text-text-muted/50 text-[8px] text-right">
              Analyzed: {new Date(analyzed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default EnrichmentBadge;