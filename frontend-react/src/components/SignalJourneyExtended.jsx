import { useEffect, useState } from "react";

/**
 * SignalJourneyExtended — Layer 6
 * Renders detailed 3-section journey from /api/v1/signals/journey/{id}.
 * Inject below the horizontal Signal Journey timeline in Trade tab.
 *
 * Sections:
 *   1. Entry Phase (raw stats: initial drawdown, time-to-TP1)
 *   2. Timeline (vertical event list with confirmed/detected distinction)
 *   3. Outcome (summary sentence + realized + peak excursion + bottom stats)
 *
 * Behavior:
 *   - Graceful: returns null if endpoint 404 / journey not computed yet
 *   - Subscriber gating handled server-side; renders paywall card if available=false
 *   - Caps events at 15 by default; "Show all" toggle for noisy signals
 */

const COLOR_MAP = {
  green: { text: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30", dot: "bg-green-500" },
  lime: { text: "text-lime-400", bg: "bg-lime-500/10", border: "border-lime-500/30", dot: "bg-lime-500" },
  amber: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", dot: "bg-amber-500" },
  orange: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", dot: "bg-orange-500" },
  cyan: { text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/30", dot: "bg-cyan-500" },
  purple: { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30", dot: "bg-purple-500" },
  red: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", dot: "bg-red-500" },
  gold: { text: "text-gold-primary", bg: "bg-gold-primary/10", border: "border-gold-primary/30", dot: "bg-gold-primary" },
  gray: { text: "text-gray-400", bg: "bg-gray-500/10", border: "border-gray-500/30", dot: "bg-gray-500" },
};

const getColor = (token) => COLOR_MAP[token] || COLOR_MAP.gray;

const formatPct = (val, withSign = true) => {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  if (Number.isNaN(n)) return null;
  const prefix = withSign && n > 0 ? "+" : "";
  return `${prefix}${n.toFixed(2)}%`;
};

const formatPrice = (val) => {
  const p = Number(val);
  if (Number.isNaN(p) || p <= 0) return "-";
  if (p < 0.0001) return p.toFixed(8);
  if (p < 0.01) return p.toFixed(6);
  if (p < 1) return p.toFixed(4);
  return p < 100 ? p.toFixed(4) : p.toFixed(2);
};

const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return null;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
};

const SignalJourneyExtended = ({ signalId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!signalId) return;
    let cancelled = false;

    const fetchJourney = async () => {
      setLoading(true);
      setErr(null);
      setData(null);
      setShowAll(false);
      try {
        const token = localStorage.getItem("access_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const r = await fetch(`/api/v1/signals/journey/${signalId}`, { headers });
        if (cancelled) return;

        if (r.status === 404) {
          // No journey row yet (e.g. signal still open, no events) — graceful skip
          setErr("not_computed");
          return;
        }
        if (!r.ok) {
          setErr(`http_${r.status}`);
          return;
        }
        const json = await r.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setErr(e.message || "fetch_failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchJourney();
    return () => {
      cancelled = true;
    };
  }, [signalId]);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div>
        <h4 className="text-gold-primary text-xs sm:text-sm font-semibold mb-3 flex items-center gap-2">
          📊 Detailed Journey
        </h4>
        <div className="bg-[#0d0d0d] rounded-xl border border-white/5 p-4 space-y-3 animate-pulse">
          <div className="h-3 bg-white/5 rounded w-1/3" />
          <div className="grid grid-cols-3 gap-2">
            <div className="h-16 bg-white/5 rounded" />
            <div className="h-16 bg-white/5 rounded" />
            <div className="h-16 bg-white/5 rounded" />
          </div>
          <div className="h-32 bg-white/5 rounded" />
        </div>
      </div>
    );
  }

  // ── Error states (silent skip for not_computed; this section is optional) ──
  if (err === "not_computed" || err) return null;

  if (!data) return null;

  // ── Paywall / not available card ──
  if (data.available === false) {
    return (
      <div>
        <h4 className="text-gold-primary text-xs sm:text-sm font-semibold mb-3 flex items-center gap-2">
          📊 Detailed Journey
        </h4>
        <div className="bg-gradient-to-br from-gold-primary/10 to-gold-primary/5 rounded-xl p-6 border border-gold-primary/30 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-gold-primary/15 border-2 border-gold-primary/40 flex items-center justify-center mb-3">
            <span className="text-lg">🔒</span>
          </div>
          <h5 className="text-white font-bold text-sm mb-1.5">Premium Detailed Journey</h5>
          <p className="text-white/60 text-xs leading-relaxed max-w-md mx-auto mb-3">
            {data.message || "Detailed journey for recent signals is available to subscribers."}
          </p>
          <button
            onClick={() => {
              window.location.href = "/pricing";
            }}
            className="px-4 py-2 rounded-lg bg-gold-primary text-black font-bold text-xs hover:bg-gold-primary/90 transition-all active:scale-[0.98]"
          >
            Subscribe to Unlock
          </button>
        </div>
      </div>
    );
  }

  // ── Coverage status warning (pair unavailable on Binance/Bybit) ──
  if (data.coverage_status === "unavailable") {
    return (
      <div>
        <h4 className="text-gold-primary text-xs sm:text-sm font-semibold mb-3 flex items-center gap-2">
          📊 Detailed Journey
        </h4>
        <div className="bg-[#0d0d0d] rounded-xl border border-white/5 p-4 text-center">
          <p className="text-text-muted text-xs">
            Price-action data unavailable for this pair. Detailed journey requires kline data from Binance or Bybit.
          </p>
        </div>
      </div>
    );
  }

  const { entry_stats, events = [], outcome } = data;
  const eventCount = events.length;
  const visibleEvents = showAll ? events : events.slice(0, 15);
  const hasMore = eventCount > 15;

  // ── Render ──
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-gold-primary text-xs sm:text-sm font-semibold flex items-center gap-2">
          📊 Detailed Journey
        </h4>
        {data.coverage_status === "live" && (
          <span className="text-[9px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 font-mono uppercase tracking-wider">
            ● Live
          </span>
        )}
        {data.coverage_status === "frozen" && (
          <span className="text-[9px] text-text-muted bg-white/5 px-2 py-0.5 rounded border border-white/5 font-mono uppercase tracking-wider">
            Frozen (post-TP4)
          </span>
        )}
        {data.coverage_status === "sl_truncated" && (
          <span className="text-[9px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 font-mono uppercase tracking-wider">
            Closed at SL
          </span>
        )}
      </div>

      <div className="space-y-4">
        {/* ════════════════════════════════════════ */}
        {/* SECTION 1: ENTRY PHASE                    */}
        {/* ════════════════════════════════════════ */}
        <div className="bg-[#0d0d0d] rounded-xl border border-white/5 p-4">
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">
            Entry Phase
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Initial Drawdown */}
            <StatCell
              label="Initial Drawdown"
              value={
                entry_stats?.initial_drawdown_pct === null ||
                entry_stats?.initial_drawdown_pct === undefined
                  ? "None"
                  : formatPct(entry_stats.initial_drawdown_pct)
              }
              valueColor={
                entry_stats?.initial_drawdown_pct === null ||
                entry_stats?.initial_drawdown_pct === undefined
                  ? "text-emerald-400"
                  : "text-red-400"
              }
              sublabel={
                entry_stats?.initial_mae_before === "tp1"
                  ? "before TP1 hit"
                  : entry_stats?.initial_mae_before === "sl"
                    ? "before SL hit"
                    : "smooth entry"
              }
            />
            {/* Time to TP1 */}
            <StatCell
              label="Time to TP1"
              value={entry_stats?.time_to_tp1_human || "—"}
              valueColor="text-white"
              sublabel={
                entry_stats?.time_to_tp1_seconds
                  ? `${entry_stats.time_to_tp1_seconds.toLocaleString()}s elapsed`
                  : "TP1 not yet reached"
              }
            />
            {/* Direction */}
            <StatCell
              label="Direction"
              value={data.direction?.toUpperCase() || "—"}
              valueColor={data.direction === "short" ? "text-red-400" : "text-green-400"}
              sublabel={data.data_source ? data.data_source.replace("_", " ") : ""}
            />
          </div>
        </div>

        {/* ════════════════════════════════════════ */}
        {/* SECTION 2: TIMELINE                       */}
        {/* ════════════════════════════════════════ */}
        <div className="bg-[#0d0d0d] rounded-xl border border-white/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
              Price Action Timeline
            </p>
            <div className="flex items-center gap-3 text-[9px] text-text-muted">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                Confirmed
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-white/30 ring-1 ring-white/20" />
                Detected
              </span>
            </div>
          </div>

          <div className="space-y-2 relative">
            {visibleEvents.map((ev, i) => (
              <TimelineRow key={i} event={ev} isLast={i === visibleEvents.length - 1} />
            ))}
          </div>

          {hasMore && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-3 w-full py-2 text-[11px] text-gold-primary hover:bg-gold-primary/10 rounded-lg border border-gold-primary/20 hover:border-gold-primary/40 transition-all font-semibold"
            >
              {showAll
                ? `▲ Show fewer events (${eventCount} total)`
                : `▼ Show all ${eventCount} events (${eventCount - 15} more)`}
            </button>
          )}
        </div>

        {/* ════════════════════════════════════════ */}
        {/* SECTION 3: OUTCOME                        */}
        {/* ════════════════════════════════════════ */}
        {outcome && (
          <div className="bg-[#0d0d0d] rounded-xl border border-white/5 p-4">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">
              Outcome
            </p>

            {/* Summary sentence */}
            {outcome.summary_sentence && (
              <p className="text-white/80 text-xs sm:text-sm leading-relaxed mb-3 p-3 bg-white/[0.02] rounded-lg border border-white/5">
                {outcome.summary_sentence}
              </p>
            )}

            {/* Two main cells: Realized + Peak Excursion */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <StatCell
                label="Realized"
                value={outcome.realized_pct !== null ? formatPct(outcome.realized_pct) : "Open"}
                valueColor={
                  outcome.realized_pct === null
                    ? "text-cyan-400"
                    : outcome.realized_pct >= 0
                      ? "text-green-400"
                      : "text-red-400"
                }
                sublabel={outcome.realized_via ? `via ${outcome.realized_via}` : "not yet closed"}
              />
              <StatCell
                label="Peak Excursion"
                value={outcome.peak_excursion_pct !== null ? formatPct(outcome.peak_excursion_pct) : "—"}
                valueColor="text-cyan-400"
                sublabel={outcome.peak_excursion_delta_text || ""}
              />
            </div>

            {/* Bottom stats: Time in profit + Worst drawdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {outcome.pct_time_above_entry !== null && outcome.pct_time_above_entry !== undefined && (
                <div className="px-3 py-2 bg-white/[0.02] rounded-lg border border-white/5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-text-muted uppercase tracking-wider font-semibold">
                      Time in Profit
                    </span>
                    <span className="text-[11px] text-white font-mono font-bold">
                      {Number(outcome.pct_time_above_entry).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all"
                      style={{ width: `${Math.min(100, Number(outcome.pct_time_above_entry))}%` }}
                    />
                  </div>
                </div>
              )}
              {outcome.worst_drawdown_pct !== null && outcome.worst_drawdown_pct !== undefined && (
                <div className="px-3 py-2 bg-white/[0.02] rounded-lg border border-white/5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-text-muted uppercase tracking-wider font-semibold">
                      Worst Drawdown
                    </span>
                    <span
                      className={`text-[11px] font-mono font-bold ${
                        outcome.worst_drawdown_pct < -5 ? "text-red-400" : "text-orange-400"
                      }`}
                    >
                      {formatPct(outcome.worst_drawdown_pct)}
                    </span>
                  </div>
                  <p className="text-[9px] text-text-muted">
                    {outcome.worst_drawdown_context || "lowest point during trade"}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

const StatCell = ({ label, value, valueColor = "text-white", sublabel }) => (
  <div className="px-3 py-2.5 bg-white/[0.02] rounded-lg border border-white/5">
    <p className="text-[9px] text-text-muted uppercase tracking-wider font-semibold mb-1">
      {label}
    </p>
    <p className={`text-base sm:text-lg font-mono font-bold ${valueColor}`}>{value}</p>
    {sublabel && <p className="text-[9px] text-text-muted mt-0.5">{sublabel}</p>}
  </div>
);

const TimelineRow = ({ event, isLast }) => {
  const c = getColor(event.color_token);
  const confirmed = event.confirmed === true;

  return (
    <div className="flex items-start gap-3 relative">
      {/* Vertical connector line */}
      {!isLast && <div className="absolute left-[7px] top-6 bottom-[-8px] w-px bg-white/10" />}

      {/* Dot indicator */}
      <div className="flex-shrink-0 mt-1">
        {confirmed ? (
          <div className={`w-3.5 h-3.5 rounded-full ${c.dot} ring-2 ring-[#0d0d0d]`} />
        ) : (
          <div className={`w-3.5 h-3.5 rounded-full bg-transparent ring-1 ${c.border} ring-2 ring-[#0d0d0d]`}>
            <div className={`w-full h-full rounded-full ${c.bg}`} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold ${c.text}`}>{event.label}</span>
            {event.pct !== null && event.pct !== undefined && (
              <span className={`text-[10px] font-mono font-bold ${c.text}`}>
                {formatPct(event.pct)}
              </span>
            )}
            {event.price !== null && event.price !== undefined && (
              <span className="text-[10px] font-mono text-text-muted">
                @ ${formatPrice(event.price)}
              </span>
            )}
          </div>
          {event.time_main && (
            <span className="text-[9px] font-mono text-text-muted whitespace-nowrap">
              {event.time_main}
              {event.time_delta && (
                <span className="text-text-muted/60 ml-1">({event.time_delta})</span>
              )}
            </span>
          )}
        </div>
        {event.context && (
          <p className="text-[10px] text-text-muted/80 mt-0.5 leading-snug">{event.context}</p>
        )}
      </div>
    </div>
  );
};

export default SignalJourneyExtended;
