import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import SignalModal from './SignalModal';
import CoinLogo from './CoinLogo';
import StarButton from './StarButton';
import { useAuth } from '../context/AuthContext';
import { watchlistApi } from '../services/watchlistApi';
import { classifyCoin, CoinDetailModal } from './coinIntelShared';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * SignalsTable — Full Original + Strong Color Fix (emerald-400 & red-400)
 * Tidak ada yang dihapus. Hanya warna yang diubah.
 *
 * COLUMN PICKER (NEW):
 * - User bisa pilih kolom mana yang ditampilkan di tabel desktop lewat tombol
 *   "Columns" di kanan atas. Preferensi disimpan di localStorage, jadi pilihan
 *   user persist antar-sesi. Kolom Star + Pair selalu tampil (identitas baris).
 * - Mobile tetap pakai card layout (semua field ringkas), jadi picker hanya
 *   relevan & aktif di desktop table.
 * - Set kolom dibuat sebagai registry (SIGNAL_COLUMNS) supaya nambah kolom baru
 *   (mis. BTC Correlation / Win Streak) cukup tambah 1 entri + 1 header + 1 sel.
 *
 * VOLUME SORT FIX:
 * - Prices/volume are now fetched for ALL pairs (via `allPairs` prop), not just
 *   the current page. Sorting by volume therefore has data for every row.
 * - The accumulated price map is MERGED (never replaced), so navigating pages or
 *   the 15s refresh never blanks out previously-fetched pairs → no reshuffle.
 *
 * PRICE/PNL REGRESSION FIX:
 * - The browser CANNOT reach api.bybit.com directly in many regions (e.g. ID
 *   returns net::ERR_CONNECTION_REFUSED). So we fetch through the BACKEND PROXY
 *   (server-side on the VPS, which can reach Bybit + has .com/.id fallback),
 *   chunked to avoid HTTP 414 on large symbol sets. Direct Bybit is last-resort.
 */

// ================================================================
// COLUMN REGISTRY — toggleable columns (Star + Pair always shown)
// To add a new column later (e.g. BTC Correlation / Win Streak):
//   1) add an entry here, 2) add its <SortableHeader> + <td> in the table,
//      both wrapped in {visibleCols.<key> && (...)}.
// ================================================================
const SIGNAL_COLUMNS = [
  { key: 'current_price', label: 'Price' },
  { key: 'entry',         label: 'Entry' },
  { key: 'max_target',    label: 'Target' },
  { key: 'stop_loss',     label: 'Stop Loss' },
  { key: 'risk_level',    label: 'Risk' },
  { key: 'market_cap',    label: 'MCap' },
  { key: 'volume',        label: 'Vol 24h' },
  { key: 'track_record',  label: 'Track Record' },
  { key: 'btc_corr',      label: 'BTC Corr' },
  { key: 'verdict',       label: 'Verdict' },
  { key: 'status',        label: 'Status' },
  { key: 'last_update',   label: 'Update' },
  { key: 'created_at',    label: 'Called Time' },
];

const COLS_STORAGE_KEY = 'lq:signals:visible-cols';

const defaultVisibleCols = () =>
  SIGNAL_COLUMNS.reduce((acc, c) => { acc[c.key] = true; return acc; }, {});

// Load saved prefs, merged over defaults so any newly-added column defaults to
// visible (and corrupt/missing storage falls back gracefully).
const loadVisibleCols = () => {
  const defaults = defaultVisibleCols();
  try {
    const raw = localStorage.getItem(COLS_STORAGE_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return defaults;
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
};

// ================================================================
// COLUMNS MENU — dropdown of checkboxes to toggle visible columns
// ================================================================
const ColumnsMenu = ({ visibleCols, onToggle, onReset }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const visibleCount = SIGNAL_COLUMNS.filter((c) => visibleCols[c.key]).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0a0805] border border-white/[0.08] hover:border-gold-primary/30 transition-all rounded-sm font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-white"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="18" rx="1" />
          <rect x="14" y="3" width="7" height="18" rx="1" />
        </svg>
        <span>Columns</span>
        <span className="text-text-muted/60 tabular-nums">{visibleCount}/{SIGNAL_COLUMNS.length}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 z-50 bg-[#0a0805] border border-white/[0.1] rounded-md shadow-2xl overflow-hidden">
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white">Visible Columns</span>
            <button
              onClick={onReset}
              className="font-mono text-[9px] uppercase tracking-wider text-text-muted hover:text-gold-primary transition-colors"
            >
              Reset
            </button>
          </div>
          <div className="py-1 max-h-72 overflow-y-auto">
            {SIGNAL_COLUMNS.map((c) => {
              const active = !!visibleCols[c.key];
              const isLast = active && visibleCount === 1; // keep at least one column
              return (
                <button
                  key={c.key}
                  onClick={() => { if (!isLast) onToggle(c.key); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 font-mono text-[11px] transition-colors ${
                    isLast ? 'cursor-not-allowed opacity-60' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${
                    active ? 'bg-gold-primary/20 border-gold-primary/50 text-gold-primary' : 'border-white/[0.15] text-transparent'
                  }`}>
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span className={active ? 'text-white' : 'text-text-muted'}>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const SignalsTable = ({
  signals,
  loading,
  page,
  totalPages,
  onPageChange,
  sortBy,
  sortOrder,
  onSort,
  onPricesUpdate,
  allPairs,
  coinIntel = {},
  verdictByPair = {},
  currentFlow = null,
}) => {
  const { t } = useTranslation();

  const [selectedSignal, setSelectedSignal] = useState(null);
  const [selectedCoinIntel, setSelectedCoinIntel] = useState(null); // coin object for CoinDetailModal
  const [currentPrices, setCurrentPrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesFailed, setPricesFailed] = useState(false);   // true only when NO pair could be fetched at all
  const [showNotice, setShowNotice] = useState(false);       // the dismissible "data unavailable" toast

  // ── Column visibility (desktop table) ──
  const [visibleCols, setVisibleCols] = useState(loadVisibleCols);

  const toggleCol = (key) => {
    setVisibleCols((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const resetCols = () => {
    const d = defaultVisibleCols();
    setVisibleCols(d);
    try { localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(d)); } catch { /* ignore */ }
  };

  // Total <th>/<td> count = Star (1) + Pair (1) + visible toggleable columns.
  // Used for the loading skeleton + empty-state colSpan so they stay aligned.
  const visibleColCount = useMemo(
    () => 2 + SIGNAL_COLUMNS.filter((c) => visibleCols[c.key]).length,
    [visibleCols]
  );

  const { isAuthenticated } = useAuth();
  const [watchlistIds, setWatchlistIds] = useState([]);

  const pairsRef = useRef('');
  const intervalRef = useRef(null);
  const pricesAccumRef = useRef({});           // accumulated price map (merge target)
  const noticeShownRef = useRef(false);        // ensures the notice shows at most once per mount
  const onPricesUpdateRef = useRef(onPricesUpdate);
  onPricesUpdateRef.current = onPricesUpdate;

  useEffect(() => {
    if (!isAuthenticated) return;
    watchlistApi.getWatchlistIds()
      .then(data => setWatchlistIds(data.signal_ids || []))
      .catch(() => {});
  }, [isAuthenticated]);

  // Show a one-time, auto-dismissing notice ONLY when live market data totally
  // failed to load (proxy returned nothing AND direct Bybit was unreachable) —
  // the typical cause is a regional/ISP block on the global exchange.
  useEffect(() => {
    if (pricesFailed && !noticeShownRef.current) {
      noticeShownRef.current = true;
      setShowNotice(true);
      const tid = setTimeout(() => setShowNotice(false), 9000);
      return () => clearTimeout(tid);
    }
  }, [pricesFailed]);

  const handleStarToggle = (signalId, newState) => {
    setWatchlistIds(prev =>
      newState ? [...prev, signalId] : prev.filter(id => id !== signalId)
    );
  };

  // Merge a freshly-fetched map into the accumulated map and notify the parent.
  // Merge (not replace) ensures pairs fetched earlier never disappear.
  const applyMap = (newMap) => {
    const merged = { ...pricesAccumRef.current, ...newMap };
    pricesAccumRef.current = merged;
    setCurrentPrices(merged);
    if (onPricesUpdateRef.current) onPricesUpdateRef.current(merged);
  };

  useEffect(() => {
    // Prefer the full set of pairs (all signals) so volume sort has complete data.
    // Fall back to current-page pairs if allPairs wasn't provided.
    const sourcePairs = (allPairs && allPairs.length > 0)
      ? allPairs
      : (signals || []).map(s => s.pair);

    const uniquePairs = [...new Set(sourcePairs.filter(Boolean))].sort();
    const newKey = uniquePairs.join(',');

    if (newKey === pairsRef.current) return;
    pairsRef.current = newKey;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (uniquePairs.length === 0) return;

    const wanted = new Set(uniquePairs);

    // Fetch all requested symbols THROUGH THE BACKEND PROXY, in chunks.
    // Why proxy: the browser cannot reach api.bybit.com directly in many
    // regions (e.g. ID → net::ERR_CONNECTION_REFUSED). The proxy runs
    // server-side on the VPS, which can reach Bybit (+ has .com/.id fallback).
    // Why chunk: a single symbols= URL with hundreds of pairs blows past the
    // server URL limit (HTTP 414). 40/chunk keeps every URL short & safe.
    const fetchViaProxy = async (symbolList) => {
      const CHUNK = 40;
      const batches = [];
      for (let i = 0; i < symbolList.length; i += CHUNK) {
        batches.push(symbolList.slice(i, i + CHUNK));
      }
      const results = await Promise.allSettled(
        batches.map((b) =>
          fetch(`${API_BASE}/api/v1/market/prices?symbols=${b.join(',')}`)
            .then((r) => (r.ok ? r.json() : null))
        )
      );
      const acc = {};
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value && typeof r.value === 'object') {
          Object.assign(acc, r.value);
        }
      }
      return Object.keys(acc).length > 0 ? acc : null;
    };

    // Last-resort only: direct Bybit from the browser. Works where bybit.com is
    // reachable; will simply fail (and we degrade gracefully) where it isn't.
    const fromBybit = async (category) => {
      const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=${category}`);
      if (!res.ok) return null;
      const json = await res.json();
      const list = json?.result?.list || [];
      const map = {};
      for (const item of list) {
        if (wanted.has(item.symbol)) {
          map[item.symbol] = {
            price: parseFloat(item.lastPrice) || 0,
            volume: parseFloat(item.turnover24h) || 0,
          };
        }
      }
      return Object.keys(map).length > 0 ? map : null;
    };

    const fetchPrices = async () => {
      // 1) Primary: backend proxy (chunked). Server-side, region-proof.
      try {
        const proxied = await fetchViaProxy(uniquePairs);
        if (proxied) {
          applyMap(proxied);
          return;
        }
      } catch (err) {
        console.warn('[Prices] Backend proxy failed, trying Bybit direct:', err.message);
      }

      // 2) Fallback: direct Bybit linear (only where reachable from browser)
      try {
        const linear = await fromBybit('linear');
        if (linear) {
          applyMap(linear);
          return;
        }
      } catch (err2) {
        console.warn('[Prices] Bybit linear failed:', err2.message);
      }

      // 3) Fallback: direct Bybit spot
      try {
        const spot = await fromBybit('spot');
        if (spot) applyMap(spot);
      } catch (err3) {
        console.warn('[Prices] All providers failed:', err3.message);
      }
    };

    const runFetch = async () => {
      await fetchPrices();
      // "Failed" only when the WHOLE map is still empty after every provider
      // tried. Individual unlisted coins staying blank is normal, not a failure.
      setPricesFailed(Object.keys(pricesAccumRef.current).length === 0);
    };

    setPricesLoading(true);
    runFetch().finally(() => setPricesLoading(false));

    intervalRef.current = setInterval(runFetch, 15000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [allPairs, signals]);

  const getPrice = (pair) => {
    const data = currentPrices[pair];
    if (!data) return null;
    if (typeof data === 'number') return data;
    return data.price ?? null;
  };

  const getVolume = (pair) => {
    const data = currentPrices[pair];
    if (!data || typeof data === 'number') return null;
    return data.volume ?? null;
  };

  // Win streak from Coin Intelligence (joined by full pair, e.g. "ZKPUSDT").
  // Returns { type: 'win'|'loss', length } or null when the coin isn't flagged.
  const getStreak = (pair) => {
    const s = coinIntel?.[pair]?.current_streak;
    return (s && s.length) ? s : null;
  };

  // Win rate from Coin Intelligence (same join as streak).
  const getWinRate = (pair) => {
    const wr = coinIntel?.[pair]?.win_rate;
    return (wr == null) ? null : wr;
  };
  const wrColor = (wr) =>
    wr >= 70 ? 'text-emerald-400' : wr >= 50 ? 'text-amber-400' : 'text-red-400';

  // BTC correlation — joined onto the row by the backend bulk-7d query.
  // Returns null when the correlation worker hasn't computed this signal yet.
  const getBtc = (signal) => {
    const score = signal?.btc_align_score;
    if (score == null) return null;
    return {
      score,
      beta: signal.btc_beta,
      corr: signal.btc_corr,
      risk: signal.btc_risk,
      decoupled: !!signal.btc_decoupled,
      extended: !!signal.btc_extended,
    };
  };
  const btcScoreColor = (s) =>
    s >= 70 ? 'text-emerald-400' : s >= 50 ? 'text-amber-400' : 'text-rose-400';
  const fmtSigned = (n, d = 2) => (n == null ? '—' : (n >= 0 ? '+' : '') + Number(n).toFixed(d));

  // Verdict (worth_it / avoid / neutral) for a pair, plus its coin-intel object
  // (needed to open the deep-analysis modal). Returns null when no intel exists.
  const getVerdict = (pair) => {
    const coin = coinIntel?.[pair];
    if (!coin) return null;
    const v = verdictByPair?.[pair] || classifyCoin(coin);
    return { verdict: v, coin };
  };

  const formatPrice = (price) => {
    if (!price && price !== 0) return '-';
    const num = parseFloat(price);
    if (isNaN(num)) return '-';
    if (num < 0.001) return num.toFixed(8);
    if (num < 1) return num.toFixed(6);
    if (num < 10) return num.toFixed(4);
    return num.toFixed(2);
  };

  const formatVolume = (vol) => {
    if (!vol) return '-';
    const num = parseFloat(vol);
    if (isNaN(num)) return '-';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
  };

  const getCoinName = (pair) => pair ? pair.replace(/USDT$/i, '') : '';

  const calcPct = (target, entry) => {
    if (!target || !entry) return null;
    const t = parseFloat(target);
    const e = parseFloat(entry);
    if (isNaN(t) || isNaN(e) || e === 0) return null;
    return ((t - e) / e * 100);
  };

  const getMaxTarget = (signal) => {
    const targets = [signal.target4, signal.target3, signal.target2, signal.target1].filter(Boolean);
    return targets.length > 0 ? Math.max(...targets.map(Number)) : null;
  };

  const getPriceChange = (entry, current) => {
    if (!entry || !current) return null;
    return ((current - entry) / entry * 100);
  };

  // ==================== WARNA KUAT (emerald & red) ====================
  const getRiskClasses = (risk) => {
    const r = risk?.toLowerCase() || '';
    if (r.startsWith('low')) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    if (r.startsWith('high')) return 'bg-red-500/10 text-red-400 border-red-500/30';
    return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  };

  const getRiskLabel = (risk) => {
    const r = risk?.toLowerCase() || '';
    if (r.startsWith('low')) return 'Low';
    if (r.startsWith('med') || r.startsWith('nor')) return 'Normal';
    if (r.startsWith('high')) return 'High';
    return risk || '-';
  };

  const formatMarketCap = (mcap) => {
    if (!mcap) return '-';
    if (typeof mcap === 'string' && /[BMKTbmkt]/.test(mcap)) return mcap;
    const num = parseFloat(mcap);
    if (isNaN(num)) return mcap;
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
  };

  const getStatusBadge = (status) => {
    const s = status?.toLowerCase() || '';
    let cls, label;

    if (s === 'open') {
      cls = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      label = 'OPEN';
    } else if (s === 'closed_loss' || s === 'sl') {
      cls = 'bg-red-500/10 text-red-400 border-red-500/30';
      label = 'LOSS';
    } else if (s === 'closed_win') {
      cls = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      label = 'WIN';
    } else if (s.startsWith('tp')) {
      cls = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      label = s.toUpperCase();
    } else {
      cls = 'bg-white/[0.04] text-text-muted border-white/[0.06]';
      label = status || '-';
    }
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 border font-mono text-[10px] uppercase tracking-wider rounded-sm ${cls}`}>
        {label}
      </span>
    );
  };

  const formatDateTimeShort = (dt) => {
    if (!dt) return '-';
    const d = new Date(dt);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  const getUpdateTypeBadge = (updateType) => {
    if (!updateType) return null;
    const ut = updateType.toLowerCase();
    const isLoss = ut === 'sl' || ut === 'sl1' || ut === 'sl2';
    const label = isLoss ? 'Hit SL' : `Hit ${ut.toUpperCase()}`;
    return (
      <span className={`font-mono text-[10px] uppercase tracking-wider ${isLoss ? 'text-red-400' : 'text-emerald-400'}`}>
        {label}
      </span>
    );
  };

  const formatTimeAgo = (dt) => {
    if (!dt) return '';
    const now = new Date();
    const d = new Date(dt);
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDateTimeShort(dt);
  };

  const SortableHeader = ({ field, label, align = 'left' }) => {
    const isActive = sortBy === field;
    const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : '';
    return (
      <th
        className={`py-3 px-4 font-mono text-[10px] font-medium uppercase tracking-[0.18em] cursor-pointer transition-colors select-none ${textAlign} ${
          isActive ? 'text-white' : 'text-text-muted/70 hover:text-text-muted'
        }`}
        onClick={() => onSort && onSort(field)}
      >
        <span className={`group flex items-center gap-1.5 ${justify}`}>
          <span>{label}</span>
          <svg
            className={`w-3 h-3 transition-all ${isActive ? 'opacity-100 text-amber-400' : 'opacity-40 group-hover:opacity-70'}`}
            style={{ transform: isActive && sortOrder === 'asc' ? 'rotate(180deg)' : 'none' }}
            viewBox="0 0 24 24" fill="currentColor"
          >
            <path d="M17.6569 16.2427L19.0711 14.8285L12.0001 7.75739L4.92896 14.8285L6.34317 16.2427L12.0001 10.5858L17.6569 16.2427Z" />
          </svg>
        </span>
      </th>
    );
  };

  const EmptyStateIcon = () => (
    <svg className="w-8 h-8 text-text-muted/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );

  const MobileSignalCard = ({ signal }) => {
    const currentPrice = getPrice(signal.pair);
    const currentVol = getVolume(signal.pair);
    const priceChange = getPriceChange(signal.entry, currentPrice);
    const currentPriceColor = priceChange !== null 
      ? (priceChange >= 0 ? 'text-emerald-400' : 'text-red-400') 
      : 'text-white';

    return (
      <div
        onClick={() => setSelectedSignal(signal)}
        className="relative bg-[#0a0805] rounded-md border border-white/[0.06] p-4 hover:border-amber-400/25 active:bg-white/[0.02] transition-all cursor-pointer overflow-hidden group"
      >
        <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-400/25 to-transparent" />

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <CoinLogo pair={signal.pair} size={32} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <p className="text-white font-mono text-sm tracking-wide group-hover:text-amber-400 transition-colors">
                  {getCoinName(signal.pair)}
                </p>
                <p className="text-text-muted/60 text-[10px] font-mono">USDT</p>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 border font-mono text-[9px] uppercase tracking-wider rounded-sm ${getRiskClasses(signal.risk_level)}`}>
                  {getRiskLabel(signal.risk_level)}
                </span>
                {(() => {
                  const wr = getWinRate(signal.pair);
                  if (wr == null) return null;
                  return (
                    <span className={`px-2 py-0.5 border font-mono text-[9px] uppercase tracking-wider rounded-sm ${
                      wr >= 70 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : wr >= 50 ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-red-500/10 text-red-400 border-red-500/30'
                    }`}>
                      {wr}%
                    </span>
                  );
                })()}
                {(() => {
                  const s = getStreak(signal.pair);
                  if (!s) return null;
                  const isWin = s.type === 'win';
                  return (
                    <span className={`px-2 py-0.5 border font-mono text-[9px] uppercase tracking-wider rounded-sm ${
                      isWin ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'
                    }`}>
                      {s.length}{isWin ? 'W' : 'L'}
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div onClick={(e) => e.stopPropagation()}>
              <StarButton signalId={signal.signal_id} isStarred={watchlistIds.includes(signal.signal_id)} onToggle={handleStarToggle} />
            </div>
            {getStatusBadge(signal.status)}
            {(() => {
              const v = getVerdict(signal.pair);
              if (!v || v.verdict === 'neutral') return null;
              const isAvoid = v.verdict === 'avoid';
              return (
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedCoinIntel(v.coin); }}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 border font-mono text-[9px] uppercase tracking-wider rounded-sm ${
                    isAvoid ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  }`}
                >
                  {isAvoid ? '⛔ Avoid' : '✓ Worth'}
                  {v.coin.risk_score != null && <span className="tabular-nums opacity-70">{v.coin.risk_score}</span>}
                </button>
              );
            })()}
          </div>
        </div>

        {signal.last_update_at && (
          <div className="flex items-center justify-between mb-3 px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-sm">
            <div className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-amber-400/60" />
              {getUpdateTypeBadge(signal.last_update_type)}
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted/60">
              {formatTimeAgo(signal.last_update_at)}
            </span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mb-3 bg-white/[0.02] border border-white/[0.06] p-3 rounded-sm">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60 mb-1">Entry</p>
            <p className="text-white font-mono text-[12px] tabular-nums font-medium">{formatPrice(signal.entry)}</p>
          </div>
          <div className="text-center border-x border-white/[0.04]">
            <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60 mb-1">Current</p>
            {pricesLoading && !currentPrice ? (
              <div className="h-3 w-12 bg-white/[0.04] rounded animate-pulse mx-auto" />
            ) : currentPrice ? (
              <p className={`font-mono text-[12px] tabular-nums font-medium ${currentPriceColor}`}>
                {formatPrice(currentPrice)}
              </p>
            ) : (
              <p className="text-text-muted/40 text-[12px]">-</p>
            )}
          </div>
          <div className="text-right">
            <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60 mb-1">P&L</p>
            {priceChange !== null ? (
              <p className={`font-mono text-[12px] tabular-nums font-medium ${priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </p>
            ) : (
              <p className="text-text-muted/40 text-[12px]">-</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {[
            { label: 'TP1', value: signal.target1 },
            { label: 'TP2', value: signal.target2 },
            { label: 'TP3', value: signal.target3 },
            { label: 'TP4', value: signal.target4 },
          ].map((tp, i) => (
            <div key={i} className="text-center bg-white/[0.015] border border-white/[0.06] py-1.5 px-1 rounded-sm">
              <p className="font-mono text-[8px] uppercase tracking-wider text-text-muted/60">{tp.label}</p>
              <p className="text-text-muted font-mono text-[10px] mt-0.5 tabular-nums font-medium">{tp.value ? formatPrice(tp.value) : '—'}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between text-[10px] border-t border-white/[0.06] pt-3">
          <div className="flex items-center gap-3 flex-wrap font-mono">
            {signal.market_cap && <span className="text-text-muted/60">MC <span className="text-text-muted">{formatMarketCap(signal.market_cap)}</span></span>}
            {currentVol ? (
              <span className="text-text-muted/60">Vol <span className="text-text-muted">{formatVolume(currentVol)}</span></span>
            ) : signal.volume_rank_num && signal.volume_rank_den ? (
              <span className="text-text-muted/60">Vol <span className="text-text-muted">{signal.volume_rank_num}/{signal.volume_rank_den}</span></span>
            ) : null}
            {(() => {
              const b = getBtc(signal);
              if (!b) return null;
              return (
                <span className="text-text-muted/60">BTC <span className={btcScoreColor(b.score)}>{b.score}</span>{b.decoupled ? ' ⚡' : ''}</span>
              );
            })()}
          </div>
          <div className="text-right">
            <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60 mr-1.5">Called</span>
            <span className="text-text-muted font-mono tabular-nums font-medium">{formatDateTimeShort(signal.created_at)}</span>
          </div>
        </div>
      </div>
    );
  };

  const MobileLoadingSkeleton = () => (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-[#0a0805] rounded-md p-4 border border-white/[0.06] animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/[0.04] rounded-full" />
              <div>
                <div className="h-3 w-16 bg-white/[0.04] rounded mb-1.5" />
                <div className="h-2 w-10 bg-white/[0.04] rounded" />
              </div>
            </div>
            <div className="h-5 w-16 bg-white/[0.04] rounded-sm" />
          </div>
          <div className="h-14 w-full bg-white/[0.03] rounded-sm mb-3" />
          <div className="h-7 w-full bg-white/[0.03] rounded-sm mb-3" />
          <div className="h-3 w-full bg-white/[0.03] rounded" />
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div className="lg:hidden">
        {loading ? (
          <MobileLoadingSkeleton />
        ) : signals?.length === 0 ? (
          <div className="bg-[#0a0805] rounded-md p-8 border border-white/[0.06] text-center relative overflow-hidden">
            <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-400/25 to-transparent" />
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                <EmptyStateIcon />
              </div>
              <p className="text-white font-mono text-sm">No signals found</p>
              <p className="text-text-muted font-mono text-[10px] uppercase tracking-wider">Adjust your filters and try again</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {signals.map((signal, idx) => <MobileSignalCard key={signal.signal_id || idx} signal={signal} />)}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between py-4 mt-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Page {page}/{totalPages}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1.5 bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-[10px] uppercase tracking-wider text-white rounded-sm"
              >
                Prev
              </button>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1.5 bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-[10px] uppercase tracking-wider text-white rounded-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="hidden lg:block w-full">
        {/* Toolbar — column picker (sits outside the overflow-hidden card so the
            dropdown isn't clipped) */}
        <div className="flex items-center justify-end mb-3">
          <ColumnsMenu visibleCols={visibleCols} onToggle={toggleCol} onReset={resetCols} />
        </div>

        <div className="relative bg-[#0a0805] rounded-md border border-white/[0.06] overflow-hidden">
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-400/30 to-transparent z-10" />

          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="border-b border-white/[0.06] bg-white/[0.015]">
                <tr>
                  <th className="py-3 px-4 w-10 text-center"></th>
                  <SortableHeader field="pair" label="Pair" />
                  {visibleCols.current_price && <SortableHeader field="current_price" label="Price" align="right" />}
                  {visibleCols.entry && <SortableHeader field="entry" label="Entry" align="right" />}
                  {visibleCols.max_target && <SortableHeader field="max_target" label="Target" align="right" />}
                  {visibleCols.stop_loss && <SortableHeader field="stop_loss" label="Stop Loss" align="right" />}
                  {visibleCols.risk_level && <SortableHeader field="risk_level" label="Risk" align="center" />}
                  {visibleCols.market_cap && <SortableHeader field="market_cap" label="MCap" align="right" />}
                  {visibleCols.volume && <SortableHeader field="volume" label="Vol 24h" align="right" />}
                  {visibleCols.track_record && (
                    <th className="py-3 px-4 font-mono text-[10px] font-medium uppercase tracking-[0.18em] select-none text-center">
                      <span className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onSort && onSort('win_rate')}
                          className={`flex items-center gap-0.5 transition-colors ${sortBy === 'win_rate' ? 'text-white' : 'text-text-muted/70 hover:text-text-muted'}`}
                        >
                          WR
                          <svg className={`w-2.5 h-2.5 transition-all ${sortBy === 'win_rate' ? 'opacity-100 text-amber-400' : 'opacity-0'}`}
                            style={{ transform: sortBy === 'win_rate' && sortOrder === 'asc' ? 'rotate(180deg)' : 'none' }}
                            viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.6569 16.2427L19.0711 14.8285L12.0001 7.75739L4.92896 14.8285L6.34317 16.2427L12.0001 10.5858L17.6569 16.2427Z" />
                          </svg>
                        </button>
                        <span className="text-text-muted/30">/</span>
                        <button
                          onClick={() => onSort && onSort('win_streak')}
                          className={`flex items-center gap-0.5 transition-colors ${sortBy === 'win_streak' ? 'text-white' : 'text-text-muted/70 hover:text-text-muted'}`}
                        >
                          Streak
                          <svg className={`w-2.5 h-2.5 transition-all ${sortBy === 'win_streak' ? 'opacity-100 text-amber-400' : 'opacity-0'}`}
                            style={{ transform: sortBy === 'win_streak' && sortOrder === 'asc' ? 'rotate(180deg)' : 'none' }}
                            viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.6569 16.2427L19.0711 14.8285L12.0001 7.75739L4.92896 14.8285L6.34317 16.2427L12.0001 10.5858L17.6569 16.2427Z" />
                          </svg>
                        </button>
                      </span>
                    </th>
                  )}
                  {visibleCols.btc_corr && <SortableHeader field="btc_corr" label="BTC Corr" align="center" />}
                  {visibleCols.verdict && <SortableHeader field="verdict" label="Verdict" align="center" />}
                  {visibleCols.status && <SortableHeader field="status" label="Status" align="center" />}
                  {visibleCols.last_update && <SortableHeader field="last_update" label="Update" align="center" />}
                  {visibleCols.created_at && <SortableHeader field="created_at" label="Called Time" align="right" />}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(10)].map((_, i) => (
                    <tr key={i} className="border-b border-white/[0.03]">
                      {[...Array(visibleColCount)].map((_, j) => (
                        <td key={j} className="py-4 px-4">
                          <div className="h-3 bg-white/[0.04] rounded animate-pulse"></div>
                        </td>
                      ))}
                    </tr>
                  ))
                ) : signals?.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColCount} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                          <EmptyStateIcon />
                        </div>
                        <p className="text-white font-mono text-sm">No signals found</p>
                        <p className="text-text-muted font-mono text-[10px] uppercase tracking-wider">Adjust your filters and try again</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  signals?.map((signal, idx) => {
                    const maxTarget = getMaxTarget(signal);
                    const currentPrice = getPrice(signal.pair);
                    const currentVol = getVolume(signal.pair);
                    const priceChange = getPriceChange(signal.entry, currentPrice);

                    const currentPriceColor = priceChange !== null 
                      ? (priceChange >= 0 ? 'text-emerald-400' : 'text-red-400') 
                      : 'text-white';

                    return (
                      <tr
                        key={signal.signal_id || idx}
                        onClick={() => setSelectedSignal(signal)}
                        className="border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer transition-colors group"
                      >
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <StarButton signalId={signal.signal_id} isStarred={watchlistIds.includes(signal.signal_id)} onToggle={handleStarToggle} />
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <CoinLogo pair={signal.pair} size={28} />
                            <div>
                              <p className="text-white font-mono text-sm tracking-wide group-hover:text-amber-400 transition-colors">
                                {getCoinName(signal.pair)}
                              </p>
                              <p className="text-text-muted/60 text-[10px] font-mono">USDT</p>
                            </div>
                          </div>
                        </td>

                        {visibleCols.current_price && (
                          <td className="py-3 px-4 text-right">
                            {pricesLoading && !currentPrice ? (
                              <div className="h-3 w-16 bg-white/[0.04] rounded animate-pulse ml-auto" />
                            ) : currentPrice ? (
                              <div className="flex flex-col items-end">
                                <span className={`font-mono text-sm tabular-nums font-medium ${currentPriceColor}`}>
                                  {formatPrice(currentPrice)}
                                </span>
                                {priceChange !== null && (
                                  <span className={`font-mono text-[10px] tabular-nums mt-0.5 font-medium ${priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-text-muted/40">-</span>
                            )}
                          </td>
                        )}

                        {visibleCols.entry && (
                          <td className="py-3 px-4 text-right">
                            <span className="text-text-muted font-mono text-sm tabular-nums font-medium">{formatPrice(signal.entry)}</span>
                          </td>
                        )}

                        {visibleCols.max_target && (
                          <td className="py-3 px-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-emerald-400 font-mono text-sm tabular-nums font-medium">{maxTarget ? formatPrice(maxTarget) : '-'}</span>
                              {maxTarget && (() => {
                                const pct = calcPct(maxTarget, signal.entry);
                                return pct !== null ? (
                                  <span className="text-emerald-400/70 font-mono text-[10px] tabular-nums mt-0.5">+{pct.toFixed(1)}%</span>
                                ) : null;
                              })()}
                            </div>
                          </td>
                        )}

                        {visibleCols.stop_loss && (
                          <td className="py-3 px-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-red-400 font-mono text-sm tabular-nums font-medium">{signal.stop1 ? formatPrice(signal.stop1) : '-'}</span>
                              {signal.stop1 && (() => {
                                const pct = calcPct(signal.stop1, signal.entry);
                                return pct !== null ? (
                                  <span className="text-red-400/70 font-mono text-[10px] tabular-nums mt-0.5">{pct.toFixed(1)}%</span>
                                ) : null;
                              })()}
                            </div>
                          </td>
                        )}

                        {visibleCols.risk_level && (
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 border font-mono text-[10px] uppercase tracking-wider rounded-sm ${getRiskClasses(signal.risk_level)}`}>
                              {getRiskLabel(signal.risk_level)}
                            </span>
                          </td>
                        )}

                        {visibleCols.market_cap && (
                          <td className="py-3 px-4 text-right">
                            {signal.market_cap ? (
                              <span className="text-text-muted font-mono text-sm tabular-nums font-medium">{formatMarketCap(signal.market_cap)}</span>
                            ) : (
                              <span className="text-text-muted/40">-</span>
                            )}
                          </td>
                        )}

                        {visibleCols.volume && (
                          <td className="py-3 px-4 text-right">
                            {currentVol ? (
                              <span className="text-text-muted font-mono text-sm tabular-nums font-medium">{formatVolume(currentVol)}</span>
                            ) : signal.volume_rank_num && signal.volume_rank_den ? (
                              <span className="text-text-muted font-mono text-sm tabular-nums font-medium">
                                {signal.volume_rank_num}<span className="text-text-muted/40">/{signal.volume_rank_den}</span>
                              </span>
                            ) : (
                              <span className="text-text-muted/40">-</span>
                            )}
                          </td>
                        )}

                        {visibleCols.track_record && (
                          <td className="py-3 px-4 text-center">
                            {(() => {
                              const wr = getWinRate(signal.pair);
                              const s = getStreak(signal.pair);
                              if (wr == null && !s) return <span className="text-text-muted/40 text-xs">—</span>;
                              return (
                                <div className="flex flex-col items-center">
                                  {wr != null ? (
                                    <span className={`font-mono text-sm tabular-nums font-medium ${wrColor(wr)}`}>{wr}%</span>
                                  ) : (
                                    <span className="text-text-muted/40 text-xs">—</span>
                                  )}
                                  {s && (
                                    <span className={`font-mono text-[10px] tabular-nums mt-0.5 font-medium ${s.type === 'win' ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
                                      {s.type === 'win' ? '▲' : '▼'} {s.length}{s.type === 'win' ? 'W' : 'L'}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        {visibleCols.btc_corr && (
                          <td className="py-3 px-4 text-center">
                            {(() => {
                              const b = getBtc(signal);
                              if (!b) return <span className="text-text-muted/40 text-xs">—</span>;
                              return (
                                <div className="flex flex-col items-center">
                                  <div className="flex items-center gap-1">
                                    {b.decoupled && <span className="text-purple-400 text-[10px]" title="Decoupled from BTC">⚡</span>}
                                    {b.extended && <span className="text-orange-400 text-[10px]" title="Extended move">🔥</span>}
                                    <span className={`font-mono text-sm tabular-nums font-medium ${btcScoreColor(b.score)}`}>{b.score}</span>
                                  </div>
                                  <span className="font-mono text-[10px] tabular-nums text-text-muted/60 mt-0.5">
                                    ρ{fmtSigned(b.corr)} · β{fmtSigned(b.beta)}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        {visibleCols.verdict && (
                          <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            {(() => {
                              const v = getVerdict(signal.pair);
                              if (!v || v.verdict === 'neutral') return <span className="text-text-muted/40 text-xs">—</span>;
                              const isAvoid = v.verdict === 'avoid';
                              const score = v.coin.risk_score ?? null;
                              return (
                                <button
                                  onClick={() => setSelectedCoinIntel(v.coin)}
                                  title="View deep analysis"
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 border font-mono text-[10px] uppercase tracking-wider rounded-sm transition-all hover:brightness-125 ${
                                    isAvoid ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  }`}
                                >
                                  <span>{isAvoid ? '⛔ Avoid' : '✓ Worth It'}</span>
                                  {score != null && <span className="tabular-nums opacity-70">{score}</span>}
                                </button>
                              );
                            })()}
                          </td>
                        )}

                        {visibleCols.status && (
                          <td className="py-3 px-4 text-center">
                            {getStatusBadge(signal.status)}
                          </td>
                        )}

                        {visibleCols.last_update && (
                          <td className="py-3 px-4 text-center">
                            {signal.last_update_at ? (
                              <div className="flex flex-col items-center gap-0.5">
                                {getUpdateTypeBadge(signal.last_update_type)}
                                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted/60">{formatTimeAgo(signal.last_update_at)}</span>
                              </div>
                            ) : (
                              <span className="text-text-muted/40 text-xs">—</span>
                            )}
                          </td>
                        )}

                        {visibleCols.created_at && (
                          <td className="py-3 px-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-text-muted font-mono text-[11px] tabular-nums font-medium">
                                {(() => {
                                  const d = new Date(signal.created_at);
                                  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                                })()}
                              </span>
                              <span className="font-mono text-[10px] tabular-nums text-text-muted/60 mt-0.5 font-medium">
                                {(() => {
                                  const d = new Date(signal.created_at);
                                  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                                })()}
                              </span>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06] bg-white/[0.015]">
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onPageChange(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-[10px] uppercase tracking-wider text-white rounded-sm"
                >
                  Prev
                </button>
                <button
                  onClick={() => onPageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-[10px] uppercase tracking-wider text-white rounded-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showNotice && (
        <div className="fixed bottom-4 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:max-w-md z-[60] lq-notice-in">
          <div className="relative flex items-start gap-3 bg-[#0a0805] border border-gold-primary/25 rounded-md p-4 pr-10 shadow-2xl overflow-hidden">
            <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
            <span className="absolute left-0 inset-y-0 w-0.5 bg-gold-primary/50" />
            <div className="w-8 h-8 shrink-0 rounded-sm bg-gold-primary/[0.08] border border-gold-primary/20 flex items-center justify-center text-gold-primary/80">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-mono text-xs text-white tracking-wide">Some market data unavailable</p>
              <p className="font-mono text-[11px] leading-relaxed text-text-muted mt-1">
                If prices or volume aren't loading, a global crypto exchange may be blocked on your network or region. Connecting through a VPN usually restores live data.
              </p>
            </div>
            <button
              onClick={() => setShowNotice(false)}
              aria-label="Dismiss"
              className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded-sm text-text-muted/60 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <style>{`
            @keyframes lqNoticeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            .lq-notice-in > div { animation: lqNoticeIn 0.25s ease-out; }
          `}</style>
        </div>
      )}

      <SignalModal signal={selectedSignal} isOpen={!!selectedSignal} onClose={() => setSelectedSignal(null)} />

      {selectedCoinIntel && (
        <CoinDetailModal
          coin={selectedCoinIntel}
          currentFlow={currentFlow}
          onClose={() => setSelectedCoinIntel(null)}
        />
      )}
    </>
  );
};

export default SignalsTable;
