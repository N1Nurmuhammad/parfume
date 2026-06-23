"""Schemas for currencies and currency rates."""

import datetime as dt
from decimal import Decimal

from pydantic import BaseModel, Field


class CurrencyIn(BaseModel):
    code: str
    name: str
    is_base: bool = False


class CurrencyOut(BaseModel):
    id: int
    code: str
    name: str
    is_base: bool

    model_config = {"from_attributes": True}


class CurrencyRateIn(BaseModel):
    currency_id: int
    rate_date: dt.date
    rate: Decimal = Field(gt=0)


class CurrencyRateOut(BaseModel):
    id: int
    currency_id: int
    currency_code: str
    rate_date: dt.date
    rate: Decimal
