import { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8002';

/**
 * TopPerformers - Top 5 Gainers & Fastest 5 Hits from TP4 signals
 * With time filter: 1 Day, 1 Week, 1 Month, Custom Range
 */
const TopPerformers = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const presets = [
    { key: '1d', label: '1 Day', days: 1 },
    { key: '7d', label: '1 Week', days: 7 },
    { key: '30d', label: '1 Month', days: 30 },
    { key: 'custom', label: 'Custom', days: null },
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API_URL}/api/v1/signals/top-performers?limit=5`;

      if (activeFilter === 'custom' && customFrom && customTo) {
        url += `&date_from=${customFrom}&date_to=${customTo}`;
      } else if (activeFilter !== 'custom') {
        const preset = presets.find(p => p.key === activeFilter);
        url += `&days=${preset?.days || 7}`;
      } else {
        setLoading(false);
        return;
      }

      const res = await fetch(url);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error('Top performers fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeFilter, customFrom, customTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeFilter === 'custom') return;
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [activeFilter, fetchData]);

  const handlePresetClick = (key) => {
    if (key === 'custom') {
      setShowCustom(true);
      setActiveFilter('custom');
    } else {
      setShowCustom(false);
      setActiveFilter(key);
    }
  };

  const handleCustomApply = () => {
    if (customFrom && customTo) {
      fetchData();
    }
  };

  const cleanPair = (pair) => {
    if (!pair) return '???';
    return pair.replace(/^3A/, '').replace(/USDT$/, '') + 'USDT';
  };

  // Loading skeleton
  if (loading && !data) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-xl font-semibold text-white">Performance Statistics</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="bg-bg-card rounded-xl p-5 border border-gold-primary/10 animate-pulse">
              <div className="h-5 w-40 bg-bg-primary/50 rounded mb-4" />
              {[...Array(5)].map((_, j) => (
                <div key={j} className="h-10 bg-bg-primary/30 rounded-lg mb-2" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 relative">
      {/* Header with filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-xl font-semibold text-white">Performance Statistics</h2>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-2">
          {presets.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handlePresetClick(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === key
                  ? 'bg-gold-primary text-bg-primary'
                  : 'bg-bg-card/60 text-text-muted border border-gold-primary/10 hover:border-gold-primary/30 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range picker */}
      {showCustom && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-bg-card/40 rounded-xl border border-gold-primary/10">
          <span className="text-text-muted text-xs">From:</span>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="px-3 py-1.5 bg-bg-primary border border-gold-primary/20 rounded-lg text-white text-sm focus:outline-none focus:border-gold-primary/50 [color-scheme:dark]"
          />
          <span className="text-text-muted text-xs">To:</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="px-3 py-1.5 bg-bg-primary border border-gold-primary/20 rounded-lg text-white text-sm focus:outline-none focus:border-gold-primary/50 [color-scheme:dark]"
          />
          <button
            onClick={handleCustomApply}
            disabled={!customFrom || !customTo}
            className="px-4 py-1.5 bg-gold-primary text-bg-primary rounded-lg text-xs font-bold hover:bg-gold-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>
      )}

      {/* Period badge */}
      {data?.period && (
        <div className="mb-4">
          <span className="inline-block px-4 py-2 bg-gold-primary/10 border border-gold-primary/20 rounded-lg text-gold-primary text-xs font-semibold">
            📅 {data.period}
          </span>
        </div>
      )}

      {/* Summary cards */}
      {data && data.total_tp4 > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-bg-card/60 rounded-xl p-4 border border-gold-primary/10">
            <p className="text-text-muted text-xs uppercase tracking-wider">🎯 Total TP Hits</p>
            <p className="text-white font-mono text-2xl font-bold mt-1">{data.total_tp4}</p>
          </div>
          <div className="bg-bg-card/60 rounded-xl p-4 border border-gold-primary/10">
            <p className="text-text-muted text-xs uppercase tracking-wider">🚀 Avg Gain (Top 5)</p>
            <p className="text-green-400 font-mono text-2xl font-bold mt-1">
              {data.top_gainers?.length > 0
                ? (data.top_gainers.reduce((a, b) => a + b.gain_pct, 0) / data.top_gainers.length).toFixed(2)
                : '0'}%
            </p>
          </div>
          <div className="bg-bg-card/60 rounded-xl p-4 border border-gold-primary/10">
            <p className="text-text-muted text-xs uppercase tracking-wider">⏱️ Avg Duration</p>
            <p className="text-white font-mono text-2xl font-bold mt-1">
              {data.top_gainers?.length > 0
                ? formatDuration(data.top_gainers.reduce((a, b) => a + b.duration_seconds, 0) / data.top_gainers.length)
                : 'N/A'}
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {data && data.total_tp4 === 0 && !loading && (
        <div className="text-center py-8 mb-4 bg-bg-card/40 rounded-xl border border-gold-primary/10">
          <p className="text-text-muted text-sm">No TP4 signals found for this period</p>
        </div>
      )}

      {/* Two columns: Gainers | Fastest */}
      {data && (data.top_gainers?.length > 0 || data.fastest_hits?.length > 0) && (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${loading ? 'opacity-50' : ''}`}>
          {/* Top 5 Gainers */}
          <div className="bg-bg-card rounded-xl border border-gold-primary/10 overflow-hidden">
            <div className="px-5 py-3 border-b border-gold-primary/10 flex items-center gap-2">
              <span>🏆</span>
              <h3 className="text-gold-primary font-semibold text-sm uppercase tracking-wider">Top 5 Gainers</h3>
            </div>
            <div className="p-3 space-y-2">
              {data.top_gainers?.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-4 py-3 bg-bg-primary/40 rounded-lg border border-green-500/10 hover:border-green-500/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gold-primary font-mono text-xs w-5">#{idx + 1}</span>
                    <span className="text-white font-semibold text-sm">{cleanPair(item.pair)}</span>
                    {item.tp_level && (
                      <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-bold rounded">
                        {item.tp_level}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-green-400 font-mono font-bold text-sm">+{item.gain_pct.toFixed(2)}%</span>
                    <p className="text-text-muted text-[10px]">{item.duration_display}</p>
                  </div>
                </div>
              ))}
              {(!data.top_gainers || data.top_gainers.length === 0) && (
                <p className="text-text-muted text-sm text-center py-4">No data</p>
              )}
            </div>
          </div>

          {/* Fastest 5 Hits */}
          <div className="bg-bg-card rounded-xl border border-gold-primary/10 overflow-hidden">
            <div className="px-5 py-3 border-b border-gold-primary/10 flex items-center gap-2">
              <span>⚡</span>
              <h3 className="text-gold-primary font-semibold text-sm uppercase tracking-wider">Fastest 5 Hits</h3>
            </div>
            <div className="p-3 space-y-2">
              {data.fastest_hits?.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-4 py-3 bg-bg-primary/40 rounded-lg border border-yellow-500/10 hover:border-yellow-500/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gold-primary font-mono text-xs w-5">#{idx + 1}</span>
                    <span className="text-white font-semibold text-sm">{cleanPair(item.pair)}</span>
                    {item.tp_level && (
                      <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold rounded">
                        {item.tp_level}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-yellow-400 font-mono font-bold text-sm">{item.duration_display}</span>
                    <p className="text-text-muted text-[10px]">+{item.gain_pct.toFixed(2)}%</p>
                  </div>
                </div>
              ))}
              {(!data.fastest_hits || data.fastest_hits.length === 0) && (
                <p className="text-text-muted text-sm text-center py-4">No data</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return 'N/A';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default TopPerformers;