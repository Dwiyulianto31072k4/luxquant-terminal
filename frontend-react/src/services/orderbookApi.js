// src/services/orderbookApi.js
import api from "./api";

const orderbookApi = {
  getAnalysis: (symbol) =>
    api.get("/orderbook/analysis", { params: { symbol } }).then((r) => r.data),

  getComparison: () => api.get("/orderbook/comparison").then((r) => r.data),

  getOverview: () => api.get("/orderbook/overview").then((r) => r.data),

  getSymbols: () => api.get("/orderbook/symbols").then((r) => r.data),
};

export default orderbookApi;
