import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import SignalsTable from "./SignalsTable";
import SignalModal from "./SignalModal";
import BtcDomAlert from "./BtcDomAlert";
import { classifyCoin } from './coinIntelShared';

const API_BASE = import.meta.env.VITE_API_URL || "";

// ================================================================
// INLINE SVG ICONS (Lucide-style) — unchanged
// ================================================================
const Icon = {
  filter: (className = 'w-3.5 h-3.5') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  search: (className = 'w-3.5 h-3.5') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  ),
  chevronDown: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  arrowUp: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  ),
  arrowDown: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  ),
  close: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  alert: (className = 'w-4 h-4') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  bell: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  check: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  trophy: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  ),
  x: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  flame: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  ),
  zap: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  target: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
};

// ================================================================
// SECTION HEADER — unchanged
// ================================================================
const SectionHeader = ({ label, hint }) => (
  <div className="flex items-center gap-3 mb-4">
    <span className="h-px w-8 bg-gold-primary/40" />
    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">{label}</span>
    <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/40 via-white/[0.06] to-transparent" />
    {hint && <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{hint}</span>}
  </div>
);

// ================================================================
// STAT CARD — enhanced colors
// ================================================================
const StatCard = ({ label, value, valueColor = 'text-white', sub }) => (
  <div className="bg-[#0a0805] rounded-md border border-white/[0.06] p-4 lg:p-5 relative overflow-hidden hover:border-gold-primary/25 hover:-translate-y-0.5 transition-all duration-200">
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted mb-2">{label}</p>
    <div className="h-px bg-white/[0.06] mb-3" />
    <p className={`font-mono text-2xl lg:text-3xl font-light tabular-nums leading-none ${valueColor}`}>{value}</p>
    {sub && <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mt-2">{sub}</p>}
  </div>
);

// ================================================================
// MAIN PAGE — REVISED COLORS ONLY
// ================================================================
const SignalsPage = () => {
  const { t } = useTranslation();

  const [allSignals, setAllSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [stats, setStats] = useState(null);

  // Coin Intelligence map { pair: coinObj } — used to join win-streak (and other
  // anomaly data) onto signal rows for the new column / filter / sort.
  const [coinIntel, setCoinIntel] = useState({});
  const [currentFlow, setCurrentFlow] = useState(null);


  const currentPricesRef = useRef({});
  const [priceVersion, setPriceVersion] = useState(0);

  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [searchPair, setSearchPair] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [streakFilter, setStreakFilter] = useState("all"); // 'all' | 'hot'
  const [corrDecoupled, setCorrDecoupled] = useState(false);
  const [corrHighAlign, setCorrHighAlign] = useState(false);
  const [verdictFilter, setVerdictFilter] = useState("all"); // 'all' | 'worth_it' | 'avoid'
  const [selectedDates, setSelectedDates] = useState([]);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

  // Tag intelligence (historical WR per important tag + active signal map).
  const [tagWr, setTagWr] = useState([]);            // raw list from /analytics/tag-wr
  const [selectedTags, setSelectedTags] = useState([]); // tag names the user filters by
  const [showAllTags, setShowAllTags] = useState(false);

  // Min win-streak length to count as a "High Win Streak" (matches the
  // Coin Intelligence hot-streak heuristic).
  const HOT_STREAK_MIN = 5;

  const fetchBulkSignals = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);

      const token = localStorage.getItem("access_token");
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

      const [signalsRes, statsRes, intelRes, tagWrRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/v1/signals/bulk-7d`, { headers: authHeaders }),
        fetch(`${API_BASE}/api/v1/signals/stats`, { headers: authHeaders }),
        fetch(`${API_BASE}/api/v1/signals/coin-intel`, { headers: authHeaders }),
        fetch(`${API_BASE}/api/v1/analytics/tag-wr?days=90&min_n=200`, { headers: authHeaders }),
      ]);
      if (signalsRes.status === "fulfilled" && signalsRes.value.ok) {
        const data = await signalsRes.value.json();
        setAllSignals(data.items || []);
      } else {
        throw new Error("Failed to fetch signals.");
      }
      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        const statsData = await statsRes.value.json();
        setStats(statsData);
      }
      // Coin Intelligence is best-effort: if it fails, the Win Streak column /
      // filter simply shows nothing — the rest of the page is unaffected.
      if (intelRes.status === "fulfilled" && intelRes.value.ok) {
        const intel = await intelRes.value.json();
        const all = [...(intel.top_coins || []), ...(intel.rest_coins || [])];
        const map = {};
        for (const c of all) {
          if (c && c.pair) map[c.pair] = c;
        }
        setCoinIntel(map);
        setCurrentFlow(intel.current_flow ?? null);
      }
      // Tag WR is best-effort: failure just hides the tag filter / badges.
      if (tagWrRes.status === "fulfilled" && tagWrRes.value.ok) {
        const tw = await tagWrRes.value.json();
        setTagWr(Array.isArray(tw.tags) ? tw.tags : []);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error fetching signals:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBulkSignals(true);
    const interval = setInterval(() => fetchBulkSignals(false), 90000);
    return () => clearInterval(interval);
  }, [fetchBulkSignals]);

  useEffect(() => {
    setPage(1);
  }, [searchPair, statusFilter, riskFilter, streakFilter, corrDecoupled, corrHighAlign, verdictFilter, selectedDates, sortBy, sortOrder, selectedTags]);

  const updatedCount = useMemo(() => {
    return allSignals.filter((s) => s.last_update_at).length;
  }, [allSignals]);

  // Count of signals currently on a "high" win streak (for the filter badge).
  const hotStreakCount = useMemo(() => {
    return allSignals.filter((s) => {
      const st = coinIntel[s.pair]?.current_streak;
      return st && st.type === "win" && st.length >= HOT_STREAK_MIN;
    }).length;
  }, [allSignals, coinIntel]);

  // Counts for the BTC correlation filter badges.
  const corrCounts = useMemo(() => {
    let dec = 0, hi = 0;
    for (const s of allSignals) {
      if (s.btc_decoupled) dec++;
      if ((s.btc_align_score ?? -1) >= 70) hi++;
    }
    return { dec, hi };
  }, [allSignals]);

  // Verdict (worth_it / avoid / neutral) per pair, computed once from coin-intel.
  const verdictByPair = useMemo(() => {
    const map = {};
    for (const pair in coinIntel) {
      map[pair] = classifyCoin(coinIntel[pair]);
    }
    return map;
  }, [coinIntel]);

  const verdictCounts = useMemo(() => {
    let worth = 0, avoid = 0;
    for (const s of allSignals) {
      const v = verdictByPair[s.pair];
      if (v === "worth_it") worth++;
      else if (v === "avoid") avoid++;
    }
    return { worth, avoid };
  }, [allSignals, verdictByPair]);

  // Tag WR lookup { tagName: { wr, n, median_peak } } — for chip labels & badges.
  const tagWrMap = useMemo(() => {
    const m = {};
    for (const t of tagWr) m[t.tag] = { wr: t.win_rate, n: t.n, median_peak: t.median_peak };
    return m;
  }, [tagWr]);

  // Map { signal_id: [tagName, ...] } built from each signal's own tags
  // (provided by bulk-7d). This is what makes the filter dynamic — it reflects
  // exactly the signals currently in view, whatever timeline/day is selected.
  const signalTags = useMemo(() => {
    const m = {};
    for (const s of allSignals) {
      if (s.signal_id && Array.isArray(s.important_tags)) {
        m[s.signal_id] = s.important_tags;
      }
    }
    return m;
  }, [allSignals]);

  // Tags sorted by WR desc (chips); top 10 unless "show all".
  const sortedTagsForChips = useMemo(() => {
    return [...tagWr].sort((a, b) => b.win_rate - a.win_rate);
  }, [tagWr]);

  // Signals passing every filter EXCEPT the tag filter — used to compute
  // dynamic per-tag counts (how many currently-visible signals carry each tag)
  // and to decide which chips to show. Tag filter itself is excluded so counts
  // don't collapse to the current selection.
  const signalsBeforeTagFilter = useMemo(() => {
    let f = [...allSignals];
    if (searchPair) {
      const q = searchPair.toUpperCase();
      f = f.filter((s) => s.pair && s.pair.toUpperCase().includes(q));
    }
    if (selectedDates.length > 0) {
      f = f.filter((s) => s.created_at && selectedDates.includes(s.created_at.slice(0, 10)));
    }
    if (statusFilter === "updated") {
      f = f.filter((s) => s.last_update_at);
    } else if (statusFilter !== "all") {
      f = f.filter((s) => {
        const st = (s.status || "").toLowerCase();
        switch (statusFilter) {
          case "open": return st === "open";
          case "tp1": return st === "tp1";
          case "tp2": return st === "tp2";
          case "tp3": return st === "tp3";
          case "tp4": case "closed_win": return st === "closed_win" || st === "tp4";
          case "sl": case "closed_loss": return st === "closed_loss" || st === "sl";
          default: return true;
        }
      });
    }
    if (riskFilter !== "all") {
      f = f.filter((s) => {
        const r = (s.risk_level || "").toLowerCase();
        switch (riskFilter) {
          case "low": return r.startsWith("low");
          case "normal": return r.startsWith("med") || r.startsWith("nor");
          case "high": return r.startsWith("high");
          default: return true;
        }
      });
    }
    if (streakFilter === "hot") {
      f = f.filter((s) => {
        const st = coinIntel[s.pair]?.current_streak;
        return st && st.type === "win" && st.length >= HOT_STREAK_MIN;
      });
    }
    if (corrDecoupled) f = f.filter((s) => s.btc_decoupled === true);
    if (corrHighAlign) f = f.filter((s) => (s.btc_align_score ?? -1) >= 70);
    if (verdictFilter !== "all") f = f.filter((s) => verdictByPair[s.pair] === verdictFilter);
    return f;
  }, [allSignals, searchPair, selectedDates, statusFilter, riskFilter, streakFilter, corrDecoupled, corrHighAlign, verdictFilter, verdictByPair, coinIntel]);

  // Dynamic per-tag count: how many currently-visible signals carry each tag.
  const tagActiveCount = useMemo(() => {
    const m = {};
    for (const s of signalsBeforeTagFilter) {
      const tags = s.important_tags;
      if (!Array.isArray(tags)) continue;
      for (const tg of tags) m[tg] = (m[tg] || 0) + 1;
    }
    return m;
  }, [signalsBeforeTagFilter]);

  // All unique pairs across every signal — passed to the table so it can fetch
  // live price/volume for the WHOLE dataset, not just the current page. This is
  // what makes "sort by volume" correct & stable across pages.
  const allPairs = useMemo(() => {
    return [...new Set(allSignals.map((s) => s.pair).filter(Boolean))];
  }, [allSignals]);

  const todayStats = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const todaySignals = allSignals.filter((s) => s.created_at && s.created_at.slice(0, 10) === todayStr);
    const total = todaySignals.length;
    const open = todaySignals.filter((s) => s.status === "open").length;
    const closed = todaySignals.filter((s) => s.status !== "open");
    const wins = closed.filter((s) => !["closed_loss", "sl"].includes(s.status)).length;
    const losses = closed.filter((s) => ["closed_loss", "sl"].includes(s.status)).length;
    const closedCount = closed.length;
    const wr = closedCount > 0 ? Math.round((wins / closedCount) * 100) : 0;
    return { total, open, wins, losses, closedCount, wr };
  }, [allSignals]);

  const dateOptions = useMemo(() => {
    const options = [{ value: "all", label: "All Days" }];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayLabel = i === 0 ? "Today" : i === 1 ? "Yesterday" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      const count = allSignals.filter((s) => s.created_at && s.created_at.slice(0, 10) === dateStr).length;
      if (count > 0) {
        options.push({ value: dateStr, label: dayLabel, count });
      }
    }
    return options;
  }, [allSignals]);

  const handlePricesUpdate = useCallback((priceMap) => {
    currentPricesRef.current = priceMap;
    setPriceVersion((v) => v + 1);
  }, []);

  const getPriceVal = (pair) => {
    const data = currentPricesRef.current[pair];
    if (!data) return 0;
    if (typeof data === "number") return data;
    return data.price || 0;
  };

  const getVolVal = (pair) => {
    const data = currentPricesRef.current[pair];
    if (!data || typeof data === "number") return 0;
    return data.volume || 0;
  };

  // Signed win-streak value for sorting: win → +length, loss → −length,
  // no Coin Intelligence data → null (so it can sink to the bottom).
  const getStreakVal = (pair) => {
    const st = coinIntel[pair]?.current_streak;
    if (!st || !st.length) return null;
    return st.type === "win" ? st.length : -st.length;
  };

  // Win rate for sorting (null when coin has no Coin Intelligence entry).
  const getWinRateVal = (pair) => {
    const wr = coinIntel[pair]?.win_rate;
    return wr == null ? null : wr;
  };

  const getOrderLabel = () => {
    const isTime = ["created_at", "last_update"].includes(sortBy);
    const isAlpha = sortBy === "pair";
    const isRisk = sortBy === "risk_level";
    const isStatus = sortBy === "status";
    if (sortOrder === "desc") {
      if (isTime) return "Newest";
      if (isAlpha) return "Z–A";
      if (isRisk) return "High";
      if (isStatus) return "Latest";
      return "Highest";
    } else {
      if (isTime) return "Oldest";
      if (isAlpha) return "A–Z";
      if (isRisk) return "Low";
      if (isStatus) return "Early";
      return "Lowest";
    }
  };

  const hasActiveFilters = searchPair || statusFilter !== "all" || riskFilter !== "all" || streakFilter !== "all" || corrDecoupled || corrHighAlign || verdictFilter !== "all" || selectedDates.length > 0 || sortBy !== "created_at" || selectedTags.length > 0;

  const toggleTag = (tag) => {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]);
  };

  const resetFilters = () => {
    setSearchPair("");
    setStatusFilter("all");
    setRiskFilter("all");
    setStreakFilter("all");
    setCorrDecoupled(false);
    setCorrHighAlign(false);
    setVerdictFilter("all");
    setSelectedDates([]);
    setSelectedTags([]);
    setSortBy("created_at");
    setSortOrder("desc");
  };

  const toggleDateFilter = (dateVal) => {
    if (dateVal === "all") {
      setSelectedDates([]);
    } else {
      setSelectedDates((prev) => {
        if (prev.includes(dateVal)) return prev.filter((d) => d !== dateVal);
        return [...prev, dateVal];
      });
    }
  };

  const { signals, totalPages, totalSignals } = useMemo(() => {
    let filtered = [...allSignals];

    if (searchPair) {
      const search = searchPair.toUpperCase();
      filtered = filtered.filter((s) => s.pair && s.pair.toUpperCase().includes(search));
    }

    if (selectedDates.length > 0) {
      filtered = filtered.filter((s) => s.created_at && selectedDates.includes(s.created_at.slice(0, 10)));
    }

    if (statusFilter === "updated") {
      filtered = filtered.filter((s) => s.last_update_at);
    } else if (statusFilter !== "all") {
      filtered = filtered.filter((s) => {
        const st = (s.status || "").toLowerCase();
        switch (statusFilter) {
          case "open": return st === "open";
          case "tp1": return st === "tp1";
          case "tp2": return st === "tp2";
          case "tp3": return st === "tp3";
          case "tp4": case "closed_win": return st === "closed_win" || st === "tp4";
          case "sl": case "closed_loss": return st === "closed_loss" || st === "sl";
          default: return true;
        }
      });
    }

    if (riskFilter !== "all") {
      filtered = filtered.filter((s) => {
        const r = (s.risk_level || "").toLowerCase();
        switch (riskFilter) {
          case "low": return r.startsWith("low");
          case "normal": return r.startsWith("med") || r.startsWith("nor");
          case "high": return r.startsWith("high");
          default: return true;
        }
      });
    }

    // High Win Streak filter — joins Coin Intelligence by pair.
    if (streakFilter === "hot") {
      filtered = filtered.filter((s) => {
        const st = coinIntel[s.pair]?.current_streak;
        return st && st.type === "win" && st.length >= HOT_STREAK_MIN;
      });
    }

    // BTC correlation filters (data joined onto each row by the backend).
    if (corrDecoupled) {
      filtered = filtered.filter((s) => s.btc_decoupled === true);
    }
    if (corrHighAlign) {
      filtered = filtered.filter((s) => (s.btc_align_score ?? -1) >= 70);
    }

    // Verdict filter (Worth It / Avoid) — from Coin Intelligence classification.
    if (verdictFilter !== "all") {
      filtered = filtered.filter((s) => verdictByPair[s.pair] === verdictFilter);
    }

    // Tag filter — signal passes if it carries ANY of the selected tags.
    if (selectedTags.length > 0) {
      filtered = filtered.filter((s) => {
        const tags = signalTags[s.signal_id];
        if (!tags) return false;
        return selectedTags.some((t) => tags.includes(t));
      });
    }

    // Stable tiebreaker — when two rows compare equal (or share missing/0 data),
    // fall back to a deterministic order (newest call first). This is what stops
    // rows from reshuffling every refresh, especially on page 2+.
    const tiebreak = (a, b) => (b.call_message_id || 0) - (a.call_message_id || 0);

    filtered.sort((a, b) => {
      // Pair: alphabetical, with stable tiebreaker for duplicate pairs
      if (sortBy === "pair") {
        const pa = (a.pair || "").toLowerCase();
        const pb = (b.pair || "").toLowerCase();
        const r = sortOrder === "asc" ? pa.localeCompare(pb) : pb.localeCompare(pa);
        return r !== 0 ? r : tiebreak(a, b);
      }

      let valA, valB;
      switch (sortBy) {
        case "current_price":
          valA = getPriceVal(a.pair); valB = getPriceVal(b.pair); break;
        case "entry":
          valA = parseFloat(a.entry) || 0; valB = parseFloat(b.entry) || 0; break;
        case "max_target": {
          const getMaxPct = (s) => {
            const targets = [s.target4, s.target3, s.target2, s.target1].filter(Boolean);
            if (targets.length === 0 || !s.entry) return 0;
            const maxT = Math.max(...targets.map(Number));
            const entry = parseFloat(s.entry);
            return entry > 0 ? ((maxT - entry) / entry * 100) : 0;
          };
          valA = getMaxPct(a); valB = getMaxPct(b); break;
        }
        case "stop_loss":
          valA = parseFloat(a.stop1) || 0; valB = parseFloat(b.stop1) || 0; break;
        case "status": {
          const statusRank = { open: 0, tp1: 1, tp2: 2, tp3: 3, closed_win: 4, tp4: 4, closed_loss: 5, sl: 5 };
          valA = statusRank[(a.status || "").toLowerCase()] ?? 9;
          valB = statusRank[(b.status || "").toLowerCase()] ?? 9; break;
        }
        case "risk_level": {
          const riskRank = (r) => { const rl = (r || "").toLowerCase(); if (rl.startsWith("low")) return 1; if (rl.startsWith("med") || rl.startsWith("nor")) return 2; if (rl.startsWith("high")) return 3; return 4; };
          valA = riskRank(a.risk_level); valB = riskRank(b.risk_level); break;
        }
        case "market_cap": {
          const parseMcap = (mcap) => { if (!mcap) return 0; const str = mcap.toString().toUpperCase(); const num = parseFloat(str.replace(/[^0-9.]/g, "")) || 0; if (str.includes("T")) return num * 1e12; if (str.includes("B")) return num * 1e9; if (str.includes("M")) return num * 1e6; if (str.includes("K")) return num * 1e3; return num; };
          valA = parseMcap(a.market_cap); valB = parseMcap(b.market_cap); break;
        }
        case "volume":
          valA = getVolVal(a.pair); valB = getVolVal(b.pair); break;
        case "win_streak":
          valA = getStreakVal(a.pair); valB = getStreakVal(b.pair); break;
        case "win_rate":
          valA = getWinRateVal(a.pair); valB = getWinRateVal(b.pair); break;
        case "btc_corr":
          valA = a.btc_align_score ?? null; valB = b.btc_align_score ?? null; break;
        case "verdict": {
          const rank = (p) => { const v = verdictByPair[p]; return v === "worth_it" ? 2 : v === "avoid" ? 1 : null; };
          valA = rank(a.pair); valB = rank(b.pair); break;
        }
        case "last_update": {
          const tsA = a.last_update_at ? new Date(a.last_update_at).getTime() : 0;
          const tsB = b.last_update_at ? new Date(b.last_update_at).getTime() : 0;
          if (tsA === 0 && tsB !== 0) return 1;
          if (tsA !== 0 && tsB === 0) return -1;
          valA = tsA; valB = tsB; break;
        }
        case "created_at": default:
          valA = a.call_message_id || 0; valB = b.call_message_id || 0; break;
      }

      // Live-derived metrics (fetched from the price provider): rows with no data
      // (value 0) always sink to the bottom regardless of asc/desc, so they never
      // pollute the top of an ascending volume/price sort.
      if (sortBy === "volume" || sortBy === "current_price") {
        const hasA = valA > 0;
        const hasB = valB > 0;
        if (hasA !== hasB) return hasA ? -1 : 1;
      }

      // Win streak / BTC alignment: rows without that data (null) always sink,
      // regardless of direction — valid negatives (loss streaks) must not be
      // treated as "missing".
      if (sortBy === "win_streak" || sortBy === "btc_corr" || sortBy === "win_rate" || sortBy === "verdict") {
        const hasA = valA !== null && valA !== undefined;
        const hasB = valB !== null && valB !== undefined;
        if (hasA !== hasB) return hasA ? -1 : 1;
        valA = valA ?? 0; valB = valB ?? 0;
      }

      const cmp = sortOrder === "asc" ? valA - valB : valB - valA;
      return cmp !== 0 ? cmp : tiebreak(a, b);
    });

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pages);
    const start = (safePage - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);
    return { signals: paged, totalPages: pages, totalSignals: total };
  }, [allSignals, searchPair, statusFilter, riskFilter, streakFilter, corrDecoupled, corrHighAlign, verdictFilter, verdictByPair, selectedDates, sortBy, sortOrder, page, pageSize, priceVersion, coinIntel, selectedTags, signalTags]);

  const handleSort = (field) => {
    if (sortBy === field) setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortOrder("desc"); }
  };

  const statusOptions = [
    { value: "all", label: "All Status" },
    { value: "updated", label: "Recently Hit", icon: Icon.bell, accent: 'gold' },
    { value: "open", label: "Open" },
    { value: "tp1", label: "TP1", icon: Icon.check, accent: 'emerald' },
    { value: "tp2", label: "TP2", icon: Icon.check, accent: 'emerald' },
    { value: "tp3", label: "TP3", icon: Icon.check, accent: 'emerald' },
    { value: "closed_win", label: "TP4", icon: Icon.trophy, accent: 'emerald' },
    { value: "closed_loss", label: "Loss", icon: Icon.x, accent: 'red' },
  ];

  const riskOptions = [
    { value: "all", label: "All" },
    { value: "low", label: "Low", dotColor: 'bg-emerald-400' },
    { value: "normal", label: "Normal", dotColor: 'bg-amber-400' },
    { value: "high", label: "High", dotColor: 'bg-red-400' },
  ];

  const sortOptions = [
    { value: "created_at", label: "Called Time" },
    { value: "last_update", label: "Last Update" },
    { value: "pair", label: "Pair Name" },
    { value: "current_price", label: "Current Price" },
    { value: "entry", label: "Entry Price" },
    { value: "max_target", label: "Max Target %" },
    { value: "stop_loss", label: "Stop Loss %" },
    { value: "status", label: "Signal Status" },
    { value: "risk_level", label: "Risk Level" },
    { value: "win_rate", label: "Win Rate" },
    { value: "win_streak", label: "Win Streak" },
    { value: "btc_corr", label: "BTC Alignment" },
    { value: "verdict", label: "Verdict (Worth/Avoid)" },
    { value: "market_cap", label: "Market Cap" },
    { value: "volume", label: "Volume 24H" },
  ];

  return (
    <div className="space-y-6 pb-10">
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-3">
            <span className="h-px w-8 bg-gold-primary/40" />
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">Terminal Signals</span>
            <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/40 via-white/[0.06] to-transparent" />
          </div>
          <h1 className="font-display text-2xl lg:text-3xl font-normal text-white tracking-tight">Last 7 Days Activity</h1>
          <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted mt-1.5">
            <span className="text-white tabular-nums">{allSignals.length}</span> signals generated
            {updatedCount > 0 && (
              <>
                <span className="mx-2 text-text-muted/40">·</span>
                <span className="text-gold-primary tabular-nums">{updatedCount}</span> recently updated
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2.5 bg-[#0a0805] px-3.5 py-2 rounded-sm border border-white/[0.06] relative overflow-hidden">
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: loading ? '#fbbf24' : '#10b981',
              boxShadow: loading
                ? '0 0 6px rgba(251,191,36,0.7), 0 0 12px rgba(251,191,36,0.35)'
                : '0 0 6px rgba(16,185,129,0.7), 0 0 12px rgba(16,185,129,0.35)',
            }}
          />
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {loading
              ? 'Syncing'
              : lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`
              : 'Ready'}
          </span>
        </div>
      </div>

      {/* PERFORMANCE STATS — enhanced colors */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Today's Activity"
          value={todayStats.total}
          sub={`${todayStats.open} open · ${todayStats.wins}W · ${todayStats.losses}L`}
        />
        <StatCard
          label="Today's Win Rate"
          value={`${todayStats.wr}%`}
          valueColor="text-emerald-400"
          sub={`${todayStats.closedCount} signals closed`}
        />
        <StatCard
          label="Overall Win Rate"
          value={stats?.win_rate ? `${stats.win_rate}%` : '—'}
          valueColor="text-amber-400"
          sub={stats ? `${(stats.total_signals || 0).toLocaleString()} total signals` : '—'}
        />
        <StatCard
          label="This Week"
          value={allSignals.length}
          sub="signals in view"
        />
      </div>

      {/* FILTER CONSOLE — stronger colors */}
      <div className="bg-[#0a0805] rounded-md border border-white/[0.06] p-5 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

        <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            {Icon.filter('w-3.5 h-3.5 text-gold-primary/70')}
            <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-white">Signal Scanner</h2>
          </div>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-3 py-1 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] transition-all rounded-sm font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-white"
            >
              {Icon.close('w-3 h-3')}
              Reset All
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-5">
          <div className="md:col-span-7 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60 pointer-events-none">
              {Icon.search('w-3.5 h-3.5')}
            </span>
            <input
              type="text"
              placeholder="Search pair (e.g. BTC, ETH, SOL)..."
              value={searchPair}
              onChange={(e) => setSearchPair(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-[#0a0506] border border-white/[0.08] rounded-sm text-white placeholder-text-muted/40 font-mono text-xs focus:border-gold-primary/40 focus:outline-none focus:bg-white/[0.02] transition-all"
            />
          </div>

          <div className="md:col-span-3 relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full pl-3 pr-9 py-2.5 bg-[#0a0506] border border-white/[0.08] rounded-sm text-white font-mono text-xs focus:border-gold-primary/40 focus:outline-none appearance-none cursor-pointer transition-all"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-[#0a0506]">{opt.label}</option>
              ))}
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
              {Icon.chevronDown('w-3 h-3')}
            </span>
          </div>

          <div className="md:col-span-2">
            <button
              onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
              className="w-full h-full min-h-[42px] flex items-center justify-center gap-1.5 px-3 bg-[#0a0506] border border-white/[0.08] hover:border-gold-primary/30 transition-all rounded-sm font-mono text-[10px] uppercase tracking-wider text-white"
            >
              {sortOrder === 'desc' ? Icon.arrowDown('w-3 h-3') : Icon.arrowUp('w-3 h-3')}
              <span>{getOrderLabel()}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Timeline */}
          <div className="lg:col-span-5">
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Timeline Filters</span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted/50">multi-select</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dateOptions.map((opt) => {
                const isActive = opt.value === "all" ? selectedDates.length === 0 : selectedDates.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleDateFilter(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                      isActive
                        ? 'bg-white/10 border border-white/[0.08] text-white'
                        : 'bg-white/[0.03] border border-transparent text-text-muted hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {opt.count != null && (
                      <span className={`px-1 py-0 font-mono text-[9px] tabular-nums rounded-sm ${
                        isActive ? 'bg-gold-primary/20 text-gold-primary' : 'bg-white/[0.06] text-text-muted/70'
                      }`}>
                        {opt.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status — stronger active colors */}
          <div className="lg:col-span-4 lg:border-l lg:border-white/[0.06] lg:pl-5">
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Signal Status</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {statusOptions.map((opt) => {
                const isActive = statusFilter === opt.value;
                const accentColor =
                  opt.accent === 'emerald' ? 'text-emerald-400' :
                  opt.accent === 'red' ? 'text-red-400' :
                  opt.accent === 'gold' ? 'text-gold-primary' :
                  'text-text-muted';
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setStatusFilter(opt.value);
                      if (opt.value === "updated" && sortBy === "created_at") setSortBy("last_update");
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                      isActive
                        ? 'bg-white/10 border border-white/[0.08] text-white'
                        : 'bg-white/[0.03] border border-transparent text-text-muted hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    {opt.icon && <span className={isActive ? accentColor : 'opacity-70'}>{opt.icon('w-3 h-3')}</span>}
                    <span>{opt.label}</span>
                    {opt.value === "updated" && updatedCount > 0 && !isActive && (
                      <span className="px-1 py-0 bg-gold-primary/10 text-gold-primary text-[9px] tabular-nums rounded-sm">
                        {updatedCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Risk — stronger dots */}
          <div className="lg:col-span-3 lg:border-l lg:border-white/[0.06] lg:pl-5">
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Risk Profile</span>
            </div>
            <div className="flex bg-white/[0.02] border border-white/[0.06] rounded-sm p-0.5">
              {riskOptions.map((opt) => {
                const isActive = riskFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setRiskFilter(opt.value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                      isActive
                        ? 'bg-white/10 text-white'
                        : 'text-text-muted hover:text-white hover:bg-white/[0.03]'
                    }`}
                  >
                    {opt.dotColor && (
                      <span className={`w-1.5 h-1.5 rounded-full ${opt.dotColor} ${isActive ? '' : 'opacity-50'}`} />
                    )}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Intelligence Filters — joined from Coin Intelligence. This is the home
            for the new analytics filters (Win Streak now; BTC Correlation next). */}
        <div className="mt-5 pt-5 border-t border-white/[0.06]">
          <div className="flex items-center justify-between mb-2.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Intelligence Filters</span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted/50">powered by coin intelligence</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setStreakFilter(streakFilter === "hot" ? "all" : "hot")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                streakFilter === "hot"
                  ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400'
                  : 'bg-white/[0.03] border border-transparent text-text-muted hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <span className={streakFilter === "hot" ? 'text-emerald-400' : 'opacity-70'}>{Icon.flame('w-3 h-3')}</span>
              <span>High Win Streak</span>
              <span className="font-mono text-[9px] normal-case tracking-normal opacity-70">≥{HOT_STREAK_MIN}</span>
              {hotStreakCount > 0 && streakFilter !== "hot" && (
                <span className="px-1 py-0 bg-emerald-500/10 text-emerald-400 text-[9px] tabular-nums rounded-sm">
                  {hotStreakCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setCorrDecoupled((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                corrDecoupled
                  ? 'bg-purple-500/15 border border-purple-500/40 text-purple-400'
                  : 'bg-white/[0.03] border border-transparent text-text-muted hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <span className={corrDecoupled ? 'text-purple-400' : 'opacity-70'}>{Icon.zap('w-3 h-3')}</span>
              <span>Decoupled from BTC</span>
              {corrCounts.dec > 0 && !corrDecoupled && (
                <span className="px-1 py-0 bg-purple-500/10 text-purple-400 text-[9px] tabular-nums rounded-sm">
                  {corrCounts.dec}
                </span>
              )}
            </button>

            <button
              onClick={() => setCorrHighAlign((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                corrHighAlign
                  ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400'
                  : 'bg-white/[0.03] border border-transparent text-text-muted hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <span className={corrHighAlign ? 'text-emerald-400' : 'opacity-70'}>{Icon.target('w-3 h-3')}</span>
              <span>High BTC Alignment</span>
              <span className="font-mono text-[9px] normal-case tracking-normal opacity-70">≥70</span>
              {corrCounts.hi > 0 && !corrHighAlign && (
                <span className="px-1 py-0 bg-emerald-500/10 text-emerald-400 text-[9px] tabular-nums rounded-sm">
                  {corrCounts.hi}
                </span>
              )}
            </button>

            <button
              onClick={() => setVerdictFilter(verdictFilter === "worth_it" ? "all" : "worth_it")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                verdictFilter === "worth_it"
                  ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400'
                  : 'bg-white/[0.03] border border-transparent text-text-muted hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <span className={verdictFilter === "worth_it" ? 'text-emerald-400' : 'opacity-70'}>✓</span>
              <span>Worth It</span>
              {verdictCounts.worth > 0 && verdictFilter !== "worth_it" && (
                <span className="px-1 py-0 bg-emerald-500/10 text-emerald-400 text-[9px] tabular-nums rounded-sm">
                  {verdictCounts.worth}
                </span>
              )}
            </button>

            <button
              onClick={() => setVerdictFilter(verdictFilter === "avoid" ? "all" : "avoid")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                verdictFilter === "avoid"
                  ? 'bg-red-500/15 border border-red-500/40 text-red-400'
                  : 'bg-white/[0.03] border border-transparent text-text-muted hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <span className={verdictFilter === "avoid" ? 'text-red-400' : 'opacity-70'}>⛔</span>
              <span>Avoid</span>
              {verdictCounts.avoid > 0 && verdictFilter !== "avoid" && (
                <span className="px-1 py-0 bg-red-500/10 text-red-400 text-[9px] tabular-nums rounded-sm">
                  {verdictCounts.avoid}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tag Pattern Filters — historical WR per entry-condition tag.
            Descriptive (tags overlap; not a standalone predictive signal). */}
        {sortedTagsForChips.length > 0 && (
          <div className="mt-5 pt-5 border-t border-white/[0.06]">
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Pattern Filters</span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted/50">historical win rate · descriptive</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(() => {
                const present = sortedTagsForChips.filter((t) => (tagActiveCount[t.tag] || 0) > 0 || selectedTags.includes(t.tag));
                const shown = showAllTags ? present : present.slice(0, 10);
                return shown;
              })().map((t) => {
                const active = selectedTags.includes(t.tag);
                const cnt = tagActiveCount[t.tag] || 0;
                const wrCol = t.win_rate >= 88 ? 'text-emerald-400' : t.win_rate >= 82 ? 'text-amber-400' : 'text-text-muted';
                return (
                  <button
                    key={t.tag}
                    onClick={() => toggleTag(t.tag)}
                    title={`${t.win_rate}% historical win rate · n=${t.n} · ${cnt} active now`}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                      active
                        ? 'bg-gold-primary/15 border border-gold-primary/40 text-gold-primary'
                        : 'bg-white/[0.03] border border-transparent text-text-muted hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <span className="normal-case">{t.tag.replace(/_/g, ' ').toLowerCase()}</span>
                    <span className={`tabular-nums ${active ? 'text-gold-primary' : wrCol}`}>{t.win_rate}%</span>
                    {cnt > 0 && (
                      <span className={`px-1 py-0 text-[9px] tabular-nums rounded-sm ${active ? 'bg-gold-primary/20 text-gold-primary' : 'bg-white/[0.06] text-text-muted/70'}`}>
                        {cnt}
                      </span>
                    )}
                  </button>
                );
              })}
              {(() => {
                const presentCount = sortedTagsForChips.filter((t) => (tagActiveCount[t.tag] || 0) > 0).length;
                if (presentCount <= 10) return null;
                return (
                  <button
                    onClick={() => setShowAllTags((v) => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider bg-white/[0.02] border border-white/[0.08] text-text-muted hover:text-white hover:border-white/[0.15] transition-all"
                  >
                    {showAllTags ? 'Show less' : `Show all (${presentCount})`}
                  </button>
                );
              })()}
            </div>
            <p className="font-mono text-[9px] text-text-muted/50 mt-2 normal-case tracking-normal leading-relaxed">
              Win rate of resolved signals that carried each tag. Tags overlap and describe entry conditions — not a standalone buy trigger.
            </p>
          </div>
        )}
      </div>

      {/* BTC Dominance Alert — self-contained (has its own expand) */}
      <BtcDomAlert allSignals={allSignals} onSignalClick={setSelectedSignal} />

      {/* ERROR / TABLE */}
      {error && (
        <div className="bg-[#0a0805] rounded-md p-6 border border-red-500/30 text-center relative overflow-hidden">
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-red-500/[0.06] border border-red-500/20 flex items-center justify-center text-red-400">
              {Icon.alert('w-5 h-5')}
            </div>
            <h3 className="font-mono text-sm text-white">Failed to load signals</h3>
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{error}</p>
            <button
              onClick={() => fetchBulkSignals(true)}
              className="px-4 py-2 mt-1 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15 hover:border-red-500/30 transition-all rounded-sm font-mono text-[10px] uppercase tracking-wider"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {!error && (
        <SignalsTable
          signals={signals}
          loading={loading}
          onRowClick={setSelectedSignal}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onPricesUpdate={handlePricesUpdate}
          allPairs={allPairs}
          coinIntel={coinIntel}
          verdictByPair={verdictByPair}
          currentFlow={currentFlow}
          tagWrMap={tagWrMap}
          signalTags={signalTags}
        />
      )}

      {selectedSignal && (
        <SignalModal
          key={selectedSignal.signal_id}
          signal={selectedSignal}
          isOpen={!!selectedSignal}
          onClose={() => setSelectedSignal(null)}
          onSwitchSignal={(newSignal) => {
            setSelectedSignal(null);
            setTimeout(() => setSelectedSignal(newSignal), 100);
          }}
        />
      )}
    </div>
  );
};

export default SignalsPage;