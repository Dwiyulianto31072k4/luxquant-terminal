// src/services/delistingApi.js
import api from './api';

const delistingApi = {
  // { events:[{exchange,title,url,announced_at,delist_at,symbols:[{symbol,price_at_announce,current_price,pct}],best_move_pct}], exchanges:[], count }
  list: async (params = {}) => {
    const res = await api.get('/delistings', { params });
    return res.data;
  },
};

export default delistingApi;
