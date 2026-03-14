# 🏠 Homly — Property Management System

> La administración que tu hogar se merece.

Full-stack property management application rebuilt with modern architecture for exponential growth.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React 18 + Tailwind CSS | Component-based, fast dev cycle |
| **Backend** | Django 5.1 + DRF | Battle-tested, ORM, admin panel |
| **Database** | PostgreSQL 16 | ACID, JSONB, concurrency, scalable |
| **Auth** | JWT (SimpleJWT) | Stateless, multi-tenant ready |
| **Container** | Docker Compose | One-command deployment |

## 🗄️ Why PostgreSQL over SQLite?

| Feature | PostgreSQL ✅ | SQLite ❌ |
|---------|:------------:|:---------:|
| Concurrent writes | MVCC, unlimited | Single writer, locks |
| JSONB fields | Native, indexable | Text only |
| Connection pooling | PgBouncer ready | N/A |
| Horizontal scaling | Citus extension | Not possible |
| Full-text search | Built-in | Limited |
| Table partitioning | Native | Not supported |
| Production ready | Yes | Dev only |

## 🚀 Quick Start (Docker)

```bash
# Clone & start everything
git clone <repo>
cd homly
docker compose up -d

# The system will automatically:
# 1. Start PostgreSQL 16
# 2. Run Django migrations
# 3. Seed demo data
# 4. Start Django on :8000
# 5. Start React on :3000
```

Open **http://localhost:3000** in your browser.

## 🛠️ Manual Setup (Development)

### Prerequisites
- Python 3.12+
- Node.js 20+
- PostgreSQL 16+

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create database
createdb homly_db

# Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# Run migrations
python manage.py migrate

# Seed demo data
python manage.py seed_data

# Start server
python manage.py runserver
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

### Run Tests

```bash
cd backend
python manage.py test core -v 2
```

## 📋 Demo Accounts

| Role | Email | Password | Access |
|------|-------|----------|--------|
| **Super Admin** | admin@homly.app | Super123 | Full system |
| **Admin** | carlos@email.com | Admin123 | Full tenant |
| **Tesorero** | maria@email.com | Teso1234 | Finance ops |
| **Vecino** | ana@email.com | Vecino12 | Own unit |
| **Contador** | pedro@email.com | Conta123 | Read only |
| **Auditor** | laura@email.com | Audit123 | Read only |

## 🏗️ Architecture

```
homly/
├── docker-compose.yml          # Full stack orchestration
├── backend/
│   ├── Dockerfile
│   ├── manage.py
│   ├── requirements.txt
│   ├── homly_project/          # Django project config
│   │   ├── settings.py         # PostgreSQL, JWT, CORS
│   │   ├── urls.py
│   │   └── wsgi.py
│   └── core/                   # Main application
│       ├── models.py           # 15 models, UUID PKs, JSONB
│       ├── serializers.py      # DRF serializers
│       ├── views.py            # ViewSets + custom endpoints
│       ├── permissions.py      # Role-based access control
│       ├── urls.py             # REST API routes
│       ├── admin.py            # Django admin config
│       ├── tests.py            # 34 automated tests
│       └── management/
│           └── commands/
│               └── seed_data.py
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── tailwind.config.js      # Brand colors
    └── src/
        ├── App.jsx             # Router + protected routes
        ├── api/
        │   └── client.js       # Axios + JWT interceptors
        ├── context/
        │   └── AuthContext.jsx  # Auth state management
        ├── pages/
        │   ├── Landing.jsx     # Marketing page
        │   ├── Login.jsx       # Auth with tenant select
        │   ├── Dashboard.jsx   # KPIs + charts
        │   ├── Cobranza.jsx    # Monthly collections
        │   ├── Gastos.jsx      # Expenses + petty cash
        │   ├── EstadoCuenta.jsx
        │   ├── Config.jsx      # Tenant settings
        │   ├── Units.jsx       # CRUD units
        │   ├── Users.jsx       # CRUD users + roles
        │   ├── MyUnit.jsx      # Vecino portal
        │   └── Tenants.jsx     # Super admin
        ├── components/
        │   └── layout/
        │       └── AppLayout.jsx  # Sidebar + header
        ├── utils/
        │   └── helpers.js      # Formatters, logo, constants
        └── styles/
            └── globals.css     # Tailwind + custom styles
```

## 🔌 API Endpoints

### Auth
- `POST /api/auth/login/` — Login with JWT
- `POST /api/auth/request-code/` — Request email verification code
- `POST /api/auth/login-with-code/` — Login with code (passwordless)
- `GET  /api/auth/tenants/` — List tenants for login

### Tenants (Super Admin)
- `GET|POST /api/tenants/`
- `GET|PATCH|DELETE /api/tenants/{id}/`

### Tenant-scoped (requires tenant_id)
- `CRUD /api/tenants/{id}/units/`
- `CRUD /api/tenants/{id}/users/`
- `CRUD /api/tenants/{id}/extra-fields/`
- `CRUD /api/tenants/{id}/payments/`
- `POST /api/tenants/{id}/payments/capture/`
- `CRUD /api/tenants/{id}/gasto-entries/`
- `CRUD /api/tenants/{id}/caja-chica/`
- `CRUD /api/tenants/{id}/bank-statements/`
- `CRUD /api/tenants/{id}/closed-periods/`
- `CRUD /api/tenants/{id}/reopen-requests/`
- `POST /api/tenants/{id}/reopen-requests/{id}/approve/`
- `CRUD /api/tenants/{id}/assembly-positions/`
- `CRUD /api/tenants/{id}/committees/`

### Reports
- `GET /api/tenants/{id}/dashboard/?period=YYYY-MM`
- `GET /api/tenants/{id}/estado-cuenta/?unit_id=X`
- `GET /api/tenants/{id}/reporte-general/?period=YYYY-MM`

## 🔐 Roles & Permissions

| Role | Tenants | Units | Users | Cobranza | Gastos | Config |
|------|:-------:|:-----:|:-----:|:--------:|:------:|:------:|
| Super Admin | ✅ CRUD | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin | Read own | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tesorero | — | Read | — | ✅ | ✅ | — |
| Contador | — | Read | — | Read | Read | — |
| Auditor | — | Read | — | Read | Read | — |
| Vecino | — | Own | — | Own | — | — |

## 📊 Scaling Path

1. **0-100 tenants**: Single PostgreSQL instance
2. **100-1K**: Add read replicas, PgBouncer connection pooling
3. **1K-10K**: Table partitioning on payments (by period)
4. **10K+**: Citus distributed PostgreSQL, horizontal sharding by tenant_id

## Version

**v10.1.0** — Full React + Django + PostgreSQL rewrite

---

Powered by **Spotynet**
