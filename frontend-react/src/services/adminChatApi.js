// src/services/adminChatApi.js
// Mirrors adminApi.js pattern — uses the shared axios instance from ./authApi.
import api from "./authApi";

export const adminChatApi = {
  // ════════════════════════════════════════════
  // Inbox
  // ════════════════════════════════════════════
  listConversations: async ({
    status = null,
    search = null,
    unreadOnly = false,
    limit = 50,
    offset = 0,
  } = {}) => {
    const params = { limit, offset };
    if (status) params.status = status;
    if (search) params.search = search;
    if (unreadOnly) params.unread_only = true;
    const response = await api.get("/api/v1/admin/chat/conversations", { params });
    return response.data;
  },

  // Open a thread with someone who has never written in. Idempotent on the
  // conversation — a user has exactly one thread.
  startConversation: async (userId, body, clientMsgId) => {
    const response = await api.post("/api/v1/admin/chat/conversations/start", {
      user_id: userId,
      body,
      client_msg_id: clientMsgId,
    });
    return response.data;
  },

  // Thread summary for one user, for surfaces that start from a user rather
  // than from the inbox. Returns { exists: false } instead of 404.
  getUserThread: async (userId) => {
    const response = await api.get(`/api/v1/admin/chat/user/${userId}`);
    return response.data;
  },

  getMessages: async (conversationId, after = 0, limit = 200) => {
    const response = await api.get(
      `/api/v1/admin/chat/conversations/${conversationId}/messages`,
      { params: { after, limit } }
    );
    return response.data;
  },

  sendMessage: async (conversationId, body, clientMsgId) => {
    const response = await api.post(
      `/api/v1/admin/chat/conversations/${conversationId}/messages`,
      { body, client_msg_id: clientMsgId }
    );
    return response.data;
  },

  markRead: async (conversationId, seq) => {
    const response = await api.post(
      `/api/v1/admin/chat/conversations/${conversationId}/read`,
      { seq }
    );
    return response.data;
  },

  setStatus: async (conversationId, status) => {
    const response = await api.patch(`/api/v1/admin/chat/conversations/${conversationId}`, {
      status,
    });
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await api.get("/api/v1/admin/chat/unread-count");
    return response.data;
  },

  // ════════════════════════════════════════════
  // Settings
  // ════════════════════════════════════════════
  getSettings: async () => {
    const response = await api.get("/api/v1/admin/chat/settings");
    return response.data;
  },

  updateSettings: async (patch) => {
    const response = await api.put("/api/v1/admin/chat/settings", patch);
    return response.data;
  },
};

export default adminChatApi;
