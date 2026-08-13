// src/services/subscriptionApi.js
import api from "./authApi";

const subscriptionApi = {
  // ============ Plans ============

  getPlans: async () => {
    const response = await api.get("/api/v1/subscription/plans");
    return response.data;
  },

  // ============ Subscribe & Pay ============

  createInvoice: async (planId, isUpgrade = false) => {
    const response = await api.post("/api/v1/subscription/subscribe", {
      plan_id: planId,
      is_upgrade: isUpgrade,
    });
    return response.data;
  },

  // The one open, unexpired invoice this customer has — or null. Until this
  // existed an invoice lived only in the router state of the tab that made it,
  // so a reload, a new tab, or a link from a reminder lost it entirely.
  getPendingInvoice: async () => {
    const response = await api.get("/api/v1/subscription/pending");
    return response.data?.invoice || null;
  },

  verifyPayment: async (paymentId, txHash) => {
    const response = await api.post("/api/v1/subscription/verify", {
      payment_id: paymentId,
      tx_hash: txHash,
    });
    return response.data;
  },

  // ============ Status ============

  getMySubscription: async () => {
    const response = await api.get("/api/v1/subscription/me");
    return response.data;
  },

  getPaymentHistory: async () => {
    const response = await api.get("/api/v1/subscription/payments");
    return response.data;
  },

  // ============ Admin ============

  admin: {
    getPlans: async () => {
      const response = await api.get("/api/v1/admin/plans");
      return response.data;
    },

    updatePlan: async (planId, data) => {
      const response = await api.put(`/api/v1/admin/plans/${planId}`, data);
      return response.data;
    },

    getSubscriptions: async (params = {}) => {
      const response = await api.get("/api/v1/admin/subscriptions", { params });
      return response.data;
    },

    getPayments: async (params = {}) => {
      const response = await api.get("/api/v1/admin/payments", { params });
      return response.data;
    },

    activateSubscription: async (userId, planId, notes = "") => {
      const response = await api.post("/api/v1/admin/activate", {
        user_id: userId,
        plan_id: planId,
        notes,
      });
      return response.data;
    },

    getUsers: async (params = {}) => {
      const response = await api.get("/api/v1/admin/users", { params });
      return response.data;
    },

    getStats: async () => {
      const response = await api.get("/api/v1/admin/stats");
      return response.data;
    },
  },
};

export default subscriptionApi;
