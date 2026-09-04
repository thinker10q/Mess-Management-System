"""
Charts routes — all scoped by mess_id.

URL layout:
- POST   /api/messes/{mess_id}/charts                  -> create chart (admin only)
- GET    /api/messes/{mess_id}/charts                  -> list charts in mess
- GET    /api/messes/{mess_id}/charts/active           -> get the single active chart
- GET    /api/messes/{mess_id}/charts/{chart_id}       -> chart details
- GET    /api/messes/{mess_id}/charts/{chart_id}/view  -> grid view (dates, meals, totals, locks)
- PATCH  /api/messes/{mess_id}/charts/{chart_id}       -> update meta (title, dates, status) admin only
- DELETE /api/messes/{mess_id}/charts/{chart_id}       -> admin only
"""
from datetime import date as date_type, datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database.connection import get_db
from app.database.models import Chart, Member, User, Mess, MessMember
from app.auth.security import (
    require_mess_member, require_mess_admin, hash_password,
)
import secrets
from app.shared.schemas import (
    ChartCreate, ChartUpdate, ChartOut, ChartViewResponse,
)

router = APIRouter(prefix="/api/messes/{mess_id}/charts", tags=["Charts"])


def _validate_dates(start: date_type, end: date_type):
    if end < start:
        raise HTTPException(status_code=400, detail="end_date must be >= start_date")


def _build_chart_view(db: Session, chart_id: int) -> ChartViewResponse:
    chart = (
        db.query(Chart)
        .options(joinedload(Chart.members))
        .filter(Chart.id == chart_id)
        .first()
    )
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")

    from app.database.models import DailyMeal
    meals_rows = db.query(DailyMeal).filter(DailyMeal.chart_id == chart_id).all()

    # Auto-lock semantics: any past date (date < today, UTC) is treated as
    # locked even if its DB row's `locked` flag is False. Admin can still unlock
    # such a row explicitly and edit it; otherwise the front-end sees it as
    # read-only.
    today = datetime.utcnow().date()

    # Bucket meals by member_id -> {date: meal}. Values may be Decimal because
    # the meal column is Numeric(4,1); coerce to float for the JSON response.
    meals_by_member_date: dict[int, dict[str, float]] = {}
    locked_dates: set[date_type] = set()
    for m in meals_rows:
        meals_by_member_date.setdefault(m.member_id, {})[m.date.isoformat()] = float(m.meal)
        if m.locked or m.date < today:
            locked_dates.add(m.date)

    # Also mark every date within the chart range that is strictly before today
    # as locked, even if no DailyMeal row exists yet. This is what makes the
    # matrix row show as "Locked" past midnight without an explicit lock action.
    d = chart.start_date
    while d <= chart.end_date:
        if d < today:
            locked_dates.add(d)
        d = date_type.fromordinal(d.toordinal() + 1)

    dates = []
    d = chart.start_date
    while d <= chart.end_date:
        dates.append(d.isoformat())
        d = date_type.fromordinal(d.toordinal() + 1)

    totals_by_member: dict[int, float] = {mm.id: 0.0 for mm in chart.members}
    for mm in chart.members:
        vals = [float(meals_by_member_date.get(mm.id, {}).get(dt, 0.0)) for dt in dates]
        totals_by_member[mm.id] = sum(vals, 0.0)

    return ChartViewResponse(
        chart=ChartOut.model_validate(chart),
        dates=dates,
        meals_by_member_date={
            str(mid): {dt: meals_by_member_date.get(mid, {}).get(dt, 0.0) for dt in dates}
            for mid in meals_by_member_date
        },
        totals_by_member={str(mid): totals_by_member[mid] for mid in totals_by_member},
        locked_dates=[d.isoformat() for d in sorted(locked_dates)],
    )


@router.post("", response_model=ChartOut, status_code=status.HTTP_201_CREATED)
def create_chart(
    mess_id: int,
    payload: ChartCreate,
    db: Session = Depends(get_db),
    user_membership: tuple = Depends(require_mess_admin),
):
    current_user, _ = user_membership
    _validate_dates(payload.start_date, payload.end_date)

    mess = db.query(Mess).filter(Mess.id == mess_id).first()
    if not mess:
        raise HTTPException(status_code=404, detail="Mess not found")

    chart = Chart(
        mess_id=mess_id,
        title=payload.title.strip(),
        start_date=payload.start_date,
        end_date=payload.end_date,
        status="active",
        created_by=current_user.id,
    )
    db.add(chart)
    db.flush()

    # Auto-deactivate other active charts in this mess
    db.query(Chart).filter(
        Chart.mess_id == mess_id, Chart.id != chart.id, Chart.status == "active"
    ).update({"status": "archived"})

    # Create named members. If the admin leaves the list empty, automatically
    # use every mess member (display name) so the meal chart — and therefore
    # the bazar list, which is derived from chart members — exists right away.
    seen = set()
    names = [(n or "").strip() for n in (payload.member_names or [])]
    names = [n for n in names if n]
    if not names:
        mms = (
            db.query(MessMember)
            .filter(MessMember.mess_id == mess_id)
            .order_by(MessMember.joined_at.asc())
            .all()
        )
        for mm in mms:
            label = (mm.display_name or "").strip() or (mm.user.full_name if mm.user else None) or (mm.user.username if mm.user else None) or ""
            label = label.strip()
            if label:
                names.append(label)
    # Always include the mess manager: the creator is a mess member too, so
    # their name must be on every chart even when the admin types custom names.
    manager_name = (mess.manager_name or "").strip()
    if manager_name and manager_name.lower() not in {n.lower() for n in names}:
        names.append(manager_name)
    for name in names:
        clean = (name or "").strip()
        if not clean or clean.lower() in seen:
            continue
        seen.add(clean.lower())
        db.add(Member(chart_id=chart.id, name=clean))

    # Sync every chart name into the mess Members directory: if a fixed name
    # isn't there yet, create the member (with a sign-in user) so entry,
    # bazar and reports all see the same fixed names.
    for clean_lower in sorted(seen):
        clean = next(n for n in names if n.strip().lower() == clean_lower)
        exists = (
            db.query(MessMember)
            .filter(
                MessMember.mess_id == mess_id,
                func.lower(MessMember.display_name) == clean_lower,
            )
            .first()
        )
        if exists:
            continue
        base = "".join(
            ch for ch in clean.lower().strip().replace(" ", "_")
            if ch.isalnum() or ch == "_"
        )[:20] or "member"
        candidate = f"member_m{mess_id}_{base}"
        suffix = 1
        while db.query(User).filter(User.username == candidate).first():
            suffix += 1
            candidate = f"member_m{mess_id}_{base}_{suffix}"
        new_user = User(
            username=candidate,
            password_hash=hash_password(secrets.token_urlsafe(16)),
            full_name=clean,
        )
        db.add(new_user)
        db.flush()
        db.add(MessMember(
            mess_id=mess_id, user_id=new_user.id, role="member",
            display_name=clean, is_guest=False,
        ))

    db.commit()
    db.refresh(chart)
    return chart


@router.get("", response_model=list[ChartOut])
def list_charts(
    mess_id: int,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_member),
):
    rows = (
        db.query(Chart)
        .options(joinedload(Chart.members))
        .filter(Chart.mess_id == mess_id)
        .order_by(Chart.created_at.desc())
        .all()
    )
    # Explicit Pydantic validation so the `members` relationship is serialized
    # even if FastAPI's response_model path swallows lazy attributes after the
    # SQLAlchemy session closes.
    return [ChartOut.model_validate(r) for r in rows]


@router.get("/active", response_model=ChartOut)
def get_active_chart(
    mess_id: int,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_member),
):
    chart = (
        db.query(Chart)
        .options(joinedload(Chart.members))
        .filter(Chart.mess_id == mess_id, Chart.status == "active")
        .order_by(Chart.created_at.desc())
        .first()
    )
    if not chart:
        raise HTTPException(status_code=404, detail="No active chart for this mess")
    return ChartOut.model_validate(chart)


@router.get("/{chart_id}", response_model=ChartOut)
def get_chart(
    mess_id: int,
    chart_id: int,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_member),
):
    chart = (
        db.query(Chart)
        .options(joinedload(Chart.members))
        .filter(Chart.id == chart_id, Chart.mess_id == mess_id)
        .first()
    )
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    return ChartOut.model_validate(chart)


@router.get("/{chart_id}/view", response_model=ChartViewResponse)
def view_chart(
    mess_id: int,
    chart_id: int,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_member),
):
    chart = db.query(Chart).filter(Chart.id == chart_id, Chart.mess_id == mess_id).first()
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    return _build_chart_view(db, chart_id)


@router.patch("/{chart_id}", response_model=ChartOut)
def update_chart(
    mess_id: int,
    chart_id: int,
    payload: ChartUpdate,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_admin),
):
    chart = db.query(Chart).filter(Chart.id == chart_id, Chart.mess_id == mess_id).first()
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")

    if payload.title is not None:
        chart.title = payload.title.strip()
    if payload.start_date is not None:
        chart.start_date = payload.start_date
    if payload.end_date is not None:
        chart.end_date = payload.end_date
    if payload.status is not None:
        chart.status = payload.status
    _validate_dates(chart.start_date, chart.end_date)
    db.commit()
    db.refresh(chart)
    return chart


@router.delete("/{chart_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chart(
    mess_id: int,
    chart_id: int,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_admin),
):
    chart = db.query(Chart).filter(Chart.id == chart_id, Chart.mess_id == mess_id).first()
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    db.delete(chart)
    db.commit()
