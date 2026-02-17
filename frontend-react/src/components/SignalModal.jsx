import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CoinLogo from './CoinLogo';

const SignalModal = ({ signal, isOpen, onClose }) => {
  const chartContainerRef = useRef(null);
  const widgetRef = useRef(null);
  const coinInfoFetchedRef = useRef(false);
  const [signalDetail, setSignalDetail] = useState(null);
  const [activeTab, setActiveTab] = useState('chart');
  const [coinInfo, setCoinInfo] = useState(null);
  const [coinInfoLoading, setCoinInfoLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => { setIsClosing(false); onClose(); }, 200);
  };

  // Lock body scroll when modal is open (no more hiding header/nav)
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !signal) return;
    setSignalDetail(null); setCoinInfo(null); setCoinInfoLoading(false);
    coinInfoFetchedRef.current = false; setIsClosing(false);
    const fetchDetail = async () => {
      try { const r = await fetch(`/api/v1/signals/detail/${signal.signal_id}`); if (r.ok) setSignalDetail(await r.json()); }
      catch (e) { console.error('Failed to fetch signal detail:', e); }
    };
    fetchDetail();
  }, [isOpen, signal]);

  useEffect(() => {
    if (!isOpen || !signal || activeTab !== 'research') return;
    if (coinInfo || coinInfoFetchedRef.current) return;
    const sym = (signal.pair || '').replace(/USDT$/i, '').toUpperCase();
    if (!sym) return;
    coinInfoFetchedRef.current = true; setCoinInfoLoading(true);
    fetch(`/api/v1/coingecko/coin-info/${sym}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && !data.error) setCoinInfo(data); })
      .catch(err => console.error('[SignalModal] coin-info error:', err))
      .finally(() => setCoinInfoLoading(false));
  }, [isOpen, signal, activeTab]);

  useEffect(() => {
    const handleEscape = (e) => { if (e.key === 'Escape') handleClose(); };
    if (isOpen) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
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
  const formatShortDateTime = (d) => { if (!d) return null; return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); };
  const calcTimeDiff = (from, to) => {
    if (!from || !to) return null;
    const ms = new Date(to) - new Date(from); if (ms < 0) return null;
    const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) { const rh = h % 24; return rh > 0 ? `${d}d ${rh}h` : `${d}d`; }
    if (h > 0) { const rm = m % 60; return rm > 0 ? `${h}h ${rm}m` : `${h}h`; }
    return `${m}m`;
  };
  const formatPrice = (p) => { if (!p) return '-'; if (p < 0.0001) return p.toFixed(8); if (p < 0.01) return p.toFixed(6); if (p < 1) return p.toFixed(4); return p < 100 ? p.toFixed(4) : p.toFixed(2); };
  const formatBigNum = (n) => { if (!n) return '-'; if (n >= 1e9) return `$${(n/1e9).toFixed(2)}B`; if (n >= 1e6) return `$${(n/1e6).toFixed(2)}M`; if (n >= 1e3) return `$${(n/1e3).toFixed(1)}K`; return `$${n.toFixed(0)}`; };

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
  const riskPct = signal.stop1 && signal.entry ? Math.abs((signal.stop1 - signal.entry) / signal.entry * 100) : null;
  const maxRewardPct = targets.length > 0 ? Math.abs(parseFloat(targets[targets.length - 1].pct)) : null;
  const rrRatio = riskPct && maxRewardPct ? (maxRewardPct / riskPct).toFixed(1) : null;

  // === LINKS ===
  const researchLinks = [
    { name: 'TradingView', url: `https://www.tradingview.com/chart/?symbol=BINANCE:${signal.pair}.P`, logo: 'https://static.tradingview.com/static/images/logo-preview.png', fallbackLogo: 'https://www.google.com/s2/favicons?domain=tradingview.com&sz=64', color: 'from-blue-600/20 to-blue-800/10 border-blue-500/30 hover:border-blue-400' },
    { name: 'CoinGlass', url: `https://www.coinglass.com/currencies/${coinSymbol}`, logo: 'https://www.coinglass.com/favicon.svg', fallbackLogo: 'https://www.google.com/s2/favicons?domain=coinglass.com&sz=64', color: 'from-cyan-600/20 to-cyan-800/10 border-cyan-500/30 hover:border-cyan-400' },
    { name: 'CoinGecko', url: `https://www.coingecko.com/en/coins/${coinSymbolLower}`, logo: 'https://static.coingecko.com/s/thumbnail-007177f3eca19695592f0b8b0eabbdae282b54154e1be912285c9034ea6cbaf2.png', fallbackLogo: 'https://www.google.com/s2/favicons?domain=coingecko.com&sz=64', color: 'from-green-600/20 to-green-800/10 border-green-500/30 hover:border-green-400' },
    { name: 'CoinMarketCap', url: `https://coinmarketcap.com/currencies/${coinSymbolLower}/`, logo: 'https://s2.coinmarketcap.com/static/cloud/img/coinmarketcap_1.svg', fallbackLogo: 'https://www.google.com/s2/favicons?domain=coinmarketcap.com&sz=64', color: 'from-blue-500/20 to-blue-700/10 border-blue-400/30 hover:border-blue-300' },
    { name: 'DexScreener', url: `https://dexscreener.com/search?q=${coinSymbol}`, logo: 'https://dexscreener.com/favicon.png', fallbackLogo: 'https://www.google.com/s2/favicons?domain=dexscreener.com&sz=64', color: 'from-lime-600/20 to-lime-800/10 border-lime-500/30 hover:border-lime-400' },
  ];
  const sentimentLinks = [{ name: 'Twitter / X', url: `https://x.com/search?q=%24${coinSymbol}&src=typed_query&f=live`, logo: 'https://abs.twimg.com/favicons/twitter.3.ico', fallbackLogo: 'https://www.google.com/s2/favicons?domain=x.com&sz=64', color: 'from-gray-600/20 to-gray-800/10 border-gray-500/30 hover:border-gray-400' }];
  const tradeLinks = [
    { name: 'Binance Futures', url: `https://www.binance.com/en/futures/${signal.pair}`, logo: 'https://public.bnbstatic.com/static/images/common/favicon.ico', fallbackLogo: 'https://www.google.com/s2/favicons?domain=binance.com&sz=64', color: 'from-yellow-500/20 to-yellow-700/10 border-yellow-500/30 hover:border-yellow-400' },
    { name: 'Bybit', url: `https://www.bybit.com/trade/usdt/${coinSymbol}USDT`, logo: 'https://www.bybit.com/favicon.ico', fallbackLogo: 'https://www.google.com/s2/favicons?domain=bybit.com&sz=64', color: 'from-orange-500/20 to-orange-700/10 border-orange-500/30 hover:border-orange-400' },
    { name: 'OKX', url: `https://www.okx.com/trade-swap/${coinSymbolLower}-usdt-swap`, logo: 'https://static.okx.com/cdn/assets/imgs/226/DF679CE5D9C03767.png', fallbackLogo: 'https://www.google.com/s2/favicons?domain=okx.com&sz=64', color: 'from-white/10 to-gray-700/10 border-white/20 hover:border-white/40' },
    { name: 'Bitget', url: `https://www.bitget.com/futures/usdt/${coinSymbol}USDT`, logo: 'https://img.bitgetimg.com/image/third/1702472462805.png', fallbackLogo: 'https://www.google.com/s2/favicons?domain=bitget.com&sz=64', color: 'from-cyan-500/20 to-cyan-700/10 border-cyan-500/30 hover:border-cyan-400' },
  ];

  // === TIMELINE ===
  const grayC = { bg: 'bg-gray-700', text: 'text-text-muted', line: 'bg-gray-700/30' };
  const buildTimeline = () => {
    const ev = [];
    ev.push({ type: 'called', label: 'Signal Called', sublabel: `Entry @ ${formatPrice(signal.entry)}`, time: signal.created_at, icon: '📡', hit: true, colorClasses: { bg: 'bg-gold-primary', text: 'text-gold-primary', line: 'bg-gold-primary/40' } });
    const tps = [
      { k: 'tp1', l: 'TP1', v: signal.target1, c: { bg: 'bg-green-500', text: 'text-green-400', line: 'bg-green-500/40' } },
      { k: 'tp2', l: 'TP2', v: signal.target2, c: { bg: 'bg-lime-500', text: 'text-lime-400', line: 'bg-lime-500/40' } },
      { k: 'tp3', l: 'TP3', v: signal.target3, c: { bg: 'bg-yellow-500', text: 'text-yellow-400', line: 'bg-yellow-500/40' } },
      { k: 'tp4', l: 'TP4', v: signal.target4, c: { bg: 'bg-orange-500', text: 'text-orange-400', line: 'bg-orange-500/40' } },
    ];
    tps.forEach((tp, i) => { if (!tp.v) return; const u = getUpdateInfo(tp.k); const h = hitTargets[i]; ev.push({ type: tp.k, label: `${tp.l} Hit`, sublabel: `${formatPrice(tp.v)} (+${calcPct(tp.v, signal.entry)}%)`, time: u?.update_at || null, icon: h ? '✓' : (i+1).toString(), hit: h, colorClasses: h ? tp.c : grayC }); });
    if (signal.stop1) { const su = getUpdateInfo('sl') || getUpdateInfo('sl1'); const sc = { bg: 'bg-red-500', text: 'text-red-400', line: 'bg-red-500/40' }; ev.push({ type: 'sl', label: 'Stop Loss Hit', sublabel: `${formatPrice(signal.stop1)} (${calcPct(signal.stop1, signal.entry)}%)`, time: su?.update_at || null, icon: isStopped ? '✗' : '⊘', hit: isStopped, colorClasses: isStopped ? sc : grayC }); }
    return ev;
  };
  const timeline = buildTimeline();
  const LinkIcon = () => (<svg className="w-2.5 h-2.5 text-white/40 group-hover:text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>);

  // === TargetsPanel ===
  const TargetsPanel = ({ layout }) => {
    const isCompact = layout === 'bottom';
    return (
      <div className={isCompact ? 'p-2.5 space-y-1.5' : 'p-2.5 space-y-2'}>
        <div className="bg-gradient-to-br from-gold-primary/15 to-gold-primary/5 rounded-lg p-2 border border-gold-primary/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gold-primary/70 text-[8px] uppercase tracking-wider font-medium">Entry</p>
              <p className={`font-mono font-bold text-gold-primary ${isCompact ? 'text-sm' : 'text-lg'}`}>{formatPrice(signal.entry)}</p>
            </div>
            <p className="text-[9px] text-gold-primary/70">{formatShortDateTime(signal.created_at)}</p>
          </div>
        </div>
        {isCompact ? (
          <div className="grid grid-cols-2 gap-1.5">
            {targets.map((t, i) => (
              <div key={i} className={`px-2 py-1.5 rounded-lg ${t.hit ? 'bg-green-500/10 border border-green-500/20' : 'bg-white/[0.02] border border-white/5'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-4 h-4 rounded text-[7px] font-bold flex items-center justify-center ${t.hit ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-400'}`}>{t.hit ? '✓' : i+1}</div>
                    <div>
                      <span className={`text-[10px] font-semibold ${t.hit ? 'text-green-400' : 'text-text-muted'}`}>{t.label}</span>
                      <p className={`text-[9px] font-mono ${t.hit ? 'text-white/70' : 'text-text-muted/60'}`}>{formatPrice(t.value)}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono font-bold ${t.hit ? 'text-green-400' : 'text-text-muted'}`}>+{t.pct}%</span>
                </div>
                {t.hit && t.reachedAt && <p className="text-[8px] text-green-400/60 mt-0.5 pl-[22px]">✓ {formatShortDateTime(t.reachedAt)}</p>}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#111]/80 rounded-lg p-2 border border-green-500/15">
            <p className="text-green-400 text-[9px] uppercase tracking-wider font-medium mb-1.5">🎯 Targets</p>
            <div className="space-y-1">{targets.map((t, i) => (
              <div key={i} className={`p-1.5 rounded ${t.hit ? 'bg-green-500/10 border border-green-500/20' : 'bg-white/[0.02] border border-white/5'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-4 h-4 rounded text-[8px] font-bold flex items-center justify-center ${t.hit ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-400'}`}>{t.hit ? '✓' : i+1}</div>
                    <span className={`text-[10px] font-medium ${t.hit ? 'text-green-400' : 'text-text-muted'}`}>{t.label}</span>
                  </div>
                  <span className={`text-[10px] font-mono ${t.hit ? 'text-green-400' : 'text-text-muted'}`}>+{t.pct}%</span>
                </div>
                <p className={`text-[10px] font-mono mt-0.5 ${t.hit ? 'text-white' : 'text-text-muted'}`}>{formatPrice(t.value)}</p>
                {t.hit && t.reachedAt && <p className="text-[8px] text-green-400/60 mt-0.5">✓ {formatShortDateTime(t.reachedAt)}</p>}
              </div>
            ))}</div>
          </div>
        )}
        {stops.length > 0 && (
          isCompact ? (
            <div className="flex gap-1.5">
              {stops.map((s, i) => (
                <div key={i} className={`flex-1 px-2 py-1.5 rounded-lg flex items-center justify-between ${s.hit ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/[0.02] border border-white/5'}`}>
                  <span className={`text-[10px] font-semibold ${s.hit ? 'text-red-400' : 'text-text-muted'}`}>{s.label} <span className="font-mono text-[9px]">{formatPrice(s.value)}</span></span>
                  <span className={`text-[10px] font-mono font-bold ${s.hit ? 'text-red-400' : 'text-text-muted'}`}>{s.pct}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#111]/80 rounded-lg p-2 border border-red-500/15">
              <p className="text-red-400 text-[9px] uppercase tracking-wider font-medium mb-1.5">🛑 Stop Loss</p>
              <div className="space-y-1">{stops.map((s, i) => (
                <div key={i} className={`p-1.5 rounded ${s.hit ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/[0.02] border border-white/5'}`}>
                  <div className="flex items-center justify-between"><span className={`text-[10px] font-medium ${s.hit ? 'text-red-400' : 'text-text-muted'}`}>{s.label}</span><span className={`text-[10px] font-mono ${s.hit ? 'text-red-400' : 'text-text-muted'}`}>{s.pct}%</span></div>
                  <p className={`text-[10px] font-mono mt-0.5 ${s.hit ? 'text-white' : 'text-text-muted'}`}>{formatPrice(s.value)}</p>
                </div>
              ))}</div>
            </div>
          )
        )}
        {!isCompact && (
          <>
            {signal.volume_rank_num && (
              <div className="bg-[#111]/80 rounded-lg p-2 border border-gold-primary/15">
                <p className="text-text-muted text-[9px] uppercase tracking-wider font-medium mb-0.5">📊 Volume Rank</p>
                <p className="text-base font-bold text-white">#{signal.volume_rank_num}<span className="text-text-muted text-xs font-normal ml-1">/ {signal.volume_rank_den}</span></p>
              </div>
            )}
            {(signal.risk_level || signal.market_cap) && (
              <div className="bg-[#111]/80 rounded-lg p-2 border border-gold-primary/10 space-y-1">
                {signal.risk_level && <div className="flex items-center justify-between"><span className="text-text-muted text-[9px]">Risk Level</span><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${signal.risk_level?.toLowerCase().startsWith('low') ? 'bg-green-500/15 text-green-400' : signal.risk_level?.toLowerCase().startsWith('high') ? 'bg-red-500/15 text-red-400' : 'bg-yellow-500/15 text-yellow-400'}`}>{signal.risk_level}</span></div>}
                {signal.market_cap && <div className="flex items-center justify-between"><span className="text-text-muted text-[9px]">Market Cap</span><span className="text-white text-[9px] font-medium">{signal.market_cap}</span></div>}
              </div>
            )}
          </>
        )}
        {/* Compact: inline row for Volume Rank + Risk + Market Cap */}
        {isCompact && (signal.volume_rank_num || signal.risk_level || signal.market_cap) && (
          <div className="flex items-center gap-2 flex-wrap">
            {signal.volume_rank_num && (
              <div className="flex items-center gap-1 px-2 py-1 bg-[#111]/80 rounded-lg border border-gold-primary/10">
                <span className="text-text-muted text-[9px]">📊</span>
                <span className="text-white text-[10px] font-bold">#{signal.volume_rank_num}</span>
                <span className="text-text-muted text-[9px]">/ {signal.volume_rank_den}</span>
              </div>
            )}
            {signal.risk_level && (
              <div className={`px-2 py-1 rounded-lg text-[9px] font-bold ${signal.risk_level?.toLowerCase().startsWith('low') ? 'bg-green-500/15 text-green-400 border border-green-500/20' : signal.risk_level?.toLowerCase().startsWith('high') ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'}`}>
                {signal.risk_level}
              </div>
            )}
            {signal.market_cap && (
              <div className="flex items-center gap-1 px-2 py-1 bg-[#111]/80 rounded-lg border border-gold-primary/10">
                <span className="text-text-muted text-[9px]">Cap</span>
                <span className="text-white text-[9px] font-medium">{signal.market_cap}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ========== RENDER ==========
  const modalContent = (
    <>
      <div className={`signal-modal-overlay ${isClosing ? 'signal-modal-closing' : ''}`}>
        <div className="signal-modal-backdrop" onClick={handleClose} />
        <div className="signal-modal-container">
          <div className="signal-modal-content">
            {/* Drag handle mobile */}
            <div className="sm:hidden flex-shrink-0 flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            {/* Corner ornaments desktop */}
            <div className="absolute top-0 left-0 w-12 h-12 border-t-2 border-l-2 border-gold-primary/50 rounded-tl-2xl pointer-events-none hidden sm:block" />
            <div className="absolute top-0 right-0 w-12 h-12 border-t-2 border-r-2 border-gold-primary/50 rounded-tr-2xl pointer-events-none hidden sm:block" />

            {/* HEADER */}
            <div className="flex-shrink-0 bg-[#0a0a0a] border-b border-gold-primary/30 px-3 sm:px-4 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <CoinLogo pair={signal.pair} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <h2 className="text-white font-display text-sm font-semibold truncate">{signal.pair}</h2>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white flex-shrink-0 ${statusStyles[signal.status?.toLowerCase()] || 'bg-gray-500'}`}>{signal.status?.toUpperCase()}</span>
                    </div>
                    <p className="text-text-muted text-[10px] truncate">{formatShortDateTime(signal.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                  <div className="flex items-center bg-[#111] rounded-lg p-0.5 border border-gold-primary/15">
                    {['chart', 'trade', 'research'].map(tab => (
                      <button key={tab} onClick={() => setActiveTab(tab)} className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded text-[10px] sm:text-[11px] font-semibold transition-all whitespace-nowrap ${activeTab === tab ? 'bg-gold-primary text-black' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}>
                        <span className="sm:hidden">{tab === 'chart' ? '📈' : tab === 'trade' ? '💹' : '🔍'}</span>
                        <span className="hidden sm:inline">{tab === 'chart' ? '📈 Chart' : tab === 'trade' ? '💹 Trade' : '🔍 Research'}</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={handleClose} className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-white bg-[#0a0a0a] hover:bg-red-500/20 border border-gold-primary/20 hover:border-red-500/50 rounded-lg transition-all flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            </div>

            {/* BODY */}
            <div className="flex-1 min-h-0 flex flex-col">

              {/* CHART TAB */}
              {activeTab === 'chart' && (
                <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
                  {/* Chart area - on mobile take remaining space minus panel */}
                  <div className="flex-1 min-w-0 min-h-0 bg-[#0d0d0d]">
                    <div id="tv_chart_modal" ref={chartContainerRef} className="w-full h-full" />
                  </div>
                  {/* Desktop sidebar */}
                  <div className="hidden lg:block w-52 flex-shrink-0 bg-[#0a0a0a] border-l border-gold-primary/20 overflow-y-auto custom-scrollbar">
                    <TargetsPanel layout="sidebar" />
                  </div>
                  {/* Mobile bottom panel - scrollable */}
                  <div className="lg:hidden flex-shrink-0 bg-[#0a0a0a] border-t border-gold-primary/20 overflow-y-auto custom-scrollbar mobile-targets-panel">
                    <TargetsPanel layout="bottom" />
                  </div>
                </div>
              )}

              {/* TRADE TAB */}
              {activeTab === 'trade' && (
                <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-4 custom-scrollbar bg-[#0a0a0a]">
                  <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-3 sm:mb-5">
                      <div className="flex items-center justify-center gap-2 mb-1"><CoinLogo pair={signal.pair} size={24} /><h3 className="text-base sm:text-lg font-display text-white">Trade {signal.pair}</h3></div>
                      <p className="text-text-muted text-xs sm:text-sm">Signal progress & exchange links</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 mb-4 sm:mb-5">
                      <div className="bg-[#111] rounded-xl p-3 sm:p-4 border border-green-500/15">
                        <p className="text-green-400 text-[10px] uppercase tracking-wider font-semibold mb-2">🎯 Targets</p>
                        <div className="space-y-1.5">{targets.map((t, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center ${t.hit ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-400'}`}>{t.hit ? '✓' : i+1}</div>
                              <span className={`text-[11px] ${t.hit ? 'text-green-400' : 'text-text-muted'}`}>{t.label} <span className="font-mono">{formatPrice(t.value)}</span></span>
                            </div>
                            <div className="text-right">
                              <span className={`text-[10px] font-mono font-bold ${t.hit ? 'text-green-400' : 'text-green-400/50'}`}>+{t.pct}%</span>
                              {t.hit && t.reachedAt && <p className="text-[8px] text-green-400/50">{formatShortDateTime(t.reachedAt)}</p>}
                            </div>
                          </div>
                        ))}</div>
                        {stops.length > 0 && (<><div className="border-t border-white/5 my-2" /><p className="text-red-400 text-[10px] uppercase tracking-wider font-semibold mb-1.5">🛑 Stop Loss</p>{stops.map((s, i) => (<div key={i} className="flex items-center justify-between"><span className={`text-[11px] ${s.hit ? 'text-red-400' : 'text-text-muted'}`}>{s.label} <span className="font-mono">{formatPrice(s.value)}</span></span><span className={`text-[10px] font-mono font-bold ${s.hit ? 'text-red-400' : 'text-red-400/50'}`}>{s.pct}%</span></div>))}</>)}
                      </div>
                      <div className="bg-[#111] rounded-xl p-3 sm:p-4 border border-gold-primary/15">
                        <p className="text-gold-primary/70 text-[10px] uppercase tracking-wider font-semibold mb-2">📊 Signal Stats</p>
                        <div className="space-y-2">
                          {rrRatio && <div className="flex items-center justify-between"><span className="text-text-muted text-[11px]">Risk : Reward</span><span className="text-gold-primary text-sm font-bold font-mono">1 : {rrRatio}</span></div>}
                          {riskPct && <div className="flex items-center justify-between"><span className="text-text-muted text-[11px]">Risk %</span><span className="text-red-400 text-[11px] font-mono">-{riskPct.toFixed(2)}%</span></div>}
                          {maxRewardPct && <div className="flex items-center justify-between"><span className="text-text-muted text-[11px]">Max Reward %</span><span className="text-green-400 text-[11px] font-mono">+{maxRewardPct.toFixed(2)}%</span></div>}
                          <div className="flex items-center justify-between"><span className="text-text-muted text-[11px]">Targets Hit</span><span className="text-white text-[11px] font-bold">{hitTargets.filter(Boolean).length} / {targets.length}</span></div>
                          <div className="flex items-center justify-between"><span className="text-text-muted text-[11px]">Status</span><span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold text-white ${statusStyles[signal.status?.toLowerCase()] || 'bg-gray-500'}`}>{signal.status?.toUpperCase()}</span></div>
                          {signal.volume_rank_num && <div className="flex items-center justify-between"><span className="text-text-muted text-[11px]">Volume Rank</span><span className="text-white text-[11px] font-mono">#{signal.volume_rank_num} / {signal.volume_rank_den}</span></div>}
                          {signal.risk_level && <div className="flex items-center justify-between"><span className="text-text-muted text-[11px]">Risk Level</span><span className={`text-[11px] font-bold ${signal.risk_level?.toLowerCase().startsWith('low') ? 'text-green-400' : signal.risk_level?.toLowerCase().startsWith('high') ? 'text-red-400' : 'text-yellow-400'}`}>{signal.risk_level}</span></div>}
                        </div>
                      </div>
                    </div>
                    {/* Timeline */}
                    <div className="mb-4 sm:mb-5">
                      <div className="flex items-center justify-between mb-2.5 sm:mb-3">
                        <span className="text-gold-primary text-xs font-semibold">⏱️ Signal Journey</span>
                        {(() => { const lh = [...targets.filter(t => t.hit && t.reachedAt), ...stops.filter(s => s.hit && s.reachedAt)].sort((a,b) => new Date(b.reachedAt) - new Date(a.reachedAt))[0]; const d = lh && signal.created_at ? calcTimeDiff(signal.created_at, lh.reachedAt) : null; return d ? <span className="text-[10px] text-text-muted bg-[#1a1a1a] px-2 py-0.5 rounded font-mono">Total: {d}</span> : <span className="text-[10px] text-cyan-400/70">● Active</span>; })()}
                      </div>
                      <div className="bg-[#111] rounded-xl border border-gold-primary/15 p-3 sm:p-4">
                        {timeline.map((ev, idx) => {
                          const isLast = idx === timeline.length - 1, isAct = ev.type === 'called' || ev.hit;
                          const prev = idx > 0 ? timeline[idx-1] : null, dur = (prev?.time && ev.time) ? calcTimeDiff(prev.time, ev.time) : null;
                          return (
                            <div key={idx} className="relative flex gap-2.5 sm:gap-3">
                              {!isLast && <div className={`absolute left-[11px] sm:left-[13px] top-[24px] sm:top-[28px] bottom-0 w-[2px] ${isAct ? ev.colorClasses.line : 'bg-gray-700/30'}`} />}
                              <div className="flex-shrink-0 z-10 mt-0.5"><div className={`w-6 h-6 sm:w-[28px] sm:h-[28px] rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold border-2 ${isAct ? `${ev.colorClasses.bg} text-white border-transparent` : 'bg-[#1a1a1a] text-gray-500 border-gray-700'}`}>{ev.icon}</div></div>
                              <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-3 sm:pb-5'}`}>
                                <div className="flex items-center gap-2 flex-wrap"><span className={`text-xs sm:text-sm font-semibold ${isAct ? ev.colorClasses.text : 'text-gray-500'}`}>{ev.label}</span>{dur && <span className="text-[9px] text-text-muted bg-white/5 px-1.5 py-0.5 rounded font-mono">+{dur}</span>}</div>
                                <p className={`text-[10px] sm:text-xs font-mono ${isAct ? 'text-white/70' : 'text-gray-600'}`}>{ev.sublabel}</p>
                                {ev.time && <p className="text-[9px] text-text-muted mt-0.5">{formatShortDateTime(ev.time)}</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Exchange links */}
                    <div className="mb-4 sm:mb-5">
                      <p className="text-gold-primary text-xs font-semibold mb-2.5 sm:mb-3">🏦 Open Trade on Exchange</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
                        {tradeLinks.map((link, i) => (
                          <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className={`flex flex-col items-center gap-1.5 sm:gap-2 p-2.5 sm:p-4 bg-gradient-to-br ${link.color} rounded-xl transition-all group border hover:scale-[1.02] active:scale-95`}>
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-black/30 flex items-center justify-center"><img src={link.logo} alt={link.name} className="w-5 h-5 sm:w-6 sm:h-6 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = link.fallbackLogo; }} /></div>
                            <p className="text-white text-[10px] sm:text-[11px] font-medium group-hover:text-gold-primary text-center">{link.name}</p>
                          </a>
                        ))}
                      </div>
                    </div>
                    {/* Summary */}
                    <div className="bg-gradient-to-br from-gold-primary/10 to-transparent rounded-xl p-3 sm:p-4 border border-gold-primary/25 mb-2">
                      <h4 className="text-gold-primary font-display text-sm mb-2.5 sm:mb-3">Signal Summary</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
                        <div><p className="text-text-muted text-[10px] uppercase">Entry</p><p className="text-white font-mono text-sm mt-0.5">{formatPrice(signal.entry)}</p></div>
                        <div><p className="text-text-muted text-[10px] uppercase">Status</p><span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold text-white mt-1 ${statusStyles[signal.status?.toLowerCase()] || 'bg-gray-500'}`}>{signal.status}</span></div>
                        <div><p className="text-text-muted text-[10px] uppercase">Targets Hit</p><p className="text-white text-sm mt-0.5">{hitTargets.filter(Boolean).length} / {targets.length}</p></div>
                        <div><p className="text-text-muted text-[10px] uppercase">Max Profit</p><p className="text-green-400 text-sm mt-0.5">+{targets[targets.length-1]?.pct || 0}%</p></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* RESEARCH TAB */}
              {activeTab === 'research' && (
                <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-4 custom-scrollbar bg-[#0a0a0a]">
                  <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-3 sm:mb-5"><h3 className="text-base sm:text-lg font-display text-white mb-1">Research & Analytics</h3><p className="text-text-muted text-xs sm:text-sm">Deep dive into <span className="text-gold-primary font-semibold">{coinSymbol}</span></p></div>
                    {coinInfoLoading && (
                      <div className="bg-[#111] rounded-xl p-3 sm:p-4 border border-gold-primary/15 mb-4 sm:mb-5 animate-pulse">
                        <div className="flex items-center gap-3 mb-3"><div className="w-8 h-8 rounded-full bg-gold-primary/10" /><div><div className="h-4 bg-gold-primary/10 rounded w-32 mb-1" /><div className="h-3 bg-white/5 rounded w-48" /></div></div>
                        <div className="space-y-2"><div className="h-3 bg-white/5 rounded w-full" /><div className="h-3 bg-white/5 rounded w-5/6" /><div className="h-3 bg-white/5 rounded w-4/6" /></div>
                      </div>
                    )}
                    {coinInfo && (
                      <div className="bg-[#111] rounded-xl p-3 sm:p-4 border border-gold-primary/15 mb-4 sm:mb-5">
                        <div className="flex items-center gap-3 mb-3">
                          {coinInfo.image_thumb && <img src={coinInfo.image_thumb} alt={coinInfo.name} className="w-8 h-8 rounded-full" />}
                          <div>
                            <h4 className="text-white font-semibold text-sm">{coinInfo.name} <span className="text-text-muted font-normal">({coinInfo.symbol})</span></h4>
                            {coinInfo.categories?.length > 0 && <p className="text-text-muted text-[10px]">{coinInfo.categories.join(' · ')}</p>}
                          </div>
                        </div>
                        {coinInfo.description && <p className="text-text-muted text-xs leading-relaxed mb-3 line-clamp-4 sm:line-clamp-none">{coinInfo.description}</p>}
                        {coinInfo.market_data && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-white/5">
                            {coinInfo.market_data.current_price != null && <div><p className="text-text-muted text-[9px] uppercase">Price</p><p className="text-white text-xs font-mono">${coinInfo.market_data.current_price.toLocaleString()}</p></div>}
                            {coinInfo.market_data.market_cap != null && <div><p className="text-text-muted text-[9px] uppercase">Market Cap</p><p className="text-white text-xs">{formatBigNum(coinInfo.market_data.market_cap)}</p></div>}
                            {coinInfo.market_data.market_cap_rank != null && <div><p className="text-text-muted text-[9px] uppercase">Rank</p><p className="text-white text-xs font-mono">#{coinInfo.market_data.market_cap_rank}</p></div>}
                            {coinInfo.market_data.total_volume != null && <div><p className="text-text-muted text-[9px] uppercase">24h Volume</p><p className="text-white text-xs">{formatBigNum(coinInfo.market_data.total_volume)}</p></div>}
                            {coinInfo.market_data.price_change_24h_pct != null && <div><p className="text-text-muted text-[9px] uppercase">24h</p><p className={`text-xs font-mono ${coinInfo.market_data.price_change_24h_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>{coinInfo.market_data.price_change_24h_pct >= 0 ? '+' : ''}{coinInfo.market_data.price_change_24h_pct.toFixed(2)}%</p></div>}
                            {coinInfo.market_data.price_change_7d_pct != null && <div><p className="text-text-muted text-[9px] uppercase">7d</p><p className={`text-xs font-mono ${coinInfo.market_data.price_change_7d_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>{coinInfo.market_data.price_change_7d_pct >= 0 ? '+' : ''}{coinInfo.market_data.price_change_7d_pct.toFixed(2)}%</p></div>}
                            {coinInfo.market_data.ath != null && <div><p className="text-text-muted text-[9px] uppercase">ATH</p><p className="text-white text-xs font-mono">${coinInfo.market_data.ath.toLocaleString()}</p>{coinInfo.market_data.ath_change_pct != null && <p className="text-red-400/70 text-[8px] font-mono">{coinInfo.market_data.ath_change_pct.toFixed(1)}%</p>}</div>}
                            {coinInfo.market_data.circulating_supply != null && <div><p className="text-text-muted text-[9px] uppercase">Supply</p><p className="text-white text-xs">{(coinInfo.market_data.circulating_supply / 1e6).toFixed(1)}M</p></div>}
                          </div>
                        )}
                        {coinInfo.links && (
                          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/5">
                            {coinInfo.links.homepage && <a href={coinInfo.links.homepage} target="_blank" rel="noopener noreferrer" className="text-[9px] text-gold-primary/70 hover:text-gold-primary bg-gold-primary/10 px-2 py-1 rounded transition-colors">🌐 Website</a>}
                            {coinInfo.links.twitter && <a href={`https://twitter.com/${coinInfo.links.twitter}`} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-400/70 hover:text-blue-400 bg-blue-500/10 px-2 py-1 rounded transition-colors">🐦 @{coinInfo.links.twitter}</a>}
                            {coinInfo.links.telegram && <a href={`https://t.me/${coinInfo.links.telegram}`} target="_blank" rel="noopener noreferrer" className="text-[9px] text-cyan-400/70 hover:text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded transition-colors">📨 Telegram</a>}
                            {coinInfo.links.subreddit && <a href={coinInfo.links.subreddit} target="_blank" rel="noopener noreferrer" className="text-[9px] text-orange-400/70 hover:text-orange-400 bg-orange-500/10 px-2 py-1 rounded transition-colors">🤖 Reddit</a>}
                            {coinInfo.links.github && <a href={coinInfo.links.github} target="_blank" rel="noopener noreferrer" className="text-[9px] text-gray-400/70 hover:text-gray-400 bg-gray-500/10 px-2 py-1 rounded transition-colors">💻 GitHub</a>}
                          </div>
                        )}
                      </div>
                    )}
                    {!coinInfo && !coinInfoLoading && (
                      <div className="bg-[#111] rounded-xl p-3 sm:p-4 border border-white/5 mb-4 sm:mb-5 text-center">
                        <p className="text-text-muted text-xs">Coin info not available for <span className="text-gold-primary font-mono">{coinSymbol}</span></p>
                      </div>
                    )}
                    <div className="mb-3 sm:mb-5">
                      <p className="text-gold-primary text-xs font-semibold mb-2.5 sm:mb-3">🔗 Research Links</p>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {researchLinks.map((link, i) => (
                          <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-gradient-to-r ${link.color} rounded-lg transition-all group border active:scale-95`}>
                            <img src={link.logo} alt={link.name} className="w-3.5 h-3.5 sm:w-4 sm:h-4 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = link.fallbackLogo; }} />
                            <span className="text-[10px] sm:text-[11px] font-medium text-white/80 group-hover:text-white whitespace-nowrap">{link.name}</span><LinkIcon />
                          </a>
                        ))}
                      </div>
                    </div>
                    <div className="mb-2">
                      <p className="text-gold-primary text-xs font-semibold mb-2.5 sm:mb-3">💬 Sentiment</p>
                      <a href={sentimentLinks[0].url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-gradient-to-br from-gray-700/20 to-gray-900/10 rounded-xl border border-gray-600/30 hover:border-gray-500/50 group transition-all active:scale-[0.98]">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-black flex items-center justify-center flex-shrink-0"><img src={sentimentLinks[0].logo} alt="X" className="w-6 h-6 sm:w-7 sm:h-7 object-contain" onError={(e) => { e.target.onerror = null; e.target.src = sentimentLinks[0].fallbackLogo; }} /></div>
                        <div className="flex-1 min-w-0"><p className="text-white font-semibold text-sm group-hover:text-gold-primary transition-colors">Twitter / X Live Feed</p><p className="text-text-muted text-xs sm:text-sm truncate">See what traders say about ${coinSymbol}</p></div>
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-text-muted group-hover:text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* === STYLES === */}
      <style>{`
        .signal-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 100000;
          display: flex;
          align-items: center;
          justify-content: center;
          isolation: isolate;
        }
        .signal-modal-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.85);
        }
        .signal-modal-container {
          position: relative;
          z-index: 1;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }
        .signal-modal-content {
          position: relative;
          width: 100%;
          max-width: 1400px;
          height: 100%;
          background: #0a0506;
          border: 1px solid rgba(212,168,83,0.4);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* Desktop: centered card with padding and rounded corners */
        @media(min-width:640px) {
          .signal-modal-container { padding: 12px; }
          .signal-modal-content {
            max-height: calc(100vh - 24px);
            border-radius: 16px;
            box-shadow: 0 25px 50px rgba(0,0,0,0.5), 0 0 40px rgba(212,168,83,0.1);
          }
        }
        @media(min-width:1024px) {
          .signal-modal-container { padding: 20px; }
          .signal-modal-content { max-height: 880px; }
        }

        /* Mobile: true fullscreen, no gaps, no border */
        @media(max-width:639px) {
          .signal-modal-content {
            max-height: 100%;
            height: 100%;
            border-radius: 0;
            border: none;
          }
        }

        @supports(height:100dvh) {
          .signal-modal-overlay { height: 100dvh; }
        }

        /* Mobile targets panel */
        .mobile-targets-panel {
          max-height: 40vh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        /* Animations */
        .signal-modal-backdrop { animation: smBI .25s ease-out; }
        .signal-modal-content { animation: smCI .3s cubic-bezier(.16,1,.3,1); }
        .signal-modal-closing .signal-modal-backdrop { animation: smBO .2s ease-in forwards; }
        .signal-modal-closing .signal-modal-content { animation: smCO .2s ease-in forwards; }
        @keyframes smBI { from{opacity:0} to{opacity:1} }
        @keyframes smBO { from{opacity:1} to{opacity:0} }
        @keyframes smCI { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
        @keyframes smCO { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(.97)} }
        @media(max-width:639px) {
          .signal-modal-content { animation: smUp .3s cubic-bezier(.16,1,.3,1); }
          .signal-modal-closing .signal-modal-content { animation: smDn .2s ease-in forwards; }
          @keyframes smUp { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
          @keyframes smDn { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(40px)} }
        }

        /* Scrollbar */
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(212,168,83,.3); border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(212,168,83,.5); }

        /* TradingView */
        #tv_chart_modal { background: #0d0d0d !important; }
        #tv_chart_modal .tradingview-widget-container { background: #0d0d0d !important; }
        #tv_chart_modal .tradingview-widget-container__widget { background: #0d0d0d !important; }
        #tv_chart_modal .tradingview-widget-copyright { display: none !important; }
        #tv_chart_modal iframe { background: #0d0d0d !important; border: none !important; }
      `}</style>
    </>
  );

  return createPortal(modalContent, document.body);
};

export default SignalModal;