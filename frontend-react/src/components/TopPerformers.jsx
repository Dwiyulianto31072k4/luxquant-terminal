import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import CoinLogo from './CoinLogo';
import SignalJourneyExtended from './SignalJourneyExtended';
import SignalModal from './SignalModal';
import { ShimmerStyles } from './ui/Loaders';

const API_BASE = '/api/v1';

const deriveChartWithCard = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  if (!/_tp[234]_/i.test(rawUrl)) return null;
  if (/_with_card|_combined/i.test(rawUrl)) return null;
  return rawUrl.replace(/\.png$/i, "_with_card.png");
};

const TopPerformers = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [category, setCategory] = useState('gains'); // MEXC-style category chips
  const [sheetOpen, setSheetOpen] = useState(false); // mobile filter bottom-sheet
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSignalIds, setModalSignalIds] = useState([]);
  const [modalIndex, setModalIndex] = useState(0);
  const [modalItem, setModalItem] = useState(null);
  const [signalDetail, setSignalDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [historyModalSignal, setHistoryModalSignal] = useState(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // Brief onboarding cue — shown on every fresh page mount, then fades away.
  const [showProofHint, setShowProofHint] = useState(true);
  const [isProofHintClosing, setIsProofHintClosing] = useState(false);

  const openHistoryModal = (item) => {
    closeModal();
    setHistoryModalSignal(item);
    setHistoryModalOpen(true);
  };
  const closeHistoryModal = () => {
    setHistoryModalOpen(false);
    setHistoryModalSignal(null);
  };

  const presets = [
    { key: '1d', label: t('top.d1'), days: 1 },
    { key: '7d', label: t('top.d7'), days: 7 },
    { key: '30d', label: t('top.d30'), days: 30 },
    { key: 'custom', label: t('top.custom'), days: null },
  ];

  // MEXC-style category chips — client-side views over the same data (no extra fetch)
  const CATEGORIES = [
    { key: 'gains', label: 'Biggest Gains' },
    { key: 'fastest', label: 'Fastest Hits' },
    { key: 'recent', label: 'Most Recent' },
    { key: 'multi', label: 'Multi-Calls' },
  ];

  const displayed = useMemo(() => {
    if (!data) return [];
    if (category === 'fastest') return data.fastest_hits || [];
    let arr = [...(data.top_gainers || [])];
    if (category === 'recent') arr = arr.sort((a, b) => new Date(b.signal_time || 0) - new Date(a.signal_time || 0));
    if (category === 'multi') arr = arr.filter((x) => (x.signal_count || 1) > 1);
    return arr;
  }, [data, category]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API_BASE}/signals/top-performers?limit=10`;
      if (activeFilter === 'custom' && customFrom && customTo) url += `&date_from=${customFrom}&date_to=${customTo}`;
      else if (activeFilter !== 'custom') { const p = presets.find(p => p.key === activeFilter); url += `&days=${p?.days || 7}`; }
      else { setLoading(false); return; }
      const res = await fetch(url);
      if (res.ok) setData(await res.json());
    } catch (err) { console.error('Top performers fetch error:', err); }
    finally { setLoading(false); }
  }, [activeFilter, customFrom, customTo]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (activeFilter === 'custom') return; const iv = setInterval(fetchData, 60000); return () => clearInterval(iv); }, [activeFilter, fetchData]);

  // Give first-time viewers a clear, non-blocking cue that each row opens proof.
  useEffect(() => {
    const closeTimer = window.setTimeout(() => setIsProofHintClosing(true), 2500);
    const removeTimer = window.setTimeout(() => setShowProofHint(false), 3000);
    return () => {
      window.clearTimeout(closeTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  const fetchDetail = useCallback(async (sid) => {
    setDetailLoading(true); setSignalDetail(null);
    try {
      const token = localStorage.getItem('access_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const r = await fetch(`${API_BASE}/signals/detail/${sid}`, { headers });
      if (r.ok) setSignalDetail(await r.json());
    }
    catch (e) { console.error(e); } finally { setDetailLoading(false); }
  }, []);

  const handleItemClick = (item) => {
    if (!item.signal_id) return;
    const ids = item.all_signal_ids?.length > 0 ? item.all_signal_ids : [item.signal_id];
    const bi = ids.indexOf(item.signal_id);
    setModalSignalIds(ids); setModalIndex(bi >= 0 ? bi : 0); setModalItem(item); setModalOpen(true); fetchDetail(item.signal_id);
  };

  const goToSignal = (i) => { if (i >= 0 && i < modalSignalIds.length) { setModalIndex(i); fetchDetail(modalSignalIds[i]); } };
  const closeModal = () => { setModalOpen(false); setModalSignalIds([]); setModalIndex(0); setModalItem(null); setSignalDetail(null); };
  const handlePresetClick = (k) => { if (k === 'custom') { setShowCustom(true); setActiveFilter('custom'); } else { setShowCustom(false); setActiveFilter(k); } };
  const handleCustomApply = () => { if (customFrom && customTo) fetchData(); };

  const cleanPair = (p) => p ? p.replace(/^3A/, '').replace(/USDT$/i, '') + 'USDT' : '???';
  const coinSymbol = (p) => p ? p.replace(/^3A/, '').replace(/USDT$/i, '') : '???';

  // Format period — renders the start and end dates on their own aligned edges.
  const splitPeriodRange = (period) => {
    if (!period || typeof period !== 'string') return { from: '', to: '' };
    const parts = period.trim().split(/\s+(?:-|–|—)\s+/);
    if (parts.length < 2) return { from: period.trim(), to: '' };
    return {
      from: parts[0].trim(),
      to: parts.slice(1).join(' — ').trim(),
    };
  };

  const periodRange = splitPeriodRange(data?.period);

  // Current selection labels for the compact mobile trigger bar
  const catLabel = (CATEGORIES.find((c) => c.key === category) || CATEGORIES[0]).label;
  const rangeLabel = (presets.find((p) => p.key === activeFilter) || presets[1]).label;

  // Lock body scroll while the mobile filter sheet is open
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setSheetOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [sheetOpen]);

  if (loading && !data) {
    return (
      <div className="mb-10">
        <ShimmerStyles />
        <div className="lqsk-group relative rounded-2xl border border-white/[0.07] bg-[#0a0805] p-4 sm:p-6 overflow-hidden">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />
        {/* Title — matches the real heading, not a boxed placeholder */}
        <div className="mb-6 sm:mb-7">
          <div className="h-8 w-56 rounded-lg bg-white/[0.05] sm:h-9 sm:w-72" />
        </div>

        {/* Control bar — category tabs (left) + time-range pill (right) */}
        <div className="mb-4 flex flex-col gap-4 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-5">
            {[...Array(4)].map((_, j) => <div key={j} className="h-4 w-16 rounded bg-white/[0.05]" />)}
          </div>
          <div className="h-8 w-full rounded-full bg-white/[0.04] sm:w-52" />
        </div>

        {/* Open leaderboard rows — borderless, only hairline dividers */}
        <div className="divide-y divide-white/[0.04]">
          {[...Array(9)].map((_, j) => (
            <div key={j} className="flex items-center gap-3 py-3.5">
              <div className="h-7 w-7 flex-shrink-0 rounded-full bg-white/[0.05]" />
              <div className="h-7 w-7 flex-shrink-0 rounded-full bg-white/[0.05]" />
              <div className="min-w-0 flex-1">
                <div className="h-3.5 w-24 rounded bg-white/[0.05]" />
                <div className="mt-1.5 h-2.5 w-32 rounded bg-white/[0.03]" />
              </div>
              <div className="hidden h-6 w-20 rounded bg-white/[0.03] sm:block" />
              <div className="h-4 w-16 flex-shrink-0 rounded bg-white/[0.05]" />
            </div>
          ))}
        </div>
        </div>
      </div>
    );
  }

  // Solid podium medal (gold / silver / bronze) — filled SVG; plain number otherwise
  const rankBadge = (rank) => {
    if (rank <= 3) {
      const m = rank === 1
        ? { face: '#f0d890', body: '#d4a853', ring: '#8b6914', ink: '#3a2a08' }
        : rank === 2
          ? { face: '#eef1f4', body: '#c2c7cf', ring: '#8b9099', ink: '#2c2f34' }
          : { face: '#e8b68a', body: '#c0875a', ring: '#8a5a34', ink: '#3a230f' };
      return (
        <span className="relative inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0">
          <svg viewBox="0 0 32 32" className="w-full h-full drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
            <circle cx="16" cy="16" r="14" fill={m.body} />
            <circle cx="16" cy="16" r="14" fill="none" stroke={m.ring} strokeWidth="2" />
            <path d="M16 4a12 12 0 0 1 8.5 3.5A12 12 0 0 0 16 18 12 12 0 0 0 7.5 7.5 12 12 0 0 1 16 4z" fill={m.face} opacity="0.9" />
            <circle cx="16" cy="14.5" r="8.5" fill={m.face} />
          </svg>
          <span className="absolute font-mono text-[11px] sm:text-xs font-bold" style={{ color: m.ink }}>{rank}</span>
        </span>
      );
    }
    return (
      <span className="font-mono text-xs tabular-nums text-text-muted/45 w-7 sm:w-8 text-center flex-shrink-0">
        {String(rank).padStart(2, '0')}
      </span>
    );
  };


  return (
    <div className="mb-10 relative">
      <div className="relative rounded-2xl border border-white/[0.07] bg-[#0a0805] overflow-hidden shadow-2xl shadow-black/40">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />
        <div className="p-4 sm:p-6">
      {/* ═══ HEADER ═══ */}
      <div className="relative mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[24px] sm:text-[30px] font-bold leading-none tracking-tight text-white">
            <span className="whitespace-nowrap">Top Gainers</span>
            <span className="whitespace-nowrap text-gold-primary">by LuxQuant</span>
          </h2>
          <p className="mt-2 font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-text-muted/70">LuxQuant's best calls · tap any row for the original proof</p>
        </div>
      </div>

      {/* ═══ CUSTOM DATE PICKER (desktop only — mobile uses the sheet) ═══ */}
      {showCustom && (
        <div className="mb-4 hidden sm:flex flex-wrap items-center gap-2.5 rounded-xl border border-gold-primary/20 bg-[#0c0a07] p-3">
          <span className="font-mono text-[9px] text-gold-primary/80 uppercase tracking-[0.18em]">{t('top.custom')}</span>
          <span className="hidden sm:block h-4 w-px bg-white/10" />
          <label className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-text-muted uppercase tracking-[0.15em]">{t('top.from')}</span>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="px-3 py-1.5 bg-[#0a0506] border border-white/[0.1] rounded-lg text-white font-mono text-xs focus:outline-none focus:border-gold-primary/50 hover:border-white/20 transition-colors [color-scheme:dark]" />
          </label>
          <svg viewBox="0 0 16 16" className="h-3 w-3 fill-gold-primary/50" aria-hidden="true"><path d="M2.5 7.25h8.3L8.3 4.7l1-1L13.5 8l-4.2 4.3-1-1 2.5-2.55H2.5z" /></svg>
          <label className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-text-muted uppercase tracking-[0.15em]">{t('top.to')}</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="px-3 py-1.5 bg-[#0a0506] border border-white/[0.1] rounded-lg text-white font-mono text-xs focus:outline-none focus:border-gold-primary/50 hover:border-white/20 transition-colors [color-scheme:dark]" />
          </label>
          <button onClick={handleCustomApply} disabled={!customFrom || !customTo} className="ml-auto px-4 py-1.5 bg-gold-primary text-[#1a1206] font-semibold hover:brightness-105 transition-all rounded-lg font-mono text-[10px] uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed">{t('top.apply')}</button>
        </div>
      )}

      {data && (data.total_tp_hits || data.total_tp4) === 0 && !loading && (
        <div className="text-center py-8 mb-3 rounded-2xl border border-white/[0.06] bg-[#0a0805]">
          <p className="text-text-muted font-mono text-xs uppercase tracking-wider">{t('top.no_tp')}</p>
        </div>
      )}

      {/* ═══ CONTROL BAR — DESKTOP: solid category chips (left) + time-range segmented (right) ═══ */}
      {data && (data.total_tp_hits || data.total_tp4) > 0 && (
        <div className="mb-4 hidden gap-3 sm:flex sm:flex-row sm:items-center sm:justify-between">
          {/* Category chips */}
          <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto">
            {CATEGORIES.map((c) => {
              const on = category === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={`min-w-0 rounded-lg px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] transition-all sm:text-[11px] ${
                    on
                      ? 'bg-gold-primary text-[#1a1206] font-semibold shadow-[0_2px_10px_-2px_rgba(212,168,83,0.6)]'
                      : 'border border-white/[0.08] bg-[#0c0a07] text-text-muted hover:text-white hover:border-white/20'
                  }`}
                >
                  <span className="block truncate">{c.label}</span>
                </button>
              );
            })}
          </div>

          {/* Time range: solid segmented control */}
          <div className="grid w-full grid-cols-4 items-center rounded-lg border border-white/[0.08] bg-[#0a0506] p-1 sm:flex sm:w-auto sm:flex-shrink-0">
            {presets.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handlePresetClick(key)}
                className={`min-w-0 flex-1 rounded-md px-1 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] transition-all sm:flex-none sm:px-3.5 sm:text-[10px] sm:tracking-wider ${
                  activeFilter === key
                    ? 'bg-gold-primary text-[#1a1206] font-semibold shadow-[0_2px_10px_-2px_rgba(212,168,83,0.6)]'
                    : 'text-text-muted hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ CONTROL BAR — MOBILE: two compact triggers → bottom sheet ═══ */}
      {data && (data.total_tp_hits || data.total_tp4) > 0 && (
        <div className="mb-4 sm:hidden">
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-[#0c0a07] px-3 py-2.5 text-left active:scale-[0.99] transition-transform"
            >
              <span className="min-w-0">
                <span className="block font-mono text-[8px] uppercase tracking-[0.18em] text-text-muted/50">View</span>
                <span className="mt-0.5 block truncate font-mono text-[11px] font-semibold text-white">{catLabel}</span>
              </span>
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 fill-text-muted/60" aria-hidden="true"><path d="M8 11 3.5 6.5l1-1L8 9l3.5-3.5 1 1z" /></svg>
            </button>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-[#0c0a07] px-3 py-2.5 text-left active:scale-[0.99] transition-transform"
            >
              <span className="min-w-0">
                <span className="block font-mono text-[8px] uppercase tracking-[0.18em] text-text-muted/50">Range</span>
                <span className="mt-0.5 block truncate font-mono text-[11px] font-semibold text-gold-primary">{rangeLabel}</span>
              </span>
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 fill-text-muted/60" aria-hidden="true"><path d="M8 11 3.5 6.5l1-1L8 9l3.5-3.5 1 1z" /></svg>
            </button>
          </div>
          {data?.period && (
            <div className="mt-2 flex items-center gap-1.5 px-0.5 font-mono text-[9px]">
              <span className="uppercase tracking-[0.18em] text-text-muted/45">Window</span>
              <span className="truncate tabular-nums text-text-muted/70">
                {periodRange.from}{periodRange.to ? ` → ${periodRange.to}` : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Date window — DESKTOP: one clean solid WINDOW chip */}
      {data?.period && (data.total_tp_hits || data.total_tp4) > 0 && (
        <div className="mb-4 hidden items-center gap-2 sm:flex">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted/55">Window</span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#0a0506] px-3 py-1.5 font-mono text-[10px] sm:text-[11px] tracking-wide text-white/85 tabular-nums">
            <span className="truncate">{periodRange.from}</span>
            {periodRange.to && (
              <>
                <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 fill-gold-primary/60" aria-hidden="true"><path d="M2.5 7.25h8.3L8.3 4.7l1-1L13.5 8l-4.2 4.3-1-1 2.5-2.55H2.5z" /></svg>
                <span className="truncate">{periodRange.to}</span>
              </>
            )}
          </span>
        </div>
      )}

      {/* ═══ LEADERBOARD — open MEXC-style table (no card wrapper) ═══ */}
      {data && data.top_gainers?.length > 0 && (
        <div className={loading ? 'opacity-50' : ''}>
          <div className="relative">

            {/* Column headers (desktop) */}
            <div className="hidden sm:grid grid-cols-[2.5rem_1.2fr_1fr_1fr_0.9fr_1.1fr] gap-3 px-2 py-3 border-b border-white/[0.08] font-mono text-[10px] text-text-muted/90 uppercase tracking-[0.2em]">
              <span className="text-center">#</span>
              <span>Asset</span>
              <span className="text-right">{t('top.first_entry') || 'Entry'}</span>
              <span className="text-center">Since Call</span>
              <span className="text-right">{t('top.duration') || 'Duration'}</span>
              <span className="text-right">Gain</span>
            </div>

            {/* Mobile header — three concise, scan-friendly columns */}
            <div className="sm:hidden grid grid-cols-[4.25rem_minmax(0,1fr)_4.75rem_5.75rem] items-center gap-x-2 py-2.5 border-b border-white/[0.08]">
              <span className="col-span-2 font-mono text-[9px] text-text-muted/70 uppercase tracking-[0.2em]">Asset</span>
              <span className="text-center font-mono text-[8px] text-text-muted/60 uppercase tracking-[0.12em]">After call</span>
              <span className="text-right font-mono text-[9px] text-text-muted/70 uppercase tracking-[0.2em]">Gain</span>
            </div>

            <div className="divide-y divide-white/[0.04]">
              {displayed.map((item, idx) => {
                const rank = idx + 1;
                const isPodium = idx < 3;

                return (
                  <div
                    key={idx}
                    onClick={() => handleItemClick(item)}
                    style={{ animationDelay: `${Math.min(idx * 35, 350)}ms` }}
                    className="tp-row relative hover:bg-white/[0.02] transition-colors cursor-pointer group"
                  >

                    {/* Desktop grid */}
                    <div className="hidden sm:grid grid-cols-[2.5rem_1.2fr_1fr_1fr_0.9fr_1.1fr] gap-3 px-2 py-3.5 items-center relative">
                      <div className="flex justify-center">{rankBadge(rank)}</div>
                      <div className="flex items-center gap-3 min-w-0">
                        <CoinLogo pair={cleanPair(item.pair)} size={30} />
                        <span className="text-white font-mono text-[15px] font-semibold group-hover:text-gold-primary transition-colors truncate">{coinSymbol(item.pair)}</span>
                        {item.signal_count > 1 && <span className="px-1.5 py-0.5 font-mono text-[9px] text-gold-primary/70 border border-gold-primary/20 rounded leading-none flex-shrink-0">×{item.signal_count}</span>}
                      </div>
                      <div className="text-right font-mono text-xs text-text-muted tabular-nums">${formatPrice(item.entry)}</div>
                      <div className="flex justify-center"><div className="w-full max-w-[120px]"><SinceCallSpark item={item} /></div></div>
                      <div className="text-right font-mono text-[11px] text-text-muted/70">{item.duration_display}</div>
                      <div className="text-right">
                        <div className={`font-mono text-lg font-bold text-profit tabular-nums leading-none ${isPodium ? 'drop-shadow-[0_0_10px_rgba(74,222,128,0.25)]' : ''}`}>+{formatGainDisplay(item.gain_pct)}</div>
                        {item.tp_price > 0 && <div className="font-mono text-[9px] text-text-muted/40 tabular-nums mt-1">peak ${formatPrice(item.tp_price)}</div>}
                      </div>
                    </div>

                    {/* Mobile — compact four-column market row, with a real After Call sparkline */}
                    <div className="sm:hidden grid grid-cols-[4.25rem_minmax(0,1fr)_4.75rem_5.75rem] items-center gap-x-2 py-3 relative">
                      <div className="flex items-center gap-2 min-w-0">
                        {rankBadge(rank)}
                        <CoinLogo pair={cleanPair(item.pair)} size={27} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="min-w-0 truncate text-white font-mono text-sm font-semibold group-hover:text-gold-primary transition-colors">{coinSymbol(item.pair)}</span>
                          {item.signal_count > 1 && <span className="px-1 py-0 font-mono text-[8px] text-gold-primary/70 border border-gold-primary/20 rounded leading-none flex-shrink-0">×{item.signal_count}</span>}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[9px] text-text-muted/60 tabular-nums">${formatPrice(item.entry)} · {item.duration_display}</div>
                      </div>
                      <div className="min-w-0 px-0.5">
                        <SinceCallSpark item={item} compact />
                      </div>
                      <div className="min-w-0 text-right">
                        <div className={`font-mono text-[15px] font-bold leading-none text-profit tabular-nums ${isPodium ? 'drop-shadow-[0_0_8px_rgba(74,222,128,0.25)]' : ''}`}>+{formatGainDisplay(item.gain_pct)}</div>
                        {item.tp_price > 0 && <div className="mt-1 truncate font-mono text-[8px] text-text-muted/40 tabular-nums">peak ${formatPrice(item.tp_price)}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {displayed.length === 0 && (
              <div className="p-6"><p className="text-text-muted font-mono text-xs uppercase tracking-wider text-center">{t('top.no_data')}</p></div>
            )}
          </div>
        </div>
      )}
        </div>
      </div>

      {/* ═══ MOBILE FILTER BOTTOM SHEET ═══ */}
      {sheetOpen && createPortal(
        <div className="fixed inset-0 z-[100000] sm:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-[shFade_.2s_ease-out]" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-white/10 bg-[#0c0a07] shadow-[0_-12px_40px_rgba(0,0,0,0.5)] animate-[shUp_.28s_cubic-bezier(.16,1,.3,1)]">
            <div className="flex justify-center pt-2.5 pb-1"><div className="h-1 w-10 rounded-full bg-white/20" /></div>

            <div className="flex items-center justify-between px-4 pt-1 pb-2">
              <span className="font-display text-[15px] font-semibold text-white">Filters</span>
              <button onClick={() => setSheetOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-text-muted active:scale-95 transition-transform" aria-label="Close">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="max-h-[68vh] overflow-y-auto px-4">
              {/* View / category */}
              <p className="mb-2 mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted/60">View</p>
              <div className="space-y-1.5">
                {CATEGORIES.map((c) => {
                  const on = category === c.key;
                  return (
                    <button
                      key={c.key}
                      onClick={() => setCategory(c.key)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 transition-all active:scale-[0.99] ${on ? 'border-gold-primary/40 bg-gold-primary/10' : 'border-white/[0.06] bg-white/[0.02]'}`}
                    >
                      <span className={`font-mono text-[12px] ${on ? 'font-semibold text-gold-primary' : 'text-white/80'}`}>{c.label}</span>
                      {on && <svg viewBox="0 0 20 20" className="h-4 w-4 fill-gold-primary" aria-hidden="true"><path d="M8 13.5 4.5 10l-1.2 1.2L8 16l9-9-1.2-1.2z" /></svg>}
                    </button>
                  );
                })}
              </div>

              {/* Timeframe */}
              <p className="mb-2 mt-5 font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted/60">Timeframe</p>
              <div className="grid grid-cols-2 gap-1.5">
                {presets.map(({ key, label }) => {
                  const on = activeFilter === key;
                  return (
                    <button
                      key={key}
                      onClick={() => handlePresetClick(key)}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-3 font-mono text-[12px] transition-all active:scale-[0.99] ${on ? 'border-gold-primary/40 bg-gold-primary/10 font-semibold text-gold-primary' : 'border-white/[0.06] bg-white/[0.02] text-white/80'}`}
                    >
                      {label}
                      {on && <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-gold-primary" aria-hidden="true"><path d="M8 13.5 4.5 10l-1.2 1.2L8 16l9-9-1.2-1.2z" /></svg>}
                    </button>
                  );
                })}
              </div>

              {/* Custom date range */}
              {activeFilter === 'custom' && (
                <div className="mt-3 space-y-2 rounded-xl border border-gold-primary/20 bg-[#0a0506] p-3">
                  <label className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted">{t('top.from')}</span>
                    <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-[190px] rounded-lg border border-white/10 bg-[#0c0a07] px-3 py-2 font-mono text-xs text-white [color-scheme:dark] focus:border-gold-primary/50 focus:outline-none" />
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted">{t('top.to')}</span>
                    <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-[190px] rounded-lg border border-white/10 bg-[#0c0a07] px-3 py-2 font-mono text-xs text-white [color-scheme:dark] focus:border-gold-primary/50 focus:outline-none" />
                  </label>
                </div>
              )}
            </div>

            <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
              <button
                onClick={() => { if (activeFilter === 'custom') handleCustomApply(); setSheetOpen(false); }}
                className="w-full rounded-xl bg-gold-primary py-3 font-mono text-[12px] font-bold uppercase tracking-wider text-[#1a1206] transition-transform active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        @keyframes tpRowIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes shUp { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
        .tp-row { animation: tpRowIn 0.4s ease-out both; }
        @keyframes proofHintIn { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @media (prefers-reduced-motion: reduce) { .tp-row { animation: none; } }
      `}</style>

      {/* Three-second proof cue on each fresh page visit */}
      {showProofHint && !modalOpen && (
        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-none fixed inset-x-4 bottom-[92px] z-[9990] mx-auto max-w-[420px] rounded-2xl border border-gold-primary/30 bg-[#120a08]/95 px-4 py-3 shadow-[0_12px_36px_rgba(0,0,0,0.42),0_0_24px_rgba(212,168,83,0.10)] backdrop-blur-xl transition-all duration-500 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:mx-0 sm:w-[360px] ${
            isProofHintClosing ? 'translate-y-2 opacity-0' : 'animate-[proofHintIn_.35s_cubic-bezier(.16,1,.3,1)] opacity-100'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-gold-primary/25 bg-gold-primary/10 text-gold-primary">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path d="M12 4.25c-5.1 0-9.24 3.36-10.85 7.3a1.2 1.2 0 0 0 0 .9c1.61 3.94 5.75 7.3 10.85 7.3s9.24-3.36 10.85-7.3a1.2 1.2 0 0 0 0-.9C21.24 7.61 17.1 4.25 12 4.25Zm0 11.2a3.75 3.75 0 1 1 0-7.5 3.75 3.75 0 0 1 0 7.5Zm0-2.05a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-gold-primary">Call proof</p>
              <p className="mt-0.5 text-[12px] leading-snug text-white/84">Tap any listed coin to view the original call proof.</p>
            </div>
          </div>
        </div>
      )}

      {/* === MODAL (unchanged logic) === */}
      {modalOpen && modalItem && (
        <SignalDetailModal item={modalItem} detail={signalDetail} loading={detailLoading}
          signalIds={modalSignalIds} currentIndex={modalIndex} onNavigate={goToSignal}
          onClose={closeModal} cleanPair={cleanPair} t={t}
          onOpenHistory={openHistoryModal} />
      )}

      <SignalModal signal={historyModalSignal} isOpen={historyModalOpen} onClose={closeHistoryModal} initialTab="history" />
    </div>
  );
};

// === SPARK — mini price path (call -> peak) line+area, MEXC "24H Market" analog ===
const Spark = ({ data, up = true, compact = false }) => {
  const height = compact ? 20 : 28;
  const pad = compact ? 2 : 3;
  if (!Array.isArray(data) || data.length < 2) {
    return <div className={`flex w-full items-center ${compact ? 'h-5' : 'h-7'}`}><span className="h-px w-full bg-white/[0.06]" /></div>;
  }
  const w = 100, h = height;
  const min = Math.min(...data), max = Math.max(...data);
  const range = (max - min) || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = pad + (h - pad * 2) - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  const col = up ? '#4ade80' : '#f87171';
  const gid = `sg${Math.round((min + max + data.length) * 1000) % 100000}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`${compact ? 'h-5' : 'h-7'} w-full`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={col} stopOpacity="0.22" />
          <stop offset="1" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={col} strokeWidth={compact ? "1.25" : "1.5"} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

// === Client-side sparkline fetch (call -> peak) — uses backend `sparkline` if
//     present, else pulls Binance (futures/spot) then Bybit klines directly. ===
const _sparkCache = {};
const sparkSymbol = (p) => ((p || '').replace(/^3A/i, '').replace(/USDT$/i, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()) + 'USDT';
const _spBin = (sec) => (sec <= 6 * 3600 ? '5m' : sec <= 2 * 86400 ? '1h' : sec <= 10 * 86400 ? '4h' : '1d');
const _spBybit = (sec) => (sec <= 6 * 3600 ? '5' : sec <= 2 * 86400 ? '60' : sec <= 10 * 86400 ? '240' : 'D');
const _dsp = (arr, n = 24) => { if (!arr || arr.length < 2) return null; if (arr.length <= n) return arr; const step = arr.length / n; return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]); };

async function fetchSinceCall(item) {
  const symbol = sparkSymbol(item.pair);
  const start = item.signal_time ? new Date(item.signal_time).getTime() : NaN;
  if (!start || isNaN(start)) return null;
  const end = item.hit_time ? new Date(item.hit_time).getTime() : Date.now();
  const span = Math.max((end - start) / 1000, 60);
  const bi = _spBin(span);
  const urls = [
    `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${bi}&startTime=${start}&endTime=${end}&limit=90`,
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${bi}&startTime=${start}&endTime=${end}&limit=90`,
  ];
  for (const u of urls) {
    try { const r = await fetch(u); if (r.ok) { const d = await r.json(); if (Array.isArray(d) && d.length >= 2) return _dsp(d.map((c) => parseFloat(c[4]))); } } catch { /* try next */ }
  }
  try {
    const r = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${_spBybit(span)}&start=${start}&end=${end}&limit=90`);
    if (r.ok) { const j = await r.json(); const list = (j?.result?.list || []).map((k) => parseFloat(k[4])).reverse(); if (list.length >= 2) return _dsp(list); }
  } catch { /* give up */ }
  return null;
}

const SinceCallSpark = ({ item, compact = false }) => {
  const [pts, setPts] = useState(Array.isArray(item.sparkline) && item.sparkline.length > 1 ? item.sparkline : null);
  useEffect(() => {
    if (Array.isArray(item.sparkline) && item.sparkline.length > 1) { setPts(item.sparkline); return; }
    const key = item.signal_id || item.pair;
    if (_sparkCache[key]) { setPts(_sparkCache[key]); return; }
    let alive = true;
    fetchSinceCall(item).then((d) => { if (alive && d) { _sparkCache[key] = d; setPts(d); } });
    return () => { alive = false; };
  }, [item.signal_id, item.pair, item.sparkline]);
  return <Spark data={pts} up={(item.gain_pct || 0) >= 0} compact={compact} />;
};

function formatDuration(s) { if (!s || s <= 0) return 'N/A'; const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60); if (d > 0) return `${d}d ${h}h ${m}m`; if (h > 0) return `${h}h ${m}m`; if (m > 0) return `${m}m ${sec}s`; return `${sec}s`; }
function formatPrice(p) { if (!p || p <= 0) return '0.00'; if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); if (p >= 1) return p.toFixed(4); if (p >= 0.01) return p.toFixed(6); return p.toFixed(8); }
function formatGainDisplay(pct) { if (pct >= 10000) return (pct / 1000).toFixed(1) + 'K%'; if (pct >= 1000) return pct.toFixed(0) + '%'; return pct.toFixed(2) + '%'; }

// ================================================================
// SIGNAL DETAIL MODAL — logic intact, presentation redesigned
// ================================================================

export const SignalDetailModal = ({ item, detail, loading, signalIds, currentIndex, onNavigate, onClose, cleanPair, t, onOpenHistory }) => {
  const [lightboxImg, setLightboxImg] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const [showTV, setShowTV] = useState(false);
  const [peakPrice, setPeakPrice] = useState(null);
  const pair = cleanPair(item.pair || detail?.pair);
  const total = signalIds.length;
  const multi = total > 1;
  const created = detail?.created_at || item.signal_time;

  // Link to LuxQuant's X post. If a per-signal tweet URL is ever stored on the
  // signal (detail.x_post_url), use it directly; otherwise fall back to a live
  // search of LuxQuant's own posts for this coin's cashtag (drives X traffic).
  const X_HANDLE = "luxquantcrypto";
  const xCash = (pair || "").replace(/USDT$|USDC$|USD$/i, "");
  const xUrl =
    detail?.x_post_url ||
    `https://x.com/search?q=${encodeURIComponent(`$${xCash} from:${X_HANDLE}`)}&f=live`;

  useEffect(() => { setShowTV(false); setPeakPrice(null); }, [currentIndex]);

  useEffect(() => {
    if (!detail?.entry || !created || !pair) return;
    const fetchPeakPrice = async () => {
      try {
        const entryVal = Number(detail.entry);
        const symbol = pair.replace('USDT', '') + 'USDT';
        const startTime = new Date(created).getTime();
        if (isNaN(startTime)) return;

        const extractPeak = (candles, gH) => {
          if (!Array.isArray(candles) || candles.length === 0) return null;
          let best = entryVal;
          let bestTs = null;
          candles.forEach(c => {
            const h = gH(c);
            if (h > best) { best = h; bestTs = c; }
          });
          return best > entryVal ? best : null;
        };

        const bH = c => parseFloat(c[2]);
        const yH = c => parseFloat(c.high || c[2]);

        let peak = null;

        try { const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1h&startTime=${startTime}&limit=1500`); if (r.ok) { const d = await r.json(); if (Array.isArray(d) && d.length > 0) peak = extractPeak(d, bH); } } catch {}
        if (!peak) { try { const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&startTime=${startTime}&limit=1500`); if (r.ok) { const d = await r.json(); if (Array.isArray(d) && d.length > 0) peak = extractPeak(d, bH); } } catch {} }
        if (!peak) { try { const r = await fetch(`https://api.bybit.id/v5/market/kline?category=linear&symbol=${symbol}&interval=60&start=${startTime}&end=${Date.now()}&limit=1000`); if (r.ok) { const j = await r.json(); const list = (j?.result?.list || []).map(k => ({ high: k[2] })); peak = extractPeak(list, yH); } } catch {} }
        if (!peak) { try { const r = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=60&start=${startTime}&end=${Date.now()}&limit=1000`); if (r.ok) { const j = await r.json(); const list = (j?.result?.list || []).map(k => ({ high: k[2] })); peak = extractPeak(list, yH); } } catch {} }
        if (!peak) { try { const r = await fetch(`https://api.bybit.id/v5/market/kline?category=spot&symbol=${symbol}&interval=60&start=${startTime}&end=${Date.now()}&limit=1000`); if (r.ok) { const j = await r.json(); const list = (j?.result?.list || []).map(k => ({ high: k[2] })); peak = extractPeak(list, yH); } } catch {} }

        if (peak) setPeakPrice(peak);
      } catch (e) { console.error("[PeakPrice] failed:", e); }
    };
    fetchPeakPrice();
  }, [detail, created, pair]);

  const handleClose = () => { setIsClosing(true); setTimeout(() => { setIsClosing(false); onClose(); }, 200); };
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  useEffect(() => { const h = (e) => { if (e.key === 'Escape') { if (lightboxImg) setLightboxImg(null); else handleClose(); } if (multi && !lightboxImg) { if (e.key === 'ArrowLeft') onNavigate(currentIndex - 1); if (e.key === 'ArrowRight') onNavigate(currentIndex + 1); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [handleClose, onNavigate, currentIndex, multi, lightboxImg]);

  const fmtDt = ts => { if (!ts) return '\u2014'; try { return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); } catch { return ts; } };
  const fmtDiff = (f, t2) => { if (!f || !t2) return '\u2014'; try { const d = (new Date(t2) - new Date(f)) / 1000; if (d <= 0) return '< 1s'; const dd = Math.floor(d/86400), hh = Math.floor((d%86400)/3600), mm = Math.floor((d%3600)/60), ss = Math.floor(d%60); if (dd > 0) return `${dd}d ${hh}h`; if (hh > 0) return `${hh}h ${mm}m`; if (mm > 0) return `${mm}m`; return `${ss}s`; } catch { return '\u2014'; } };
  const status = detail?.status?.toLowerCase() || 'open';
  const isStopped = ['closed_loss', 'sl'].includes(status);
  const sLabel = s => ({ closed_win: 'WIN', closed_loss: 'LOSS', tp1: 'TP1', tp2: 'TP2', tp3: 'TP3', tp4: 'TP4', open: 'OPEN' }[s?.toLowerCase()] || s?.toUpperCase() || 'OPEN');
  const sColor = s => (s?.toLowerCase() === 'closed_win' || s?.toLowerCase().startsWith('tp')) ? 'bg-profit' : (s?.toLowerCase() === 'closed_loss' || s?.toLowerCase() === 'sl') ? 'bg-loss' : 'bg-cyan-500';

  // Journey theme — adds glow + gradient-stop classes for the redesigned timeline
  const themeColors = {
    gold:  { text: 'text-gold-primary', dot: 'bg-gold-primary', glow: 'shadow-gold-primary/60', from: 'from-gold-primary/70', to: 'to-gold-primary/70' },
    green: { text: 'text-profit',       dot: 'bg-profit',       glow: 'shadow-profit/60',       from: 'from-profit/70',       to: 'to-profit/70' },
    red:   { text: 'text-loss',         dot: 'bg-loss',         glow: 'shadow-loss/60',         from: 'from-loss/70',         to: 'to-loss/70' },
  };

  const entryImg = detail?.entry_chart_url;
  const rawAfterImg = detail?.latest_chart_url;
  const afterImg = deriveChartWithCard(rawAfterImg) || rawAfterImg;
  const hasAnyImg = entryImg || afterImg;
  const showInteractiveRight = showTV || (!afterImg && entryImg);

  useEffect(() => { let widget = null; const shouldMount = (!hasAnyImg && detail) || (hasAnyImg && showInteractiveRight); const initTV = () => { if (!document.getElementById('tv_chart_modal_topperf')) return; widget = new window.TradingView.widget({ container_id: 'tv_chart_modal_topperf', autosize: true, symbol: `BINANCE:${pair.replace('USDT', '')}USDT.P`, interval: '60', timezone: 'Asia/Jakarta', theme: 'dark', style: '1', locale: 'en', toolbar_bg: '#0a0a0f', enable_publishing: false, backgroundColor: '#0d0d0d', gridColor: 'rgba(212, 168, 83, 0.05)', hide_top_toolbar: false, hide_legend: false, hide_side_toolbar: false, allow_symbol_change: true, save_image: false, studies: ["STD;SMA"] }); }; if (shouldMount) { const tm = setTimeout(() => { if (window.TradingView) initTV(); else { const s = document.createElement('script'); s.src = 'https://s3.tradingview.com/tv.js'; s.async = true; s.onload = initTV; document.head.appendChild(s); } }, 100); return () => { clearTimeout(tm); if (widget) try { widget.remove(); } catch {} }; } }, [pair, hasAnyImg, showInteractiveRight, detail]);

  const events = [];
  events.push({ label: t('top.called_sig'), time: 'T+0', sub: fmtDt(created), detail: `${t('top.entry')} @ $${formatPrice(detail?.entry)}`, key: 'gold', isSL: false });
  if (detail?.updates) { detail.updates.forEach(u => { const isSL = u.update_type === 'sl' || u.update_type === 'sl1' || u.update_type === 'sl2'; events.push({ label: isSL ? t('top.sl_hit') : `${u.update_type?.toUpperCase().replace('TP','TP ')} ${t('top.hit')}`, time: `+${fmtDiff(created, u.update_at)}`, sub: fmtDt(u.update_at), detail: u.price > 0 ? `$${formatPrice(u.price)}${!isSL && detail.entry > 0 ? ` (+${((Math.abs(u.price - detail.entry) / detail.entry) * 100).toFixed(2)}%)` : ''}` : null, key: isSL ? 'red' : 'green', isSL }); }); }

  const modalContent = (
    <div className={`fixed inset-0 z-[100000] flex items-center justify-center p-0 sm:p-4 lg:p-6 isolation-isolate ${isClosing ? 'animate-[smBO_.2s_ease-in_forwards]' : 'animate-[smBI_.25s_ease-out]'}`}>
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={handleClose} />
      <div className={`relative w-full sm:max-w-5xl lg:max-w-[1400px] h-full sm:h-auto bg-[#0a0506] border-0 sm:border border-gold-primary/40 rounded-none sm:rounded-2xl overflow-hidden shadow-2xl sm:shadow-[0_25px_50px_rgba(0,0,0,0.5),0_0_40px_rgba(212,168,83,0.1)] flex flex-col max-h-full sm:max-h-[calc(100dvh-2rem)] lg:max-h-[calc(100dvh-3rem)] ${isClosing ? 'animate-[smDn_.2s_ease-in_forwards] sm:animate-[smCO_.2s_ease-in_forwards]' : 'animate-[smUp_.3s_cubic-bezier(.16,1,.3,1)] sm:animate-[smCI_.3s_cubic-bezier(.16,1,.3,1)]'}`}>
        <div className="sm:hidden flex-shrink-0 flex justify-center pt-2 pb-1 bg-[#0a0a0a]"><div className="w-10 h-1 rounded-full bg-white/20" /></div>
        <div className="flex-shrink-0 bg-[#0a0a0a] border-b border-gold-primary/30 px-4 py-3 z-10">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1"><CoinLogo pair={pair} size={32} /><div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><h2 className="text-white font-display text-base font-semibold truncate">{pair}</h2>{status && <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase ${sColor(status)}`}>{sLabel(status)}</span>}{detail?.risk_level && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-gold-primary/30 text-gold-primary">{detail.risk_level}</span>}</div><p className="text-text-muted text-xs mt-0.5 truncate">{t('top.called_sig')}: {fmtDt(created)}</p></div></div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
              {/* View on X — LuxQuant's post for this coin (fallback: live cashtag search) */}
              <a
                href={xUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group/x inline-flex items-center gap-1.5 h-9 w-9 sm:w-auto sm:px-4 justify-center rounded-full bg-white/[0.04] border border-white/10 text-white hover:border-gold-primary/40 hover:bg-white/[0.07] hover:text-gold-primary font-mono text-[10px] uppercase tracking-wider font-bold transition-all active:scale-[0.97]"
                title="View LuxQuant's posts on X"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                <span className="hidden sm:inline">View on X</span>
              </a>
              {onOpenHistory && (
                <button
                  onClick={() => onOpenHistory(item)}
                  className="lq-shine group/hist relative overflow-hidden inline-flex items-center gap-1.5 h-9 w-9 sm:w-auto sm:px-4 justify-center rounded-full bg-gold-primary text-[#1a1206] hover:bg-gold-primary/90 font-mono text-[10px] uppercase tracking-wider font-bold shadow-[0_4px_16px_-4px_rgba(212,168,83,0.7)] transition-all active:scale-[0.97]"
                  title="Open full signal history"
                >
                  <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  <span className="hidden sm:inline">Full History</span>
                </button>
              )}
              <button onClick={handleClose} className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-loss/20 hover:border-loss/50 flex items-center justify-center text-text-muted hover:text-white transition-all active:scale-[0.97]"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
          </div>
          {multi && (
            <div className="mt-3 pt-3 border-t border-gold-primary/10">
              <div className="mx-auto flex w-full max-w-sm items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                <button
                  onClick={() => onNavigate(currentIndex - 1)}
                  disabled={currentIndex <= 0}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] sm:text-xs font-bold text-gold-primary hover:bg-gold-primary/10 disabled:opacity-25 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                  <span className="hidden sm:inline">{t('top.prev')}</span>
                </button>
                <div className="flex items-center gap-1.5">
                  <span className="hidden sm:inline text-text-muted/70 font-mono text-[9px] uppercase tracking-wider mr-1">{t('top.signal')}</span>
                  {signalIds.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => onNavigate(i)}
                      className={`h-6 min-w-[1.5rem] px-1 rounded-md text-[10px] font-bold tabular-nums transition-all ${i === currentIndex ? 'bg-gold-primary text-[#1a1206] shadow-[0_2px_8px_-2px_rgba(212,168,83,0.6)]' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => onNavigate(currentIndex + 1)}
                  disabled={currentIndex >= total - 1}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] sm:text-xs font-bold text-gold-primary hover:bg-gold-primary/10 disabled:opacity-25 disabled:cursor-not-allowed transition-all active:scale-[0.97]"
                >
                  <span className="hidden sm:inline">{t('top.next')}</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0a0a0a] px-4 py-4 sm:px-6 sm:py-6">
          {loading ? (<div className="flex items-center justify-center py-20"><div className="text-center"><div className="w-10 h-10 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin mx-auto mb-4" /><p className="text-gold-primary font-mono text-sm">{t('top.loading')}</p></div></div>
          ) : detail?.is_redacted ? (
            <div className="flex items-center justify-center py-12 px-4">
              <div className="max-w-md text-center">
                <div className="w-20 h-20 mx-auto rounded-full bg-gold-primary/15 border-2 border-gold-primary/40 flex items-center justify-center mb-5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gold-primary"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <h3 className="text-white font-display font-bold text-xl mb-3">Premium Live Signal</h3>
                <p className="text-white/60 text-sm leading-relaxed mb-2">
                  This signal is still <span className="text-gold-primary font-semibold">open and running</span>.
                </p>
                <p className="text-white/50 text-xs leading-relaxed mb-6">
                  Subscribe to view live entry, take-profits, stop-loss, charts, and full trade journey.
                </p>
                <button onClick={() => { window.location.href = '/pricing'; }} className="px-6 py-3 rounded-lg bg-gold-primary text-black font-bold text-sm hover:bg-gold-primary/90 transition-all active:scale-[0.98]">
                  Subscribe to Unlock
                </button>
                <p className="text-[11px] text-white/40 mt-4">
                  Closed signals are visible for free as track record proof.
                </p>
                {detail.pair && (
                  <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10">
                    <span className="text-text-muted text-xs">Pair:</span>
                    <span className="text-white font-mono font-semibold text-sm">{detail.pair}</span>
                    <span className="text-text-muted text-xs">·</span>
                    <span className="text-cyan-400 text-xs font-bold uppercase">OPEN</span>
                  </div>
                )}
              </div>
            </div>
          ) : detail ? (
            <div className="max-w-[1320px] mx-auto space-y-6 sm:space-y-8 pb-4">
              <div className="w-full">
                <div className="flex items-center justify-between mb-3"><span className="text-gold-primary text-xs sm:text-sm font-semibold flex items-center gap-2">{t('top.trade_proof')}</span></div>
                {!hasAnyImg ? (<div className="w-full h-[360px] sm:h-[440px] lg:h-[560px] bg-[#0d0d0d] rounded-xl border border-gold-primary/15 overflow-hidden relative shadow-lg"><div id="tv_chart_modal_topperf" className="absolute inset-0 w-full h-full" /></div>
                ) : (
                  <div className="flex flex-col md:flex-row items-stretch gap-4 sm:gap-5 w-full">
                    <div className="flex-1 w-full min-w-0 flex flex-col">
                      <div className="flex items-center justify-between mb-2 px-1 min-h-[28px]"><span className="text-blue-400 text-[10px] sm:text-xs font-bold tracking-wide uppercase">{t('top.before')}</span>{detail?.entry > 0 && (<span className="text-[10px] sm:text-[11px] font-mono text-white/80 bg-[#0d0d0d] px-2 py-1 rounded border border-white/5">Entry: <span className="text-white ml-1">${formatPrice(detail.entry)}</span></span>)}</div>
                      {entryImg ? (<div className="relative group rounded-xl overflow-hidden border border-gold-primary/10 bg-[#0d0d0d] h-[240px] sm:h-[340px] lg:h-[440px] xl:h-[520px] w-full cursor-zoom-in shadow-md" onClick={() => setLightboxImg(entryImg)}><img src={entryImg} alt="Entry" className="absolute inset-0 w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300" loading="lazy" /><div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center pointer-events-none"><span className="opacity-0 group-hover:opacity-100 bg-black/80 text-white text-xs px-3 py-1.5 rounded font-medium backdrop-blur-sm">{t('top.fullscreen')}</span></div></div>) : (<div className="rounded-xl border border-dashed border-white/10 bg-[#0d0d0d] flex flex-col items-center justify-center h-[240px] sm:h-[340px] lg:h-[440px] xl:h-[520px] w-full text-text-muted"><p className="text-xs">{t('top.waiting_ss')}</p></div>)}
                    </div>
                    <div className="hidden md:flex flex-col items-center justify-center w-10 shrink-0 relative mt-6"><div className="absolute top-1/2 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500/30 via-white/10 to-profit/30 -translate-y-1/2 z-0" /><div className="relative z-10 bg-[#0a0a0a] border border-white/10 text-white/50 w-8 h-8 rounded-full flex items-center justify-center"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg></div></div>
                    <div className="md:hidden flex justify-center py-1"><div className="w-[2px] h-6 bg-gradient-to-b from-blue-500/30 via-white/10 to-profit/30 relative"><div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-profit/50" /></div></div>
                    <div className="flex-1 w-full min-w-0 flex flex-col">
                      <div className="flex items-center justify-between mb-2 px-1 min-h-[28px]"><span className={`text-[10px] sm:text-xs font-bold tracking-wide uppercase ${isStopped ? 'text-loss' : 'text-profit'}`}>{t('top.after')} ({status === 'open' ? t('top.latest') : sLabel(status)})</span><div className="flex items-center gap-2">{showInteractiveRight && afterImg && (<button onClick={() => setShowTV(false)} className="text-[9px] sm:text-[10px] text-text-muted hover:text-white flex items-center gap-1 bg-[#0d0d0d] hover:bg-white/5 px-2 py-1 rounded border border-white/5"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>{t('top.back_img')}</button>)}{detail?.updates?.length > 0 && (<span className="text-[10px] sm:text-[11px] font-mono text-white/80 bg-[#0d0d0d] px-2 py-1 rounded border border-white/5 flex items-center gap-1">Last: <span className="text-white">${formatPrice(detail.updates[detail.updates.length - 1].price)}</span>{detail.entry > 0 && detail.updates[detail.updates.length - 1].price > 0 && (<span className={`ml-1 font-bold ${isStopped ? 'text-loss' : 'text-profit'}`}>{(((Math.abs(detail.updates[detail.updates.length - 1].price - detail.entry)) / detail.entry) * 100).toFixed(2)}%</span>)}</span>)}</div></div>
                      {showInteractiveRight ? (<div className="relative rounded-xl overflow-hidden border border-gold-primary/10 bg-[#0d0d0d] h-[240px] sm:h-[340px] lg:h-[440px] xl:h-[520px] w-full shadow-md"><div id="tv_chart_modal_topperf" className="absolute inset-0 w-full h-full" /></div>) : (<div className={`relative group rounded-xl overflow-hidden border bg-[#0d0d0d] h-[240px] sm:h-[340px] lg:h-[440px] xl:h-[520px] w-full shadow-md ${isStopped ? 'border-loss/20' : 'border-gold-primary/10'}`}><img src={afterImg} alt="Latest" className="absolute inset-0 w-full h-full object-contain" loading="lazy" onError={(e) => { if (rawAfterImg && e.target.src !== rawAfterImg) { e.target.onerror = null; e.target.src = rawAfterImg; } }} /><div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-3 backdrop-blur-sm z-10"><button onClick={() => setShowTV(true)} className="px-5 py-2.5 bg-gold-primary text-[#1a1206] hover:bg-gold-primary/90 rounded-full font-bold text-xs shadow-[0_4px_16px_-4px_rgba(212,168,83,0.7)] flex items-center gap-2 transition-all active:scale-[0.97]"><span>{t('top.interactive')}</span><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg></button><button onClick={() => setLightboxImg(afterImg)} className="text-white/70 hover:text-white text-[11px] font-medium underline underline-offset-2">{t('top.view_full')}</button></div></div>)}
                    </div>
                  </div>
                )}
                {peakPrice && detail?.entry > 0 && (<div className="mt-5 bg-gradient-to-br from-profit/[0.06] to-[#0d0d0d] border border-profit/15 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6"><div className="flex flex-col items-center sm:items-end"><span className="text-white text-xs sm:text-sm font-bold uppercase tracking-widest">Highest Price After Called</span></div><div className="hidden sm:block h-8 w-px bg-white/10" /><div className="flex items-center gap-3 sm:gap-4"><span className="text-lg sm:text-2xl font-mono font-bold text-white">${formatPrice(peakPrice)}</span><span className="text-sm sm:text-base font-bold text-profit bg-profit/10 px-2.5 py-1 rounded-lg border border-profit/20 font-mono">{(((Math.abs(peakPrice - detail.entry)) / detail.entry) * 100).toFixed(2)}%</span></div></div>)}
              </div>
              <div className="space-y-6">
                {/* ── SIGNAL JOURNEY — glowing nodes + gradient progress track ── */}
                <div>
                  <h4 className="text-gold-primary text-xs sm:text-sm font-semibold mb-3 flex items-center gap-2">{t('top.journey')}</h4>
                  <div className="bg-[#0d0d0d] rounded-xl border border-gold-primary/10 p-4 sm:p-5">
                    {/* MOBILE — vertical timeline (no horizontal scroll) */}
                    <div className="sm:hidden">
                      {events.map((ev, i) => {
                        const c = themeColors[ev.key] || themeColors.gold;
                        const isLast = i === events.length - 1;
                        return (
                          <div key={i} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-[0_0_14px_-3px] ${c.dot} ${c.glow}`}>
                                {i === 0 ? (
                                  <span className="w-2 h-2 rounded-full bg-white/90" />
                                ) : ev.isSL ? (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                )}
                            </div>
                            {!isLast && <div className={`w-0.5 flex-1 min-h-[20px] my-1 rounded-full ${c.dot} opacity-30`} />}
                          </div>
                          <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-3'}`}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[12px] font-bold ${c.text}`}>{ev.label}</span>
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/70 whitespace-nowrap">{ev.time}</span>
                            </div>
                            {ev.sub && <p className="text-[10px] text-text-muted mt-0.5">{ev.sub}</p>}
                            {ev.detail && <p className={`text-[11px] font-mono mt-0.5 ${ev.isSL ? 'text-loss' : 'text-profit'}`}>{ev.detail}</p>}
                          </div>
                        </div>
                        );
                      })}
                    </div>

                    {/* DESKTOP — horizontal timeline (width scales to step count) */}
                    <div className="hidden sm:block overflow-x-auto custom-scrollbar">
                      <div className="flex items-start relative pt-1 pb-2" style={{ minWidth: `${Math.max(events.length * 112, 460)}px` }}>
                        <div className="absolute top-[18px] left-[7%] right-[7%] h-[2px] bg-white/[0.05] rounded-full z-0" />
                        {events.map((ev, i) => {
                          const c = themeColors[ev.key] || themeColors.gold;
                          const isLast = i === events.length - 1;
                          const nextC = !isLast ? (themeColors[events[i + 1].key] || themeColors.gold) : null;
                          return (
                            <div key={i} className="relative flex flex-col items-center flex-1 z-10 group">
                              {!isLast && (
                                <div className={`absolute top-[18px] left-1/2 w-full h-[2px] z-0 rounded-full bg-gradient-to-r ${c.from} ${nextC.to}`} />
                              )}
                              <div className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-white shadow-[0_0_18px_-2px] ${c.dot} ${c.glow} ${isLast ? 'ring-2 ring-white/10' : ''}`}>
                                {i === 0 ? (
                                  <span className="w-2.5 h-2.5 rounded-full bg-white/90" />
                                ) : ev.isSL ? (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                )}
                            </div>
                            <div className="mt-3 text-center flex flex-col items-center gap-1 px-1 w-full">
                              <span className={`text-[10px] sm:text-[11px] font-bold tracking-wide truncate w-full ${c.text}`} title={ev.label}>{ev.label}</span>
                              <span className="text-[8px] sm:text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-white/70 whitespace-nowrap">{ev.time}</span>
                              {ev.sub && <span className="text-[8px] text-text-muted truncate w-full" title={ev.sub}>{ev.sub}</span>}
                              {ev.detail && <span className={`text-[9px] font-mono truncate w-full ${ev.isSL ? 'text-loss' : 'text-profit'}`} title={ev.detail}>{ev.detail}</span>}
                            </div>
                          </div>
                        );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {detail.signal_id && (
                  <div>
                    <h4 className="text-gold-primary text-xs sm:text-sm font-semibold mb-3 flex items-center gap-2">Detailed Journey</h4>
                    <SignalJourneyExtended signalId={detail.signal_id} />
                  </div>
                )}

                <div><h4 className="text-gold-primary text-xs sm:text-sm font-semibold mb-3 flex items-center gap-2">{t('top.sig_data')}</h4><div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4"><StatBlock label={t('top.duration')} value={detail.updates?.length > 0 ? fmtDiff(created, detail.updates[detail.updates.length - 1].update_at) : 'Active'} /><StatBlock label={t('top.vol_rank')} value={detail.volume_rank_num && detail.volume_rank_den ? `#${detail.volume_rank_num} / ${detail.volume_rank_den}` : 'N/A'} /><StatBlock label={t('top.risk')} value={detail.risk_level || 'N/A'} valueClass={detail.risk_level === 'High' ? 'text-loss' : detail.risk_level === 'Medium' ? 'text-yellow-400' : 'text-profit'} /></div></div>
              </div>
            </div>
          ) : (<div className="flex items-center justify-center py-20"><p className="text-text-muted text-sm">{t('top.failed')}</p></div>)}
        </div>
      </div>
      {lightboxImg && (<div className="fixed inset-0 z-[200000] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setLightboxImg(null)}><img src={lightboxImg} alt="Full" className="max-w-full max-h-[95vh] object-contain rounded-xl shadow-2xl border border-white/10" onClick={e => e.stopPropagation()} /><button className="absolute top-4 right-4 sm:top-6 sm:right-6 text-white bg-white/10 hover:bg-white/20 p-2 sm:p-3 rounded-full transition-colors backdrop-blur-sm" onClick={() => setLightboxImg(null)}><svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>)}
      <style>{`.custom-scrollbar::-webkit-scrollbar{width:4px;height:6px}.custom-scrollbar::-webkit-scrollbar-track{background:transparent}.custom-scrollbar::-webkit-scrollbar-thumb{background:rgba(212,168,83,.3);border-radius:4px}.custom-scrollbar::-webkit-scrollbar-thumb:hover{background:rgba(212,168,83,.5)}@keyframes smBI{from{opacity:0}to{opacity:1}}@keyframes smBO{from{opacity:1}to{opacity:0}}@keyframes smCI{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}@keyframes smCO{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.97)}}@keyframes smUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}@keyframes smDn{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(40px)}}.lq-shine::after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent 35%,rgba(240,216,144,0.55) 50%,transparent 65%);transform:translateX(-130%);animation:lqShine 3s ease-in-out infinite;pointer-events:none}@keyframes lqShine{0%,55%{transform:translateX(-130%)}100%{transform:translateX(130%)}}@media (prefers-reduced-motion:reduce){.lq-shine::after{animation:none;opacity:0}}`}</style>
    </div>
  );
  return createPortal(modalContent, document.body);
};

const StatBlock = ({ label, value, valueClass = 'text-white' }) => (<div className="bg-[#0d0d0d] rounded-xl border border-gold-primary/10 p-3 sm:p-4 flex flex-col justify-center items-center text-center hover:border-gold-primary/20 transition-colors"><span className="text-text-muted text-[9px] sm:text-[10px] uppercase tracking-wider mb-1.5">{label}</span><span className={`font-mono font-bold text-sm sm:text-base ${valueClass}`}>{value}</span></div>);

export default TopPerformers;