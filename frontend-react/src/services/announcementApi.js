// src/services/announcementApi.js
// Admin CRUD + image upload for announcement modals.
import api from './authApi';

export const announcementApi = {
 list: async () => {
 const res = await api.get('/api/v1/admin/announcements');
 return res.data;
 },

 create: async (payload) => {
 const res = await api.post('/api/v1/admin/announcements', payload);
 return res.data;
 },

 update: async (id, payload) => {
 const res = await api.put(`/api/v1/admin/announcements/${id}`, payload);
 return res.data;
 },

 remove: async (id) => {
 const res = await api.delete(`/api/v1/admin/announcements/${id}`);
 return res.data;
 },

 uploadImage: async (file) => {
 const form = new FormData();
 form.append('file', file);
 const res = await api.post('/api/v1/admin/announcements/upload-image', form, {
 headers: { 'Content-Type': 'multipart/form-data' },
 });
 return res.data; // { ok, image_url }
 },
};
