"""
Reports routes — scoped by mess_id.

- GET /api/messes/{mess_id}/charts/{chart_id}/report          -> JSON report (meal_rate, balances)
- GET /api/messes/{mess_id}/charts/{chart_id}/report.xlsx    -> download Excel (balances)
- GET /api/messes/{mess_id}/charts/{chart_id}/report/chart.xlsx -> download Excel (meal chart matrix)
"""
import io
from collections import defaultdict
from datetime import date as date_type
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database.models import Chart, Member, DailyMeal, MarketEntry
from app.auth.security import require_mess_member
from app.shared.schemas import ReportOut, MemberBalance, ChartOut

from openpyxl import Workbook

router = APIRouter(
    prefix="/api/messes/{mess_id}/charts/{chart_id}/report", tags=["Reports"]
)


def _compute(db: Session, chart: Chart) -> ReportOut:
    meals = (
        db.query(DailyMeal).filter(DailyMeal.chart_id == chart.id).all()
    )
    markets = (
        db.query(MarketEntry).filter(MarketEntry.chart_id == chart.id).all()
    )

    total_meals = sum(float(m.meal) for m in meals)
    total_market = sum(float(mk.amount) for mk in markets)

    meal_rate = (total_market / total_meals) if total_meals > 0 else 0.0

    # Per-member aggregates
    meals_by_member = defaultdict(float)
    for m in meals:
        meals_by_member[m.member_id] += float(m.meal)

    market_by_member = defaultdict(float)
    for mk in markets:
        market_by_member[mk.member_id] += float(mk.amount)

    members = (
        db.query(Member).filter(Member.chart_id == chart.id).order_by(Member.name).all()
    )

    balances: list[MemberBalance] = []
    for mm in members:
        my_meals = meals_by_member.get(mm.id, 0.0)
        my_market = market_by_member.get(mm.id, 0.0)
        meal_cost = my_meals * meal_rate
        net = my_market - meal_cost   # >0: paid extra (will receive); <0: owes
        balances.append(
            MemberBalance(
                member_id=mm.id, name=mm.name,
                meals=my_meals, market_total=my_market,
                meal_cost=round(meal_cost, 2),
                net_balance=round(net, 2),
            )
        )

    return ReportOut(
        chart=ChartOut.model_validate(chart),
        meal_rate=round(meal_rate, 4),
        total_market=round(total_market, 2),
        total_meals=round(total_meals, 2),
        balances=balances,
    )


@router.get("", response_model=ReportOut)
def get_report(
    mess_id: int,
    chart_id: int,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_member),
):
    chart = db.query(Chart).filter(Chart.id == chart_id, Chart.mess_id == mess_id).first()
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    return _compute(db, chart)


@router.get(".xlsx")
def download_excel(
    mess_id: int,
    chart_id: int,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_member),
):
    chart = db.query(Chart).filter(Chart.id == chart_id, Chart.mess_id == mess_id).first()
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")
    report = _compute(db, chart)

    wb = Workbook()
    ws = wb.active
    ws.title = "Report"

    ws.append(["Mess:", chart.title])
    ws.append(["Period:", f"{chart.start_date} to {chart.end_date}"])
    ws.append([])
    ws.append(["Meal Rate:", report.meal_rate])
    ws.append(["Total Market:", report.total_market])
    ws.append(["Total Meals:", report.total_meals])
    ws.append([])
    ws.append(["Member", "Meals", "Market", "Meal Cost", "Net"])
    for b in report.balances:
        ws.append([b.name, b.meals, b.market_total, b.meal_cost, b.net_balance])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"mess-{chart.id}-report.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/chart.xlsx")
def download_chart_excel(
    mess_id: int,
    chart_id: int,
    db: Session = Depends(get_db),
    _: tuple = Depends(require_mess_member),
):
    """Download the meal chart matrix (dates x members + totals) as Excel.

    Available to every mess member, so the chart is downloadable from the
    dashboard. Values are read live from DailyMeal rows.
    """
    chart = db.query(Chart).filter(Chart.id == chart_id, Chart.mess_id == mess_id).first()
    if not chart:
        raise HTTPException(status_code=404, detail="Chart not found")

    members = (
        db.query(Member).filter(Member.chart_id == chart.id).order_by(Member.name).all()
    )
    meals = db.query(DailyMeal).filter(DailyMeal.chart_id == chart.id).all()
    grid: dict[tuple[int, str], float] = {}
    for m in meals:
        grid[(m.member_id, m.date.isoformat())] = float(m.meal)

    dates: list[str] = []
    d = chart.start_date
    while d <= chart.end_date:
        dates.append(d.isoformat())
        d = date_type.fromordinal(d.toordinal() + 1)

    wb = Workbook()
    ws = wb.active
    ws.title = "Chart"

    ws.append(["Mess chart:", chart.title])
    ws.append(["Period:", f"{chart.start_date} to {chart.end_date}"])
    ws.append([])
    ws.append(["Date", *(mm.name for mm in members), "Total"])
    for dt in dates:
        row = [dt]
        day_total = 0.0
        for mm in members:
            v = grid.get((mm.id, dt), 0.0)
            row.append(v)
            day_total += v
        row.append(round(day_total, 1))
        ws.append(row)
    # Per-member totals footer
    footer = ["Total"]
    grand = 0.0
    for mm in members:
        t = round(sum(grid.get((mm.id, dt), 0.0) for dt in dates), 1)
        footer.append(t)
        grand += t
    footer.append(round(grand, 1))
    ws.append(footer)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"mess-{chart.id}-chart.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
