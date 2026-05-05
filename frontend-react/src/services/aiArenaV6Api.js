// frontend-react/src/services/aiArenaV6Api.js
// API client for AI Arena v6 — wraps /api/v1/ai-arena/v6/* endpoints
// Pattern matches existing services (authApi, marketApi, etc.)

import api from './authApi';

const V6_BASE = '/ai-arena/v6';

/**
 * Fetch the most recent v6 report (full report_json).
 * Returns: { id, report_id, timestamp, btc_price, verdict_summary, cycle, critique_decision, cost_usd, report }
 */
export async function getLatestReport() {
  const { data } = await api.get(`${V6_BASE}/latest`);
  return data;
}

/**
 * Fetch verdict ledger for last N days.
 * @param {number} days - 1-90, default 14
 * @param {string|null} horizon - '24h' | '72h' | '7d' | '30d' | null (all)
 * Returns: { window_days, horizon_filter, count, items: [...] }
 */
export async function getLedger({ days = 14, horizon = null } = {}) {
  const params = { days };
  if (horizon) params.horizon = horizon;
  const { data } = await api.get(`${V6_BASE}/ledger`, { params });
  return data;
}

/**
 * Fetch hit-rate stats per horizon.
 * @param {number} days - 7-180, default 30
 * Returns: { horizons: { '24h': {...}, ... }, overall: {...}, window_days }
 */
export async function getTrackRecord({ days = 30 } = {}) {
  const { data } = await api.get(`${V6_BASE}/track-record`, { params: { days } });
  return data;
}

/**
 * Fetch chart data for the embedded price chart.
 * Reuses v4 endpoint /api/v1/ai-arena/chart-data.
 * @param {string} tf - '1D' | '4H' | '1H'
 */
export async function getChartData(tf = '4H') {
  const { data } = await api.get('/ai-arena/chart-data', { params: { tf } });
  return data;
}

export default {
  getLatestReport,
  getLedger,
  getTrackRecord,
  getChartData,
};
