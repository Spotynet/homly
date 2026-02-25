/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Blancos y cremas (base del diseño)
        cream:  '#FDFBF7',
        sand: {
          50:  '#FAF7F2',
          100: '#F3EDE4',
          200: '#E8DFD1',
          300: '#D4C8B5',
          400: '#B5A48E',
          500: '#9A8A72',
        },
        // Tonos de tinta / tipografía
        ink: {
          300: '#B8B0A5',
          400: '#9E9588',
          500: '#7A7166',
          600: '#5C5347',
          700: '#443D33',
          800: '#2D2720',
          900: '#1A1612',
        },
        // Verde teal — color primario
        teal: {
          50:  '#EFFAF6',
          100: '#D0F0E4',
          200: '#9AE0C7',
          400: '#3BB990',
          500: '#2A9D73',
          600: '#1F7D5B',
          700: '#175F45',
          800: '#124A36',
        },
        // Coral — acción / alertas
        coral: {
          50:  '#FFF5F2',
          100: '#FFE4DC',
          400: '#F2725A',
          500: '#E85D43',
        },
        // Amber — advertencias
        amber: {
          50:  '#FFFBEB',
          100: '#FEF3C7',
          400: '#FBBF24',
          500: '#F59E0B',
        },
        // Azul — información
        blue: {
          50:  '#EFF6FF',
          100: '#DBEAFE',
          400: '#60A5FA',
          500: '#3B82F6',
        },
        // Púrpura — roles especiales
        purple: {
          50:  '#F5F3FF',
          500: '#7C3AED',
        },
      },
      fontFamily: {
        // Fuente cuerpo principal
        sans:    ["'Plus Jakarta Sans'", 'system-ui', 'sans-serif'],
        // Fuente display / titulares
        display: ["'Fraunces'", 'Georgia', 'serif'],
        body:    ["'Plus Jakarta Sans'", 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        xs: '0 1px 2px rgba(26,22,18,0.04)',
        sm: '0 2px 8px rgba(26,22,18,0.06)',
        md: '0 4px 16px rgba(26,22,18,0.08)',
        lg: '0 8px 32px rgba(26,22,18,0.10)',
        xl: '0 16px 48px rgba(26,22,18,0.14)',
      },
      borderRadius: {
        sm:   '8px',
        md:   '12px',
        lg:   '16px',
        xl:   '20px',
        full: '999px',
      },
      // Variables de layout
      width: {
        sidebar: '272px',
      },
      height: {
        header: '68px',
      },
      transitionTimingFunction: {
        homly: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      backgroundImage: {
        'gradient-sidebar-right':
          'linear-gradient(145deg, #124A36, #175F45, #1F7D5B)',
        'gradient-welcome':
          'linear-gradient(135deg, #2A9D73, #1F7D5B)',
        'gradient-ec-detail':
          'linear-gradient(135deg, #2D2720, #443D33)',
      },
    },
  },
  plugins: [],
};
