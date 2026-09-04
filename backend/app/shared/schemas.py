from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import date, datetime


# ============ Health ============
class HealthOut(BaseModel):
    status: str
    version: str
    multi_tenant: bool


# ============ Auth ============
class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    full_name: Optional[str] = None


# ============ Mess ============
class MessCreate(BaseModel):
    name: str
    manager_name: str
    code: str
    manager_password: str
    description: Optional[str] = None


class MessUpdate(BaseModel):
    """Partial update for a mess. All fields optional; only provided fields change.

    Used by the manager's edit-mess UI. Authorization is enforced at the route
    level (caller must be a mess admin or global admin).
    """
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    manager_name: Optional[str] = None
    manager_password: Optional[str] = None


class MessJoinRequest(BaseModel):
    code: str
    manager_password: str


class MessRef(BaseModel):
    """Lightweight mess reference with caller's role. Returned by GET /api/messes."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    manager_name: str
    code: str
    description: Optional[str] = None
    created_at: datetime
    created_by: int
    my_role: str
    qr_path: Optional[str] = None


class MessEnterRequest(BaseModel):
    """Member entry: mess code + the fixed name set by the admin.

    The name must match an existing member of the mess (case-insensitive).
    No Guest users are created — names are fixed by the admin.
    `display_name` is optional only for backward compatibility (old QR/scripts);
    omitting it falls back to the legacy guest creation.
    """
    code: str
    display_name: Optional[str] = None


class MessAdminLoginRequest(BaseModel):
    """Manager sign-in: code + manager password (set when the mess was created)."""
    code: str
    manager_password: str


class MessAdminLoginResponse(BaseModel):
    """Returned after a manager signs in to their mess: global JWT + mess info."""
    access_token: str
    token_type: str = "bearer"
    mess: MessRef


class MessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    manager_name: str
    code: str
    description: Optional[str] = None
    created_at: datetime
    created_by: int


class MessMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    mess_id: int
    user_id: int
    role: str
    username: Optional[str] = None
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    is_guest: bool = False
    joined_at: datetime
    phone: Optional[str] = None
    department: Optional[str] = None
    university: Optional[str] = None


class MessMemberUpdate(BaseModel):
    """Admin-editable member directory fields. All optional."""
    display_name: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    university: Optional[str] = None


class MessMemberCreate(BaseModel):
    """Admin adds a fixed member to the directory."""
    display_name: str
    phone: Optional[str] = None
    department: Optional[str] = None
    university: Optional[str] = None


class MessDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    manager_name: str
    code: str
    description: Optional[str] = None
    created_at: datetime
    created_by: int
    my_role: str
    qr_path: Optional[str] = None
    members: List[MessMemberOut] = []


class MessSummary(BaseModel):
    """Public mess listing (no caller membership required)."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    manager_name: str
    code: str
    description: Optional[str] = None
    created_at: datetime


class MessEnterResponse(BaseModel):
    """Returned to a guest who just entered a mess: mess-scoped JWT."""
    access_token: str
    token_type: str = "bearer"
    mess: MessRef
    display_name: str


# ============ Member (chart-level) ============
class MemberBase(BaseModel):
    name: str


class MemberCreate(MemberBase):
    pass


class MemberOut(MemberBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    chart_id: int


# ============ Chart ============
class ChartCreate(BaseModel):
    title: str
    start_date: date
    end_date: date
    member_names: List[str] = Field(default_factory=list)


class ChartUpdate(BaseModel):
    title: Optional[str] = None
    end_date: Optional[date] = None


class ChartOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    mess_id: int
    title: str
    start_date: date
    end_date: date
    status: str
    created_at: datetime
    members: List[MemberOut] = []


class ChartSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    mess_id: int
    title: str
    start_date: date
    end_date: date
    status: str


# ============ Daily Meal ============
class MealEntry(BaseModel):
    member_id: int
    date: date
    meal: float = Field(ge=0, le=10)


class MealBulkUpdate(BaseModel):
    chart_id: int
    entries: List[MealEntry]


class MealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    chart_id: int
    member_id: int
    date: date
    meal: float
    locked: bool


# ============ Market ============
class MarketCreate(BaseModel):
    chart_id: int
    member_id: int
    date: date
    amount: float = Field(gt=0)
    description: Optional[str] = None


class MarketUpdate(BaseModel):
    date: Optional[date] = None
    amount: Optional[float] = None
    description: Optional[str] = None


class MarketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    chart_id: int
    member_id: int
    member_name: Optional[str] = None
    date: date
    amount: float
    description: Optional[str] = None


# ============ Report ============
class MemberBalance(BaseModel):
    member_id: int
    name: str
    meals: float
    market_total: float
    meal_cost: float
    net_balance: float


class ReportOut(BaseModel):
    chart: ChartOut
    meal_rate: float
    total_market: float
    total_meals: float
    balances: List[MemberBalance]


# ============ Chart View (matrix) ============
class ChartViewResponse(BaseModel):
    chart: ChartOut
    dates: List[date]
    meals_by_member_date: dict
    totals_by_member: dict
    locked_dates: List[date]