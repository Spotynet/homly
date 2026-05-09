import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { queryClient } from './lib/queryClient';
import { GuideProvider } from './context/GuideContext';
import { ROLE_BASE_MODULES } from './constants/modulePermissions';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Tenants from './pages/Tenants';
import Cobranza from './pages/Cobranza';
import Gastos from './pages/Gastos';
import CajaChica from './pages/CajaChica';
import EstadoCuenta from './pages/EstadoCuenta';
import Config from './pages/Config';
import Units from './pages/Units';
import Users from './pages/Users';
import MyUnit from './pages/MyUnit';
import Reservas from './pages/Reservas';
import Notificaciones from './pages/Notificaciones';
import CierrePeriodo from './pages/CierrePeriodo';
import Logs from './pages/Logs';
import Suscripciones from './pages/Suscripciones';
import CRM from './pages/CRM';
import SystemUsers from './pages/SystemUsers';
import Registro from './pages/Registro';
import PlanPagos from './pages/PlanPagos';
import Onboarding from './pages/Onboarding';
import MiMembresia from './pages/MiMembresia';

const LOADER = (
  <div className="flex items-center justify-center h-screen bg-white">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm font-semibold text-slate-400">Cargando...</span>
    </div>
  </div>
);

// Protected route — saves intended path before redirecting to /login
function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return LOADER;

  if (!isAuthenticated) {
    sessionStorage.setItem('redirect_after_login', location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }
  return children;
}

// Role-based route guard — redirects to /app (index) if the current role
// does not include the given module in ROLE_BASE_MODULES.
// superadmin bypasses all checks. Loading state defers the check.
function RoleRoute({ module: moduleKey, children }) {
  const { role, isSuperAdmin, loading } = useAuth();

  if (loading) return LOADER;

  // Superadmin has unrestricted access
  if (isSuperAdmin) return children;

  const allowedModules = ROLE_BASE_MODULES[role] || [];
  if (!allowedModules.includes(moduleKey)) {
    return <Navigate to="/app" replace />;
  }

  return children;
}

function AppRoutes() {
  const { isAuthenticated, isVecino, isSuperAdmin, systemRole, loading } = useAuth();

  // Wait for auth to be restored from localStorage before rendering routes.
  // Without this, super admins get flashed to /app/dashboard (no tenantId) on refresh.
  if (loading) return LOADER;

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/registro" element={<Registro />} />
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/app" replace /> : <Login />}
      />
      {/* App — protected */}
      <Route path="/app" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
        <Route
          index
          element={
            <Navigate
              to={
                isSuperAdmin ? '/app/sistema/tenants'
                : isVecino   ? '/app/my-unit'
                :              '/app/dashboard'
              }
              replace
            />
          }
        />
        <Route path="dashboard"      element={<RoleRoute module="dashboard">     <Dashboard />     </RoleRoute>} />
        {isSuperAdmin && (
          <Route path="sistema">
            <Route path="tenants"       element={<Tenants />} />
            <Route path="logs"          element={<Logs />} />
            <Route path="suscripciones" element={<Suscripciones />} />
            <Route path="crm"           element={<CRM />} />
            <Route path="usuarios"      element={<SystemUsers currentUserRole={systemRole} />} />
          </Route>
        )}
        <Route path="cobranza"      element={<RoleRoute module="cobranza">      <Cobranza />      </RoleRoute>} />
        <Route path="gastos"        element={<RoleRoute module="gastos">        <Gastos />        </RoleRoute>} />
        <Route path="caja-chica"    element={<RoleRoute module="caja_chica">    <CajaChica />     </RoleRoute>} />
        <Route path="estado-cuenta" element={<RoleRoute module="estado_cuenta"> <EstadoCuenta />  </RoleRoute>} />
        <Route path="config"        element={<RoleRoute module="config">        <Config />        </RoleRoute>} />
        <Route path="units"         element={<RoleRoute module="config">        <Units />         </RoleRoute>} />
        <Route path="users"         element={<RoleRoute module="config">        <Users />         </RoleRoute>} />
        <Route path="my-unit"       element={<RoleRoute module="my_unit">       <MyUnit />        </RoleRoute>} />
        <Route path="reservas"      element={<RoleRoute module="reservas">      <Reservas />      </RoleRoute>} />
        <Route path="notificaciones" element={<RoleRoute module="notificaciones"><Notificaciones /></RoleRoute>} />
        <Route path="cierre-periodo" element={<RoleRoute module="cierre_periodo"><CierrePeriodo /> </RoleRoute>} />
        <Route path="plan-pagos"    element={<RoleRoute module="plan_pagos">    <PlanPagos />     </RoleRoute>} />
        <Route path="onboarding"    element={<RoleRoute module="onboarding">    <Onboarding />    </RoleRoute>} />
        <Route path="mi-membresia"  element={<RoleRoute module="mi_membresia">  <MiMembresia />   </RoleRoute>} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <GuideProvider>
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              style: { borderRadius: '12px', fontSize: '14px', fontWeight: 600 },
              success: { iconTheme: { primary: '#2A9D73' } },
              error: { iconTheme: { primary: '#E85D43' } },
            }}
          />
        </GuideProvider>
      </AuthProvider>
    </BrowserRouter>
    </QueryClientProvider>
  );
}
