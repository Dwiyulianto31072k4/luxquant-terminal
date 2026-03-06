// src/components/landing/LandingPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import TopPerformers from '../TopPerformers';
import CoinLogo from '../CoinLogo';
import GlobalNetworkSection from './GlobalNetworkSection'; // <-- IMPORT KOMPONEN GLOBE BUATANMU

import './LandingPage.css';

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
// FAQ & Testimonial Cards
// ════════════════════════════════════════
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
// Coins flying out from phone (Alternating Daily & Weekly)
// ════════════════════════════════════════
const PhoneFlyingCoins = ({ gainers }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const allCoins = gainers.slice(0, 20); // Menampung hingga 20 koin campuran

  useEffect(() => {
    if (allCoins.length === 0) return;
    const iv = setInterval(() => {
      setCurrentIdx(prev => (prev + 1) % allCoins.length);
    }, 3500);
    return () => clearInterval(iv);
  }, [allCoins.length]);

  if (allCoins.length === 0) return null;

  const item = allCoins[currentIdx];
  const symbol = item?.pair?.replace(/USDT$/i, '').replace(/^3A/, '') || '???';
  const labelText = item?.type ? `${item.type} Top Gainer` : 'Top Gainer';

  return (
    <div 
      key={currentIdx}
      className="absolute z-30 pointer-events-none"
      style={{
        top: '15%',
        right: '-40%',
        animation: 'coin-float-up-right 3.5s ease-out both',
      }}
    >
      <div
        className="flex flex-col gap-1 px-4 py-2.5 rounded-2xl border border-gold-primary/30"
        style={{
          background: 'rgba(10,5,6,0.85)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 15px rgba(212,168,83,0.15)',
        }}
      >
        <div className="flex items-center gap-2">
          <CoinLogo pair={item.pair} size={20} />
          <span className="text-white text-sm font-bold">{symbol}</span>
          <span className="text-green-400 text-sm font-bold font-mono">+{item.gain_pct?.toFixed(1)}%</span>
        </div>
        <span className="text-gold-primary/70 text-[9px] font-mono tracking-widest uppercase text-left">
          {labelText}
        </span>
      </div>
    </div>
  );
};

const MobileRotatingCoins = ({ gainers }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const allCoins = gainers.slice(0, 20);

  useEffect(() => {
    if (allCoins.length === 0) return;
    const iv = setInterval(() => setCurrentIdx(prev => (prev + 1) % allCoins.length), 3500);
    return () => clearInterval(iv);
  }, [allCoins.length]);

  if (allCoins.length === 0) return null;

  const item = allCoins[currentIdx];
  const symbol = item?.pair?.replace(/USDT$/i, '').replace(/^3A/, '') || '???';
  const labelText = item?.type ? `${item.type} Gainer` : 'Top Gainer';

  return (
    <div className="flex justify-center w-full min-h-[60px]">
      <div 
        key={currentIdx}
        className="flex items-center justify-between w-full max-w-[240px] px-4 py-2.5 rounded-2xl border border-gold-primary/30 bg-black/80 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
        style={{ animation: 'heroCardFadeIn 0.5s ease-out both' }}
      >
        <div className="flex items-center gap-3">
          <CoinLogo pair={item.pair} size={24} />
          <div className="text-left">
            <p className="text-white text-xs font-bold leading-none">{symbol}</p>
            <p className="text-gold-primary/70 text-[8px] font-mono tracking-wider mt-1 uppercase">{labelText}</p>
          </div>
        </div>
        <span className="text-green-400 text-sm font-bold font-mono">+{item.gain_pct?.toFixed(1)}%</span>
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
  
  // State ini sekarang akan menyimpan koin gabungan (Daily & Weekly)
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

  // Fetch API untuk menarik Daily dan Weekly lalu menggabungkannya secara selang-seling
  useEffect(() => {
    const fetchTopGainers = async () => {
      try {
        const [resDaily, resWeekly] = await Promise.all([
          fetch('/api/v1/signals/top-performers?limit=10&days=1'),
          fetch('/api/v1/signals/top-performers?limit=10&days=7')
        ]);

        let daily = [];
        let weekly = [];

        if (resDaily.ok) {
          const dataDaily = await resDaily.json();
          // Beri label 'Daily' pada setiap item
          daily = (dataDaily?.top_gainers || []).map(item => ({ ...item, type: 'Daily' }));
        }

        if (resWeekly.ok) {
          const dataWeekly = await resWeekly.json();
          // Beri label 'Weekly' pada setiap item
          weekly = (dataWeekly?.top_gainers || []).map(item => ({ ...item, type: 'Weekly' }));
        }

        // Susun selang-seling: [Daily1, Weekly1, Daily2, Weekly2, ...]
        const combined = [];
        const maxLength = Math.max(daily.length, weekly.length);
        for (let i = 0; i < maxLength; i++) {
          if (daily[i]) combined.push(daily[i]);
          if (weekly[i]) combined.push(weekly[i]);
        }

        setTopGainers(combined);
      } catch (e) { 
        console.warn('Top gainers fetch failed:', e); 
      }
    };
    fetchTopGainers();
  }, []);

  const goTerminal = () => navigate('/terminal');
  const goLogin = () => navigate('/login');
  const goRegister = () => navigate('/register');
  const scrollTo = (id) => { setMobileMenuOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  const stats = performanceData?.stats;

  return (
    <div className="min-h-screen bg-bg-primary text-white relative pb-20 lg:pb-0 overflow-x-hidden"> 
      <div className="luxury-bg" />
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
              {[['Home', 'hero'], ['Architecture', 'how-it-works'], ['Ecosystem', 'features'], ['Performance', 'performance']].map(([label, id]) => (
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
            {[['Home', 'hero'], ['Architecture', 'how-it-works'], ['Ecosystem', 'features'], ['Performance', 'performance']].map(([label, id]) => (
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
          HERO SECTION (Fokus Platform Saja)
      ════════════════════════════════════════ */}
      <section id="hero" className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pt-14 lg:pt-20 pb-16 lg:pb-20 overflow-visible">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[700px] pointer-events-none -z-10">
          <div className="absolute inset-0 bg-gold-primary/[0.03] rounded-full blur-[150px]" style={{ animation: 'heroGlowPulse 6s ease-in-out infinite' }} />
          <div className="absolute top-20 -left-40 w-[400px] h-[400px] bg-[#8b1a1a]/[0.05] rounded-full blur-[120px]" />
          <div className="absolute -bottom-20 -right-20 w-[300px] h-[300px] bg-gold-primary/[0.04] rounded-full blur-[100px]" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-8 items-center relative z-10">
          
          <div className="relative z-20">
            <div className="flex items-center gap-3 mb-8" style={{ animation: 'heroCardFadeIn 0.6s ease-out 0.1s both' }}>
              <div className="h-px bg-gradient-to-r from-gold-primary to-transparent" style={{ animation: 'heroLineGrow 1s ease-out 0.3s both', width: '40px' }} />
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-primary/[0.06] border border-gold-primary/20 shadow-[0_0_15px_rgba(212,168,83,0.1)]">
                <span className="w-1.5 h-1.5 bg-gold-primary rounded-full animate-pulse" />
                <span className="text-gold-primary text-[10px] font-bold uppercase tracking-[0.2em]">AI-Powered Algorithm</span>
              </div>
            </div>

            <h1 
              className="font-display text-5xl sm:text-6xl lg:text-[4.2rem] xl:text-[4.8rem] font-bold text-white leading-[1.08] mb-6 tracking-tight"
              style={{ animation: 'heroCardFadeIn 0.8s ease-out 0.2s both' }}
            >
              The Ultimate <br />
              <span className="relative inline-block mt-2">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f0d890] via-[#d4a853] to-[#8b6914] drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                  AI Trading Edge.
                </span>
                <svg className="absolute w-[105%] h-3 -bottom-1 -left-[2.5%] text-gold-primary/30" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 8 Q 25 2 50 6 T 100 4" fill="transparent" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
            </h1>

            <p 
              className="text-text-secondary text-base lg:text-lg leading-relaxed mb-10 max-w-lg"
              style={{ animation: 'heroCardFadeIn 0.8s ease-out 0.35s both' }}
            >
              Outsmart the market with <span className="text-white font-medium">24/7 AI-driven intelligence</span>. 
              Our machine-learning models process millions of data points to adapt instantly to crypto volatility, delivering high-probability setups with strict risk management.
            </p>

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
          </div>

          <div className="hidden lg:flex flex-row items-center justify-center relative w-full" style={{ minHeight: 520 }}>
            <div className="relative flex-shrink-0 z-20">
              <div style={{ animation: 'floatPhone 5s ease-in-out infinite' }}>
                <div className="relative w-[200px] xl:w-[220px] aspect-[9/19.5] bg-black rounded-[2.8rem] border-[6px] border-[#2a2a2a] overflow-hidden shadow-[0_30px_70px_rgba(0,0,0,0.8),0_0_40px_rgba(212,168,83,0.15)]">
                  <div className="absolute top-0 inset-x-0 z-30">
                    <div className="w-[35%] h-[20px] bg-black mx-auto rounded-b-2xl" />
                  </div>
                  <div className="absolute inset-[2px] rounded-[2.4rem] overflow-hidden bg-bg-primary">
                    <img src="/mockup-hp.png" alt="LuxQuant App" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0506] -z-10">
                      <img src="/logo.png" alt="" className="w-10 h-10 rounded-xl mb-2 opacity-40" onError={e => e.target.style.display = 'none'} />
                    </div>
                  </div>
                  <div className="absolute bottom-[5px] inset-x-0 z-30 flex justify-center">
                    <div className="w-[35%] h-[4px] bg-white/20 rounded-full" />
                  </div>
                </div>
              </div>
              <PhoneFlyingCoins gainers={topGainers} />
            </div>
          </div>

        </div>

        <div className="lg:hidden w-full mt-10 flex flex-col items-center justify-center gap-8 relative z-10">
          <div className="relative flex-shrink-0 z-20">
            <div className="relative w-[200px] sm:w-[220px] aspect-[9/19.5] bg-black rounded-[2.6rem] border-[5px] border-[#2a2a2a] overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.8),0_0_30px_rgba(212,168,83,0.2)]" style={{ animation: 'floatPhone 5s ease-in-out infinite' }}>
              <div className="absolute top-0 inset-x-0 z-30">
                <div className="w-[35%] h-[18px] bg-black mx-auto rounded-b-xl" />
              </div>
              <div className="absolute inset-[2px] rounded-[2.3rem] overflow-hidden bg-bg-primary">
                <img src="/mockup-hp.png" alt="LuxQuant App" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0506] -z-10">
                  <img src="/logo.png" alt="" className="w-9 h-9 rounded-xl mb-2 opacity-40" onError={e => e.target.style.display = 'none'} />
                </div>
              </div>
              <div className="absolute bottom-[4px] inset-x-0 z-30 flex justify-center">
                <div className="w-[35%] h-[3px] bg-white/20 rounded-full" />
              </div>
            </div>
          </div>

          <div className="z-20 w-full relative min-h-[40px]">
            {topGainers.length > 0 && <MobileRotatingCoins gainers={topGainers} />}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          GLOBAL NETWORK SECTION BUATANMU
      ════════════════════════════════════════ */}
      <GlobalNetworkSection />

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
          SYSTEM ARCHITECTURE (PCB / PIPELINE)
      ════════════════════════════════════════ */}
      <section id="how-it-works" className="relative z-10 w-full px-4 lg:px-8 pb-20 lg:pb-32 mt-12 lg:mt-20">
        
        {/* Ambient Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-[600px] bg-gold-primary/[0.03] rounded-[100%] blur-[120px] pointer-events-none -z-10" />

        <div className="text-center mb-12 lg:mb-20 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-gold-primary/20 bg-gold-primary/[0.03] rounded-full mb-5">
            <div className="w-1.5 h-1.5 bg-gold-primary rounded-full animate-pulse" />
            <span className="text-gold-primary font-mono text-[10px] uppercase tracking-[0.3em]">System Architecture</span>
          </div>
          <h2 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4">
            Quantitative <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark">Pipeline</span>
          </h2>
          <p className="text-text-secondary text-xs lg:text-sm max-w-2xl mx-auto font-mono bg-black/40 py-2 px-4 rounded-lg border border-white/5 inline-block">
            // RAW_DATA <span className="text-gold-primary mx-1">→</span> SANITIZATION <span className="text-gold-primary mx-1">→</span> ALPHA_MODEL <span className="text-gold-primary mx-1">→</span> API_GATEWAY
          </p>
        </div>

        {/* DESKTOP LAYOUT */}
        <div className="hidden lg:flex items-center justify-center max-w-[1200px] mx-auto w-full relative z-10">
          
          {/* 1. INPUT NODES */}
          <div className="flex flex-col gap-3 w-[220px] xl:w-[260px] flex-shrink-0 z-20">
            {[
              { id: '0x1', title: 'ORDER BOOK DEPTH', desc: 'Bid/Ask liquidity tracking' },
              { id: '0x2', title: 'ON-CHAIN METRICS', desc: 'Whale transfers & Netflows' },
              { id: '0x3', title: 'VOLATILITY INDEX', desc: 'ATR & Bollinger bandwidth' },
              { id: '0x4', title: 'FUNDING RATES', desc: 'Perpetual swap sentiment' },
            ].map((node, i) => (
              <div key={i} className="group bg-[#0a0805] backdrop-blur-md border border-white/5 hover:border-gold-primary/30 p-4 rounded-xl transition-all duration-300 relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gold-primary/20 group-hover:bg-gold-primary transition-colors" />
                <span className="text-gold-primary/60 font-mono text-[9px] mb-1 block">{node.id}</span>
                <h4 className="text-white text-[11px] font-bold tracking-wider mb-1 uppercase">{node.title}</h4>
                <p className="text-text-muted text-[10px] font-mono leading-tight">{node.desc}</p>
              </div>
            ))}
          </div>

          <div className="flex-1 h-px bg-gradient-to-r from-gold-primary/20 to-transparent relative mx-2 xl:mx-4 flex-shrink-1 min-w-[30px]">
            <div className="absolute top-[-1px] left-0 w-1/2 h-[3px] bg-gold-primary rounded-full shadow-[0_0_10px_#d4a853]" style={{ animation: 'data-stream-right 2s linear infinite' }} />
          </div>

          {/* 2. DATA SANITIZATION */}
          <div className="w-[120px] xl:w-[140px] bg-[#050302] border border-white/10 rounded-xl flex flex-col items-center justify-center p-4 relative z-20 flex-shrink-0 hover:-translate-y-1 transition-transform">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-t-xl" />
            <svg className="w-6 h-6 text-white/50 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            <p className="text-white text-[10px] xl:text-xs font-bold tracking-widest text-center uppercase">Data<br/>Filter</p>
          </div>

          <div className="flex-1 h-px bg-white/10 relative mx-2 xl:mx-4 flex-shrink-1 min-w-[30px]">
            <div className="absolute top-[-1px] left-0 w-1/2 h-[3px] bg-gold-primary rounded-full shadow-[0_0_10px_#d4a853]" style={{ animation: 'data-stream-right 2s linear infinite 0.5s' }} />
          </div>

          {/* 3. ALPHA CORE */}
          <div className="relative flex items-center justify-center flex-shrink-0 z-20 mx-2">
            <div className="absolute w-[220px] h-[220px] xl:w-[260px] xl:h-[260px] rounded-full border border-white/5 border-l-gold-primary/30 border-r-gold-primary/30" style={{ animation: 'spin-slow 15s linear infinite' }} />
            <div className="absolute w-[180px] h-[180px] xl:w-[210px] xl:h-[210px] rounded-full border border-dashed border-white/10" style={{ animation: 'spin-reverse-slow 20s linear infinite' }} />
            
            <div className="relative w-40 h-40 xl:w-48 xl:h-48 bg-[#0a0805] rounded-2xl border-[1.5px] border-white/10 flex flex-col items-center justify-center overflow-hidden" style={{ animation: 'core-pulse 4s ease-in-out infinite' }}>
              <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay" />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gold-primary/10 to-transparent w-full h-[20%]" style={{ animation: 'scanline 3s linear infinite' }} />
              
              <div className="w-12 h-12 xl:w-14 xl:h-14 rounded-lg border border-gold-primary/30 flex items-center justify-center mb-3 bg-gold-primary/[0.05]">
                <svg className="w-6 h-6 xl:w-7 xl:h-7 text-gold-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="1.5" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                </svg>
              </div>
              <h3 className="text-white font-mono font-bold tracking-widest text-[10px] xl:text-xs">PREDICTIVE ALPHA</h3>
              <p className="text-gold-primary/60 font-mono text-[7px] xl:text-[8px] mt-1 uppercase tracking-[0.2em]">Quantum Engine</p>
            </div>
          </div>

          <div className="flex-1 h-px bg-white/10 relative mx-2 xl:mx-4 flex-shrink-1 min-w-[30px]">
            <div className="absolute top-[-1px] left-0 w-1/2 h-[3px] bg-gold-primary rounded-full shadow-[0_0_10px_#d4a853]" style={{ animation: 'data-stream-right 2s linear infinite 1s' }} />
          </div>

          {/* 4. API GATEWAY NODE */}
          <div className="w-[120px] xl:w-[140px] bg-[#050302] border border-white/10 rounded-xl flex flex-col items-center justify-center p-4 relative z-20 flex-shrink-0 hover:-translate-y-1 transition-transform">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-gold-primary/50 to-transparent rounded-t-xl" />
            <svg className="w-6 h-6 text-gold-primary/70 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-white text-[10px] xl:text-xs font-bold tracking-widest text-center uppercase">API<br/>Gateway</p>
            <p className="text-text-muted text-[7px] xl:text-[8px] font-mono mt-1 text-center">Payload Formatter</p>
          </div>

          <div className="flex-1 h-px bg-white/10 relative mx-2 xl:mx-4 flex-shrink-1 min-w-[30px]">
            <div className="absolute top-[-1px] left-0 w-1/2 h-[3px] bg-gold-primary rounded-full shadow-[0_0_10px_#d4a853]" style={{ animation: 'data-stream-right 2s linear infinite 1.5s' }} />
          </div>

          {/* 5. TICKET */}
          <div className="relative w-[240px] xl:w-[280px] flex-shrink-0 z-20">
            <div className="bg-[#0a0805] rounded-xl border border-gold-primary/30 p-5 shadow-[0_0_30px_rgba(212,168,83,0.08)]">
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-gold-primary rounded-full animate-pulse" />
                  <span className="text-white font-mono text-[10px] xl:text-xs font-bold tracking-widest">WEB APP READY</span>
                </div>
                <span className="text-green-400 font-mono text-[8px] bg-green-400/10 px-1.5 py-0.5 rounded">SYNCED</span>
              </div>

              <div className="space-y-3 font-mono">
                <div className="flex justify-between items-end border-b border-white/5 pb-2">
                  <div>
                    <p className="text-text-muted text-[8px] uppercase tracking-wider mb-0.5">Payload Status</p>
                    <p className="text-white text-[10px]">Formatted JSON</p>
                  </div>
                  <span className="text-gold-primary text-[9px]">200 OK</span>
                </div>
                <div className="flex justify-between items-end border-b border-white/5 pb-2">
                  <div>
                    <p className="text-text-muted text-[8px] uppercase tracking-wider mb-0.5">Potential Trade</p>
                    <p className="text-white text-[10px]">Entry & TP Matrix</p>
                  </div>
                  <span className="text-gold-primary text-[9px]">Pushed</span>
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-text-muted text-[8px] uppercase tracking-wider mb-0.5">Dashboard Render</p>
                    <p className="text-white text-[10px]">LuxQuant Platform</p>
                  </div>
                  <span className="text-gold-primary text-[9px]">Live</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* MOBILE LAYOUT */}
        <div className="flex lg:hidden flex-col items-center w-full relative z-10">
          <div className="grid grid-cols-2 gap-3 w-full max-w-[320px] relative z-20">
             {[
              { id: '0x1', title: 'ORDER BOOK', val: 'LIQUIDITY' },
              { id: '0x2', title: 'ON-CHAIN', val: 'WHALES' },
              { id: '0x3', title: 'VOLATILITY', val: 'ATR calc' },
              { id: '0x4', title: 'FUNDING', val: 'SENTIMENT' },
            ].map((node, i) => (
              <div key={i} className="bg-[#0a0805] border border-white/10 rounded-lg p-3 text-center shadow-lg">
                <span className="text-gold-primary/60 font-mono text-[7px] mb-1 block">{node.id}</span>
                <h4 className="text-white text-[9px] font-bold tracking-wider mb-1 uppercase">{node.title}</h4>
                <p className="text-text-muted text-[8px] font-mono leading-tight">{node.val}</p>
              </div>
            ))}
          </div>

          <div className="w-px h-8 bg-white/10 relative my-1">
            <div className="absolute top-0 left-[-1px] w-[3px] h-1/2 bg-gold-primary rounded-full shadow-[0_0_10px_#d4a853]" style={{ animation: 'data-stream-down 1.5s linear infinite' }} />
          </div>

          <div className="w-[160px] bg-[#050302] border border-white/10 rounded-xl flex flex-col items-center justify-center p-3 relative z-20">
            <svg className="w-5 h-5 text-white/50 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            <p className="text-white text-[10px] font-bold tracking-widest text-center uppercase">Data Filter</p>
          </div>

          <div className="w-px h-8 bg-white/10 relative my-1">
            <div className="absolute top-0 left-[-1px] w-[3px] h-1/2 bg-gold-primary rounded-full shadow-[0_0_10px_#d4a853]" style={{ animation: 'data-stream-down 1.5s linear infinite 0.5s' }} />
          </div>

          <div className="relative w-48 h-48 flex items-center justify-center z-20 my-4">
             <div className="absolute w-[200px] h-[200px] rounded-full border border-white/5 border-l-gold-primary/30 border-r-gold-primary/30" style={{ animation: 'spin-slow 15s linear infinite' }} />
             <div className="relative w-32 h-32 bg-[#0a0805] rounded-2xl border border-white/20 flex flex-col items-center justify-center shadow-[0_0_30px_rgba(212,168,83,0.15)]">
                <svg className="w-6 h-6 text-gold-primary mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth="1.5" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                </svg>
                <h3 className="text-white font-mono font-bold tracking-widest text-[9px] text-center">PREDICTIVE<br/>ALPHA</h3>
             </div>
          </div>

          <div className="w-px h-8 bg-white/10 relative my-1">
            <div className="absolute top-0 left-[-1px] w-[3px] h-1/2 bg-gold-primary rounded-full shadow-[0_0_10px_#d4a853]" style={{ animation: 'data-stream-down 1.5s linear infinite 1s' }} />
          </div>

          <div className="w-[160px] bg-[#050302] border border-white/10 rounded-xl flex items-center justify-center gap-3 p-3 relative z-20">
            <svg className="w-5 h-5 text-gold-primary/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div className="text-left">
              <p className="text-white text-[10px] font-bold tracking-widest uppercase">API Gateway</p>
              <p className="text-text-muted text-[7px] font-mono">Payload Format</p>
            </div>
          </div>

          <div className="w-px h-8 bg-white/10 relative my-1">
            <div className="absolute top-0 left-[-1px] w-[3px] h-1/2 bg-gold-primary rounded-full shadow-[0_0_10px_#d4a853]" style={{ animation: 'data-stream-down 1.5s linear infinite 1.5s' }} />
          </div>

          <div className="bg-[#0a0805] rounded-xl border border-gold-primary/30 p-4 w-full max-w-[320px] relative z-20">
             <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-gold-primary rounded-full animate-pulse" />
                  <span className="text-white font-mono text-[10px] font-bold tracking-widest">WEB APP READY</span>
                </div>
                <span className="text-green-400 font-mono text-[8px] bg-green-400/10 px-1.5 py-0.5 rounded">SYNCED</span>
              </div>
              <div className="space-y-2 font-mono">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-text-muted text-[8px] uppercase tracking-wider">Potential Trade</p>
                    <p className="text-white text-[10px]">Entry & TP Matrix</p>
                  </div>
                  <span className="text-gold-primary text-[9px]">Pushed to UI</span>
                </div>
              </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          THE ECOSYSTEM (FEATURES) - BENTO GRID
      ════════════════════════════════════════ */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-20 lg:pb-32 mt-10">
        <div className="text-center mb-12 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-gold-primary/20 bg-gold-primary/5 rounded-full mb-4">
            <span className="text-gold-primary font-mono text-[9px] uppercase tracking-[0.3em]">LuxQuant Ecosystem</span>
          </div>
          <h2 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4">
            Institutional-Grade <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark">Terminal</span>
          </h2>
          <p className="text-text-secondary text-sm lg:text-base max-w-2xl mx-auto leading-relaxed">
            A unified quantitative workspace. Access synthesized market direction, real-time data, and algorithmic signals seamlessly across all your devices.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-5 auto-rows-[minmax(200px,auto)]">
          {/* 1. OMNICHANNEL */}
          <div className="bento-card md:col-span-2 xl:row-span-2 group p-0 border-gold-primary/20">
            <div className="bento-glow" />
            <div className="p-6 lg:p-8 z-10 relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-white font-mono text-[10px] font-bold tracking-widest uppercase">Cross-Platform Sync</span>
                </div>
                <span className="text-gold-primary border border-gold-primary/30 bg-gold-primary/5 px-2 py-0.5 rounded text-[9px] font-mono">WEB & MOBILE</span>
              </div>
              <h3 className="font-display text-2xl font-bold text-white mb-2">Trade Anywhere, Anytime.</h3>
              <p className="text-text-secondary text-xs lg:text-sm max-w-[90%] leading-relaxed">
                Your quantitative edge is not confined to a desk. Monitor live setups from your multi-monitor trading station, or execute high-probability trades on-the-go via our heavily optimized mobile web-app.
              </p>
            </div>
            
            <div className="relative flex-1 min-h-[260px] w-full overflow-hidden flex items-end justify-center bg-gradient-to-t from-gold-primary/5 to-transparent pt-4">
              <div className="bg-grid-pattern absolute inset-0 opacity-[0.15]" />
              
              <div className="relative w-[85%] lg:w-[75%] h-[200px] bg-[#050302] border border-white/10 rounded-t-xl shadow-2xl z-10 overflow-hidden translate-y-6 group-hover:translate-y-3 transition-transform duration-500">
                <div className="h-5 bg-white/5 border-b border-white/10 flex items-center px-3 gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500/80" />
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/80" />
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500/80" />
                </div>
                <div className="p-0 h-full w-full">
                  <div className="w-full h-full bg-[url('/LuxQuant Performance Dashboard.png')] bg-cover bg-top opacity-40 mix-blend-screen" />
                </div>
              </div>

              <div className="absolute bottom-4 right-[8%] lg:right-[12%] w-[90px] h-[190px] bg-black border-[3px] border-[#2a2a2a] rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.9)] z-20 overflow-hidden" style={{ animation: 'float-subtle 5s ease-in-out infinite' }}>
                <div className="absolute top-0 inset-x-0 h-3 bg-[#2a2a2a] w-1/2 mx-auto rounded-b-md z-30" />
                <div className="w-full h-full bg-[url('/fiturlq1.png')] bg-cover bg-top opacity-80" />
              </div>
            </div>
          </div>

          {/* 2. AI ARENA */}
          <div className="bento-card md:col-span-2 p-6 lg:p-7 flex flex-col justify-between bg-gradient-to-br from-[#0a0805] to-[#120f0a]">
            <div className="bento-glow" />
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-gold-primary font-mono text-[9px] tracking-widest uppercase mb-1 block">Data Synthesis</span>
                <h3 className="font-display text-xl font-bold text-white leading-tight">AI Arena:<br/>Market Consensus</h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gold-primary/10 border border-gold-primary/20 flex items-center justify-center shadow-[inset_0_0_10px_rgba(212,168,83,0.1)]">
                <svg className="w-5 h-5 text-gold-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-end">
              <p className="text-text-secondary text-xs lg:text-sm mb-5 leading-relaxed">
                Stop guessing. Our AI engine ingests millions of data points from multiple quantitative models to provide you with a clear, unified summary of the overall market direction.
              </p>
              <div className="w-full bg-black/50 border border-white/5 rounded-lg p-3">
                <div className="flex justify-between text-[9px] font-mono text-white/50 mb-2">
                  <span>BEARISH</span>
                  <span className="text-gold-primary font-bold">BULLISH CONSENSUS</span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden flex">
                  <div className="h-full bg-gradient-to-r from-gold-dark to-gold-primary rounded-full relative" style={{ width: '85%', animation: 'progress-scan 2s ease-out forwards' }}>
                    <div className="absolute right-0 top-0 bottom-0 w-4 bg-white/40 blur-[2px]" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. 24/7 AUTONOMOUS */}
          <div className="bento-card p-6 flex flex-col justify-between group">
            <div className="bento-glow" />
            <div>
              <span className="text-green-400 font-mono text-[9px] tracking-widest uppercase mb-1 block">Always Active</span>
              <h3 className="font-display text-lg font-bold text-white mb-2 leading-tight">24/7 Zero<br/>Downtime</h3>
              <p className="text-text-secondary text-xs">
                Sleep while the algorithm works. Continuous market scanning without human fatigue or emotional bias.
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-white/40">SYSTEM STATUS</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-green-400 font-bold tracking-wider">OPERATIONAL</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4. LIVE FEEDS */}
          <div className="bento-card p-6 flex flex-col justify-between">
            <div className="bento-glow" />
            <div>
              <span className="text-blue-400 font-mono text-[9px] tracking-widest uppercase mb-1 block">Live Feeds</span>
              <h3 className="font-display text-lg font-bold text-white mb-2 leading-tight">Integrated<br/>Market Data</h3>
              <p className="text-text-secondary text-xs">
                Real-time price feeds, volume, and order flow from major exchanges consolidated in one view.
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-white/80">BTC/USDT</span>
                <span className="text-green-400" style={{ animation: 'data-blink 3s infinite' }}>$72,480.50</span>
              </div>
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-white/80">ETH/USDT</span>
                <span className="text-red-400" style={{ animation: 'data-blink 4s infinite 1s' }}>$3,412.20</span>
              </div>
            </div>
          </div>

          {/* 5. ON-CHAIN WHALE */}
          <div className="bento-card p-6 flex flex-col justify-between bg-gradient-to-tl from-[#0a0805] to-[#0a0f14]">
            <div className="bento-glow" />
            <div>
              <span className="text-blue-400 font-mono text-[9px] tracking-widest uppercase mb-1 block">Whale Tracking</span>
              <h3 className="font-display text-lg font-bold text-white mb-2 leading-tight">On-Chain<br/>Surveillance</h3>
              <p className="text-text-secondary text-xs">Track massive wallet transfers and exchange netflows before retail reacts.</p>
            </div>
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2 flex justify-between items-center text-[9px] font-mono">
                <span className="text-blue-400/70">ALERT</span>
                <span className="text-blue-400 font-bold">12,400 BTC MOVED</span>
              </div>
            </div>
          </div>

          {/* 6. MACRO CALENDAR */}
          <div className="bento-card xl:col-span-3 p-6 flex flex-col justify-between">
            <div className="bento-glow" />
            <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between h-full">
              <div className="max-w-md">
                <div className="w-8 h-8 rounded bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                  <span className="text-white/70 text-sm">📅</span>
                </div>
                <h3 className="font-display text-lg font-bold text-white mb-2">Macroeconomic Sync & Liquidity</h3>
                <p className="text-text-secondary text-xs leading-relaxed">
                  Correlate crypto volatility with live global economic events (CPI, FOMC). Combine it with our Order Book Matrix to pinpoint exact support and resistance walls.
                </p>
              </div>
              <div className="flex flex-col gap-3 min-w-[200px]">
                <div className="bg-black/50 border border-white/5 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-white/50 font-mono text-[9px]">FED RATE DECISION</span>
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" style={{ animation: 'pulse-ring 2s infinite' }} />
                </div>
                <div className="flex h-4 w-full rounded overflow-hidden border border-white/5">
                   <div className="bg-red-500/20 border-r border-red-500/50 w-[35%]" />
                   <div className="bg-green-500/20 border-l border-green-500/50 w-[65%]" />
                </div>
                <p className="text-center text-[8px] font-mono text-white/30 uppercase tracking-widest">Order Book Heatmap</p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ════════════════════════════════════════
          PERFORMANCE STATS
      ════════════════════════════════════════ */}
      <section id="performance" className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24 mt-12">
        <LivePerformanceStats data={performanceData} />
      </section>

      {/* ════════════════════════════════════════
          TESTIMONIALS
      ════════════════════════════════════════ */}
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

      {/* ════════════════════════════════════════
          FAQ
      ════════════════════════════════════════ */}
      <section id="faq" className="relative z-10 max-w-4xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-white mb-4">Frequently Asked Questions</h2>
          <p className="text-text-secondary text-lg">Everything you need to know about LuxQuant Algorithm.</p>
        </div>
        <div className="flex flex-col gap-2">
          {FAQ_DATA.map((item, index) => (
            <FAQItem key={index} q={item.q} a={item.a} isOpen={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? null : index)} />
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════
          TELEGRAM CTA
      ════════════════════════════════════════ */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24">
        <TelegramPromo />
      </section>

      {/* ════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════ */}
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

      {/* ════════════════════════════════════════
          STICKY MOBILE CTA
      ════════════════════════════════════════ */}
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