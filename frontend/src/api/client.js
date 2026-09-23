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
// En axios 1.7.x, `headers: { 'Content-Type': undefined }` NO elimina el default
// 'application/json' de la instancia — lo ignora. Para FormData (multipart) hay
// que eliminar Content-Type explícitamente aquí y dejar que axios/browser lo fije
// con el boundary correcto.
api.interceptors.request.use((config) => {
  const token = getAccessToken();  // M-06: leer desde tokenStore (memoria)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
    if (config.headers.common) delete config.headers.common['Content-Type'];
    if (config.headers.post)   delete config.headers.post['Content-Type'];
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
        localStorage.removeItem('workspace_type');
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

// ─── Export api instance for authenticated binary fetches (blobs, images) ──
export { api };

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
  recordSubscriptionPayment: (id, data) => api.post(`/tenants/${id}/subscription/record-payment/`, data),
  // Onboarding tour state
  onboardingComplete: (id) => api.post(`/tenants/${id}/onboarding/complete/`),
  onboardingDismiss: (id) => api.post(`/tenants/${id}/onboarding/dismiss/`),
  onboardingReset: (id) => api.post(`/tenants/${id}/onboarding/reset/`),
  assignAdmin: (id, data) => api.post(`/tenants/${id}/assign-admin/`, data),
  workspaceAdmin: (email) => api.get('/tenants/workspace-admin/', { params: { email } }),
  assignWorkspaces: (data) => api.post('/tenants/assign-workspaces/', data),
};

// ─── Rentas (inmobiliaria) ──────────────────────
export const rentalAPI = {
  dashboard: (tenantId, params) => api.get(`/tenants/${tenantId}/rental-dashboard/`, { params }),
  calendar:  (tenantId, params) => api.get(`/tenants/${tenantId}/rental-calendar/`, { params }),
  rentroll:  (tenantId, params) => api.get(`/tenants/${tenantId}/rental-rentroll/`, { params }),
  rentrollCsv:(tenantId, params) => api.get(`/tenants/${tenantId}/rental-rentroll/`, { params: { ...(params || {}), format: 'csv' }, responseType: 'blob' }),
  properties: {
    list:   (tenantId, params) => api.get(`/tenants/${tenantId}/rental-properties/`, { params }),
    get:    (tenantId, id) => api.get(`/tenants/${tenantId}/rental-properties/${id}/`),
    create: (tenantId, data) => api.post(`/tenants/${tenantId}/rental-properties/`, data),
    update: (tenantId, id, data) => api.patch(`/tenants/${tenantId}/rental-properties/${id}/`, data),
    delete: (tenantId, id) => api.delete(`/tenants/${tenantId}/rental-properties/${id}/`),
  },
  parties: {
    list:   (tenantId, params) => api.get(`/tenants/${tenantId}/rental-parties/`, { params }),
    create: (tenantId, data) => api.post(`/tenants/${tenantId}/rental-parties/`, data),
    update: (tenantId, id, data) => api.patch(`/tenants/${tenantId}/rental-parties/${id}/`, data),
    delete: (tenantId, id) => api.delete(`/tenants/${tenantId}/rental-parties/${id}/`),
  },
  concepts: {
    list:   (tenantId) => api.get(`/tenants/${tenantId}/rental-concepts/`),
    create: (tenantId, data) => api.post(`/tenants/${tenantId}/rental-concepts/`, data),
    update: (tenantId, id, data) => api.patch(`/tenants/${tenantId}/rental-concepts/${id}/`, data),
    delete: (tenantId, id) => api.delete(`/tenants/${tenantId}/rental-concepts/${id}/`),
  },
  contracts: {
    list:     (tenantId, params) => api.get(`/tenants/${tenantId}/rental-contracts/`, { params }),
    get:      (tenantId, id) => api.get(`/tenants/${tenantId}/rental-contracts/${id}/`),
    create:   (tenantId, data) => api.post(`/tenants/${tenantId}/rental-contracts/`, data),
    update:   (tenantId, id, data) => api.patch(`/tenants/${tenantId}/rental-contracts/${id}/`, data),
    activate: (tenantId, id) => api.post(`/tenants/${tenantId}/rental-contracts/${id}/activate/`),
    finish:   (tenantId, id, data) => api.post(`/tenants/${tenantId}/rental-contracts/${id}/finish/`, data || {}),
  },
  charges: {
    list:     (tenantId, params) => api.get(`/tenants/${tenantId}/rental-charges/`, { params }),
    create:   (tenantId, data) => api.post(`/tenants/${tenantId}/rental-charges/`, data),
    generate: (tenantId, period) => api.post(`/tenants/${tenantId}/rental-charges/generate-period/`, { period }),
  },
  payments: {
    list:   (tenantId, params) => api.get(`/tenants/${tenantId}/rental-payments/`, { params }),
    create: (tenantId, data) => api.post(`/tenants/${tenantId}/rental-payments/`, data),
    delete: (tenantId, id) => api.delete(`/tenants/${tenantId}/rental-payments/${id}/`),
  },
    airbnb: {
      connections: {
        list:   (tenantId) => api.get(`/tenants/${tenantId}/airbnb-connections/`, { params: { page_size: 200 } }),
        create: (tenantId, data) => api.post(`/tenants/${tenantId}/airbnb-connections/`, data),
        update: (tenantId, id, data) => api.patch(`/tenants/${tenantId}/airbnb-connections/${id}/`, data),
        remove: (tenantId, id) => api.delete(`/tenants/${tenantId}/airbnb-connections/${id}/`),
        sync:   (tenantId, id) => api.post(`/tenants/${tenantId}/airbnb-connections/${id}/sync/`),
        importListings: (tenantId, id, data) => api.post(`/tenants/${tenantId}/airbnb-connections/${id}/import-listings/`, data),
      },
      listings: {
        list: (tenantId) => api.get(`/tenants/${tenantId}/airbnb-listings/`, { params: { page_size: 500 } }),
        update: (tenantId, id, data) => api.patch(`/tenants/${tenantId}/airbnb-listings/${id}/`, data),
        remove: (tenantId, id) => api.delete(`/tenants/${tenantId}/airbnb-listings/${id}/`),
        sync: (tenantId, id) => api.post(`/tenants/${tenantId}/airbnb-listings/${id}/sync/`),
      },
    },
    leads: {
      list:       (tenantId, params) => api.get(`/tenants/${tenantId}/rental-leads/`, { params: { page_size: 500, ...(params || {}) } }),
      get:        (tenantId, id) => api.get(`/tenants/${tenantId}/rental-leads/${id}/`),
      create:     (tenantId, data) => api.post(`/tenants/${tenantId}/rental-leads/`, data),
      update:     (tenantId, id, data) => api.patch(`/tenants/${tenantId}/rental-leads/${id}/`, data),
      remove:     (tenantId, id) => api.delete(`/tenants/${tenantId}/rental-leads/${id}/`),
      pipeline:   (tenantId) => api.get(`/tenants/${tenantId}/rental-leads/pipeline/`),
      move:       (tenantId, id, data) => api.post(`/tenants/${tenantId}/rental-leads/${id}/move/`, data),
      convert:    (tenantId, id, data) => api.post(`/tenants/${tenantId}/rental-leads/${id}/convert/`, data),
      activities: (tenantId, id) => api.get(`/tenants/${tenantId}/rental-leads/${id}/activities/`),
      addActivity:(tenantId, id, data) => api.post(`/tenants/${tenantId}/rental-leads/${id}/activities/`, data),
    },
  };

// ─── Units ──────────────────────────────────────
export const unitsAPI = {
  list: (tenantId, params) => api.get(`/tenants/${tenantId}/units/`, { params }),
  get:  (tenantId, id)     => api.get(`/tenants/${tenantId}/units/${id}/`),
  create: (tenantId, data) => api.post(`/tenants/${tenantId}/units/`, data),
  update: (tenantId, id, data) => api.patch(`/tenants/${tenantId}/units/${id}/`, data),
  delete: (tenantId, id) => api.delete(`/tenants/${tenantId}/units/${id}/`),
  evidence:       (tenantId, id) => api.get(`/tenants/${tenantId}/units/${id}/evidence/`),
  creditEvidence: (tenantId, id) => api.get(`/tenants/${tenantId}/units/${id}/credit-evidence/`),
  createUser:  (tenantId, id, persona) => api.post(`/tenants/${tenantId}/units/${id}/create-user/`, { persona }),
  updateMyInfo:(tenantId, data) => api.patch(`/tenants/${tenantId}/units/update-my-info/`, data),
  inactivate:  (tenantId, id) => api.post(`/tenants/${tenantId}/units/${id}/inactivate/`),
  activate:    (tenantId, id) => api.post(`/tenants/${tenantId}/units/${id}/activate/`),
  setServicesSuspension: (tenantId, id, active) =>
    api.post(`/tenants/${tenantId}/units/${id}/services-suspension/`, { active }),
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
  get:  (tenantId, id)     => api.get(`/tenants/${tenantId}/payments/${id}/`),
  capture: (tenantId, data) => api.post(`/tenants/${tenantId}/payments/capture/`, data),
  addAdditional: (tenantId, paymentId, data) => api.post(`/tenants/${tenantId}/payments/${paymentId}/add-additional/`, data),
  deleteAdditional: (tenantId, paymentId, additionalId) => api.delete(`/tenants/${tenantId}/payments/${paymentId}/delete-additional/${additionalId}/`),
  updateAdditional: (tenantId, paymentId, additionalId, data) => api.patch(`/tenants/${tenantId}/payments/${paymentId}/update-additional/${additionalId}/`, data),
  clear: (tenantId, id) => api.delete(`/tenants/${tenantId}/payments/${id}/clear/`),
  sendReceipt: (tenantId, paymentId, data) => api.post(`/tenants/${tenantId}/payments/${paymentId}/send-receipt/`, data),
  receiptPDF: (tenantId, paymentId, additionalId) => api.get(
    `/tenants/${tenantId}/payments/${paymentId}/receipt-pdf/`,
    { responseType: 'blob', params: additionalId ? { additional_id: additionalId } : {} },
  ),
};

// ─── Payment Voucher Submissions ────────────────
export const voucherAPI = {
  list:   (tenantId, params) => api.get(`/tenants/${tenantId}/payment-vouchers/`, { params }),
  create: (tenantId, formData) => api.post(`/tenants/${tenantId}/payment-vouchers/`, formData),
  review: (tenantId, id, data) => api.patch(`/tenants/${tenantId}/payment-vouchers/${id}/review/`, data),
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
  list:   (tenantId, params)       => api.get(`/tenants/${tenantId}/gasto-entries/`, { params }),
  get:    (tenantId, id)           => api.get(`/tenants/${tenantId}/gasto-entries/${id}/`),
  create: (tenantId, data)         => api.post(`/tenants/${tenantId}/gasto-entries/`, data),
  update: (tenantId, id, data)     => api.patch(`/tenants/${tenantId}/gasto-entries/${id}/`, data),
  delete: (tenantId, id)           => api.delete(`/tenants/${tenantId}/gasto-entries/${id}/`),
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
  list:   (tenantId, params)       => api.get(`/tenants/${tenantId}/caja-chica/`, { params }),
  get:    (tenantId, id)           => api.get(`/tenants/${tenantId}/caja-chica/${id}/`),
  create: (tenantId, data)         => api.post(`/tenants/${tenantId}/caja-chica/`, data),
  update: (tenantId, id, data)     => api.patch(`/tenants/${tenantId}/caja-chica/${id}/`, data),
  delete: (tenantId, id)           => api.delete(`/tenants/${tenantId}/caja-chica/${id}/`),
};

export const planeacionAPI = {
  context: (tenantId, params) => api.get(`/tenants/${tenantId}/planeacion-context/`, { params }),
  savePlanningFlow: (tenantId, data) => api.post(`/tenants/${tenantId}/condo-budgets/planning-flow/`, data),
  budgets: {
    list:           (tenantId, params) => api.get(`/tenants/${tenantId}/condo-budgets/`, { params }),
    get:            (tenantId, id, params) => api.get(`/tenants/${tenantId}/condo-budgets/${id}/`, { params }),
    seed:           (tenantId, data) => api.post(`/tenants/${tenantId}/condo-budgets/seed/`, data),
    create:         (tenantId, data) => api.post(`/tenants/${tenantId}/condo-budgets/`, data),
    update:         (tenantId, id, data) => api.patch(`/tenants/${tenantId}/condo-budgets/${id}/`, data),
    saveLines:      (tenantId, id, lines) => api.put(`/tenants/${tenantId}/condo-budgets/${id}/lines/`, { lines }),
    clone:          (tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-budgets/${id}/clone/`, data || {}),
    applySeed:      (tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-budgets/${id}/apply-seed/`, data || {}),
    approve:        (tenantId, id) => api.post(`/tenants/${tenantId}/condo-budgets/${id}/approve/`),
    submitApproval: (tenantId, id) => api.post(`/tenants/${tenantId}/condo-budgets/${id}/submit-approval/`),
    approveStep:    (tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-budgets/${id}/approve-step/`, data || {}),
    rejectStep:     (tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-budgets/${id}/reject-step/`, data || {}),
    archive:        (tenantId, id) => api.post(`/tenants/${tenantId}/condo-budgets/${id}/archive/`),
    delete:         (tenantId, id) => api.delete(`/tenants/${tenantId}/condo-budgets/${id}/`),
  },
  projects: {
    list:           (tenantId, params) => api.get(`/tenants/${tenantId}/condo-projects/`, { params }),
    get:            (tenantId, id) => api.get(`/tenants/${tenantId}/condo-projects/${id}/`),
    create:         (tenantId, data) => api.post(`/tenants/${tenantId}/condo-projects/`, data),
    update:         (tenantId, id, data) => api.patch(`/tenants/${tenantId}/condo-projects/${id}/`, data),
    delete:         (tenantId, id) => api.delete(`/tenants/${tenantId}/condo-projects/${id}/`),
    submitApproval: (tenantId, id) => api.post(`/tenants/${tenantId}/condo-projects/${id}/submit-approval/`),
    approveStep:    (tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-projects/${id}/approve-step/`, data || {}),
    rejectStep:     (tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-projects/${id}/reject-step/`, data || {}),
    addCost:        (tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-projects/${id}/costs/`, data),
    deleteCost:     (tenantId, id, costId) => api.delete(`/tenants/${tenantId}/condo-projects/${id}/costs/${costId}/`),
    gastos:         (tenantId, id, params) => api.get(`/tenants/${tenantId}/condo-projects/${id}/import-gastos/`, { params }),
    importGastos:   (tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-projects/${id}/import-gastos/`, data),
    addQuote:       (tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-projects/${id}/quotes/`, data),
    updateQuote:    (tenantId, id, quoteId, data) => api.patch(`/tenants/${tenantId}/condo-projects/${id}/quotes/${quoteId}/`, data),
    deleteQuote:    (tenantId, id, quoteId) => api.delete(`/tenants/${tenantId}/condo-projects/${id}/quotes/${quoteId}/`),
    selectWinner:   (tenantId, id, quoteId) => api.post(`/tenants/${tenantId}/condo-projects/${id}/quotes/${quoteId}/select-winner/`),
    uploadFile:     (tenantId, id, formData) => api.post(`/tenants/${tenantId}/condo-projects/${id}/files/`, formData),
    deleteFile:     (tenantId, id, fileId) => api.delete(`/tenants/${tenantId}/condo-projects/${id}/files/${fileId}/`),
    includeInBudget:(tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-projects/${id}/include-in-budget/`, data),
    unlinkBudget:   (tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-projects/${id}/unlink-budget/`, data || {}),
  },
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
  list: (tenantId, params) => api.get(`/tenants/${tenantId}/bank-statements/`, { params: params || {} }),
  upload: (tenantId, data) => api.post(`/tenants/${tenantId}/bank-statements/`, data),
  deleteStatement: (tenantId, id) => api.delete(`/tenants/${tenantId}/bank-statements/${id}/`),
};

// ─── Assembly ───────────────────────────────────
export const asambleasAPI = {
  context:       (tenantId) => api.get(`/tenants/${tenantId}/asambleas-context/`),
  list:          (tenantId, params) => api.get(`/tenants/${tenantId}/condo-assemblies/`, { params }),
  get:           (tenantId, id) => api.get(`/tenants/${tenantId}/condo-assemblies/${id}/`),
  create:        (tenantId, data) => api.post(`/tenants/${tenantId}/condo-assemblies/`, data),
  update:        (tenantId, id, data) => api.patch(`/tenants/${tenantId}/condo-assemblies/${id}/`, data),
  delete:        (tenantId, id) => api.delete(`/tenants/${tenantId}/condo-assemblies/${id}/`),
  publish:       (tenantId, id) => api.post(`/tenants/${tenantId}/condo-assemblies/${id}/publish-notice/`),
  seedAttendees: (tenantId, id) => api.post(`/tenants/${tenantId}/condo-assemblies/${id}/seed-attendees/`),
  addAttendee:   (tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-assemblies/${id}/attendees/`, data),
  patchAttendee: (tenantId, id, attendeeId, data) => api.patch(`/tenants/${tenantId}/condo-assemblies/${id}/attendees/${attendeeId}/`, data),
  deleteAttendee:(tenantId, id, attendeeId) => api.delete(`/tenants/${tenantId}/condo-assemblies/${id}/attendees/${attendeeId}/`),
  secondCall:    (tenantId, id) => api.post(`/tenants/${tenantId}/condo-assemblies/${id}/second-call/`),
  install:       (tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-assemblies/${id}/install/`, data || {}),
  vote:          (tenantId, id, itemId, data) => api.post(`/tenants/${tenantId}/condo-assemblies/${id}/agenda/${itemId}/vote/`, data),
  addFromPlaneacion: (tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-assemblies/${id}/add-from-planeacion/`, data),
  saveItemNotes: (tenantId, id, itemId, data) => api.post(`/tenants/${tenantId}/condo-assemblies/${id}/agenda/${itemId}/notes/`, data),
  applyItem:     (tenantId, id, itemId) => api.post(`/tenants/${tenantId}/condo-assemblies/${id}/agenda/${itemId}/apply/`),
  printDoc:      (tenantId, id, kind) => api.get(`/tenants/${tenantId}/condo-assemblies/${id}/print-doc/`, { params: { kind }, responseType: 'blob' }),
  saveMinute:    (tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-assemblies/${id}/save-minute/`, data),
  signMinute:    (tenantId, id) => api.post(`/tenants/${tenantId}/condo-assemblies/${id}/sign-minute/`),
  protocolize:   (tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-assemblies/${id}/protocolize/`, data || {}),
  close:         (tenantId, id) => api.post(`/tenants/${tenantId}/condo-assemblies/${id}/close/`),
  cancel:        (tenantId, id, data) => api.post(`/tenants/${tenantId}/condo-assemblies/${id}/cancel/`, data || {}),
  uploadFile:    (tenantId, id, formData) => api.post(`/tenants/${tenantId}/condo-assemblies/${id}/files/`, formData),
  deleteFile:    (tenantId, id, fileId) => api.delete(`/tenants/${tenantId}/condo-assemblies/${id}/files/${fileId}/`),
};

export const mantenimientosAPI = {
  context:       (tenantId, params) => api.get(`/tenants/${tenantId}/mantenimientos-context/`, { params }),
  list:          (tenantId, params) => api.get(`/tenants/${tenantId}/condo-maintenance/`, { params }),
  get:           (tenantId, id) => api.get(`/tenants/${tenantId}/condo-maintenance/${id}/`),
  create:        (tenantId, data) => api.post(`/tenants/${tenantId}/condo-maintenance/`, data),
  update:        (tenantId, id, data) => api.patch(`/tenants/${tenantId}/condo-maintenance/${id}/`, data),
  delete:        (tenantId, id) => api.delete(`/tenants/${tenantId}/condo-maintenance/${id}/`),
  uploadEvidence:(tenantId, id, formData) => api.post(`/tenants/${tenantId}/condo-maintenance/${id}/evidences/`, formData),
  deleteEvidence:(tenantId, id, fileId) => api.delete(`/tenants/${tenantId}/condo-maintenance/${id}/evidences/${fileId}/`),
  printDoc:      (tenantId, id) => api.get(`/tenants/${tenantId}/condo-maintenance/${id}/print-doc/`, { responseType: 'blob' }),
  printReport:   (tenantId, params) => api.get(`/tenants/${tenantId}/condo-maintenance/print-report/`, { params, responseType: 'blob' }),
  gastoOptions:  (tenantId, params) => api.get(`/tenants/${tenantId}/condo-maintenance/gasto-options/`, { params }),
};

export const providersAPI = {
  list:            (tenantId, params) => api.get(`/tenants/${tenantId}/condo-providers/`, { params }),
  options:         (tenantId, params) => api.get(`/tenants/${tenantId}/condo-providers/options/`, { params }),
  get:             (tenantId, id) => api.get(`/tenants/${tenantId}/condo-providers/${id}/`),
  create:          (tenantId, data) => api.post(`/tenants/${tenantId}/condo-providers/`, data),
  update:          (tenantId, id, data) => api.patch(`/tenants/${tenantId}/condo-providers/${id}/`, data),
  delete:          (tenantId, id) => api.delete(`/tenants/${tenantId}/condo-providers/${id}/`),
  uploadDocument:  (tenantId, id, formData) => api.post(`/tenants/${tenantId}/condo-providers/${id}/documents/`, formData),
  deleteDocument:  (tenantId, id, docId) => api.delete(`/tenants/${tenantId}/condo-providers/${id}/documents/${docId}/`),
};

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
  // Enviar nota de cobro de un período por email al admin del tenant
  sendBillingNote: (id, data) => api.post(`/tenant-subscriptions/${id}/send-billing-note/`, data),
};

// ─── Subscription Payments (individual edit/delete) ──
export const subscriptionPaymentsAPI = {
  update: (id, data) => api.patch(`/subscription-payments/${id}/`, data),
  delete: (id)       => api.delete(`/subscription-payments/${id}/`),
};

// ─── System Roles ─────────────────────────────────────
export const systemRolesAPI = {
  list:   (params) => api.get('/system-roles/', { params }),
  get:    (id)     => api.get(`/system-roles/${id}/`),
  create: (data)   => api.post('/system-roles/', data),
  update: (id, d)  => api.patch(`/system-roles/${id}/`, d),
  delete: (id)     => api.delete(`/system-roles/${id}/`),
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
  cartaNoAdeudo: (tenantId, unitId, cutoff) =>
    api.get(`/tenants/${tenantId}/carta-no-adeudo/`, {
      params: { unit_id: unitId, cutoff },
      responseType: 'blob',
    }),
  closingReport: (tenantId, period) =>
    api.get(`/tenants/${tenantId}/closing-report/`, {
      params: { period },
      responseType: 'blob',
      timeout: 120000,
    }),
  sendUnitStatementEmail: (tenantId, data) => api.post(`/tenants/${tenantId}/send-unit-statement-email/`, data),
  sendUnitAnalysisEmail: (tenantId, data) => api.post(`/tenants/${tenantId}/send-unit-analysis-email/`, data),
  sendGeneralStatementEmail: (tenantId, data) => api.post(`/tenants/${tenantId}/send-statement-email/`, data),
  sendResidenteStatementEmail: (tenantId, data) => api.post(`/tenants/${tenantId}/send-residente-statement-email/`, data),
};

// ─── CRM (SuperAdmin only) ──────────────────────
export const crmAPI = {
  // Dashboard aggregate stats
  dashboard: () => api.get('/crm/dashboard/'),

  // Contacts
  contacts: {
    list:   (params) => api.get('/crm/contacts/', { params }),
    get:    (id)     => api.get(`/crm/contacts/${id}/`),
    create: (data)   => api.post('/crm/contacts/', data),
    update: (id, data) => api.patch(`/crm/contacts/${id}/`, data),
    delete: (id)     => api.delete(`/crm/contacts/${id}/`),
    importFromRequests: () => api.post('/crm/contacts/import-from-requests/'),
    updateScore: (id, score) => api.patch(`/crm/contacts/${id}/update-score/`, { lead_score: score }),
  },

  // Opportunities / Pipeline
  opportunities: {
    list:   (params) => api.get('/crm/opportunities/', { params }),
    get:    (id)     => api.get(`/crm/opportunities/${id}/`),
    create: (data)   => api.post('/crm/opportunities/', data),
    update: (id, data) => api.patch(`/crm/opportunities/${id}/`, data),
    delete: (id)     => api.delete(`/crm/opportunities/${id}/`),
    moveStage: (id, stage, lostReason = '') =>
      api.patch(`/crm/opportunities/${id}/move-stage/`, { stage, lost_reason: lostReason }),
  },

  // Activities
  activities: {
    list:     (params) => api.get('/crm/activities/', { params }),
    create:   (data)   => api.post('/crm/activities/', data),
    update:   (id, data) => api.patch(`/crm/activities/${id}/`, data),
    delete:   (id)     => api.delete(`/crm/activities/${id}/`),
    complete: (id, outcome = '') => api.patch(`/crm/activities/${id}/complete/`, { outcome }),
  },

  // Campaigns
  campaigns: {
    list:   (params) => api.get('/crm/campaigns/', { params }),
    get:    (id)     => api.get(`/crm/campaigns/${id}/`),
    create: (data)   => api.post('/crm/campaigns/', data),
    update: (id, data) => api.patch(`/crm/campaigns/${id}/`, data),
    delete: (id)     => api.delete(`/crm/campaigns/${id}/`),
    addRecipients: (id, data) => api.post(`/crm/campaigns/${id}/add-recipients/`, data),
    launch: (id)     => api.post(`/crm/campaigns/${id}/launch/`),
  },

  // Tickets
  tickets: {
    list:   (params) => api.get('/crm/tickets/', { params }),
    get:    (id)     => api.get(`/crm/tickets/${id}/`),
    create: (data)   => api.post('/crm/tickets/', data),
    update: (id, data) => api.patch(`/crm/tickets/${id}/`, data),
    delete: (id)     => api.delete(`/crm/tickets/${id}/`),
    resolve: (id, resolutionNotes) => api.patch(`/crm/tickets/${id}/resolve/`, { resolution_notes: resolutionNotes }),
    assign: (id, assignedTo) => api.patch(`/crm/tickets/${id}/assign/`, { assigned_to: assignedTo }),
  },
};

// ─── Blog ────────────────────────────────────────────────────────────────────
export const blogAPI = {
  list:      (tenantId, params) => api.get(`/tenants/${tenantId}/blog-posts/`, { params }),
  get:       (tenantId, id)     => api.get(`/tenants/${tenantId}/blog-posts/${id}/`),
  create:    (tenantId, data)   => api.post(`/tenants/${tenantId}/blog-posts/`, data),
  update:    (tenantId, id, data) => api.patch(`/tenants/${tenantId}/blog-posts/${id}/`, data),
  destroy:   (tenantId, id)     => api.delete(`/tenants/${tenantId}/blog-posts/${id}/`),
  publish:   (tenantId, id, data) => api.post(`/tenants/${tenantId}/blog-posts/${id}/publish/`, data),
  unpublish: (tenantId, id)     => api.post(`/tenants/${tenantId}/blog-posts/${id}/unpublish/`),
  uploadCover: (tenantId, id, formData) =>
    api.post(`/tenants/${tenantId}/blog-posts/${id}/cover-image/`, formData),
  recordView: (tenantId, id)    => api.post(`/tenants/${tenantId}/blog-posts/${id}/view/`),
  react: (tenantId, id, type)   => api.post(`/tenants/${tenantId}/blog-posts/${id}/react/`, { type }),
  directory: (tenantId)         => api.get(`/tenants/${tenantId}/blog-posts/directory/`),
  comments: {
    list:   (tenantId, postId)            => api.get(`/tenants/${tenantId}/blog-posts/${postId}/comments/`),
    add:    (tenantId, postId, content)   => api.post(`/tenants/${tenantId}/blog-posts/${postId}/comments/add/`, { content }),
    delete: (tenantId, postId, commentId) => api.delete(`/tenants/${tenantId}/blog-posts/${postId}/comments/${commentId}/delete/`),
  },
};

export default api;
