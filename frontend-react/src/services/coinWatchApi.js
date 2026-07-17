// src/services/coinWatchApi.js
// Mirror konvensi notificationApi.js / watchlistApi — pakai instance `api` dari authApi.
import api from "./authApi";

export const coinWatchApi = {
  // List koin yang di-watch + status WAITING/CALLED + counts
  getCoinWatch: async () => {
    const response = await api.get("/api/v1/coin-watch/");
    return response.data;
  },
  // Tambah koin (backend yang normalisasi ke <COIN>USDT)
  addCoin: async (symbol) => {
    const response = await api.post("/api/v1/coin-watch/", { symbol });
    return response.data;
  },
  // Hapus koin
  removeCoin: async (symbol) => {
    const response = await api.delete(`/api/v1/coin-watch/${symbol}`);
    return response.data;
  },
  // Cek satu koin lagi di-watch atau ga
  checkCoin: async (symbol) => {
    const response = await api.get(`/api/v1/coin-watch/check/${symbol}`);
    return response.data;
  },
  // List symbol buat lookup cepat
  getSymbols: async () => {
    const response = await api.get("/api/v1/coin-watch/symbols");
    return response.data;
  },
};
