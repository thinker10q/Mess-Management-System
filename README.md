# Mess Meal Management System

A complete web application for digitizing mess/hostel meal tracking, market expenses, and monthly balance calculation.

## Stack

- **Frontend:** Next.js 14 (React + TypeScript) + Tailwind CSS + TanStack Query
- **Backend:** FastAPI + SQLAlchemy + JWT (Pydantic v2)
- **Database:** PostgreSQL
- **Reports:** Excel export via openpyxl

## Project Layout

```
mess-management/
├── backend/        FastAPI service
│   ├── app/
│   │   ├── auth/         Login, JWT, bootstrap admin
│   │   ├── charts/       Chart + member management + matrix view
│   │   ├── meals/        Bulk meal updates + lock/unlock
│   │   ├── markets/      Market expense CRUD
│   │   ├── reports/      Calculator + Excel export
│   │   ├── database/     Models + connection
│   │   ├── shared/       Pydantic schemas
│   │   ├── config.py
│   │   └── main.py
│   ├── requirements.txt
│   └── .env
└── frontend/       Next.js application
    ├── app/        Home, Login, Admin, Calculator
    ├── components/
    ├── lib/        Axios API client
    └── store/      Zustand auth store
```

## Quick Start (Windows / Python 3.13 verified)

### 1. Database (PostgreSQL)

```powershell
# Create the database (one-time)
psql -U postgres -c "CREATE DATABASE mess_management;"
```

If you prefer not to use `psql`, see `backend/scripts/create_db.py`.

### 2. Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

> **Why `psycopg[binary]` and not `psycopg2-binary`?**  
> `psycopg2-binary==2.9.9` has no prebuilt wheel for Python 3.13 and would require MSVC Build Tools. `psycopg[binary]==3.2.3` ships prebuilt wheels for 3.13. The SQLAlchemy URL must use the `postgresql+psycopg://` driver prefix.

> **Why direct `bcrypt` and not `passlib[bcrypt]`?**  
> `passlib 1.7.4` is unmaintained and breaks against `bcrypt >= 4.1` (`AttributeError: module 'bcrypt' has no attribute '__about__'`). The project uses `bcrypt` directly with a 72-byte truncation guard.

Update `backend/.env` with your DB credentials:

```env
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/mess_management
SECRET_KEY=change-me-to-a-long-random-string
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

Then create tables and bootstrap the admin (optional — both happen automatically on first run, but explicit is friendlier):

```powershell
.\venv\Scripts\python.exe scripts\create_tables.py
.\venv\Scripts\python.exe scripts\bootstrap_admin.py
```

Run the server:

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Visit `http://127.0.0.1:8000/api/docs` for Swagger UI.

Default admin:

- username: `admin`
- password: `admin123`

Change these in `backend/.env` (`ADMIN_USERNAME`, `ADMIN_PASSWORD`) before going live.

Optional helpers:

| Script | Purpose |
|--------|---------|
| `scripts/create_db.py` | Creates the `mess_management` database if missing |
| `scripts/create_tables.py` | Creates all tables (`Base.metadata.create_all`) |
| `scripts/bootstrap_admin.py` | Hashes and inserts the default admin |
| `scripts/smoke_test.py` | Login → list/create chart → view matrix |
| `scripts/full_smoke.py` | Full lifecycle: chart → meals → market → report → Excel |
| `scripts/list_routes.py` | Dumps `/openapi.json` for debugging |

### 3. Frontend

```powershell
cd ..\frontend
npm install
copy .env.example .env.local     # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev                      # http://localhost:3000
```

## Features

- Public meal chart view with daily meal entry
- Automatic row locking once a date passes and meals are complete
- Admin override (unlock → edit → save)
- Market expense tracking per member
- Automatic meal rate calculation (`Total Market / Total Meals`)
- Per-member balance with "Receive" / "Pay" status
- Excel export of the full monthly report

## API Overview

| Method | Path | Description |
|--------|------|-------------|
| POST   | `/api/auth/login` | Admin login, returns JWT |
| GET    | `/api/auth/me` | Current user info |
| GET    | `/api/charts` | List all charts |
| GET    | `/api/charts/active` | Currently active chart |
| GET    | `/api/charts/active/view` | Matrix data for the home page |
| POST   | `/api/charts` | Create a new chart (admin) |
| PUT    | `/api/charts/{id}` | Update title / extend end_date |
| POST   | `/api/charts/{id}/members` | Add a member |
| DELETE | `/api/charts/{id}/members/{member_id}` | Remove member |
| POST   | `/api/meals/bulk` | Save meals for a day |
| POST   | `/api/meals/lock-row/{chart_id}` | Lock a row (admin) |
| POST   | `/api/meals/unlock-row/{chart_id}` | Unlock a row (admin) |
| GET    | `/api/markets?chart_id=…` | List market entries |
| POST   | `/api/markets` | Add a market entry (admin) |
| PUT    | `/api/markets/{id}` | Update market entry (admin) |
| DELETE | `/api/markets/{id}` | Delete market entry (admin) |
| GET    | `/api/reports/{chart_id}` | Calculate monthly report |
| POST   | `/api/reports/{chart_id}/save` | Snapshot a report (admin) |
| GET    | `/api/reports/{chart_id}/export.xlsx` | Download Excel report |

## Deployment Notes

- Set strong `SECRET_KEY`, `ADMIN_PASSWORD`, and `CORS_ORIGINS` in production.
- Frontend: deploy to Vercel with `NEXT_PUBLIC_API_URL` set to your backend URL.
- Backend: deploy to Render / Fly.io / Railway.
- Database: Neon (or any managed PostgreSQL).