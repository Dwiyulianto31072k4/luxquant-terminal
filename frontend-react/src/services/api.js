import axios from 'axios';

const API_BASE = '/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

export const signalsApi = {
  // Get paginated signals
  getSignals: async (page = 1, pageSize = 20, status = null, pair = null) => {
    const params = { page, page_size: pageSize };
    if (status) params.status = status;
    if (pair) params.pair = pair;
    const response = await api.get('/signals/', { params });
    return response.data;
  },

  // Get active signals only
  getActiveSignals: async (limit = 20) => {
    const response = await api.get('/signals/active', { params: { limit } });
    return response.data;
  },

  // Get signal stats
  getStats: async () => {
    const response = await api.get('/signals/stats');
    return response.data;
  },

  // Get single signal
  getSignal: async (signalId) => {
    const response = await api.get(`/signals/${signalId}`);
    return response.data;
  },
};

export const marketApi = {
  // Get market overview
  getOverview: async () => {
    const response = await api.get('/market/overview');
    return response.data;
  },

  // Get BTC price
  getBtcPrice: async () => {
    const response = await api.get('/market/btc-price');
    return response.data;
  },
};

export default api;
