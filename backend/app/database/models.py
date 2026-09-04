"""
Database models for the Mess Meal Management System.

Multi-mess tenancy model:
- A User is a global login account.
- A Mess is a tenant. It has a unique 6-char join code and an admin (creator).
- A MessMember links a User to a Mess with a per-mess role (admin / member).
- A Chart belongs to exactly one Mess.
- A Member is a chart-level participant (named on the chart).
- DailyMeal / MarketEntry / Report all chain up to a Chart -> Mess.

Access rules:
- Login is global (username/password) -> JWT.
- All mess/chart/meals/markets operations require the caller to be a
  MessMember of the relevant Mess.
- Admin operations on a mess require MessMember.role == "admin".
"""
from sqlalchemy import (
    Column, Integer, String, Date, Float, Numeric, ForeignKey, Boolean, DateTime,
    UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database.connection import Base


# =========================================================
# Users (global login accounts)
# =========================================================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # A user can be a member of many messes
    mess_memberships = relationship(
        "MessMember", back_populates="user", cascade="all, delete-orphan"
    )


# =========================================================
# Messes (tenants)
# =========================================================
class Mess(Base):
    __tablename__ = "messes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    manager_name = Column(String, nullable=False)
    code = Column(String(8), unique=True, nullable=False, index=True)  # user-chosen join code
    manager_password_hash = Column(String, nullable=False)
    description = Column(String, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Optional path (served under /static/qrcodes/) pointing to the mess QR image
    qr_path = Column(String, nullable=True)

    members = relationship(
        "MessMember", back_populates="mess", cascade="all, delete-orphan"
    )
    charts = relationship(
        "Chart", back_populates="mess", cascade="all, delete-orphan"
    )


class MessMember(Base):
    __tablename__ = "mess_members"
    __table_args__ = (
        UniqueConstraint("mess_id", "user_id", name="uq_mess_user"),
        Index("ix_messmember_user", "user_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    mess_id = Column(Integer, ForeignKey("messes.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, default="member")  # "admin" or "member" (per-mess)
    display_name = Column(String, nullable=True)  # for guest entries
    is_guest = Column(Boolean, default=False)
    joined_at = Column(DateTime, default=datetime.utcnow)

    mess = relationship("Mess", back_populates="members")
    user = relationship("User", back_populates="mess_memberships")
    # Member directory fields (editable by mess admin, shown on members page)
    phone = Column(String, nullable=True)
    department = Column(String, nullable=True)
    university = Column(String, nullable=True)


# =========================================================
# Charts (belong to a Mess)
# =========================================================
class Chart(Base):
    __tablename__ = "charts"

    id = Column(Integer, primary_key=True, index=True)
    mess_id = Column(Integer, ForeignKey("messes.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String, default="active")  # active, closed
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    mess = relationship("Mess", back_populates="charts")
    members = relationship("Member", back_populates="chart", cascade="all, delete-orphan")
    daily_meals = relationship("DailyMeal", back_populates="chart", cascade="all, delete-orphan")
    market_entries = relationship("MarketEntry", back_populates="chart", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="chart", cascade="all, delete-orphan")


class Member(Base):
    __tablename__ = "members"

    id = Column(Integer, primary_key=True, index=True)
    chart_id = Column(Integer, ForeignKey("charts.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)

    chart = relationship("Chart", back_populates="members")
    daily_meals = relationship("DailyMeal", back_populates="member", cascade="all, delete-orphan")
    market_entries = relationship("MarketEntry", back_populates="member", cascade="all, delete-orphan")


class DailyMeal(Base):
    __tablename__ = "daily_meals"
    __table_args__ = (
        UniqueConstraint("chart_id", "member_id", "date", name="uq_meal_per_day"),
    )

    id = Column(Integer, primary_key=True, index=True)
    chart_id = Column(Integer, ForeignKey("charts.id", ondelete="CASCADE"), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    meal = Column(Numeric(4, 1), default=0)
    locked = Column(Boolean, default=False)

    chart = relationship("Chart", back_populates="daily_meals")
    member = relationship("Member", back_populates="daily_meals")


class MarketEntry(Base):
    __tablename__ = "market_entries"

    id = Column(Integer, primary_key=True, index=True)
    chart_id = Column(Integer, ForeignKey("charts.id", ondelete="CASCADE"), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    amount = Column(Float, nullable=False)
    description = Column(String)

    member = relationship("Member", back_populates="market_entries")
    chart = relationship("Chart", back_populates="market_entries")


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    chart_id = Column(Integer, ForeignKey("charts.id", ondelete="CASCADE"), nullable=False)
    meal_rate = Column(Float, nullable=False)
    total_market = Column(Float, nullable=False)
    total_meals = Column(Integer, nullable=False)
    generated_at = Column(DateTime, default=datetime.utcnow)

    chart = relationship("Chart", back_populates="reports")
