import { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, ReferenceLine, Cell, LineChart, Line, Legend } from 'recharts';
import SignalModal from './SignalModal';
import CoinLogo from './CoinLogo';

const API_BASE = '/api/v1';

const AnalyzePage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [timeRange, setTimeRange] = useState('all');
  const [trendMode, setTrendMode] = useState('weekly');

  const [signals, setSignals] = useState([]);
  const [sigLoading, setSigLoading] = useState(false);
  const [sigPage, setSigPage] = useState(1);
  const [sigTotalPages, setSigTotalPages] = useState(1);
  const [sigTotal, setSigTotal] = useState(0);
  const [sigSearch, setSigSearch] = useState('');
  const [sigStatus, setSigStatus] = useState('all');
  const [sigRisk, setSigRisk] = useState('all');
  const [sigSort, setSigSort] = useState('created_at');
  const [sigOrder, setSigOrder] = useState('desc');
  const [selectedSignal, setSelectedSignal] = useState(null);

  // Mobile filter toggle for signal history
  const [showSigFilters, setShowSigFilters] = useState(false);

  useEffect(() => { fetchAnalyzeData(); }, [timeRange, trendMode]);
  useEffect(() => { fetchSignals(); }, [sigPage, sigSearch, sigStatus, sigRisk, sigSort, sigOrder]);
  useEffect(() => { setSigPage(1); }, [sigSearch, sigStatus, sigRisk, sigSort, sigOrder]);

  const fetchAnalyzeData = async () => {
    try {
      setLoading(true); setError(null);
      const params = new URLSearchParams();
      if (timeRange !== 'all') params.append('time_range', timeRange);
      params.append('trend_mode', trendMode);
      const response = await fetch(`${API_BASE}/signals/analyze?${params}`);
      if (!response.ok) throw new Error('Failed to fetch');
      setData(await response.json());
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const fetchSignals = useCallback(async () => {
    try {
      setSigLoading(true);
      const params = new URLSearchParams({
        page: sigPage.toString(), page_size: '20',
        sort_by: sigSort, sort_order: sigOrder,
      });
      if (sigSearch) params.append('pair', sigSearch.toUpperCase());
      if (sigStatus !== 'all') params.append('status', sigStatus);
      if (sigRisk !== 'all') params.append('risk_level', sigRisk);
      const res = await fetch(`${API_BASE}/signals/?${params}`);
      if (!res.ok) throw new Error('Failed');
      const d = await res.json();
      setSignals(d.items || []);
      setSigTotalPages(d.total_pages || 1);
      setSigTotal(d.total || 0);
    } catch (err) { console.error(err); } finally { setSigLoading(false); }
  }, [sigPage, sigSearch, sigStatus, sigRisk, sigSort, sigOrder]);

  const timeRangeOptions = [
    { value: 'all', label: 'All Time', short: 'All' },
    { value: 'ytd', label: 'YTD', short: 'YTD' },
    { value: '30d', label: '30 Days', short: '30D' },
    { value: '7d', label: '7 Days', short: '7D' },
  ];

  if (loading) return <LoadingSkeleton />;
  if (error) return (
    <div className="flex flex-col items-center justify-center h-96 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
      </div>
      <p className="text-red-400 text-lg mb-2">Failed to load analysis</p>
      <p className="text-text-muted text-sm mb-4">{error}</p>
      <button onClick={fetchAnalyzeData} className="px-5 py-2.5 bg-gold-primary/20 text-gold-primary rounded-xl hover:bg-gold-primary/30 transition-all font-medium text-sm">Retry</button>
    </div>
  );
  if (!data) return null;

  const sigActiveFilters = [sigSearch !== '', sigStatus !== 'all', sigRisk !== 'all'].filter(Boolean).length;

  return (
    <div className="space-y-5 lg:space-y-6">
      
      {/* ═══════════════════════════════════════════ */}
      {/* HEADER + TIME RANGE                        */}
      {/* ═══════════════════════════════════════════ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 lg:w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <div>
            <h2 className="font-display text-xl lg:text-2xl font-semibold text-white">Performance Analytics</h2>
            <p className="text-text-muted text-[10px] lg:text-xs mt-0.5">
              {data.stats.total_signals.toLocaleString()} signals analyzed
            </p>
          </div>
        </div>
        <div className="flex bg-bg-card/80 rounded-xl p-1 border border-gold-primary/10">
          {timeRangeOptions.map(opt => (
            <button key={opt.value} onClick={() => setTimeRange(opt.value)}
              className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg text-[10px] lg:text-xs font-semibold transition-all ${
                timeRange === opt.value
                  ? 'bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary shadow-lg shadow-gold-primary/20'
                  : 'text-text-muted hover:text-white'
              }`}>
              <span className="sm:hidden">{opt.short}</span>
              <span className="hidden sm:inline">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* HERO STATS ROW                             */}
      {/* ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3">
        <HeroStat
          label="Total Signals"
          value={data.stats.total_signals.toLocaleString()}
          accent="blue"
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>}
        />
        <HeroStat
          label="Closed"
          value={data.stats.closed_trades.toLocaleString()}
          sub={`${data.stats.open_signals} open`}
          accent="purple"
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <HeroStat
          label="Win Rate"
          value={`${data.stats.win_rate.toFixed(1)}%`}
          accent={data.stats.win_rate >= 75 ? 'green' : data.stats.win_rate >= 55 ? 'yellow' : 'red'}
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>}
          highlight
        />
        <HeroStat
          label="Winners"
          value={data.stats.total_winners.toLocaleString()}
          accent="green"
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172" /></svg>}
        />
        <HeroStat
          label="Stop Loss"
          value={data.stats.sl_count.toLocaleString()}
          accent="red"
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" /></svg>}
        />
        <HeroStat
          label="Active Pairs"
          value={data.stats.active_pairs}
          accent="cyan"
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" /></svg>}
        />
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* WIN RATE TREND CHART                       */}
      {/* ═══════════════════════════════════════════ */}
      <div className="glass-card rounded-2xl p-4 lg:p-6 border border-gold-primary/10 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/20 to-transparent" />
        <div className="flex items-center justify-between mb-4 lg:mb-5 flex-wrap gap-3">
          <div>
            <h3 className="text-white font-semibold text-base lg:text-lg">Win Rate Trend</h3>
            <p className="text-text-muted text-[10px] lg:text-xs mt-0.5">Historical performance over time</p>
          </div>
          <div className="flex bg-bg-card/60 rounded-lg p-0.5 border border-gold-primary/10">
            {['daily', 'weekly'].map(m => (
              <button key={m} onClick={() => setTrendMode(m)}
                className={`px-3 py-1.5 rounded-md text-[10px] lg:text-xs font-semibold transition-all ${
                  trendMode === m
                    ? 'bg-gold-primary/20 text-gold-primary'
                    : 'text-text-muted hover:text-white'
                }`}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <WinRateTrendChart data={data.win_rate_trend} mode={trendMode} />
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* R:R + OUTCOME BREAKDOWN (side by side)     */}
      {/* ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
        {/* Risk:Reward */}
        <div className="glass-card rounded-2xl p-4 lg:p-6 border border-gold-primary/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
          <div className="mb-3 lg:mb-4">
            <h3 className="text-white font-semibold text-base lg:text-lg">Risk : Reward</h3>
            <p className="text-text-muted text-[10px] lg:text-xs mt-0.5">
              Average R:R per target · Overall <span className="text-gold-primary font-mono font-semibold">{data.avg_risk_reward?.toFixed(2) || '0'}R</span>
            </p>
          </div>
          <RiskRewardChart data={data.risk_reward} />
        </div>

        {/* Outcome Breakdown */}
        <div className="glass-card rounded-2xl p-4 lg:p-6 border border-gold-primary/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green-500/20 to-transparent" />
          <div className="mb-3 lg:mb-4">
            <h3 className="text-white font-semibold text-base lg:text-lg">Outcome Breakdown</h3>
            <p className="text-text-muted text-[10px] lg:text-xs mt-0.5">{data.stats.closed_trades.toLocaleString()} closed trades</p>
          </div>
          <TPBreakdown data={data.stats} />
        </div>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* RISK LEVEL ANALYSIS                        */}
      {/* ═══════════════════════════════════════════ */}
      <div className="glass-card rounded-2xl p-4 lg:p-6 border border-gold-primary/10 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
        <div className="mb-4 lg:mb-5">
          <h3 className="text-white font-semibold text-base lg:text-lg">Risk Level Analysis</h3>
          <p className="text-text-muted text-[10px] lg:text-xs mt-0.5">Performance breakdown by signal risk level</p>
        </div>

        {(!data.risk_distribution || data.risk_distribution.length === 0) ? (
          <div className="text-center py-8 text-text-muted text-sm">Loading risk data...</div>
        ) : (
          <>
            {/* Risk Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4 mb-5">
              {data.risk_distribution.map((rd) => {
                const colorMap = {
                  'Low': { border: 'border-green-500/20', bg: 'from-green-500/[0.08] to-green-500/[0.02]', text: 'text-green-400', dot: 'bg-green-500', ring: 'ring-green-500/20', glow: 'shadow-green-500/10' },
                  'Normal': { border: 'border-yellow-500/20', bg: 'from-yellow-500/[0.08] to-yellow-500/[0.02]', text: 'text-yellow-400', dot: 'bg-yellow-500', ring: 'ring-yellow-500/20', glow: 'shadow-yellow-500/10' },
                  'High': { border: 'border-red-500/20', bg: 'from-red-500/[0.08] to-red-500/[0.02]', text: 'text-red-400', dot: 'bg-red-500', ring: 'ring-red-500/20', glow: 'shadow-red-500/10' },
                };
                const c = colorMap[rd.risk_level] || colorMap['Normal'];
                const winPct = rd.closed_trades > 0 ? (rd.winners / rd.closed_trades * 100) : 0;
                const totalSig = data.risk_distribution.reduce((s, r) => s + r.total_signals, 0);
                const pct = totalSig > 0 ? (rd.total_signals / totalSig * 100).toFixed(1) : '0';

                return (
                  <div key={rd.risk_level} className={`rounded-xl p-4 lg:p-5 bg-gradient-to-b ${c.bg} border ${c.border} shadow-lg ${c.glow}`}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${c.dot} ring-4 ${c.ring}`} />
                        <span className={`font-bold text-sm ${c.text}`}>{rd.risk_level}</span>
                      </div>
                      <span className="text-text-muted text-[10px] font-mono bg-bg-card/50 px-2 py-0.5 rounded-full">{pct}%</span>
                    </div>

                    {/* Win Rate - big number */}
                    <p className={`text-3xl lg:text-4xl font-bold font-mono ${c.text} leading-none`}>{rd.win_rate.toFixed(1)}%</p>
                    <p className="text-text-muted text-[10px] mt-1 mb-3">Win Rate</p>

                    {/* W/L visual bar */}
                    <div className="h-2 rounded-full overflow-hidden flex bg-bg-card/50 mb-2">
                      <div className="h-full bg-green-500/80 rounded-l-full transition-all duration-700" style={{ width: `${winPct}%` }} />
                      <div className="h-full bg-red-500/80 rounded-r-full transition-all duration-700" style={{ width: `${100 - winPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] mb-3">
                      <span className="text-green-400 font-mono">{rd.winners.toLocaleString()} W</span>
                      <span className="text-red-400 font-mono">{rd.losers.toLocaleString()} L</span>
                    </div>

                    {/* Footer stats */}
                    <div className="pt-3 border-t border-white/5 grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-text-muted text-[9px] uppercase tracking-wider">Signals</p>
                        <p className="text-white text-sm font-bold font-mono">{rd.total_signals.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-text-muted text-[9px] uppercase tracking-wider">Avg R:R</p>
                        <p className="text-white text-sm font-bold font-mono">{rd.avg_rr > 0 ? `${rd.avg_rr.toFixed(2)}R` : '-'}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Signal Distribution donut */}
            {(() => {
              const totalSig = data.risk_distribution.reduce((s, r) => s + r.total_signals, 0);
              const colors = { 'Low': '#22C55E', 'Normal': '#EAB308', 'High': '#EF4444' };
              if (totalSig === 0) return null;
              return (
                <div className="flex flex-col sm:flex-row items-center gap-4 p-3 lg:p-4 rounded-xl bg-bg-card/30 border border-gold-primary/5">
                  {/* Visual bar */}
                  <div className="w-full sm:w-64 h-3 rounded-full overflow-hidden flex bg-bg-card/80 flex-shrink-0">
                    {data.risk_distribution.map((rd, i) => (
                      <div key={i} className="h-full transition-all duration-700" style={{ width: `${(rd.total_signals / totalSig * 100)}%`, backgroundColor: colors[rd.risk_level] }} />
                    ))}
                  </div>
                  <div className="flex items-center gap-4">
                    {data.risk_distribution.map((rd) => (
                      <div key={rd.risk_level} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[rd.risk_level] }} />
                        <span className="text-text-muted text-[10px]">{rd.risk_level}</span>
                        <span className="text-white text-[10px] font-mono font-semibold">{(rd.total_signals / totalSig * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Risk Trend Chart */}
            {data.risk_trend && data.risk_trend.length > 0 && (
              <div className="mt-5">
                <p className="text-text-muted text-[10px] uppercase tracking-wider mb-3">Win Rate Trend by Risk Level</p>
                <RiskTrendChart data={data.risk_trend} mode={trendMode} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* FULL SIGNAL HISTORY                        */}
      {/* ═══════════════════════════════════════════ */}
      <div className="glass-card rounded-2xl border border-gold-primary/10 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/20 to-transparent" />
        
        {/* Header */}
        <div className="p-4 lg:p-6 pb-0 lg:pb-0">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-white font-semibold text-base lg:text-lg">Full Signal History</h3>
              <p className="text-text-muted text-[10px] lg:text-xs mt-0.5">{sigTotal.toLocaleString()} total signals — all time</p>
            </div>
          </div>
        </div>

        {/* Filters - collapsible on mobile */}
        <div className="px-4 lg:px-6">
          {/* Mobile toggle */}
          <button
            onClick={() => setShowSigFilters(!showSigFilters)}
            className="lg:hidden w-full flex items-center justify-between py-2.5 mb-2"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span className="text-white text-xs font-medium">Filters</span>
              {sigActiveFilters > 0 && (
                <span className="bg-gold-primary text-bg-primary text-[9px] font-bold px-1.5 py-0.5 rounded-full">{sigActiveFilters}</span>
              )}
            </div>
            <svg className={`w-4 h-4 text-text-muted transition-transform ${showSigFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div className={`${showSigFilters ? 'block' : 'hidden'} lg:block pb-4 border-b border-gold-primary/10`}>
            <div className="flex flex-col sm:flex-row flex-wrap items-end gap-2 lg:gap-3">
              <div className="flex-1 min-w-0 w-full sm:w-auto sm:min-w-[160px]">
                <label className="text-gold-primary text-[10px] font-semibold uppercase tracking-wider mb-1 block">Search Pair</label>
                <input type="text" placeholder="BTC, ETH, SOL..." value={sigSearch}
                  onChange={(e) => setSigSearch(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm placeholder-text-muted focus:outline-none focus:border-gold-primary/50 transition-colors" />
              </div>
              <div className="w-full sm:w-auto">
                <label className="text-gold-primary text-[10px] font-semibold uppercase tracking-wider mb-1 block">Status</label>
                <select value={sigStatus} onChange={(e) => setSigStatus(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm focus:outline-none focus:border-gold-primary/50">
                  <option value="all">All Status</option>
                  <option value="open">Open</option>
                  <option value="tp1">TP1</option>
                  <option value="tp2">TP2</option>
                  <option value="tp3">TP3</option>
                  <option value="closed_win">TP4 (Win)</option>
                  <option value="closed_loss">Loss</option>
                </select>
              </div>
              <div className="w-full sm:w-auto">
                <label className="text-gold-primary text-[10px] font-semibold uppercase tracking-wider mb-1 block">Risk</label>
                <select value={sigRisk} onChange={(e) => setSigRisk(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm focus:outline-none focus:border-gold-primary/50">
                  <option value="all">All Risk</option>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="w-full sm:w-auto">
                <label className="text-gold-primary text-[10px] font-semibold uppercase tracking-wider mb-1 block">Sort</label>
                <select value={sigSort} onChange={(e) => setSigSort(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm focus:outline-none focus:border-gold-primary/50">
                  <option value="created_at">Date</option>
                  <option value="pair">Pair</option>
                  <option value="entry">Entry</option>
                  <option value="risk_level">Risk</option>
                </select>
              </div>
              <button onClick={() => setSigOrder(sigOrder === 'desc' ? 'asc' : 'desc')}
                className="px-3 py-2 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm hover:border-gold-primary/40 transition-colors flex items-center gap-1.5">
                <span>{sigOrder === 'desc' ? '↓' : '↑'}</span>
                <span className="text-xs">{sigOrder === 'desc' ? 'Newest' : 'Oldest'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="px-4 lg:px-6 py-4">
          <FullSignalTable signals={signals} loading={sigLoading} onSelect={setSelectedSignal} />
        </div>

        {/* Pagination */}
        {sigTotalPages > 1 && (
          <div className="flex items-center justify-between px-4 lg:px-6 py-3 lg:py-4 border-t border-gold-primary/10">
            <p className="text-text-muted text-xs lg:text-sm">
              <span className="hidden sm:inline">Page </span>{sigPage} / {sigTotalPages}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setSigPage(p => Math.max(1, p - 1))} disabled={sigPage <= 1}
                className="px-3 lg:px-4 py-1.5 lg:py-2 bg-bg-card border border-gold-primary/20 rounded-lg text-text-secondary hover:text-white disabled:opacity-40 disabled:cursor-not-allowed text-xs lg:text-sm transition-colors">← Prev</button>
              <button onClick={() => setSigPage(p => Math.min(sigTotalPages, p + 1))} disabled={sigPage >= sigTotalPages}
                className="px-3 lg:px-4 py-1.5 lg:py-2 bg-bg-card border border-gold-primary/20 rounded-lg text-text-secondary hover:text-white disabled:opacity-40 disabled:cursor-not-allowed text-xs lg:text-sm transition-colors">Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      <SignalModal signal={selectedSignal} isOpen={!!selectedSignal} onClose={() => setSelectedSignal(null)} />
    </div>
  );
};


// ============================================
// HERO STAT CARD (enhanced)
// ============================================
const accentMap = {
  blue:   { bg: 'from-blue-500/[0.08] to-blue-500/[0.02]', border: 'border-blue-500/15', text: 'text-blue-400', icon: 'bg-blue-500/15 text-blue-400' },
  purple: { bg: 'from-purple-500/[0.08] to-purple-500/[0.02]', border: 'border-purple-500/15', text: 'text-purple-400', icon: 'bg-purple-500/15 text-purple-400' },
  green:  { bg: 'from-green-500/[0.08] to-green-500/[0.02]', border: 'border-green-500/15', text: 'text-green-400', icon: 'bg-green-500/15 text-green-400' },
  yellow: { bg: 'from-yellow-500/[0.08] to-yellow-500/[0.02]', border: 'border-yellow-500/15', text: 'text-yellow-400', icon: 'bg-yellow-500/15 text-yellow-400' },
  red:    { bg: 'from-red-500/[0.08] to-red-500/[0.02]', border: 'border-red-500/15', text: 'text-red-400', icon: 'bg-red-500/15 text-red-400' },
  cyan:   { bg: 'from-cyan-500/[0.08] to-cyan-500/[0.02]', border: 'border-cyan-500/15', text: 'text-cyan-400', icon: 'bg-cyan-500/15 text-cyan-400' },
  gold:   { bg: 'from-gold-primary/[0.08] to-gold-primary/[0.02]', border: 'border-gold-primary/15', text: 'text-gold-primary', icon: 'bg-gold-primary/15 text-gold-primary' },
};

const HeroStat = ({ label, value, sub, accent = 'gold', icon, highlight }) => {
  const a = accentMap[accent] || accentMap.gold;
  return (
    <div className={`rounded-xl p-3 lg:p-4 bg-gradient-to-b ${a.bg} border ${a.border} ${highlight ? 'ring-1 ring-gold-primary/20' : ''}`}>
      <div className="flex items-center justify-between mb-1.5 lg:mb-2">
        <p className="text-text-muted text-[9px] lg:text-[10px] uppercase tracking-wider font-semibold">{label}</p>
        <div className={`w-6 h-6 lg:w-7 lg:h-7 rounded-lg ${a.icon} flex items-center justify-center`}>{icon}</div>
      </div>
      <p className={`text-xl lg:text-2xl font-display font-bold ${a.text}`}>{value}</p>
      {sub && <p className="text-text-muted text-[10px] mt-0.5">{sub}</p>}
    </div>
  );
};


// ============================================
// TP BREAKDOWN — enhanced stacked bar + grid
// ============================================
const TPBreakdown = ({ data }) => {
  const total = data.tp1_count + data.tp2_count + data.tp3_count + data.tp4_count + data.sl_count;
  if (total === 0) return <div className="h-40 flex items-center justify-center text-text-muted text-sm">No closed trades</div>;

  const items = [
    { label: 'TP1', count: data.tp1_count, color: '#22C55E', bg: 'from-green-500/10 to-green-500/[0.02]', text: 'text-green-400', border: 'border-green-500/15' },
    { label: 'TP2', count: data.tp2_count, color: '#84CC16', bg: 'from-lime-500/10 to-lime-500/[0.02]', text: 'text-lime-400', border: 'border-lime-500/15' },
    { label: 'TP3', count: data.tp3_count, color: '#EAB308', bg: 'from-yellow-500/10 to-yellow-500/[0.02]', text: 'text-yellow-400', border: 'border-yellow-500/15' },
    { label: 'TP4', count: data.tp4_count, color: '#F97316', bg: 'from-orange-500/10 to-orange-500/[0.02]', text: 'text-orange-400', border: 'border-orange-500/15' },
    { label: 'SL',  count: data.sl_count,  color: '#EF4444', bg: 'from-red-500/10 to-red-500/[0.02]', text: 'text-red-400', border: 'border-red-500/15' },
  ];

  return (
    <div>
      {/* Stacked bar */}
      <div className="h-3 lg:h-4 rounded-full overflow-hidden flex bg-bg-card/80 border border-white/5 mb-4">
        {items.filter(i => i.count > 0).map((item, idx) => (
          <div key={idx} style={{ width: `${(item.count / total * 100)}%`, backgroundColor: item.color }}
            className="h-full transition-all duration-700 relative group first:rounded-l-full last:rounded-r-full">
            {(item.count / total * 100) > 10 && (
              <span className="absolute inset-0 flex items-center justify-center text-[8px] lg:text-[9px] font-bold text-white/90 drop-shadow">
                {(item.count / total * 100).toFixed(0)}%
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Cards - 5 cols on desktop, scroll or wrap on mobile */}
      <div className="grid grid-cols-5 gap-1.5 lg:gap-2">
        {items.map((item, i) => (
          <div key={i} className={`rounded-lg p-2 lg:p-3 bg-gradient-to-b ${item.bg} border ${item.border} text-center`}>
            <p className={`text-[10px] lg:text-xs font-bold ${item.text}`}>{item.label}</p>
            <p className="text-white text-base lg:text-lg font-bold font-mono leading-tight mt-0.5">{item.count.toLocaleString()}</p>
            <p className="text-text-muted text-[9px] lg:text-[10px]">{(item.count / total * 100).toFixed(1)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
};


// ============================================
// WIN RATE TREND CHART
// ============================================
const WinRateTrendChart = ({ data, mode }) => {
  if (!data || data.length === 0) return <div className="h-56 lg:h-72 flex items-center justify-center text-text-muted text-sm">No trend data available</div>;

  const chartData = data.map(item => ({
    period: (() => { try { const d = new Date(item.period); return isNaN(d) ? item.period : d.toLocaleDateString('en', { month: 'short', day: 'numeric' }); } catch { return item.period; } })(),
    fullDate: item.period, winRate: item.win_rate, winners: item.winners, losers: item.losers, total: item.total_closed,
  }));
  const avgWR = chartData.reduce((s, d) => s + d.winRate, 0) / chartData.length;

  return (
    <div className="h-56 lg:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <defs>
            <linearGradient id="wrGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22C55E" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#22C55E" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,168,83,0.06)" />
          <XAxis dataKey="period" stroke="#6b5c52" fontSize={9} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 8))} />
          <YAxis stroke="#6b5c52" fontSize={10} domain={[0, 100]} tickFormatter={v => `${v}%`} tickLine={false} width={35} />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div className="bg-bg-primary/95 backdrop-blur border border-gold-primary/30 rounded-xl p-3 shadow-2xl">
                <p className="text-gold-primary text-[10px] font-semibold mb-1.5">{d.fullDate || label}</p>
                <p className="text-white text-sm">Win Rate: <span className={`font-bold ${d.winRate >= 80 ? 'text-green-400' : d.winRate >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{d.winRate.toFixed(1)}%</span></p>
                <p className="text-text-muted text-xs">W: <span className="text-green-400">{d.winners}</span> L: <span className="text-red-400">{d.losers}</span> Total: {d.total}</p>
              </div>
            );
          }} />
          <ReferenceLine y={avgWR} stroke="rgba(255,255,255,0.12)" strokeDasharray="5 5" label={{ value: `Avg ${avgWR.toFixed(1)}%`, position: 'right', fill: '#6b5c52', fontSize: 9 }} />
          <Area type="monotone" dataKey="winRate" stroke="#22C55E" strokeWidth={2} fill="url(#wrGrad)"
            dot={{ r: 2, fill: '#22C55E', strokeWidth: 0 }} activeDot={{ r: 4, fill: '#22C55E', stroke: '#fff', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};


// ============================================
// RISK:REWARD CHART
// ============================================
const RiskRewardChart = ({ data }) => {
  if (!data || data.length === 0) return <div className="h-44 flex items-center justify-center text-text-muted text-sm">No data</div>;
  const colors = { 'TP1': '#22C55E', 'TP2': '#84CC16', 'TP3': '#EAB308', 'TP4': '#F97316', 'SL': '#EF4444' };
  const chartData = data.filter(d => d.level !== 'SL').map(d => ({ level: d.level, rr: d.avg_rr, count: d.count, color: colors[d.level] || '#d4a853' }));

  return (
    <div>
      <div className="h-40 lg:h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,168,83,0.06)" />
            <XAxis dataKey="level" stroke="#6b5c52" fontSize={11} tickLine={false} />
            <YAxis stroke="#6b5c52" fontSize={10} tickLine={false} tickFormatter={v => `${v.toFixed(1)}R`} width={35} />
            <Tooltip contentStyle={{ backgroundColor: '#1a0a0a', border: '1px solid rgba(212,168,83,0.3)', borderRadius: '10px', fontSize: '12px' }}
              formatter={(value) => [`1:${value.toFixed(2)}`, 'R:R']} />
            <Bar dataKey="rr" radius={[8, 8, 0, 0]}>{chartData.map((e, i) => <Cell key={i} fill={e.color} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-1.5 lg:gap-2 mt-3">
        {data.map(d => (
          <div key={d.level} className="flex items-center gap-1.5 bg-bg-card/40 rounded-lg px-2.5 py-1.5 border border-white/5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[d.level] || '#888' }} />
            <span className="text-text-muted text-[10px]">{d.level}</span>
            <span className="text-white text-[10px] font-mono font-bold">{d.level === 'SL' ? '-1R' : `${d.avg_rr.toFixed(2)}R`}</span>
            <span className="text-text-muted text-[9px]">({d.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
};


// ============================================
// RISK TREND CHART (multi-line)
// ============================================
const RiskTrendChart = ({ data, mode }) => {
  if (!data || data.length === 0) return <div className="h-44 lg:h-56 flex items-center justify-center text-text-muted text-sm">Not enough data</div>;

  const chartData = data.map(item => ({
    period: (() => { try { const d = new Date(item.period); return isNaN(d) ? item.period : d.toLocaleDateString('en', { month: 'short', day: 'numeric' }); } catch { return item.period; } })(),
    fullDate: item.period,
    low: item.low_wr, normal: item.normal_wr, high: item.high_wr,
    lowCount: item.low_count, normalCount: item.normal_count, highCount: item.high_count,
  }));

  return (
    <div className="h-44 lg:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,168,83,0.06)" />
          <XAxis dataKey="period" stroke="#6b5c52" fontSize={9} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 8))} />
          <YAxis stroke="#6b5c52" fontSize={10} domain={[0, 100]} tickFormatter={v => `${v}%`} tickLine={false} width={35} />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload;
            return (
              <div className="bg-bg-primary/95 backdrop-blur border border-gold-primary/30 rounded-xl p-3 shadow-2xl">
                <p className="text-gold-primary text-[10px] font-semibold mb-1.5">{d?.fullDate || label}</p>
                {d?.low != null && <p className="text-green-400 text-xs">Low: {d.low.toFixed(1)}% <span className="text-text-muted">({d.lowCount})</span></p>}
                {d?.normal != null && <p className="text-yellow-400 text-xs">Normal: {d.normal.toFixed(1)}% <span className="text-text-muted">({d.normalCount})</span></p>}
                {d?.high != null && <p className="text-red-400 text-xs">High: {d.high.toFixed(1)}% <span className="text-text-muted">({d.highCount})</span></p>}
              </div>
            );
          }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
          <Line type="monotone" dataKey="low" name="Low" stroke="#22C55E" strokeWidth={2} dot={{ r: 1.5 }} connectNulls />
          <Line type="monotone" dataKey="normal" name="Normal" stroke="#EAB308" strokeWidth={2} dot={{ r: 1.5 }} connectNulls />
          <Line type="monotone" dataKey="high" name="High" stroke="#EF4444" strokeWidth={2} dot={{ r: 1.5 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};


// ============================================
// FULL SIGNAL TABLE (enhanced)
// ============================================
const FullSignalTable = ({ signals, loading, onSelect }) => {
  const formatPrice = (p) => {
    if (!p) return '-';
    if (p < 0.0001) return p.toFixed(8); if (p < 0.01) return p.toFixed(6);
    if (p < 1) return p.toFixed(4); return p < 100 ? p.toFixed(4) : p.toFixed(2);
  };
  const formatDate = (d) => {
    if (!d) return '-';
    const dt = new Date(d);
    return `${dt.getDate()} ${dt.toLocaleDateString('en', { month: 'short' })} '${dt.getFullYear().toString().slice(2)} ${dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  };
  const getMaxTarget = (s) => {
    const t = [s.target4, s.target3, s.target2, s.target1].filter(Boolean);
    if (!t.length || !s.entry) return { value: null, pct: null };
    return { value: t[0], pct: ((t[0] - s.entry) / s.entry * 100).toFixed(2) };
  };
  const statusBadge = (st) => {
    const styles = {
      'open': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
      'tp1': 'bg-green-500/15 text-green-400 border-green-500/30',
      'tp2': 'bg-lime-500/15 text-lime-400 border-lime-500/30',
      'tp3': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
      'closed_win': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      'closed_loss': 'bg-red-500/15 text-red-400 border-red-500/30',
    };
    const labels = { 'open': 'OPEN', 'tp1': 'TP1', 'tp2': 'TP2', 'tp3': 'TP3', 'closed_win': 'TP4', 'closed_loss': 'LOSS' };
    const key = st?.toLowerCase();
    return <span className={`${styles[key] || 'bg-gray-500/15 text-gray-400 border-gray-500/30'} text-[9px] lg:text-[10px] font-bold px-2 py-0.5 rounded-full border`}>{labels[key] || st}</span>;
  };
  const riskBadge = (r) => {
    const rl = r?.toLowerCase() || '';
    if (rl.startsWith('low')) return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (rl.startsWith('nor') || rl.startsWith('med')) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    if (rl.startsWith('high')) return 'bg-red-500/10 text-red-400 border-red-500/20';
    return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-gold-primary/5 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!signals || signals.length === 0) {
    return <div className="text-center py-8 text-text-muted text-sm">No signals found</div>;
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gold-primary/10">
              {['Pair', 'Entry', 'Max Target', 'Stop Loss', 'Risk', 'Status', 'MCap', 'Date'].map(h => (
                <th key={h} className="py-2.5 px-3 text-left text-gold-primary/60 text-[9px] uppercase tracking-wider font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {signals.map((s, i) => {
              const mt = getMaxTarget(s);
              const pair = (s.pair || '').replace('USDT', '');
              return (
                <tr key={i} onClick={() => onSelect(s)}
                  className="border-b border-white/[0.03] hover:bg-gold-primary/[0.03] cursor-pointer transition-colors group">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <CoinLogo pair={s.pair} size={20} />
                      <span className="text-white text-xs font-semibold group-hover:text-gold-primary transition-colors">{pair}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-white text-xs font-mono">${formatPrice(s.entry)}</td>
                  <td className="py-2.5 px-3">
                    {mt.value ? (
                      <div>
                        <span className="text-white text-xs font-mono">${formatPrice(mt.value)}</span>
                        <span className="text-green-400 text-[10px] ml-1.5 font-mono">+{mt.pct}%</span>
                      </div>
                    ) : <span className="text-text-muted text-xs">-</span>}
                  </td>
                  <td className="py-2.5 px-3">
                    {s.stop1 ? (
                      <div>
                        <span className="text-white text-xs font-mono">${formatPrice(s.stop1)}</span>
                        {s.entry && <span className="text-red-400 text-[10px] ml-1.5 font-mono">{((s.stop1 - s.entry) / s.entry * 100).toFixed(1)}%</span>}
                      </div>
                    ) : <span className="text-text-muted text-xs">-</span>}
                  </td>
                  <td className="py-2.5 px-3">{s.risk_level ? <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${riskBadge(s.risk_level)}`}>{s.risk_level}</span> : '-'}</td>
                  <td className="py-2.5 px-3">{statusBadge(s.status)}</td>
                  <td className="py-2.5 px-3 text-text-muted text-xs">{s.market_cap || '-'}</td>
                  <td className="py-2.5 px-3 text-text-muted text-[10px] font-mono">{formatDate(s.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {signals.map((s, i) => {
          const mt = getMaxTarget(s);
          const pair = (s.pair || '').replace('USDT', '');
          return (
            <div key={i} onClick={() => onSelect(s)}
              className="glass-card rounded-xl p-3 border border-gold-primary/10 active:border-gold-primary/30 transition-all cursor-pointer">
              {/* Top row */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CoinLogo pair={s.pair} size={28} />
                  <div>
                    <p className="text-white text-xs font-bold">{pair}<span className="text-text-muted font-normal">/USDT</span></p>
                    <p className="text-text-muted text-[9px] font-mono">{formatDate(s.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {s.risk_level && <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border ${riskBadge(s.risk_level)}`}>{s.risk_level}</span>}
                  {statusBadge(s.status)}
                </div>
              </div>
              {/* Price row */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-text-muted text-[8px] uppercase">Entry</p>
                  <p className="text-white text-[10px] font-mono font-semibold">${formatPrice(s.entry)}</p>
                </div>
                <div>
                  <p className="text-text-muted text-[8px] uppercase">Target</p>
                  {mt.value ? (
                    <p className="text-[10px] font-mono font-semibold"><span className="text-white">${formatPrice(mt.value)}</span> <span className="text-green-400">+{mt.pct}%</span></p>
                  ) : <p className="text-text-muted text-[10px]">-</p>}
                </div>
                <div>
                  <p className="text-text-muted text-[8px] uppercase">SL</p>
                  {s.stop1 ? (
                    <p className="text-[10px] font-mono font-semibold"><span className="text-white">${formatPrice(s.stop1)}</span> <span className="text-red-400">{s.entry ? ((s.stop1 - s.entry) / s.entry * 100).toFixed(1) : ''}%</span></p>
                  ) : <p className="text-text-muted text-[10px]">-</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};


// ============================================
// LOADING SKELETON
// ============================================
const LoadingSkeleton = () => (
  <div className="space-y-5">
    <div className="flex items-center gap-3">
      <div className="w-10 lg:w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
      <h2 className="font-display text-xl lg:text-2xl font-semibold text-white">Performance Analytics</h2>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="rounded-xl p-3 lg:p-4 bg-bg-card/30 border border-gold-primary/10 animate-pulse">
          <div className="h-3 bg-gold-primary/10 rounded w-14 mb-2" />
          <div className="h-6 bg-gold-primary/10 rounded w-12" />
        </div>
      ))}
    </div>
    <div className="glass-card rounded-2xl p-4 lg:p-6 h-64 lg:h-80 animate-pulse border border-gold-primary/10">
      <div className="h-4 bg-gold-primary/10 rounded w-32 mb-2" />
      <div className="h-3 bg-gold-primary/10 rounded w-48" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="glass-card rounded-2xl p-4 lg:p-6 h-56 animate-pulse border border-gold-primary/10" />
      ))}
    </div>
  </div>
);

export default AnalyzePage;