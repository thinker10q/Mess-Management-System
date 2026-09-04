"""Add member-directory columns to mess_members (idempotent).

Run: .\\venv\\Scripts\\python.exe scripts\\migrate_member_directory.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database.connection import engine

COLUMNS = ["phone", "department", "university"]

with engine.begin() as conn:
    for col in COLUMNS:
        conn.execute(
            text(f"ALTER TABLE mess_members ADD COLUMN IF NOT EXISTS {col} VARCHAR")
        )
        print(f"ensured mess_members.{col}")

print("MIGRATION_OK")
