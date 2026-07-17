// frontend-react/src/services/referralApi.js
import api from './authApi';

export const referralApi = {
 // ─── Code Management ─────────────────────────────────────────

 generateCode: async (customCode = null) => {
 const body = customCode ? { custom_code: customCode } : {};
 const response = await api.post('/api/v1/referral/generate', body);
 return response.data;
 },

 getMyCode: async () => {
 const response = await api.get('/api/v1/referral/my-code');
 return response.data;
 },

 // ─── Combined Stats (one-shot dashboard load) ────────────────

 getStats: async () => {
 const response = await api.get('/api/v1/referral/stats');
 return response.data;
 },

 // ─── Detailed Analytics ──────────────────────────────────────

 getFunnel: async () => {
 const response = await api.get('/api/v1/referral/funnel');
 return response.data;
 },

 getEarnings: async () => {
 const response = await api.get('/api/v1/referral/earnings');
 return response.data;
 },

 getReferees: async (page = 1, pageSize = 20) => {
 const response = await api.get('/api/v1/referral/referees', {
 params: { page, page_size: pageSize },
 });
 return response.data;
 },

 getLedger: async (page = 1, pageSize = 20) => {
 const response = await api.get('/api/v1/referral/ledger', {
 params: { page, page_size: pageSize },
 });
 return response.data;
 },

 // ─── Validation (public) ─────────────────────────────────────

 validateCode: async (code) => {
 const response = await api.get(`/api/v1/referral/validate/${code}`);
 return response.data;
 },

 // ─── Share Tracking ──────────────────────────────────────────

 trackShare: async (code, channel = 'copy_link') => {
 const response = await api.post('/api/v1/referral/track-share', {
 code,
 channel,
 });
 return response.data;
 },

 // ─── Apply (legacy/manual) ──────────────────────────────────

 applyCode: async (code) => {
 const response = await api.post('/api/v1/referral/apply', { code });
 return response.data;
 },

 // ─── Redemption (credit → invoice discount) ─────────────────

 redeem: async (amountUsdt, paymentId) => {
 const response = await api.post('/api/v1/referral/redeem', {
 amount_usdt: amountUsdt,
 payment_id: paymentId,
 });
 return response.data;
 },

 redeemPreview: async (amountUsdt, paymentId) => {
 const response = await api.post('/api/v1/referral/redeem/preview', {
 amount_usdt: amountUsdt,
 payment_id: paymentId,
 });
 return response.data;
 },

 // ═══════════════════════════════════════════════════════════
 // Layer 8 — Cashout (withdraw balance via Telegram admin)
 // ═══════════════════════════════════════════════════════════

 /** Current balance + active cashout info */
 getCashoutBalance: async () => {
 const response = await api.get('/api/v1/referral/cashout/balance');
 return response.data;
 },

 /** Submit new cashout request (hard reserve: balance immediately deducted) */
 requestCashout: async ({ amountUsdt, telegramUsername, note }) => {
 const response = await api.post('/api/v1/referral/cashout/request', {
 amount_usdt: amountUsdt,
 destination_telegram: telegramUsername,
 destination_note: note || null,
 });
 return response.data;
 },

 /** My cashout history (all statuses) */
 getCashoutHistory: async (limit = 50) => {
 const response = await api.get('/api/v1/referral/cashout/my', {
 params: { limit },
 });
 return response.data;
 },

 /** Cancel my own pending cashout (refunds balance) */
 cancelCashout: async (cashoutId) => {
 const response = await api.post(
 `/api/v1/referral/cashout/${cashoutId}/cancel`
 );
 return response.data;
 },
};
