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
    awaitingReadOnly = false,
    activeUnreadOnly = false,
    needsReplyOnly = false,
    limit = 50,
    offset = 0,
  } = {}) => {
    const params = { limit, offset };
    if (status) params.status = status;
    if (search) params.search = search;
    if (unreadOnly) params.unread_only = true;
    if (awaitingReadOnly) params.awaiting_read_only = true;
    if (activeUnreadOnly) params.active_unread_only = true;
    if (needsReplyOnly) params.needs_reply_only = true;
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

  sendMessage: async (conversationId, body, clientMsgId, kind = "text") => {
    const response = await api.post(
      `/api/v1/admin/chat/conversations/${conversationId}/messages`,
      { body, kind, client_msg_id: clientMsgId }
    );
    return response.data;
  },

  // Reuses the user-side upload: an admin is a logged-in user, and a second
  // endpoint storing the same files in the same place would only be one more
  // thing to keep in step.
  uploadImage: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const response = await api.post("/api/v1/chat/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
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

  // Threads where the user spoke last and nobody answered. Not the same as
  // unread: glancing at a conversation clears the badge but does not reply, and
  // the person waiting only experiences the reply.
  getAwaitingReply: async (limit = 5) => {
    const response = await api.get("/api/v1/admin/chat/awaiting-reply", {
      params: { limit },
    });
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
