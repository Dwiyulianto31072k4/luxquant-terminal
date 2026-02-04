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

  // Get user timezone
  const getUserTimezone = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'Etc/UTC';
    }
  };

  // TradingView Widget
  useEffect(() => {
    if (!isOpen || !signal || !chartContainerRef.current || activeTab !== 'chart') return;

    chartContainerRef.current.innerHTML = '';
    const symbol = `BINANCE:${signal.pair}.P`;
    const timezone = getUserTimezone();

    const loadTradingView = () => {
      if (window.TradingView) {
        createWidget(symbol, timezone);
      } else {
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/tv.js';
        script.async = true;
        script.onload = () => createWidget(symbol, timezone);
        document.head.appendChild(script);
      }
    };

    const createWidget = (sym, tz) => {
      if (!chartContainerRef.current) return;
      
      try {
        widgetRef.current = new window.TradingView.widget({
          autosize: true,
          symbol: sym,
          interval: "60",
          timezone: tz,
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#1a1a1a",
          enable_publishing: false,
          allow_symbol_change: true,
          container_id: "tv_chart_modal",
          backgroundColor: "rgba(13, 13, 13, 1)",
          gridColor: "rgba(212, 168, 83, 0.05)",
          hide_top_toolbar: false,
          hide_legend: false,
          hide_side_toolbar: false,
          save_image: true,
          details: true,
          studies: ["MASimple@tv-basicstudies", "Volume@tv-basicstudies"],
          show_popup_button: true,
          popup_width: "1200",
          popup_height: "800",
          withdateranges: true,
          drawings_access: { type: "all" },
          enabled_features: [
            "study_templates",
            "use_localstorage_for_settings",
            "save_chart_properties_to_local_storage",
            "side_toolbar_in_fullscreen_mode",
            "drawing_templates"
          ],
          overrides: {
            "paneProperties.background": "#0d0d0d",
            "paneProperties.vertGridProperties.color": "rgba(212, 168, 83, 0.05)",
            "paneProperties.horzGridProperties.color": "rgba(212, 168, 83, 0.05)",
            "scalesProperties.textColor": "#9ca3af",
            "mainSeriesProperties.candleStyle.upColor": "#22c55e",
            "mainSeriesProperties.candleStyle.downColor": "#ef4444",
            "mainSeriesProperties.candleStyle.borderUpColor": "#22c55e",
            "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
            "mainSeriesProperties.candleStyle.wickUpColor": "#22c55e",
            "mainSeriesProperties.candleStyle.wickDownColor": "#ef4444"
          }
        });
      } catch (e) {
        console.error('TradingView widget error:', e);
      }
    };

    const timer = setTimeout(loadTradingView, 100);
    return () => {
      clearTimeout(timer);
      widgetRef.current = null;
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

  const formatShortDate = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-GB', {
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

  const stops = [
    { label: 'SL1', value: signal.stop1, pct: calcPct(signal.stop1, signal.entry), hit: isStopped, reachedAt: getUpdateInfo('sl')?.update_at },
    { label: 'SL2', value: signal.stop2, pct: calcPct(signal.stop2, signal.entry), hit: false },
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

  // Research links dengan URL yang benar
  const researchLinks = [
    { 
      name: 'TradingView', 
      url: `https://www.tradingview.com/chart/?symbol=BINANCE:${signal.pair}.P`,
      logo: 'https://www.tradingview.com/static/images/logo-preview.png',
      color: 'hover:bg-blue-500/20 hover:border-blue-500/50'
    },
    { 
      name: 'Binance Futures', 
      url: `https://www.binance.com/en/futures/${signal.pair}`,
      logo: 'https://public.bnbstatic.com/image/cms/blog/20230202/16659b3c-57c6-4e5f-b0d7-d08ddb0cf0af.png',
      color: 'hover:bg-yellow-500/20 hover:border-yellow-500/50'
    },
    { 
      name: 'Bybit', 
      url: `https://www.bybit.com/trade/usdt/${coinSymbol}USDT`,
      logo: 'https://www.bybit.com/bycsi-root/fop/9267d450-f61c-4049-8cd4-a3a78dc3fbe2.svg',
      color: 'hover:bg-orange-500/20 hover:border-orange-500/50'
    },
    { 
      name: 'OKX', 
      url: `https://www.okx.com/trade-swap/${coinSymbolLower}-usdt-swap`,
      logo: 'https://static.okx.com/cdn/assets/imgs/226/DF679CE5D9C03767.png',
      color: 'hover:bg-white/20 hover:border-white/50'
    },
    { 
      name: 'CoinGlass', 
      url: `https://www.coinglass.com/currencies/${coinSymbol}`,
      logo: 'https://www.coinglass.com/favicon.svg',
      color: 'hover:bg-cyan-500/20 hover:border-cyan-500/50'
    },
    { 
      name: 'CoinGecko', 
      url: `https://www.coingecko.com/en/coins/${coinSymbolLower}`,
      logo: 'https://static.coingecko.com/s/coingecko-branding-guide-8447de673439420efa0ab1e0e03a1f8b0137c3f142f84f12e9f2f5a2d8e2e29f.png',
      color: 'hover:bg-green-500/20 hover:border-green-500/50'
    },
    { 
      name: 'CoinMarketCap', 
      url: `https://coinmarketcap.com/currencies/${coinSymbolLower}/`,
      logo: 'https://s2.coinmarketcap.com/static/cloud/img/coinmarketcap_1.svg',
      color: 'hover:bg-blue-400/20 hover:border-blue-400/50'
    },
    { 
      name: 'DexScreener', 
      url: `https://dexscreener.com/search?q=${coinSymbol}`,
      logo: 'https://dexscreener.com/favicon.png',
      color: 'hover:bg-lime-500/20 hover:border-lime-500/50'
    },
    { 
      name: 'Twitter/X', 
      url: `https://x.com/search?q=%24${coinSymbol}&src=typed_query&f=live`,
      logo: 'https://abs.twimg.com/responsive-web/client-web/icon-ios.77d25eba.png',
      color: 'hover:bg-gray-500/20 hover:border-gray-500/50'
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-5 lg:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/85 backdrop-blur-md"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="relative w-full max-w-[1400px] h-[92vh] max-h-[950px] bg-bg-primary rounded-2xl border border-gold-primary/40 shadow-2xl shadow-gold-primary/10 flex flex-col overflow-hidden">
        
        {/* Corner Accents */}
        <div className="absolute top-0 left-0 w-16 h-16 border-t-2 border-l-2 border-gold-primary/50 rounded-tl-2xl pointer-events-none" />
        <div className="absolute top-0 right-0 w-16 h-16 border-t-2 border-r-2 border-gold-primary/50 rounded-tr-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-16 h-16 border-b-2 border-l-2 border-gold-primary/50 rounded-bl-2xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-gold-primary/50 rounded-br-2xl pointer-events-none" />

        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-bg-secondary via-bg-secondary to-bg-primary border-b border-gold-primary/30 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CoinLogo pair={signal.pair} size={40} />
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-display font-bold text-white">{signal.pair}</h2>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase text-white ${statusStyles[signal.status?.toLowerCase()] || 'bg-gray-500'}`}>
                  {signal.status}
                </span>
                {signal.risk_level && (
                  <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase border ${riskStyles[signal.risk_level?.toLowerCase()] || 'text-gray-400'}`}>
                    {signal.risk_level}
                  </span>
                )}
              </div>
              <p className="text-text-muted text-sm mt-0.5">{formatDate(signal.created_at)}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Tabs */}
            <div className="flex bg-bg-primary rounded-xl p-1 border border-gold-primary/20">
              <button
                onClick={() => setActiveTab('chart')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'chart' 
                    ? 'bg-gold-primary text-black' 
                    : 'text-text-secondary hover:text-white hover:bg-white/5'
                }`}
              >
                📈 Chart
              </button>
              <button
                onClick={() => setActiveTab('research')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
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
              className="w-10 h-10 flex items-center justify-center text-text-muted hover:text-white bg-bg-primary hover:bg-red-500/20 border border-gold-primary/20 hover:border-red-500/50 rounded-xl transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col">
          
          {activeTab === 'chart' && (
            <>
              {/* Main Area - Chart + Sidebar */}
              <div className="flex-1 min-h-0 flex">
                {/* Chart */}
                <div className="flex-1 min-w-0">
                  <div id="tv_chart_modal" ref={chartContainerRef} className="w-full h-full" />
                </div>

                {/* Right Sidebar - Entry, TP, SL */}
                <div className="w-64 flex-shrink-0 bg-bg-secondary/50 border-l border-gold-primary/20 overflow-y-auto">
                  <div className="p-4 space-y-4">
                    
                    {/* Entry Price */}
                    <div className="bg-gradient-to-br from-gold-primary/25 to-gold-primary/5 rounded-xl p-4 border border-gold-primary/40">
                      <p className="text-gold-primary/70 text-xs uppercase tracking-wider font-medium">Entry Price</p>
                      <p className="text-2xl font-mono font-bold text-gold-primary mt-1">
                        {formatPrice(signal.entry)}
                      </p>
                    </div>

                    {/* Volume Rank */}
                    {signal.volume_rank_num && (
                      <div className="bg-bg-primary/80 rounded-xl p-4 border border-gold-primary/20">
                        <p className="text-text-muted text-xs uppercase tracking-wider font-medium">📊 Volume Rank</p>
                        <p className="text-xl font-bold text-white mt-1">
                          #{signal.volume_rank_num}
                          <span className="text-text-muted text-sm font-normal ml-1">/ {signal.volume_rank_den}</span>
                        </p>
                      </div>
                    )}

                    {/* Targets */}
                    <div className="bg-bg-primary/80 rounded-xl p-4 border border-green-500/20">
                      <p className="text-green-400 text-xs uppercase tracking-wider font-medium mb-3">🎯 Targets</p>
                      <div className="space-y-2">
                        {targets.map((t, i) => (
                          <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg transition-all ${
                            t.hit ? 'bg-green-500/15 border border-green-500/30' : 'bg-bg-card/50'
                          }`}>
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                t.hit 
                                  ? 'bg-green-500 text-white' 
                                  : 'bg-gray-700 text-gray-400 border border-gray-600'
                              }`}>
                                {t.hit ? '✓' : i + 1}
                              </div>
                              <div>
                                <p className={`text-sm font-semibold ${t.hit ? 'text-green-400' : 'text-text-secondary'}`}>
                                  {t.label}
                                </p>
                                {t.hit && t.reachedAt && (
                                  <p className="text-[10px] text-green-400/70">{formatShortDate(t.reachedAt)}</p>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-mono text-sm ${t.hit ? 'text-white' : 'text-text-muted'}`}>
                                {formatPrice(t.value)}
                              </p>
                              <p className={`text-xs font-medium ${t.hit ? 'text-green-400' : 'text-green-400/50'}`}>
                                +{t.pct}%
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Stop Loss */}
                    <div className={`rounded-xl p-4 border ${isStopped ? 'bg-red-500/10 border-red-500/40' : 'bg-bg-primary/80 border-red-500/20'}`}>
                      <p className="text-red-400 text-xs uppercase tracking-wider font-medium mb-3">🛑 Stop Loss</p>
                      <div className="space-y-2">
                        {stops.map((s, i) => (
                          <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg transition-all ${
                            s.hit ? 'bg-red-500/15 border border-red-500/30' : 'bg-bg-card/50'
                          }`}>
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                s.hit 
                                  ? 'bg-red-500 text-white' 
                                  : 'bg-gray-700 text-red-400/50 border border-red-900/50'
                              }`}>
                                {s.hit ? '✗' : i + 1}
                              </div>
                              <div>
                                <p className={`text-sm font-semibold ${s.hit ? 'text-red-400' : 'text-text-muted'}`}>
                                  {s.label}
                                </p>
                                {s.hit && s.reachedAt && (
                                  <p className="text-[10px] text-red-400/70">{formatShortDate(s.reachedAt)}</p>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-mono text-sm ${s.hit ? 'text-white' : 'text-text-muted'}`}>
                                {formatPrice(s.value)}
                              </p>
                              <p className="text-xs font-medium text-red-400">{s.pct}%</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              </div>

              {/* Bottom Bar - Research Links */}
              <div className="flex-shrink-0 bg-gradient-to-r from-bg-secondary via-bg-primary to-bg-secondary border-t border-gold-primary/30 px-5 py-3">
                <div className="flex items-center gap-3 overflow-x-auto pb-1">
                  <span className="text-text-muted text-sm font-medium flex-shrink-0">🔗 Research:</span>
                  {researchLinks.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2 px-4 py-2 bg-bg-card border border-gold-primary/20 rounded-xl transition-all duration-200 flex-shrink-0 group ${link.color}`}
                    >
                      <img 
                        src={link.logo} 
                        alt={link.name}
                        className="w-5 h-5 object-contain"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = `https://www.google.com/s2/favicons?domain=${new URL(link.url).hostname}&sz=64`;
                        }}
                      />
                      <span className="text-sm font-medium text-text-secondary group-hover:text-white transition-colors">
                        {link.name}
                      </span>
                      <svg className="w-4 h-4 text-text-muted group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'research' && (
            <div className="flex-1 overflow-y-auto p-8">
              <div className="max-w-5xl mx-auto">
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-display text-white mb-2">Research & Analytics for {signal.pair}</h3>
                  <p className="text-text-muted">Access all major platforms to analyze {coinSymbol}</p>
                </div>

                {/* Links Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                  {researchLinks.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex flex-col items-center gap-3 p-5 bg-bg-card border border-gold-primary/20 rounded-xl transition-all duration-200 group ${link.color}`}
                    >
                      <div className="w-14 h-14 rounded-xl bg-bg-primary flex items-center justify-center">
                        <img 
                          src={link.logo} 
                          alt={link.name}
                          className="w-10 h-10 object-contain"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = `https://www.google.com/s2/favicons?domain=${new URL(link.url).hostname}&sz=64`;
                          }}
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-white text-sm font-semibold group-hover:text-gold-primary transition-colors">{link.name}</p>
                        <p className="text-text-muted text-xs mt-0.5">Open Platform →</p>
                      </div>
                    </a>
                  ))}
                </div>

                {/* Summary Card */}
                <div className="bg-gradient-to-br from-gold-primary/15 to-transparent rounded-2xl p-6 border border-gold-primary/30">
                  <h4 className="text-gold-primary font-display text-lg mb-4">Signal Summary</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                      <p className="text-text-muted text-sm">Entry Price</p>
                      <p className="text-white font-mono text-xl mt-1">{formatPrice(signal.entry)}</p>
                    </div>
                    <div>
                      <p className="text-text-muted text-sm">Current Status</p>
                      <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold text-white mt-1 ${statusStyles[signal.status?.toLowerCase()] || 'bg-gray-500'}`}>
                        {signal.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-text-muted text-sm">Targets Reached</p>
                      <p className="text-white text-xl mt-1">{hitTargets.filter(Boolean).length} / {targets.length}</p>
                    </div>
                    <div>
                      <p className="text-text-muted text-sm">Maximum Profit</p>
                      <p className="text-green-400 text-xl mt-1">+{targets[targets.length - 1]?.pct || 0}%</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
};

export default SignalModal;