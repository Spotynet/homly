/**
 * PM2 ecosystem config for Homly (frontend + backend) on EC2.
 * Usage: pm2 start ecosystem.config.cjs
 *
 * Prerequisites:
 * - Backend: venv created, deps installed, migrations run, .env set.
 * - Frontend: npm install, npm run build, REACT_APP_API_URL points to backend.
 */
module.exports = {
  apps: [
    {
      name: 'homly-backend',
      cwd: './backend',
      script: './venv/bin/gunicorn',
      args: 'homly_project.wsgi:application --bind 0.0.0.0:8000 --workers 2 --timeout 120',
      interpreter: 'none',
      env: { DJANGO_SETTINGS_MODULE: 'homly_project.settings' },
      autorestart: true,
      watch: false,
    },
    {
      name: 'homly-frontend',
      cwd: './frontend',
      script: 'npx',
      args: 'serve -s build -l 3000',
      interpreter: 'none',
      autorestart: true,
      watch: false,
    },
  ],
};
