function SignalsTable({ signals, loading, page, totalPages, onPageChange }) {
  const formatPrice = (price) => {
    if (!price) return '--';
    if (price < 0.0001) return price.toFixed(8);
    if (price < 1) return price.toFixed(6);
    if (price < 100) return price.toFixed(4);
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getStatusLabel = (status) => {
    const labels = {
      open: 'OPEN',
      tp1: 'TP1 ✓',
      tp2: 'TP2 ✓',
      tp3: 'TP3 ✓',
      closed_win: 'WIN ✓',
      closed_loss: 'LOSS ✗',
    };
    return labels[status] || status?.toUpperCase();
  };

  const getRiskLabel = (risk, volumeNum, volumeDen) => {
    // Determine risk based on volume rank if risk_level is null
    if (!risk && volumeNum && volumeDen) {
      const ratio = volumeNum / volumeDen;
      if (ratio <= 0.25) return { label: 'LOW', class: 'low' };
      if (ratio <= 0.5) return { label: 'MED', class: 'medium' };
      return { label: 'HIGH', class: 'high' };
    }
    
    const riskMap = {
      low: { label: 'LOW', class: 'low' },
      medium: { label: 'MED', class: 'medium' },
      high: { label: 'HIGH', class: 'high' },
    };
    return riskMap[risk?.toLowerCase()] || { label: 'MED', class: 'medium' };
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const getTargetsHit = (status) => {
    const hits = { open: 0, tp1: 1, tp2: 2, tp3: 3, closed_win: 4, closed_loss: 0 };
    return hits[status] || 0;
  };

  const getCoinColor = (pair) => {
    const colors = [
      'linear-gradient(135deg, #00d4aa, #00a884)',
      'linear-gradient(135deg, #8b5cf6, #7c3aed)',
      'linear-gradient(135deg, #f59e0b, #d97706)',
      'linear-gradient(135deg, #ec4899, #db2777)',
      'linear-gradient(135deg, #3b82f6, #2563eb)',
      'linear-gradient(135deg, #10b981, #059669)',
      'linear-gradient(135deg, #6366f1, #4f46e5)',
      'linear-gradient(135deg, #ef4444, #dc2626)',
    ];
    const hash = pair?.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) || 0;
    return colors[hash % colors.length];
  };

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="animate-pulse space-y-4">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-16 bg-gold-primary/5 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="signals-table">
          <thead>
            <tr>
              <th>Pair</th>
              <th>Risk</th>
              <th>Entry</th>
              <th>Target 1</th>
              <th>Target 2</th>
              <th>Target 3</th>
              <th>Target 4</th>
              <th>Stop Loss</th>
              <th>Targets</th>
              <th>Vol Rank</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((signal) => {
              const risk = getRiskLabel(signal.risk_level, signal.volume_rank_num, signal.volume_rank_den);
              const targetsHit = getTargetsHit(signal.status);

              return (
                <tr key={signal.signal_id}>
                  {/* Pair */}
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ background: getCoinColor(signal.pair) }}
                        >
                          {signal.pair?.replace('USDT', '').substring(0, 2)}
                        </div>
                        <div className="absolute -inset-1 border-2 border-gold-primary/30 rounded-full" />
                      </div>
                      <div>
                        <p className="font-semibold text-white">{signal.pair?.replace('USDT', '')}</p>
                        <p className="text-xs text-text-muted">USDT</p>
                      </div>
                    </div>
                  </td>

                  {/* Risk */}
                  <td>
                    <span className={`risk-badge ${risk.class}`}>{risk.label}</span>
                  </td>

                  {/* Entry */}
                  <td className="font-mono text-text-secondary">{formatPrice(signal.entry)}</td>

                  {/* Targets */}
                  <td className="font-mono text-text-secondary">{formatPrice(signal.target1)}</td>
                  <td className="font-mono text-text-secondary">{formatPrice(signal.target2)}</td>
                  <td className="font-mono text-text-secondary">{formatPrice(signal.target3)}</td>
                  <td className="font-mono text-text-secondary">{formatPrice(signal.target4)}</td>

                  {/* Stop Loss */}
                  <td className="font-mono text-negative">{formatPrice(signal.stop1)}</td>

                  {/* Target Progress */}
                  <td>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((t) => (
                        <span
                          key={t}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                            t <= targetsHit
                              ? 'bg-gradient-to-br from-positive to-emerald-600 text-white shadow-positive-glow'
                              : 'bg-white/5 border border-white/10 text-text-muted'
                          }`}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Volume Rank */}
                  <td>
                    <div className="text-center">
                      <p className="font-mono text-sm text-white">{signal.volume_rank_num || '--'}</p>
                      <p className="text-xs text-text-muted">/ {signal.volume_rank_den || '--'}</p>
                    </div>
                  </td>

                  {/* Status */}
                  <td>
                    <span className={`status-badge ${signal.status}`}>
                      {getStatusLabel(signal.status)}
                    </span>
                  </td>

                  {/* Time */}
                  <td className="font-mono text-sm text-text-muted">{formatTime(signal.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between p-4 border-t border-gold-primary/10">
        <p className="text-sm text-text-muted">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg bg-bg-card border border-gold-primary/20 text-text-secondary hover:border-gold-primary/40 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Previous
          </button>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-lg bg-bg-card border border-gold-primary/20 text-text-secondary hover:border-gold-primary/40 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default SignalsTable;
