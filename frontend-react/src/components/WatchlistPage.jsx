// src/components/WatchlistPage.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { watchlistApi } from '../services/watchlistApi';
import StarButton from './StarButton';
import CoinLogo from './CoinLogo';
import SignalModal from './SignalModal';

const API_BASE = import.meta.env.VITE_API_URL || '';

const WatchlistPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPrices, setCurrentPrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState(null);

  // Refs for stable price fetching
  const pairsRef = useRef('');
  const intervalRef = useRef(null);

  // ─── Fetch watchlist ───
  useEffect(() => {
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
  }, []);

  // ─── Fetch prices via backend proxy (stable, no infinite loop) ───
  useEffect(() => {
    if (watchlist.length === 0) return;

    const uniquePairs = [...new Set(watchlist.map(item => item.pair).filter(Boolean))].sort();
    const newKey = uniquePairs.join(',');

    if (newKey === pairsRef.current) return;
    pairsRef.current = newKey;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (uniquePairs.length === 0) return;

    const fetchPrices = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/v1/market/prices?symbols=${uniquePairs.join(',')}`);
        if (response.ok) {
          const priceMap = await response.json();
          if (Object.keys(priceMap).length > 0) {
            setCurrentPrices(priceMap);
            return;
          }
        }
      } catch (error) {
        console.error('Failed to fetch prices:', error);
      }
    };

    setPricesLoading(true);
    fetchPrices().finally(() => setPricesLoading(false));

    intervalRef.current = setInterval(fetchPrices, 15000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [watchlist]);

  // ─── Handlers & Helpers ───
  const handleRemove = (signalId) => {
    setWatchlist(prev => prev.filter(item => item.signal_id !== signalId));
  };

  const getPrice = (pair) => {
    const data = currentPrices[pair];
    if (!data) return null;
    if (typeof data === 'number') return data;
    return data.price ?? null;
  };

  const getVolume = (pair) => {
    const data = currentPrices[pair];
    if (!data || typeof data === 'number') return null;
    return data.volume ?? null;
  };

  const calcPct = (target, entry) => {
    if (!target || !entry) return null;
    const tNum = parseFloat(target);
    const eNum = parseFloat(entry);
    if (isNaN(tNum) || isNaN(eNum) || eNum === 0) return null;
    return ((tNum - eNum) / eNum * 100);
  };

  const getPriceChange = (entry, current) => {
    if (!entry || !current) return null;
    return ((current - entry) / entry * 100);
  };

  const getMaxTarget = (item) => {
    const targets = [item.target4, item.target3, item.target2, item.target1].filter(Boolean);
    return targets.length > 0 ? Math.max(...targets.map(Number)) : null;
  };

  const formatPrice = (price) => {
    if (!price && price !== 0) return '-';
    const num = parseFloat(price);
    if (isNaN(num)) return '-';
    if (num < 0.001) return num.toFixed(8);
    if (num < 1) return num.toFixed(6);
    if (num < 10) return num.toFixed(4);
    return num.toFixed(2);
  };

  const formatVolume = (vol) => {
    if (!vol) return '-';
    const num = parseFloat(vol);
    if (isNaN(num)) return '-';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(0)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
  };

  const getVolumeStyle = (vol) => {
    if (!vol) return 'text-text-muted';
    const num = parseFloat(vol);
    if (num >= 1e9) return 'text-green-400';
    if (num >= 100e6) return 'text-yellow-400';
    if (num >= 10e6) return 'text-orange-400';
    return 'text-text-muted';
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

  const getCoinName = (pair) => pair ? pair.replace(/USDT$/i, '') : '';

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

  const getStatusBadge = (status) => {
    const config = {
      'open': { bg: 'bg-cyan-500', text: 'OPEN' },
      'tp1': { bg: 'bg-green-500', text: '✓ TP1' },
      'tp2': { bg: 'bg-lime-500', text: '✓ TP2' },
      'tp3': { bg: 'bg-yellow-500', text: '✓ TP3' },
      'tp4': { bg: 'bg-orange-500', text: '✓ TP4' },
      'closed_win': { bg: 'bg-green-600', text: '🏆 TP4' },
      'closed_loss': { bg: 'bg-red-500', text: '✗ LOSS' },
      'sl': { bg: 'bg-red-500', text: '✗ SL' },
    };
    const c = config[status?.toLowerCase()] || { bg: 'bg-gray-500', text: status || '-' };
    return (
      <span className={`${c.bg} text-white text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1`}>
        {c.text}
      </span>
    );
  };

  // ─── Loading State ───
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h1 className="text-2xl font-display font-bold text-white">{t('watchlist.title')}</h1>
        </div>
        {/* Skeleton */}
        <div className="lg:hidden space-y-2.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card rounded-xl p-3.5 border border-gold-primary/10 animate-pulse">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5"><div className="w-9 h-9 bg-bg-card rounded-full" /><div><div className="h-4 w-16 bg-bg-card rounded mb-1" /><div className="h-3 w-10 bg-bg-card rounded" /></div></div>
                <div className="h-6 w-16 bg-bg-card rounded-full" />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2.5">{[...Array(3)].map((_, j) => <div key={j}><div className="h-3 w-10 bg-bg-card rounded mb-1" /><div className="h-4 w-16 bg-bg-card rounded" /></div>)}</div>
              <div className="h-10 w-full bg-bg-card rounded-lg mb-2" />
            </div>
          ))}
        </div>
        <div className="hidden lg:block glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-gold-primary/10 bg-gold-primary/5"><th colSpan={10} className="py-4 px-4"><div className="h-4 w-20 bg-bg-card rounded animate-pulse" /></th></tr></thead>
              <tbody>{[...Array(6)].map((_, i) => <tr key={i} className="border-b border-gold-primary/5">{[...Array(10)].map((_, j) => <td key={j} className="py-4 px-4"><div className="h-5 bg-bg-card rounded animate-pulse" /></td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ─── Summaries ───
  const openCount = watchlist.filter(w => w.status?.toLowerCase() === 'open').length;
  const inProfitCount = watchlist.filter(w => {
    const cp = getPrice(w.pair);
    return cp && w.entry && cp > w.entry;
  }).length;
  const inLossCount = watchlist.filter(w => {
    const cp = getPrice(w.pair);
    return cp && w.entry && cp < w.entry;
  }).length;

  // ════════════════════════════════════════
  // MOBILE CARD (matches SignalsTable style)
  // ════════════════════════════════════════
  const MobileWatchlistCard = ({ item }) => {
    const currentPrice = getPrice(item.pair);
    const currentVol = getVolume(item.pair);
    const priceChange = getPriceChange(item.entry, currentPrice);
    const tpList = [
      { label: 'TP1', value: item.target1 },
      { label: 'TP2', value: item.target2 },
      { label: 'TP3', value: item.target3 },
      { label: 'TP4', value: item.target4 },
    ].filter(tp => tp.value);

    return (
      <div
        onClick={() => setSelectedSignal(item)}
        className="glass-card rounded-xl p-3.5 border border-gold-primary/10 hover:border-gold-primary/25 active:bg-gold-primary/5 transition-all cursor-pointer"
      >
        {/* Top Row: Coin + Status + Star */}
        <div className="flex items-center justify-between mb-2.5">
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
              <StarButton signalId={item.signal_id} isStarred={true} onToggle={() => handleRemove(item.signal_id)} />
            </div>
          </div>
        </div>

        {/* Price Row */}
        <div className="grid grid-cols-3 gap-2 mb-2.5">
          <div>
            <p className="text-text-muted text-[10px] uppercase tracking-wider mb-0.5">{t('signals.entry_price')}</p>
            <p className="text-white font-mono text-xs font-medium">{formatPrice(item.entry)}</p>
          </div>
          <div>
            <p className="text-text-muted text-[10px] uppercase tracking-wider mb-0.5">{t('signals.current_price')}</p>
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

        {/* Targets */}
        {tpList.length > 0 && (
          <div className="bg-green-500/5 rounded-lg px-2.5 py-2 border border-green-500/10 mb-2">
            <p className="text-green-400/70 text-[9px] uppercase tracking-wider mb-1.5">🎯 Targets</p>
            <div className={`grid gap-1.5 ${tpList.length <= 2 ? 'grid-cols-2' : 'grid-cols-4'}`}>
              {[
                { label: 'TP1', value: item.target1 },
                { label: 'TP2', value: item.target2 },
                { label: 'TP3', value: item.target3 },
                { label: 'TP4', value: item.target4 },
              ].map((tp, i) => {
                if (!tp.value) return null;
                const pct = calcPct(tp.value, item.entry);
                return (
                  <div key={i} className="text-center bg-green-500/5 rounded-md py-1 px-1">
                    <p className="text-green-400/50 text-[8px] font-bold">{tp.label}</p>
                    <p className="text-green-400 font-mono text-[10px] font-medium leading-tight">{formatPrice(tp.value)}</p>
                    {pct !== null && <p className="text-green-300 font-mono text-[9px] font-bold">+{pct.toFixed(1)}%</p>}
                  </div>
                );
              }).filter(Boolean)}
            </div>
          </div>
        )}

        {/* Stop Loss */}
        {item.stop1 && (
          <div className="bg-red-500/5 rounded-lg px-2.5 py-1.5 border border-red-500/10 mb-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-red-400/70 text-[9px] uppercase tracking-wider font-semibold">🛑 {t('signals.stop_loss')}</p>
                <p className="text-red-400 font-mono text-[11px] font-medium">{formatPrice(item.stop1)}</p>
              </div>
              {(() => {
                const pct = calcPct(item.stop1, item.entry);
                return pct !== null ? <span className="text-red-400 font-mono text-[11px] font-bold">{pct.toFixed(1)}%</span> : null;
              })()}
            </div>
          </div>
        )}

        {/* Bottom: Risk + Vol + Date */}
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${getRiskBadge(item.risk_level)}`}>
              {getRiskLabel(item.risk_level)}
            </span>
            {currentVol ? (
              <span className={`font-semibold ${getVolumeStyle(currentVol)}`}>Vol {formatVolume(currentVol)}</span>
            ) : item.volume_rank_num && item.volume_rank_den ? (
              <span className="text-text-muted">Vol <span className="text-white font-semibold">{item.volume_rank_num}</span>/{item.volume_rank_den}</span>
            ) : null}
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

      {/* Empty State */}
      {watchlist.length === 0 ? (
        <div className="text-center py-16 glass-card rounded-2xl border border-gold-primary/10">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gold-primary/10 flex items-center justify-center">
            <svg className="w-10 h-10 text-gold-primary/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">{t('watchlist.empty_title')}</h3>
          <p className="text-text-muted mb-4">{t('watchlist.empty_desc')}</p>
          <button
            onClick={() => navigate('/signals')}
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
          <div className="lg:hidden space-y-2.5">
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
                <p className="text-text-muted text-[10px] text-center">{t('watchlist.hint_remove')}</p>
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
                    <th className="py-4 px-4 text-gold-primary/70 text-xs font-semibold uppercase tracking-wider text-center w-10"></th>
                    <th className="py-4 px-4 text-left text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">{t('watchlist.th_pair')}</th>
                    <th className="py-4 px-4 text-right text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">{t('signals.current_price')}</th>
                    <th className="py-4 px-4 text-right text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">{t('watchlist.th_entry')}</th>
                    <th className="py-4 px-4 text-right text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">{t('watchlist.th_max_target')}</th>
                    <th className="py-4 px-4 text-right text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">{t('watchlist.th_stop_loss')}</th>
                    <th className="py-4 px-4 text-center text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">{t('signals.risk_level')}</th>
                    <th className="py-4 px-4 text-center text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">VOL 24H</th>
                    <th className="py-4 px-4 text-center text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">{t('watchlist.th_status')}</th>
                    <th className="py-4 px-4 text-right text-gold-primary/70 text-xs font-semibold uppercase tracking-wider">{t('watchlist.th_added')}</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlist.map((item) => {
                    const currentPrice = getPrice(item.pair);
                    const currentVol = getVolume(item.pair);
                    const priceChange = getPriceChange(item.entry, currentPrice);
                    const maxTarget = getMaxTarget(item);

                    return (
                      <tr
                        key={item.id}
                        className="border-b border-gold-primary/5 hover:bg-gold-primary/5 cursor-pointer transition-colors group"
                        onClick={() => setSelectedSignal(item)}
                      >
                        {/* Star */}
                        <td className="py-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <StarButton signalId={item.signal_id} isStarred={true} onToggle={() => handleRemove(item.signal_id)} />
                        </td>

                        {/* Pair */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <CoinLogo pair={item.pair} size={40} />
                            <div>
                              <p className="text-white font-semibold group-hover:text-gold-primary transition-colors">{getCoinName(item.pair)}</p>
                              <p className="text-text-muted text-xs">USDT</p>
                            </div>
                          </div>
                        </td>

                        {/* Current Price + P/L */}
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
                          <span className="text-white font-mono">{formatPrice(item.entry)}</span>
                        </td>

                        {/* Max Target */}
                        <td className="py-4 px-4 text-right">
                          {maxTarget ? (
                            <div>
                              <span className="text-positive font-mono">{formatPrice(maxTarget)}</span>
                              {(() => { const pct = calcPct(maxTarget, item.entry); return pct !== null ? <p className="text-positive/70 text-xs font-mono">+{pct.toFixed(1)}%</p> : null; })()}
                            </div>
                          ) : (
                            <span className="text-text-muted">-</span>
                          )}
                        </td>

                        {/* Stop Loss */}
                        <td className="py-4 px-4 text-right">
                          {item.stop1 ? (
                            <div>
                              <span className="text-negative font-mono">{formatPrice(item.stop1)}</span>
                              {(() => { const pct = calcPct(item.stop1, item.entry); return pct !== null ? <p className="text-negative/70 text-xs font-mono">{pct.toFixed(1)}%</p> : null; })()}
                            </div>
                          ) : (
                            <span className="text-text-muted">-</span>
                          )}
                        </td>

                        {/* Risk */}
                        <td className="py-4 px-4 text-center">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getRiskBadge(item.risk_level)}`}>
                            {getRiskLabel(item.risk_level)}
                          </span>
                        </td>

                        {/* Volume */}
                        <td className="py-4 px-4 text-center">
                          {currentVol ? (
                            <span className={`text-xs font-semibold font-mono ${getVolumeStyle(currentVol)}`}>{formatVolume(currentVol)}</span>
                          ) : item.volume_rank_num && item.volume_rank_den ? (
                            <span className="text-white text-xs"><span className="font-semibold">{item.volume_rank_num}</span><span className="text-text-muted">/{item.volume_rank_den}</span></span>
                          ) : (
                            <span className="text-text-muted text-xs">-</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-4 px-4 text-center">{getStatusBadge(item.status)}</td>

                        {/* Added Date */}
                        <td className="py-4 px-4 text-right">
                          <span className="text-text-muted font-mono text-sm">{formatDateTime(item.created_at)}</span>
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
                <p className="text-text-muted text-xs">{t('watchlist.hint_remove')}</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Signal Detail Modal — opens on row/card click */}
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