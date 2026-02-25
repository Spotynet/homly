import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 → refresh token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/token/refresh/`, {
            refresh,
          });
          localStorage.setItem('access_token', data.access);
          original.headers.Authorization = `Bearer ${data.access}`;
          return api(original);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ───────────────────────────────────────
export const authAPI = {
  login: (data) => api.post('/auth/login/', data),
  changePassword: (data) => api.post('/auth/change-password/', data),
  getTenants: () => api.get('/auth/tenants/'),
};

// ─── Tenants ────────────────────────────────────
export const tenantsAPI = {
  list: () => api.get('/tenants/'),
  get: (id) => api.get(`/tenants/${id}/`),
  create: (data) => api.post('/tenants/', data),
  update: (id, data) => api.patch(`/tenants/${id}/`, data),
  delete: (id) => api.delete(`/tenants/${id}/`),
};

// ─── Units ──────────────────────────────────────
export const unitsAPI = {
  list: (tenantId, params) => api.get(`/tenants/${tenantId}/units/`, { params }),
  create: (tenantId, data) => api.post(`/tenants/${tenantId}/units/`, data),
  update: (tenantId, id, data) => api.patch(`/tenants/${tenantId}/units/${id}/`, data),
  delete: (tenantId, id) => api.delete(`/tenants/${tenantId}/units/${id}/`),
};

// ─── Users ──────────────────────────────────────
export const usersAPI = {
  list: (tenantId, params) => api.get(`/tenants/${tenantId}/users/`, { params: params || {} }),
  create: (data) => api.post('/users/', data),
  delete: (tenantId, id) => api.delete(`/tenants/${tenantId}/users/${id}/`),
};

// ─── Payments ───────────────────────────────────
export const paymentsAPI = {
  list: (tenantId, params) => api.get(`/tenants/${tenantId}/payments/`, { params }),
  capture: (tenantId, data) => api.post(`/tenants/${tenantId}/payments/capture/`, data),
  addAdditional: (tenantId, paymentId, data) => api.post(`/tenants/${tenantId}/payments/${paymentId}/add-additional/`, data),
  clear: (tenantId, id) => api.delete(`/tenants/${tenantId}/payments/${id}/clear/`),
};

// ─── Extra Fields ───────────────────────────────
export const extraFieldsAPI = {
  list: (tenantId, params) => api.get(`/tenants/${tenantId}/extra-fields/`, { params: params || {} }),
  create: (tenantId, data) => api.post(`/tenants/${tenantId}/extra-fields/`, data),
  update: (tenantId, id, data) => api.patch(`/tenants/${tenantId}/extra-fields/${id}/`, data),
  delete: (tenantId, id) => api.delete(`/tenants/${tenantId}/extra-fields/${id}/`),
};

// ─── Gastos ─────────────────────────────────────
export const gastosAPI = {
  list: (tenantId, params) => api.get(`/tenants/${tenantId}/gasto-entries/`, { params }),
  create: (tenantId, data) => api.post(`/tenants/${tenantId}/gasto-entries/`, data),
  update: (tenantId, id, data) => api.patch(`/tenants/${tenantId}/gasto-entries/${id}/`, data),
  delete: (tenantId, id) => api.delete(`/tenants/${tenantId}/gasto-entries/${id}/`),
};

// ─── Unrecognized Income ────────────────────────
export const unrecognizedIncomeAPI = {
  list: (tenantId, params) => api.get(`/tenants/${tenantId}/unrecognized-income/`, { params }),
  create: (tenantId, data) => api.post(`/tenants/${tenantId}/unrecognized-income/`, data),
  update: (tenantId, id, data) => api.patch(`/tenants/${tenantId}/unrecognized-income/${id}/`, data),
  delete: (tenantId, id) => api.delete(`/tenants/${tenantId}/unrecognized-income/${id}/`),
};

// ─── Caja Chica ─────────────────────────────────
export const cajaChicaAPI = {
  list: (tenantId, params) => api.get(`/tenants/${tenantId}/caja-chica/`, { params }),
  create: (tenantId, data) => api.post(`/tenants/${tenantId}/caja-chica/`, data),
  update: (tenantId, id, data) => api.patch(`/tenants/${tenantId}/caja-chica/${id}/`, data),
  delete: (tenantId, id) => api.delete(`/tenants/${tenantId}/caja-chica/${id}/`),
};

// ─── Periods ────────────────────────────────────
export const periodsAPI = {
  closedList: (tenantId) => api.get(`/tenants/${tenantId}/closed-periods/`),
  closePeriod: (tenantId, data) => api.post(`/tenants/${tenantId}/closed-periods/`, data),
  reopenRequests: (tenantId) => api.get(`/tenants/${tenantId}/reopen-requests/`),
  requestReopen: (tenantId, data) => api.post(`/tenants/${tenantId}/reopen-requests/`, data),
  approveReopen: (tenantId, id) => api.post(`/tenants/${tenantId}/reopen-requests/${id}/approve/`),
  rejectReopen: (tenantId, id) => api.post(`/tenants/${tenantId}/reopen-requests/${id}/reject/`),
};

// ─── Bank Statements ────────────────────────────
export const bankAPI = {
  list: (tenantId) => api.get(`/tenants/${tenantId}/bank-statements/`),
  upload: (tenantId, data) => api.post(`/tenants/${tenantId}/bank-statements/`, data),
};

// ─── Assembly ───────────────────────────────────
export const assemblyAPI = {
  positions: (tenantId) => api.get(`/tenants/${tenantId}/assembly-positions/`),
  createPosition: (tenantId, data) => api.post(`/tenants/${tenantId}/assembly-positions/`, data),
  updatePosition: (tenantId, id, data) => api.patch(`/tenants/${tenantId}/assembly-positions/${id}/`, data),
  deletePosition: (tenantId, id) => api.delete(`/tenants/${tenantId}/assembly-positions/${id}/`),
  committees: (tenantId) => api.get(`/tenants/${tenantId}/committees/`),
  createCommittee: (tenantId, data) => api.post(`/tenants/${tenantId}/committees/`, data),
  updateCommittee: (tenantId, id, data) => api.patch(`/tenants/${tenantId}/committees/${id}/`, data),
  deleteCommittee: (tenantId, id) => api.delete(`/tenants/${tenantId}/committees/${id}/`),
};

// ─── Super Admins ────────────────────────────────
export const superAdminAPI = {
  list: () => api.get('/super-admins/'),
  create: (data) => api.post('/super-admins/', data),
  delete: (id) => api.delete(`/super-admins/${id}/`),
};

// ─── Dashboard & Reports ────────────────────────
export const reportsAPI = {
  dashboard: (tenantId, period) => api.get(`/tenants/${tenantId}/dashboard/`, { params: { period } }),
  estadoCuenta: (tenantId, params) => api.get(`/tenants/${tenantId}/estado-cuenta/`, { params }),
  reporteGeneral: (tenantId, period) => api.get(`/tenants/${tenantId}/reporte-general/`, { params: { period } }),
};

export default api;
