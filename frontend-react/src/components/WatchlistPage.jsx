// src/components/WatchlistPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next'; // <-- Import i18n
import { watchlistApi } from '../services/watchlistApi';
import StarButton from './StarButton';
import CoinLogo from './CoinLogo';
import SignalModal from './SignalModal';

const API_BASE = import.meta.env.VITE_API_URL || '';

const WatchlistPage = () => {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPrices, setCurrentPrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState(null);

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

  // Fetch prices via backend proxy
  const fetchCurrentPrices = useCallback(async () => {
    if (watchlist.length === 0) return;
    
    setPricesLoading(true);
    
    try {
      const pairs = [...new Set(watchlist.map(item => item.pair).filter(Boolean))];
      
      if (pairs.length === 0) {
        setPricesLoading(false);
        return;
      }
      
      const response = await fetch(`${API_BASE}/api/v1/market/prices?symbols=${pairs.join(',')}`);
      if (response.ok) {
        const priceMap = await response.json();
        setCurrentPrices(priceMap);
      }
    } catch (error) {
      console.error('Failed to fetch prices:', error);
    } finally {
      setPricesLoading(false);
    }
  }, [watchlist]);

  useEffect(() => {
    if (watchlist.length > 0) {
      fetchCurrentPrices();
      const interval = setInterval(fetchCurrentPrices, 10000);
      return () => clearInterval(interval);
    }
  }, [fetchCurrentPrices, watchlist.length]);

  // ─── Handlers & Helpers ───
  const handleRemove = (signalId) => {
    setWatchlist(prev => prev.filter(item => item.signal_id !== signalId));
  };

  const calcProfitLoss = (entry, currentPrice) => {
    if (!entry || !currentPrice) return null;
    return ((currentPrice - entry) / entry * 100);
  };

  const getMaxTarget = (item) => {
    const targets = [item.target4, item.target3, item.target2, item.target1].filter(t => t);
    if (targets.length === 0) return null;
    return targets[0];
  };

  const formatPrice = (price) => {
    if (!price) return '-';
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    if (price < 100) return price.toFixed(3);
    return price.toFixed(2);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-GB';
    return date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateTimeShort = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-GB';
    return date.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short'
    });
  };

  const getStatusBadge = (status) => {
    const config = {
      'open': { bg: 'bg-cyan-500', text: t('watchlist.status_open'), icon: '●' },
      'tp1': { bg: 'bg-green-500', text: t('watchlist.status_tp1'), icon: '✓' },
      'tp2': { bg: 'bg-lime-500', text: t('watchlist.status_tp2'), icon: '✓' },
      'tp3': { bg: 'bg-yellow-500', text: t('watchlist.status_tp3'), icon: '✓' },
      'tp4': { bg: 'bg-orange-500', text: t('watchlist.status_tp4'), icon: '✓' },
      'closed_win': { bg: 'bg-green-600', text: t('watchlist.status_win'), icon: '🏆' },
      'closed_loss': { bg: 'bg-red-500', text: t('watchlist.status_loss'), icon: '✗' },
      'sl': { bg: 'bg-red-500', text: t('watchlist.status_sl'), icon: '✗' }
    };
    const c = config[status?.toLowerCase()] || { bg: 'bg-gray-500', text: status || '-', icon: '' };
    return (
      <span className={`${c.bg} text-white text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1`}>
        <span>{c.icon}</span>
        {c.text}
      </span>
    );
  };

  const getCoinName = (pair) => {
    if (!pair) return '';
    return pair.replace(/USDT$/i, '');
  };

  // ─── Loading State ───
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-gold-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary">{t('watchlist.loading')}</p>
        </div>
      </div>
    );
  }

  // ─── Summaries ───
  const openCount = watchlist.filter(w => w.status?.toLowerCase() === 'open').length;
  const inProfitCount = watchlist.filter(w => {
    const cp = currentPrices[w.pair];
    return cp && w.entry && cp > w.entry;
  }).length;
  const inLossCount = watchlist.filter(w => {
    const cp = currentPrices[w.pair];
    return cp && w.entry && cp < w.entry;
  }).length;


  // ════════════════════════════════════════
  // MOBILE CARD COMPONENT
  // ════════════════════════════════════════
  const MobileWatchlistCard = ({ item }) => {
    const currentPrice = currentPrices[item.pair];
    const profitLoss = calcProfitLoss(item.entry, currentPrice);
    const maxTarget = getMaxTarget(item);
    
    // Safety check: Pastikan item.entry ada dan bukan 0 sebelum menghitung persentase target
    const targetPct = (maxTarget && item.entry && item.entry > 0) 
      ? ((maxTarget - item.entry) / item.entry * 100).toFixed(2) 
      : null;
      
    // Safety check untuk stop loss
    const slPct = (item.stop1 && item.entry && item.entry > 0) 
      ? ((item.stop1 - item.entry) / item.entry * 100).toFixed(2) 
      : null;

    return (
      <div
        onClick={() => setSelectedSignal(item)}
        className="glass-card rounded-xl p-3.5 border border-gold-primary/10 hover:border-gold-primary/25 active:bg-gold-primary/5 transition-all cursor-pointer mb-2.5"
      >
        {/* Top Row: Coin + Status + Star */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <CoinLogo pair={item.pair} size={36} />
            <div>
              <p className="text-white font-semibold text-sm">{getCoinName(item.pair)}</p>
              <p className="text-text-muted text-[10px]">USDT</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(item.status)}
            <div onClick={(e) => e.stopPropagation()}>
              <StarButton
                signalId={item.signal_id}
                isStarred={true}
                onToggle={() => handleRemove(item.signal_id)}
              />
            </div>
          </div>
        </div>

        {/* Price Row: Entry / Current / P&L */}
        <div className="grid grid-cols-3 gap-2 mb-3 bg-bg-card/50 rounded-lg p-2 border border-white/5">
          <div>
            <p className="text-text-muted text-[9px] uppercase tracking-wider mb-0.5">{t('watchlist.th_entry')}</p>
            <p className="text-white font-mono text-xs font-medium">{formatPrice(item.entry)}</p>
          </div>
          <div>
            <p className="text-text-muted text-[9px] uppercase tracking-wider mb-0.5">{t('watchlist.th_current_price')}</p>
            {pricesLoading && !currentPrice ? (
              <div className="h-4 w-14 bg-bg-card rounded animate-pulse" />
            ) : currentPrice ? (
              <p className="font-mono text-xs font-medium text-white">{formatPrice(currentPrice)}</p>
            ) : (
              <p className="text-text-muted text-xs">-</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-text-muted text-[9px] uppercase tracking-wider mb-0.5">P&L</p>
            {profitLoss !== null ? (
              <p className={`font-mono text-xs font-bold ${profitLoss >= 0 ? 'text-positive' : 'text-negative'}`}>
                {profitLoss >= 0 ? '+' : ''}{profitLoss.toFixed(2)}%
              </p>
            ) : (
              <p className="text-text-muted text-xs">-</p>
            )}
          </div>
        </div>

        {/* Bottom Row: Max Target, Stop Loss, Date */}
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-3">
            {/* Max Target */}
            {maxTarget && (
              <div className="flex items-center gap-1">
                <span className="text-text-muted">🎯 Target:</span>
                <span className="text-green-400 font-mono">{formatPrice(maxTarget)}</span>
                {targetPct && <span className="text-green-400/70 font-mono text-[9px]">(+{targetPct}%)</span>}
              </div>
            )}
            
            {/* Stop Loss (Hide if no space, but usually mobile has enough for 1-2 items here) */}
            {item.stop1 && !maxTarget && (
               <div className="flex items-center gap-1">
                 <span className="text-text-muted">🛑 SL:</span>
                 <span className="text-red-400 font-mono">{formatPrice(item.stop1)}</span>
               </div>
            )}
          </div>
          <span className="text-text-muted font-mono flex-shrink-0">{formatDateTimeShort(item.created_at)}</span>
        </div>
      </div>
    );
  };

  // ════════════════════════════════════════
  // MAIN RENDER
  // ════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
            <h1 className="text-2xl font-display font-bold text-white">{t('watchlist.title')}</h1>
          </div>
          <p className="text-text-secondary mt-2 ml-[76px]">
            {watchlist.length} {watchlist.length !== 1 ? t('watchlist.signals_in_watchlist') : t('watchlist.signal_in_watchlist')}
          </p>
        </div>
        
        {watchlist.length > 0 && (
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <span className={`w-2 h-2 rounded-full ${
              pricesLoading ? 'bg-yellow-400 animate-pulse' : 
              Object.keys(currentPrices).length > 0 ? 'bg-green-400' : 'bg-red-400'
            }`} />
            <span>
              {pricesLoading ? t('watchlist.updating') : 
               Object.keys(currentPrices).length > 0 ? t('watchlist.live_refresh') : t('watchlist.connecting')}
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
          <h3 className="text-lg font-semibold text-white mb-2">{t('watchlist.empty_title')}</h3>
          <p className="text-text-muted mb-4">
            {t('watchlist.empty_desc')}
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-gold-primary/20 text-gold-primary rounded-lg hover:bg-gold-primary/30 transition-colors"
          >
            {t('watchlist.browse_signals')}
          </button>
        </div>
      ) : (
        <>
          {/* ════════════════════════════════════════ */}
          {/* MOBILE VIEW (< 1024px): Card Layout     */}
          {/* ════════════════════════════════════════ */}
          <div className="lg:hidden">
             {watchlist.map(item => (
                <MobileWatchlistCard key={item.id} item={item} />
             ))}

             {/* Summary Footer for Mobile */}
             <div className="p-4 mt-2 border border-gold-primary/10 rounded-xl bg-gold-primary/5">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted text-xs">{t('watchlist.summary_open')}</span>
                    <span className="text-cyan-400 font-semibold text-xs">{openCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted text-xs">{t('watchlist.summary_in_profit')}</span>
                    <span className="text-green-400 font-semibold text-xs">{inProfitCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted text-xs">{t('watchlist.summary_in_loss')}</span>
                    <span className="text-red-400 font-semibold text-xs">{inLossCount}</span>
                  </div>
                  <div className="h-px bg-gold-primary/10 my-1" />
                  <p className="text-text-muted text-[10px] text-center">
                    {t('watchlist.hint_remove')}
                  </p>
                </div>
              </div>
          </div>

          {/* ════════════════════════════════════════ */}
          {/* DESKTOP VIEW (≥ 1024px): Table Layout    */}
          {/* ════════════════════════════════════════ */}
          <div className="hidden lg:block glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gold-primary/10 bg-gold-primary/5">
                    <th className="py-4 px-4 text-left text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">{t('watchlist.th_pair')}</th>
                    <th className="py-4 px-4 text-right text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">{t('watchlist.th_entry')}</th>
                    <th className="py-4 px-4 text-right text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">{t('watchlist.th_current_price')}</th>
                    <th className="py-4 px-4 text-right text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">{t('watchlist.th_max_target')}</th>
                    <th className="py-4 px-4 text-right text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">{t('watchlist.th_stop_loss')}</th>
                    <th className="py-4 px-4 text-center text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">{t('watchlist.th_status')}</th>
                    <th className="py-4 px-4 text-right text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">{t('watchlist.th_added')}</th>
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
                    
                    // Safety checks
                    const targetPct = (maxTarget && item.entry && item.entry > 0) 
                      ? ((maxTarget - item.entry) / item.entry * 100).toFixed(2) 
                      : null;
                    const slPct = (item.stop1 && item.entry && item.entry > 0) 
                      ? ((item.stop1 - item.entry) / item.entry * 100).toFixed(2) 
                      : null;
                    
                    return (
                      <tr 
                        key={item.id} 
                        className="border-b border-gold-primary/5 hover:bg-gold-primary/5 transition-colors cursor-pointer"
                        onClick={() => setSelectedSignal(item)}
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
                        <td className="py-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
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
            
            {/* Summary Footer for Desktop */}
            <div className="p-4 border-t border-gold-primary/10 bg-gold-primary/5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted text-sm">{t('watchlist.summary_open')}</span>
                    <span className="text-cyan-400 font-semibold">{openCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted text-sm">{t('watchlist.summary_in_profit')}</span>
                    <span className="text-green-400 font-semibold">{inProfitCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted text-sm">{t('watchlist.summary_in_loss')}</span>
                    <span className="text-red-400 font-semibold">{inLossCount}</span>
                  </div>
                </div>
                
                <p className="text-text-muted text-xs">
                  {t('watchlist.hint_remove')}
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Signal Detail Modal */}
      {selectedSignal && (
        <SignalModal 
          signal={selectedSignal} 
          isOpen={!!selectedSignal}
          onClose={() => setSelectedSignal(null)} 
        />
      )}
    </div>
  );
};

export default WatchlistPage;