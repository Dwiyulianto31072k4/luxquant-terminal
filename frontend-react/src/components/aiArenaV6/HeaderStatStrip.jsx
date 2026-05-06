// frontend-react/src/components/aiArenaV6/HeaderStatStrip.jsx
//
// Header Stat Strip v3 — 5 unique stats with Live BTC
// =================================================================
// v3 changes:
//   - Add Live BTC cell (5th column) with verdict-time delta
//   - Polls /api/v1/market/btc-ticker every 3s (pauses when tab hidden)
//   - Backend caches 15s — most polls hit Redis cache, server load minimal
//   - Shows current price + 24h % + delta vs verdict-time price
//   - Live pulse indicator
//
// Snapshot semantics preserved:
//   - VerdictHero shows verdict-time BTC price (frozen at AI thinking time)
//   - This strip's Live BTC cell shows current reality + drift since verdict
//   - User can judge if AI verdict is still relevant
//
// Fields displayed:
//   1. Fear & Greed       ← data.report.bg_snapshot_summary['fear-greed'].value
//   2. Confluence         ← data.report.confluence (strength + counts)
//   3. AI Verdict         ← data.critique_decision (top-level)
//   4. Pipeline           ← data.generated_in_seconds (top-level)
//   5. Live BTC           ← /api/v1/market/btc-ticker (polled every 3s)

import { useEffect, useState, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";
const POLL_INTERVAL_MS = 3_000; // 3s — sweet spot vs backend 15s cache

// ── Helpers ───────────────────────────────────────────
const fmtSec = (s) => {
  if (s == null || isNaN(s)) return "—";
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${(s / 60).toFixed(1)}m`;
};

const fmtPrice = (p) => {
  if (p == null || isNaN(p)) return "—";
  return `$${p.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

const fmtPct = (pct, decimals = 2) => {
  if (pct == null || isNaN(pct)) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(decimals)}%`;
};

// ── Fear & Greed ──────────────────────────────────────
const fgColor = (v) => {
  if (v == null) return "text-text-muted";
  if (v <= 24) return "text-red-400";
  if (v <= 49) return "text-orange-400";
  if (v <= 54) return "text-amber-300";
  if (v <= 74) return "text-green-300";
  return "text-green-400";
};

const fgLabel = (v) => {
  if (v == null) return "—";
  if (v <= 24) return "Extreme Fear";
  if (v <= 49) return "Fear";
  if (v <= 54) return "Neutral";
  if (v <= 74) return "Greed";
  return "Extreme Greed";
};

// ── Confluence ────────────────────────────────────────
const confluenceColor = (strength) => {
  const s = (strength || "").toUpperCase();
  if (s === "STRONG") return "text-green-400";
  if (s === "MODERATE") return "text-amber-300";
  if (s === "WEAK") return "text-orange-400";
  if (s === "MIXED") return "text-text-muted";
  return "text-white";
};

// ── Critique decision ────────────────────────────────
const critiqueColor = (decision) => {
  switch (decision) {
    case "approved":
      return "text-green-400";
    case "approved_with_caveat":
      return "text-amber-300";
    case "needs_revision":
      return "text-red-400";
    default:
      return "text-text-muted";
  }
};

const critiqueLabel = (decision) => {
  switch (decision) {
    case "approved":
      return "Approved ✓";
    case "approved_with_caveat":
      return "Caveat ⚠";
    case "needs_revision":
      return "Revise ⟳";
    default:
      return "—";
  }
};

const critiqueSubLabel = (decision) => {
  switch (decision) {
    case "approved":
      return "no caveats";
    case "approved_with_caveat":
      return "with caveat";
    case "needs_revision":
      return "needs revision";
    default:
      return "—";
  }
};

// ── Live BTC hook ────────────────────────────────────
function useLiveBtcPrice() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);
  const abortRef = useRef(null);

  const fetchPrice = async () => {
    // Skip if tab hidden — save bandwidth
    if (typeof document !== "undefined" && document.hidden) return;

    try {
      // Cancel any in-flight request
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      const res = await fetch(`${API_BASE}/api/v1/market/btc-ticker`, {
        credentials: "include",
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      // Silent fail — keep last data
      if (e.name !== "AbortError") {
        console.warn("[live-btc] fetch failed:", e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrice();
    intervalRef.current = setInterval(fetchPrice, POLL_INTERVAL_MS);

    // Resume polling when tab becomes visible
    const onVisible = () => {
      if (!document.hidden) fetchPrice();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (abortRef.current) abortRef.current.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading };
}

// ── Stat Cell ────────────────────────────────────────
const StatCell = ({ label, value, sublabel, valueClass = "text-white", mono = true, livePulse = false }) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <div className="text-[8.5px] uppercase tracking-[0.15em] text-text-muted font-bold leading-tight flex items-center gap-1.5">
      {label}
      {livePulse && (
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        </span>
      )}
    </div>
    <div
      className={`${
        mono ? "font-mono" : ""
      } text-sm font-bold leading-tight truncate ${valueClass}`}
    >
      {value}
    </div>
    {sublabel && (
      <div className="text-[9px] text-text-muted/80 truncate leading-tight">
        {sublabel}
      </div>
    )}
  </div>
);

// ── Main ─────────────────────────────────────────────
export default function HeaderStatStrip({ data }) {
  const { data: liveBtc } = useLiveBtcPrice();

  if (!data) return null;

  const cells = [];

  // 1. Fear & Greed
  const fgRaw = data?.report?.bg_snapshot_summary?.["fear-greed"];
  const fgVal = fgRaw?.value;
  const fgNum = fgVal != null ? Number(fgVal) : null;
  if (fgNum != null && !isNaN(fgNum)) {
    cells.push({
      key: "fg",
      label: "Fear & Greed",
      value: Math.round(fgNum).toString(),
      sublabel: fgLabel(fgNum),
      valueClass: fgColor(fgNum),
    });
  }

  // 2. Confluence
  const conf = data?.report?.confluence;
  if (conf) {
    const bull = conf.bullish_count ?? 0;
    const bear = conf.bearish_count ?? 0;
    const neut = conf.neutral_count ?? 0;
    const strength = conf.strength || "—";
    cells.push({
      key: "conf",
      label: "Confluence",
      value: strength,
      sublabel: `${bull}↑ ${bear}↓ ${neut}→`,
      valueClass: confluenceColor(strength),
      mono: false,
    });
  }

  // 3. AI Verdict (Critique)
  const decision = data?.critique_decision;
  if (decision) {
    cells.push({
      key: "critique",
      label: "AI Verdict",
      value: critiqueLabel(decision),
      sublabel: critiqueSubLabel(decision),
      valueClass: critiqueColor(decision),
      mono: false,
    });
  }

  // 4. Pipeline runtime
  const genSec = data?.generated_in_seconds;
  if (genSec != null && !isNaN(genSec)) {
    cells.push({
      key: "gen",
      label: "Pipeline",
      value: fmtSec(genSec),
      sublabel: "AI runtime",
      valueClass: "text-gold-primary",
    });
  }

  // 5. Live BTC (NEW) — current price + 24h change + delta vs verdict
  if (liveBtc?.price != null) {
    const verdictPrice = data?.btc_price;
    const livePrice = liveBtc.price;
    const change24h = liveBtc.price_change_pct;

    // Delta vs verdict-time price
    let deltaPart = null;
    if (verdictPrice != null && !isNaN(verdictPrice) && verdictPrice > 0) {
      const deltaPct = ((livePrice - verdictPrice) / verdictPrice) * 100;
      const deltaColor = deltaPct >= 0 ? "text-green-400" : "text-red-400";
      deltaPart = { pct: deltaPct, color: deltaColor };
    }

    // Sub-row: 24h change + verdict delta combined
    const change24hSign = (change24h ?? 0) >= 0 ? "▲" : "▼";
    const change24hColor = (change24h ?? 0) >= 0 ? "text-green-400" : "text-red-400";

    // Determine value color based on 24h direction
    const valueColor = (change24h ?? 0) >= 0 ? "text-green-300" : "text-red-300";

    cells.push({
      key: "live-btc",
      label: "Live BTC",
      value: fmtPrice(livePrice),
      sublabel: null, // we'll render custom JSX below
      valueClass: valueColor,
      livePulse: true,
      // Custom subContent — gets rendered specially
      _customSub: (
        <div className="flex items-center gap-1.5 text-[9px] font-mono leading-tight whitespace-nowrap overflow-hidden">
          <span className={change24hColor}>
            {change24hSign} {fmtPct(change24h)}
          </span>
          {deltaPart && (
            <>
              <span className="text-text-muted/40">·</span>
              <span className={deltaPart.color} title="vs AI verdict price">
                {fmtPct(deltaPart.pct)} vs verdict
              </span>
            </>
          )}
        </div>
      ),
    });
  }

  if (cells.length === 0) return null;

  return (
    <div className="glass-card rounded-xl border border-gold-primary/10 px-4 py-3">
      <div
        className="grid gap-x-4 gap-y-3"
        style={{
          gridTemplateColumns: `repeat(${Math.min(cells.length, 5)}, minmax(0, 1fr))`,
        }}
      >
        {cells.map((c) => (
          <div key={c.key} className="flex flex-col gap-0.5 min-w-0">
            <div className="text-[8.5px] uppercase tracking-[0.15em] text-text-muted font-bold leading-tight flex items-center gap-1.5">
              {c.label}
              {c.livePulse && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              )}
            </div>
            <div
              className={`${
                c.mono !== false ? "font-mono" : ""
              } text-sm font-bold leading-tight truncate ${c.valueClass}`}
            >
              {c.value}
            </div>
            {c._customSub ? (
              c._customSub
            ) : c.sublabel ? (
              <div className="text-[9px] text-text-muted/80 truncate leading-tight">
                {c.sublabel}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
