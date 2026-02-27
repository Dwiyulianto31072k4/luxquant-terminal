// src/components/AIArenaPage.jsx
import React, { useState, useEffect } from 'react';

// ════════════════════════════════════════
// SMART TAGS PARSER (MARKET DATA & NEWS LINK)
// ════════════════════════════════════════
const renderTextWithLinks = (text) => {
  if (!text) return "";
  // Regex untuk menangkap [Teks](Target/URL)
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const label = match[1];
    const target = match[2];
    
    // Deteksi apakah target adalah URL (berita) atau Tab (internal)
    const isExternal = target.startsWith('http');

    parts.push(
      <button
        key={match.index}
        onClick={() => {
          if (isExternal) {
            window.open(target, '_blank');
          } else {
            window.dispatchEvent(new CustomEvent('navigate', { detail: target }));
          }
        }}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 mx-1 translate-y-[-1px] rounded text-xs font-mono transition-all border ${
          isExternal 
          ? "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20" 
          : "bg-gold-primary/10 border-gold-primary/30 text-gold-primary hover:bg-gold-primary/20"
        } cursor-pointer shadow-sm`}
      >
        {label}
        <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
            d={isExternal 
              ? "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" 
              : "M13 7l5 5m0 0l-5 5m5-5H6"} 
          />
        </svg>
      </button>
    );
    lastIndex = regex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return parts;
};

// ════════════════════════════════════════
// REPORT CARD COMPONENT
// ════════════════════════════════════════
const ReportCard = ({ report }) => {
  const [expandedSection, setExpandedSection] = useState('summary');
  
  const sentimentConfig = {
    bullish: { color: 'text-emerald-400', border: 'border-emerald-400/30', bg: 'bg-emerald-400/10', label: 'STRONGLY BULLISH' },
    bearish: { color: 'text-rose-400', border: 'border-rose-400/30', bg: 'bg-rose-400/10', label: 'STRUCTURAL BEARISH' },
    cautious: { color: 'text-amber-400', border: 'border-amber-400/30', bg: 'bg-amber-400/10', label: 'CAUTIOUS MONITORING' },
    neutral: { color: 'text-gray-400', border: 'border-gray-400/30', bg: 'bg-gray-400/10', label: 'NEUTRAL BIAS' }
  };
  
  const currentSentiment = sentimentConfig[report.sentiment?.toLowerCase()] || sentimentConfig.neutral;

  const formatTime = (isoString) => {
    if (!isoString) return "--:--";
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  };

  const sections = [
    { key: 'summary', title: 'Intelligence Summary', icon: '📝' },
    { key: 'derivatives', title: 'Tier 1: Liquidity & Derivatives', icon: '⚡' },
    { key: 'onchain', title: 'Tier 2: Macro & On-Chain', icon: '🔗' },
    { key: 'chain_of_thought', title: 'AlphaCore Reasoning Log', icon: '🧠' }
  ];

  return (
    <div className="relative pl-8 lg:pl-10 pb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Timeline Accents */}
      <div className="absolute left-[15px] lg:left-[19px] top-6 bottom-0 w-[2px] bg-gradient-to-b from-gold-primary/40 to-transparent" />
      <div className="absolute left-[5.5px] lg:left-[9.5px] top-4 w-5 h-5 rounded-full bg-[#0d0709] border-[2px] border-gold-primary flex items-center justify-center z-10 shadow-[0_0_10px_rgba(212,168,83,0.4)]">
        <div className="w-1.5 h-1.5 bg-gold-primary rounded-full animate-pulse" />
      </div>

      <div className="bg-[#160d11]/90 backdrop-blur-xl rounded-3xl overflow-hidden shadow-2xl border border-white/5">
        {/* Header Section */}
        <div className="p-6 lg:p-8 flex flex-col gap-5 border-b border-white/5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-white font-mono text-lg font-bold tracking-tighter">{formatTime(report.timestamp)}</span>
              <div className="px-3 py-1 rounded bg-white/5 border border-white/10">
                <span className="text-[10px] text-text-muted uppercase tracking-[0.2em]">Engine: </span>
                <span className="text-xs text-gold-primary font-bold uppercase tracking-widest">{report.model}</span>
              </div>
            </div>
            
            <div className={`px-4 py-1.5 rounded-full border flex items-center gap-2 ${currentSentiment.bg} ${currentSentiment.border}`}>
              <div className={`w-2 h-2 rounded-full bg-current ${currentSentiment.color} animate-pulse`} />
              <span className={`text-[11px] font-black tracking-[0.1em] ${currentSentiment.color}`}>
                {currentSentiment.label}
              </span>
            </div>
          </div>

          {/* Confidence Meter */}
          <div className="flex items-center gap-4 bg-black/20 p-3 rounded-2xl border border-white/5">
            <span className="text-[10px] text-text-muted uppercase tracking-[0.2em] font-bold">Conviction Level</span>
            <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
              <div 
                className="h-full rounded-full bg-gradient-to-r from-gold-dark via-gold-primary to-gold-light shadow-[0_0_8px_rgba(212,168,83,0.5)] transition-all duration-1000 ease-out" 
                style={{ width: `${report.confidence}%` }}
              />
            </div>
            <span className="text-sm font-black text-white font-mono">{report.confidence}%</span>
          </div>
        </div>

        {/* Intelligence Sections */}
        <div className="p-3 lg:p-4 space-y-2">
          {sections.map((sec) => {
            const isExpanded = expandedSection === sec.key;
            if (!report.sections || !report.sections[sec.key]) return null;

            return (
              <div key={sec.key} className="rounded-2xl transition-all duration-300">
                <button
                  onClick={() => setExpandedSection(isExpanded ? null : sec.key)}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${
                    isExpanded ? 'bg-white/5 shadow-inner' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-lg grayscale group-hover:grayscale-0">{sec.icon}</span>
                    <span className={`text-sm tracking-widest uppercase font-black ${isExpanded ? 'text-gold-primary' : 'text-text-secondary'}`}>
                      {sec.title}
                    </span>
                  </div>
                  <svg className={`w-5 h-5 text-text-muted transition-all duration-500 ${isExpanded ? 'rotate-180 text-white' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="p-5 pt-2 pb-6 pl-[52px]">
                    {sec.key === 'chain_of_thought' ? (
                      <div className="font-mono text-xs md:text-sm leading-relaxed text-gold-primary/60 whitespace-pre-wrap bg-black/60 p-5 rounded-2xl border border-white/5 shadow-inner italic">
                        {report.sections[sec.key]}
                      </div>
                    ) : (
                      <p className="text-sm md:text-base text-text-muted leading-relaxed tracking-wide">
                        {renderTextWithLinks(report.sections[sec.key])}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// MAIN PAGE: AI ARENA TERMINAL
// ════════════════════════════════════════
export default function AIArenaPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = async () => {
    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8002';
      const response = await fetch(`${baseUrl}/api/v1/ai-arena/latest`);
      if (response.ok) {
        const data = await response.json();
        setReport(data);
      }
    } catch (err) {
      console.error("AI Intelligence Stream Offline", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    const interval = setInterval(fetchReport, 30000); 
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full pb-32 animate-in fade-in duration-1000">
      {/* Page Header */}
      <div className="mb-12 relative">
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-gold-primary/10 rounded-full blur-[80px] pointer-events-none" />
        
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <span className="px-3 py-1 rounded-full bg-gold-primary/10 border border-gold-primary/20 text-gold-primary text-[10px] font-black uppercase tracking-[0.3em]">
            Institutional Intelligence
          </span>
          <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Neural Link Active
          </span>
        </div>
        
        <h1 className="text-4xl lg:text-5xl font-display font-black text-white mb-4 tracking-tight">
          AlphaCore <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark">Terminal</span>
        </h1>
        
        <p className="text-text-muted text-sm md:text-base max-w-3xl leading-relaxed">
          Autonomous market reasoning engine. Analyzing Tier 1 derivatives mechanical flows, 
          global liquidity news cycles, and institutional supply distribution.
        </p>
      </div>

      {/* Main Stream Area */}
      <div className="max-w-4xl mx-auto">
        {loading && !report ? (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 border-2 border-gold-primary/20 rounded-full" />
              <div className="absolute inset-0 border-t-2 border-gold-primary rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-xl">🧠</div>
            </div>
            <p className="mt-8 text-gold-primary font-mono text-xs tracking-[0.5em] uppercase animate-pulse">Syncing AlphaCore...</p>
          </div>
        ) : report ? (
          <ReportCard report={report} />
        ) : (
          <div className="text-center py-24 bg-white/[0.02] rounded-[40px] border-2 border-white/5 border-dashed">
            <div className="text-4xl mb-4 opacity-30">📡</div>
            <p className="text-text-muted text-xs font-mono tracking-[0.4em] uppercase">No Active Intelligence Stream</p>
          </div>
        )}
      </div>
    </div>
  );
}