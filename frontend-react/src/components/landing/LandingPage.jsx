// src/components/landing/LandingPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import TopPerformers from '../TopPerformers';
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
// Sub-components
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

const StatCard = ({ value, label, icon }) => (
  <div className="glass-card rounded-xl p-5 border border-gold-primary/10 text-center">
    <span className="text-2xl mb-2 block">{icon}</span>
    <p className="font-display text-2xl lg:text-3xl font-bold text-gold-primary">{value}</p>
    <p className="text-text-muted text-xs mt-1 uppercase tracking-wider">{label}</p>
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
// Live Performance Stats (from /api/v1/signals/analyze)
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

const LivePerformanceStats = () => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/v1/signals/analyze?time_range=all&trend_mode=weekly');
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
        }
      } catch (e) { console.warn('Stats fetch failed:', e); }
    };
    fetchStats();
  }, []);

  const winRate = stats?.win_rate || 0;
  const totalSignals = stats?.total_signals || 0;
  const closedTrades = stats?.closed_trades || 0;
  const winners = stats?.winners || 0;
  const losses = stats?.losses || 0;
  const uniquePairs = stats?.unique_pairs || 0;

  return (
    <div>
      <div className="text-center mb-8">
        <p className="text-gold-primary text-xs font-semibold uppercase tracking-[0.2em] mb-3">Verified Performance</p>
        <h2 className="font-display text-3xl lg:text-4xl font-bold text-white mb-3">
          Transparent & <span className="text-gold-primary">Data-Driven</span>
        </h2>
        <p className="text-text-secondary text-base max-w-2xl mx-auto">
          Every signal is recorded, tracked, and verified on-chain. Full history available — no hidden trades, no cherry-picking.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {/* Runtime counter - full width */}
        <RuntimeCounter />

        {/* Main metrics */}
        <div className="glass-card rounded-xl p-4 lg:p-5 border border-gold-primary/10">
          <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">Win Rate</p>
          <p className={`font-mono text-2xl lg:text-3xl font-bold ${winRate >= 70 ? 'text-positive' : winRate >= 50 ? 'text-gold-primary' : 'text-negative'}`}>
            {stats ? `${winRate.toFixed(1)}%` : '—'}
          </p>
          <p className="text-text-muted text-[10px] mt-1">All-time performance</p>
        </div>

        <div className="glass-card rounded-xl p-4 lg:p-5 border border-gold-primary/10">
          <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">Total Signals</p>
          <p className="font-mono text-2xl lg:text-3xl font-bold text-white">
            {stats ? totalSignals.toLocaleString() : '—'}
          </p>
          <p className="text-text-muted text-[10px] mt-1">Calls generated</p>
        </div>

        <div className="glass-card rounded-xl p-4 lg:p-5 border border-gold-primary/10">
          <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">Winners</p>
          <p className="font-mono text-2xl lg:text-3xl font-bold text-positive">
            {stats ? winners.toLocaleString() : '—'}
          </p>
          <p className="text-text-muted text-[10px] mt-1">Profitable trades</p>
        </div>

        <div className="glass-card rounded-xl p-4 lg:p-5 border border-gold-primary/10">
          <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">Losses</p>
          <p className="font-mono text-2xl lg:text-3xl font-bold text-negative">
            {stats ? losses.toLocaleString() : '—'}
          </p>
          <p className="text-text-muted text-[10px] mt-1">Stop-loss hit</p>
        </div>

        {/* Extra metrics */}
        <div className="glass-card rounded-xl p-4 lg:p-5 border border-gold-primary/10">
          <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">Closed Trades</p>
          <p className="font-mono text-2xl lg:text-3xl font-bold text-white">
            {stats ? closedTrades.toLocaleString() : '—'}
          </p>
          <p className="text-text-muted text-[10px] mt-1">Resolved signals</p>
        </div>

        <div className="glass-card rounded-xl p-4 lg:p-5 border border-gold-primary/10">
          <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">Unique Pairs</p>
          <p className="font-mono text-2xl lg:text-3xl font-bold text-gold-primary">
            {stats ? uniquePairs.toLocaleString() : '—'}
          </p>
          <p className="text-text-muted text-[10px] mt-1">Coins traded</p>
        </div>

        <div className="glass-card rounded-xl p-4 lg:p-5 border border-gold-primary/10">
          <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">24/7 Monitoring</p>
          <p className="font-mono text-2xl lg:text-3xl font-bold text-gold-primary">Non-Stop</p>
          <p className="text-text-muted text-[10px] mt-1">Always scanning markets</p>
        </div>

        <div className="glass-card rounded-xl p-4 lg:p-5 border border-gold-primary/10">
          <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">Full History</p>
          <p className="font-mono text-2xl lg:text-3xl font-bold text-gold-primary">100%</p>
          <p className="text-text-muted text-[10px] mt-1">Transparent records</p>
        </div>
      </div>

      {/* Trust banner */}
      <div className="mt-6 p-4 rounded-xl bg-gold-primary/5 border border-gold-primary/10 flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
        <span className="text-2xl">🔒</span>
        <p className="text-text-secondary text-sm leading-relaxed">
          <span className="text-white font-semibold">Every single trade is on record.</span>{' '}
          All {stats ? totalSignals.toLocaleString() : '...'} signals since December 2023 are publicly verifiable with entry, targets, stop-loss, and outcome — no edits, no deletions.
        </p>
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// LANDING PAGE
// ════════════════════════════════════════
const LandingPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const goTerminal = () => navigate('/terminal');
  const goLogin = () => navigate('/login');
  const goRegister = () => navigate('/register');
  const scrollTo = (id) => { setMobileMenuOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  return (
    <div className="min-h-screen bg-bg-primary text-white relative">
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
              {[['Features', 'features'], ['Performance', 'performance'], ['Testimonials', 'testimonials']].map(([label, id]) => (
                <button key={id} onClick={() => scrollTo(id)} className="text-text-secondary hover:text-gold-primary text-sm font-medium transition-colors">{label}</button>
              ))}
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
            {[['Features', 'features'], ['Performance', 'performance'], ['Testimonials', 'testimonials']].map(([label, id]) => (
              <button key={id} onClick={() => scrollTo(id)} className="block w-full text-left text-text-secondary hover:text-gold-primary text-sm font-medium py-2">{label}</button>
            ))}
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

      {/* HERO */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pt-12 lg:pt-20 pb-16 lg:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold-primary/10 border border-gold-primary/20 mb-6">
              <span className="w-2 h-2 bg-positive rounded-full animate-pulse" />
              <span className="text-gold-primary text-xs font-semibold uppercase tracking-wider">Live Trading Signals</span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              AI-Powered
              <span className="block bg-gradient-to-r from-gold-light via-gold-primary to-gold-dark bg-clip-text text-transparent">Crypto Trading</span>
              Intelligence
            </h1>
            <p className="text-text-secondary text-lg lg:text-xl leading-relaxed mb-8 max-w-xl">
              Professional trading terminal with real-time signals, market analytics, AI predictions, and institutional-grade tools.
            </p>
            <div className="flex flex-wrap gap-4">
              <button onClick={isAuthenticated ? goTerminal : goRegister} className="px-8 py-3.5 rounded-xl font-bold text-sm transition-all hover:scale-105" style={{ background: 'linear-gradient(to right, #d4a853, #8b6914)', color: '#0a0506', boxShadow: '0 0 30px rgba(212, 168, 83, 0.4)' }}>
                {isAuthenticated ? 'Open Terminal' : 'Start Free Trial'}
              </button>
              <button onClick={() => scrollTo('features')} className="px-8 py-3.5 rounded-xl font-bold text-sm border border-gold-primary/30 text-gold-primary hover:bg-gold-primary/10 transition-all">Explore Features</button>
            </div>
            <div className="flex items-center gap-6 mt-10 pt-8 border-t border-gold-primary/10">
              {[{ val: '10K+', lbl: 'Active Users' }, { val: '89%', lbl: 'Win Rate' }, { val: '24/7', lbl: 'Live Signals' }].map(({ val, lbl }) => (
                <div key={lbl}>
                  <p className="font-display text-xl font-bold text-gold-primary">{val}</p>
                  <p className="text-text-muted text-xs">{lbl}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Globe from LeftBrandPanel */}
          <div className="hidden lg:flex items-center justify-center">
            <div style={{ position: 'relative', width: '100%', maxWidth: 520, aspectRatio: '1 / 1' }}>
              <GlobeViz />
              <FlagBadges />
            </div>
          </div>
        </div>
      </section>

      {/* TOP PERFORMERS */}
      <section id="performance" className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24">
        <TopPerformers />
      </section>

      {/* FEATURES */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-0.5 bg-gradient-to-r from-transparent to-gold-primary" />
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-white">Why LuxQuant?</h2>
            <div className="w-12 h-0.5 bg-gradient-to-l from-transparent to-gold-primary" />
          </div>
          <p className="text-text-secondary text-lg max-w-2xl mx-auto">Everything you need for professional crypto trading, in one terminal.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          <FeatureCard icon="📡" title="Real-Time Signals" desc="AI-generated trading signals with entry, TP targets, and stop-loss levels. Delivered instantly via Telegram and terminal." />
          <FeatureCard icon="🤖" title="AI Arena" desc="Multiple AI models competing to predict market direction. See which model performs best in real-time." />
          <FeatureCard icon="📊" title="Market Overview" desc="Total market cap, BTC dominance, Fear & Greed index, sector performance — all in one dashboard." />
          <FeatureCard icon="🐋" title="Whale Alerts" desc="Track large transactions and smart money movements. Know when whales are buying or selling." />
          <FeatureCard icon="📅" title="Macro Calendar" desc="Economic events that impact crypto markets. CPI, FOMC, earnings — never miss a catalyst." />
          <FeatureCard icon="📈" title="Performance Analytics" desc="Track your signal performance, win rates, average gains, and portfolio analytics over time." />
        </div>
      </section>

      {/* ═══════════════════════════════════
          HOW IT WORKS — System Architecture
      ═══════════════════════════════════ */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24">
        <div className="text-center mb-12">
          <p className="text-gold-primary text-xs font-semibold uppercase tracking-[0.2em] mb-3">How It Works</p>
          <h2 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4">
            System <span className="text-gold-primary">Architecture</span>
          </h2>
          <p className="text-text-secondary text-base max-w-xl mx-auto">
            See how our algorithm processes market data to generate high-quality trading signals
          </p>
        </div>

        {/* Architecture Diagram */}
        <div className="relative flex flex-col lg:flex-row items-center lg:items-stretch justify-between gap-6 lg:gap-0">

          {/* LEFT: Input Sources */}
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

          {/* CONNECTOR LINE LEFT */}
          <div className="hidden lg:flex items-center justify-center w-16 flex-shrink-0">
            <div className="w-full h-0.5 bg-gradient-to-r from-gold-primary/40 to-gold-primary/20 relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gold-primary" />
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gold-primary/60" />
            </div>
          </div>
          {/* Mobile arrow */}
          <div className="lg:hidden flex justify-center">
            <svg className="w-6 h-6 text-gold-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
          </div>

          {/* CENTER: Processing */}
          <div className="flex flex-col sm:flex-row items-center gap-6 lg:gap-8 flex-1 justify-center">
            {/* Data Pipeline */}
            <div className="glass-card rounded-xl p-5 border border-gold-primary/10 text-center w-[160px]">
              <div className="flex flex-col gap-1.5 mb-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-2 rounded-full bg-gradient-to-r from-gold-primary/30 to-gold-primary/10" style={{ width: `${70 + i * 6}%`, marginLeft: 'auto', marginRight: 'auto' }} />
                ))}
              </div>
              <p className="text-gold-primary text-xs font-semibold">Data Pipeline</p>
              <p className="text-text-muted text-[10px] uppercase tracking-wider mt-0.5">Processing Node</p>
            </div>

            {/* Connector */}
            <div className="hidden sm:flex items-center w-10">
              <div className="w-full h-0.5 bg-gradient-to-r from-gold-primary/30 to-gold-primary/20 relative">
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gold-primary/60" />
              </div>
            </div>
            <div className="sm:hidden">
              <svg className="w-6 h-6 text-gold-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </div>

            {/* Algorithm Core */}
            <div className="relative">
              <div className="w-28 h-28 lg:w-36 lg:h-36 rounded-full border-2 border-gold-primary/30 flex items-center justify-center relative" style={{ background: 'radial-gradient(circle, rgba(212,168,83,0.08) 0%, transparent 70%)' }}>
                <div className="absolute inset-2 rounded-full border border-gold-primary/15" />
                <div className="text-center">
                  <p className="text-gold-primary font-mono text-2xl lg:text-3xl font-bold">&lt;/&gt;</p>
                  <p className="text-text-muted text-[8px] lg:text-[10px] uppercase tracking-wider mt-1 font-semibold">LuxQuant</p>
                  <p className="text-gold-primary text-[7px] lg:text-[8px] uppercase tracking-widest">Algorithm</p>
                </div>
              </div>
              {/* Pulse ring */}
              <div className="absolute inset-0 rounded-full border border-gold-primary/20 animate-ping" style={{ animationDuration: '3s' }} />
            </div>
          </div>

          {/* CONNECTOR LINE RIGHT */}
          <div className="hidden lg:flex items-center justify-center w-16 flex-shrink-0">
            <div className="w-full h-0.5 bg-gradient-to-r from-gold-primary/20 to-gold-primary/40 relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gold-primary/60" />
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gold-primary" />
            </div>
          </div>
          <div className="lg:hidden flex justify-center">
            <svg className="w-6 h-6 text-gold-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
          </div>

          {/* RIGHT: Output */}
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

        {/* Bottom description */}
        <div className="mt-12 text-center max-w-3xl mx-auto">
          <p className="font-display text-lg lg:text-xl text-text-secondary italic leading-relaxed">
            Operating 24/7 with real-time market monitoring and lightning-fast execution, powered by an adaptive algorithm that dynamically adjusts strategies based on market conditions to deliver high-quality trading signals.
          </p>
        </div>
      </section>

      {/* LIVE PERFORMANCE STATS */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-16 lg:pb-24">
        <LivePerformanceStats />
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
          <TestimonialCard flag="🇮🇩" name="Andi Pratama" role="Day Trader, Jakarta" text="Sinyal LuxQuant sangat akurat. Dalam 1 bulan pertama, profit saya naik 40%. Terminal-nya juga lengkap banget." />
          <TestimonialCard flag="🇹🇼" name="Chen Wei-Lin" role="Swing Trader, Taipei" text="AI Arena feature is amazing. I can see which model performs best and follow the strongest predictions. Game changer." />
          <TestimonialCard flag="🇸🇬" name="Raj Patel" role="Portfolio Manager, Singapore" text="The combination of whale alerts, macro calendar, and signals gives me an institutional-grade edge. Worth every penny." />
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-20 lg:pb-32">
        <div className="glass-card rounded-2xl p-8 lg:p-16 border border-gold-primary/20 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-gold-primary/5 via-transparent to-gold-primary/5" />
          <div className="relative z-10">
            <h2 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4">Ready to Trade <span className="text-gold-primary">Smarter</span>?</h2>
            <p className="text-text-secondary text-lg mb-8 max-w-xl mx-auto">Join thousands of traders using AI-powered signals to maximize their crypto profits.</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button onClick={isAuthenticated ? goTerminal : goRegister} className="px-10 py-4 rounded-xl font-bold text-sm transition-all hover:scale-105" style={{ background: 'linear-gradient(to right, #d4a853, #8b6914)', color: '#0a0506', boxShadow: '0 0 30px rgba(212, 168, 83, 0.4)' }}>
                {isAuthenticated ? 'Open Terminal' : 'Create Free Account'}
              </button>
              <a href="https://t.me/luxquant" target="_blank" rel="noopener noreferrer" className="px-10 py-4 rounded-xl font-bold text-sm border border-gold-primary/30 text-gold-primary hover:bg-gold-primary/10 transition-all inline-flex items-center justify-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.504-1.36 8.629-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                Join Telegram
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-gold-primary/10">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="LuxQuant" className="w-8 h-8 rounded-lg" />
              <span className="font-display text-sm font-semibold text-white">LuxQuant</span>
              <span className="text-text-muted text-xs ml-2">© {new Date().getFullYear()}</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="https://t.me/luxquant" target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-gold-primary transition-colors text-sm">Telegram</a>
              <a href="https://x.com/luxquant" target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-gold-primary transition-colors text-sm">Twitter</a>
            </div>
          </div>
          <p className="text-text-muted text-xs text-center mt-8 max-w-2xl mx-auto leading-relaxed">
            Disclaimer: Trading cryptocurrency involves significant risk. Past performance does not guarantee future results. LuxQuant provides tools and signals for informational purposes only.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;