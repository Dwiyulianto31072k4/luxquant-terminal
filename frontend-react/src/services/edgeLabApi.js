// src/services/edgeLabApi.js
import api from "./authApi";

export const edgeLabApi = {
 /**
 * Fetch multi-day Edge Lab analytics payload.
 * @param {number} days - 7 | 30 | 90 (default 30)
 * @param {string} sector - 'all' or sector name (default 'all')
 * @returns {Promise<Object>} {
 * date_range, filters, totals,
 * pattern_btc_heatmap, pattern_ev, calendar_wr,
 * pattern_calibration, hour_dow_heatmap
 * }
 */
 getEdgeLab: async (days = 30, sector = "all") => {
 const response = await api.get("/api/v1/analytics/edge-lab", {
 params: { days, sector },
 });
 return response.data;
 },

 /**
 * Drill into a single Edge Lab bucket — returns the individual signals
 * behind an aggregate cell. Same scoping/CTE as getEdgeLab, so counts match.
 *
 * @param {string} dimension - 'calendar_day' | 'timing_cell' | 'pattern' | 'pattern_btc'
 * @param {string} key - bucket key:
 * calendar_day → 'YYYY-MM-DD'
 * timing_cell → 'HOUR|DOW' e.g. '6|0' (06:00 UTC, Sunday)
 * pattern → '<TAG_NAME>' e.g. 'BROKE_SUPPORT_RECENT'
 * pattern_btc → '<TAG_NAME>|<CONTEXT>' e.g. 'BROKE_SUPPORT_RECENT|BULLISH'
 * @param {number} days - 7 | 30 | 90
 * @param {string} sector - 'all' or sector name
 * @param {number} limit - max signals (default 1000; backend caps at 1000)
 * @returns {Promise<Object>} { dimension, key, count, wins, win_rate, signals: [...] }
 */
 getDrill: async (dimension, key, days = 30, sector = "all", limit = 1000) => {
 const response = await api.get("/api/v1/analytics/edge-lab/drill", {
 params: { dimension, key, days, sector, limit },
 });
 return response.data;
 },
};

export default edgeLabApi;
