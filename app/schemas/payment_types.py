"""Schemas for payment types (dynamic)."""

from pydantic import BaseModel


class PaymentTypeIn(BaseModel):
    name: str
    is_debt: bool = False
    is_cashback: bool = False
    is_change: bool = False


class PaymentTypeOut(BaseModel):
    id: int
    name: str
    is_debt: bool
    is_cashback: bool
    is_change: bool

    model_config = {"from_attributes": True}
