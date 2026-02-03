import { useState, useEffect } from 'react';
import OverviewPage from './components/OverviewPage';
import SignalsPage from './components/SignalsPage';
import BitcoinPage from './components/BitcoinPage';
import MarketsPage from './components/MarketsPage';

function App() {
  const [activeTab, setActiveTab] = useState('overview');

  // Navigation items
  const navItems = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'signals', label: 'Signals', icon: '📡' },
    { key: 'bitcoin', label: 'Bitcoin', icon: '₿' },
    { key: 'markets', label: 'Markets', icon: '🪙' },
  ];

  // Render active page
  const renderPage = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewPage />;
      case 'signals':
        return <SignalsPage />;
      case 'bitcoin':
        return <BitcoinPage />;
      case 'markets':
        return <MarketsPage />;
      default:
        return <OverviewPage />;
    }
  };

  return (
    <div className="min-h-screen">
      {/* Background */}
      <div className="luxury-bg" />
      
      {/* Corner Ornaments */}
      <div className="corner-ornament top-left" />
      <div className="corner-ornament top-right" />
      <div className="corner-ornament bottom-left" />
      <div className="corner-ornament bottom-right" />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-bg-primary/95 backdrop-blur-md border-b border-gold-primary/10">
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo + Navigation */}
            <div className="flex items-center gap-8">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark rounded-xl flex items-center justify-center shadow-gold-glow">
                  <span className="font-display font-bold text-sm text-bg-primary">LQ</span>
                </div>
                <h1 className="font-display text-lg font-semibold text-white tracking-wide hidden sm:block">
                  LuxQuant
                </h1>
              </div>

              {/* Navigation */}
              <nav className="flex items-center gap-1">
                {navItems.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      activeTab === item.key
                        ? 'text-gold-primary bg-gold-primary/10'
                        : 'text-text-secondary hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span className="hidden md:inline">{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-3">
              {/* Live Badge */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-positive/10 border border-positive/30 rounded-lg">
                <span className="w-2 h-2 bg-positive rounded-full live-dot" />
                <span className="text-xs font-semibold text-positive uppercase">Live</span>
              </div>

              {/* Clock */}
              <LiveClock />

              {/* Search */}
              <button className="p-2 text-text-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              {/* Notifications */}
              <button className="p-2 text-text-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors relative">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="absolute top-1 right-1 w-2 h-2 bg-gold-primary rounded-full" />
              </button>

              {/* Settings */}
              <button className="p-2 text-text-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-[1600px] mx-auto px-6 py-6">
        {renderPage()}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gold-primary/10 mt-12">
        <div className="max-w-[1600px] mx-auto px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark rounded-lg flex items-center justify-center">
                <span className="font-display font-bold text-xs text-bg-primary">LQ</span>
              </div>
              <span className="text-text-muted text-sm">LuxQuant Terminal</span>
            </div>
            <p className="text-text-muted text-xs">
              Data provided by CoinGecko & Alternative.me • Auto-refresh every 30s
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Live Clock Component
const LiveClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="hidden sm:block font-mono text-sm text-text-secondary px-3 py-1.5 bg-bg-card/50 border border-gold-primary/10 rounded-lg">
      {time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </div>
  );
};

export default App;