import api from "./authApi";

const BASE = "/api/v1/learning";

export const learningApi = {
  catalog: async () => (await api.get(`${BASE}/catalog`)).data,
  course: async (slug) => (await api.get(`${BASE}/courses/${slug}`)).data,
  lesson: async (idOrSlug) => (await api.get(`${BASE}/lessons/${idOrSlug}`)).data,
  progress: async (lessonId, payload) =>
    (await api.put(`${BASE}/lessons/${lessonId}/progress`, payload)).data,
  notes: async (lessonId) => (await api.get(`${BASE}/lessons/${lessonId}/notes`)).data,
  addNote: async (lessonId, payload) =>
    (await api.post(`${BASE}/lessons/${lessonId}/notes`, payload)).data,

  adminCatalog: async () => (await api.get(`${BASE}/admin/catalog`)).data,
  createCourse: async (payload) => (await api.post(`${BASE}/admin/courses`, payload)).data,
  updateCourse: async (id, payload) => (await api.put(`${BASE}/admin/courses/${id}`, payload)).data,
  createModule: async (payload) => (await api.post(`${BASE}/admin/modules`, payload)).data,
  updateModule: async (id, payload) => (await api.put(`${BASE}/admin/modules/${id}`, payload)).data,
  createLesson: async (payload) => (await api.post(`${BASE}/admin/lessons`, payload)).data,
  updateLesson: async (id, payload) => (await api.put(`${BASE}/admin/lessons/${id}`, payload)).data,
  archive: async (kind, id) => (await api.delete(`${BASE}/admin/${kind}/${id}`)).data,
};

export default learningApi;
