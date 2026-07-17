// src/services/analyticsApi.js
import api from "./authApi";

export const analyticsApi = {
 /**
 * Fetch the bundled Daily Performance dashboard payload.
 * @param {string|null} date - YYYY-MM-DD UTC. Null/omitted = today UTC.
 * @returns {Promise<Object>} { selected_date, today_summary, day_detail, trend_14d }
 */
 getDailyDashboard: async (date = null) => {
 const params = date ? { date } : {};
 const response = await api.get("/api/v1/analytics/daily/dashboard", {
 params,
 });
 return response.data;
 },
};

export default analyticsApi;
