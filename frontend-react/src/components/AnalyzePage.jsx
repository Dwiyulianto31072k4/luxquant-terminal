import { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend, Area, AreaChart, ReferenceLine } from 'recharts';

const API_BASE = '/api/v1';

/**
 * AnalyzePage - Comprehensive trading performance analysis
 * Features: Win Rate Trend, Risk:Reward, Distribution, Top Performers
 */
const AnalyzePage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [timeRange, setTimeRange] = useState('all');
  const [trendMode, setTrendMode] = useState('weekly');
  const [minTrades, setMinTrades] = useState(5);
  const [sortMetric, setSortMetric] = useState('win_rate');
  const [topN, setTopN] = useState(20);

  useEffect(() => {
    fetchAnalyzeData();
  }, [timeRange, trendMode]);

  const fetchAnalyzeData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (timeRange !== 'all') params.append('time_range', timeRange);
      params.append('trend_mode', trendMode);
      
      const response = await fetch(`${API_BASE}/signals/analyze?${params}`);
      if (!response.ok) throw new Error('Failed to fetch analyze data');
      
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Error fetching analyze data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const topPerformers = useMemo(() => {
    if (!data?.pair_metrics) return [];
    return data.pair_metrics
      .filter(p => p.closed_trades >= minTrades)
      .sort((a, b) => {
        if (sortMetric === 'win_rate') return b.win_rate - a.win_rate;
        if (sortMetric === 'total_signals') return b.total_signals - a.total_signals;
        if (sortMetric === 'performance_score') return b.performance_score - a.performance_score;
        return b.win_rate - a.win_rate;
      })
      .slice(0, topN);
  }, [data, minTrades, sortMetric, topN]);

  const timeRangeOptions = [
    { value: 'all', label: 'All Time' },
    { value: 'ytd', label: 'Year to Date' },
    { value: 'mtd', label: 'Month to Date' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '7d', label: 'Last 7 Days' },
  ];

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <p className="text-red-400 text-lg mb-4">Failed to load analysis data</p>
        <p className="text-text-muted text-sm mb-4">{error}</p>
        <button onClick={fetchAnalyzeData} className="px-4 py-2 bg-gold-primary/20 text-gold-primary rounded-lg hover:bg-gold-primary/30 transition-colors">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-2xl font-semibold text-white">Performance Analytics</h2>
        </div>
        
        {/* Time Range Filter */}
        <div className="flex gap-2">
          {timeRangeOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setTimeRange(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                timeRange === opt.value
                  ? 'bg-gold-primary text-bg-primary'
                  : 'bg-bg-card text-text-muted hover:text-white border border-gold-primary/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatsCard label="Total Signals" value={data.stats.total_signals.toLocaleString()} icon="📊" />
        <StatsCard label="Closed Trades" value={data.stats.closed_trades.toLocaleString()} subValue={`${data.stats.open_signals} open`} icon="📈" />
        <StatsCard 
          label="Win Rate" 
          value={`${data.stats.win_rate.toFixed(2)}%`} 
          color={data.stats.win_rate >= 80 ? 'text-green-400' : data.stats.win_rate >= 60 ? 'text-yellow-400' : 'text-red-400'}
          icon="🎯"
        />
        <StatsCard label="Total Winners" value={data.stats.total_winners.toLocaleString()} subValue="TP Hits" color="text-green-400" icon="🏆" />
        <StatsCard label="Stop Loss" value={data.stats.sl_count.toLocaleString()} color="text-red-400" icon="🛑" />
        <StatsCard label="Active Pairs" value={data.stats.active_pairs} icon="🪙" />
      </div>

      {/* Win Rate Trend Chart */}
      <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold text-lg">Win Rate Trend</h3>
            <p className="text-text-muted text-xs">Historical performance over time</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setTrendMode('daily')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                trendMode === 'daily'
                  ? 'bg-gold-primary text-bg-primary'
                  : 'bg-bg-card text-text-muted hover:text-white border border-gold-primary/10'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => setTrendMode('weekly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                trendMode === 'weekly'
                  ? 'bg-gold-primary text-bg-primary'
                  : 'bg-bg-card text-text-muted hover:text-white border border-gold-primary/10'
              }`}
            >
              Weekly
            </button>
          </div>
        </div>
        <WinRateTrendChart data={data.win_rate_trend} mode={trendMode} />
      </div>

      {/* Risk:Reward + TP Level Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Risk:Reward Ratio */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold text-lg">Risk : Reward Ratio</h3>
              <p className="text-text-muted text-xs">Average R:R per target level</p>
            </div>
            {data.avg_risk_reward > 0 && (
              <div className="text-right">
                <p className="text-text-muted text-xs">Average R:R</p>
                <p className={`text-xl font-bold font-mono ${data.avg_risk_reward >= 2 ? 'text-green-400' : data.avg_risk_reward >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                  1:{data.avg_risk_reward.toFixed(2)}
                </p>
              </div>
            )}
          </div>
          <RiskRewardChart data={data.risk_reward} avgRR={data.avg_risk_reward} />
        </div>

        {/* TP Level Breakdown */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-white font-semibold text-lg mb-1">TP Level Breakdown</h3>
          <p className="text-text-muted text-xs mb-4">Distribution of target hits</p>
          <TPLevelBreakdownChart data={data.stats} />
        </div>
      </div>

      {/* Distribution & Outcome Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">Outcome Distribution</h3>
          <OutcomeDistributionChart data={data.stats} />
        </div>
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">Win Rate Performance</h3>
          <WinRateGauge value={data.stats.win_rate} />
        </div>
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">TP Level Cards</h3>
          <div className="grid grid-cols-2 gap-3">
            <TPCard level="TP1" count={data.stats.tp1_count} total={data.stats.closed_trades} color="text-green-400" bg="bg-green-400/10" />
            <TPCard level="TP2" count={data.stats.tp2_count} total={data.stats.closed_trades} color="text-lime-400" bg="bg-lime-400/10" />
            <TPCard level="TP3" count={data.stats.tp3_count} total={data.stats.closed_trades} color="text-yellow-400" bg="bg-yellow-400/10" />
            <TPCard level="TP4" count={data.stats.tp4_count} total={data.stats.closed_trades} color="text-orange-400" bg="bg-orange-400/10" />
          </div>
        </div>
      </div>

      {/* Top Performers Table */}
      <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider">
            Top Performers ({topPerformers.length} pairs)
          </h3>
          <div className="flex gap-2 items-center">
            <label className="text-text-muted text-xs">Min Trades:</label>
            <select 
              value={minTrades} 
              onChange={(e) => setMinTrades(Number(e.target.value))}
              className="bg-bg-card text-white text-xs border border-gold-primary/20 rounded px-2 py-1"
            >
              {[3, 5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <label className="text-text-muted text-xs ml-2">Sort:</label>
            <select 
              value={sortMetric} 
              onChange={(e) => setSortMetric(e.target.value)}
              className="bg-bg-card text-white text-xs border border-gold-primary/20 rounded px-2 py-1"
            >
              <option value="win_rate">Win Rate</option>
              <option value="total_signals">Volume</option>
              <option value="performance_score">Score</option>
            </select>
          </div>
        </div>
        <TopPerformersTable data={topPerformers} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">Win Rate Distribution by Pair</h3>
          <WinRateBarChart data={topPerformers.slice(0, 10)} />
        </div>
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">Performance Score Ranking</h3>
          <PerformanceScoreChart data={topPerformers.slice(0, 10)} />
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-text-muted text-sm">
        Data updated in real-time • Analysis based on {data.stats.total_signals.toLocaleString()} signals
      </div>
    </div>
  );
};

// ============================================
// NEW: Win Rate Trend Chart Component
// ============================================
const WinRateTrendChart = ({ data, mode }) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-text-muted">
        No trend data available for this time range
      </div>
    );
  }

  const chartData = data.map(item => ({
    period: formatPeriodLabel(item.period, mode),
    fullDate: item.period,
    winRate: item.win_rate,
    winners: item.winners,
    losers: item.losers,
    total: item.total_closed,
  }));

  const avgWinRate = chartData.reduce((sum, d) => sum + d.winRate, 0) / chartData.length;

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="winRateGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d4a853" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#d4a853" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 168, 83, 0.08)" />
          <XAxis 
            dataKey="period" 
            stroke="#6b5c52" 
            fontSize={10}
            tickLine={false}
            interval={Math.max(0, Math.floor(chartData.length / 12))}
          />
          <YAxis 
            stroke="#6b5c52" 
            fontSize={11} 
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tickLine={false}
          />
          <Tooltip content={<TrendTooltip />} />
          <ReferenceLine 
            y={avgWinRate} 
            stroke="#d4a853" 
            strokeDasharray="5 5" 
            strokeOpacity={0.5}
            label={{ 
              value: `Avg ${avgWinRate.toFixed(1)}%`, 
              position: 'right', 
              fill: '#d4a853', 
              fontSize: 10 
            }} 
          />
          <Area 
            type="monotone" 
            dataKey="winRate" 
            stroke="#d4a853" 
            strokeWidth={2}
            fill="url(#winRateGradient)"
            dot={{ r: 3, fill: '#d4a853', stroke: '#d4a853' }}
            activeDot={{ r: 5, fill: '#d4a853', stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const TrendTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-bg-primary border border-gold-primary/30 rounded-lg p-3 shadow-xl">
      <p className="text-gold-primary text-xs font-semibold mb-2">{d.fullDate || label}</p>
      <div className="space-y-1">
        <p className="text-white text-sm">Win Rate: <span className={`font-bold ${d.winRate >= 80 ? 'text-green-400' : d.winRate >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{d.winRate.toFixed(1)}%</span></p>
        <p className="text-text-muted text-xs">Winners: <span className="text-green-400">{d.winners}</span> | Losers: <span className="text-red-400">{d.losers}</span></p>
        <p className="text-text-muted text-xs">Total closed: {d.total}</p>
      </div>
    </div>
  );
};

function formatPeriodLabel(period, mode) {
  if (!period) return '';
  try {
    const d = new Date(period);
    if (isNaN(d)) return period;
    if (mode === 'daily') {
      return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    }
    // Weekly: show "Jan 6" format
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  } catch {
    return period;
  }
}

// ============================================
// NEW: Risk:Reward Ratio Chart
// ============================================
const RiskRewardChart = ({ data, avgRR }) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-text-muted">
        No risk:reward data available
      </div>
    );
  }

  const colors = {
    'TP1': '#22C55E',
    'TP2': '#84CC16',
    'TP3': '#EAB308',
    'TP4': '#F97316',
    'SL': '#EF4444',
  };

  const chartData = data
    .filter(d => d.level !== 'SL')
    .map(d => ({
      level: d.level,
      rr: d.avg_rr,
      count: d.count,
      color: colors[d.level] || '#d4a853',
    }));

  const slData = data.find(d => d.level === 'SL');

  return (
    <div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 168, 83, 0.08)" />
            <XAxis dataKey="level" stroke="#6b5c52" fontSize={12} tickLine={false} />
            <YAxis stroke="#6b5c52" fontSize={11} tickLine={false} tickFormatter={(v) => `${v.toFixed(1)}R`} />
            <Tooltip content={<RRTooltip />} />
            <Bar dataKey="rr" radius={[6, 6, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      {/* Legend / Summary */}
      <div className="flex flex-wrap gap-3 mt-3">
        {data.map(d => (
          <div key={d.level} className="flex items-center gap-2 bg-bg-card/50 rounded-lg px-3 py-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors[d.level] || '#888' }} />
            <span className="text-text-muted text-xs">{d.level}</span>
            <span className="text-white text-xs font-mono font-semibold">
              {d.level === 'SL' ? `-1R` : `${d.avg_rr.toFixed(2)}R`}
            </span>
            <span className="text-text-muted text-[10px]">({d.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const RRTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-bg-primary border border-gold-primary/30 rounded-lg p-3 shadow-xl">
      <p className="text-gold-primary text-xs font-semibold mb-1">{d.level}</p>
      <p className="text-white text-sm">R:R Ratio: <span className="font-bold text-green-400">1:{d.rr.toFixed(2)}</span></p>
      <p className="text-text-muted text-xs">{d.count.toLocaleString()} signals</p>
    </div>
  );
};

// ============================================
// NEW: TP Level Breakdown (Horizontal Bar) 
// ============================================
const TPLevelBreakdownChart = ({ data }) => {
  const total = data.tp1_count + data.tp2_count + data.tp3_count + data.tp4_count + data.sl_count;
  if (total === 0) return <div className="h-64 flex items-center justify-center text-text-muted">No data</div>;

  const chartData = [
    { level: 'TP1', count: data.tp1_count, pct: (data.tp1_count / total * 100), color: '#22C55E' },
    { level: 'TP2', count: data.tp2_count, pct: (data.tp2_count / total * 100), color: '#84CC16' },
    { level: 'TP3', count: data.tp3_count, pct: (data.tp3_count / total * 100), color: '#EAB308' },
    { level: 'TP4', count: data.tp4_count, pct: (data.tp4_count / total * 100), color: '#F97316' },
    { level: 'SL', count: data.sl_count, pct: (data.sl_count / total * 100), color: '#EF4444' },
  ];

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="horizontal" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 168, 83, 0.08)" />
          <XAxis dataKey="level" stroke="#6b5c52" fontSize={12} tickLine={false} />
          <YAxis stroke="#6b5c52" fontSize={11} tickLine={false} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1a0a0a', border: '1px solid rgba(212, 168, 83, 0.3)', borderRadius: '8px' }}
            formatter={(value, name, props) => [`${value.toLocaleString()} (${props.payload.pct.toFixed(1)}%)`, 'Count']}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ============================================
// Existing Sub Components
// ============================================

const StatsCard = ({ label, value, subValue, icon, color = 'text-white' }) => (
  <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
    <div className="flex items-center justify-between mb-2">
      <p className="text-text-muted text-xs uppercase tracking-wider">{label}</p>
      <span className="text-lg">{icon}</span>
    </div>
    <p className={`text-2xl font-display font-bold ${color}`}>{value}</p>
    {subValue && <p className="text-text-muted text-xs mt-1">{subValue}</p>}
  </div>
);

const TPCard = ({ level, count, total, color, bg }) => {
  const pct = total > 0 ? (count / total * 100).toFixed(1) : 0;
  return (
    <div className={`rounded-lg p-3 ${bg} border border-gold-primary/5`}>
      <p className={`text-xs font-semibold ${color}`}>{level}</p>
      <p className="text-white text-lg font-bold font-mono">{count.toLocaleString()}</p>
      <p className="text-text-muted text-[10px]">{pct}%</p>
    </div>
  );
};

const OutcomeDistributionChart = ({ data }) => {
  const distributionData = [
    { name: 'TP1', value: data.tp1_count, color: '#22C55E' },
    { name: 'TP2', value: data.tp2_count, color: '#84CC16' },
    { name: 'TP3', value: data.tp3_count, color: '#EAB308' },
    { name: 'TP4', value: data.tp4_count, color: '#F97316' },
    { name: 'SL', value: data.sl_count, color: '#EF4444' },
  ].filter(d => d.value > 0);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
      <div className="bg-bg-primary border border-gold-primary/30 rounded-lg p-2 shadow-xl">
        <p className="text-xs" style={{ color: d.payload.color }}>{d.name}: {d.value.toLocaleString()}</p>
      </div>
    );
  };

  return (
    <div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={distributionData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
            >
              {distributionData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap justify-center gap-2 mt-1">
        {distributionData.map((entry, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-[10px] text-text-muted">{entry.name}: {entry.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const WinRateGauge = ({ value }) => {
  const radius = 70;
  const circumference = Math.PI * radius;
  const progress = (value / 100) * circumference;
  const color = value >= 80 ? '#22C55E' : value >= 60 ? '#EAB308' : '#EF4444';

  return (
    <div className="flex flex-col items-center justify-center h-48">
      <svg width="180" height="100" viewBox="0 0 180 100">
        <path
          d="M 10 90 A 70 70 0 0 1 170 90"
          fill="none"
          stroke="rgba(212, 168, 83, 0.1)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M 10 90 A 70 70 0 0 1 170 90"
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
        <text x="90" y="75" textAnchor="middle" fill="white" fontSize="24" fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
          {value.toFixed(1)}%
        </text>
        <text x="90" y="92" textAnchor="middle" fill="#6b5c52" fontSize="10">
          {value >= 80 ? '🔥 Excellent' : value >= 60 ? '⚡ Good' : '⚠️ Needs Improvement'}
        </text>
      </svg>
    </div>
  );
};

const TopPerformersTable = ({ data }) => {
  if (!data?.length) return <div className="text-text-muted text-center py-8">No data matching criteria</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gold-primary/10">
            <th className="py-3 px-4 text-left text-gold-primary/70 text-xs uppercase tracking-wider">#</th>
            <th className="py-3 px-4 text-left text-gold-primary/70 text-xs uppercase tracking-wider">Pair</th>
            <th className="py-3 px-4 text-center text-gold-primary/70 text-xs uppercase tracking-wider">Signals</th>
            <th className="py-3 px-4 text-center text-gold-primary/70 text-xs uppercase tracking-wider">Win Rate</th>
            <th className="py-3 px-4 text-center text-gold-primary/70 text-xs uppercase tracking-wider">TP1</th>
            <th className="py-3 px-4 text-center text-gold-primary/70 text-xs uppercase tracking-wider">TP2</th>
            <th className="py-3 px-4 text-center text-gold-primary/70 text-xs uppercase tracking-wider">TP3</th>
            <th className="py-3 px-4 text-center text-gold-primary/70 text-xs uppercase tracking-wider">TP4</th>
            <th className="py-3 px-4 text-center text-gold-primary/70 text-xs uppercase tracking-wider">SL</th>
            <th className="py-3 px-4 text-right text-gold-primary/70 text-xs uppercase tracking-wider">Score</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p, i) => (
            <tr key={p.pair} className="border-b border-gold-primary/5 hover:bg-gold-primary/5 transition-colors">
              <td className="py-3 px-4 text-text-muted text-sm">{i + 1}</td>
              <td className="py-3 px-4 text-white font-semibold text-sm">{p.pair.replace('USDT', '')}</td>
              <td className="py-3 px-4 text-center text-text-muted text-sm font-mono">{p.total_signals}</td>
              <td className="py-3 px-4 text-center">
                <span className={`font-bold font-mono text-sm ${
                  p.win_rate >= 80 ? 'text-green-400' :
                  p.win_rate >= 60 ? 'text-lime-400' :
                  p.win_rate >= 50 ? 'text-yellow-400' :
                  'text-red-400'
                }`}>
                  {p.win_rate.toFixed(1)}%
                </span>
              </td>
              <td className="py-3 px-4 text-center text-green-400 font-mono">{p.tp1_count}</td>
              <td className="py-3 px-4 text-center text-lime-400 font-mono">{p.tp2_count}</td>
              <td className="py-3 px-4 text-center text-yellow-400 font-mono">{p.tp3_count}</td>
              <td className="py-3 px-4 text-center text-orange-400 font-mono">{p.tp4_count}</td>
              <td className="py-3 px-4 text-center text-red-400 font-mono">{p.sl_count}</td>
              <td className="py-3 px-4 text-right">
                <span className="px-2 py-1 bg-gold-primary/20 text-gold-primary rounded text-xs font-semibold">
                  {p.performance_score.toFixed(0)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const WinRateBarChart = ({ data }) => {
  const chartData = data.map(p => ({ pair: p.pair.replace('USDT', ''), winRate: p.win_rate }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 168, 83, 0.1)" />
          <XAxis dataKey="pair" stroke="#6b5c52" fontSize={10} angle={-45} textAnchor="end" height={60} />
          <YAxis stroke="#6b5c52" fontSize={12} domain={[0, 100]} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1a0a0a', border: '1px solid rgba(212, 168, 83, 0.3)', borderRadius: '8px' }}
            formatter={(value) => [`${value.toFixed(1)}%`, 'Win Rate']}
          />
          <Bar dataKey="winRate" fill="#d4a853" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const PerformanceScoreChart = ({ data }) => {
  const chartData = data.map(p => ({ pair: p.pair.replace('USDT', ''), score: p.performance_score, winRate: p.win_rate }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 168, 83, 0.1)" />
          <XAxis type="number" stroke="#6b5c52" fontSize={12} domain={[0, 100]} />
          <YAxis type="category" dataKey="pair" stroke="#6b5c52" fontSize={10} width={50} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1a0a0a', border: '1px solid rgba(212, 168, 83, 0.3)', borderRadius: '8px' }}
            formatter={(value, name) => [name === 'score' ? value.toFixed(0) : `${value.toFixed(1)}%`, name === 'score' ? 'Score' : 'Win Rate']}
          />
          <Bar dataKey="score" fill="#22C55E" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const LoadingSkeleton = () => (
  <div className="space-y-6">
    <div className="flex items-center gap-3">
      <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
      <h2 className="font-display text-2xl font-semibold text-white">Performance Analytics</h2>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="glass-card rounded-xl p-5 animate-pulse border border-gold-primary/10">
          <div className="h-4 bg-gold-primary/20 rounded w-20 mb-3"></div>
          <div className="h-8 bg-gold-primary/20 rounded w-16"></div>
        </div>
      ))}
    </div>
    <div className="glass-card rounded-xl p-5 h-80 animate-pulse border border-gold-primary/10"></div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="glass-card rounded-xl p-5 h-72 animate-pulse border border-gold-primary/10"></div>
      ))}
    </div>
  </div>
);

export default AnalyzePage;