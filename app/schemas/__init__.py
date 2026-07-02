"""Schemas package: Pydantic request/response contract, split by concern."""

from .analytics import (
    CashboxLine,
    CurrencyBreakdown,
    DebtOut,
    DebtorOut,
    PaymentBreakdown,
    SummaryOut,
    TimeseriesPoint,
    TopClient,
    TopProduct,
)
from .auth import AdminIn, AdminOut, LoginRequest, TokenResponse
from .balance import BalanceEntryIn, BalanceLogOut
from .cashback import CashbackEntryIn, CashbackLogOut
from .clients import ClientIn, ClientOut
from .currencies import CurrencyIn, CurrencyOut, CurrencyRateIn, CurrencyRateOut
from .expenses import (
    ExpenseCategoryIn,
    ExpenseCategoryOut,
    ExpenseIn,
    ExpenseOut,
)
from .orders import (
    OrderCreate,
    OrderItemIn,
    OrderItemOut,
    OrderOut,
    OrderPaymentIn,
    OrderPaymentOut,
    OrderSettle,
)
from .payment_types import PaymentTypeIn, PaymentTypeOut
from .products import ProductIn, ProductOut
from .sms import AudienceCount, SmsBroadcastIn, SmsBroadcastOut, SmsMessageOut

__all__ = [
    "AudienceCount",
    "SmsBroadcastIn",
    "SmsBroadcastOut",
    "SmsMessageOut",
    "AdminIn",
    "AdminOut",
    "BalanceEntryIn",
    "BalanceLogOut",
    "CashbackEntryIn",
    "CashbackLogOut",
    "ClientIn",
    "ClientOut",
    "CurrencyIn",
    "CurrencyOut",
    "CurrencyRateIn",
    "CurrencyRateOut",
    "DebtOut",
    "DebtorOut",
    "ExpenseCategoryIn",
    "ExpenseCategoryOut",
    "ExpenseIn",
    "ExpenseOut",
    "LoginRequest",
    "OrderCreate",
    "OrderItemIn",
    "OrderItemOut",
    "OrderOut",
    "OrderPaymentIn",
    "OrderPaymentOut",
    "OrderSettle",
    "CashboxLine",
    "CurrencyBreakdown",
    "PaymentBreakdown",
    "PaymentTypeIn",
    "PaymentTypeOut",
    "ProductIn",
    "ProductOut",
    "SummaryOut",
    "TimeseriesPoint",
    "TokenResponse",
    "TopClient",
    "TopProduct",
]
