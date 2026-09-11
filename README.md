# Homly — Administración de condominios y gestión de rentas

> La administración que tu hogar se merece.

Plataforma multi-tenant: **Homly Condominios** y **Homly Rentas** son espacios de trabajo independientes. Un mismo administrador puede tener ambos, con planes, cobros e inventario separados.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React 18 + Vite + Tailwind CSS | Component-based, fast dev cycle |
| **Backend** | Django 5.1 + DRF | Battle-tested, ORM, admin panel |
| **Database** | PostgreSQL 16 | ACID, JSONB, concurrency, scalable |
| **Auth** | JWT (SimpleJWT) + cookie refresh | Stateless, multi-tenant ready |
| **Process** | PM2 (`homly-dev` :3003, `homly-api-dev` :3004) | Dev and EC2 process manager |

## Producto: dos espacios

| Espacio | `Tenant.workspace_type` | Para qué |
|---------|-------------------------|----------|
| Condominio | `condominio` (default) | Unidades, cuotas, gastos, reservas, asamblea |
| Rentas | `rentas` | Inventario de inmuebles, CRM, contratos, cobranza de renta, Airbnb |

- El login / switcher agrupa tenants por espacio y abre el dashboard correcto.
- Los **planes de membresía** tienen `workspace_type`: un plan de condominio no se asigna a un tenant de rentas, y viceversa.
- Módulos de rentas: `rentas_dashboard`, `rentas_propiedades`, `rentas_crm`, `rentas_contratos`, `rentas_cobranza`, `rentas_calendario`, `rentas_config`.
- El CRM comercial de Homly (`/app/sistema/crm`) es **solo superadmin** y no comparte tablas con el CRM de rentas.

## Homly Rentas (v10.3)

### Inventario y contratos
- `RentalProperty` — unidades en renta (`source`: `homly` \| `airbnb`).
- `RentalParty` — inquilino, fiador, propietario.
- `RentalContract` — vigencia, renta, depósito; alta en borrador y `POST …/activate/`.
- `RentalCharge` / `RentalPayment` / `RentalChargeConcept` — cobranza del espacio de rentas.

### CRM de rentas
Pipeline **lead → cliente + contrato**, tenant-scoped (`rental_leads`, `rental_lead_activities`).

Etapas: `nuevo` → `contactado` → `visita` → `propuesta` → `negociacion` → `ganado` \| `perdido`.

Al **ganar** (`POST …/rental-leads/{id}/convert/`):
1. Crea o reutiliza el inquilino (`RentalParty`).
2. Crea el contrato de la unidad (código `CT-NNNN` o el que envíe el admin).
3. Lo deja en **borrador** (unidad `reservada`) o lo **activa** si `activate: true`.
4. No convierte si la unidad ya tiene contrato vigente.

UI: `/app/rentas/crm`.

### Airbnb
Airbnb **no** ofrece API pública de anfitrión. Homly no guarda contraseñas ni scrapea anuncios.

Flujo permitido hoy:
1. Registrar cuenta de anfitrión (etiqueta + correo).
2. Pegar URL del anuncio (`airbnb.com/rooms/{id}`) y URL **iCal** (Calendario → Exportar).
3. Homly crea la propiedad (`AB-{id}`), sincroniza ocupación y muestra reservas en el calendario.

APIs: `/api/tenants/{id}/airbnb-connections/`, `…/airbnb-listings/`.  
Cron: `python manage.py sync_airbnb_icals`.  
El campo `mode=oauth` queda listo para cuando Homly sea Preferred Software Partner.

## 🚀 Quick Start (Docker)

```bash
git clone <repo>
cd homly
docker compose up -d
```

Open **http://localhost:3000** in your browser.

Dev local (este entorno): `./dev.sh` → frontend `homly-dev` :3003, API `homly-api-dev` :3004.

## 🛠️ Manual Setup (Development)

### Prerequisites
- Python 3.12+
- Node.js 20+
- PostgreSQL 16+

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
createdb homly_db
cp .env.example .env
python manage.py migrate
python manage.py seed_data
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm start
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
├── deploy.sh / dev.sh
├── backend/
│   ├── manage.py
│   ├── homly_project/
│   └── core/
│       ├── models.py              # Condominio + Rentas + Airbnb + CRM rentas
│       ├── views.py               # Condominios, auth, CRM comercial Homly
│       ├── rental_views.py        # Inventario, contratos, cobranza, dashboard
│       ├── rental_crm_views.py    # Leads y conversión a contrato
│       ├── airbnb_views.py / airbnb_sync.py
│       ├── rental_serializers.py
│       ├── urls.py
│       └── management/commands/sync_airbnb_icals.py
└── frontend/src/
    ├── pages/rentas/              # Dashboard, propiedades, CRM, contratos, …
    ├── pages/Landing.jsx          # Dos servicios, una cuenta
    ├── constants/modulePermissions.js
    └── utils/helpers.jsx          # APP_VERSION
```

Migraciones relevantes: `0055` workspace rentas, `0056` planes por espacio, `0057` Airbnb, `0058` CRM de leads.

## 🔌 API Endpoints

### Auth
- `POST /api/auth/login/`
- `POST /api/auth/request-code/`
- `POST /api/auth/login-with-code/`
- `GET  /api/auth/tenants/`
- `POST /api/auth/switch-tenant/`
- `POST /api/auth/token/refresh/`

### Tenants (Super Admin)
- `GET|POST /api/tenants/`
- `GET|PATCH|DELETE /api/tenants/{id}/`
- `POST /api/tenants/{id}/subscription/record-payment/` — recibo de cobro → pago (Mi Membresía)

### Condominio (tenant-scoped)
- `CRUD /api/tenants/{id}/units/`
- `CRUD /api/tenants/{id}/users/`
- `CRUD /api/tenants/{id}/payments/`
- `CRUD /api/tenants/{id}/gasto-entries/`
- `CRUD /api/tenants/{id}/caja-chica/`
- Dashboard / estado de cuenta / reservas / notificaciones / planes de pago

### Homly Rentas (requiere `workspace_type=rentas`)
- `GET  /api/tenants/{id}/rental-dashboard/`
- `GET  /api/tenants/{id}/rental-calendar/`
- `CRUD /api/tenants/{id}/rental-properties/`
- `CRUD /api/tenants/{id}/rental-parties/`
- `CRUD /api/tenants/{id}/rental-contracts/` + `…/activate/` + `…/finish/`
- `CRUD /api/tenants/{id}/rental-charges/` + `…/generate-period/`
- `CRUD /api/tenants/{id}/rental-payments/`
- `CRUD /api/tenants/{id}/airbnb-connections/` + `…/sync/` + `…/import-listings/`
- `GET|PATCH|DELETE /api/tenants/{id}/airbnb-listings/` + `…/sync/`
- `CRUD /api/tenants/{id}/rental-leads/` + `…/move/` + `…/convert/` + `…/activities/`

### CRM comercial Homly (superadmin)
- `/api/crm/contacts|opportunities|activities|campaigns|tickets/`

## 🔐 Roles

Los mismos roles (`admin`, `tesorero`, `contador`, `auditor`, …) aplican en ambos espacios; el menú y los módulos cambian con `workspace_type` (`ROLE_BASE_MODULES` vs `RENTAL_ROLE_BASE_MODULES`).

| Role | Condominio | Rentas |
|------|------------|--------|
| Super Admin | Todo + Sistema | Todo el espacio de rentas |
| Admin | Config + operación | Inventario, CRM, contratos, cobranza, config |
| Tesorero / Contador | Finanzas | Propiedades, CRM, contratos, cobranza |
| Auditor | Lectura | Lectura (CRM/contratos sin escribir) |
| Vecino | Mi unidad | No aplica |

## Version

**v10.3.0** (septiembre 2026)

- Espacio **Homly Rentas** independiente (`workspace_type`).
- Planes de membresía por tipo de espacio; recibo de cobro y de pago en Mi Membresía.
- Landing: dos servicios, una cuenta de administrador.
- **CRM de rentas**: pipeline de leads y conversión a inquilino + contrato.
- **Airbnb**: importación de anuncios por URL + iCal oficial (sin contraseña).
- Calendario y dashboard de rentas con ocupación Airbnb y KPIs de CRM.

Anterior: **v10.1.0** — rewrite React + Django + PostgreSQL.

---

Powered by **Spotynet**
