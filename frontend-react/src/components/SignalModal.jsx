import { useEffect, useRef, useState } from 'react';
import CoinLogo from './CoinLogo';

const SignalModal = ({ signal, isOpen, onClose }) => {
  const chartContainerRef = useRef(null);
  const widgetRef = useRef(null);
  const [signalDetail, setSignalDetail] = useState(null);
  const [activeTab, setActiveTab] = useState('chart');

  useEffect(() => {
    if (!isOpen || !signal) return;
    const fetchDetail = async () => {
      try {
        const response = await fetch(`/api/v1/signals/detail/${signal.signal_id}`);
        if (response.ok) {
          const data = await response.json();
          setSignalDetail(data);
          // DEBUG: Log the response so you can check in browser console
          console.log('[SignalModal] Detail response:', JSON.stringify(data.updates, null, 2));
          console.log('[SignalModal] Updates count:', data.updates?.length || 0);
          if (!data.updates || data.updates.length === 0) {
            console.warn('[SignalModal] ⚠️ No updates found! Status-based fallback will be used.');
            console.warn('[SignalModal] Try: /api/v1/signals/debug/' + signal.signal_id);
          }
        }
      } catch (error) { console.error('Failed to fetch signal detail:', error); }
    };
    fetchDetail();
  }, [isOpen, signal]);

  useEffect(() => {
    const handleEscape = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) { document.addEventListener('keydown', handleEscape); document.body.style.overflow = 'hidden'; }
    return () => { document.removeEventListener('keydown', handleEscape); document.body.style.overflow = 'unset'; };
  }, [isOpen, onClose]);

  const getUserTimezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'Etc/UTC'; } };

  useEffect(() => {
    if (!isOpen || !signal || !chartContainerRef.current || activeTab !== 'chart') return;
    chartContainerRef.current.innerHTML = '';
    const symbol = `BINANCE:${signal.pair}.P`;
    const timezone = getUserTimezone();
    const createWidget = (sym, tz) => {
      if (!chartContainerRef.current) return;
      try {
        widgetRef.current = new window.TradingView.widget({
          container_id: 'tv_chart_modal', autosize: true, symbol: sym, interval: '60', timezone: tz,
          theme: 'dark', style: '1', locale: 'en', toolbar_bg: '#0d0d0d', enable_publishing: false,
          backgroundColor: '#0d0d0d', gridColor: 'rgba(212, 168, 83, 0.06)',
          hide_top_toolbar: false, hide_legend: false, hide_side_toolbar: false,
          allow_symbol_change: true, save_image: true, calendar: false, hide_volume: false,
          withdateranges: true, details: true, hotlist: false, studies: ["STD;SMA"],
          support_host: "https://www.tradingview.com",
          overrides: {
            "mainSeriesProperties.candleStyle.upColor": "#22c55e", "mainSeriesProperties.candleStyle.downColor": "#ef4444",
            "mainSeriesProperties.candleStyle.borderUpColor": "#22c55e", "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
            "mainSeriesProperties.candleStyle.wickUpColor": "#22c55e", "mainSeriesProperties.candleStyle.wickDownColor": "#ef4444"
          }
        });
      } catch (e) { console.error('TradingView widget error:', e); }
    };
    const loadTV = () => { if (window.TradingView) createWidget(symbol, timezone); else { const s = document.createElement('script'); s.src = 'https://s3.tradingview.com/tv.js'; s.async = true; s.onload = () => createWidget(symbol, timezone); document.head.appendChild(s); } };
    const timer = setTimeout(loadTV, 100);
    return () => { clearTimeout(timer); widgetRef.current = null; };
  }, [isOpen, signal, activeTab]);

  if (!isOpen || !signal) return null;

  // === HELPERS ===
  const getCoinSymbol = (pair) => pair?.replace(/USDT$/i, '').toUpperCase() || '';
  const coinSymbol = getCoinSymbol(signal.pair);
  const coinSymbolLower = coinSymbol.toLowerCase();
  const calcPct = (target, entry) => { if (!target || !entry) return null; return ((target - entry) / entry * 100).toFixed(2); };
  const formatDate = (d) => { if (!d) return '-'; return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); };
  const formatShortDateTime = (d) => { if (!d) return null; return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); };
  const calcTimeDiff = (from, to) => {
    if (!from || !to) return null;
    const ms = new Date(to) - new Date(from); if (ms < 0) return null;
    const m = Math.floor(ms/60000), h = Math.floor(m/60), d = Math.floor(h/24);
    if (d > 0) { const rh = h%24; return rh > 0 ? `${d}d ${rh}h` : `${d}d`; }
    if (h > 0) { const rm = m%60; return rm > 0 ? `${h}h ${rm}m` : `${h}h`; }
    return `${m}m`;
  };
  const formatPrice = (p) => { if (!p) return '-'; if (p < 0.0001) return p.toFixed(8); if (p < 0.01) return p.toFixed(6); if (p < 1) return p.toFixed(4); return p < 100 ? p.toFixed(4) : p.toFixed(2); };

  // === SIGNAL DATA ===
  const getUpdateInfo = (type) => signalDetail?.updates?.find(u => u.update_type === type) || null;
  const getHitTargets = () => {
    const s = signal.status?.toLowerCase() || ''; const updates = signalDetail?.updates || [];
    const has = (tp) => updates.some(u => u.update_type === tp);
    if (updates.length === 0) {
      if (s === 'closed_win' || s === 'tp4') return [true, true, true, true];
      if (s === 'tp3') return [true, true, true, false]; if (s === 'tp2') return [true, true, false, false];
      if (s === 'tp1') return [true, false, false, false]; return [false, false, false, false];
    }
    return [has('tp1')||has('tp2')||has('tp3')||has('tp4'), has('tp2')||has('tp3')||has('tp4'), has('tp3')||has('tp4'), has('tp4')];
  };
  const hitTargets = getHitTargets();
  const isStopped = ['closed_loss', 'sl'].includes(signal.status?.toLowerCase());
  const hasRealUpdates = (signalDetail?.updates?.length || 0) > 0;
  const targets = [
    { label: 'TP1', value: signal.target1, pct: calcPct(signal.target1, signal.entry), hit: hitTargets[0], reachedAt: getUpdateInfo('tp1')?.update_at },
    { label: 'TP2', value: signal.target2, pct: calcPct(signal.target2, signal.entry), hit: hitTargets[1], reachedAt: getUpdateInfo('tp2')?.update_at },
    { label: 'TP3', value: signal.target3, pct: calcPct(signal.target3, signal.entry), hit: hitTargets[2], reachedAt: getUpdateInfo('tp3')?.update_at },
    { label: 'TP4', value: signal.target4, pct: calcPct(signal.target4, signal.entry), hit: hitTargets[3], reachedAt: getUpdateInfo('tp4')?.update_at },
  ].filter(t => t.value);
  const stops = [
    { label: 'SL1', value: signal.stop1, pct: calcPct(signal.stop1, signal.entry), hit: isStopped, reachedAt: getUpdateInfo('sl')?.update_at || getUpdateInfo('sl1')?.update_at },
    { label: 'SL2', value: signal.stop2, pct: calcPct(signal.stop2, signal.entry), hit: false, reachedAt: getUpdateInfo('sl2')?.update_at },
  ].filter(s => s.value);
  const statusStyles = { 'open': 'bg-cyan-500', 'tp1': 'bg-green-500', 'tp2': 'bg-lime-500', 'tp3': 'bg-yellow-500', 'tp4': 'bg-orange-500', 'closed_win': 'bg-green-600', 'closed_loss': 'bg-red-500', 'sl': 'bg-red-500' };

  // === LINKS ===
  const researchLinks = [
    { name: 'TradingView', url: `https://www.tradingview.com/chart/?symbol=BINANCE:${signal.pair}.P`, logo: 'https://static.tradingview.com/static/images/logo-preview.png', fallbackLogo: 'https://www.google.com/s2/favicons?domain=tradingview.com&sz=64', color: 'from-blue-600/20 to-blue-800/10 border-blue-500/30 hover:border-blue-400' },
    { name: 'CoinGlass', url: `https://www.coinglass.com/currencies/${coinSymbol}`, logo: 'https://www.coinglass.com/favicon.svg', fallbackLogo: 'https://www.google.com/s2/favicons?domain=coinglass.com&sz=64', color: 'from-cyan-600/20 to-cyan-800/10 border-cyan-500/30 hover:border-cyan-400' },
    { name: 'CoinGecko', url: `https://www.coingecko.com/en/coins/${coinSymbolLower}`, logo: 'https://static.coingecko.com/s/thumbnail-007177f3eca19695592f0b8b0eabbdae282b54154e1be912285c9034ea6cbaf2.png', fallbackLogo: 'https://www.google.com/s2/favicons?domain=coingecko.com&sz=64', color: 'from-green-600/20 to-green-800/10 border-green-500/30 hover:border-green-400' },
    { name: 'CoinMarketCap', url: `https://coinmarketcap.com/currencies/${coinSymbolLower}/`, logo: 'https://s2.coinmarketcap.com/static/cloud/img/coinmarketcap_1.svg', fallbackLogo: 'https://www.google.com/s2/favicons?domain=coinmarketcap.com&sz=64', color: 'from-blue-500/20 to-blue-700/10 border-blue-400/30 hover:border-blue-300' },
    { name: 'DexScreener', url: `https://dexscreener.com/search?q=${coinSymbol}`, logo: 'https://dexscreener.com/favicon.png', fallbackLogo: 'https://www.google.com/s2/favicons?domain=dexscreener.com&sz=64', color: 'from-lime-600/20 to-lime-800/10 border-lime-500/30 hover:border-lime-400' },
  ];
  const sentimentLinks = [
    { name: 'Twitter / X', url: `https://x.com/search?q=%24${coinSymbol}&src=typed_query&f=live`, logo: 'https://abs.twimg.com/favicons/twitter.3.ico', fallbackLogo: 'https://www.google.com/s2/favicons?domain=x.com&sz=64', color: 'from-gray-600/20 to-gray-800/10 border-gray-500/30 hover:border-gray-400' },
  ];
  const tradeLinks = [
    { name: 'Binance Futures', url: `https://www.binance.com/en/futures/${signal.pair}`, logo: 'https://public.bnbstatic.com/static/images/common/favicon.ico', fallbackLogo: 'https://www.google.com/s2/favicons?domain=binance.com&sz=64', color: 'from-yellow-500/20 to-yellow-700/10 border-yellow-500/30 hover:border-yellow-400' },
    { name: 'Bybit', url: `https://www.bybit.com/trade/usdt/${coinSymbol}USDT`, logo: 'https://www.bybit.com/favicon.ico', fallbackLogo: 'https://www.google.com/s2/favicons?domain=bybit.com&sz=64', color: 'from-orange-500/20 to-orange-700/10 border-orange-500/30 hover:border-orange-400' },
    { name: 'OKX', url: `https://www.okx.com/trade-swap/${coinSymbolLower}-usdt-swap`, logo: 'https://static.okx.com/cdn/assets/imgs/226/DF679CE5D9C03767.png', fallbackLogo: 'https://www.google.com/s2/favicons?domain=okx.com&sz=64', color: 'from-white/10 to-gray-700/10 border-white/20 hover:border-white/40' },
    { name: 'Bitget', url: `https://www.bitget.com/futures/usdt/${coinSymbol}USDT`, logo: 'https://img.bitgetimg.com/image/third/1702472462805.png', fallbackLogo: 'https://www.google.com/s2/favicons?domain=bitget.com&sz=64', color: 'from-cyan-500/20 to-cyan-700/10 border-cyan-500/30 hover:border-cyan-400' },
  ];

  // === TIMELINE ===
  const grayC = { bg: 'bg-gray-700', text: 'text-text-muted', border: 'border-gray-700/40', bgLight: 'bg-gray-800/30', line: 'bg-gray-700/30' };
  const buildTimeline = () => {
    const ev = [];
    ev.push({ type: 'called', label: 'Signal Called', sublabel: `Entry @ ${formatPrice(signal.entry)}`, time: signal.created_at, icon: '📡', hit: true, colorClasses: { bg: 'bg-gold-primary', text: 'text-gold-primary', border: 'border-gold-primary/40', bgLight: 'bg-gold-primary/15', line: 'bg-gold-primary/40' } });
    const tps = [
      { k: 'tp1', l: 'TP1', v: signal.target1, c: { bg: 'bg-green-500', text: 'text-green-400', border: 'border-green-500/40', bgLight: 'bg-green-500/15', line: 'bg-green-500/40' } },
      { k: 'tp2', l: 'TP2', v: signal.target2, c: { bg: 'bg-lime-500', text: 'text-lime-400', border: 'border-lime-500/40', bgLight: 'bg-lime-500/15', line: 'bg-lime-500/40' } },
      { k: 'tp3', l: 'TP3', v: signal.target3, c: { bg: 'bg-yellow-500', text: 'text-yellow-400', border: 'border-yellow-500/40', bgLight: 'bg-yellow-500/15', line: 'bg-yellow-500/40' } },
      { k: 'tp4', l: 'TP4', v: signal.target4, c: { bg: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500/40', bgLight: 'bg-orange-500/15', line: 'bg-orange-500/40' } },
    ];
    tps.forEach((tp, i) => { if (!tp.v) return; const u = getUpdateInfo(tp.k); const h = hitTargets[i]; ev.push({ type: tp.k, label: `${tp.l} Hit`, sublabel: `${formatPrice(tp.v)} (+${calcPct(tp.v, signal.entry)}%)`, time: u?.update_at || null, icon: h ? '✓' : (i+1).toString(), hit: h, colorClasses: h ? tp.c : grayC }); });
    if (signal.stop1) { const su = getUpdateInfo('sl') || getUpdateInfo('sl1'); const sc = { bg: 'bg-red-500', text: 'text-red-400', border: 'border-red-500/40', bgLight: 'bg-red-500/15', line: 'bg-red-500/40' }; ev.push({ type: 'sl', label: 'Stop Loss Hit', sublabel: `${formatPrice(signal.stop1)} (${calcPct(signal.stop1, signal.entry)}%)`, time: su?.update_at || null, icon: isStopped ? '✗' : '⊘', hit: isStopped, colorClasses: isStopped ? sc : grayC }); }
    return ev;
  };
  const timeline = buildTimeline();
  const LinkIcon = () => (<svg className="w-2.5 h-2.5 text-white/40 group-hover:text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>);
  // === RENDER ===
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-0 sm:px-3 md:px-5">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-[1400px] bg-bg-primary rounded-2xl border border-gold-primary/40 shadow-2xl shadow-gold-primary/10 flex flex-col overflow-hidden mt-14" style={{ height: 'calc(100vh - 70px)', maxHeight: '880px' }}>
        <div className="absolute top-0 left-0 w-12 h-12 border-t-2 border-l-2 border-gold-primary/50 rounded-tl-2xl pointer-events-none" />
        <div className="absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 border-gold-primary/50 rounded-tr-2xl pointer-events-none" />

        {/* HEADER */}
        <div className="flex-shrink-0 bg-[#0a0a0a] border-b border-gold-primary/30 px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CoinLogo symbol={coinSymbol} size={28} />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-white font-display text-sm font-semibold">{signal.pair}</h2>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white ${statusStyles[signal.status?.toLowerCase()] || 'bg-gray-500'}`}>{signal.status?.toUpperCase()}</span>
                </div>
                <p className="text-text-muted text-[10px]">{formatShortDateTime(signal.created_at)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-[#111] rounded-lg p-0.5 border border-gold-primary/15">
              {['chart','trade','research'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 py-1.5 rounded text-[11px] font-semibold transition-all ${activeTab === tab ? 'bg-gold-primary text-black' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}>
                  {tab === 'chart' ? '📈 Chart' : tab === 'trade' ? '💹 Trade' : '🔍 Research'}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-white bg-[#0a0a0a] hover:bg-red-500/20 border border-gold-primary/20 hover:border-red-500/50 rounded-lg transition-all">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {/* === CHART TAB === */}
          {activeTab === 'chart' && (<>
            <div className="flex-1 min-h-0 flex">
              <div className="flex-1 min-w-0 bg-[#0d0d0d]"><div id="tv_chart_modal" ref={chartContainerRef} className="w-full h-full" /></div>
              {/* SIDEBAR */}
              <div className="w-52 flex-shrink-0 bg-[#0a0a0a] border-l border-gold-primary/20 overflow-y-auto custom-scrollbar">
                <div className="p-2.5 space-y-2">
                  {/* Entry */}
                  <div className="bg-gradient-to-br from-gold-primary/15 to-gold-primary/5 rounded-lg p-2.5 border border-gold-primary/30">
                    <div className="flex items-center justify-between mb-1"><p className="text-gold-primary/70 text-[9px] uppercase tracking-wider font-medium">Entry Price</p><p className="text-[9px] text-text-muted">Called</p></div>
                    <div className="flex items-end justify-between"><p className="text-lg font-mono font-bold text-gold-primary">{formatPrice(signal.entry)}</p><p className="text-[10px] text-gold-primary/80">{formatShortDateTime(signal.created_at)}</p></div>
                  </div>
                  {/* Volume */}
                  {signal.volume_rank_num && (
                    <div className="bg-[#111]/80 rounded-lg p-2 border border-gold-primary/15">
                      <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-0.5">📊 Volume Rank <span className="text-gold-primary/60">when called</span></p>
                      <p className="text-base font-bold text-white">#{signal.volume_rank_num}<span className="text-text-muted text-xs font-normal ml-1">/ {signal.volume_rank_den}</span></p>
                    </div>
                  )}
                  {/* TARGETS */}
                  <div className="bg-[#111]/80 rounded-lg p-2 border border-green-500/15">
                    <p className="text-green-400 text-[9px] uppercase tracking-wider font-medium mb-1.5">🎯 Targets</p>
                    <div className="space-y-1">
                      {targets.map((t, i) => (
                        <div key={i} className={`p-1.5 rounded transition-all ${t.hit ? 'bg-green-500/15 border border-green-500/25' : 'bg-black/30'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${t.hit ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-400'}`}>{t.hit ? '✓' : i+1}</div>
                              <span className={`text-[10px] font-medium ${t.hit ? 'text-green-400' : 'text-text-muted'}`}>{t.label}</span>
                            </div>
                            <div className="text-right">
                              <p className={`font-mono text-[10px] ${t.hit ? 'text-white' : 'text-text-muted'}`}>{formatPrice(t.value)}</p>
                              <p className={`text-[9px] font-medium ${t.hit ? 'text-green-400' : 'text-green-400/50'}`}>+{t.pct}%</p>
                            </div>
                          </div>
                          {/* TIMESTAMP ROW - shows when we have real data */}
                          {t.hit && t.reachedAt && (
                            <div className="mt-1 pt-1 border-t border-green-500/15 flex items-center justify-between gap-1">
                              <span className="text-[9px] text-green-400/80">🕐 {formatShortDateTime(t.reachedAt)}</span>
                              <span className="text-[8px] text-green-400/70 bg-green-500/10 px-1 py-0.5 rounded font-mono">{calcTimeDiff(i === 0 ? signal.created_at : (targets[i-1]?.reachedAt || signal.created_at), t.reachedAt) || calcTimeDiff(signal.created_at, t.reachedAt)}</span>
                            </div>
                          )}
                          {/* FALLBACK - hit but no timestamp data (status-based detection) */}
                          {t.hit && !t.reachedAt && (
                            <div className="mt-1 pt-1 border-t border-green-500/10">
                              <span className="text-[8px] text-green-400/40 italic">✓ Reached {!hasRealUpdates ? '(no timestamp data)' : ''}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* STOP LOSS */}
                  <div className={`rounded-lg p-2 border ${isStopped ? 'bg-red-500/10 border-red-500/25' : 'bg-[#111]/80 border-red-500/15'}`}>
                    <p className="text-red-400 text-[9px] uppercase tracking-wider font-medium mb-1.5">🛑 Stop Loss</p>
                    <div className="space-y-1">
                      {stops.map((s, i) => (
                        <div key={i} className={`p-1.5 rounded ${s.hit ? 'bg-red-500/15 border border-red-500/25' : 'bg-black/30'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${s.hit ? 'bg-red-500 text-white' : 'bg-gray-700 text-red-400/50'}`}>{s.hit ? '✗' : i+1}</div>
                              <span className={`text-[10px] font-medium ${s.hit ? 'text-red-400' : 'text-text-muted'}`}>{s.label}</span>
                            </div>
                            <div className="text-right">
                              <p className={`font-mono text-[10px] ${s.hit ? 'text-white' : 'text-text-muted'}`}>{formatPrice(s.value)}</p>
                              <p className="text-[9px] font-medium text-red-400">{s.pct}%</p>
                            </div>
                          </div>
                          {s.hit && s.reachedAt && (
                            <div className="mt-1 pt-1 border-t border-red-500/15 flex items-center justify-between gap-1">
                              <span className="text-[9px] text-red-400/80">🕐 {formatShortDateTime(s.reachedAt)}</span>
                              <span className="text-[8px] text-red-400/70 bg-red-500/10 px-1 py-0.5 rounded font-mono">{calcTimeDiff(signal.created_at, s.reachedAt)}</span>
                            </div>
                          )}
                          {s.hit && !s.reachedAt && (<div className="mt-1 pt-1 border-t border-red-500/10"><span className="text-[8px] text-red-400/40 italic">✗ Stopped {!hasRealUpdates ? '(no timestamp data)' : ''}</span></div>)}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="text-center text-[9px] text-text-muted pt-0.5"><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>Real-time data</span></div>
                </div>
              </div>
            </div>
            {/* BOTTOM BAR */}
            <div className="flex-shrink-0 bg-[#0a0a0a] border-t border-gold-primary/30 px-3 py-2">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-gold-primary/80 text-[10px] font-semibold flex-shrink-0">📊 Analytics:</span>
                  <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar-x">
                    {researchLinks.map((link, i) => (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r ${link.color} rounded-lg transition-all duration-200 flex-shrink-0 group border`}>
                        <img src={link.logo} alt={link.name} className="w-4 h-4 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = link.fallbackLogo; }} />
                        <span className="text-[10px] font-medium text-white/80 group-hover:text-white whitespace-nowrap">{link.name}</span><LinkIcon />
                      </a>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 border-l border-gold-primary/20 pl-4">
                  <span className="text-blue-400/80 text-[10px] font-semibold">💬 Sentiment:</span>
                  {sentimentLinks.map((link, i) => (
                    <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r ${link.color} rounded-lg transition-all duration-200 group border`}>
                      <img src={link.logo} alt={link.name} className="w-4 h-4 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = link.fallbackLogo; }} />
                      <span className="text-[10px] font-medium text-white/80 group-hover:text-white whitespace-nowrap">X / Twitter</span><LinkIcon />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </>)}

          {/* === TRADE TAB === */}
          {activeTab === 'trade' && (
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[#0a0a0a]">
              <div className="max-w-4xl mx-auto">
                <div className="text-center mb-6"><h3 className="text-lg font-display text-white mb-1">Trade {signal.pair}</h3><p className="text-text-muted text-sm">Quick copy trade values</p></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-gradient-to-br from-gold-primary/15 to-transparent rounded-xl p-4 border border-gold-primary/30 cursor-pointer group hover:border-gold-primary/60 transition-all" onClick={() => navigator.clipboard?.writeText(signal.entry?.toString()||'')}><p className="text-text-muted text-[10px] uppercase">Entry</p><p className="text-gold-primary font-mono text-sm">{formatPrice(signal.entry)}</p></div>
                  <div className="bg-gradient-to-br from-red-500/15 to-transparent rounded-xl p-4 border border-red-500/30 cursor-pointer group hover:border-red-500/60 transition-all" onClick={() => navigator.clipboard?.writeText(signal.stop1?.toString()||'')}><p className="text-text-muted text-[10px] uppercase">Stop Loss</p><p className="text-red-400 font-mono text-sm">{formatPrice(signal.stop1)}</p></div>
                  <div className="bg-gradient-to-br from-green-500/15 to-transparent rounded-xl p-4 border border-green-500/30 cursor-pointer group hover:border-green-500/60 transition-all" onClick={() => navigator.clipboard?.writeText(signal.target1?.toString()||'')}><p className="text-text-muted text-[10px] uppercase">TP1</p><p className="text-green-400 font-mono text-sm">{formatPrice(signal.target1)}</p></div>
                  <div className="bg-gradient-to-br from-orange-500/15 to-transparent rounded-xl p-4 border border-orange-500/30 cursor-pointer group hover:border-orange-500/60 transition-all" onClick={() => navigator.clipboard?.writeText((signal.target4||signal.target3||signal.target2||signal.target1)?.toString()||'')}><p className="text-text-muted text-[10px] uppercase">Max TP</p><p className="text-orange-400 font-mono text-sm">{formatPrice(signal.target4||signal.target3||signal.target2||signal.target1)}</p></div>
                </div>
                <p className="text-text-muted text-[9px] text-center mb-8">Click any value to copy to clipboard</p>
                <div className="mb-6">
                  <p className="text-gold-primary text-xs font-semibold mb-3">🏦 Open Trade on Exchange</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {tradeLinks.map((link, i) => (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className={`flex flex-col items-center gap-2 p-4 bg-gradient-to-br ${link.color} rounded-xl transition-all duration-200 group border hover:scale-[1.02]`}>
                        <div className="w-10 h-10 rounded-lg bg-black/30 flex items-center justify-center"><img src={link.logo} alt={link.name} className="w-6 h-6 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = link.fallbackLogo; }} /></div>
                        <p className="text-white text-[11px] font-medium group-hover:text-gold-primary transition-colors text-center">{link.name}</p>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* === RESEARCH TAB === */}
          {activeTab === 'research' && (
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[#0a0a0a]">
              <div className="max-w-4xl mx-auto">
                <div className="text-center mb-5"><h3 className="text-lg font-display text-white mb-1">Research & Analytics</h3><p className="text-text-muted text-sm">Deep dive into <span className="text-gold-primary font-semibold">{coinSymbol}</span></p></div>

                {/* SIGNAL JOURNEY */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-gold-primary text-xs font-semibold">⏱️ Signal Journey</span>
                    {(() => { const lh = [...targets.filter(t=>t.hit&&t.reachedAt),...stops.filter(s=>s.hit&&s.reachedAt)].sort((a,b)=>new Date(b.reachedAt)-new Date(a.reachedAt))[0]; const d = lh&&signal.created_at?calcTimeDiff(signal.created_at,lh.reachedAt):null; return d ? <span className="text-[10px] text-text-muted bg-[#1a1a1a] px-2 py-0.5 rounded font-mono">Total: {d}</span> : <span className="text-[10px] text-cyan-400/70">● Active</span>; })()}
                  </div>
                  <div className="bg-[#111] rounded-xl border border-gold-primary/15 p-4">
                    {timeline.map((ev, idx) => {
                      const isLast = idx === timeline.length-1, isAct = ev.type==='called'||ev.hit;
                      const prev = idx>0?timeline[idx-1]:null, dur = (prev?.time&&ev.time)?calcTimeDiff(prev.time,ev.time):null;
                      return (
                        <div key={idx} className="relative flex gap-3">
                          {!isLast && <div className={`absolute left-[13px] top-[28px] bottom-0 w-[2px] ${isAct?ev.colorClasses.line:'bg-gray-700/30'}`}/>}
                          <div className="flex-shrink-0 z-10 mt-0.5"><div className={`w-[28px] h-[28px] rounded-full flex items-center justify-center text-xs font-bold border-2 ${isAct?`${ev.colorClasses.bg} text-white border-transparent`:'bg-[#1a1a1a] text-gray-500 border-gray-700'}`}>{ev.icon}</div></div>
                          <div className={`flex-1 ${isLast?'pb-0':'pb-4'}`}>
                            <div className={`rounded-lg p-3 border ${isAct?`${ev.colorClasses.bgLight} ${ev.colorClasses.border}`:'bg-[#1a1a1a]/50 border-gray-800/50'}`}>
                              <div className="flex items-center justify-between mb-0.5">
                                <span className={`text-sm font-semibold ${isAct?ev.colorClasses.text:'text-text-muted'}`}>{ev.label}</span>
                                {dur&&isAct&&<span className={`text-[10px] px-1.5 py-0.5 rounded ${ev.colorClasses.bgLight} ${ev.colorClasses.text} font-mono`}>+{dur}</span>}
                              </div>
                              <p className={`text-xs font-mono ${isAct?'text-white/80':'text-text-muted/50'}`}>{ev.sublabel}</p>
                              {ev.time ? (
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <span className={`text-[11px] font-medium ${isAct?ev.colorClasses.text:'text-gray-600'}`}>🕐 {formatDate(ev.time)}</span>
                                  {ev.type!=='called'&&signal.created_at&&<span className="text-[10px] text-text-muted">({calcTimeDiff(signal.created_at,ev.time)} from call)</span>}
                                </div>
                              ) : (
                                <p className="text-[11px] text-gray-600 italic mt-1.5">{ev.hit===false?'Not reached':ev.hit?'✓ Reached (no timestamp)':'Awaiting...'}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Debug hint if no real update data */}
                  {!hasRealUpdates && (
                    <p className="text-[9px] text-yellow-500/50 mt-2 text-center">⚠️ No update timestamps in database. Check: /api/v1/signals/debug/{signal.signal_id}</p>
                  )}
                </div>

                {/* Analytics */}
                <div className="mb-6">
                  <p className="text-gold-primary text-xs font-semibold mb-3">📊 Market Data & Charts</p>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                    {researchLinks.map((link, i) => (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className={`flex flex-col items-center gap-2 p-3 bg-gradient-to-br ${link.color} rounded-xl transition-all duration-200 group border hover:scale-[1.02]`}>
                        <div className="w-10 h-10 rounded-lg bg-black/30 flex items-center justify-center"><img src={link.logo} alt={link.name} className="w-6 h-6 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = link.fallbackLogo; }} /></div>
                        <p className="text-white text-[11px] font-medium group-hover:text-gold-primary transition-colors text-center">{link.name}</p>
                      </a>
                    ))}
                  </div>
                </div>
                {/* Sentiment */}
                <div className="mb-6">
                  <p className="text-blue-400 text-xs font-semibold mb-3">💬 Social Sentiment</p>
                  <a href={sentimentLinks[0].url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-4 bg-gradient-to-r from-gray-800/50 to-gray-900/50 rounded-xl border border-gray-600/30 hover:border-gray-500/50 transition-all group">
                    <div className="w-12 h-12 rounded-xl bg-black flex items-center justify-center"><img src={sentimentLinks[0].logo} alt="X" className="w-7 h-7 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = sentimentLinks[0].fallbackLogo; }} /></div>
                    <div className="flex-1"><p className="text-white font-semibold group-hover:text-gold-primary transition-colors">Twitter / X Live Feed</p><p className="text-text-muted text-sm">See what traders say about ${coinSymbol}</p></div>
                    <svg className="w-5 h-5 text-text-muted group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                </div>
                {/* Summary */}
                <div className="bg-gradient-to-br from-gold-primary/10 to-transparent rounded-xl p-4 border border-gold-primary/25">
                  <h4 className="text-gold-primary font-display text-sm mb-3">Signal Summary</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><p className="text-text-muted text-[10px] uppercase">Entry</p><p className="text-white font-mono text-base mt-0.5">{formatPrice(signal.entry)}</p><p className="text-text-muted text-[9px]">{formatShortDateTime(signal.created_at)}</p></div>
                    <div><p className="text-text-muted text-[10px] uppercase">Status</p><span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold text-white mt-1 ${statusStyles[signal.status?.toLowerCase()]||'bg-gray-500'}`}>{signal.status}</span></div>
                    <div><p className="text-text-muted text-[10px] uppercase">Targets Hit</p><p className="text-white text-base mt-0.5">{hitTargets.filter(Boolean).length} / {targets.length}</p></div>
                    <div><p className="text-text-muted text-[10px] uppercase">Max Profit</p><p className="text-green-400 text-base mt-0.5">+{targets[targets.length-1]?.pct||0}%</p></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar{width:4px}.custom-scrollbar::-webkit-scrollbar-track{background:transparent}.custom-scrollbar::-webkit-scrollbar-thumb{background:rgba(212,168,83,0.3);border-radius:2px}.custom-scrollbar::-webkit-scrollbar-thumb:hover{background:rgba(212,168,83,0.5)}
        .custom-scrollbar-x::-webkit-scrollbar{height:3px}.custom-scrollbar-x::-webkit-scrollbar-track{background:transparent}.custom-scrollbar-x::-webkit-scrollbar-thumb{background:rgba(212,168,83,0.3);border-radius:2px}
        #tv_chart_modal{background:#0d0d0d!important}#tv_chart_modal .tradingview-widget-container{background:#0d0d0d!important}#tv_chart_modal .tradingview-widget-container__widget{background:#0d0d0d!important}#tv_chart_modal .tradingview-widget-copyright{display:none!important}#tv_chart_modal iframe{background:#0d0d0d!important;border:none!important}
      `}</style>
    </div>
  );
};

export default SignalModal;