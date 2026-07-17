import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import CoinLogo from './CoinLogo';
import SignalJourneyExtended from './SignalJourneyExtended';
import SignalModal from './SignalModal';
import { ShimmerStyles } from './ui/Loaders';
import {
  getActiveTheme,
  getTradingViewTheme,
  subscribeTheme,
} from '../utils/themeColors';

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

 // Desk ranges — denser than old 1D/7D/30D; maps cleanly to API `days`
 const presets = [
 { key: '1d', label: t('top.d1'), short: '1D', days: 1 },
 { key: '3d', label: '3D', short: '3D', days: 3 },
 { key: '7d', label: t('top.d7'), short: '1W', days: 7 },
 { key: '30d', label: t('top.d30'), short: '1M', days: 30 },
 { key: 'custom', label: t('top.custom'), short: 'Custom', days: null },
 ];

 const CATEGORIES = [
 { key: 'gains', label: 'Biggest Gains', short: 'Gains' },
 { key: 'fastest', label: 'Fastest Hits', short: 'Fast' },
 { key: 'recent', label: 'Most Recent', short: 'Recent' },
 { key: 'multi', label: 'Multi-Calls', short: 'Multi' },
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

 if (loading && !data) {
 return (
 <div className="mb-10">
 <ShimmerStyles />
 <div className="lqsk-group relative overflow-hidden rounded-xl border border-ink/[0.06] bg-surface-raised">
 <div className="border-b border-ink/[0.06] px-4 py-4 sm:px-5">
 <div className="h-5 w-36 rounded bg-ink/[0.05]" />
 <div className="mt-2 h-3 w-52 rounded bg-ink/[0.03]" />
 </div>
 <div className="flex gap-4 border-b border-ink/[0.06] px-4 py-3 sm:px-5">
 {[...Array(4)].map((_, j) => (
 <div key={j} className="h-3 w-16 rounded bg-ink/[0.05]" />
 ))}
 </div>
 <div className="divide-y divide-ink/[0.04] px-4 sm:px-5">
 {[...Array(8)].map((_, j) => (
 <div key={j} className="flex items-center gap-3 py-3.5">
 <div className="h-4 w-4 shrink-0 rounded bg-ink/[0.04]" />
 <div className="h-8 w-8 shrink-0 rounded-full bg-ink/[0.05]" />
 <div className="min-w-0 flex-1">
 <div className="h-3.5 w-20 rounded bg-ink/[0.05]" />
 <div className="mt-1.5 h-2.5 w-28 rounded bg-ink/[0.03]" />
 </div>
 <div className="hidden h-5 w-16 rounded bg-ink/[0.03] sm:block" />
 <div className="h-4 w-14 shrink-0 rounded bg-ink/[0.05]" />
 </div>
 ))}
 </div>
 </div>
 </div>
 );
 }

 // Quiet mono rank — no medals, no gold badges
 const rankBadge = (rank) => (
 <span
 className={`inline-flex w-5 shrink-0 justify-center font-mono text-[11px] tabular-nums sm:w-6 sm:text-[12px] ${
 rank <= 3 ? 'text-text-primary/55' : 'text-text-primary/30'
 }`}
 >
 {rank}
 </span>
 );

 const resultCount = displayed.length;

 return (
 <div className="mb-10 relative">
 {/* Timeless desk panel — hairline border only, no gold edge glow */}
 <div className="relative overflow-hidden rounded-xl border border-ink/[0.06] bg-surface-raised">
 {/* Title strip */}
 <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink/[0.06] bg-ink/[0.015] px-4 py-3.5 sm:px-5 sm:py-4">
 <div className="min-w-0">
 <div className="flex items-center gap-2.5">
 <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary sm:text-xl">
 Top Gainers
 </h2>
 {resultCount > 0 && (
 <span className="rounded border border-ink/[0.08] bg-ink/[0.03] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-text-muted">
 {resultCount}
 </span>
 )}
 </div>
 <p className="mt-1 text-[12px] leading-snug text-text-muted">
 Resolved signal leaderboard · open a row for call proof
 </p>
 </div>
 {periodRange.from && (
 <div className="flex flex-col items-end gap-0.5">
 <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted/60">
 Window
 </span>
 <span className="font-mono text-[11px] tabular-nums text-text-primary/55">
 {periodRange.from}
 {periodRange.to ? (
 <span className="text-text-muted/50"> – {periodRange.to}</span>
 ) : null}
 </span>
 </div>
 )}
 </div>

 {/* Category tabs + range — toolbar */}
 {data && data.top_gainers?.length > 0 && (
 <div className="border-b border-ink/[0.06]">
 <div
 className="no-scrollbar flex gap-0 overflow-x-auto px-2 sm:px-3"
 role="tablist"
 aria-label="Leaderboard categories"
 >
 {CATEGORIES.map((c) => {
 const on = category === c.key;
 return (
 <button
 key={c.key}
 type="button"
 role="tab"
 aria-selected={on}
 onClick={() => setCategory(c.key)}
 className={`relative shrink-0 px-3 py-3 text-[12px] font-medium transition sm:px-4 sm:text-[13px] ${
 on
 ? 'text-text-primary'
 : 'text-text-muted hover:text-text-primary/80'
 }`}
 >
 <span className="sm:hidden">{c.short}</span>
 <span className="hidden sm:inline">{c.label}</span>
 {on && (
 <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-text-primary sm:inset-x-4" />
 )}
 </button>
 );
 })}
 </div>

 <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/[0.04] px-3 py-2 sm:px-4">
 <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted/55">
 Range
 </span>
 <div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md border border-ink/[0.1] bg-surface-secondary p-0.5">
 {presets.map(({ key, short }) => {
 const on = activeFilter === key;
 return (
 <button
 key={key}
 type="button"
 onClick={() => handlePresetClick(key)}
 className={`shrink-0 rounded-[5px] px-2.5 py-1.5 font-mono text-[10px] font-medium tracking-wide transition sm:px-3 sm:text-[11px] ${
 on
 ? 'bg-ink/[0.1] text-text-primary shadow-sm'
 : 'text-text-muted hover:text-text-primary/75'
 }`}
 >
 {short}
 </button>
 );
 })}
 </div>
 </div>

 {showCustom && (
 <div className="grid grid-cols-2 gap-2 border-t border-ink/[0.04] bg-ink/[0.01] px-3 py-2.5 sm:flex sm:flex-wrap sm:items-end sm:px-4">
 <label className="flex min-w-0 flex-col gap-1">
 <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
 {t('top.from')}
 </span>
 <input
 type="date"
 value={customFrom}
 onChange={(e) => setCustomFrom(e.target.value)}
 className="w-full min-w-0 rounded-md border border-ink/10 bg-surface-raised px-2.5 py-1.5 font-mono text-[11px] text-text-primary focus:border-ink/25 focus:outline-none"
 />
 </label>
 <label className="flex min-w-0 flex-col gap-1">
 <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
 {t('top.to')}
 </span>
 <input
 type="date"
 value={customTo}
 onChange={(e) => setCustomTo(e.target.value)}
 className="w-full min-w-0 rounded-md border border-ink/10 bg-surface-raised px-2.5 py-1.5 font-mono text-[11px] text-text-primary focus:border-ink/25 focus:outline-none"
 />
 </label>
 <button
 type="button"
 onClick={handleCustomApply}
 disabled={!customFrom || !customTo}
 className="col-span-2 rounded-md border border-ink/15 bg-ink/[0.08] py-2 text-[11px] font-semibold text-text-primary transition hover:bg-ink/[0.12] disabled:opacity-30 sm:col-span-1 sm:ml-auto sm:px-5"
 >
 {t('top.apply')}
 </button>
 </div>
 )}
 </div>
 )}

 {data && (!data.top_gainers || data.top_gainers.length === 0) && (
 <div className="px-4 py-14 text-center sm:px-5">
 <p className="text-[13px] text-text-primary/35">{t('top.no_tp')}</p>
 </div>
 )}

 {data && data.top_gainers?.length > 0 && (
 <div className={loading ? 'opacity-50 transition-opacity' : ''}>
 {/* Inline proof cue — lives inside the card, not a floating global toast */}
 {showProofHint && !modalOpen && (
 <div
 role="status"
 aria-live="polite"
 className={`mx-3 mt-2 flex items-center gap-2.5 overflow-hidden rounded-lg border border-ink/[0.08] bg-ink/[0.03] px-3 py-2 sm:mx-4 transition-all duration-400 ${
 isProofHintClosing ? 'max-h-0 opacity-0 border-transparent py-0 mt-0' : 'max-h-20 opacity-100 animate-[proofHintIn_.28s_ease-out]'
 }`}
 >
 <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-ink/[0.08] bg-ink/[0.04] text-text-primary/65">
 <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
 <path d="M12 4.25c-5.1 0-9.24 3.36-10.85 7.3a1.2 1.2 0 0 0 0 .9c1.61 3.94 5.75 7.3 10.85 7.3s9.24-3.36 10.85-7.3a1.2 1.2 0 0 0 0-.9C21.24 7.61 17.1 4.25 12 4.25Zm0 11.2a3.75 3.75 0 1 1 0-7.5 3.75 3.75 0 0 1 0 7.5Zm0-2.05a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z" />
 </svg>
 </span>
 <p className="min-w-0 flex-1 text-[12px] leading-snug text-text-primary/80">
 <span className="font-medium text-text-primary">Call proof</span>
 <span className="text-text-muted"> — open any row for the original call, targets, and charts.</span>
 </p>
 </div>
 )}

 {/* Column headers — desk table */}
 <div className="hidden border-b border-ink/[0.05] px-4 py-2 sm:grid sm:grid-cols-[2rem_minmax(0,1.55fr)_5.5rem_minmax(4.5rem,1fr)_4.5rem_5.75rem_1.25rem] sm:items-center sm:gap-3 sm:px-5">
 <span className="text-center font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-text-muted/50">
 #
 </span>
 <span className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-text-muted/50">
 Token
 </span>
 <span className="text-right font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-text-muted/50">
 {t('top.first_entry') || 'Entry'}
 </span>
 <span className="text-center font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-text-muted/50">
 Path
 </span>
 <span className="text-right font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-text-muted/50">
 {t('top.duration') || 'Time'}
 </span>
 <span className="text-right font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-text-muted/50">
 Gain
 </span>
 <span />
 </div>

 <div className="divide-y divide-ink/[0.04]">
 {displayed.map((item, idx) => {
 const rank = idx + 1;
 const gainUp = (item.gain_pct || 0) >= 0;
 const multi = (item.signal_count || 1) > 1;
 return (
 <div
 key={`${item.signal_id || item.pair}-${idx}`}
 role="button"
 tabIndex={0}
 onClick={() => handleItemClick(item)}
 onKeyDown={(e) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 handleItemClick(item);
 }
 }}
 style={{ animationDelay: `${Math.min(idx * 24, 240)}ms` }}
 className="tp-row group cursor-pointer transition-colors hover:bg-ink/[0.028] active:bg-ink/[0.04] focus-visible:bg-ink/[0.03] focus-visible:outline-none"
 >
 {/* Desktop row */}
 <div className="hidden items-center gap-3 px-4 py-3 sm:grid sm:grid-cols-[2rem_minmax(0,1.55fr)_5.5rem_minmax(4.5rem,1fr)_4.5rem_5.75rem_1.25rem] sm:px-5">
 <div className="flex justify-center">{rankBadge(rank)}</div>

 <div className="flex min-w-0 items-center gap-2.5">
 <CoinLogo pair={cleanPair(item.pair)} size={30} />
 <div className="min-w-0">
 <div className="flex min-w-0 items-baseline gap-1.5">
 <span className="truncate font-mono text-[13.5px] font-semibold tracking-tight text-text-primary transition-colors group-hover:text-text-primary">
 {coinSymbol(item.pair)}
 </span>
 <span className="shrink-0 font-mono text-[10px] text-text-primary/28">
 USDT
 </span>
 </div>
 {multi && (
 <p className="mt-0.5 font-mono text-[10px] tabular-nums text-text-muted/70">
 {item.signal_count} calls in window
 </p>
 )}
 </div>
 </div>

 <div className="text-right font-mono text-[12px] tabular-nums text-text-primary/50">
 ${formatPrice(item.entry)}
 </div>

 <div className="flex justify-center px-1">
 <div className="w-full max-w-[120px]">
 <SinceCallSpark item={item} />
 </div>
 </div>

 <div className="text-right font-mono text-[11px] tabular-nums text-text-primary/40">
 {item.duration_display}
 </div>

 <div className="flex flex-col items-end gap-0.5">
 <span
 className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[12.5px] font-semibold tabular-nums leading-none ${
 gainUp
 ? 'bg-profit/10 text-profit'
 : 'bg-red-500/[0.1] text-loss'
 }`}
 >
 {gainUp ? '+' : ''}
 {formatGainDisplay(item.gain_pct)}
 </span>
 {item.tp_price > 0 && (
 <span className="font-mono text-[9px] tabular-nums text-text-primary/28">
 peak ${formatPrice(item.tp_price)}
 </span>
 )}
 </div>

 <div className="flex justify-end text-text-primary/15 transition-colors group-hover:text-text-primary/40">
 <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5l7 7-7 7" />
 </svg>
 </div>
 </div>

 {/* Mobile row */}
 <div className="flex items-center gap-2.5 px-3.5 py-3 sm:hidden">
 {rankBadge(rank)}
 <CoinLogo pair={cleanPair(item.pair)} size={32} />
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-1.5">
 <span className="truncate font-mono text-[14px] font-semibold text-text-primary">
 {coinSymbol(item.pair)}
 </span>
 {multi && (
 <span className="rounded border border-ink/[0.08] bg-ink/[0.03] px-1 font-mono text-[9px] text-text-primary/45">
 ×{item.signal_count}
 </span>
 )}
 </div>
 <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-text-primary/40">
 <span>${formatPrice(item.entry)}</span>
 <span className="text-text-primary/15">·</span>
 <span>{item.duration_display}</span>
 </div>
 </div>
 <div className="w-[48px] shrink-0 opacity-80">
 <SinceCallSpark item={item} compact />
 </div>
 <div className="w-[4.85rem] shrink-0 text-right">
 <span
 className={`inline-flex rounded-md px-1.5 py-0.5 font-mono text-[12.5px] font-semibold tabular-nums leading-none ${
 gainUp
 ? 'bg-profit/10 text-profit'
 : 'bg-red-500/[0.1] text-loss'
 }`}
 >
 {gainUp ? '+' : ''}
 {formatGainDisplay(item.gain_pct)}
 </span>
 </div>
 </div>
 </div>
 );
 })}
 </div>

 {displayed.length === 0 && (
 <div className="px-4 py-12 text-center">
 <p className="text-[13px] text-text-primary/35">{t('top.no_data')}</p>
 </div>
 )}

 {displayed.length > 0 && (
 <div className="flex items-center justify-between gap-3 border-t border-ink/[0.05] px-4 py-2.5 sm:px-5">
 <p className="font-mono text-[10px] text-text-muted/55">
 Tap a row to open call proof
 </p>
 <p className="font-mono text-[10px] tabular-nums text-text-muted/45">
 {resultCount} listed
 </p>
 </div>
 )}
 </div>
 )}
 </div>

 <style>{`
 @keyframes tpRowIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
 .tp-row { animation: tpRowIn 0.32s ease-out both; }
 @keyframes proofHintIn { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 80px; } }
 @media (prefers-reduced-motion: reduce) { .tp-row { animation: none; } }
 `}</style>

 {modalOpen && modalItem && (
 <SignalDetailModal
 item={modalItem}
 detail={signalDetail}
 loading={detailLoading}
 signalIds={modalSignalIds}
 currentIndex={modalIndex}
 onNavigate={goToSignal}
 onClose={closeModal}
 cleanPair={cleanPair}
 t={t}
 onOpenHistory={openHistoryModal}
 />
 )}

 <SignalModal
 signal={historyModalSignal}
 isOpen={historyModalOpen}
 onClose={closeHistoryModal}
 initialTab="history"
 />
 </div>
 );
};

// === SPARK — mini price path (call -> peak) line+area, MEXC "24H Market" analog ===
const Spark = ({ data, up = true, compact = false }) => {
 const height = compact ? 20 : 28;
 const pad = compact ? 2 : 3;
 if (!Array.isArray(data) || data.length < 2) {
 return <div className={`flex w-full items-center ${compact ? 'h-5' : 'h-7'}`}><span className="h-px w-full bg-ink/[0.06]" /></div>;
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
// present, else pulls Binance (futures/spot) then Bybit klines directly. ===
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
 const [appTheme, setAppTheme] = useState(getActiveTheme);
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

 // Current signal id (respects multi-signal navigation) → full history route.
 const currentSid = (signalIds && signalIds[currentIndex]) || item?.signal_id || detail?.signal_id;
 const historyHref = `/signals?signal=${encodeURIComponent(currentSid || "")}&tab=history`;

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
 gold: { text: 'text-accent', dot: 'bg-accent', glow: 'shadow-accent/30', from: 'from-accent/70', to: 'to-accent/70' },
 green: { text: 'text-profit', dot: 'bg-profit', glow: 'shadow-profit/60', from: 'from-profit/70', to: 'to-profit/70' },
 red: { text: 'text-loss', dot: 'bg-loss', glow: 'shadow-loss/60', from: 'from-loss/70', to: 'to-loss/70' },
 };

 const entryImg = detail?.entry_chart_url;
 const rawAfterImg = detail?.latest_chart_url;
 const afterImg = deriveChartWithCard(rawAfterImg) || rawAfterImg;
 const hasAnyImg = entryImg || afterImg;
 const showInteractiveRight = showTV || (!afterImg && entryImg);

 useEffect(() => subscribeTheme(setAppTheme), []);

 useEffect(() => {
 let widget = null;
 const shouldMount = (!hasAnyImg && detail) || (hasAnyImg && showInteractiveRight);
 const tv = getTradingViewTheme(appTheme);
 const initTV = () => {
 const el = document.getElementById('tv_chart_modal_topperf');
 if (!el || !window.TradingView) return;
 el.style.background = tv.backgroundColor;
 widget = new window.TradingView.widget({
 container_id: 'tv_chart_modal_topperf',
 autosize: true,
 symbol: `BINANCE:${pair.replace('USDT', '')}USDT.P`,
 interval: '60',
 timezone: 'Asia/Jakarta',
 theme: tv.theme,
 style: '1',
 locale: 'en',
 toolbar_bg: tv.toolbar_bg,
 enable_publishing: false,
 backgroundColor: tv.backgroundColor,
 gridColor: tv.gridColor,
 hide_top_toolbar: false,
 hide_legend: false,
 hide_side_toolbar: false,
 allow_symbol_change: true,
 save_image: false,
 studies: ['STD;SMA'],
 overrides: {
 'paneProperties.background': tv.backgroundColor,
 'paneProperties.backgroundType': 'solid',
 'paneProperties.vertGridProperties.color': tv.gridColor,
 'paneProperties.horzGridProperties.color': tv.gridColor,
 'scalesProperties.textColor': tv.textColor,
 'mainSeriesProperties.candleStyle.upColor': tv.upColor,
 'mainSeriesProperties.candleStyle.downColor': tv.downColor,
 'mainSeriesProperties.candleStyle.borderUpColor': tv.upColor,
 'mainSeriesProperties.candleStyle.borderDownColor': tv.downColor,
 'mainSeriesProperties.candleStyle.wickUpColor': tv.upColor,
 'mainSeriesProperties.candleStyle.wickDownColor': tv.downColor,
 },
 });
 };
 if (!shouldMount) return undefined;
 const tm = setTimeout(() => {
 if (window.TradingView) initTV();
 else {
 const s = document.createElement('script');
 s.src = 'https://s3.tradingview.com/tv.js';
 s.async = true;
 s.onload = initTV;
 document.head.appendChild(s);
 }
 }, 100);
 return () => {
 clearTimeout(tm);
 if (widget) try { widget.remove(); } catch {}
 };
 }, [pair, hasAnyImg, showInteractiveRight, detail, appTheme]);

 const events = [];
 events.push({ label: t('top.called_sig'), time: 'T+0', sub: fmtDt(created), detail: `${t('top.entry')} @ $${formatPrice(detail?.entry)}`, key: 'gold', isSL: false });
 if (detail?.updates) { detail.updates.forEach(u => { const isSL = u.update_type === 'sl' || u.update_type === 'sl1' || u.update_type === 'sl2'; events.push({ label: isSL ? t('top.sl_hit') : `${u.update_type?.toUpperCase().replace('TP','TP ')} ${t('top.hit')}`, time: `+${fmtDiff(created, u.update_at)}`, sub: fmtDt(u.update_at), detail: u.price > 0 ? `$${formatPrice(u.price)}${!isSL && detail.entry > 0 ? ` (+${((Math.abs(u.price - detail.entry) / detail.entry) * 100).toFixed(2)}%)` : ''}` : null, key: isSL ? 'red' : 'green', isSL }); }); }

 const modalContent = (
 <div className={`fixed inset-0 z-[100000] flex items-end justify-center sm:items-center sm:p-3 lg:p-5 ${isClosing ? "animate-[smBO_.2s_ease-in_forwards]" : "animate-[smBI_.25s_ease-out]"}`}>
 <div className="absolute inset-0 bg-scrim/75" onClick={handleClose} />
 <div
 className={`relative flex h-[min(92dvh,100%)] max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-ink/[0.08] bg-surface-raised shadow-2xl lg:max-w-[1200px] sm:h-auto sm:max-h-[min(90dvh,900px)] sm:rounded-xl ${
 isClosing
 ? "animate-[smSheetDn_.22s_ease-in_forwards] sm:animate-[smCO_.2s_ease-in_forwards]"
 : "animate-[smSheetUp_.32s_cubic-bezier(.16,1,.3,1)] sm:animate-[smCI_.28s_cubic-bezier(.16,1,.3,1)]"
 }`}
 >
 <div className="flex shrink-0 justify-center pt-2 sm:hidden">
 <div className="h-1 w-9 rounded-full bg-ink/20" />
 </div>

 {/* Header — exchange trade ticket */}
 <div className="flex shrink-0 items-center gap-2 border-b border-ink/[0.06] px-3 py-2.5 sm:px-4">
 <CoinLogo pair={pair} size={28} />
 <div className="min-w-0 flex-1">
 <div className="flex flex-wrap items-center gap-1.5">
 <h2 className="truncate font-mono text-[15px] font-semibold text-text-primary sm:text-base">{pair}</h2>
 {status && (
 <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-text-primary ${sColor(status)}`}>
 {sLabel(status)}
 </span>
 )}
 {detail?.risk_level && (
 <span className="rounded border border-ink/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-text-primary/50">
 {detail.risk_level}
 </span>
 )}
 </div>
 <p className="truncate font-mono text-[10px] text-text-muted">
 {fmtDt(created)}
 </p>
 </div>
 <div className="flex shrink-0 items-center gap-1">
 <a
 href={xUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex h-8 items-center gap-1.5 rounded-md border border-ink/[0.1] bg-ink/[0.04] px-2 text-[11px] font-medium text-text-primary/80 transition hover:border-ink/20 hover:bg-ink/[0.08] hover:text-text-primary sm:px-2.5"
 title={`Explore $${xCash} on X`}
 >
 <span className="hidden sm:inline text-text-muted">Explore on</span>
 <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-label="X" role="img"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
 </a>
 {onOpenHistory ? (
 <button
 type="button"
 onClick={() => onOpenHistory(item)}
 className="inline-flex h-8 items-center gap-1 rounded-md border border-ink/[0.08] px-2 text-[11px] text-text-primary/60 transition hover:bg-ink/[0.04] hover:text-text-primary sm:px-2.5"
 >
 <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
 <span className="hidden sm:inline">History</span>
 </button>
 ) : (
 <a
 href={historyHref}
 className="inline-flex h-8 items-center gap-1 rounded-md border border-ink/[0.08] px-2 text-[11px] text-text-primary/60 transition hover:bg-ink/[0.04] hover:text-text-primary sm:px-2.5"
 >
 <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
 <span className="hidden sm:inline">History</span>
 </a>
 )}
 <button
 type="button"
 onClick={handleClose}
 className="flex h-8 w-8 items-center justify-center rounded-md border border-ink/[0.08] text-text-primary/45 transition hover:bg-ink/[0.04] hover:text-text-primary"
 aria-label="Close"
 >
 <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
 </button>
 </div>
 </div>

 {multi && (
 <div className="flex shrink-0 items-center justify-center gap-2 border-b border-ink/[0.05] px-3 py-2">
 <button
 type="button"
 onClick={() => onNavigate(currentIndex - 1)}
 disabled={currentIndex <= 0}
 className="rounded-md px-2 py-1 text-[11px] text-text-primary/50 disabled:opacity-25 hover:text-text-primary"
 >
 ‹
 </button>
 <div className="flex items-center gap-1">
 {signalIds.map((_, i) => (
 <button
 key={i}
 type="button"
 onClick={() => onNavigate(i)}
 className={`h-6 min-w-[1.5rem] rounded px-1 font-mono text-[10px] tabular-nums ${
 i === currentIndex ? "bg-ink/15 text-text-primary" : "text-text-primary/35 hover:text-text-primary/70"
 }`}
 >
 {i + 1}
 </button>
 ))}
 </div>
 <button
 type="button"
 onClick={() => onNavigate(currentIndex + 1)}
 disabled={currentIndex >= total - 1}
 className="rounded-md px-2 py-1 text-[11px] text-text-primary/50 disabled:opacity-25 hover:text-text-primary"
 >
 ›
 </button>
 </div>
 )}

 <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4">
 {loading ? (
 <div className="flex items-center justify-center py-16">
 <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink/10 border-t-white/50" />
 </div>
 ) : detail?.is_redacted ? (
 <div className="mx-auto max-w-sm py-12 text-center">
 <p className="text-[15px] font-semibold text-text-primary">Premium live signal</p>
 <p className="mt-2 text-[13px] text-text-muted">
 Subscribe to view entry, targets, charts, and journey while the trade is open.
 </p>
 <button
 type="button"
 onClick={() => { window.location.href = "/pricing"; }}
 className="mt-5 rounded-md bg-accent px-5 py-2.5 text-[13px] font-semibold text-surface-hover"
 >
 View plans
 </button>
 </div>
 ) : detail ? (
 <div className="space-y-4 pb-2">
 {/* Compact metrics strip */}
 <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
 <div className="rounded-lg border border-ink/[0.06] bg-surface-raised px-3 py-2">
 <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Entry</p>
 <p className="mt-0.5 font-mono text-[13px] font-semibold tabular-nums text-text-primary">
 {detail.entry > 0 ? `$${formatPrice(detail.entry)}` : "—"}
 </p>
 </div>
 <div className="rounded-lg border border-ink/[0.06] bg-surface-raised px-3 py-2">
 <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Peak</p>
 <p className="mt-0.5 font-mono text-[13px] font-semibold tabular-nums text-text-primary">
 {peakPrice ? `$${formatPrice(peakPrice)}` : "—"}
 {peakPrice && detail.entry > 0 && (
 <span className="ml-1.5 text-[11px] text-profit">
 +{(((Math.abs(peakPrice - detail.entry)) / detail.entry) * 100).toFixed(1)}%
 </span>
 )}
 </p>
 </div>
 <div className="rounded-lg border border-ink/[0.06] bg-surface-raised px-3 py-2">
 <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted">{t("top.duration")}</p>
 <p className="mt-0.5 font-mono text-[13px] font-semibold text-text-primary">
 {detail.updates?.length > 0
 ? fmtDiff(created, detail.updates[detail.updates.length - 1].update_at)
 : "Active"}
 </p>
 </div>
 <div className="rounded-lg border border-ink/[0.06] bg-surface-raised px-3 py-2">
 <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted">{t("top.risk")}</p>
 <p
 className={`mt-0.5 font-mono text-[13px] font-semibold ${
 detail.risk_level === "High"
 ? "text-loss"
 : detail.risk_level === "Medium"
 ? "text-yellow-400"
 : "text-profit"
 }`}
 >
 {detail.risk_level || "—"}
 </p>
 </div>
 </div>

 {/* Charts — symmetric proof desk (matches SignalModal Trade tab) */}
 <div>
 <div className="mb-2.5 flex items-center justify-between gap-2">
 <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
 {t("top.trade_proof")}
 </p>
 <span className="font-mono text-[9px] text-text-muted/55">
 Execution proof · signal progress
 </span>
 </div>
 {!hasAnyImg ? (
 <div className="relative h-[300px] overflow-hidden rounded-xl border border-ink/[0.08] bg-surface-secondary sm:h-[400px]">
 <div id="tv_chart_modal_topperf" className="absolute inset-0 h-full w-full" />
 </div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-0 items-stretch">
 {/* BEFORE */}
 <div className="min-w-0 flex flex-col rounded-xl border border-ink/[0.08] bg-surface-secondary/40 overflow-hidden">
 <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-ink/[0.06]">
 <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
 {t("top.before")}
 </span>
 {detail?.entry > 0 && (
 <span className="font-mono text-[11px] tabular-nums text-text-primary/80">
 ${formatPrice(detail.entry)}
 </span>
 )}
 </div>
 <div className="p-2 flex-1 flex flex-col">
 {entryImg ? (
 <button
 type="button"
 onClick={() => setLightboxImg(entryImg)}
 className="relative block h-[200px] w-full overflow-hidden rounded-lg border border-ink/[0.06] bg-[rgb(var(--surface-secondary))] sm:h-[260px] lg:h-[300px] cursor-zoom-in"
 >
 <img src={entryImg} alt="" className="absolute inset-0 h-full w-full object-contain" loading="lazy" />
 </button>
 ) : (
 <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-ink/10 bg-[rgb(var(--surface-secondary))] text-[11px] text-text-muted sm:h-[260px] lg:h-[300px]">
 {t("top.waiting_ss")}
 </div>
 )}
 <div className="mt-2 flex items-center gap-1.5">
 <button
 type="button"
 disabled={!entryImg}
 onClick={() => entryImg && setLightboxImg(entryImg)}
 className="inline-flex h-8 flex-1 items-center justify-center rounded-lg border border-ink/[0.1] bg-ink/[0.04] text-[11px] font-medium text-text-primary/80 transition hover:bg-ink/[0.08] disabled:opacity-35 disabled:pointer-events-none"
 >
 Full size
 </button>
 </div>
 </div>
 </div>

 <div className="hidden md:flex flex-col items-center justify-center px-2.5 shrink-0">
 <div className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/[0.1] bg-surface-raised text-text-muted">
 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
 </svg>
 </div>
 </div>
 <div className="md:hidden flex items-center justify-center py-0.5">
 <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted/50">↓ after</span>
 </div>

 {/* AFTER */}
 <div className="min-w-0 flex flex-col rounded-xl border border-ink/[0.08] bg-surface-secondary/40 overflow-hidden">
 <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-ink/[0.06]">
 <span className={`font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${isStopped ? "text-loss" : "text-positive"}`}>
 {t("top.after")} · {status === "open" ? t("top.latest") : sLabel(status)}
 </span>
 <div className="flex items-center gap-2">
 {showInteractiveRight && afterImg && (
 <button
 type="button"
 onClick={() => setShowTV(false)}
 className="font-mono text-[9px] uppercase tracking-wide text-text-muted hover:text-text-primary"
 >
 Snapshot
 </button>
 )}
 {detail?.updates?.length > 0 && (
 <span className="font-mono text-[11px] tabular-nums text-text-primary/80">
 ${formatPrice(detail.updates[detail.updates.length - 1].price)}
 {detail.entry > 0 && detail.updates[detail.updates.length - 1].price > 0 && (
 <span className={`ml-1 font-semibold ${isStopped ? "text-loss" : "text-positive"}`}>
 {(((Math.abs(detail.updates[detail.updates.length - 1].price - detail.entry)) / detail.entry) * 100).toFixed(1)}%
 </span>
 )}
 </span>
 )}
 </div>
 </div>
 <div className="p-2 flex-1 flex flex-col">
 {showInteractiveRight ? (
 <div className="relative h-[200px] overflow-hidden rounded-lg border border-ink/[0.06] bg-[rgb(var(--surface-secondary))] sm:h-[260px] lg:h-[300px]">
 <div id="tv_chart_modal_topperf" className="absolute inset-0 h-full w-full" />
 </div>
 ) : afterImg ? (
 <div className="relative h-[200px] w-full overflow-hidden rounded-lg border border-ink/[0.06] bg-[rgb(var(--surface-secondary))] sm:h-[260px] lg:h-[300px]">
 <img
 src={afterImg}
 alt=""
 className="absolute inset-0 h-full w-full object-contain"
 loading="lazy"
 onError={(e) => {
 if (rawAfterImg && e.target.src !== rawAfterImg) {
 e.target.onerror = null;
 e.target.src = rawAfterImg;
 }
 }}
 />
 </div>
 ) : (
 <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-ink/10 text-[11px] text-text-muted sm:h-[260px] lg:h-[300px]">
 {t("top.waiting_ss")}
 </div>
 )}
 <div className="mt-2 flex items-center gap-1.5">
 {!showInteractiveRight ? (
 <button
 type="button"
 onClick={() => setShowTV(true)}
 className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink/15 bg-ink/[0.08] text-[11px] font-semibold text-text-primary transition hover:bg-ink/[0.12]"
 >
 <svg className="h-3 w-3 shrink-0 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
 <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 14l3-3 3 3 5-6" />
 </svg>
 Live chart
 </button>
 ) : (
 <button
 type="button"
 onClick={() => setShowTV(false)}
 className="inline-flex h-8 flex-1 items-center justify-center rounded-lg border border-ink/[0.1] bg-ink/[0.04] text-[11px] font-medium text-text-primary/80 transition hover:bg-ink/[0.08]"
 >
 Show snapshot
 </button>
 )}
 <button
 type="button"
 disabled={!afterImg}
 onClick={() => afterImg && setLightboxImg(afterImg)}
 className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-ink/[0.1] px-3 text-[11px] font-medium text-text-muted transition hover:text-text-primary disabled:opacity-35 disabled:pointer-events-none"
 >
 Full
 </button>
 </div>
 </div>
 </div>
 </div>
 )}
 </div>

 {/* Journey */}
 <div>
 <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">
 {t("top.journey")}
 </p>
 <div className="rounded-lg border border-ink/[0.06] bg-surface-raised p-3 sm:p-4">
 <div className="sm:hidden space-y-0">
 {events.map((ev, i) => {
 const c = themeColors[ev.key] || themeColors.gold;
 const isLast = i === events.length - 1;
 return (
 <div key={i} className="flex gap-2.5">
 <div className="flex flex-col items-center">
 <div className={`flex h-7 w-7 items-center justify-center rounded-full text-text-primary ${c.dot}`}>
 {i === 0 ? (
 <span className="h-1.5 w-1.5 rounded-full bg-ink/90" />
 ) : ev.isSL ? (
 <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
 ) : (
 <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
 )}
 </div>
 {!isLast && <div className="my-0.5 w-px flex-1 min-h-[12px] bg-ink/10" />}
 </div>
 <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-2.5"}`}>
 <div className="flex flex-wrap items-center gap-1.5">
 <span className={`text-[12px] font-semibold ${c.text}`}>{ev.label}</span>
 <span className="font-mono text-[9px] text-text-primary/40">{ev.time}</span>
 </div>
 {ev.sub && <p className="text-[10px] text-text-muted">{ev.sub}</p>}
 {ev.detail && (
 <p className={`font-mono text-[11px] ${ev.isSL ? "text-loss" : "text-profit"}`}>
 {ev.detail}
 </p>
 )}
 </div>
 </div>
 );
 })}
 </div>
 <div className="hidden overflow-x-auto sm:block">
 <div className="flex items-start pt-1" style={{ minWidth: `${Math.max(events.length * 100, 400)}px` }}>
 {events.map((ev, i) => {
 const c = themeColors[ev.key] || themeColors.gold;
 const isLast = i === events.length - 1;
 return (
 <div key={i} className="relative flex flex-1 flex-col items-center">
 {!isLast && (
 <div className="absolute left-1/2 top-[14px] h-px w-full bg-ink/10" />
 )}
 <div className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-text-primary ${c.dot}`}>
 {i === 0 ? (
 <span className="h-1.5 w-1.5 rounded-full bg-ink/90" />
 ) : ev.isSL ? (
 <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
 ) : (
 <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
 )}
 </div>
 <div className="mt-2 w-full px-1 text-center">
 <p className={`truncate text-[10px] font-semibold ${c.text}`}>{ev.label}</p>
 <p className="font-mono text-[9px] text-text-primary/40">{ev.time}</p>
 {ev.detail && (
 <p className={`truncate font-mono text-[9px] ${ev.isSL ? "text-loss" : "text-profit"}`}>
 {ev.detail}
 </p>
 )}
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
 <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-muted">
 Detailed journey
 </p>
 <SignalJourneyExtended signalId={detail.signal_id} />
 </div>
 )}

 <div className="grid grid-cols-3 gap-2">
 <StatBlock
 label={t("top.duration")}
 value={
 detail.updates?.length > 0
 ? fmtDiff(created, detail.updates[detail.updates.length - 1].update_at)
 : "Active"
 }
 />
 <StatBlock
 label={t("top.vol_rank")}
 value={
 detail.volume_rank_num && detail.volume_rank_den
 ? `#${detail.volume_rank_num}/${detail.volume_rank_den}`
 : "—"
 }
 />
 <StatBlock
 label={t("top.risk")}
 value={detail.risk_level || "—"}
 valueClass={
 detail.risk_level === "High"
 ? "text-loss"
 : detail.risk_level === "Medium"
 ? "text-yellow-400"
 : "text-profit"
 }
 />
 </div>
 </div>
 ) : (
 <div className="py-16 text-center text-[13px] text-text-muted">{t("top.failed")}</div>
 )}
 </div>
 </div>

 {lightboxImg && (
 <div
 className="fixed inset-0 z-[200000] flex cursor-zoom-out items-center justify-center bg-scrim/95 p-4"
 onClick={() => setLightboxImg(null)}
 >
 <img
 src={lightboxImg}
 alt=""
 className="max-h-[95vh] max-w-full rounded-lg object-contain"
 onClick={(e) => e.stopPropagation()}
 />
 </div>
 )}
 <style>{`
 @keyframes smBI{from{opacity:0}to{opacity:1}}
 @keyframes smBO{from{opacity:1}to{opacity:0}}
 @keyframes smCI{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:scale(1)}}
 @keyframes smCO{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.98)}}
 @keyframes smSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
 @keyframes smSheetDn{from{transform:translateY(0)}to{transform:translateY(100%)}}
 `}</style>
 </div>
 );

 return createPortal(modalContent, document.body);
};

const StatBlock = ({ label, value, valueClass = "text-text-primary" }) => (
 <div className="flex flex-col items-center justify-center rounded-lg border border-ink/[0.06] bg-surface-raised px-2 py-2.5 text-center">
 <span className="mb-1 font-mono text-[9px] uppercase tracking-wider text-text-muted">{label}</span>
 <span className={`font-mono text-[12px] font-semibold sm:text-[13px] ${valueClass}`}>{value}</span>
 </div>
);

export default TopPerformers;