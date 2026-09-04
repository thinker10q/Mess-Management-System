"""
Markets routes — scoped by mess_id.

- POST   /api/messes/{mess_id}/charts/{chart_id}/markets         -> add entry
- GET    /api/messes/{mess_id}/charts/{chart_id}/markets         -> list entries
- PATCH  /api/messes/{mess_id}/charts/{chart_id}/markets/{id}    -> update entry
- DELETE /api/messes/{mess_id}/charts/{chart_id}/markets/{id}    -> delete entry
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database.models import Chart, Member, MarketEntry
from app.auth.security import require_mess_member
from app.shared.schemas import MarketCreate, MarketUpdate, MarketOut

router = APIRouter(
    prefix="/api/messes/{mess_id}/charts/{chart_id}/markets", tags=["Markets"]
)


def _ensure_chart(db: Session, chart_id: int, mess_id: int) -> Chart:
    chart = db.query(Chart).filter(Chart.id == chart_id, Chart.mess_id == mess_id).first()
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    valid = {m.id for m in chart.members}
    return chart, valid


@router.post("", response_model=MarketOut, status_code=status.HTTP_201_CREATED)
def add_market_entry(
    mess_id: int,
    chart_id: int,
    payload: MarketCreate,
    db: Session = Depends(get_db),
    user_membership: tuple = Depends(require_mess_member),
):
    _, my_mm = user_membership
    chart, valid_members = _ensure_chart(db, chart_id, mess_id)
    if payload.chart_id != chart_id:
        raise HTTPException(status_code=400, detail="chart_id mismatch")
    if payload.member_id not in valid_members:
        raise HTTPException(status_code=400, detail="member_id not in chart")
    # Row lock: a non-admin member may only add bazar to their own fixed-name row.
    if my_mm.role != "admin":
        target = db.query(Member).filter(Member.id == payload.member_id).first()
        my_name = (my_mm.display_name or "").strip().lower()
        target_name = (target.name if target else "" or "").strip().lower()
        if not my_name or my_name != target_name:
            raise HTTPException(status_code=403, detail="You can only add bazar to your own row")
    if not (chart.start_date <= payload.date <= chart.end_date):
        raise HTTPException(status_code=400, detail="date outside chart range")

    entry = MarketEntry(
        chart_id=chart_id,
        member_id=payload.member_id,
        date=payload.date,
        amount=payload.amount,
        description=payload.description,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("", response_model=list[MarketOut])
def list_market_entries(
    mess_id: int,
    chart_id: int,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_member),
):
    _ensure_chart(db, chart_id, mess_id)
    rows = (
        db.query(MarketEntry)
        .filter(MarketEntry.chart_id == chart_id)
        .order_by(MarketEntry.date.asc(), MarketEntry.id.asc())
        .all()
    )
    return rows


@router.patch("/{entry_id}", response_model=MarketOut)
def update_market_entry(
    mess_id: int,
    chart_id: int,
    entry_id: int,
    payload: MarketUpdate,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_member),
):
    _ensure_chart(db, chart_id, mess_id)
    entry = (
        db.query(MarketEntry)
        .filter(MarketEntry.id == entry_id, MarketEntry.chart_id == chart_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Market entry not found")
    if payload.amount is not None:
        entry.amount = payload.amount
    if payload.description is not None:
        entry.description = payload.description
    if payload.date is not None:
        entry.date = payload.date
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_market_entry(
    mess_id: int,
    chart_id: int,
    entry_id: int,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_member),
):
    _ensure_chart(db, chart_id, mess_id)
    entry = (
        db.query(MarketEntry)
        .filter(MarketEntry.id == entry_id, MarketEntry.chart_id == chart_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Market entry not found")
    db.delete(entry)
    db.commit()
