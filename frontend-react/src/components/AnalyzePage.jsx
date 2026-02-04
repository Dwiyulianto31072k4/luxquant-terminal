import { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, AreaChart, Area, Line, Legend, Cell } from 'recharts';

const API_BASE = '/api/v1';

const AnalyzePage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dailyWinRate, setDailyWinRate] = useState(null);
  const [riskReward, setRiskReward] = useState(null);
  const [timeRange, setTimeRange] = useState('all');
  const [minTrades, setMinTrades] = useState(5);
  const [sortMetric, setSortMetric] = useState('win_rate');
  const [topN, setTopN] = useState(20);
  const [chartPeriod, setChartPeriod] = useState('weekly');
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [coinDetail, setCoinDetail] = useState(null);
  const [coinLoading, setCoinLoading] = useState(false);

  useEffect(() => { fetchAllData(); }, [timeRange, chartPeriod]);

  const fetchAllData = async () => {
    try {
      setLoading(true); setError(null);
      const params = new URLSearchParams();
      if (timeRange !== 'all') params.append('time_range', timeRange);
      const [analyzeRes, dailyRes, rrRes] = await Promise.all([
        fetch(`${API_BASE}/signals/analyze?${params}`),
        fetch(`${API_BASE}/signals/analytics/daily-winrate?${params}&period=${chartPeriod}`),
        fetch(`${API_BASE}/signals/analytics/risk-reward?${params}`)
      ]);
      if (!analyzeRes.ok) throw new Error('Failed to fetch');
      setData(await analyzeRes.json());
      if (dailyRes.ok) setDailyWinRate(await dailyRes.json());
      if (rrRes.ok) setRiskReward(await rrRes.json());
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const fetchCoinDetail = async (pair) => {
    try {
      setCoinLoading(true); setSelectedCoin(pair);
      const params = new URLSearchParams();
      if (timeRange !== 'all') params.append('time_range', timeRange);
      params.append('limit', '50');
      const response = await fetch(`${API_BASE}/signals/analytics/coin/${pair}?${params}`);
      if (response.ok) setCoinDetail(await response.json());
    } catch (err) { console.error(err); } finally { setCoinLoading(false); }
  };

  const closeModal = () => { setSelectedCoin(null); setCoinDetail(null); };

  const topPerformers = useMemo(() => {
    if (!data?.pair_metrics) return [];
    return data.pair_metrics
      .filter(p => p.closed_trades >= minTrades)
      .sort((a, b) => sortMetric === 'win_rate' ? b.win_rate - a.win_rate : sortMetric === 'total_signals' ? b.total_signals - a.total_signals : b.performance_score - a.performance_score)
      .slice(0, topN);
  }, [data, minTrades, sortMetric, topN]);

  const timeRangeOptions = [
    { value: 'all', label: 'All Time' }, { value: 'ytd', label: 'Year to Date' },
    { value: 'mtd', label: 'Month to Date' }, { value: '30d', label: 'Last 30 Days' }, { value: '7d', label: 'Last 7 Days' },
  ];

  if (loading) return <LoadingSkeleton />;
  if (error) return <div className="glass-card rounded-xl p-8 border border-red-500/30 text-center"><p className="text-red-400 mb-4">⚠️ {error}</p><button onClick={fetchAllData} className="px-4 py-2 bg-gold-primary/20 text-gold-primary rounded-lg">Retry</button></div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-2xl font-semibold text-white">Performance Analysis</h2>
        </div>
        <div className="flex items-center gap-2">
          {timeRangeOptions.map(opt => (
            <button key={opt.value} onClick={() => setTimeRange(opt.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${timeRange === opt.value ? 'bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary shadow-gold-glow' : 'bg-bg-card border border-gold-primary/20 text-text-secondary hover:text-white'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-4 glass-card rounded-2xl p-6 border border-gold-primary/20 bg-gradient-to-br from-gold-primary/10 to-transparent">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-text-muted text-sm uppercase tracking-wider mb-1">Win Rate</p>
              <p className={`text-5xl font-display font-bold ${data.stats.win_rate >= 80 ? 'text-green-400' : data.stats.win_rate >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{data.stats.win_rate.toFixed(2)}%</p>
            </div>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${data.stats.win_rate >= 80 ? 'bg-green-500/20' : data.stats.win_rate >= 60 ? 'bg-yellow-500/20' : 'bg-red-500/20'}`}>
              <svg className={`w-8 h-8 ${data.stats.win_rate >= 80 ? 'text-green-400' : data.stats.win_rate >= 60 ? 'text-yellow-400' : 'text-red-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </div>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${data.stats.win_rate >= 80 ? 'bg-green-500/20 text-green-400' : data.stats.win_rate >= 60 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
            {data.stats.win_rate >= 80 ? '🔥 Excellent' : data.stats.win_rate >= 60 ? '👍 Good' : '📊 Average'}
          </span>
        </div>
        <StatCard span="2" icon="chart" color="blue" label="Total Signals" value={data.stats.total_signals.toLocaleString()} />
        <StatCard span="2" icon="check" color="green" label="Winners" value={data.stats.total_winners.toLocaleString()} />
        <StatCard span="2" icon="x" color="red" label="Stop Loss" value={data.stats.sl_count.toLocaleString()} />
        <StatCard span="2" icon="clock" color="cyan" label="Not Closed" value={data.stats.open_signals.toLocaleString()} sub="Pending TP/SL" />
      </div>

      {/* Chart */}
      <div className="glass-card rounded-2xl p-6 border border-gold-primary/10">
        <div className="flex items-center justify-between mb-6">
          <div><h3 className="text-white font-semibold text-lg">Win Rate Trend</h3><p className="text-text-muted text-sm">Historical performance over time</p></div>
          <div className="flex items-center gap-2 bg-bg-primary rounded-lg p-1">
            {['daily', 'weekly'].map(p => (
              <button key={p} onClick={() => setChartPeriod(p)} className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${chartPeriod === p ? 'bg-gold-primary text-bg-primary' : 'text-text-secondary hover:text-white'}`}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>
            ))}
          </div>
        </div>
        <WinRateTrendChart data={dailyWinRate} />
        {dailyWinRate?.summary && (
          <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gold-primary/10">
            <SummaryMini icon="calendar" label="Periods" value={dailyWinRate.summary.total_periods} />
            <SummaryMini icon="percent" label="Avg Win Rate" value={`${dailyWinRate.summary.overall_win_rate}%`} color="text-green-400" />
            <SummaryMini icon="trophy" label="Total Wins" value={dailyWinRate.summary.total_wins.toLocaleString()} color="text-green-400" />
            <SummaryMini icon="zap" label="Avg Signals/Day" value={dailyWinRate.summary.avg_daily_signals} />
          </div>
        )}
      </div>

      {/* R:R & TP */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-6 border border-gold-primary/10">
          <div className="mb-6"><h3 className="text-white font-semibold text-lg">Risk : Reward Ratio</h3><p className="text-text-muted text-sm">Average R:R per target level</p></div>
          <RiskRewardSection data={riskReward} />
        </div>
        <div className="glass-card rounded-2xl p-6 border border-gold-primary/10">
          <div className="mb-6"><h3 className="text-white font-semibold text-lg">TP Level Breakdown</h3><p className="text-text-muted text-sm">Distribution of target hits</p></div>
          <TPLevelChart data={data.stats} />
        </div>
      </div>

      {/* TP Cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <TPCard level="Not Closed" count={data.stats.open_signals} total={data.stats.total_signals} color="cyan" icon="clock" />
        <TPCard level="TP1" count={data.stats.tp1_count} total={data.stats.closed_trades} color="green" icon="target" />
        <TPCard level="TP2" count={data.stats.tp2_count} total={data.stats.closed_trades} color="lime" icon="target" />
        <TPCard level="TP3" count={data.stats.tp3_count} total={data.stats.closed_trades} color="yellow" icon="target" />
        <TPCard level="TP4" count={data.stats.tp4_count} total={data.stats.closed_trades} color="orange" icon="star" />
        <TPCard level="SL" count={data.stats.sl_count} total={data.stats.closed_trades} color="red" icon="x" />
      </div>

      {/* Top Performers */}
      <div className="glass-card rounded-2xl border border-gold-primary/10 overflow-hidden">
        <div className="p-6 border-b border-gold-primary/10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-white font-semibold text-lg flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center"><svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm2.5 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6.207.293a1 1 0 00-1.414 0l-6 6a1 1 0 101.414 1.414l6-6a1 1 0 000-1.414zM12.5 10a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" clipRule="evenodd" /></svg></span>
              Top Performers
            </h3>
            <p className="text-text-muted text-sm mt-1">Click any row to see detailed analytics</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <FilterSelect label="Min Trades" value={minTrades} onChange={setMinTrades} options={[1, 3, 5, 10, 15, 20]} />
            <FilterSelect label="Sort" value={sortMetric} onChange={setSortMetric} options={[{ value: 'win_rate', label: 'Win Rate' }, { value: 'total_signals', label: 'Total Signals' }, { value: 'performance_score', label: 'Score' }]} />
            <FilterSelect label="Show" value={topN} onChange={setTopN} options={[10, 15, 20, 25, 30].map(n => ({ value: n, label: `Top ${n}` }))} />
          </div>
        </div>
        <TopPerformersTable performers={topPerformers} onRowClick={fetchCoinDetail} />
      </div>

      <div className="text-center text-text-muted text-sm py-4">Real-time analysis • {data.stats.total_signals.toLocaleString()} signals tracked</div>
      {selectedCoin && <CoinDetailModal coin={selectedCoin} data={coinDetail} loading={coinLoading} onClose={closeModal} />}
    </div>
  );
};

const StatCard = ({ span, icon, color, label, value, sub }) => {
  const icons = { chart: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />, check: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />, x: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />, clock: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> };
  const colors = { blue: 'bg-blue-500/20 text-blue-400', green: 'bg-green-500/20 text-green-400', red: 'bg-red-500/20 text-red-400', cyan: 'bg-cyan-500/20 text-cyan-400' };
  return (
    <div className={`col-span-6 md:col-span-${span} glass-card rounded-2xl p-5 border border-gold-primary/10`}>
      <div className={`w-10 h-10 rounded-xl ${colors[color].split(' ')[0]} flex items-center justify-center mb-3`}><svg className={`w-5 h-5 ${colors[color].split(' ')[1]}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">{icons[icon]}</svg></div>
      <p className="text-text-muted text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-display font-bold ${colors[color].split(' ')[1]}`}>{value}</p>
      {sub && <p className="text-text-muted text-xs mt-1">{sub}</p>}
    </div>
  );
};

const SummaryMini = ({ icon, label, value, color = 'text-white' }) => {
  const icons = { calendar: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />, percent: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />, trophy: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />, zap: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /> };
  return <div className="text-center"><div className="w-8 h-8 mx-auto mb-2 rounded-lg bg-gold-primary/10 flex items-center justify-center"><svg className="w-4 h-4 text-gold-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">{icons[icon]}</svg></div><p className="text-text-muted text-xs uppercase">{label}</p><p className={`font-semibold ${color}`}>{value}</p></div>;
};

const FilterSelect = ({ label, value, onChange, options }) => <div className="flex items-center gap-2"><span className="text-text-muted text-xs">{label}:</span><select value={value} onChange={(e) => onChange(typeof options[0] === 'object' ? e.target.value : Number(e.target.value))} className="px-3 py-1.5 bg-bg-primary border border-gold-primary/20 rounded-lg text-white text-sm">{options.map(opt => <option key={opt.value ?? opt} value={opt.value ?? opt}>{opt.label ?? opt}</option>)}</select></div>;

const TPCard = ({ level, count, total, color, icon }) => {
  const pct = total > 0 ? (count / total * 100).toFixed(1) : 0;
  const cfg = { cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' }, green: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' }, lime: { bg: 'bg-lime-500/20', text: 'text-lime-400', border: 'border-lime-500/30' }, yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' }, orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' }, red: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' } }[color];
  const icons = { clock: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />, target: <><circle cx="12" cy="12" r="10" strokeWidth={2} /><circle cx="12" cy="12" r="6" strokeWidth={2} /><circle cx="12" cy="12" r="2" strokeWidth={2} /></>, star: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />, x: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /> };
  return <div className={`glass-card rounded-xl p-4 border ${cfg.border} text-center transition-transform hover:scale-105`}><div className={`w-10 h-10 mx-auto mb-2 rounded-xl ${cfg.bg} flex items-center justify-center`}><svg className={`w-5 h-5 ${cfg.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">{icons[icon]}</svg></div><p className={`text-xs font-medium ${cfg.text} mb-1`}>{level}</p><p className="text-white font-display font-bold text-xl">{count.toLocaleString()}</p><p className="text-text-muted text-xs">{pct}%</p></div>;
};

const WinRateTrendChart = ({ data }) => {
  if (!data?.data?.length) return <div className="h-72 flex items-center justify-center text-text-muted">No trend data</div>;
  const chartData = data.data.map((item, idx, arr) => { const start = Math.max(0, idx - 6); const slice = arr.slice(start, idx + 1); return { ...item, ma: Math.round(slice.reduce((s, d) => s + d.win_rate, 0) / slice.length * 100) / 100 }; });
  return <div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="wrGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22C55E" stopOpacity={0.3}/><stop offset="95%" stopColor="#22C55E" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="rgba(212,168,83,0.1)" /><XAxis dataKey="date" stroke="#6b5c52" fontSize={10} tickFormatter={v => { const d = new Date(v); return `${d.getMonth()+1}/${d.getDate()}`; }} /><YAxis stroke="#6b5c52" fontSize={12} domain={[0, 100]} tickFormatter={v => `${v}%`} /><Tooltip contentStyle={{ backgroundColor: '#1a0a0a', border: '1px solid rgba(212,168,83,0.3)', borderRadius: '8px' }} formatter={(v, n) => [`${v.toFixed(1)}%`, n === 'win_rate' ? 'Win Rate' : '7-Period MA']} labelFormatter={l => new Date(l).toLocaleDateString()} /><Legend verticalAlign="bottom" formatter={v => <span className="text-text-secondary text-xs">{v === 'win_rate' ? '● Win Rate' : v === 'ma' ? '◦ 7-Period MA' : '-- Break Even'}</span>} /><Line type="monotone" dataKey={() => 50} stroke="#6b5c52" strokeDasharray="5 5" dot={false} name="Break Even" /><Area type="monotone" dataKey="win_rate" stroke="#22C55E" fill="url(#wrGrad)" strokeWidth={2} dot={{ r: 2, fill: '#22C55E' }} activeDot={{ r: 5 }} name="win_rate" /><Line type="monotone" dataKey="ma" stroke="#EAB308" strokeWidth={2} strokeDasharray="5 5" dot={false} name="ma" /></AreaChart></ResponsiveContainer></div>;
};

const RiskRewardSection = ({ data }) => {
  if (!data?.items?.length) return <div className="h-48 flex items-center justify-center text-text-muted">No data</div>;
  const colors = { 'TP1': { bg: 'bg-green-500/20', text: 'text-green-400', bar: '#22C55E' }, 'TP2': { bg: 'bg-lime-500/20', text: 'text-lime-400', bar: '#84CC16' }, 'TP3': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', bar: '#EAB308' }, 'TP4': { bg: 'bg-orange-500/20', text: 'text-orange-400', bar: '#F97316' } };
  const maxRR = Math.max(...data.items.map(i => i.risk_reward_ratio));
  return <div className="space-y-3">{data.items.map(item => { const cfg = colors[item.tp_level]; const w = (item.risk_reward_ratio / maxRR) * 100; return <div key={item.tp_level} className="p-4 bg-bg-primary rounded-xl"><div className="flex items-center justify-between mb-2"><div className="flex items-center gap-3"><span className={`px-3 py-1 rounded-lg text-sm font-bold ${cfg.bg} ${cfg.text}`}>{item.tp_level}</span><span className="text-white font-mono font-bold">1 : {item.risk_reward_ratio.toFixed(2)}</span></div><span className="text-text-muted text-sm">{item.total_hits.toLocaleString()} hits</span></div><div className="h-2 bg-bg-card rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${w}%`, backgroundColor: cfg.bar }} /></div><div className="flex justify-between mt-2 text-xs"><span className="text-green-400">+{item.avg_reward_pct.toFixed(2)}% reward</span><span className="text-red-400">-{item.avg_risk_pct.toFixed(2)}% risk</span></div></div>; })}</div>;
};

const TPLevelChart = ({ data }) => {
  const total = data.tp1_count + data.tp2_count + data.tp3_count + data.tp4_count + data.sl_count;
  const chartData = [{ name: 'TP1', count: data.tp1_count, pct: ((data.tp1_count/total)*100).toFixed(1), fill: '#22C55E' }, { name: 'TP2', count: data.tp2_count, pct: ((data.tp2_count/total)*100).toFixed(1), fill: '#84CC16' }, { name: 'TP3', count: data.tp3_count, pct: ((data.tp3_count/total)*100).toFixed(1), fill: '#EAB308' }, { name: 'TP4', count: data.tp4_count, pct: ((data.tp4_count/total)*100).toFixed(1), fill: '#F97316' }, { name: 'SL', count: data.sl_count, pct: ((data.sl_count/total)*100).toFixed(1), fill: '#EF4444' }];
  const CustomLabel = ({ x, y, width, height, value, index }) => { const item = chartData[index]; return <text x={x + width + 8} y={y + height / 2} fill={item.fill} fontSize={12} fontWeight="600" dominantBaseline="middle">{item.pct}%</text>; };
  return <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ right: 50 }}><CartesianGrid strokeDasharray="3 3" stroke="rgba(212,168,83,0.1)" /><XAxis type="number" stroke="#6b5c52" fontSize={12} /><YAxis type="category" dataKey="name" stroke="#6b5c52" fontSize={12} width={40} /><Tooltip contentStyle={{ backgroundColor: '#1a0a0a', border: '1px solid rgba(212,168,83,0.3)', borderRadius: '8px' }} formatter={(v, n, p) => [`${v.toLocaleString()} (${p.payload.pct}%)`, 'Count']} /><Bar dataKey="count" radius={[0, 4, 4, 0]} label={<CustomLabel />}>{chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}</Bar></BarChart></ResponsiveContainer></div>;
};

const TopPerformersTable = ({ performers, onRowClick }) => {
  if (!performers.length) return <div className="p-8 text-center text-text-muted">No pairs meet criteria</div>;
  return <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-gold-primary/10 bg-bg-primary">{['Rank','Pair','Signals','Closed','Win Rate','TP1','TP2','TP3','TP4','SL','Score'].map((h,i) => <th key={h} className={`py-4 px-4 text-gold-primary text-xs font-semibold uppercase tracking-wider ${i < 2 ? 'text-left' : i < 5 ? 'text-right' : i < 10 ? 'text-center' : 'text-right'}`}>{h}</th>)}</tr></thead><tbody>{performers.map((p, idx) => <tr key={p.pair} onClick={() => onRowClick(p.pair)} className="border-b border-gold-primary/5 hover:bg-gold-primary/10 cursor-pointer group"><td className="py-4 px-4"><RankBadge rank={idx+1} /></td><td className="py-4 px-4"><div className="flex items-center gap-3"><CoinIcon symbol={p.pair.replace('USDT','')} size="sm" /><div><span className="text-white font-semibold group-hover:text-gold-primary">{p.pair.replace('USDT','')}</span><span className="text-text-muted">/USDT</span></div></div></td><td className="py-4 px-4 text-right font-mono text-text-secondary">{p.total_signals}</td><td className="py-4 px-4 text-right font-mono text-text-secondary">{p.closed_trades}</td><td className="py-4 px-4 text-right"><WinRateBadge value={p.win_rate} /></td><td className="py-4 px-4 text-center text-green-400 font-mono">{p.tp1_count}</td><td className="py-4 px-4 text-center text-lime-400 font-mono">{p.tp2_count}</td><td className="py-4 px-4 text-center text-yellow-400 font-mono">{p.tp3_count}</td><td className="py-4 px-4 text-center text-orange-400 font-mono">{p.tp4_count}</td><td className="py-4 px-4 text-center text-red-400 font-mono">{p.sl_count}</td><td className="py-4 px-4 text-right"><span className="px-3 py-1 bg-gold-primary/20 text-gold-primary rounded-lg text-sm font-semibold">{p.performance_score.toFixed(0)}</span></td></tr>)}</tbody></table></div>;
};

const RankBadge = ({ rank }) => { if (rank === 1) return <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-yellow-500/30"><svg className="w-4 h-4 text-yellow-900" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5z" clipRule="evenodd" /></svg></div>; if (rank === 2) return <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center shadow-lg shadow-gray-400/30"><span className="text-gray-800 font-bold text-sm">2</span></div>; if (rank === 3) return <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-700 flex items-center justify-center shadow-lg shadow-orange-500/30"><span className="text-orange-100 font-bold text-sm">3</span></div>; return <div className="w-8 h-8 rounded-full bg-bg-primary flex items-center justify-center"><span className="text-text-muted font-semibold text-sm">{rank}</span></div>; };
const WinRateBadge = ({ value }) => { const cfg = value >= 80 ? { bg: 'bg-green-500/20', text: 'text-green-400' } : value >= 60 ? { bg: 'bg-lime-500/20', text: 'text-lime-400' } : value >= 50 ? { bg: 'bg-yellow-500/20', text: 'text-yellow-400' } : { bg: 'bg-red-500/20', text: 'text-red-400' }; return <span className={`px-2 py-1 rounded-lg text-sm font-mono font-semibold ${cfg.bg} ${cfg.text}`}>{value.toFixed(1)}%</span>; };
const CoinIcon = ({ symbol, size = 'md' }) => { const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base' }; const colors = ['from-blue-500 to-blue-700', 'from-purple-500 to-purple-700', 'from-pink-500 to-pink-700', 'from-indigo-500 to-indigo-700', 'from-cyan-500 to-cyan-700', 'from-teal-500 to-teal-700', 'from-emerald-500 to-emerald-700', 'from-amber-500 to-amber-700']; return <div className={`${sizes[size]} rounded-xl bg-gradient-to-br ${colors[symbol.charCodeAt(0) % colors.length]} flex items-center justify-center font-bold text-white shadow-lg`}>{symbol.slice(0, 2)}</div>; };

const CoinDetailModal = ({ coin, data, loading, onClose }) => {
  // Calculate gain % for each signal
  const getGainPct = (signal) => {
    if (!signal.entry || signal.entry === 0) return null;
    const outcome = (signal.outcome || signal.status || '').toLowerCase();
    let targetPrice = null;
    if (outcome.includes('tp4') || outcome === 'closed_win') targetPrice = signal.target4;
    else if (outcome.includes('tp3')) targetPrice = signal.target3;
    else if (outcome.includes('tp2')) targetPrice = signal.target2;
    else if (outcome.includes('tp1')) targetPrice = signal.target1;
    else if (outcome.includes('sl') || outcome === 'closed_loss') targetPrice = signal.stop1;
    if (!targetPrice) return null;
    return ((targetPrice - signal.entry) / signal.entry * 100).toFixed(2);
  };

  // TP Distribution data for chart
  const getTPChartData = () => {
    if (!data) return [];
    const total = data.tp1_count + data.tp2_count + data.tp3_count + data.tp4_count + data.sl_count;
    if (total === 0) return [];
    return [
      { name: 'TP1', count: data.tp1_count, pct: ((data.tp1_count/total)*100).toFixed(1), fill: '#22C55E' },
      { name: 'TP2', count: data.tp2_count, pct: ((data.tp2_count/total)*100).toFixed(1), fill: '#84CC16' },
      { name: 'TP3', count: data.tp3_count, pct: ((data.tp3_count/total)*100).toFixed(1), fill: '#EAB308' },
      { name: 'TP4', count: data.tp4_count, pct: ((data.tp4_count/total)*100).toFixed(1), fill: '#F97316' },
      { name: 'SL', count: data.sl_count, pct: ((data.sl_count/total)*100).toFixed(1), fill: '#EF4444' },
    ];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 pb-8 px-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-bg-card rounded-2xl border border-gold-primary/20 shadow-2xl my-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-bg-card rounded-t-2xl border-b border-gold-primary/10 p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CoinIcon symbol={coin.replace('USDT','')} size="lg" />
            <div>
              <h2 className="text-2xl font-display font-bold text-white">{coin.replace('USDT','')}<span className="text-text-muted font-normal">/USDT</span></h2>
              <p className="text-text-muted text-sm">Detailed Performance Analytics</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl bg-bg-primary hover:bg-red-500/20 text-text-muted hover:text-red-400 flex items-center justify-center transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20"><div className="animate-spin w-10 h-10 border-3 border-gold-primary border-t-transparent rounded-full" /></div>
          ) : data ? (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ModalStat label="Total Signals" value={data.total_signals} icon="chart" />
                <ModalStat label="Win Rate" value={`${data.win_rate}%`} icon="percent" color={data.win_rate >= 70 ? 'green' : 'yellow'} />
                <ModalStat label="Avg R:R" value={`1:${data.avg_risk_reward}`} icon="scale" />
                <ModalStat label="Not Closed" value={data.open_signals} icon="clock" color="cyan" />
              </div>

              {/* TP Distribution Chart */}
              {data.closed_trades > 0 && (
                <div className="bg-bg-primary rounded-xl p-5">
                  <h4 className="text-white font-semibold mb-4">TP Distribution</h4>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getTPChartData()} layout="vertical" margin={{ right: 50 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,168,83,0.1)" />
                        <XAxis type="number" stroke="#6b5c52" fontSize={11} />
                        <YAxis type="category" dataKey="name" stroke="#6b5c52" fontSize={11} width={35} />
                        <Tooltip contentStyle={{ backgroundColor: '#1a0a0a', border: '1px solid rgba(212,168,83,0.3)', borderRadius: '8px' }} formatter={(v, n, p) => [`${v} (${p.payload.pct}%)`, '']} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {getTPChartData().map((e, i) => <Cell key={i} fill={e.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Recent Performance Chart */}
              {data.daily_performance?.length > 0 && (
                <div className="bg-bg-primary rounded-xl p-5">
                  <h4 className="text-white font-semibold mb-4">Recent Win Rate</h4>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.daily_performance.slice().reverse()}>
                        <defs><linearGradient id="mGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22C55E" stopOpacity={0.3}/><stop offset="95%" stopColor="#22C55E" stopOpacity={0}/></linearGradient></defs>
                        <XAxis dataKey="date" hide /><YAxis domain={[0, 100]} hide />
                        <Tooltip contentStyle={{ backgroundColor: '#1a0a0a', border: '1px solid rgba(212,168,83,0.3)', borderRadius: '8px' }} formatter={v => [`${v}%`, 'Win Rate']} />
                        <Area type="monotone" dataKey="win_rate" stroke="#22C55E" fill="url(#mGrad)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Signal History */}
              <div className="bg-bg-primary rounded-xl overflow-hidden">
                <h4 className="text-white font-semibold p-5 border-b border-gold-primary/10">Signal History ({data.signals?.length || 0})</h4>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-bg-card sticky top-0">
                      <tr>
                        <th className="py-3 px-4 text-left text-gold-primary text-xs">Date</th>
                        <th className="py-3 px-4 text-right text-gold-primary text-xs">Entry</th>
                        <th className="py-3 px-4 text-right text-gold-primary text-xs">SL</th>
                        <th className="py-3 px-4 text-center text-gold-primary text-xs">Outcome</th>
                        <th className="py-3 px-4 text-right text-gold-primary text-xs">Gain %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.signals?.map((s, i) => {
                        const gain = getGainPct(s);
                        const isProfit = gain && parseFloat(gain) > 0;
                        return (
                          <tr key={s.signal_id || i} className="border-b border-gold-primary/5 hover:bg-gold-primary/5">
                            <td className="py-3 px-4 text-text-muted">{s.created_at ? new Date(s.created_at).toLocaleDateString() : '-'}</td>
                            <td className="py-3 px-4 text-right font-mono text-white">{s.entry?.toFixed(4) || '-'}</td>
                            <td className="py-3 px-4 text-right font-mono text-red-400">{s.stop1?.toFixed(4) || '-'}</td>
                            <td className="py-3 px-4 text-center"><OutcomeBadge outcome={s.outcome || s.status} /></td>
                            <td className={`py-3 px-4 text-right font-mono font-semibold ${gain ? (isProfit ? 'text-green-400' : 'text-red-400') : 'text-text-muted'}`}>
                              {gain ? `${isProfit ? '+' : ''}${gain}%` : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Meta */}
              <div className="flex items-center justify-between text-xs text-text-muted pt-4 border-t border-gold-primary/10">
                <span>First: {data.first_signal ? new Date(data.first_signal).toLocaleDateString() : '-'}</span>
                <span>Last: {data.last_signal ? new Date(data.last_signal).toLocaleDateString() : '-'}</span>
              </div>
            </div>
          ) : <div className="text-center py-20 text-text-muted">Failed to load</div>}
        </div>
      </div>
    </div>
  );
};

const ModalStat = ({ label, value, icon, color = 'gold' }) => { const colorMap = { gold: { bg: 'bg-gold-primary/20', text: 'text-gold-primary' }, green: { bg: 'bg-green-500/20', text: 'text-green-400' }, yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' }, cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' } }; const icons = { chart: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />, percent: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />, scale: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />, clock: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> }; const cfg = colorMap[color]; return <div className="bg-bg-primary rounded-xl p-4"><div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center mb-3`}><svg className={`w-5 h-5 ${cfg.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">{icons[icon]}</svg></div><p className="text-text-muted text-xs uppercase mb-1">{label}</p><p className={`text-xl font-bold ${cfg.text}`}>{value}</p></div>; };
const MiniTP = ({ label, count, color }) => { const colorMap = { green: 'bg-green-500/20 text-green-400 border-green-500/30', lime: 'bg-lime-500/20 text-lime-400 border-lime-500/30', yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30', red: 'bg-red-500/20 text-red-400 border-red-500/30' }; return <div className={`rounded-xl p-3 text-center border ${colorMap[color]}`}><p className="text-xs font-semibold">{label}</p><p className="text-xl font-bold">{count}</p></div>; };
const OutcomeBadge = ({ outcome }) => { if (!outcome) return <span className="text-text-muted">-</span>; const l = outcome.toLowerCase(); const cfg = l.includes('tp4') || l === 'closed_win' ? { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'TP4' } : l.includes('tp3') ? { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'TP3' } : l.includes('tp2') ? { bg: 'bg-lime-500/20', text: 'text-lime-400', label: 'TP2' } : l.includes('tp1') ? { bg: 'bg-green-500/20', text: 'text-green-400', label: 'TP1' } : l.includes('sl') || l === 'closed_loss' ? { bg: 'bg-red-500/20', text: 'text-red-400', label: 'SL' } : { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'Open' }; return <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>; };

const LoadingSkeleton = () => <div className="space-y-6"><div className="flex items-center gap-3"><div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" /><h2 className="font-display text-2xl font-semibold text-white">Performance Analysis</h2></div><div className="grid grid-cols-12 gap-4"><div className="col-span-4 glass-card rounded-2xl p-6 h-36 animate-pulse border border-gold-primary/10" /><div className="col-span-2 glass-card rounded-2xl p-5 h-36 animate-pulse border border-gold-primary/10" /><div className="col-span-2 glass-card rounded-2xl p-5 h-36 animate-pulse border border-gold-primary/10" /><div className="col-span-2 glass-card rounded-2xl p-5 h-36 animate-pulse border border-gold-primary/10" /><div className="col-span-2 glass-card rounded-2xl p-5 h-36 animate-pulse border border-gold-primary/10" /></div><div className="glass-card rounded-2xl p-6 h-96 animate-pulse border border-gold-primary/10" /></div>;

export default AnalyzePage;