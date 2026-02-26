import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next'; // <-- 1. Import i18n
import CoinLogo from './CoinLogo';

const API_BASE = '/api/v1';

// Rank medal colors
const RANK_STYLES = [
  { bg: 'bg-gradient-to-br from-yellow-400 to-amber-600', text: 'text-black', shadow: 'shadow-amber-500/30' },
  { bg: 'bg-gradient-to-br from-gray-300 to-gray-500', text: 'text-black', shadow: 'shadow-gray-400/20' },
  { bg: 'bg-gradient-to-br from-amber-600 to-amber-800', text: 'text-white', shadow: 'shadow-amber-700/20' },
  { bg: 'bg-bg-card border border-gold-primary/20', text: 'text-gold-primary', shadow: '' },
  { bg: 'bg-bg-card border border-gold-primary/20', text: 'text-gold-primary', shadow: '' },
];

const TopPerformers = () => {
  const { t } = useTranslation(); // <-- 2. Panggil penerjemah
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalSignalIds, setModalSignalIds] = useState([]);
  const [modalIndex, setModalIndex] = useState(0);
  const [modalItem, setModalItem] = useState(null);
  const [signalDetail, setSignalDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const presets = [
    { key: '1d', label: t('top.d1'), days: 1 },
    { key: '7d', label: t('top.d7'), days: 7 },
    { key: '30d', label: t('top.d30'), days: 30 },
    { key: 'custom', label: t('top.custom'), days: null },
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
      } else { setLoading(false); return; }
      const res = await fetch(url);
      if (res.ok) setData(await res.json());
    } catch (err) { console.error('Top performers fetch error:', err); }
    finally { setLoading(false); }
  }, [activeFilter, customFrom, customTo]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (activeFilter === 'custom') return;
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [activeFilter, fetchData]);

  const fetchDetail = useCallback(async (signalId) => {
    setDetailLoading(true); setSignalDetail(null);
    try {
      const res = await fetch(`${API_BASE}/signals/detail/${signalId}`);
      if (res.ok) setSignalDetail(await res.json());
    } catch (err) { console.error(err); }
    finally { setDetailLoading(false); }
  }, []);

  const handleItemClick = (item) => {
    if (!item.signal_id) return;
    const ids = item.all_signal_ids?.length > 0 ? item.all_signal_ids : [item.signal_id];
    const bestIdx = ids.indexOf(item.signal_id);
    setModalSignalIds(ids);
    setModalIndex(bestIdx >= 0 ? bestIdx : 0);
    setModalItem(item);
    setModalOpen(true);
    fetchDetail(item.signal_id);
  };

  const goToSignal = (i) => { if (i >= 0 && i < modalSignalIds.length) { setModalIndex(i); fetchDetail(modalSignalIds[i]); } };
  const closeModal = () => { setModalOpen(false); setModalSignalIds([]); setModalIndex(0); setModalItem(null); setSignalDetail(null); };
  const handlePresetClick = (k) => { if (k === 'custom') { setShowCustom(true); setActiveFilter('custom'); } else { setShowCustom(false); setActiveFilter(k); } };
  const handleCustomApply = () => { if (customFrom && customTo) fetchData(); };

  const cleanPair = (p) => p ? p.replace(/^3A/, '').replace(/USDT$/i, '') + 'USDT' : '???';
  const coinSymbol = (p) => p ? p.replace(/^3A/, '').replace(/USDT$/i, '') : '???';
  const maxGain = data?.top_gainers?.length > 0 ? Math.max(...data.top_gainers.map(i => i.gain_pct || 0)) : 1;

  if (loading && !data) {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-3xl font-bold text-white">{t('top.title')}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1].map(i => (
            <div key={i} className="bg-bg-card rounded-xl p-5 border border-gold-primary/10 animate-pulse">
              <div className="h-5 w-40 bg-bg-primary/50 rounded mb-4" />
              {[...Array(5)].map((_, j) => <div key={j} className="h-14 bg-bg-primary/30 rounded-lg mb-2" />)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 relative">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-3xl font-bold text-white">{t('top.title')}</h2>
        </div>
        <div className="flex items-center gap-2">
          {presets.map(({ key, label }) => (
            <button key={key} onClick={() => handlePresetClick(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeFilter === key ? 'bg-gold-primary text-bg-primary' : 'bg-bg-card/60 text-text-muted border border-gold-primary/10 hover:border-gold-primary/30 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {showCustom && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-bg-card/40 rounded-xl border border-gold-primary/10">
          <span className="text-text-muted text-xs">{t('top.from')}</span>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="px-3 py-1.5 bg-bg-primary border border-gold-primary/20 rounded-lg text-white text-sm focus:outline-none focus:border-gold-primary/50 [color-scheme:dark]" />
          <span className="text-text-muted text-xs">{t('top.to')}</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="px-3 py-1.5 bg-bg-primary border border-gold-primary/20 rounded-lg text-white text-sm focus:outline-none focus:border-gold-primary/50 [color-scheme:dark]" />
          <button onClick={handleCustomApply} disabled={!customFrom || !customTo} className="px-4 py-1.5 bg-gold-primary text-bg-primary rounded-lg text-xs font-bold hover:bg-gold-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed">{t('top.apply')}</button>
        </div>
      )}

      {data?.period && (
        <div className="mb-4">
          <span className="inline-block px-4 py-2 bg-gold-primary/10 border border-gold-primary/20 rounded-lg text-gold-primary text-xs font-semibold">📅 {data.period}</span>
        </div>
      )}

      {data && (data.total_tp_hits || data.total_tp4) > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label={t('top.total_tp')} value={data.total_tp_hits || data.total_tp4} sub={t('top.tp_sub')} />
          <StatCard label={t('top.unique_pairs')} value={data.unique_pairs || '—'} sub={t('top.pairs_sub')} valueClass="text-gold-primary" />
          <StatCard label={t('top.avg_gain')} value={`${data.top_gainers?.length > 0 ? (data.top_gainers.reduce((a, b) => a + b.gain_pct, 0) / data.top_gainers.length).toFixed(2) : '0'}%`} sub={t('top.gain_sub')} valueClass="text-green-400" borderClass="border-green-500/10" />
          <StatCard label={t('top.avg_dur')} value={data.top_gainers?.length > 0 ? formatDuration(data.top_gainers.reduce((a, b) => a + b.duration_seconds, 0) / data.top_gainers.length) : 'N/A'} sub={t('top.dur_sub')} />
        </div>
      )}

      {data && (data.total_tp_hits || data.total_tp4) === 0 && !loading && (
        <div className="text-center py-8 mb-4 bg-bg-card/40 rounded-xl border border-gold-primary/10"><p className="text-text-muted text-sm">{t('top.no_tp')}</p></div>
      )}

      {data && (data.top_gainers?.length > 0 || data.fastest_hits?.length > 0) && (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${loading ? 'opacity-50' : ''}`}>
          {/* TOP GAINERS */}
          <div className="bg-bg-card rounded-xl border border-gold-primary/10 overflow-hidden">
            <div className="px-5 py-3 border-b border-gold-primary/10 flex items-center gap-2">
              <span>🏆</span>
              <h3 className="text-gold-primary font-semibold text-sm uppercase tracking-wider">{t('top.top_gainers')}</h3>
            </div>
            <div className="p-3 space-y-1.5">
              {data.top_gainers?.map((item, idx) => {
                const barW = maxGain > 0 ? Math.max((item.gain_pct / maxGain) * 100, 8) : 8;
                const rank = RANK_STYLES[Math.min(idx, RANK_STYLES.length - 1)];
                return (
                  <div key={idx} onClick={() => handleItemClick(item)}
                    className="relative flex items-center gap-3 px-3 py-3.5 bg-bg-primary/40 rounded-lg border border-green-500/10 hover:border-green-500/30 hover:bg-bg-primary/60 transition-all cursor-pointer group overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-green-500/[0.06] rounded-lg" style={{ width: `${barW}%` }} />
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 relative z-10 text-xs font-bold ${rank.bg} ${rank.text} ${rank.shadow}`}>
                      {idx + 1}
                    </div>
                    <div className="flex-shrink-0 relative z-10"><CoinLogo pair={cleanPair(item.pair)} size={32} /></div>
                    <div className="flex-1 min-w-0 relative z-10">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-semibold text-sm group-hover:text-gold-primary transition-colors">{coinSymbol(item.pair)}</span>
                        {item.tp_level && <span className="px-1.5 py-0.5 bg-green-500/15 text-green-400 text-[10px] font-bold rounded leading-none">{item.tp_level.trim()}</span>}
                        {item.signal_count > 1 && <span className="px-1.5 py-0.5 bg-gold-primary/15 text-gold-primary text-[9px] font-semibold rounded leading-none">{t('top.called')} {item.signal_count}x</span>}
                      </div>
                      <p className="text-text-muted text-[10px] mt-0.5">
                        {t('top.first_entry')} ${formatPrice(item.entry)}
                        <span className="text-text-muted/40 mx-1">·</span>
                        {item.duration_display} {t('top.to_last_tp')}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 relative z-10">
                      <span className="text-green-400 font-mono font-bold text-sm">+{item.gain_pct.toFixed(2)}%</span>
                    </div>
                  </div>
                );
              })}
              {(!data.top_gainers || data.top_gainers.length === 0) && <p className="text-text-muted text-sm text-center py-4">{t('top.no_data')}</p>}
            </div>
          </div>

          {/* FASTEST HITS */}
          <div className="bg-bg-card rounded-xl border border-gold-primary/10 overflow-hidden">
            <div className="px-5 py-3 border-b border-gold-primary/10 flex items-center gap-2">
              <span>⚡</span>
              <h3 className="text-gold-primary font-semibold text-sm uppercase tracking-wider">{t('top.fastest_hits')}</h3>
            </div>
            <div className="p-3 space-y-1.5">
              {data.fastest_hits?.map((item, idx) => {
                const rank = RANK_STYLES[Math.min(idx, RANK_STYLES.length - 1)];
                return (
                  <div key={idx} onClick={() => handleItemClick(item)}
                    className="flex items-center gap-3 px-3 py-3.5 bg-bg-primary/40 rounded-lg border border-yellow-500/10 hover:border-yellow-500/30 hover:bg-bg-primary/60 transition-all cursor-pointer group">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${rank.bg} ${rank.text} ${rank.shadow}`}>{idx + 1}</div>
                    <div className="flex-shrink-0"><CoinLogo pair={cleanPair(item.pair)} size={32} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold text-sm group-hover:text-gold-primary transition-colors">{coinSymbol(item.pair)}</span>
                        {item.tp_level && <span className="px-1.5 py-0.5 bg-yellow-500/15 text-yellow-400 text-[10px] font-bold rounded leading-none">{item.tp_level.trim()}</span>}
                      </div>
                      <p className="text-text-muted text-[10px] mt-0.5">
                        {t('top.entry')} ${formatPrice(item.entry)}
                        <span className="text-text-muted/40 mx-1">·</span>
                        <span className="text-green-400">+{item.gain_pct.toFixed(2)}%</span>
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-yellow-400 font-mono font-bold text-sm">{item.duration_display}</span>
                    </div>
                  </div>
                );
              })}
              {(!data.fastest_hits || data.fastest_hits.length === 0) && <p className="text-text-muted text-sm text-center py-4">{t('top.no_data')}</p>}
            </div>
          </div>
        </div>
      )}

      {modalOpen && modalItem && (
        <SignalDetailModal item={modalItem} detail={signalDetail} loading={detailLoading}
          signalIds={modalSignalIds} currentIndex={modalIndex} onNavigate={goToSignal}
          onClose={closeModal} cleanPair={cleanPair} t={t} /> 
      )}
    </div>
  );
};

const StatCard = ({ label, value, sub, valueClass = 'text-white', borderClass = 'border-gold-primary/10' }) => (
  <div className={`bg-bg-card/60 rounded-xl p-4 border ${borderClass}`}>
    <p className="text-text-muted text-[10px] uppercase tracking-wider font-medium">{label}</p>
    <p className={`font-mono text-2xl font-bold mt-1 ${valueClass}`}>{value}</p>
    <p className="text-text-muted text-[10px] mt-0.5">{sub}</p>
  </div>
);

// ════════════════════════════════════════════
// REVISED: SignalDetailModal (Sekarang menerima 't' sebagai props)
// ════════════════════════════════════════════
const SignalDetailModal = ({ item, detail, loading, signalIds, currentIndex, onNavigate, onClose, cleanPair, t }) => {
  const [lightboxImg, setLightboxImg] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const [showTV, setShowTV] = useState(false);
  
  const pair = cleanPair(item.pair || detail?.pair);
  const total = signalIds.length;
  const multi = total > 1;

  useEffect(() => { setShowTV(false); }, [currentIndex]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => { setIsClosing(false); onClose(); }, 200);
  };

  useEffect(() => { 
    document.body.style.overflow = 'hidden'; 
    return () => { document.body.style.overflow = ''; }; 
  }, []);

  useEffect(() => {
    const h = (e) => { 
      if (e.key === 'Escape') {
        if (lightboxImg) setLightboxImg(null); else handleClose();
      }
      if (multi && !lightboxImg) {
        if (e.key === 'ArrowLeft') onNavigate(currentIndex - 1); 
        if (e.key === 'ArrowRight') onNavigate(currentIndex + 1); 
      }
    };
    window.addEventListener('keydown', h); 
    return () => window.removeEventListener('keydown', h);
  }, [handleClose, onNavigate, currentIndex, multi, lightboxImg]);

  const fmtDt = (ts) => { if (!ts) return '—'; try { return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); } catch { return ts; } };
  const fmtDiff = (f, t) => { if (!f || !t) return '—'; try { const d = (new Date(t) - new Date(f)) / 1000; if (d <= 0) return '< 1s'; const dd = Math.floor(d/86400), hh = Math.floor((d%86400)/3600), mm = Math.floor((d%3600)/60), ss = Math.floor(d%60); if (dd > 0) return `${dd}d ${hh}h`; if (hh > 0) return `${hh}h ${mm}m`; if (mm > 0) return `${mm}m`; return `${ss}s`; } catch { return '—'; } };
  
  const status = detail?.status?.toLowerCase() || 'open';
  const isStopped = ['closed_loss', 'sl'].includes(status);
  const sLabel = (s) => ({ closed_win: 'WIN', closed_loss: 'LOSS', tp1: 'TP1', tp2: 'TP2', tp3: 'TP3', tp4: 'TP4', open: 'OPEN' }[s?.toLowerCase()] || s?.toUpperCase() || 'OPEN');
  const sColor = (s) => (s?.toLowerCase() === 'closed_win' || s?.toLowerCase().startsWith('tp')) ? 'bg-green-500' : (s?.toLowerCase() === 'closed_loss' || s?.toLowerCase() === 'sl') ? 'bg-red-500' : 'bg-cyan-500';
  
  const themeColors = {
    gold:  { bg: 'bg-gold-primary/10', text: 'text-gold-primary', border: 'border-gold-primary/30', line: 'bg-gold-primary/30', dot: 'bg-gold-primary' },
    green: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30', line: 'bg-green-500/30', dot: 'bg-green-400' },
    red:   { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', line: 'bg-red-500/30', dot: 'bg-red-400' }
  };

  const created = detail?.created_at || item.signal_time;
  const entryImg = detail?.entry_chart_url;
  const afterImg = detail?.latest_chart_url;
  const hasAnyImg = entryImg || afterImg;
  const showInteractiveRight = showTV || (!afterImg && entryImg);

  useEffect(() => {
    let widget = null;
    const shouldMountTV = (!hasAnyImg && detail) || (hasAnyImg && showInteractiveRight);
    
    const initTV = () => {
      if (!document.getElementById('tv_chart_modal_topperf')) return;
      widget = new window.TradingView.widget({
        container_id: 'tv_chart_modal_topperf',
        autosize: true, symbol: `BINANCE:${pair.replace('USDT', '')}USDT.P`,
        interval: '60', timezone: 'Asia/Jakarta', theme: 'dark', style: '1', locale: 'en',
        toolbar_bg: '#0a0a0f', enable_publishing: false, backgroundColor: '#0d0d0d',
        gridColor: 'rgba(212, 168, 83, 0.05)', hide_top_toolbar: false, hide_legend: false,
        hide_side_toolbar: false, allow_symbol_change: true, save_image: false, studies: ["STD;SMA"],
      });
    };

    if (shouldMountTV) {
      const timer = setTimeout(() => {
        if (window.TradingView) initTV();
        else {
          const s = document.createElement('script');
          s.src = 'https://s3.tradingview.com/tv.js'; s.async = true; s.onload = initTV;
          document.head.appendChild(s);
        }
      }, 100);
      return () => { clearTimeout(timer); if (widget) { try { widget.remove(); } catch (e) {} } };
    }
  }, [pair, hasAnyImg, showInteractiveRight, detail]);

  const events = [];
  events.push({ 
    label: t('top.called_sig'), time: 'T+0', sub: fmtDt(created), 
    detail: `${t('top.entry')} @ $${formatPrice(detail?.entry)}`, 
    colors: themeColors.gold, isSL: false 
  });
  
  if (detail?.updates) {
    detail.updates.forEach((u) => {
      const isSL = u.update_type === 'sl' || u.update_type === 'sl1' || u.update_type === 'sl2';
      events.push({
        label: isSL ? t('top.sl_hit') : `${u.update_type?.toUpperCase().replace('TP','TP ')} ${t('top.hit')}`,
        time: `+${fmtDiff(created, u.update_at)}`,
        sub: fmtDt(u.update_at),
        detail: u.price > 0 ? `$${formatPrice(u.price)}${!isSL && detail.entry > 0 ? ` (+${((Math.abs(u.price - detail.entry) / detail.entry) * 100).toFixed(2)}%)` : ''}` : null,
        colors: isSL ? themeColors.red : themeColors.green,
        isSL: isSL
      });
    });
  }

  const modalContent = (
    <div className={`fixed inset-0 z-[100000] flex items-start justify-center px-3 py-4 sm:px-6 md:px-8 pt-[80px] sm:pt-[100px] pb-6 isolation-isolate ${isClosing ? 'animate-[smBO_.2s_ease-in_forwards]' : 'animate-[smBI_.25s_ease-out]'}`}>
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={handleClose} />
      
      <div className={`relative w-full max-w-6xl bg-[#0a0506] border border-gold-primary/40 rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[calc(100dvh-110px)] sm:max-h-[calc(100dvh-130px)] ${isClosing ? 'animate-[smDn_.2s_ease-in_forwards] md:animate-[smCO_.2s_ease-in_forwards]' : 'animate-[smUp_.3s_cubic-bezier(.16,1,.3,1)] md:animate-[smCI_.3s_cubic-bezier(.16,1,.3,1)]'}`}>
        
        <div className="md:hidden flex-shrink-0 flex justify-center pt-2 pb-1 bg-[#0a0a0a]"><div className="w-10 h-1 rounded-full bg-white/20" /></div>

        <div className="flex-shrink-0 bg-[#0a0a0a] border-b border-gold-primary/30 px-4 py-3 z-10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <CoinLogo pair={pair} size={32} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-white font-display text-base font-semibold truncate">{pair}</h2>
                  {status && <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase ${sColor(status)}`}>{sLabel(status)}</span>}
                  {detail?.risk_level && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-gold-primary/30 text-gold-primary">{detail.risk_level}</span>}
                </div>
                <p className="text-text-muted text-xs mt-0.5 truncate">{t('top.called_sig')}: {fmtDt(created)}</p>
              </div>
            </div>
            <button onClick={handleClose} className="w-8 h-8 rounded-lg bg-[#0a0a0a] border border-gold-primary/20 hover:bg-red-500/20 hover:border-red-500/50 flex items-center justify-center text-text-muted hover:text-white transition-all flex-shrink-0 ml-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          
          {multi && (
            <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-gold-primary/10">
              <button onClick={() => onNavigate(currentIndex - 1)} disabled={currentIndex <= 0} className="px-3 py-1 rounded border border-gold-primary/20 text-gold-primary hover:bg-gold-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] sm:text-xs font-bold">← {t('top.prev')}</button>
              <div className="flex items-center gap-2">
                <span className="text-text-muted text-[10px] sm:text-xs hidden sm:inline">{t('top.signal')}</span>
                <div className="flex items-center gap-1">
                  {signalIds.map((_, i) => (
                    <button key={i} onClick={() => onNavigate(i)} className={`w-5 h-5 sm:w-6 sm:h-6 rounded text-[9px] sm:text-[10px] font-bold transition-all ${i === currentIndex ? 'bg-gold-primary text-black' : 'border border-gold-primary/20 text-text-muted hover:text-white hover:bg-white/5'}`}>{i + 1}</button>
                  ))}
                </div>
              </div>
              <button onClick={() => onNavigate(currentIndex + 1)} disabled={currentIndex >= total - 1} className="px-3 py-1 rounded border border-gold-primary/20 text-gold-primary hover:bg-gold-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] sm:text-xs font-bold">{t('top.next')} →</button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0a0a0a] px-4 py-4 sm:px-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="w-10 h-10 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gold-primary font-mono text-sm">{t('top.loading')}</p>
              </div>
            </div>
          ) : detail ? (
            <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8 pb-4">
              
              <div className="w-full">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gold-primary text-xs sm:text-sm font-semibold flex items-center gap-2">📸 {t('top.trade_proof')}</span>
                  {detail.message_link && (
                    <a href={detail.message_link} target="_blank" rel="noopener noreferrer" className="text-[10px] sm:text-[11px] px-3 py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded border border-blue-500/20 transition-colors">
                      {t('top.view_tg')}
                    </a>
                  )}
                </div>
                
                {!hasAnyImg ? (
                  <div className="w-full h-[350px] sm:h-[450px] md:h-[500px] bg-[#0d0d0d] rounded-xl border border-gold-primary/20 overflow-hidden relative shadow-lg">
                     <div id="tv_chart_modal_topperf" className="absolute inset-0 w-full h-full" />
                  </div>
                ) : (
                  <div className="flex flex-col md:flex-row items-stretch gap-4 sm:gap-5 w-full">
                    
                    <div className="flex-1 w-full min-w-0 flex flex-col">
                      <div className="flex items-center justify-between mb-2 px-1">
                        <span className="text-blue-400 text-[10px] sm:text-xs font-bold tracking-wide uppercase flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span> {t('top.before')}
                        </span>
                      </div>
                      {entryImg ? (
                        <div className="relative group rounded-xl overflow-hidden border border-blue-500/20 bg-[#0d0d0d] h-[250px] sm:h-[350px] md:h-[400px] w-full cursor-zoom-in shadow-md" onClick={() => setLightboxImg(entryImg)}>
                          <img src={entryImg} alt="Entry Chart" className="absolute inset-0 w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300" loading="lazy" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center pointer-events-none">
                            <span className="opacity-0 group-hover:opacity-100 bg-black/80 text-white text-[10px] sm:text-xs px-3 py-1.5 rounded font-medium backdrop-blur-sm transition-all shadow-xl">🔍 {t('top.fullscreen')}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-800/20 flex flex-col items-center justify-center h-[250px] sm:h-[350px] md:h-[400px] w-full text-gray-500">
                          <span className="text-2xl mb-2">⏳</span>
                          <p className="text-xs">{t('top.waiting_ss')}</p>
                        </div>
                      )}
                    </div>

                    <div className="hidden md:flex flex-col items-center justify-center w-10 shrink-0 relative mt-6">
                      <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500/50 via-gold-primary/50 to-green-500/50 -translate-y-1/2 z-0" />
                      <div className="relative z-10 bg-[#0a0a0a] border border-gold-primary/50 text-gold-primary w-8 h-8 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(212,168,83,0.3)]">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                      </div>
                    </div>
                    <div className="md:hidden flex justify-center py-1 relative">
                        <div className="w-[2px] h-6 bg-gradient-to-b from-blue-500/50 via-gold-primary/50 to-green-500/50 relative">
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-green-500/80" />
                        </div>
                    </div>

                    <div className="flex-1 w-full min-w-0 flex flex-col">
                      <div className="flex items-center justify-between mb-2 px-1 min-h-[20px]">
                        <span className={`text-[10px] sm:text-xs font-bold tracking-wide uppercase flex items-center gap-1.5 ${isStopped ? 'text-red-400' : 'text-green-400'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isStopped ? 'bg-red-500' : 'bg-green-500'} shadow-[0_0_8px_currentColor]`}></span> 
                          {t('top.after')} ({status === 'open' ? t('top.latest') : sLabel(status)})
                        </span>
                        
                        {showInteractiveRight && afterImg && (
                          <button onClick={() => setShowTV(false)} className="text-[9px] sm:text-[10px] text-text-muted hover:text-white flex items-center gap-1 bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded border border-white/10 transition-colors">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                            {t('top.back_img')}
                          </button>
                        )}
                      </div>

                      {showInteractiveRight ? (
                        <div className="relative rounded-xl overflow-hidden border border-gold-primary/30 bg-[#0d0d0d] h-[250px] sm:h-[350px] md:h-[400px] w-full shadow-md">
                           <div id="tv_chart_modal_topperf" className="absolute inset-0 w-full h-full" />
                        </div>
                      ) : (
                        <div className={`relative group rounded-xl overflow-hidden border bg-[#0d0d0d] h-[250px] sm:h-[350px] md:h-[400px] w-full shadow-md ${isStopped ? 'border-red-500/20' : 'border-green-500/20'}`}>
                          <img src={afterImg} alt="Latest Chart" className="absolute inset-0 w-full h-full object-contain" loading="lazy" />
                          
                          <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-3 backdrop-blur-sm z-10">
                            <button onClick={() => setShowTV(true)} className="px-4 py-2 bg-gold-primary text-black rounded-lg font-bold text-xs shadow-lg hover:scale-105 transition-transform flex items-center gap-2">
                              <span>{t('top.interactive')}</span>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                            </button>
                            <button onClick={() => setLightboxImg(afterImg)} className="text-white/60 hover:text-white text-[10px] underline flex items-center gap-1">
                              🔍 {t('top.view_full')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-gold-primary text-xs sm:text-sm font-semibold mb-3 flex items-center gap-2">
                    ⏱️ {t('top.journey')}
                  </h4>
                  <div className="bg-[#111] rounded-xl border border-gold-primary/15 p-4 sm:p-5 w-full">
                    <div className="flex justify-between items-start w-full relative">
                      <div className="absolute top-[13px] sm:top-[15px] left-0 right-0 h-[2px] bg-white/5 z-0" />
                      {events.map((ev, i) => {
                        const isLast = i === events.length - 1;
                        const showActiveLine = !isLast;

                        return (
                          <div key={i} className="relative flex flex-col items-center flex-1 w-0 group z-10">
                            {showActiveLine && (
                              <div className={`absolute top-[13px] sm:top-[15px] left-[50%] w-full h-[2px] ${ev.colors.line} z-0`} />
                            )}
                            <div className={`relative z-10 w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-solid flex items-center justify-center bg-[#111] ${ev.colors.border}`}>
                              <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${ev.colors.dot} ${ev.colors.bg.replace('/10', '')}`} />
                            </div>
                            <div className="mt-2.5 text-center flex flex-col items-center px-0.5 sm:px-1 w-full max-w-full">
                              <span className={`text-[9px] sm:text-[11px] font-bold tracking-wide truncate w-full ${ev.colors.text}`} title={ev.label}>
                                {ev.label}
                              </span>
                              <span className="text-[8px] sm:text-[9px] font-mono font-medium px-1 sm:px-1.5 py-0.5 mt-1 rounded bg-white/5 text-white/70 whitespace-nowrap">
                                {ev.time}
                              </span>
                              {ev.sub && <span className="text-[7px] sm:text-[8px] text-white/40 mt-1 truncate w-full" title={ev.sub}>{ev.sub}</span>}
                              {ev.detail && (
                                <span className={`text-[8px] sm:text-[9px] font-mono mt-0.5 sm:mt-1 truncate w-full ${ev.isSL ? 'text-red-400' : 'text-green-400'}`} title={ev.detail}>
                                  {ev.detail}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-gold-primary text-xs sm:text-sm font-semibold mb-3 flex items-center gap-2">
                    📊 {t('top.sig_data')}
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                    <StatBlock label={t('top.duration')} value={detail.updates?.length > 0 ? fmtDiff(created, detail.updates[detail.updates.length - 1].update_at) : 'Active'} />
                    <StatBlock label={t('top.vol_rank')} value={detail.volume_rank_num && detail.volume_rank_den ? `#${detail.volume_rank_num} / ${detail.volume_rank_den}` : 'N/A'} />
                    <StatBlock label={t('top.risk')} value={detail.risk_level || 'N/A'} valueClass={detail.risk_level === 'High' ? 'text-red-400' : detail.risk_level === 'Medium' ? 'text-yellow-400' : 'text-green-400'} />
                    <StatBlock label={t('top.sig_id')} value={detail.signal_id ? `${detail.signal_id.slice(0, 8)}...` : 'N/A'} valueClass="text-text-muted" />
                  </div>
                </div>

              </div>
            </div>
          ) : (
             <div className="flex items-center justify-center py-20"><p className="text-text-muted text-sm">{t('top.failed')}</p></div>
          )}
        </div>
      </div>

      {lightboxImg && (
        <div className="fixed inset-0 z-[200000] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} alt="Fullscreen Chart" className="max-w-full max-h-[95vh] object-contain rounded-lg shadow-2xl border border-white/10" onClick={(e) => e.stopPropagation()} />
          <button className="absolute top-4 right-4 sm:top-6 sm:right-6 text-white bg-white/10 hover:bg-white/20 p-2 sm:p-3 rounded-full transition-colors backdrop-blur-sm" onClick={() => setLightboxImg(null)}>
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(212,168,83,.3); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(212,168,83,.5); }
        @keyframes smBI { from{opacity:0} to{opacity:1} }
        @keyframes smBO { from{opacity:1} to{opacity:0} }
        @keyframes smCI { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
        @keyframes smCO { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(.97)} }
        @keyframes smUp { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)} }
        @keyframes smDn { from{opacity:1;transform:translateY(0)} to{opacity:0;transform:translateY(40px)} }
      `}</style>
    </div>
  );
  return createPortal(modalContent, document.body);
};

const StatBlock = ({ label, value, valueClass = 'text-white' }) => (
  <div className="bg-[#111] rounded-xl border border-gold-primary/10 p-3 sm:p-4 flex flex-col justify-center items-center text-center hover:border-gold-primary/30 transition-colors">
    <span className="text-text-muted text-[9px] sm:text-[10px] uppercase tracking-wider mb-1.5">{label}</span>
    <span className={`font-mono font-bold text-sm sm:text-base ${valueClass}`}>{value}</span>
  </div>
);

function formatDuration(s) { if (!s || s <= 0) return 'N/A'; const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60); if (d > 0) return `${d}d ${h}h ${m}m`; if (h > 0) return `${h}h ${m}m`; if (m > 0) return `${m}m ${sec}s`; return `${sec}s`; }
function formatPrice(p) { if (!p || p <= 0) return '0.00'; if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); if (p >= 1) return p.toFixed(4); if (p >= 0.01) return p.toFixed(6); return p.toFixed(8); }

export default TopPerformers;