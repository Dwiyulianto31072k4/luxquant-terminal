import { useState, useEffect } from 'react';
import SignalModal from './SignalModal';
import CoinLogo from './CoinLogo';
import StarButton from './StarButton';
import { useAuth } from '../context/AuthContext';
import { watchlistApi } from '../services/watchlistApi';

const SignalsTable = ({ 
  signals, 
  loading, 
  page, 
  totalPages, 
  onPageChange,
  sortBy,
  sortOrder,
  onSort 
}) => {
  const [selectedSignal, setSelectedSignal] = useState(null);
  const { isAuthenticated } = useAuth();
  const [watchlistIds, setWatchlistIds] = useState(new Set());
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);

  // Fetch watchlist IDs when authenticated
  useEffect(() => {
    const fetchWatchlistIds = async () => {
      if (isAuthenticated) {
        setLoadingWatchlist(true);
        try {
          const data = await watchlistApi.getWatchlistIds();
          setWatchlistIds(new Set(data.signal_ids || []));
        } catch (error) {
          console.error('Failed to fetch watchlist IDs:', error);
        } finally {
          setLoadingWatchlist(false);
        }
      } else {
        setWatchlistIds(new Set());
      }
    };
    fetchWatchlistIds();
  }, [isAuthenticated]);

  // Handle watchlist toggle
  const handleWatchlistToggle = (signalId, isNowStarred) => {
    setWatchlistIds(prev => {
      const newSet = new Set(prev);
      if (isNowStarred) {
        newSet.add(signalId);
      } else {
        newSet.delete(signalId);
      }
      return newSet;
    });
  };

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
      'low': 'bg-green-500/20 text-green-400 border-green-500/30',
      'med': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'medium': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      'high': 'bg-red-500/20 text-red-400 border-red-500/30'
    };
    return styles[risk?.toLowerCase()] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  // Status badge
  const getStatusBadge = (status) => {
    const config = {
      'open': { bg: 'bg-cyan-500', text: 'OPEN', icon: '●' },
      'tp1': { bg: 'bg-green-500', text: 'TP1', icon: '✓' },
      'tp2': { bg: 'bg-lime-500', text: 'TP2', icon: '✓' },
      'tp3': { bg: 'bg-yellow-500', text: 'TP3', icon: '✓' },
      'tp4': { bg: 'bg-orange-500', text: 'TP4', icon: '✓' },
      'closed_win': { bg: 'bg-green-600', text: 'WIN', icon: '🏆' },
      'closed_loss': { bg: 'bg-red-500', text: 'LOSS', icon: '✗' },
      'sl': { bg: 'bg-red-500', text: 'SL', icon: '✗' }
    };
    const c = config[status?.toLowerCase()] || { bg: 'bg-gray-500', text: status, icon: '' };
    return (
      <span className={`${c.bg} text-white text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1`}>
        <span>{c.icon}</span>
        {c.text}
      </span>
    );
  };

  // Sortable header component
  const SortableHeader = ({ field, label, align = 'left' }) => {
    const isActive = sortBy === field;
    const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    
    return (
      <th 
        className={`py-4 px-4 text-xs font-semibold uppercase tracking-wider cursor-pointer hover:text-gold-primary transition-colors select-none ${textAlign} ${isActive ? 'text-gold-primary' : 'text-gold-primary/70'}`}
        onClick={() => onSort && onSort(field)}
      >
        <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
          <span>{label}</span>
          {isActive && (
            <span className="text-gold-primary text-xs">
              {sortOrder === 'desc' ? '↓' : '↑'}
            </span>
          )}
          {!isActive && (
            <span className="text-text-muted/50 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
              ↕
            </span>
          )}
        </div>
      </th>
    );
  };

  // Non-sortable header component
  const Header = ({ label, align = 'left' }) => {
    const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    return (
      <th className={`py-4 px-4 text-gold-primary/70 text-xs font-semibold uppercase tracking-wider ${textAlign}`}>
        {label}
      </th>
    );
  };

  return (
    <>
      <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gold-primary/10 bg-gold-primary/5">
                {/* Star column header - only show if authenticated */}
                {isAuthenticated && (
                  <th className="py-4 px-2 w-12 text-gold-primary/70 text-xs font-semibold uppercase tracking-wider text-center">
                    <svg className="w-4 h-4 mx-auto text-gold-primary/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </th>
                )}
                <SortableHeader field="pair" label="Pair" />
                <SortableHeader field="risk_level" label="Risk" />
                <SortableHeader field="entry" label="Entry" align="right" />
                <Header label="Max Target" align="right" />
                <Header label="Stop Loss" align="right" />
                <Header label="Vol Rank" align="center" />
                <SortableHeader field="status" label="Status" align="center" />
                <SortableHeader field="created_at" label="Time" align="right" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i} className="border-b border-gold-primary/5">
                    {isAuthenticated && (
                      <td className="py-4 px-2">
                        <div className="h-5 w-5 bg-bg-card rounded animate-pulse mx-auto"></div>
                      </td>
                    )}
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="py-4 px-4">
                        <div className="h-5 bg-bg-card rounded animate-pulse"></div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : signals?.length === 0 ? (
                <tr>
                  <td colSpan={isAuthenticated ? 9 : 8} className="text-center py-16">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-bg-card flex items-center justify-center">
                        <span className="text-3xl">🔍</span>
                      </div>
                      <p className="text-text-muted text-lg">No signals found</p>
                      <p className="text-text-muted/60 text-sm">Try adjusting your filters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                signals?.map((signal, idx) => {
                  const maxTarget = getMaxTarget(signal);
                  const isStarred = watchlistIds.has(signal.signal_id);
                  
                  return (
                    <tr 
                      key={signal.signal_id || idx}
                      className="border-b border-gold-primary/5 hover:bg-gold-primary/5 cursor-pointer transition-colors group"
                    >
                      {/* Star Button - only show if authenticated */}
                      {isAuthenticated && (
                        <td className="py-4 px-2 text-center">
                          <StarButton 
                            signalId={signal.signal_id}
                            isStarred={isStarred}
                            onToggle={handleWatchlistToggle}
                          />
                        </td>
                      )}
                      
                      {/* Pair with Coin Logo */}
                      <td className="py-4 px-4" onClick={() => setSelectedSignal(signal)}>
                        <div className="flex items-center gap-3">
                          <CoinLogo pair={signal.pair} size={40} />
                          <div>
                            <p className="text-white font-semibold group-hover:text-gold-primary transition-colors">
                              {getCoinName(signal.pair)}
                            </p>
                            <p className="text-text-muted text-xs">USDT</p>
                          </div>
                        </div>
                      </td>
                      
                      {/* Risk */}
                      <td className="py-4 px-4" onClick={() => setSelectedSignal(signal)}>
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold uppercase border ${getRiskBadge(signal.risk_level)}`}>
                          {signal.risk_level || '-'}
                        </span>
                      </td>
                      
                      {/* Entry */}
                      <td className="py-4 px-4 text-right" onClick={() => setSelectedSignal(signal)}>
                        <span className="font-mono text-white">{signal.entry?.toFixed(6)}</span>
                      </td>
                      
                      {/* Max Target */}
                      <td className="py-4 px-4 text-right" onClick={() => setSelectedSignal(signal)}>
                        {maxTarget.value ? (
                          <div>
                            <span className="font-mono text-white">{maxTarget.value.toFixed(6)}</span>
                            <p className="text-positive text-xs font-semibold">+{maxTarget.pct}%</p>
                          </div>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      
                      {/* Stop Loss */}
                      <td className="py-4 px-4 text-right" onClick={() => setSelectedSignal(signal)}>
                        <span className="font-mono text-negative">{signal.stop1?.toFixed(6) || '-'}</span>
                      </td>
                      
                      {/* Vol Rank */}
                      <td className="py-4 px-4 text-center" onClick={() => setSelectedSignal(signal)}>
                        {signal.volume_rank_num && signal.volume_rank_den ? (
                          <span className="text-text-secondary font-mono">
                            <span className="text-white">{signal.volume_rank_num}</span>
                            <span className="text-text-muted">/{signal.volume_rank_den}</span>
                          </span>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      
                      {/* Status */}
                      <td className="py-4 px-4 text-center" onClick={() => setSelectedSignal(signal)}>
                        {getStatusBadge(signal.status)}
                      </td>
                      
                      {/* Time */}
                      <td className="py-4 px-4 text-right" onClick={() => setSelectedSignal(signal)}>
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
        {!loading && signals?.length > 0 && (
          <div className="p-4 border-t border-gold-primary/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-text-muted text-sm">
              Page <span className="text-white font-semibold">{page}</span> of{' '}
              <span className="text-white font-semibold">{totalPages}</span>
            </p>
            
            <div className="flex items-center gap-2">
              {/* First Page */}
              <button
                onClick={() => onPageChange(1)}
                disabled={page <= 1}
                className="px-3 py-2 rounded-lg bg-bg-card text-text-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-gold-primary/20 hover:border-gold-primary/40"
                title="First page"
              >
                «
              </button>
              
              {/* Previous */}
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="px-4 py-2 rounded-lg bg-bg-card text-text-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-gold-primary/20 hover:border-gold-primary/40"
              >
                Previous
              </button>
              
              {/* Page Numbers */}
              <div className="hidden sm:flex items-center gap-1">
                {generatePageNumbers(page, totalPages).map((p, i) => (
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} className="px-2 text-text-muted">...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => onPageChange(p)}
                      className={`w-10 h-10 rounded-lg text-sm font-medium transition-all ${
                        p === page
                          ? 'bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary shadow-gold-glow'
                          : 'bg-bg-card text-text-secondary hover:text-white border border-gold-primary/20 hover:border-gold-primary/40'
                      }`}
                    >
                      {p}
                    </button>
                  )
                ))}
              </div>
              
              {/* Next */}
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="px-4 py-2 rounded-lg bg-bg-card text-text-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-gold-primary/20 hover:border-gold-primary/40"
              >
                Next
              </button>
              
              {/* Last Page */}
              <button
                onClick={() => onPageChange(totalPages)}
                disabled={page >= totalPages}
                className="px-3 py-2 rounded-lg bg-bg-card text-text-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-gold-primary/20 hover:border-gold-primary/40"
                title="Last page"
              >
                »
              </button>
            </div>
          </div>
        )}
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

// Helper function to generate page numbers with ellipsis
const generatePageNumbers = (current, total) => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  
  const pages = [];
  
  // Always show first page
  pages.push(1);
  
  if (current > 3) {
    pages.push('...');
  }
  
  // Pages around current
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  
  for (let i = start; i <= end; i++) {
    if (!pages.includes(i)) {
      pages.push(i);
    }
  }
  
  if (current < total - 2) {
    pages.push('...');
  }
  
  // Always show last page
  if (!pages.includes(total)) {
    pages.push(total);
  }
  
  return pages;
};

export default SignalsTable;