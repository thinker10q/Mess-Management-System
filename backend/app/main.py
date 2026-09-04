"""
Main FastAPI entry point — multi-mess tenant system.

Routers:
- /api/auth         -> auth (login, register, me, bootstrap-admin)
- /api/messes       -> mess CRUD + join + members
- /api/messes/{id}/charts -> chart CRUD + active + view
- /api/messes/{id}/charts/{cid}/meals    -> meals bulk + lock/unlock
- /api/messes/{id}/charts/{cid}/markets  -> market entries CRUD
- /api/messes/{id}/charts/{cid}/report   -> JSON report + xlsx export
"""
import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import os

from app.database.connection import engine
from app.database.models import Base
from app.shared.schemas import HealthOut

# Routers
from app.auth.routes import router as auth_router
from app.messes.routes import router as mess_router
from app.charts.routes import router as chart_router
from app.meals.routes import router as meal_router
from app.markets.routes import router as market_router
from app.reports.routes import router as report_router
# QR redirect router (serves /q/<code> which then redirects to frontend)
from app.qrcode.routes import router as qrcode_router

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("mess")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup (dev convenience; production uses Alembic)
    Base.metadata.create_all(bind=engine)
    log.info("Database tables ensured.")
    yield


app = FastAPI(
    title="Mess Meal Management API",
    version="2.0.0",
    description="Multi-mess tenancy — each mess is an isolated tenant with members and admin.",
    lifespan=lifespan,
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()
    ] or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": str(exc.body)[:500]},
    )


@app.get("/api/health", response_model=HealthOut, tags=["Health"])
def health():
    return HealthOut(status="ok", version="2.0.0", multi_tenant=True)


# Mount routers
# Ensure static directory exists for generated QR codes and other assets
_static_dir = Path(__file__).resolve().parent.parent / "static"
_static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")

app.include_router(auth_router)
app.include_router(mess_router)
app.include_router(chart_router)
app.include_router(meal_router)
app.include_router(market_router)
app.include_router(report_router)
# Mount QR redirect router (no /api prefix; intended for QR short links)
app.include_router(qrcode_router)