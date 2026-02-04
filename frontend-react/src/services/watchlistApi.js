// src/services/watchlistApi.js
import api from './authApi';

export const watchlistApi = {
  // Get user's watchlist
  getWatchlist: async () => {
    const response = await api.get('/api/v1/watchlist/');
    return response.data;
  },

  // Add signal to watchlist
  addToWatchlist: async (signalId) => {
    const response = await api.post('/api/v1/watchlist/', { signal_id: signalId });
    return response.data;
  },

  // Remove signal from watchlist
  removeFromWatchlist: async (signalId) => {
    const response = await api.delete(`/api/v1/watchlist/${signalId}`);
    return response.data;
  },

  // Check if signal is in watchlist
  checkInWatchlist: async (signalId) => {
    const response = await api.get(`/api/v1/watchlist/check/${signalId}`);
    return response.data;
  },

  // Get all watchlist signal IDs (for quick lookup)
  getWatchlistIds: async () => {
    try {
      const response = await api.get('/api/v1/watchlist/ids');
      return response.data;
    } catch (error) {
      // If endpoint doesn't exist, fallback to getting full watchlist
      console.warn('getWatchlistIds endpoint not found, falling back to full watchlist');
      try {
        const fullResponse = await api.get('/api/v1/watchlist/');
        const signalIds = (fullResponse.data.items || []).map(item => item.signal_id);
        return { signal_ids: signalIds };
      } catch (fallbackError) {
        console.error('Failed to get watchlist:', fallbackError);
        return { signal_ids: [] };
      }
    }
  }
};