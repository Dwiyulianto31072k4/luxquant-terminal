import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const StatsCards = ({ stats, loading }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="glass-card rounded-xl p-4 border border-gold-primary/10 animate-pulse">
            <div className="h-4 bg-bg-card rounded w-20 mb-2"></div>
            <div className="h-8 bg-bg-card rounded w-16"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  // Calculate totals
  const totalWinners = (stats.tp1_signals || 0) + (stats.tp2_signals || 0) + (stats.tp3_signals || 0) + (stats.closed_win || 0);
  const totalLosers = stats.closed_loss || 0;
  const totalClosed = totalWinners + totalLosers;

  // Pie chart data
  const distributionData = [
    { name: 'TP1', value: stats.tp1_signals || 0, color: '#22C55E' },
    { name: 'TP2', value: stats.tp2_signals || 0, color: '#84CC16' },
    { name: 'TP3', value: stats.tp3_signals || 0, color: '#EAB308' },
    { name: 'TP4', value: stats.closed_win || 0, color: '#F97316' },
    { name: 'SL', value: stats.closed_loss || 0, color: '#EF4444' },
  ].filter(item => item.value > 0);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentage = totalClosed > 0 ? ((data.value / totalClosed) * 100).toFixed(1) : 0;
      return (
        <div className="bg-bg-primary border border-gold-primary/30 rounded-lg px-3 py-2 shadow-xl">
          <p className="text-gold-primary font-semibold">{data.name}</p>
          <p className="text-white">{data.value.toLocaleString()} signals</p>
          <p className="text-text-muted">{percentage}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="mb-8">
      {/* Main Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        {/* Total Signals Card */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Total Signals</p>
          <p className="text-3xl font-display font-bold text-gold-primary">
            {stats.total_signals?.toLocaleString() || 0}
          </p>
          <div className="mt-2 flex gap-3 text-xs">
            <span className="text-status-open">{stats.open_signals?.toLocaleString() || 0} Active</span>
            <span className="text-text-muted">•</span>
            <span className="text-blue-400">{totalClosed.toLocaleString()} Closed</span>
          </div>
        </div>

        {/* Pie Chart Card */}
        <div className="glass-card rounded-xl p-4 border border-gold-primary/10">
          <p className="text-text-muted text-xs uppercase tracking-wider mb-2 text-center">Distribution</p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={25}
                  outerRadius={45}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-2 mt-1">
            {distributionData.map((entry, index) => (
              <div key={index} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-[10px] text-text-muted">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Win Rate Card */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Win Rate</p>
          <p className="text-3xl font-display font-bold text-status-profit">
            {stats.win_rate?.toFixed(2) || 0}%
          </p>
          <div className="mt-2">
            {stats.win_rate >= 80 ? (
              <span className="text-status-profit text-xs">🔥 Excellent</span>
            ) : stats.win_rate >= 60 ? (
              <span className="text-yellow-400 text-xs">👍 Good</span>
            ) : (
              <span className="text-status-loss text-xs">⚠️ Needs Work</span>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Stats Row */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <StatCard label="Open" value={stats.open_signals} color="text-status-open" />
        <StatCard label="TP1 Hit" value={stats.tp1_signals} color="text-green-400" />
        <StatCard label="TP2 Hit" value={stats.tp2_signals} color="text-lime-400" />
        <StatCard label="TP3 Hit" value={stats.tp3_signals} color="text-yellow-400" />
        <StatCard label="TP4 Hit" value={stats.closed_win} color="text-orange-400" />
        <StatCard label="Stop Loss" value={stats.closed_loss} color="text-status-loss" />
      </div>
    </div>
  );
};

// Small stat card component
const StatCard = ({ label, value, color }) => (
  <div className="glass-card rounded-lg p-3 border border-gold-primary/10 text-center">
    <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">{label}</p>
    <p className={`text-lg font-display font-bold ${color}`}>
      {value?.toLocaleString() || 0}
    </p>
  </div>
);

export default StatsCards;