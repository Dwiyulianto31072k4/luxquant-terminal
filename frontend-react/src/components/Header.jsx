import { useState, useEffect } from 'react';

function Header({ market }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatPrice = (price) => {
    if (!price) return '--';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  return (
    <header className="flex items-center justify-between py-4 mb-6 flex-wrap gap-4">
      {/* Logo */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark rounded-2xl flex items-center justify-center shadow-gold-glow">
          <span className="font-display font-bold text-xl text-bg-primary">LQ</span>
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-white tracking-wide">LuxQuant</h1>
          <p className="text-xs text-text-muted uppercase tracking-[3px]">Premium Terminal</p>
        </div>
      </div>

      {/* BTC Price */}
      {market && (
        <div className="flex items-center gap-4 px-6 py-3 glass-card">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center">
            <span className="font-bold text-white">₿</span>
          </div>
          <div>
            <p className="text-xs text-text-muted">Bitcoin</p>
            <p className="font-mono text-xl font-bold text-white">{formatPrice(market.btc_price)}</p>
          </div>
          <span className={`font-mono text-sm font-semibold px-3 py-1 rounded-lg ${
            market.btc_change_24h >= 0 
              ? 'bg-positive/10 text-positive border border-positive/20' 
              : 'bg-negative/10 text-negative border border-negative/20'
          }`}>
            {market.btc_change_24h >= 0 ? '+' : ''}{market.btc_change_24h?.toFixed(2)}%
          </span>
        </div>
      )}

      {/* Right Side */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-4 py-2 bg-positive/10 border border-positive/30 rounded-full">
          <span className="w-2 h-2 bg-positive rounded-full live-dot" />
          <span className="text-xs font-semibold text-positive uppercase tracking-wider">Live</span>
        </div>
        <div className="font-mono text-sm text-text-secondary px-4 py-2 bg-bg-card border border-gold-primary/15 rounded-xl">
          {formatTime(time)}
        </div>
      </div>
    </header>
  );
}

export default Header;
