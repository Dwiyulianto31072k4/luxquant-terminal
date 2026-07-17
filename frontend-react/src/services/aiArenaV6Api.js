// frontend-react/src/services/aiArenaV6Api.js
// API client for AI Arena v6 — wraps /api/v1/ai-arena/v6/* endpoints
// Pattern matches existing services (authApi, marketApi, etc.)

import api from './authApi';

const V6_BASE = '/api/v1/ai-arena/v6';

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
 * @param {number} days - 1-365, default 14
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
 * Fetch Compass 2.0 target-first scenario ledger (server-side pagination).
 * @param {number} limit - rows per page (max 200)
 * @param {number} offset - row offset
 * @param {string} filter - 'all' | 'pending' | 'resolved' | 'hit' | 'miss'
 * Returns: { count, total, filtered_total, offset, limit, filter, stats, items }
 * `stats` is computed over the entire ledger, not the current page.
 */
export async function getScenarioLedger({ limit = 50, offset = 0, filter = 'all' } = {}) {
 const { data } = await api.get(`${V6_BASE}/scenario-ledger`, {
 params: { limit, offset, filter },
 });
 return data;
}

/**
 * Fetch the self-learning brain vault (lessons, postmortems, regime).
 */
export async function getBrain() {
 const { data } = await api.get(`${V6_BASE}/brain`);
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
 * Fetch Phase 5 shadow-model validation and confidence calibration.
 */
export async function getModelCalibration({ days = 90 } = {}) {
 const { data } = await api.get(`${V6_BASE}/model-calibration`, {
 params: { days },
 });
 return data;
}

/**
 * Fetch Phase 2 liquidation model validation and collector health.
 */
export async function getLiquidityValidation({ limit = 25 } = {}) {
 const { data } = await api.get(`${V6_BASE}/liquidity-validation`, {
 params: { limit },
 });
 return data;
}

/**
 * Fetch Phase 3 structured news and economic-event context.
 */
export async function getEventRisk() {
 const { data } = await api.get(`${V6_BASE}/event-risk`);
 return data;
}

/**
 * Fetch Phase 7 operational health, alert rules, and runbook references.
 */
export async function getOperationalHealth() {
 const { data } = await api.get(`${V6_BASE}/operational-health`);
 return data;
}

/**
 * Fetch archived Compass reports with PDF status.
 */
export async function getReportArchive({ limit = 18 } = {}) {
 const { data } = await api.get(`${V6_BASE}/report-archive`, {
 params: { limit },
 });
 return data;
}

/**
 * Fetch a single Compass PDF as a Blob for authenticated in-page preview.
 */
export async function getReportPdfBlob(reportId, { force = false } = {}) {
 const { data } = await api.get(`${V6_BASE}/reports/${encodeURIComponent(reportId)}/pdf`, {
 params: force ? { force: true } : {},
 responseType: 'blob',
 });
 return data;
}

/**
 * Fetch chart data for the embedded price chart.
 * Reuses v4 endpoint /api/v1/ai-arena/chart-data.
 * @param {string} tf - '1D' | '4H' | '1H'
 */
export async function getChartData(tf = '4H') {
 const { data } = await api.get('/api/v1/ai-arena/chart-data', { params: { tf } });
 return data;
}

export default {
 getLatestReport,
 getLedger,
 getScenarioLedger,
 getTrackRecord,
 getModelCalibration,
 getLiquidityValidation,
 getEventRisk,
 getOperationalHealth,
 getReportArchive,
 getReportPdfBlob,
 getChartData,
};
