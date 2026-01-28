import { useState } from 'react';
import SignalModal from './SignalModal';
import CoinLogo from './CoinLogo';

const SignalsTable = ({ signals, loading, page, totalPages, onPageChange }) => {
  const [selectedSignal, setSelectedSignal] = useState(null);

  // Format date: "28 Jan at 09:55"
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = date.toLocaleDateString('en-GB', { month: 'short' });
    const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${day} ${month} at ${time}`;
  };

  // Get max target (highest TP) and calculate % from entry
  const getMaxTarget = (signal) => {
    const targets = [signal.target4, signal.target3, signal.target2, signal.target1].filter(t => t);
    if (targets.length === 0) return { value: null, pct: null };
    
    const maxTarget = targets[0];
    const pct = ((maxTarget - signal.entry) / signal.entry * 100).toFixed(2);
    
    return { value: maxTarget, pct };
  };

  // Get coin name without USDT
  const getCoinName = (pair) => {
    if (!pair) return '';
    return pair.replace(/USDT$/i, '');
  };

  // Risk badge style
  const getRiskBadge = (risk) => {
    const styles = {
      'low': 'bg-green-500/20 text-green-400',
      'med': 'bg-yellow-500/20 text-yellow-400',
      'medium': 'bg-yellow-500/20 text-yellow-400',
      'high': 'bg-red-500/20 text-red-400'
    };
    return styles[risk?.toLowerCase()] || 'bg-gray-500/20 text-gray-400';
  };

  // Status badge
  const getStatusBadge = (status) => {
    const config = {
      'open': { bg: 'bg-status-open', text: 'OPEN' },
      'tp1': { bg: 'bg-green-500', text: 'TP1 ✓' },
      'tp2': { bg: 'bg-lime-500', text: 'TP2 ✓' },
      'tp3': { bg: 'bg-yellow-500', text: 'TP3 ✓' },
      'tp4': { bg: 'bg-orange-500', text: 'TP4 ✓' },
      'closed_win': { bg: 'bg-status-profit', text: 'WIN ✓' },
      'closed_loss': { bg: 'bg-status-loss', text: 'LOSS ✗' },
      'sl': { bg: 'bg-status-loss', text: 'SL ✗' }
    };
    const c = config[status?.toLowerCase()] || { bg: 'bg-gray-500', text: status };
    return (
      <span className={`${c.bg} text-white text-xs font-semibold px-2.5 py-1 rounded-full`}>
        {c.text}
      </span>
    );
  };

  return (
    <>
      <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gold-primary/10">
                <th className="text-left py-4 px-6 text-gold-primary text-xs font-semibold uppercase tracking-wider">Pair</th>
                <th className="text-left py-4 px-4 text-gold-primary text-xs font-semibold uppercase tracking-wider">Risk</th>
                <th className="text-right py-4 px-4 text-gold-primary text-xs font-semibold uppercase tracking-wider">Entry</th>
                <th className="text-right py-4 px-4 text-gold-primary text-xs font-semibold uppercase tracking-wider">Max Target</th>
                <th className="text-right py-4 px-4 text-gold-primary text-xs font-semibold uppercase tracking-wider">Stop Loss</th>
                <th className="text-center py-4 px-4 text-gold-primary text-xs font-semibold uppercase tracking-wider">Vol Rank</th>
                <th className="text-center py-4 px-4 text-gold-primary text-xs font-semibold uppercase tracking-wider">Status</th>
                <th className="text-right py-4 px-6 text-gold-primary text-xs font-semibold uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="border-b border-gold-primary/5">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="py-4 px-4">
                        <div className="h-4 bg-bg-card rounded animate-pulse"></div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : signals?.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-text-muted">
                    No signals found
                  </td>
                </tr>
              ) : (
                signals?.map((signal, idx) => {
                  const maxTarget = getMaxTarget(signal);
                  return (
                    <tr 
                      key={signal.signal_id || idx}
                      onClick={() => setSelectedSignal(signal)}
                      className="border-b border-gold-primary/5 hover:bg-gold-primary/5 cursor-pointer transition-colors"
                    >
                      {/* Pair with Coin Logo */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <CoinLogo pair={signal.pair} size={40} />
                          <div>
                            <p className="text-white font-semibold">{getCoinName(signal.pair)}</p>
                            <p className="text-text-muted text-xs">USDT</p>
                          </div>
                        </div>
                      </td>
                      
                      {/* Risk */}
                      <td className="py-4 px-4">
                        <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${getRiskBadge(signal.risk_level)}`}>
                          {signal.risk_level || '-'}
                        </span>
                      </td>
                      
                      {/* Entry */}
                      <td className="py-4 px-4 text-right">
                        <span className="font-mono text-white">{signal.entry?.toFixed(6)}</span>
                      </td>
                      
                      {/* Max Target */}
                      <td className="py-4 px-4 text-right">
                        {maxTarget.value ? (
                          <div>
                            <span className="font-mono text-white">{maxTarget.value.toFixed(6)}</span>
                            <p className="text-status-profit text-xs font-semibold">+{maxTarget.pct}%</p>
                          </div>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      
                      {/* Stop Loss */}
                      <td className="py-4 px-4 text-right">
                        <span className="font-mono text-status-loss">{signal.stop1?.toFixed(6) || '-'}</span>
                      </td>
                      
                      {/* Vol Rank */}
                      <td className="py-4 px-4 text-center">
                        {signal.volume_rank_num && signal.volume_rank_den ? (
                          <span className="text-text-secondary">
                            {signal.volume_rank_num}
                            <span className="text-text-muted">/{signal.volume_rank_den}</span>
                          </span>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      
                      {/* Status */}
                      <td className="py-4 px-4 text-center">
                        {getStatusBadge(signal.status)}
                      </td>
                      
                      {/* Time */}
                      <td className="py-4 px-6 text-right">
                        <span className="text-text-secondary font-mono text-sm">
                          {formatDateTime(signal.created_at)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-gold-primary/10 flex items-center justify-between">
          <p className="text-text-muted text-sm">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-4 py-2 rounded-lg bg-bg-card text-text-secondary hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-gold-primary/20"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-4 py-2 rounded-lg bg-bg-card text-text-secondary hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-gold-primary/20"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Signal Detail Modal */}
      <SignalModal 
        signal={selectedSignal}
        isOpen={!!selectedSignal}
        onClose={() => setSelectedSignal(null)}
      />
    </>
  );
};

export default SignalsTable;