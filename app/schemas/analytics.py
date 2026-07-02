"""Schemas for analytics endpoints."""

import datetime as dt
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class SummaryOut(BaseModel):
    revenue: Decimal
    cost: Decimal
    profit: Decimal
    order_count: int
    items_sold: int
    avg_order_value: Decimal
    expenses: Decimal
    net_profit: Decimal


class TimeseriesPoint(BaseModel):
    day: str
    revenue: Decimal
    profit: Decimal


class TopProduct(BaseModel):
    product_id: int
    name: str
    quantity: int
    revenue: Decimal
    profit: Decimal


class TopClient(BaseModel):
    client_id: int
    name: str
    spent: Decimal
    order_count: int


class PaymentBreakdown(BaseModel):
    payment_type_id: int
    name: str
    is_debt: bool
    total: Decimal  # base so'm
    order_count: int


class CashboxLine(BaseModel):
    payment_type_id: int
    name: str
    is_debt: bool
    total: Decimal  # base so'm currently held (all-time income − expenses)
    order_count: int


class CurrencyBreakdown(BaseModel):
    currency_id: int
    currency_code: str
    payment_type_id: int
    name: str  # payment method
    total: Decimal  # collected in the currency's own units
    total_base: Decimal  # so'm equivalent
    order_count: int


class DebtorOut(BaseModel):
    client_id: int
    name: str
    phone_number: str
    debt: Decimal


class PendingDelivery(BaseModel):
    order_id: int
    client_name: str
    total: Decimal
    due_date: Optional[dt.date] = None


class DebtOut(BaseModel):
    outstanding_debt: Decimal
    debt_issued: Decimal
    payments_collected: Decimal
    cashback_outstanding: Decimal
    delivery_outstanding: Decimal
    debtors: list[DebtorOut]
    deliveries: list[PendingDelivery]
