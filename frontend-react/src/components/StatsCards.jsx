function StatsCards({ stats, loading }) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="glass-card p-5 animate-pulse">
            <div className="h-4 bg-gold-primary/20 rounded w-20 mb-3" />
            <div className="h-8 bg-gold-primary/10 rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    { label: 'Total Signals', value: stats.total_signals.toLocaleString(), color: 'text-gold-primary' },
    { label: 'Open', value: stats.open_signals.toLocaleString(), color: 'text-cyan-400' },
    { label: 'TP1 Hit', value: stats.tp1_signals.toLocaleString(), color: 'text-positive' },
    { label: 'TP2 Hit', value: stats.tp2_signals.toLocaleString(), color: 'text-positive' },
    { label: 'TP3 Hit', value: stats.tp3_signals.toLocaleString(), color: 'text-positive' },
    { label: 'Closed Win', value: stats.closed_win.toLocaleString(), color: 'text-positive' },
    { label: 'Win Rate', value: `${stats.win_rate}%`, color: 'text-gold-primary' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
      {cards.map((card, i) => (
        <div key={i} className="glass-card p-5 hover:border-gold-primary/30 transition-all">
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{card.label}</p>
          <p className={`font-display text-2xl font-bold ${card.color}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}

export default StatsCards;
