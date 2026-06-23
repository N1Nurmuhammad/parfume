"""Schemas for client balance entries and the audit ledger."""

import datetime as dt
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel


class BalanceEntryIn(BaseModel):
    # Positive `change` pays down debt / tops up; negative is a manual deduction.
    change: Decimal
    reason: Literal["payment", "adjustment"] = "payment"
    note: Optional[str] = None


class BalanceLogOut(BaseModel):
    id: int
    change: Decimal
    balance_after: Decimal
    reason: str
    order_id: Optional[int] = None
    note: Optional[str] = None
    admin_id: int
    admin_login: str
    created_at: dt.datetime
