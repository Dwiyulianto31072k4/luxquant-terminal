import { useEffect, useRef, useState } from 'react';
import CoinLogo from './CoinLogo';

const SignalModal = ({ signal, isOpen, onClose }) => {
  const chartContainerRef = useRef(null);
  const widgetRef = useRef(null);
  const [signalDetail, setSignalDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Fetch signal detail with updates timeline
  useEffect(() => {
    if (!isOpen || !signal) return;
    
    const fetchDetail = async () => {
      setLoadingDetail(true);
      try {
        const response = await fetch(`/api/v1/signals/detail/${signal.signal_id}`);
        if (response.ok) {
          const data = await response.json();
          setSignalDetail(data);
        }
      } catch (error) {
        console.error('Failed to fetch signal detail:', error);
      } finally {
        setLoadingDetail(false);
      }
    };
    
    fetchDetail();
  }, [isOpen, signal]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Get user's timezone for TradingView
  const getUserTimezone = () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || 'Etc/UTC';
  };

  // Initialize TradingView widget
  useEffect(() => {
    if (!isOpen || !signal || !chartContainerRef.current) return;

    if (chartContainerRef.current) {
      chartContainerRef.current.innerHTML = '';
    }

    const symbol = `BINANCE:${signal.pair}.P`;

    const loadTradingView = () => {
      if (window.TradingView) {
        createWidget(symbol);
      } else {
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/tv.js';
        script.async = true;
        script.onload = () => createWidget(symbol);
        document.head.appendChild(script);
      }
    };

    const createWidget = (sym) => {
      if (!chartContainerRef.current) return;
      
      try {
        widgetRef.current = new window.TradingView.widget({
          autosize: true,
          symbol: sym,
          interval: "60",
          timezone: getUserTimezone(),
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#0a0506",
          enable_publishing: false,
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: false,
          container_id: "tradingview_modal_chart",
          backgroundColor: "rgba(10, 5, 6, 1)",
          gridColor: "rgba(212, 168, 83, 0.06)",
          hide_side_toolbar: false,
          allow_symbol_change: true,
          details: false,
          hotlist: false,
          calendar: false,
          studies: ["MASimple@tv-basicstudies"],
          show_popup_button: true,
          popup_width: "1000",
          popup_height: "650",
        });
      } catch (e) {
        console.error('TradingView widget error:', e);
      }
    };

    const timer = setTimeout(loadTradingView, 100);

    return () => {
      clearTimeout(timer);
      if (widgetRef.current) {
        widgetRef.current = null;
      }
    };
  }, [isOpen, signal]);

  if (!isOpen || !signal) return null;

  const getCoinSymbol = (pair) => {
    if (!pair) return '';
    return pair.replace(/USDT$/i, '').toUpperCase();
  };

  const coinSymbol = getCoinSymbol(signal.pair);

  const calcPct = (target, entry) => {
    if (!target || !entry) return null;
    return ((target - entry) / entry * 100).toFixed(2);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const formatShortDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const formatPrice = (price) => {
    if (!price) return '-';
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    if (price < 100) return price.toFixed(4);
    return price.toFixed(2);
  };

  // Get update info for each TP/SL from signalDetail
  const getUpdateInfo = (type) => {
    if (!signalDetail?.updates) return null;
    return signalDetail.updates.find(u => u.update_type === type);
  };

  // Determine which targets are hit based on status AND updates
  const getHitTargets = () => {
    const s = signal.status?.toLowerCase() || '';
    const updates = signalDetail?.updates || [];
    
    // Check from updates
    const hasTP1 = updates.some(u => u.update_type === 'tp1');
    const hasTP2 = updates.some(u => u.update_type === 'tp2');
    const hasTP3 = updates.some(u => u.update_type === 'tp3');
    const hasTP4 = updates.some(u => u.update_type === 'tp4');
    
    // Fallback to status if no updates
    if (updates.length === 0) {
      if (s === 'closed_win' || s === 'tp4') return [true, true, true, true];
      if (s === 'tp3') return [true, true, true, false];
      if (s === 'tp2') return [true, true, false, false];
      if (s === 'tp1') return [true, false, false, false];
      return [false, false, false, false];
    }
    
    return [hasTP1 || hasTP2 || hasTP3 || hasTP4, hasTP2 || hasTP3 || hasTP4, hasTP3 || hasTP4, hasTP4];
  };

  const hitTargets = getHitTargets();
  const isStopped = signal.status?.toLowerCase() === 'closed_loss' || signal.status?.toLowerCase() === 'sl';
  const slUpdate = getUpdateInfo('sl');

  // Targets data with reached time
  const targets = [
    { label: 'TP1', value: signal.target1, pct: calcPct(signal.target1, signal.entry), hit: hitTargets[0], reachedAt: getUpdateInfo('tp1')?.update_at },
    { label: 'TP2', value: signal.target2, pct: calcPct(signal.target2, signal.entry), hit: hitTargets[1], reachedAt: getUpdateInfo('tp2')?.update_at },
    { label: 'TP3', value: signal.target3, pct: calcPct(signal.target3, signal.entry), hit: hitTargets[2], reachedAt: getUpdateInfo('tp3')?.update_at },
    { label: 'TP4', value: signal.target4, pct: calcPct(signal.target4, signal.entry), hit: hitTargets[3], reachedAt: getUpdateInfo('tp4')?.update_at },
  ].filter(t => t.value);

  const stops = [
    { label: 'SL1', value: signal.stop1, pct: calcPct(signal.stop1, signal.entry), hit: isStopped, reachedAt: slUpdate?.update_at },
    { label: 'SL2', value: signal.stop2, pct: calcPct(signal.stop2, signal.entry), hit: false },
  ].filter(s => s.value);

  const getStatusStyle = (status) => {
    const styles = {
      'open': 'bg-cyan-500',
      'tp1': 'bg-green-500',
      'tp2': 'bg-lime-500',
      'tp3': 'bg-yellow-500',
      'tp4': 'bg-orange-500',
      'closed_win': 'bg-green-600',
      'closed_loss': 'bg-red-500',
      'sl': 'bg-red-500'
    };
    return styles[status?.toLowerCase()] || 'bg-gray-500';
  };

  const getRiskStyle = (risk) => {
    const styles = {
      'low': 'text-green-400 bg-green-400/10 border-green-400/30',
      'med': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
      'medium': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
      'high': 'text-red-400 bg-red-400/10 border-red-400/30'
    };
    return styles[risk?.toLowerCase()] || 'text-gray-400 bg-gray-400/10 border-gray-400/30';
  };

  const links = {
    tradingview: `https://www.tradingview.com/chart/?symbol=BINANCE:${signal.pair}.P`,
    twitter: `https://x.com/search?q=%24${coinSymbol}&src=typed_query`,
    coinglass: `https://www.coinglass.com/currencies/${coinSymbol}`,
    binance: `https://www.binance.com/en/futures/${signal.pair}`,
    velo: `https://velo.xyz/chart?symbol=${coinSymbol}`,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-bg-primary border border-gold-primary/30 rounded-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto shadow-2xl">
        {/* Header - Compact */}
        <div className="sticky top-0 bg-bg-primary/95 backdrop-blur border-b border-gold-primary/20 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <CoinLogo pair={signal.pair} size={40} />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-display font-bold text-white">{signal.pair}</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase text-white ${getStatusStyle(signal.status)}`}>
                  {signal.status}
                </span>
              </div>
              <p className="text-text-muted text-xs">Called at {formatDate(signal.created_at)}</p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="text-text-muted hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content - Side by Side */}
        <div className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* Left: Chart - Full Height */}
            <div className="lg:col-span-8 bg-bg-card rounded-xl border border-gold-primary/10 overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b border-gold-primary/10 flex items-center justify-between flex-shrink-0">
                <span className="text-white text-sm font-semibold flex items-center gap-2">
                  <span>📈</span> Live Chart
                  <span className="text-text-muted text-xs font-normal">({getUserTimezone()})</span>
                </span>
                <a 
                  href={links.tradingview}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gold-primary hover:text-gold-light flex items-center gap-1"
                >
                  Open in TradingView
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
              {/* Chart container - dynamic height to match right panel */}
              <div 
                id="tradingview_modal_chart" 
                ref={chartContainerRef}
                className="flex-1 min-h-[500px]"
              />
            </div>

            {/* Right Panel */}
            <div className="lg:col-span-4 flex flex-col gap-3">
              
              {/* Entry Price + Called Time */}
              <div className="bg-gradient-to-br from-gold-primary/20 to-gold-primary/5 rounded-xl p-4 border border-gold-primary/30">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-gold-primary/70 text-xs uppercase tracking-wider">Entry Price</p>
                  {signal.risk_level && (
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase border ${getRiskStyle(signal.risk_level)}`}>
                      {signal.risk_level}
                    </span>
                  )}
                </div>
                <p className="text-3xl font-mono font-bold text-gold-primary">
                  {formatPrice(signal.entry)}
                </p>
                <p className="text-text-muted text-xs mt-2 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {formatDate(signal.created_at)}
                </p>
              </div>

              {/* Target Progress - Chain Style */}
              <div className="bg-bg-card rounded-xl p-4 border border-gold-primary/10 flex-1">
                <p className="text-text-muted text-xs uppercase tracking-wider mb-3 flex items-center gap-1">
                  <span>🎯</span> Target Progress
                </p>
                
                {/* Chain Timeline */}
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-700 z-0"></div>
                  
                  <div className="space-y-2 relative z-10">
                    {targets.map((t, i) => (
                      <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg transition-all ${
                        t.hit ? 'bg-green-500/10' : 'bg-bg-primary/30'
                      }`}>
                        {/* Circle Node */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          t.hit 
                            ? 'bg-gradient-to-br from-green-400 to-green-600 text-white shadow-lg shadow-green-500/30' 
                            : 'bg-gray-800 border-2 border-gray-600 text-gray-500'
                        }`}>
                          {t.hit ? '✓' : i + 1}
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-semibold ${t.hit ? 'text-green-400' : 'text-text-secondary'}`}>
                              {t.label}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              t.hit ? 'bg-green-500/20 text-green-400' : 'bg-green-500/10 text-green-400/60'
                            }`}>
                              +{t.pct}%
                            </span>
                          </div>
                          <p className={`font-mono text-sm ${t.hit ? 'text-white' : 'text-text-muted'}`}>
                            {formatPrice(t.value)}
                          </p>
                          {/* Reached time */}
                          {t.hit && t.reachedAt && (
                            <p className="text-green-400/70 text-xs mt-0.5 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Reached {formatShortDate(t.reachedAt)}
                            </p>
                          )}
                          {t.hit && !t.reachedAt && (
                            <p className="text-green-400/50 text-xs mt-0.5">✓ Reached</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stop Loss - Chain Style */}
              <div className={`bg-bg-card rounded-xl p-4 border ${isStopped ? 'border-red-500/50 bg-red-500/5' : 'border-red-500/20'}`}>
                <p className="text-text-muted text-xs uppercase tracking-wider mb-3 flex items-center gap-1">
                  <span>🛑</span> Stop Loss
                </p>
                
                <div className="relative">
                  {/* Vertical line */}
                  {stops.length > 1 && (
                    <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-red-900/50 z-0"></div>
                  )}
                  
                  <div className="space-y-2 relative z-10">
                    {stops.map((s, i) => (
                      <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg ${
                        s.hit ? 'bg-red-500/20' : 'bg-red-500/5'
                      }`}>
                        {/* Circle Node */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          s.hit 
                            ? 'bg-gradient-to-br from-red-400 to-red-600 text-white shadow-lg shadow-red-500/30' 
                            : 'bg-gray-800 border-2 border-red-900/50 text-red-400/50'
                        }`}>
                          {s.hit ? '✗' : i + 1}
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-semibold ${s.hit ? 'text-red-400' : 'text-text-muted'}`}>
                              {s.label}
                            </span>
                            <span className="text-xs text-red-400">{s.pct}%</span>
                          </div>
                          <p className={`font-mono text-sm ${s.hit ? 'text-white' : 'text-text-muted'}`}>
                            {formatPrice(s.value)}
                          </p>
                          {/* Hit time */}
                          {s.hit && s.reachedAt && (
                            <p className="text-red-400/70 text-xs mt-0.5 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              Hit {formatShortDate(s.reachedAt)}
                            </p>
                          )}
                          {s.hit && !s.reachedAt && (
                            <p className="text-red-400/50 text-xs mt-0.5">✗ Stop Loss Hit</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Volume Rank */}
              {signal.volume_rank_num && signal.volume_rank_den && (
                <div className="bg-bg-card rounded-xl p-4 border border-gold-primary/10">
                  <p className="text-text-muted text-xs uppercase tracking-wider mb-1 flex items-center gap-1">
                    <span>📊</span> Volume Rank
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-white">#{signal.volume_rank_num}</span>
                    <span className="text-text-muted text-sm">/ {signal.volume_rank_den}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Research Links */}
          <div className="mt-4 bg-bg-card rounded-xl p-3 border border-gold-primary/10">
            <p className="text-text-muted text-xs uppercase tracking-wider mb-2">🔍 Research & Analysis</p>
            <div className="flex flex-wrap gap-2">
              <a href={links.tradingview} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-bg-primary hover:bg-white/5 rounded-lg border border-gold-primary/10 transition-all group">
                <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">TV</span>
                </div>
                <span className="text-white text-sm group-hover:text-gold-primary transition-colors">TradingView</span>
              </a>

              <a href={links.twitter} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-bg-primary hover:bg-white/5 rounded-lg border border-gold-primary/10 transition-all group">
                <div className="w-6 h-6 rounded bg-black flex items-center justify-center">
                  <span className="text-white text-xs font-bold">𝕏</span>
                </div>
                <span className="text-white text-sm group-hover:text-gold-primary transition-colors">X / Twitter</span>
              </a>

              <a href={links.coinglass} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-bg-primary hover:bg-white/5 rounded-lg border border-gold-primary/10 transition-all group">
                <div className="w-6 h-6 rounded bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">CG</span>
                </div>
                <span className="text-white text-sm group-hover:text-gold-primary transition-colors">CoinGlass</span>
              </a>

              <a href={links.binance} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-bg-primary hover:bg-white/5 rounded-lg border border-gold-primary/10 transition-all group">
                <div className="w-6 h-6 rounded bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center">
                  <span className="text-black text-xs font-bold">BN</span>
                </div>
                <span className="text-white text-sm group-hover:text-gold-primary transition-colors">Binance</span>
              </a>

              <a href={links.velo} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-bg-primary hover:bg-white/5 rounded-lg border border-gold-primary/10 transition-all group">
                <div className="w-6 h-6 rounded bg-gradient-to-br from-cyan-400 to-teal-600 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">V</span>
                </div>
                <span className="text-white text-sm group-hover:text-gold-primary transition-colors">Velo</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignalModal;