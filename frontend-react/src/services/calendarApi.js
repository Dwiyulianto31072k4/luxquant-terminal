// src/services/calendarApi.js
import api from './api';

const calendarApi = {
  getEvents: async (params = {}) => {
    const response = await api.get('/calendar/events', { params });
    return response.data;
  },

  getUpcoming: async (limit = 5) => {
    const response = await api.get('/calendar/upcoming', { params: { limit } });
    return response.data;
  },
};

export default calendarApi;