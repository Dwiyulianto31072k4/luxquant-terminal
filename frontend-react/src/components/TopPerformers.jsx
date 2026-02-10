import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = '/api/v1';

const TopPerformers = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  // Modal state
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [signalDetail, setSignalDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const presets = [
    { key: '1d', label: '1 Day', days: 1 },
    { key: '7d', label: '1 Week', days: 7 },
    { key: '30d', label: '1 Month', days: 30 },
    { key: 'custom', label: 'Custom', days: null },
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API_BASE}/signals/top-performers?limit=5`;
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
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error('Top performers fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeFilter, customFrom, customTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (activeFilter === 'custom') return;
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [activeFilter, fetchData]);

  const handleItemClick = async (item) => {
    if (!item.signal_id) return;
    setSelectedSignal(item);
    setDetailLoading(true);
    setSignalDetail(null);
    try {
      const res = await fetch(`${API_BASE}/signals/detail/${item.signal_id}`);
      if (res.ok) setSignalDetail(await res.json());
    } catch (err) {
      console.error('Signal detail fetch error:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeModal = () => { setSelectedSignal(null); setSignalDetail(null); };

  const handlePresetClick = (key) => {
    if (key === 'custom') { setShowCustom(true); setActiveFilter('custom'); }
    else { setShowCustom(false); setActiveFilter(key); }
  };

  const handleCustomApply = () => { if (customFrom && customTo) fetchData(); };

  const cleanPair = (pair) => {
    if (!pair) return '???';
    return pair.replace(/^3A/, '').replace(/USDT$/, '') + 'USDT';
  };

  if (loading && !data) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-3xl font-bold text-white">Top Gainer by LuxQuant Algorithm</h2>
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
          <h2 className="font-display text-3xl font-bold text-white">Top Gainer by LuxQuant Algorithm</h2>
        </div>
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

      {showCustom && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-bg-card/40 rounded-xl border border-gold-primary/10">
          <span className="text-text-muted text-xs">From:</span>
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
            className="px-3 py-1.5 bg-bg-primary border border-gold-primary/20 rounded-lg text-white text-sm focus:outline-none focus:border-gold-primary/50 [color-scheme:dark]" />
          <span className="text-text-muted text-xs">To:</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            className="px-3 py-1.5 bg-bg-primary border border-gold-primary/20 rounded-lg text-white text-sm focus:outline-none focus:border-gold-primary/50 [color-scheme:dark]" />
          <button onClick={handleCustomApply} disabled={!customFrom || !customTo}
            className="px-4 py-1.5 bg-gold-primary text-bg-primary rounded-lg text-xs font-bold hover:bg-gold-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Apply
          </button>
        </div>
      )}

      {data?.period && (
        <div className="mb-4">
          <span className="inline-block px-4 py-2 bg-gold-primary/10 border border-gold-primary/20 rounded-lg text-gold-primary text-xs font-semibold">
            📅 {data.period}
          </span>
        </div>
      )}

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
                ? (data.top_gainers.reduce((a, b) => a + b.gain_pct, 0) / data.top_gainers.length).toFixed(2) : '0'}%
            </p>
          </div>
          <div className="bg-bg-card/60 rounded-xl p-4 border border-gold-primary/10">
            <p className="text-text-muted text-xs uppercase tracking-wider">⏱️ Avg Duration</p>
            <p className="text-white font-mono text-2xl font-bold mt-1">
              {data.top_gainers?.length > 0
                ? formatDuration(data.top_gainers.reduce((a, b) => a + b.duration_seconds, 0) / data.top_gainers.length) : 'N/A'}
            </p>
          </div>
        </div>
      )}

      {data && data.total_tp4 === 0 && !loading && (
        <div className="text-center py-8 mb-4 bg-bg-card/40 rounded-xl border border-gold-primary/10">
          <p className="text-text-muted text-sm">No TP4 signals found for this period</p>
        </div>
      )}

      {data && (data.top_gainers?.length > 0 || data.fastest_hits?.length > 0) && (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${loading ? 'opacity-50' : ''}`}>
          {/* Top 5 Gainers */}
          <div className="bg-bg-card rounded-xl border border-gold-primary/10 overflow-hidden">
            <div className="px-5 py-3 border-b border-gold-primary/10 flex items-center gap-2">
              <span>🏆</span>
              <h3 className="text-gold-primary font-semibold text-sm uppercase tracking-wider">Top Gainers by LuxQuant Algorithm Call</h3>
            </div>
            <div className="p-3 space-y-2">
              {data.top_gainers?.map((item, idx) => (
                <div key={idx} onClick={() => handleItemClick(item)}
                  className="flex items-center justify-between px-4 py-3 bg-bg-primary/40 rounded-lg border border-green-500/10 hover:border-green-500/30 hover:bg-bg-primary/60 transition-all cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <span className="text-gold-primary font-mono text-xs w-5">#{idx + 1}</span>
                    <span className="text-white font-semibold text-sm group-hover:text-gold-primary transition-colors">{cleanPair(item.pair)}</span>
                    {item.tp_level && (
                      <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-bold rounded">{item.tp_level}</span>
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
              <h3 className="text-gold-primary font-semibold text-sm uppercase tracking-wider">Fastest Hits by LuxQuant Algorithm Call</h3>
            </div>
            <div className="p-3 space-y-2">
              {data.fastest_hits?.map((item, idx) => (
                <div key={idx} onClick={() => handleItemClick(item)}
                  className="flex items-center justify-between px-4 py-3 bg-bg-primary/40 rounded-lg border border-yellow-500/10 hover:border-yellow-500/30 hover:bg-bg-primary/60 transition-all cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <span className="text-gold-primary font-mono text-xs w-5">#{idx + 1}</span>
                    <span className="text-white font-semibold text-sm group-hover:text-gold-primary transition-colors">{cleanPair(item.pair)}</span>
                    {item.tp_level && (
                      <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold rounded">{item.tp_level}</span>
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

      {/* Signal Detail Modal */}
      {selectedSignal && (
        <SignalDetailModal
          signal={selectedSignal}
          detail={signalDetail}
          loading={detailLoading}
          onClose={closeModal}
          cleanPair={cleanPair}
        />
      )}
    </div>
  );
};

// ============================================
// Signal Detail Modal — Single column, chart top, info below
// ============================================
const SignalDetailModal = ({ signal, detail, loading, onClose, cleanPair }) => {
  const chartContainerRef = useRef(null);
  const pair = cleanPair(signal.pair || detail?.pair);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // TradingView
  useEffect(() => {
    if (!chartContainerRef.current || !pair) return;
    const containerId = 'tv-chart-top-perf-modal';
    chartContainerRef.current.innerHTML = `<div id="${containerId}" style="width:100%;height:100%"></div>`;
    const tvSymbol = `BINANCE:${pair.replace('USDT', '')}USDT.P`;

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (window.TradingView && document.getElementById(containerId)) {
        new window.TradingView.widget({
          container_id: containerId,
          autosize: true,
          symbol: tvSymbol,
          interval: '60',
          timezone: 'Asia/Jakarta',
          theme: 'dark',
          style: '1',
          locale: 'en',
          toolbar_bg: '#0a0a0f',
          enable_publishing: false,
          hide_side_toolbar: false,
          allow_symbol_change: true,
          save_image: false,
          backgroundColor: '#0a0a0f',
          gridColor: 'rgba(212, 175, 55, 0.05)',
          studies: ['MASimple@tv-basicstudies'],
        });
      }
    };
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, [pair]);

  const formatDateTime = (ts) => {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
      });
    } catch { return ts; }
  };

  const formatTimeDiff = (fromTs, toTs) => {
    if (!fromTs || !toTs) return '—';
    try {
      const diff = (new Date(toTs) - new Date(fromTs)) / 1000;
      if (diff <= 0) return '< 1m';
      const d = Math.floor(diff / 86400);
      const h = Math.floor((diff % 86400) / 3600);
      const m = Math.floor((diff % 3600) / 60);
      if (d > 0) return `${d}d ${h}h ${m}m`;
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    } catch { return '—'; }
  };

  const getStatusLabel = (s) => ({ closed_win: 'WIN', closed_loss: 'LOSS', tp1: 'TP1', tp2: 'TP2', tp3: 'TP3', open: 'OPEN' }[s] || s?.toUpperCase() || 'OPEN');
  const getStatusColor = (s) => (s === 'closed_win' || s?.startsWith('tp')) ? 'bg-green-500/20 text-green-400' : s === 'closed_loss' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400';

  const tpColors = {
    tp1: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-400' },
    tp2: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30', dot: 'bg-cyan-400' },
    tp3: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30', dot: 'bg-purple-400' },
    tp4: { bg: 'bg-green-500/15', text: 'text-green-400', border: 'border-green-500/30', dot: 'bg-green-400' },
    sl: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', dot: 'bg-red-400' },
  };

  const signalCreatedAt = detail?.created_at || signal.signal_time;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center" style={{ paddingTop: '90px' }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal — below navbar, scrollable */}
      <div className="relative w-full max-w-4xl mx-4 bg-bg-primary border border-gold-primary/20 rounded-2xl overflow-hidden shadow-2xl shadow-black/60"
           style={{ maxHeight: 'calc(100vh - 110px)' }}>

        {/* Sticky Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-gold-primary/15 bg-bg-primary/95 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-gradient-to-br from-gold-primary/30 to-gold-dark/30 rounded-lg flex items-center justify-center border border-gold-primary/20 flex-shrink-0">
              <span className="text-gold-primary font-display font-bold text-xs">{pair?.replace('USDT', '').slice(0, 4)}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-white font-display font-bold text-base">{pair}</h2>
                {detail?.status && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${getStatusColor(detail.status)}`}>
                    {getStatusLabel(detail.status)}
                  </span>
                )}
                {detail?.risk_level && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-gold-primary/30 text-gold-primary">
                    {detail.risk_level}
                  </span>
                )}
              </div>
              <p className="text-text-muted text-[11px] mt-0.5 truncate">
                Called {formatDateTime(signalCreatedAt)}
                {signal.gain_pct > 0 && <span className="text-green-400 ml-2">+{signal.gain_pct.toFixed(2)}% gain</span>}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-bg-card/80 border border-gold-primary/20 flex items-center justify-center text-text-muted hover:text-white hover:border-gold-primary/40 transition-colors flex-shrink-0 ml-3">
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 110px - 56px)' }}>

          {/* TradingView Chart */}
          <div ref={chartContainerRef} className="w-full h-[380px] bg-bg-primary border-b border-gold-primary/10" />

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin mx-auto mb-3" />
                <p className="text-text-muted text-sm">Loading signal details...</p>
              </div>
            </div>
          ) : detail ? (
            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">

                {/* Left: Hit Timeline */}
                {detail.updates && detail.updates.length > 0 && (
                  <div>
                    <h4 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-2.5">Hit Timeline</h4>
                    <div className="relative bg-bg-card/30 rounded-xl p-4 border border-gold-primary/5">
                      <div className="absolute left-[27px] top-6 bottom-6 w-px bg-gold-primary/10" />
                      <div className="space-y-3">
                        {/* Signal Called */}
                        <div className="flex items-start gap-3 relative">
                          <div className="w-[22px] h-[22px] rounded-full bg-gold-primary/20 border-2 border-gold-primary/40 flex items-center justify-center flex-shrink-0 z-10">
                            <div className="w-2 h-2 rounded-full bg-gold-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-gold-primary text-xs font-semibold">Signal Called</span>
                              <span className="text-text-muted text-[10px] font-mono bg-bg-primary/60 px-2 py-0.5 rounded">T+0</span>
                            </div>
                            <p className="text-text-muted text-[10px] mt-0.5">{formatDateTime(signalCreatedAt)}</p>
                            <p className="text-white text-[11px] font-mono mt-0.5">Entry @ ${formatPrice(detail.entry)}</p>
                          </div>
                        </div>

                        {detail.updates.map((update, idx) => {
                          const colors = tpColors[update.update_type] || tpColors.tp1;
                          const timeSinceCall = formatTimeDiff(signalCreatedAt, update.update_at);
                          const label = update.update_type?.toUpperCase().replace('TP', 'TP ');
                          const isSL = update.update_type === 'sl';
                          return (
                            <div key={idx} className="flex items-start gap-3 relative">
                              <div className={`w-[22px] h-[22px] rounded-full ${colors.bg} border-2 ${colors.border} flex items-center justify-center flex-shrink-0 z-10`}>
                                <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className={`text-xs font-semibold ${colors.text}`}>
                                    {isSL ? 'Stop Loss Hit' : `${label} Hit`}
                                  </span>
                                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${colors.bg} ${colors.text}`}>T+{timeSinceCall}</span>
                                </div>
                                <p className="text-text-muted text-[10px] mt-0.5">{formatDateTime(update.update_at)}</p>
                                {update.price > 0 && (
                                  <p className={`text-[11px] font-mono mt-0.5 ${colors.text}`}>
                                    ${formatPrice(update.price)}
                                    {!isSL && detail.entry > 0 && (
                                      <span className="text-green-400 ml-1.5">
                                        (+{((Math.abs(update.price - detail.entry) / detail.entry) * 100).toFixed(2)}%)
                                      </span>
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Right: Signal Info */}
                <div>
                  <h4 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-2.5">Signal Info</h4>
                  <div className="space-y-2 text-xs">
                    <div className="bg-bg-card/50 rounded-lg px-3 py-2.5 border border-gold-primary/5 flex items-center justify-between">
                      <span className="text-text-muted text-[10px] uppercase">Entry</span>
                      <span className="text-white font-mono font-bold">${formatPrice(detail.entry)}</span>
                    </div>
                    <div className="bg-bg-card/50 rounded-lg px-3 py-2.5 border border-gold-primary/5 flex items-center justify-between">
                      <span className="text-text-muted text-[10px] uppercase">Total Gain</span>
                      <span className="text-green-400 font-mono font-bold">+{signal.gain_pct?.toFixed(2) || '0'}%</span>
                    </div>
                    <div className="bg-bg-card/50 rounded-lg px-3 py-2.5 border border-gold-primary/5 flex items-center justify-between">
                      <span className="text-text-muted text-[10px] uppercase">Duration</span>
                      <span className="text-white font-mono">{signal.duration_display || formatDuration(signal.duration_seconds)}</span>
                    </div>
                    {detail.volume_rank_num != null && detail.volume_rank_den != null && (
                      <div className="bg-bg-card/50 rounded-lg px-3 py-2.5 border border-gold-primary/5 flex items-center justify-between">
                        <span className="text-text-muted text-[10px] uppercase">Volume Rank</span>
                        <span className="text-white font-mono">{detail.volume_rank_num}/{detail.volume_rank_den}</span>
                      </div>
                    )}
                    {detail.risk_level && (
                      <div className="bg-bg-card/50 rounded-lg px-3 py-2.5 border border-gold-primary/5 flex items-center justify-between">
                        <span className="text-text-muted text-[10px] uppercase">Risk Level</span>
                        <span className="text-gold-primary font-mono font-semibold">{detail.risk_level}</span>
                      </div>
                    )}
                    {detail.signal_id && (
                      <div className="bg-bg-card/50 rounded-lg px-3 py-2.5 border border-gold-primary/5 flex items-center justify-between">
                        <span className="text-text-muted text-[10px] uppercase">Signal ID</span>
                        <span className="text-white font-mono text-[11px]">{detail.signal_id.slice(0, 10)}...</span>
                      </div>
                    )}
                  </div>

                  {detail.message_link && (
                    <a href={detail.message_link} target="_blank" rel="noopener noreferrer"
                      className="mt-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors">
                      View on Telegram
                    </a>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-16">
              <p className="text-text-muted text-sm">Failed to load signal details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return 'N/A';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatPrice(price) {
  if (!price || price <= 0) return '0.00';
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(6);
  return price.toFixed(8);
}

export default TopPerformers;