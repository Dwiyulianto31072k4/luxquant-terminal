import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import SignalModal from './SignalModal';
import CoinLogo from './CoinLogo';
import StarButton from './StarButton';
import { useAuth } from '../context/AuthContext';
import { watchlistApi } from '../services/watchlistApi';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * SignalsTable — Web3 Flowscan Edition
 *
 * Design principles:
 * - Functional color palette only: profit (#56c996), loss (#e07288), gold accent
 * - All status/risk/update reduced to 3 functional colors max
 * - Flat hairline borders white/[0.06] consistent everywhere
 * - Sharp rounded-md (6px), no rounded-xl/2xl
 * - Mono uppercase labels tracking-wider, tabular-nums for numbers
 * - SVG icons replace all emoji
 * - No neon glow drop-shadow
 * - Hover: bg-white/[0.02] (Flowscan exact)
 */
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

  // ═══ STABLE PRICE FETCHING (unchanged logic) ═══
  useEffect(() => {
    if (!signals || signals.length === 0) return;

    const uniquePairs = [...new Set(signals.map(s => s.pair).filter(Boolean))].sort();
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

  // ═══ FLAT 3-COLOR RISK SYSTEM ═══
  // Low → profit, Normal → gold accent, High → loss
  const getRiskClasses = (risk) => {
    const r = risk?.toLowerCase() || '';
    if (r.startsWith('low')) return 'bg-profit/10 text-profit border-profit/20';
    if (r.startsWith('high')) return 'bg-loss/10 text-loss border-loss/20';
    return 'bg-gold-primary/10 text-gold-primary border-gold-primary/20'; // normal/med
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

  // ═══ STATUS BADGE — 3 functional colors only ═══
  // Open → gold accent, TP variants → profit, SL/loss → loss
  const getStatusBadge = (status) => {
    const s = status?.toLowerCase() || '';
    let cls, label;
    if (s === 'open') {
      cls = 'bg-gold-primary/10 text-gold-primary border-gold-primary/25';
      label = 'OPEN';
    } else if (s === 'closed_loss' || s === 'sl') {
      cls = 'bg-loss/10 text-loss border-loss/25';
      label = 'LOSS';
    } else if (s === 'closed_win') {
      cls = 'bg-profit/10 text-profit border-profit/25';
      label = 'WIN';
    } else if (s.startsWith('tp')) {
      cls = 'bg-profit/10 text-profit border-profit/25';
      label = s.toUpperCase();
    } else {
      cls = 'bg-white/[0.04] text-text-muted border-white/[0.06]';
      label = status || '-';
    }
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 border font-mono text-[10px] uppercase tracking-wider rounded-sm ${cls}`}>
        {label}
      </span>
    );
  };

  const formatDateTimeShort = (dt) => {
    if (!dt) return '-';
    const d = new Date(dt);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  // ═══ UPDATE TYPE — profit/loss only, no rainbow ═══
  const getUpdateTypeBadge = (updateType) => {
    if (!updateType) return null;
    const ut = updateType.toLowerCase();
    const isLoss = ut === 'sl' || ut === 'sl1' || ut === 'sl2';
    const label = isLoss ? 'Hit SL' : `Hit ${ut.toUpperCase()}`;
    return (
      <span className={`font-mono text-[10px] uppercase tracking-wider ${isLoss ? 'text-loss' : 'text-profit'}`}>
        {label}
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

  // ═══ SORTABLE HEADER — Flowscan style ═══
  const SortableHeader = ({ field, label, align = 'left' }) => {
    const isActive = sortBy === field;
    const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : '';
    return (
      <th
        className={`py-3 px-4 font-mono text-[10px] font-medium uppercase tracking-[0.18em] cursor-pointer transition-colors select-none ${textAlign} ${
          isActive ? 'text-white' : 'text-text-muted/70 hover:text-text-muted'
        }`}
        onClick={() => onSort && onSort(field)}
      >
        <span className={`group flex items-center gap-1.5 ${justify}`}>
          <span>{label}</span>
          <svg
            className={`w-3 h-3 transition-all ${
              isActive ? 'opacity-100 text-gold-primary' : 'opacity-40 group-hover:opacity-70'
            }`}
            style={{ transform: isActive && sortOrder === 'asc' ? 'rotate(180deg)' : 'none' }}
            viewBox="0 0 24 24" fill="currentColor"
          >
            <path d="M17.6569 16.2427L19.0711 14.8285L12.0001 7.75739L4.92896 14.8285L6.34317 16.2427L12.0001 10.5858L17.6569 16.2427Z" />
          </svg>
        </span>
      </th>
    );
  };

  // ─── Empty state SVG (replace emoji) ───
  const EmptyStateIcon = () => (
    <svg className="w-8 h-8 text-text-muted/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );

  // ════════ MOBILE VIEW ════════
  const MobileSignalCard = ({ signal }) => {
    const currentPrice = getPrice(signal.pair);
    const currentVol = getVolume(signal.pair);
    const priceChange = getPriceChange(signal.entry, currentPrice);

    return (
      <div
        onClick={() => setSelectedSignal(signal)}
        className="relative bg-[#0a0805] rounded-md border border-white/[0.06] p-4 hover:border-gold-primary/25 active:bg-white/[0.02] transition-all cursor-pointer overflow-hidden group"
      >
        {/* Hairline top accent (Flowscan signature) */}
        <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/25 to-transparent" />

        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <CoinLogo pair={signal.pair} size={32} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <p className="text-white font-mono text-sm tracking-wide group-hover:text-gold-primary transition-colors">
                  {getCoinName(signal.pair)}
                </p>
                <p className="text-text-muted/60 text-[10px] font-mono">USDT</p>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 border font-mono text-[9px] uppercase tracking-wider rounded-sm ${getRiskClasses(signal.risk_level)}`}>
                  {getRiskLabel(signal.risk_level)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div onClick={(e) => e.stopPropagation()}>
              <StarButton signalId={signal.signal_id} isStarred={watchlistIds.includes(signal.signal_id)} onToggle={handleStarToggle} />
            </div>
            {getStatusBadge(signal.status)}
          </div>
        </div>

        {/* Update row */}
        {signal.last_update_at && (
          <div className="flex items-center justify-between mb-3 px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-sm">
            <div className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-gold-primary/60" />
              {getUpdateTypeBadge(signal.last_update_type)}
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted/60">
              {formatTimeAgo(signal.last_update_at)}
            </span>
          </div>
        )}

        {/* Price grid: Entry · Current · P&L */}
        <div className="grid grid-cols-3 gap-2 mb-3 bg-white/[0.02] border border-white/[0.06] p-3 rounded-sm">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60 mb-1">Entry</p>
            <p className="text-white font-mono text-[12px] tabular-nums">{formatPrice(signal.entry)}</p>
          </div>
          <div className="text-center border-x border-white/[0.04]">
            <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60 mb-1">Current</p>
            {pricesLoading && !currentPrice ? (
              <div className="h-3 w-12 bg-white/[0.04] rounded animate-pulse mx-auto" />
            ) : currentPrice ? (
              <p className="font-mono text-[12px] tabular-nums text-white">{formatPrice(currentPrice)}</p>
            ) : (
              <p className="text-text-muted/40 text-[12px]">-</p>
            )}
          </div>
          <div className="text-right">
            <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60 mb-1">P&L</p>
            {priceChange !== null ? (
              <p className={`font-mono text-[12px] tabular-nums ${priceChange >= 0 ? 'text-profit' : 'text-loss'}`}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </p>
            ) : (
              <p className="text-text-muted/40 text-[12px]">-</p>
            )}
          </div>
        </div>

        {/* TP rows */}
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {[
            { label: 'TP1', value: signal.target1 },
            { label: 'TP2', value: signal.target2 },
            { label: 'TP3', value: signal.target3 },
            { label: 'TP4', value: signal.target4 },
          ].map((tp, i) => (
            <div key={i} className="text-center bg-white/[0.015] border border-white/[0.06] py-1.5 px-1 rounded-sm">
              <p className="font-mono text-[8px] uppercase tracking-wider text-text-muted/60">{tp.label}</p>
              <p className="text-text-muted font-mono text-[10px] mt-0.5 tabular-nums">{tp.value ? formatPrice(tp.value) : '—'}</p>
            </div>
          ))}
        </div>

        {/* Footer meta */}
        <div className="flex items-center justify-between text-[10px] border-t border-white/[0.06] pt-3">
          <div className="flex items-center gap-3 flex-wrap font-mono">
            {signal.market_cap && <span className="text-text-muted/60">MC <span className="text-text-muted">{formatMarketCap(signal.market_cap)}</span></span>}
            {currentVol ? (
              <span className="text-text-muted/60">Vol <span className="text-text-muted">{formatVolume(currentVol)}</span></span>
            ) : signal.volume_rank_num && signal.volume_rank_den ? (
              <span className="text-text-muted/60">Vol <span className="text-text-muted">{signal.volume_rank_num}/{signal.volume_rank_den}</span></span>
            ) : null}
          </div>
          <div className="text-right">
            <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60 mr-1.5">Called</span>
            <span className="text-text-muted font-mono tabular-nums">{formatDateTimeShort(signal.created_at)}</span>
          </div>
        </div>
      </div>
    );
  };

  const MobileLoadingSkeleton = () => (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-[#0a0805] rounded-md p-4 border border-white/[0.06] animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/[0.04] rounded-full" />
              <div>
                <div className="h-3 w-16 bg-white/[0.04] rounded mb-1.5" />
                <div className="h-2 w-10 bg-white/[0.04] rounded" />
              </div>
            </div>
            <div className="h-5 w-16 bg-white/[0.04] rounded-sm" />
          </div>
          <div className="h-14 w-full bg-white/[0.03] rounded-sm mb-3" />
          <div className="h-7 w-full bg-white/[0.03] rounded-sm mb-3" />
          <div className="h-3 w-full bg-white/[0.03] rounded" />
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* ════ MOBILE VIEW ════ */}
      <div className="lg:hidden">
        {loading ? (
          <MobileLoadingSkeleton />
        ) : signals?.length === 0 ? (
          <div className="bg-[#0a0805] rounded-md p-8 border border-white/[0.06] text-center relative overflow-hidden">
            <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/25 to-transparent" />
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                <EmptyStateIcon />
              </div>
              <p className="text-white font-mono text-sm">No signals found</p>
              <p className="text-text-muted font-mono text-[10px] uppercase tracking-wider">Adjust your filters and try again</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {signals.map((signal, idx) => <MobileSignalCard key={signal.signal_id || idx} signal={signal} />)}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between py-4 mt-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Page {page}/{totalPages}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1.5 bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-[10px] uppercase tracking-wider text-white rounded-sm"
              >
                Prev
              </button>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1.5 bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-[10px] uppercase tracking-wider text-white rounded-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ════ DESKTOP VIEW ════ */}
      <div className="hidden lg:block w-full">
        <div className="relative bg-[#0a0805] rounded-md border border-white/[0.06] overflow-hidden">
          {/* Hairline top accent */}
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent z-10" />

          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="border-b border-white/[0.06] bg-white/[0.015]">
                <tr>
                  <th className="py-3 px-4 w-10 text-center"></th>
                  <SortableHeader field="pair" label="Pair" />
                  <SortableHeader field="current_price" label="Price" align="right" />
                  <SortableHeader field="entry" label="Entry" align="right" />
                  <SortableHeader field="max_target" label="Target" align="right" />
                  <SortableHeader field="stop_loss" label="Stop Loss" align="right" />
                  <SortableHeader field="risk_level" label="Risk" align="center" />
                  <SortableHeader field="market_cap" label="MCap" align="right" />
                  <SortableHeader field="volume" label="Vol 24h" align="right" />
                  <SortableHeader field="status" label="Status" align="center" />
                  <SortableHeader field="last_update" label="Update" align="center" />
                  <SortableHeader field="created_at" label="Called Time" align="right" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(10)].map((_, i) => (
                    <tr key={i} className="border-b border-white/[0.03]">
                      {[...Array(12)].map((_, j) => (
                        <td key={j} className="py-4 px-4">
                          <div className="h-3 bg-white/[0.04] rounded animate-pulse"></div>
                        </td>
                      ))}
                    </tr>
                  ))
                ) : signals?.length === 0 ? (
                  <tr>
                    <td colSpan="12" className="text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                          <EmptyStateIcon />
                        </div>
                        <p className="text-white font-mono text-sm">No signals found</p>
                        <p className="text-text-muted font-mono text-[10px] uppercase tracking-wider">Adjust your filters and try again</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  signals?.map((signal, idx) => {
                    const maxTarget = getMaxTarget(signal);
                    const currentPrice = getPrice(signal.pair);
                    const currentVol = getVolume(signal.pair);
                    const priceChange = getPriceChange(signal.entry, currentPrice);

                    return (
                      <tr
                        key={signal.signal_id || idx}
                        onClick={() => setSelectedSignal(signal)}
                        className="border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer transition-colors group"
                      >
                        {/* Star */}
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <StarButton signalId={signal.signal_id} isStarred={watchlistIds.includes(signal.signal_id)} onToggle={handleStarToggle} />
                        </td>

                        {/* Pair */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <CoinLogo pair={signal.pair} size={28} />
                            <div>
                              <p className="text-white font-mono text-sm tracking-wide group-hover:text-gold-primary transition-colors">
                                {getCoinName(signal.pair)}
                              </p>
                              <p className="text-text-muted/60 text-[10px] font-mono">USDT</p>
                            </div>
                          </div>
                        </td>

                        {/* Current Price */}
                        <td className="py-3 px-4 text-right">
                          {pricesLoading && !currentPrice ? (
                            <div className="h-3 w-16 bg-white/[0.04] rounded animate-pulse ml-auto" />
                          ) : currentPrice ? (
                            <div className="flex flex-col items-end">
                              <span className="text-white font-mono text-sm tabular-nums">{formatPrice(currentPrice)}</span>
                              {priceChange !== null && (
                                <span className={`font-mono text-[10px] tabular-nums mt-0.5 ${priceChange >= 0 ? 'text-profit' : 'text-loss'}`}>
                                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-text-muted/40">-</span>
                          )}
                        </td>

                        {/* Entry Price */}
                        <td className="py-3 px-4 text-right">
                          <span className="text-text-muted font-mono text-sm tabular-nums">{formatPrice(signal.entry)}</span>
                        </td>

                        {/* Max Target */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-profit font-mono text-sm tabular-nums">{maxTarget ? formatPrice(maxTarget) : '-'}</span>
                            {maxTarget && (() => {
                              const pct = calcPct(maxTarget, signal.entry);
                              return pct !== null ? (
                                <span className="text-profit/70 font-mono text-[10px] tabular-nums mt-0.5">+{pct.toFixed(1)}%</span>
                              ) : null;
                            })()}
                          </div>
                        </td>

                        {/* Stop Loss */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-loss font-mono text-sm tabular-nums">{signal.stop1 ? formatPrice(signal.stop1) : '-'}</span>
                            {signal.stop1 && (() => {
                              const pct = calcPct(signal.stop1, signal.entry);
                              return pct !== null ? (
                                <span className="text-loss/70 font-mono text-[10px] tabular-nums mt-0.5">{pct.toFixed(1)}%</span>
                              ) : null;
                            })()}
                          </div>
                        </td>

                        {/* Risk */}
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 border font-mono text-[10px] uppercase tracking-wider rounded-sm ${getRiskClasses(signal.risk_level)}`}>
                            {getRiskLabel(signal.risk_level)}
                          </span>
                        </td>

                        {/* Market Cap */}
                        <td className="py-3 px-4 text-right">
                          {signal.market_cap ? (
                            <span className="text-text-muted font-mono text-sm tabular-nums">{formatMarketCap(signal.market_cap)}</span>
                          ) : (
                            <span className="text-text-muted/40">-</span>
                          )}
                        </td>

                        {/* Volume */}
                        <td className="py-3 px-4 text-right">
                          {currentVol ? (
                            <span className="text-text-muted font-mono text-sm tabular-nums">{formatVolume(currentVol)}</span>
                          ) : signal.volume_rank_num && signal.volume_rank_den ? (
                            <span className="text-text-muted font-mono text-sm tabular-nums">
                              {signal.volume_rank_num}<span className="text-text-muted/40">/{signal.volume_rank_den}</span>
                            </span>
                          ) : (
                            <span className="text-text-muted/40">-</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center">
                          {getStatusBadge(signal.status)}
                        </td>

                        {/* Last Update */}
                        <td className="py-3 px-4 text-center">
                          {signal.last_update_at ? (
                            <div className="flex flex-col items-center gap-0.5">
                              {getUpdateTypeBadge(signal.last_update_type)}
                              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted/60">{formatTimeAgo(signal.last_update_at)}</span>
                            </div>
                          ) : (
                            <span className="text-text-muted/40 text-xs">—</span>
                          )}
                        </td>

                        {/* Called Time */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-text-muted font-mono text-[11px] tabular-nums">
                              {(() => {
                                const d = new Date(signal.created_at);
                                return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                              })()}
                            </span>
                            <span className="font-mono text-[10px] tabular-nums text-text-muted/60 mt-0.5">
                              {(() => {
                                const d = new Date(signal.created_at);
                                return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                              })()}
                            </span>
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
            <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06] bg-white/[0.015]">
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onPageChange(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-[10px] uppercase tracking-wider text-white rounded-sm"
                >
                  Prev
                </button>
                <button
                  onClick={() => onPageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-[10px] uppercase tracking-wider text-white rounded-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <SignalModal signal={selectedSignal} isOpen={!!selectedSignal} onClose={() => setSelectedSignal(null)} />
    </>
  );
};

export default SignalsTable;