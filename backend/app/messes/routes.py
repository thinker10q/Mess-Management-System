"""
Mess (tenant) routes.

UX contract (no global login):
- POST /api/messes                -> create a new mess. Caller is unauthenticated;
                                     we auto-create a manager User + MessMember(admin)
                                     and return a JWT for them.
- POST /api/messes/admin-login    -> manager signs back in via code + manager password.
                                     Returns a JWT for the manager User.
- POST /api/messes/enter          -> guest member enters via mess code only.
                                     Auto-creates a guest User + MessMember(role=member)
                                     and returns a mess-scoped JWT.
- GET  /api/messes/all            -> public mess listing (no auth).
- GET  /api/messes                -> list messes the caller belongs to (auth required).
- GET  /api/messes/{id}           -> mess details (with members); requires membership.
- GET  /api/messes/{id}/charts    -> list charts in a mess (requires membership).
- GET  /api/messes/{id}/members   -> list user-memberships in a mess.
"""
import secrets
import os
import qrcode
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database.connection import get_db
from app.database.models import User, Mess, MessMember
from app.auth.security import (
    get_current_user, require_mess_member, require_mess_admin,
    hash_password, verify_password, get_mess_membership,
    create_access_token,
)
from app.shared.schemas import (
    MessCreate, MessUpdate, MessEnterRequest, MessEnterResponse,
    MessAdminLoginRequest, MessAdminLoginResponse,
    MessOut, MessRef, MessDetail, MessSummary, MessMemberOut, MessMemberUpdate,
    MessMemberCreate,
)

router = APIRouter(prefix="/api/messes", tags=["Messes"])


def _code_exists(db: Session, code: str) -> bool:
    return db.query(Mess).filter(Mess.code == code.strip().upper()).first() is not None


def _slugify(value: str) -> str:
    return "".join(
        ch for ch in value.lower().strip().replace(" ", "_")
        if ch.isalnum() or ch == "_"
    )[:24] or "user"


def _unique_username(db: Session, base: str) -> str:
    """Find a username that isn't already taken, suffixing with _N if needed."""
    candidate = base
    suffix = 1
    while db.query(User).filter(User.username == candidate).first():
        suffix += 1
        candidate = f"{base}_{suffix}"
    return candidate


def _serialize_membership(mm: MessMember) -> MessMemberOut:
    return MessMemberOut(
        id=mm.id, mess_id=mm.mess_id, user_id=mm.user_id,
        role=mm.role, joined_at=mm.joined_at,
        username=mm.user.username if mm.user else None,
        full_name=mm.user.full_name if mm.user else None,
        display_name=mm.display_name,
        is_guest=bool(mm.is_guest),
        phone=mm.phone,
        department=mm.department,
        university=mm.university,
    )


def _generate_qr(db: Session, mess: Mess) -> None:
    """(Re)generate the QR SVG for a mess and store its web path.

    Never raises — QR failure must not break mess create/update.
    """
    try:
        backend_base = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")
        static_qr_dir = Path(__file__).resolve().parents[2] / "static" / "qrcodes"
        static_qr_dir.mkdir(parents=True, exist_ok=True)
        qr_target = f"{backend_base}/q/{mess.code}"
        try:
            from qrcode.image.svg import SvgPathImage
            factory = SvgPathImage
            img = qrcode.make(qr_target, image_factory=factory)
            filename = f"mess_{mess.id}_{mess.code}.svg"
            fpath = static_qr_dir / filename
            with open(fpath, "wb") as fh:
                img.save(fh)
            mess.qr_path = f"/static/qrcodes/{filename}"
            db.commit()
            db.refresh(mess)
        except Exception:
            pass
    except Exception:
        pass


@router.post("", response_model=MessAdminLoginResponse, status_code=status.HTTP_201_CREATED)
def create_mess(
    payload: MessCreate,
    db: Session = Depends(get_db),
):
    """Create a new mess. The caller is unauthenticated.

    Auto-creates a manager User + MessMember(role=admin) and returns a JWT for
    them, so they can immediately use admin endpoints (chart creation, etc).
    """
    name = payload.name.strip()
    manager_name = payload.manager_name.strip()
    code = payload.code.strip().upper()
    if not name or not manager_name or not code or not payload.manager_password:
        raise HTTPException(status_code=400, detail="All fields are required")
    if _code_exists(db, code):
        raise HTTPException(status_code=409, detail="That mess code is already taken")

    # Create the manager User FIRST (FK requires the row to exist before Mess insert).
    # We need mess.id to make a unique username, so first reserve the mess via a
    # two-phase pattern: insert the user with a temp username, flush to get an id,
    # then we can use a placeholder. Simpler: pick a username not tied to mess id.
    base_username = _unique_username(db, f"mgr_{_slugify(manager_name)}_{secrets.token_hex(3)}")
    manager_user = User(
        username=base_username,
        password_hash=hash_password(payload.manager_password),
        full_name=manager_name,
    )
    db.add(manager_user)
    db.flush()  # now have manager_user.id

    mess = Mess(
        name=name,
        manager_name=manager_name,
        code=code,
        manager_password_hash=hash_password(payload.manager_password),
        description=payload.description,
        created_by=manager_user.id,
    )
    db.add(mess)
    db.flush()  # now have mess.id

    membership = MessMember(
        mess_id=mess.id, user_id=manager_user.id, role="admin",
        display_name=manager_name, is_guest=False,
    )
    db.add(membership)
    db.commit()
    db.refresh(mess)
    db.refresh(manager_user)

    # Generate a QR image for this mess that points to the backend short URL (/q/{code}).
    _generate_qr(db, mess)

    token = create_access_token({"sub": manager_user.username, "uid": manager_user.id, "mid": mess.id})
    return MessAdminLoginResponse(
        access_token=token,
        mess=MessRef(
            id=mess.id, name=mess.name, manager_name=mess.manager_name,
            code=mess.code, description=mess.description,
            created_at=mess.created_at, created_by=mess.created_by, my_role="admin",
            qr_path=mess.qr_path,
        ),
    )


@router.post("/admin-login", response_model=MessAdminLoginResponse)
def admin_login(
    payload: MessAdminLoginRequest,
    db: Session = Depends(get_db),
):
    """Manager sign-in via mess code + manager password.

    Verifies the password against the Mess row, then returns a JWT for the
    manager User (creating one on the fly if it was lost, e.g. after a DB wipe).
    """
    code = payload.code.strip().upper()
    if not code or not payload.manager_password:
        raise HTTPException(status_code=400, detail="Code and manager password are required")

    mess = db.query(Mess).filter(Mess.code == code).first()
    if not mess:
        raise HTTPException(status_code=404, detail="Wrong code")
    if not verify_password(payload.manager_password, mess.manager_password_hash):
        raise HTTPException(status_code=403, detail="Invalid manager password")

    # Find the admin membership for this mess.
    admin_mm = (
        db.query(MessMember)
        .filter(MessMember.mess_id == mess.id, MessMember.role == "admin")
        .first()
    )
    if admin_mm:
        manager_user = admin_mm.user
        # Ensure membership is solid
        admin_mm.display_name = mess.manager_name
    else:
        # Fallback: synthesize an admin user + membership
        manager_username = _unique_username(db, f"mgr_m{mess.id}_{_slugify(mess.manager_name)}")
        manager_user = User(
            username=manager_username,
            password_hash=hash_password(payload.manager_password),
            full_name=mess.manager_name,
        )
        db.add(manager_user)
        db.flush()
        admin_mm = MessMember(
            mess_id=mess.id, user_id=manager_user.id, role="admin",
            display_name=mess.manager_name, is_guest=False,
        )
        db.add(admin_mm)
        db.commit()
        db.refresh(manager_user)
        db.refresh(admin_mm)

    token = create_access_token({"sub": manager_user.username, "uid": manager_user.id, "mid": mess.id})
    return MessAdminLoginResponse(
        access_token=token,
        mess=MessRef(
            id=mess.id, name=mess.name, manager_name=mess.manager_name,
            code=mess.code, description=mess.description,
            created_at=mess.created_at, created_by=mess.created_by, my_role="admin",
            qr_path=mess.qr_path,
        ),
    )


@router.get("/all", response_model=list[MessSummary])
def list_all_messes(
    db: Session = Depends(get_db),
):
    """Public listing of every mess so the landing dashboard can render
    without requiring login. No PII is exposed - just name, code, manager."""
    rows = db.query(Mess).order_by(Mess.created_at.desc()).all()
    return [
        MessSummary(
            id=m.id, name=m.name, manager_name=m.manager_name,
            code=m.code, description=m.description, created_at=m.created_at,
        )
        for m in rows
    ]


@router.get("", response_model=list[MessRef])
def list_my_messes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(Mess, MessMember.role)
        .join(MessMember, MessMember.mess_id == Mess.id)
        .filter(MessMember.user_id == current_user.id)
        .order_by(Mess.created_at.desc())
        .all()
    )
    out = []
    for mess, role in rows:
        out.append(MessRef(
            id=mess.id, name=mess.name, manager_name=mess.manager_name,
            code=mess.code, description=mess.description,
            created_at=mess.created_at, created_by=mess.created_by, my_role=role,
            qr_path=mess.qr_path,
        ))
    return out


@router.post("/enter", response_model=MessEnterResponse)
def enter_mess(
    payload: MessEnterRequest,
    db: Session = Depends(get_db),
):
    """Member entry: mess code + fixed name (set by the admin).

    The name must match an existing member's display name in this mess
    (case-insensitive) — the caller is signed in AS that member. No new
    Guest users are created when a name is given.
    """
    from sqlalchemy import func

    code = payload.code.strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Mess code is required")

    mess = db.query(Mess).filter(Mess.code == code).first()
    if not mess:
        raise HTTPException(status_code=404, detail="Wrong code")

    fixed_name = (payload.display_name or "").strip()
    if fixed_name:
        member_mm = (
            db.query(MessMember)
            .filter(
                MessMember.mess_id == mess.id,
                func.lower(MessMember.display_name) == fixed_name.lower(),
            )
            .first()
        )
        if not member_mm:
            raise HTTPException(
                status_code=404,
                detail="Name not found in this mess — ask the admin to add you",
            )
        member_user = member_mm.user
        token = create_access_token({
            "sub": member_user.username, "uid": member_user.id,
            "gid": member_mm.id, "mid": mess.id,
        })
        return MessEnterResponse(
            access_token=token,
            mess=MessRef(
                id=mess.id, name=mess.name, manager_name=mess.manager_name,
                code=mess.code, description=mess.description,
                created_at=mess.created_at, created_by=mess.created_by,
                my_role=member_mm.role,
                qr_path=mess.qr_path,
            ),
            display_name=member_mm.display_name,
        )

    # Legacy fallback (no name given, e.g. old scripts): create a guest slot.
    # The UI always sends the fixed name, so no new guests are created there.
    # Find or create a guest membership with the next available Guest #N slot.
    next_n = (
        db.query(MessMember)
        .filter(MessMember.mess_id == mess.id, MessMember.is_guest == True)  # noqa: E712
        .count()
    ) + 1
    # Reuse if there is a slot for this number already.
    guest_mm = (
        db.query(MessMember)
        .filter(
            MessMember.mess_id == mess.id,
            MessMember.is_guest == True,  # noqa: E712
            MessMember.display_name == f"Guest #{next_n}",
        )
        .first()
    )
    if not guest_mm:
        display_name = f"Guest #{next_n}"
        guest_username = _unique_username(db, f"guest_m{mess.id}_g{next_n}")
        guest_user = User(
            username=guest_username,
            password_hash=hash_password(secrets.token_urlsafe(16)),
            full_name=display_name,
        )
        db.add(guest_user)
        db.flush()
        guest_mm = MessMember(
            mess_id=mess.id, user_id=guest_user.id, role="member",
            display_name=display_name, is_guest=True,
        )
        db.add(guest_mm)
        db.commit()
        db.refresh(guest_user)
        db.refresh(guest_mm)
    else:
        guest_user = guest_mm.user

    token = create_access_token({
        "sub": guest_user.username, "uid": guest_user.id,
        "gid": guest_mm.id, "mid": mess.id,
    })
    return MessEnterResponse(
        access_token=token,
        mess=MessRef(
            id=mess.id, name=mess.name, manager_name=mess.manager_name,
            code=mess.code, description=mess.description,
            created_at=mess.created_at, created_by=mess.created_by,
            my_role=guest_mm.role,
            qr_path=mess.qr_path,
        ),
        display_name=guest_mm.display_name,
    )


@router.get("/{mess_id}/names", response_model=list[str])
def list_mess_names(
    mess_id: int,
    db: Session = Depends(get_db),
):
    """Public fixed-name list for the entry form (no auth).

    Lets a member pick their admin-fixed name before entering.
    """
    mess = db.query(Mess).filter(Mess.id == mess_id).first()
    if not mess:
        raise HTTPException(status_code=404, detail="Mess not found")
    rows = (
        db.query(MessMember.display_name)
        .filter(MessMember.mess_id == mess_id, MessMember.display_name.isnot(None))
        .order_by(MessMember.display_name.asc())
        .all()
    )
    return [r[0] for r in rows if r[0]]


@router.post("/{mess_id}/members", response_model=MessMemberOut, status_code=status.HTTP_201_CREATED)
def add_mess_member(
    mess_id: int,
    payload: MessMemberCreate,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_admin),
):
    """Admin adds a fixed member to the directory (name + phone/department/university)."""
    from sqlalchemy import func

    name = (payload.display_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Member name is required")

    mess = db.query(Mess).filter(Mess.id == mess_id).first()
    if not mess:
        raise HTTPException(status_code=404, detail="Mess not found")

    dup = (
        db.query(MessMember)
        .filter(
            MessMember.mess_id == mess_id,
            func.lower(MessMember.display_name) == name.lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="That member name is already added")

    username = _unique_username(db, f"member_m{mess_id}_{_slugify(name)}")
    new_user = User(
        username=username,
        password_hash=hash_password(secrets.token_urlsafe(16)),
        full_name=name,
    )
    db.add(new_user)
    db.flush()
    mm = MessMember(
        mess_id=mess_id, user_id=new_user.id, role="member",
        display_name=name, is_guest=False,
        phone=(payload.phone or "").strip() or None,
        department=(payload.department or "").strip() or None,
        university=(payload.university or "").strip() or None,
    )
    db.add(mm)
    db.commit()
    db.refresh(mm)
    return _serialize_membership(mm)


@router.get("/{mess_id}", response_model=MessDetail)
def get_mess(
    mess_id: int,
    db: Session = Depends(get_db),
    user_membership: tuple = Depends(require_mess_member),
):
    current_user, my_mm = user_membership
    mess = (
        db.query(Mess)
        .options(joinedload(Mess.members).joinedload(MessMember.user))
        .filter(Mess.id == mess_id)
        .first()
    )
    if not mess:
        raise HTTPException(status_code=404, detail="Mess not found")

    return MessDetail(
        id=mess.id, name=mess.name, manager_name=mess.manager_name,
        code=mess.code, description=mess.description,
        created_at=mess.created_at, created_by=mess.created_by,
        my_role=my_mm.role,
        qr_path=mess.qr_path,
        members=[_serialize_membership(mm) for mm in mess.members],
    )


@router.get("/{mess_id}/members", response_model=list[MessMemberOut])
def list_mess_members(
    mess_id: int,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_member),
):
    mess = (
        db.query(Mess)
        .options(joinedload(Mess.members).joinedload(MessMember.user))
        .filter(Mess.id == mess_id)
        .first()
    )
    if not mess:
        raise HTTPException(status_code=404, detail="Mess not found")
    return [_serialize_membership(mm) for mm in mess.members]


@router.delete("/{mess_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_mess_member(
    mess_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    user_membership: tuple = Depends(require_mess_admin),
):
    """Admin can remove any other member. Cannot remove self (must transfer admin first)."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Admin cannot remove themselves")

    target = db.query(MessMember).filter(
        MessMember.mess_id == mess_id, MessMember.user_id == user_id
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found in this mess")

    db.delete(target)
    db.commit()


@router.patch("/{mess_id}/members/{user_id}", response_model=MessMemberOut)
def update_mess_member(
    mess_id: int,
    user_id: int,
    payload: MessMemberUpdate,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_admin),
):
    """Admin edits a member's directory info: name, phone, department, university."""
    target = db.query(MessMember).filter(
        MessMember.mess_id == mess_id, MessMember.user_id == user_id
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found in this mess")

    if payload.display_name is not None:
        name = payload.display_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Member name cannot be empty")
        target.display_name = name
    if payload.phone is not None:
        target.phone = payload.phone.strip() or None
    if payload.department is not None:
        target.department = payload.department.strip() or None
    if payload.university is not None:
        target.university = payload.university.strip() or None

    db.commit()
    db.refresh(target)
    return _serialize_membership(target)


@router.patch("/{mess_id}", response_model=MessRef)
def update_mess(
    mess_id: int,
    payload: MessUpdate,
    db: Session = Depends(get_db),
    user_membership: tuple = Depends(require_mess_admin),
):
    """Edit a mess. Mess admin (or global admin) only.

    Edits: name, code (unique 6-char join code), description, manager_name,
    manager_password. The code is normalized to upper-case; collisions return 409.
    Password is re-hashed with bcrypt on update.
    """
    current_user, my_mm = user_membership
    mess = db.query(Mess).filter(Mess.id == mess_id).first()
    if not mess:
        raise HTTPException(status_code=404, detail="Mess not found")

    # === code ===
    code_changed = False
    if payload.code is not None:
        new_code = payload.code.strip().upper()
        if not new_code:
            raise HTTPException(status_code=400, detail="Mess code cannot be empty")
        if len(new_code) > 8:
            raise HTTPException(status_code=400, detail="Mess code must be 8 characters or fewer")
        if new_code != mess.code and _code_exists(db, new_code):
            raise HTTPException(status_code=409, detail="That mess code is already taken")
        if new_code != mess.code:
            code_changed = True
        mess.code = new_code

    # === name ===
    if payload.name is not None:
        new_name = payload.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Mess name cannot be empty")
        mess.name = new_name

    # === manager_name ===
    if payload.manager_name is not None:
        new_mgr = payload.manager_name.strip()
        if not new_mgr:
            raise HTTPException(status_code=400, detail="Manager name cannot be empty")
        mess.manager_name = new_mgr
        # Keep the admin display_name in sync so chart UI stays consistent.
        if my_mm is not None:
            my_mm.display_name = new_mgr

    # === description (allow explicit empty string to clear) ===
    if payload.description is not None:
        mess.description = payload.description.strip() or None

    # === manager_password ===
    if payload.manager_password is not None:
        if not payload.manager_password:
            raise HTTPException(status_code=400, detail="Manager password cannot be empty")
        mess.manager_password_hash = hash_password(payload.manager_password)

    db.commit()
    db.refresh(mess)

    # The QR encodes the code — regenerate it whenever the code changes so the
    # downloaded/shared QR always enters the mess.
    if code_changed:
        _generate_qr(db, mess)
        db.refresh(mess)

    return MessRef(
        id=mess.id, name=mess.name, manager_name=mess.manager_name,
        code=mess.code, description=mess.description,
        created_at=mess.created_at, created_by=mess.created_by,
        my_role=my_mm.role if my_mm else "admin",
        qr_path=mess.qr_path,
    )


@router.post("/{mess_id}/qr-regenerate", response_model=MessRef)
def regenerate_qr(
    mess_id: int,
    db: Session = Depends(get_db),
    user_membership: tuple = Depends(require_mess_admin),
):
    """Regenerate the mess QR (admin). Use after code changes or if QR is missing."""
    _, my_mm = user_membership
    mess = db.query(Mess).filter(Mess.id == mess_id).first()
    if not mess:
        raise HTTPException(status_code=404, detail="Mess not found")
    _generate_qr(db, mess)
    db.refresh(mess)
    return MessRef(
        id=mess.id, name=mess.name, manager_name=mess.manager_name,
        code=mess.code, description=mess.description,
        created_at=mess.created_at, created_by=mess.created_by,
        my_role=my_mm.role if my_mm else "admin",
        qr_path=mess.qr_path,
    )


@router.delete("/{mess_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mess(
    mess_id: int,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_admin),
):
    """Delete a mess entirely. Mess admin (or global admin) only.

    Cascades through SQLAlchemy model relationships:
        Mess.members   -> MessMember rows
        Mess.charts    -> Chart rows  (charts cascade to members / meals / market /
                          reports via their own cascade settings)

    Note: the manager User record is NOT deleted, only the tenant and its
    memberships. This is intentional so the user can still log in (and the
    username stays unique).
    """
    mess = db.query(Mess).filter(Mess.id == mess_id).first()
    if not mess:
        raise HTTPException(status_code=404, detail="Mess not found")

    db.delete(mess)
    db.commit()
    return None
