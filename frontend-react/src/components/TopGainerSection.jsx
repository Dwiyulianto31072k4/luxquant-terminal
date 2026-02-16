import { useState, useEffect, useCallback } from 'react';
import CoinLogo from './CoinLogo';

const API_BASE = '/api/v1';

/**
 * TopGainerSection - Top Gainers by LuxQuant Algorithm
 * 
 * KEY FIX: Now filters by TP HIT date (signal_updates.update_at)
 * instead of signal CALL date (signals.created_at)
 * 
 * Features:
 * - Quick presets: 1 Day, 1 Week, 1 Month, Custom
 * - Custom date range picker
 * - Top Gainers sorted by gain %
 * - Fastest Hits sorted by duration
 * - Coin logos with CoinLogo component
 * - Summary stats: Total TP Hits, Avg Gain, Avg Duration
 */
const TopGainerSection = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Date filter state
  const [preset, setPreset] = useState('1d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [activeFrom, setActiveFrom] = useState('');
  const [activeTo, setActiveTo] = useState('');

  // Calculate dates from preset
  const getDateRange = useCallback((p) => {
    const now = new Date();
    const to = now.toISOString().split('T')[0];
    let from;
    
    switch (p) {
      case '1d':
        from = to; // Same day
        break;
      case '1w': {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        from = weekAgo.toISOString().split('T')[0];
        break;
      }
      case '1m': {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        from = monthAgo.toISOString().split('T')[0];
        break;
      }
      default:
        from = to;
    }
    return { from, to };
  }, []);

  // Fetch data
  const fetchTopGainers = useCallback(async (from, to) => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({
        date_from: from,
        date_to: to,
        limit: '5'
      });
      
      const response = await fetch(`${API_BASE}/signals/top-gainers?${params}`);
      if (!response.ok) throw new Error('Failed to fetch top gainers');
      
      const result = await response.json();
      setData(result);
      setActiveFrom(from);
      setActiveTo(to);
    } catch (err) {
      console.error('Error fetching top gainers:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const { from, to } = getDateRange('1d');
    setCustomFrom(from);
    setCustomTo(to);
    fetchTopGainers(from, to);
  }, []);

  // Handle preset click
  const handlePreset = (p) => {
    setPreset(p);
    if (p !== 'custom') {
      const { from, to } = getDateRange(p);
      setCustomFrom(from);
      setCustomTo(to);
      fetchTopGainers(from, to);
    }
  };

  // Handle custom date apply
  const handleApply = () => {
    if (customFrom && customTo) {
      fetchTopGainers(customFrom, customTo);
    }
  };

  // Format duration
  const formatDuration = (minutes) => {
    if (!minutes || minutes <= 0) return '< 1m';
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h >= 24) {
      const d = Math.floor(h / 24);
      const rh = h % 24;
      return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
    }
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  // Format date display
  const formatDateDisplay = (from, to) => {
    if (!from || !to) return '';
    const f = new Date(from + 'T00:00:00');
    const t = new Date(to + 'T00:00:00');
    const opts = { month: 'long', day: 'numeric', year: 'numeric' };
    if (from === to) return f.toLocaleDateString('en-US', opts);
    return `${f.toLocaleDateString('en-US', opts)} – ${t.toLocaleDateString('en-US', opts)}`;
  };

  // TP Level badge colors
  const getTPBadge = (level) => {
    const config = {
      'tp1': { bg: 'from-green-500/20 to-green-600/10', border: 'border-green-500/40', text: 'text-green-400', label: 'TP 1' },
      'tp2': { bg: 'from-lime-500/20 to-lime-600/10', border: 'border-lime-500/40', text: 'text-lime-400', label: 'TP 2' },
      'tp3': { bg: 'from-yellow-500/20 to-yellow-600/10', border: 'border-yellow-500/40', text: 'text-yellow-400', label: 'TP 3' },
      'tp4': { bg: 'from-orange-500/20 to-orange-600/10', border: 'border-orange-500/40', text: 'text-orange-400', label: 'TP 4' },
    };
    return config[level?.toLowerCase()] || config['tp1'];
  };

  // Rank medal
  const getRankDisplay = (idx) => {
    if (idx === 0) return <span className="text-lg">🥇</span>;
    if (idx === 1) return <span className="text-lg">🥈</span>;
    if (idx === 2) return <span className="text-lg">🥉</span>;
    return <span className="text-text-muted font-mono text-sm font-bold">#{idx + 1}</span>;
  };

  return (
    <div className="space-y-5">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-2xl font-semibold text-white">
            Top Gainer by LuxQuant Algorithm
          </h2>
        </div>

        {/* Preset Buttons */}
        <div className="flex items-center gap-1.5">
          {[
            { key: '1d', label: '1 Day' },
            { key: '1w', label: '1 Week' },
            { key: '1m', label: '1 Month' },
            { key: 'custom', label: 'Custom' },
          ].map((p) => (
            <button
              key={p.key}
              onClick={() => handlePreset(p.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                preset === p.key
                  ? 'bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary shadow-gold-glow'
                  : 'bg-bg-card/80 text-text-muted hover:text-white border border-gold-primary/10 hover:border-gold-primary/30'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date Picker Row */}
      <div className="glass-card rounded-xl p-4 border border-gold-primary/10">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-text-muted text-sm">From:</span>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => { setCustomFrom(e.target.value); setPreset('custom'); }}
            className="px-3 py-2 bg-bg-primary border border-gold-primary/20 rounded-lg text-white text-sm font-mono focus:border-gold-primary/60 focus:outline-none transition-colors"
          />
          <span className="text-text-muted text-sm">To:</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => { setCustomTo(e.target.value); setPreset('custom'); }}
            className="px-3 py-2 bg-bg-primary border border-gold-primary/20 rounded-lg text-white text-sm font-mono focus:border-gold-primary/60 focus:outline-none transition-colors"
          />
          <button
            onClick={handleApply}
            className="px-5 py-2 bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary font-semibold text-sm rounded-lg hover:shadow-gold-glow transition-all duration-200 active:scale-95"
          >
            Apply
          </button>

          {/* Active date badge */}
          {activeFrom && (
            <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-gold-primary/10 border border-gold-primary/20 rounded-lg">
              <span className="text-gold-primary text-xs">📅</span>
              <span className="text-gold-light text-xs font-medium">
                {formatDateDisplay(activeFrom, activeTo)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      {data && !loading && (
        <div className="grid grid-cols-3 gap-4">
          <div className="glass-card rounded-xl p-5 border border-gold-primary/10 group hover:border-gold-primary/30 transition-all">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🎯</span>
              <p className="text-text-muted text-xs uppercase tracking-wider font-medium">Total TP Hits</p>
            </div>
            <p className="text-3xl font-display font-bold text-white">{data.total_tp_hits}</p>
          </div>
          
          <div className="glass-card rounded-xl p-5 border border-gold-primary/10 group hover:border-green-500/30 transition-all">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🚀</span>
              <p className="text-text-muted text-xs uppercase tracking-wider font-medium">Avg Gain (Top 5)</p>
            </div>
            <p className="text-3xl font-mono font-bold text-green-400">{data.avg_gain_top5.toFixed(2)}%</p>
          </div>
          
          <div className="glass-card rounded-xl p-5 border border-gold-primary/10 group hover:border-blue-500/30 transition-all">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">⏱️</span>
              <p className="text-text-muted text-xs uppercase tracking-wider font-medium">Avg Duration</p>
            </div>
            <p className="text-3xl font-display font-bold text-white">
              {formatDuration(Math.round(data.avg_duration_minutes))}
            </p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="glass-card rounded-xl p-5 border border-gold-primary/10 animate-pulse">
              <div className="h-4 bg-gold-primary/10 rounded w-24 mb-3" />
              <div className="h-8 bg-gold-primary/10 rounded w-16" />
            </div>
          ))}
        </div>
      )}

      {/* Top Gainers & Fastest Hits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Gainers */}
        <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gold-primary/10 bg-gradient-to-r from-gold-primary/5 to-transparent">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🏆</span>
              <h3 className="text-white font-semibold tracking-wide">Top Gainers by LuxQuant Algorithm Call</h3>
            </div>
          </div>

          {/* Content */}
          <div className="divide-y divide-gold-primary/5">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="px-5 py-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gold-primary/10 rounded-full" />
                    <div className="w-10 h-10 bg-gold-primary/10 rounded-full" />
                    <div className="flex-1">
                      <div className="h-4 bg-gold-primary/10 rounded w-24 mb-2" />
                      <div className="h-3 bg-gold-primary/10 rounded w-16" />
                    </div>
                    <div className="h-6 bg-gold-primary/10 rounded w-16" />
                  </div>
                </div>
              ))
            ) : data?.top_gainers?.length > 0 ? (
              data.top_gainers.map((item, idx) => {
                const tp = getTPBadge(item.tp_level);
                return (
                  <div 
                    key={item.signal_id} 
                    className="px-5 py-4 hover:bg-gold-primary/5 transition-all duration-200 group cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      {/* Rank */}
                      <div className="w-8 flex-shrink-0 flex items-center justify-center">
                        {getRankDisplay(idx)}
                      </div>
                      
                      {/* Coin Logo */}
                      <CoinLogo pair={item.pair} size={40} />
                      
                      {/* Coin Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold text-sm group-hover:text-gold-light transition-colors">
                            {item.pair.replace(/USDT$/i, '')}
                          </span>
                          <span className="text-text-muted text-xs">USDT</span>
                          {/* TP Badge */}
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border bg-gradient-to-r ${tp.bg} ${tp.border} ${tp.text}`}>
                            {tp.label}
                          </span>
                        </div>
                        <p className="text-text-muted text-xs mt-0.5">
                          {formatDuration(item.duration_minutes)}
                        </p>
                      </div>
                      
                      {/* Gain % */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-green-400 font-mono font-bold text-sm">
                          +{item.gain_pct.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-5 py-12 text-center">
                <p className="text-text-muted text-sm">No TP hits found in this period</p>
                <p className="text-text-muted/60 text-xs mt-1">Try selecting a wider date range</p>
              </div>
            )}
          </div>
        </div>

        {/* Fastest Hits */}
        <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gold-primary/10 bg-gradient-to-r from-blue-500/5 to-transparent">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">⚡</span>
              <h3 className="text-white font-semibold tracking-wide">Fastest Hits by LuxQuant Algorithm Call</h3>
            </div>
          </div>

          {/* Content */}
          <div className="divide-y divide-gold-primary/5">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="px-5 py-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gold-primary/10 rounded-full" />
                    <div className="w-10 h-10 bg-gold-primary/10 rounded-full" />
                    <div className="flex-1">
                      <div className="h-4 bg-gold-primary/10 rounded w-24 mb-2" />
                      <div className="h-3 bg-gold-primary/10 rounded w-16" />
                    </div>
                    <div className="h-6 bg-gold-primary/10 rounded w-12" />
                  </div>
                </div>
              ))
            ) : data?.fastest_hits?.length > 0 ? (
              data.fastest_hits.map((item, idx) => {
                const tp = getTPBadge(item.tp_level);
                return (
                  <div 
                    key={`fast-${item.signal_id}`} 
                    className="px-5 py-4 hover:bg-blue-500/5 transition-all duration-200 group cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      {/* Rank */}
                      <div className="w-8 flex-shrink-0 flex items-center justify-center">
                        {getRankDisplay(idx)}
                      </div>
                      
                      {/* Coin Logo */}
                      <CoinLogo pair={item.pair} size={40} />
                      
                      {/* Coin Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold text-sm group-hover:text-blue-300 transition-colors">
                            {item.pair.replace(/USDT$/i, '')}
                          </span>
                          <span className="text-text-muted text-xs">USDT</span>
                          {/* TP Badge */}
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border bg-gradient-to-r ${tp.bg} ${tp.border} ${tp.text}`}>
                            {tp.label}
                          </span>
                        </div>
                        <p className="text-text-muted text-xs mt-0.5">
                          +{item.gain_pct.toFixed(2)}%
                        </p>
                      </div>
                      
                      {/* Duration */}
                      <div className="text-right flex-shrink-0">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20">
                          <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span className="text-blue-400 font-mono font-bold text-xs">
                            {formatDuration(item.duration_minutes)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-5 py-12 text-center">
                <p className="text-text-muted text-sm">No TP hits found in this period</p>
                <p className="text-text-muted/60 text-xs mt-1">Try selecting a wider date range</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="glass-card rounded-xl p-5 border border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-3">
            <span className="text-red-400">⚠️</span>
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => fetchTopGainers(activeFrom || customFrom, activeTo || customTo)}
              className="ml-auto px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs hover:bg-red-500/20 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TopGainerSection;