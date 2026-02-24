# Deploy Homly (Frontend + Backend) on EC2 with PM2

Step-by-step commands to run the Homly React frontend and Django backend on a single EC2 instance using PM2.

---

## Prerequisites

- An **AWS EC2 instance** (Ubuntu 22.04 LTS recommended) with:
  - SSH access (key pair)
  - Security group allowing: **22 (SSH)**, **80 (HTTP)**, **443 (HTTPS)**, **3000 (frontend)**, **8000 (backend)** — or use a reverse proxy and only open 22, 80, 443
- Domain or public IP for the instance

---

## Part 1 — EC2 setup (one-time)

### 1.1 Connect to your EC2 instance

```bash
ssh -i /path/to/your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

Replace `/path/to/your-key.pem` and `YOUR_EC2_PUBLIC_IP` with your key path and instance IP/hostname.

### 1.2 Update the system

```bash
sudo apt update && sudo apt upgrade -y
```

### 1.3 Install Node.js 20.x

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

### 1.4 Install Python 3.12 and venv

```bash
sudo apt install -y python3.12 python3.12-venv python3-pip
python3.12 --version
```

### 1.5 Install PostgreSQL 16

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 1.6 Create PostgreSQL database and user

```bash
sudo -u postgres psql -c "CREATE USER admin WITH PASSWORD '12345678';"
sudo -u postgres psql -c "CREATE DATABASE homly_db OWNER admin;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE homly_db TO admin;"
```

Replace `YOUR_SECURE_PASSWORD` with a strong password.

### 1.7 Install PM2 globally

```bash
sudo npm install -g pm2
pm2 -v
```

---

## Part 2 — Deploy the Homly app

### 2.1 Create app directory and clone (or upload) the project

**Option A — Clone from Git:**

```bash
cd ~
git clone https://github.com/Spotynet/homly.git
cd homly
```

**Option B — Upload from your machine (run on your laptop):**

```bash
scp -i /path/to/your-key.pem -r "/Users/juantorres/Documents/projects/Homly fullstack 10_1/homly" ubuntu@YOUR_EC2_PUBLIC_IP:~/homly
```

Then on EC2:

```bash
cd ~/homly
```

### 2.2 Backend setup

All backend commands must be run from `~/homly/backend`. On Ubuntu use `python3` (not `python`) to create the venv.

```bash
cd ~/homly/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create backend `.env` in the **backend** folder (replace values with your EC2 public IP or domain and DB password):

```bash
nano .env
```

Paste (adjust values). Keep the file in `~/homly/backend/`:

```env
SECRET_KEY=yKJHJDUSHCEKJNCJADLKSADJO
DEBUG=False
ALLOWED_HOSTS=localhost,127.0.0.1,YOUR_EC2_PUBLIC_IP,yourdomain.com
CORS_ORIGINS=http://localhost:3000,http://YOUR_EC2_PUBLIC_IP:3000,http://yourdomain.com
DB_NAME=homly_db
DB_USER=admin
DB_PASSWORD=12345678
DB_HOST=localhost
DB_PORT=5432
```

Save (Ctrl+O, Enter, Ctrl+X). Then run migrations and seed **from the backend directory**:

```bash
cd ~/homly/backend
source venv/bin/activate
# If you see "Dependency on app with no migrations: core", run once:
#   python manage.py makemigrations core
python manage.py migrate
python manage.py seed_data
deactivate
cd ~/homly
```

### 2.3 Frontend setup

Si vas a usar **Nginx** (recomendado, todo en la misma IP), pon la API en ruta relativa:

```bash
cd ~/homly/frontend
echo "REACT_APP_API_URL=/api" > .env
```

Si **no** usas Nginx y accedes por puertos 3000/8000:

```bash
echo "REACT_APP_API_URL=http://YOUR_EC2_PUBLIC_IP:8000/api" > .env
```

Instalar dependencias y construir:

```bash
npm install
npm run build
cd ~/homly
```

---

## Part 3 — Run with PM2

### 3.1 Start both apps with the ecosystem file

From the project root (`~/homly`):

```bash
cd ~/homly
pm2 start ecosystem.config.cjs
```

### 3.2 Check status

```bash
pm2 status
pm2 logs
```

To follow only one app:

```bash
pm2 logs homly-backend
pm2 logs homly-frontend
```

### 3.3 Save process list so PM2 restarts them on reboot

```bash
pm2 save
pm2 startup
```

Run the command that `pm2 startup` prints (it will look like):

```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

### 3.4 Useful PM2 commands

| Command | Description |
|--------|-------------|
| `pm2 status` | List apps and status |
| `pm2 logs` | Stream logs |
| `pm2 restart all` | Restart both apps |
| `pm2 restart homly-backend` | Restart only backend |
| `pm2 stop all` | Stop both |
| `pm2 delete all` | Remove from PM2 (then start again with `pm2 start ecosystem.config.cjs`) |

---

## Part 4 — Nginx: frontend y backend en la IP del EC2 (puerto 80)

Así todo se ve en `http://TU_IP_EC2` sin usar puertos 3000 ni 8000. Solo necesitas abrir el puerto **80** en el security group.

### 4.1 Instalar Nginx

```bash
sudo apt install -y nginx
```

### 4.2 Copiar la configuración del repo

Desde la raíz del proyecto en el EC2:

```bash
cd ~/homly
sudo cp nginx-homly.conf /etc/nginx/sites-available/homly
```

### 4.3 Activar el sitio y quitar el default de Nginx

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/homly /etc/nginx/sites-enabled/
```

### 4.4 Comprobar y recargar Nginx

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 4.5 Frontend con API en la misma IP

El frontend debe llamar al API por la misma IP. Reconstruye el frontend con la URL relativa `/api` (así funciona con la IP actual):

```bash
cd ~/homly/frontend
echo "REACT_APP_API_URL=/api" > .env
npm run build
cd ~/homly
```

Reinicia los procesos de PM2 para que el frontend sirva el build actualizado:

```bash
pm2 restart homly-frontend
```

### 4.6 Abrir en el navegador

- **Todo en uno:** `http://TU_IP_PUBLICA_EC2`

La app (React) se sirve en `/` y el API (Django) en `/api/`. El admin de Django queda en `http://TU_IP_PUBLICA_EC2/admin/`.

### 4.7 Security group

En AWS → EC2 → Security groups → Inbound rules: permite **HTTP (80)** desde `0.0.0.0/0` (o tu IP). No hace falta abrir 3000 ni 8000 si usas Nginx.

---

## Part 5 — Sin Nginx (solo para pruebas)

Si no usas Nginx, puedes acceder directo a los puertos:

- **Frontend:** `http://YOUR_EC2_PUBLIC_IP:3000`
- **Backend API:** `http://YOUR_EC2_PUBLIC_IP:8000/api`

En el security group abre **3000** y **8000**. En el frontend usa `REACT_APP_API_URL=http://YOUR_EC2_PUBLIC_IP:8000/api` y en el backend `.env` pon esa misma URL en `CORS_ORIGINS`.

---

## Quick reference — full command sequence (after EC2 is prepared)

```bash
# On EC2
cd ~/homly/backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Create .env with SECRET_KEY, ALLOWED_HOSTS, CORS_ORIGINS, DB_*
python manage.py migrate && python3 manage.py seed_data
deactivate

cd ~/homly/frontend
echo "REACT_APP_API_URL=/api" > .env
npm install && npm run build

cd ~/homly
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup

# Nginx (todo en http://TU_IP): sudo apt install -y nginx && sudo cp nginx-homly.conf /etc/nginx/sites-available/homly && sudo rm -f /etc/nginx/sites-enabled/default && sudo ln -sf /etc/nginx/sites-available/homly /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
```

---

**Version:** Homly v10.1.0 — React + Django + PostgreSQL
