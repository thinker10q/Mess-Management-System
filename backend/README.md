# Mess Management System — Backend

FastAPI backend for the Mess Meal Management System.

## Setup

1. Create the database in PostgreSQL:
   ```sql
   CREATE DATABASE mess_management;
   ```

2. Update `DATABASE_URL` in `.env` if needed.

3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

4. Run the server:
   ```
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

5. Visit `http://localhost:8000/api/docs` for the auto-generated Swagger UI.

## Default Admin

On first start, a default admin user is created from `.env`:
- username: `admin`
- password: `admin123`

Change these via environment variables before going to production.

## API Modules

- `/api/auth` — login, /me, bootstrap
- `/api/charts` — chart + member management + chart view matrix
- `/api/meals` — bulk meal update + lock/unlock
- `/api/markets` — market expense CRUD
- `/api/reports` — calculate, save, export to Excel