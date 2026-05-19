import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? `http://${window.location.hostname}:8000` : '');

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('td_token');
  if (token) {
    config.headers['X-Token'] = token;
  }
  const portalToken = localStorage.getItem('td_portal_token');
  if (portalToken) {
    config.headers['X-Portal-Token'] = portalToken;
  }
  return config;
});

export default api;

export const authStart = (data) => api.post('/api/auth/start', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const authCode = (data) => api.post('/api/auth/code', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const authPassword = (data) => api.post('/api/auth/password', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const authMe = () => api.get('/api/auth/me');

export const portalLogin = (data) => api.post('/api/portal/login', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const portalMe = () => api.get('/api/portal/me');
export const getPortalUsers = () => api.get('/api/portal/users');
export const createPortalUser = (data) => api.post('/api/portal/users', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const updatePortalUser = (id, data) => api.put(`/api/portal/users/${id}`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deletePortalUser = (id) => api.delete(`/api/portal/users/${id}`);

export const getFolders = (parentId) => api.get('/api/folders', { params: { parent_id: parentId } });
export const getAllFolders = () => api.get('/api/folders/all');
export const createFolder = (data) => api.post('/api/folders', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteFolder = (id) => api.delete(`/api/folders/${id}`);

export const getFiles = (folderId) => api.get('/api/files', { params: { folder_id: folderId } });
export const uploadFile = (data, onProgress) => api.post('/api/files/upload', data, {
  headers: { 'Content-Type': 'multipart/form-data' },
  onUploadProgress: onProgress,
});
export const getUploadProgress = (uploadId) => api.get(`/api/upload-progress/${uploadId}`);
export const deleteFile = (id) => api.delete(`/api/files/${id}`);
export const moveFile = (id, data) => api.put(`/api/files/${id}/move`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const downloadFileUrl = (id) => `${API_URL}/api/files/${id}/download?token=${localStorage.getItem('td_token')}`;
export const createShareLink = (id) => api.post(`/api/files/${id}/share`);
export const publicShareUrl = (path) => `${API_URL}${path}`;

export const portalGetFolders = (parentId) => api.get('/api/portal/folders', { params: { parent_id: parentId } });
export const portalCreateFolder = (data) => api.post('/api/portal/folders', data, { headers: { 'Content-Type': 'multipart/form-data' } });
export const portalGetFiles = (folderId) => api.get('/api/portal/files', { params: { folder_id: folderId } });
export const portalCreateShareLink = (id) => api.post(`/api/portal/files/${id}/share`);
export const portalUploadFile = (data, onProgress) => api.post('/api/portal/files/upload', data, {
  headers: { 'Content-Type': 'multipart/form-data' },
  onUploadProgress: onProgress,
});
export const portalGetUploadProgress = (uploadId) => api.get(`/api/portal/upload-progress/${uploadId}`);
export const portalDownloadFileUrl = (id) => `${API_URL}/api/portal/files/${id}/download?token=${localStorage.getItem('td_portal_token')}`;
