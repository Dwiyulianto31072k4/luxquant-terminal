// src/components/MarketPulsePage.jsx
//
// NOTE (activity-tracking fix): semua fetch ke backend LuxQuant
// (/api/v1/market-pulse/*) sekarang lewat instance `api`
// (src/services/authApi.js) bukan `fetch()` polos, supaya Bearer token
// tersisip otomatis (lewat axios interceptor) kalau user sedang login.
// Endpoint market-pulse tetap publik (boleh diakses tanpa login), tapi
// dengan ini ActivityTrackerMiddleware di backend bisa mencatat
// kunjungan halaman Market Pulse untuk user yang sedang login.
// Fetch ke Binance/Bybit di CoinChartModal TIDAK diubah — itu API publik
// pihak ketiga (bukan backend kita), jadi tidak relevan untuk tracking.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import CoinLogo from "./CoinLogo";
import {
  SignalStatusProvider,
  useSignalStatus,
  STATUS_META,
  timeAgo as signalTimeAgo,
} from "../context/SignalStatusContext";
import GlobalSignalModalHost from "./SignalStatusModal";
import { SignalDetailModal } from "./TopPerformers";
import { ResponsiveContainer, Treemap, Tooltip as RTooltip } from "recharts";
import api from "../services/authApi";
import { useNavigate, useSearchParams } from "react-router-dom";
import AssistantWidget from "./assistant/AssistantWidget";
import { ShimmerStyles } from "./ui/Loaders";
import { heatPct } from "./terminal/vizShared";
import {
  getActiveTheme,
  getTradingViewTheme,
  mountTradingViewEmbed,
  subscribeTheme,
} from "../utils/themeColors";
import { SegGroup } from "./ui/SegGroup";
import { PageHeader } from "./ui/PageHeader";

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════

const stripQuote = (sym) => (sym || "").replace(/USDT$|USDC$|BUSD$|USD$/i, "");

// Classify an event as pump (upside) vs dump (downside). Bullish direction OR
// a non-bearish event with a non-negative pct counts as a pump.
const isPumpEvent = (e) => {
  const pc = Number(e?.pct_change) || 0;
  return e?.direction === "bullish" || (e?.direction !== "bearish" && pc >= 0);
};

// Group ALL events for the same pair (not only consecutive).
// Feed is newest-first → first time we see a pair is its latest activity.
// This surfaces "BOME pumped 4× in the window" even when events are spaced out.
const groupByPair = (list, { sortBy = "latest" } = {}) => {
  const order = [];
  const map = new Map();
  (list || []).forEach((e) => {
    const pair = e?.pair;
    if (!pair) return;
    if (!map.has(pair)) {
      map.set(pair, {
        pair,
        events: [],
        pumpCount: 0,
        dumpCount: 0,
      });
      order.push(pair);
    }
    const g = map.get(pair);
    g.events.push(e);
    if (isPumpEvent(e)) g.pumpCount += 1;
    else g.dumpCount += 1;
  });

  let groups = order.map((p) => map.get(p));
  if (sortBy === "repeat") {
    groups = [...groups].sort((a, b) => {
      const dc = b.events.length - a.events.length;
      if (dc !== 0) return dc;
      const aT = a.events[0]?.created_at || "";
      const bT = b.events[0]?.created_at || "";
      return bT > aT ? 1 : bT < aT ? -1 : 0;
    });
  }
  return groups;
};

/** How "hot" a coin is in the current window (for badge emphasis). */
const repeatTier = (n) => {
  if (n >= 5) return "hot";
  if (n >= 3) return "warm";
  if (n >= 2) return "repeat";
  return null;
};

const titleCase = (s) => {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

const formatPrice = (p) => {
  if (!p || p <= 0) return "0.00";
  if (p >= 1000)
    return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(6);
  return p.toFixed(8);
};

const formatVolume = (v) => {
  if (!v || v <= 0) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(2) + "K";
  return v.toFixed(2);
};

/** Compact trade-count label (Binance kline field "number of trades"). */
const fmtTicks = (n) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(v >= 10e3 ? 0 : 1) + "K";
  return String(Math.round(v));
};

const fmtChg = (n, digits = 2) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
};

// ════════════════════════════════════════════════════════
// ICONS — Lucide-style inline SVG (consistent w/ Flowscan)
// ════════════════════════════════════════════════════════

const IconSearch = ({ className = "h-3.5 w-3.5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

const IconClose = ({ className = "h-3.5 w-3.5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconBolt = ({ className = "h-3.5 w-3.5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const IconChartLine = ({ className = "h-3.5 w-3.5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 3v18h18" />
    <path d="m19 9-5 5-4-4-3 3" />
  </svg>
);

const IconExternal = ({ className = "h-3 w-3" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const IconChevronDown = ({ className = "h-3 w-3" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const IconChevronUp = ({ className = "h-3 w-3" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const IconArrowUpTri = ({ className = "h-2.5 w-2.5" }) => (
  <svg className={className} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
    <path d="M6 2 L11 9 L1 9 Z" />
  </svg>
);

const IconArrowDownTri = ({ className = "h-2.5 w-2.5" }) => (
  <svg className={className} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
    <path d="M6 10 L1 3 L11 3 Z" />
  </svg>
);

const IconEmpty = ({ className = "h-8 w-8" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </svg>
);

const IconChevronsRight = ({ className = "h-3.5 w-3.5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="6 17 11 12 6 7" />
    <polyline points="13 17 18 12 13 7" />
  </svg>
);

/** Signal switch — swap arrows into a pulse/target mark */
const IconSwitchSignal = ({ className = "h-3.5 w-3.5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M16 3h5v5" />
    <path d="M8 21H3v-5" />
    <path d="M21 3l-7.5 7.5" />
    <path d="M3 21l7.5-7.5" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);

const IconExpand = ({ className = "h-3.5 w-3.5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const IconCollapse = ({ className = "h-3.5 w-3.5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="4 14 10 14 10 20" />
    <polyline points="20 10 14 10 14 4" />
    <line x1="10" y1="14" x2="3" y2="21" />
    <line x1="21" y1="3" x2="14" y2="10" />
  </svg>
);

/**
 * Accent CTA: open LuxQuant call / signal sheet for a pair.
 * size: "sm" (table row) | "md" (chart header)
 */
const SwitchToSignalButton = ({ onClick, size = "md", label, className = "" }) => {
  const sm = size === "sm";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-accent/35 bg-accent/12 font-semibold text-accent shadow-[0_0_0_1px_rgb(var(--accent)/0.06)] transition-all hover:border-accent/55 hover:bg-accent/20 hover:shadow-[0_4px_14px_rgb(var(--accent)/0.18)] active:scale-[0.98] ${
        sm
          ? "h-7 px-2 text-[9px] uppercase tracking-[0.1em]"
          : "h-8 px-3 text-[10px] uppercase tracking-[0.12em]"
      } ${className}`}
      title="Open LuxQuant signal for this pair"
    >
      <IconSwitchSignal className={sm ? "h-3 w-3" : "h-3.5 w-3.5"} />
      <span>{label || (sm ? "Signal" : "Switch to signal")}</span>
      <svg
        className={sm ? "h-2.5 w-2.5 opacity-70" : "h-3 w-3 opacity-70"}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        aria-hidden="true"
      >
        <path d="M5 12h14" strokeLinecap="round" />
        <path d="m13 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
};

/** Free-safe win badge — only TP3 / TP4 (matured outcomes). */
const OutcomeBadge = ({ outcome, onClick, className = "" }) => {
  if (!outcome) return null;
  const isTp4 = (outcome.outcome || "").toLowerCase() === "tp4";
  const label = outcome.label || (isTp4 ? "TP4" : "TP3");
  const peak =
    outcome.peak_pct != null && !Number.isNaN(Number(outcome.peak_pct))
      ? `${Number(outcome.peak_pct) >= 0 ? "+" : ""}${Number(outcome.peak_pct).toFixed(0)}%`
      : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] transition-opacity hover:opacity-90 ${
        isTp4
          ? "border-accent/35 bg-accent/15 text-accent"
          : "border-profit/30 bg-profit/12 text-profit"
      } ${className}`}
      title={
        isTp4
          ? "LuxQuant plan reached TP4 — unlock full path"
          : "LuxQuant plan reached TP3 — unlock full path"
      }
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isTp4 ? "bg-accent" : "bg-profit"}`}
        aria-hidden
      />
      {label}
      {peak ? <span className="opacity-90">{peak}</span> : null}
    </button>
  );
};

/**
 * Compact win strip — coins + peak only.
 * Everyone (free + entitled) opens the same Call Proof modal as Top Gainers
 * so peak % is never a teaser without evidence. Free users get redacted
 * levels inside SignalDetailModal (charts/journey still build trust).
 */
const OutcomeTeaserStrip = ({ data, onOpenProof }) => {
  const base = (data?.items || []).slice(0, 14);
  if (!base.length) return null;

  // Prefer highest peak for the explicit Proof tab (most impressive, still real).
  const topRow = base.reduce((best, row) => {
    const p = Number(row?.peak_pct);
    const b = Number(best?.peak_pct);
    if (!Number.isFinite(p)) return best;
    if (!best || !Number.isFinite(b) || p > b) return row;
    return best;
  }, base[0]);

  // Enough chips that the loop always feels continuous (short lists still scroll).
  let unit = base;
  while (unit.length < 8) unit = unit.concat(base);
  const track = [...unit, ...unit];

  const handleOpen = (row) => {
    if (!row?.signal_id) return;
    onOpenProof?.(row, base);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised">
      <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
        <div className="min-w-0 flex-shrink-0 pr-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Recent wins
          </p>
          <p className="mt-0.5 hidden max-w-[11rem] text-[11px] leading-snug text-text-muted sm:block">
            Tap a win to open call proof
          </p>
        </div>

        {/* Same layout grammar as PulseTape — overflow + edge fades + scrolling track */}
        <div className="group/wins relative min-h-[34px] min-w-0 flex-1 overflow-hidden">
          <div
            className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-8 bg-gradient-to-r from-surface-raised to-transparent sm:w-10"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-8 bg-gradient-to-l from-surface-raised to-transparent sm:w-10"
            aria-hidden
          />
          <div className="wins-marquee-track animate-wins-marquee relative z-0 flex w-max gap-1.5 py-0.5 will-change-transform">
            {track.map((row, i) => {
              const peak =
                row.peak_pct != null && !Number.isNaN(Number(row.peak_pct))
                  ? `${Number(row.peak_pct) >= 0 ? "+" : ""}${Number(row.peak_pct).toFixed(0)}%`
                  : "—";
              return (
                <button
                  key={`${row.signal_id || row.pair}-${row.outcome}-${i}`}
                  type="button"
                  onClick={() => handleOpen(row)}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-md border border-ink/[0.07] bg-ink/[0.02] px-2 py-1.5 text-left transition-colors hover:border-accent/30 hover:bg-accent/[0.05]"
                  title={`${stripQuote(row.pair)} · peak ${peak}`}
                >
                  <CoinLogo pair={row.pair} size={18} />
                  <span className="text-[11px] font-semibold tracking-tight text-text-primary">
                    {stripQuote(row.pair)}
                  </span>
                  <span className="font-mono text-[10px] font-semibold tabular-nums text-profit">
                    {peak}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleOpen(topRow)}
          className="inline-flex h-7 flex-shrink-0 items-center gap-1 rounded-md border border-ink/[0.12] bg-ink/[0.03] px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-primary/80 transition-colors hover:border-accent/40 hover:bg-accent/[0.08] hover:text-accent sm:px-3"
          title="Open call proof"
        >
          <svg
            className="h-3 w-3 opacity-80"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          Proof
        </button>
      </div>
    </div>
  );
};

/* WinsVipModal removed — strip opens SignalDetailModal for everyone (trust-first). */

const IconChevronsLeft = ({ className = "h-3.5 w-3.5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="11 17 6 12 11 7" />
    <polyline points="18 17 13 12 18 7" />
  </svg>
);

// ════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════

const MarketPulsePageInner = () => {
  const { t } = useTranslation();

  const pageStatusCtx = useSignalStatus();
  // Only a number — the endpoint deliberately does not return which pairs.
  const [calledCount, setCalledCount] = useState(null);
  // Freemium teaser: TP3/TP4 outcomes (pair + peak; open proof modal). Safe for free.
  const [outcomes, setOutcomes] = useState(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [proofItem, setProofItem] = useState(null);
  const [proofIds, setProofIds] = useState([]);
  const [proofRows, setProofRows] = useState([]);
  const [proofIndex, setProofIndex] = useState(0);
  const [proofDetail, setProofDetail] = useState(null);
  const [proofLoading, setProofLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    api
      .get(`/api/v1/terminal/preview/called-summary`)
      .then((r) => alive && setCalledCount(r?.data?.called_7d ?? null))
      .catch(() => {});
    api
      .get(`/api/v1/terminal/preview/outcomes`, { params: { days: 14, limit: 24 } })
      .then((r) => alive && setOutcomes(r?.data || null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const fetchProofDetail = useCallback(async (sid) => {
    if (!sid) return;
    setProofLoading(true);
    setProofDetail(null);
    try {
      const token = localStorage.getItem("access_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const r = await fetch(`/api/v1/signals/detail/${sid}`, { headers });
      if (r.ok) setProofDetail(await r.json());
    } catch {
      /* ignore */
    } finally {
      setProofLoading(false);
    }
  }, []);

  const toProofItem = (r) => ({
    signal_id: r.signal_id,
    pair: r.pair,
    peak_pct: r.peak_pct,
    // Leaderboard-style fallback for hero gain inside SignalDetailModal
    gain_pct: r.peak_pct != null ? Number(r.peak_pct) : undefined,
    signal_time: r.signal_time || r.called_at,
    status: r.label || r.outcome,
  });

  const openProof = useCallback(
    (row, list) => {
      if (!row?.signal_id) return;
      // Full strip list → prev/next in the proof modal (verify several wins, not one orphan %).
      const rows = Array.isArray(list) && list.length
        ? list.filter((r) => r?.signal_id)
        : [row];
      const ids = rows.map((r) => r.signal_id);
      const idx = Math.max(0, ids.indexOf(row.signal_id));
      const active = rows[idx] || row;
      setProofIds(ids);
      setProofRows(rows);
      setProofIndex(idx);
      setProofItem(toProofItem(active));
      setProofOpen(true);
      fetchProofDetail(active.signal_id);
    },
    [fetchProofDetail]
  );

  const closeProof = useCallback(() => {
    setProofOpen(false);
    setProofItem(null);
    setProofIds([]);
    setProofRows([]);
    setProofIndex(0);
    setProofDetail(null);
  }, []);

  const goProof = useCallback(
    (i) => {
      if (i < 0 || i >= proofIds.length) return;
      setProofIndex(i);
      const row = proofRows[i];
      if (row) setProofItem(toProofItem(row));
      fetchProofDetail(proofIds[i]);
    },
    [proofIds, proofRows, fetchProofDetail]
  );
  const [feed, setFeed] = useState([]);
  const [stats, setStats] = useState(null);
  const [topMovers, setTopMovers] = useState(null);
  const [flowData, setFlowData] = useState(null); // ticks 5m screener from proxy
  const [coinDetail, setCoinDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [sourceFilter, setSourceFilter] = useState("all");
  // Called / Not called overlay which Pulse movers our algorithm already
  // signalled. Free users can scan the raw tape; the overlay is VIP.
  const [callFilter, setCallFilter] = useState("all");
  const [timeframeFilter, setTimeframeFilter] = useState("all");
  const [searchPair, setSearchPair] = useState("");
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [moverPeriod, setMoverPeriod] = useState("1h");
  const [expandedGroups, setExpandedGroups] = useState({});

  // === Feed view mode (pump/dump screening) ===
  // feedLayout: "unified" (single list + All/Pumps/Dumps toggle)
  // | "split" (Pumps | Dumps side-by-side)
  // | "focus" (one side, full width)
  // feedSide: "all" | "pump" | "dump" — active side for unified/focus
  const [feedLayout, setFeedLayout] = useState(() => {
    try {
      const v = localStorage.getItem("mp_feed_layout");
      return v === "split" || v === "focus" || v === "unified" ? v : "unified";
    } catch {
      return "unified";
    }
  });
  const [feedSide, setFeedSide] = useState("all");
  // latest = chronological coin groups · repeat = most-recurring coins first
  const [feedSort, setFeedSort] = useState(() => {
    try {
      const v = localStorage.getItem("mp_feed_sort");
      return v === "repeat" || v === "latest" ? v : "latest";
    } catch {
      return "latest";
    }
  });

  const changeLayout = useCallback((mode) => {
    setFeedLayout(mode);
    try {
      localStorage.setItem("mp_feed_layout", mode);
    } catch {}
    // Focus mode has no "all" — default to pumps when entering it.
    setFeedSide((prev) => (mode === "focus" && prev === "all" ? "pump" : prev));
  }, []);

  const changeFeedSort = useCallback((mode) => {
    setFeedSort(mode);
    try {
      localStorage.setItem("mp_feed_sort", mode);
    } catch {}
  }, []);

  // Side panel (heatmap/stats) collapse — default OPEN, choice persisted.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem("mp_sidebar_open") !== "0";
    } catch {
      return true;
    }
  });
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("mp_sidebar_open", next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);

  // Hot Flow screener — opens as modal (never expands the main layout)
  const [flowOpen, setFlowOpen] = useState(false);
  const openFlow = useCallback(() => setFlowOpen(true), []);
  const closeFlow = useCallback(() => setFlowOpen(false), []);

  // === Heatmap sort mode + Chart Modal (URL-driven: ?pair=BTCUSDT) ===
  const [heatmapSortMode, setHeatmapSortMode] = useState("events");
  const [searchParams, setSearchParams] = useSearchParams();
  const chartModalPair = searchParams.get("pair");

  // ═════════ FETCH ═════════ (LOGIC IDENTICAL, transport via `api` instance)

  const fetchData = useCallback(
    async (showLoading = true) => {
      try {
        if (showLoading) setLoading(true);

        const params = { limit: "500" };
        if (sourceFilter !== "all") params.source = sourceFilter;
        if (timeframeFilter !== "all") params.timeframe = timeframeFilter;
        if (selectedCoin) params.pair = selectedCoin;

        const [feedRes, statsRes, moversRes, flowRes] = await Promise.allSettled([
          api.get(`/api/v1/market-pulse/feed`, { params }),
          api.get(`/api/v1/market-pulse/stats`),
          api.get(`/api/v1/market-pulse/top-movers`, { params: { period: moverPeriod } }),
          api.get(`/api/v1/market-pulse/flow`, { params: { limit: 300 } }),
        ]);

        if (feedRes.status === "fulfilled") {
          setFeed(feedRes.value.data.events || []);
        }
        if (statsRes.status === "fulfilled") {
          setStats(statsRes.value.data);
        }
        if (moversRes.status === "fulfilled") {
          setTopMovers(moversRes.value.data);
        }
        if (flowRes.status === "fulfilled") {
          setFlowData(flowRes.value.data || null);
        }

        setLastUpdated(new Date());
      } catch (err) {
        console.error("Market Pulse fetch error:", err);
      } finally {
        setLoading(false);
      }
    },
    [sourceFilter, timeframeFilter, selectedCoin, moverPeriod]
  );

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (!selectedCoin) {
      setCoinDetail(null);
      return;
    }
    api
      .get(`/api/v1/market-pulse/coin/${selectedCoin}`)
      .then((res) => setCoinDetail(res.data))
      .catch(() => setCoinDetail(null));
  }, [selectedCoin]);

  // ═════════ DERIVED ═════════

  const flowByPair = useMemo(() => {
    const map = {};
    (flowData?.items || []).forEach((row) => {
      if (row?.pair) map[String(row.pair).toUpperCase()] = row;
    });
    return map;
  }, [flowData]);

  // TP3/TP4 teaser map — free + paid both can see (wins that matured)
  const outcomeByPair = useMemo(() => {
    const map = {};
    (outcomes?.items || []).forEach((row) => {
      if (!row?.pair) return;
      const k = String(row.pair).toUpperCase();
      // Prefer TP4 over TP3 if both exist in list
      if (!map[k] || row.outcome === "tp4") map[k] = row;
    });
    return map;
  }, [outcomes]);

  const signalMap = pageStatusCtx?.map;

  const filteredFeed = useMemo(() => {
    let out = feed;
    if (searchPair) {
      const q = searchPair.toUpperCase();
      out = out.filter((e) => e.pair?.includes(q));
    }
    // When a coin is focused (chip / detail), always show that coin's full pulse
    // tape. CALLS filter is for scanning the board, not for hiding a coin drill-down
    // (was: click AKE while CALLED → empty feed even with 200+ events).
    if (callFilter !== "all" && !selectedCoin && pageStatusCtx?.entitled) {
      const wantCalled = callFilter === "called";
      out = out.filter((e) => {
        const isCalled = !!(signalMap && signalMap[(e.pair || "").toUpperCase()]);
        return isCalled === wantCalled;
      });
    }
    return out;
  }, [feed, searchPair, callFilter, signalMap, selectedCoin, pageStatusCtx?.entitled]);

  // Pump = bullish / upside move; Dump = bearish / downside move.
  // Mirrors the heatmap direction logic so classification is consistent.
  const pumpFeed = useMemo(() => filteredFeed.filter(isPumpEvent), [filteredFeed]);
  const dumpFeed = useMemo(() => filteredFeed.filter((e) => !isPumpEvent(e)), [filteredFeed]);

  const sideFeed = feedSide === "pump" ? pumpFeed : feedSide === "dump" ? dumpFeed : filteredFeed;

  // Group by coin across the whole window (not only back-to-back events).
  const groupedSide = useMemo(
    () => groupByPair(sideFeed, { sortBy: feedSort }),
    [sideFeed, feedSort]
  );
  const groupedPump = useMemo(
    () => groupByPair(pumpFeed, { sortBy: feedSort }),
    [pumpFeed, feedSort]
  );
  const groupedDump = useMemo(
    () => groupByPair(dumpFeed, { sortBy: feedSort }),
    [dumpFeed, feedSort]
  );

  // Full-window stats per pair (from unfiltered feed stream) — used for badges
  // so a coin still shows ×N even when a side filter is active.
  const pairPulseStats = useMemo(() => {
    const map = {};
    feed.forEach((e) => {
      const p = e?.pair;
      if (!p) return;
      if (!map[p]) map[p] = { total: 0, pumps: 0, dumps: 0 };
      map[p].total += 1;
      if (isPumpEvent(e)) map[p].pumps += 1;
      else map[p].dumps += 1;
    });
    return map;
  }, [feed]);

  const activeCoins = useMemo(() => {
    const map = {};
    feed.forEach((e) => {
      if (!map[e.pair]) map[e.pair] = 0;
      map[e.pair]++;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [feed]);

  const bullBearRatio = useMemo(() => {
    if (!stats?.hourly)
      return { bull: 0, bear: 0, total: 0, bullPct: 50, verdict: "neutral", adRatio: null };
    const bull = stats.hourly.bullish || 0;
    const bear = stats.hourly.bearish || 0;
    const total = bull + bear;
    const bullPct = total > 0 ? (bull / total) * 100 : 50;
    // Verdict thresholds ~ advance/decline breadth read.
    const verdict = bullPct >= 58 ? "bull" : bullPct <= 42 ? "bear" : "neutral";
    const adRatio = bear > 0 ? bull / bear : bull > 0 ? Infinity : null;
    return { bull, bear, total, bullPct, verdict, adRatio };
  }, [stats]);

  const tapeItems = useMemo(() => {
    const map = {};
    feed.forEach((e) => {
      const abs = Math.abs(e.pct_change || 0);
      if (abs === 0) return;
      if (!map[e.pair] || abs > Math.abs(map[e.pair].pct_change)) {
        map[e.pair] = e;
      }
    });
    return Object.values(map)
      .sort((a, b) => Math.abs(b.pct_change || 0) - Math.abs(a.pct_change || 0))
      .slice(0, 16);
  }, [feed]);

  const coinHistograms = useMemo(() => {
    const map = {};
    feed.forEach((e) => {
      if (!map[e.pair]) map[e.pair] = [];
      map[e.pair].push({
        pct: e.pct_change || 0,
        bull: e.direction === "bullish",
      });
    });
    Object.keys(map).forEach((k) => {
      map[k] = map[k].slice(0, 10).reverse();
    });
    return map;
  }, [feed]);

  const eventsHistogram = useMemo(() => {
    const buckets = Array(10)
      .fill(null)
      .map(() => ({ bull: 0, bear: 0 }));
    const now = Date.now();
    const span = 60 * 60 * 1000;
    feed.forEach((e) => {
      if (!e.created_at) return;
      const t = new Date(e.created_at).getTime();
      const age = now - t;
      if (age < 0 || age > span) return;
      const idx = Math.min(9, Math.floor((span - age) / (span / 10)));
      if (e.direction === "bullish") buckets[idx].bull++;
      else buckets[idx].bear++;
    });
    return buckets;
  }, [feed]);

  // Heatmap is built from the LIVE FEED (every unique coin in the stream), not
  // the 12-capped stats query — so it shows as many coins as the feed carries.
  const heatmapEnriched = useMemo(() => {
    if (!feed || feed.length === 0) return [];
    const m = {};
    feed.forEach((e) => {
      const p = e.pair;
      if (!p) return;
      if (!m[p]) m[p] = { pair: p, event_count: 0, max_up: 0, max_down: 0 };
      m[p].event_count += 1;
      const pc = Number(e.pct_change) || 0;
      const bull = e.direction === "bullish" || (e.direction !== "bearish" && pc >= 0);
      if (bull) m[p].max_up = Math.max(m[p].max_up, Math.abs(pc));
      else m[p].max_down = Math.min(m[p].max_down, -Math.abs(pc));
    });
    let items = Object.values(m);
    if (heatmapSortMode === "pct") {
      items.sort(
        (a, b) =>
          Math.max(Math.abs(b.max_up), Math.abs(b.max_down)) -
          Math.max(Math.abs(a.max_up), Math.abs(a.max_down))
      );
    } else {
      items.sort((a, b) => b.event_count - a.event_count);
    }
    return items;
  }, [feed, heatmapSortMode]);

  // ═════════ HELPERS ═════════

  const timeAgo = (isoStr) => {
    if (!isoStr) return "";
    const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
    if (diff < 60) return `${Math.round(diff)}s`;
    if (diff < 3600) return `${Math.round(diff / 60)}m`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h`;
    return `${Math.round(diff / 86400)}d`;
  };

  const eventLabel = (e) => {
    if (e.source === "price_movement") {
      return e.event_type === "flash_move" ? "Flash" : "Rapid";
    }
    return e.event_type || "—";
  };

  // Tag class — Binance pos/neg only (flash = accent attention)
  const eventTagClass = (e) => {
    const type = e.event_type?.toLowerCase() || "";
    if (type.includes("high break") || type.includes("strong rally") || type.includes("breakout"))
      return "border-profit/25 bg-profit/12 text-profit";
    if (type.includes("low break") || type.includes("breakdown"))
      return "border-loss/25 bg-loss/12 text-loss";
    if (type.includes("pullback") || type.includes("dip"))
      return "border-accent/30 bg-accent/12 text-accent";
    if (type === "flash_move") return "border-accent/30 bg-accent/12 text-accent";
    if (type === "rapid_move") return "border-accent/25 bg-accent/10 text-accent";
    if (e.direction === "bullish") return "border-profit/20 bg-profit/10 text-profit";
    return "border-loss/20 bg-loss/10 text-loss";
  };

  const selectCoin = (pair) => {
    if (selectedCoin === pair) {
      setSelectedCoin(null);
      setSearchPair("");
    } else {
      setSelectedCoin(pair);
      setSearchPair("");
      // Coin drill-down = show that coin's full activity (not "called only" scan)
      setCallFilter("all");
    }
  };

  const toggleGroup = (pair, e) => {
    e.stopPropagation();
    setExpandedGroups((prev) => ({ ...prev, [pair]: !prev[pair] }));
  };

  const openChartModal = (pair) => {
    if (!pair) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("pair", pair);
      return next;
    });
  };

  const closeChartModal = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("pair");
      return next;
    });
  };

  const flashMovesPreview = useMemo(() => {
    return (topMovers?.flash_moves || []).slice(0, 2);
  }, [topMovers]);

  // ═════════ RENDER ═════════

  return (
    <div className="space-y-4 pb-10">
      <PulseStyles />

      <PageHeader
        title="Market Pulse"
        subtitle={
          <>
            Real-time event flow across{" "}
            <span className="font-mono font-semibold tabular-nums text-text-primary">
              {stats?.hourly?.unique_coins || 0}
            </span>{" "}
            coins · auto-refresh 10s
          </>
        }
        right={
          <div className="flex flex-shrink-0 items-center gap-3">
            <span className="hidden font-mono text-[11px] tabular-nums text-text-muted sm:inline">
              {lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}`
                : "Loading…"}
            </span>
            <div className="flex h-8 items-center gap-2 rounded-md border border-ink/[0.1] bg-surface-raised px-2.5">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                {!loading && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-60" />
                )}
                <span
                  className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                    loading ? "bg-accent" : "bg-profit"
                  }`}
                />
              </span>
              <span
                className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${loading ? "text-accent" : "text-profit"}`}
              >
                {loading ? "Sync" : "Live"}
              </span>
            </div>
          </div>
        }
      />

      {/* ═══ PULSE TAPE (Flowscan card pattern + scrolling ticker) ═══ */}
      {tapeItems.length > 0 && <PulseTape items={tapeItems} onSelect={openChartModal} />}

      {/* ═══ WINS STRIP — coin + peak; everyone opens call proof (redacted if free) ═══ */}
      <OutcomeTeaserStrip data={outcomes} onOpenProof={openProof} />

      {/* ═══ COMPACT STATS — bias + KPIs, denser ═══ */}
      <div className="space-y-2">
        <MarketBiasBanner
          ratio={bullBearRatio}
          pumpCount={pumpFeed.length}
          dumpCount={dumpFeed.length}
        />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <KpiEvents
            total={stats?.hourly?.total_events || 0}
            uniqueCoins={stats?.hourly?.unique_coins || 0}
            histogram={eventsHistogram}
          />
          <KpiBullBear ratio={bullBearRatio} />
          <KpiFlash
            count={stats?.hourly?.flash_moves || 0}
            previews={flashMovesPreview}
            onSelect={openChartModal}
          />
          <KpiBiggestMove biggest={stats?.hourly?.biggest_move} onSelect={openChartModal} />
        </div>
      </div>

      {/* ═══ HOT FLOW — compact launcher; full screener opens as modal ═══ */}
      <FlowScreener
        data={flowData}
        onSelect={openChartModal}
        open={flowOpen}
        onOpen={openFlow}
        onClose={closeFlow}
        outcomeByPair={outcomeByPair}
      />

      {/* ═══ CONTROL BAR (Flowscan card + filter pills) ═══ */}
      <ControlBar
        searchPair={searchPair}
        setSearchPair={setSearchPair}
        setSelectedCoin={setSelectedCoin}
        activeCoins={activeCoins}
        selectedCoin={selectedCoin}
        selectCoin={selectCoin}
        sourceFilter={sourceFilter}
        callFilter={callFilter}
        setCallFilter={setCallFilter}
        setSourceFilter={setSourceFilter}
        timeframeFilter={timeframeFilter}
        setTimeframeFilter={setTimeframeFilter}
        coinDetail={coinDetail}
        timeAgo={timeAgo}
        openChartModal={openChartModal}
        entitled={!!pageStatusCtx?.entitled}
        calledCount={calledCount}
      />

      {/* ═══ MAIN GRID ═══ */}
      <div className={`mp-main-grid ${sidebarOpen ? "" : "mp-sidebar-collapsed"}`}>
        <div className="mp-feed-col">
          <ActivityFeedPanel
            callFilter={callFilter}
            setCallFilter={setCallFilter}
            entitled={pageStatusCtx?.entitled}
            calledCount={calledCount}
            filteredFeed={filteredFeed}
            feed={feed}
            loading={loading}
            feedLayout={feedLayout}
            changeLayout={changeLayout}
            feedSide={feedSide}
            setFeedSide={setFeedSide}
            feedSort={feedSort}
            changeFeedSort={changeFeedSort}
            groupedSide={groupedSide}
            groupedPump={groupedPump}
            groupedDump={groupedDump}
            pumpCount={pumpFeed.length}
            dumpCount={dumpFeed.length}
            sideCount={sideFeed.length}
            coinCount={groupedSide.length}
            coinHistograms={coinHistograms}
            pairPulseStats={pairPulseStats}
            selectedCoin={selectedCoin}
            openChartModal={openChartModal}
            eventTagClass={eventTagClass}
            eventLabel={eventLabel}
            timeAgo={timeAgo}
            expandedGroups={expandedGroups}
            toggleGroup={toggleGroup}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={toggleSidebar}
            flowByPair={flowByPair}
            outcomeByPair={outcomeByPair}
          />
        </div>

        <div className="mp-side-slot">
          <div className="mp-sidebar-col">
            <HeatmapPanel
              heatmap={heatmapEnriched}
              selectedCoin={selectedCoin}
              onSelect={openChartModal}
              sortMode={heatmapSortMode}
              onSortChange={setHeatmapSortMode}
            />

            <MostActivePanel
              movers={topMovers?.most_active}
              period={moverPeriod}
              setPeriod={setMoverPeriod}
              histograms={coinHistograms}
              onSelect={openChartModal}
            />

            <FlashMovesPanel moves={topMovers?.flash_moves} onSelect={openChartModal} />

            <SummaryPanel daily={stats?.daily} className="mp-sidebar-stretch" />
          </div>

          {/* Collapsed rail — click to re-open the side panel */}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-expanded={sidebarOpen}
            aria-label="Show side panel"
            title="Show side panel"
            className="mp-sidebar-rail group relative overflow-hidden rounded-lg border border-ink/[0.07] bg-surface-raised transition-colors hover:border-ink/15"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md border border-ink/[0.1] bg-surface-secondary text-text-muted transition-colors group-hover:text-text-primary">
              <IconChevronsLeft className="h-3.5 w-3.5" />
            </span>
            <span className="mp-rail-label text-[9px] font-semibold uppercase tracking-[0.22em] text-text-muted group-hover:text-text-primary transition-colors">
              Market Panel
            </span>
          </button>
        </div>
      </div>

      {chartModalPair && (
        <CoinChartModal
          pair={chartModalPair}
          onClose={closeChartModal}
          outcome={outcomeByPair[(chartModalPair || "").toUpperCase()] || null}
        />
      )}

      {proofOpen && proofItem && (
        <SignalDetailModal
          item={proofItem}
          detail={proofDetail}
          loading={proofLoading}
          signalIds={proofIds}
          currentIndex={proofIndex}
          onNavigate={goProof}
          onClose={closeProof}
          cleanPair={(p) => (p ? String(p).replace(/^3A/, "").replace(/USDT$/i, "") + "USDT" : "???")}
          t={t}
          onOpenHistory={null}
        />
      )}

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="market-pulse" />
    </div>
  );
};

// Wrap in the shared SignalStatusProvider so every CoinLogo on this page shows
// a live "called" dot (latest LuxQuant call per pair) and opens the global
// signal modal on click — exactly like the Terminal scan page.
const MarketPulsePage = () => (
  <SignalStatusProvider>
    <MarketPulsePageInner />
    <GlobalSignalModalHost />
  </SignalStatusProvider>
);

export default MarketPulsePage;

// ════════════════════════════════════════════════════════
// PULSE TAPE — Flowscan card pattern + scrolling ticker
// ════════════════════════════════════════════════════════

const PulseTape = ({ items, onSelect }) => {
  const tape = [...items, ...items];
  return (
    <div className="relative overflow-hidden rounded-lg border border-ink/[0.07] bg-surface-raised">
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-surface-raised to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-surface-raised to-transparent z-10 pointer-events-none" />
      <div className="flex gap-8 py-2.5 animate-pulse-tape whitespace-nowrap relative z-0">
        {tape.map((m, i) => {
          const symbol = stripQuote(m.pair);
          const pos = (m.pct_change || 0) >= 0;
          return (
            <button
              key={i}
              onClick={() => onSelect?.(m.pair)}
              className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity px-1 group"
            >
              <CoinLogo pair={m.pair} size={16} />
              <span className="text-text-primary/90 text-[11px] font-medium tracking-tight">
                {symbol}
              </span>
              <span
                className={`text-[11px] font-mono tabular-nums flex items-center gap-1 ${
                  pos ? "text-profit" : "text-loss"
                }`}
              >
                {pos ? <IconArrowUpTri /> : <IconArrowDownTri />}
                {Math.abs(m.pct_change || 0).toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// MARKET BIAS BANNER — breadth verdict (short/long bias, at a glance)
// ════════════════════════════════════════════════════════

const MarketBiasBanner = ({ ratio, _pumpCount, _dumpCount }) => {
  const { bull, bear, bullPct, verdict, adRatio } = ratio;
  const bearPct = 100 - bullPct;
  const cfg = {
    bull: {
      label: "Bullish",
      bias: "Long",
      text: "text-profit",
      chip: "border-profit/30 bg-profit/10 text-profit",
    },
    bear: {
      label: "Bearish",
      bias: "Short",
      text: "text-loss",
      chip: "border-loss/30 bg-loss/10 text-loss",
    },
    neutral: {
      label: "Neutral",
      bias: "Flat",
      text: "text-accent",
      chip: "border-ink/15 bg-ink/[0.05] text-text-secondary",
    },
  }[verdict];

  const adDisplay = adRatio == null ? "—" : adRatio === Infinity ? "∞" : adRatio.toFixed(2);

  return (
    <div className="rounded-lg border border-ink/[0.07] bg-surface-raised px-3 py-2 sm:px-3.5">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className={`text-[13px] font-semibold leading-none tracking-tight ${cfg.text}`}>
            {cfg.label}
          </span>
          <span
            className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] ${cfg.chip}`}
          >
            {cfg.bias}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-ink/[0.08]">
            <div className="bg-profit transition-all duration-500" style={{ width: `${bullPct}%` }} />
            <div className="bg-loss transition-all duration-500" style={{ width: `${bearPct}%` }} />
          </div>
        </div>
        <div className="hidden flex-shrink-0 items-center gap-3 font-mono text-[10px] tabular-nums sm:flex">
          <span className="text-profit">{bull}↑</span>
          <span className="text-loss">{bear}↓</span>
          <span className="text-text-muted">
            A/D <span className="font-semibold text-text-primary">{adDisplay}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// FLOW SCREENER — ticks 5m + multi-TF Δ (proxy-ingested)
// ════════════════════════════════════════════════════════
//
// "Ticks" = number of trades on the latest closed 5m kline (Binance field).
// High ticks + dump chg = potential liquidation / cascade hunt.

const FLOW_SORTS = [
  { id: "ticks", label: "Ticks 5m" },
  { id: "dump5", label: "Dump 5m" },
  { id: "pump5", label: "Pump 5m" },
  { id: "chg1h", label: "Δ 1h" },
  { id: "chg24h", label: "Δ 24h" },
];

const FLOW_PAGE_SIZE = 20;

const FLOW_GUIDE_CARDS = [
  {
    title: "What is this?",
    body: "Ranks coins already on Market Pulse by how busy they are trading right now — plus short-term price change. Intensity first, then you dig in.",
  },
  {
    title: "Ticks",
    body: "Number of trades in the last closed 5-minute candle (not $ volume). High ticks = lots of people hitting the book — often liquidations or cascades.",
  },
  {
    title: "Δ 5m / 1h / 24h",
    body: "How far price moved in each window. High ticks + dump 5m can flag a flush; high ticks + pump 5m flags momentum. Use 1h/24h so you don’t chase a lone 5m blip.",
  },
  {
    title: "How to use",
    body: "Sort Dump 5m or Ticks → check HOT → glance 1h/24h → open the chart. Called coins show Switch to signal. List is Pulse-only.",
  },
];

const FLOW_SORT_HELP = [
  { id: "ticks", tip: "Most trades in the last 5m candle first" },
  { id: "dump5", tip: "Biggest 5m losers first — flush hunt" },
  { id: "pump5", tip: "Biggest 5m winners first — momentum" },
  { id: "chg1h", tip: "Largest move over ~1 hour" },
  { id: "chg24h", tip: "Largest move over 24 hours" },
];

const FlowScreener = ({
  data,
  onSelect,
  open = false,
  onOpen,
  onClose,
  outcomeByPair = {},
}) => {
  const statusCtx = useSignalStatus();
  const [sort, setSort] = useState("ticks");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  // Guide lives in its own overlay modal — never expands Hot Flow body
  const [guideOpen, setGuideOpen] = useState(false);
  const openGuide = useCallback(() => setGuideOpen(true), []);
  const closeGuide = useCallback(() => setGuideOpen(false), []);

  // The sheet has to finish travelling before the parent unmounts it, so every
  // dismissal routes through here instead of calling onClose directly. 200ms is
  // the length of lqSheetDown / lqSheetPanelOut in index.css — keep them equal
  // or the panel is cut off mid-slide.
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef(null);
  const requestClose = useCallback(() => {
    if (closeTimer.current) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setClosing(false);
      onClose?.();
    }, 200);
  }, [onClose]);
  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    []
  );
  // Reopening while a close was still in flight would otherwise show the panel
  // stuck in its exit state.
  useEffect(() => {
    if (open && closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
      setClosing(false);
    }
  }, [open]);
  const rawItems = data?.items || [];
  // Pulse-only: never list Binance volume-fill coins that aren't on Market Pulse
  const items = useMemo(() => {
    const hasFlags = rawItems.some((r) => r.in_pulse);
    if (!hasFlags) return rawItems;
    return rawItems.filter((r) => r.in_pulse);
  }, [rawItems]);
  const updatedAt = data?.updated_at;
  const isStale = !!data?.stale;
  const pulseCovered = data?.pulse_covered ?? items.length;

  const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

  const ranked = useMemo(() => {
    const q = query.trim().toUpperCase();
    let rows = items.filter((r) => {
      if (!q) return true;
      const pair = String(r.pair || "").toUpperCase();
      const base = String(r.base || stripQuote(r.pair) || "").toUpperCase();
      return pair.includes(q) || base.includes(q);
    });
    rows = [...rows];
    rows.sort((a, b) => {
      if (sort === "ticks") return (num(b.ticks_5m) ?? -1) - (num(a.ticks_5m) ?? -1);
      if (sort === "dump5") return (num(a.chg_5m) ?? 0) - (num(b.chg_5m) ?? 0);
      if (sort === "pump5") return (num(b.chg_5m) ?? 0) - (num(a.chg_5m) ?? 0);
      if (sort === "chg1h") return Math.abs(num(b.chg_1h) ?? 0) - Math.abs(num(a.chg_1h) ?? 0);
      if (sort === "chg24h") return Math.abs(num(b.chg_24h) ?? 0) - Math.abs(num(a.chg_24h) ?? 0);
      return 0;
    });
    return rows;
  }, [items, sort, query]);

  const calledCount = useMemo(() => {
    const map = statusCtx?.map;
    if (!map) return 0;
    return ranked.reduce((n, r) => (map[(r.pair || "").toUpperCase()] ? n + 1 : n), 0);
  }, [ranked, statusCtx?.map]);

  const totalPages = Math.max(1, Math.ceil(ranked.length / FLOW_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [sort, query, items.length]);

  // Esc + body scroll lock while modal open (guide closes first)
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (guideOpen) {
        closeGuide();
        return;
      }
      requestClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, requestClose, guideOpen, closeGuide]);

  const pageRows = useMemo(() => {
    const p = Math.min(page, totalPages);
    const start = (p - 1) * FLOW_PAGE_SIZE;
    return ranked.slice(start, start + FLOW_PAGE_SIZE);
  }, [ranked, page, totalPages]);

  const maxTicks = useMemo(
    () => Math.max(1, ...ranked.map((r) => Number(r.ticks_5m) || 0)),
    [ranked]
  );

  const ageLabel = useMemo(() => {
    if (!updatedAt) return "waiting…";
    try {
      const ms = Date.now() - new Date(updatedAt).getTime();
      if (Number.isNaN(ms)) return "—";
      if (ms < 20_000) return "just now";
      if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
      return `${Math.round(ms / 60_000)}m ago`;
    } catch {
      return "—";
    }
  }, [updatedAt]);

  const teaser = useMemo(
    () =>
      [...items]
        .sort((a, b) => (Number(b.ticks_5m) || 0) - (Number(a.ticks_5m) || 0))
        .slice(0, 3),
    [items]
  );

  const goPage = (p) => setPage(Math.max(1, Math.min(totalPages, p)));

  const pageBtnClass = (active) =>
    `inline-flex h-7 min-w-[28px] items-center justify-center rounded-md border px-2 font-mono text-[10px] tabular-nums transition-colors ${
      active
        ? "border-accent/40 bg-accent/15 text-accent font-semibold"
        : "border-ink/[0.1] bg-surface-secondary text-text-muted hover:border-ink/18 hover:text-text-primary"
    }`;

  const pageWindow = useMemo(() => {
    const win = [];
    const cur = safePage;
    let start = Math.max(1, cur - 2);
    let end = Math.min(totalPages, start + 4);
    start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) win.push(i);
    return win;
  }, [safePage, totalPages]);

  const rankOf = (i) => (safePage - 1) * FLOW_PAGE_SIZE + i + 1;
  const chgClass = (v) =>
    v == null ? "text-text-muted" : v >= 0 ? "text-profit" : "text-loss";

  // Start the sheet travelling but hand off immediately: what opens next sits
  // far above this z-index, so waiting out the exit would only delay the thing
  // the tap actually asked for.
  const pickPair = (pair) => {
    requestClose();
    onSelect?.(pair);
  };

  const openSignal = (pair) => {
    requestClose();
    statusCtx?.openPair?.(pair);
  };

  const modal =
    open &&
    createPortal(
      <div
        className={`lq-modal-safe fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4 ${
          closing ? "lq-sheet-closing" : ""
        }`}
      >
        {/* Backdrop — same scrim and blur as every other overlay, so the page
            behind recedes by the same amount wherever you are in the app. */}
        <button
          type="button"
          aria-label="Close Hot Flow"
          className={`lq-scrim transition-opacity duration-200 ${
            closing ? "opacity-0" : "opacity-100"
          }`}
          onClick={requestClose}
        />

        {/* Panel — lq-sheet is the shared motion lifted from SignalModal: rises
            from the bottom on a phone, scales in as a centred dialog from sm up.
            dvh, not vh, or mobile browser chrome crops the footer. */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="hot-flow-title"
          className="lq-sheet relative z-10 flex max-h-[min(var(--lq-modal-maxh),860px)] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl border-t border-ink/[0.08] bg-surface-raised shadow-[0_-20px_60px_rgb(var(--scrim)_/_0.35)] sm:max-h-[min(var(--lq-modal-maxh),860px)] sm:rounded-2xl sm:border sm:shadow-[0_24px_64px_rgb(var(--scrim)_/_0.45)]"
        >
          {/* Grab handle — the affordance that says "this is a sheet, swipe or
              tap away to dismiss". Phone only; a centred dialog has no edge to
              drag from.

              No accent bar under it, deliberately. This was the only sheet in
              the app carrying a gold strip along its lip; every other one,
              SignalModal included, opens as a single flat surface, and the
              stripe was the thing making this one read as a different
              component. The panel is one colour from edge to edge now. */}
          <div className="flex shrink-0 justify-center pb-0.5 pt-2.5 sm:hidden" aria-hidden="true">
            <div className="h-1 w-10 rounded-full bg-ink/25" />
          </div>

          {/* Modal header */}
          <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-ink/[0.07] px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span
                    className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${
                      items.length ? "animate-ping bg-accent" : "bg-text-muted"
                    }`}
                  />
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${
                      items.length ? "bg-accent" : "bg-text-muted"
                    }`}
                  />
                </span>
                <h2
                  id="hot-flow-title"
                  className="text-[13px] font-semibold tracking-tight text-text-primary sm:text-[15px]"
                >
                  Hot Flow · Ticks Screener
                </h2>
                {items.length > 0 && (
                  <span className="rounded-full border border-ink/10 bg-ink/[0.04] px-2 py-0.5 font-mono text-[10px] tabular-nums text-text-muted">
                    {items.length} pairs
                    {pulseCovered != null ? ` · ${pulseCovered} pulse` : ""}
                  </span>
                )}
                {isStale && (
                  <span className="rounded-full border border-loss/25 bg-loss/10 px-2 py-0.5 font-mono text-[9px] uppercase text-loss">
                    stale
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-text-muted">
                Trades per 5m · multi-TF Δ · Pulse coins only ·{" "}
                <span className="font-mono tabular-nums">{ageLabel}</span>
                {calledCount > 0 ? (
                  <span className="text-accent"> · {calledCount} called</span>
                ) : null}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={openGuide}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink/[0.1] bg-surface-secondary px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted transition-colors hover:border-accent/35 hover:bg-accent/10 hover:text-accent"
                title="What is Hot Flow?"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 16v-4" strokeLinecap="round" />
                  <circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none" />
                </svg>
                Guide
              </button>
              <button
                type="button"
                onClick={requestClose}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-ink/[0.1] bg-surface-secondary text-text-muted transition-colors hover:border-ink/18 hover:text-text-primary active:scale-95"
                aria-label="Close"
              >
                <IconClose className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-ink/[0.06] px-4 py-2.5 sm:px-5">
            <div className="relative min-w-[140px] flex-1 max-w-[240px]">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted">
                <IconSearch className="h-3 w-3" />
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pair…"
                autoFocus
                className="h-8 w-full rounded-lg border border-ink/[0.1] bg-surface-secondary pl-7 pr-2 text-[12px] text-text-primary placeholder:text-text-muted outline-none focus:border-accent/40"
              />
            </div>

            <span
              className="inline-flex h-8 items-center rounded-lg border border-accent/25 bg-accent/[0.08] px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent"
              title="Only coins currently on Market Pulse"
            >
              Pulse only
            </span>

            <div className="w-full sm:ml-auto sm:w-auto">
              <PulseSegGroup
                options={FLOW_SORTS.map((s) => ({ value: s.id, label: s.label }))}
                value={sort}
                onChange={setSort}
              />
            </div>
          </div>

          {/* Scrollable body — guide is a separate overlay modal */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {ranked.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <p className="text-[14px] font-medium text-text-primary">
                  {items.length === 0 ? "Flow metrics warming up" : "No pairs match"}
                </p>
                <p className="mt-1.5 text-[12px] text-text-muted">
                  {items.length === 0
                    ? "Proxy covers every coin currently on Market Pulse."
                    : "Try a different search."}
                </p>
              </div>
            ) : (
              <>
                <div className="hidden md:block">
                  <table className="w-full min-w-[720px] border-collapse text-left">
                    <thead className="sticky top-0 z-[1] bg-surface-raised/95 backdrop-blur-sm">
                      <tr className="border-b border-ink/[0.06] text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                        <th className="w-10 px-5 py-2.5 font-semibold">#</th>
                        <th className="px-2 py-2.5 font-semibold">Pair</th>
                        <th className="px-2 py-2.5 font-semibold text-right">Price</th>
                        <th className="px-2 py-2.5 font-semibold text-right">Ticks 5m</th>
                        <th className="px-2 py-2.5 font-semibold text-right">Δ 5m</th>
                        <th className="px-2 py-2.5 font-semibold text-right">Δ 1h</th>
                        <th className="px-2 py-2.5 font-semibold text-right">Δ 24h</th>
                        <th className="px-2 py-2.5 font-semibold text-right">Vol 24h</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Signal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row, i) => {
                        const ticks = Number(row.ticks_5m) || 0;
                        const heat = Math.min(1, ticks / maxTicks);
                        const chg5 = row.chg_5m;
                        const chg1 = row.chg_1h;
                        const chg24 = row.chg_24h;
                        const hot = ticks >= maxTicks * 0.45 && ticks >= 2000;
                        const callInfo = statusCtx?.map?.[(row.pair || "").toUpperCase()];
                        const stMeta = callInfo
                          ? STATUS_META[(callInfo.status || "open").toLowerCase()] ||
                            STATUS_META.open
                          : null;
                        const rowOutcome =
                          outcomeByPair[(row.pair || "").toUpperCase()] || null;
                        return (
                          <tr
                            key={row.pair}
                            onClick={() => pickPair(row.pair)}
                            className="cursor-pointer border-b border-ink/[0.04] transition-colors hover:bg-accent/[0.05]"
                          >
                            <td className="px-5 py-2.5 font-mono text-[10px] tabular-nums text-text-muted">
                              {rankOf(i)}
                            </td>
                            <td className="px-2 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <CoinLogo pair={row.pair} size={24} />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[13px] font-semibold tracking-tight text-text-primary">
                                      {stripQuote(row.pair)}
                                    </span>
                                    {hot && (
                                      <span className="rounded-sm border border-accent/30 bg-accent/10 px-1 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.1em] text-accent">
                                        hot
                                      </span>
                                    )}
                                    {callInfo && (
                                      <span
                                        className="rounded-sm border px-1 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.08em]"
                                        style={{
                                          color: stMeta.color,
                                          borderColor: `color-mix(in srgb, ${stMeta.color} 35%, transparent)`,
                                          background: `color-mix(in srgb, ${stMeta.color} 12%, transparent)`,
                                        }}
                                      >
                                        called
                                      </span>
                                    )}
                                    {!callInfo && rowOutcome && (
                                      <OutcomeBadge
                                        outcome={rowOutcome}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openSignal(row.pair);
                                        }}
                                      />
                                    )}
                                  </div>
                                  <span className="font-mono text-[9px] text-text-muted">
                                    {row.pair}
                                    {callInfo?.created
                                      ? ` · ${signalTimeAgo(callInfo.created) || ""}`
                                      : ""}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono text-[11px] tabular-nums text-text-secondary">
                              {formatPrice(row.price)}
                            </td>
                            <td className="px-2 py-2.5 text-right">
                              <div className="inline-flex flex-col items-end gap-1">
                                <span
                                  className={`font-mono text-[13px] font-semibold tabular-nums leading-none ${
                                    hot ? "text-accent" : "text-text-primary"
                                  }`}
                                >
                                  {fmtTicks(ticks)}
                                </span>
                                <span className="h-[3px] w-16 overflow-hidden rounded-full bg-ink/[0.08]">
                                  <span
                                    className="block h-full rounded-full bg-accent/75"
                                    style={{ width: `${Math.max(4, heat * 100)}%` }}
                                  />
                                </span>
                              </div>
                            </td>
                            <td
                              className={`px-2 py-2.5 text-right font-mono text-[12px] font-medium tabular-nums ${chgClass(chg5)}`}
                            >
                              {fmtChg(chg5)}
                            </td>
                            <td
                              className={`px-2 py-2.5 text-right font-mono text-[11px] tabular-nums ${chgClass(chg1)}`}
                            >
                              {fmtChg(chg1)}
                            </td>
                            <td
                              className={`px-2 py-2.5 text-right font-mono text-[11px] tabular-nums ${chgClass(chg24)}`}
                            >
                              {fmtChg(chg24)}
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono text-[10px] tabular-nums text-text-muted">
                              {formatVolume(row.quote_volume_24h)}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {callInfo ? (
                                <SwitchToSignalButton
                                  size="sm"
                                  onClick={() => openSignal(row.pair)}
                                />
                              ) : (
                                <span className="font-mono text-[9px] text-text-muted/50">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 md:hidden">
                  {pageRows.map((row, i) => {
                    const ticks = Number(row.ticks_5m) || 0;
                    const chg5 = row.chg_5m;
                    const callInfo = statusCtx?.map?.[(row.pair || "").toUpperCase()];
                    return (
                      <div
                        key={row.pair}
                        className="flex items-center gap-3 border-b border-ink/[0.05] px-4 py-3 transition-colors hover:bg-ink/[0.03]"
                      >
                        <button
                          type="button"
                          onClick={() => pickPair(row.pair)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <span className="w-5 font-mono text-[10px] text-text-muted">
                            {rankOf(i)}
                          </span>
                          <CoinLogo pair={row.pair} size={26} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-semibold text-text-primary">
                                {stripQuote(row.pair)}
                              </span>
                              <span
                                className={`font-mono text-[12px] tabular-nums ${chgClass(chg5)}`}
                              >
                                {fmtChg(chg5)}
                              </span>
                              {callInfo && (
                                <span className="rounded-sm border border-accent/30 bg-accent/10 px-1 py-0.5 font-mono text-[8px] font-semibold uppercase text-accent">
                                  called
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 font-mono text-[10px] text-text-muted">
                              <span
                                className={
                                  ticks >= maxTicks * 0.45 ? "font-medium text-accent" : ""
                                }
                              >
                                {fmtTicks(ticks)} ticks
                              </span>
                              {" · "}1h {fmtChg(row.chg_1h)} · 24h {fmtChg(row.chg_24h)}
                            </p>
                          </div>
                        </button>
                        {callInfo && (
                          <SwitchToSignalButton
                            size="sm"
                            onClick={() => openSignal(row.pair)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Footer pagination */}
          {ranked.length > 0 && (
            <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-t border-ink/[0.07] bg-ink/[0.02] px-4 py-2.5 sm:px-5">
              <span className="font-mono text-[10px] tabular-nums text-text-muted">
                {(safePage - 1) * FLOW_PAGE_SIZE + 1}–
                {Math.min(safePage * FLOW_PAGE_SIZE, ranked.length)} of {ranked.length}
                {query ? " · filtered" : " · pulse only"}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => goPage(1)}
                  className={`${pageBtnClass(false)} disabled:opacity-35`}
                >
                  «
                </button>
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => goPage(safePage - 1)}
                  className={`${pageBtnClass(false)} disabled:opacity-35`}
                >
                  ‹
                </button>
                {pageWindow[0] > 1 && (
                  <span className="px-1 font-mono text-[10px] text-text-muted">…</span>
                )}
                {pageWindow.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => goPage(p)}
                    className={pageBtnClass(p === safePage)}
                  >
                    {p}
                  </button>
                ))}
                {pageWindow[pageWindow.length - 1] < totalPages && (
                  <span className="px-1 font-mono text-[10px] text-text-muted">…</span>
                )}
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => goPage(safePage + 1)}
                  className={`${pageBtnClass(false)} disabled:opacity-35`}
                >
                  ›
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => goPage(totalPages)}
                  className={`${pageBtnClass(false)} disabled:opacity-35`}
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      </div>,
      document.body
    );

  // Separate guide modal — sits above Hot Flow (z-90), never steals table space
  const guideModal =
    open &&
    guideOpen &&
    createPortal(
      <div className="lq-modal-safe fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-5">
        <button
          type="button"
          aria-label="Close guide"
          className="lq-scrim"
          onClick={closeGuide}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="hot-flow-guide-title"
          className="lq-sheet relative z-10 flex max-h-[min(86dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border-t border-ink/[0.08] bg-surface-raised shadow-[0_-20px_60px_rgb(var(--scrim)_/_0.35)] sm:rounded-2xl sm:border sm:shadow-[0_24px_64px_rgb(var(--scrim)_/_0.45)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 justify-center pb-0.5 pt-2.5 sm:hidden" aria-hidden="true">
            <div className="h-1 w-10 rounded-full bg-ink/25" />
          </div>

          <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-ink/[0.06] px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 16v-4" strokeLinecap="round" />
                  <circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <div className="min-w-0">
                <h3
                  id="hot-flow-guide-title"
                  className="text-[13px] font-semibold tracking-tight text-text-primary"
                >
                  Hot Flow guide
                </h3>
                <p className="text-[10px] text-text-muted">Ticks · multi-TF Δ · Pulse only</p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeGuide}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-ink/[0.1] bg-surface-secondary text-text-muted transition-colors hover:border-ink/18 hover:text-text-primary"
              aria-label="Close guide"
            >
              <IconClose className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3.5 sm:px-5">
            <div className="space-y-2">
              {FLOW_GUIDE_CARDS.map((card, i) => (
                <div
                  key={card.title}
                  className="rounded-lg border border-ink/[0.07] bg-ink/[0.02] px-3 py-2.5"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[9px] tabular-nums text-text-muted">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h4 className="text-[12px] font-semibold tracking-tight text-text-primary">
                      {card.title}
                    </h4>
                  </div>
                  <p className="mt-1 pl-6 text-[11.5px] leading-relaxed text-text-muted">
                    {card.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-accent/20 bg-accent/[0.06] px-3 py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-accent">
                Sort · {FLOW_SORTS.find((s) => s.id === sort)?.label || sort}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-text-secondary">
                {FLOW_SORT_HELP.find((s) => s.id === sort)?.tip}
              </p>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { tag: "HOT", desc: "elevated ticks" },
                { tag: "CALLED", desc: "open signal desk" },
              ].map((x) => (
                <span
                  key={x.tag}
                  className="inline-flex items-center gap-1.5 rounded-md border border-ink/[0.08] bg-surface-secondary px-2 py-1 font-mono text-[9px] text-text-muted"
                >
                  <span className="font-semibold uppercase tracking-wider text-accent">{x.tag}</span>
                  {x.desc}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-text-muted">
              Row → chart · Signal → plan · Refreshes ~30s
            </p>
          </div>

          <div className="flex flex-shrink-0 justify-end border-t border-ink/[0.06] px-4 py-2.5 sm:px-5">
            <button
              type="button"
              onClick={closeGuide}
              className="inline-flex h-8 items-center rounded-lg bg-accent px-4 text-[12px] font-semibold text-accent-fg transition-transform hover:scale-[1.02] active:scale-[0.99]"
            >
              Got it
            </button>
          </div>
        </div>
      </div>,
      document.body
    );

  // Compact launcher strip on the page (never expands layout)
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full flex-wrap items-center justify-between gap-2 overflow-hidden rounded-lg border border-ink/[0.07] bg-surface-raised px-4 py-3 text-left transition-colors hover:border-accent/30 hover:bg-accent/[0.03]"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${
                items.length ? "animate-ping bg-accent" : "bg-text-muted"
              }`}
            />
            <span
              className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                items.length ? "bg-accent" : "bg-text-muted"
              }`}
            />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-primary">
                Hot Flow
              </span>
              {items.length > 0 && (
                <span className="rounded-sm border border-ink/10 bg-ink/[0.04] px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-text-muted">
                  {items.length} pairs
                  {pulseCovered != null ? ` · ${pulseCovered} pulse` : ""}
                </span>
              )}
              <span className="rounded-sm border border-ink/10 bg-ink/[0.04] px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                pulse only
              </span>
            </div>
            <p className="mt-0.5 text-[10px] font-mono tabular-nums text-text-muted">
              {items.length
                ? `Ticks · Pulse coins · ${ageLabel} · open modal`
                : "Ticks screener · waiting for Pulse data"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {teaser.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 mr-0.5">
              {teaser.map((row) => (
                <span
                  key={row.pair}
                  className="inline-flex items-center gap-1 rounded-md border border-ink/[0.08] bg-surface-secondary px-1.5 py-0.5"
                >
                  <CoinLogo pair={row.pair} size={14} />
                  <span className="text-[10px] font-medium text-text-primary">
                    {stripQuote(row.pair)}
                  </span>
                  <span className="font-mono text-[9px] tabular-nums text-accent">
                    {fmtTicks(row.ticks_5m)}
                  </span>
                </span>
              ))}
            </div>
          )}
          <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent transition-colors group-hover:bg-accent/15">
            Open
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              <path d="M7 17L17 7M10 7h7v7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </button>
      {modal}
      {guideModal}
    </>
  );
};

// ════════════════════════════════════════════════════════
// KPI CARDS — Flowscan stat card pattern (flat + hairline + inset shadow)
// ════════════════════════════════════════════════════════

const StatCardShell = ({ children }) => (
  <div className="relative flex h-full flex-col overflow-hidden rounded-lg border border-ink/[0.07] bg-surface-raised px-3 py-2.5 transition-colors hover:border-ink/12">
    <div className="relative z-10 flex h-full flex-col">{children}</div>
  </div>
);

// ── KPI: Events with mini histogram ─────────────────────
const KpiEvents = ({ total, uniqueCoins, histogram }) => {
  const max = Math.max(1, ...histogram.map((b) => b.bull + b.bear));
  return (
    <StatCardShell>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Events · 1h
        </span>
        <span className="text-[8px] font-mono uppercase text-text-muted">live</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tabular-nums leading-none tracking-tight text-text-primary sm:text-[22px]">
          {total}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-text-muted">/ {uniqueCoins}</span>
      </div>
      <div className="mt-auto flex h-3 items-end gap-px pt-2">
        {histogram.map((b, i) => {
          const tot = b.bull + b.bear;
          const pct = (tot / max) * 100;
          const bullRatio = tot > 0 ? b.bull / tot : 0;
          return (
            <div key={i} className="flex flex-1 flex-col-reverse" style={{ height: `${pct}%` }}>
              {b.bull > 0 && (
                <div className="rounded-[1px] bg-profit" style={{ height: `${bullRatio * 100}%` }} />
              )}
              {b.bear > 0 && (
                <div
                  className="rounded-[1px] bg-loss"
                  style={{ height: `${(1 - bullRatio) * 100}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
    </StatCardShell>
  );
};

// ── KPI: Bull/Bear ratio ────────────────────────────────
const KpiBullBear = ({ ratio }) => {
  const dom = ratio.bull >= ratio.bear ? "bull" : "bear";
  return (
    <StatCardShell>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Bull · Bear
        </span>
        {ratio.total > 0 && (
          <span
            className={`flex items-center gap-0.5 font-mono text-[9px] tabular-nums ${
              dom === "bull" ? "text-profit" : "text-loss"
            }`}
          >
            {dom === "bull" ? <IconArrowUpTri /> : <IconArrowDownTri />}
            {Math.abs(ratio.bull - ratio.bear)}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-semibold tabular-nums leading-none tracking-tight text-profit sm:text-[22px]">
          {ratio.bull}
        </span>
        <span className="text-sm text-text-muted/30">/</span>
        <span className="text-xl font-semibold tabular-nums leading-none tracking-tight text-loss sm:text-[22px]">
          {ratio.bear}
        </span>
      </div>
      {ratio.total > 0 && (
        <div className="mt-auto flex h-1 overflow-hidden rounded-full bg-ink/[0.04] pt-2">
          <div className="bg-profit transition-all" style={{ width: `${ratio.bullPct}%` }} />
          <div className="bg-loss transition-all" style={{ width: `${100 - ratio.bullPct}%` }} />
        </div>
      )}
    </StatCardShell>
  );
};

// ── KPI: Flash Moves ────────────────────────────────────
const KpiFlash = ({ count, previews, onSelect }) => (
  <StatCardShell>
    <div className="mb-1 flex items-center justify-between">
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
        Flash · 1h
      </span>
      {count > 0 && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
      )}
    </div>
    <div className="flex items-baseline gap-1.5">
      <span
        className={`text-xl font-semibold tabular-nums leading-none tracking-tight sm:text-[22px] ${
          count > 0 ? "text-accent" : "text-text-primary"
        }`}
      >
        {count}
      </span>
      <span className="font-mono text-[10px] text-text-muted">spikes</span>
    </div>
    <div className="mt-auto space-y-1 pt-2">
      {previews.length > 0 ? (
        previews.slice(0, 1).map((p, i) => (
          <button
            key={i}
            onClick={() => onSelect(p.pair)}
            className="group flex w-full items-center gap-1.5"
          >
            <span className="w-9 truncate text-left font-mono text-[9px] uppercase text-text-muted group-hover:text-text-primary">
              {stripQuote(p.pair)}
            </span>
            <span className="font-mono text-[9px] tabular-nums text-text-muted">
              {p.move_seconds}s
            </span>
          </button>
        ))
      ) : (
        <p className="text-[9px] text-text-muted">—</p>
      )}
    </div>
  </StatCardShell>
);

// ── KPI: Biggest Move (click to open chart) ─────────────
const KpiBiggestMove = ({ biggest, onSelect }) => {
  if (!biggest?.pair) {
    return (
      <StatCardShell>
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Biggest · 1h
        </span>
        <p className="mt-1 text-xl font-semibold tabular-nums leading-none text-text-primary">—</p>
      </StatCardShell>
    );
  }
  const symbol = stripQuote(biggest.pair);
  const pos = (biggest.pct_change || 0) >= 0;
  return (
    <button
      onClick={() => onSelect(biggest.pair)}
      className="relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-lg border border-ink/[0.07] bg-surface-raised px-3 py-2.5 text-left transition-colors hover:border-ink/12"
    >
      <div className="relative z-10 flex h-full flex-col">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Biggest · 1h
          </span>
          <IconChartLine className="h-3 w-3 text-text-muted/30" />
        </div>
        <div className="mb-1 flex items-center gap-2">
          <CoinLogo pair={biggest.pair} size={18} />
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium leading-tight text-text-primary">
              {titleCase(symbol)}
            </p>
          </div>
        </div>
        <p
          className={`mt-auto text-xl font-semibold tabular-nums leading-none tracking-tight sm:text-[22px] ${
            pos ? "text-profit" : "text-loss"
          }`}
        >
          {pos ? "+" : ""}
          {biggest.pct_change}%
        </p>
      </div>
    </button>
  );
};

// ════════════════════════════════════════════════════════
// CONTROL BAR — Flowscan card with filter pills
// ════════════════════════════════════════════════════════

const ControlBar = ({
  searchPair,
  setSearchPair,
  setSelectedCoin,
  activeCoins,
  selectedCoin,
  selectCoin,
  sourceFilter,
  callFilter,
  setCallFilter,
  setSourceFilter,
  timeframeFilter,
  setTimeframeFilter,
  coinDetail,
  timeAgo,
  openChartModal,
  entitled,
  calledCount,
}) => (
  <div className="overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised">
    <div className="relative z-10 flex flex-col gap-3 p-3.5 md:p-4">
      {/* Row 1: Search + active coin pills */}
      <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
        <label className="group flex h-9 min-w-0 flex-shrink-0 items-center gap-2 rounded-md border border-ink/[0.1] bg-surface-secondary px-3 transition-colors focus-within:border-ink/20 md:w-52">
          <IconSearch className="h-3.5 w-3.5 shrink-0 text-text-muted transition-colors group-focus-within:text-accent" />
          <input
            type="text"
            placeholder="Search coin..."
            value={searchPair}
            onChange={(e) => {
              setSearchPair(e.target.value);
              setSelectedCoin(null);
            }}
            className="w-full min-w-0 bg-transparent font-mono text-[12px] text-text-primary outline-none placeholder:text-text-muted"
          />
        </label>

        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          {activeCoins.map(([pair, count]) => {
            const symbol = stripQuote(pair);
            const isSelected = selectedCoin === pair;
            return (
              <button
                key={pair}
                onClick={() => selectCoin(pair)}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                  isSelected
                    ? "border-transparent bg-accent text-accent-fg"
                    : "border-ink/[0.1] bg-surface-secondary text-text-muted hover:border-ink/18 hover:text-text-primary"
                }`}
              >
                <CoinLogo pair={pair} size={14} />
                <span className="tracking-tight">{symbol}</span>
                <span
                  className={`rounded-sm px-1 font-mono text-[9px] tabular-nums ${
                    isSelected ? "bg-black/15 text-accent-fg" : "bg-ink/[0.05] text-text-muted"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 2: Source + TF stay on one desk strip */}
      <div className="flex flex-col gap-2 pt-3 border-t border-ink/[0.04] sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 items-center gap-2 sm:flex-1">
          <span className="w-[52px] shrink-0 text-[9px] font-semibold uppercase tracking-[0.2em] text-text-muted">
            Source
          </span>
          <SegGroup
            size="sm"
            fill
            aria-label="Source filter"
            wrap
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[
              { key: "all", label: "All" },
              { key: "pulse", label: "Pulse" },
              { key: "price_movement", label: "Price" },
            ]}
          />
        </div>
        <div className="flex min-w-0 items-center gap-2 sm:flex-1">
          <span className="w-[52px] shrink-0 text-[9px] font-semibold uppercase tracking-[0.2em] text-text-muted">
            TF
          </span>
          <SegGroup
            size="sm"
            fill
            aria-label="Timeframe filter"
            wrap
            value={timeframeFilter}
            onChange={setTimeframeFilter}
            options={[
              { key: "all", label: "All" },
              { key: "5m", label: "5m" },
              { key: "1h", label: "1h" },
              { key: "2h", label: "2h" },
              { key: "4h", label: "4h" },
              { key: "1d", label: "1d" },
              { key: "1w", label: "1w" },
            ]}
          />
        </div>
        <span className="sm:ml-auto text-[9px] font-mono uppercase tracking-[0.15em] text-text-muted">
          24h rolling
        </span>
      </div>

      {/* Row 3: Calls overlay — own row so VIP copy never collides with TF */}
      <div className="flex flex-col gap-2 border-t border-ink/[0.04] pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex w-[52px] shrink-0 items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-text-muted">
            Calls
            {!entitled ? (
              <span className="rounded-sm border border-accent/25 bg-accent/[0.08] px-1 py-px font-mono text-[8px] tracking-[0.12em] text-accent">
                VIP
              </span>
            ) : null}
          </span>
          <SegGroup
            size="sm"
            aria-label="Called filter"
            value={callFilter}
            onChange={setCallFilter}
            options={[
              { key: "all", label: "All" },
              {
                key: "called",
                label: "Called",
                title: entitled
                  ? "Movers our algorithm has already called"
                  : "VIP — coins with momentum and a live LuxQuant plan",
              },
              {
                key: "uncalled",
                label: "Not called",
                title: entitled
                  ? "Movers we have not signalled"
                  : "VIP — movers with no LuxQuant call yet",
              },
            ]}
          />
        </div>
        {!entitled && callFilter !== "all" ? (
          <p className="min-w-0 text-[11px] leading-snug text-text-muted sm:max-w-sm sm:text-right">
            {calledCount
              ? `${calledCount} coins called this week — activate VIP to overlay them on this tape`
              : "Activate VIP to overlay LuxQuant calls on this tape"}
          </p>
        ) : null}
        {entitled && callFilter === "called" ? (
          <p className="text-[11px] text-text-muted sm:text-right">
            Momentum plus a live plan — tap a coin for the call
          </p>
        ) : null}
      </div>
    </div>

    {coinDetail && selectedCoin && (
      <CoinDetailBanner
        pair={selectedCoin}
        coinDetail={coinDetail}
        timeAgo={timeAgo}
        onClose={() => {
          /* parent handles via selectCoin */
        }}
        onOpenChart={openChartModal}
      />
    )}
  </div>
);

const CoinDetailBanner = ({ pair, coinDetail, timeAgo, _onClose, onOpenChart }) => {
  const symbol = stripQuote(pair);
  const stats = coinDetail.stats;
  const bullPct = stats.bull_pct;
  return (
    <div className="border-t border-ink/[0.08] bg-surface-secondary/50 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <CoinLogo pair={pair} size={32} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold tracking-tight text-text-primary">
                {titleCase(symbol)}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-text-muted">{pair}</span>
              <span
                className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] ${
                  bullPct >= 60
                    ? "border-profit/25 bg-profit/12 text-profit"
                    : bullPct <= 40
                      ? "border-loss/25 bg-loss/12 text-loss"
                      : "border-ink/15 bg-ink/[0.05] text-text-secondary"
                }`}
              >
                {bullPct}% bull
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onOpenChart && (
            <button
              type="button"
              onClick={() => onOpenChart(pair)}
              className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-fg transition hover:opacity-90"
            >
              <IconChartLine className="h-3 w-3" />
              <span>Chart</span>
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <DetailStat label="Strongest Up" value={`+${stats.strongest_up || 0}%`} accent="emerald" />
        <DetailStat label="Strongest Down" value={`${stats.strongest_down || 0}%`} accent="red" />
        <DetailStat label="Events 24h" value={stats.total_events} />
        <DetailStat label="Last Activity" value={timeAgo(stats.last_activity)} />
      </div>
    </div>
  );
};

const DetailStat = ({ label, value, accent }) => {
  const colorMap = { emerald: "text-profit", red: "text-loss" };
  return (
    <div className="rounded-md border border-ink/[0.08] bg-surface-raised p-2.5 text-center">
      <p
        className={`font-mono text-sm font-semibold tabular-nums leading-none ${colorMap[accent] || "text-text-primary"}`}
      >
        {value}
      </p>
      <p className="mt-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
        {label}
      </p>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// MINI SPARKBAR (used in feed rows, group headers, mover panel)
// ════════════════════════════════════════════════════════

const MiniSparkbar = ({ histogram, height = 18, gap = 1.5 }) => {
  if (!histogram || histogram.length === 0) return null;

  if (histogram.length === 1) {
    const h = histogram[0];
    return (
      <div className="flex items-center justify-end" style={{ height }}>
        <div
          className={`rounded-full ${h.bull ? "bg-profit" : "bg-loss"}`}
          style={{
            width: Math.max(4, height * 0.4),
            height: Math.max(4, height * 0.4),
          }}
        />
      </div>
    );
  }

  const max = Math.max(0.01, ...histogram.map((h) => Math.abs(h.pct)));
  return (
    <div className="flex items-end" style={{ height, gap: `${gap}px` }}>
      {histogram.map((h, i) => {
        const mag = Math.abs(h.pct) / max;
        return (
          <div
            key={i}
            className={`w-[3px] rounded-[1px] ${h.bull ? "bg-profit" : "bg-loss"}`}
            style={{ height: `${10 + mag * 90}%` }}
          />
        );
      })}
    </div>
  );
};

// ════════════════════════════════════════════════════════
// ACTIVITY FEED PANEL — Flowscan main card pattern
// ════════════════════════════════════════════════════════

// ── Feed mode switch — solid yellow, or profit/loss when semantic ──
const PulseSegGroup = ({ options, value, onChange }) => (
  <div className="flex rounded-md border border-ink/[0.1] bg-surface-secondary p-0.5">
    {options.map((opt) => {
      const active = value === opt.value;
      const activeClass =
        opt.accent === "emerald" || opt.accent === "profit"
          ? "bg-profit text-white"
          : opt.accent === "red" || opt.accent === "loss"
            ? "bg-loss text-white"
            : "bg-accent text-accent-fg";
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-sm px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] transition-colors ${
            active ? activeClass : "text-text-muted hover:text-text-primary"
          }`}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

// ── Repeat count badge (×N) — surfaces recurring pumps/dumps per coin ──
const RepeatBadge = ({ count, kind = "events", compact = false }) => {
  if (!count || count < 2) return null;
  const tier = repeatTier(count);
  const label =
    kind === "pumps" ? "pumps" : kind === "dumps" ? "dumps" : "events";
  const tone =
    tier === "hot"
      ? "border-accent/40 bg-accent/18 text-accent"
      : tier === "warm"
        ? kind === "dumps"
          ? "border-loss/35 bg-loss/14 text-loss"
          : "border-profit/35 bg-profit/14 text-profit"
        : "border-ink/12 bg-ink/[0.05] text-text-muted";
  return (
    <span
      className={`inline-flex items-center rounded-sm border font-mono font-semibold uppercase tracking-[0.1em] ${tone} ${
        compact ? "px-1 py-0.5 text-[8.5px]" : "px-1.5 py-0.5 text-[9px]"
      }`}
      title={`${count} ${label} for this coin in the current feed window (24h)`}
    >
      ×{count}
      {!compact ? ` ${label}` : ""}
    </span>
  );
};

// ── Feed list renderer (shared by all layout modes) ──────
const FeedList = ({
  grouped,
  keyPrefix,
  coinHistograms,
  pairPulseStats = {},
  selectedCoin,
  openChartModal,
  eventTagClass,
  eventLabel,
  timeAgo,
  expandedGroups,
  toggleGroup,
  flowByPair = {},
  outcomeByPair = {},
  sideHint = "all", // all | pump | dump — labels for ×N badge
}) =>
  grouped.map((group, gi) => {
    const stats = pairPulseStats[group.pair] || null;
    const windowCount =
      sideHint === "pump"
        ? stats?.pumps ?? group.pumpCount ?? group.events.length
        : sideHint === "dump"
          ? stats?.dumps ?? group.dumpCount ?? group.events.length
          : stats?.total ?? group.events.length;
    const badgeKind =
      sideHint === "pump" ? "pumps" : sideHint === "dump" ? "dumps" : "events";

    if (group.events.length === 1) {
      const event = group.events[0];
      return (
        <FeedRow
          key={`${keyPrefix}-single-${event.source}-${event.id}`}
          event={event}
          histogram={coinHistograms[event.pair]}
          isSelected={selectedCoin === event.pair}
          onSelect={() => openChartModal(event.pair)}
          eventTagClass={eventTagClass}
          eventLabel={eventLabel}
          timeAgo={timeAgo}
          flow={flowByPair[(event.pair || "").toUpperCase()]}
          outcome={outcomeByPair[(event.pair || "").toUpperCase()] || null}
          repeatCount={windowCount}
          repeatKind={badgeKind}
        />
      );
    }
    const gkey = `${keyPrefix}-${gi}-${group.pair}`;
    // Multi-event coin groups start collapsed so the feed stays scannable;
    // expand to audit every pulse. User toggle still wins.
    const isExpanded = expandedGroups[gkey] === true;
    const avgPct = group.events.reduce((s, e) => s + (e.pct_change || 0), 0) / group.events.length;
    return (
      <div key={`${keyPrefix}-group-${gi}-${group.pair}`}>
        <FeedGroupHeader
          group={group}
          avgPct={avgPct}
          expanded={isExpanded}
          onToggle={(e) => toggleGroup(gkey, e)}
          isSelected={selectedCoin === group.pair}
          onSelectCoin={() => openChartModal(group.pair)}
          repeatCount={windowCount}
          repeatKind={badgeKind}
        />
        {isExpanded &&
          group.events.map((event) => (
            <FeedSubRow
              key={`${keyPrefix}-sub-${event.source}-${event.id}`}
              event={event}
              eventTagClass={eventTagClass}
              eventLabel={eventLabel}
              timeAgo={timeAgo}
              onSelect={() => openChartModal(event.pair)}
            />
          ))}
      </div>
    );
  });

const CalledLocked = ({ count, filter = "called", onStayFree }) => {
  const navigate = useNavigate();
  const isCalled = filter === "called";
  return (
    <div className="p-3 sm:p-4">
      <div className="flex flex-col gap-4 rounded-lg border border-accent/20 bg-accent/[0.04] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-sm border border-accent/25 bg-accent/[0.1] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-accent">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path strokeLinecap="round" d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              VIP
            </span>
            <p className="text-[14px] font-semibold tracking-tight text-text-primary">
              {isCalled ? "Called movers" : "Not-called movers"}
            </p>
            {count ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
                {count} called · 7d
              </span>
            ) : null}
          </div>
          <p className="max-w-xl text-[12px] leading-relaxed text-text-secondary">
            {isCalled
              ? "Pulse stays free. Called shows which of these movers already have a live LuxQuant plan — entry, targets, and stop."
              : "Pulse stays free. Not called hides coins we already signalled, so you can scan movers with no plan yet."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/pricing")}
            className="rounded-md bg-accent px-4 py-2 text-[12px] font-semibold text-accent-fg"
          >
            Activate VIP
          </button>
          {typeof onStayFree === "function" ? (
            <button
              type="button"
              onClick={onStayFree}
              className="rounded-md border border-ink/[0.1] bg-surface-raised px-3.5 py-2 text-[12px] font-medium text-text-secondary hover:text-text-primary"
            >
              Back to Pulse
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const FeedEmpty = ({ label = "No events match your filters" }) => (
  <div className="p-12 flex flex-col items-center justify-center gap-3">
    <IconEmpty className="h-7 w-7 text-text-muted/30" />
    <div className="text-text-muted text-[11px] font-mono uppercase tracking-[0.15em] text-center">
      {label}
    </div>
  </div>
);

// ── Split column header (Pumps / Dumps) ─────────────────
const SplitColHeader = ({ dir, count }) => {
  const isPump = dir === "pump";
  return (
    <div className="px-3 py-2 border-b border-ink/[0.06] flex items-center justify-between bg-ink/[0.015] flex-shrink-0">
      <span
        className={`text-[10px] font-semibold uppercase tracking-[0.16em] flex items-center gap-1.5 ${
          isPump ? "text-profit" : "text-loss"
        }`}
      >
        {isPump ? (
          <IconArrowUpTri className="h-2.5 w-2.5" />
        ) : (
          <IconArrowDownTri className="h-2.5 w-2.5" />
        )}
        {isPump ? "Pumps" : "Dumps"}
      </span>
      <span className="text-[9.5px] font-mono tabular-nums text-text-muted/50">{count}</span>
    </div>
  );
};

/** Fullscreen expand — same grammar as Signal Modal / TradingView chart full. */
const FullscreenToggleBtn = ({ active, onClick, labelFull = "Full", labelBack = "Back" }) => (
  <button
    type="button"
    onClick={onClick}
    title={active ? "Back to page layout (Esc)" : "Expand to full screen (F)"}
    aria-label={active ? "Exit fullscreen" : "Expand fullscreen"}
    className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[10px] font-medium uppercase tracking-[0.1em] transition-colors ${
      active
        ? "border-accent/35 bg-accent/12 text-accent"
        : "border-ink/[0.1] bg-surface-secondary text-text-muted hover:border-ink/18 hover:text-text-primary"
    }`}
  >
    {active ? <IconCollapse className="h-3 w-3" /> : <IconExpand className="h-3 w-3" />}
    <span className="hidden sm:inline">{active ? labelBack : labelFull}</span>
  </button>
);

/** Lock body scroll + Esc/F while a Pulse panel is fullscreen. */
function usePulseFullscreen(open, setOpen) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target?.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);
}

const ActivityFeedPanel = ({
  callFilter,
  setCallFilter,
  entitled,
  calledCount,
  _filteredFeed,
  feed,
  loading,
  feedLayout,
  changeLayout,
  feedSide,
  setFeedSide,
  feedSort = "latest",
  changeFeedSort,
  groupedSide,
  groupedPump,
  groupedDump,
  pumpCount,
  dumpCount,
  sideCount,
  coinCount,
  coinHistograms,
  pairPulseStats = {},
  selectedCoin,
  openChartModal,
  eventTagClass,
  eventLabel,
  timeAgo,
  expandedGroups,
  toggleGroup,
  sidebarOpen,
  onToggleSidebar,
  flowByPair = {},
  outcomeByPair = {},
}) => {
  const isSplit = feedLayout === "split";
  const isFocus = feedLayout === "focus";
  const [feedFull, setFeedFull] = useState(false);
  const toggleFeedFull = useCallback(() => setFeedFull((v) => !v), []);
  usePulseFullscreen(feedFull, setFeedFull);

  // F opens fullscreen when focus is not in an input (page-level convenience)
  useEffect(() => {
    if (feedFull) return undefined;
    const onKey = (e) => {
      if (e.key !== "f" && e.key !== "F") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      // Don't steal F when chart modal is open (?pair=)
      if (new URLSearchParams(window.location.search).get("pair")) return;
      e.preventDefault();
      setFeedFull(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [feedFull]);

  const listProps = {
    coinHistograms,
    pairPulseStats,
    selectedCoin,
    openChartModal,
    eventTagClass,
    eventLabel,
    timeAgo,
    expandedGroups,
    toggleGroup,
    flowByPair,
    outcomeByPair,
  };

  const headerCount = isSplit ? pumpCount + dumpCount : sideCount;
  const headerCoins = isSplit
    ? groupedPump.length + groupedDump.length
    : coinCount ?? groupedSide.length;

  const sideOptions = isFocus
    ? [
        { value: "pump", label: "Pumps", accent: "emerald" },
        { value: "dump", label: "Dumps", accent: "red" },
      ]
    : [
        { value: "all", label: "All" },
        { value: "pump", label: "Pumps", accent: "emerald" },
        { value: "dump", label: "Dumps", accent: "red" },
      ];

  const callsLocked = !entitled && (callFilter === "called" || callFilter === "uncalled");

  const feedBody = callsLocked ? (
    <div className={`relative z-10 ${feedFull ? "mp-feed-body-full" : ""}`}>
      <CalledLocked
        count={calledCount}
        filter={callFilter}
        onStayFree={() => setCallFilter?.("all")}
      />
    </div>
  ) : isSplit ? (
    <div className={`mp-split-grid relative z-10 ${feedFull ? "mp-feed-body-full" : ""}`}>
      <div className="mp-split-col">
        <SplitColHeader dir="pump" count={pumpCount} />
        <div className="mp-feed-list pulse-feed-scroll">
          {loading && feed.length === 0 ? (
            <FeedSkeleton />
          ) : groupedPump.length === 0 ? (
            <FeedEmpty label="No pumps yet" />
          ) : (
            <FeedList grouped={groupedPump} keyPrefix="p" sideHint="pump" {...listProps} />
          )}
        </div>
      </div>
      <div className="mp-split-col">
        <SplitColHeader dir="dump" count={dumpCount} />
        <div className="mp-feed-list pulse-feed-scroll">
          {loading && feed.length === 0 ? (
            <FeedSkeleton />
          ) : groupedDump.length === 0 ? (
            <FeedEmpty label="No dumps yet" />
          ) : (
            <FeedList grouped={groupedDump} keyPrefix="d" sideHint="dump" {...listProps} />
          )}
        </div>
      </div>
    </div>
  ) : (
    <div className={`mp-feed-list pulse-feed-scroll relative z-10 ${feedFull ? "mp-feed-body-full" : ""}`}>
      {loading && feed.length === 0 && <FeedSkeleton />}
      {!loading && groupedSide.length === 0 && (
        <FeedEmpty
          label={
            feedSide === "pump"
              ? "No pumps match your filters"
              : feedSide === "dump"
                ? "No dumps match your filters"
                : "No events match your filters"
          }
        />
      )}
      <FeedList
        grouped={groupedSide}
        keyPrefix="s"
        sideHint={feedSide === "pump" ? "pump" : feedSide === "dump" ? "dump" : "all"}
        {...listProps}
      />
    </div>
  );

  const headerControls = (
    <div className="flex items-center gap-1.5 flex-wrap">
      {!isSplit && (
        <PulseSegGroup options={sideOptions} value={feedSide} onChange={setFeedSide} />
      )}
      {typeof changeFeedSort === "function" && (
        <PulseSegGroup
          options={[
            { value: "latest", label: "Latest" },
            { value: "repeat", label: "Repeat", accent: "emerald" },
          ]}
          value={feedSort}
          onChange={changeFeedSort}
        />
      )}
      <PulseSegGroup
        options={[
          { value: "unified", label: "Unified" },
          { value: "split", label: "Split" },
          { value: "focus", label: "Focus" },
        ]}
        value={feedLayout}
        onChange={changeLayout}
      />

      <FullscreenToggleBtn active={feedFull} onClick={toggleFeedFull} />

      {/* Collapse side panel (desktop only, hidden in fullscreen) */}
      {onToggleSidebar && !feedFull && (
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? "Hide side panel" : "Show side panel"}
          title={sidebarOpen ? "Hide side panel" : "Show side panel"}
          className="hidden h-7 w-7 items-center justify-center rounded-md border border-ink/[0.1] bg-surface-secondary text-text-muted transition-colors hover:border-ink/18 hover:text-text-primary lg:inline-flex"
        >
          {sidebarOpen ? (
            <IconChevronsRight className="h-3.5 w-3.5" />
          ) : (
            <IconChevronsLeft className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );

  const cardInner = (
    <>
      <div className="px-4 py-3 border-b border-ink/[0.06] flex items-center justify-between gap-3 bg-ink/[0.015] flex-shrink-0 relative z-10 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-profit opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-profit" />
          </span>
          <h2 className="text-[11px] font-semibold text-text-primary uppercase tracking-[0.2em]">
            Activity Feed
          </h2>
          <span
            className="text-[10px] font-mono tabular-nums text-text-muted"
            title={`${headerCount} events · ${headerCoins} coins (grouped)`}
          >
            {headerCount}
            <span className="text-text-muted/50"> · </span>
            {headerCoins} coins
          </span>
          {feedFull && (
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.14em] text-accent sm:inline">
              Fullscreen · Esc
            </span>
          )}
        </div>
        {headerControls}
      </div>

      {feedBody}

      <div className="px-4 py-2 border-t border-ink/[0.06] text-center bg-ink/[0.015] flex-shrink-0 relative z-10">
        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-muted">
          {feedFull
            ? "Fullscreen · F / Esc to exit · Grouped by coin · ×N = repeats · Auto-refresh · 10s"
            : "Grouped by coin · ×N = repeats · Full for desk view · Auto-refresh · 10s"}
        </span>
      </div>
    </>
  );

  // Compact dock when feed is fullscreen (keeps grid height, one-click restore)
  const dock = feedFull ? (
    <div className="mp-feed-card overflow-hidden rounded-lg border border-dashed border-accent/30 bg-accent/[0.04]">
      <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 px-4 py-6 text-center lg:min-h-0">
        <p className="text-[12px] font-medium text-text-primary">Activity Feed is fullscreen</p>
        <p className="text-[11px] text-text-muted">Press Esc or F, or restore below</p>
        <FullscreenToggleBtn active onClick={toggleFeedFull} labelBack="Restore" />
      </div>
    </div>
  ) : null;

  const inlineCard = (
    <div className="mp-feed-card overflow-hidden rounded-lg border border-ink/[0.07] bg-surface-raised">
      {cardInner}
    </div>
  );

  const fullscreenLayer =
    feedFull &&
    createPortal(
      <div
        className="mp-panel-fullscreen lq-below-header fixed inset-0 z-[100000] flex flex-col bg-surface p-2 sm:p-3"
        role="dialog"
        aria-modal="true"
        aria-label="Activity Feed fullscreen"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-ink/[0.1] bg-surface-raised shadow-2xl">
          {cardInner}
        </div>
      </div>,
      document.body
    );

  return (
    <>
      {feedFull ? dock : inlineCard}
      {fullscreenLayer}
    </>
  );
};

// ── Feed Row (single event) ─────────────────────────────
const FeedRow = ({
  event,
  histogram,
  isSelected,
  onSelect,
  eventTagClass,
  eventLabel,
  timeAgo,
  flow,
  outcome = null,
  repeatCount = 0,
  repeatKind = "events",
}) => {
  const symbol = stripQuote(event.pair);
  const isPositive = (event.pct_change || 0) >= 0;
  const magnitude = Math.min(Math.abs(event.pct_change || 0) / 10, 1);
  const statusCtx = useSignalStatus();
  const called = !!(statusCtx?.map && statusCtx.map[(event.pair || "").toUpperCase()]);
  const ticks = flow?.ticks_5m;
  const chg5 = flow?.chg_5m;
  return (
    <div
      onClick={onSelect}
      className={`relative grid grid-cols-[26px_minmax(0,1fr)_auto] md:grid-cols-[26px_minmax(0,1fr)_70px_22px_44px] items-center gap-3 px-4 py-2.5 hover:bg-ink/[0.025] transition-colors cursor-pointer border-l-2 border-b border-ink/[0.03] ${
        isSelected ? "bg-accent/[0.06] border-l-accent" : ""
      }`}
      style={{
        borderLeftColor: !isSelected
          ? isPositive
            ? `rgb(var(--pos) / ${0.35 + magnitude * 0.55})`
            : `rgb(var(--neg) / ${0.35 + magnitude * 0.55})`
          : undefined,
      }}
    >
      <CoinLogo pair={event.pair} size={26} />

      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-text-primary font-medium text-[12.5px] leading-none tracking-tight">
            {symbol}
          </span>
          <span
            className={`font-mono tabular-nums text-[12.5px] leading-none flex items-center gap-0.5 ${
              isPositive ? "text-profit" : "text-loss"
            }`}
          >
            {isPositive ? <IconArrowUpTri /> : <IconArrowDownTri />}
            {isPositive ? "+" : ""}
            {event.pct_change}%
          </span>
          <RepeatBadge count={repeatCount} kind={repeatKind} />
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded-sm border font-mono uppercase tracking-[0.12em] hidden sm:inline-block ${eventTagClass(event)}`}
          >
            {eventLabel(event)}
          </span>
          {called && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                statusCtx?.openPair?.(event.pair);
              }}
              className="inline-flex items-center gap-1 rounded-sm border border-transparent bg-accent px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-accent-fg transition-opacity hover:opacity-90"
              title="LuxQuant call — click for details"
            >
              Called
            </button>
          )}
          {!called && outcome && (
            <OutcomeBadge
              outcome={outcome}
              onClick={(e) => {
                e.stopPropagation();
                statusCtx?.openPair?.(event.pair);
              }}
            />
          )}
        </div>
        <p className="text-text-muted text-[10px] mt-1 font-mono tabular-nums">
          {event.pair} ·{" "}
          {event.source === "price_movement"
            ? `${event.move_seconds}s move`
            : `${event.timeframe || "—"} TF`}
          {ticks != null ? (
            <>
              {" · "}
              <span className={ticks >= 1000 ? "text-accent font-medium" : ""}>
                {fmtTicks(ticks)} ticks
              </span>
            </>
          ) : null}
          {chg5 != null ? (
            <>
              {" · "}
              <span className={chg5 >= 0 ? "text-profit/80" : "text-loss/80"}>
                5m {chg5 >= 0 ? "+" : ""}
                {chg5.toFixed(2)}%
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div className="hidden md:flex items-center justify-end opacity-80">
        {histogram && histogram.length >= 1 ? (
          <MiniSparkbar histogram={histogram} height={18} />
        ) : (
          <div style={{ width: 60, height: 18 }} />
        )}
      </div>

      <div
        className={`hidden h-[22px] w-[22px] items-center justify-center rounded-full md:flex ${
          event.direction === "bullish" ? "bg-profit text-white" : "bg-loss text-white"
        }`}
      >
        {event.direction === "bullish" ? <IconArrowUpTri /> : <IconArrowDownTri />}
      </div>

      <span className="text-right font-mono text-[10px] tabular-nums text-text-muted">
        {timeAgo(event.created_at)}
      </span>
    </div>
  );
};

// ── Feed Group Header ───────────────────────────────────
const FeedGroupHeader = ({
  group,
  avgPct,
  expanded,
  onToggle,
  isSelected,
  onSelectCoin,
  repeatCount,
  repeatKind = "events",
}) => {
  const symbol = stripQuote(group.pair);
  const isPos = avgPct >= 0;
  const statusCtx = useSignalStatus();
  const called = !!(statusCtx?.map && statusCtx.map[(group.pair || "").toUpperCase()]);
  const n = repeatCount || group.events.length;
  const groupHist = group.events
    .map((e) => ({ pct: e.pct_change || 0, bull: e.direction === "bullish" }))
    .reverse();
  const latest = group.events[0];
  const pumps = group.pumpCount ?? group.events.filter(isPumpEvent).length;
  const dumps = group.dumpCount ?? group.events.length - pumps;
  return (
    <div
      onClick={onToggle}
      className={`px-4 py-2.5 border-b border-ink/[0.04] flex items-center gap-2.5 cursor-pointer transition-colors hover:bg-ink/[0.025] ${
        isSelected ? "bg-accent/[0.06]" : "bg-surface-secondary/40"
      }`}
      title="Click to show / hide pulse history for this coin"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelectCoin?.();
        }}
        className="flex-shrink-0 rounded-full focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        title={`Open ${symbol} chart`}
      >
        <CoinLogo pair={group.pair} size={26} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectCoin?.();
            }}
            className="text-text-primary text-[12.5px] font-medium tracking-tight hover:text-accent transition-colors"
          >
            {symbol}
          </button>
          <RepeatBadge count={n} kind={repeatKind} />
          {called && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                statusCtx?.openPair?.(group.pair);
              }}
              className="inline-flex items-center gap-1 rounded-sm border border-transparent bg-accent px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-accent-fg transition-opacity hover:opacity-90"
              title="LuxQuant call — click for details"
            >
              Called
            </button>
          )}
        </div>
        <p className="text-text-muted text-[10px] mt-1 font-mono tabular-nums">
          {group.pair}
          {repeatKind === "all" || repeatKind === "events"
            ? ` · ${pumps}↑ ${dumps}↓`
            : latest
              ? ` · latest ${latest.event_type || "—"}`
              : ""}
          {" · "}
          <span className="text-text-muted/70">{expanded ? "hide history" : "show history"}</span>
        </p>
      </div>
      <div className="hidden sm:block opacity-80">
        <MiniSparkbar histogram={groupHist.slice(-10)} height={16} gap={2} />
      </div>
      <span
        className={`text-[11px] font-mono tabular-nums font-medium min-w-[60px] text-right flex items-center justify-end gap-1 ${
          isPos ? "text-profit" : "text-loss"
        }`}
        title="Average move across grouped events"
      >
        {isPos ? <IconArrowUpTri /> : <IconArrowDownTri />}
        {isPos ? "+" : ""}
        {avgPct.toFixed(2)}%
      </span>
      <span
        className="w-[22px] h-[22px] rounded-sm border border-ink/[0.08] text-text-muted flex items-center justify-center"
        aria-hidden
      >
        {expanded ? (
          <IconChevronUp className="h-2.5 w-2.5" />
        ) : (
          <IconChevronDown className="h-2.5 w-2.5" />
        )}
      </span>
    </div>
  );
};

// ── Feed Sub Row ────────────────────────────────────────
const FeedSubRow = ({ event, eventTagClass, eventLabel, timeAgo, onSelect }) => {
  const isPos = (event.pct_change || 0) >= 0;
  return (
    <div
      onClick={onSelect}
      className={`grid grid-cols-[12px_minmax(0,1fr)_22px_44px] items-center gap-3 px-4 py-2 pl-14 border-b border-ink/[0.04] hover:bg-ink/[0.02] transition-colors cursor-pointer border-l-2 ${
        isPos ? "border-l-profit/50" : "border-l-loss/50"
      }`}
    >
      <span className="text-text-muted/35 text-[9px] font-mono">→</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-text-muted text-[12px]">{event.event_type || "—"}</span>
          <span
            className={`font-mono tabular-nums text-[12px] flex items-center gap-0.5 ${
              isPos ? "text-profit" : "text-loss"
            }`}
          >
            {isPos ? <IconArrowUpTri /> : <IconArrowDownTri />}
            {isPos ? "+" : ""}
            {event.pct_change}%
          </span>
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded-sm border font-mono uppercase tracking-[0.12em] hidden sm:inline-block ${eventTagClass(event)}`}
          >
            {eventLabel(event)}
          </span>
        </div>
        <p className="text-text-muted/50 text-[10px] mt-0.5 font-mono tabular-nums">
          {event.pair} ·{" "}
          {event.source === "price_movement"
            ? `${event.move_seconds}s move`
            : `${event.timeframe || "—"} TF`}
        </p>
      </div>
      <div
        className={`flex h-[18px] w-[18px] items-center justify-center rounded-full ${
          event.direction === "bullish" ? "bg-profit text-white" : "bg-loss text-white"
        }`}
      >
        {event.direction === "bullish" ? <IconArrowUpTri /> : <IconArrowDownTri />}
      </div>
      <span className="text-right font-mono text-[10px] tabular-nums text-text-muted">
        {timeAgo(event.created_at)}
      </span>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// HEATMAP — solid Binance green/red treemap (no pastel wash)
// ════════════════════════════════════════════════════════

function HeatCell(props) {
  const { x, y, width, height, name, pair, pct = 0, eventCount = 1, called, onPick } = props;
  if (!name || width <= 1 || height <= 1) return null;
  const sym = stripQuote(name);
  const med = width > 32 && height > 22;
  const big = width > 54 && height > 44;
  const logo = Math.min(30, Math.max(13, Math.min(width, height) * 0.3));
  const label = {
    color: "#ffffff",
    fontWeight: 700,
    lineHeight: 1.05,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textShadow: "0 1px 2px rgba(0,0,0,0.55)",
  };
  return (
    <g style={{ cursor: "pointer" }} onClick={() => onPick?.(pair, called)}>
      <rect
        x={x}
        y={y}
        width={Math.max(0, width - 1)}
        height={Math.max(0, height - 1)}
        rx={2}
        style={{
          fill: heatPct(pct, 12),
          stroke: called ? "rgb(var(--accent))" : "rgba(0,0,0,0.28)",
          strokeWidth: called ? 2 : 1,
        }}
      />
      {med && (
        <foreignObject x={x} y={y} width={width} height={height} style={{ pointerEvents: "none" }}>
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              padding: 2,
              overflow: "hidden",
              boxSizing: "border-box",
            }}
          >
            {big && <CoinLogo pair={pair} size={logo} />}
            <span style={{ ...label, fontSize: big ? 12.5 : 10.5 }}>{sym}</span>
            <span
              style={{
                ...label,
                fontWeight: 600,
                fontFamily: "ui-monospace, monospace",
                fontSize: big ? 12 : 9.5,
              }}
            >
              {pct >= 0 ? "+" : ""}
              {Number(pct).toFixed(1)}%
            </span>
          </div>
        </foreignObject>
      )}
      {med && (
        <text
          x={x + 4}
          y={y + 11}
          fill="rgba(255,255,255,0.7)"
          fontSize={8.5}
          fontFamily="ui-monospace, monospace"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
        >
          ×{eventCount}
        </text>
      )}
      {called && med && (
        <text
          x={x + width - 4}
          y={y + 11}
          textAnchor="end"
          fill="#F0B90B"
          fontSize={8}
          fontWeight={800}
          fontFamily="ui-monospace, monospace"
          letterSpacing="0.06em"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.65)" }}
        >
          CALL
        </text>
      )}
    </g>
  );
}

// Packed treemap (size = activity, color = direction) — recharts Treemap.
function HeatTreemap({ data, height, onPick }) {
  const nodes = useMemo(
    () =>
      (data || []).map((c) => {
        const upAbs = Math.abs(c.max_up || 0);
        const downAbs = Math.abs(c.max_down || 0);
        const pct = upAbs >= downAbs ? c.max_up || 0 : c.max_down || 0;
        const ev = Math.max(1, c.event_count || 1);
        return {
          name: c.pair,
          pair: c.pair,
          size: 3 + Math.pow(ev, 0.8),
          pct,
          isBull: pct >= 0,
          eventCount: ev,
          called: !!c.called,
        };
      }),
    [data]
  );

  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload || {};
    if (!d.name) return null;
    return (
      <div className="rounded-md border border-ink/10 bg-surface-raised/95 px-3 py-2 text-[11px] shadow-xl">
        <div className="font-medium text-text-primary mb-0.5">
          {stripQuote(d.name)} {d.called && <span className="text-accent">· CALL</span>}
        </div>
        <div
          className="font-mono font-semibold"
          style={{ color: d.isBull ? "#0ECB81" : "#F6465D" }}
        >
          {d.pct >= 0 ? "+" : ""}
          {Number(d.pct).toFixed(2)}%
        </div>
        <div className="font-mono text-text-muted">{d.eventCount} events</div>
      </div>
    );
  };

  if (nodes.length === 0)
    return (
      <div
        className="flex items-center justify-center text-text-muted/50 text-xs font-mono uppercase tracking-[0.15em]"
        style={{ height }}
      >
        No activity yet
      </div>
    );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap
        data={nodes}
        dataKey="size"
        aspectRatio={4 / 3}
        stroke="transparent"
        isAnimationActive={false}
        content={<HeatCell onPick={onPick} />}
      >
        <RTooltip content={<Tip />} />
      </Treemap>
    </ResponsiveContainer>
  );
}

const HeatmapPanel = ({ heatmap, _selectedCoin, onSelect, sortMode, onSortChange }) => {
  const [expanded, setExpanded] = useState(false);
  usePulseFullscreen(expanded, setExpanded);
  const statusCtx = useSignalStatus();
  const calledMap = statusCtx?.map;

  const withCalled = useMemo(
    () =>
      (heatmap || []).map((c) => ({
        ...c,
        called: !!(calledMap && calledMap[(c.pair || "").toUpperCase()]),
      })),
    [heatmap, calledMap]
  );
  const inlineData = withCalled.slice(0, 48);

  const pick = (pair, called) => {
    if (called && statusCtx?.openPair) statusCtx.openPair(pair);
    else onSelect(pair);
  };

  const SortToggle = ({ big = false }) => (
    <div className="flex rounded-md border border-ink/[0.1] bg-surface-secondary p-0.5">
      {["events", "pct"].map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onSortChange(k)}
          className={`${big ? "px-2.5 py-1 text-[10px]" : "px-2 py-0.5 text-[9px]"} rounded-sm font-semibold uppercase tracking-[0.12em] transition-colors ${
            sortMode === k ? "bg-accent text-accent-fg" : "text-text-muted hover:text-text-primary"
          }`}
        >
          {k === "events" ? "Events" : "% Change"}
        </button>
      ))}
    </div>
  );

  const Legend = () => (
    <div className="mt-3 flex items-center justify-between border-t border-ink/[0.07] pt-2 font-mono text-[9px] text-text-muted">
      <span className="uppercase tracking-[0.12em]">
        Size = activity · Color = direction
        {statusCtx?.entitled ? (
          <>
            {" · "}
            <span className="font-semibold text-accent">yellow border = call</span>
          </>
        ) : null}
      </span>
      <div className="flex items-center gap-2.5">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-profit" /> bull
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-loss" /> bear
        </span>
      </div>
    </div>
  );

  return (
    <>
      <PanelShell>
        <PanelHeader
          title="Heatmap"
          subtitle="1h"
          right={
            <div className="flex items-center gap-1.5">
              <SortToggle />
              <FullscreenToggleBtn active={false} onClick={() => setExpanded(true)} />
            </div>
          }
        />
        <HeatTreemap data={inlineData} height={392} onPick={pick} />
        <Legend />
      </PanelShell>

      {expanded &&
        createPortal(
          <div
            className="mp-panel-fullscreen lq-below-header fixed inset-0 z-[100000] flex flex-col bg-surface p-2 sm:p-3"
            role="dialog"
            aria-modal="true"
            aria-label="Heatmap fullscreen"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-ink/[0.1] bg-surface-raised p-3 shadow-2xl sm:p-4">
              <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-text-primary">
                    Heatmap
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted">
                    {withCalled.length} coins · 1h
                  </span>
                  <span className="hidden font-mono text-[9px] uppercase tracking-[0.14em] text-accent sm:inline">
                    Fullscreen · Esc
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <SortToggle big />
                  <FullscreenToggleBtn active onClick={() => setExpanded(false)} />
                </div>
              </div>
              <div className="min-h-0 flex-1">
                <HeatTreemap data={withCalled} height="100%" onPick={pick} />
              </div>
              <div className="pb-[env(safe-area-inset-bottom)] sm:pb-0">
                <Legend />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

// ════════════════════════════════════════════════════════
// SIDEBAR PANEL SHELL (Flowscan card pattern)
// ════════════════════════════════════════════════════════

const PanelShell = ({ children, className = "" }) => (
  <div
    className={`flex h-full flex-col overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised p-3.5 ${className}`}
  >
    <div className="relative z-10 flex h-full flex-col">{children}</div>
  </div>
);

const PanelHeader = ({ title, subtitle, right, icon }) => (
  <div className="mb-3 flex flex-shrink-0 items-center justify-between gap-2">
    <div className="flex min-w-0 items-center gap-2">
      {icon && <span className="text-text-muted">{icon}</span>}
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-primary">
        {title}
      </h3>
      {subtitle && (
        <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
          {subtitle}
        </span>
      )}
    </div>
    {right && <div className="flex-shrink-0">{right}</div>}
  </div>
);

// ── Most Active Panel ───────────────────────────────────
const MostActivePanel = ({ movers, period, setPeriod, histograms, onSelect }) => (
  <PanelShell>
    <PanelHeader
      title="Most Active"
      right={
        <div className="flex gap-0.5 rounded-md border border-ink/[0.1] bg-surface-secondary p-0.5">
          {["1h", "4h", "24h"].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider transition-colors ${
                period === p
                  ? "bg-accent text-accent-fg"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      }
    />
    <div className="space-y-px">
      {(movers || []).slice(0, 6).map((coin, i) => {
        const symbol = stripQuote(coin.pair);
        const strongIsUp = (coin.best || 0) >= Math.abs(coin.worst || 0);
        const hist = histograms[coin.pair];
        return (
          <button
            key={coin.pair}
            onClick={() => onSelect(coin.pair)}
            className="w-full grid grid-cols-[14px_22px_minmax(0,1fr)_auto] items-center gap-2 py-1.5 px-1 rounded-sm hover:bg-ink/[0.025] transition-colors text-left border-b border-ink/[0.03] last:border-b-0"
          >
            <span className="text-[9px] text-text-muted text-center font-mono tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <CoinLogo pair={coin.pair} size={22} />
            <div className="min-w-0">
              <p className="text-text-primary text-[11px] font-medium truncate leading-tight flex items-center gap-1.5 tracking-tight">
                {symbol}
                <span className="text-[9px] text-text-muted/50 font-mono font-normal tabular-nums">
                  {coin.event_count} ev
                </span>
              </p>
              {hist && hist.length >= 1 && (
                <div className="mt-1">
                  <MiniSparkbar histogram={hist} height={7} gap={1.5} />
                </div>
              )}
            </div>
            <span
              className={`text-[11px] font-mono tabular-nums font-medium text-right ${
                strongIsUp ? "text-profit" : "text-loss"
              }`}
            >
              {strongIsUp ? `+${coin.best}%` : `${coin.worst}%`}
            </span>
          </button>
        );
      })}
      {(!movers || movers.length === 0) && (
        <p className="text-text-muted/50 text-[10px] text-center py-3 font-mono uppercase tracking-[0.15em]">
          No active coins yet
        </p>
      )}
    </div>
  </PanelShell>
);

// ── Flash Moves Panel ───────────────────────────────────
const FlashMovesPanel = ({ moves, onSelect }) => (
  <PanelShell>
    <PanelHeader
      title="Flash Moves"
      icon={<IconBolt className="h-3 w-3" />}
      right={
        <span className="text-[9px] font-mono tabular-nums text-text-muted">
          {(moves || []).length} active
        </span>
      }
    />
    <div className="space-y-px">
      {(moves || []).slice(0, 5).map((fm, i) => {
        const symbol = stripQuote(fm.pair);
        const opacity = Math.max(1 - (i / Math.max((moves || []).length, 1)) * 0.4, 0.55);
        return (
          <button
            key={i}
            onClick={() => onSelect(fm.pair)}
            className="w-full grid grid-cols-[18px_minmax(0,1fr)_auto_auto] items-center gap-2 py-1.5 px-1 rounded-sm hover:bg-ink/[0.025] transition-colors text-left border-b border-ink/[0.03] last:border-b-0"
            style={{ opacity }}
          >
            <CoinLogo pair={fm.pair} size={18} />
            <span className="text-text-primary text-[11px] font-medium truncate tracking-tight">
              {symbol}
            </span>
            <span
              className={`text-[11px] font-mono tabular-nums font-medium ${
                fm.pct_change >= 0 ? "text-profit" : "text-loss"
              }`}
            >
              {fm.pct_change >= 0 ? "+" : ""}
              {fm.pct_change}%
            </span>
            <span className="text-text-muted text-[9px] font-mono tabular-nums w-7 text-right">
              {fm.move_seconds}s
            </span>
          </button>
        );
      })}
      {(!moves || moves.length === 0) && (
        <p className="text-text-muted/50 text-[10px] text-center py-3 font-mono uppercase tracking-[0.15em]">
          No flash moves yet
        </p>
      )}
    </div>
  </PanelShell>
);

// ── 24h Summary Panel ───────────────────────────────────
const SummaryPanel = ({ daily, className = "" }) => {
  const total = daily?.total_events || 0;
  const bull = daily?.bullish || 0;
  const bear = daily?.bearish || 0;
  const flash = daily?.flash_moves || 0;
  const bullPct = total > 0 ? Math.round((bull / (bull + bear || 1)) * 100) : 50;
  return (
    <PanelShell className={className}>
      <PanelHeader
        title="24h Summary"
        right={
          <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted">
            Rolling
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-1.5">
        <SummaryCell label="Events" value={daily?.total_events} accent="white" />
        <SummaryCell label="Coins" value={daily?.unique_coins} accent="white" />
        <SummaryCell label="Bullish" value={daily?.bullish} accent="emerald" />
        <SummaryCell label="Bearish" value={daily?.bearish} accent="red" />
      </div>

      {bull + bear > 0 && (
        <div className="mt-2">
          <div className="h-1 rounded-full overflow-hidden bg-ink/[0.04] flex">
            <div className="bg-profit" style={{ width: `${bullPct}%` }} />
            <div className="bg-loss" style={{ width: `${100 - bullPct}%` }} />
          </div>
          <div className="flex justify-between mt-1.5 font-mono tabular-nums">
            <span className="text-[9px] text-profit">{bullPct}% bull</span>
            <span className="text-[9px] text-loss">{100 - bullPct}% bear</span>
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between rounded-md border border-ink/[0.08] bg-surface-secondary p-2.5">
        <div>
          <div className="text-[18px] font-semibold tabular-nums leading-none tracking-tight text-text-primary">
            {flash.toLocaleString()}
          </div>
          <div className="mt-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Flash Moves
          </div>
        </div>
        <IconBolt className="h-4 w-4 text-accent" />
      </div>
    </PanelShell>
  );
};

const SummaryCell = ({ label, value, accent }) => {
  const valueColor =
    accent === "emerald" || accent === "profit"
      ? "text-profit"
      : accent === "red" || accent === "loss"
        ? "text-loss"
        : "text-text-primary";
  return (
    <div className="rounded-md border border-ink/[0.08] bg-surface-secondary p-2.5">
      <div
        className={`text-[18px] font-semibold tabular-nums leading-none tracking-tight ${valueColor}`}
      >
        {(value || 0).toLocaleString()}
      </div>
      <div className="mt-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
        {label}
      </div>
    </div>
  );
};

// ── Feed Skeleton ───────────────────────────────────────
const FeedSkeleton = () => (
  <div className="lqsk-group space-y-0">
    <ShimmerStyles />
    {[...Array(8)].map((_, i) => (
      <div
        key={i}
        className="px-4 py-2.5 flex items-center gap-3 border-b border-ink/[0.03]"
        style={{ opacity: 1 - i * 0.1 }}
      >
        <div className="w-[26px] h-[26px] rounded-full bg-ink/[0.04]" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 bg-ink/[0.04] rounded-sm w-1/3" />
          <div className="h-2 bg-ink/[0.03] rounded-sm w-1/2" />
        </div>
        <div className="w-16 h-5 bg-ink/[0.04] rounded-sm" />
      </div>
    ))}
  </div>
);

// ════════════════════════════════════════════════════════
// COIN CHART MODAL — TradingView embed (logic identical, UI redesigned)
// ════════════════════════════════════════════════════════

const CoinChartModal = ({ pair, onClose, outcome = null }) => {
  const symbol = stripQuote(pair);
  const tvSymbol = `BINANCE:${pair}.P`;
  const statusCtx = useSignalStatus();
  const entitled = !!statusCtx?.entitled;
  const callInfo = statusCtx?.map?.[(pair || "").toUpperCase()];
  const stMeta = callInfo
    ? STATUS_META[(callInfo.status || "open").toLowerCase()] || STATUS_META.open
    : null;

  const [tvInterval, setTvInterval] = useState("60");
  const [metrics, setMetrics] = useState({
    ticker: null,
    funding: null,
    openInterest: null,
    ratio: null,
  });
  const [isClosing, setIsClosing] = useState(false);
  // Expanded fullscreen also unlocks richer TV chrome (one control, not two)
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem("mp_chart_expanded") === "1";
    } catch {
      return false;
    }
  });

  const tvContainerRef = useRef(null);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("mp_chart_expanded", next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);

  const openFullTradingView = useCallback(() => {
    const url = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [tvSymbol]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 180);
  }, [onClose]);

  const switchToSignal = useCallback(() => {
    // Keep chart open underneath; signal sheet is higher z-index
    statusCtx?.openPair?.(pair);
  }, [statusCtx, pair]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (statusCtx?.modalPair) return; // let signal sheet handle Esc first
        handleClose();
      }
      if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey) {
        const tag = (e.target?.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea") return;
        toggleExpanded();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose, toggleExpanded, statusCtx?.modalPair]);

  // Fetch metrics — IDENTICAL logic (external Binance/Bybit public APIs,
  // tidak melalui backend kita, jadi tetap pakai fetch() biasa)
  useEffect(() => {
    let cancelled = false;
    setMetrics({ ticker: null, funding: null, openInterest: null, ratio: null });

    const setMetric = (key, value) => {
      if (cancelled) return;
      setMetrics((m) => ({ ...m, [key]: value }));
    };

    const fetchTicker = async () => {
      const sources = [
        `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${pair}`,
        `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`,
      ];
      for (const url of sources) {
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const d = await r.json();
          setMetric("ticker", {
            last: parseFloat(d.lastPrice),
            high: parseFloat(d.highPrice),
            low: parseFloat(d.lowPrice),
            volume: parseFloat(d.quoteVolume || d.volume || 0),
            changePct: parseFloat(d.priceChangePercent),
          });
          return;
        } catch {}
      }
      for (const cat of ["linear", "spot"]) {
        try {
          const r = await fetch(
            `https://api.bybit.com/v5/market/tickers?category=${cat}&symbol=${pair}`
          );
          if (!r.ok) continue;
          const j = await r.json();
          const t = j?.result?.list?.[0];
          if (!t) continue;
          setMetric("ticker", {
            last: parseFloat(t.lastPrice),
            high: parseFloat(t.highPrice24h),
            low: parseFloat(t.lowPrice24h),
            volume: parseFloat(t.turnover24h || 0),
            changePct: parseFloat(t.price24hPcnt) * 100,
          });
          return;
        } catch {}
      }
    };

    const fetchFunding = async () => {
      try {
        const r = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${pair}`);
        if (r.ok) {
          const d = await r.json();
          if (d?.lastFundingRate != null) {
            setMetric("funding", {
              rate: parseFloat(d.lastFundingRate),
              nextTime: parseInt(d.nextFundingTime),
            });
            return;
          }
        }
      } catch {}
      try {
        const r = await fetch(
          `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${pair}`
        );
        if (r.ok) {
          const j = await r.json();
          const t = j?.result?.list?.[0];
          if (t?.fundingRate != null && t?.nextFundingTime != null) {
            setMetric("funding", {
              rate: parseFloat(t.fundingRate),
              nextTime: parseInt(t.nextFundingTime),
            });
          }
        }
      } catch {}
    };

    const fetchOI = async () => {
      try {
        const r = await fetch(
          `https://fapi.binance.com/futures/data/openInterestHist?symbol=${pair}&period=1h&limit=24`
        );
        if (!r.ok) return;
        const d = await r.json();
        if (!Array.isArray(d) || d.length === 0) return;
        const latest = d[d.length - 1];
        const oldest = d[0];
        const current = parseFloat(latest.sumOpenInterestValue || 0);
        const prev = parseFloat(oldest.sumOpenInterestValue || 0);
        const changePct = prev > 0 ? ((current - prev) / prev) * 100 : 0;
        setMetric("openInterest", { current, changePct });
      } catch {}
    };

    const fetchRatio = async () => {
      try {
        const r = await fetch(
          `https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${pair}&period=1h&limit=1`
        );
        if (!r.ok) return;
        const d = await r.json();
        if (!Array.isArray(d) || d.length === 0) return;
        const item = d[0];
        setMetric("ratio", {
          longPct: parseFloat(item.longAccount) * 100,
          shortPct: parseFloat(item.shortAccount) * 100,
          r: parseFloat(item.longShortRatio),
        });
      } catch {}
    };

    fetchTicker();
    fetchFunding();
    fetchOI();
    fetchRatio();

    return () => {
      cancelled = true;
    };
  }, [pair]);

  // Remount TV when theme flips so dark/bright palette always matches desk
  const [appTheme, setAppTheme] = useState(getActiveTheme);
  useEffect(() => subscribeTheme(setAppTheme), []);

  // Mount TradingView — theme-aware; full desk unlocks TV chrome
  useEffect(() => {
    const container = tvContainerRef.current;
    if (!container) return;
    const tv = getTradingViewTheme(appTheme);
    container.style.background = tv.backgroundColor;
    return mountTradingViewEmbed(container, {
      theme: appTheme,
      symbol: tvSymbol,
      interval: tvInterval,
      studies: ["STD;EMA"],
      save_image: false,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      withdateranges: !!expanded,
      details: !!expanded,
      allow_symbol_change: !!expanded,
      hotlist: false,
      calendar: false,
    });
  }, [tvSymbol, tvInterval, appTheme, expanded]);

  const last = metrics.ticker?.last;
  const change = metrics.ticker?.changePct;
  const isPos = (change ?? 0) >= 0;

  const intervals = [
    { v: "15", l: "15m" },
    { v: "60", l: "1H" },
    { v: "240", l: "4H" },
    { v: "D", l: "1D" },
  ];

  const tvFullUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;

  const modalContent = (
    <div
      className={`lq-modal-safe lq-scrim-bg fixed inset-0 z-[100000] flex justify-center ${
        isClosing
          ? "animate-[mpfade-out_.18s_ease-in_forwards]"
          : "animate-[mpfade-in_.22s_ease-out]"
      } ${
        // The hand-tuned `sm:pt-[72px]` that used to sit here is gone: it was a
        // second, stale copy of the header clearance, and .lq-modal-safe now
        // supplies the measured one.
        expanded ? "items-stretch p-0" : "items-end sm:items-start sm:px-6 md:px-8 sm:pb-6"
      }`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${symbol} chart`}
    >
      {/* Mobile: bottom sheet. Desktop: centered panel. Expanded: true fullscreen. */}
      <div
        className={`relative flex w-full flex-col overflow-hidden bg-surface-raised min-h-0 ${
          isClosing
            ? "animate-[mpsheet-out_.2s_ease-in_forwards] sm:animate-[mppanel-out_.18s_ease-in_forwards]"
            : "animate-[mpsheet-in_.3s_cubic-bezier(.16,1,.3,1)] sm:animate-[mppanel-in_.28s_cubic-bezier(.16,1,.3,1)]"
        } ${
          expanded
            ? "h-[100dvh] max-h-[100dvh] max-w-none rounded-none border-0 shadow-none sm:h-[100dvh] sm:max-h-[100dvh] sm:rounded-none"
            : "h-[min(var(--lq-modal-maxh),100%)] max-h-[var(--lq-modal-maxh)] max-w-[1180px] rounded-t-3xl border-t border-ink/10 shadow-[0_-12px_40px_rgb(var(--scrim)/0.35)] sm:h-[var(--lq-modal-maxh)] sm:max-h-[min(var(--lq-modal-maxh),920px)] sm:rounded-2xl sm:border sm:border-ink/[0.08] sm:shadow-[0_24px_80px_-12px_rgb(var(--scrim)/0.8)]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab handle — mobile only (hidden when expanded) */}
        {!expanded && (
          <div className="flex justify-center pt-2.5 pb-0.5 sm:hidden shrink-0" aria-hidden="true">
            <div className="h-1 w-10 rounded-full bg-ink/20" />
          </div>
        )}

        {/* Top accent line — desktop */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 hidden h-px bg-ink/[0.08] sm:block"
        />

        {/* Header */}
        <div className="px-4 sm:px-5 py-2.5 sm:py-3 border-b border-ink/[0.06] flex items-center justify-between gap-3 bg-ink/[0.015] flex-shrink-0 relative z-10">
          <div className="flex items-center gap-3 min-w-0">
            <CoinLogo pair={pair} size={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-text-primary text-base sm:text-lg font-semibold leading-none tracking-tight">
                  {symbol}
                </span>
                <span className="text-text-muted text-[10px] font-mono tabular-nums">{pair}</span>
                {callInfo && stMeta && (
                  <span
                    className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em]"
                    style={{
                      color: stMeta.color,
                      borderColor: `color-mix(in srgb, ${stMeta.color} 35%, transparent)`,
                      background: `color-mix(in srgb, ${stMeta.color} 12%, transparent)`,
                    }}
                    title={stMeta.desc}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: stMeta.color }}
                    />
                    {stMeta.label}
                    {callInfo.created ? ` · ${signalTimeAgo(callInfo.created) || ""}` : ""}
                  </span>
                )}
                {!callInfo && outcome && (
                  <OutcomeBadge
                    outcome={outcome}
                    onClick={(e) => {
                      e.stopPropagation();
                      switchToSignal();
                    }}
                  />
                )}
              </div>
              <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
                <span className="text-text-primary font-mono tabular-nums text-sm sm:text-base font-semibold leading-none tracking-tight">
                  {last != null ? `$${formatPrice(last)}` : "—"}
                </span>
                {change != null && (
                  <span
                    className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-sm border flex items-center gap-0.5 ${
                      isPos
                        ? "bg-profit/[0.08] text-profit border-profit/20"
                        : "bg-loss/[0.08] text-loss border-loss/20"
                    }`}
                  >
                    {isPos ? <IconArrowUpTri /> : <IconArrowDownTri />}
                    {isPos ? "+" : ""}
                    {change.toFixed(2)}%
                  </span>
                )}
                <span className="text-[9px] text-text-muted font-mono uppercase tracking-[0.15em]">
                  24h
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1.5">
            {callInfo && (
              <SwitchToSignalButton
                size="md"
                onClick={switchToSignal}
                className="hidden xs:inline-flex sm:inline-flex"
              />
            )}
            <button
              type="button"
              onClick={toggleExpanded}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-ink/12 bg-surface-secondary text-text-secondary transition-colors hover:border-ink/25 hover:text-text-primary"
              aria-label={expanded ? "Exit fullscreen" : "Expand fullscreen"}
              title={expanded ? "Exit fullscreen (F)" : "Expand fullscreen (F)"}
            >
              {expanded ? <IconCollapse /> : <IconExpand />}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-ink/12 bg-surface-secondary text-text-secondary transition-colors hover:border-ink/25 hover:text-text-primary"
              aria-label="Close"
            >
              <IconClose />
            </button>
          </div>
        </div>

        {/* Mobile Switch CTA when called — full width under header */}
        {callInfo && (
          <div className="flex sm:hidden shrink-0 border-b border-ink/[0.05] px-4 py-2 bg-accent/[0.04]">
            <SwitchToSignalButton size="md" onClick={switchToSignal} className="w-full justify-center" />
          </div>
        )}

        {/* Free teaser: plan already hit TP3/TP4 on this pair */}
        {!callInfo && outcome && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-accent/15 bg-accent/[0.06] px-4 py-2 sm:px-5">
            <p className="text-[11px] text-text-secondary">
              <span className="font-semibold text-accent">
                LuxQuant plan reached {outcome.label || "TP3+"}
              </span>
              {outcome.peak_pct != null ? (
                <span className="font-mono text-profit">
                  {" "}
                  · {Number(outcome.peak_pct) >= 0 ? "+" : ""}
                  {Number(outcome.peak_pct).toFixed(1)}%
                </span>
              ) : null}
              {outcome.hours_to_hit != null ? (
                <span className="text-text-muted"> · {outcome.hours_to_hit}h after call</span>
              ) : null}
              {!entitled ? (
                <span className="text-text-muted"> — unlock for entry → TP path</span>
              ) : null}
            </p>
            <button
              type="button"
              onClick={switchToSignal}
              className="inline-flex h-7 items-center rounded-md bg-accent px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-fg"
            >
              {entitled ? "Open signal" : "Unlock full plan"}
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="px-4 sm:px-5 py-2 border-b border-ink/[0.04] flex items-center justify-between gap-3 bg-ink/[0.01] flex-shrink-0 flex-wrap relative z-10">
          <div className="flex items-center gap-0.5 rounded-md border border-ink/[0.1] bg-surface-secondary p-0.5">
            {intervals.map((it) => (
              <button
                key={it.v}
                onClick={() => setTvInterval(it.v)}
                className={`px-2.5 py-1 rounded-sm text-[10px] font-medium uppercase tracking-[0.12em] transition-all ${
                  tvInterval === it.v
                    ? "bg-accent text-accent-fg"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {it.l}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={openFullTradingView}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-ink/[0.1] bg-surface-secondary text-text-muted transition-colors hover:border-accent/35 hover:text-accent"
            title="Open on TradingView.com"
            aria-label="Open on TradingView.com"
          >
            <IconExternal className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Chart — Flowscan chart-surface bg */}
        <div className="relative flex-1 min-h-0 min-w-0 bg-surface border-y border-ink/[0.04] shadow-[inset_0_2px_6px_-2px_rgb(var(--scrim) / 0.35)]">
          <div ref={tvContainerRef} className="w-full h-full" />
        </div>

        {/* Metrics footer — 4 cells */}
        <div className="border-t border-ink/[0.06] bg-ink/[0.015] px-4 sm:px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 flex-shrink-0 relative z-10">
          <Metric24h ticker={metrics.ticker} />
          <MetricFunding funding={metrics.funding} />
          <MetricOI oi={metrics.openInterest} />
          <MetricLS ratio={metrics.ratio} />
        </div>

        {/* Region-block fallback note — glowing VPN hint */}
        <div className="relative z-10 flex-shrink-0 overflow-hidden border-t border-ink/[0.07] bg-surface-secondary px-4 py-2 sm:px-5">
          <p className="flex items-center justify-center gap-1.5 font-mono text-[9px] leading-relaxed text-text-muted sm:justify-start">
            <svg
              className="h-3 w-3 flex-shrink-0 text-accent"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2 4 5v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V5l-8-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span className="text-center sm:text-left">
              Metrics above are pulled from Binance/Bybit. If they show "—", the data may be blocked
              in your region —{" "}
              <span className="font-semibold text-text-secondary">
                try enabling a VPN and reopening
              </span>
              .
            </span>
          </p>
        </div>

        <div className="px-4 sm:px-5 py-2 border-t border-ink/[0.04] flex items-center justify-between text-[9px] font-mono text-text-muted bg-ink/[0.01] flex-shrink-0 relative z-10 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-2">
          <span className="uppercase tracking-[0.15em]">
            Chart · TradingView · Metrics · Binance Futures
            {callInfo ? " · Called" : ""}
          </span>
          <span className="hidden uppercase tracking-[0.15em] sm:inline">
            {expanded ? "F exit full · " : "F expand · "}ESC close
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

// ════════════════════════════════════════════════════════
// METRIC CELLS — flat hairline pattern
// ════════════════════════════════════════════════════════

const MetricCellShell = ({ label, children }) => (
  <div className="flex min-h-[64px] flex-col justify-between rounded-md border border-ink/[0.08] bg-surface-secondary px-2.5 py-2">
    <p className="text-text-muted text-[9px] uppercase tracking-[0.18em] font-mono">{label}</p>
    {children}
  </div>
);

const Metric24h = ({ ticker }) => {
  if (!ticker) {
    return (
      <MetricCellShell label="24h Change">
        <p className="text-sm font-mono font-medium tabular-nums text-text-muted leading-none mt-1">
          —
        </p>
        <p className="text-[9px] text-text-muted/30 font-mono mt-1 leading-tight uppercase tracking-wider">
          high / low
        </p>
      </MetricCellShell>
    );
  }
  const isPos = ticker.changePct >= 0;
  return (
    <MetricCellShell label="24h Change">
      <p
        className={`text-sm font-mono font-medium tabular-nums leading-none mt-1 flex items-center gap-1 ${
          isPos ? "text-profit" : "text-loss"
        }`}
      >
        {isPos ? <IconArrowUpTri /> : <IconArrowDownTri />}
        {isPos ? "+" : ""}
        {ticker.changePct.toFixed(2)}%
      </p>
      <p className="text-[9px] text-text-muted font-mono mt-1 leading-tight tabular-nums">
        H ${formatPrice(ticker.high)} · L ${formatPrice(ticker.low)}
      </p>
    </MetricCellShell>
  );
};

const MetricFunding = ({ funding }) => {
  if (!funding) {
    return (
      <MetricCellShell label="Funding · perp">
        <p className="text-sm font-mono font-medium tabular-nums text-text-muted leading-none mt-1">
          —
        </p>
        <p className="text-[9px] text-text-muted/30 font-mono mt-1 leading-tight uppercase tracking-wider">
          spot only
        </p>
      </MetricCellShell>
    );
  }
  const ratePct = funding.rate * 100;
  const isPos = ratePct >= 0;
  const msToNext = Math.max(0, funding.nextTime - Date.now());
  const hrs = Math.floor(msToNext / 3600000);
  const mins = Math.floor((msToNext % 3600000) / 60000);
  return (
    <MetricCellShell label="Funding · perp">
      <p
        className={`text-sm font-mono font-medium tabular-nums leading-none mt-1 ${
          isPos ? "text-profit" : "text-loss"
        }`}
      >
        {isPos ? "+" : ""}
        {ratePct.toFixed(4)}%
      </p>
      <p className="text-[9px] text-text-muted font-mono mt-1 leading-tight tabular-nums">
        {isPos ? "longs pay" : "shorts pay"} · in {hrs}h {mins}m
      </p>
    </MetricCellShell>
  );
};

const MetricOI = ({ oi }) => {
  if (!oi) {
    return (
      <MetricCellShell label="Open Interest">
        <p className="text-sm font-mono font-medium tabular-nums text-text-muted leading-none mt-1">
          —
        </p>
        <p className="text-[9px] text-text-muted/30 font-mono mt-1 leading-tight uppercase tracking-wider">
          24h change
        </p>
      </MetricCellShell>
    );
  }
  const isPos = oi.changePct >= 0;
  return (
    <MetricCellShell label="Open Interest">
      <p className="text-sm font-mono font-medium tabular-nums text-text-primary leading-none mt-1">
        ${formatVolume(oi.current)}
      </p>
      <p
        className={`text-[9px] font-mono mt-1 leading-tight tabular-nums flex items-center gap-0.5 ${
          isPos ? "text-profit" : "text-loss"
        }`}
      >
        {isPos ? <IconArrowUpTri /> : <IconArrowDownTri />}
        {Math.abs(oi.changePct).toFixed(2)}% · 24h
      </p>
    </MetricCellShell>
  );
};

const MetricLS = ({ ratio }) => {
  if (!ratio) {
    return (
      <MetricCellShell label="L/S · top traders">
        <p className="text-sm font-mono font-medium tabular-nums text-text-muted leading-none mt-1">
          —
        </p>
        <div className="h-1 mt-2 rounded-full bg-ink/[0.04]" />
      </MetricCellShell>
    );
  }
  return (
    <MetricCellShell label="L/S · top traders">
      <p className="text-sm font-mono font-medium tabular-nums leading-none mt-1">
        <span className="text-profit">{ratio.longPct.toFixed(0)}%</span>
        <span className="text-text-muted/35 mx-1">/</span>
        <span className="text-loss">{ratio.shortPct.toFixed(0)}%</span>
      </p>
      <div className="h-1 mt-2 rounded-full overflow-hidden bg-ink/[0.04] flex">
        <div className="bg-profit" style={{ width: `${ratio.longPct}%` }} />
        <div className="bg-loss" style={{ width: `${ratio.shortPct}%` }} />
      </div>
    </MetricCellShell>
  );
};

// ════════════════════════════════════════════════════════
// STYLES — CSS animations + responsive grid
// ════════════════════════════════════════════════════════

const PulseStyles = () => (
  <style>{`

 @media (prefers-reduced-motion: reduce) {
 .mp-main-grid { transition: none; }
 }

 @keyframes pulse-tape-scroll {
 0% { transform: translateX(0); }
 100% { transform: translateX(-50%); }
 }
 .animate-pulse-tape {
 animation: pulse-tape-scroll 50s linear infinite;
 }
 .animate-pulse-tape:hover {
 animation-play-state: paused;
 }
 /* Recent Wins marquee — faster than top tape so motion is obvious */
 @keyframes wins-marquee-scroll {
 0% { transform: translate3d(0, 0, 0); }
 100% { transform: translate3d(-50%, 0, 0); }
 }
 .animate-wins-marquee {
 animation: wins-marquee-scroll 28s linear infinite;
 }
 .group\/wins:hover .animate-wins-marquee {
 animation-play-state: paused;
 }
 @media (prefers-reduced-motion: reduce) {
 .animate-pulse-tape,
 .animate-wins-marquee {
 animation: none !important;
 }
 }
 .pulse-feed-scroll::-webkit-scrollbar { width: 5px; }
 .pulse-feed-scroll::-webkit-scrollbar-track { background: transparent; }
 .pulse-feed-scroll::-webkit-scrollbar-thumb { background: rgb(var(--ink) / 0.12); border-radius: 3px; }
 .pulse-feed-scroll::-webkit-scrollbar-thumb:hover { background: rgb(var(--ink) / 0.22); }

 /* Modal animations */
 @keyframes mpfade-in { from { opacity: 0; } to { opacity: 1; } }
 @keyframes mpfade-out { from { opacity: 1; } to { opacity: 0; } }
 @keyframes mppanel-in {
 from { opacity: 0; transform: translateY(20px) scale(.98); }
 to { opacity: 1; transform: translateY(0) scale(1); }
 }
 @keyframes mppanel-out {
 from { opacity: 1; transform: translateY(0) scale(1); }
 to { opacity: 0; transform: translateY(20px) scale(.98); }
 }
 /* Mobile bottom-sheet (Top Gainers Filters grammar) */
 @keyframes mpsheet-in {
 from { opacity: 1; transform: translateY(100%); }
 to { opacity: 1; transform: translateY(0); }
 }
 @keyframes mpsheet-out {
 from { opacity: 1; transform: translateY(0); }
 to { opacity: 1; transform: translateY(100%); }
 }
 @media (prefers-reduced-motion: reduce) {
 .animate-\\[mpsheet-in_\\.3s_cubic-bezier\\(\\.16\\,1\\,\\.3\\,1\\)\\],
 .animate-\\[mpsheet-out_\\.2s_ease-in_forwards\\] {
 animation: none !important;
 }
 }

 /* Split feed (Pumps | Dumps) */
 .mp-split-grid {
 display: grid;
 grid-template-columns: 1fr 1fr;
 gap: 1px;
 background: rgb(var(--ink) / 0.05);
 }
 .mp-split-col {
 display: flex;
 flex-direction: column;
 min-height: 0;
 /* Theme-aware well — never hard black on bright */
 background: rgb(var(--surface-secondary));
 overflow: hidden;
 }
 [data-theme="luxquant"] .mp-split-col,
 [data-theme="dark"] .mp-split-col {
 background: rgb(var(--surface));
 }
 @media (max-width: 620px) {
 .mp-split-grid { grid-template-columns: 1fr; }
 }

 /* Equal-height main grid */
 .mp-main-grid {
 display: grid;
 grid-template-columns: 1fr;
 gap: 12px;
 }
 .mp-side-slot { min-width: 0; }
 .mp-sidebar-rail { display: none; }
 @media (min-width: 1024px) {
 .mp-main-grid {
 grid-template-columns: minmax(0, 2.35fr) minmax(240px, 0.9fr);
 align-items: stretch;
 min-height: min(78vh, 820px);
 transition: grid-template-columns .28s cubic-bezier(.4, 0, .2, 1);
 }
 .mp-main-grid.mp-sidebar-collapsed {
 grid-template-columns: minmax(0, 1fr) 40px;
 }
 .mp-side-slot { position: relative; min-height: 0; }
 .mp-main-grid.mp-sidebar-collapsed .mp-sidebar-col { display: none; }
 .mp-main-grid.mp-sidebar-collapsed .mp-sidebar-rail {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: flex-start;
 gap: 14px;
 padding: 12px 0;
 position: absolute;
 inset: 0;
 cursor: pointer;
 }
 .mp-rail-label {
 writing-mode: vertical-rl;
 transform: rotate(180deg);
 white-space: nowrap;
 }
 .mp-feed-col {
 position: relative;
 min-height: 0;
 }
 .mp-feed-card {
 position: absolute;
 inset: 0;
 display: flex;
 flex-direction: column;
 min-height: 0;
 }
 .mp-feed-list {
 flex: 1;
 overflow-y: auto;
 min-height: 0;
 }
 .mp-split-grid {
 flex: 1;
 min-height: 0;
 }
 /* Activity Feed / panel true fullscreen (TradingView-style desk) */
 .mp-panel-fullscreen .mp-feed-list,
 .mp-panel-fullscreen .mp-feed-body-full {
 flex: 1 1 auto;
 max-height: none !important;
 min-height: 0;
 height: 100%;
 }
 .mp-panel-fullscreen .mp-split-grid {
 flex: 1 1 auto;
 min-height: 0;
 height: 100%;
 }
 .mp-panel-fullscreen .mp-split-col {
 min-height: 0;
 height: 100%;
 }
 .mp-sidebar-col {
 display: flex;
 flex-direction: column;
 gap: 10px;
 }
 .mp-sidebar-stretch {
 flex: 0 0 auto;
 display: flex;
 flex-direction: column;
 }
 }
 @media (max-width: 1023px) {
 .mp-feed-col, .mp-sidebar-col { display: block; }
 .mp-sidebar-col > * + * { margin-top: 10px; }
 .mp-feed-list { max-height: min(70vh, 640px); overflow-y: auto; }
 }
 @media (min-width: 1024px) {
 .mp-feed-list { min-height: 0; }
 }
 `}</style>
);
