import { useState, useEffect } from 'react';

const Header = ({ activeTab, setActiveTab }) => {
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-bg-primary border-b border-gold-primary/20">
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* SATU BARIS: Logo + Nav di kiri, Live + Time di kanan */}
        <div className="flex items-center justify-between">
          
          {/* KIRI: Logo + Navigation dalam satu grup */}
          <div className="flex items-center gap-6">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark rounded-xl flex items-center justify-center">
                <span className="text-bg-primary font-display font-bold">LQ</span>
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-white leading-none">LuxQuant</h1>
                <p className="text-[10px] text-text-muted uppercase tracking-widest">Trading Terminal</p>
              </div>
            </div>

            {/* Navigation - langsung setelah logo */}
            <nav className="flex items-center">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'dashboard'
                    ? 'text-gold-primary bg-gold-primary/10'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('market')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'market'
                    ? 'text-gold-primary bg-gold-primary/10'
                    : 'text-text-secondary hover:text-white'
                }`}
              >
                Market
              </button>
            </nav>
          </div>

          {/* KANAN: Live + Time */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-green-400 text-xs font-semibold">LIVE</span>
            </div>
            <span className="font-mono text-sm text-text-secondary">{currentTime}</span>
          </div>

        </div>
      </div>
    </header>
  );
};



export default Header;