// src/services/orderbookApi.js
import api from "./api";

const orderbookApi = {
  getAnalysis: (symbol = "BTCUSDT") =>
    api.get("/orderbook/analysis", { params: { symbol } }).then((r) => r.data),

  getComparison: () =>
    api.get("/orderbook/comparison").then((r) => r.data),
};

export default orderbookApi;