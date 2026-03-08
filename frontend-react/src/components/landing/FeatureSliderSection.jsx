import { useState, useEffect, useRef } from 'react';

const FEATURES = [
  { 
    id: 'signals', 
    title: 'Algorithmic Signals', 
    desc: 'Precise entry, multiple take-profit targets, and strict stop-loss levels — auto-delivered 24/7 with risk scoring and volume ranking on every single call.', 
    macImg: '/mockups/mac-signals.png',
    phoneImg: '/mockups/phone-signals.png',
    icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" /></svg> 
  },
  { 
    id: 'proof', 
    title: 'Visual Trade Proof', 
    desc: "We don't just call trades — we prove them. Branded before-and-after chart captures with a step-by-step journey timeline from entry to each TP hit. Full transparency to keep your trust earned, not assumed.", 
    macImg: '/mockups/mac-proof.png',
    phoneImg: '/mockups/phone-proof.png',
    icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 4H6a2 2 0 00-2 2v2m16 0V6a2 2 0 00-2-2h-2M8 20H6a2 2 0 01-2-2v-2m16 0v2a2 2 0 01-2 2h-2M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> 
  },
  { 
    id: 'research', 
    title: 'Built-in Research', 
    desc: 'Tap any signal and instantly access full coin analysis — historical signal performance, price action context, market cap data, and past win/loss records. Your due diligence, already done.', 
    macImg: '/mockups/mac-research.png',
    phoneImg: '/mockups/phone-research.png',
    icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4-8-4m16 0v10l-8 4-8-4V7M12 11v10M8 8.5l-4 2M16 8.5l4 2" /></svg> 
  },
  { 
    id: 'ai-researcher', 
    title: 'AI Researcher', 
    desc: 'A dedicated AI analyst processing millions of data points per hour — price action, derivatives flow, on-chain metrics, sentiment, and breaking news — compressed into one clear market verdict.', 
    macImg: '/mockups/mac-ai.png',
    phoneImg: '/mockups/phone-ai.png',
    icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg> 
  },
  { 
    id: 'whale', 
    title: 'Whale Surveillance', 
    desc: 'See what the big players are doing before the crowd reacts. Real-time tracking of massive transfers and exchange flows across major blockchains.', 
    macImg: '/mockups/mac-whale.png',
    phoneImg: '/mockups/phone-whale.png',
    icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0M22 12h-2M12 2v2M4 12H2M12 22v-2" /></svg> 
  },
  { 
    id: 'orderbook', 
    title: 'Order Book Heatmap', 
    desc: 'Spot hidden liquidity walls and know exactly where the real support and resistance sit — straight from live order flow data.', 
    macImg: '/mockups/mac-orderbook.png',
    phoneImg: '/mockups/phone-orderbook.png',
    icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 18v-6h3v-3h3v9H3zm18 0v-8h-3v-4h-3v12h6zM12 22V2M3 22h18" /></svg> 
  },
  { 
    id: 'dashboard', 
    title: 'Markets Dashboard', 
    desc: 'Global market pulse, top movers heatmap, derivatives sentiment, liquidation feed, DeFi flows, and breaking crypto news — all in one view.', 
    macImg: '/mockups/mac-dashboard.png',
    phoneImg: '/mockups/phone-dashboard.png',
    icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v14a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4z" /></svg> 
  }
];

const FeatureSliderSection = () => {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    const iv = setInterval(() => {
      setActiveIdx((prev) => {
        const nextIdx = (prev + 1) % FEATURES.length;
        scrollToActiveTab(nextIdx);
        return nextIdx;
      });
    }, 7000);
    return () => clearInterval(iv);
  }, []);

  const scrollNav = (direction) => {
    if (scrollContainerRef.current) {
      const scrollAmount = 300;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const scrollToActiveTab = (index) => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const tabElement = container.children[index];
      if (tabElement) {
        const scrollPosition = tabElement.offsetLeft - (container.offsetWidth / 2) + (tabElement.offsetWidth / 2);
        container.scrollTo({ left: scrollPosition, behavior: 'smooth' });
      }
    }
  };

  const handleTabClick = (idx) => {
    setActiveIdx(idx);
    scrollToActiveTab(idx);
  };

  return (
    <section className="relative z-10 w-full pt-20 lg:pt-28 pb-16 lg:pb-24 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-gold-primary/20 bg-gold-primary/5 rounded-full mb-4">
          <span className="text-gold-primary font-mono text-[9px] uppercase tracking-[0.3em]">Core Technology</span>
        </div>
        <h2 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4">
          Interactive <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark">Terminal Preview</span>
        </h2>
        {/* COPY BARU: Lebih realistis, tanpa "institutional traders" */}
        <p className="text-text-secondary text-sm lg:text-base max-w-2xl mx-auto">
          Explore the analytical tools that give you a clear quantitative edge, now unified in one dashboard.
        </p>
      </div>

      {/* 1. HORIZONTAL NAVIGATION TABS WITH CONTROLLERS */}
      <div className="w-full relative max-w-7xl mx-auto mb-8 px-4 lg:px-12">
        <button 
          onClick={() => scrollNav('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 hidden lg:flex items-center justify-center rounded-full bg-[#0a0805] border border-white/10 text-white/50 hover:text-gold-primary hover:border-gold-primary/50 shadow-xl transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>

        <div className="absolute left-4 lg:left-12 top-0 bottom-0 w-8 lg:w-16 bg-gradient-to-r from-bg-primary to-transparent z-10 pointer-events-none" />
        <div className="absolute right-4 lg:right-12 top-0 bottom-0 w-8 lg:w-16 bg-gradient-to-l from-bg-primary to-transparent z-10 pointer-events-none" />
        
        <div 
          ref={scrollContainerRef}
          className="flex overflow-x-auto gap-3 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] px-4 py-2"
        >
          {FEATURES.map((feat, idx) => (
            <button
              key={feat.id}
              onClick={() => handleTabClick(idx)}
              className={`flex items-center gap-2.5 px-5 py-3.5 rounded-2xl flex-shrink-0 snap-center transition-all duration-300 border ${
                activeIdx === idx 
                  ? 'bg-gradient-to-r from-gold-primary/10 to-gold-dark/10 border-gold-primary/40 shadow-[0_0_20px_rgba(212,168,83,0.15)] text-white scale-105' 
                  : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/5 text-text-muted hover:text-white/80'
              }`}
            >
              <div className={activeIdx === idx ? 'text-gold-primary' : 'text-current opacity-70'}>
                {feat.icon}
              </div>
              <span className="font-semibold text-sm lg:text-base tracking-wide whitespace-nowrap">{feat.title}</span>
            </button>
          ))}
        </div>

        <button 
          onClick={() => scrollNav('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 hidden lg:flex items-center justify-center rounded-full bg-[#0a0805] border border-white/10 text-white/50 hover:text-gold-primary hover:border-gold-primary/50 shadow-xl transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* 2. ACTIVE DESCRIPTION TEXT */}
      <div className="max-w-3xl mx-auto px-4 text-center mb-10 lg:mb-12 h-[80px] sm:h-[60px] flex items-center justify-center">
        <p key={activeIdx} className="text-text-secondary text-sm lg:text-base leading-relaxed animate-[fadeIn_0.5s_ease-out]">
          {FEATURES[activeIdx].desc}
        </p>
      </div>

      {/* 3. CENTERED MOCKUPS (Mac & iPhone) */}
      <div className="relative max-w-5xl mx-auto px-4 lg:px-8 flex justify-center items-center mt-4 mb-16 lg:mb-24">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-gold-primary/10 blur-[120px] rounded-full pointer-events-none -z-10" />
        
        {/* Mac Mockup */}
        <div className="relative w-full max-w-[850px] aspect-[16/10] bg-[#0a0805] rounded-xl sm:rounded-2xl lg:rounded-3xl border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.6)] lg:shadow-[0_30px_80px_rgba(0,0,0,0.8)] overflow-hidden z-10 transition-all duration-500">
          
          <div className="h-6 lg:h-8 bg-[#1a1a1a] flex items-center px-4 gap-2 border-b border-white/5 w-full absolute top-0 z-20">
            <div className="w-2 h-2 lg:w-3 lg:h-3 rounded-full bg-red-500/80" />
            <div className="w-2 h-2 lg:w-3 lg:h-3 rounded-full bg-yellow-500/80" />
            <div className="w-2 h-2 lg:w-3 lg:h-3 rounded-full bg-green-500/80" />
            <div className="mx-auto bg-black/40 px-6 py-0.5 rounded text-[8px] lg:text-[10px] text-white/30 font-mono tracking-widest">
              luxquant.tw
            </div>
          </div>
          
          <div className="relative w-full h-full pt-6 lg:pt-8 bg-gradient-to-b from-transparent to-[#050302]">
            {FEATURES.map((feat, idx) => (
              <img 
                key={`mac-${feat.id}`}
                src={feat.macImg}
                alt={`${feat.title} Desktop`}
                className={`absolute top-6 lg:top-8 left-0 w-full h-[calc(100%-1.5rem)] lg:h-[calc(100%-2rem)] object-cover object-top transition-all duration-700 ease-in-out ${
                  activeIdx === idx ? 'opacity-100 z-10 scale-100' : 'opacity-0 z-0 scale-[1.02]'
                }`}
                onError={(e) => { 
                  e.target.style.display = 'none'; 
                  e.target.parentElement.innerHTML += `<div class="absolute inset-0 flex items-center justify-center text-white/20 text-xs font-mono opacity-${activeIdx === idx ? '100' : '0'}">Screenshot Mac (${feat.macImg})</div>`;
                }}
              />
            ))}
          </div>
        </div>

        {/* iPhone Mockup */}
        {/* PERBAIKAN: Posisi right-2 sm:-right-6, ukuran lebih proporsional, border lebih tipis di mobile agar tidak makan tempat */}
        <div className="absolute -bottom-6 right-2 sm:-bottom-8 sm:-right-6 lg:-bottom-12 lg:-right-12 w-[100px] sm:w-[150px] lg:w-[190px] xl:w-[220px] aspect-[9/19.5] bg-[#050302] border-[3px] sm:border-[4px] lg:border-[6px] border-[#2a2a2a] rounded-[1rem] sm:rounded-2xl lg:rounded-3xl shadow-[0_15px_30px_rgba(0,0,0,0.8)] lg:shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden z-20 transition-all duration-500">
          <div className="absolute top-0 inset-x-0 h-3 lg:h-5 bg-[#2a2a2a] rounded-b-md lg:rounded-b-xl w-[40%] mx-auto z-30" />
          
          <div className="relative w-full h-full bg-[#0a0805]">
             {FEATURES.map((feat, idx) => (
               <img 
                key={`phone-${feat.id}`}
                src={feat.phoneImg}
                alt={`${feat.title} Mobile`}
                className={`absolute inset-0 w-full h-full object-cover object-top transition-all duration-700 ease-in-out ${
                  activeIdx === idx ? 'opacity-100 z-10 scale-100' : 'opacity-0 z-0 scale-105'
                }`}
                onError={(e) => { 
                  e.target.style.display = 'none';
                  e.target.parentElement.innerHTML += `<div class="absolute inset-0 flex flex-col items-center justify-center text-center text-white/20 text-[6px] lg:text-[8px] font-mono px-2 opacity-${activeIdx === idx ? '100' : '0'}">Screenshot HP (${feat.phoneImg})</div>`;
                }}
              />
             ))}
          </div>
        </div>
      </div>

      {/* 4. "...AND MUCH MORE" FOOTER BANNER */}
      <div className="max-w-4xl mx-auto px-4 relative z-20">
        <div className="p-6 lg:p-8 rounded-2xl border border-dashed border-gold-primary/30 bg-gradient-to-b from-white/[0.02] to-transparent text-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-gold-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <h3 className="font-display text-xl lg:text-2xl font-bold text-white mb-2 italic">
            ...and much <span className="text-gold-primary">more</span>
          </h3>
          <p className="text-text-secondary text-sm lg:text-base leading-relaxed max-w-2xl mx-auto">
            Everything else a serious trader needs, already built in and waiting for you inside the terminal. No extra plugins, no hidden fees.
          </p>
        </div>
      </div>

    </section>
  );
};

export default FeatureSliderSection;