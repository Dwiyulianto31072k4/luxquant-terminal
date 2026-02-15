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

  // Fetch current prices from Binance
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
          const response = await fetch('https://api.binance.com/api/v3/ticker/price');
          if (response.ok) {
            const allPrices = await response.json();
            const priceMap = {};
            allPrices.forEach(item => { priceMap[item.symbol] = parseFloat(item.price); });
            const relevantPrices = {};
            uniquePairs.forEach(pair => { if (priceMap[pair]) relevantPrices[pair] = priceMap[pair]; });
            setCurrentPrices(relevantPrices);
          }
        } catch (e) { console.error('Spot API also failed:', e); }
      } finally {
        setPricesLoading(false);
      }
    };

    fetchCurrentPrices();
    const interval = setInterval(fetchCurrentPrices, 15000);
    return () => clearInterval(interval);
  }, [signals]);

  // ─── Helpers ───
  const formatPrice = (price) => {
    if (!price && price !== 0) return '-';
    const num = parseFloat(price);
    if (isNaN(num)) return '-';
    if (num < 0.001) return num.toFixed(8);
    if (num < 1) return num.toFixed(6);
    if (num < 10) return num.toFixed(4);
    return num.toFixed(2);
  };

  const getCoinName = (pair) => pair ? pair.replace(/USDT$/i, '') : '';

  const calcPct = (target, entry) => {
    if (!target || !entry) return null;
    const t = parseFloat(target);
    const e = parseFloat(entry);
    if (isNaN(t) || isNaN(e) || e === 0) return null;
    return ((t - e) / e * 100);
  };

  const getMaxTarget = (signal) => {
    const targets = [signal.target4, signal.target3, signal.target2, signal.target1].filter(Boolean);
    return targets.length > 0 ? Math.max(...targets.map(Number)) : null;
  };

  const getPriceChange = (entry, current) => {
    if (!entry || !current) return null;
    return ((current - entry) / entry * 100);
  };

  const getRiskBadge = (risk) => {
    const r = risk?.toLowerCase() || '';
    if (r.startsWith('low')) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (r.startsWith('med') || r.startsWith('nor')) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (r.startsWith('high')) return 'bg-red-500/20 text-red-400 border-red-500/30';
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const getRiskLabel = (risk) => {
    const r = risk?.toLowerCase() || '';
    if (r.startsWith('low')) return 'Low';
    if (r.startsWith('med') || r.startsWith('nor')) return 'Normal';
    if (r.startsWith('high')) return 'High';
    return risk || '-';
  };

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

  const getStatusBadge = (status) => {
    const config = {
      'open': { bg: 'bg-cyan-500', text: 'OPEN' },
      'tp1': { bg: 'bg-green-500', text: '✓ TP1' },
      'tp2': { bg: 'bg-lime-500', text: '✓ TP2' },
      'tp3': { bg: 'bg-yellow-500', text: '✓ TP3' },
      'tp4': { bg: 'bg-orange-500', text: '✓ TP4' },
      'closed_win': { bg: 'bg-green-600', text: '🏆 TP4' },
      'closed_loss': { bg: 'bg-red-500', text: '✗ LOSS' },
      'sl': { bg: 'bg-red-500', text: '✗ SL' }
    };
    const c = config[status?.toLowerCase()] || { bg: 'bg-gray-500', text: status || '-' };
    return (
      <span className={`${c.bg} text-white text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1`}>
        {c.text}
      </span>
    );
  };

  const formatDateTime = (dt) => {
    if (!dt) return '-';
    const d = new Date(dt);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatDateTimeShort = (dt) => {
    if (!dt) return '-';
    const d = new Date(dt);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  // ─── Desktop Table Headers ───
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
          {isActive && <span className="text-gold-primary text-xs">{sortOrder === 'desc' ? '↓' : '↑'}</span>}
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

  // ════════════════════════════════════════
  // MOBILE CARD COMPONENT
  // ════════════════════════════════════════
  const MobileSignalCard = ({ signal }) => {
    const currentPrice = currentPrices[signal.pair];
    const priceChange = getPriceChange(signal.entry, currentPrice);

    const tpList = [
      { label: 'TP1', value: signal.target1 },
      { label: 'TP2', value: signal.target2 },
      { label: 'TP3', value: signal.target3 },
      { label: 'TP4', value: signal.target4 },
    ].filter(t => t.value);

    return (
      <div
        onClick={() => setSelectedSignal(signal)}
        className="glass-card rounded-xl p-3.5 border border-gold-primary/10 hover:border-gold-primary/25 active:bg-gold-primary/5 transition-all cursor-pointer"
      >
        {/* Top Row: Coin + Status + Star */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2.5">
            <CoinLogo pair={signal.pair} size={36} />
            <div>
              <p className="text-white font-semibold text-sm">{getCoinName(signal.pair)}</p>
              <p className="text-text-muted text-[10px]">USDT</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(signal.status)}
            <StarButton
              signalId={signal.signal_id}
              isStarred={watchlistIds.includes(signal.signal_id)}
              onToggle={handleStarToggle}
            />
          </div>
        </div>

        {/* Price Row: Entry / Current / P&L */}
        <div className="grid grid-cols-3 gap-2 mb-2.5">
          <div>
            <p className="text-text-muted text-[10px] uppercase tracking-wider mb-0.5">Entry</p>
            <p className="text-white font-mono text-xs font-medium">{formatPrice(signal.entry)}</p>
          </div>
          <div>
            <p className="text-text-muted text-[10px] uppercase tracking-wider mb-0.5">Current</p>
            {pricesLoading && !currentPrice ? (
              <div className="h-4 w-14 bg-bg-card rounded animate-pulse" />
            ) : currentPrice ? (
              <p className="font-mono text-xs font-medium text-white">{formatPrice(currentPrice)}</p>
            ) : (
              <p className="text-text-muted text-xs">-</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-text-muted text-[10px] uppercase tracking-wider mb-0.5">P&L</p>
            {priceChange !== null ? (
              <p className={`font-mono text-xs font-bold ${priceChange >= 0 ? 'text-positive' : 'text-negative'}`}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </p>
            ) : (
              <p className="text-text-muted text-xs">-</p>
            )}
          </div>
        </div>

        {/* Targets with % from entry */}
        {tpList.length > 0 && (
          <div className="bg-green-500/5 rounded-lg px-2.5 py-2 border border-green-500/10 mb-2">
            <p className="text-green-400/70 text-[9px] uppercase tracking-wider mb-1.5">🎯 Targets</p>
            <div className={`grid gap-1.5 ${tpList.length <= 2 ? 'grid-cols-2' : 'grid-cols-4'}`}>
              {[
                { label: 'TP1', value: signal.target1 },
                { label: 'TP2', value: signal.target2 },
                { label: 'TP3', value: signal.target3 },
                { label: 'TP4', value: signal.target4 },
              ].map((tp, i) => {
                if (!tp.value) return null;
                const pct = calcPct(tp.value, signal.entry);
                return (
                  <div key={i} className="text-center bg-green-500/5 rounded-md py-1 px-1">
                    <p className="text-green-400/50 text-[8px] font-bold">{tp.label}</p>
                    <p className="text-green-400 font-mono text-[10px] font-medium leading-tight">{formatPrice(tp.value)}</p>
                    {pct !== null && (
                      <p className="text-green-300 font-mono text-[9px] font-bold">+{pct.toFixed(1)}%</p>
                    )}
                  </div>
                );
              }).filter(Boolean)}
            </div>
          </div>
        )}

        {/* Stop Loss with % from entry */}
        {signal.stop1 && (
          <div className="bg-red-500/5 rounded-lg px-2.5 py-1.5 border border-red-500/10 mb-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-red-400/70 text-[9px] uppercase tracking-wider font-semibold">🛑 Stop Loss</p>
                <p className="text-red-400 font-mono text-[11px] font-medium">{formatPrice(signal.stop1)}</p>
              </div>
              {(() => {
                const pct = calcPct(signal.stop1, signal.entry);
                return pct !== null ? (
                  <span className="text-red-400 font-mono text-[11px] font-bold">{pct.toFixed(1)}%</span>
                ) : null;
              })()}
            </div>
          </div>
        )}

        {/* Bottom Row: Risk, MCap, Vol, Time */}
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${getRiskBadge(signal.risk_level)}`}>
              {getRiskLabel(signal.risk_level)}
            </span>
            {signal.market_cap && (
              <span className={`font-semibold ${getMarketCapStyle(signal.market_cap)}`}>
                {formatMarketCap(signal.market_cap)}
              </span>
            )}
            {signal.volume_rank_num && signal.volume_rank_den && (
              <span className="text-text-muted">
                Vol <span className="text-white font-semibold">{signal.volume_rank_num}</span>/{signal.volume_rank_den}
              </span>
            )}
          </div>
          <span className="text-text-muted font-mono flex-shrink-0">{formatDateTimeShort(signal.created_at)}</span>
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════
  // LOADING SKELETON - MOBILE
  // ════════════════════════════════════════
  const MobileLoadingSkeleton = () => (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="glass-card rounded-xl p-3.5 border border-gold-primary/10 animate-pulse">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-bg-card rounded-full" />
              <div>
                <div className="h-4 w-16 bg-bg-card rounded mb-1" />
                <div className="h-3 w-10 bg-bg-card rounded" />
              </div>
            </div>
            <div className="h-6 w-16 bg-bg-card rounded-full" />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2.5">
            {[...Array(3)].map((_, j) => (
              <div key={j}>
                <div className="h-3 w-10 bg-bg-card rounded mb-1" />
                <div className="h-4 w-16 bg-bg-card rounded" />
              </div>
            ))}
          </div>
          <div className="h-14 w-full bg-bg-card rounded-lg mb-2" />
          <div className="h-8 w-full bg-bg-card rounded-lg mb-2" />
          <div className="h-4 w-full bg-bg-card rounded" />
        </div>
      ))}
    </div>
  );

  // ════════════════════════════════════════
  // PAGINATION (mobile)
  // ════════════════════════════════════════
  const MobilePagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between py-3 mt-2 mb-2">
        <p className="text-text-muted text-xs">
          Page {page}/{totalPages}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1.5 bg-bg-card border border-gold-primary/20 rounded-lg text-text-secondary hover:text-white hover:border-gold-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
          >
            ← Prev
          </button>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 bg-bg-card border border-gold-primary/20 rounded-lg text-text-secondary hover:text-white hover:border-gold-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
          >
            Next →
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* ════════════════════════════════════════ */}
      {/* MOBILE VIEW (< 1024px): Card Layout     */}
      {/* ════════════════════════════════════════ */}
      <div className="lg:hidden">
        {loading ? (
          <MobileLoadingSkeleton />
        ) : signals?.length === 0 ? (
          <div className="glass-card rounded-xl p-8 border border-gold-primary/10 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-bg-card flex items-center justify-center">
                <span className="text-3xl">🔍</span>
              </div>
              <p className="text-text-muted text-lg">No signals found</p>
              <p className="text-text-muted/60 text-sm">Try adjusting your filters</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {signals.map((signal, idx) => (
              <MobileSignalCard key={signal.signal_id || idx} signal={signal} />
            ))}
          </div>
        )}
        <MobilePagination />
      </div>

      {/* ════════════════════════════════════════ */}
      {/* DESKTOP VIEW (≥ 1024px): Table Layout    */}
      {/* ════════════════════════════════════════ */}
      <div className="hidden lg:block glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
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
                          <div className="h-5 w-20 bg-bg-card rounded animate-pulse ml-auto" />
                        ) : currentPrice ? (
                          <div>
                            <p className="text-white font-mono font-medium">{formatPrice(currentPrice)}</p>
                            {priceChange !== null && (
                              <p className={`text-xs font-mono ${priceChange >= 0 ? 'text-positive' : 'text-negative'}`}>
                                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>

                      {/* Entry */}
                      <td className="py-4 px-4 text-right">
                        <span className="text-white font-mono">{formatPrice(signal.entry)}</span>
                      </td>

                      {/* Max Target + % */}
                      <td className="py-4 px-4 text-right">
                        <span className="text-positive font-mono">{maxTarget ? formatPrice(maxTarget) : '-'}</span>
                        {maxTarget && (() => {
                          const pct = calcPct(maxTarget, signal.entry);
                          return pct !== null ? (
                            <p className="text-positive/70 text-xs font-mono">+{pct.toFixed(1)}%</p>
                          ) : null;
                        })()}
                      </td>

                      {/* Stop Loss + % */}
                      <td className="py-4 px-4 text-right">
                        <span className="text-negative font-mono">{signal.stop1 ? formatPrice(signal.stop1) : '-'}</span>
                        {signal.stop1 && (() => {
                          const pct = calcPct(signal.stop1, signal.entry);
                          return pct !== null ? (
                            <p className="text-negative/70 text-xs font-mono">{pct.toFixed(1)}%</p>
                          ) : null;
                        })()}
                      </td>

                      {/* Risk */}
                      <td className="py-4 px-4 text-center">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getRiskBadge(signal.risk_level)}`}>
                          {getRiskLabel(signal.risk_level)}
                        </span>
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

        {/* Desktop pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gold-primary/10">
            <p className="text-text-muted text-sm">Page {page} of {totalPages}</p>
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