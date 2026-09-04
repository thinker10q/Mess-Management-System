"""Create all tables in the mess_management database."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database.connection import engine, Base
from app.database.models import User, Mess, MessMember, Chart, Member, DailyMeal, MarketEntry, Report  # noqa: F401

Base.metadata.create_all(engine)
print("All tables created successfully")

with engine.connect() as conn:
    rows = conn.exec_driver_sql(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    ).fetchall()
    print("Public tables:", [r[0] for r in rows])