"""Delete legacy Guest (#N) memberships — names are now fixed by the admin.

Run: .\\venv\\Scripts\\python.exe scripts\\remove_guest_members.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.connection import engine
from app.database.models import MessMember, User
from sqlalchemy.orm import Session

db = Session(bind=engine)
try:
    guests = db.query(MessMember).filter(MessMember.is_guest == True).all()  # noqa: E712
    print(f"found {len(guests)} guest membership(s)")
    user_ids = [g.user_id for g in guests]
    for g in guests:
        db.delete(g)
    db.commit()
    # Remove orphaned guest users (usernames like guest_m*_g*)
    removed_users = 0
    for uid in user_ids:
        still_member = (
            db.query(MessMember).filter(MessMember.user_id == uid).first()
        )
        if not still_member:
            u = db.query(User).filter(User.id == uid).first()
            if u and u.username.startswith("guest_"):
                db.delete(u)
                removed_users += 1
    db.commit()
    print(f"removed {len(guests)} guest membership(s), {removed_users} orphan user(s)")
finally:
    db.close()

print("GUEST_CLEANUP_OK")
