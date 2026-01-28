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

    // Get symbol for TradingView (e.g., BTCUSDT -> BINANCE:BTCUSDT.P for Perpetual Futures)
    const symbol = `BINANCE:${signal.pair}.P`;

    // Load TradingView script if not already loaded
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
          studies: [
            "MASimple@tv-basicstudies"
          ]
        });
      } catch (e) {
        console.error('TradingView widget error:', e);
      }
    };

    // Small delay to ensure container is ready
    const timer = setTimeout(loadTradingView, 100);

    return () => {
      clearTimeout(timer);
      if (widgetRef.current) {
        widgetRef.current = null;
      }
    };
  }, [isOpen, signal]);

  if (!isOpen || !signal) return null;

  // Calculate percentage from entry
  const calcPct = (target, entry) => {
    if (!target || !entry) return null;
    return ((target - entry) / entry * 100).toFixed(2);
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const targets = [
    { label: 'TP1', value: signal.target1, pct: calcPct(signal.target1, signal.entry) },
    { label: 'TP2', value: signal.target2, pct: calcPct(signal.target2, signal.entry) },
    { label: 'TP3', value: signal.target3, pct: calcPct(signal.target3, signal.entry) },
    { label: 'TP4', value: signal.target4, pct: calcPct(signal.target4, signal.entry) },
  ].filter(t => t.value);

  const stops = [
    { label: 'SL1', value: signal.stop1, pct: calcPct(signal.stop1, signal.entry) },
    { label: 'SL2', value: signal.stop2, pct: calcPct(signal.stop2, signal.entry) },
  ].filter(s => s.value);

  const getStatusStyle = (status) => {
    const styles = {
      'open': 'bg-status-open',
      'tp1': 'bg-green-500',
      'tp2': 'bg-lime-500',
      'tp3': 'bg-yellow-500',
      'tp4': 'bg-orange-500',
      'closed_win': 'bg-status-profit',
      'closed_loss': 'bg-status-loss',
      'sl': 'bg-status-loss'
    };
    return styles[status?.toLowerCase()] || 'bg-gray-500';
  };

  const getRiskStyle = (risk) => {
    const styles = {
      'low': 'text-green-400 bg-green-400/10',
      'med': 'text-yellow-400 bg-yellow-400/10',
      'medium': 'text-yellow-400 bg-yellow-400/10',
      'high': 'text-red-400 bg-red-400/10'
    };
    return styles[risk?.toLowerCase()] || 'text-gray-400 bg-gray-400/10';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-bg-primary border border-gold-primary/30 rounded-2xl w-full max-w-5xl max-h-[95vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-bg-primary border-b border-gold-primary/20 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <CoinLogo pair={signal.pair} size={48} />
            <div>
              <h2 className="text-2xl font-display font-bold text-white">{signal.pair}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase text-white ${getStatusStyle(signal.status)}`}>
                  {signal.status}
                </span>
                {signal.risk_level && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${getRiskStyle(signal.risk_level)}`}>
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
          {/* Main Grid: Chart + Info */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            
            {/* TradingView Chart - Takes 2 columns */}
            <div className="lg:col-span-2 bg-bg-card rounded-xl border border-gold-primary/10 overflow-hidden">
              <div className="p-3 border-b border-gold-primary/10 flex items-center justify-between">
                <span className="text-white font-semibold">📈 Live Chart</span>
                <span className="text-text-muted text-xs">TradingView</span>
              </div>
              <div 
                id="tradingview_modal_chart" 
                ref={chartContainerRef}
                style={{ height: '400px', width: '100%' }}
              />
            </div>

            {/* Right Side: Entry & Targets */}
            <div className="space-y-4">
              {/* Entry Price */}
              <div className="bg-bg-card rounded-xl p-4 border border-gold-primary/10">
                <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Entry Price</p>
                <p className="text-2xl font-mono font-bold text-gold-primary">
                  {signal.entry?.toFixed(6)}
                </p>
              </div>

              {/* Targets */}
              <div className="bg-bg-card rounded-xl p-4 border border-gold-primary/10">
                <p className="text-text-muted text-xs uppercase tracking-wider mb-3">🎯 Take Profit</p>
                <div className="space-y-2">
                  {targets.map((t, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gold-primary/5 last:border-0">
                      <span className="text-text-muted text-sm">{t.label}</span>
                      <div className="text-right">
                        <span className="font-mono text-white text-sm">{t.value?.toFixed(6)}</span>
                        <span className="text-status-profit text-xs ml-2">+{t.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stop Loss */}
              <div className="bg-bg-card rounded-xl p-4 border border-red-500/20">
                <p className="text-text-muted text-xs uppercase tracking-wider mb-3">🛑 Stop Loss</p>
                <div className="space-y-2">
                  {stops.map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-red-500/10 last:border-0">
                      <span className="text-text-muted text-sm">{s.label}</span>
                      <div className="text-right">
                        <span className="font-mono text-white text-sm">{s.value?.toFixed(6)}</span>
                        <span className="text-status-loss text-xs ml-2">{s.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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

            {/* View Original */}
            {signal.message_link && (
              <div className="bg-bg-card rounded-xl p-4 border border-gold-primary/10 flex items-center justify-between">
                <div>
                  <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Source</p>
                  <p className="text-white text-sm">Telegram Channel</p>
                </div>
                <a 
                  href={signal.message_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-gold-primary/10 hover:bg-gold-primary/20 text-gold-primary rounded-lg transition-colors text-sm flex items-center gap-2"
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