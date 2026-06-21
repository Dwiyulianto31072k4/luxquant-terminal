// src/services/adminApi.js
import api from './authApi';

export const adminApi = {
  // ════════════════════════════════════════
  // Dashboard stats
  // ════════════════════════════════════════
  getStats: async () => {
    const response = await api.get('/api/v1/admin/stats');
    return response.data;
  },

  // ════════════════════════════════════════
  // List users with search/filter/pagination (8 dimensions)
  // ════════════════════════════════════════
  getUsers: async ({
    search,
    role,
    status,
    provider,      // ← NEW: google/telegram/discord/local
    activity,      // ← NEW: active_7d | dormant_30d | never_logged_in
    reach,         // ← NEW: has_tg | has_dc | has_email | unreachable | admin_enriched
    vipState,      // ← NEW: in_group | outside_group | no_telegram
    anomaly,       // ← NEW: paid_outside | paid_no_tg | expired_inside
    source,        // ← NEW: payment | legacy | lifetime | admin | telegram_vip | discord_premium
    sortBy,
    sortOrder,
    page,
    pageSize,
  } = {}) => {
    const params = {};
    if (search) params.search = search;
    if (role) params.role = role;
    if (status) params.status = status;
    if (provider) params.provider = provider;
    if (activity) params.activity = activity;
    if (reach) params.reach = reach;
    if (vipState) params.vip_state = vipState;
    if (anomaly) params.anomaly = anomaly;
    if (source) params.source = source;
    if (sortBy) params.sort_by = sortBy;
    if (sortOrder) params.sort_order = sortOrder;
    if (page) params.page = page;
    if (pageSize) params.page_size = pageSize;
    const response = await api.get('/api/v1/admin/users', { params });
    return response.data;
  },

  // Grant subscription
  grantSubscription: async (userId, duration, note = null, startDate = null, endDate = null) => {
    const body = { duration };
    if (note) body.note = note;
    if (startDate) body.start_date = startDate;
    if (endDate) body.end_date = endDate;
    const response = await api.post(`/api/v1/admin/users/${userId}/grant-subscription`, body);
    return response.data;
  },

  // Revoke subscription
  revokeSubscription: async (userId) => {
    const response = await api.post(`/api/v1/admin/users/${userId}/revoke-subscription`);
    return response.data;
  },

  // Get expiring subscriptions
  getExpiringSubscriptions: async (days = 7) => {
    const response = await api.get('/api/v1/admin/expiring-subscriptions', {
      params: { days },
    });
    return response.data;
  },

  // Cleanup expired
  cleanupExpired: async () => {
    const response = await api.post('/api/v1/admin/cleanup-expired');
    return response.data;
  },

  // Toggle user active
  toggleUserActive: async (userId) => {
    const response = await api.post(`/api/v1/admin/users/${userId}/toggle-active`);
    return response.data;
  },

  // Generate one-time VIP group invite link (admin-initiated)
  generateVipInvite: async (userId) => {
    const response = await api.post(`/api/v1/admin/users/${userId}/vip-invite`);
    return response.data;
  },

  // Send adaptive VIP follow-up DM (invite link) to one user via bot
  vipFollowup: async (userId) => {
    const response = await api.post(`/api/v1/admin/users/${userId}/vip-followup`);
    return response.data;
  },

  // Bulk VIP follow-up. userIds: number[] (capped 50/call server-side)
  vipFollowupBulk: async (userIds) => {
    const response = await api.post('/api/v1/admin/users/vip-followup-bulk', {
      user_ids: userIds,
    });
    return response.data;
  },

  // Send a custom admin message to a user via bot (Telegram DM)
  sendMessage: async (userId, { text, withInvite = false } = {}) => {
    const response = await api.post(`/api/v1/admin/users/${userId}/send-message`, {
      text,
      with_invite: withInvite,
    });
    return response.data;
  },

  // ════════════════════════════════════════
  // Admin Outreach (Layer Outreach) — NEW
  // ════════════════════════════════════════

  // Get contact reach stats (aggregate)
  getContactStats: async () => {
    const response = await api.get('/api/v1/admin/users/contact-stats');
    return response.data;
  },

  // Get FULL user detail (drawer data)
  getUserFull: async (userId) => {
    const response = await api.get(`/api/v1/admin/users/${userId}/full`);
    return response.data;
  },

  // Update user enrichment (TG/DC/notes)
  // Only fields you pass will be updated (PATCH semantics).
  // Pass null to clear a field.
  updateUserContact: async (userId, { admin_telegram_username, admin_discord_handle, admin_notes } = {}) => {
    const body = {};
    if (admin_telegram_username !== undefined) body.admin_telegram_username = admin_telegram_username;
    if (admin_discord_handle !== undefined) body.admin_discord_handle = admin_discord_handle;
    if (admin_notes !== undefined) body.admin_notes = admin_notes;
    const response = await api.patch(`/api/v1/admin/users/${userId}/contact`, body);
    return response.data;
  },

  // List message templates
  getOutreachTemplates: async () => {
    const response = await api.get('/api/v1/admin/outreach/templates');
    return response.data;
  },

  // Render template for specific user
  renderOutreachTemplate: async (templateId, userId, customMessage = null) => {
    const body = { template_id: templateId, user_id: userId };
    if (customMessage) body.custom_message = customMessage;
    const response = await api.post('/api/v1/admin/outreach/render', body);
    return response.data;
  },
};
