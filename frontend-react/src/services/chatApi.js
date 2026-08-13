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
  getMessages: async (after = 0, limit = 200, before = null) => {
    const params = { after, limit };
    if (before) params.before = before;
    const response = await api.get("/api/v1/chat/messages", {
      params,
    });
    return response.data;
  },

  deleteMessage: async (messageId) => {
    const response = await api.delete(`/api/v1/chat/messages/${messageId}`);
    return response.data;
  },

  // clientMsgId makes the send idempotent — a retry or double-click collapses
  // to the original row server-side.
  sendMessage: async (body, clientMsgId, kind = "text") => {
    const response = await api.post("/api/v1/chat/messages", {
      body,
      kind,
      client_msg_id: clientMsgId,
    });
    return response.data;
  },

  // Upload first, then send the returned URL as a normal message with
  // kind="image". Kept separate so a failed send can be retried without
  // re-uploading the file.
  uploadImage: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const response = await api.post("/api/v1/chat/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
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
