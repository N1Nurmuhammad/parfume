"""Schemas for client cashback entries and the audit ledger."""

import datetime as dt
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class CashbackEntryIn(BaseModel):
    # Manual adjustment amount; positive adds cashback, negative removes it.
    change: Decimal
    note: Optional[str] = None


class CashbackLogOut(BaseModel):
    id: int
    change: Decimal
    cashback_after: Decimal
    reason: str
    order_id: Optional[int] = None
    note: Optional[str] = None
    admin_id: int
    admin_login: str
    created_at: dt.datetime
