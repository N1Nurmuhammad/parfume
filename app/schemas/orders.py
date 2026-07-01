"""Schemas for orders and order items."""

import datetime as dt
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


class OrderItemIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)


class OrderPaymentIn(BaseModel):
    payment_type_id: int
    currency_id: int
    amount: Decimal = Field(gt=0)
    # money handed back to the client (change/qaytim): stored as a negative line
    # under the chosen real method (Cash / Card), so it nets out of that till
    is_change: bool = False


class OrderCreate(BaseModel):
    client_id: int
    cashback_percent: Decimal = Field(default=0, ge=0, le=100)
    items: list[OrderItemIn] = Field(min_length=1)
    # a "paid" order needs payments now; a "delivery" order is paid later (none)
    payments: list[OrderPaymentIn] = Field(default_factory=list)
    status: Literal["paid", "delivery"] = "paid"
    due_date: Optional[dt.date] = None

    @model_validator(mode="after")
    def _check(self):
        if self.status == "paid" and not self.payments:
            raise ValueError("a paid order requires at least one payment")
        if self.status == "delivery" and self.payments:
            raise ValueError("a delivery order is paid later — omit payments")
        return self


class OrderSettle(BaseModel):
    payments: list[OrderPaymentIn] = Field(min_length=1)


class OrderItemOut(BaseModel):
    id: int
    product_id: int
    product_name: str
    quantity: int
    price: Decimal
    cargo_price: Decimal

    model_config = {"from_attributes": True}


class OrderPaymentOut(BaseModel):
    id: int
    payment_type_id: int
    payment_type_name: str
    is_debt: bool
    is_cashback: bool
    is_change: bool
    amount: Decimal
    currency_id: int
    currency_code: str
    rate: Decimal
    amount_base: Decimal


class OrderOut(BaseModel):
    id: int
    client_id: int
    client_name: str
    cashback_percent: Decimal
    cashback_earned: Decimal
    subtotal: Decimal
    total: Decimal
    profit: Decimal
    is_debt: bool
    status: str
    due_date: Optional[dt.date] = None
    paid_at: Optional[dt.datetime] = None
    created_at: dt.datetime
    created_by: str
    items: list[OrderItemOut]
    payments: list[OrderPaymentOut]
