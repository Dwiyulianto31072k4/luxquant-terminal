import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import CoinLogo from "./CoinLogo";
import SignalJourneyExtended from "./SignalJourneyExtended";
import SignalModal from "./SignalModal";
import { ShimmerStyles } from "./ui/Loaders";
import { getActiveTheme, getTradingViewTheme, subscribeTheme } from "../utils/themeColors";
import { RangeDumbbell, RowSpark } from "./market/rowPrimitives";
import Segmented from "./ui/Segmented";
import { buildProofJourneyEvents } from "../utils/journeyEvents";
import { useAuth } from "../context/AuthContext";
import { isEntitled } from "../utils/entitlement";
import { trackGrowth } from "../utils/growthAnalytics";
import { watchlistApi } from "../services/watchlistApi";
import { requestTelegramWriteAccess } from "../utils/telegramWriteAccess";

const API_BASE = "/api/v1";

/** Highest published target the call reached, 1-4, or null when unknown.
 *
 * No new API field: the PnL card is rendered at the TP that fired, so its
 * filename carries the level (..._tp4_20260918_172929.png). deriveChartWithCard
 * below already reads the same marker. */
const tpLevel = (item) => {
  // max_tp is the best level across EVERY call on the pair. The chart filename
  // only knows the peak call's level, which understates a pair whose later
  // calls got further — TAKE showed TP3 while two of its three calls hit TP4.
  const best = Number(item?.max_tp);
  if (best >= 1 && best <= 4) return best;
  // Fastest Hits rows are a different shape: the level arrives as "TP 2".
  const lvl = /tp\s*(\d)/i.exec(item?.tp_level || "");
  if (lvl) {
    const n = Number(lvl[1]);
    if (n >= 1 && n <= 4) return n;
  }
  const m = /_tp(\d)_/i.exec(item?.latest_chart_url || "");
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 4 ? n : null;
};

/** TP1-TP4 as four rungs, filled to the one that was reached. */
const TargetLadder = ({ level }) => {
  if (!level) return <span className="text-[11px] text-text-muted">—</span>;
  return (
    <div
      className="flex items-center gap-1.5"
      title={`Reached TP${level} of the 4 published targets`}
    >
      <div className="flex items-center gap-[3px]">
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className={`h-[9px] w-[5px] rounded-[1px] ${
              n <= level ? "bg-positive" : "bg-ink/[0.12]"
            }`}
          />
        ))}
      </div>
      <span className="font-mono text-[11px] tabular-nums text-text-secondary">TP{level}</span>
    </div>
  );
};

/** Decorative separator between two facts. Screen readers skip it. */
const Sep = () => (
  <span className="px-[3px] text-text-muted/70" aria-hidden="true">
    ·
  </span>
);

/** What a screen reader announces for a row, as one sentence. */
const rowLabel = (item, level, symbol) => {
  const parts = [symbol];
  const day = callDay(item.signal_time);
  if (day) parts.push(`called ${day}`);
  if ((item.signal_count || 1) > 1) parts.push(`first of ${item.signal_count} calls`);
  if (level) parts.push(`reached TP${level}`);
  parts.push(`peak gain ${(item.gain_pct || 0) >= 0 ? "plus " : "minus "}${Math.abs(item.gain_pct || 0).toFixed(2)} percent`);
  return `${parts.join(", ")}. Open call proof.`;
};

const deriveChartWithCard = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  if (!/_tp[234]_/i.test(rawUrl)) return null;
  if (/_with_card|_combined/i.test(rawUrl)) return null;
  return rawUrl.replace(/\.png$/i, "_with_card.png");
};

const TopPerformers = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [category, setCategory] = useState("gains"); // MEXC-style category chips
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSignalIds, setModalSignalIds] = useState([]);
  const [modalIndex, setModalIndex] = useState(0);
  const [modalItem, setModalItem] = useState(null);
  const [signalDetail, setSignalDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const proofAutoOpened = useRef(false);

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
  // Depends on t(), so it cannot leave the component — memoised instead so its
  // identity only changes when the language does.
  const presets = useMemo(
    () => [
      { key: "1d", label: t("top.d1"), short: "1D", days: 1 },
      { key: "3d", label: "3D", short: "3D", days: 3 },
      { key: "7d", label: t("top.d7"), short: "1W", days: 7 },
      { key: "30d", label: t("top.d30"), short: "1M", days: 30 },
      { key: "custom", label: t("top.custom"), short: "Custom", days: null },
    ],
    [t]
  );

  const CATEGORIES = [
    { key: "gains", label: "Biggest Gains", short: "Gains" },
    { key: "fastest", label: "Fastest Hits", short: "Fast" },
    { key: "recent", label: "Most Recent", short: "Recent" },
    { key: "multi", label: "Multi-Calls", short: "Multi" },
  ];

  const displayed = useMemo(() => {
    if (!data) return [];
    if (category === "fastest") return data.fastest_hits || [];
    let arr = [...(data.top_gainers || [])];
    if (category === "recent")
      arr = arr.sort((a, b) => new Date(b.signal_time || 0) - new Date(a.signal_time || 0));
    if (category === "multi") arr = arr.filter((x) => (x.signal_count || 1) > 1);
    return arr;
  }, [data, category]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API_BASE}/signals/top-performers?limit=10`;
      if (activeFilter === "custom" && customFrom && customTo)
        url += `&date_from=${customFrom}&date_to=${customTo}`;
      else if (activeFilter !== "custom") {
        const p = presets.find((p) => p.key === activeFilter);
        url += `&days=${p?.days || 7}`;
      } else {
        setLoading(false);
        return;
      }
      const res = await fetch(url);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("Top performers fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [activeFilter, customFrom, customTo, presets]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeFilter === "custom") return;
    const iv = setInterval(fetchData, 60000);
    return () => clearInterval(iv);
  }, [activeFilter, fetchData]);

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
    setDetailLoading(true);
    setSignalDetail(null);
    try {
      const token = localStorage.getItem("access_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const r = await fetch(`${API_BASE}/signals/detail/${sid}`, { headers });
      if (r.ok) setSignalDetail(await r.json());
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleItemClick = (item) => {
    if (!item.signal_id) return;
    const ids = item.all_signal_ids?.length > 0 ? item.all_signal_ids : [item.signal_id];
    const bi = ids.indexOf(item.signal_id);
    setModalSignalIds(ids);
    setModalIndex(bi >= 0 ? bi : 0);
    setModalItem(item);
    setModalOpen(true);
    fetchDetail(item.signal_id);
  };

  // A first-session activation route should deliver the proof it promised,
  // not stop one click short at a leaderboard. Only the explicit onboarding
  // query auto-opens; ordinary Performance visits remain unchanged.
  useEffect(() => {
    if (proofAutoOpened.current || !location.search.includes("onboarding=proof")) return;
    const first = displayed[0];
    if (!first?.signal_id) return;
    proofAutoOpened.current = true;
    handleItemClick(first);
    // handleItemClick intentionally follows the current rendered cohort.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayed, location.search]);

  const goToSignal = (i) => {
    if (i >= 0 && i < modalSignalIds.length) {
      setModalIndex(i);
      fetchDetail(modalSignalIds[i]);
    }
  };
  const closeModal = () => {
    setModalOpen(false);
    setModalSignalIds([]);
    setModalIndex(0);
    setModalItem(null);
    setSignalDetail(null);
  };
  const handlePresetClick = (k) => {
    if (k === "custom") {
      setShowCustom(true);
      setActiveFilter("custom");
    } else {
      setShowCustom(false);
      setActiveFilter(k);
    }
  };
  const handleCustomApply = () => {
    if (customFrom && customTo) fetchData();
  };

  const cleanPair = (p) => (p ? p.replace(/^3A/, "").replace(/USDT$/i, "") + "USDT" : "???");
  const coinSymbol = (p) => (p ? p.replace(/^3A/, "").replace(/USDT$/i, "") : "???");

  // Format period — renders the start and end dates on their own aligned edges.
  const splitPeriodRange = (period) => {
    if (!period || typeof period !== "string") return { from: "", to: "" };
    const parts = period.trim().split(/\s+(?:-|–|—)\s+/);
    if (parts.length < 2) return { from: period.trim(), to: "" };
    return {
      from: parts[0].trim(),
      to: parts.slice(1).join(" — ").trim(),
    };
  };

  const periodRange = splitPeriodRange(data?.period);

  if (loading && !data) {
    return (
      <div className="relative">
        <ShimmerStyles />
        {/* Same shell as the loaded state: header outside, table card below. */}
        <div className="lqsk-group">
          <div className="h-5 w-40 rounded-md bg-ink/[0.05]" />
          <div className="mt-2 h-3 w-64 rounded bg-ink/[0.03]" />
          <div className="mt-2 h-2.5 w-48 rounded bg-ink/[0.03]" />
          <div className="mt-5 overflow-hidden rounded-xl border border-ink/[0.06] bg-surface-raised lg:mt-7">
            <div className="flex items-center justify-between gap-3 border-b border-ink/[0.06] px-4 py-3">
              <div className="flex gap-1.5">
                {[24, 20, 22, 18].map((w, i) => (
                  <div key={i} className="h-6 rounded-full bg-ink/[0.04]" style={{ width: `${w * 4}px` }} />
                ))}
              </div>
              <div className="h-7 w-44 rounded-lg bg-ink/[0.04]" />
            </div>
            {[...Array(8)].map((_, j) => (
              <div key={j} className="flex items-center gap-3 border-b border-ink/[0.04] px-4 py-3 last:border-0">
                <div className="h-3.5 w-4 shrink-0 rounded bg-ink/[0.04]" />
                <div className="h-6 w-6 shrink-0 rounded-full bg-ink/[0.05]" />
                <div className="h-3.5 w-24 rounded bg-ink/[0.05]" />
                <div className="ml-auto hidden h-3.5 w-20 rounded bg-ink/[0.03] sm:block" />
                <div className="hidden h-6 w-[88px] rounded bg-ink/[0.03] sm:block" />
                <div className="hidden h-6 w-[140px] rounded bg-ink/[0.03] md:block" />
                <div className="h-3.5 w-16 shrink-0 rounded bg-ink/[0.05]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Uniform rank — Gate style, no top-3 medals
  const rankBadge = (rank) => (
    <span className="inline-flex w-5 shrink-0 justify-center font-mono text-[12px] tabular-nums text-text-muted sm:w-6">
      {rank}
    </span>
  );

  const resultCount = displayed.length;
  // Fastest Hits measures a different event: the first target, not the peak.
  // Its columns carry the same numbers about a different thing, so they say so.
  const fastest = category === "fastest";

  return (
    <div className="relative">
      {/* Section header, outside the card — the same shape Crypto Market Data
          uses further down the page, so Home reads as one table stack instead
          of one card with its title inside and one with its title above. */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold leading-none tracking-tight text-text-primary sm:text-xl">
            LuxQuant Calls
          </h2>
          {resultCount > 0 && (
            <span className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-text-muted">
              {resultCount}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
          Resolved signal leaderboard. Open a row for the call proof.
          {data?.total_tp_hits ? (
            <>
              {" "}
              <span className="text-text-secondary">
                {data.total_tp_hits.toLocaleString("en-US")} targets hit across{" "}
                {data.unique_pairs?.toLocaleString("en-US")} pairs in this window.
              </span>
            </>
          ) : null}
        </p>
        {periodRange.from ? (
          <p className="mt-1 font-mono text-[11.5px] tabular-nums text-text-muted/75">
            {periodRange.from}
            {periodRange.to ? ` – ${periodRange.to}` : ""}
          </p>
        ) : null}
      </div>

      {/* Same gap the page puts between the Crypto Market Data header and its
          table (space-y-5 / lg:space-y-7), so both sections sit alike. */}
      <div className="mt-5 rounded-xl border border-ink/[0.06] bg-surface-raised lg:mt-7">
        {/* View chips + range selector, exactly the market table's controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/[0.06] px-4 py-3">
          <Segmented
            ariaLabel="What to show"
            value={category}
            onChange={setCategory}
            options={CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
          />
          <Segmented
            ariaLabel="Time range"
            mono
            value={activeFilter}
            onChange={handlePresetClick}
            options={presets.map(({ key, short, label }) => ({
              value: key,
              label: short || label,
              hint: short && label !== short ? label : undefined,
            }))}
          />
        </div>

        {showCustom && (
          <div className="grid grid-cols-2 gap-2 border-b border-ink/[0.06] px-4 py-3 sm:flex sm:flex-wrap sm:items-end">
            <label className="flex min-w-0 flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
                {t("top.from")}
              </span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-ink/10 bg-surface-raised px-2.5 py-1.5 font-mono text-[11px] text-text-primary focus:border-ink/25 focus:outline-none"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
                {t("top.to")}
              </span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-ink/10 bg-surface-raised px-2.5 py-1.5 font-mono text-[11px] text-text-primary focus:border-ink/25 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={handleCustomApply}
              disabled={!customFrom || !customTo}
              className="col-span-2 rounded-lg border border-ink/12 bg-ink/[0.06] py-2 text-[11px] font-semibold text-text-primary transition hover:bg-ink/[0.1] disabled:opacity-30 sm:col-span-1 sm:ml-auto sm:px-5"
            >
              {t("top.apply")}
            </button>
          </div>
        )}

        {data && (!data.top_gainers || data.top_gainers.length === 0) && (
          <div className="py-14 text-center">
            <p className="text-[13px] text-text-muted">{t("top.no_tp")}</p>
          </div>
        )}

        {data && data.top_gainers?.length > 0 && (
          <div className={loading ? "opacity-50 transition-opacity" : ""}>
            {showProofHint && !modalOpen && (
              <div
                role="status"
                aria-live="polite"
                className={`flex items-center gap-2.5 overflow-hidden border-b border-ink/[0.06] bg-ink/[0.02] px-4 transition-all duration-400 ${
                  isProofHintClosing
                    ? "max-h-0 py-0 opacity-0"
                    : "max-h-20 py-2 opacity-100 animate-[proofHintIn_.28s_ease-out]"
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink/[0.05] text-text-muted">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                    <path d="M12 4.25c-5.1 0-9.24 3.36-10.85 7.3a1.2 1.2 0 0 0 0 .9c1.61 3.94 5.75 7.3 10.85 7.3s9.24-3.36 10.85-7.3a1.2 1.2 0 0 0 0-.9C21.24 7.61 17.1 4.25 12 4.25Zm0 11.2a3.75 3.75 0 1 1 0-7.5 3.75 3.75 0 0 1 0 7.5Zm0-2.05a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z" />
                  </svg>
                </span>
                <p className="min-w-0 flex-1 text-[12px] leading-snug text-text-muted">
                  <span className="font-medium text-text-primary">Call proof</span>
                  {" — open any row for the original call, targets, and charts."}
                </p>
              </div>
            )}

            {/* Desktop table — the market table's shape, with the call's own
                columns: where it was called, the path it took, and how far the
                coin still sits inside that entry-to-peak range today. */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[920px] border-collapse">
                <thead>
                  <tr className="border-b border-ink/[0.06] text-text-muted">
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium">#</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium">Token</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium">Path</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium">
                      {fastest ? "Entry → Target" : "Entry → Peak"}
                    </th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium">
                      {fastest ? "Time to hit" : "Time to peak"}
                    </th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium">Targets hit</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-medium">
                      {fastest ? "Gain at TP" : "Peak Gain"}
                    </th>
                    <th className="w-6 px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((item, idx) => {
                    const rank = idx + 1;
                    const gainUp = (item.gain_pct || 0) >= 0;
                    const multi = (item.signal_count || 1) > 1;
                    return (
                      <tr
                        key={`${item.signal_id || item.pair}-${idx}`}
                        role="button"
                        tabIndex={0}
                        aria-label={rowLabel(item, tpLevel(item), coinSymbol(item.pair))}
                        onClick={() => handleItemClick(item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleItemClick(item);
                          }
                        }}
                        style={{ animationDelay: `${Math.min(idx * 16, 160)}ms` }}
                        className="tp-row group cursor-pointer border-b border-ink/[0.04] transition-colors last:border-0 hover:bg-ink/[0.02] focus-visible:bg-ink/[0.03] focus-visible:outline-none"
                      >
                        <td className="px-4 py-3 font-mono text-[12px] tabular-nums text-text-muted">
                          {rank}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <CoinLogo pair={cleanPair(item.pair)} size={24} />
                            <div className="leading-tight">
                              <div className="text-[13px] font-medium text-text-primary">
                                {coinSymbol(item.pair)}
                                <span className="text-text-muted">/USDT</span>
                              </div>
                              <div className="text-[10.5px] font-normal leading-tight text-text-muted">
                                {callDay(item.signal_time)}
                                {/* Nothing for a single call: a table should not
                                    spell out its own default on every row. */}
                                {multi ? (
                                  <>
                                    <Sep />
                                    {`1st of ${item.signal_count} calls`}
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <SinceCallSpark item={item} />
                        </td>
                        <td className="px-3 py-3">
                          <RangeDumbbell low={item.entry} high={item.tp_price} width={140} variant="span" />
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-[12px] tabular-nums text-text-muted">
                          {item.duration_display}
                        </td>
                        <td className="px-3 py-3">
                          <TargetLadder level={tpLevel(item)} />
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-mono text-[13px] tabular-nums ${
                            gainUp ? "text-profit" : "text-loss"
                          }`}
                        >
                          {gainUp ? "+" : ""}
                          {formatGainDisplay(item.gain_pct)}
                        </td>
                        <td className="px-3 py-3 text-right text-text-muted/35 transition-colors group-hover:text-text-muted">
                          <svg
                            className="ml-auto h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5l7 7-7 7" />
                          </svg>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Phone: a leaderboard, not an analysis. One identity on the
                left, one number on the right, and nothing else competing for
                attention — the path, the range and the entry are all one tap
                away in the call proof, at a size where they can be read. */}
            <div className="divide-y divide-ink/[0.04] sm:hidden">
              {displayed.map((item, idx) => {
                const gainUp = (item.gain_pct || 0) >= 0;
                const level = tpLevel(item);
                return (
                  <div
                    key={`${item.signal_id || item.pair}-m-${idx}`}
                    role="button"
                    tabIndex={0}
                    aria-label={rowLabel(item, level, coinSymbol(item.pair))}
                    onClick={() => handleItemClick(item)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleItemClick(item);
                      }
                    }}
                    style={{ animationDelay: `${Math.min(idx * 16, 160)}ms` }}
                    className="tp-row flex items-center gap-3 px-4 py-3 transition-colors active:bg-ink/[0.04]"
                  >
                    {rankBadge(idx + 1)}
                    <CoinLogo pair={cleanPair(item.pair)} size={28} />
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="truncate text-[14px] font-semibold text-text-primary">
                        {coinSymbol(item.pair)}
                      </div>
                      {/* One sentence, the proof first: "Hit TP4 on 18 Sept".
                          It survives a 320px screen with the longest symbol on
                          the board, which the "Called 18 Sept, hit TP4" order
                          did not — that one truncated away the TP. */}
                      <div className="truncate text-[11px] font-normal text-text-muted">
                        {level
                          ? `Hit TP${level} on ${callDay(item.signal_time)}`
                          : `Called ${callDay(item.signal_time)}`}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-[14px] font-medium tabular-nums ${
                        gainUp ? "text-profit" : "text-loss"
                      }`}
                    >
                      {gainUp ? "+" : ""}
                      {formatGainDisplay(item.gain_pct)}
                    </span>
                  </div>
                );
              })}
            </div>

            {displayed.length === 0 && (
              <div className="px-4 py-12 text-center">
                <p className="text-[13px] text-text-muted">{t("top.no_data")}</p>
              </div>
            )}

            {displayed.length > 0 && (
              <div className="flex items-center justify-between gap-3 border-t border-ink/[0.06] px-4 py-3">
                <p className="text-[11px] text-text-muted">
                  Tap a row to open call proof
                  <span className="hidden sm:inline">
                    {" · targets are the published TP levels for that call"}
                  </span>
                </p>
                <p className="font-mono text-[11px] tabular-nums text-text-muted">
                  {resultCount} listed
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
 @keyframes tpRowIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
 .tp-row { animation: tpRowIn 0.28s ease-out both; }
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
        onSwitchSignal={(s) => setHistoryModalSignal(s)}
        initialTab="history"
      />
    </div>
  );
};

// === SPARK — the call\'s price path, call -> peak ===
// Drawn by the shared RowSpark so this table and Crypto Market Data agree on
// what a price line looks like. The series is closing prices, so it can end
// below the peak in the Gain column: the peak is an intraday high.
const _sparkCache = {};
const sparkSymbol = (p) =>
  (p || "")
    .replace(/^3A/i, "")
    .replace(/USDT$/i, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase() + "USDT";
// Mirrors _spark_interval / SPARK_POINTS in backend/app/api/routes/signals.py:
// pick the finest interval that fits the span in ~80 bars, keep 40 points.
const SPARK_POINTS = 40;
const _spIntervals = [
  ["1m", 60, "1"],
  ["5m", 300, "5"],
  ["15m", 900, "15"],
  ["30m", 1800, "30"],
  ["1h", 3600, "60"],
  ["2h", 7200, "120"],
  ["4h", 14400, "240"],
  ["6h", 21600, "360"],
  ["12h", 43200, "720"],
  ["1d", 86400, "D"],
];
const _spPick = (sec) => _spIntervals.find(([, s]) => sec / s <= 80) || _spIntervals[_spIntervals.length - 1];
const _spBin = (sec) => _spPick(sec)[0];
const _spBybit = (sec) => _spPick(sec)[2];
// Thin to n points but KEEP the maximum: the peak bar is the one the row is
// about, and stride sampling can drop it, leaving the line short of the gain
// printed beside it. Mirrors _downsample in the backend.
const _dsp = (arr, n = SPARK_POINTS) => {
  if (!arr || arr.length < 2) return null;
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const out = Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
  let peakAt = 0;
  for (let i = 1; i < arr.length; i += 1) if (arr[i] > arr[peakAt]) peakAt = i;
  const slot = Math.min(n - 1, Math.floor(peakAt / step));
  out[slot] = Math.max(out[slot], arr[peakAt]);
  return out;
};

async function fetchSinceCall(item) {
  const symbol = sparkSymbol(item.pair);
  const start = item.signal_time ? new Date(item.signal_time).getTime() : NaN;
  if (!start || isNaN(start)) return null;
  const end = item.hit_time ? new Date(item.hit_time).getTime() : Date.now();
  const span = Math.max((end - start) / 1000, 60);
  const bi = _spBin(span);
  const urls = [
    `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${bi}&startTime=${start}&endTime=${end}&limit=100`,
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${bi}&startTime=${start}&endTime=${end}&limit=100`,
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d) && d.length >= 2) return _dsp(d.map((c) => parseFloat(c[2])));
      }
    } catch {
      /* try next */
    }
  }
  try {
    const r = await fetch(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${_spBybit(span)}&start=${start}&end=${end}&limit=100`
    );
    if (r.ok) {
      const j = await r.json();
      const list = (j?.result?.list || []).map((k) => parseFloat(k[2])).reverse();
      if (list.length >= 2) return _dsp(list);
    }
  } catch {
    /* give up */
  }
  return null;
}

const SinceCallSpark = ({ item, compact = false }) => {
  const [pts, setPts] = useState(
    Array.isArray(item.sparkline) && item.sparkline.length > 1 ? item.sparkline : null
  );
  useEffect(() => {
    if (Array.isArray(item.sparkline) && item.sparkline.length > 1) {
      setPts(item.sparkline);
      return;
    }
    const key = item.signal_id || item.pair;
    if (_sparkCache[key]) {
      setPts(_sparkCache[key]);
      return;
    }
    let alive = true;
    fetchSinceCall(item).then((d) => {
      if (alive && d) {
        _sparkCache[key] = d;
        setPts(d);
      }
    });
    return () => {
      alive = false;
    };
  }, [item.signal_id, item.pair, item.sparkline]);
  // Same line the market table draws below it — thin stroke, no area fill.
  // Same reason as the server: the path starts where the call was made.
  const entry = Number(item.entry);
  const series =
    pts && entry > 0 && pts[0] !== entry ? [entry, ...pts] : pts;
  return (
    <RowSpark
      points={series}
      up={(item.gain_pct || 0) >= 0}
      w={compact ? 44 : 88}
      h={compact ? 20 : 26}
    />
  );
};

function formatDuration(s) {
  if (!s || s <= 0) return "N/A";
  const d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = Math.floor(s % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
/** "18 Sep" — the day the call went out, under its entry price. */
function callDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatPrice(p) {
  if (!p || p <= 0) return "0.00";
  if (p >= 1000)
    return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(6);
  return p.toFixed(8);
}
function formatGainDisplay(pct) {
  if (pct >= 10000) return (pct / 1000).toFixed(1) + "K%";
  if (pct >= 1000) return pct.toFixed(0) + "%";
  return pct.toFixed(2) + "%";
}

// ================================================================
// SIGNAL DETAIL MODAL — logic intact, presentation redesigned
// ================================================================

export const SignalDetailModal = ({
  item,
  detail,
  loading,
  signalIds,
  currentIndex,
  onNavigate,
  onClose,
  cleanPair,
  t,
  onOpenHistory,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEntitledUser = isEntitled(user);
  const [proofWatchlisted, setProofWatchlisted] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [activationNote, setActivationNote] = useState("");
  const [lightboxImg, setLightboxImg] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const [showTV, setShowTV] = useState(false);
  // Coin market high (kline) — secondary context only, never the hero gain
  const [coinHighPrice, setCoinHighPrice] = useState(null);
  const [coinHighIsPostStop, setCoinHighIsPostStop] = useState(false);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const [appTheme, setAppTheme] = useState(getActiveTheme);
  const pair = cleanPair(item.pair || detail?.pair);
  const total = signalIds.length;
  const multi = total > 1;
  const created = detail?.created_at || item.signal_time;

  // Link to LuxQuant's X post. If a per-signal tweet URL is ever stored on the
  // signal (detail.x_post_url), use it directly; otherwise fall back to a live
  // search of LuxQuant's own posts for this coin's cashtag (drives X traffic).
  const X_HANDLE = "luxquantalgo";
  const xCash = (pair || "").replace(/USDT$|USDC$|USD$/i, "");
  const xUrl =
    detail?.x_post_url ||
    `https://x.com/search?q=${encodeURIComponent(`$${xCash} from:${X_HANDLE}`)}&f=live`;

  // Current signal id (respects multi-signal navigation) → full history route.
  const currentSid = (signalIds && signalIds[currentIndex]) || item?.signal_id || detail?.signal_id;
  const historyHref = `/signals?signal=${encodeURIComponent(currentSid || "")}&tab=history`;

  useEffect(() => {
    let alive = true;
    setProofWatchlisted(false);
    setActivationNote("");
    if (!user || !currentSid) return undefined;
    watchlistApi
      .checkInWatchlist(currentSid)
      .then((result) => {
        if (alive) setProofWatchlisted(Boolean(result?.in_watchlist));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [currentSid, user]);

  const armProofValue = async () => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(`/performance?onboarding=proof`)}`);
      return;
    }
    if (!currentSid || proofWatchlisted || watchBusy) return;
    setWatchBusy(true);
    setActivationNote("");
    try {
      await watchlistApi.addToWatchlist(currentSid);
      setProofWatchlisted(true);
      const writeAccess = await requestTelegramWriteAccess({ trigger: "proof_watch_saved" });
      setActivationNote(
        writeAccess.verified
          ? "Saved. Telegram alerts are ready."
          : writeAccess.status === "allowed"
            ? "Saved. Telegram permission is on; your LuxQuant inbox is active."
            : "Saved. Your LuxQuant inbox is active; Telegram can be enabled later."
      );
    } catch {
      setActivationNote("Could not save this call yet. Please try again.");
    } finally {
      setWatchBusy(false);
    }
  };

  // Canonical activation milestone: a logged-in user has actually opened a
  // resolved call, not merely visited the Signals desk. Live/open calls are
  // excluded because they are intelligence, not historical proof yet.
  useEffect(() => {
    const proofStatus = String(detail?.status || item?.status || "").toLowerCase();
    if (!currentSid || !proofStatus || proofStatus === "open") return;
    trackGrowth("proof_verified", {
      source: "signal_detail_modal",
      entity_type: "signal",
      entity_id: currentSid,
      meta: { status: proofStatus },
      once: `proof:${currentSid}`,
    });
  }, [currentSid, detail?.status, item?.status]);

  useEffect(() => {
    setShowTV(false);
    setCoinHighPrice(null);
    setCoinHighIsPostStop(false);
    setJourneyOpen(false);
  }, [currentIndex]);

  // Secondary: coin market high during the *trade window only* (call → last update).
  // Never used as the hero gain — that comes from signal updates.
  useEffect(() => {
    if (!detail?.entry || !created || !pair) return;
    const fetchCoinHigh = async () => {
      try {
        const entryVal = Number(detail.entry);
        const symbol = pair.replace("USDT", "") + "USDT";
        const startTime = new Date(created).getTime();
        if (isNaN(startTime)) return;

        const slUpd = Array.isArray(detail.updates)
          ? detail.updates.find((u) => /sl|stop/i.test(u.update_type || ""))
          : null;
        const slTs = slUpd?.update_at ? Date.parse(slUpd.update_at) : NaN;
        const lastUpd =
          Array.isArray(detail.updates) && detail.updates.length
            ? detail.updates[detail.updates.length - 1]
            : null;
        const lastTs = lastUpd?.update_at ? Date.parse(lastUpd.update_at) : NaN;
        // Cap at last signal event (or SL) — never open-ended to "now"
        const endTime = !Number.isNaN(lastTs) ? lastTs : !Number.isNaN(slTs) ? slTs : Date.now();

        const extractPeak = (candles, gH, gT) => {
          if (!Array.isArray(candles) || candles.length === 0) return null;
          let best = entryVal;
          let bestTs = null;
          candles.forEach((c) => {
            const h = gH(c);
            const ts = gT ? gT(c) : null;
            if (ts != null && ts > endTime) return;
            if (h > best) {
              best = h;
              bestTs = ts;
            }
          });
          return best > entryVal ? { price: best, ts: bestTs } : null;
        };

        const bH = (c) => parseFloat(c[2]);
        const bT = (c) => Number(c[0]);
        const yH = (c) => parseFloat(c.high || c[2]);
        const yT = (c) => Number(c.ts);

        let peak = null;
        const binanceQ = `startTime=${startTime}&endTime=${endTime}&limit=1500`;

        try {
          const r = await fetch(
            `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1h&${binanceQ}`
          );
          if (r.ok) {
            const d = await r.json();
            if (Array.isArray(d) && d.length > 0) peak = extractPeak(d, bH, bT);
          }
        } catch {}
        if (!peak) {
          try {
            const r = await fetch(
              `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&${binanceQ}`
            );
            if (r.ok) {
              const d = await r.json();
              if (Array.isArray(d) && d.length > 0) peak = extractPeak(d, bH, bT);
            }
          } catch {}
        }
        if (!peak) {
          try {
            const r = await fetch(
              `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=60&start=${startTime}&end=${endTime}&limit=1000`
            );
            if (r.ok) {
              const j = await r.json();
              const list = (j?.result?.list || []).map((k) => ({ high: k[2], ts: k[0] }));
              peak = extractPeak(list, yH, yT);
            }
          } catch {}
        }

        if (peak) {
          setCoinHighPrice(peak.price);
          setCoinHighIsPostStop(peak.ts != null && !Number.isNaN(slTs) && peak.ts > slTs);
        }
      } catch (e) {
        console.error("[CoinHigh] failed:", e);
      }
    };
    fetchCoinHigh();
  }, [detail, created, pair]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") {
        if (lightboxImg) setLightboxImg(null);
        else handleClose();
      }
      if (multi && !lightboxImg) {
        if (e.key === "ArrowLeft") onNavigate(currentIndex - 1);
        if (e.key === "ArrowRight") onNavigate(currentIndex + 1);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [handleClose, onNavigate, currentIndex, multi, lightboxImg]);

  const fmtDt = (ts) => {
    if (!ts) return "\u2014";
    try {
      return new Date(ts).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return ts;
    }
  };
  const fmtDiff = (f, t2) => {
    if (!f || !t2) return "\u2014";
    try {
      const d = (new Date(t2) - new Date(f)) / 1000;
      if (d <= 0) return "< 1s";
      const dd = Math.floor(d / 86400),
        hh = Math.floor((d % 86400) / 3600),
        mm = Math.floor((d % 3600) / 60),
        ss = Math.floor(d % 60);
      if (dd > 0) return `${dd}d ${hh}h`;
      if (hh > 0) return `${hh}h ${mm}m`;
      if (mm > 0) return `${mm}m`;
      return `${ss}s`;
    } catch {
      return "\u2014";
    }
  };
  const status = detail?.status?.toLowerCase() || "open";
  const isStopped = ["closed_loss", "sl"].includes(status);
  const sLabel = (s) =>
    ({
      closed_win: "WIN",
      closed_loss: "LOSS",
      tp1: "TP1",
      tp2: "TP2",
      tp3: "TP3",
      tp4: "TP4",
      open: "OPEN",
    })[s?.toLowerCase()] ||
    s?.toUpperCase() ||
    "OPEN";
  const sColor = (s) =>
    s?.toLowerCase() === "closed_win" || s?.toLowerCase().startsWith("tp")
      ? "bg-profit"
      : s?.toLowerCase() === "closed_loss" || s?.toLowerCase() === "sl"
        ? "bg-loss"
        : "bg-accent";

  // Journey theme — adds glow + gradient-stop classes for the redesigned timeline
  const themeColors = {
    gold: {
      text: "text-accent",
      dot: "bg-accent",
      glow: "shadow-accent/30",
      from: "from-accent/70",
      to: "to-accent/70",
    },
    green: {
      text: "text-profit",
      dot: "bg-profit",
      glow: "shadow-profit/60",
      from: "from-profit/70",
      to: "to-profit/70",
    },
    red: {
      text: "text-loss",
      dot: "bg-loss",
      glow: "shadow-loss/60",
      from: "from-loss/70",
      to: "to-loss/70",
    },
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
      const el = document.getElementById("tv_chart_modal_topperf");
      if (!el || !window.TradingView) return;
      el.style.background = tv.backgroundColor;
      widget = new window.TradingView.widget({
        container_id: "tv_chart_modal_topperf",
        autosize: true,
        symbol: `BINANCE:${pair.replace("USDT", "")}USDT.P`,
        interval: "60",
        timezone: "Asia/Jakarta",
        theme: tv.theme,
        style: "1",
        locale: "en",
        toolbar_bg: tv.toolbar_bg,
        enable_publishing: false,
        backgroundColor: tv.backgroundColor,
        gridColor: tv.gridColor,
        hide_top_toolbar: false,
        hide_legend: false,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        save_image: false,
        studies: ["STD;SMA"],
        overrides: {
          "paneProperties.background": tv.backgroundColor,
          "paneProperties.backgroundType": "solid",
          "paneProperties.vertGridProperties.color": tv.gridColor,
          "paneProperties.horzGridProperties.color": tv.gridColor,
          "scalesProperties.textColor": tv.textColor,
          "mainSeriesProperties.candleStyle.upColor": tv.upColor,
          "mainSeriesProperties.candleStyle.downColor": tv.downColor,
          "mainSeriesProperties.candleStyle.borderUpColor": tv.upColor,
          "mainSeriesProperties.candleStyle.borderDownColor": tv.downColor,
          "mainSeriesProperties.candleStyle.wickUpColor": tv.upColor,
          "mainSeriesProperties.candleStyle.wickDownColor": tv.downColor,
        },
      });
    };
    if (!shouldMount) return undefined;
    const tm = setTimeout(() => {
      if (window.TradingView) initTV();
      else {
        const s = document.createElement("script");
        s.src = "https://s3.tradingview.com/tv.js";
        s.async = true;
        s.onload = initTV;
        document.head.appendChild(s);
      }
    }, 100);
    return () => {
      clearTimeout(tm);
      if (widget)
        try {
          widget.remove();
        } catch {}
    };
  }, [pair, hasAnyImg, showInteractiveRight, detail, appTheme]);

  // Journey stepper: hide SL failure chips when the call still hit TP / finished WIN
  // (SL then TP looks like a bug). Label SL1 vs SL2 on real stop-outs.
  const {
    events,
    suppressedSl,
    note: journeyNote,
  } = buildProofJourneyEvents({
    updates: detail?.updates,
    status,
    entry: detail?.entry,
    createdAt: created,
    formatPrice,
    fmtDiff,
    fmtDt,
    labels: {
      called: t("top.called_sig"),
      sl1: t("top.sl1_hit", "SL1 Hit"),
      sl2: t("top.sl2_hit", "SL2 Hit"),
      hit: t("top.hit"),
      entry: t("top.entry"),
    },
  });

  // Derived display — hero gain must match leaderboard / server peak, not only last TP tick.
  // LuxQuant Calls list uses signals.peak_price (→ item.gain_pct / item.tp_price).
  // TP updates alone can stop at TP3 (+4.9%) while peak is +334%.
  const lastUpdate = detail?.updates?.length ? detail.updates[detail.updates.length - 1] : null;
  const durationText = lastUpdate
    ? fmtDiff(created, lastUpdate.update_at)
    : detail
      ? "Active"
      : "—";

  const entryVal =
    detail?.entry > 0 ? Number(detail.entry) : item?.entry > 0 ? Number(item.entry) : 0;

  // Best TP hit from updates (exclude SL) — "realized to plan", not hero peak
  let tpHitPrice = null;
  let tpHitIsSL = false;
  if (Array.isArray(detail?.updates) && entryVal > 0) {
    let bestTp = null;
    let slPrice = null;
    for (const u of detail.updates) {
      const p = Number(u.price);
      if (!(p > 0)) continue;
      const isSL = /sl|stop/i.test(u.update_type || "");
      if (isSL) slPrice = p;
      else if (bestTp == null || p > bestTp) bestTp = p;
    }
    if (isStopped && slPrice != null && bestTp == null) {
      tpHitPrice = slPrice;
      tpHitIsSL = true;
    } else if (bestTp != null) {
      tpHitPrice = bestTp;
    } else if (lastUpdate?.price > 0) {
      tpHitPrice = Number(lastUpdate.price);
      tpHitIsSL = /sl|stop/i.test(lastUpdate.update_type || "");
    }
  }

  const detailPeakPrice = detail?.peak_price > 0 ? Number(detail.peak_price) : null;
  const detailPeakPct =
    detail?.peak_pct != null && !Number.isNaN(Number(detail.peak_pct))
      ? Number(detail.peak_pct)
      : detailPeakPrice && entryVal > 0
        ? ((detailPeakPrice - entryVal) / entryVal) * 100
        : null;

  const itemPeakPrice = item?.tp_price > 0 ? Number(item.tp_price) : null;
  const itemPeakPct =
    item?.gain_pct != null && !Number.isNaN(Number(item.gain_pct)) ? Number(item.gain_pct) : null;

  // Hero = best known peak for this call (server peak → list peak → TP hit)
  // Prefer the larger of detail peak vs item peak when both exist (multi-call row).
  let gainPctNum = null;
  let peakPriceDisplay = null;
  const candidates = [];
  if (detailPeakPct != null) {
    candidates.push({
      pct: detailPeakPct,
      price: detailPeakPrice,
      source: "detail",
    });
  }
  // Item peak only when viewing the leaderboard's primary signal (same id)
  const isPrimaryListSignal =
    !item?.signal_id || !currentSid || String(item.signal_id) === String(currentSid);
  if (isPrimaryListSignal && itemPeakPct != null) {
    candidates.push({
      pct: itemPeakPct,
      price: itemPeakPrice,
      source: "item",
    });
  }
  if (tpHitPrice != null && entryVal > 0) {
    candidates.push({
      pct: ((tpHitPrice - entryVal) / entryVal) * 100,
      price: tpHitPrice,
      source: "tp",
    });
  }
  if (candidates.length) {
    candidates.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    gainPctNum = candidates[0].pct;
    peakPriceDisplay =
      candidates[0].price ?? (entryVal > 0 ? entryVal * (1 + candidates[0].pct / 100) : null);
  }

  const gainHero =
    gainPctNum != null && !Number.isNaN(gainPctNum)
      ? `${gainPctNum >= 0 ? "+" : ""}${Number(gainPctNum).toFixed(1)}%`
      : null;
  const gainIsLoss = isStopped || tpHitIsSL || (gainPctNum != null && gainPctNum < 0);

  // "Hit" in strip = peak price shown in hero (aligned with list %)
  const hitPriceDisplay = peakPriceDisplay;

  // Realized to highest TP (if much lower than peak, show as secondary)
  const tpHitPct =
    tpHitPrice != null && entryVal > 0 ? ((tpHitPrice - entryVal) / entryVal) * 100 : null;
  const showTpRealized =
    tpHitPct != null && gainPctNum != null && !tpHitIsSL && gainPctNum - tpHitPct > 5;

  // Live kline high only if clearly above hero peak
  const coinHighPct =
    coinHighPrice && entryVal > 0 ? ((coinHighPrice - entryVal) / entryVal) * 100 : null;
  const showCoinHigh =
    coinHighPrice != null && hitPriceDisplay != null && coinHighPrice > hitPriceDisplay * 1.05;

  const afterMark = lastUpdate?.price > 0 ? lastUpdate.price : null;
  const afterPct =
    afterMark && entryVal > 0
      ? ((Math.abs(afterMark - entryVal) / entryVal) * 100).toFixed(1)
      : null;

  const iconBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ink/[0.1] bg-surface-secondary text-text-muted transition-colors hover:border-ink/18 hover:text-text-primary";

  const journeyNode = (ev, i) => {
    const c = themeColors[ev.key] || themeColors.gold;
    const isLast = i === events.length - 1;
    return (
      <div key={i} className="relative flex flex-1 flex-col items-center min-w-[72px]">
        {!isLast && <div className="absolute left-1/2 top-[13px] h-px w-full bg-ink/[0.08]" />}
        <div
          className={`relative z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full text-text-primary ${c.dot}`}
        >
          {i === 0 ? (
            <span className="h-1.5 w-1.5 rounded-full bg-ink/90" />
          ) : ev.isSL ? (
            <svg
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <div className="mt-2 w-full px-0.5 text-center">
          <p className={`truncate text-[11px] font-semibold ${c.text}`}>{ev.label}</p>
          <p className="font-mono text-[10px] tabular-nums text-text-muted">{ev.time}</p>
          {ev.detail && (
            <p
              className={`truncate font-mono text-[10px] tabular-nums ${ev.isSL ? "text-loss" : "text-profit"}`}
            >
              {ev.detail}
            </p>
          )}
        </div>
      </div>
    );
  };

  const modalContent = (
    <div
      className={`lq-modal-safe fixed inset-0 z-[100000] flex items-end justify-center sm:items-center sm:p-4 lg:p-6 ${isClosing ? "animate-[smBO_.2s_ease-in_forwards]" : "animate-[smBI_.25s_ease-out]"}`}
    >
      <div className="lq-scrim" onClick={handleClose} aria-hidden="true" />
      <div
        /* Same measure as SignalModal (1280, 1360 past 1440) so a call and its
           proof do not open at two different widths. */
        className={`relative flex h-[min(var(--lq-modal-maxh),100%)] max-h-[var(--lq-modal-maxh)] w-full flex-col overflow-hidden rounded-t-2xl border border-ink/[0.07] bg-surface-raised shadow-[0_24px_80px_-20px_rgb(var(--scrim)/0.55)] sm:h-auto sm:max-h-[min(var(--lq-modal-maxh),900px)] sm:max-w-[min(1280px,96vw)] sm:rounded-[14px] xl:max-w-[1360px] ${
          isClosing
            ? "animate-[smSheetDn_.22s_ease-in_forwards] sm:animate-[smCO_.2s_ease-in_forwards]"
            : "animate-[smSheetUp_.32s_cubic-bezier(.16,1,.3,1)] sm:animate-[smCI_.28s_cubic-bezier(.16,1,.3,1)]"
        }`}
      >
        <div className="flex shrink-0 justify-center pt-2.5 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-ink/20" />
        </div>

        {/* ── Hero header — single clean row, no stacked crumbs ── */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-ink/[0.06] px-3.5 py-3 sm:gap-3 sm:px-5 sm:py-3.5">
          <CoinLogo pair={pair} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <h2 className="truncate text-[15px] font-semibold tracking-tight text-text-primary sm:text-[17px]">
                {pair}
              </h2>
              {status && (
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white sm:text-[10px] ${sColor(status)}`}
                >
                  {sLabel(status)}
                </span>
              )}
              {detail?.risk_level && (
                <span className="hidden shrink-0 rounded bg-ink/[0.05] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-text-muted sm:inline">
                  {detail.risk_level}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate font-mono text-[10px] tabular-nums text-text-muted sm:text-[11px]">
              {fmtDt(created)}
              {durationText && durationText !== "—" ? ` · ${durationText}` : ""}
            </p>
          </div>

          {gainHero && (
            <div className="shrink-0 text-right">
              <p
                className={`font-mono text-[18px] font-bold leading-none tabular-nums sm:text-[22px] ${
                  gainIsLoss ? "text-loss" : "text-profit"
                }`}
              >
                {gainHero}
              </p>
              {hitPriceDisplay != null && (
                <p className="mt-0.5 whitespace-nowrap font-mono text-[10px] tabular-nums text-text-muted">
                  peak ${formatPrice(hitPriceDisplay)}
                </p>
              )}
            </div>
          )}

          <div className="flex shrink-0 items-center gap-1">
            <a
              href={xUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={iconBtn}
              title={`Explore $${xCash} on X`}
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            {onOpenHistory ? (
              <button
                type="button"
                onClick={() => onOpenHistory(item)}
                className={iconBtn}
                title="History"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </button>
            ) : (
              <a href={historyHref} className={iconBtn} title="History">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </a>
            )}
            <button type="button" onClick={handleClose} className={iconBtn} aria-label="Close">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Multi-call segment */}
        {multi && (
          <div className="flex shrink-0 items-center justify-center gap-1.5 border-b border-ink/[0.05] px-4 py-2.5">
            <button
              type="button"
              onClick={() => onNavigate(currentIndex - 1)}
              disabled={currentIndex <= 0}
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition hover:bg-ink/[0.06] disabled:opacity-25"
            >
              ‹
            </button>
            <div className="flex items-center gap-1 rounded-lg bg-ink/[0.04] p-0.5">
              {signalIds.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onNavigate(i)}
                  className={`h-7 min-w-[1.75rem] rounded-md px-2 font-mono text-[11px] tabular-nums transition ${
                    i === currentIndex
                      ? "bg-surface-raised text-text-primary shadow-sm"
                      : "text-text-muted hover:text-text-primary"
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
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition hover:bg-ink/[0.06] disabled:opacity-25"
            >
              ›
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink/10 border-t-text-primary/40" />
            </div>
          ) : detail?.is_redacted ? (
            <div className="space-y-4 pb-1">
              <div className="rounded-xl bg-profit/[0.07] px-5 py-5 text-center">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  Peak reached
                </p>
                <p className="mt-1.5 font-mono text-[32px] font-bold leading-none text-profit">
                  {detail.peak_pct != null ? `+${Number(detail.peak_pct).toFixed(1)}%` : "—"}
                </p>
                <p className="mt-2 text-[12px] text-text-muted">
                  This call ran{" "}
                  {detail.peak_pct != null
                    ? `+${Number(detail.peak_pct).toFixed(1)}%`
                    : "in profit"}{" "}
                  from entry.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-ink/[0.03] px-4 py-3 font-mono text-[12px] tabular-nums text-text-muted">
                <span>
                  Entry <span className="select-none blur-[5px] text-text-primary">$0.00000</span>
                </span>
                <span className="text-ink/15">·</span>
                <span>
                  Target <span className="select-none blur-[5px] text-text-primary">$0.00000</span>
                </span>
                <span className="text-ink/15">·</span>
                <span>
                  Stop <span className="select-none blur-[5px] text-text-primary">$0.00000</span>
                </span>
                <span className="text-ink/15">·</span>
                <span>
                  Risk <span className="text-text-primary">{detail.risk_level || "—"}</span>
                </span>
              </div>

              {(entryImg || afterImg) && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[entryImg, afterImg].filter(Boolean).map((img, i) => (
                    <div
                      key={i}
                      className="relative h-[200px] overflow-hidden rounded-xl bg-surface-secondary sm:h-[240px]"
                    >
                      <img
                        src={img}
                        alt=""
                        className="absolute inset-0 h-full w-full select-none object-contain blur-[7px]"
                        loading="lazy"
                        draggable={false}
                        aria-hidden="true"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-surface/30">
                        <span className="flex items-center gap-1.5 rounded-full bg-surface-raised/90 px-3 py-1.5 text-[11px] font-medium text-text-secondary backdrop-blur-sm">
                          <svg
                            className="h-3 w-3 text-accent"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.2}
                          >
                            <rect x="5" y="11" width="14" height="10" rx="2" />
                            <path strokeLinecap="round" d="M8 11V8a4 4 0 0 1 8 0v3" />
                          </svg>
                          Chart locked
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col items-center gap-3 rounded-xl border border-accent/20 bg-accent/[0.06] p-4 sm:flex-row sm:justify-between">
                <div>
                  <p className="text-[13.5px] font-semibold text-text-primary">
                    Entry, targets &amp; stop-loss locked
                  </p>
                  <p className="mt-0.5 text-[12px] text-text-muted">
                    Unlock with a plan — or open any call older than 7 days free.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/pricing")}
                  className="flex h-9 shrink-0 items-center rounded-lg bg-accent px-4 text-[12px] font-semibold text-accent-fg transition hover:opacity-95"
                >
                  Unlock signal
                </button>
              </div>
            </div>
          ) : detail ? (
            <div className="space-y-5 pb-1">
              {/* One ticket, not four boxes. Four separate cards at this width
                  read as four unrelated numbers; on one band with hairlines
                  between them they read as one trade: in here, out there, this
                  long, at this risk. */}
              <div className="grid grid-cols-2 divide-x divide-y divide-ink/[0.06] overflow-hidden rounded-xl border border-ink/[0.07] sm:grid-cols-4 sm:divide-y-0">
                <div className="px-4 py-3">
                  <p className="text-[11px] text-text-muted">Entry</p>
                  <p className="mt-1 font-mono text-[16px] font-semibold tabular-nums text-text-primary">
                    {entryVal > 0 ? `$${formatPrice(entryVal)}` : "—"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-muted">where the call went out</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[11px] text-text-muted">Peak</p>
                  <p className="mt-1 font-mono text-[16px] font-semibold tabular-nums text-text-primary">
                    {hitPriceDisplay != null ? `$${formatPrice(hitPriceDisplay)}` : "—"}
                  </p>
                  {gainHero && (
                    <p
                      className={`mt-0.5 font-mono text-[12px] font-semibold tabular-nums ${
                        gainIsLoss ? "text-loss" : "text-profit"
                      }`}
                    >
                      {gainHero} from entry
                    </p>
                  )}
                </div>
                <div className="px-4 py-3">
                  <p className="text-[11px] text-text-muted">Time to peak</p>
                  <p className="mt-1 font-mono text-[16px] font-semibold tabular-nums text-text-primary">
                    {durationText}
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-muted">from the call</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[11px] text-text-muted">Risk</p>
                  <p
                    className={`mt-1 text-[16px] font-semibold ${
                      detail.risk_level === "High"
                        ? "text-loss"
                        : detail.risk_level === "Medium"
                          ? "text-accent"
                          : "text-profit"
                    }`}
                  >
                    {detail.risk_level || "—"}
                  </p>
                  {detail.volume_rank_num && detail.volume_rank_den ? (
                    <p className="mt-0.5 font-mono text-[11px] tabular-nums text-text-muted">
                      volume rank {detail.volume_rank_num} of {detail.volume_rank_den}
                    </p>
                  ) : null}
                </div>
              </div>

              {showTpRealized && tpHitPrice != null && (
                <p className="px-0.5 font-mono text-[11px] tabular-nums text-text-muted">
                  Plan hit TP @ ${formatPrice(tpHitPrice)}{" "}
                  <span className="text-profit">
                    ({tpHitPct >= 0 ? "+" : ""}
                    {tpHitPct.toFixed(1)}%)
                  </span>
                  <span className="text-text-muted/70"> · peak ran further</span>
                </p>
              )}

              {showCoinHigh && coinHighPct != null && (
                <p className="px-0.5 font-mono text-[11px] tabular-nums text-text-muted">
                  Coin high in window ${formatPrice(coinHighPrice)} (+{coinHighPct.toFixed(0)}%)
                  {coinHighIsPostStop ? " · after stop" : ""}
                </p>
              )}

              {/* Chart stage */}
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-text-primary">
                    {t("top.trade_proof") || "Trade proof"}
                  </p>
                  {hasAnyImg && (
                    <div className="flex items-center rounded-lg bg-ink/[0.05] p-0.5">
                      <button
                        type="button"
                        onClick={() => setShowTV(false)}
                        className={`rounded-md px-3 py-1 text-[11px] font-medium transition ${
                          !showInteractiveRight
                            ? "bg-surface-raised text-text-primary shadow-sm"
                            : "text-text-muted hover:text-text-primary"
                        }`}
                      >
                        Proof
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowTV(true)}
                        className={`rounded-md px-3 py-1 text-[11px] font-medium transition ${
                          showInteractiveRight
                            ? "bg-surface-raised text-text-primary shadow-sm"
                            : "text-text-muted hover:text-text-primary"
                        }`}
                      >
                        Live
                      </button>
                    </div>
                  )}
                </div>

                {!hasAnyImg || showInteractiveRight ? (
                  <div className="relative h-[280px] overflow-hidden rounded-xl bg-surface-secondary sm:h-[360px]">
                    <div id="tv_chart_modal_topperf" className="absolute inset-0 h-full w-full" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-[1fr_auto_1fr] md:gap-2">
                    {/* BEFORE — edge-to-edge, floating chip */}
                    <div className="relative min-w-0 overflow-hidden rounded-xl bg-surface-secondary">
                      <div className="pointer-events-none absolute left-2.5 top-2.5 z-10 flex items-center gap-2">
                        <span className="rounded-md bg-scrim/55 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
                          {t("top.before") || "Before"}
                        </span>
                        {detail?.entry > 0 && (
                          <span className="rounded-md bg-scrim/45 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white/90 backdrop-blur-sm">
                            ${formatPrice(detail.entry)}
                          </span>
                        )}
                      </div>
                      {entryImg ? (
                        <button
                          type="button"
                          onClick={() => setLightboxImg(entryImg)}
                          className="relative block h-[220px] w-full cursor-zoom-in sm:h-[280px] lg:h-[300px]"
                        >
                          <img
                            src={entryImg}
                            alt=""
                            className="absolute inset-0 h-full w-full object-contain"
                            loading="lazy"
                          />
                        </button>
                      ) : (
                        <div className="flex h-[220px] items-center justify-center text-[12px] text-text-muted sm:h-[280px] lg:h-[300px]">
                          {t("top.waiting_ss")}
                        </div>
                      )}
                    </div>

                    <div className="hidden items-center justify-center md:flex">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.05] text-text-muted">
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13 5l7 7-7 7M5 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                    </div>
                    <div className="flex items-center justify-center py-0.5 md:hidden">
                      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted/50">
                        ↓ after
                      </span>
                    </div>

                    {/* AFTER */}
                    <div className="relative min-w-0 overflow-hidden rounded-xl bg-surface-secondary">
                      <div className="pointer-events-none absolute left-2.5 top-2.5 z-10 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm ${
                            isStopped ? "bg-loss/80" : "bg-profit/75"
                          }`}
                        >
                          {t("top.after") || "After"} ·{" "}
                          {status === "open" ? t("top.latest") || "Latest" : sLabel(status)}
                        </span>
                        {afterMark != null && (
                          <span className="rounded-md bg-scrim/45 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white/90 backdrop-blur-sm">
                            ${formatPrice(afterMark)}
                            {afterPct != null && (
                              <span
                                className={`ml-1 ${isStopped ? "text-red-200" : "text-emerald-200"}`}
                              >
                                {afterPct}%
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      {afterImg ? (
                        <button
                          type="button"
                          onClick={() => setLightboxImg(afterImg)}
                          className="relative block h-[220px] w-full cursor-zoom-in sm:h-[280px] lg:h-[300px]"
                        >
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
                        </button>
                      ) : (
                        <div className="flex h-[220px] items-center justify-center text-[12px] text-text-muted sm:h-[280px] lg:h-[300px]">
                          {t("top.waiting_ss")}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Journey stepper */}
              {events.length > 0 && (
                <div>
                  <p className="mb-2.5 text-[13px] font-semibold text-text-primary">
                    {t("top.journey") || "Signal journey"}
                  </p>
                  <div className="overflow-x-auto rounded-xl bg-ink/[0.025] px-2 py-4 sm:px-3">
                    <div
                      className="flex items-start"
                      style={{ minWidth: `${Math.max(events.length * 96, 320)}px` }}
                    >
                      {events.map((ev, i) => journeyNode(ev, i))}
                    </div>
                  </div>
                  {journeyNote && (
                    <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
                      {journeyNote}
                    </p>
                  )}
                  {suppressedSl && (
                    <p className="mt-1 text-[10px] text-text-muted/80">
                      Temporary SL noise removed — final path is TP (not a stop-out).
                    </p>
                  )}
                  {detail?.stop2 > 0 && (
                    <p className="mt-1 text-[10px] text-text-muted/80">
                      SL1 = tight stop · SL2 = structure stop (swing / intraday).
                    </p>
                  )}
                </div>
              )}

              {/* Two next steps, side by side. Stacked, the second gold box
                  read as a repeat of the first and most readers never reached
                  it. Left is for anyone: keep this call. Right is the one a
                  free reader is here for: the levels on the NEXT one. */}
              <div className={`grid gap-3 ${isEntitledUser ? "" : "lg:grid-cols-2"}`}>
                <div className="rounded-xl border border-ink/[0.08] bg-ink/[0.02] px-4 py-3.5">
                  <p className="text-[13px] font-semibold text-text-primary">
                    {proofWatchlisted ? "This call is saved" : "Keep this call"}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
                    {proofWatchlisted
                      ? "It is in your watchlist, and its outcome and updates stay together."
                      : "Save it to your watchlist and we keep the outcome and every update with it. On Telegram we ask once before sending anything."}
                  </p>
                  <button
                    type="button"
                    onClick={armProofValue}
                    disabled={watchBusy || proofWatchlisted}
                    className="mt-3 flex h-9 items-center rounded-lg border border-ink/[0.1] bg-surface-secondary px-3.5 text-[12px] font-medium text-text-primary transition-colors hover:border-ink/18 disabled:cursor-default disabled:opacity-60"
                  >
                    {watchBusy
                      ? "Saving…"
                      : proofWatchlisted
                        ? "Saved to watchlist"
                        : "Save & enable alerts"}
                  </button>
                  {activationNote && (
                    <p className="mt-2 text-[11.5px] leading-relaxed text-text-muted" role="status">
                      {activationNote}
                    </p>
                  )}
                </div>

                {!isEntitledUser && (
                  <div className="rounded-xl border border-accent/30 bg-accent/[0.06] px-4 py-3.5">
                    <p className="text-[13px] font-semibold text-text-primary">
                      You are reading this one after it finished
                    </p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
                      The record is free and always will be. Paying is what puts the entry, the
                      targets and the stop in front of you while the next call is still live.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        onClose?.();
                        navigate("/pricing");
                      }}
                      className="mt-3 flex h-9 items-center rounded-lg bg-accent px-3.5 text-[12px] font-semibold text-accent-fg transition hover:brightness-105"
                    >
                      See the plans
                    </button>
                  </div>
                )}
              </div>

              {/* Detailed journey — collapsed by default */}
              {detail.signal_id && (
                <div className="rounded-xl border border-ink/[0.06] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setJourneyOpen((v) => !v)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-ink/[0.02]"
                  >
                    <span className="text-[13px] font-semibold text-text-primary">
                      Detailed journey
                    </span>
                    <svg
                      className={`h-4 w-4 text-text-muted transition-transform ${journeyOpen ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 9l6 6 6-6"
                      />
                    </svg>
                  </button>
                  {journeyOpen && (
                    <div className="border-t border-ink/[0.05] px-3 pb-3 pt-2 sm:px-4">
                      <SignalJourneyExtended signalId={detail.signal_id} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="py-16 text-center text-[13px] text-text-muted">{t("top.failed")}</div>
          )}
        </div>
      </div>

      {lightboxImg && (
        <div
          className="lq-modal-safe fixed inset-0 z-[200000] flex cursor-zoom-out items-center justify-center bg-scrim/95 p-4"
          onClick={() => setLightboxImg(null)}
        >
          <img
            src={lightboxImg}
            alt=""
            className="max-h-[min(var(--lq-modal-maxh),100%)] max-w-full rounded-xl object-contain"
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

export default TopPerformers;
