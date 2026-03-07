import { useState, useEffect } from 'react';

const FEATURES = [
  { 
    id: 'signals', 
    title: 'Algorithmic Signals', 
    desc: 'Precise entry, multiple take-profit targets, and strict stop-loss levels — auto-delivered 24/7 with risk scoring and volume ranking on every single call.', 
    macImg: '/mockups/mac-signals.png',
    phoneImg: '/mockups/phone-signals.png',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg> 
  },
  { 
    id: 'proof', 
    title: 'Visual Trade Proof', 
    desc: "We don't just call trades — we prove them. Branded before-and-after chart captures with a step-by-step journey timeline from entry to each TP hit. Full transparency to keep your trust earned, not assumed.", 
    macImg: '/mockups/mac-proof.png',
    phoneImg: '/mockups/phone-proof.png',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> 
  },
  { 
    id: 'research', 
    title: 'Built-in Coin Research', 
    desc: 'Tap any signal and instantly access full coin analysis — historical signal performance, price action context, market cap data, and past win/loss records. Your due diligence, already done.', 
    macImg: '/mockups/mac-research.png',
    phoneImg: '/mockups/phone-research.png',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> 
  },
  { 
    id: 'ai-researcher', 
    title: 'AI Market Researcher', 
    desc: 'A dedicated AI analyst processing millions of data points per hour — price action, derivatives flow, on-chain metrics, sentiment, and breaking news — compressed into one clear market verdict with full reasoning transparency.', 
    macImg: '/mockups/mac-ai.png',
    phoneImg: '/mockups/phone-ai.png',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> 
  },
  { 
    id: 'whale', 
    title: 'Whale Surveillance', 
    desc: 'See what the big players are doing before the crowd reacts. Real-time tracking of massive transfers and exchange flows across major blockchains.', 
    macImg: '/mockups/mac-whale.png',
    phoneImg: '/mockups/phone-whale.png',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> 
  },
  { 
    id: 'orderbook', 
    title: 'Order Book Heatmap', 
    desc: 'Spot hidden liquidity walls and know exactly where the real support and resistance sit — straight from live order flow data.', 
    macImg: '/mockups/mac-orderbook.png',
    phoneImg: '/mockups/phone-orderbook.png',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg> 
  },
  { 
    id: 'dashboard', 
    title: 'Markets Dashboard', 
    desc: 'Global market pulse, top movers heatmap, derivatives sentiment, liquidation feed, DeFi flows, and breaking crypto news — all in one view.', 
    macImg: '/mockups/mac-dashboard.png',
    phoneImg: '/mockups/phone-dashboard.png',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg> 
  }
];

const FeatureSliderSection = () => {
  const [activeIdx, setActiveIdx] = useState(0);

  // Auto-slide every 6 seconds (dinaikkan sedikit karena teksnya lebih panjang)
  useEffect(() => {
    const iv = setInterval(() => setActiveIdx((prev) => (prev + 1) % FEATURES.length), 6000);
    return () => clearInterval(iv);
  }, []);

  return (
    <section className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 py-20 lg:py-28 overflow-hidden">
      <div className="text-center mb-12 lg:mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-gold-primary/20 bg-gold-primary/5 rounded-full mb-4">
          <span className="text-gold-primary font-mono text-[9px] uppercase tracking-[0.3em]">Core Technology</span>
        </div>
        <h2 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4">
          Interactive <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark">Terminal Preview</span>
        </h2>
        <p className="text-text-secondary text-sm lg:text-base max-w-2xl mx-auto">
          Explore the tools that give institutional traders their edge, now unified in one dashboard.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* LFT: Feature List Navigation */}
        <div className="lg:col-span-4 flex flex-col gap-3 relative z-20">
          {FEATURES.map((feat, idx) => (
            <div 
              key={feat.id} 
              onClick={() => setActiveIdx(idx)}
              className={`p-4 rounded-xl cursor-pointer transition-all duration-300 border ${
                activeIdx === idx 
                  ? 'bg-gradient-to-r from-gold-primary/10 to-transparent border-gold-primary/40 shadow-[0_0_20px_rgba(212,168,83,0.1)]' 
                  : 'bg-transparent border-transparent hover:border-white/10 hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
                  activeIdx === idx ? 'bg-gold-primary text-[#0a0506]' : 'bg-white/5 text-gold-primary/70'
                }`}>
                  {feat.icon}
                </div>
                <h3 className={`font-bold ${activeIdx === idx ? 'text-white' : 'text-white/60'}`}>{feat.title}</h3>
              </div>
              {activeIdx === idx && (
                <p className="text-text-secondary text-sm leading-relaxed mt-2 animate-[fadeIn_0.5s_ease-out]">
                  {feat.desc}
                </p>
              )}
            </div>
          ))}

          {/* "...and much more" Block */}
          <div className="p-4 rounded-xl border border-dashed border-white/10 mt-2 bg-white/[0.02]">
            <h3 className="font-bold text-white/80 italic mb-1">...and much more</h3>
            <p className="text-text-muted text-xs leading-relaxed">
              Everything else a serious trader needs, already built in and waiting for you inside the terminal.
            </p>
          </div>
        </div>

        {/* RGT: Mockups (Mac & iPhone) */}
        <div className="lg:col-span-8 relative flex justify-center lg:justify-end mt-10 lg:mt-0 px-4 sm:px-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-gold-primary/10 blur-[100px] rounded-full pointer-events-none"></div>
          
          {/* Mac Mockup Container */}
          <div className="relative w-full max-w-[700px] aspect-[16/10] bg-[#0a0805] rounded-2xl border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden z-10 transition-all duration-500">
            {/* Mac Topbar */}
            <div className="h-6 lg:h-8 bg-[#1a1a1a] flex items-center px-4 gap-2 border-b border-white/5 w-full absolute top-0 z-20">
              <div className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-red-500/80"></div>
              <div className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-green-500/80"></div>
              <div className="mx-auto bg-black/40 px-6 py-0.5 rounded text-[8px] lg:text-[10px] text-white/30 font-mono">terminal.luxquant.tw</div>
            </div>
            
            {/* Mac Dynamic Image Content */}
            <div className="relative w-full h-full pt-6 lg:pt-8 bg-gradient-to-b from-transparent to-[#050302]">
              {FEATURES.map((feat, idx) => (
                <img 
                  key={`mac-${feat.id}`}
                  src={feat.macImg}
                  alt={`${feat.title} Desktop View`}
                  className={`absolute top-6 lg:top-8 left-0 w-full h-[calc(100%-1.5rem)] lg:h-[calc(100%-2rem)] object-cover object-top transition-opacity duration-700 ease-in-out ${
                    activeIdx === idx ? 'opacity-100 z-10' : 'opacity-0 z-0'
                  }`}
                  // Fallback gaya jika gambar belum diupload
                  onError={(e) => { 
                    e.target.style.display = 'none'; 
                    e.target.parentElement.innerHTML += `<div class="absolute inset-0 flex items-center justify-center text-white/20 text-xs font-mono opacity-${activeIdx === idx ? '100' : '0'}">Screenshot Desktop ${feat.title} (Upload di ${feat.macImg})</div>`;
                  }}
                />
              ))}
            </div>
          </div>

          {/* iPhone Mockup (Overlapping Container) */}
          <div className="absolute -bottom-8 -right-4 lg:-right-8 w-[120px] sm:w-[140px] lg:w-[170px] aspect-[9/19.5] bg-[#050302] border-[4px] lg:border-[6px] border-[#2a2a2a] rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.9)] overflow-hidden z-20 transition-all duration-500">
            {/* iPhone Notch */}
            <div className="absolute top-0 inset-x-0 h-4 bg-[#2a2a2a] rounded-b-xl w-1/3 mx-auto z-30"></div>
            
            {/* iPhone Dynamic Image Content */}
            <div className="relative w-full h-full bg-[#0a0805]">
               {FEATURES.map((feat, idx) => (
                 <img 
                  key={`phone-${feat.id}`}
                  src={feat.phoneImg}
                  alt={`${feat.title} Mobile View`}
                  className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-700 ease-in-out ${
                    activeIdx === idx ? 'opacity-100 z-10' : 'opacity-0 z-0'
                  }`}
                  // Fallback gaya jika gambar belum diupload
                  onError={(e) => { 
                    e.target.style.display = 'none';
                    e.target.parentElement.innerHTML += `<div class="absolute inset-0 flex flex-col items-center justify-center text-center text-white/20 text-[8px] font-mono px-2 opacity-${activeIdx === idx ? '100' : '0'}">Screenshot HP<br/>(Upload di ${feat.phoneImg})</div>`;
                  }}
                />
               ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeatureSliderSection;