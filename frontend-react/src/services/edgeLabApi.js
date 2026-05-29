// src/services/edgeLabApi.js
import api from "./authApi";

export const edgeLabApi = {
  /**
   * Fetch multi-day Edge Lab analytics payload.
   * @param {number} days - 7 | 30 | 90 (default 30)
   * @param {string} sector - 'all' or sector name (default 'all')
   * @returns {Promise<Object>} {
   *   date_range, filters, totals,
   *   pattern_btc_heatmap, pattern_ev, calendar_wr,
   *   pattern_calibration, hour_dow_heatmap
   * }
   */
  getEdgeLab: async (days = 30, sector = "all") => {
    const response = await api.get("/api/v1/analytics/edge-lab", {
      params: { days, sector },
    });
    return response.data;
  },
};

export default edgeLabApi;
