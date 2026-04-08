import { useState, useEffect, useMemo } from 'react';

/**
 * DeepAnalysis v3 — Facts + Tags UI
 *
 * New design philosophy: "Inform, don't decide"
 * - No confidence score, no rating
 * - Raw facts with descriptive tags
 * - Tabbed timeframe view (ALL / M15 / H1 / H4 / CONTEXT)
 * - Copy to AI feature (Markdown / JSON / Prompt)
 * - Entry snapshot + Live snapshot hybrid
 * - History expand for progressive disclosure
 *
 * Backward compat:
 * - If enrichmentV3 is not available but legacy enrichment is,
 *   falls back to a compact legacy view with a notice.
 *
 * Props:
 *   signalId: string (required for fetching v3 data)
 *   enrichment: legacy enrichment object (backward compat)
 *   isOpen: boolean
 *   onClose: function
 *   pair: string
 */

const TABS = [
  { id: 'all', label: 'ALL' },
  { id: 'm15', label: 'M15' },
  { id: 'h1', label: 'H1' },
  { id: 'h4', label: 'H4' },
  { id: 'context', label: 'CONTEXT' },
];

const COPY_OPTIONS = [
  { id: 'markdown', label: 'Copy as Markdown' },
  { id: 'json', label: 'Copy as JSON' },
  { id: 'prompt', label: 'Copy as AI Prompt' },
];

// ============================================================
// HELPERS
// ============================================================

const formatNum = (val, decimals = 2) => {
  if (val === null || val === undefined) return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  return n.toFixed(decimals);
};

const formatPct = (val, decimals = 2) => {
  if (val === null || val === undefined) return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`;
};

const formatMoney = (val) => {
  if (val === null || val === undefined) return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};

const timeAgo = (dateStr) => {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ============================================================
// TAG COMPONENT
// ============================================================

const Tag = ({ name, important = false }) => {
  // Color coding by tag prefix
  const getColor = (tag) => {
    if (tag.includes('BULLISH') || tag.includes('ABOVE_EMA200')) return 'bg-green-500/15 text-green-400 border-green-500/30';
    if (tag.includes('BEARISH') || tag.includes('BELOW_EMA200')) return 'bg-red-500/15 text-red-400 border-red-500/30';
    if (tag.includes('OVERBOUGHT') || tag.includes('LATE_ENTRY') || tag.includes('PARABOLIC') || tag.includes('EXHAUSTION') || tag.includes('OVEREXTENDED') || tag.includes('CONFLICTING')) return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    if (tag.includes('OVERSOLD') || tag.includes('DEEP_PULLBACK') || tag.includes('FRESH_BREAKOUT')) return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    if (tag.includes('GOLDEN_SETUP') || tag.includes('FVG_NEAR') || tag.includes('OB_NEAR') || tag.includes('HARMONIC_ALIGNED') || tag.includes('ALT_SEASON')) return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    if (tag.includes('RANGING') || tag.includes('NEUTRAL') || tag.includes('NORMAL') || tag.includes('UNKNOWN') || tag.includes('FLAT')) return 'bg-gray-500/15 text-gray-400 border-gray-500/30';
    if (tag.includes('FNG_EXTREME') || tag.includes('LIQ_VERY_LOW') || tag.includes('RISK_OFF')) return 'bg-red-500/10 text-red-300 border-red-500/20';
    return 'bg-white/5 text-white/70 border-white/10';
  };

  return (
    <span
      className={`inline-block text-[9px] font-mono px-2 py-0.5 rounded border ${getColor(name)} ${important ? 'font-semibold' : ''}`}
    >
      {name}
    </span>
  );
};

// ============================================================
// FACT ROW (for tab views)
// ============================================================

const FactRow = ({ label, value, subtle = false }) => (
  <div className="flex items-center justify-between py-1 border-b border-white/5 last:border-b-0">
    <span className="text-[10px] text-text-muted uppercase tracking-wider">{label}</span>
    <span className={`text-[11px] font-mono ${subtle ? 'text-white/60' : 'text-white'}`}>{value}</span>
  </div>
);

const Section = ({ title, children }) => (
  <div className="bg-[#0d0d0d] rounded-lg border border-white/5 p-3 space-y-1">
    <p className="text-[9px] text-text-muted uppercase tracking-wider font-semibold mb-2">{title}</p>
    {children}
  </div>
);

// ============================================================
// TAB CONTENT — ALL (compact overview)
// ============================================================

const AllTabContent = ({ facts, tags, tagsAnnotated }) => {
  const byTf = facts?.by_timeframe || {};
  const h1 = byTf.h1 || {};
  const context = facts?.context || {};
  const eq = facts?.entry_quality || {};
  const structure = facts?.structure || {};

  const importantTags = tagsAnnotated.filter((t) => t.important).map((t) => t.name);
  const detailTags = tagsAnnotated.filter((t) => !t.important).map((t) => t.name);

  const [showAllTags, setShowAllTags] = useState(false);

  return (
    <div className="space-y-3">
      {/* Trend summary */}
      <Section title="Trend">
        <FactRow
          label="M15 / H1 / H4"
          value={`${byTf.m15?.trend?.trend || '?'} • ${byTf.h1?.trend?.trend || '?'} • ${byTf.h4?.trend?.trend || '?'}`}
        />
        <FactRow
          label="H1 Strength"
          value={`ADX ${formatNum(byTf.h1?.trend?.adx, 1)} (${byTf.h1?.trend?.trend_strength || '?'})`}
        />
      </Section>

      {/* Momentum */}
      <Section title="Momentum H1">
        <FactRow label="RSI" value={`${formatNum(h1.momentum?.rsi, 1)} (${h1.momentum?.rsi_state || '?'})`} />
        <FactRow label="MACD" value={`${formatNum(h1.momentum?.macd_hist, 6)} (${h1.momentum?.macd_direction || '?'})`} />
        <FactRow label="Volume" value={`${formatNum(h1.volume?.ratio, 2)}x avg (${h1.volume?.state || '?'})`} />
      </Section>

      {/* Entry Quality */}
      <Section title="Entry Quality">
        <FactRow label="Last 3c gain" value={formatPct(eq.last_3_candles_gain_pct)} />
        <FactRow label="Dist EMA20 H1" value={formatPct(eq.distance_from_ema20_h1_pct)} />
        <FactRow label="Candle age" value={`${formatNum(eq.candle_age_pct, 0)}%`} />
      </Section>

      {/* Structure */}
      <Section title="Structure">
        <FactRow
          label="FVG / OB / Sweep"
          value={`${structure.smc?.fvg_count || 0} / ${structure.smc?.ob_count || 0} / ${structure.smc?.sweep_count || 0}`}
        />
        <FactRow
          label="Near entry"
          value={`FVG: ${structure.smc?.fvg_near_entry ? '✓' : '—'}, OB: ${structure.smc?.ob_near_entry ? '✓' : '—'}`}
        />
        {structure.smc?.golden_setup && (
          <FactRow label="Special" value="SMC Golden Setup" />
        )}
      </Section>

      {/* Context */}
      <Section title="Market Context">
        <FactRow
          label="BTC"
          value={`${formatPct(context.btc?.price_change_pct)} • dom ${formatNum(context.btc?.dominance, 2)}% (${context.btc?.dominance_trend || '?'})`}
        />
        <FactRow
          label="Fear & Greed"
          value={`${context.fng?.value ?? '—'} (${context.fng?.classification || '—'})`}
        />
        <FactRow
          label="Vol regime"
          value={`${context.environment?.volatility_regime || '?'} (ATR P${formatNum(context.environment?.atr_percentile_h4, 0)})`}
        />
      </Section>

      {/* Important tags */}
      {importantTags.length > 0 && (
        <div>
          <p className="text-[9px] text-text-muted uppercase tracking-wider font-semibold mb-1.5">
            Key Tags ({importantTags.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {importantTags.map((t) => <Tag key={t} name={t} important />)}
          </div>
        </div>
      )}

      {/* Detail tags (collapsible) */}
      {detailTags.length > 0 && (
        <div>
          <button
            onClick={() => setShowAllTags(!showAllTags)}
            className="text-[10px] text-gold-primary hover:text-gold-light transition"
          >
            {showAllTags ? '▼ Hide' : '▶ Show'} {detailTags.length} detail tags
          </button>
          {showAllTags && (
            <div className="flex flex-wrap gap-1 mt-2">
              {detailTags.map((t) => <Tag key={t} name={t} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// TAB CONTENT — Single Timeframe
// ============================================================

const TimeframeTabContent = ({ facts, tf }) => {
  const byTf = facts?.by_timeframe || {};
  const data = byTf[tf] || {};
  const trend = data.trend || {};
  const momentum = data.momentum || {};
  const volume = data.volume || {};
  const bb = momentum.bollinger || {};
  const div = momentum.rsi_divergence || {};

  return (
    <div className="space-y-3">
      <Section title={`${tf.toUpperCase()} Trend`}>
        <FactRow label="Trend" value={trend.trend || '?'} />
        <FactRow label="Strength" value={`${trend.trend_strength || '?'} (ADX ${formatNum(trend.adx, 1)})`} />
        <FactRow label="Close" value={formatNum(trend.close, 6)} />
        <FactRow label="EMA20" value={formatNum(trend.ema20, 6)} />
        <FactRow label="EMA50" value={formatNum(trend.ema50, 6)} />
        {trend.ema200_available && (
          <FactRow label="EMA200" value={formatNum(trend.ema200, 6)} />
        )}
        <FactRow label="EMA gap" value={`${formatNum(trend.ema_gap_atr, 2)} ATR`} />
        <FactRow label="ATR" value={formatNum(trend.atr, 8)} />
      </Section>

      <Section title={`${tf.toUpperCase()} Momentum`}>
        <FactRow label="RSI" value={`${formatNum(momentum.rsi, 2)} (${momentum.rsi_state || '?'})`} />
        <FactRow label="MACD hist" value={`${formatNum(momentum.macd_hist, 8)} (${momentum.macd_direction || '?'})`} />
        {(div.bull_div || div.bear_div || div.hidden_bull || div.hidden_bear) && (
          <FactRow
            label="RSI divergence"
            value={[
              div.bull_div && 'bull',
              div.bear_div && 'bear',
              div.hidden_bull && 'hidden bull',
              div.hidden_bear && 'hidden bear',
            ].filter(Boolean).join(', ')}
          />
        )}
      </Section>

      {bb.middle !== null && bb.middle !== undefined && (
        <Section title={`${tf.toUpperCase()} Bollinger Bands`}>
          <FactRow label="Upper" value={formatNum(bb.upper, 6)} />
          <FactRow label="Middle" value={formatNum(bb.middle, 6)} />
          <FactRow label="Lower" value={formatNum(bb.lower, 6)} />
          <FactRow label="Width" value={`${formatNum(bb.width_pct_avg, 0)}% of avg`} />
          {bb.squeeze && <FactRow label="State" value="SQUEEZE" />}
          {bb.expansion && <FactRow label="State" value="EXPANSION" />}
          {bb.upper_touch && <FactRow label="Touch" value="UPPER BAND" />}
          {bb.lower_touch && <FactRow label="Touch" value="LOWER BAND" />}
        </Section>
      )}

      <Section title={`${tf.toUpperCase()} Volume`}>
        <FactRow label="Current" value={formatNum(volume.current, 0)} />
        <FactRow label="Avg (20)" value={formatNum(volume.avg20, 0)} />
        <FactRow label="Ratio" value={`${formatNum(volume.ratio, 2)}x (${volume.state || '?'})`} />
        {volume.climax && <FactRow label="Special" value="CLIMAX" />}
        {volume.dry_up && <FactRow label="Special" value="DRY UP" />}
        {volume.rising_with_trend && <FactRow label="Trend" value="Volume rising with price" />}
        {volume.falling_with_trend && <FactRow label="Trend" value="Volume falling with price" subtle />}
      </Section>
    </div>
  );
};

// ============================================================
// TAB CONTENT — CONTEXT (BTC, market, structure, env)
// ============================================================

const ContextTabContent = ({ facts }) => {
  const context = facts?.context || {};
  const structure = facts?.structure || {};
  const levels = facts?.levels || {};
  const btc = context.btc || {};
  const fng = context.fng || {};
  const env = context.environment || {};
  const smc = structure.smc || {};
  const fib = structure.fib || {};
  const patterns = structure.patterns || [];

  return (
    <div className="space-y-3">
      <Section title="BTC Context">
        <FactRow label="Price" value={formatMoney(btc.price)} />
        <FactRow label="24h change" value={formatPct(btc.price_change_pct)} />
        <FactRow label="Dominance" value={`${formatNum(btc.dominance, 2)}%`} />
        <FactRow label="Dom delta" value={btc.dominance_delta !== null ? formatPct(btc.dominance_delta, 2) : '— (warm-up)'} />
        <FactRow label="Dom trend" value={btc.dominance_trend || '?'} />
      </Section>

      <Section title="Sentiment & Derivatives">
        <FactRow label="Fear & Greed" value={`${fng.value ?? '—'} (${fng.classification || '—'})`} />
        <FactRow label="Funding rate" value={context.funding_rate !== null ? formatNum(context.funding_rate, 5) : '—'} />
      </Section>

      <Section title="Volatility & Liquidity">
        <FactRow label="ATR percentile H4" value={`P${formatNum(env.atr_percentile_h4, 0)}`} />
        <FactRow label="Regime" value={env.volatility_regime || '?'} />
        <FactRow label="24h volume" value={formatMoney(env.vol_24h_usd)} />
        <FactRow label="Liquidity tier" value={env.liquidity_tier || '?'} />
      </Section>

      <Section title="SMC Structure">
        <FactRow label="FVG count" value={smc.fvg_count || 0} />
        <FactRow label="FVG near entry" value={smc.fvg_near_entry ? '✓' : '—'} />
        <FactRow label="Order Block count" value={smc.ob_count || 0} />
        <FactRow label="OB near entry" value={smc.ob_near_entry ? '✓' : '—'} />
        <FactRow label="Liquidity sweep" value={smc.sweep_recent ? `✓ (${smc.sweep_count})` : '—'} />
        {smc.golden_setup && <FactRow label="Special" value="GOLDEN SETUP" />}
      </Section>

      {patterns.length > 0 && (
        <Section title={`Chart Patterns (${patterns.length})`}>
          {patterns.slice(0, 6).map((p, i) => (
            <FactRow
              key={i}
              label={`${p.timeframe || '?'} ${p.type || '?'}`}
              value={`${p.direction || '?'}${p.strength ? ` (${p.strength})` : ''}`}
            />
          ))}
        </Section>
      )}

      {(fib.entry_near_fib || fib.tp_fib_aligned > 0) && (
        <Section title="Fibonacci">
          {fib.entry_near_fib && (
            <FactRow label="Entry at Fib" value={fib.entry_fib_level || '?'} />
          )}
          {fib.tp_fib_aligned > 0 && (
            <FactRow label="TPs aligned with ext" value={fib.tp_fib_aligned} />
          )}
          {fib.swing_high !== null && (
            <FactRow label="Swing high" value={formatNum(fib.swing_high, 6)} />
          )}
          {fib.swing_low !== null && (
            <FactRow label="Swing low" value={formatNum(fib.swing_low, 6)} />
          )}
        </Section>
      )}

      <Section title="Key Levels">
        <FactRow label="Near H1 resistance" value={levels.near_resistance_h1 ? '✓' : '—'} />
        <FactRow label="Near H1 support" value={levels.near_support_h1 ? '✓' : '—'} />
        <FactRow label="Near H4 resistance" value={levels.near_resistance_h4 ? '✓' : '—'} />
        <FactRow label="Near H4 support" value={levels.near_support_h4 ? '✓' : '—'} />
        {levels.broke_resistance_recent && <FactRow label="Recent break" value="Broke H4 resistance" />}
        {levels.broke_support_recent && <FactRow label="Recent break" value="Broke H4 support" />}
      </Section>
    </div>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================

const DeepAnalysis = ({ signalId, enrichment: legacyEnrichment, isOpen, onClose, pair }) => {
  const [activeTab, setActiveTab] = useState('all');
  const [v3Data, setV3Data] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showLive, setShowLive] = useState(false);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [copyStatus, setCopyStatus] = useState(null);
  const [history, setHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  // Fetch v3 enrichment data
  useEffect(() => {
    if (!isOpen || !signalId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/enrichment/v3/${signalId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.status === 'enriched') {
          setV3Data(data);
        } else {
          setV3Data(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, signalId]);

  // Determine snapshot to display (entry or live)
  const activeSnapshot = useMemo(() => {
    if (!v3Data) return null;
    return showLive ? (v3Data.live_snapshot || v3Data.entry_snapshot) : v3Data.entry_snapshot;
  }, [v3Data, showLive]);

  const facts = activeSnapshot?.facts || {};
  const tags = activeSnapshot?.tags || [];
  const tagsAnnotated = activeSnapshot?.tags_annotated || [];
  const signalDir = activeSnapshot?.signal_direction || '?';

  // Copy to clipboard handler
  const handleCopy = async (format) => {
    setShowCopyMenu(false);
    if (!v3Data) return;

    try {
      let content;
      if (format === 'json') {
        content = JSON.stringify(v3Data, null, 2);
      } else if (format === 'markdown') {
        const resp = await fetch(`/api/v1/enrichment/v3/${signalId}/export/md`);
        content = await resp.text();
      } else if (format === 'prompt') {
        const resp = await fetch(`/api/v1/enrichment/v3/${signalId}/export/prompt`);
        content = await resp.text();
      }
      await navigator.clipboard.writeText(content);
      setCopyStatus(`Copied as ${format}`);
      setTimeout(() => setCopyStatus(null), 2000);
    } catch (err) {
      setCopyStatus('Copy failed');
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  // Load history
  const handleLoadHistory = async () => {
    if (history) {
      setShowHistory(!showHistory);
      return;
    }
    try {
      const resp = await fetch(`/api/v1/enrichment/v3/${signalId}/history?limit=50`);
      const data = await resp.json();
      setHistory(data.history || []);
      setShowHistory(true);
    } catch (err) {
      setError('Failed to load history');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150000] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

      <div
        className="relative z-10 w-full max-w-2xl max-h-[88vh] mx-3 bg-[#0a0a0a] border border-gold-primary/30 rounded-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gold-primary/20 bg-[#0d0d0d] flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm">🔍</span>
            <div>
              <h3 className="text-white font-semibold text-sm">Signal Analysis</h3>
              <p className="text-text-muted text-[10px] font-mono">
                {pair} · {signalDir}
                {v3Data?.version && ` · ${v3Data.version}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Copy dropdown */}
            {v3Data && (
              <div className="relative">
                <button
                  onClick={() => setShowCopyMenu(!showCopyMenu)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-gold-primary/10 hover:bg-gold-primary/20 border border-gold-primary/30 rounded text-gold-primary text-[10px] font-medium transition"
                >
                  📋 Copy ▼
                </button>
                {showCopyMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-[#0d0d0d] border border-gold-primary/30 rounded shadow-xl overflow-hidden z-20 min-w-[180px]">
                    {COPY_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => handleCopy(opt.id)}
                        className="block w-full text-left px-3 py-2 text-[11px] text-white hover:bg-gold-primary/10 transition"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                {copyStatus && (
                  <div className="absolute right-0 top-full mt-1 bg-green-500/20 border border-green-500/40 rounded px-2 py-1 text-[10px] text-green-400 whitespace-nowrap">
                    {copyStatus}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-white hover:bg-red-500/20 rounded transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        {v3Data && (
          <div className="flex border-b border-white/5 bg-[#0d0d0d] flex-shrink-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-3 py-2 text-[11px] font-medium transition border-b-2 ${
                  activeTab === tab.id
                    ? 'border-gold-primary text-gold-primary'
                    : 'border-transparent text-text-muted hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Snapshot selector (Entry vs Live) */}
        {v3Data && v3Data.live_snapshot && v3Data.live_updated_at && (
          <div className="flex items-center gap-2 px-4 py-2 bg-[#080808] border-b border-white/5 flex-shrink-0">
            <button
              onClick={() => setShowLive(false)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition ${
                !showLive ? 'bg-gold-primary/20 text-gold-primary' : 'text-text-muted hover:text-white'
              }`}
            >
              Entry snapshot
            </button>
            <button
              onClick={() => setShowLive(true)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition ${
                showLive ? 'bg-gold-primary/20 text-gold-primary' : 'text-text-muted hover:text-white'
              }`}
            >
              Live ({timeAgo(v3Data.live_updated_at)})
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-text-muted text-sm">
              Loading analysis...
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded p-3 text-red-400 text-xs">
              Error: {error}
            </div>
          )}

          {!loading && !v3Data && legacyEnrichment && (
            <LegacyFallback enrichment={legacyEnrichment} />
          )}

          {!loading && !v3Data && !legacyEnrichment && (
            <div className="text-text-muted text-center py-12 text-sm">
              No enrichment data available for this signal yet.
            </div>
          )}

          {!loading && v3Data && activeSnapshot && (
            <>
              {activeTab === 'all' && (
                <AllTabContent facts={facts} tags={tags} tagsAnnotated={tagsAnnotated} />
              )}
              {activeTab === 'm15' && <TimeframeTabContent facts={facts} tf="m15" />}
              {activeTab === 'h1' && <TimeframeTabContent facts={facts} tf="h1" />}
              {activeTab === 'h4' && <TimeframeTabContent facts={facts} tf="h4" />}
              {activeTab === 'context' && <ContextTabContent facts={facts} />}

              {/* History expand */}
              <div className="mt-4 pt-3 border-t border-white/5">
                <button
                  onClick={handleLoadHistory}
                  className="text-[10px] text-gold-primary hover:text-gold-light transition"
                >
                  {showHistory ? '▼ Hide' : '▶ Show'} snapshot history
                </button>

                {showHistory && history && (
                  <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                    {history.length === 0 && (
                      <p className="text-text-muted text-[10px]">No history yet</p>
                    )}
                    {history.map((entry, i) => (
                      <div key={i} className="bg-[#0d0d0d] rounded border border-white/5 p-2">
                        <p className="text-[9px] text-text-muted mb-1">
                          {new Date(entry.recorded_at).toLocaleString()}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(entry.snapshot?.tags || [])
                            .filter((t) => (entry.snapshot?.tags_annotated || []).find((ta) => ta.name === t && ta.important))
                            .slice(0, 10)
                            .map((t) => <Tag key={t} name={t} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// LEGACY FALLBACK (for signals not yet enriched with v3)
// ============================================================

const LegacyFallback = ({ enrichment }) => {
  return (
    <div>
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-3 mb-4">
        <p className="text-yellow-400 text-[10px]">
          ⚠ This signal uses legacy enrichment (v2.x). It will be re-analyzed with v3 soon.
        </p>
      </div>
      <Section title="Legacy Data">
        <FactRow label="Score" value={enrichment.confidence_score ?? '—'} />
        <FactRow label="Rating" value={enrichment.rating || '—'} />
        <FactRow label="MTF M15" value={enrichment.mtf_m15_trend || '—'} />
        <FactRow label="MTF H1" value={enrichment.mtf_h1_trend || '—'} />
        <FactRow label="MTF H4" value={enrichment.mtf_h4_trend || '—'} />
        <FactRow label="BTC trend" value={enrichment.btc_trend || '—'} />
        <FactRow label="F&G" value={enrichment.fear_greed ?? '—'} />
      </Section>
    </div>
  );
};

export default DeepAnalysis;