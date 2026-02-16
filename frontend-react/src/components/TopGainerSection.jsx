import { useState, useEffect, useCallback } from 'react';
import CoinLogo from './CoinLogo';

/**
 * TopGainersSection - Top Gainer by LuxQuant Algorithm
 * Shows top gaining signals and fastest TP hits with stat cards
 */
const TopGainersSection = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const timeFilters = [
    { key: '1d', label: '1 Day' },
    { key: '7d', label: '1 Week' },
    { key: '30d', label: '1 Month' },
    { key: 'all', label: 'All Time' },
  ];

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let url = `/api/v1/signals/analytics/top-gainers?time_range=${timeRange}&limit=5`;
      if (timeRange === 'custom' && customFrom) {
        url += `&date_from=${customFrom}`;
        if (customTo) url += `&date_to=${customTo}`;
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch top gainers');
      
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Top gainers fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [timeRange, customFrom, customTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Date range display
  const getDateRangeLabel = () => {
    if (!data) return '';
    if (data.date_from && data.date_to) {
      const fmt = (d) => {
        try {
          return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        } catch { return d; }
      };
      return `${fmt(data.date_from)} – ${fmt(data.date_to)}`;
    }
    if (data.date_from) {
      return `Since ${new Date(data.date_from).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
    }
    return 'All Time';
  };

  const handleTimeChange = (key) => {
    if (key === 'custom') {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      setTimeRange(key);
    }
  };

  const applyCustomRange = () => {
    if (customFrom) {
      setTimeRange('custom');
    }
  };

  // TP Level badge color config
  const getTPColor = (level) => {
    const l = (level || '').toLowerCase();
    if (l === 'tp4') return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' };
    if (l === 'tp3') return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' };
    if (l === 'tp2') return { bg: 'bg-lime-500/20', text: 'text-lime-400', border: 'border-lime-500/30' };
    if (l === 'tp1') return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' };
    return { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' };
  };

  // Loading skeleton
  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-xl font-semibold text-white">Top Gainer by LuxQuant Algorithm</h2>
        </div>
        {/* Stat cards skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card rounded-xl p-4 animate-pulse border border-gold-primary/10">
              <div className="h-3 bg-gold-primary/20 rounded w-20 mb-2" />
              <div className="h-6 bg-gold-primary/20 rounded w-24" />
            </div>
          ))}
        </div>
        {/* Tables skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1].map(i => (
            <div key={i} className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
              <div className="px-4 py-3 border-b border-gold-primary/10">
                <div className="h-4 bg-gold-primary/20 rounded w-48 animate-pulse" />
              </div>
              {[...Array(5)].map((_, j) => (
                <div key={j} className="flex items-center justify-between px-4 py-3 border-b border-gold-primary/5">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-gold-primary/20 rounded animate-pulse" />
                    <div className="w-8 h-8 bg-gold-primary/20 rounded-full animate-pulse" />
                    <div className="h-4 bg-gold-primary/20 rounded w-24 animate-pulse" />
                  </div>
                  <div className="h-4 bg-gold-primary/20 rounded w-16 animate-pulse" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-xl font-semibold text-white">Top Gainer by LuxQuant Algorithm</h2>
        </div>
        <div className="glass-card rounded-xl p-6 border border-red-500/30 text-center">
          <p className="text-red-400 text-sm mb-3">⚠️ {error}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-gold-primary/20 text-gold-primary rounded-lg hover:bg-gold-primary/30 transition-colors text-sm">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const stats = data.stats;

  return (
    <div className="space-y-4">
      {/* Header with time filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-xl font-semibold text-white">Top Gainer by LuxQuant Algorithm</h2>
        </div>

        {/* Time Filters */}
        <div className="flex items-center gap-1.5">
          {timeFilters.map(f => (
            <button
              key={f.key}
              onClick={() => handleTimeChange(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                timeRange === f.key && !showCustom
                  ? 'bg-gold-primary/20 text-gold-primary border border-gold-primary/40 shadow-sm shadow-gold-primary/10'
                  : 'text-text-muted hover:text-white border border-transparent hover:border-gold-primary/20'
              }`}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={() => handleTimeChange('custom')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              showCustom
                ? 'bg-gold-primary/20 text-gold-primary border border-gold-primary/40'
                : 'text-text-muted hover:text-white border border-transparent hover:border-gold-primary/20'
            }`}
          >
            Custom
          </button>
        </div>
      </div>

      {/* Custom date range picker */}
      {showCustom && (
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="px-3 py-1.5 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm focus:border-gold-primary/50 outline-none"
          />
          <span className="text-text-muted text-sm">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="px-3 py-1.5 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm focus:border-gold-primary/50 outline-none"
          />
          <button
            onClick={applyCustomRange}
            className="px-4 py-1.5 bg-gold-primary/20 text-gold-primary rounded-lg hover:bg-gold-primary/30 transition-colors text-sm font-medium"
          >
            Apply
          </button>
        </div>
      )}

      {/* Date range label */}
      {(data.date_from || data.date_to) && (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold-primary/10 border border-gold-primary/20">
          <span className="text-sm">📅</span>
          <span className="text-gold-primary text-xs font-medium">{getDateRangeLabel()}</span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon="📊"
          label="Avg Gain Top 5"
          value={`+${stats.avg_gain_top5.toFixed(2)}%`}
          valueColor="text-positive"
        />
        <StatCard
          icon="🎯"
          label="Total TP Hits"
          value={stats.total_tp_hits.toLocaleString()}
          valueColor="text-gold-primary"
        />
        <StatCard
          icon="⚡"
          label="Avg Time to Hit"
          value={stats.avg_time_label || '-'}
          valueColor="text-cyan-400"
        />
        <StatCard
          icon="🏆"
          label="Best Gain"
          value={`+${stats.best_gain.toFixed(2)}%`}
          sub={stats.best_gain_pair}
          valueColor="text-positive"
        />
      </div>

      {/* Tables: Top Gainers + Fastest Hits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Gainers */}
        <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-gold-primary/10 flex items-center gap-2">
            <span className="text-base">🏆</span>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider">
              Top Gainers by LuxQuant Algorithm Call
            </h3>
          </div>
          <div className="divide-y divide-gold-primary/5">
            {data.top_gainers.length === 0 ? (
              <div className="px-4 py-8 text-center text-text-muted text-sm">
                No data available for this period
              </div>
            ) : (
              data.top_gainers.map((item) => (
                <GainerRow key={item.signal_id} item={item} type="gainer" getTPColor={getTPColor} />
              ))
            )}
          </div>
        </div>

        {/* Fastest Hits */}
        <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-gold-primary/10 flex items-center gap-2">
            <span className="text-base">⚡</span>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider">
              Fastest Hits by LuxQuant Algorithm Call
            </h3>
          </div>
          <div className="divide-y divide-gold-primary/5">
            {data.fastest_hits.length === 0 ? (
              <div className="px-4 py-8 text-center text-text-muted text-sm">
                No data available for this period
              </div>
            ) : (
              data.fastest_hits.map((item) => (
                <GainerRow key={item.signal_id} item={item} type="fastest" getTPColor={getTPColor} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Loading overlay for refetch */}
      {loading && data && (
        <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 border-2 border-gold-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};


// ============ Stat Card ============
const StatCard = ({ icon, label, value, sub, valueColor = 'text-white' }) => (
  <div className="glass-card rounded-xl p-4 border border-gold-primary/10 hover:border-gold-primary/20 transition-colors">
    <div className="flex items-center gap-2 mb-2">
      <span className="text-base">{icon}</span>
      <p className="text-text-muted text-[11px] uppercase tracking-wider">{label}</p>
    </div>
    <p className={`text-xl font-display font-bold ${valueColor}`}>{value}</p>
    {sub && <p className="text-text-muted text-xs mt-0.5 font-mono">{sub}</p>}
  </div>
);


// ============ Gainer/Fastest Row ============
const GainerRow = ({ item, type, getTPColor }) => {
  const tpColors = getTPColor(item.tp_level);

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gold-primary/5 cursor-pointer transition-colors group">
      {/* Left: Rank + Coin Logo + Pair + TP Badge */}
      <div className="flex items-center gap-3">
        {/* Rank */}
        <span className="text-text-muted text-sm font-mono w-6 text-center">
          #{item.rank}
        </span>

        {/* Coin Logo */}
        <CoinLogo pair={item.pair} size={32} />

        {/* Pair + TP Badge */}
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm tracking-wide">
            {item.pair}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${tpColors.bg} ${tpColors.text}`}>
            {item.tp_level}
          </span>
        </div>
      </div>

      {/* Right: Gain% + Duration */}
      <div className="text-right">
        {type === 'gainer' ? (
          <>
            <p className="text-positive font-mono font-bold text-sm">
              +{item.gain_pct.toFixed(2)}%
            </p>
            <p className="text-text-muted text-[11px] font-mono">
              {item.duration_label}
            </p>
          </>
        ) : (
          <>
            <p className="text-cyan-400 font-mono font-bold text-sm">
              {item.duration_label}
            </p>
            <p className="text-positive text-[11px] font-mono">
              +{item.gain_pct.toFixed(2)}%
            </p>
          </>
        )}
      </div>
    </div>
  );
};


export default TopGainersSection;