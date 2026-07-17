import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import CoinLogo from './CoinLogo';
import { Skeleton, ShimmerStyles } from './ui/Loaders';

/**
 * DeepAnalysis v3 — Facts + Tags UI (redesigned shell)
 *
 * Design philosophy: "Inform, don't decide"
 * - No confidence score, no rating
 * - Raw facts with descriptive tags
 * - Hero summary band (at-a-glance) + tabbed timeframe view
 * - Responsive shell matching SignalModal: dynamic width on desktop,
 *   full-screen sheet on mobile, gold hairline + glow.
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

const trendColor = (t) => {
  const v = (t || '').toUpperCase();
  if (v.includes('BULL')) return 'text-green-400';
  if (v.includes('BEAR')) return 'text-red-400';
  return 'text-gray-400';
};

const dirPillClass = (dir) => {
  const v = (dir || '').toUpperCase();
  if (v.includes('BULL') || v === 'LONG') return 'bg-green-500/15 text-green-400 border border-green-500/30';
  if (v.includes('BEAR') || v === 'SHORT') return 'bg-red-500/15 text-red-400 border border-red-500/30';
  return 'bg-gray-500/15 text-gray-400 border border-gray-500/30';
};

const fngColor = (val) => {
  const n = Number(val);
  if (isNaN(n)) return 'text-text-primary';
  if (n <= 25) return 'text-red-400';
  if (n >= 75) return 'text-green-400';
  return 'text-yellow-400';
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
    return 'bg-ink/5 text-text-primary/70 border-ink/10';
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
// FACT ROW + SECTION (for tab views)
// ============================================================

const FactRow = ({ label, value, subtle = false }) => (
  <div className="flex items-center justify-between py-1 border-b border-ink/5 last:border-b-0">
    <span className="text-[10px] text-text-muted uppercase tracking-wider">{label}</span>
    <span className={`text-[11px] font-mono ${subtle ? 'text-text-primary/60' : 'text-text-primary'}`}>{value}</span>
  </div>
);

const Section = ({ title, children }) => (
  <div className="bg-surface-raised rounded-lg border border-ink/5 p-3 space-y-1 h-full">
    <p className="text-[9px] text-gold-primary/60 uppercase tracking-wider font-semibold mb-2">{title}</p>
    {children}
  </div>
);

// ============================================================
// HERO SUMMARY (at-a-glance band, always visible)
// ============================================================

const HeroSummary = ({ facts, tagsAnnotated, direction }) => {
  const byTf = facts?.by_timeframe || {};
  const ctx = facts?.context || {};
  const h1 = byTf.h1 || {};

  const triad = [
    { tf: 'M15', t: byTf.m15?.trend?.trend },
    { tf: 'H1', t: byTf.h1?.trend?.trend },
    { tf: 'H4', t: byTf.h4?.trend?.trend },
  ];

  const importantTags = (tagsAnnotated || [])
    .filter((x) => x.important)
    .map((x) => x.name)
    .slice(0, 6);

  const btcChange = ctx.btc?.price_change_pct;
  const btcColor = btcChange == null ? 'text-text-primary' : Number(btcChange) >= 0 ? 'text-green-400' : 'text-red-400';

  const stats = [
    { label: 'H1 RSI', value: formatNum(h1.momentum?.rsi, 1), sub: h1.momentum?.rsi_state, color: 'text-text-primary' },
    { label: 'H1 ADX', value: formatNum(h1.trend?.adx, 1), sub: h1.trend?.trend_strength, color: 'text-text-primary' },
    { label: 'BTC 24h', value: formatPct(btcChange), sub: `dom ${formatNum(ctx.btc?.dominance, 1)}%`, color: btcColor },
    { label: 'Fear & Greed', value: ctx.fng?.value ?? '—', sub: ctx.fng?.classification, color: fngColor(ctx.fng?.value) },
    { label: 'Volatility', value: ctx.environment?.volatility_regime || '?', sub: `ATR P${formatNum(ctx.environment?.atr_percentile_h4, 0)}`, color: 'text-text-primary' },
  ];

  return (
    <div className="bg-gradient-to-br from-gold-primary/15 to-gold-primary/5 rounded-xl border border-line/30 p-3 sm:p-4">
      {/* Top: bias + multi-timeframe trend triad */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider text-gold-primary/70 font-semibold">Bias</span>
          <span className={`text-sm font-bold ${trendColor(direction)}`}>{direction || '—'}</span>
        </div>
        <div className="flex items-center gap-2.5">
          {triad.map((x) => (
            <div key={x.tf} className="flex items-center gap-1">
              <span className="text-[9px] text-text-muted font-mono">{x.tf}</span>
              <span className={`text-[10px] font-semibold ${trendColor(x.t)}`}>{x.t || '?'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {stats.map((s, i) => (
          <div key={i} className="bg-surface-raised/70 rounded-lg border border-ink/5 px-2.5 py-2">
            <p className="text-[8px] uppercase tracking-wider text-text-muted">{s.label}</p>
            <p className={`text-sm font-mono font-bold leading-tight ${s.color}`}>{s.value}</p>
            {s.sub && <p className="text-[8px] text-text-primary/40 truncate">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Key tags */}
      {importantTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {importantTags.map((t) => <Tag key={t} name={t} important />)}
        </div>
      )}
    </div>
  );
};

// ============================================================
// TAB CONTENT — ALL (full detail cards in a responsive grid)
// ============================================================

const AllTabContent = ({ facts, tagsAnnotated }) => {
  const byTf = facts?.by_timeframe || {};
  const h1 = byTf.h1 || {};
  const eq = facts?.entry_quality || {};
  const structure = facts?.structure || {};
  const context = facts?.context || {};

  const detailTags = (tagsAnnotated || []).filter((t) => !t.important).map((t) => t.name);
  const [showAllTags, setShowAllTags] = useState(false);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {/* Trend */}
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
      </div>

      {/* Detail tags (collapsible) — full width */}
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
// TAB CONTENT — Single Timeframe (responsive grid)
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
// TAB CONTENT — CONTEXT (responsive grid)
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
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
  const [isClosing, setIsClosing] = useState(false);

  // Fetch v3 enrichment data
  useEffect(() => {
    if (!isOpen || !signalId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/enrichment/v3/${signalId}`, {
      headers: (() => {
        const token = localStorage.getItem('access_token');
        return token ? { Authorization: `Bearer ${token}` } : {};
      })(),
    })
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

  // Animated close (mirrors SignalModal)
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  // Copy to clipboard handler
  const handleCopy = async (format) => {
    setShowCopyMenu(false);
    if (!v3Data) return;

    try {
      let content;
      if (format === 'json') {
        content = JSON.stringify(v3Data, null, 2);
      } else if (format === 'markdown') {
        const token = localStorage.getItem('access_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const resp = await fetch(`/api/v1/enrichment/v3/${signalId}/export/md`, { headers });
        content = await resp.text();
      } else if (format === 'prompt') {
        const token = localStorage.getItem('access_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const resp = await fetch(`/api/v1/enrichment/v3/${signalId}/export/prompt`, { headers });
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
      const token = localStorage.getItem('access_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const resp = await fetch(`/api/v1/enrichment/v3/${signalId}/history?limit=50`, { headers });
      const data = await resp.json();
      setHistory(data.history || []);
      setShowHistory(true);
    } catch (err) {
      setError('Failed to load history');
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <>
      <div className={`da-modal-overlay ${isClosing ? 'da-modal-closing' : ''}`}>
        <div className="da-modal-backdrop" onClick={handleClose} />
        <div className="da-modal-container">
          <div className="da-modal-content">
            {/* Drag handle mobile */}
            <div className="sm:hidden flex-shrink-0 flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-ink/20" />
            </div>

            {/* HEADER */}
            <div className="z-10 flex-shrink-0 border-b border-ink/[0.06] bg-surface-raised px-3 py-2.5 sm:px-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <CoinLogo pair={pair} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-text-primary font-display text-sm font-semibold truncate">{pair}</h2>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0 ${dirPillClass(signalDir)}`}>
                        {signalDir}
                      </span>
                    </div>
                    <p className="text-text-muted text-[10px] truncate">Signal Analysis</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Copy dropdown */}
                  {v3Data && (
                    <div className="relative">
                      <button
                        onClick={() => setShowCopyMenu(!showCopyMenu)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-gold-primary/10 hover:bg-gold-primary/20 border border-line/30 hover:border-line/60 rounded-lg text-gold-primary text-[10px] sm:text-[11px] font-semibold transition-all"
                      >
                        📋 Copy ▼
                      </button>
                      {showCopyMenu && (
                        <div className="absolute right-0 top-full mt-1 bg-surface-raised border border-line/30 rounded-lg shadow-xl overflow-hidden z-20 min-w-[180px]">
                          {COPY_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              onClick={() => handleCopy(opt.id)}
                              className="block w-full text-left px-3 py-2 text-[11px] text-text-primary hover:bg-gold-primary/10 transition"
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
                    onClick={handleClose}
                    className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-primary bg-surface-raised hover:bg-red-500/20 border border-line/20 hover:border-red-500/50 rounded-lg transition-all flex-shrink-0"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Tabs */}
            {v3Data && (
              <div className="flex flex-shrink-0 border-b border-ink/5 bg-surface-raised">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 px-3 py-2 text-[11px] font-semibold transition border-b-2 ${
                      activeTab === tab.id
                        ? 'border-gold-primary text-gold-primary'
                        : 'border-transparent text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Snapshot selector (Entry vs Live) */}
            {v3Data && v3Data.live_snapshot && v3Data.live_updated_at && (
              <div className="flex items-center gap-2 px-4 py-2 bg-surface-raised border-b border-ink/5 flex-shrink-0">
                <button
                  onClick={() => setShowLive(false)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition ${
                    !showLive ? 'bg-gold-primary/20 text-gold-primary' : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Entry snapshot
                </button>
                <button
                  onClick={() => setShowLive(true)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition ${
                    showLive ? 'bg-gold-primary/20 text-gold-primary' : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Live ({timeAgo(v3Data.live_updated_at)})
                </button>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-surface-raised">
              <div className="max-w-6xl mx-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
                {loading && (
                  <div className="space-y-4 py-2" role="status" aria-label="Loading analysis">
                    <ShimmerStyles />
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 !rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-2.5 w-24" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}
                    </div>
                    <Skeleton className="h-40 w-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-5/6" />
                      <Skeleton className="h-3 w-4/6" />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-xs">
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
                    <HeroSummary facts={facts} tagsAnnotated={tagsAnnotated} direction={signalDir} />

                    {activeTab === 'all' && (
                      <AllTabContent facts={facts} tagsAnnotated={tagsAnnotated} />
                    )}
                    {activeTab === 'm15' && <TimeframeTabContent facts={facts} tf="m15" />}
                    {activeTab === 'h1' && <TimeframeTabContent facts={facts} tf="h1" />}
                    {activeTab === 'h4' && <TimeframeTabContent facts={facts} tf="h4" />}
                    {activeTab === 'context' && <ContextTabContent facts={facts} />}

                    {/* History expand */}
                    <div className="pt-3 border-t border-ink/5">
                      <button
                        onClick={handleLoadHistory}
                        className="text-[10px] text-gold-primary hover:text-gold-light transition"
                      >
                        {showHistory ? '▼ Hide' : '▶ Show'} snapshot history
                      </button>

                      {showHistory && history && (
                        <div className="mt-3 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                          {history.length === 0 && (
                            <p className="text-text-muted text-[10px]">No history yet</p>
                          )}
                          {history.map((entry, i) => (
                            <div key={i} className="bg-surface-raised rounded border border-ink/5 p-2">
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
        </div>
      </div>

      {/* === STYLES === */}
      <style>{`
        /* MUST sit above SignalModal (200000) — nested shell */
        .da-modal-overlay { position: fixed; inset: 0; z-index: 210000; display: flex; align-items: flex-end; justify-content: center; isolation: isolate; }
        .da-modal-backdrop { position: absolute; inset: 0; background: rgb(var(--scrim) / 0.85); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
        .da-modal-container { position: relative; z-index: 1; width: 100%; height: 100%; max-height: 100%; display: flex; align-items: flex-end; justify-content: center; padding: 0; pointer-events: none; }
        .da-modal-container > * { pointer-events: auto; }
        .da-modal-content { position: relative; width: 100%; max-width: 1100px; height: min(92dvh, 100%); max-height: min(92dvh, 100%); min-height: min(70dvh, 92dvh); background: rgb(var(--surface-raised)); border-top: 1px solid rgb(var(--ink) / 0.08); border-radius: 16px 16px 0 0; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 -16px 48px rgb(var(--scrim) / 0.35); animation: daUp .32s cubic-bezier(.16,1,.3,1); }

        @media(min-width:640px) {
          .da-modal-overlay { align-items: center; }
          .da-modal-container { align-items: center; padding: 12px; }
          .da-modal-content { height: auto; min-height: 0; max-height: calc(100vh - 24px); border-radius: 12px; border: 1px solid rgb(var(--ink) / 0.08); box-shadow: 0 24px 64px rgb(var(--scrim) / 0.35); animation: daCI .3s cubic-bezier(.16,1,.3,1); }
        }
        @media(min-width:1024px) {
          .da-modal-container { padding: 20px; }
          .da-modal-content { max-height: 880px; }
        }
        @supports(height:100dvh) { .da-modal-overlay { height: 100dvh; } }

        .da-modal-backdrop { animation: daBI .25s ease-out; }
        .da-modal-closing .da-modal-backdrop { animation: daBO .2s ease-in forwards; }
        .da-modal-closing .da-modal-content { animation: daDn .2s ease-in forwards; }
        @media(min-width:640px) {
          .da-modal-closing .da-modal-content { animation: daCO .2s ease-in forwards; }
        }
        @keyframes daBI { from{opacity:0} to{opacity:1} }
        @keyframes daBO { from{opacity:1} to{opacity:0} }
        @keyframes daCI { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
        @keyframes daCO { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(.97)} }
        @keyframes daUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes daDn { from{transform:translateY(0)} to{transform:translateY(100%)} }

        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(212,168,83,.3); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(212,168,83,.5); }
      `}</style>
    </>
  );

  return createPortal(modalContent, document.body);
};

// ============================================================
// LEGACY FALLBACK (for signals not yet enriched with v3)
// ============================================================

const LegacyFallback = ({ enrichment }) => {
  return (
    <div>
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
        <p className="text-yellow-400 text-[10px]">
          ⚠ This signal uses legacy enrichment (v2.x). It will be re-analyzed soon.
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