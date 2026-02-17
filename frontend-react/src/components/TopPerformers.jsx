import { useState, useEffect, useCallback, useRef } from 'react';
import CoinLogo from './CoinLogo';

const API_BASE = '/api/v1';

// Rank medal colors
const RANK_STYLES = [
  { bg: 'bg-gradient-to-br from-yellow-400 to-amber-600', text: 'text-black', shadow: 'shadow-amber-500/30' },   // #1 gold
  { bg: 'bg-gradient-to-br from-gray-300 to-gray-500', text: 'text-black', shadow: 'shadow-gray-400/20' },        // #2 silver
  { bg: 'bg-gradient-to-br from-amber-600 to-amber-800', text: 'text-white', shadow: 'shadow-amber-700/20' },     // #3 bronze
  { bg: 'bg-bg-card border border-gold-primary/20', text: 'text-gold-primary', shadow: '' },                       // #4
  { bg: 'bg-bg-card border border-gold-primary/20', text: 'text-gold-primary', shadow: '' },                       // #5+
];

const TopPerformers = () => {
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
          <h2 className="font-display text-3xl font-bold text-white">Top Gainer by LuxQuant Algorithm</h2>
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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-3xl font-bold text-white">Top Gainer by LuxQuant Algorithm</h2>
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
          <span className="text-text-muted text-xs">From:</span>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="px-3 py-1.5 bg-bg-primary border border-gold-primary/20 rounded-lg text-white text-sm focus:outline-none focus:border-gold-primary/50 [color-scheme:dark]" />
          <span className="text-text-muted text-xs">To:</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="px-3 py-1.5 bg-bg-primary border border-gold-primary/20 rounded-lg text-white text-sm focus:outline-none focus:border-gold-primary/50 [color-scheme:dark]" />
          <button onClick={handleCustomApply} disabled={!customFrom || !customTo} className="px-4 py-1.5 bg-gold-primary text-bg-primary rounded-lg text-xs font-bold hover:bg-gold-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Apply</button>
        </div>
      )}

      {data?.period && (
        <div className="mb-4">
          <span className="inline-block px-4 py-2 bg-gold-primary/10 border border-gold-primary/20 rounded-lg text-gold-primary text-xs font-semibold">📅 {data.period}</span>
        </div>
      )}

      {/* Stats */}
      {data && (data.total_tp_hits || data.total_tp4) > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="Total TP Hits" value={data.total_tp_hits || data.total_tp4} sub="signals hit target" />
          <StatCard label="Unique Pairs" value={data.unique_pairs || '—'} sub="different coins" valueClass="text-gold-primary" />
          <StatCard label="Avg Gain (Top 5)" value={`${data.top_gainers?.length > 0 ? (data.top_gainers.reduce((a, b) => a + b.gain_pct, 0) / data.top_gainers.length).toFixed(2) : '0'}%`} sub="first entry to best TP" valueClass="text-green-400" borderClass="border-green-500/10" />
          <StatCard label="Avg Duration" value={data.top_gainers?.length > 0 ? formatDuration(data.top_gainers.reduce((a, b) => a + b.duration_seconds, 0) / data.top_gainers.length) : 'N/A'} sub="first call to last hit" />
        </div>
      )}

      {data && (data.total_tp_hits || data.total_tp4) === 0 && !loading && (
        <div className="text-center py-8 mb-4 bg-bg-card/40 rounded-xl border border-gold-primary/10"><p className="text-text-muted text-sm">No TP hits found for this period</p></div>
      )}

      {data && (data.top_gainers?.length > 0 || data.fastest_hits?.length > 0) && (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${loading ? 'opacity-50' : ''}`}>
          {/* TOP GAINERS */}
          <div className="bg-bg-card rounded-xl border border-gold-primary/10 overflow-hidden">
            <div className="px-5 py-3 border-b border-gold-primary/10 flex items-center gap-2">
              <span>🏆</span>
              <h3 className="text-gold-primary font-semibold text-sm uppercase tracking-wider">Top Gainers by LuxQuant Algorithm Call</h3>
            </div>
            <div className="p-3 space-y-1.5">
              {data.top_gainers?.map((item, idx) => {
                const barW = maxGain > 0 ? Math.max((item.gain_pct / maxGain) * 100, 8) : 8;
                const rank = RANK_STYLES[Math.min(idx, RANK_STYLES.length - 1)];
                return (
                  <div key={idx} onClick={() => handleItemClick(item)}
                    className="relative flex items-center gap-3 px-3 py-3.5 bg-bg-primary/40 rounded-lg border border-green-500/10 hover:border-green-500/30 hover:bg-bg-primary/60 transition-all cursor-pointer group overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-green-500/[0.06] rounded-lg" style={{ width: `${barW}%` }} />
                    {/* Rank badge */}
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 relative z-10 text-xs font-bold ${rank.bg} ${rank.text} ${rank.shadow}`}>
                      {idx + 1}
                    </div>
                    <div className="flex-shrink-0 relative z-10"><CoinLogo pair={cleanPair(item.pair)} size={32} /></div>
                    <div className="flex-1 min-w-0 relative z-10">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-semibold text-sm group-hover:text-gold-primary transition-colors">{coinSymbol(item.pair)}</span>
                        {item.tp_level && <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-bold rounded leading-none">{item.tp_level.trim()}</span>}
                        {item.signal_count > 1 && <span className="px-1.5 py-0.5 bg-gold-primary/15 text-gold-primary text-[9px] font-semibold rounded leading-none">Called {item.signal_count}x</span>}
                      </div>
                      <p className="text-text-muted text-[10px] mt-0.5">
                        First Entry ${formatPrice(item.entry)}
                        <span className="text-text-muted/40 mx-1">·</span>
                        {item.duration_display} to last TP
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 relative z-10">
                      <span className="text-green-400 font-mono font-bold text-sm">+{item.gain_pct.toFixed(2)}%</span>
                    </div>
                  </div>
                );
              })}
              {(!data.top_gainers || data.top_gainers.length === 0) && <p className="text-text-muted text-sm text-center py-4">No data</p>}
            </div>
          </div>

          {/* FASTEST HITS */}
          <div className="bg-bg-card rounded-xl border border-gold-primary/10 overflow-hidden">
            <div className="px-5 py-3 border-b border-gold-primary/10 flex items-center gap-2">
              <span>⚡</span>
              <h3 className="text-gold-primary font-semibold text-sm uppercase tracking-wider">Fastest Hits by LuxQuant Algorithm Call</h3>
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
                        {item.tp_level && <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold rounded leading-none">{item.tp_level.trim()}</span>}
                      </div>
                      <p className="text-text-muted text-[10px] mt-0.5">
                        Entry ${formatPrice(item.entry)}
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
              {(!data.fastest_hits || data.fastest_hits.length === 0) && <p className="text-text-muted text-sm text-center py-4">No data</p>}
            </div>
          </div>
        </div>
      )}

      {modalOpen && modalItem && (
        <SignalDetailModal item={modalItem} detail={signalDetail} loading={detailLoading}
          signalIds={modalSignalIds} currentIndex={modalIndex} onNavigate={goToSignal}
          onClose={closeModal} cleanPair={cleanPair} />
      )}
    </div>
  );
};

// Stat card
const StatCard = ({ label, value, sub, valueClass = 'text-white', borderClass = 'border-gold-primary/10' }) => (
  <div className={`bg-bg-card/60 rounded-xl p-4 border ${borderClass}`}>
    <p className="text-text-muted text-[10px] uppercase tracking-wider font-medium">{label}</p>
    <p className={`font-mono text-2xl font-bold mt-1 ${valueClass}`}>{value}</p>
    <p className="text-text-muted text-[10px] mt-0.5">{sub}</p>
  </div>
);

// ════════════════════════════════════════════
// MODAL with ← Signal 1/8 → navigation
// ════════════════════════════════════════════
const SignalDetailModal = ({ item, detail, loading, signalIds, currentIndex, onNavigate, onClose, cleanPair }) => {
  const chartRef = useRef(null);
  const pair = cleanPair(item.pair || detail?.pair);
  const total = signalIds.length;
  const multi = total > 1;

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); if (multi && e.key === 'ArrowLeft') onNavigate(currentIndex - 1); if (multi && e.key === 'ArrowRight') onNavigate(currentIndex + 1); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [onClose, onNavigate, currentIndex, multi]);

  useEffect(() => {
    if (!chartRef.current || !pair) return;
    const cid = 'tv-chart-top-perf';
    chartRef.current.innerHTML = `<div id="${cid}" style="width:100%;height:100%"></div>`;
    const s = document.createElement('script'); s.src = 'https://s3.tradingview.com/tv.js'; s.async = true;
    s.onload = () => { if (window.TradingView && document.getElementById(cid)) new window.TradingView.widget({ container_id: cid, autosize: true, symbol: `BINANCE:${pair.replace('USDT','')}USDT.P`, interval: '60', timezone: 'Asia/Jakarta', theme: 'dark', style: '1', locale: 'en', toolbar_bg: '#0a0a0f', enable_publishing: false, hide_side_toolbar: false, allow_symbol_change: true, save_image: false, backgroundColor: '#0a0a0f', gridColor: 'rgba(212,175,55,0.05)', studies: ['MASimple@tv-basicstudies'] }); };
    document.head.appendChild(s);
    return () => { try { document.head.removeChild(s); } catch {} };
  }, [pair]);

  const fmtDt = (ts) => { if (!ts) return '—'; try { return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); } catch { return ts; } };
  const fmtDiff = (f, t) => { if (!f || !t) return '—'; try { const d = (new Date(t) - new Date(f)) / 1000; if (d <= 0) return '< 1s'; const dd = Math.floor(d/86400), hh = Math.floor((d%86400)/3600), mm = Math.floor((d%3600)/60), ss = Math.floor(d%60); if (dd > 0) return `${dd}d ${hh}h ${mm}m`; if (hh > 0) return `${hh}h ${mm}m`; if (mm > 0) return `${mm}m ${ss}s`; return `${ss}s`; } catch { return '—'; } };
  const sLabel = (s) => ({ closed_win: 'WIN', closed_loss: 'LOSS', tp1: 'TP1', tp2: 'TP2', tp3: 'TP3', open: 'OPEN' }[s] || s?.toUpperCase() || 'OPEN');
  const sColor = (s) => (s === 'closed_win' || s?.startsWith('tp')) ? 'bg-green-500/20 text-green-400' : s === 'closed_loss' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400';
  const tpC = { tp1: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-400' }, tp2: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30', dot: 'bg-cyan-400' }, tp3: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30', dot: 'bg-purple-400' }, tp4: { bg: 'bg-green-500/15', text: 'text-green-400', border: 'border-green-500/30', dot: 'bg-green-400' }, sl: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30', dot: 'bg-red-400' } };
  const created = detail?.created_at || item.signal_time;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-start md:justify-center p-3 pb-20 md:pb-4 md:pt-[90px] md:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-4xl bg-bg-primary border border-gold-primary/20 rounded-2xl overflow-hidden shadow-2xl shadow-black/60 h-[82vh] md:h-auto md:max-h-[calc(100vh-110px)]">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-gold-primary/15 bg-bg-primary/95 backdrop-blur-md">
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <CoinLogo pair={pair} size={36} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-white font-display font-bold text-base">{pair}</h2>
                  {detail?.status && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${sColor(detail.status)}`}>{sLabel(detail.status)}</span>}
                  {detail?.risk_level && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-gold-primary/30 text-gold-primary">{detail.risk_level}</span>}
                </div>
                <p className="text-text-muted text-[11px] mt-0.5 truncate">Called {fmtDt(created)}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-bg-card/80 border border-gold-primary/20 flex items-center justify-center text-text-muted hover:text-white transition-colors flex-shrink-0 ml-3">✕</button>
          </div>
          {/* Navigator */}
          {multi && (
            <div className="flex items-center justify-center gap-3 px-5 py-2 border-t border-gold-primary/10 bg-bg-card/30">
              <button onClick={() => onNavigate(currentIndex - 1)} disabled={currentIndex <= 0} className="w-7 h-7 rounded-md bg-bg-primary border border-gold-primary/20 flex items-center justify-center text-gold-primary hover:bg-gold-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-xs font-bold">←</button>
              <div className="flex items-center gap-2">
                <span className="text-text-muted text-xs">Signal</span>
                <div className="flex items-center gap-1">
                  {signalIds.map((_, i) => (
                    <button key={i} onClick={() => onNavigate(i)} className={`w-6 h-6 rounded-md text-[10px] font-bold transition-all ${i === currentIndex ? 'bg-gold-primary text-bg-primary' : 'bg-bg-primary border border-gold-primary/20 text-text-muted hover:text-white'}`}>{i + 1}</button>
                  ))}
                </div>
                <span className="text-text-muted text-xs">of {total}</span>
              </div>
              <button onClick={() => onNavigate(currentIndex + 1)} disabled={currentIndex >= total - 1} className="w-7 h-7 rounded-md bg-bg-primary border border-gold-primary/20 flex items-center justify-center text-gold-primary hover:bg-gold-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-xs font-bold">→</button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 110px - 56px)' }}>
          <div ref={chartRef} className="w-full h-[380px] bg-bg-primary border-b border-gold-primary/10" />
          {loading ? (
            <div className="flex items-center justify-center py-16"><div className="text-center"><div className="w-8 h-8 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin mx-auto mb-3" /><p className="text-text-muted text-sm">Loading signal details...</p></div></div>
          ) : detail ? (
            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">
                {detail.updates?.length > 0 && (
                  <div>
                    <h4 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-2.5">Hit Timeline</h4>
                    <div className="relative bg-bg-card/30 rounded-xl p-4 border border-gold-primary/5">
                      <div className="absolute left-[27px] top-6 bottom-6 w-px bg-gold-primary/10" />
                      <div className="space-y-3">
                        <TimelineNode color="gold" label="Signal Called" time="T+0" sub={fmtDt(created)} detail={`Entry @ $${formatPrice(detail.entry)}`} />
                        {detail.updates.map((u, i) => {
                          const c = tpC[u.update_type] || tpC.tp1;
                          const isSL = u.update_type === 'sl';
                          return <TimelineNode key={i} colors={c} label={isSL ? 'Stop Loss Hit' : `${u.update_type?.toUpperCase().replace('TP','TP ')} Hit`}
                            time={`T+${fmtDiff(created, u.update_at)}`} sub={fmtDt(u.update_at)}
                            detail={u.price > 0 ? `$${formatPrice(u.price)}${!isSL && detail.entry > 0 ? ` (+${((Math.abs(u.price - detail.entry) / detail.entry) * 100).toFixed(2)}%)` : ''}` : null}
                            detailColor={isSL ? c.text : 'text-green-400'} />;
                        })}
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-2.5">Signal Info</h4>
                  <div className="space-y-2 text-xs">
                    <InfoRow label="Entry" value={`$${formatPrice(detail.entry)}`} />
                    {detail.entry > 0 && detail.updates?.length > 0 && (() => {
                      const last = [...detail.updates].filter(u => u.update_type !== 'sl').pop();
                      return last?.price ? <InfoRow label="Total Gain" value={`+${((Math.abs(last.price - detail.entry) / detail.entry) * 100).toFixed(2)}%`} valueClass="text-green-400" borderClass="border-green-500/10" /> : null;
                    })()}
                    <InfoRow label="Duration" value={detail.updates?.length > 0 ? fmtDiff(created, detail.updates[detail.updates.length - 1].update_at) : 'N/A'} />
                    {detail.volume_rank_num != null && detail.volume_rank_den != null && <InfoRow label="Volume Rank" value={`${detail.volume_rank_num}/${detail.volume_rank_den}`} />}
                    {detail.risk_level && <InfoRow label="Risk Level" value={detail.risk_level} valueClass="text-gold-primary" />}
                    {detail.signal_id && <InfoRow label="Signal ID" value={`${detail.signal_id.slice(0, 12)}...`} valueClass="text-[11px]" />}
                  </div>
                  {detail.message_link && (
                    <a href={detail.message_link} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors">View on Telegram</a>
                  )}
                </div>
              </div>
            </div>
          ) : <div className="flex items-center justify-center py-16"><p className="text-text-muted text-sm">Failed to load signal details</p></div>}
        </div>
      </div>
    </div>
  );
};

// Timeline node
const TimelineNode = ({ color, colors, label, time, sub, detail, detailColor }) => {
  const isGold = color === 'gold';
  const bg = isGold ? 'bg-gold-primary/20' : colors?.bg;
  const border = isGold ? 'border-gold-primary/40' : colors?.border;
  const dot = isGold ? 'bg-gold-primary' : colors?.dot;
  const textC = isGold ? 'text-gold-primary' : colors?.text;
  return (
    <div className="flex items-start gap-3 relative">
      <div className={`w-[22px] h-[22px] rounded-full ${bg} border-2 ${border} flex items-center justify-center flex-shrink-0 z-10`}><div className={`w-2 h-2 rounded-full ${dot}`} /></div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold ${textC}`}>{label}</span>
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${bg} ${textC}`}>{time}</span>
        </div>
        {sub && <p className="text-text-muted text-[10px] mt-0.5">{sub}</p>}
        {detail && <p className={`text-[11px] font-mono mt-0.5 ${detailColor || textC}`}>{detail}</p>}
      </div>
    </div>
  );
};

const InfoRow = ({ label, value, valueClass = 'text-white', borderClass = 'border-gold-primary/5' }) => (
  <div className={`bg-bg-card/50 rounded-lg px-3 py-2.5 border ${borderClass} flex items-center justify-between`}>
    <span className="text-text-muted text-[10px] uppercase">{label}</span>
    <span className={`font-mono font-bold ${valueClass}`}>{value}</span>
  </div>
);

function formatDuration(s) { if (!s || s <= 0) return 'N/A'; const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60); if (d > 0) return `${d}d ${h}h ${m}m`; if (h > 0) return `${h}h ${m}m`; if (m > 0) return `${m}m ${sec}s`; return `${sec}s`; }
function formatPrice(p) { if (!p || p <= 0) return '0.00'; if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); if (p >= 1) return p.toFixed(4); if (p >= 0.01) return p.toFixed(6); return p.toFixed(8); }

export default TopPerformers;