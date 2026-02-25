import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Tenants from './pages/Tenants';
import Cobranza from './pages/Cobranza';
import Gastos from './pages/Gastos';
import EstadoCuenta from './pages/EstadoCuenta';
import Config from './pages/Config';
import Units from './pages/Units';
import Users from './pages/Users';
import MyUnit from './pages/MyUnit';

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
  const { isAuthenticated, loading, mustChangePassword } = useAuth();
  const location = useLocation();

  if (loading) return LOADER;

  if (!isAuthenticated) {
    sessionStorage.setItem('redirect_after_login', location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }
  if (mustChangePassword) return <Navigate to="/change-password" replace />;
  return children;
}

function AppRoutes() {
  const { isAuthenticated, isVecino, isSuperAdmin, loading } = useAuth();

  // Wait for auth to be restored from localStorage before rendering routes.
  // Without this, super admins get flashed to /app/dashboard (no tenantId) on refresh.
  if (loading) return LOADER;

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/app" replace /> : <Login />}
      />
      <Route path="/change-password" element={<ChangePassword />} />

      {/* App — protected */}
      <Route path="/app" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
        <Route
          index
          element={
            <Navigate
              to={isSuperAdmin ? '/app/tenants' : isVecino ? '/app/my-unit' : '/app/dashboard'}
              replace
            />
          }
        />
        <Route path="dashboard" element={<Dashboard />} />
        {isSuperAdmin && <Route path="tenants" element={<Tenants />} />}
        <Route path="cobranza" element={<Cobranza />} />
        <Route path="gastos" element={<Gastos />} />
        <Route path="estado-cuenta" element={<EstadoCuenta />} />
        <Route path="config" element={<Config />} />
        <Route path="units" element={<Units />} />
        <Route path="users" element={<Users />} />
        <Route path="my-unit" element={<MyUnit />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style: { borderRadius: '12px', fontSize: '14px', fontWeight: 600 },
            success: { iconTheme: { primary: '#2A9D73' } },
            error: { iconTheme: { primary: '#E85D43' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
