// src/components/StarButton.jsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { watchlistApi } from '../services/watchlistApi';

const StarButton = ({ signalId, isStarred: initialStarred, onToggle }) => {
  const { isAuthenticated } = useAuth();
  const [isStarred, setIsStarred] = useState(initialStarred);
  const [loading, setLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Sync with parent state
  useState(() => {
    setIsStarred(initialStarred);
  }, [initialStarred]);

  const handleClick = async (e) => {
    e.stopPropagation(); // Prevent row click

    if (!isAuthenticated) {
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 2000);
      return;
    }

    setLoading(true);
    try {
      if (isStarred) {
        await watchlistApi.removeFromWatchlist(signalId);
        setIsStarred(false);
        if (onToggle) onToggle(signalId, false);
      } else {
        await watchlistApi.addToWatchlist(signalId);
        setIsStarred(true);
        if (onToggle) onToggle(signalId, true);
      }
    } catch (error) {
      console.error('Watchlist error:', error);
      // Revert on error
      setIsStarred(isStarred);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={loading}
        className={`p-1.5 rounded-lg transition-all duration-200 ${
          loading 
            ? 'opacity-50 cursor-not-allowed' 
            : 'hover:bg-gold-primary/10 hover:scale-110 active:scale-95'
        }`}
        title={isStarred ? 'Remove from watchlist' : 'Add to watchlist'}
      >
        {loading ? (
          // Loading spinner
          <svg className="w-5 h-5 animate-spin text-gold-primary" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          // Star icon
          <svg
            className={`w-5 h-5 transition-all duration-200 ${
              isStarred 
                ? 'text-yellow-400 fill-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.5)]' 
                : 'text-gray-500 hover:text-yellow-400/70'
            }`}
            fill={isStarred ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={isStarred ? 0 : 2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
            />
          </svg>
        )}
      </button>

      {/* Tooltip for non-authenticated users */}
      {showTooltip && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-1.5 bg-bg-card border border-gold-primary/30 rounded-lg shadow-xl z-50 whitespace-nowrap animate-fadeIn">
          <p className="text-xs text-white">Login to add to watchlist</p>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gold-primary/30" />
        </div>
      )}
    </div>
  );
};

export default StarButton;