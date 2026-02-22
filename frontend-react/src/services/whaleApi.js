// src/services/whaleApi.js
import api from './api';

const whaleApi = {
  /**
   * Get whale transactions
   * @param {Object} params - { blockchain, min_usd, transfer_type, size }
   */
  getTransactions: async (params = {}) => {
    const response = await api.get('/whale/transactions', { params });
    return response.data;
  },

  /**
   * Get aggregated whale stats
   */
  getStats: async () => {
    const response = await api.get('/whale/stats');
    return response.data;
  },

  /**
   * Get exchange inflow/outflow with sentiment
   */
  getFlows: async () => {
    const response = await api.get('/whale/flows');
    return response.data;
  },
};

export default whaleApi;