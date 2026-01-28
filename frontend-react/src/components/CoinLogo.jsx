import { useState } from 'react';

/**
 * CoinLogo Component
 * Fetches coin logos from TradingView (primary) with multiple fallbacks
 */
const CoinLogo = ({ pair, size = 40, className = '' }) => {
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [imgError, setImgError] = useState(false);

  // Extract coin symbol from pair (e.g., "BTCUSDT" -> "BTC")
  const getCoinSymbol = (pairStr) => {
    if (!pairStr) return '';
    return pairStr.replace(/USDT$/i, '').toUpperCase();
  };

  const symbol = getCoinSymbol(pair);
  const symbolLower = symbol.toLowerCase();
  
  // Logo sources - TradingView first!
  const logoSources = [
    // 1. TradingView (primary - best coverage for trading pairs)
    `https://s3-symbol-logo.tradingview.com/crypto/XTVC${symbol}--big.svg`,
    
    // 2. TradingView alternative format
    `https://s3-symbol-logo.tradingview.com/crypto/XTVC${symbol}.svg`,
    
    // 3. CryptoCompare
    `https://www.cryptocompare.com/media/37746238/${symbolLower}.png`,
    
    // 4. CoinCap
    `https://assets.coincap.io/assets/icons/${symbolLower}@2x.png`,
    
    // 5. CryptoIcons GitHub
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${symbolLower}.png`,
  ];

  // Get initials for fallback
  const getInitials = () => {
    if (!symbol) return '?';
    const cleanSymbol = symbol.replace(/^\d+/, '') || symbol;
    return cleanSymbol.substring(0, 2).toUpperCase();
  };

  // Generate consistent gradient color based on symbol
  const getGradientColor = () => {
    const gradients = [
      ['#f7931a', '#c57612'], // Orange (BTC)
      ['#627eea', '#4158b0'], // Blue (ETH)
      ['#00d4aa', '#00a383'], // Teal
      ['#e84142', '#b33233'], // Red
      ['#f3ba2f', '#d4a017'], // Yellow (BNB)
      ['#8247e5', '#6235b0'], // Purple (MATIC)
      ['#26a17b', '#1e8063'], // Green (USDT)
      ['#ff007a', '#cc0062'], // Pink (UNI)
      ['#00acd7', '#0088b3'], // Cyan
      ['#ff6b35', '#e55a2b'], // Coral
      ['#9945ff', '#7a37cc'], // Violet (SOL)
      ['#14f195', '#10c077'], // Bright Green
    ];
    
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
      hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
    }
    return gradients[Math.abs(hash) % gradients.length];
  };

  const handleImageError = () => {
    const nextIndex = currentSourceIndex + 1;
    if (nextIndex < logoSources.length) {
      setCurrentSourceIndex(nextIndex);
    } else {
      setImgError(true);
    }
  };

  // Colorful letter avatar as final fallback
  if (imgError) {
    const [color1, color2] = getGradientColor();
    return (
      <div 
        className={`rounded-full flex items-center justify-center text-white font-bold shadow-lg ${className}`}
        style={{ 
          width: size, 
          height: size, 
          fontSize: size * 0.38,
          background: `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`,
          boxShadow: `0 2px 8px ${color1}40`
        }}
      >
        {getInitials()}
      </div>
    );
  }

  return (
    <img
      src={logoSources[currentSourceIndex]}
      alt={symbol}
      width={size}
      height={size}
      className={`rounded-full ${className}`}
      onError={handleImageError}
      style={{ 
        width: size, 
        height: size, 
        objectFit: 'cover',
        backgroundColor: '#1a0a0a'
      }}
    />
  );
};

export default CoinLogo;