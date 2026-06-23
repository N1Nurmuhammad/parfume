"""Schemas for clients."""

import datetime as dt
import re
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, field_validator


def normalize_uz_phone(raw: str) -> str:
    """Validate + canonicalize an Uzbek mobile number for SMS delivery.

    Accepts common forms (+998 90 123 45 67, 998901234567, 901234567, with or
    without spaces/dashes) and returns the canonical display form
    `+998 90 123 45 67`. Raises ValueError if it is not a valid 998 + 9-digit
    number, so a bad number can never be saved (we SMS these).
    """
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 9:  # local 901234567 -> 998901234567
        digits = "998" + digits
    elif digits.startswith("8") and len(digits) == 12:  # 8XX... typo guard
        digits = "998" + digits[1:]
    if len(digits) != 12 or not digits.startswith("998"):
        raise ValueError("Enter a valid Uzbek phone number, e.g. +998 90 123 45 67")
    return f"+998 {digits[3:5]} {digits[5:8]} {digits[8:10]} {digits[10:12]}"


class ClientIn(BaseModel):
    name: str
    phone_number: str
    birth_date: Optional[dt.date] = None

    @field_validator("name")
    @classmethod
    def _v_name(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Name is required")
        return v

    @field_validator("phone_number")
    @classmethod
    def _v_phone(cls, v: str) -> str:
        return normalize_uz_phone(v)


class ClientOut(BaseModel):
    id: int
    name: str
    phone_number: str
    birth_date: Optional[dt.date] = None
    balance: Decimal
    cashback: Decimal

    model_config = {"from_attributes": True}
