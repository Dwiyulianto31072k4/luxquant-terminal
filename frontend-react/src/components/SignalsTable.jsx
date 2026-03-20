import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import SignalModal from './SignalModal';
import CoinLogo from './CoinLogo';
import StarButton from './StarButton';
import { useAuth } from '../context/AuthContext';
import { watchlistApi } from '../services/watchlistApi';

const API_BASE = import.meta.env.VITE_API_URL || '';

const SignalsTable = ({ 
  signals, 
  loading, 
  page, 
  totalPages, 
  onPageChange,
  sortBy,
  sortOrder,
  onSort,
  onPricesUpdate,
}) => {
  const { t } = useTranslation();

  const [selectedSignal, setSelectedSignal] = useState(null);
  const [currentPrices, setCurrentPrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(false);

  const { isAuthenticated } = useAuth();
  const [watchlistIds, setWatchlistIds] = useState([]);

  // ═══ REFS for stable price fetching (prevents infinite loop) ═══
  const pairsRef = useRef('');
  const intervalRef = useRef(null);
  const onPricesUpdateRef = useRef(onPricesUpdate);
  onPricesUpdateRef.current = onPricesUpdate;

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

  // ═══ STABLE PRICE FETCHING ═══
  useEffect(() => {
    if (!signals || signals.length === 0) return;

    const uniquePairs = [...new Set(signals.map(s => s.pair).filter(Boolean))].sort();
    const newKey = uniquePairs.join(',');

    // EARLY RETURN — do NOT set up new interval if pairs haven't changed
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
        if (!response.ok) throw new Error('Backend failed');
        const tickerMap = await response.json();
        if (Object.keys(tickerMap).length > 0) {
          setCurrentPrices(tickerMap);
          if (onPricesUpdateRef.current) onPricesUpdateRef.current(tickerMap);
          return;
        }
        throw new Error('Empty response');
      } catch (err) {
        console.warn('[Prices] Backend failed, trying Bybit:', err.message);
      }

      try {
        const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear');
        if (res.ok) {
          const json = await res.json();
          const list = json?.result?.list || [];
          const bybitMap = {};
          for (const item of list) {
            if (uniquePairs.includes(item.symbol)) {
              bybitMap[item.symbol] = {
                price: parseFloat(item.lastPrice) || 0,
                volume: parseFloat(item.turnover24h) || 0,
              };
            }
          }
          if (Object.keys(bybitMap).length > 0) {
            setCurrentPrices(bybitMap);
            if (onPricesUpdateRef.current) onPricesUpdateRef.current(bybitMap);
            return;
          }
        }
      } catch (err2) {
        console.warn('[Prices] Bybit linear failed:', err2.message);
      }

      try {
        const res = await fetch('https://api.bybit.com/v5/market/tickers?category=spot');
        if (res.ok) {
          const json = await res.json();
          const list = json?.result?.list || [];
          const spotMap = {};
          for (const item of list) {
            if (uniquePairs.includes(item.symbol)) {
              spotMap[item.symbol] = {
                price: parseFloat(item.lastPrice) || 0,
                volume: parseFloat(item.turnover24h) || 0,
              };
            }
          }
          if (Object.keys(spotMap).length > 0) {
            setCurrentPrices(spotMap);
            if (onPricesUpdateRef.current) onPricesUpdateRef.current(spotMap);
          }
        }
      } catch (err3) {
        console.warn('[Prices] All providers failed:', err3.message);
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
  }, [signals]);

  // ─── Helpers ───
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
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
  };

  const getVolumeStyle = (vol) => {
    if (!vol) return 'text-gray-500';
    const num = parseFloat(vol);
    if (num >= 1e9) return 'text-green-400';
    if (num >= 100e6) return 'text-yellow-400';
    if (num >= 10e6) return 'text-orange-400';
    return 'text-gray-400';
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
    if (r.startsWith('low')) return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (r.startsWith('med') || r.startsWith('nor')) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    if (r.startsWith('high')) return 'bg-red-500/10 text-red-400 border-red-500/20';
    return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
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
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
  };

  const getMarketCapStyle = (mcap) => {
    if (!mcap) return 'text-gray-500';
    const str = mcap.toString().toUpperCase();
    if (str.includes('B') || str.includes('T')) return 'text-green-400';
    if (str.includes('M')) {
      const num = parseFloat(str.replace(/[^0-9.]/g, ''));
      if (num >= 100) return 'text-yellow-400';
      if (num >= 10) return 'text-orange-400';
      return 'text-red-400';
    }
    return 'text-gray-400';
  };

  const getStatusBadge = (status) => {
    const config = {
      'open': { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400', label: 'OPEN' },
      'tp1': { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400', label: '✓ TP1' },
      'tp2': { bg: 'bg-lime-500/10', border: 'border-lime-500/20', text: 'text-lime-400', label: '✓ TP2' },
      'tp3': { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', label: '✓ TP3' },
      'tp4': { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', label: '✓ TP4' },
      'closed_win': { bg: 'bg-green-500/20', border: 'border-green-500/30', text: 'text-green-400', label: '🏆 TP4' },
      'closed_loss': { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', label: '✗ LOSS' },
      'sl': { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', label: '✗ SL' }
    };
    const c = config[status?.toLowerCase()] || { bg: 'bg-gray-500/10', border: 'border-gray-500/20', text: 'text-gray-400', label: status || '-' };
    return (
      <span className={`${c.bg} ${c.border} ${c.text} border text-[10px] font-bold px-2.5 py-1 rounded-md inline-flex items-center tracking-wide`}>
        {c.label}
      </span>
    );
  };

  const formatDateTimeShort = (dt) => {
    if (!dt) return '-';
    const d = new Date(dt);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  const getUpdateTypeBadge = (updateType) => {
    if (!updateType) return null;
    const ut = updateType.toLowerCase();
    const config = {
      'tp1': { text: 'text-green-400', label: 'Hit TP1' },
      'tp2': { text: 'text-lime-400', label: 'Hit TP2' },
      'tp3': { text: 'text-yellow-400', label: 'Hit TP3' },
      'tp4': { text: 'text-orange-400', label: 'Hit TP4' },
      'sl': { text: 'text-red-400', label: 'Hit SL' },
    };
    const c = config[ut] || { text: 'text-gray-400', label: updateType.toUpperCase() };
    return (
      <span className={`${c.text} text-[10px] font-bold tracking-wide`}>
        {c.label}
      </span>
    );
  };

  const formatTimeAgo = (dt) => {
    if (!dt) return '';
    const now = new Date();
    const d = new Date(dt);
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDateTimeShort(dt);
  };

  // Redesigned Sortable Header
  const SortableHeader = ({ field, label, align = 'left' }) => {
    const isActive = sortBy === field;
    const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    return (
      <th 
        className={`py-4 px-4 text-[10px] font-bold uppercase tracking-widest cursor-pointer hover:text-white transition-colors select-none ${textAlign} ${isActive ? 'text-white' : 'text-gray-500'}`}
        onClick={() => onSort && onSort(field)}
      >
        <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
          <span>{label}</span>
          {isActive && <span className="text-gold-primary text-xs">{sortOrder === 'desc' ? '↓' : '↑'}</span>}
        </div>
      </th>
    );
  };

  // ════════ MOBILE VIEW ════════
  const MobileSignalCard = ({ signal }) => {
    const currentPrice = getPrice(signal.pair);
    const currentVol = getVolume(signal.pair);
    const priceChange = getPriceChange(signal.entry, currentPrice);
    const tpList = [
      { label: 'TP1', value: signal.target1 },
      { label: 'TP2', value: signal.target2 },
      { label: 'TP3', value: signal.target3 },
      { label: 'TP4', value: signal.target4 },
    ].filter(t => t.value);

    return (
      <div onClick={() => setSelectedSignal(signal)} className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.05] hover:border-white/[0.1] active:bg-white/[0.05] transition-all cursor-pointer shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <CoinLogo pair={signal.pair} size={38} />
            <div>
              <div className="flex items-baseline gap-1.5">
                <p className="text-white font-bold text-sm tracking-wide">{getCoinName(signal.pair)}</p>
                <p className="text-gray-500 text-[10px] font-mono">USDT</p>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase ${getRiskBadge(signal.risk_level)}`}>{getRiskLabel(signal.risk_level)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div onClick={(e) => e.stopPropagation()}><StarButton signalId={signal.signal_id} isStarred={watchlistIds.includes(signal.signal_id)} onToggle={handleStarToggle} /></div>
            {getStatusBadge(signal.status)}
          </div>
        </div>

        {signal.last_update_at && (
          <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
            <div className="flex items-center gap-1.5">
              <span className="text-amber-500 text-[10px]">⚡</span>
              {getUpdateTypeBadge(signal.last_update_type)}
            </div>
            <span className="text-amber-500/70 text-[10px] font-mono">{formatTimeAgo(signal.last_update_at)}</span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mb-3 bg-black/20 p-2.5 rounded-lg border border-white/[0.03]">
          <div>
            <p className="text-gray-500 text-[9px] uppercase tracking-widest mb-1">Entry</p>
            <p className="text-white font-mono text-[11px] font-medium">{formatPrice(signal.entry)}</p>
          </div>
          <div className="text-center">
            <p className="text-gray-500 text-[9px] uppercase tracking-widest mb-1">Current</p>
            {pricesLoading && !currentPrice ? <div className="h-4 w-12 bg-white/5 rounded animate-pulse mx-auto" /> : currentPrice ? <p className="font-mono text-[11px] font-medium text-white">{formatPrice(currentPrice)}</p> : <p className="text-gray-500 text-[11px]">-</p>}
          </div>
          <div className="text-right">
            <p className="text-gray-500 text-[9px] uppercase tracking-widest mb-1">P&L</p>
            {priceChange !== null ? <p className={`font-mono text-[11px] font-bold ${priceChange >= 0 ? 'text-green-400 drop-shadow-[0_0_5px_rgba(74,222,128,0.4)]' : 'text-red-400 drop-shadow-[0_0_5px_rgba(239,68,68,0.4)]'}`}>{priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%</p> : <p className="text-gray-500 text-[11px]">-</p>}
          </div>
        </div>

        {tpList.length > 0 && (
          <div className="mb-3">
            <div className={`grid gap-1.5 ${tpList.length <= 2 ? 'grid-cols-2' : 'grid-cols-4'}`}>
              {[{ label: 'TP1', value: signal.target1 },{ label: 'TP2', value: signal.target2 },{ label: 'TP3', value: signal.target3 },{ label: 'TP4', value: signal.target4 }].map((tp, i) => {
                if (!tp.value) return null;
                const pct = calcPct(tp.value, signal.entry);
                return (
                  <div key={i} className="text-center bg-white/[0.02] border border-white/[0.04] rounded-md py-1.5 px-1">
                    <p className="text-gray-500 text-[8px] font-bold uppercase tracking-wider">{tp.label}</p>
                    <p className="text-gray-300 font-mono text-[10px] mt-0.5">{formatPrice(tp.value)}</p>
                  </div>
                );
              }).filter(Boolean)}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-[10px] border-t border-white/[0.05] pt-3 mt-1">
          <div className="flex items-center gap-3">
            {signal.market_cap && <span className={`font-mono ${getMarketCapStyle(signal.market_cap)}`}>MC {formatMarketCap(signal.market_cap)}</span>}
            {currentVol ? <span className={`font-mono ${getVolumeStyle(currentVol)}`}>Vol {formatVolume(currentVol)}</span> : signal.volume_rank_num && signal.volume_rank_den ? <span className="text-gray-500 font-mono">Vol <span className="text-gray-300">{signal.volume_rank_num}</span>/{signal.volume_rank_den}</span> : null}
          </div>
          {/* Changed Time to Called Time for Mobile */}
          <div className="text-right">
             <span className="text-gray-500 text-[9px] uppercase tracking-widest mr-1.5">Called Time</span>
             <span className="text-gray-400 font-mono">{formatDateTimeShort(signal.created_at)}</span>
          </div>
        </div>
      </div>
    );
  };

  const MobileLoadingSkeleton = () => (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.05] animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3"><div className="w-9 h-9 bg-white/5 rounded-full" /><div><div className="h-4 w-16 bg-white/5 rounded mb-1.5" /><div className="h-3 w-10 bg-white/5 rounded" /></div></div>
            <div className="h-6 w-16 bg-white/5 rounded-md" />
          </div>
          <div className="h-16 w-full bg-white/5 rounded-lg mb-3" />
          <div className="h-8 w-full bg-white/5 rounded-lg mb-3" />
          <div className="h-4 w-full bg-white/5 rounded" />
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* ════ MOBILE VIEW WRAPPER ════ */}
      <div className="lg:hidden">
        {loading ? <MobileLoadingSkeleton /> : signals?.length === 0 ? (
          <div className="bg-white/[0.02] rounded-xl p-8 border border-white/[0.05] text-center">
            <div className="flex flex-col items-center gap-3"><div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center"><span className="text-3xl opacity-50">🔍</span></div><p className="text-gray-400 font-medium">No signals found</p><p className="text-gray-600 text-xs">Adjust your filters and try again.</p></div>
          </div>
        ) : (
          <div className="space-y-3">{signals.map((signal, idx) => <MobileSignalCard key={signal.signal_id || idx} signal={signal} />)}</div>
        )}
        
        {totalPages > 1 && (
          <div className="flex items-center justify-between py-4 mt-2 mb-2">
            <p className="text-gray-500 text-[11px] font-mono uppercase tracking-widest">Page {page}/{totalPages}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="px-4 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-semibold">Prev</button>
              <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="px-4 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-semibold">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* ════ DESKTOP VIEW WRAPPER ════ */}
      <div className="hidden lg:block w-full">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-black/40 border-b border-white/10">
              <tr>
                <th className="py-4 px-4 w-10 text-center"></th>
                <SortableHeader field="pair" label="PAIR" />
                <SortableHeader field="current_price" label="PRICE" align="right" />
                <SortableHeader field="entry" label="ENTRY" align="right" />
                <SortableHeader field="max_target" label="TARGET" align="right" />
                <SortableHeader field="stop_loss" label="STOP LOSS" align="right" />
                <SortableHeader field="risk_level" label="RISK" align="center" />
                <SortableHeader field="market_cap" label="MCAP" align="right" />
                <SortableHeader field="volume" label="VOL 24H" align="right" />
                <SortableHeader field="status" label="STATUS" align="center" />
                <SortableHeader field="last_update" label="UPDATE" align="center" />
                <SortableHeader field="created_at" label="CALLED TIME" align="right" /> {/* Changed Time to Called Time */}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {loading ? (
                [...Array(10)].map((_, i) => <tr key={i}>{[...Array(12)].map((_, j) => <td key={j} className="py-5 px-4"><div className="h-4 bg-white/5 rounded animate-pulse"></div></td>)}</tr>)
              ) : signals?.length === 0 ? (
                <tr><td colSpan="12" className="text-center py-20"><div className="flex flex-col items-center gap-3"><div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center"><span className="text-3xl opacity-50">🔍</span></div><p className="text-gray-400 text-base font-medium">No signals found</p><p className="text-gray-600 text-sm">Adjust your filters and try again.</p></div></td></tr>
              ) : (
                signals?.map((signal, idx) => {
                  const maxTarget = getMaxTarget(signal);
                  const currentPrice = getPrice(signal.pair);
                  const currentVol = getVolume(signal.pair);
                  const priceChange = getPriceChange(signal.entry, currentPrice);
                  
                  return (
                    <tr key={signal.signal_id || idx} onClick={() => setSelectedSignal(signal)} className="hover:bg-white/[0.02] cursor-pointer transition-colors group">
                      
                      {/* Star Button - click isolated */}
                      <td className="py-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <StarButton signalId={signal.signal_id} isStarred={watchlistIds.includes(signal.signal_id)} onToggle={handleStarToggle} />
                      </td>
                      
                      {/* Pair */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <CoinLogo pair={signal.pair} size={32} />
                          <div>
                            <p className="text-white font-bold text-sm tracking-wide group-hover:text-gold-primary transition-colors">{getCoinName(signal.pair)}</p>
                            <p className="text-gray-500 text-[10px] font-mono">USDT</p>
                          </div>
                        </div>
                      </td>

                      {/* Current Price */}
                      <td className="py-4 px-4 text-right">
                        {pricesLoading && !currentPrice ? (
                          <div className="h-4 w-16 bg-white/5 rounded animate-pulse ml-auto" />
                        ) : currentPrice ? (
                          <div className="flex flex-col items-end">
                            <span className="text-white font-mono text-[13px] font-medium">{formatPrice(currentPrice)}</span>
                            {priceChange !== null && <span className={`text-[11px] font-mono font-bold mt-0.5 ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>{priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%</span>}
                          </div>
                        ) : <span className="text-gray-600">-</span>}
                      </td>

                      {/* Entry Price */}
                      <td className="py-4 px-4 text-right">
                        <span className="text-gray-300 font-mono text-[13px]">{formatPrice(signal.entry)}</span>
                      </td>

                      {/* Max Target */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-green-400 font-mono text-[13px]">{maxTarget ? formatPrice(maxTarget) : '-'}</span>
                          {maxTarget && (() => { const pct = calcPct(maxTarget, signal.entry); return pct !== null ? <span className="text-green-500/70 text-[10px] font-mono mt-0.5">+{pct.toFixed(1)}%</span> : null; })()}
                        </div>
                      </td>

                      {/* Stop Loss */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-red-400 font-mono text-[13px]">{signal.stop1 ? formatPrice(signal.stop1) : '-'}</span>
                          {signal.stop1 && (() => { const pct = calcPct(signal.stop1, signal.entry); return pct !== null ? <span className="text-red-500/70 text-[10px] font-mono mt-0.5">{pct.toFixed(1)}%</span> : null; })()}
                        </div>
                      </td>

                      {/* Risk */}
                      <td className="py-4 px-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${getRiskBadge(signal.risk_level)}`}>{getRiskLabel(signal.risk_level)}</span>
                      </td>

                      {/* Market Cap */}
                      <td className="py-4 px-4 text-right">
                        {signal.market_cap ? <span className={`text-[12px] font-mono ${getMarketCapStyle(signal.market_cap)}`}>{formatMarketCap(signal.market_cap)}</span> : <span className="text-gray-600">-</span>}
                      </td>

                      {/* Volume */}
                      <td className="py-4 px-4 text-right">
                        {currentVol ? <span className={`text-[12px] font-mono ${getVolumeStyle(currentVol)}`}>{formatVolume(currentVol)}</span> : signal.volume_rank_num && signal.volume_rank_den ? <span className="text-white text-[12px] font-mono"><span className="font-bold">{signal.volume_rank_num}</span><span className="text-gray-500">/{signal.volume_rank_den}</span></span> : <span className="text-gray-600">-</span>}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 text-center">
                        {getStatusBadge(signal.status)}
                      </td>

                      {/* Last Update */}
                      <td className="py-4 px-4 text-center">
                        {signal.last_update_at ? <div className="flex flex-col items-center gap-1">{getUpdateTypeBadge(signal.last_update_type)}<span className="text-gray-500 text-[10px] font-mono">{formatTimeAgo(signal.last_update_at)}</span></div> : <span className="text-gray-600 text-xs">—</span>}
                      </td>

                      {/* Called Time */}
                      <td className="py-4 px-4 text-right">
                         <div className="flex flex-col items-end">
                            <span className="text-gray-300 font-mono text-[11px]">{(() => {
                              const d = new Date(signal.created_at);
                              return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                            })()}</span>
                            <span className="text-gray-500 font-mono text-[10px] mt-0.5">{(() => {
                              const d = new Date(signal.created_at);
                              return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                            })()}</span>
                         </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Desktop Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.05] bg-black/20">
            <p className="text-gray-500 text-xs font-mono uppercase tracking-widest">Page {page} of {totalPages}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="px-4 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-bold">Prev</button>
              <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="px-4 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-bold">Next</button>
            </div>
          </div>
        )}
      </div>

      <SignalModal signal={selectedSignal} isOpen={!!selectedSignal} onClose={() => setSelectedSignal(null)} />
    </>
  );
};

export default SignalsTable;