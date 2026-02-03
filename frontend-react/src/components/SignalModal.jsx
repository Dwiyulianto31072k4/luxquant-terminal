import { useEffect, useRef } from 'react';
import CoinLogo from './CoinLogo';

const SignalModal = ({ signal, isOpen, onClose }) => {
  const chartContainerRef = useRef(null);
  const widgetRef = useRef(null);

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

  // Initialize TradingView widget
  useEffect(() => {
    if (!isOpen || !signal || !chartContainerRef.current) return;

    // Clear previous widget
    if (chartContainerRef.current) {
      chartContainerRef.current.innerHTML = '';
    }

    // Get symbol for TradingView
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
          timezone: "Etc/UTC",
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
          details: true,
          hotlist: true,
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

  // Get coin symbol without USDT
  const getCoinSymbol = (pair) => {
    if (!pair) return '';
    return pair.replace(/USDT$/i, '').toUpperCase();
  };

  const coinSymbol = getCoinSymbol(signal.pair);

  // Calculate percentage from entry
  const calcPct = (target, entry) => {
    if (!target || !entry) return null;
    return ((target - entry) / entry * 100).toFixed(2);
  };

  // Get user's timezone
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Format date in user's local timezone
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      timeZone: userTimezone,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  // Determine which targets are hit based on status
  const getHitTargets = (status) => {
    const s = status?.toLowerCase() || '';
    if (s === 'closed_win' || s === 'tp4') return [true, true, true, true];
    if (s === 'tp3') return [true, true, true, false];
    if (s === 'tp2') return [true, true, false, false];
    if (s === 'tp1') return [true, false, false, false];
    return [false, false, false, false];
  };

  const hitTargets = getHitTargets(signal.status);
  const isStopped = signal.status?.toLowerCase() === 'closed_loss' || signal.status?.toLowerCase() === 'sl';

  // Targets and stops data
  const targets = [
    { label: 'TP1', value: signal.target1, pct: calcPct(signal.target1, signal.entry), hit: hitTargets[0] },
    { label: 'TP2', value: signal.target2, pct: calcPct(signal.target2, signal.entry), hit: hitTargets[1] },
    { label: 'TP3', value: signal.target3, pct: calcPct(signal.target3, signal.entry), hit: hitTargets[2] },
    { label: 'TP4', value: signal.target4, pct: calcPct(signal.target4, signal.entry), hit: hitTargets[3] },
  ].filter(t => t.value);

  const stops = [
    { label: 'SL1', value: signal.stop1, pct: calcPct(signal.stop1, signal.entry) },
    { label: 'SL2', value: signal.stop2, pct: calcPct(signal.stop2, signal.entry) },
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

  // External links
  const links = {
    tradingview: `https://www.tradingview.com/chart/?symbol=BINANCE:${signal.pair}.P`,
    twitter: `https://x.com/search?q=%24${coinSymbol}&src=typed_query`,
    coinglass: `https://www.coinglass.com/currencies/${coinSymbol}`,
    binance: `https://www.binance.com/en/futures/${signal.pair}`,
    dexscreener: `https://dexscreener.com/search?q=${coinSymbol}`,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-bg-primary border border-gold-primary/30 rounded-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-bg-primary/95 backdrop-blur border-b border-gold-primary/20 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <CoinLogo pair={signal.pair} size={48} />
            <div>
              <h2 className="text-2xl font-display font-bold text-white">{signal.pair}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase text-white ${getStatusStyle(signal.status)}`}>
                  {signal.status}
                </span>
                {signal.risk_level && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase border ${getRiskStyle(signal.risk_level)}`}>
                    {signal.risk_level}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="text-text-muted hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            
            {/* TradingView Chart */}
            <div className="lg:col-span-2 bg-bg-card rounded-xl border border-gold-primary/10 overflow-hidden">
              <div className="p-3 border-b border-gold-primary/10 flex items-center justify-between">
                <span className="text-white font-semibold">📈 Live Chart</span>
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
              <div 
                id="tradingview_modal_chart" 
                ref={chartContainerRef}
                style={{ height: '400px', width: '100%' }}
              />
            </div>

            {/* Right Panel - Entry & Progress Chain */}
            <div className="space-y-4">
              {/* Entry Price */}
              <div className="bg-bg-card rounded-xl p-4 border-2 border-gold-primary/30">
                <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Entry Price</p>
                <p className="text-3xl font-mono font-bold text-gold-primary">
                  {signal.entry?.toFixed(6)}
                </p>
                <p className="text-text-muted text-xs mt-1">{formatDate(signal.created_at)}</p>
              </div>

              {/* Progress Chain - TP Targets */}
              <div className="bg-bg-card rounded-xl p-4 border border-gold-primary/10">
                <p className="text-text-muted text-xs uppercase tracking-wider mb-4">🎯 Target Progress</p>
                
                <div className="relative">
                  {/* Chain line */}
                  <div className="absolute left-5 top-6 bottom-6 w-0.5 bg-gray-700"></div>
                  
                  {/* Targets */}
                  <div className="space-y-3">
                    {targets.map((t, i) => (
                      <div key={i} className="flex items-center gap-3 relative">
                        {/* Node */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold z-10 transition-all ${
                          t.hit 
                            ? 'bg-gradient-to-br from-green-400 to-green-600 text-white shadow-lg shadow-green-500/30' 
                            : 'bg-bg-primary border-2 border-gray-600 text-gray-500'
                        }`}>
                          {t.hit ? '✓' : i + 1}
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 flex items-center justify-between">
                          <div>
                            <span className={`text-sm font-semibold ${t.hit ? 'text-green-400' : 'text-text-secondary'}`}>
                              {t.label}
                            </span>
                            <p className={`font-mono text-sm ${t.hit ? 'text-white' : 'text-text-muted'}`}>
                              {t.value?.toFixed(6)}
                            </p>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${
                            t.hit 
                              ? 'bg-green-500/20 text-green-400' 
                              : 'bg-gray-700/50 text-text-muted'
                          }`}>
                            +{t.pct}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stop Loss */}
              <div className={`bg-bg-card rounded-xl p-4 border ${isStopped ? 'border-red-500/50' : 'border-red-500/20'}`}>
                <p className="text-text-muted text-xs uppercase tracking-wider mb-3">🛑 Stop Loss</p>
                <div className="space-y-2">
                  {stops.map((s, i) => (
                    <div key={i} className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                      isStopped ? 'bg-red-500/20' : 'bg-red-500/5'
                    }`}>
                      <div className="flex items-center gap-2">
                        {isStopped && <span className="text-red-400">✗</span>}
                        <span className="text-text-muted text-sm">{s.label}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-white text-sm">{s.value?.toFixed(6)}</span>
                        <span className="text-red-400 text-xs ml-2">{s.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Links - Research Tools */}
          <div className="mt-4 bg-bg-card rounded-xl p-4 border border-gold-primary/10">
            <p className="text-text-muted text-xs uppercase tracking-wider mb-3">🔍 Research & Analysis</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {/* TradingView */}
              <a 
                href={links.tradingview}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-3 bg-bg-primary hover:bg-white/5 rounded-lg border border-gold-primary/10 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">TV</span>
                </div>
                <div>
                  <p className="text-white text-sm font-medium group-hover:text-gold-primary transition-colors">TradingView</p>
                  <p className="text-text-muted text-xs">Chart</p>
                </div>
              </a>

              {/* X (Twitter) Sentiment */}
              <a 
                href={links.twitter}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-3 bg-bg-primary hover:bg-white/5 rounded-lg border border-gold-primary/10 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center border border-gray-700">
                  <span className="text-white text-sm font-bold">𝕏</span>
                </div>
                <div>
                  <p className="text-white text-sm font-medium group-hover:text-gold-primary transition-colors">X / Twitter</p>
                  <p className="text-text-muted text-xs">Sentiment</p>
                </div>
              </a>

              {/* CoinGlass */}
              <a 
                href={links.coinglass}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-3 bg-bg-primary hover:bg-white/5 rounded-lg border border-gold-primary/10 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">CG</span>
                </div>
                <div>
                  <p className="text-white text-sm font-medium group-hover:text-gold-primary transition-colors">CoinGlass</p>
                  <p className="text-text-muted text-xs">On-Chain</p>
                </div>
              </a>

              {/* Binance Futures */}
              <a 
                href={links.binance}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-3 bg-bg-primary hover:bg-white/5 rounded-lg border border-gold-primary/10 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center">
                  <span className="text-black text-xs font-bold">BN</span>
                </div>
                <div>
                  <p className="text-white text-sm font-medium group-hover:text-gold-primary transition-colors">Binance</p>
                  <p className="text-text-muted text-xs">Futures</p>
                </div>
              </a>

              {/* DEX Screener */}
              <a 
                href={links.dexscreener}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-3 bg-bg-primary hover:bg-white/5 rounded-lg border border-gold-primary/10 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">DX</span>
                </div>
                <div>
                  <p className="text-white text-sm font-medium group-hover:text-gold-primary transition-colors">DEX Screener</p>
                  <p className="text-text-muted text-xs">DEX Data</p>
                </div>
              </a>
            </div>
          </div>

          {/* Bottom Info */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Volume Rank */}
            {signal.volume_rank_num && signal.volume_rank_den && (
              <div className="bg-bg-card rounded-xl p-4 border border-gold-primary/10">
                <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Volume Rank</p>
                <p className="text-xl font-display font-bold text-white">
                  {signal.volume_rank_num}
                  <span className="text-text-muted">/{signal.volume_rank_den}</span>
                </p>
              </div>
            )}

            {/* Signal Time */}
            <div className="bg-bg-card rounded-xl p-4 border border-gold-primary/10">
              <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Signal Called</p>
              <p className="text-white font-mono text-sm">{formatDate(signal.created_at)}</p>
            </div>

            {/* Telegram Link */}
            {signal.message_link && (
              <div className="bg-bg-card rounded-xl p-4 border border-gold-primary/10 flex items-center justify-between">
                <div>
                  <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Source</p>
                  <p className="text-white text-sm">Telegram</p>
                </div>
                <a 
                  href={signal.message_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors text-sm flex items-center gap-2"
                >
                  View
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignalModal;