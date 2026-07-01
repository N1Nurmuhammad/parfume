"""ORM models only — no engine, no session, no logic."""

import datetime as dt
from typing import Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)


class Base(DeclarativeBase):
    """Declarative base. `created_at` is declared here so every model gets it."""

    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Admin(Base):
    """A dashboard user who logs in to manage the store."""

    __tablename__ = "admins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    login: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # superusers may manage other admins; regular admins run day-to-day ops only
    is_superuser: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )


class Client(Base):
    """A customer. `balance < 0` means the client owes us money (debt).

    `cashback` is a separate, non-negative loyalty balance (so'm) earned on orders
    and redeemable via a cashback-type payment.
    """

    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    phone_number: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    birth_date: Mapped[Optional[dt.date]] = mapped_column(Date, nullable=True)
    balance: Mapped[float] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )
    cashback: Mapped[float] = mapped_column(
        Numeric(14, 2), default=0, server_default="0"
    )


class Product(Base):
    """An item for sale. `cargo_price` is the purchase/import cost."""

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    quantity: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    price: Mapped[float] = mapped_column(Numeric(12, 2))  # base selling price
    # `cargo` is a shipping/handling fee added to the selling price: the customer
    # pays full price = price + cargo (orders snapshot the full price).
    cargo: Mapped[float] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )
    # `cargo_price` is the per-item COST (used for profit) — labeled "Cost" in UI.
    cargo_price: Mapped[float] = mapped_column(Numeric(12, 2))


class PaymentType(Base):
    """A dynamic payment method. `is_debt` types charge the client's balance;
    `is_cashback` types redeem from the client's cashback balance; `is_change`
    types represent money handed back to the client (change/qaytim) and are
    stored as a negative amount, so they subtract from the order's paid total."""

    __tablename__ = "payment_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)
    is_debt: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    is_cashback: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    is_change: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )


class Order(Base):
    """A sale. `cashback_percent` is the % of the total credited to the client's
    cashback balance (it does NOT reduce the total).

    An order can be settled with several payment lines (e.g. part card, part
    cash, part cashback) — see `payments`. Their amounts sum to `total`.
    """

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id"), index=True)
    cashback_percent: Mapped[float] = mapped_column(
        Numeric(5, 2), default=0, server_default="0"
    )
    subtotal: Mapped[float] = mapped_column(Numeric(12, 2))
    total: Mapped[float] = mapped_column(Numeric(12, 2))
    # "paid" (settled at creation) or "delivery" (delivered, paid later).
    status: Mapped[str] = mapped_column(
        String(16), default="paid", server_default="paid", index=True
    )
    due_date: Mapped[Optional[dt.date]] = mapped_column(Date, nullable=True)
    # accounting date: when the order was paid (= created_at for paid-at-creation
    # orders; set at settle time for deliveries). Analytics window on this.
    paid_at: Mapped[Optional[dt.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    client: Mapped["Client"] = relationship(lazy="joined")
    admin: Mapped["Admin"] = relationship(lazy="joined")
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    payments: Mapped[list["OrderPayment"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class OrderPayment(Base):
    """One payment line of an order — an amount paid via a given payment type.

    Multiple lines let a single order be split across payment types. If the
    payment type `is_debt`, the amount is charged to the client's balance.
    """

    __tablename__ = "order_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    payment_type_id: Mapped[int] = mapped_column(
        ForeignKey("payment_types.id"), index=True
    )
    # `amount` is in `currency`; `rate` (so'm per 1 unit, snapshotted) converts it
    # to `amount_base` in base currency (so'm). Base-currency lines have rate=1.
    currency_id: Mapped[int] = mapped_column(
        ForeignKey("currencies.id"), index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(14, 2))
    rate: Mapped[float] = mapped_column(Numeric(18, 4))
    amount_base: Mapped[float] = mapped_column(Numeric(14, 2))

    order: Mapped["Order"] = relationship(back_populates="payments")
    payment_type: Mapped["PaymentType"] = relationship(lazy="joined")
    currency: Mapped["Currency"] = relationship(lazy="joined")


class OrderItem(Base):
    """One line of an order. price/cargo_price are snapshots at sale time."""

    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    price: Mapped[float] = mapped_column(Numeric(12, 2))
    cargo_price: Mapped[float] = mapped_column(Numeric(12, 2))

    order: Mapped["Order"] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship(lazy="joined")


class BalanceLog(Base):
    """Append-only audit ledger of every client balance change.

    The client's `balance` equals the running sum of these `change` deltas.
    `admin_id` records who made the change; `created_at` records when.
    """

    __tablename__ = "balance_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    change: Mapped[float] = mapped_column(Numeric(12, 2))
    balance_after: Mapped[float] = mapped_column(Numeric(12, 2))
    reason: Mapped[str] = mapped_column(String(32))
    order_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("orders.id"), nullable=True
    )
    note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id"), index=True)

    admin: Mapped["Admin"] = relationship(lazy="joined")


class CashbackLog(Base):
    """Append-only audit ledger of every client cashback change.

    The client's `cashback` equals the running sum of these `change` deltas.
    `reason` is `earn` | `spend` | `adjustment`; `admin_id`/`created_at` record
    who and when.
    """

    __tablename__ = "cashback_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    change: Mapped[float] = mapped_column(Numeric(14, 2))
    cashback_after: Mapped[float] = mapped_column(Numeric(14, 2))
    reason: Mapped[str] = mapped_column(String(32))
    order_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("orders.id"), nullable=True
    )
    note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id"), index=True)

    admin: Mapped["Admin"] = relationship(lazy="joined")


class ExpenseCategory(Base):
    """A label for grouping store expenses (e.g. Rent, Salaries, Logistics)."""

    __tablename__ = "expense_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)


class Expense(Base):
    """A store expense. `amount` is in `currency`; `rate`/`amount_base` snapshot
    the conversion to base so'm so expenses roll up in analytics."""

    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    currency_id: Mapped[int] = mapped_column(
        ForeignKey("currencies.id"), index=True
    )
    category_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("expense_categories.id"), nullable=True, index=True
    )
    # Which payment method the money went out of (Cash / Card / …); nullable so
    # legacy rows stay unattributed. Analytics nets this out of the matching
    # payment-type + currency bucket so till balances reflect money in − out.
    payment_type_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("payment_types.id"), nullable=True, index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(14, 2))
    rate: Mapped[float] = mapped_column(Numeric(18, 4))
    amount_base: Mapped[float] = mapped_column(Numeric(14, 2))
    note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id"), index=True)

    currency: Mapped["Currency"] = relationship(lazy="joined")
    admin: Mapped["Admin"] = relationship(lazy="joined")
    category: Mapped[Optional["ExpenseCategory"]] = relationship(lazy="joined")
    payment_type: Mapped[Optional["PaymentType"]] = relationship(lazy="joined")


class SmsBroadcast(Base):
    """A scheduled SMS broadcast.

    `schedule_kind` is `once` (single run at `scheduled_at`) or `cron` (recurring
    via the `cron` expression, evaluated in APP_TIMEZONE). `scheduled_at` always
    holds the NEXT run time; the scheduler re-arms it after each cron run until the
    window (`ends_at`) / `max_runs` is exhausted or the broadcast is canceled.
    The `message` may contain {name}/{phone}/{debt}/{balance} placeholders.
    """

    __tablename__ = "sms_broadcasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    message: Mapped[str] = mapped_column(Text)
    audience: Mapped[str] = mapped_column(String(16))  # all|debtors|birthdays|custom
    custom_numbers: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    schedule_kind: Mapped[str] = mapped_column(String(8))  # once|cron
    cron: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    scheduled_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), index=True
    )
    starts_at: Mapped[Optional[dt.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ends_at: Mapped[Optional[dt.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    max_runs: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    status: Mapped[str] = mapped_column(
        String(16), default="scheduled", server_default="scheduled", index=True
    )  # scheduled|sending|done|failed|canceled
    last_run_at: Mapped[Optional[dt.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    run_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    recipients_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    sent_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    failed_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id"), index=True)
    admin: Mapped["Admin"] = relationship(lazy="joined")


class SmsMessage(Base):
    """Per-recipient delivery record for a broadcast run."""

    __tablename__ = "sms_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    broadcast_id: Mapped[int] = mapped_column(
        ForeignKey("sms_broadcasts.id", ondelete="CASCADE"), index=True
    )
    client_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("clients.id"), nullable=True
    )
    phone: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(8))  # sent|failed
    error: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class Currency(Base):
    """A currency the shop accepts. Exactly one `is_base` (UZS, rate always 1)."""

    __tablename__ = "currencies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(8), unique=True)  # UZS, USD, EUR
    name: Mapped[str] = mapped_column(String(48))
    is_base: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )


class CurrencyRate(Base):
    """A daily exchange rate: `rate` = how many base units (so'm) per 1 unit."""

    __tablename__ = "currency_rates"
    __table_args__ = (
        UniqueConstraint("currency_id", "rate_date", name="uq_currency_rate_day"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    currency_id: Mapped[int] = mapped_column(
        ForeignKey("currencies.id"), index=True
    )
    rate_date: Mapped[dt.date] = mapped_column(Date, index=True)
    rate: Mapped[float] = mapped_column(Numeric(18, 4))

    currency: Mapped["Currency"] = relationship(lazy="joined")
