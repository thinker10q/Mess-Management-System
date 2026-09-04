"""QR redirect endpoints.

GET /q/{code}  -> find mess by code and redirect to frontend join page.
This endpoint is intended to be encoded into QR codes (so the QR points at
https://<backend>/q/<mess_code>). The endpoint then redirects to the
frontend join route (configured via FRONTEND_BASE_URL env var).
"""
import os
from fastapi import APIRouter, HTTPException, Depends
from starlette.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database.models import Mess

router = APIRouter()

FRONTEND_BASE = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")


@router.get("/q/{code}")
def qr_join(code: str, db: Session = Depends(get_db)):
    # normalize
    code = code.strip().upper()
    mess = db.query(Mess).filter(Mess.code == code).first()
    if not mess:
        raise HTTPException(status_code=404, detail="Mess not found")
    # Redirect to frontend join page; frontend should accept ?code= param and
    # call /api/messes/enter to obtain a guest token and enter the mess.
    target = f"{FRONTEND_BASE}/join?code={mess.code}"
    return RedirectResponse(url=target)
