/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        coral: {
          50: '#FFF5F3', 100: '#FFE8E3', 200: '#FFD0C7', 300: '#FFB0A0',
          400: '#F4846E', 500: '#E85D43', 600: '#D04E37', 700: '#B03D2B',
        },
        teal: {
          50: '#EDFDF7', 100: '#D5F5E8', 200: '#A8EAD0', 300: '#6DD4AD',
          400: '#3CB88A', 500: '#2A9D73', 600: '#1F7D5B', 700: '#175F45',
          800: '#124A36',
        },
        ink: {
          50: '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0', 300: '#CBD5E1',
          400: '#94A3B8', 500: '#64748B', 600: '#475569', 700: '#334155',
          800: '#1E293B', 900: '#0F172A',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
