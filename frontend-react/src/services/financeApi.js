// src/services/financeApi.js
//
// Finance management API client.
// v2: Adds getExchanges() + `exchange` filter in listPayments.
// v3: Adds manual-payment recording flow (verify-tx, create, plans, user-search)
// + `source` filter (manual/auto/all).

import api from './authApi';

export const financeApi = {
 // ════════════════════════════════════
 // STATS
 // ════════════════════════════════════
 getStats: async () => {
 const response = await api.get('/api/v1/workspace/finance/stats');
 return response.data;
 },

 // ════════════════════════════════════
 // EXCHANGES — distinct list for filter dropdown
 // ════════════════════════════════════
 getExchanges: async () => {
 const response = await api.get('/api/v1/workspace/finance/exchanges');
 return response.data; // { exchanges: ["Binance", "Indodax", ...] }
 },

 // ════════════════════════════════════
 // PLANS — for manual-payment plan picker
 // ════════════════════════════════════
 getPlans: async () => {
 const response = await api.get('/api/v1/workspace/finance/plans');
 return response.data; // { plans: [...] }
 },

 // ════════════════════════════════════
 // USER SEARCH — for manual-payment "link to existing" picker
 // ════════════════════════════════════
 searchUsers: async (query) => {
 const response = await api.get('/api/v1/workspace/finance/user-search', {
 params: { q: query },
 });
 return response.data; // { users: [...] }
 },

 // ════════════════════════════════════
 // MANUAL PAYMENT — verify + create
 // ════════════════════════════════════
 verifyTx: async (txHash) => {
 const response = await api.post('/api/v1/workspace/finance/verify-tx', {
 tx_hash: txHash,
 });
 return response.data;
 // { tx_data, warnings, blockers, exchange_name, existing_payment_id,
 // suggested_plan_id, suggested_user_id }
 },

 createManualPayment: async (payload) => {
 const response = await api.post(
 '/api/v1/workspace/finance/manual-payment',
 payload
 );
 return response.data;
 // { success, message, payment, user_was_created }
 },

 // ════════════════════════════════════
 // LIST payments
 // ════════════════════════════════════
 listPayments: async (filters = {}) => {
 const params = {};
 if (filters.status) params.status = filters.status;
 if (filters.search) params.search = filters.search;
 if (filters.user_id) params.user_id = filters.user_id;
 if (filters.exchange) params.exchange = filters.exchange;
 if (filters.source) params.source = filters.source; // 'manual' | 'auto'
 if (filters.only_stale) params.only_stale = true;
 if (filters.sort_by) params.sort_by = filters.sort_by;
 if (filters.sort_order) params.sort_order = filters.sort_order;
 if (filters.page) params.page = filters.page;
 if (filters.page_size) params.page_size = filters.page_size;

 const response = await api.get('/api/v1/workspace/finance/payments', {
 params,
 });
 return response.data;
 },

 // ════════════════════════════════════
 // GET single payment detail
 // ════════════════════════════════════
 getPayment: async (paymentId) => {
 const response = await api.get(
 `/api/v1/workspace/finance/payments/${paymentId}`
 );
 return response.data;
 },

 // ════════════════════════════════════
 // ACTIONS
 // ════════════════════════════════════
 approvePayment: async (paymentId, note = null) => {
 const body = note ? { note } : {};
 const response = await api.post(
 `/api/v1/workspace/finance/payments/${paymentId}/approve`,
 body
 );
 return response.data;
 },

 markFailed: async (paymentId, note = null) => {
 const body = note ? { note } : {};
 const response = await api.post(
 `/api/v1/workspace/finance/payments/${paymentId}/mark-failed`,
 body
 );
 return response.data;
 },

 cancelPayment: async (paymentId, note = null) => {
 const body = note ? { note } : {};
 const response = await api.post(
 `/api/v1/workspace/finance/payments/${paymentId}/cancel`,
 body
 );
 return response.data;
 },

 refundPayment: async (paymentId, note = null) => {
 const body = note ? { note } : {};
 const response = await api.post(
 `/api/v1/workspace/finance/payments/${paymentId}/refund`,
 body
 );
 return response.data;
 },

 addNote: async (paymentId, note) => {
 const response = await api.post(
 `/api/v1/workspace/finance/payments/${paymentId}/note`,
 { note }
 );
 return response.data;
 },

 // ════════════════════════════════════
 // VOID (soft) / RESTORE / DELETE (hard)
 // ════════════════════════════════════
 voidPayment: async (paymentId, note = null) => {
 const body = note ? { note } : {};
 const response = await api.post(
 `/api/v1/workspace/finance/payments/${paymentId}/void`,
 body
 );
 return response.data;
 },

 restorePayment: async (paymentId, note = null) => {
 const body = note ? { note } : {};
 const response = await api.post(
 `/api/v1/workspace/finance/payments/${paymentId}/restore`,
 body
 );
 return response.data;
 },

 deletePayment: async (paymentId) => {
 const response = await api.delete(
 `/api/v1/workspace/finance/payments/${paymentId}`
 );
 return response.data;
 },

 bulkCancelStale: async (hours = 24) => {
 const response = await api.post(
 `/api/v1/workspace/finance/payments/bulk-cancel-stale`,
 null,
 { params: { hours } }
 );
 return response.data;
 },
};
