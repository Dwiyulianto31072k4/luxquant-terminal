// src/services/calendarApi.js
import api from './api';

const calendarApi = {
  // ── Existing: Macro economic events ──
  getEvents: async (params = {}) => {
    const response = await api.get('/calendar/events', { params });
    return response.data;
  },

  getUpcoming: async (limit = 5) => {
    const response = await api.get('/calendar/upcoming', { params: { limit } });
    return response.data;
  },

  getNews: async (limit = 15) => {
    const response = await api.get('/calendar/news', { params: { limit } });
    return response.data;
  },

  // ── NEW: Token unlocks (DefiLlama) ──
  getUnlocks: async () => {
    const response = await api.get('/calendar/unlocks');
    return response.data;
  },

  // ── NEW: Crypto events (CoinMarketCap) ──
  getCryptoEvents: async () => {
    const response = await api.get('/calendar/crypto-events');
    return response.data;
  },

  // ── NEW: Unified calendar (all sources merged) ──
  getUnified: async (params = {}) => {
    const response = await api.get('/calendar/unified', { params });
    return response.data;
  },
};

export default calendarApi;