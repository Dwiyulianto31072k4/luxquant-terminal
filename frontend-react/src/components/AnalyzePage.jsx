import { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend } from 'recharts';

const API_BASE = '/api/v1';

/**
 * AnalyzePage - Comprehensive trading performance analysis
 * Features: Win Rate, Distribution, Top Performers, Time Range Filters
 */
const AnalyzePage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [timeRange, setTimeRange] = useState('all');
  const [minTrades, setMinTrades] = useState(5);
  const [sortMetric, setSortMetric] = useState('win_rate');
  const [topN, setTopN] = useState(20);

  // Fetch analyze data
  useEffect(() => {
    fetchAnalyzeData();
  }, [timeRange]);

  const fetchAnalyzeData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (timeRange !== 'all') params.append('time_range', timeRange);
      
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

  // Calculate top performers from data
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

  // Time range options
  const timeRangeOptions = [
    { value: 'all', label: 'All Time' },
    { value: 'ytd', label: 'Year to Date' },
    { value: 'mtd', label: 'Month to Date' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '7d', label: 'Last 7 Days' },
  ];

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="glass-card rounded-xl p-8 border border-red-500/30 text-center">
        <p className="text-red-400 mb-4">⚠️ {error}</p>
        <button 
          onClick={fetchAnalyzeData}
          className="px-4 py-2 bg-gold-primary/20 text-gold-primary rounded-lg hover:bg-gold-primary/30 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-2xl font-semibold text-white">Performance Analysis</h2>
        </div>
        
        {/* Time Range Selector */}
        <div className="flex items-center gap-2">
          {timeRangeOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setTimeRange(opt.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                timeRange === opt.value
                  ? 'bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary shadow-gold-glow'
                  : 'bg-bg-card border border-gold-primary/20 text-text-secondary hover:text-white hover:border-gold-primary/40'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatsCard 
          label="Total Signals"
          value={data.stats.total_signals.toLocaleString()}
          icon="📊"
        />
        <StatsCard 
          label="Closed Trades"
          value={data.stats.closed_trades.toLocaleString()}
          subValue={`${data.stats.open_signals.toLocaleString()} Open`}
          icon="✅"
        />
        <StatsCard 
          label="Win Rate"
          value={`${data.stats.win_rate.toFixed(2)}%`}
          color={data.stats.win_rate >= 80 ? 'text-green-400' : data.stats.win_rate >= 60 ? 'text-yellow-400' : 'text-red-400'}
          icon="🎯"
        />
        <StatsCard 
          label="Total Winners"
          value={data.stats.total_winners.toLocaleString()}
          subValue={`TP Hits`}
          color="text-green-400"
          icon="🏆"
        />
        <StatsCard 
          label="Stop Loss"
          value={data.stats.sl_count.toLocaleString()}
          color="text-red-400"
          icon="🛑"
        />
        <StatsCard 
          label="Active Pairs"
          value={data.stats.active_pairs}
          icon="🪙"
        />
      </div>

      {/* Distribution & Outcome Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Outcome Distribution Pie */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">
            Outcome Distribution
          </h3>
          <OutcomeDistributionChart data={data.stats} />
        </div>

        {/* TP Level Breakdown */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">
            TP Level Breakdown
          </h3>
          <TPLevelChart data={data.stats} />
        </div>

        {/* Win Rate Gauge */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">
            Win Rate Performance
          </h3>
          <WinRateGauge value={data.stats.win_rate} />
        </div>
      </div>

      {/* TP Level Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <TPCard level="Open" count={data.stats.open_signals} total={data.stats.total_signals} color="cyan" />
        <TPCard level="TP1" count={data.stats.tp1_count} total={data.stats.closed_trades} color="green" />
        <TPCard level="TP2" count={data.stats.tp2_count} total={data.stats.closed_trades} color="lime" />
        <TPCard level="TP3" count={data.stats.tp3_count} total={data.stats.closed_trades} color="yellow" />
        <TPCard level="TP4" count={data.stats.tp4_count} total={data.stats.closed_trades} color="orange" />
        <TPCard level="SL" count={data.stats.sl_count} total={data.stats.closed_trades} color="red" />
      </div>

      {/* Top Performers Section */}
      <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
        <div className="p-5 border-b border-gold-primary/10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏆</span>
            <h3 className="text-white font-semibold">Top Performers</h3>
          </div>
          
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Min Trades */}
            <div className="flex items-center gap-2">
              <span className="text-text-muted text-xs">Min Trades:</span>
              <select 
                value={minTrades}
                onChange={(e) => setMinTrades(Number(e.target.value))}
                className="px-3 py-1.5 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm"
              >
                {[1, 3, 5, 10, 15, 20].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            
            {/* Sort By */}
            <div className="flex items-center gap-2">
              <span className="text-text-muted text-xs">Sort:</span>
              <select 
                value={sortMetric}
                onChange={(e) => setSortMetric(e.target.value)}
                className="px-3 py-1.5 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm"
              >
                <option value="win_rate">Win Rate</option>
                <option value="total_signals">Total Signals</option>
                <option value="performance_score">Performance Score</option>
              </select>
            </div>
            
            {/* Top N */}
            <div className="flex items-center gap-2">
              <span className="text-text-muted text-xs">Show:</span>
              <select 
                value={topN}
                onChange={(e) => setTopN(Number(e.target.value))}
                className="px-3 py-1.5 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm"
              >
                {[10, 15, 20, 25, 30].map(n => (
                  <option key={n} value={n}>Top {n}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Top Performers Table */}
        <TopPerformersTable performers={topPerformers} />
      </div>

      {/* Performance Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Win Rate Distribution Bar Chart */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">
            Win Rate Distribution by Pair
          </h3>
          <WinRateBarChart data={topPerformers.slice(0, 10)} />
        </div>

        {/* Performance Score Chart */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">
            Performance Score Ranking
          </h3>
          <PerformanceScoreChart data={topPerformers.slice(0, 10)} />
        </div>
      </div>

      {/* Footer Info */}
      <div className="text-center text-text-muted text-sm">
        Data updated in real-time • Analysis based on {data.stats.total_signals.toLocaleString()} signals
      </div>
    </div>
  );
};

// ============================================
// Sub Components
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

const TPCard = ({ level, count, total, color }) => {
  const pct = total > 0 ? (count / total * 100).toFixed(1) : 0;
  
  const colorClasses = {
    cyan: 'from-cyan-500 to-cyan-600 shadow-cyan-500/30',
    green: 'from-green-500 to-green-600 shadow-green-500/30',
    lime: 'from-lime-500 to-lime-600 shadow-lime-500/30',
    yellow: 'from-yellow-500 to-yellow-600 shadow-yellow-500/30',
    orange: 'from-orange-500 to-orange-600 shadow-orange-500/30',
    red: 'from-red-500 to-red-600 shadow-red-500/30',
  };

  return (
    <div className="glass-card rounded-xl p-4 border border-gold-primary/10 text-center">
      <div className={`w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br ${colorClasses[color]} shadow-lg flex items-center justify-center`}>
        <span className="text-white font-bold text-sm">{level}</span>
      </div>
      <p className="text-white font-display font-bold text-xl">{count.toLocaleString()}</p>
      <p className="text-text-muted text-xs mt-1">{pct}%</p>
    </div>
  );
};

const OutcomeDistributionChart = ({ data }) => {
  const chartData = [
    { name: 'TP1', value: data.tp1_count, color: '#22C55E' },
    { name: 'TP2', value: data.tp2_count, color: '#84CC16' },
    { name: 'TP3', value: data.tp3_count, color: '#EAB308' },
    { name: 'TP4', value: data.tp4_count, color: '#F97316' },
    { name: 'SL', value: data.sl_count, color: '#EF4444' },
  ].filter(d => d.value > 0);

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={3}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1a0a0a', 
              border: '1px solid rgba(212, 168, 83, 0.3)',
              borderRadius: '8px'
            }}
            formatter={(value, name) => [value.toLocaleString(), name]}
          />
          <Legend 
            verticalAlign="bottom"
            formatter={(value) => <span className="text-text-secondary text-xs">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

const TPLevelChart = ({ data }) => {
  const chartData = [
    { name: 'TP1', count: data.tp1_count, fill: '#22C55E' },
    { name: 'TP2', count: data.tp2_count, fill: '#84CC16' },
    { name: 'TP3', count: data.tp3_count, fill: '#EAB308' },
    { name: 'TP4', count: data.tp4_count, fill: '#F97316' },
    { name: 'SL', count: data.sl_count, fill: '#EF4444' },
  ];

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 168, 83, 0.1)" />
          <XAxis type="number" stroke="#6b5c52" fontSize={12} />
          <YAxis type="category" dataKey="name" stroke="#6b5c52" fontSize={12} width={40} />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1a0a0a', 
              border: '1px solid rgba(212, 168, 83, 0.3)',
              borderRadius: '8px'
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const WinRateGauge = ({ value }) => {
  const getColor = (val) => {
    if (val <= 40) return '#EF4444';
    if (val <= 55) return '#F97316';
    if (val <= 70) return '#EAB308';
    if (val <= 85) return '#84CC16';
    return '#22C55E';
  };

  const color = getColor(value);
  const angle = (value / 100) * 180 - 90;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-48 h-28">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#EF4444" />
            <stop offset="25%" stopColor="#F97316" />
            <stop offset="50%" stopColor="#EAB308" />
            <stop offset="75%" stopColor="#84CC16" />
            <stop offset="100%" stopColor="#22C55E" />
          </linearGradient>
        </defs>
        <path 
          d="M 20 100 A 80 80 0 0 1 180 100" 
          fill="none" 
          stroke="url(#gaugeGrad)" 
          strokeWidth="14" 
          strokeLinecap="round" 
        />
        <g transform={`rotate(${angle}, 100, 100)`}>
          <line x1="100" y1="100" x2="100" y2="30" stroke={color} strokeWidth="4" strokeLinecap="round" />
          <circle cx="100" cy="100" r="8" fill={color} />
        </g>
      </svg>
      
      <p className="text-4xl font-display font-bold text-white mt-2">{value.toFixed(2)}%</p>
      <p className="text-sm font-semibold mt-1" style={{ color }}>
        {value >= 80 ? '🔥 Excellent' : value >= 60 ? '👍 Good' : value >= 50 ? '⚠️ Average' : '📉 Needs Work'}
      </p>
      
      <div className="flex justify-between w-full text-xs text-text-muted mt-3 px-4">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
};

const TopPerformersTable = ({ performers }) => {
  if (performers.length === 0) {
    return (
      <div className="p-8 text-center text-text-muted">
        No pairs meet the minimum criteria. Try reducing the minimum trades requirement.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gold-primary/10 bg-gold-primary/5">
            <th className="py-3 px-4 text-left text-gold-primary text-xs font-semibold uppercase tracking-wider">Rank</th>
            <th className="py-3 px-4 text-left text-gold-primary text-xs font-semibold uppercase tracking-wider">Pair</th>
            <th className="py-3 px-4 text-right text-gold-primary text-xs font-semibold uppercase tracking-wider">Signals</th>
            <th className="py-3 px-4 text-right text-gold-primary text-xs font-semibold uppercase tracking-wider">Closed</th>
            <th className="py-3 px-4 text-right text-gold-primary text-xs font-semibold uppercase tracking-wider">Win Rate</th>
            <th className="py-3 px-4 text-center text-gold-primary text-xs font-semibold uppercase tracking-wider">TP1</th>
            <th className="py-3 px-4 text-center text-gold-primary text-xs font-semibold uppercase tracking-wider">TP2</th>
            <th className="py-3 px-4 text-center text-gold-primary text-xs font-semibold uppercase tracking-wider">TP3</th>
            <th className="py-3 px-4 text-center text-gold-primary text-xs font-semibold uppercase tracking-wider">TP4</th>
            <th className="py-3 px-4 text-center text-gold-primary text-xs font-semibold uppercase tracking-wider">SL</th>
            <th className="py-3 px-4 text-right text-gold-primary text-xs font-semibold uppercase tracking-wider">Score</th>
          </tr>
        </thead>
        <tbody>
          {performers.map((p, idx) => (
            <tr key={p.pair} className="border-b border-gold-primary/5 hover:bg-gold-primary/5 transition-colors">
              <td className="py-3 px-4">
                <span className={`w-7 h-7 inline-flex items-center justify-center rounded-full text-sm font-bold ${
                  idx === 0 ? 'bg-yellow-500 text-black' :
                  idx === 1 ? 'bg-gray-300 text-black' :
                  idx === 2 ? 'bg-orange-600 text-white' :
                  'bg-bg-card text-text-muted'
                }`}>
                  {idx + 1}
                </span>
              </td>
              <td className="py-3 px-4">
                <span className="text-white font-semibold">{p.pair.replace('USDT', '')}</span>
                <span className="text-text-muted">/USDT</span>
              </td>
              <td className="py-3 px-4 text-right font-mono text-text-secondary">{p.total_signals}</td>
              <td className="py-3 px-4 text-right font-mono text-text-secondary">{p.closed_trades}</td>
              <td className="py-3 px-4 text-right">
                <span className={`font-mono font-semibold ${
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
  const chartData = data.map(p => ({
    pair: p.pair.replace('USDT', ''),
    winRate: p.win_rate,
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 168, 83, 0.1)" />
          <XAxis dataKey="pair" stroke="#6b5c52" fontSize={10} angle={-45} textAnchor="end" height={60} />
          <YAxis stroke="#6b5c52" fontSize={12} domain={[0, 100]} />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1a0a0a', 
              border: '1px solid rgba(212, 168, 83, 0.3)',
              borderRadius: '8px'
            }}
            formatter={(value) => [`${value.toFixed(1)}%`, 'Win Rate']}
          />
          <Bar dataKey="winRate" fill="#d4a853" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const PerformanceScoreChart = ({ data }) => {
  const chartData = data.map(p => ({
    pair: p.pair.replace('USDT', ''),
    score: p.performance_score,
    winRate: p.win_rate,
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 168, 83, 0.1)" />
          <XAxis type="number" stroke="#6b5c52" fontSize={12} domain={[0, 100]} />
          <YAxis type="category" dataKey="pair" stroke="#6b5c52" fontSize={10} width={50} />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1a0a0a', 
              border: '1px solid rgba(212, 168, 83, 0.3)',
              borderRadius: '8px'
            }}
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
      <h2 className="font-display text-2xl font-semibold text-white">Performance Analysis</h2>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="glass-card rounded-xl p-5 animate-pulse border border-gold-primary/10">
          <div className="h-4 bg-gold-primary/20 rounded w-20 mb-3"></div>
          <div className="h-8 bg-gold-primary/20 rounded w-16"></div>
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="glass-card rounded-xl p-5 h-80 animate-pulse border border-gold-primary/10"></div>
      ))}
    </div>
  </div>
);

export default AnalyzePage;