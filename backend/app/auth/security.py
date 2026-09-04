"""
Auth & authorization helpers.

- `hash_password` / `verify_password`: direct bcrypt (passlib is unmaintained).
- `create_access_token` / `decode_token`: JWT (HS256).
- `get_current_user`: decodes token, returns User row.
- `require_mess_member(mess_id)`: dependency factory that checks the current
  user is a member of the given mess; returns (user, membership).
- `require_mess_admin(mess_id)`: same but enforces admin role.
"""
from datetime import datetime, timedelta
from typing import Tuple
import secrets
import string

import bcrypt
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database.connection import get_db
from app.database.models import User, MessMember

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

_BCRYPT_MAX_BYTES = 72


def _to_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_to_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_to_bytes(plain), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(token)
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_current_member(
    mess_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Tuple[User, MessMember]:
    """Resolve the caller into a (User, MessMember) for `mess_id`.

    Accepts either a global admin token (uid+sub) or a guest token (gid)."""
    payload = decode_token(token)
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    membership = (
        db.query(MessMember)
        .filter(MessMember.mess_id == mess_id, MessMember.user_id == user.id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this mess")
    return user, membership


def require_current_member(
    mess_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Tuple[User, MessMember]:
    """Same as get_current_member but raises 404 if mess is gone."""
    from app.database.models import Mess

    mess = db.query(Mess).filter(Mess.id == mess_id).first()
    if not mess:
        raise HTTPException(status_code=404, detail="Mess not found")
    return get_current_member(mess_id, token=token, db=db)


def generate_mess_code(length: int = 6) -> str:
    """Crypto-strong random uppercase alphanumeric code, ambiguous chars removed."""
    alphabet = "".join(c for c in (string.ascii_uppercase + string.digits) if c not in "O0I1")
    return "".join(secrets.choice(alphabet) for _ in range(length))


def require_mess_member(
    mess_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Tuple[User, MessMember]:
    """Dependency: caller must be a member of `mess_id` (resolved from path).

    Accepts both global admin tokens and per-mess guest tokens."""
    payload = decode_token(token)
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    membership = (
        db.query(MessMember)
        .filter(MessMember.mess_id == mess_id, MessMember.user_id == user.id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this mess")
    return user, membership


def require_mess_admin(
    mess_id: int,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Tuple[User, MessMember]:
    """Dependency: caller must be admin of `mess_id` (resolved from path).

    Accepts both global admin tokens and per-mess guest tokens (but a guest is
    never an admin)."""
    payload = decode_token(token)
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    membership = (
        db.query(MessMember)
        .filter(MessMember.mess_id == mess_id, MessMember.user_id == user.id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this mess")
    if membership.role != "admin":
        raise HTTPException(status_code=403, detail="Mess admin access required")
    return user, membership


def get_mess_membership(db: Session, user_id: int, mess_id: int) -> MessMember | None:
    return (
        db.query(MessMember)
        .filter(MessMember.mess_id == mess_id, MessMember.user_id == user_id)
        .first()
    )