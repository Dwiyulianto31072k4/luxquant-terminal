// src/components/WatchlistPage.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { watchlistApi } from '../services/watchlistApi';
import StarButton from './StarButton';

const WatchlistPage = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const fetchWatchlist = async () => {
      try {
        const data = await watchlistApi.getWatchlist();
        setWatchlist(data.items);
      } catch (error) {
        console.error('Failed to fetch watchlist:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWatchlist();
  }, [isAuthenticated, navigate]);

  const handleRemove = (signalId) => {
    setWatchlist(prev => prev.filter(item => item.signal_id !== signalId));
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'open': { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'OPEN' },
      'tp1': { bg: 'bg-green-500/20', text: 'text-green-400', label: 'TP1' },
      'tp2': { bg: 'bg-green-500/20', text: 'text-green-400', label: 'TP2' },
      'tp3': { bg: 'bg-green-500/20', text: 'text-green-400', label: 'TP3' },
      'closed_win': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'TP4' },
      'closed_loss': { bg: 'bg-red-500/20', text: 'text-red-400', label: 'LOSS' },
    };
    const config = statusConfig[status] || statusConfig['open'];
    return (
      <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-gold-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">My Watchlist</h1>
          <p className="text-text-secondary mt-1">
            {watchlist.length} signal{watchlist.length !== 1 ? 's' : ''} dalam watchlist
          </p>
        </div>
      </div>

      {/* Content */}
      {watchlist.length === 0 ? (
        <div className="text-center py-16 bg-bg-card/50 rounded-2xl border border-gold-primary/10">
          <svg className="w-16 h-16 mx-auto text-text-muted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
          <h3 className="text-lg font-semibold text-white mb-2">Watchlist kosong</h3>
          <p className="text-text-muted">
            Klik icon ⭐ pada signal untuk menambahkan ke watchlist
          </p>
        </div>
      ) : (
        <div className="bg-bg-card/50 rounded-2xl border border-gold-primary/10 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gold-primary/10">
                <th className="text-left py-4 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Pair</th>
                <th className="text-left py-4 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Entry</th>
                <th className="text-left py-4 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Risk</th>
                <th className="text-left py-4 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                <th className="text-left py-4 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Added</th>
                <th className="text-center py-4 px-6 text-xs font-semibold text-text-muted uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody>
              {watchlist.map((item) => (
                <tr 
                  key={item.id} 
                  className="border-b border-gold-primary/5 hover:bg-white/5 transition-colors"
                >
                  <td className="py-4 px-6">
                    <span className="font-semibold text-white">{item.pair || '-'}</span>
                  </td>
                  <td className="py-4 px-6">
                    <span className="font-mono text-text-secondary">
                      {item.entry ? `$${item.entry.toFixed(6)}` : '-'}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <span className={`text-sm ${
                      item.risk_level?.toLowerCase().includes('low') ? 'text-green-400' :
                      item.risk_level?.toLowerCase().includes('med') ? 'text-yellow-400' :
                      'text-red-400'
                    }`}>
                      {item.risk_level || '-'}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    {getStatusBadge(item.status)}
                  </td>
                  <td className="py-4 px-6">
                    <span className="text-sm text-text-muted">
                      {new Date(item.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-center">
                    <StarButton 
                      signalId={item.signal_id} 
                      isStarred={true}
                      onToggle={() => handleRemove(item.signal_id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default WatchlistPage;