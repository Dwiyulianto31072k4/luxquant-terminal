import { useEffect, useRef, useState } from 'react';
import CoinLogo from './CoinLogo';

const SignalModal = ({ signal, isOpen, onClose }) => {
  const chartContainerRef = useRef(null);
  const widgetRef = useRef(null);
  const [signalDetail, setSignalDetail] = useState(null);
  const [activeTab, setActiveTab] = useState('chart');

  // Fetch signal detail
  useEffect(() => {
    if (!isOpen || !signal) return;
    
    const fetchDetail = async () => {
      try {
        const response = await fetch(`/api/v1/signals/detail/${signal.signal_id}`);
        if (response.ok) {
          const data = await response.json();
          setSignalDetail(data);
        }
      } catch (error) {
        console.error('Failed to fetch signal detail:', error);
      }
    };
    
    fetchDetail();
  }, [isOpen, signal]);

  // Close on escape
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

  // Get user timezone for global users
  const getUserTimezone = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'Etc/UTC';
    }
  };

  // TradingView Widget - menggunakan Advanced Chart embed widget dengan fitur lengkap
  useEffect(() => {
    if (!isOpen || !signal || !chartContainerRef.current || activeTab !== 'chart') return;

    // Clear container
    chartContainerRef.current.innerHTML = '';
    
    const symbol = `BINANCE:${signal.pair}.P`;
    
    // Create widget container structure
    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container';
    widgetContainer.style.cssText = 'height:100%;width:100%';
    
    const widgetInner = document.createElement('div');
    widgetInner.className = 'tradingview-widget-container__widget';
    widgetInner.style.cssText = 'height:100%;width:100%';
    widgetInner.id = 'tradingview_chart_widget';
    
    widgetContainer.appendChild(widgetInner);
    chartContainerRef.current.appendChild(widgetContainer);

    // Create and configure the script
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: symbol,
      interval: "60",
      timezone: getUserTimezone(),
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(13, 13, 13, 1)",
      gridColor: "rgba(212, 168, 83, 0.06)",
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      save_image: true,
      calendar: false,
      hide_volume: false,
      withdateranges: true,
      details: true,
      hotlist: false,
      studies: [
        "STD;SMA"
      ],
      support_host: "https://www.tradingview.com"
    });
    
    widgetContainer.appendChild(script);

    return () => {
      if (chartContainerRef.current) {
        chartContainerRef.current.innerHTML = '';
      }
    };
  }, [isOpen, signal, activeTab]);

  if (!isOpen || !signal) return null;

  // Helpers
  const getCoinSymbol = (pair) => pair?.replace(/USDT$/i, '').toUpperCase() || '';
  const coinSymbol = getCoinSymbol(signal.pair);
  const coinSymbolLower = coinSymbol.toLowerCase();
  
  const calcPct = (target, entry) => {
    if (!target || !entry) return null;
    return ((target - entry) / entry * 100).toFixed(2);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  };

  const formatShortDateTime = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  };

  const formatPrice = (price) => {
    if (!price) return '-';
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    return price < 100 ? price.toFixed(4) : price.toFixed(2);
  };

  const getUpdateInfo = (type) => signalDetail?.updates?.find(u => u.update_type === type) || null;

  const getHitTargets = () => {
    const s = signal.status?.toLowerCase() || '';
    const updates = signalDetail?.updates || [];
    
    const has = (tp) => updates.some(u => u.update_type === tp);
    
    if (updates.length === 0) {
      if (s === 'closed_win' || s === 'tp4') return [true, true, true, true];
      if (s === 'tp3') return [true, true, true, false];
      if (s === 'tp2') return [true, true, false, false];
      if (s === 'tp1') return [true, false, false, false];
      return [false, false, false, false];
    }
    
    return [
      has('tp1') || has('tp2') || has('tp3') || has('tp4'),
      has('tp2') || has('tp3') || has('tp4'),
      has('tp3') || has('tp4'),
      has('tp4')
    ];
  };

  const hitTargets = getHitTargets();
  const isStopped = ['closed_loss', 'sl'].includes(signal.status?.toLowerCase());

  const targets = [
    { label: 'TP1', value: signal.target1, pct: calcPct(signal.target1, signal.entry), hit: hitTargets[0], reachedAt: getUpdateInfo('tp1')?.update_at },
    { label: 'TP2', value: signal.target2, pct: calcPct(signal.target2, signal.entry), hit: hitTargets[1], reachedAt: getUpdateInfo('tp2')?.update_at },
    { label: 'TP3', value: signal.target3, pct: calcPct(signal.target3, signal.entry), hit: hitTargets[2], reachedAt: getUpdateInfo('tp3')?.update_at },
    { label: 'TP4', value: signal.target4, pct: calcPct(signal.target4, signal.entry), hit: hitTargets[3], reachedAt: getUpdateInfo('tp4')?.update_at },
  ].filter(t => t.value);

  // Stop Loss dengan 2 level
  const stops = [
    { label: 'SL1', value: signal.stop1, pct: calcPct(signal.stop1, signal.entry), hit: isStopped, reachedAt: getUpdateInfo('sl')?.update_at || getUpdateInfo('sl1')?.update_at },
    { label: 'SL2', value: signal.stop2, pct: calcPct(signal.stop2, signal.entry), hit: false, reachedAt: getUpdateInfo('sl2')?.update_at },
  ].filter(s => s.value);

  const statusStyles = {
    'open': 'bg-cyan-500', 'tp1': 'bg-green-500', 'tp2': 'bg-lime-500',
    'tp3': 'bg-yellow-500', 'tp4': 'bg-orange-500', 'closed_win': 'bg-green-600',
    'closed_loss': 'bg-red-500', 'sl': 'bg-red-500'
  };

  const riskStyles = {
    'low': 'text-green-400 bg-green-400/10 border-green-400/30',
    'med': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
    'medium': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
    'high': 'text-red-400 bg-red-400/10 border-red-400/30'
  };

  // Research links - Analytics & Data
  const researchLinks = [
    { 
      name: 'TradingView', 
      url: `https://www.tradingview.com/chart/?symbol=BINANCE:${signal.pair}.P`,
      logo: 'https://static.tradingview.com/static/images/logo-preview.png',
      fallbackLogo: 'https://www.google.com/s2/favicons?domain=tradingview.com&sz=64',
      color: 'from-blue-600/20 to-blue-800/10 border-blue-500/30 hover:border-blue-400'
    },
    { 
      name: 'CoinGlass', 
      url: `https://www.coinglass.com/currencies/${coinSymbol}`,
      logo: 'https://www.coinglass.com/favicon.svg',
      fallbackLogo: 'https://www.google.com/s2/favicons?domain=coinglass.com&sz=64',
      color: 'from-cyan-600/20 to-cyan-800/10 border-cyan-500/30 hover:border-cyan-400'
    },
    { 
      name: 'CoinGecko', 
      url: `https://www.coingecko.com/en/coins/${coinSymbolLower}`,
      logo: 'https://static.coingecko.com/s/thumbnail-007177f3eca19695592f0b8b0eabbdae282b54154e1be912285c9034ea6cbaf2.png',
      fallbackLogo: 'https://www.google.com/s2/favicons?domain=coingecko.com&sz=64',
      color: 'from-green-600/20 to-green-800/10 border-green-500/30 hover:border-green-400'
    },
    { 
      name: 'CoinMarketCap', 
      url: `https://coinmarketcap.com/currencies/${coinSymbolLower}/`,
      logo: 'https://s2.coinmarketcap.com/static/cloud/img/coinmarketcap_1.svg',
      fallbackLogo: 'https://www.google.com/s2/favicons?domain=coinmarketcap.com&sz=64',
      color: 'from-blue-500/20 to-blue-700/10 border-blue-400/30 hover:border-blue-300'
    },
    { 
      name: 'DexScreener', 
      url: `https://dexscreener.com/search?q=${coinSymbol}`,
      logo: 'https://dexscreener.com/favicon.png',
      fallbackLogo: 'https://www.google.com/s2/favicons?domain=dexscreener.com&sz=64',
      color: 'from-lime-600/20 to-lime-800/10 border-lime-500/30 hover:border-lime-400'
    },
  ];

  // Sentiment link - Twitter/X
  const sentimentLinks = [
    { 
      name: 'Twitter / X', 
      url: `https://x.com/search?q=%24${coinSymbol}&src=typed_query&f=live`,
      logo: 'https://abs.twimg.com/favicons/twitter.3.ico',
      fallbackLogo: 'https://www.google.com/s2/favicons?domain=x.com&sz=64',
      color: 'from-gray-600/20 to-gray-800/10 border-gray-500/30 hover:border-gray-400',
      description: 'Live sentiment & discussions'
    },
  ];

  // Trade links - Exchanges
  const tradeLinks = [
    { 
      name: 'Binance Futures', 
      url: `https://www.binance.com/en/futures/${signal.pair}`,
      logo: 'https://public.bnbstatic.com/static/images/common/favicon.ico',
      fallbackLogo: 'https://www.google.com/s2/favicons?domain=binance.com&sz=64',
      color: 'from-yellow-500/20 to-yellow-700/10 border-yellow-500/30 hover:border-yellow-400',
      description: 'Trade USDT-M Perpetual'
    },
    { 
      name: 'Bybit', 
      url: `https://www.bybit.com/trade/usdt/${coinSymbol}USDT`,
      logo: 'https://www.bybit.com/favicon.ico',
      fallbackLogo: 'https://www.google.com/s2/favicons?domain=bybit.com&sz=64',
      color: 'from-orange-500/20 to-orange-700/10 border-orange-500/30 hover:border-orange-400',
      description: 'Trade USDT Perpetual'
    },
    { 
      name: 'OKX', 
      url: `https://www.okx.com/trade-swap/${coinSymbolLower}-usdt-swap`,
      logo: 'https://static.okx.com/cdn/assets/imgs/226/DF679CE5D9C03767.png',
      fallbackLogo: 'https://www.google.com/s2/favicons?domain=okx.com&sz=64',
      color: 'from-white/10 to-gray-700/10 border-white/20 hover:border-white/40',
      description: 'Trade USDT Swap'
    },
    { 
      name: 'Bitget', 
      url: `https://www.bitget.com/futures/usdt/${coinSymbol}USDT`,
      logo: 'https://img.bitgetimg.com/image/third/1702472462805.png',
      fallbackLogo: 'https://www.google.com/s2/favicons?domain=bitget.com&sz=64',
      color: 'from-cyan-500/20 to-cyan-700/10 border-cyan-500/30 hover:border-cyan-400',
      description: 'Trade USDT-M Futures'
    },
    { 
      name: 'MEXC', 
      url: `https://www.mexc.com/futures/${coinSymbol}_USDT`,
      logo: 'https://www.mexc.com/favicon.ico',
      fallbackLogo: 'https://www.google.com/s2/favicons?domain=mexc.com&sz=64',
      color: 'from-blue-500/20 to-blue-700/10 border-blue-500/30 hover:border-blue-400',
      description: 'Trade USDT-M Futures'
    },
    { 
      name: 'Gate.io', 
      url: `https://www.gate.io/futures_trade/USDT/${coinSymbol}_USDT`,
      logo: 'https://www.gate.io/favicon.ico',
      fallbackLogo: 'https://www.google.com/s2/favicons?domain=gate.io&sz=64',
      color: 'from-blue-400/20 to-blue-600/10 border-blue-400/30 hover:border-blue-300',
      description: 'Trade USDT Perpetual'
    },
    { 
      name: 'KuCoin', 
      url: `https://www.kucoin.com/futures/trade/${coinSymbol}USDTM`,
      logo: 'https://www.kucoin.com/favicon.ico',
      fallbackLogo: 'https://www.google.com/s2/favicons?domain=kucoin.com&sz=64',
      color: 'from-green-500/20 to-green-700/10 border-green-500/30 hover:border-green-400',
      description: 'Trade USDT-M Futures'
    },
    { 
      name: 'BingX', 
      url: `https://bingx.com/en-us/perpetual/${coinSymbol}-USDT/`,
      logo: 'https://bin.bingx.com/image/favicon.ico',
      fallbackLogo: 'https://www.google.com/s2/favicons?domain=bingx.com&sz=64',
      color: 'from-blue-600/20 to-blue-800/10 border-blue-600/30 hover:border-blue-500',
      description: 'Trade USDT Perpetual'
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div 
        className="relative bg-[#0d0d0d] rounded-xl border border-gold-primary/40 shadow-2xl shadow-gold-primary/10 flex flex-col overflow-hidden"
        style={{
          width: 'calc(100vw - 32px)',
          maxWidth: '1400px',
          height: 'calc(100vh - 100px)',
          maxHeight: '880px',
          marginTop: '50px'
        }}
      >
        
        {/* Corner Accents */}
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-gold-primary/40 rounded-tl-xl pointer-events-none" />
        <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-gold-primary/40 rounded-tr-xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-gold-primary/40 rounded-bl-xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-gold-primary/40 rounded-br-xl pointer-events-none" />

        {/* Header - Compact */}
        <div className="flex-shrink-0 bg-[#111111] border-b border-gold-primary/30 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CoinLogo pair={signal.pair} size={28} />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-display font-bold text-white">{signal.pair}</h2>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase text-white ${statusStyles[signal.status?.toLowerCase()] || 'bg-gray-500'}`}>
                  {signal.status}
                </span>
                {signal.risk_level && (
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${riskStyles[signal.risk_level?.toLowerCase()] || 'text-gray-400'}`}>
                    {signal.risk_level}
                  </span>
                )}
              </div>
              <p className="text-text-muted text-[10px]">{formatDate(signal.created_at)}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Tabs */}
            <div className="flex bg-[#0a0a0a] rounded-lg p-0.5 border border-gold-primary/20">
              <button
                onClick={() => setActiveTab('chart')}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold transition-all ${
                  activeTab === 'chart' 
                    ? 'bg-gold-primary text-black' 
                    : 'text-text-secondary hover:text-white hover:bg-white/5'
                }`}
              >
                📈 Chart
              </button>
              <button
                onClick={() => setActiveTab('trade')}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold transition-all ${
                  activeTab === 'trade' 
                    ? 'bg-gold-primary text-black' 
                    : 'text-text-secondary hover:text-white hover:bg-white/5'
                }`}
              >
                💹 Trade
              </button>
              <button
                onClick={() => setActiveTab('research')}
                className={`px-3 py-1.5 rounded text-[11px] font-semibold transition-all ${
                  activeTab === 'research' 
                    ? 'bg-gold-primary text-black' 
                    : 'text-text-secondary hover:text-white hover:bg-white/5'
                }`}
              >
                🔍 Research
              </button>
            </div>
            
            {/* Close Button */}
            <button 
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-white bg-[#0a0a0a] hover:bg-red-500/20 border border-gold-primary/20 hover:border-red-500/50 rounded-lg transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col">
          
          {/* ===== CHART TAB ===== */}
          {activeTab === 'chart' && (
            <>
              <div className="flex-1 min-h-0 flex">
                {/* Chart - Full width tanpa gray header */}
                <div className="flex-1 min-w-0 bg-[#0d0d0d]">
                  <div id="tv_chart_modal" ref={chartContainerRef} className="w-full h-full" />
                </div>

                {/* Right Sidebar */}
                <div className="w-52 flex-shrink-0 bg-[#0a0a0a] border-l border-gold-primary/20 overflow-y-auto custom-scrollbar">
                  <div className="p-2.5 space-y-2">
                    
                    {/* Entry Price + Called Date */}
                    <div className="bg-gradient-to-br from-gold-primary/15 to-gold-primary/5 rounded-lg p-2.5 border border-gold-primary/30">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-gold-primary/70 text-[9px] uppercase tracking-wider font-medium">Entry Price</p>
                        <p className="text-[9px] text-text-muted">Called</p>
                      </div>
                      <div className="flex items-end justify-between">
                        <p className="text-lg font-mono font-bold text-gold-primary">
                          {formatPrice(signal.entry)}
                        </p>
                        <p className="text-[10px] text-gold-primary/80">
                          {formatShortDateTime(signal.created_at)}
                        </p>
                      </div>
                    </div>

                    {/* Volume Rank when called */}
                    {signal.volume_rank_num && (
                      <div className="bg-[#111]/80 rounded-lg p-2 border border-gold-primary/15">
                        <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-0.5">📊 Volume Rank <span className="text-gold-primary/60">when called</span></p>
                        <p className="text-base font-bold text-white">
                          #{signal.volume_rank_num}
                          <span className="text-text-muted text-xs font-normal ml-1">/ {signal.volume_rank_den}</span>
                        </p>
                      </div>
                    )}

                    {/* Targets */}
                    <div className="bg-[#111]/80 rounded-lg p-2 border border-green-500/15">
                      <p className="text-green-400 text-[9px] uppercase tracking-wider font-medium mb-1.5">🎯 Targets</p>
                      <div className="space-y-1">
                        {targets.map((t, i) => (
                          <div key={i} className={`flex items-center justify-between p-1.5 rounded transition-all ${
                            t.hit ? 'bg-green-500/15 border border-green-500/25' : 'bg-black/30'
                          }`}>
                            <div className="flex items-center gap-1.5">
                              <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                                t.hit 
                                  ? 'bg-green-500 text-white' 
                                  : 'bg-gray-700 text-gray-400'
                              }`}>
                                {t.hit ? '✓' : i + 1}
                              </div>
                              <div>
                                <span className={`text-[10px] font-medium ${t.hit ? 'text-green-400' : 'text-text-muted'}`}>
                                  {t.label}
                                </span>
                                {t.hit && t.reachedAt && (
                                  <p className="text-[8px] text-green-400/60">{formatShortDateTime(t.reachedAt)}</p>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-mono text-[10px] ${t.hit ? 'text-white' : 'text-text-muted'}`}>
                                {formatPrice(t.value)}
                              </p>
                              <p className={`text-[9px] font-medium ${t.hit ? 'text-green-400' : 'text-green-400/50'}`}>
                                +{t.pct}%
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Stop Loss - 2 levels */}
                    <div className={`rounded-lg p-2 border ${isStopped ? 'bg-red-500/10 border-red-500/25' : 'bg-[#111]/80 border-red-500/15'}`}>
                      <p className="text-red-400 text-[9px] uppercase tracking-wider font-medium mb-1.5">🛑 Stop Loss</p>
                      <div className="space-y-1">
                        {stops.map((s, i) => (
                          <div key={i} className={`flex items-center justify-between p-1.5 rounded ${
                            s.hit ? 'bg-red-500/15 border border-red-500/25' : 'bg-black/30'
                          }`}>
                            <div className="flex items-center gap-1.5">
                              <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                                s.hit 
                                  ? 'bg-red-500 text-white' 
                                  : 'bg-gray-700 text-red-400/50'
                              }`}>
                                {s.hit ? '✗' : i + 1}
                              </div>
                              <div>
                                <span className={`text-[10px] font-medium ${s.hit ? 'text-red-400' : 'text-text-muted'}`}>
                                  {s.label}
                                </span>
                                {s.hit && s.reachedAt && (
                                  <p className="text-[8px] text-red-400/60">{formatShortDateTime(s.reachedAt)}</p>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-mono text-[10px] ${s.hit ? 'text-white' : 'text-text-muted'}`}>
                                {formatPrice(s.value)}
                              </p>
                              <p className="text-[9px] font-medium text-red-400">{s.pct}%</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Real-time indicator */}
                    <div className="text-center text-[9px] text-text-muted pt-0.5">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                        Real-time data
                      </span>
                    </div>

                  </div>
                </div>
              </div>

              {/* Bottom Bar - Research + Sentiment Links */}
              <div className="flex-shrink-0 bg-[#0a0a0a] border-t border-gold-primary/30 px-3 py-2">
                <div className="flex items-center gap-4">
                  {/* Research Links */}
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-gold-primary/80 text-[10px] font-semibold flex-shrink-0">📊 Analytics:</span>
                    <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar-x">
                      {researchLinks.map((link, i) => (
                        <a
                          key={i}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r ${link.color} rounded-lg transition-all duration-200 flex-shrink-0 group border`}
                        >
                          <img 
                            src={link.logo} 
                            alt={link.name}
                            className="w-4 h-4 object-contain"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = link.fallbackLogo;
                            }}
                          />
                          <span className="text-[10px] font-medium text-white/80 group-hover:text-white whitespace-nowrap">
                            {link.name}
                          </span>
                          <svg className="w-2.5 h-2.5 text-white/40 group-hover:text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      ))}
                    </div>
                  </div>

                  {/* Sentiment Link */}
                  <div className="flex items-center gap-2 flex-shrink-0 border-l border-gold-primary/20 pl-4">
                    <span className="text-blue-400/80 text-[10px] font-semibold">💬 Sentiment:</span>
                    {sentimentLinks.map((link, i) => (
                      <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r ${link.color} rounded-lg transition-all duration-200 group border`}
                      >
                        <img 
                          src={link.logo} 
                          alt={link.name}
                          className="w-4 h-4 object-contain"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = link.fallbackLogo;
                          }}
                        />
                        <span className="text-[10px] font-medium text-white/80 group-hover:text-white whitespace-nowrap">
                          X / Twitter
                        </span>
                        <svg className="w-2.5 h-2.5 text-white/40 group-hover:text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ===== TRADE TAB ===== */}
          {activeTab === 'trade' && (
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[#0a0a0a]">
              <div className="max-w-4xl mx-auto">
                <div className="text-center mb-6">
                  <h3 className="text-lg font-display text-white mb-1">Trade {signal.pair}</h3>
                  <p className="text-text-muted text-sm">Open position on your preferred exchange</p>
                </div>

                {/* Signal Summary Card */}
                <div className="bg-gradient-to-r from-gold-primary/10 to-transparent rounded-xl p-4 border border-gold-primary/25 mb-6">
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-text-muted text-[10px] uppercase">Entry</p>
                      <p className="text-gold-primary font-mono text-lg font-bold">{formatPrice(signal.entry)}</p>
                    </div>
                    <div>
                      <p className="text-text-muted text-[10px] uppercase">Stop Loss</p>
                      <p className="text-red-400 font-mono text-lg font-bold">{formatPrice(signal.stop1)}</p>
                    </div>
                    <div>
                      <p className="text-text-muted text-[10px] uppercase">Target 1</p>
                      <p className="text-green-400 font-mono text-lg font-bold">{formatPrice(signal.target1)}</p>
                    </div>
                    <div>
                      <p className="text-text-muted text-[10px] uppercase">Max Target</p>
                      <p className="text-green-400 font-mono text-lg font-bold">{formatPrice(signal.target4 || signal.target3 || signal.target2 || signal.target1)}</p>
                    </div>
                  </div>
                </div>

                {/* Exchange Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {tradeLinks.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex flex-col items-center gap-2 p-4 bg-gradient-to-br ${link.color} rounded-xl transition-all duration-200 group border hover:scale-[1.02]`}
                    >
                      <div className="w-12 h-12 rounded-xl bg-black/30 flex items-center justify-center">
                        <img 
                          src={link.logo} 
                          alt={link.name}
                          className="w-8 h-8 object-contain"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = link.fallbackLogo;
                          }}
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-white text-sm font-semibold group-hover:text-gold-primary transition-colors">{link.name}</p>
                        <p className="text-text-muted text-[10px] mt-0.5">{link.description}</p>
                      </div>
                    </a>
                  ))}
                </div>

                {/* Quick Copy Section */}
                <div className="mt-6 bg-[#111] rounded-xl p-4 border border-gold-primary/20">
                  <p className="text-gold-primary text-xs font-semibold mb-3">📋 Quick Copy for Manual Entry</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div 
                      className="bg-black/40 rounded-lg p-2 cursor-pointer hover:bg-black/60 transition-colors group"
                      onClick={() => navigator.clipboard.writeText(signal.entry?.toString())}
                    >
                      <p className="text-text-muted text-[9px] uppercase mb-0.5">Entry Price</p>
                      <p className="text-white font-mono text-sm group-hover:text-gold-primary">{formatPrice(signal.entry)}</p>
                    </div>
                    <div 
                      className="bg-black/40 rounded-lg p-2 cursor-pointer hover:bg-black/60 transition-colors group"
                      onClick={() => navigator.clipboard.writeText(signal.stop1?.toString())}
                    >
                      <p className="text-text-muted text-[9px] uppercase mb-0.5">Stop Loss</p>
                      <p className="text-red-400 font-mono text-sm group-hover:text-red-300">{formatPrice(signal.stop1)}</p>
                    </div>
                    <div 
                      className="bg-black/40 rounded-lg p-2 cursor-pointer hover:bg-black/60 transition-colors group"
                      onClick={() => navigator.clipboard.writeText(signal.target1?.toString())}
                    >
                      <p className="text-text-muted text-[9px] uppercase mb-0.5">TP1</p>
                      <p className="text-green-400 font-mono text-sm group-hover:text-green-300">{formatPrice(signal.target1)}</p>
                    </div>
                    <div 
                      className="bg-black/40 rounded-lg p-2 cursor-pointer hover:bg-black/60 transition-colors group"
                      onClick={() => navigator.clipboard.writeText((signal.target4 || signal.target3 || signal.target2 || signal.target1)?.toString())}
                    >
                      <p className="text-text-muted text-[9px] uppercase mb-0.5">Max TP</p>
                      <p className="text-green-400 font-mono text-sm group-hover:text-green-300">{formatPrice(signal.target4 || signal.target3 || signal.target2 || signal.target1)}</p>
                    </div>
                  </div>
                  <p className="text-text-muted text-[9px] text-center mt-2">Click any value to copy to clipboard</p>
                </div>
              </div>
            </div>
          )}

          {/* ===== RESEARCH TAB ===== */}
          {activeTab === 'research' && (
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[#0a0a0a]">
              <div className="max-w-4xl mx-auto">
                <div className="text-center mb-5">
                  <h3 className="text-lg font-display text-white mb-1">Research & Analytics</h3>
                  <p className="text-text-muted text-sm">Deep dive into <span className="text-gold-primary font-semibold">{coinSymbol}</span> data</p>
                </div>

                {/* Analytics Grid */}
                <div className="mb-6">
                  <p className="text-gold-primary text-xs font-semibold mb-3">📊 Market Data & Charts</p>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                    {researchLinks.map((link, i) => (
                      <a
                        key={i}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex flex-col items-center gap-2 p-3 bg-gradient-to-br ${link.color} rounded-xl transition-all duration-200 group border hover:scale-[1.02]`}
                      >
                        <div className="w-10 h-10 rounded-lg bg-black/30 flex items-center justify-center">
                          <img 
                            src={link.logo} 
                            alt={link.name}
                            className="w-6 h-6 object-contain"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = link.fallbackLogo;
                            }}
                          />
                        </div>
                        <p className="text-white text-[11px] font-medium group-hover:text-gold-primary transition-colors text-center">{link.name}</p>
                      </a>
                    ))}
                  </div>
                </div>

                {/* Sentiment */}
                <div className="mb-6">
                  <p className="text-blue-400 text-xs font-semibold mb-3">💬 Social Sentiment</p>
                  <a
                    href={sentimentLinks[0].url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 bg-gradient-to-r from-gray-800/50 to-gray-900/50 rounded-xl border border-gray-600/30 hover:border-gray-500/50 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-black flex items-center justify-center">
                      <img 
                        src={sentimentLinks[0].logo} 
                        alt="X"
                        className="w-7 h-7 object-contain"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = sentimentLinks[0].fallbackLogo;
                        }}
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-semibold group-hover:text-gold-primary transition-colors">Twitter / X Live Feed</p>
                      <p className="text-text-muted text-sm">See what traders are saying about ${coinSymbol} in real-time</p>
                    </div>
                    <svg className="w-5 h-5 text-text-muted group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>

                {/* Signal Summary */}
                <div className="bg-gradient-to-br from-gold-primary/10 to-transparent rounded-xl p-4 border border-gold-primary/25">
                  <h4 className="text-gold-primary font-display text-sm mb-3">Signal Summary</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-text-muted text-[10px] uppercase">Entry Price</p>
                      <p className="text-white font-mono text-base mt-0.5">{formatPrice(signal.entry)}</p>
                      <p className="text-text-muted text-[9px]">{formatShortDateTime(signal.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-text-muted text-[10px] uppercase">Status</p>
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold text-white mt-1 ${statusStyles[signal.status?.toLowerCase()] || 'bg-gray-500'}`}>
                        {signal.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-text-muted text-[10px] uppercase">Targets Hit</p>
                      <p className="text-white text-base mt-0.5">{hitTargets.filter(Boolean).length} / {targets.length}</p>
                    </div>
                    <div>
                      <p className="text-text-muted text-[10px] uppercase">Max Profit</p>
                      <p className="text-green-400 text-base mt-0.5">+{targets[targets.length - 1]?.pct || 0}%</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
        </div>
      </div>

      {/* Custom scrollbar styles dan TradingView fixes */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(212, 168, 83, 0.3);
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(212, 168, 83, 0.5);
        }
        .custom-scrollbar-x::-webkit-scrollbar {
          height: 3px;
        }
        .custom-scrollbar-x::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar-x::-webkit-scrollbar-thumb {
          background: rgba(212, 168, 83, 0.3);
          border-radius: 2px;
        }
        /* TradingView widget fixes */
        #tv_chart_modal {
          background: #0d0d0d !important;
        }
        #tv_chart_modal .tradingview-widget-container {
          background: #0d0d0d !important;
        }
        #tv_chart_modal .tradingview-widget-container__widget {
          background: #0d0d0d !important;
        }
        /* Hide TradingView copyright/branding */
        #tv_chart_modal .tradingview-widget-copyright {
          display: none !important;
        }
        /* Ensure iframe takes full height without gray gap */
        #tv_chart_modal iframe {
          background: #0d0d0d !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
};

export default SignalModal;