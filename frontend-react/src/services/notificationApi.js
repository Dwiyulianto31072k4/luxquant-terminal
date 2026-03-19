// src/services/notificationApi.js
import api from './authApi';

export const notificationApi = {
  // Get notifications (paginated)
  getNotifications: async (page = 1, pageSize = 20, type = null, unreadOnly = false) => {
    const params = { page, page_size: pageSize };
    if (type) params.type = type;
    if (unreadOnly) params.unread_only = true;
    const response = await api.get('/api/v1/notifications/', { params });
    return response.data;
  },

  // Get unread count (for bell badge)
  getUnreadCount: async () => {
    const response = await api.get('/api/v1/notifications/unread-count');
    return response.data;
  },

  // Mark single notification as read
  markAsRead: async (notificationId) => {
    const response = await api.post(`/api/v1/notifications/${notificationId}/read`);
    return response.data;
  },

  // Mark all as read
  markAllAsRead: async () => {
    const response = await api.post('/api/v1/notifications/read-all');
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
    const response = await api.get('/api/v1/notifications/channel-messages', { params });
    return response.data;
  },

  // Admin: send broadcast
  sendBroadcast: async (title, body, type = 'admin_broadcast') => {
    const response = await api.post('/api/v1/notifications/broadcast', { title, body, type });
    return response.data;
  },
};