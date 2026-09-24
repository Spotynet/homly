import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { queryClient } from './lib/queryClient';
import { GuideProvider } from './context/GuideContext';
import { ROLE_BASE_MODULES, RENTAL_ROLE_BASE_MODULES, isCondoModuleAssignable } from './constants/modulePermissions';
import RentalDashboard from './pages/rentas/RentalDashboard';
import RentalProperties from './pages/rentas/RentalProperties';
import RentalContracts from './pages/rentas/RentalContracts';
import RentalCobranza from './pages/rentas/RentalCobranza';
import RentalCalendar from './pages/rentas/RentalCalendar';
import RentalConfig from './pages/rentas/RentalConfig';
import RentalCRM from './pages/rentas/RentalCRM';
import RentalRentRoll from './pages/rentas/RentalRentRoll';

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
import Blog from './pages/Blog';
import EnviarPago from './pages/EnviarPago';
import Planeacion from './pages/Planeacion';
import Asambleas from './pages/Asambleas';
import Mantenimientos from './pages/Mantenimientos';
import Paqueteria from './pages/Paqueteria';

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
// cannot receive the given module. Custom profiles are standalone (nav +
// profile modules decide visibility). Superadmin bypasses all checks.
function RoleRoute({ module: moduleKey, workspace, children }) {
  const { role, isSuperAdmin, loading, workspaceType } = useAuth();

  if (loading) return LOADER;

  if (workspace === 'rentas' && workspaceType && workspaceType !== 'rentas') {
    return <Navigate to="/app/dashboard" replace />;
  }
  if (workspace === 'condominio' && workspaceType === 'rentas') {
    return <Navigate to="/app/rentas/dashboard" replace />;
  }

  // Superadmin has unrestricted access
  if (isSuperAdmin) return children;

  // Custom profiles do not inherit a predefined role; the profile module list
  // in AppLayout is the visibility source of truth.
  if (role === 'custom') return children;

  const isRental = workspace === 'rentas' || (!workspace && workspaceType === 'rentas');
  if (isRental) {
    const allowedModules = RENTAL_ROLE_BASE_MODULES[role] || [];
    if (!allowedModules.includes(moduleKey)) {
      return <Navigate to="/app" replace />;
    }
    return children;
  }

  const base = ROLE_BASE_MODULES[role] || [];
  if (base.includes(moduleKey) || isCondoModuleAssignable(role, moduleKey)) {
    return children;
  }

  return <Navigate to="/app" replace />;
}

function AppRoutes() {
  const { isAuthenticated, isResidente, isSuperAdmin, systemRole, loading, workspaceType } = useAuth();

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
                : isResidente   ? '/app/my-unit'
                : workspaceType === 'rentas' ? '/app/rentas/dashboard'
                :              '/app/dashboard'
              }
              replace
            />
          }
        />
        <Route path="dashboard"      element={<RoleRoute module="dashboard" workspace="condominio"><Dashboard /></RoleRoute>} />
        <Route path="rentas/dashboard"     element={<RoleRoute module="rentas_dashboard" workspace="rentas"><RentalDashboard /></RoleRoute>} />
        <Route path="rentas/propiedades"   element={<RoleRoute module="rentas_propiedades" workspace="rentas"><RentalProperties /></RoleRoute>} />
        <Route path="rentas/crm"           element={<RoleRoute module="rentas_crm" workspace="rentas"><RentalCRM /></RoleRoute>} />
        <Route path="rentas/contratos"     element={<RoleRoute module="rentas_contratos" workspace="rentas"><RentalContracts /></RoleRoute>} />
        <Route path="rentas/cobranza"      element={<RoleRoute module="rentas_cobranza" workspace="rentas"><RentalCobranza /></RoleRoute>} />
        <Route path="rentas/rentroll"      element={<RoleRoute module="rentas_rentroll" workspace="rentas"><RentalRentRoll /></RoleRoute>} />
        <Route path="rentas/calendario"    element={<RoleRoute module="rentas_calendario" workspace="rentas"><RentalCalendar /></RoleRoute>} />
        <Route path="rentas/config"        element={<RoleRoute module="rentas_config" workspace="rentas"><RentalConfig /></RoleRoute>} />
        {isSuperAdmin && (
          <Route path="sistema">
            <Route path="tenants"       element={<Tenants />} />
            <Route path="logs"          element={<Logs />} />
            <Route path="suscripciones" element={<Suscripciones />} />
            <Route path="crm"           element={<CRM />} />
            <Route path="usuarios"      element={<SystemUsers currentUserRole={systemRole} />} />
          </Route>
        )}
        <Route path="cobranza"      element={<RoleRoute module="cobranza" workspace="condominio"><Cobranza /></RoleRoute>} />
        <Route path="gastos"        element={<RoleRoute module="gastos" workspace="condominio"><Gastos /></RoleRoute>} />
        <Route path="caja-chica"    element={<RoleRoute module="caja_chica" workspace="condominio"><CajaChica /></RoleRoute>} />
        <Route path="estado-cuenta" element={<RoleRoute module="estado_cuenta" workspace="condominio"><EstadoCuenta /></RoleRoute>} />
        <Route path="config"        element={<RoleRoute module="config" workspace="condominio"><Config /></RoleRoute>} />
        <Route path="units"         element={<RoleRoute module="config" workspace="condominio"><Units /></RoleRoute>} />
        <Route path="users"         element={<RoleRoute module="config" workspace="condominio"><Users /></RoleRoute>} />
        <Route path="my-unit"       element={<RoleRoute module="my_unit" workspace="condominio"><MyUnit /></RoleRoute>} />
        <Route path="reservas"      element={<RoleRoute module="reservas" workspace="condominio"><Reservas /></RoleRoute>} />
        <Route path="notificaciones" element={<RoleRoute module="notificaciones"><Notificaciones /></RoleRoute>} />
        <Route path="cierre-periodo" element={<RoleRoute module="cierre_periodo" workspace="condominio"><CierrePeriodo /></RoleRoute>} />
        <Route path="planeacion"    element={<RoleRoute module="planeacion" workspace="condominio"><Planeacion /></RoleRoute>} />
        <Route path="asambleas"     element={<RoleRoute module="asambleas" workspace="condominio"><Asambleas /></RoleRoute>} />
        <Route path="mantenimientos" element={<RoleRoute module="mantenimientos" workspace="condominio"><Mantenimientos /></RoleRoute>} />
        <Route path="paqueteria" element={<RoleRoute module="paqueteria" workspace="condominio"><Paqueteria /></RoleRoute>} />
        <Route path="plan-pagos"    element={<RoleRoute module="plan_pagos" workspace="condominio"><PlanPagos /></RoleRoute>} />
        <Route path="onboarding"    element={<RoleRoute module="onboarding" workspace="condominio"><Onboarding /></RoleRoute>} />
        <Route path="mi-membresia"  element={<RoleRoute module="mi_membresia"><MiMembresia /></RoleRoute>} />
        <Route path="blog"          element={<RoleRoute module="blog" workspace="condominio"><Blog /></RoleRoute>} />
        <Route path="enviar-pago"   element={<RoleRoute module="enviar_pago" workspace="condominio"><EnviarPago /></RoleRoute>} />
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
