"""Schemas for store expenses."""

import datetime as dt
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class ExpenseCategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class ExpenseCategoryOut(BaseModel):
    id: int
    name: str


class ExpenseIn(BaseModel):
    amount: Decimal = Field(gt=0)
    currency_id: int
    payment_type_id: int
    category_id: Optional[int] = None
    note: Optional[str] = None


class ExpenseOut(BaseModel):
    id: int
    amount: Decimal
    currency_id: int
    currency_code: str
    payment_type_id: Optional[int] = None
    payment_type_name: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    rate: Decimal
    amount_base: Decimal
    note: Optional[str] = None
    created_by: str
    created_at: dt.datetime
