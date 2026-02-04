// src/components/WatchlistPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { watchlistApi } from '../services/watchlistApi';
import StarButton from './StarButton';
import CoinLogo from './CoinLogo';

// Binance API URLs - Same as TradingView uses for BINANCE:xxxUSDT.P
const BINANCE_FUTURES_API = 'https://fapi.binance.com/fapi/v1';
const BINANCE_SPOT_API = 'https://api.binance.com/api/v3';

const WatchlistPage = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPrices, setCurrentPrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [priceSource, setPriceSource] = useState('');

  // Fetch watchlist
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const fetchWatchlist = async () => {
      try {
        const data = await watchlistApi.getWatchlist();
        setWatchlist(data.items || []);
      } catch (error) {
        console.error('Failed to fetch watchlist:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWatchlist();
  }, [isAuthenticated, navigate]);

  // Fetch current prices directly from Binance (frontend)
  const fetchCurrentPrices = useCallback(async () => {
    if (watchlist.length === 0) return;
    
    setPricesLoading(true);
    
    try {
      // Get unique pairs from watchlist
      const pairs = [...new Set(watchlist.map(item => item.pair).filter(Boolean))];
      
      if (pairs.length === 0) {
        setPricesLoading(false);
        return;
      }
      
      const prices = {};
      let source = '';
      
      // Strategy 1: Try Binance Futures first (has perpetual contracts like AGTUSDT.P)
      try {
        const futuresResponse = await fetch(`${BINANCE_FUTURES_API}/ticker/price`);
        if (futuresResponse.ok) {
          const futuresData = await futuresResponse.json();
          const futuresPrices = {};
          
          futuresData.forEach(item => {
            futuresPrices[item.symbol] = parseFloat(item.price);
          });
          
          // Match our pairs with futures prices
          pairs.forEach(pair => {
            if (futuresPrices[pair]) {
              prices[pair] = futuresPrices[pair];
            }
          });
          
          if (Object.keys(prices).length > 0) {
            source = 'Binance Futures';
          }
        }
      } catch (e) {
        console.warn('Binance Futures fetch failed:', e);
      }
      
      // Strategy 2: For remaining pairs, try Binance Spot
      const remainingPairs = pairs.filter(p => !prices[p]);
      
      if (remainingPairs.length > 0) {
        try {
          const spotResponse = await fetch(`${BINANCE_SPOT_API}/ticker/price`);
          if (spotResponse.ok) {
            const spotData = await spotResponse.json();
            const spotPrices = {};
            
            spotData.forEach(item => {
              spotPrices[item.symbol] = parseFloat(item.price);
            });
            
            remainingPairs.forEach(pair => {
              if (spotPrices[pair]) {
                prices[pair] = spotPrices[pair];
              }
            });
            
            if (source) {
              source += ' + Spot';
            } else {
              source = 'Binance Spot';
            }
          }
        } catch (e) {
          console.warn('Binance Spot fetch failed:', e);
        }
      }
      
      setCurrentPrices(prices);
      setPriceSource(source || 'Unavailable');
      
    } catch (error) {
      console.error('Failed to fetch prices:', error);
      setPriceSource('Error');
    } finally {
      setPricesLoading(false);
    }
  }, [watchlist]);

  // Fetch prices when watchlist changes and every 10 seconds
  useEffect(() => {
    if (watchlist.length > 0) {
      fetchCurrentPrices();
      const interval = setInterval(fetchCurrentPrices, 10000);
      return () => clearInterval(interval);
    }
  }, [fetchCurrentPrices, watchlist.length]);

  // Handle remove from watchlist
  const handleRemove = (signalId) => {
    setWatchlist(prev => prev.filter(item => item.signal_id !== signalId));
  };

  // Calculate profit/loss percentage
  const calcProfitLoss = (entry, currentPrice) => {
    if (!entry || !currentPrice) return null;
    return ((currentPrice - entry) / entry * 100);
  };

  // Get max target from signal
  const getMaxTarget = (item) => {
    const targets = [item.target4, item.target3, item.target2, item.target1].filter(t => t);
    if (targets.length === 0) return null;
    return targets[0];
  };

  // Format price based on value
  const formatPrice = (price) => {
    if (!price) return '-';
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    if (price < 100) return price.toFixed(3);
    return price.toFixed(2);
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get status badge
  const getStatusBadge = (status) => {
    const config = {
      'open': { bg: 'bg-cyan-500', text: 'OPEN', icon: '●' },
      'tp1': { bg: 'bg-green-500', text: 'TP1', icon: '✓' },
      'tp2': { bg: 'bg-lime-500', text: 'TP2', icon: '✓' },
      'tp3': { bg: 'bg-yellow-500', text: 'TP3', icon: '✓' },
      'tp4': { bg: 'bg-orange-500', text: 'TP4', icon: '✓' },
      'closed_win': { bg: 'bg-green-600', text: 'WIN', icon: '🏆' },
      'closed_loss': { bg: 'bg-red-500', text: 'LOSS', icon: '✗' },
      'sl': { bg: 'bg-red-500', text: 'SL', icon: '✗' }
    };
    const c = config[status?.toLowerCase()] || { bg: 'bg-gray-500', text: status || '-', icon: '' };
    return (
      <span className={`${c.bg} text-white text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1`}>
        <span>{c.icon}</span>
        {c.text}
      </span>
    );
  };

  // Get coin name without USDT
  const getCoinName = (pair) => {
    if (!pair) return '';
    return pair.replace(/USDT$/i, '');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-gold-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary">Loading watchlist...</p>
        </div>
      </div>
    );
  }

  // Count stats
  const openCount = watchlist.filter(w => w.status?.toLowerCase() === 'open').length;
  const inProfitCount = watchlist.filter(w => {
    const cp = currentPrices[w.pair];
    return cp && w.entry && cp > w.entry;
  }).length;
  const inLossCount = watchlist.filter(w => {
    const cp = currentPrices[w.pair];
    return cp && w.entry && cp < w.entry;
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
            <h1 className="text-2xl font-display font-bold text-white">My Watchlist</h1>
          </div>
          <p className="text-text-secondary mt-2 ml-[76px]">
            {watchlist.length} signal{watchlist.length !== 1 ? 's' : ''} dalam watchlist
          </p>
        </div>
        
        {/* Refresh indicator */}
        {watchlist.length > 0 && (
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <span className={`w-2 h-2 rounded-full ${
              pricesLoading ? 'bg-yellow-400 animate-pulse' : 
              Object.keys(currentPrices).length > 0 ? 'bg-green-400' : 'bg-red-400'
            }`} />
            <span>
              {pricesLoading ? 'Updating...' : 
               priceSource ? `${priceSource} • 10s refresh` : 'Connecting...'}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      {watchlist.length === 0 ? (
        <div className="text-center py-16 glass-card rounded-2xl border border-gold-primary/10">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gold-primary/10 flex items-center justify-center">
            <svg className="w-10 h-10 text-gold-primary/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Watchlist kosong</h3>
          <p className="text-text-muted mb-4">
            Klik icon ⭐ pada signal untuk menambahkan ke watchlist
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-gold-primary/20 text-gold-primary rounded-lg hover:bg-gold-primary/30 transition-colors"
          >
            Browse Signals
          </button>
        </div>
      ) : (
        <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gold-primary/10 bg-gold-primary/5">
                  <th className="py-4 px-4 text-left text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">Pair</th>
                  <th className="py-4 px-4 text-right text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">Entry</th>
                  <th className="py-4 px-4 text-right text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">Current Price</th>
                  <th className="py-4 px-4 text-right text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">Max Target</th>
                  <th className="py-4 px-4 text-right text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">Stop Loss</th>
                  <th className="py-4 px-4 text-center text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">Status</th>
                  <th className="py-4 px-4 text-right text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">Added</th>
                  <th className="py-4 px-4 text-center text-gold-primary/70 text-xs font-semibold uppercase tracking-wider w-16">
                    <svg className="w-4 h-4 mx-auto text-gold-primary/50" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((item) => {
                  const currentPrice = currentPrices[item.pair];
                  const profitLoss = calcProfitLoss(item.entry, currentPrice);
                  const maxTarget = getMaxTarget(item);
                  const targetPct = maxTarget && item.entry ? ((maxTarget - item.entry) / item.entry * 100).toFixed(2) : null;
                  const slPct = item.stop1 && item.entry ? ((item.stop1 - item.entry) / item.entry * 100).toFixed(2) : null;
                  
                  return (
                    <tr 
                      key={item.id} 
                      className="border-b border-gold-primary/5 hover:bg-gold-primary/5 transition-colors"
                    >
                      {/* Pair with Logo */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <CoinLogo pair={item.pair} size={40} />
                          <div>
                            <p className="text-white font-semibold">{getCoinName(item.pair)}</p>
                            <p className="text-text-muted text-xs">USDT Perp</p>
                          </div>
                        </div>
                      </td>
                      
                      {/* Entry Price */}
                      <td className="py-4 px-4 text-right">
                        <span className="font-mono text-white">
                          ${formatPrice(item.entry)}
                        </span>
                      </td>
                      
                      {/* Current Price with P/L */}
                      <td className="py-4 px-4 text-right">
                        {currentPrice ? (
                          <div>
                            <span className="font-mono text-white">
                              ${formatPrice(currentPrice)}
                            </span>
                            {profitLoss !== null && (
                              <p className={`text-xs font-semibold mt-0.5 ${
                                profitLoss >= 0 ? 'text-green-400' : 'text-red-400'
                              }`}>
                                ({profitLoss >= 0 ? '+' : ''}{profitLoss.toFixed(2)}%)
                              </p>
                            )}
                          </div>
                        ) : pricesLoading ? (
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-3 h-3 border-2 border-text-muted/30 border-t-gold-primary rounded-full animate-spin" />
                          </div>
                        ) : (
                          <span className="text-text-muted text-sm">-</span>
                        )}
                      </td>
                      
                      {/* Max Target */}
                      <td className="py-4 px-4 text-right">
                        {maxTarget ? (
                          <div>
                            <span className="font-mono text-white">${formatPrice(maxTarget)}</span>
                            {targetPct && (
                              <p className="text-green-400 text-xs font-semibold">+{targetPct}%</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      
                      {/* Stop Loss */}
                      <td className="py-4 px-4 text-right">
                        {item.stop1 ? (
                          <div>
                            <span className="font-mono text-red-400">${formatPrice(item.stop1)}</span>
                            {slPct && (
                              <p className="text-red-400/70 text-xs">{slPct}%</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      
                      {/* Status */}
                      <td className="py-4 px-4 text-center">
                        {getStatusBadge(item.status)}
                      </td>
                      
                      {/* Added Date */}
                      <td className="py-4 px-4 text-right">
                        <span className="text-text-secondary text-sm font-mono">
                          {formatDate(item.created_at)}
                        </span>
                      </td>
                      
                      {/* Star Action */}
                      <td className="py-4 px-4 text-center">
                        <StarButton 
                          signalId={item.signal_id} 
                          isStarred={true}
                          onToggle={() => handleRemove(item.signal_id)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Summary Footer */}
          <div className="p-4 border-t border-gold-primary/10 bg-gold-primary/5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                {/* Count by status */}
                <div className="flex items-center gap-2">
                  <span className="text-text-muted text-sm">Open:</span>
                  <span className="text-cyan-400 font-semibold">{openCount}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-text-muted text-sm">In Profit:</span>
                  <span className="text-green-400 font-semibold">{inProfitCount}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-text-muted text-sm">In Loss:</span>
                  <span className="text-red-400 font-semibold">{inLossCount}</span>
                </div>
              </div>
              
              <p className="text-text-muted text-xs">
                💡 Click on star to remove from watchlist
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WatchlistPage;