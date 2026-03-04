// src/components/AIArenaPage.jsx
import React from 'react';

// ════════════════════════════════════════
// SECTION CONFIG (preserved from original)
// ════════════════════════════════════════
const SECTIONS = {
  executive_summary:  { title: 'Executive Summary',    emoji: '📋' },
  price_action:       { title: 'Price Action',          emoji: '📈' },
  technical_analysis: { title: 'Technical Analysis',    emoji: '📊' },
  derivatives_flow:   { title: 'Derivatives Insight',   emoji: '⚡' },
  onchain_network:    { title: 'On-Chain & Network',    emoji: '🔗' },
  market_sentiment:   { title: 'Market Sentiment',      emoji: '🧭' },
  news_catalysts:     { title: 'News & Catalysts',      emoji: '📰' },
  signal_performance: { title: 'Signal Performance',    emoji: '🎯' },
  reasoning_log:      { title: 'AI Chain of Thought',   emoji: '🧠' },
  market_stance:      { title: 'Market Stance',         emoji: '🏁' },
};

const SECTION_ORDER = [
  'executive_summary', 'derivatives_flow', 'technical_analysis', 'price_action',
  'onchain_network', 'market_sentiment', 'news_catalysts', 'signal_performance',
  'reasoning_log', 'market_stance'
];

// ════════════════════════════════════════
// MAIN PAGE — Under Development
// ════════════════════════════════════════
export default function AIArenaPage() {
  return (
    <div className="w-full h-full flex flex-col">

      {/* ══ HEADER (same as original) ══ */}
      <div className="pb-4 pt-1">
        <h1 className="text-3xl lg:text-4xl font-display font-black text-white tracking-tight mb-2">
          AI <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark">Arena</span>
        </h1>
        <p className="text-text-muted text-sm leading-relaxed max-w-2xl">
          Institutional-grade market report generated every hour by reasoning AI model.
          Analyzing Liquidation anomalies, Open Interest, and On-Chain Supply shifts.
        </p>
      </div>

      {/* ══ UNDER DEVELOPMENT CARD ══ */}
      <div className="flex-1 pb-32 max-w-4xl">
        <div className="relative pl-8 lg:pl-10 pb-6 mt-4">
          {/* Timeline line */}
          <div className="absolute left-[14px] lg:left-[18px] top-6 bottom-0 w-[1.5px]" style={{ background: 'linear-gradient(to bottom, rgba(212,168,83,0.3), transparent)' }} />
          {/* Timeline dot */}
          <div className="absolute left-[7px] lg:left-[11px] top-4 w-4 h-4 rounded-full border-2 border-gold-primary/60 flex items-center justify-center z-10"
            style={{ background: '#0d0a07' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-gold-primary animate-pulse" />
          </div>

          {/* Card */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(22,14,18,0.85)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.05)' }}>

            {/* Card Header */}
            <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex items-center gap-3">
                <span className="text-white font-mono text-sm font-bold tracking-tight">AI Arena v2</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                In Development
              </span>
            </div>

            {/* Development Message */}
            <div className="px-5 py-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">🔬</span>
                <div>
                  <p className="text-[13px] text-white/80 leading-[1.85] tracking-wide mb-3">
                    AI Arena is currently being redesigned for better, more accurate results.
                  </p>
                  <p className="text-[13px] text-text-muted/60 leading-[1.85] tracking-wide">
                    We're working on improving the overall quality of the analysis. The feature will be back once it meets our standards. Thank you for your patience.
                  </p>
                </div>
              </div>
            </div>

            {/* Sections Preview — greyed out */}
            <div>
              {SECTION_ORDER.map((key) => {
                const cfg = SECTIONS[key];
                if (!cfg) return null;
                return (
                  <div key={key} className="border-b border-white/[0.04] last:border-0">
                    <div className="w-full flex items-center justify-between px-5 py-3.5 opacity-30 cursor-not-allowed">
                      <div className="flex items-center gap-3">
                        <span className="text-base grayscale-[60%]">{cfg.emoji}</span>
                        <span className="text-[13px] font-semibold tracking-wide text-text-secondary">{cfg.title}</span>
                      </div>
                      <svg className="w-4 h-4 text-text-muted/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-5 py-2.5 flex items-center gap-4 text-[9px] text-text-muted/30" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
              <span>Under development for better results</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}