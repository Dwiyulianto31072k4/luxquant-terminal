import { useState, useEffect } from 'react';
import SignalModal from './SignalModal';
import CoinLogo from './CoinLogo';
import StarButton from './StarButton';
import { useAuth } from '../context/AuthContext';
import { watchlistApi } from '../services/watchlistApi';

const SignalsTable = ({ 
  signals, 
  loading, 
  page, 
  totalPages, 
  onPageChange,
  sortBy,
  sortOrder,
  onSort 
}) => {
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [currentPrices, setCurrentPrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(false);

  // ─── Watchlist integration ───
  const { isAuthenticated } = useAuth();
  const [watchlistIds, setWatchlistIds] = useState([]);

  useEffect(() => {
    if (!isAuthenticated) return;
    watchlistApi.getWatchlistIds()
      .then(data => setWatchlistIds(data.signal_ids || []))
      .catch(() => {});
  }, [isAuthenticated]);

  const handleStarToggle = (signalId, newState) => {
    setWatchlistIds(prev => 
      newState ? [...prev, signalId] : prev.filter(id => id !== signalId)
    );
  };
  // ─── End watchlist ───

  // Fetch current prices from Binance for all unique pairs
  useEffect(() => {
    if (!signals || signals.length === 0) return;

    const fetchCurrentPrices = async () => {
      setPricesLoading(true);
      try {
        const uniquePairs = [...new Set(signals.map(s => s.pair).filter(Boolean))];
        const response = await fetch('https://fapi.binance.com/fapi/v1/ticker/price');
        if (!response.ok) throw new Error('Failed to fetch prices');
        
        const allPrices = await response.json();
        const priceMap = {};
        allPrices.forEach(item => {
          priceMap[item.symbol] = parseFloat(item.price);
        });
        
        const relevantPrices = {};
        uniquePairs.forEach(pair => {
          if (priceMap[pair]) relevantPrices[pair] = priceMap[pair];
        });
        
        setCurrentPrices(relevantPrices);
      } catch (error) {
        console.error('Error fetching current prices:', error);
        try {
          const uniquePairs = [...new Set(signals.map(s => s.pair).filter(Boolean))];
          const pricePromises = uniquePairs.map(async (pair) => {
            try {
              const res = await fetch(`/api/v1/market/price/${pair}`);
              if (res.ok) {
                const data = await res.json();
                return { pair, price: data.price };
              }
              return null;
            } catch { return null; }
          });
          
          const results = await Promise.all(pricePromises);
          const priceMap = {};
          results.forEach(r => { if (r) priceMap[r.pair] = r.price; });
          setCurrentPrices(priceMap);
        } catch (fallbackError) {
          console.error('Fallback price fetch also failed:', fallbackError);
        }
      } finally {
        setPricesLoading(false);
      }
    };

    fetchCurrentPrices();
    const interval = setInterval(fetchCurrentPrices, 10000);
    return () => clearInterval(interval);
  }, [signals]);

  // Format date
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = date.toLocaleDateString('en-GB', { month: 'short' });
    const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${day} ${month} at ${time}`;
  };

  // Get max target
  const getMaxTarget = (signal) => {
    const targets = [signal.target4, signal.target3, signal.target2, signal.target1].filter(t => t);
    if (targets.length === 0) return { value: null, pct: null };
    const maxTarget = targets[0];
    const pct = ((maxTarget - signal.entry) / signal.entry * 100).toFixed(2);
    return { value: maxTarget, pct };
  };

  // Price change % from entry
  const getPriceChange = (entry, currentPrice) => {
    if (!entry || !currentPrice) return null;
    return ((currentPrice - entry) / entry * 100);
  };

  // Stop loss %
  const getStopLossPercent = (entry, stopLoss) => {
    if (!entry || !stopLoss) return null;
    return ((stopLoss - entry) / entry * 100);
  };

  // Format price
  const formatPrice = (price) => {
    if (!price) return '-';
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    return price < 100 ? price.toFixed(4) : price.toFixed(2);
  };

  const getCoinName = (pair) => pair ? pair.replace(/USDT$/i, '') : '';

  // Risk badge
  const getRiskBadge = (risk) => {
    const r = risk?.toLowerCase() || '';
    if (r.startsWith('low')) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (r.startsWith('med') || r.startsWith('nor')) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (r.startsWith('high')) return 'bg-red-500/20 text-red-400 border-red-500/30';
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  // Format market cap
  const formatMarketCap = (mcap) => {
    if (!mcap) return '-';
    if (typeof mcap === 'string' && /[BMKTbmkt]/.test(mcap)) return mcap;
    const num = parseFloat(mcap);
    if (isNaN(num)) return mcap;
    if (num >= 1e12) return `$${(num / 1e12).toFixed(1)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(0)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
  };

  const getMarketCapStyle = (mcap) => {
    if (!mcap) return 'text-text-muted';
    const str = mcap.toString().toUpperCase();
    if (str.includes('B') || str.includes('T')) return 'text-green-400';
    if (str.includes('M')) {
      const num = parseFloat(str);
      if (num >= 100) return 'text-yellow-400';
      if (num >= 10) return 'text-orange-400';
      return 'text-red-400';
    }
    return 'text-text-muted';
  };

  // Status badge
  const getStatusBadge = (status) => {
    const config = {
      'open': { bg: 'bg-cyan-500', text: 'OPEN', icon: '●' },
      'tp1': { bg: 'bg-green-500', text: '✓ TP1', icon: '' },
      'tp2': { bg: 'bg-lime-500', text: '✓ TP2', icon: '' },
      'tp3': { bg: 'bg-yellow-500', text: '✓ TP3', icon: '' },
      'tp4': { bg: 'bg-orange-500', text: '✓ TP4', icon: '' },
      'closed_win': { bg: 'bg-green-600', text: '🏆 TP4', icon: '' },
      'closed_loss': { bg: 'bg-red-500', text: '✗ LOSS', icon: '' },
      'sl': { bg: 'bg-red-500', text: '✗ SL', icon: '' }
    };
    const c = config[status?.toLowerCase()] || { bg: 'bg-gray-500', text: status || '-', icon: '' };
    return (
      <span className={`${c.bg} text-white text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1`}>
        {c.text}
      </span>
    );
  };

  // Sortable header
  const SortableHeader = ({ field, label, align = 'left' }) => {
    const isActive = sortBy === field;
    const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    
    return (
      <th 
        className={`py-4 px-4 text-xs font-semibold uppercase tracking-wider cursor-pointer hover:text-gold-primary transition-colors select-none ${textAlign} ${isActive ? 'text-gold-primary' : 'text-gold-primary/70'}`}
        onClick={() => onSort && onSort(field)}
      >
        <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
          <span>{label}</span>
          {isActive && (
            <span className="text-gold-primary text-xs">
              {sortOrder === 'desc' ? '↓' : '↑'}
            </span>
          )}
        </div>
      </th>
    );
  };

  const Header = ({ label, align = 'left' }) => {
    const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    return (
      <th className={`py-4 px-4 text-gold-primary/70 text-xs font-semibold uppercase tracking-wider ${textAlign}`}>
        {label}
      </th>
    );
  };

  const TOTAL_COLUMNS = 11;

  return (
    <>
      <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gold-primary/10 bg-gold-primary/5">
                <Header label="" align="center" />
                <SortableHeader field="pair" label="Pair" />
                <Header label="Current Price" align="right" />
                <SortableHeader field="entry" label="Entry" align="right" />
                <SortableHeader field="max_target" label="Max Target" align="right" />
                <Header label="Stop Loss" align="right" />
                <SortableHeader field="risk_level" label="Risk" align="center" />
                <Header label="Market Cap" align="center" />
                <Header label="Vol Rank" align="center" />
                <SortableHeader field="status" label="Status" align="center" />
                <SortableHeader field="created_at" label="Time" align="right" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="border-b border-gold-primary/5">
                    {[...Array(TOTAL_COLUMNS)].map((_, j) => (
                      <td key={j} className="py-4 px-4">
                        <div className="h-5 bg-bg-card rounded animate-pulse"></div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : signals?.length === 0 ? (
                <tr>
                  <td colSpan={TOTAL_COLUMNS} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-bg-card flex items-center justify-center">
                        <span className="text-3xl">🔍</span>
                      </div>
                      <p className="text-text-muted text-lg">No signals found</p>
                      <p className="text-text-muted/60 text-sm">Try adjusting your filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                signals?.map((signal, idx) => {
                  const maxTarget = getMaxTarget(signal);
                  const currentPrice = currentPrices[signal.pair];
                  const priceChange = getPriceChange(signal.entry, currentPrice);
                  
                  return (
                    <tr 
                      key={signal.signal_id || idx}
                      onClick={() => setSelectedSignal(signal)}
                      className="border-b border-gold-primary/5 hover:bg-gold-primary/5 cursor-pointer transition-colors group"
                    >
                      {/* Star */}
                      <td className="py-4 px-4 text-center">
                        <StarButton
                          signalId={signal.signal_id}
                          isStarred={watchlistIds.includes(signal.signal_id)}
                          onToggle={handleStarToggle}
                        />
                      </td>

                      {/* Pair */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <CoinLogo pair={signal.pair} size={40} />
                          <div>
                            <p className="text-white font-semibold group-hover:text-gold-primary transition-colors">
                              {getCoinName(signal.pair)}
                            </p>
                            <p className="text-text-muted text-xs">USDT</p>
                          </div>
                        </div>
                      </td>
                      
                      {/* Current Price */}
                      <td className="py-4 px-4 text-right">
                        {pricesLoading && !currentPrice ? (
                          <div className="h-5 w-20 bg-bg-card rounded animate-pulse ml-auto"></div>
                        ) : currentPrice ? (
                          <div>
                            <span className="font-mono text-white">{formatPrice(currentPrice)}</span>
                            {priceChange !== null && (
                              <p className={`text-xs font-semibold ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                ({priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%)
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      
                      {/* Entry */}
                      <td className="py-4 px-4 text-right">
                        <span className="font-mono text-white">{formatPrice(signal.entry)}</span>
                      </td>

                      {/* Max Target */}
                      <td className="py-4 px-4 text-right">
                        {maxTarget.value ? (
                          <div>
                            <span className="font-mono text-white">{formatPrice(maxTarget.value)}</span>
                            <p className="text-positive text-xs font-semibold">+{maxTarget.pct}%</p>
                          </div>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      
                      {/* Stop Loss */}
                      <td className="py-4 px-4 text-right">
                        {signal.stop1 ? (
                          <div>
                            <span className="font-mono text-negative">{formatPrice(signal.stop1)}</span>
                            {signal.entry && (
                              <p className="text-red-400 text-xs font-semibold">
                                ({getStopLossPercent(signal.entry, signal.stop1)?.toFixed(2)}%)
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>

                      {/* Risk */}
                      <td className="py-4 px-4 text-center">
                        {signal.risk_level ? (
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold uppercase border ${getRiskBadge(signal.risk_level)}`}>
                            {signal.risk_level}
                          </span>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>

                      {/* Market Cap */}
                      <td className="py-4 px-4 text-center">
                        {signal.market_cap ? (
                          <span className={`text-xs font-semibold ${getMarketCapStyle(signal.market_cap)}`}>
                            {formatMarketCap(signal.market_cap)}
                          </span>
                        ) : (
                          <span className="text-text-muted text-xs">-</span>
                        )}
                      </td>
                      
                      {/* Vol Rank */}
                      <td className="py-4 px-4 text-center">
                        {signal.volume_rank_num && signal.volume_rank_den ? (
                          <span className="text-white">
                            <span className="font-semibold">{signal.volume_rank_num}</span>
                            <span className="text-text-muted">/{signal.volume_rank_den}</span>
                          </span>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      
                      {/* Status */}
                      <td className="py-4 px-4 text-center">
                        {getStatusBadge(signal.status)}
                      </td>
                      
                      {/* Time */}
                      <td className="py-4 px-4 text-right">
                        <span className="text-text-muted font-mono text-sm">
                          {formatDateTime(signal.created_at)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gold-primary/10">
            <p className="text-text-muted text-sm">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="px-4 py-2 bg-bg-card border border-gold-primary/20 rounded-lg text-text-secondary hover:text-white hover:border-gold-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="px-4 py-2 bg-bg-card border border-gold-primary/20 rounded-lg text-text-secondary hover:text-white hover:border-gold-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Signal Detail Modal */}
      <SignalModal 
        signal={selectedSignal} 
        isOpen={!!selectedSignal}
        onClose={() => setSelectedSignal(null)} 
      />
    </>
  );
};

export default SignalsTable;