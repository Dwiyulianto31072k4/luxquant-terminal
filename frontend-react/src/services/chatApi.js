// src/services/chatApi.js
// Mirrors adminApi.js pattern — uses the shared axios instance from ./authApi.
import api from "./authApi";

export const chatApi = {
  // One round trip on open: thread, tail, and the copy the panel needs.
  getConversation: async () => {
    const response = await api.get("/api/v1/chat/conversation");
    return response.data;
  },

  // `after` is a per-conversation seq, never a row id.
  getMessages: async (after = 0, limit = 200) => {
    const response = await api.get("/api/v1/chat/messages", {
      params: { after, limit },
    });
    return response.data;
  },

  // clientMsgId makes the send idempotent — a retry or double-click collapses
  // to the original row server-side.
  sendMessage: async (body, clientMsgId) => {
    const response = await api.post("/api/v1/chat/messages", {
      body,
      client_msg_id: clientMsgId,
    });
    return response.data;
  },

  markRead: async (seq) => {
    const response = await api.post("/api/v1/chat/read", { seq });
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await api.get("/api/v1/chat/unread-count");
    return response.data;
  },
};

export default chatApi;
