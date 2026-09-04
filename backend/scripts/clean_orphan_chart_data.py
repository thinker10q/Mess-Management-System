"""Delete orphan bazar/meal rows left behind by chart deletes.

Run: .\\venv\\Scripts\\python.exe scripts\\clean_orphan_chart_data.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.connection import engine
from app.database.models import Chart, MarketEntry, DailyMeal, Member, Report
from sqlalchemy.orm import Session

db = Session(bind=engine)
try:
    chart_ids = {c.id for c in db.query(Chart.id).all()}

    orphan_markets = (
        db.query(MarketEntry).all()
        if not chart_ids
        else db.query(MarketEntry).filter(~MarketEntry.chart_id.in_(chart_ids)).all()
    )
    for e in orphan_markets:
        db.delete(e)

    orphan_meals = (
        db.query(DailyMeal).all()
        if not chart_ids
        else db.query(DailyMeal).filter(~DailyMeal.chart_id.in_(chart_ids)).all()
    )
    for e in orphan_meals:
        db.delete(e)

    member_chart_ids = {m.chart_id for m in db.query(Member.chart_id).distinct().all()}
    _ = member_chart_ids
    db.commit()
    print(f"removed {len(orphan_markets)} orphan bazar row(s), {len(orphan_meals)} orphan meal row(s)")
finally:
    db.close()

print("ORPHAN_CLEANUP_OK")
