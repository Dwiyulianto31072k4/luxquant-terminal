// src/services/moneyFlowApi.js
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Money Flow API client
// Mirror pola whaleApi: pakai shared `api` instance (base URL + token
// injection udah dihandle di ./api). Semua endpoint di-gate premium
// di backend (require_subscription).
// ════════════════════════════════════════════════════════════════
import api from './api';

const moneyFlowApi = {
  /**
   * Ranking sektor + delta 24h/7d/30d.
   * @param {Object} params - { limit }
   */
  getSectors: async (params = {}) => {
    const response = await api.get('/money-flow/sectors', { params });
    return response.data;
  },

  /**
   * Semua koin dalam satu kategori/naratif (drill-down klik sektor).
   * @param {string} categoryId - CoinGecko category id (mis. "real-world-assets-rwa")
   * @param {Object} params - { limit }
   */
  getSectorCoins: async (categoryId, params = {}) => {
    const response = await api.get(
      `/money-flow/sectors/${encodeURIComponent(categoryId)}/coins`,
      { params }
    );
    return response.data;
  },

  /**
   * Macro gauge: BTC/ETH/stablecoin dominance + altseason index.
   */
  getMacro: async () => {
    const response = await api.get('/money-flow/macro');
    return response.data;
  },

  /**
   * Flow intensity per koin (+ flag LuxQuant).
   * @param {Object} params - { limit, luxquant_only }
   */
  getCoins: async (params = {}) => {
    const response = await api.get('/money-flow/coins', { params });
    return response.data;
  },

  /**
   * Live DEX buy/sell pressure (GeckoTerminal) — alt & meme.
   */
  getDex: async () => {
    const response = await api.get('/money-flow/dex');
    return response.data;
  },

  /**
   * Ringkasan gabungan buat initial page load (1 call).
   */
  getOverview: async () => {
    const response = await api.get('/money-flow/overview');
    return response.data;
  },
};

export default moneyFlowApi;
