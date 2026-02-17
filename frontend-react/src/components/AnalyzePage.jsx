import { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, ReferenceLine, Cell, LineChart, Line, Legend, ComposedChart } from 'recharts';
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

  // Compute R:R to max target from risk_reward data
  const rrToMax = (() => {
    const tpLevels = (data.risk_reward || []).filter(d => d.level !== 'SL');
    if (tpLevels.length === 0) return 0;
    // Weighted average of all TP R:Rs (each weighted by count)
    const totalCount = tpLevels.reduce((s, d) => s + d.count, 0);
    if (totalCount === 0) return 0;
    const weightedSum = tpLevels.reduce((s, d) => s + (d.avg_rr * d.count), 0);
    return weightedSum / totalCount;
  })();

  // Find max TP R:R (the highest TP level available)
  const maxTpRR = (() => {
    const tpLevels = (data.risk_reward || []).filter(d => d.level !== 'SL');
    if (tpLevels.length === 0) return { level: '-', rr: 0 };
    const maxTP = tpLevels[tpLevels.length - 1]; // Last TP is highest
    return { level: maxTP.level, rr: maxTP.avg_rr };
  })();

  return (
    <div className="space-y-4 lg:space-y-5">
      
      {/* ═══════════════════════════════════════════ */}
      {/* HEADER + TIME RANGE                        */}
      {/* ═══════════════════════════════════════════ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 lg:w-12 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
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
      {/* KPI STRIP — 6 metrics in one row            */}
      {/* ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3">
        <KPICard 
          label="Win Rate" 
          value={`${data.stats.win_rate.toFixed(1)}%`}
          color={data.stats.win_rate >= 75 ? 'green' : data.stats.win_rate >= 55 ? 'yellow' : 'red'}
          accent
        />
        <KPICard 
          label="Closed Trades" 
          value={data.stats.closed_trades.toLocaleString()}
          sub={`of ${data.stats.total_signals.toLocaleString()}`}
        />
        <KPICard 
          label="Winners" 
          value={data.stats.total_winners.toLocaleString()}
          color="green"
        />
        <KPICard 
          label="Losses" 
          value={data.stats.sl_count.toLocaleString()}
          color="red"
        />
        <KPICard 
          label={`Avg R:R (${maxTpRR.level})`}
          value={`${maxTpRR.rr.toFixed(2)}R`}
          color="gold"
        />
        <KPICard 
          label="Not Hit" 
          value={data.stats.open_signals.toLocaleString()}
          sub={`${data.stats.active_pairs} pairs`}
          color="muted"
        />
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* WIN RATE TREND — Full width, taller          */}
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
      {/* OUTCOME DISTRIBUTION + R:R TO MAX TARGET    */}
      {/* ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
        {/* Outcome Distribution — unified, no redundancy */}
        <div className="glass-card rounded-2xl p-4 lg:p-6 border border-gold-primary/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green-500/20 to-transparent" />
          <div className="mb-4">
            <h3 className="text-white font-semibold text-base lg:text-lg">Outcome Distribution</h3>
            <p className="text-text-muted text-[10px] lg:text-xs mt-0.5">{data.stats.closed_trades.toLocaleString()} closed trades</p>
          </div>
          <OutcomeDistribution data={data.stats} />
        </div>

        {/* R:R to Max Target */}
        <div className="glass-card rounded-2xl p-4 lg:p-6 border border-gold-primary/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
          <div className="mb-4">
            <h3 className="text-white font-semibold text-base lg:text-lg">Risk : Reward</h3>
            <p className="text-text-muted text-[10px] lg:text-xs mt-0.5">
              R:R to max target per level · Best <span className="text-gold-primary font-mono font-semibold">{maxTpRR.rr.toFixed(2)}R</span>
            </p>
          </div>
          <RiskRewardChart data={data.risk_reward} />
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
          <div className="text-center py-8 text-text-muted text-sm">No risk data available</div>
        ) : (
          <>
            {/* Risk cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
              {data.risk_distribution.map((rd) => {
                const colorMap = {
                  'Low': { border: 'border-green-500/20', bg: 'from-green-500/[0.06] to-transparent', text: 'text-green-400', dot: 'bg-green-500', ring: 'ring-green-500/20' },
                  'Normal': { border: 'border-yellow-500/20', bg: 'from-yellow-500/[0.06] to-transparent', text: 'text-yellow-400', dot: 'bg-yellow-500', ring: 'ring-yellow-500/20' },
                  'High': { border: 'border-red-500/20', bg: 'from-red-500/[0.06] to-transparent', text: 'text-red-400', dot: 'bg-red-500', ring: 'ring-red-500/20' },
                };
                const c = colorMap[rd.risk_level] || colorMap['Normal'];
                const winPct = rd.closed_trades > 0 ? (rd.winners / rd.closed_trades * 100) : 0;
                const totalSig = data.risk_distribution.reduce((s, r) => s + r.total_signals, 0);
                const pct = totalSig > 0 ? (rd.total_signals / totalSig * 100).toFixed(1) : '0';

                return (
                  <div key={rd.risk_level} className={`rounded-xl p-4 lg:p-5 bg-gradient-to-b ${c.bg} border ${c.border}`}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${c.dot} ring-4 ${c.ring}`} />
                        <span className={`font-bold text-sm ${c.text}`}>{rd.risk_level}</span>
                      </div>
                      <span className="text-text-muted text-[10px] font-mono">{pct}%</span>
                    </div>

                    {/* Win Rate - hero metric */}
                    <p className={`text-3xl lg:text-4xl font-bold font-mono ${c.text} leading-none`}>{rd.win_rate.toFixed(1)}%</p>
                    <p className="text-text-muted text-[10px] mt-1 mb-3">Win Rate</p>

                    {/* W/L bar */}
                    <div className="h-1.5 rounded-full overflow-hidden flex bg-bg-card/50 mb-2">
                      <div className="h-full bg-green-500/70 rounded-l-full transition-all duration-700" style={{ width: `${winPct}%` }} />
                      <div className="h-full bg-red-500/70 rounded-r-full transition-all duration-700" style={{ width: `${100 - winPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] mb-3">
                      <span className="text-green-400/80 font-mono">{rd.winners.toLocaleString()} W</span>
                      <span className="text-red-400/80 font-mono">{rd.losers.toLocaleString()} L</span>
                    </div>

                    {/* Bottom stats */}
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

            {/* Distribution bar */}
            {(() => {
              const totalSig = data.risk_distribution.reduce((s, r) => s + r.total_signals, 0);
              const colors = { 'Low': '#22C55E', 'Normal': '#EAB308', 'High': '#EF4444' };
              if (totalSig === 0) return null;
              return (
                <div className="flex flex-col sm:flex-row items-center gap-3 mt-4 p-3 rounded-xl bg-bg-card/20 border border-white/[0.03]">
                  <div className="w-full sm:w-64 h-2.5 rounded-full overflow-hidden flex bg-bg-card/80 flex-shrink-0">
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
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* WIN RATE TREND BY RISK LEVEL               */}
      {/* ═══════════════════════════════════════════ */}
      {data.risk_trend && data.risk_trend.length > 0 && (
        <div className="glass-card rounded-2xl p-4 lg:p-6 border border-gold-primary/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/20 to-transparent" />
          <div className="mb-4">
            <h3 className="text-white font-semibold text-base lg:text-lg">Win Rate by Risk Level</h3>
            <p className="text-text-muted text-[10px] lg:text-xs mt-0.5">Trend comparison across risk categories</p>
          </div>
          <RiskTrendChart data={data.risk_trend} mode={trendMode} />
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* TOP PERFORMING PAIRS                       */}
      {/* ═══════════════════════════════════════════ */}
      {data.pair_metrics && data.pair_metrics.length > 0 && (
        <div className="glass-card rounded-2xl border border-gold-primary/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/20 to-transparent" />
          <div className="p-4 lg:p-6 pb-0">
            <h3 className="text-white font-semibold text-base lg:text-lg">Top Performing Pairs</h3>
            <p className="text-text-muted text-[10px] lg:text-xs mt-0.5">Ranked by win rate (min 5 closed trades)</p>
          </div>
          <TopPairsTable pairs={data.pair_metrics} />
        </div>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* FULL SIGNAL HISTORY                        */}
      {/* ═══════════════════════════════════════════ */}
      <div className="glass-card rounded-2xl border border-gold-primary/10 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/20 to-transparent" />
        
        <div className="p-4 lg:p-6 pb-0 lg:pb-0">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-white font-semibold text-base lg:text-lg">Signal History</h3>
              <p className="text-text-muted text-[10px] lg:text-xs mt-0.5">{sigTotal.toLocaleString()} total signals</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 lg:px-6">
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
                  <option value="open">Not Hit</option>
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

        <div className="px-4 lg:px-6 py-4">
          <FullSignalTable signals={signals} loading={sigLoading} onSelect={setSelectedSignal} />
        </div>

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

      <SignalModal signal={selectedSignal} isOpen={!!selectedSignal} onClose={() => setSelectedSignal(null)} />
    </div>
  );
};


// ============================================
// KPI CARD — Clean metric card
// ============================================
const KPICard = ({ label, value, sub, color = 'default', accent = false }) => {
  const colorStyles = {
    green: 'text-green-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
    gold: 'text-gold-primary',
    muted: 'text-text-secondary',
    default: 'text-white',
  };

  return (
    <div className={`rounded-xl p-3 lg:p-4 border transition-all ${
      accent 
        ? 'bg-gradient-to-b from-gold-primary/[0.08] to-transparent border-gold-primary/20' 
        : 'bg-bg-card/30 border-white/[0.04] hover:border-gold-primary/10'
    }`}>
      <p className="text-text-muted text-[9px] lg:text-[10px] uppercase tracking-wider font-medium mb-1 truncate">{label}</p>
      <p className={`text-xl lg:text-2xl font-bold font-mono leading-none ${colorStyles[color]}`}>{value}</p>
      {sub && <p className="text-text-muted text-[9px] lg:text-[10px] mt-1">{sub}</p>}
    </div>
  );
};


// ============================================
// OUTCOME DISTRIBUTION — Unified section
// ============================================
const OutcomeDistribution = ({ data }) => {
  const total = data.tp1_count + data.tp2_count + data.tp3_count + data.tp4_count + data.sl_count;
  if (total === 0) return <div className="h-40 flex items-center justify-center text-text-muted text-sm">No closed trades</div>;

  const items = [
    { label: 'TP1', count: data.tp1_count, color: '#22C55E', text: 'text-green-400' },
    { label: 'TP2', count: data.tp2_count, color: '#84CC16', text: 'text-lime-400' },
    { label: 'TP3', count: data.tp3_count, color: '#EAB308', text: 'text-yellow-400' },
    { label: 'TP4', count: data.tp4_count, color: '#F97316', text: 'text-orange-400' },
    { label: 'SL',  count: data.sl_count,  color: '#EF4444', text: 'text-red-400' },
  ];

  return (
    <div className="space-y-4">
      {/* Stacked bar */}
      <div className="h-3 rounded-full overflow-hidden flex bg-bg-card/80 border border-white/5">
        {items.filter(i => i.count > 0).map((item, idx) => (
          <div key={idx} style={{ width: `${(item.count / total * 100)}%`, backgroundColor: item.color }}
            className="h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full relative group">
            {(item.count / total * 100) > 10 && (
              <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/90 drop-shadow">
                {(item.count / total * 100).toFixed(0)}%
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Horizontal bars with inline labels */}
      <div className="space-y-2">
        {items.map((item) => {
          const pct = (item.count / total * 100);
          return (
            <div key={item.label} className="flex items-center gap-2.5">
              <span className={`text-[10px] font-bold w-6 ${item.text}`}>{item.label}</span>
              <div className="flex-1 h-2 rounded-full bg-bg-card/60 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: item.color }} />
              </div>
              <div className="flex items-center gap-1.5 min-w-[75px] justify-end">
                <span className="text-white text-[11px] font-mono font-semibold">{item.count.toLocaleString()}</span>
                <span className="text-text-muted text-[9px] font-mono w-[32px] text-right">{pct.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


// ============================================
// WIN RATE TREND CHART — Improved: Dual-layer
// Raw data (faded) + 7-period Moving Average (bold)
// + Volume bars at bottom + Annotations
// ============================================
const WinRateTrendChart = ({ data, mode }) => {
  const [showRaw, setShowRaw] = useState(true);
  const [maWindow, setMaWindow] = useState(7);

  if (!data || data.length === 0) return <div className="h-72 lg:h-96 flex items-center justify-center text-text-muted text-sm">No trend data available</div>;

  // Compute Moving Average
  const computeMA = (arr, window) => {
    return arr.map((item, idx) => {
      if (idx < window - 1) return null;
      const slice = arr.slice(idx - window + 1, idx + 1);
      const avg = slice.reduce((s, d) => s + d.win_rate, 0) / slice.length;
      return Math.round(avg * 100) / 100;
    });
  };

  const maValues = computeMA(data, maWindow);

  // Build enriched chart data
  const chartData = data.map((item, idx) => {
    const d = (() => { try { const dt = new Date(item.period); return isNaN(dt) ? item.period : dt.toLocaleDateString('en', { month: 'short', day: 'numeric' }); } catch { return item.period; } })();
    return {
      period: d,
      fullDate: item.period,
      winRate: item.win_rate,
      ma: maValues[idx],
      winners: item.winners,
      losers: item.losers,
      total: item.total_closed,
    };
  });

  // Stats
  const validRates = chartData.map(d => d.winRate).filter(v => v > 0);
  const validMA = chartData.map(d => d.ma).filter(v => v != null);
  const allValues = [...validRates, ...validMA];
  const avgWR = validRates.reduce((s, v) => s + v, 0) / (validRates.length || 1);
  const currentMA = validMA.length > 0 ? validMA[validMA.length - 1] : null;
  const prevMA = validMA.length > 1 ? validMA[validMA.length - 2] : null;
  const maTrend = currentMA && prevMA ? (currentMA > prevMA ? 'up' : currentMA < prevMA ? 'down' : 'flat') : 'flat';

  // Auto-range Y-axis based on MA range (smoother range)
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal;
  const pad = Math.max(range * 0.12, 5);
  const yMin = Math.max(0, Math.floor((minVal - pad) / 5) * 5);
  const yMax = Math.min(100, Math.ceil((maxVal + pad) / 5) * 5);

  // Max volume for bar scaling
  const maxVol = Math.max(...chartData.map(d => d.total), 1);

  // Find best and worst periods
  const bestPeriod = chartData.reduce((best, d) => d.winRate > (best?.winRate || 0) ? d : best, chartData[0]);
  const worstPeriod = chartData.filter(d => d.winRate > 0).reduce((worst, d) => d.winRate < (worst?.winRate || 100) ? d : worst, chartData[0]);

  return (
    <div className="space-y-3">
      {/* Top bar: MA info + controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* Left: Current MA + trend */}
        <div className="flex items-center gap-3">
          {currentMA != null && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-6 h-[2px] bg-green-400 rounded-full" />
                <span className="text-text-muted text-[10px]">{maWindow}{mode === 'weekly' ? 'W' : 'D'} MA</span>
              </div>
              <span className={`text-sm font-mono font-bold ${currentMA >= 70 ? 'text-green-400' : currentMA >= 55 ? 'text-yellow-400' : 'text-red-400'}`}>
                {currentMA.toFixed(1)}%
              </span>
              <span className={`text-[10px] ${maTrend === 'up' ? 'text-green-400' : maTrend === 'down' ? 'text-red-400' : 'text-text-muted'}`}>
                {maTrend === 'up' ? '↑' : maTrend === 'down' ? '↓' : '→'}
              </span>
            </div>
          )}
          <span className="text-text-muted text-[9px]">·</span>
          <span className="text-text-muted text-[10px]">Avg <span className="text-white font-mono">{avgWR.toFixed(1)}%</span></span>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          {/* Toggle raw data */}
          <button
            onClick={() => setShowRaw(!showRaw)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all border ${
              showRaw 
                ? 'text-green-400/70 border-green-500/20 bg-green-500/[0.06]' 
                : 'text-text-muted border-transparent hover:border-white/10'
            }`}
          >
            <div className={`w-3 h-[1.5px] rounded-full transition-colors ${showRaw ? 'bg-green-400/40' : 'bg-text-muted/30'}`} style={{ backgroundImage: showRaw ? 'none' : 'none' }} />
            Raw
          </button>

          {/* MA window selector */}
          <div className="flex bg-bg-card/40 rounded-md p-0.5 border border-white/[0.04]">
            {[3, 7, 14].map(w => (
              <button key={w} onClick={() => setMaWindow(w)}
                className={`px-2 py-1 rounded text-[10px] font-semibold transition-all ${
                  maWindow === w
                    ? 'bg-green-500/15 text-green-400'
                    : 'text-text-muted hover:text-white'
                }`}>
                {w}{mode === 'weekly' ? 'W' : 'D'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64 lg:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <defs>
              {/* MA line gradient glow */}
              <linearGradient id="maLineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22C55E" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#22C55E" stopOpacity={0.02} />
              </linearGradient>
              {/* Volume bar gradient */}
              <linearGradient id="volBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d4a853" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#d4a853" stopOpacity={0.05} />
              </linearGradient>
              {/* SVG filter for MA glow effect */}
              <filter id="maGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,168,83,0.04)" vertical={false} />

            <XAxis 
              dataKey="period" 
              stroke="#6b5c52" 
              fontSize={9} 
              tickLine={false} 
              axisLine={false} 
              interval={Math.max(0, Math.floor(chartData.length / (window.innerWidth < 640 ? 5 : 10)))}
              dy={4}
            />

            {/* Left Y-axis: Win Rate */}
            <YAxis 
              yAxisId="rate"
              stroke="#6b5c52" 
              fontSize={10} 
              domain={[yMin, yMax]} 
              tickFormatter={v => `${v}%`} 
              tickLine={false} 
              axisLine={false} 
              width={36}
            />

            {/* Right Y-axis: Volume (hidden, for bar scaling) */}
            <YAxis 
              yAxisId="vol"
              orientation="right"
              domain={[0, maxVol * 5]}
              hide
            />

            {/* Average reference line */}
            <ReferenceLine 
              yAxisId="rate"
              y={avgWR} 
              stroke="rgba(212,168,83,0.15)" 
              strokeDasharray="6 4" 
            />

            {/* Volume bars at bottom - subtle context */}
            <Bar 
              yAxisId="vol"
              dataKey="total" 
              fill="url(#volBarGrad)" 
              radius={[1, 1, 0, 0]}
              maxBarSize={8}
              isAnimationActive={false}
            />

            {/* Raw data - faded thin line */}
            {showRaw && (
              <Line 
                yAxisId="rate"
                type="monotone" 
                dataKey="winRate" 
                stroke="#22C55E" 
                strokeWidth={0.8} 
                strokeOpacity={0.2}
                dot={false} 
                activeDot={false}
                isAnimationActive={false}
                connectNulls
              />
            )}

            {/* MA area fill - subtle gradient under MA line */}
            <Area 
              yAxisId="rate"
              type="monotone" 
              dataKey="ma" 
              stroke="none"
              fill="url(#maLineGrad)" 
              fillOpacity={1}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls
            />

            {/* MA line - bold, the hero */}
            <Line 
              yAxisId="rate"
              type="monotone" 
              dataKey="ma" 
              stroke="#22C55E" 
              strokeWidth={2.5}
              dot={false} 
              activeDot={{ 
                r: 5, 
                fill: '#22C55E', 
                stroke: '#0a0506', 
                strokeWidth: 2.5,
              }}
              filter="url(#maGlow)"
              connectNulls
            />

            {/* Tooltip */}
            <Tooltip 
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const d = payload.find(p => p.dataKey === 'ma')?.payload || payload[0]?.payload;
                if (!d) return null;
                return (
                  <div className="bg-bg-primary/95 backdrop-blur-xl border border-gold-primary/25 rounded-xl p-3 shadow-2xl min-w-[160px]">
                    <p className="text-gold-primary text-[10px] font-semibold mb-2 pb-1.5 border-b border-gold-primary/10">{d.fullDate || label}</p>
                    
                    {/* MA value - hero */}
                    {d.ma != null && (
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="text-text-muted text-[10px]">{maWindow}{mode === 'weekly' ? 'W' : 'D'} MA</span>
                        </div>
                        <span className={`text-sm font-mono font-bold ${d.ma >= 70 ? 'text-green-400' : d.ma >= 55 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {d.ma.toFixed(1)}%
                        </span>
                      </div>
                    )}

                    {/* Raw value */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-green-500/30 border border-green-500/50" />
                        <span className="text-text-muted text-[10px]">Actual</span>
                      </div>
                      <span className={`text-xs font-mono font-semibold ${d.winRate >= 70 ? 'text-green-400' : d.winRate >= 55 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {d.winRate.toFixed(1)}%
                      </span>
                    </div>

                    {/* W/L breakdown */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-white/5">
                      <span className="text-text-muted text-[10px]">{d.total} trades</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-green-400 text-[10px] font-mono">{d.winners}W</span>
                        <span className="text-text-muted text-[8px]">·</span>
                        <span className="text-red-400 text-[10px] font-mono">{d.losers}L</span>
                      </div>
                    </div>
                  </div>
                );
              }}
              cursor={{ stroke: 'rgba(212,168,83,0.15)', strokeWidth: 1 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom stats strip */}
      <div className="flex items-center justify-between px-1 flex-wrap gap-2">
        <div className="flex items-center gap-3 lg:gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-text-muted uppercase tracking-wider">Best</span>
            <span className="text-green-400 text-[10px] font-mono font-bold">{bestPeriod.winRate.toFixed(0)}%</span>
            <span className="text-text-muted text-[9px]">({bestPeriod.period})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-text-muted uppercase tracking-wider">Worst</span>
            <span className="text-red-400 text-[10px] font-mono font-bold">{worstPeriod.winRate.toFixed(0)}%</span>
            <span className="text-text-muted text-[9px]">({worstPeriod.period})</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-text-muted text-[9px]">{chartData.length} periods</span>
          <span className="text-text-muted text-[8px]">·</span>
          <span className="text-text-muted text-[9px]">{chartData.reduce((s, d) => s + d.total, 0).toLocaleString()} trades</span>
        </div>
      </div>
    </div>
  );
};


// ============================================
// RISK:REWARD CHART — Horizontal bars, cleaner
// ============================================
const RiskRewardChart = ({ data }) => {
  if (!data || data.length === 0) return <div className="h-44 flex items-center justify-center text-text-muted text-sm">No data</div>;
  
  const colors = { 'TP1': '#22C55E', 'TP2': '#84CC16', 'TP3': '#EAB308', 'TP4': '#F97316', 'SL': '#EF4444' };
  const allItems = data.filter(d => d.level !== 'SL');
  const maxRR = Math.max(...allItems.map(d => d.avg_rr), 1);

  return (
    <div className="space-y-3">
      {allItems.map((item) => {
        const pct = (item.avg_rr / maxRR) * 100;
        const color = colors[item.level] || '#d4a853';
        return (
          <div key={item.level}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-white text-xs font-semibold">{item.level}</span>
                <span className="text-text-muted text-[10px]">({item.count.toLocaleString()} trades)</span>
              </div>
              <span className="text-white text-sm font-mono font-bold">{item.avg_rr.toFixed(2)}R</span>
            </div>
            <div className="h-2.5 rounded-full bg-bg-card/60 overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-700" 
                style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color, opacity: 0.8 }} 
              />
            </div>
          </div>
        );
      })}
      
      {/* SL reference */}
      {data.find(d => d.level === 'SL') && (
        <div className="pt-2 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-red-400 text-xs font-semibold">SL</span>
              <span className="text-text-muted text-[10px]">({data.find(d => d.level === 'SL').count.toLocaleString()} trades)</span>
            </div>
            <span className="text-red-400 text-sm font-mono font-bold">-1.00R</span>
          </div>
        </div>
      )}
    </div>
  );
};


// ============================================
// RISK TREND CHART — Separate section, taller
// ============================================
const RiskTrendChart = ({ data, mode }) => {
  if (!data || data.length === 0) return <div className="h-48 lg:h-64 flex items-center justify-center text-text-muted text-sm">Not enough data</div>;

  const chartData = data.map(item => ({
    period: (() => { try { const d = new Date(item.period); return isNaN(d) ? item.period : d.toLocaleDateString('en', { month: 'short', day: 'numeric' }); } catch { return item.period; } })(),
    fullDate: item.period,
    low: item.low_wr, normal: item.normal_wr, high: item.high_wr,
    lowCount: item.low_count, normalCount: item.normal_count, highCount: item.high_count,
  }));

  // Auto-range
  const allRates = chartData.flatMap(d => [d.low, d.normal, d.high]).filter(v => v != null && v > 0);
  const minR = allRates.length > 0 ? Math.min(...allRates) : 0;
  const maxR = allRates.length > 0 ? Math.max(...allRates) : 100;
  const pad = Math.max((maxR - minR) * 0.15, 5);
  const yMin = Math.max(0, Math.floor((minR - pad) / 5) * 5);
  const yMax = Math.min(100, Math.ceil((maxR + pad) / 5) * 5);

  return (
    <div className="h-48 lg:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,168,83,0.05)" vertical={false} />
          <XAxis dataKey="period" stroke="#6b5c52" fontSize={9} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(chartData.length / 10))} />
          <YAxis stroke="#6b5c52" fontSize={10} domain={[yMin, yMax]} tickFormatter={v => `${v}%`} tickLine={false} axisLine={false} width={38} />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload;
            return (
              <div className="bg-bg-primary/95 backdrop-blur-md border border-gold-primary/30 rounded-xl p-3 shadow-2xl">
                <p className="text-gold-primary text-[10px] font-semibold mb-1.5">{d?.fullDate || label}</p>
                {d?.low != null && <p className="text-green-400 text-xs">Low: {d.low.toFixed(1)}% <span className="text-text-muted">({d.lowCount})</span></p>}
                {d?.normal != null && <p className="text-yellow-400 text-xs">Normal: {d.normal.toFixed(1)}% <span className="text-text-muted">({d.normalCount})</span></p>}
                {d?.high != null && <p className="text-red-400 text-xs">High: {d.high.toFixed(1)}% <span className="text-text-muted">({d.highCount})</span></p>}
              </div>
            );
          }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />
          <Line type="monotone" dataKey="low" name="Low" stroke="#22C55E" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="normal" name="Normal" stroke="#EAB308" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} connectNulls />
          <Line type="monotone" dataKey="high" name="High" stroke="#EF4444" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};


// ============================================
// TOP PAIRS TABLE — Replaces redundant TPBreakdown
// ============================================
const TopPairsTable = ({ pairs }) => {
  // Filter pairs with enough data and sort by win rate
  const filtered = pairs
    .filter(p => p.closed_trades >= 5)
    .sort((a, b) => b.win_rate - a.win_rate || b.performance_score - a.performance_score)
    .slice(0, 10);

  if (filtered.length === 0) return <div className="p-6 text-center text-text-muted text-sm">Not enough data (min 5 closed trades per pair)</div>;

  return (
    <div className="px-4 lg:px-6 py-4">
      {/* Desktop */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gold-primary/10">
              {['#', 'Pair', 'Win Rate', 'Closed', 'W / L', 'Best TP', 'Score'].map(h => (
                <th key={h} className="py-2 px-3 text-left text-gold-primary/60 text-[9px] uppercase tracking-wider font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const pair = (p.pair || '').replace('USDT', '');
              const winPct = p.closed_trades > 0 ? (p.win_rate) : 0;
              const bestTp = p.tp4_count > 0 ? 'TP4' : p.tp3_count > 0 ? 'TP3' : p.tp2_count > 0 ? 'TP2' : p.tp1_count > 0 ? 'TP1' : '-';
              const bestTpColor = { 'TP4': 'text-orange-400', 'TP3': 'text-yellow-400', 'TP2': 'text-lime-400', 'TP1': 'text-green-400' };
              const winners = p.tp1_count + p.tp2_count + p.tp3_count + p.tp4_count;
              return (
                <tr key={i} className="border-b border-white/[0.03] hover:bg-gold-primary/[0.02] transition-colors">
                  <td className="py-2.5 px-3 text-text-muted text-xs font-mono">{i + 1}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <CoinLogo pair={p.pair} size={18} />
                      <span className="text-white text-xs font-semibold">{pair}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-bg-card/60 overflow-hidden">
                        <div className="h-full rounded-full bg-green-500/70 transition-all duration-500" style={{ width: `${winPct}%` }} />
                      </div>
                      <span className={`text-xs font-mono font-bold ${winPct >= 80 ? 'text-green-400' : winPct >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{winPct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-white text-xs font-mono">{p.closed_trades}</td>
                  <td className="py-2.5 px-3 text-xs font-mono">
                    <span className="text-green-400">{winners}</span>
                    <span className="text-text-muted mx-1">/</span>
                    <span className="text-red-400">{p.sl_count}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`text-xs font-bold ${bestTpColor[bestTp] || 'text-text-muted'}`}>{bestTp}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-gold-primary text-xs font-mono font-bold">{p.performance_score.toFixed(0)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="lg:hidden space-y-2">
        {filtered.map((p, i) => {
          const pair = (p.pair || '').replace('USDT', '');
          const winPct = p.closed_trades > 0 ? p.win_rate : 0;
          const winners = p.tp1_count + p.tp2_count + p.tp3_count + p.tp4_count;
          return (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-white/[0.03]">
              <span className="text-text-muted text-[10px] font-mono w-4">{i + 1}</span>
              <CoinLogo pair={p.pair} size={20} />
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold">{pair}</p>
                <p className="text-text-muted text-[9px] font-mono">{p.closed_trades} trades · <span className="text-green-400">{winners}W</span> <span className="text-red-400">{p.sl_count}L</span></p>
              </div>
              <span className={`text-sm font-mono font-bold ${winPct >= 80 ? 'text-green-400' : winPct >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{winPct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};


// ============================================
// FULL SIGNAL TABLE
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
      'open': 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
      'tp1': 'bg-green-500/15 text-green-400 border-green-500/30',
      'tp2': 'bg-lime-500/15 text-lime-400 border-lime-500/30',
      'tp3': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
      'closed_win': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      'closed_loss': 'bg-red-500/15 text-red-400 border-red-500/30',
    };
    const labels = { 'open': 'NOT HIT', 'tp1': 'TP1', 'tp2': 'TP2', 'tp3': 'TP3', 'closed_win': 'TP4', 'closed_loss': 'LOSS' };
    const key = st?.toLowerCase();
    return <span className={`${styles[key] || 'bg-gray-500/15 text-gray-400 border-gray-500/30'} text-[9px] lg:text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap`}>{labels[key] || st}</span>;
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
      {/* Desktop */}
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

      {/* Mobile */}
      <div className="lg:hidden space-y-2">
        {signals.map((s, i) => {
          const mt = getMaxTarget(s);
          const pair = (s.pair || '').replace('USDT', '');
          return (
            <div key={i} onClick={() => onSelect(s)}
              className="glass-card rounded-xl p-3 border border-gold-primary/10 active:border-gold-primary/30 transition-all cursor-pointer">
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
  <div className="space-y-4">
    <div className="flex items-center gap-3">
      <div className="w-8 lg:w-12 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
      <h2 className="font-display text-xl lg:text-2xl font-semibold text-white">Performance Analytics</h2>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="rounded-xl p-3 lg:p-4 bg-bg-card/30 border border-white/[0.04] animate-pulse">
          <div className="h-3 bg-gold-primary/10 rounded w-14 mb-2" />
          <div className="h-6 bg-gold-primary/10 rounded w-16" />
        </div>
      ))}
    </div>
    <div className="glass-card rounded-2xl p-4 lg:p-6 h-72 lg:h-96 animate-pulse border border-gold-primary/10">
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