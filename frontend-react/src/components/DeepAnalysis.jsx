import { useState } from 'react';

/**
 * DeepAnalysis — Popup overlay inside SignalModal
 * Shows enrichment data: score, patterns, SMC, Fibonacci, MTF trend
 * 
 * Props:
 *   enrichment: object from signalDetail.enrichment
 *   isOpen: boolean
 *   onClose: function
 *   pair: string
 */
const DeepAnalysis = ({ enrichment, isOpen, onClose, pair }) => {
  if (!isOpen || !enrichment) return null;

  const {
    confidence_score = 0,
    rating = 'AVOID',
    regime = 'normal',
    score_breakdown = {},
    patterns_detected = [],
    smc_fvg_count = 0,
    smc_ob_count = 0,
    smc_sweep_count = 0,
    smc_golden_setup = false,
    smc_detail = {},
    mtf_h4_trend,
    mtf_h1_trend,
    mtf_m15_trend,
    signal_direction,
    btc_trend,
    btc_dom_trend,
    fear_greed,
    atr_percentile,
    confluence_notes = '',
    warnings = [],
    analyzed_at,
    enrichment_version = '',
  } = enrichment;

  // Rating colors
  const ratingConfig = {
    STRONG: { bg: 'bg-green-500/15', text: 'text-green-400', border: 'border-green-500/30', barColor: 'bg-green-500' },
    MODERATE: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30', barColor: 'bg-blue-500' },
    WEAK: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/30', barColor: 'bg-yellow-500' },
    LOW: { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30', barColor: 'bg-orange-500' },
    AVOID: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', barColor: 'bg-red-500' },
  };
  const rc = ratingConfig[rating] || ratingConfig.AVOID;

  // Score color based on value
  const scoreColor = confidence_score >= 70 ? 'text-green-400' : confidence_score >= 55 ? 'text-blue-400' : confidence_score >= 40 ? 'text-yellow-400' : confidence_score >= 25 ? 'text-orange-400' : 'text-red-400';

  // Dimension labels
  const dimensions = [
    { key: 'mtf', label: 'MTF Trend', icon: '📊' },
    { key: 'pattern', label: 'Pattern', icon: '📐' },
    { key: 'smc', label: 'SMC', icon: '🏦' },
    { key: 'momentum', label: 'Momentum', icon: '⚡' },
    { key: 'context', label: 'Context', icon: '🌍' },
    { key: 'freshness', label: 'Freshness', icon: '⏱️' },
  ];

  // Parse confluence notes
  const notes = (confluence_notes || '').split(' | ').filter(Boolean);

  // Trend badge
  const TrendBadge = ({ trend, label }) => {
    if (!trend) return null;
    const colors = {
      BULLISH: 'bg-green-500/15 text-green-400 border-green-500/25',
      BEARISH: 'bg-red-500/15 text-red-400 border-red-500/25',
      RANGING: 'bg-gray-500/15 text-gray-400 border-gray-500/25',
      RISING: 'bg-green-500/15 text-green-400 border-green-500/25',
      FALLING: 'bg-red-500/15 text-red-400 border-red-500/25',
      FLAT: 'bg-gray-500/15 text-gray-400 border-gray-500/25',
    };
    return (
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-medium ${colors[trend] || colors.RANGING}`}>
        <span className="text-white/50">{label}</span>
        <span className="font-bold">{trend}</span>
      </div>
    );
  };

  // Time ago helper
  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="fixed inset-0 z-[150000] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg max-h-[85vh] mx-3 bg-[#0a0a0a] border border-gold-primary/30 rounded-xl overflow-hidden flex flex-col animate-[fadeIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gold-primary/20 bg-[#0d0d0d] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm">🧠</span>
              <h3 className="text-white font-semibold text-sm">Deep Analysis</h3>
            </div>
            <span className="text-text-muted text-[10px] font-mono">{pair}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-muted text-[9px]">{enrichment_version} · {timeAgo(analyzed_at)}</span>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-white hover:bg-red-500/20 rounded transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">

          {/* Score Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`text-3xl font-bold font-mono ${scoreColor}`}>{confidence_score}</span>
              <div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded border ${rc.bg} ${rc.text} ${rc.border}`}>
                  {rating}
                </span>
                <p className="text-text-muted text-[9px] mt-1">
                  {signal_direction} · {regime} vol
                </p>
              </div>
            </div>
          </div>

          {/* Score Breakdown Bars */}
          <div className="bg-[#111] rounded-lg border border-white/5 p-3 space-y-2">
            {dimensions.map(({ key, label, icon }) => {
              const dim = score_breakdown[key] || {};
              const score = dim.score || 0;
              const max = dim.max || 1;
              const pct = Math.min(100, Math.round((score / max) * 100));
              const barColor = pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : pct >= 30 ? 'bg-yellow-500' : 'bg-red-500';
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[10px] w-[72px] text-text-muted truncate">{icon} {label}</span>
                  <div className="flex-1 h-[5px] bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-white w-[38px] text-right">{score}/{max}</span>
                </div>
              );
            })}
          </div>

          {/* Detected Patterns */}
          {patterns_detected.length > 0 && (
            <div className="bg-[#111] rounded-lg border border-white/5 p-3">
              <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-2">Detected patterns</p>
              <div className="flex flex-wrap gap-1.5">
                {patterns_detected.map((p, i) => {
                  const isHarmonic = (p.type || '').includes('harmonic');
                  const dirColor = p.direction === 'BULLISH' ? 'bg-green-500/10 text-green-400 border-green-500/20'
                    : p.direction === 'BEARISH' ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'bg-gray-500/10 text-gray-400 border-gray-500/20';
                  return (
                    <span key={i} className={`text-[10px] px-2 py-1 rounded border font-medium ${isHarmonic ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : dirColor}`}>
                      {p.timeframe && <span className="text-white/40 mr-1">{p.timeframe}</span>}
                      {(p.type || '').replace('harmonic_', '').replace(/_/g, ' ')}
                      {p.match_score && <span className="ml-1 text-white/40">({Math.round(p.match_score * 100)}%)</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* SMC Summary */}
          {(smc_fvg_count > 0 || smc_ob_count > 0 || smc_sweep_count > 0) && (
            <div className="bg-[#111] rounded-lg border border-white/5 p-3">
              <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-2">Smart money concepts</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'FVG', value: smc_fvg_count },
                  { label: 'Order Block', value: smc_ob_count },
                  { label: 'Sweep', value: smc_sweep_count },
                  { label: 'Golden', value: smc_golden_setup ? 'Yes' : 'No', isGolden: true },
                ].map((item, i) => (
                  <div key={i} className="bg-[#0a0a0a] rounded p-2 text-center">
                    <p className="text-text-muted text-[8px] uppercase">{item.label}</p>
                    <p className={`text-sm font-bold mt-0.5 ${item.isGolden && smc_golden_setup ? 'text-green-400' : 'text-white'}`}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confluence Notes */}
          {notes.length > 0 && (
            <div className="bg-[#111] rounded-lg border border-white/5 p-3">
              <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-2">Confluence notes</p>
              <div className="flex flex-wrap gap-1.5">
                {notes.map((note, i) => {
                  const isWarning = note.startsWith('⚠');
                  const bg = isWarning
                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'bg-green-500/10 text-green-400 border-green-500/20';
                  return (
                    <span key={i} className={`text-[10px] px-2 py-1 rounded border ${bg}`}>
                      {note}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* MTF Trend Footer */}
          <div className="bg-[#111] rounded-lg border border-white/5 p-3">
            <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-2">Market context</p>
            <div className="flex flex-wrap gap-1.5">
              <TrendBadge trend={mtf_h4_trend} label="H4" />
              <TrendBadge trend={mtf_h1_trend} label="H1" />
              <TrendBadge trend={mtf_m15_trend} label="M15" />
              <TrendBadge trend={btc_trend} label="BTC" />
              <TrendBadge trend={btc_dom_trend} label="DOM" />
              {fear_greed != null && (
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-medium ${
                  fear_greed >= 60 ? 'bg-green-500/15 text-green-400 border-green-500/25'
                  : fear_greed <= 30 ? 'bg-red-500/15 text-red-400 border-red-500/25'
                  : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25'
                }`}>
                  <span className="text-white/50">F&G</span>
                  <span className="font-bold">{fear_greed}</span>
                </div>
              )}
              {atr_percentile != null && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-medium bg-gray-500/15 text-gray-400 border-gray-500/25">
                  <span className="text-white/50">ATR</span>
                  <span className="font-bold">P{Math.round(atr_percentile)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-red-500/5 rounded-lg border border-red-500/15 p-3">
              <p className="text-red-400 text-[9px] uppercase tracking-wider font-medium mb-1.5">⚠ Warnings</p>
              {warnings.map((w, i) => (
                <p key={i} className="text-red-400/80 text-[10px]">• {w}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
};

export default DeepAnalysis;