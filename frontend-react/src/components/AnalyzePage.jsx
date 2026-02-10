import { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, ReferenceLine, Cell, LineChart, Line, Legend } from 'recharts';
import SignalModal from './SignalModal';
import CoinLogo from './CoinLogo';

const API_BASE = '/api/v1';

const AnalyzePage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Analytics filters
  const [timeRange, setTimeRange] = useState('all');
  const [trendMode, setTrendMode] = useState('weekly');
  // Full signal history
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

  useEffect(() => { fetchAnalyzeData(); }, [timeRange, trendMode]);
  useEffect(() => { fetchSignals(); }, [sigPage, sigSearch, sigStatus, sigRisk, sigSort, sigOrder]);
  useEffect(() => { setSigPage(1); }, [sigSearch, sigStatus, sigRisk, sigSort, sigOrder]);

  const fetchAnalyzeData = async () => {
    try {
      setLoading(true);
      setError(null);
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
    { value: 'all', label: 'All Time' }, { value: 'ytd', label: 'YTD' },
    { value: '30d', label: '30 Days' }, { value: '7d', label: '7 Days' },
  ];

  if (loading) return <LoadingSkeleton />;
  if (error) return (
    <div className="flex flex-col items-center justify-center h-96 text-center">
      <p className="text-red-400 text-lg mb-4">Failed to load analysis data</p>
      <button onClick={fetchAnalyzeData} className="px-4 py-2 bg-gold-primary/20 text-gold-primary rounded-lg hover:bg-gold-primary/30">Retry</button>
    </div>
  );
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-2xl font-semibold text-white">Performance Analytics</h2>
        </div>
        <div className="flex gap-2">
          {timeRangeOptions.map(opt => (
            <button key={opt.value} onClick={() => setTimeRange(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${timeRange === opt.value ? 'bg-gold-primary text-bg-primary' : 'bg-bg-card text-text-muted hover:text-white border border-gold-primary/10'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatsCard label="Total Signals" value={data.stats.total_signals.toLocaleString()} icon={<svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>} />
        <StatsCard label="Closed Trades" value={data.stats.closed_trades.toLocaleString()} subValue={`${data.stats.open_signals} open`} icon={<svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatsCard label="Win Rate" value={`${data.stats.win_rate.toFixed(2)}%`} color={data.stats.win_rate >= 80 ? 'text-green-400' : data.stats.win_rate >= 60 ? 'text-yellow-400' : 'text-red-400'} icon={<svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>} />
        <StatsCard label="Total Winners" value={data.stats.total_winners.toLocaleString()} color="text-green-400" icon={<svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228M18.75 4.236V2.721M12 12.75a2.25 2.25 0 002.248-2.354M12 12.75a2.25 2.25 0 01-2.248-2.354M12 12.75V14.25" /></svg>} />
        <StatsCard label="Stop Loss" value={data.stats.sl_count.toLocaleString()} color="text-red-400" icon={<svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>} />
        <StatsCard label="Active Pairs" value={data.stats.active_pairs} icon={<svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>} />
      </div>

      {/* Win Rate Trend */}
      <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold text-lg">Win Rate Trend</h3>
            <p className="text-text-muted text-xs">Historical performance over time</p>
          </div>
          <div className="flex gap-2">
            {['daily', 'weekly'].map(m => (
              <button key={m} onClick={() => setTrendMode(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${trendMode === m ? 'bg-gold-primary text-bg-primary' : 'bg-bg-card text-text-muted hover:text-white border border-gold-primary/10'}`}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <WinRateTrendChart data={data.win_rate_trend} mode={trendMode} />
      </div>

      {/* Risk:Reward + Outcome Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <div className="mb-4">
            <h3 className="text-white font-semibold text-lg">Risk : Reward Ratio</h3>
            <p className="text-text-muted text-xs">Average R:R per target level</p>
          </div>
          <RiskRewardChart data={data.risk_reward} />
        </div>

        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-white font-semibold text-lg mb-1">Outcome Breakdown</h3>
          <p className="text-text-muted text-xs mb-4">{data.stats.closed_trades.toLocaleString()} closed trades</p>
          <TPBreakdown data={data.stats} />
        </div>
      </div>

      {/* ============================================ */}
      {/* RISK LEVEL ANALYSIS — always show */}
      {/* ============================================ */}
      <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
        <h3 className="text-white font-semibold text-lg mb-1">Risk Level Analysis</h3>
        <p className="text-text-muted text-xs mb-5">Performance breakdown by signal risk level</p>

        {(!data.risk_distribution || data.risk_distribution.length === 0) ? (
          <div className="text-center py-8 text-text-muted text-sm">Loading risk data... Try refreshing in a few seconds.</div>
        ) : (
          <>
            {/* Top row: Risk Cards + Signal Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
              {/* Risk Cards */}
              {data.risk_distribution.map((rd) => {
                const colorMap = {
                  'Low': { border: 'border-green-500/30', bg: 'bg-green-500/10', text: 'text-green-400', dot: 'bg-green-500', barColor: '#22C55E' },
                  'Normal': { border: 'border-yellow-500/30', bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-500', barColor: '#EAB308' },
                  'High': { border: 'border-red-500/30', bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500', barColor: '#EF4444' }
                };
                const c = colorMap[rd.risk_level] || colorMap['Normal'];
                const winPct = rd.closed_trades > 0 ? (rd.winners / rd.closed_trades * 100) : 0;
                const totalSig = data.risk_distribution.reduce((s, r) => s + r.total_signals, 0);
                const pct = totalSig > 0 ? (rd.total_signals / totalSig * 100).toFixed(1) : '0';
                return (
                  <div key={rd.risk_level} className={`rounded-xl p-4 ${c.bg} border ${c.border}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                        <span className={`font-semibold text-sm ${c.text}`}>{rd.risk_level} Risk</span>
                      </div>
                      <span className="text-text-muted text-[10px]">{pct}% · {rd.total_signals.toLocaleString()}</span>
                    </div>
                    
                    {/* Win Rate */}
                    <p className={`text-2xl font-bold font-mono ${c.text} mb-1.5`}>{rd.win_rate.toFixed(1)}%</p>
                    <p className="text-text-muted text-[10px] mb-2">Win Rate</p>
                    
                    {/* W/L bar */}
                    <div className="h-1.5 rounded-full overflow-hidden flex bg-bg-card mb-1.5">
                      <div className="h-full bg-green-500 transition-all" style={{ width: `${winPct}%` }} />
                      <div className="h-full bg-red-500 transition-all" style={{ width: `${100 - winPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] mb-3">
                      <span className="text-green-400">{rd.winners.toLocaleString()}W</span>
                      <span className="text-red-400">{rd.losers.toLocaleString()}L</span>
                    </div>
                    
                    {/* Stats row */}
                    <div className="pt-2.5 border-t border-white/5">
                      <div className="flex justify-between">
                        <span className="text-text-muted text-[10px]">Closed</span>
                        <span className="text-white font-mono text-xs">{rd.closed_trades.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Signal Distribution bar */}
            <div className="mb-5">
              {(() => {
                const totalSig = data.risk_distribution.reduce((s, r) => s + r.total_signals, 0);
                const colors = { 'Low': '#22C55E', 'Normal': '#EAB308', 'High': '#EF4444' };
                return (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-text-muted text-[10px] uppercase tracking-wider">Distribution</p>
                      <p className="text-text-muted text-[10px]">{totalSig.toLocaleString()} total</p>
                    </div>
                    <div className="h-5 rounded-full overflow-hidden flex bg-bg-card">
                      {data.risk_distribution.map((rd) => {
                        const w = (rd.total_signals / totalSig * 100);
                        return (
                          <div key={rd.risk_level} style={{ width: `${w}%`, backgroundColor: colors[rd.risk_level] }}
                            className="h-full transition-all duration-500 flex items-center justify-center">
                            {w > 12 && <span className="text-[9px] font-bold text-white drop-shadow">{w.toFixed(0)}%</span>}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-center gap-5 mt-1.5">
                      {data.risk_distribution.map((rd) => (
                        <div key={rd.risk_level} className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[rd.risk_level] }} />
                          <span className="text-text-muted text-[10px]">{rd.risk_level}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Risk Trend Chart */}
            {data.risk_trend && data.risk_trend.length > 0 && (
              <div>
                <p className="text-text-muted text-[10px] uppercase tracking-wider mb-2">Win Rate Trend by Risk Level</p>
                <RiskTrendChart data={data.risk_trend} mode={trendMode} />
              </div>
            )}
          </>
        )}
      </div>

      {/* FULL SIGNAL HISTORY */}
      {/* ============================================ */}
      <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="text-white font-semibold text-lg">Full Signal History</h3>
            <p className="text-text-muted text-xs">{sigTotal.toLocaleString()} total signals — all time</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 mb-4 pb-4 border-b border-gold-primary/10">
          <div className="flex-1 min-w-[180px]">
            <label className="text-gold-primary text-[10px] font-semibold uppercase tracking-wider mb-1 block">Search Pair</label>
            <input type="text" placeholder="BTC, ETH, SOL..." value={sigSearch}
              onChange={(e) => setSigSearch(e.target.value)}
              className="w-full px-3 py-2 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm placeholder-text-muted focus:outline-none focus:border-gold-primary/50" />
          </div>
          <div>
            <label className="text-gold-primary text-[10px] font-semibold uppercase tracking-wider mb-1 block">Status</label>
            <select value={sigStatus} onChange={(e) => setSigStatus(e.target.value)}
              className="px-3 py-2 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm">
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="tp1">TP1</option>
              <option value="tp2">TP2</option>
              <option value="tp3">TP3</option>
              <option value="closed_win">TP4</option>
              <option value="closed_loss">Loss</option>
            </select>
          </div>
          <div>
            <label className="text-gold-primary text-[10px] font-semibold uppercase tracking-wider mb-1 block">Risk</label>
            <select value={sigRisk} onChange={(e) => setSigRisk(e.target.value)}
              className="px-3 py-2 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm">
              <option value="all">All Risk</option>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className="text-gold-primary text-[10px] font-semibold uppercase tracking-wider mb-1 block">Sort</label>
            <select value={sigSort} onChange={(e) => setSigSort(e.target.value)}
              className="px-3 py-2 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm">
              <option value="created_at">Time</option>
              <option value="pair">Pair</option>
              <option value="entry">Entry</option>
              <option value="risk_level">Risk</option>
            </select>
          </div>
          <button onClick={() => setSigOrder(sigOrder === 'desc' ? 'asc' : 'desc')}
            className="px-3 py-2 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm hover:border-gold-primary/40 transition-colors">
            {sigOrder === 'desc' ? '↓ Newest' : '↑ Oldest'}
          </button>
        </div>

        {/* Table */}
        <FullSignalTable signals={signals} loading={sigLoading} onSelect={setSelectedSignal} />

        {/* Pagination */}
        {sigTotalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gold-primary/10">
            <p className="text-text-muted text-sm">Page {sigPage} of {sigTotalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setSigPage(p => Math.max(1, p - 1))} disabled={sigPage <= 1}
                className="px-4 py-2 bg-bg-card border border-gold-primary/20 rounded-lg text-text-secondary hover:text-white disabled:opacity-50 disabled:cursor-not-allowed text-sm">← Prev</button>
              <button onClick={() => setSigPage(p => Math.min(sigTotalPages, p + 1))} disabled={sigPage >= sigTotalPages}
                className="px-4 py-2 bg-bg-card border border-gold-primary/20 rounded-lg text-text-secondary hover:text-white disabled:opacity-50 disabled:cursor-not-allowed text-sm">Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-text-muted text-sm">
        Analysis based on {data.stats.total_signals.toLocaleString()} signals
      </div>

      {/* Modal */}
      <SignalModal signal={selectedSignal} isOpen={!!selectedSignal} onClose={() => setSelectedSignal(null)} />
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
    return `${dt.getDate()} ${dt.toLocaleDateString('en', { month: 'short' })} ${dt.getFullYear().toString().slice(2)} ${dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  };
  const getMaxTarget = (s) => {
    const t = [s.target4, s.target3, s.target2, s.target1].filter(Boolean);
    if (!t.length || !s.entry) return { value: null, pct: null };
    return { value: t[0], pct: ((t[0] - s.entry) / s.entry * 100).toFixed(2) };
  };
  const statusBadge = (st) => {
    const c = { 'open': 'bg-cyan-500', 'tp1': 'bg-green-500', 'tp2': 'bg-lime-500', 'tp3': 'bg-yellow-500', 'tp4': 'bg-orange-500', 'closed_win': 'bg-green-600', 'closed_loss': 'bg-red-500', 'sl': 'bg-red-500' };
    const labels = { 'open': 'OPEN', 'tp1': '✓ TP1', 'tp2': '✓ TP2', 'tp3': '✓ TP3', 'closed_win': '🏆 TP4', 'closed_loss': '✗ LOSS' };
    return <span className={`${c[st?.toLowerCase()] || 'bg-gray-500'} text-white text-[10px] font-semibold px-2 py-0.5 rounded-full`}>{labels[st?.toLowerCase()] || st}</span>;
  };
  const riskBadge = (r) => {
    const rl = r?.toLowerCase() || '';
    if (rl.startsWith('low')) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (rl.startsWith('nor') || rl.startsWith('med')) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (rl.startsWith('high')) return 'bg-red-500/20 text-red-400 border-red-500/30';
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };
  const COLS = 8;

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gold-primary/10 bg-gold-primary/5">
            <th className="py-3 px-3 text-left text-gold-primary/70 text-[10px] uppercase tracking-wider">Pair</th>
            <th className="py-3 px-3 text-right text-gold-primary/70 text-[10px] uppercase tracking-wider">Entry</th>
            <th className="py-3 px-3 text-right text-gold-primary/70 text-[10px] uppercase tracking-wider">Max Target</th>
            <th className="py-3 px-3 text-right text-gold-primary/70 text-[10px] uppercase tracking-wider">Stop Loss</th>
            <th className="py-3 px-3 text-center text-gold-primary/70 text-[10px] uppercase tracking-wider">Risk</th>
            <th className="py-3 px-3 text-center text-gold-primary/70 text-[10px] uppercase tracking-wider">Status</th>
            <th className="py-3 px-3 text-center text-gold-primary/70 text-[10px] uppercase tracking-wider">Market Cap</th>
            <th className="py-3 px-3 text-right text-gold-primary/70 text-[10px] uppercase tracking-wider">Date</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            [...Array(10)].map((_, i) => (
              <tr key={i} className="border-b border-gold-primary/5">
                {[...Array(COLS)].map((_, j) => <td key={j} className="py-3 px-3"><div className="h-4 bg-bg-card rounded animate-pulse" /></td>)}
              </tr>
            ))
          ) : signals.length === 0 ? (
            <tr><td colSpan={COLS} className="text-center py-12 text-text-muted">No signals found</td></tr>
          ) : signals.map((s, i) => {
            const mt = getMaxTarget(s);
            const slPct = s.entry && s.stop1 ? ((s.stop1 - s.entry) / s.entry * 100).toFixed(2) : null;
            return (
              <tr key={s.signal_id || i} onClick={() => onSelect(s)}
                className="border-b border-gold-primary/5 hover:bg-gold-primary/5 cursor-pointer transition-colors group">
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <CoinLogo pair={s.pair} size={28} />
                    <div>
                      <p className="text-white text-sm font-semibold group-hover:text-gold-primary transition-colors">{s.pair?.replace(/USDT$/i, '')}</p>
                      <p className="text-text-muted text-[10px]">USDT</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-3 text-right font-mono text-white text-sm">{formatPrice(s.entry)}</td>
                <td className="py-3 px-3 text-right">
                  {mt.value ? (<div><span className="font-mono text-white text-sm">{formatPrice(mt.value)}</span><p className="text-green-400 text-[10px] font-semibold">+{mt.pct}%</p></div>) : <span className="text-text-muted">-</span>}
                </td>
                <td className="py-3 px-3 text-right">
                  {s.stop1 ? (<div><span className="font-mono text-red-400 text-sm">{formatPrice(s.stop1)}</span>{slPct && <p className="text-red-400 text-[10px]">{slPct}%</p>}</div>) : <span className="text-text-muted">-</span>}
                </td>
                <td className="py-3 px-3 text-center">
                  {s.risk_level ? <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${riskBadge(s.risk_level)}`}>{s.risk_level}</span> : '-'}
                </td>
                <td className="py-3 px-3 text-center">{statusBadge(s.status)}</td>
                <td className="py-3 px-3 text-center">
                  {s.market_cap ? <span className="text-text-muted text-xs">{s.market_cap}</span> : '-'}
                </td>
                <td className="py-3 px-3 text-right text-text-muted text-xs font-mono">{formatDate(s.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};


// ============================================
// TP BREAKDOWN — stacked bar + cards
// ============================================
const TPBreakdown = ({ data }) => {
  const total = data.tp1_count + data.tp2_count + data.tp3_count + data.tp4_count + data.sl_count;
  if (total === 0) return <div className="h-48 flex items-center justify-center text-text-muted">No closed trades</div>;

  const items = [
    { label: 'TP1', count: data.tp1_count, color: '#22C55E', bg: 'bg-green-400/10', text: 'text-green-400' },
    { label: 'TP2', count: data.tp2_count, color: '#84CC16', bg: 'bg-lime-400/10', text: 'text-lime-400' },
    { label: 'TP3', count: data.tp3_count, color: '#EAB308', bg: 'bg-yellow-400/10', text: 'text-yellow-400' },
    { label: 'TP4', count: data.tp4_count, color: '#F97316', bg: 'bg-orange-400/10', text: 'text-orange-400' },
    { label: 'SL', count: data.sl_count, color: '#EF4444', bg: 'bg-red-400/10', text: 'text-red-400' },
  ];

  return (
    <div>
      {/* Stacked bar */}
      <div className="h-8 rounded-full overflow-hidden flex mb-4 bg-bg-card">
        {items.filter(i => i.count > 0).map((item, idx) => (
          <div key={idx} style={{ width: `${(item.count / total * 100)}%`, backgroundColor: item.color }}
            className="h-full transition-all duration-500 relative group">
            <div className="absolute inset-0 flex items-center justify-center">
              {(item.count / total * 100) > 8 && (
                <span className="text-[10px] font-bold text-white drop-shadow">{(item.count / total * 100).toFixed(0)}%</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-5 gap-2">
        {items.map((item, i) => (
          <div key={i} className={`rounded-lg p-3 ${item.bg} border border-gold-primary/5 text-center`}>
            <p className={`text-xs font-semibold ${item.text}`}>{item.label}</p>
            <p className="text-white text-lg font-bold font-mono">{item.count.toLocaleString()}</p>
            <p className="text-text-muted text-[10px]">{(item.count / total * 100).toFixed(1)}%</p>
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
  if (!data || data.length === 0) return <div className="h-72 flex items-center justify-center text-text-muted">No trend data available</div>;

  const chartData = data.map(item => ({
    period: (() => { try { const d = new Date(item.period); return isNaN(d) ? item.period : d.toLocaleDateString('en', { month: 'short', day: 'numeric' }); } catch { return item.period; } })(),
    fullDate: item.period, winRate: item.win_rate, winners: item.winners, losers: item.losers, total: item.total_closed,
  }));
  const avgWR = chartData.reduce((s, d) => s + d.winRate, 0) / chartData.length;

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="wrGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22C55E" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#22C55E" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,168,83,0.08)" />
          <XAxis dataKey="period" stroke="#6b5c52" fontSize={10} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 12))} />
          <YAxis stroke="#6b5c52" fontSize={11} domain={[0, 100]} tickFormatter={v => `${v}%`} tickLine={false} />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div className="bg-bg-primary border border-gold-primary/30 rounded-lg p-3 shadow-xl">
                <p className="text-gold-primary text-xs font-semibold mb-2">{d.fullDate || label}</p>
                <p className="text-white text-sm">Win Rate: <span className={`font-bold ${d.winRate >= 80 ? 'text-green-400' : d.winRate >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{d.winRate.toFixed(1)}%</span></p>
                <p className="text-text-muted text-xs">W: <span className="text-green-400">{d.winners}</span> L: <span className="text-red-400">{d.losers}</span> Total: {d.total}</p>
              </div>
            );
          }} />
          <ReferenceLine y={avgWR} stroke="rgba(255,255,255,0.15)" strokeDasharray="5 5" label={{ value: `Avg ${avgWR.toFixed(1)}%`, position: 'right', fill: '#6b5c52', fontSize: 10 }} />
          <Area type="monotone" dataKey="winRate" stroke="#22C55E" strokeWidth={2} fill="url(#wrGrad)"
            dot={{ r: 2.5, fill: '#22C55E', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#22C55E', stroke: '#fff', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};


// ============================================
// RISK:REWARD CHART
// ============================================
const RiskRewardChart = ({ data }) => {
  if (!data || data.length === 0) return <div className="h-52 flex items-center justify-center text-text-muted">No data</div>;
  const colors = { 'TP1': '#22C55E', 'TP2': '#84CC16', 'TP3': '#EAB308', 'TP4': '#F97316', 'SL': '#EF4444' };
  const chartData = data.filter(d => d.level !== 'SL').map(d => ({ level: d.level, rr: d.avg_rr, count: d.count, color: colors[d.level] || '#d4a853' }));

  return (
    <div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,168,83,0.08)" />
            <XAxis dataKey="level" stroke="#6b5c52" fontSize={12} tickLine={false} />
            <YAxis stroke="#6b5c52" fontSize={11} tickLine={false} tickFormatter={v => `${v.toFixed(1)}R`} />
            <Tooltip contentStyle={{ backgroundColor: '#1a0a0a', border: '1px solid rgba(212,168,83,0.3)', borderRadius: '8px' }}
              formatter={(value) => [`1:${value.toFixed(2)}`, 'R:R']} />
            <Bar dataKey="rr" radius={[6, 6, 0, 0]}>{chartData.map((e, i) => <Cell key={i} fill={e.color} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {data.map(d => (
          <div key={d.level} className="flex items-center gap-2 bg-bg-card/50 rounded-lg px-3 py-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors[d.level] || '#888' }} />
            <span className="text-text-muted text-xs">{d.level}</span>
            <span className="text-white text-xs font-mono font-semibold">{d.level === 'SL' ? '-1R' : `${d.avg_rr.toFixed(2)}R`}</span>
            <span className="text-text-muted text-[10px]">({d.count})</span>
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
  if (!data || data.length === 0) return <div className="h-56 flex items-center justify-center text-text-muted">Not enough data</div>;

  const chartData = data.map(item => ({
    period: (() => { try { const d = new Date(item.period); return isNaN(d) ? item.period : d.toLocaleDateString('en', { month: 'short', day: 'numeric' }); } catch { return item.period; } })(),
    fullDate: item.period,
    low: item.low_wr, normal: item.normal_wr, high: item.high_wr,
    lowCount: item.low_count, normalCount: item.normal_count, highCount: item.high_count,
  }));

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,168,83,0.08)" />
          <XAxis dataKey="period" stroke="#6b5c52" fontSize={10} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 10))} />
          <YAxis stroke="#6b5c52" fontSize={11} domain={[0, 100]} tickFormatter={v => `${v}%`} tickLine={false} />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload;
            return (
              <div className="bg-bg-primary border border-gold-primary/30 rounded-lg p-3 shadow-xl">
                <p className="text-gold-primary text-xs font-semibold mb-2">{d?.fullDate || label}</p>
                {d?.low != null && <p className="text-green-400 text-xs">Low: {d.low.toFixed(1)}% <span className="text-text-muted">({d.lowCount})</span></p>}
                {d?.normal != null && <p className="text-yellow-400 text-xs">Normal: {d.normal.toFixed(1)}% <span className="text-text-muted">({d.normalCount})</span></p>}
                {d?.high != null && <p className="text-red-400 text-xs">High: {d.high.toFixed(1)}% <span className="text-text-muted">({d.highCount})</span></p>}
              </div>
            );
          }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
          <Line type="monotone" dataKey="low" name="Low Risk" stroke="#22C55E" strokeWidth={2} dot={{ r: 2 }} connectNulls />
          <Line type="monotone" dataKey="normal" name="Normal Risk" stroke="#EAB308" strokeWidth={2} dot={{ r: 2 }} connectNulls />
          <Line type="monotone" dataKey="high" name="High Risk" stroke="#EF4444" strokeWidth={2} dot={{ r: 2 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};


// ============================================
// SUB COMPONENTS
// ============================================
const StatsCard = ({ label, value, subValue, icon, color = 'text-white' }) => (
  <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
    <div className="flex items-center justify-between mb-2">
      <p className="text-text-muted text-xs uppercase tracking-wider">{label}</p>
      <div className="opacity-70">{icon}</div>
    </div>
    <p className={`text-2xl font-display font-bold ${color}`}>{value}</p>
    {subValue && <p className="text-text-muted text-xs mt-1">{subValue}</p>}
  </div>
);

const LoadingSkeleton = () => (
  <div className="space-y-6">
    <div className="flex items-center gap-3">
      <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
      <h2 className="font-display text-2xl font-semibold text-white">Performance Analytics</h2>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="glass-card rounded-xl p-5 animate-pulse border border-gold-primary/10">
          <div className="h-4 bg-gold-primary/20 rounded w-20 mb-3" />
          <div className="h-8 bg-gold-primary/20 rounded w-16" />
        </div>
      ))}
    </div>
    <div className="glass-card rounded-xl p-5 h-80 animate-pulse border border-gold-primary/10" />
  </div>
);

export default AnalyzePage;