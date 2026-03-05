// src/components/landing/LandingPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import TopPerformers from '../TopPerformers';
import CoinLogo from '../CoinLogo';
import { GlobeViz, FlagBadges } from '../auth/LeftBrandPanel';

// ════════════════════════════════════════
// Ticker Bar
// ════════════════════════════════════════
const TICKER_COINS = [
  { id: 'bitcoin', symbol: 'BTC', cmcId: 1 },
  { id: 'ethereum', symbol: 'ETH', cmcId: 1027 },
  { id: 'binancecoin', symbol: 'BNB', cmcId: 1839 },
  { id: 'solana', symbol: 'SOL', cmcId: 5426 },
  { id: 'ripple', symbol: 'XRP', cmcId: 52 },
  { id: 'cardano', symbol: 'ADA', cmcId: 2010 },
  { id: 'dogecoin', symbol: 'DOGE', cmcId: 74 },
  { id: 'chainlink', symbol: 'LINK', cmcId: 1975 },
];

const TickerBar = () => {
  const [prices, setPrices] = useState([]);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const ids = TICKER_COINS.map(c => c.id).join(',');
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
        if (res.ok) {
          const data = await res.json();
          setPrices(TICKER_COINS.map(c => ({
            ...c,
            price: data[c.id]?.usd || 0,
            change: data[c.id]?.usd_24h_change || 0,
          })));
        }
      } catch (e) { console.warn('Ticker fetch failed:', e); }
    };
    fetchPrices();
    const iv = setInterval(fetchPrices, 60000);
    return () => clearInterval(iv);
  }, []);

  if (prices.length === 0) return null;
  const items = [...prices, ...prices, ...prices];

  return (
    <div className="w-full bg-black/60 backdrop-blur-md border-b border-gold-primary/10 overflow-hidden h-10 flex items-center">
      <div className="flex animate-[tickerScroll_40s_linear_infinite] whitespace-nowrap gap-8 px-4">
        {items.map((coin, i) => (
          <div key={i} className="flex items-center gap-2 text-xs flex-shrink-0">
            <img src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.cmcId}.png`} alt={coin.symbol} className="w-4 h-4 rounded-full" onError={(e) => { e.target.style.display = 'none'; }} />
            <span className="text-text-secondary font-semibold">{coin.symbol}</span>
            <span className="text-white font-mono">${coin.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            <span className={`font-mono font-semibold ${coin.change >= 0 ? 'text-positive' : 'text-negative'}`}>
              {coin.change >= 0 ? '+' : ''}{coin.change?.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
      <style>{`@keyframes tickerScroll { from { transform: translateX(0); } to { transform: translateX(-33.333%); } }`}</style>
    </div>
  );
};

// ════════════════════════════════════════
// Feature & Testimonial Cards
// ════════════════════════════════════════
const FeatureCard = ({ icon, title, desc }) => (
  <div className="glass-card rounded-xl p-6 lg:p-8 border border-gold-primary/10 hover:border-gold-primary/30 transition-all duration-300 group">
    <div className="w-12 h-12 rounded-xl bg-gold-primary/10 border border-gold-primary/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
      <span className="text-2xl">{icon}</span>
    </div>
    <h3 className="font-display text-lg font-bold text-white mb-2 group-hover:text-gold-primary transition-colors">{title}</h3>
    <p className="text-text-secondary text-sm leading-relaxed">{desc}</p>
  </div>
);

const TestimonialCard = ({ name, role, text, flag }) => (
  <div className="glass-card rounded-xl p-6 border border-gold-primary/10">
    <div className="flex items-center gap-1 mb-3">
      {[...Array(5)].map((_, i) => (
        <svg key={i} className="w-4 h-4 text-gold-primary" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
    <p className="text-text-secondary text-sm leading-relaxed mb-4 italic">"{text}"</p>
    <div className="flex items-center gap-2">
      <span className="text-lg">{flag}</span>
      <div>
        <p className="text-white text-sm font-semibold">{name}</p>
        <p className="text-text-muted text-xs">{role}</p>
      </div>
    </div>
  </div>
);

// ════════════════════════════════════════
// Mac + Phone Showcase Component
// ════════════════════════════════════════
const SHOWCASE_SLIDES = [
  {
    title: "Algorithm-Powered Analysis",
    desc: "Advanced quantitative algorithms analyze market patterns 24/7 across multiple timeframes to spot the best opportunities.",
    macImg: "/LuxQuant Performance Dashboard.png", 
    phoneImg: "/fiturlq1.png"
  },
  {
    title: "Instant Notifications",
    desc: "Real-time alerts directly to your Telegram or Dashboard when important zones and trade setups are detected.",
    macImg: "/LuxQuant Performance Dashboard.png",
    phoneImg: "/fiturlq2.png"
  },
  {
    title: "Complete Trade Setup",
    desc: "Every signal includes precise entry points, multiple targets (TP1-TP4), strict stop-loss levels, and risk assessment.",
    macImg: "/LuxQuant Performance Dashboard.png",
    phoneImg: "/fiturlq3.png"
  },
  {
    title: "Performance Tracking",
    desc: "Monitor the algorithm's historical win rates and real-time active trades seamlessly on any device.",
    macImg: "/LuxQuant Performance Dashboard.png",
    phoneImg: "/fiturlq4.png"
  }
];

const PlatformShowcase = () => {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SHOWCASE_SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 mt-12 mb-16">
      <div className="text-center mb-16">
        <p className="text-gold-primary text-xs font-semibold uppercase tracking-[0.2em] mb-3">Platform Experience</p>
        <h2 className="font-display text-3xl lg:text-4xl font-bold text-white mb-4">Seamless Across All Devices</h2>
        <p className="text-text-secondary text-base max-w-xl mx-auto">Monitor signals from your desktop or on-the-go with your mobile device.</p>
      </div>

      <div className="relative w-full max-w-4xl mx-auto">
        <div className="relative w-full aspect-[16/9] bg-[#1a1a1a] rounded-t-xl rounded-b-lg border border-white/10 shadow-2xl z-10">
          <div className="h-6 sm:h-8 bg-[#2a2a2a] rounded-t-xl flex items-center px-4 gap-2 border-b border-black/50">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></div>
          </div>
          <div className="relative w-full h-[calc(100%-1.5rem)] sm:h-[calc(100%-2rem)] bg-black overflow-hidden rounded-b-lg">
            <div className="flex h-full transition-transform duration-700 ease-out" style={{ transform: `translateX(-${currentSlide * 100}%)` }}>
              {SHOWCASE_SLIDES.map((slide, idx) => (
                <div key={idx} className="min-w-full h-full">
                  <img src={slide.macImg} alt="Desktop View" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute -bottom-10 -right-2 sm:-bottom-16 sm:-right-8 w-[120px] sm:w-[180px] md:w-[220px] aspect-[9/19] bg-black border-[4px] sm:border-[6px] border-[#1f2937] rounded-3xl sm:rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.7)] z-20 overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-4 sm:h-5 bg-[#1f2937] w-1/2 mx-auto rounded-b-xl z-30"></div>
          <div className="flex h-full transition-transform duration-700 ease-out" style={{ transform: `translateX(-${currentSlide * 100}%)` }}>
            {SHOWCASE_SLIDES.map((slide, idx) => (
              <div key={idx} className="min-w-full h-full bg-bg-primary">
                <img src={slide.phoneImg} alt="Mobile View" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative h-40 max-w-2xl mx-auto text-center mt-20 sm:mt-24">
        {SHOWCASE_SLIDES.map((slide, idx) => (
          <div key={idx} className={`absolute inset-0 transition-all duration-500 ${idx === currentSlide ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
            <h3 className="font-display text-xl sm:text-2xl font-bold text-gold-primary mb-3">{slide.title}</h3>
            <p className="text-text-secondary text-sm sm:text-base leading-relaxed px-4">{slide.desc}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-center items-center gap-6 mt-2">
        <button onClick={() => setCurrentSlide((prev) => (prev - 1 + SHOWCASE_SLIDES.length) % SHOWCASE_SLIDES.length)} className="w-10 h-10 rounded-full bg-bg-card border border-gold-primary/20 text-gold-primary hover:bg-gold-primary/10 transition-colors flex items-center justify-center">❮</button>
        <div className="flex gap-3">
          {SHOWCASE_SLIDES.map((_, idx) => (
            <button key={idx} onClick={() => setCurrentSlide(idx)} className={`w-2.5 h-2.5 rounded-full transition-all ${idx === currentSlide ? 'bg-gold-primary scale-125' : 'bg-white/20 hover:bg-white/40'}`} />
          ))}
        </div>
        <button onClick={() => setCurrentSlide((prev) => (prev + 1) % SHOWCASE_SLIDES.length)} className="w-10 h-10 rounded-full bg-bg-card border border-gold-primary/20 text-gold-primary hover:bg-gold-primary/10 transition-colors flex items-center justify-center">❯</button>
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// FAQ & Telegram Promo Components
// ════════════════════════════════════════
const FAQ_DATA = [
  {
    q: "Is it suitable for beginners?",
    a: "Absolutely! Our signals provide comprehensive details including exact entry points, multiple profit targets (TP1-TP4), and strict stop-loss (SL) levels. You just need to follow the provided numbers on your preferred exchange."
  },
  {
    q: "What is the recommended starting capital?",
    a: "While there is no strict minimum, we recommend starting with at least $100 - $500 for proper risk management. This allows you to safely distribute your capital across multiple algorithm signals."
  },
  {
    q: "What happens if the algorithm makes a wrong prediction (Loss)?",
    a: "Trading always carries risk, and no algorithm wins 100% of the time. That's why every single signal includes a strict Stop-Loss (SL) level to protect your capital. Our algorithm is mathematically designed to win more trades with a highly positive Risk:Reward ratio over time."
  },
  {
    q: "Do I need to monitor the screen 24/7?",
    a: "Not at all. Our system operates 24/7 and sends real-time push notifications directly to your Telegram or Dashboard the moment a high-probability setup is detected. You can trade on the go."
  }
];

const FAQItem = ({ q, a, isOpen, onClick }) => (
  <div className="glass-card border border-gold-primary/10 rounded-xl overflow-hidden mb-3 transition-all duration-300 hover:border-gold-primary/30">
    <button className="w-full px-6 py-5 text-left flex justify-between items-center focus:outline-none" onClick={onClick}>
      <span className="font-semibold text-white pr-4 text-sm lg:text-base">{q}</span>
      <span className={`text-gold-primary transform transition-transform duration-300 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
    </button>
    <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}>
      <div className="px-6 pb-5 text-text-secondary text-sm leading-relaxed border-t border-gold-primary/5 pt-4">
        {a}
      </div>
    </div>
  </div>
);

const TelegramPromo = () => (
  <div className="glass-card rounded-3xl p-8 lg:p-12 border border-[#229ED9]/30 bg-gradient-to-br from-bg-primary via-bg-card to-[#0a192f] overflow-hidden relative mt-16 shadow-[0_0_40px_rgba(34,158,217,0.1)]">
    <div className="flex flex-col lg:flex-row items-center gap-10 relative z-10">
      <div className="flex-1 text-center lg:text-left">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#229ED9]/10 border border-[#229ED9]/20 mb-6">
          <span className="w-2 h-2 bg-[#229ED9] rounded-full animate-pulse" />
          <span className="text-[#229ED9] text-xs font-semibold uppercase tracking-wider">Free Community</span>
        </div>
        <h2 className="font-display text-3xl lg:text-4xl font-bold text-white mb-4">Try Our <span className="text-[#229ED9]">Free</span> Signals</h2>
        <p className="text-text-secondary mb-8 text-lg leading-relaxed">
          Still hesitating? Join our public Telegram channel today. Enjoy daily market updates, educational insights, and selected free algorithm signals every week.
        </p>
        <a href="https://t.me/luxquant" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 px-8 py-4 rounded-xl font-bold text-sm bg-[#229ED9] text-white hover:bg-[#1D88BA] transition-all hover:scale-105 shadow-[0_0_20px_rgba(34,158,217,0.3)]">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.504-1.36 8.629-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
          Join Free Telegram
        </a>
      </div>
      
      <div className="flex-1 flex justify-center lg:justify-end relative mt-8 lg:mt-0">
        <div className="relative w-[220px] lg:w-[240px] h-[440px] lg:h-[480px] bg-[#0a0506] border-[6px] border-[#1f2937] rounded-[2.5rem] overflow-hidden shadow-2xl z-10">
          <div className="absolute top-0 inset-x-0 h-5 lg:h-6 bg-[#1f2937] rounded-b-2xl w-1/2 mx-auto z-20"></div>
          <img src="/telegram-ss.png" alt="Telegram Channel Free" className="w-full h-full object-cover" />
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-[#229ED9]/20 blur-3xl rounded-full"></div>
      </div>
    </div>
  </div>
);

// ════════════════════════════════════════
// Live Performance Stats
// ════════════════════════════════════════
const FIRST_SIGNAL_DATE = new Date('2023-12-27T13:25:00Z');

const formatRuntime = (ms) => {
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hrs = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return { days, hrs, mins, secs };
};

const RuntimeCounter = () => {
  const [runtime, setRuntime] = useState(formatRuntime(Date.now() - FIRST_SIGNAL_DATE.getTime()));
  useEffect(() => {
    const iv = setInterval(() => setRuntime(formatRuntime(Date.now() - FIRST_SIGNAL_DATE.getTime())), 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="glass-card rounded-xl p-5 lg:p-6 border border-gold-primary/20 col-span-2 lg:col-span-4">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-positive rounded-full animate-pulse" />
          <div>
            <p className="text-white font-semibold text-sm lg:text-base">Algorithm Running Since</p>
            <p className="text-text-muted text-xs">First signal: 27 December 2023, 13:25 UTC</p>
          </div>
        </div>
        <div className="flex items-center gap-2 lg:gap-3">
          {[
            { val: runtime.days, label: 'Days' },
            { val: runtime.hrs, label: 'Hours' },
            { val: runtime.mins, label: 'Min' },
            { val: runtime.secs, label: 'Sec' },
          ].map(({ val, label }) => (
            <div key={label} className="text-center">
              <div className="bg-bg-primary border border-gold-primary/20 rounded-lg px-3 py-2 min-w-[52px]">
                <span className="text-gold-primary font-mono text-lg lg:text-xl font-bold">{String(val).padStart(2, '0')}</span>
              </div>
              <p className="text-text-muted text-[9px] mt-1 uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const LivePerformanceStats = ({ data }) => {
  const navigate = useNavigate();
  const stats = data?.stats;
  const goPerf = () => navigate('/terminal?tab=analytics');

  const winRate = stats?.win_rate ?? 0;
  const totalSignals = stats?.total_signals ?? 0;
  const closedTrades = stats?.closed_trades ?? 0;
  const totalWinners = stats?.total_winners ?? 0;
  const slCount = stats?.sl_count ?? 0;
  const activePairs = stats?.active_pairs ?? 0;
  const tp1 = stats?.tp1_count ?? 0;
  const tp2 = stats?.tp2_count ?? 0;
  const tp3 = stats?.tp3_count ?? 0;
  const tp4 = stats?.tp4_count ?? 0;
  const openSignals = stats?.open_signals ?? 0;

  const outcomeItems = [
    { label: 'TP1', count: tp1, color: '#22C55E' },
    { label: 'TP2', count: tp2, color: '#84CC16' },
    { label: 'TP3', count: tp3, color: '#EAB308' },
    { label: 'TP4', count: tp4, color: '#F97316' },
    { label: 'SL',  count: slCount, color: '#EF4444' },
  ];
  const outcomeTotal = outcomeItems.reduce((s, i) => s + i.count, 0);

  const riskDist = data?.risk_distribution || [];
  const riskColors = {
    'Low': { text: 'text-green-400', dot: 'bg-green-500', bar: '#22C55E', border: 'border-green-500/20', bg: 'from-green-500/[0.06]' },
    'Normal': { text: 'text-yellow-400', dot: 'bg-yellow-500', bar: '#EAB308', border: 'border-yellow-500/20', bg: 'from-yellow-500/[0.06]' },
    'High': { text: 'text-red-400', dot: 'bg-red-500', bar: '#EF4444', border: 'border-red-500/20', bg: 'from-red-500/[0.06]' },
  };
  const riskTotal = riskDist.reduce((s, r) => s + (r.total_signals || 0), 0);

  return (
    <div>
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold-primary/10 border border-gold-primary/20 mb-5">
          <span className="text-base">🇹🇼</span>
          <span className="text-gold-primary text-xs font-semibold tracking-wide">Built in Taiwan · Running Since 2023</span>
        </div>

        <h2 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4">
          Transparent & <span className="text-gold-primary">Verified</span> Performance
        </h2>
        <p className="text-text-secondary text-base lg:text-lg max-w-2xl mx-auto leading-relaxed">
          Every signal is recorded on-chain since day one. Full history, no hidden trades, no cherry-picking — 
          <span className="text-white font-medium"> {stats ? totalSignals.toLocaleString() : '...'} signals</span> and counting.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-4">
        <RuntimeCounter />
      </div>

      <div onClick={goPerf} className="cursor-pointer group">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3 mb-4">
          <div className="rounded-xl p-3 lg:p-4 border bg-gradient-to-b from-gold-primary/[0.08] to-transparent border-gold-primary/20 group-hover:border-gold-primary/40 transition-all">
            <p className="text-text-muted text-[9px] lg:text-[10px] uppercase tracking-wider font-medium mb-1">Win Rate</p>
            <p className={`text-xl lg:text-2xl font-bold font-mono leading-none ${winRate >= 75 ? 'text-green-400' : winRate >= 55 ? 'text-yellow-400' : 'text-red-400'}`}>
              {stats ? `${winRate.toFixed(1)}%` : '—'}
            </p>
          </div>
          <div className="rounded-xl p-3 lg:p-4 bg-bg-card/30 border border-white/[0.04] group-hover:border-gold-primary/10 transition-all">
            <p className="text-text-muted text-[9px] lg:text-[10px] uppercase tracking-wider font-medium mb-1">Closed Trades</p>
            <p className="text-xl lg:text-2xl font-bold font-mono leading-none text-white">{stats ? closedTrades.toLocaleString() : '—'}</p>
            <p className="text-text-muted text-[9px] mt-1">of {stats ? totalSignals.toLocaleString() : '—'}</p>
          </div>
          <div className="rounded-xl p-3 lg:p-4 bg-bg-card/30 border border-white/[0.04] group-hover:border-gold-primary/10 transition-all">
            <p className="text-text-muted text-[9px] lg:text-[10px] uppercase tracking-wider font-medium mb-1">Winners</p>
            <p className="text-xl lg:text-2xl font-bold font-mono leading-none text-green-400">{stats ? totalWinners.toLocaleString() : '—'}</p>
          </div>
          <div className="rounded-xl p-3 lg:p-4 bg-bg-card/30 border border-white/[0.04] group-hover:border-gold-primary/10 transition-all">
            <p className="text-text-muted text-[9px] lg:text-[10px] uppercase tracking-wider font-medium mb-1">Losses</p>
            <p className="text-xl lg:text-2xl font-bold font-mono leading-none text-red-400">{stats ? slCount.toLocaleString() : '—'}</p>
          </div>
          <div className="rounded-xl p-3 lg:p-4 bg-bg-card/30 border border-white/[0.04] group-hover:border-gold-primary/10 transition-all">
            <p className="text-text-muted text-[9px] lg:text-[10px] uppercase tracking-wider font-medium mb-1">Pairs Traded</p>
            <p className="text-xl lg:text-2xl font-bold font-mono leading-none text-gold-primary">{stats ? activePairs.toLocaleString() : '—'}</p>
          </div>
          <div className="rounded-xl p-3 lg:p-4 bg-bg-card/30 border border-white/[0.04] group-hover:border-gold-primary/10 transition-all">
            <p className="text-text-muted text-[9px] lg:text-[10px] uppercase tracking-wider font-medium mb-1">Not Hit</p>
            <p className="text-xl lg:text-2xl font-bold font-mono leading-none text-text-secondary">{stats ? openSignals.toLocaleString() : '—'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4 mb-4" onClick={goPerf} style={{ cursor: 'pointer' }}>
        <div className="glass-card rounded-2xl p-4 lg:p-6 border border-gold-primary/10 hover:border-gold-primary/25 transition-all">
          <h3 className="text-white font-semibold text-base lg:text-lg mb-1">Outcome Distribution</h3>
          <p className="text-text-muted text-[10px] lg:text-xs mb-4">{stats ? closedTrades.toLocaleString() : '—'} closed trades</p>
          {outcomeTotal > 0 ? (
            <div className="space-y-4">
              <div className="h-3 rounded-full overflow-hidden flex bg-bg-card/80 border border-white/5">
                {outcomeItems.filter(i => i.count > 0).map((item, idx) => {
                  const pct = (item.count / outcomeTotal * 100);
                  return (
                    <div key={idx} style={{ width: `${pct}%`, backgroundColor: item.color }}
                      className="h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full relative">
                      {pct > 10 && (
                        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/90 drop-shadow">
                          {pct.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="space-y-2">
                {outcomeItems.map((item) => {
                  const pct = outcomeTotal > 0 ? (item.count / outcomeTotal * 100) : 0;
                  return (
                    <div key={item.label} className="flex items-center gap-2.5">
                      <span className="text-[10px] font-bold w-6" style={{ color: item.color }}>{item.label}</span>
                      <div className="flex-1 h-2 rounded-full bg-bg-card/60 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: item.color }} />
                      </div>
                      <div className="flex items-center gap-1.5 min-w-[75px] justify-end">
                        <span className="text-white text-[11px] font-mono font-semibold">{item.count.toLocaleString()}</span>
                        <span className="text-text-muted text-[9px] font-mono w-[32px] text-right">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-gold-primary/20 border-t-gold-primary rounded-full animate-spin" />
            </div>
          )}
        </div>

        <div className="glass-card rounded-2xl p-4 lg:p-6 border border-gold-primary/10 hover:border-gold-primary/25 transition-all">
          <h3 className="text-white font-semibold text-base lg:text-lg mb-1">Risk Level Analysis</h3>
          <p className="text-text-muted text-[10px] lg:text-xs mb-4">Performance breakdown by signal risk level</p>
          {riskDist.length > 0 ? (
            <div className="space-y-3">
              {riskDist.map((rd) => {
                const c = riskColors[rd.risk_level] || riskColors['Normal'];
                const winPct = rd.closed_trades > 0 ? (rd.winners / rd.closed_trades * 100) : 0;
                const pct = riskTotal > 0 ? (rd.total_signals / riskTotal * 100).toFixed(1) : '0';
                return (
                  <div key={rd.risk_level} className={`rounded-xl p-3 lg:p-4 bg-gradient-to-b ${c.bg} to-transparent border ${c.border}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${c.dot}`} />
                        <span className={`font-bold text-sm ${c.text}`}>{rd.risk_level}</span>
                      </div>
                      <span className="text-text-muted text-[10px] font-mono">{pct}%</span>
                    </div>
                    <p className={`text-2xl lg:text-3xl font-bold font-mono ${c.text} leading-none mb-1`}>{rd.win_rate.toFixed(1)}%</p>
                    <p className="text-text-muted text-[9px] mb-2">Win Rate</p>
                    <div className="h-1.5 rounded-full overflow-hidden flex bg-bg-card/50 mb-1.5">
                      <div className="h-full bg-green-500/70 rounded-l-full" style={{ width: `${winPct}%` }} />
                      <div className="h-full bg-red-500/70 rounded-r-full" style={{ width: `${100 - winPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-green-400/80 font-mono">{rd.winners?.toLocaleString()} W</span>
                      <span className="text-red-400/80 font-mono">{rd.losers?.toLocaleString()} L</span>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center gap-3 pt-2">
                <div className="flex-1 h-2 rounded-full overflow-hidden flex bg-bg-card/80">
                  {riskDist.map((rd, i) => (
                    <div key={i} className="h-full" style={{ width: `${riskTotal > 0 ? (rd.total_signals / riskTotal * 100) : 0}%`, backgroundColor: (riskColors[rd.risk_level] || riskColors['Normal']).bar }} />
                  ))}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {riskDist.map((rd) => (
                    <div key={rd.risk_level} className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: (riskColors[rd.risk_level] || riskColors['Normal']).bar }} />
                      <span className="text-text-muted text-[9px]">{riskTotal > 0 ? (rd.total_signals / riskTotal * 100).toFixed(0) : 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-gold-primary/20 border-t-gold-primary rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 p-4 rounded-xl bg-gold-primary/5 border border-gold-primary/10 flex items-center gap-3">
          <span className="text-xl">🔒</span>
          <p className="text-text-secondary text-xs lg:text-sm leading-relaxed">
            <span className="text-white font-semibold">Every trade on record.</span>{' '}
            All {stats ? totalSignals.toLocaleString() : '...'} signals publicly verifiable — no edits, no deletions.
          </p>
        </div>
        <button onClick={goPerf}
          className="px-6 py-4 rounded-xl font-bold text-sm transition-all hover:scale-105 flex items-center justify-center gap-2 flex-shrink-0"
          style={{ background: 'linear-gradient(to right, #d4a853, #8b6914)', color: '#0a0506', boxShadow: '0 0 20px rgba(212, 168, 83, 0.3)' }}>
          View Full Analytics
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
        </button>
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// Coins flying out from phone one by one
// ════════════════════════════════════════

const PhoneFlyingCoins = ({ gainers }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const allCoins = gainers.slice(0, 10);

  useEffect(() => {
    if (allCoins.length === 0) return;
    const iv = setInterval(() => {
      setCurrentIdx(prev => (prev + 1) % allCoins.length);
    }, 2500);
    return () => clearInterval(iv);
  }, [allCoins.length]);

  if (allCoins.length === 0) return null;

  const item = allCoins[currentIdx];
  const symbol = item?.pair?.replace(/USDT$/i, '').replace(/^3A/, '') || '???';

  return (
    <div 
      key={currentIdx}
      className="absolute z-30"
      style={{
        top: '40%',
        left: '-140px',
        animation: 'coinFlyOut 2.5s ease-out both',
      }}
    >
      <div
        className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-gold-primary/25"
        style={{
          background: 'rgba(10,5,6,0.85)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 12px rgba(212,168,83,0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <CoinLogo pair={item.pair} size={20} />
        <span className="text-white text-xs font-bold">{symbol}</span>
        <span className="text-green-400 text-xs font-bold font-mono">+{item.gain_pct?.toFixed(1)}%</span>
      </div>
    </div>
  );
};

const MobileRotatingCoins = ({ gainers }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const allCoins = gainers.slice(0, 10);

  useEffect(() => {
    if (allCoins.length === 0) return;
    const iv = setInterval(() => setCurrentIdx(prev => (prev + 1) % allCoins.length), 2500);
    return () => clearInterval(iv);
  }, [allCoins.length]);

  if (allCoins.length === 0) return null;

  const item = allCoins[currentIdx];
  const symbol = item?.pair?.replace(/USDT$/i, '').replace(/^3A/, '') || '???';

  return (
    <div className="flex justify-center min-h-[36px]">
      <div 
        key={currentIdx}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gold-primary/15 bg-white/[0.03]"
        style={{ animation: 'coinFlyOut 2.5s ease-out both' }}
      >
        <CoinLogo pair={item.pair} size={16} />
        <span className="text-white text-[10px] font-bold">{symbol}</span>
        <span className="text-green-400 text-[10px] font-bold font-mono">+{item.gain_pct?.toFixed(1)}%</span>
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// LANDING PAGE MAIN COMPONENT
// ════════════════════════════════════════
const LandingPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  const [performanceData, setPerformanceData] = useState(null);
  const [topGainers, setTopGainers] = useState([]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/v1/signals/analyze?time_range=all&trend_mode=weekly');
        if (res.ok) setPerformanceData(await res.json());
      } catch (e) { console.warn('Stats fetch failed:', e); }
    };
    fetchStats();
  }, []);

  useEffect(() => {
    const fetchTopGainers = async () => {
      try {
        const res = await fetch('/api/v1/signals/top-performers?limit=10&days=7');
        if (res.ok) {
          const data = await res.json();
          setTopGainers(data?.top_gainers || []);
        }
      } catch (e) { console.warn('Top gainers fetch failed:', e); }
    };
    fetchTopGainers();
  }, []);

  const goTerminal = () => navigate('/terminal');
  const goLogin = () => navigate('/login');
  const goRegister = () => navigate('/register');
  const scrollTo = (id) => { setMobileMenuOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  const stats = performanceData?.stats;
  const dynamicTotalSignals = stats ? `${stats.total_signals.toLocaleString()}+` : '...';
  const dynamicWinRate = stats ? `${stats.win_rate.toFixed(1)}%` : '...';

  return (
    <div className="min-h-screen bg-bg-primary text-white relative pb-20 lg:pb-0"> 
      <div className="luxury-bg" />
      <style>{`@keyframes lq-spin { to { transform: rotate(360deg); } }`}</style>

      <TickerBar />

      {/* HEADER */}
      <header className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? 'bg-bg-primary/95 backdrop-blur-md border-b border-gold-primary/15 shadow-lg shadow-black/20' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <div className="flex items-center gap-2 cursor-pointer group" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <img src="/logo.png" alt="LuxQuant" className="w-10 h-10 object-cover rounded-xl group-hover:scale-105 transition-transform" />
              <h1 className="font-display text-lg font-semibold text-white tracking-wide group-hover:text-gold-primary transition-colors">LuxQuant</h1>
            </div>

            <nav className="hidden lg:flex items-center gap-6">
              {[['Home', 'hero'], ['Features', 'features'], ['How It Works', 'how-it-works'], ['Platform', 'platform'], ['Performance', 'performance']].map(([label, id]) => (
                <button key={id} onClick={() => scrollTo(id)} className="text-text-secondary hover:text-gold-primary text-sm font-medium transition-colors">{label}</button>
              ))}
              <a href="https://t.me/luxquant" target="_blank" rel="noopener noreferrer" className="text-text-secondary hover:text-gold-primary text-sm font-medium transition-colors">Telegram</a>
            </nav>

            <div className="hidden lg:flex items-center gap-3">
              {isAuthenticated ? (
                <button onClick={goTerminal} className="px-6 py-2.5 rounded-xl font-semibold text-sm" style={{ background: 'linear-gradient(to right, #d4a853, #8b6914)', color: '#0a0506', boxShadow: '0 0 20px rgba(212, 168, 83, 0.3)' }}>Open Terminal</button>
              ) : (
                <>
                  <button onClick={goLogin} className="text-text-secondary hover:text-white text-sm font-medium transition-colors">Login</button>
                  <button onClick={goRegister} className="px-6 py-2.5 rounded-xl font-semibold text-sm" style={{ background: 'linear-gradient(to right, #d4a853, #8b6914)', color: '#0a0506', boxShadow: '0 0 20px rgba(212, 168, 83, 0.3)' }}>Get Started</button>
                </>
              )}
            </div>

            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden p-2 text-text-secondary hover:text-white">
              <div className="w-5 h-4 flex flex-col justify-between">
                <span className={`block h-0.5 bg-current rounded-full transition-all duration-300 ${mobileMenuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
                <span className={`block h-0.5 bg-current rounded-full transition-all duration-200 ${mobileMenuOpen ? 'opacity-0' : ''}`} />
                <span className={`block h-0.5 bg-current rounded-full transition-all duration-300 ${mobileMenuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
              </div>
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden bg-bg-primary/98 backdrop-blur-xl border-t border-gold-primary/10 px-4 py-6 space-y-4">
            {[['Home', 'hero'], ['Features', 'features'], ['How It Works', 'how-it-works'], ['Platform', 'platform'], ['Performance', 'performance']].map(([label, id]) => (
              <button key={id} onClick={() => scrollTo(id)} className="block w-full text-left text-text-secondary hover:text-gold-primary text-sm font-medium py-2">{label}</button>
            ))}
            <a href="https://t.me/luxquant" target="_blank" rel="noopener noreferrer" className="block w-full text-left text-text-secondary hover:text-gold-primary text-sm font-medium py-2">Telegram</a>
            <div className="pt-4 border-t border-gold-primary/10 flex flex-col gap-3">
              {isAuthenticated ? (
                <button onClick={goTerminal} className="w-full py-3 rounded-xl font-semibold text-sm" style={{ background: 'linear-gradient(to right, #d4a853, #8b6914)', color: '#0a0506' }}>Open Terminal</button>
              ) : (
                <>
                  <button onClick={goLogin} className="w-full py-3 rounded-xl font-semibold text-sm border border-gold-primary/30 text-gold-primary">Login</button>
                  <button onClick={goRegister} className="w-full py-3 rounded-xl font-semibold text-sm" style={{ background: 'linear-gradient(to right, #d4a853, #8b6914)', color: '#0a0506' }}>Get Started</button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ════════════════════════════════════════
          HERO SECTION — REDESIGNED
      ════════════════════════════════════════ */}
      <section id="hero" className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pt-14 lg:pt-20 pb-16 lg:pb-28 overflow-visible">

        {/* Hero Keyframes */}
        <style>{`
          @keyframes heroCardFadeIn {
            from { opacity: 0; transform: translateY(20px) scale(0.97); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes heroGlowPulse {
            0%, 100% { opacity: 0.25; }
            50% { opacity: 0.55; }
          }
          @keyframes heroLineGrow {
            from { width: 0; }
            to { width: 56px; }
          }
          @keyframes floatPhone { 
            0%, 100% { transform: translateY(0px); } 
            50% { transform: translateY(-14px); } 
          }
          @keyframes coinFlyOut {
            0% { opacity: 0; transform: translateX(60px) scale(0.7); }
            15% { opacity: 1; transform: translateX(0) scale(1); }
            80% { opacity: 1; transform: translateX(0) scale(1); }
            100% { opacity: 0; transform: translateX(-30px) scale(0.9); }
          }
        `}</style>

        {/* Atmospheric Background Glows */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[700px] pointer-events-none -z-10">
          <div className="absolute inset-0 bg-gold-primary/[0.03] rounded-full blur-[150px]" style={{ animation: 'heroGlowPulse 6s ease-in-out infinite' }} />
          <div className="absolute top-20 -left-40 w-[400px] h-[400px] bg-[#8b1a1a]/[0.05] rounded-full blur-[120px]" />
          <div className="absolute -bottom-20 -right-20 w-[300px] h-[300px] bg-gold-primary/[0.04] rounded-full blur-[100px]" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-8 items-center relative z-10">

          {/* ═══ LEFT: Text Content ═══ */}
          <div className="relative z-20">

            {/* Accent Line + Live Badge */}
            <div className="flex items-center gap-3 mb-8" style={{ animation: 'heroCardFadeIn 0.6s ease-out 0.1s both' }}>
              <div className="h-px bg-gradient-to-r from-gold-primary to-transparent" style={{ animation: 'heroLineGrow 1s ease-out 0.3s both' }} />
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-primary/[0.06] border border-gold-primary/15">
                <span className="w-1.5 h-1.5 bg-gold-primary rounded-full animate-pulse" />
                <span className="text-gold-primary text-[10px] font-semibold uppercase tracking-[0.15em]">Live Algorithm</span>
              </div>
            </div>

            {/* Headline */}
            <h1 
              className="font-display text-5xl sm:text-6xl lg:text-[4.2rem] xl:text-[4.8rem] font-bold text-white leading-[1.08] mb-6 tracking-tight"
              style={{ animation: 'heroCardFadeIn 0.8s ease-out 0.2s both' }}
            >
              The Ultimate <br />
              <span className="relative inline-block mt-2">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f0d890] via-[#d4a853] to-[#8b6914] drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                  Algorithmic Edge.
                </span>
                <svg className="absolute w-[105%] h-3 -bottom-1 -left-[2.5%] text-gold-primary/30" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 8 Q 25 2 50 6 T 100 4" fill="transparent" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
            </h1>

            {/* Description */}
            <p 
              className="text-text-secondary text-base lg:text-lg leading-relaxed mb-10 max-w-lg"
              style={{ animation: 'heroCardFadeIn 0.8s ease-out 0.35s both' }}
            >
              Outsmart the market with{' '}
              <span className="text-white font-medium">24/7 algorithmic intelligence</span>. 
              Quantitative models adapting instantly to volatility, delivering high-precision entries with strict risk management.
            </p>

            {/* CTA Button */}
            <div className="mb-12" style={{ animation: 'heroCardFadeIn 0.8s ease-out 0.45s both' }}>
              <div className="inline-flex relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-gold-primary to-gold-dark rounded-xl blur opacity-30 group-hover:opacity-70 transition duration-500" />
                <button 
                  onClick={isAuthenticated ? goTerminal : goLogin} 
                  className="relative px-8 py-4 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] flex items-center gap-3"
                  style={{ background: 'linear-gradient(135deg, #d4a853, #8b6914)', color: '#0a0506' }}
                >
                  <span className="tracking-wide uppercase">Open Terminal</span>
                  <svg className="w-5 h-5 group-hover:translate-x-1.5 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Social Proof */}
            <div style={{ animation: 'heroCardFadeIn 0.8s ease-out 0.55s both' }}>
              <div className="flex items-center gap-4">
                <div className="flex -space-x-2.5">
                  {['🇹🇼', '🇮🇩', '🇸🇬', '🇯🇵', '🇦🇺'].map((flag, i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-[#1a150b] border-2 border-bg-primary flex items-center justify-center text-xs shadow-lg" style={{ zIndex: 10 - i }}>
                      {flag}
                    </div>
                  ))}
                  <div className="w-8 h-8 rounded-full bg-gold-primary/10 border-2 border-bg-primary flex items-center justify-center text-[9px] font-bold text-gold-primary shadow-[0_0_12px_rgba(212,168,83,0.2)]" style={{ zIndex: 0 }}>
                    +20
                  </div>
                </div>
                <p className="text-text-muted text-[10px] uppercase tracking-wider font-medium">
                  Trusted by traders in <span className="text-white font-semibold">20+ Countries</span>
                </p>
              </div>
            </div>

          </div>

          {/* ═══ RIGHT: Globe left + Phone right, side by side ═══ */}
          <div className="hidden lg:block relative" style={{ minHeight: 520 }}>

            {/* Globe — positioned left side of right column */}
            <div className="absolute top-1/2 -translate-y-1/2 left-0" style={{ width: 420 }}>
              <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
                <GlobeViz />
                <FlagBadges />
              </div>
            </div>

            {/* Phone — positioned right side, not overlapping globe */}
            <div className="absolute top-1/2 -translate-y-1/2 right-0 z-20">
              <div style={{ animation: 'floatPhone 5s ease-in-out infinite' }}>
                <div className="relative w-[185px] xl:w-[200px] aspect-[9/19.5] bg-black rounded-[2.4rem] border-[5px] border-[#2a2a2a] overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.8),0_0_30px_rgba(0,0,0,0.3)]">
                  {/* Notch */}
                  <div className="absolute top-0 inset-x-0 z-30">
                    <div className="w-[35%] h-[18px] bg-black mx-auto rounded-b-xl" />
                  </div>
                  {/* Side buttons */}
                  <div className="absolute -right-[6px] top-[85px] w-[3px] h-[32px] bg-[#3a3a3a] rounded-l" />
                  <div className="absolute -left-[6px] top-[70px] w-[3px] h-[22px] bg-[#3a3a3a] rounded-r" />
                  <div className="absolute -left-[6px] top-[100px] w-[3px] h-[40px] bg-[#3a3a3a] rounded-r" />
                  {/* Screen */}
                  <div className="absolute inset-[2px] rounded-[2.1rem] overflow-hidden bg-bg-primary">
                    <img 
                      src="/mockup-hp.png" 
                      alt="LuxQuant App" 
                      className="w-full h-full object-cover"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0506] -z-10">
                      <img src="/logo.png" alt="" className="w-9 h-9 rounded-xl mb-2 opacity-40" onError={e => e.target.style.display = 'none'} />
                      <p className="text-gold-primary/30 text-[7px] font-semibold uppercase tracking-widest">LuxQuant</p>
                    </div>
                  </div>
                  {/* Bottom bar */}
                  <div className="absolute bottom-[4px] inset-x-0 z-30 flex justify-center">
                    <div className="w-[35%] h-[3px] bg-white/20 rounded-full" />
                  </div>
                </div>
              </div>

              {/* Coins fly out from phone — one at a time */}
              <PhoneFlyingCoins gainers={topGainers} />
            </div>

          </div>

        </div>

        {/* ═══ MOBILE: Visual Showcase (Globe + Phone) ═══ */}
        <div className="lg:hidden w-full mt-12 mb-10 relative flex flex-col items-center justify-center min-h-[420px]">
          
          {/* 1. Globe Background - Diberi ruang agar tidak terpotong */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[55%] w-[120%] max-w-[400px] aspect-square flex justify-center items-center -z-10 pointer-events-none opacity-60">
            <div className="w-full h-full relative" style={{ animation: 'heroCardFadeIn 1s ease-out 0.4s both' }}>
              <GlobeViz />
            </div>
          </div>

          {/* 2. Floating Phone Mockup - Diperhalus ukurannya */}
          <div 
            className="relative w-[150px] sm:w-[170px] aspect-[9/19.5] bg-black border-[4.5px] border-[#2a2a2a] rounded-[2rem] overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.9)] z-10"
            style={{ animation: 'floatPhone 5s ease-in-out infinite' }}
          >
            {/* Notch HP */}
            <div className="absolute top-0 inset-x-0 z-30">
              <div className="w-[40%] h-[14px] bg-[#2a2a2a] mx-auto rounded-b-xl" />
            </div>
            
            {/* Screen Content */}
            <img 
              src="/mockup-hp.png" 
              alt="LuxQuant App" 
              className="w-full h-full object-cover" 
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>

          {/* 3. Mobile Flying Coins - Diberi jarak agar rapi */}
          <div className="mt-8 z-20 w-full relative min-h-[40px]">
            {topGainers.length > 0 && (
              <MobileRotatingCoins gainers={topGainers} />
            )}
          </div>

        </div>

      </section>

      {/* ════════════════════════════════════════
          RECENT WINNER CAPTURES
      ════════════════════════════════════════ */}
      <section id="performance-top" className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24 pt-12 mt-4">
        
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[80%] h-40 bg-gold-primary/10 blur-[120px] pointer-events-none rounded-full" />

        <div className="text-center mb-8 relative z-10">
          <h2 className="font-display text-3xl lg:text-5xl font-bold text-white mb-6">
            Recent Winner <span className="relative inline-block">
              <span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark">Captures</span>
              <svg className="absolute w-[110%] h-3 -bottom-1 -left-[5%] text-gold-primary/40" viewBox="0 0 100 10" preserveAspectRatio="none">
                <path d="M0 5 Q 50 10 100 5" fill="transparent" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
          </h2>
          <p className="text-text-secondary text-lg max-w-2xl mx-auto leading-relaxed">
            Witness the algorithmic edge. Here are the most recent setups successfully identified and signaled by our quantitative engine <span className="text-white font-medium">with massive upside potential</span>.
          </p>
        </div>

        <div className="relative mt-2">
           <div className="absolute -inset-4 bg-gradient-to-b from-gold-primary/5 to-transparent rounded-3xl blur-md -z-10" />
           <TopPerformers />
        </div>

        <div className="mt-8 flex flex-row items-center justify-center gap-2.5 text-sm text-text-secondary">
          <svg className="w-4 h-4 text-gold-primary animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
          <span>
            <span className="font-semibold text-white">Interactive Feature:</span> Click any coin above to view its original <span className="relative inline-block text-white font-medium">
              history call and results
              <svg className="absolute w-[110%] h-2 -bottom-0.5 -left-[5%] text-gold-primary/60" viewBox="0 0 100 10" preserveAspectRatio="none">
                <path d="M0 5 Q 50 10 100 5" fill="transparent" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>!
          </span>
        </div>
        
      </section>

      {/* ════════════════════════════════════════
          FEATURES SECTION (PREMIUM 6-GRID)
      ════════════════════════════════════════ */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24 mt-12">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold-primary/5 border border-gold-primary/20 mb-4">
            <span className="text-gold-primary text-xs font-semibold tracking-[0.2em] uppercase">Core Capabilities</span>
          </div>
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-white mb-4">
            Trade Objectively. <span className="text-gold-primary">Save Time.</span>
          </h2>
          <p className="text-text-secondary text-lg max-w-2xl mx-auto leading-relaxed">
            Stop spending hours analyzing charts manually. Let our quantitative algorithm monitor the market non-stop so you never miss an opportunity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          
          <div className="glass-card rounded-2xl p-8 border border-gold-primary/10 hover:border-gold-primary/40 transition-all duration-500 group relative overflow-hidden bg-gradient-to-b from-bg-card to-bg-primary">
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-gold-primary/5 rounded-full blur-2xl group-hover:bg-gold-primary/20 transition-all duration-500" />
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-xl bg-gold-primary/10 border border-gold-primary/20 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-gold-primary/20 transition-all duration-300">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-7 h-7 text-gold-primary">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 0 0 3.75 6v1.5m13.5-3.75H18A2.25 2.25 0 0 1 20.25 6v1.5m-13.5 13.5H6A2.25 2.25 0 0 1 3.75 18v-1.5m13.5 13.5H18a2.25 2.25 0 0 0 2.25-2.25V18M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z" />
                </svg>
              </div>
              <h3 className="font-display text-xl font-bold text-white mb-3">Precision Signals</h3>
              <p className="text-text-secondary text-sm leading-relaxed">Algorithm detects optimal entry and exit zones based on real-time market data analysis, adjusting targets adaptively to match market conditions.</p>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-8 border border-gold-primary/10 hover:border-gold-primary/40 transition-all duration-500 group relative overflow-hidden bg-gradient-to-b from-bg-card to-bg-primary">
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-gold-primary/5 rounded-full blur-2xl group-hover:bg-gold-primary/20 transition-all duration-500" />
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-xl bg-gold-primary/10 border border-gold-primary/20 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-gold-primary/20 transition-all duration-300">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-7 h-7 text-gold-primary">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
                </svg>
              </div>
              <h3 className="font-display text-xl font-bold text-white mb-3">24/7 Automated Monitoring</h3>
              <p className="text-text-secondary text-sm leading-relaxed">Trade objectively without spending hours on charts. Our quantitative models monitor the market non-stop so you never miss an opportunity.</p>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-8 border border-gold-primary/10 hover:border-gold-primary/40 transition-all duration-500 group relative overflow-hidden bg-gradient-to-b from-bg-card to-bg-primary">
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-gold-primary/5 rounded-full blur-2xl group-hover:bg-gold-primary/20 transition-all duration-500" />
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-xl bg-gold-primary/10 border border-gold-primary/20 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-gold-primary/20 transition-all duration-300">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-7 h-7 text-gold-primary">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
              </div>
              <h3 className="font-display text-xl font-bold text-white mb-3">Real-Time Alerts</h3>
              <p className="text-text-secondary text-sm leading-relaxed">Instant push notifications via Telegram the moment our algorithm detects important price zones. Execute trades with zero hesitation.</p>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-8 border border-gold-primary/10 hover:border-red-500/30 transition-all duration-500 group relative overflow-hidden bg-gradient-to-b from-bg-card to-bg-primary">
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-all duration-500" />
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-red-500/20 transition-all duration-300">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-7 h-7 text-red-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
              </div>
              <h3 className="font-display text-xl font-bold text-white mb-3">Risk Management</h3>
              <p className="text-text-secondary text-sm leading-relaxed">Capital preservation is key. Every signal includes strictly calculated stop-loss levels to protect your capital systematically.</p>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-8 border border-gold-primary/10 hover:border-blue-500/30 transition-all duration-500 group relative overflow-hidden bg-gradient-to-b from-bg-card to-bg-primary">
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all duration-500" />
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-blue-500/20 transition-all duration-300">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-7 h-7 text-blue-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625Zm6.75-4.5c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
              <h3 className="font-display text-xl font-bold text-white mb-3">Advanced Analytics</h3>
              <p className="text-text-secondary text-sm leading-relaxed">Gain an edge with volume ranking monitoring and dynamic risk level indicators, processed automatically behind the scenes.</p>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-8 border border-gold-primary/10 hover:border-emerald-500/30 transition-all duration-500 group relative overflow-hidden bg-gradient-to-b from-bg-card to-bg-primary">
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all duration-500" />
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all duration-300">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-7 h-7 text-emerald-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75" />
                </svg>
              </div>
              <h3 className="font-display text-xl font-bold text-white mb-3">Transparent Track Record</h3>
              <p className="text-text-secondary text-sm leading-relaxed">Transparent historical performance tracking—no false promises, just data. Every single signal is recorded and fully verifiable.</p>
            </div>
          </div>

        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24">
        <div className="text-center mb-12">
          <p className="text-gold-primary text-xs font-semibold uppercase tracking-[0.2em] mb-3">How It Works</p>
          <h2 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4">
            System <span className="text-gold-primary">Architecture</span>
          </h2>
          <p className="text-text-secondary text-base max-w-xl mx-auto">
            See how our algorithm processes market data to generate high-quality trading signals
          </p>
        </div>

        <div className="relative flex flex-col lg:flex-row items-center lg:items-stretch justify-between gap-6 lg:gap-0">
          <div className="flex flex-col gap-4 w-full lg:w-[260px] flex-shrink-0">
            {[
              { icon: '📈', title: 'Market Data', sub: 'Real-time prices', color: 'text-blue-400' },
              { icon: '📊', title: 'Volume Analysis', sub: '24h tracking', color: 'text-gold-primary' },
              { icon: '😀', title: 'Sentiment Data', sub: 'Market mood', color: 'text-green-400' },
            ].map((item, i) => (
              <div key={i} className="glass-card rounded-xl p-4 border border-gold-primary/10 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gold-primary/10 border border-gold-primary/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">{item.icon}</span>
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{item.title}</p>
                  <p className="text-text-muted text-xs font-mono">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden lg:flex items-center justify-center w-16 flex-shrink-0">
            <div className="w-full h-0.5 bg-gradient-to-r from-gold-primary/40 to-gold-primary/20 relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gold-primary" />
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gold-primary/60" />
            </div>
          </div>
          <div className="lg:hidden flex justify-center">
            <svg className="w-6 h-6 text-gold-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 lg:gap-8 flex-1 justify-center">
            <div className="glass-card rounded-xl p-5 border border-gold-primary/10 text-center w-[160px]">
              <div className="flex flex-col gap-1.5 mb-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-2 rounded-full bg-gradient-to-r from-gold-primary/30 to-gold-primary/10" style={{ width: `${70 + i * 6}%`, marginLeft: 'auto', marginRight: 'auto' }} />
                ))}
              </div>
              <p className="text-gold-primary text-xs font-semibold">Data Pipeline</p>
              <p className="text-text-muted text-[10px] uppercase tracking-wider mt-0.5">Processing Node</p>
            </div>

            <div className="hidden sm:flex items-center w-10">
              <div className="w-full h-0.5 bg-gradient-to-r from-gold-primary/30 to-gold-primary/20 relative">
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gold-primary/60" />
              </div>
            </div>
            <div className="sm:hidden">
              <svg className="w-6 h-6 text-gold-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7-7m7-7H3" /></svg>
            </div>

            <div className="relative">
              <div className="w-28 h-28 lg:w-36 lg:h-36 rounded-full border-2 border-gold-primary/30 flex items-center justify-center relative" style={{ background: 'radial-gradient(circle, rgba(212,168,83,0.08) 0%, transparent 70%)' }}>
                <div className="absolute inset-2 rounded-full border border-gold-primary/15" />
                <div className="text-center">
                  <p className="text-gold-primary font-mono text-2xl lg:text-3xl font-bold">&lt;/&gt;</p>
                  <p className="text-text-muted text-[8px] lg:text-[10px] uppercase tracking-wider mt-1 font-semibold">LuxQuant</p>
                  <p className="text-gold-primary text-[7px] lg:text-[8px] uppercase tracking-widest">Algorithm</p>
                </div>
              </div>
              <div className="absolute inset-0 rounded-full border border-gold-primary/20 animate-ping" style={{ animationDuration: '3s' }} />
            </div>
          </div>

          <div className="hidden lg:flex items-center justify-center w-16 flex-shrink-0">
            <div className="w-full h-0.5 bg-gradient-to-r from-gold-primary/20 to-gold-primary/40 relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gold-primary/60" />
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gold-primary" />
            </div>
          </div>
          <div className="lg:hidden flex justify-center">
            <svg className="w-6 h-6 text-gold-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
          </div>

          <div className="glass-card rounded-xl p-5 border border-gold-primary/10 w-full lg:w-[280px] flex-shrink-0">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gold-primary/10 border border-gold-primary/20 flex items-center justify-center">
                <span className="text-lg">⚡</span>
              </div>
              <div>
                <p className="text-white text-sm font-bold">Output for</p>
                <p className="text-gold-primary text-sm font-bold">Potential Trade</p>
              </div>
            </div>
            <p className="text-text-secondary text-xs mb-4 leading-relaxed">
              High-probability signals delivered instantly to your device
            </p>
            <div className="flex flex-wrap gap-2">
              {['Instant Alert', 'Risk Analysis', 'Entry Points'].map((tag) => (
                <span key={tag} className="px-3 py-1.5 rounded-lg bg-gold-primary/10 border border-gold-primary/20 text-gold-primary text-xs font-semibold flex items-center gap-1.5">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 text-center max-w-3xl mx-auto">
          <p className="font-display text-lg lg:text-xl text-text-secondary italic leading-relaxed">
            Operating 24/7 with real-time market monitoring and lightning-fast execution, powered by an adaptive algorithm that dynamically adjusts strategies based on market conditions to deliver high-quality trading signals.
          </p>
        </div>
      </section>

      {/* MAC & PHONE SHOWCASE */}
      <section id="platform" className="relative z-10">
        <PlatformShowcase />
      </section>

      {/* LIVE PERFORMANCE STATS */}
      <section id="performance" className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24 mt-12">
        <LivePerformanceStats data={performanceData} />
      </section>

      {/* TESTIMONIALS */}
      <section id="testimonials" className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-0.5 bg-gradient-to-r from-transparent to-gold-primary" />
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-white">Trusted by Traders</h2>
            <div className="w-12 h-0.5 bg-gradient-to-l from-transparent to-gold-primary" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          <TestimonialCard flag="🇮🇩" name="Andi Pratama" role="Day Trader, Jakarta" text="LuxQuant signals are highly accurate. In my first month, my profit increased by 40%. The terminal is incredibly comprehensive." />
          <TestimonialCard flag="🇹🇼" name="Chen Wei-Lin" role="Swing Trader, Taipei" text="AI Arena feature is amazing. I can see which model performs best and follow the strongest predictions. Game changer." />
          <TestimonialCard flag="🇸🇬" name="Raj Patel" role="Portfolio Manager, Singapore" text="The combination of whale alerts, macro calendar, and signals gives me an institutional-grade edge. Worth every penny." />
        </div>
      </section>

      {/* FAQ SECTION */}
      <section id="faq" className="relative z-10 max-w-4xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-white mb-4">Frequently Asked Questions</h2>
          <p className="text-text-secondary text-lg">Everything you need to know about LuxQuant Algorithm.</p>
        </div>
        <div className="flex flex-col gap-2">
          {FAQ_DATA.map((item, index) => (
            <FAQItem 
              key={index} 
              q={item.q} 
              a={item.a} 
              isOpen={openFaq === index} 
              onClick={() => setOpenFaq(openFaq === index ? null : index)} 
            />
          ))}
        </div>
      </section>

      {/* CTA & TELEGRAM PROMO */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24">
        <div className="glass-card rounded-2xl p-8 lg:p-16 border border-gold-primary/20 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-gold-primary/5 via-transparent to-gold-primary/5" />
          <div className="relative z-10">
            <h2 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4">Ready to Trade <span className="text-gold-primary">Smarter</span>?</h2>
            <p className="text-text-secondary text-lg mb-8 max-w-xl mx-auto">Join thousands of traders using AI-powered signals to maximize their crypto profits.</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button onClick={isAuthenticated ? goTerminal : goRegister} className="px-10 py-4 rounded-xl font-bold text-sm transition-all hover:scale-105" style={{ background: 'linear-gradient(to right, #d4a853, #8b6914)', color: '#0a0506', boxShadow: '0 0 30px rgba(212, 168, 83, 0.4)' }}>
                {isAuthenticated ? 'Open Terminal' : 'Create Free Account'}
              </button>
            </div>
          </div>
        </div>

        <TelegramPromo />
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-gold-primary/10 bg-bg-primary">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="LuxQuant" className="w-8 h-8 rounded-lg" />
              <span className="font-display text-sm font-semibold text-white">LuxQuant</span>
              <span className="text-text-muted text-xs ml-2">© {new Date().getFullYear()}</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="https://t.me/luxquant" target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-gold-primary transition-colors text-sm">Telegram</a>
              <a href="https://x.com/luxquantcrypto" target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-gold-primary transition-colors text-sm">Twitter</a>
            </div>
          </div>
          <p className="text-text-muted text-xs text-center mt-8 max-w-2xl mx-auto leading-relaxed">
            Disclaimer: Trading cryptocurrency involves significant risk. Past performance does not guarantee future results. LuxQuant provides tools and signals for informational purposes only.
          </p>
        </div>
      </footer>

      {/* STICKY MOBILE CTA */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-bg-primary/95 backdrop-blur-xl border-t border-gold-primary/20 z-[100] shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <button 
          onClick={isAuthenticated ? goTerminal : goRegister} 
          className="w-full py-4 rounded-xl font-bold text-sm flex justify-center items-center uppercase tracking-wide transition-transform active:scale-95" 
          style={{ background: 'linear-gradient(to right, #d4a853, #8b6914)', color: '#0a0506' }}
        >
          {isAuthenticated ? 'Open Terminal' : 'Start Free Trial'}
        </button>
      </div>

    </div>
  );
};

export default LandingPage;