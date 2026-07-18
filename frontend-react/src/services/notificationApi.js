// src/services/notificationApi.js
import api from "./authApi";

export const notificationApi = {
  // Get notifications (paginated)
  getNotifications: async (
    page = 1,
    pageSize = 20,
    type = null,
    unreadOnly = false,
    group = null
  ) => {
    const params = { page, page_size: pageSize };
    if (type) params.type = type;
    if (group) params.group = group;
    if (unreadOnly) params.unread_only = true;
    const response = await api.get("/api/v1/notifications/", { params });
    return response.data;
  },

  // Get unread count (for bell badge)
  getUnreadCount: async () => {
    const response = await api.get("/api/v1/notifications/unread-count");
    return response.data;
  },

  // Mark single notification as read
  markAsRead: async (notificationId) => {
    const response = await api.post(`/api/v1/notifications/${notificationId}/read`);
    return response.data;
  },

  // Mark all as read
  markAllAsRead: async () => {
    const response = await api.post("/api/v1/notifications/read-all");
    return response.data;
  },

  // Delete notification
  deleteNotification: async (notificationId) => {
    const response = await api.delete(`/api/v1/notifications/${notificationId}`);
    return response.data;
  },

  // Get channel messages (price pump, daily results)
  getChannelMessages: async (page = 1, pageSize = 20, type = null) => {
    const params = { page, page_size: pageSize };
    if (type) params.type = type;
    const response = await api.get("/api/v1/notifications/channel-messages", { params });
    return response.data;
  },

  // Admin: send broadcast
  sendBroadcast: async (title, body, type = "admin_broadcast") => {
    const response = await api.post("/api/v1/notifications/broadcast", { title, body, type });
    return response.data;
  },

  // ── Preferences (Layer 2) ──

  // Get notification preferences (per-type in_app/telegram + telegram_linked flag)
  getPreferences: async () => {
    const response = await api.get("/api/v1/notifications/preferences");
    return response.data;
  },

  // Update one preference. Throws with detail 'LINK_TELEGRAM_REQUIRED'
  // if telegram=true but account not linked.
  updatePreference: async (type, inApp, telegram) => {
    const response = await api.put("/api/v1/notifications/preferences", {
      type,
      in_app: inApp,
      telegram,
    });
    return response.data;
  },
};
