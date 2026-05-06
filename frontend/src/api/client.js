import axios from 'axios';
import { getAccessToken, setAccessToken, clearAccessToken } from './tokenStore';

// B-04: REACT_APP_ → import.meta.env.VITE_ (migración CRA → Vite)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  // M-06: withCredentials=true para que el navegador envíe la HttpOnly cookie
  // del refresh token en las peticiones cross-origin (desarrollo) y same-origin (producción).
  withCredentials: true,
});

const isAuthEndpoint = (url = '') =>
  url.includes('/auth/login/') ||
  url.includes('/auth/login-with-code/') ||
  url.includes('/auth/request-code/') ||
  url.includes('/auth/check-email/') ||
  url.includes('/auth/tenants-for-email/') ||
  url.includes('/auth/token/refresh/') ||
  url.includes('/auth/logout/') ||
  url.includes('/auth/tenants/') ||
  url.includes('/auth/my-tenants/') ||
  url.includes('/auth/switch-tenant/');

// Request interceptor: attach JWT desde memoria (no localStorage)
api.interceptors.request.use((config) => {
  const token = getAccessToken();  // M-06: leer desde tokenStore (memoria)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 → refresh token via HttpOnly cookie
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const url = original?.url || '';

    // No aplicar el flujo de refresh/redirect a endpoints de auth.
    // Si un login falla con 401, debe regresar el error normal al formulario.
    if (isAuthEndpoint(url)) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      // M-06: No leer refresh_token de localStorage — viene desde la HttpOnly cookie.
      // La cookie se envía automáticamente por el navegador (withCredentials: true).
      try {
        const { data } = await axios.post(
          `${API_URL}/auth/token/refresh/`,
          {},
          { withCredentials: true },
        );
        setAccessToken(data.access);  // M-06: guardar en memoria, no localStorage
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch {
        clearAccessToken();
        localStorage.removeItem('user');
        localStorage.removeItem('role');
        localStorage.removeItem('tenant_id');
        localStorage.removeItem('tenant_name');
        localStorage.removeItem('must_change_password');
        localStorage.removeItem('profile_id');
        if (window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ───────────────────────────────────────
export const authAPI = {
  login:               (data)     => api.post('/auth/login/', data),
  requestCode:         (email)    => api.post('/auth/request-code/', { email }),
  loginWithCode:       (data)     => api.post('/auth/login-with-code/', data),
  getTenants:          ()         => api.get('/auth/tenants/'),
  getTenantsForEmail:  (email)    => api.post('/auth/tenants-for-email/', { email }),
  checkEmail:          (email)    => api.get('/auth/check-email/', { params: { email } }),
  getMyTenants:        ()         => api.get('/auth/my-tenants/'),
  switchTenant:        (tenantId) => api.post('/auth/switch-tenant/', { tenant_id: tenantId }),
  // M-06: refresh desde HttpOnly cookie (no body) + logout que borra la cookie
  refreshToken:        ()         => axios.post(
    `${API_URL}/auth/token/refresh/`,
    {},
    { withCredentials: true },
  ),
  logout:              ()         => api.post('/auth/logout/'),
};

// ─── Tenants ────────────────────────────────────
export const tenantsAPI = {
  list: (params) => api.get('/tenants/', { params: { page_size: 1000, ...params } }),
  get: (id) => api.get(`/tenants/${id}/`),
  create: (data) => api.post('/tenants/', data),
  update: (id, data) => api.patch(`/tenants/${id}/`, data),
  delete: (id) => api.delete(`/tenants/${id}/`),
  // Hibernation (superadmin only — replaces hard deletion)
  hibernate: (id, data) => api.post(`/tenants/${id}/hibernate/`, data || {}),
  reactivate: (id) => api.post(`/tenants/${id}/reactivate/`),
  // Subscription info (accessible to tenant members)
  getSubscription: (id) => api.get(`/tenants/${id}/subscription/`),
  // Subscription payment history (accessible to tenant admin and superadmin)
  getSubscriptionPayments: (id) => api.get(`/tenants/${id}/subscription/payments/`),
  // Onboarding tour state
  onboardingComplete: (id) => api.post(`/tenants/${id}/onboarding/complete/`),
  onboardingDismiss: (id) => api.post(`/tenants/${id}/onboarding/dismiss/`),
  onboardingReset: (id) => api.post(`/tenants/${id}/onboarding/reset/`),
};

// ─── Units ──────────────────────────────────────
export const unitsAPI = {
  list: (tenantId, params) => api.get(`/tenants/${tenantId}/units/`, { params }),
  get:  (tenantId, id)     => api.get(`/tenants/${tenantId}/units/${id}/`),
  create: (tenantId, data) => api.post(`/tenants/${tenantId}/units/`, data),
  update: (tenantId, id, data) => api.patch(`/tenants/${tenantId}/units/${id}/`, data),
  delete: (tenantId, id) => api.delete(`/tenants/${tenantId}/units/${id}/`),
  evidence:    (tenantId, id) => api.get(`/tenants/${tenantId}/units/${id}/evidence/`),
  createUser:  (tenantId, id, persona) => api.post(`/tenants/${tenantId}/units/${id}/create-user/`, { persona }),
  updateMyInfo:(tenantId, data) => api.patch(`/tenants/${tenantId}/units/update-my-info/`, data),
  inactivate:  (tenantId, id) => api.post(`/tenants/${tenantId}/units/${id}/inactivate/`),
  activate:    (tenantId, id) => api.post(`/tenants/${tenantId}/units/${id}/activate/`),
};

// ─── Users ──────────────────────────────────────
export const usersAPI = {
  list:          (tenantId, params)       => api.get(`/tenants/${tenantId}/users/`, { params: params || {} }),
  create:        (data)                   => api.post('/users/', data),
  update:        (tenantId, id, data)     => api.patch(`/tenants/${tenantId}/users/${id}/`, data),
  delete:        (tenantId, id)           => api.delete(`/tenants/${tenantId}/users/${id}/`),
  toggleActive:    (tenantId, id)         => api.post(`/tenants/${tenantId}/users/${id}/toggle-active/`),
  sendInvitation:  (tenantId, id)         => api.post(`/tenants/${tenantId}/users/${id}/send-invitation/`),
};

// ─── Payments ───────────────────────────────────
export const paymentsAPI = {
  list: (tenantId, params) => api.get(`/tenants/${tenantId}/payments/`, { params }),
  capture: (tenantId, data) => api.post(`/tenants/${tenantId}/payments/capture/`, data),
  addAdditional: (tenantId, paymentId, data) => api.post(`/tenants/${tenantId}/payments/${paymentId}/add-additional/`, data),
  deleteAdditional: (tenantId, paymentId, additionalId) => api.delete(`/tenants/${tenantId}/payments/${paymentId}/delete-additional/${additionalId}/`),
  updateAdditional: (tenantId, paymentId, additionalId, data) => api.patch(`/tenants/${tenantId}/payments/${paymentId}/update-additional/${additionalId}/`, data),
  clear: (tenantId, id) => api.delete(`/tenants/${tenantId}/payments/${id}/clear/`),
  sendReceipt: (tenantId, paymentId, data) => api.post(`/tenants/${tenantId}/payments/${paymentId}/send-receipt/`, data),
  receiptPDF: (tenantId, paymentId) => api.get(`/tenants/${tenantId}/payments/${paymentId}/receipt-pdf/`, { responseType: 'blob' }),
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
  // Direct reopen (admin only) — deletes the ClosedPeriod record
  directReopen:  (tenantId, id) => api.delete(`/tenants/${tenantId}/closed-periods/${id}/`),
  // Period closure workflow
  closureList:   (tenantId) => api.get(`/tenants/${tenantId}/period-closure-requests/`),
  initiateClosure: (tenantId, data) => api.post(`/tenants/${tenantId}/period-closure-requests/initiate/`, data),
  approveStep:   (tenantId, id, data) => api.post(`/tenants/${tenantId}/period-closure-requests/${id}/approve_step/`, data || {}),
  rejectStep:    (tenantId, id, data) => api.post(`/tenants/${tenantId}/period-closure-requests/${id}/reject_step/`,  data || {}),
};

// ─── Bank Statements ────────────────────────────
export const bankAPI = {
  list:            (tenantId)     => api.get(`/tenants/${tenantId}/bank-statements/`),
  upload:          (tenantId, data) => api.post(`/tenants/${tenantId}/bank-statements/`, data),
  deleteStatement: (tenantId, id) => api.delete(`/tenants/${tenantId}/bank-statements/${id}/`),
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

// ─── Amenity Reservations ────────────────────────
export const reservationsAPI = {
  list:    (tenantId, params)      => api.get(`/tenants/${tenantId}/amenity-reservations/`, { params: params || {} }),
  create:  (tenantId, data)        => api.post(`/tenants/${tenantId}/amenity-reservations/`, data),
  update:  (tenantId, id, data)    => api.patch(`/tenants/${tenantId}/amenity-reservations/${id}/`, data),
  delete:  (tenantId, id)          => api.delete(`/tenants/${tenantId}/amenity-reservations/${id}/`),
  approve: (tenantId, id, reviewerNotes) => api.post(`/tenants/${tenantId}/amenity-reservations/${id}/approve/`, { reviewer_notes: reviewerNotes || '' }),
  reject:  (tenantId, id, reason, reviewerNotes) => api.post(`/tenants/${tenantId}/amenity-reservations/${id}/reject/`, { reason, reviewer_notes: reviewerNotes ?? reason ?? '' }),
  cancel:  (tenantId, id)          => api.post(`/tenants/${tenantId}/amenity-reservations/${id}/cancel/`),
};

// ─── Notifications ───────────────────────────────
export const notificationsAPI = {
  list:        (tenantId, params) => api.get(`/tenants/${tenantId}/notifications/`, { params: params || {} }),
  unreadCount: (tenantId)         => api.get(`/tenants/${tenantId}/notifications/unread-count/`),
  markRead:    (tenantId, id)     => api.post(`/tenants/${tenantId}/notifications/${id}/mark-read/`),
  markAllRead: (tenantId)         => api.post(`/tenants/${tenantId}/notifications/mark-all-read/`),
};

// ─── Audit Logs (super-admin only) ───────────────
export const auditLogsAPI = {
  list:    (params) => api.get('/audit-logs/', { params: params || {} }),
  retrieve:(id)     => api.get(`/audit-logs/${id}/`),
  summary: (params) => api.get('/audit-logs/summary/', { params: params || {} }),
};

// ─── Payment Plans ───────────────────────────────
export const paymentPlansAPI = {
  list:    (tenantId, params) => api.get(`/tenants/${tenantId}/payment-plans/`, { params: params || {} }),
  retrieve:(tenantId, id)     => api.get(`/tenants/${tenantId}/payment-plans/${id}/`),
  create:  (tenantId, data)   => api.post(`/tenants/${tenantId}/payment-plans/`, data),
  update:  (tenantId, id, data) => api.patch(`/tenants/${tenantId}/payment-plans/${id}/`, data),
  destroy: (tenantId, id)     => api.delete(`/tenants/${tenantId}/payment-plans/${id}/`),
  send:            (tenantId, id)     => api.post(`/tenants/${tenantId}/payment-plans/${id}/send/`),
  accept:          (tenantId, id)     => api.post(`/tenants/${tenantId}/payment-plans/${id}/accept/`),
  reject:          (tenantId, id)     => api.post(`/tenants/${tenantId}/payment-plans/${id}/reject/`),
  cancel:          (tenantId, id, data) => api.post(`/tenants/${tenantId}/payment-plans/${id}/cancel/`, data || {}),
  pdf:             (tenantId, id)     => api.get(`/tenants/${tenantId}/payment-plans/${id}/pdf/`, { responseType: 'blob' }),
  createProposal:  (tenantId, data)   => api.post(`/tenants/${tenantId}/payment-plans/create_proposal/`, data),
};

// ─── Subscription Plans (superadmin) ─────────────
export const subscriptionPlansAPI = {
  list:    (params) => api.get('/subscription-plans/', { params: params || {} }),
  get:     (id)     => api.get(`/subscription-plans/${id}/`),
  create:  (data)   => api.post('/subscription-plans/', data),
  update:  (id, data) => api.patch(`/subscription-plans/${id}/`, data),
  destroy: (id)     => api.delete(`/subscription-plans/${id}/`),
};

// ─── Trial Requests (superadmin) ─────────────────
export const trialRequestsAPI = {
  list:    (params) => api.get('/trial-requests/', { params: params || {} }),
  get:     (id)     => api.get(`/trial-requests/${id}/`),
  update:  (id, data) => api.patch(`/trial-requests/${id}/`, data),
  approve: (id, data) => api.post(`/trial-requests/${id}/approve/`, data),
  reject:  (id, data) => api.post(`/trial-requests/${id}/reject/`, data),
};

// ─── Tenant Subscriptions (superadmin) ───────────
export const tenantSubscriptionsAPI = {
  list:          (params) => api.get('/tenant-subscriptions/', { params: params || {} }),
  get:           (id)     => api.get(`/tenant-subscriptions/${id}/`),
  create:        (data)   => api.post('/tenant-subscriptions/', data),
  update:        (id, data) => api.patch(`/tenant-subscriptions/${id}/`, data),
  recordPayment:   (id, data) => api.post(`/tenant-subscriptions/${id}/record-payment/`, data),
  payments:        (id)       => api.get(`/tenant-subscriptions/${id}/payments/`),
  syncStatus:      (id)       => api.post(`/tenant-subscriptions/${id}/sync-status/`),
  // Recalculate amount_per_cycle from plan × units. Accepts optional { units_count }.
  calculateAmount: (id, data) => api.post(`/tenant-subscriptions/${id}/calculate-amount/`, data || {}),
  // Save a history snapshot and mark subscription as cancelled so a new one can be created.
  deactivate:      (id, data) => api.post(`/tenant-subscriptions/${id}/deactivate/`, data || {}),
  // Create trial subscriptions for ALL tenants that don't have one
  initializeAll:   ()         => api.post('/tenant-subscriptions/initialize-all/'),
  // Force-activate a tenant (superadmin manual control). Accepts { reason, extend_billing }
  forceActivate:   (id, data) => api.post(`/tenant-subscriptions/${id}/force-activate/`, data || {}),
  // Force-deactivate (suspend) a tenant. Accepts { reason }
  forceDeactivate: (id, data) => api.post(`/tenant-subscriptions/${id}/force-deactivate/`, data || {}),
  // Run the monthly billing check across all tenants (marks overdue as past_due)
  runBillingCheck: ()         => api.post('/tenant-subscriptions/run-billing-check/'),
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
  reporteAdeudos: (tenantId, params) => api.get(`/tenants/${tenantId}/reporte-adeudos/`, { params }),
  estadoCuentaPDF: (tenantId, cutoff, unitId = null, fromPeriod = null) =>
    api.get(`/tenants/${tenantId}/estado-cuenta-pdf/`, {
      params: { cutoff, ...(unitId ? { unit_id: unitId } : {}), ...(fromPeriod ? { from_period: fromPeriod } : {}) },
      responseType: 'blob',
    }),
  sendUnitStatementEmail: (tenantId, data) => api.post(`/tenants/${tenantId}/send-unit-statement-email/`, data),
  sendGeneralStatementEmail: (tenantId, data) => api.post(`/tenants/${tenantId}/send-statement-email/`, data),
  sendVecinoStatementEmail: (tenantId, data) => api.post(`/tenants/${tenantId}/send-vecino-statement-email/`, data),
};

export default api;
