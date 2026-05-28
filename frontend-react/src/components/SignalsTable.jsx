import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import SignalModal from './SignalModal';
import CoinLogo from './CoinLogo';
import StarButton from './StarButton';
import { useAuth } from '../context/AuthContext';
import { watchlistApi } from '../services/watchlistApi';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * SignalsTable — Full Original + Strong Color Fix (emerald-400 & red-400)
 * Tidak ada yang dihapus. Hanya warna yang diubah.
 *
 * VOLUME SORT FIX:
 * - Prices/volume are now fetched for ALL pairs (via `allPairs` prop), not just
 *   the current page. Sorting by volume therefore has data for every row.
 * - The accumulated price map is MERGED (never replaced), so navigating pages or
 *   the 15s refresh never blanks out previously-fetched pairs → no reshuffle.
 *
 * PRICE/PNL REGRESSION FIX:
 * - The browser CANNOT reach api.bybit.com directly in many regions (e.g. ID
 *   returns net::ERR_CONNECTION_REFUSED). So we fetch through the BACKEND PROXY
 *   (server-side on the VPS, which can reach Bybit + has .com/.id fallback),
 *   chunked to avoid HTTP 414 on large symbol sets. Direct Bybit is last-resort.
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
  allPairs,
}) => {
  const { t } = useTranslation();

  const [selectedSignal, setSelectedSignal] = useState(null);
  const [currentPrices, setCurrentPrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesFailed, setPricesFailed] = useState(false);   // true only when NO pair could be fetched at all
  const [showNotice, setShowNotice] = useState(false);       // the dismissible "data unavailable" toast

  const { isAuthenticated } = useAuth();
  const [watchlistIds, setWatchlistIds] = useState([]);

  const pairsRef = useRef('');
  const intervalRef = useRef(null);
  const pricesAccumRef = useRef({});           // accumulated price map (merge target)
  const noticeShownRef = useRef(false);        // ensures the notice shows at most once per mount
  const onPricesUpdateRef = useRef(onPricesUpdate);
  onPricesUpdateRef.current = onPricesUpdate;

  useEffect(() => {
    if (!isAuthenticated) return;
    watchlistApi.getWatchlistIds()
      .then(data => setWatchlistIds(data.signal_ids || []))
      .catch(() => {});
  }, [isAuthenticated]);

  // Show a one-time, auto-dismissing notice ONLY when live market data totally
  // failed to load (proxy returned nothing AND direct Bybit was unreachable) —
  // the typical cause is a regional/ISP block on the global exchange.
  useEffect(() => {
    if (pricesFailed && !noticeShownRef.current) {
      noticeShownRef.current = true;
      setShowNotice(true);
      const tid = setTimeout(() => setShowNotice(false), 9000);
      return () => clearTimeout(tid);
    }
  }, [pricesFailed]);

  const handleStarToggle = (signalId, newState) => {
    setWatchlistIds(prev =>
      newState ? [...prev, signalId] : prev.filter(id => id !== signalId)
    );
  };

  // Merge a freshly-fetched map into the accumulated map and notify the parent.
  // Merge (not replace) ensures pairs fetched earlier never disappear.
  const applyMap = (newMap) => {
    const merged = { ...pricesAccumRef.current, ...newMap };
    pricesAccumRef.current = merged;
    setCurrentPrices(merged);
    if (onPricesUpdateRef.current) onPricesUpdateRef.current(merged);
  };

  useEffect(() => {
    // Prefer the full set of pairs (all signals) so volume sort has complete data.
    // Fall back to current-page pairs if allPairs wasn't provided.
    const sourcePairs = (allPairs && allPairs.length > 0)
      ? allPairs
      : (signals || []).map(s => s.pair);

    const uniquePairs = [...new Set(sourcePairs.filter(Boolean))].sort();
    const newKey = uniquePairs.join(',');

    if (newKey === pairsRef.current) return;
    pairsRef.current = newKey;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (uniquePairs.length === 0) return;

    const wanted = new Set(uniquePairs);

    // Fetch all requested symbols THROUGH THE BACKEND PROXY, in chunks.
    // Why proxy: the browser cannot reach api.bybit.com directly in many
    // regions (e.g. ID → net::ERR_CONNECTION_REFUSED). The proxy runs
    // server-side on the VPS, which can reach Bybit (+ has .com/.id fallback).
    // Why chunk: a single symbols= URL with hundreds of pairs blows past the
    // server URL limit (HTTP 414). 40/chunk keeps every URL short & safe.
    const fetchViaProxy = async (symbolList) => {
      const CHUNK = 40;
      const batches = [];
      for (let i = 0; i < symbolList.length; i += CHUNK) {
        batches.push(symbolList.slice(i, i + CHUNK));
      }
      const results = await Promise.allSettled(
        batches.map((b) =>
          fetch(`${API_BASE}/api/v1/market/prices?symbols=${b.join(',')}`)
            .then((r) => (r.ok ? r.json() : null))
        )
      );
      const acc = {};
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value && typeof r.value === 'object') {
          Object.assign(acc, r.value);
        }
      }
      return Object.keys(acc).length > 0 ? acc : null;
    };

    // Last-resort only: direct Bybit from the browser. Works where bybit.com is
    // reachable; will simply fail (and we degrade gracefully) where it isn't.
    const fromBybit = async (category) => {
      const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=${category}`);
      if (!res.ok) return null;
      const json = await res.json();
      const list = json?.result?.list || [];
      const map = {};
      for (const item of list) {
        if (wanted.has(item.symbol)) {
          map[item.symbol] = {
            price: parseFloat(item.lastPrice) || 0,
            volume: parseFloat(item.turnover24h) || 0,
          };
        }
      }
      return Object.keys(map).length > 0 ? map : null;
    };

    const fetchPrices = async () => {
      // 1) Primary: backend proxy (chunked). Server-side, region-proof.
      try {
        const proxied = await fetchViaProxy(uniquePairs);
        if (proxied) {
          applyMap(proxied);
          return;
        }
      } catch (err) {
        console.warn('[Prices] Backend proxy failed, trying Bybit direct:', err.message);
      }

      // 2) Fallback: direct Bybit linear (only where reachable from browser)
      try {
        const linear = await fromBybit('linear');
        if (linear) {
          applyMap(linear);
          return;
        }
      } catch (err2) {
        console.warn('[Prices] Bybit linear failed:', err2.message);
      }

      // 3) Fallback: direct Bybit spot
      try {
        const spot = await fromBybit('spot');
        if (spot) applyMap(spot);
      } catch (err3) {
        console.warn('[Prices] All providers failed:', err3.message);
      }
    };

    const runFetch = async () => {
      await fetchPrices();
      // "Failed" only when the WHOLE map is still empty after every provider
      // tried. Individual unlisted coins staying blank is normal, not a failure.
      setPricesFailed(Object.keys(pricesAccumRef.current).length === 0);
    };

    setPricesLoading(true);
    runFetch().finally(() => setPricesLoading(false));

    intervalRef.current = setInterval(runFetch, 15000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [allPairs, signals]);

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

  // ==================== WARNA KUAT (emerald & red) ====================
  const getRiskClasses = (risk) => {
    const r = risk?.toLowerCase() || '';
    if (r.startsWith('low')) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    if (r.startsWith('high')) return 'bg-red-500/10 text-red-400 border-red-500/30';
    return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
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

  const getStatusBadge = (status) => {
    const s = status?.toLowerCase() || '';
    let cls, label;

    if (s === 'open') {
      cls = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      label = 'OPEN';
    } else if (s === 'closed_loss' || s === 'sl') {
      cls = 'bg-red-500/10 text-red-400 border-red-500/30';
      label = 'LOSS';
    } else if (s === 'closed_win') {
      cls = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      label = 'WIN';
    } else if (s.startsWith('tp')) {
      cls = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
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

  const getUpdateTypeBadge = (updateType) => {
    if (!updateType) return null;
    const ut = updateType.toLowerCase();
    const isLoss = ut === 'sl' || ut === 'sl1' || ut === 'sl2';
    const label = isLoss ? 'Hit SL' : `Hit ${ut.toUpperCase()}`;
    return (
      <span className={`font-mono text-[10px] uppercase tracking-wider ${isLoss ? 'text-red-400' : 'text-emerald-400'}`}>
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
            className={`w-3 h-3 transition-all ${isActive ? 'opacity-100 text-amber-400' : 'opacity-40 group-hover:opacity-70'}`}
            style={{ transform: isActive && sortOrder === 'asc' ? 'rotate(180deg)' : 'none' }}
            viewBox="0 0 24 24" fill="currentColor"
          >
            <path d="M17.6569 16.2427L19.0711 14.8285L12.0001 7.75739L4.92896 14.8285L6.34317 16.2427L12.0001 10.5858L17.6569 16.2427Z" />
          </svg>
        </span>
      </th>
    );
  };

  const EmptyStateIcon = () => (
    <svg className="w-8 h-8 text-text-muted/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );

  const MobileSignalCard = ({ signal }) => {
    const currentPrice = getPrice(signal.pair);
    const currentVol = getVolume(signal.pair);
    const priceChange = getPriceChange(signal.entry, currentPrice);
    const currentPriceColor = priceChange !== null 
      ? (priceChange >= 0 ? 'text-emerald-400' : 'text-red-400') 
      : 'text-white';

    return (
      <div
        onClick={() => setSelectedSignal(signal)}
        className="relative bg-[#0a0805] rounded-md border border-white/[0.06] p-4 hover:border-amber-400/25 active:bg-white/[0.02] transition-all cursor-pointer overflow-hidden group"
      >
        <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-400/25 to-transparent" />

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <CoinLogo pair={signal.pair} size={32} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <p className="text-white font-mono text-sm tracking-wide group-hover:text-amber-400 transition-colors">
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

        {signal.last_update_at && (
          <div className="flex items-center justify-between mb-3 px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-sm">
            <div className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-amber-400/60" />
              {getUpdateTypeBadge(signal.last_update_type)}
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted/60">
              {formatTimeAgo(signal.last_update_at)}
            </span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mb-3 bg-white/[0.02] border border-white/[0.06] p-3 rounded-sm">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60 mb-1">Entry</p>
            <p className="text-white font-mono text-[12px] tabular-nums font-medium">{formatPrice(signal.entry)}</p>
          </div>
          <div className="text-center border-x border-white/[0.04]">
            <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60 mb-1">Current</p>
            {pricesLoading && !currentPrice ? (
              <div className="h-3 w-12 bg-white/[0.04] rounded animate-pulse mx-auto" />
            ) : currentPrice ? (
              <p className={`font-mono text-[12px] tabular-nums font-medium ${currentPriceColor}`}>
                {formatPrice(currentPrice)}
              </p>
            ) : (
              <p className="text-text-muted/40 text-[12px]">-</p>
            )}
          </div>
          <div className="text-right">
            <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60 mb-1">P&L</p>
            {priceChange !== null ? (
              <p className={`font-mono text-[12px] tabular-nums font-medium ${priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </p>
            ) : (
              <p className="text-text-muted/40 text-[12px]">-</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {[
            { label: 'TP1', value: signal.target1 },
            { label: 'TP2', value: signal.target2 },
            { label: 'TP3', value: signal.target3 },
            { label: 'TP4', value: signal.target4 },
          ].map((tp, i) => (
            <div key={i} className="text-center bg-white/[0.015] border border-white/[0.06] py-1.5 px-1 rounded-sm">
              <p className="font-mono text-[8px] uppercase tracking-wider text-text-muted/60">{tp.label}</p>
              <p className="text-text-muted font-mono text-[10px] mt-0.5 tabular-nums font-medium">{tp.value ? formatPrice(tp.value) : '—'}</p>
            </div>
          ))}
        </div>

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
            <span className="text-text-muted font-mono tabular-nums font-medium">{formatDateTimeShort(signal.created_at)}</span>
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
      <div className="lg:hidden">
        {loading ? (
          <MobileLoadingSkeleton />
        ) : signals?.length === 0 ? (
          <div className="bg-[#0a0805] rounded-md p-8 border border-white/[0.06] text-center relative overflow-hidden">
            <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-400/25 to-transparent" />
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

      <div className="hidden lg:block w-full">
        <div className="relative bg-[#0a0805] rounded-md border border-white/[0.06] overflow-hidden">
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-400/30 to-transparent z-10" />

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

                    const currentPriceColor = priceChange !== null 
                      ? (priceChange >= 0 ? 'text-emerald-400' : 'text-red-400') 
                      : 'text-white';

                    return (
                      <tr
                        key={signal.signal_id || idx}
                        onClick={() => setSelectedSignal(signal)}
                        className="border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer transition-colors group"
                      >
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <StarButton signalId={signal.signal_id} isStarred={watchlistIds.includes(signal.signal_id)} onToggle={handleStarToggle} />
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <CoinLogo pair={signal.pair} size={28} />
                            <div>
                              <p className="text-white font-mono text-sm tracking-wide group-hover:text-amber-400 transition-colors">
                                {getCoinName(signal.pair)}
                              </p>
                              <p className="text-text-muted/60 text-[10px] font-mono">USDT</p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right">
                          {pricesLoading && !currentPrice ? (
                            <div className="h-3 w-16 bg-white/[0.04] rounded animate-pulse ml-auto" />
                          ) : currentPrice ? (
                            <div className="flex flex-col items-end">
                              <span className={`font-mono text-sm tabular-nums font-medium ${currentPriceColor}`}>
                                {formatPrice(currentPrice)}
                              </span>
                              {priceChange !== null && (
                                <span className={`font-mono text-[10px] tabular-nums mt-0.5 font-medium ${priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-text-muted/40">-</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <span className="text-text-muted font-mono text-sm tabular-nums font-medium">{formatPrice(signal.entry)}</span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-emerald-400 font-mono text-sm tabular-nums font-medium">{maxTarget ? formatPrice(maxTarget) : '-'}</span>
                            {maxTarget && (() => {
                              const pct = calcPct(maxTarget, signal.entry);
                              return pct !== null ? (
                                <span className="text-emerald-400/70 font-mono text-[10px] tabular-nums mt-0.5">+{pct.toFixed(1)}%</span>
                              ) : null;
                            })()}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-red-400 font-mono text-sm tabular-nums font-medium">{signal.stop1 ? formatPrice(signal.stop1) : '-'}</span>
                            {signal.stop1 && (() => {
                              const pct = calcPct(signal.stop1, signal.entry);
                              return pct !== null ? (
                                <span className="text-red-400/70 font-mono text-[10px] tabular-nums mt-0.5">{pct.toFixed(1)}%</span>
                              ) : null;
                            })()}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 border font-mono text-[10px] uppercase tracking-wider rounded-sm ${getRiskClasses(signal.risk_level)}`}>
                            {getRiskLabel(signal.risk_level)}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          {signal.market_cap ? (
                            <span className="text-text-muted font-mono text-sm tabular-nums font-medium">{formatMarketCap(signal.market_cap)}</span>
                          ) : (
                            <span className="text-text-muted/40">-</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          {currentVol ? (
                            <span className="text-text-muted font-mono text-sm tabular-nums font-medium">{formatVolume(currentVol)}</span>
                          ) : signal.volume_rank_num && signal.volume_rank_den ? (
                            <span className="text-text-muted font-mono text-sm tabular-nums font-medium">
                              {signal.volume_rank_num}<span className="text-text-muted/40">/{signal.volume_rank_den}</span>
                            </span>
                          ) : (
                            <span className="text-text-muted/40">-</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          {getStatusBadge(signal.status)}
                        </td>

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

                        <td className="py-3 px-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-text-muted font-mono text-[11px] tabular-nums font-medium">
                              {(() => {
                                const d = new Date(signal.created_at);
                                return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                              })()}
                            </span>
                            <span className="font-mono text-[10px] tabular-nums text-text-muted/60 mt-0.5 font-medium">
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

      {showNotice && (
        <div className="fixed bottom-4 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:max-w-md z-[60] lq-notice-in">
          <div className="relative flex items-start gap-3 bg-[#0a0805] border border-gold-primary/25 rounded-md p-4 pr-10 shadow-2xl overflow-hidden">
            <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
            <span className="absolute left-0 inset-y-0 w-0.5 bg-gold-primary/50" />
            <div className="w-8 h-8 shrink-0 rounded-sm bg-gold-primary/[0.08] border border-gold-primary/20 flex items-center justify-center text-gold-primary/80">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-mono text-xs text-white tracking-wide">Some market data unavailable</p>
              <p className="font-mono text-[11px] leading-relaxed text-text-muted mt-1">
                If prices or volume aren't loading, a global crypto exchange may be blocked on your network or region. Connecting through a VPN usually restores live data.
              </p>
            </div>
            <button
              onClick={() => setShowNotice(false)}
              aria-label="Dismiss"
              className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded-sm text-text-muted/60 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <style>{`
            @keyframes lqNoticeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            .lq-notice-in > div { animation: lqNoticeIn 0.25s ease-out; }
          `}</style>
        </div>
      )}

      <SignalModal signal={selectedSignal} isOpen={!!selectedSignal} onClose={() => setSelectedSignal(null)} />
    </>
  );
};

export default SignalsTable;