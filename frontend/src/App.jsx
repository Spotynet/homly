import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

// Protected route wrapper
function PrivateRoute({ children }) {
  const { isAuthenticated, loading, mustChangePassword } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">Cargando...</div>;
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (mustChangePassword) return <Navigate to="/change-password" />;
  return children;
}

function AppRoutes() {
  const { isAuthenticated, isVecino, isSuperAdmin } = useAuth();

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={isAuthenticated ? <Navigate to="/app" /> : <Login />} />
      <Route path="/change-password" element={<ChangePassword />} />

      {/* App — protected */}
      <Route path="/app" element={
        <PrivateRoute><AppLayout /></PrivateRoute>
      }>
        <Route index element={
          <Navigate to={isVecino ? '/app/my-unit' : '/app/dashboard'} />
        } />
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
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-right" toastOptions={{
          style: { borderRadius: '12px', fontSize: '14px', fontWeight: 600 },
          success: { iconTheme: { primary: '#2A9D73' } },
          error: { iconTheme: { primary: '#E85D43' } },
        }} />
      </AuthProvider>
    </BrowserRouter>
  );
}
