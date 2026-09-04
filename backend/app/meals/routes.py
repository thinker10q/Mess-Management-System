"""
Meals routes — scoped by mess_id.

- POST   /api/messes/{mess_id}/charts/{chart_id}/meals/bulk
  Save a list of (member_id, date, meal) entries in one transaction.
  Any mess member may edit. Meal is a decimal (e.g. 0.5, 1.5).
  Auto-lock semantics: any past date (date < today) is treated as locked
  even if its DB `locked` flag is false. Admin can override past dates by
  unlocking them first.
- POST /api/messes/{mess_id}/charts/{chart_id}/meals/lock/{date}     -> admin
- DELETE /api/messes/{mess_id}/charts/{chart_id}/meals/lock/{date}  -> admin
"""
from datetime import date as date_type, datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database.connection import get_db
from app.database.models import Chart, Member, DailyMeal
from app.auth.security import require_mess_member, require_mess_admin
from app.shared.schemas import MealBulkUpdate, MealOut

router = APIRouter(
    prefix="/api/messes/{mess_id}/charts/{chart_id}/meals", tags=["Meals"]
)


def _ensure_chart(db: Session, chart_id: int, mess_id: int) -> Chart:
    chart = db.query(Chart).filter(Chart.id == chart_id, Chart.mess_id == mess_id).first()
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    if chart.status != "active":
        raise HTTPException(status_code=400, detail="Chart is not active")
    return chart


def _is_past(target: date_type) -> bool:
    """Date is considered 'past' if it is strictly before today (UTC)."""
    return target < datetime.utcnow().date()


@router.post("/bulk", response_model=list[MealOut])
def bulk_update_meals(
    mess_id: int,
    chart_id: int,
    payload: MealBulkUpdate,
    db: Session = Depends(get_db),
    membership: tuple = Depends(require_mess_member),
):
    """Save meals for any mess member. Locked rows (admin-set or past dates)
    are rejected; meal must be in [0, 10] and accepts fractional values."""
    user, my_mm = membership
    is_admin = my_mm.role == "admin"
    chart = _ensure_chart(db, chart_id, mess_id)

    if payload.chart_id != chart_id:
        raise HTTPException(status_code=400, detail="chart_id mismatch")

    valid_member_ids = {m.id for m in chart.members}
    results = []

    for entry in payload.entries:
        if entry.meal is None or entry.meal < 0 or entry.meal > 10:
            raise HTTPException(status_code=400, detail="meal must be between 0 and 10")
        if entry.member_id not in valid_member_ids:
            raise HTTPException(
                status_code=400, detail=f"Member {entry.member_id} not in chart"
            )
        if not (chart.start_date <= entry.date <= chart.end_date):
            raise HTTPException(
                status_code=400,
                detail=f"Date {entry.date} outside chart range {chart.start_date}..{chart.end_date}",
            )

        existing = (
            db.query(DailyMeal)
            .filter(
                DailyMeal.chart_id == chart_id,
                DailyMeal.member_id == entry.member_id,
                DailyMeal.date == entry.date,
            )
            .first()
        )
        # Explicit lock: members blocked, admin may override (lets admin correct
        # past-date mistakes that were previously locked).
        if existing and existing.locked and not is_admin:
            raise HTTPException(
                status_code=409,
                detail=f"Meal for member {entry.member_id} on {entry.date} is locked",
            )
        # Past dates are auto-locked: members cannot seed new rows, admin can.
        if _is_past(entry.date) and existing is None and not is_admin:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot write meals for past date {entry.date}",
            )
        if existing:
            existing.meal = entry.meal
            results.append(existing)
        else:
            new = DailyMeal(
                chart_id=chart_id,
                member_id=entry.member_id,
                date=entry.date,
                meal=entry.meal,
            )
            db.add(new)
            results.append(new)

    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e.orig))

    for r in results:
        db.refresh(r)
    return results


@router.post("/lock/{target_date}", status_code=status.HTTP_204_NO_CONTENT)
def lock_day(
    mess_id: int,
    chart_id: int,
    target_date: date_type,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_admin),
):
    """Lock all meals on a specific date so they can't be edited further (admin only)."""
    _ensure_chart(db, chart_id, mess_id)
    db.query(DailyMeal).filter(
        DailyMeal.chart_id == chart_id, DailyMeal.date == target_date
    ).update({"locked": True})
    db.commit()


@router.delete("/lock/{target_date}", status_code=status.HTTP_204_NO_CONTENT)
def unlock_day(
    mess_id: int,
    chart_id: int,
    target_date: date_type,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_admin),
):
    _ensure_chart(db, chart_id, mess_id)
    db.query(DailyMeal).filter(
        DailyMeal.chart_id == chart_id, DailyMeal.date == target_date
    ).update({"locked": False})
    db.commit()
