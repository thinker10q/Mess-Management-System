from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database.models import User
from app.auth.security import (
    verify_password, create_access_token, get_current_user, hash_password
)
from app.shared.schemas import LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token = create_access_token({"sub": user.username, "uid": user.id})
    return TokenResponse(access_token=token)


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """Anyone can self-register. Used to bootstrap the very first user too."""
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")
    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": user.username, "uid": user.id})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/bootstrap-admin")
def bootstrap_admin(db: Session = Depends(get_db)):
    """Create default global admin from env if no user exists yet. Idempotent."""
    if db.query(User).count() > 0:
        return {"message": "Users already exist"}
    admin = User(
        username=settings.ADMIN_USERNAME,
        password_hash=hash_password(settings.ADMIN_PASSWORD),
        full_name="System Administrator",
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return {"message": "Admin created", "username": admin.username}