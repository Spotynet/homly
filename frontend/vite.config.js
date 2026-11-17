import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// B-04: Migración de Create React App (react-scripts 5.0.1) a Vite
// Razones: CRA está archivado (sin mantenimiento desde 2023), Vite ofrece
// builds 10-20x más rápidos y recibe actualizaciones de seguridad activas.
//
// Referencia de variables de entorno:
//   CRA:  process.env.REACT_APP_API_URL
//   Vite: import.meta.env.VITE_API_URL
// El archivo .env en la raíz del frontend sigue funcionando igual.

export default defineConfig({
  plugins: [react()],

  // Proxy de desarrollo: redirige /api/* al backend Django
  // Equivalente al campo "proxy": "http://localhost:8000" de CRA en package.json
  server: {
    port: 3003,
    // Docker Compose + shared EC2 hostname; keep localhost for host-side Vite.
    allowedHosts: [
      'homly-dev.spotynet.com',
      'homly.com.mx',
      'www.homly.com.mx',
      'localhost',
      '127.0.0.1',
    ],
    proxy: {
      '/api': {
        // In Docker: VITE_API_PROXY=http://127.0.0.1:3004 (set by ./dev.sh / compose).
        // On host PM2: falls back to local Django.
        target: process.env.VITE_API_PROXY || 'http://127.0.0.1:3004',
        changeOrigin: true,
        // M-06: Reenviar cookies al backend en desarrollo
        cookieDomainRewrite: 'localhost',
      },
    },
  },

  // Resuelve rutas relativas para que coincidan con CRA (@/ no disponible por defecto)
  resolve: {
    alias: {
      // src: '/src',  // descomenta si quieres usar @/components/...
    },
  },

  build: {
    outDir: 'build',          // Mantener 'build/' igual que CRA (para no cambiar deploy.sh)
    sourcemap: false,          // Deshabilitar en producción (GENERATE_SOURCEMAP=false en CRA)
    rollupOptions: {
      output: {
        // Separar dependencias grandes en chunks separados
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
});
