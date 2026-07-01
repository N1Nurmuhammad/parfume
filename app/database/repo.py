"""
Repository layer.

`BaseRepo` is the dependency-injected entrypoint: it holds one AsyncSession and
exposes a sub-repository per model. Inject it once and reach any model's data
access through it:

    repo.clients.get(1)
    repo.orders.create(...)
    repo.analytics.summary(...)

Add new models by writing a `<Model>Repo` and a cached_property on `BaseRepo`.
"""

# annotations are lazy strings so method names like `list` don't shadow builtins
# (e.g. `list[BalanceLog]`) when return-type hints are evaluated at class-def time.
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from decimal import Decimal
from functools import cached_property
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import PRODUCT_CURRENCY
from .config import SessionLocal
from .models import (
    Admin,
    BalanceLog,
    CashbackLog,
    Client,
    Currency,
    CurrencyRate,
    Expense,
    ExpenseCategory,
    Order,
    OrderItem,
    OrderPayment,
    PaymentType,
    Product,
    SmsBroadcast,
    SmsMessage,
)


@dataclass
class _SessionRepo:
    """Base for every sub-repository: just carries the session."""

    session: AsyncSession


# ----------------------------------------------------------------------------- #
# Admins
# ----------------------------------------------------------------------------- #
class AdminRepo(_SessionRepo):
    """Data access for the `admins` table."""

    async def list(self) -> list[Admin]:
        rows = await self.session.execute(select(Admin).order_by(Admin.login))
        return list(rows.scalars().all())

    async def by_login(self, login: str) -> Optional[Admin]:
        rows = await self.session.execute(
            select(Admin).where(Admin.login == login)
        )
        return rows.scalar_one_or_none()

    async def get(self, admin_id: int) -> Optional[Admin]:
        return await self.session.get(Admin, admin_id)

    async def add(
        self, login: str, password_hash: str, is_superuser: bool = False
    ) -> Admin:
        admin = Admin(
            login=login, password_hash=password_hash, is_superuser=is_superuser
        )
        self.session.add(admin)
        await self.session.flush()
        return admin

    async def delete(self, admin_id: int) -> bool:
        admin = await self.get(admin_id)
        if admin is None:
            return False
        await self.session.delete(admin)
        return True

    async def count(self) -> int:
        rows = await self.session.execute(select(func.count(Admin.id)))
        return int(rows.scalar_one())


# ----------------------------------------------------------------------------- #
# Clients (+ balance ledger)
# ----------------------------------------------------------------------------- #
class ClientRepo(_SessionRepo):
    """Data access for `clients` and the `balance_logs` ledger."""

    async def list(self) -> list[Client]:
        # newest clients first
        rows = await self.session.execute(select(Client).order_by(Client.id.desc()))
        return list(rows.scalars().all())

    async def get(self, client_id: int) -> Optional[Client]:
        return await self.session.get(Client, client_id)

    async def add(
        self, name: str, phone_number: str, birth_date: Optional[dt.date]
    ) -> Client:
        client = Client(
            name=name, phone_number=phone_number, birth_date=birth_date
        )
        self.session.add(client)
        await self.session.flush()
        return client

    async def update(
        self,
        client_id: int,
        name: str,
        phone_number: str,
        birth_date: Optional[dt.date],
    ) -> Optional[Client]:
        client = await self.get(client_id)
        if client is None:
            return None
        client.name = name
        client.phone_number = phone_number
        client.birth_date = birth_date
        await self.session.flush()
        return client

    async def delete(self, client_id: int) -> bool:
        client = await self.get(client_id)
        if client is None:
            return False
        await self.session.delete(client)
        return True

    async def adjust_balance(
        self,
        client_id: int,
        change: Decimal,
        reason: str,
        admin_id: int,
        note: Optional[str] = None,
        order_id: Optional[int] = None,
    ) -> Optional[BalanceLog]:
        """The single chokepoint that mutates a client's balance.

        Mutates `client.balance` and appends a `BalanceLog` row recording the
        delta, resulting balance, reason, the acting admin, and (implicitly via
        created_at) when. Returns the log entry, or None if the client is gone.
        """
        client = await self.get(client_id)
        if client is None:
            return None
        new_balance = Decimal(client.balance) + Decimal(change)
        client.balance = new_balance
        log = BalanceLog(
            client_id=client_id,
            change=change,
            balance_after=new_balance,
            reason=reason,
            order_id=order_id,
            note=note,
            admin_id=admin_id,
        )
        self.session.add(log)
        await self.session.flush()
        return log

    async def balance_logs(self, client_id: int) -> list[BalanceLog]:
        """Full balance history for a client, newest first."""
        rows = await self.session.execute(
            select(BalanceLog)
            .where(BalanceLog.client_id == client_id)
            .order_by(BalanceLog.id.desc())
        )
        return list(rows.scalars().all())

    async def adjust_cashback(
        self,
        client_id: int,
        change: Decimal,
        reason: str,
        admin_id: int,
        note: Optional[str] = None,
        order_id: Optional[int] = None,
    ) -> Optional[CashbackLog]:
        """Chokepoint for cashback changes — mirrors `adjust_balance`. Mutates
        `client.cashback` and appends a `CashbackLog`. Returns None if the client
        is gone or the change would make cashback negative."""
        client = await self.get(client_id)
        if client is None:
            return None
        new_cashback = Decimal(client.cashback) + Decimal(change)
        if new_cashback < 0:
            return None
        client.cashback = new_cashback
        log = CashbackLog(
            client_id=client_id,
            change=change,
            cashback_after=new_cashback,
            reason=reason,
            order_id=order_id,
            note=note,
            admin_id=admin_id,
        )
        self.session.add(log)
        await self.session.flush()
        return log

    async def cashback_logs(self, client_id: int) -> list[CashbackLog]:
        """Full cashback history for a client, newest first."""
        rows = await self.session.execute(
            select(CashbackLog)
            .where(CashbackLog.client_id == client_id)
            .order_by(CashbackLog.id.desc())
        )
        return list(rows.scalars().all())

    async def debtors(self) -> list[Client]:
        """Clients who currently owe us money (balance < 0)."""
        rows = await self.session.execute(
            select(Client).where(Client.balance < 0).order_by(Client.balance)
        )
        return list(rows.scalars().all())

    async def birthdays(self, month: int, day: int) -> list[Client]:
        """Clients whose birth_date falls on the given month/day."""
        rows = await self.session.execute(
            select(Client).where(
                Client.birth_date.is_not(None),
                func.extract("month", Client.birth_date) == month,
                func.extract("day", Client.birth_date) == day,
            )
        )
        return list(rows.scalars().all())


# ----------------------------------------------------------------------------- #
# Products
# ----------------------------------------------------------------------------- #
class ProductRepo(_SessionRepo):
    """Data access for the `products` table."""

    async def list(self) -> list[Product]:
        rows = await self.session.execute(select(Product).order_by(Product.name))
        return list(rows.scalars().all())

    async def get(self, product_id: int) -> Optional[Product]:
        return await self.session.get(Product, product_id)

    async def add(
        self,
        name: str,
        quantity: int,
        price: Decimal,
        cargo: Decimal,
        cargo_price: Decimal,
    ) -> Product:
        product = Product(
            name=name, quantity=quantity, price=price, cargo=cargo,
            cargo_price=cargo_price,
        )
        self.session.add(product)
        await self.session.flush()
        return product

    async def update(
        self,
        product_id: int,
        name: str,
        quantity: int,
        price: Decimal,
        cargo: Decimal,
        cargo_price: Decimal,
    ) -> Optional[Product]:
        product = await self.get(product_id)
        if product is None:
            return None
        product.name = name
        product.quantity = quantity
        product.price = price
        product.cargo = cargo
        product.cargo_price = cargo_price
        await self.session.flush()
        return product

    async def delete(self, product_id: int) -> bool:
        product = await self.get(product_id)
        if product is None:
            return False
        await self.session.delete(product)
        return True


# ----------------------------------------------------------------------------- #
# Payment types (dynamic)
# ----------------------------------------------------------------------------- #
class PaymentTypeRepo(_SessionRepo):
    """Data access for the `payment_types` table."""

    async def list(self) -> list[PaymentType]:
        rows = await self.session.execute(
            select(PaymentType).order_by(PaymentType.name)
        )
        return list(rows.scalars().all())

    async def get(self, payment_type_id: int) -> Optional[PaymentType]:
        return await self.session.get(PaymentType, payment_type_id)

    async def add(
        self, name: str, is_debt: bool, is_cashback: bool = False,
        is_change: bool = False,
    ) -> PaymentType:
        pt = PaymentType(
            name=name, is_debt=is_debt, is_cashback=is_cashback, is_change=is_change
        )
        self.session.add(pt)
        await self.session.flush()
        return pt

    async def update(
        self, payment_type_id: int, name: str, is_debt: bool,
        is_cashback: bool = False, is_change: bool = False,
    ) -> Optional[PaymentType]:
        pt = await self.get(payment_type_id)
        if pt is None:
            return None
        pt.name = name
        pt.is_debt = is_debt
        pt.is_cashback = is_cashback
        pt.is_change = is_change
        await self.session.flush()
        return pt

    async def delete(self, payment_type_id: int) -> bool:
        pt = await self.get(payment_type_id)
        if pt is None:
            return False
        await self.session.delete(pt)
        return True


# ----------------------------------------------------------------------------- #
# Currencies + daily rates
# ----------------------------------------------------------------------------- #
class CurrencyRepo(_SessionRepo):
    """Data access for `currencies` and `currency_rates` (base UZS, rate = so'm/unit)."""

    async def list(self) -> list[Currency]:
        rows = await self.session.execute(
            select(Currency).order_by(Currency.is_base.desc(), Currency.code)
        )
        return list(rows.scalars().all())

    async def get(self, currency_id: int) -> Optional[Currency]:
        return await self.session.get(Currency, currency_id)

    async def base(self) -> Optional[Currency]:
        rows = await self.session.execute(
            select(Currency).where(Currency.is_base.is_(True))
        )
        return rows.scalars().first()

    async def by_code(self, code: str) -> Optional[Currency]:
        rows = await self.session.execute(
            select(Currency).where(Currency.code == code.upper().strip())
        )
        return rows.scalars().first()

    async def add(self, code: str, name: str, is_base: bool = False) -> Currency:
        c = Currency(code=code.upper().strip(), name=name, is_base=is_base)
        self.session.add(c)
        await self.session.flush()
        return c

    async def delete(self, currency_id: int) -> bool:
        c = await self.get(currency_id)
        if c is None or c.is_base:
            return False
        await self.session.delete(c)
        return True

    async def set_rate(
        self, currency_id: int, rate_date: dt.date, rate: Decimal
    ) -> CurrencyRate:
        """Upsert the rate for a currency on a day."""
        rows = await self.session.execute(
            select(CurrencyRate).where(
                CurrencyRate.currency_id == currency_id,
                CurrencyRate.rate_date == rate_date,
            )
        )
        row = rows.scalars().first()
        if row is None:
            row = CurrencyRate(
                currency_id=currency_id, rate_date=rate_date, rate=rate
            )
            self.session.add(row)
        else:
            row.rate = rate
        await self.session.flush()
        return row

    async def rates_on(self, rate_date: dt.date) -> list[CurrencyRate]:
        rows = await self.session.execute(
            select(CurrencyRate)
            .where(CurrencyRate.rate_date == rate_date)
            .order_by(CurrencyRate.currency_id)
        )
        return list(rows.scalars().all())

    async def effective_rates_on(self, on_date: dt.date) -> list[CurrencyRate]:
        """The rate in effect for each currency on `on_date`: the most recent
        row with rate_date <= on_date (DISTINCT ON currency). Mirrors how order
        pricing resolves rates, so the UI converts the same way the books do."""
        rows = await self.session.execute(
            select(CurrencyRate)
            .where(CurrencyRate.rate_date <= on_date)
            .order_by(CurrencyRate.currency_id, CurrencyRate.rate_date.desc())
            .distinct(CurrencyRate.currency_id)
        )
        return list(rows.scalars().all())

    async def rate_history(self, currency_id: int, limit: int = 60) -> list[CurrencyRate]:
        rows = await self.session.execute(
            select(CurrencyRate)
            .where(CurrencyRate.currency_id == currency_id)
            .order_by(CurrencyRate.rate_date.desc())
            .limit(limit)
        )
        return list(rows.scalars().all())

    async def resolve_rate(
        self, currency_id: int, on_date: dt.date
    ) -> Optional[Decimal]:
        """so'm per 1 unit on/just-before `on_date`. Base currency -> 1; else the
        most recent rate with rate_date <= on_date, or None if none set."""
        currency = await self.get(currency_id)
        if currency is None:
            return None
        if currency.is_base:
            return Decimal(1)
        rows = await self.session.execute(
            select(CurrencyRate.rate)
            .where(
                CurrencyRate.currency_id == currency_id,
                CurrencyRate.rate_date <= on_date,
            )
            .order_by(CurrencyRate.rate_date.desc())
            .limit(1)
        )
        rate = rows.scalars().first()
        return Decimal(rate) if rate is not None else None


# ----------------------------------------------------------------------------- #
# Expenses
# ----------------------------------------------------------------------------- #
class ExpenseCategoryRepo(_SessionRepo):
    """Data access for the `expense_categories` lookup table."""

    async def list(self) -> list[ExpenseCategory]:
        rows = await self.session.execute(
            select(ExpenseCategory).order_by(ExpenseCategory.name)
        )
        return list(rows.scalars().all())

    async def get(self, category_id: int) -> Optional[ExpenseCategory]:
        return await self.session.get(ExpenseCategory, category_id)

    async def add(self, name: str) -> ExpenseCategory:
        cat = ExpenseCategory(name=name)
        self.session.add(cat)
        await self.session.flush()
        return cat

    async def delete(self, category_id: int) -> bool:
        cat = await self.get(category_id)
        if cat is None:
            return False
        await self.session.delete(cat)
        return True


class ExpenseError(Exception):
    """Raised on invalid expense input (bad currency / missing rate)."""


class ExpenseRepo(_SessionRepo):
    """Data access for the `expenses` table (multi-currency, base-converted)."""

    def __init__(self, session: AsyncSession, currencies: "CurrencyRepo") -> None:
        super().__init__(session)
        self._currencies = currencies

    async def add(
        self,
        amount: Decimal,
        currency_id: int,
        payment_type_id: int,
        note: Optional[str],
        admin_id: int,
        category_id: Optional[int] = None,
    ) -> Expense:
        currency = await self._currencies.get(currency_id)
        if currency is None:
            raise ExpenseError(f"currency {currency_id} not found")
        pt = await self.session.get(PaymentType, payment_type_id)
        if pt is None:
            raise ExpenseError(f"payment type {payment_type_id} not found")
        if pt.is_debt or pt.is_cashback or pt.is_change:
            # only real cash-outs (Cash / Card / transfer) make sense for an
            # expense; debt/cashback/change types don't move the till this way.
            raise ExpenseError(f"'{pt.name}' cannot be used for an expense")
        amount = Decimal(amount).quantize(Decimal("0.01"))
        if amount <= 0:
            raise ExpenseError("amount must be positive")
        rate = await self._currencies.resolve_rate(currency_id, dt.date.today())
        if rate is None:
            raise ExpenseError(f"no exchange rate set for {currency.code}")
        exp = Expense(
            currency_id=currency_id, amount=amount, rate=Decimal(rate),
            amount_base=(amount * Decimal(rate)).quantize(Decimal("0.01")),
            note=note, admin_id=admin_id, category_id=category_id,
            payment_type_id=payment_type_id,
        )
        self.session.add(exp)
        await self.session.flush()
        return exp

    async def list(
        self,
        date_from: Optional[dt.datetime] = None,
        date_to: Optional[dt.datetime] = None,
        limit: int = 200,
    ) -> list[Expense]:
        stmt = select(Expense).order_by(Expense.id.desc()).limit(limit)
        if date_from is not None:
            stmt = stmt.where(Expense.created_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(Expense.created_at < date_to)
        rows = await self.session.execute(stmt)
        return list(rows.scalars().all())

    async def get(self, expense_id: int) -> Optional[Expense]:
        # SELECT (not session.get) so joined currency/admin load in this awaited
        # query — serialization must not lazy-load in async.
        rows = await self.session.execute(
            select(Expense).where(Expense.id == expense_id)
        )
        return rows.scalars().first()

    async def delete(self, expense_id: int) -> bool:
        exp = await self.get(expense_id)
        if exp is None:
            return False
        await self.session.delete(exp)
        return True

    async def total(self, date_from=None, date_to=None) -> Decimal:
        stmt = select(func.coalesce(func.sum(Expense.amount_base), 0))
        if date_from is not None:
            stmt = stmt.where(Expense.created_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(Expense.created_at < date_to)
        return Decimal((await self.session.execute(stmt)).scalar_one())


# ----------------------------------------------------------------------------- #
# Orders
# ----------------------------------------------------------------------------- #
class OrderError(Exception):
    """Raised on invalid order input (bad refs, insufficient stock)."""


class OrderRepo(_SessionRepo):
    """Data access for `orders` and `order_items`."""

    def __init__(
        self, session: AsyncSession, clients: "ClientRepo", currencies: "CurrencyRepo"
    ) -> None:
        super().__init__(session)
        self._clients = clients
        self._currencies = currencies

    async def _product_rate(self, on_date: dt.date) -> Decimal:
        """so'm per 1 unit of the product-pricing currency (1 if it's the base)."""
        cur = await self._currencies.by_code(PRODUCT_CURRENCY)
        if cur is None:
            raise OrderError(f"product currency {PRODUCT_CURRENCY!r} not configured")
        rate = await self._currencies.resolve_rate(cur.id, on_date)
        if rate is None:
            raise OrderError(f"no exchange rate set for {cur.code}")
        return Decimal(rate)

    async def _apply_payments(
        self, order: Order, payments: list[dict], admin_id: int
    ) -> None:
        """Record payment lines for a (flushed) order, charge debt / redeem
        cashback, then earn cashback. Shared by create (paid) and settle. Each
        line may be in a different currency; base amounts must sum to order.total.
        Payment rows are added by order_id (not via the relationship) to avoid an
        async lazy-load of the collection on the now-persistent order.
        """
        client = await self._clients.get(order.client_id)
        total = Decimal(order.total)
        on_date = dt.date.today()
        payment_rows: list[OrderPayment] = []
        debt_lines: list[tuple[Decimal, PaymentType]] = []
        cashback_spend = Decimal(0)
        paid_base = Decimal(0)
        for line in payments:
            pt = await self.session.get(PaymentType, line["payment_type_id"])
            if pt is None:
                raise OrderError(f"payment type {line['payment_type_id']} not found")
            currency = await self._currencies.get(line["currency_id"])
            if currency is None:
                raise OrderError(f"currency {line['currency_id']} not found")
            amount = Decimal(line["amount"]).quantize(Decimal("0.01"))
            if amount <= 0:
                raise OrderError("payment amount must be positive")
            rate = await self._currencies.resolve_rate(currency.id, on_date)
            if rate is None:
                raise OrderError(f"no exchange rate set for {currency.code}")
            amount_base = (amount * Decimal(rate)).quantize(Decimal("0.01"))
            # a change line is money handed back: driven per-line now (chosen
            # Cash/Card method + a "money back" flag), with the legacy is_change
            # payment type kept as a fallback trigger for old data.
            is_change = bool(line.get("is_change")) or pt.is_change
            if is_change:
                if pt.is_debt or pt.is_cashback:
                    raise OrderError("change cannot come from a debt or cashback type")
                # stored negative so it subtracts from the paid total and nets
                # out of the method's till (e.g. 100 cash − 30 change = 70)
                amount = -amount
                amount_base = -amount_base
            payment_rows.append(OrderPayment(
                order_id=order.id, payment_type_id=pt.id, currency_id=currency.id,
                amount=amount, rate=Decimal(rate), amount_base=amount_base,
            ))
            if pt.is_debt:
                debt_lines.append((amount_base, pt))
            if pt.is_cashback:
                if not currency.is_base:
                    raise OrderError("cashback can only be redeemed in the base currency")
                cashback_spend += amount_base
            paid_base += amount_base
        # tolerate ≤1 so'm of independent per-line rounding across currencies
        if abs(paid_base - total) > Decimal("0.01") * len(payment_rows):
            raise OrderError(
                f"payments ({paid_base}) must sum to the order total ({total})"
            )
        if cashback_spend > Decimal(client.cashback):
            raise OrderError(
                f"not enough cashback ({client.cashback} available, "
                f"{cashback_spend} requested)"
            )
        self.session.add_all(payment_rows)
        await self.session.flush()

        for amount_base, pt in debt_lines:
            if await self._clients.adjust_balance(
                client_id=order.client_id, change=-amount_base, reason="order_debt",
                admin_id=admin_id, note=f"Order #{order.id} on debt ({pt.name})",
                order_id=order.id,
            ) is None:
                raise OrderError("failed to charge client balance")
        if cashback_spend > 0:
            if await self._clients.adjust_cashback(
                client_id=order.client_id, change=-cashback_spend, reason="spend",
                admin_id=admin_id, note=f"Order #{order.id} cashback redeemed",
                order_id=order.id,
            ) is None:
                raise OrderError("not enough cashback")
        # earn only on the amount actually paid (not on cashback redeemed)
        earn_base = total - cashback_spend
        earned = (earn_base * Decimal(order.cashback_percent) / Decimal(100)).quantize(Decimal("0.01"))
        if earned > 0:
            await self._clients.adjust_cashback(
                client_id=order.client_id, change=earned, reason="earn",
                admin_id=admin_id, note=f"Order #{order.id} cashback earned",
                order_id=order.id,
            )

    async def _build_items(
        self, items: list[dict]
    ) -> tuple[Decimal, list[OrderItem]]:
        """Snapshot prices and decrement stock for each line; return the
        (subtotal, OrderItem rows). Raises OrderError on bad refs / short stock.
        Shared by create and replace.
        """
        # Product prices are in PRODUCT_CURRENCY (e.g. USD); convert each line to
        # base so'm at today's rate and snapshot it, so the books stay in so'm.
        prod_rate = await self._product_rate(dt.date.today())
        subtotal = Decimal(0)
        order_items: list[OrderItem] = []
        for line in items:
            product = await self.session.get(Product, line["product_id"])
            if product is None:
                raise OrderError(f"product {line['product_id']} not found")
            qty = int(line["quantity"])
            if qty <= 0:
                raise OrderError("quantity must be positive")
            if product.quantity < qty:
                raise OrderError(
                    f"not enough stock for {product.name!r} "
                    f"({product.quantity} left, {qty} requested)"
                )
            product.quantity -= qty
            # full selling price (price + cargo) and cost, converted to so'm
            full = ((Decimal(product.price) + Decimal(product.cargo)) * prod_rate).quantize(Decimal("0.01"))
            cost = (Decimal(product.cargo_price) * prod_rate).quantize(Decimal("0.01"))
            order_items.append(OrderItem(
                product_id=product.id, quantity=qty, price=full, cargo_price=cost,
            ))
            subtotal += full * qty
        return subtotal, order_items

    async def _reverse(self, order: Order) -> None:
        """Undo an order's side effects: restore stock and roll back the client's
        balance and cashback to before the sale, deleting the order's ledger rows.
        Shared by delete and replace (which then re-applies fresh effects).
        """
        for item in order.items:
            product = await self.session.get(Product, item.product_id)
            if product is not None:
                product.quantity += item.quantity
        bal_rows = (await self.session.execute(
            select(BalanceLog).where(BalanceLog.order_id == order.id)
        )).scalars().all()
        cb_rows = (await self.session.execute(
            select(CashbackLog).where(CashbackLog.order_id == order.id)
        )).scalars().all()
        client = await self._clients.get(order.client_id)
        if client is not None:
            net_bal = sum((Decimal(r.change) for r in bal_rows), Decimal(0))
            net_cb = sum((Decimal(r.change) for r in cb_rows), Decimal(0))
            # debt charged the balance and cashback was earned/redeemed against
            # this order — subtract both deltas to restore the pre-sale state.
            client.balance = Decimal(client.balance) - net_bal
            client.cashback = Decimal(client.cashback) - net_cb
        for r in (*bal_rows, *cb_rows):
            await self.session.delete(r)
        await self.session.flush()

    async def create(
        self,
        client_id: int,
        cashback_percent: Decimal,
        items: list[dict],
        payments: list[dict],
        admin_id: int,
        status: str = "paid",
        due_date: Optional[dt.date] = None,
    ) -> Order:
        """Create an order, snapshotting prices and decrementing stock.

        A `paid` order is settled now: `payments` (base amounts) must sum to the
        total; debt lines charge the balance, cashback lines redeem cashback, and
        `cashback_percent` is earned. A `delivery` order is delivered now and paid
        later: it takes no payments, is not booked as revenue until settled, and
        stores an optional `due_date`. Raises OrderError on bad input.
        """
        client = await self._clients.get(client_id)
        if client is None:
            raise OrderError(f"client {client_id} not found")
        if not items:
            raise OrderError("order has no items")
        if status not in ("paid", "delivery"):
            raise OrderError("invalid order status")
        cashback_percent = Decimal(cashback_percent or 0)
        if cashback_percent < 0 or cashback_percent > 100:
            raise OrderError("cashback percent must be between 0 and 100")

        # Build line items first (snapshot price/cost, decrement stock) and hand
        # them to the constructor on a still-transient Order (avoids async
        # lazy-load of the collection).
        subtotal, order_items = await self._build_items(items)

        total = subtotal.quantize(Decimal("0.01"))  # cashback does NOT reduce total
        now = dt.datetime.now(dt.timezone.utc)
        order = Order(
            client_id=client_id, admin_id=admin_id,
            cashback_percent=cashback_percent, subtotal=subtotal, total=total,
            items=order_items, status=status,
            # due_date = expected payment date: for a delivery (paid later) or for
            # a paid order that includes a debt line (when the debt is due).
            due_date=due_date,
            paid_at=now if status == "paid" else None,
        )
        self.session.add(order)
        await self.session.flush()  # assigns order.id

        if status == "paid":
            if not payments:
                raise OrderError("order has no payments")
            await self._apply_payments(order, payments, admin_id)
        return order

    async def settle(
        self, order_id: int, payments: list[dict], admin_id: int
    ) -> Order:
        """Settle a delivery order: record payment(s) now and mark it paid."""
        order = await self.get(order_id)
        if order is None:
            raise OrderError("order not found")
        if order.status != "delivery":
            raise OrderError("only delivery orders can be settled")
        if not payments:
            raise OrderError("order has no payments")
        await self._apply_payments(order, payments, admin_id)
        order.status = "paid"
        order.paid_at = dt.datetime.now(dt.timezone.utc)
        await self.session.flush()
        return order

    async def delete(self, order_id: int) -> bool:
        """Delete an order, reversing all its effects: restore stock and return
        any debt/cashback to the client. Returns False if the order is gone."""
        order = await self.get(order_id)
        if order is None:
            return False
        await self._reverse(order)
        await self.session.delete(order)  # cascades items + payments
        await self.session.flush()
        return True

    async def replace(
        self,
        order_id: int,
        client_id: int,
        cashback_percent: Decimal,
        items: list[dict],
        payments: list[dict],
        admin_id: int,
        status: str = "paid",
        due_date: Optional[dt.date] = None,
    ) -> Order:
        """Edit an order in place: reverse its old effects (stock/balance/cashback)
        and apply the new ones, keeping the same id, creator and created_at. The
        `payments`/`status` rules match create. Raises OrderError on bad input.
        """
        order = await self.get(order_id)
        if order is None:
            raise OrderError("order not found")
        client = await self._clients.get(client_id)
        if client is None:
            raise OrderError(f"client {client_id} not found")
        if not items:
            raise OrderError("order has no items")
        if status not in ("paid", "delivery"):
            raise OrderError("invalid order status")
        cashback_percent = Decimal(cashback_percent or 0)
        if cashback_percent < 0 or cashback_percent > 100:
            raise OrderError("cashback percent must be between 0 and 100")

        # Roll back the old sale, then drop its lines (delete-orphan cascade).
        await self._reverse(order)
        order.items.clear()
        order.payments.clear()
        await self.session.flush()

        subtotal, order_items = await self._build_items(items)
        order.client_id = client_id
        order.cashback_percent = cashback_percent
        order.subtotal = subtotal
        order.total = subtotal.quantize(Decimal("0.01"))
        order.status = status
        order.due_date = due_date
        order.items = order_items
        if status == "paid":
            if not payments:
                raise OrderError("order has no payments")
            # keep the original paid date if it was already paid
            order.paid_at = order.paid_at or dt.datetime.now(dt.timezone.utc)
        else:
            order.paid_at = None
        await self.session.flush()

        if status == "paid":
            await self._apply_payments(order, payments, admin_id)
        return order

    async def get(self, order_id: int) -> Optional[Order]:
        # Use a SELECT (not session.get) so the configured eager loaders
        # (client/admin joined, items & payments selectin, item.product &
        # payment.payment_type joined) fire inside this awaited query —
        # serialization must not lazy-load in async.
        rows = await self.session.execute(
            select(Order).where(Order.id == order_id)
        )
        return rows.scalars().first()

    async def list(
        self,
        date_from: Optional[dt.datetime] = None,
        date_to: Optional[dt.datetime] = None,
        status: Optional[str] = None,
        limit: int = 200,
    ) -> list[Order]:
        stmt = select(Order).order_by(Order.id.desc()).limit(limit)
        # Filter on the same date the list shows (paid_at when settled, else
        # created_at) so an order created one day but paid the next lands in the
        # window matching its displayed time.
        list_date = func.coalesce(Order.paid_at, Order.created_at)
        if date_from is not None:
            stmt = stmt.where(list_date >= date_from)
        if date_to is not None:
            stmt = stmt.where(list_date < date_to)
        if status is not None:
            stmt = stmt.where(Order.status == status)
        rows = await self.session.execute(stmt)
        return list(rows.scalars().all())


# ----------------------------------------------------------------------------- #
# Analytics
# ----------------------------------------------------------------------------- #
class AnalyticsRepo(_SessionRepo):
    """Aggregation queries; all accept an optional [date_from, date_to) window."""

    def _scope(self, stmt, date_from, date_to):
        # only paid orders count as revenue, dated by when they were paid
        # (delivery orders are excluded until settled)
        stmt = stmt.where(Order.status == "paid")
        if date_from is not None:
            stmt = stmt.where(Order.paid_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(Order.paid_at < date_to)
        return stmt

    def _expense_scope(self, stmt, date_from, date_to):
        # expenses are windowed by their own date (created_at), not order paid_at,
        # and only attributed ones (with a payment type) net out of the till
        stmt = stmt.where(Expense.payment_type_id.isnot(None))
        if date_from is not None:
            stmt = stmt.where(Expense.created_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(Expense.created_at < date_to)
        return stmt

    async def summary(self, date_from=None, date_to=None) -> dict:
        # revenue = sum of order totals; cost = sum(cargo_price*qty) over items;
        # the cost join applies the same date window through the order.
        rev_stmt = self._scope(
            select(
                func.coalesce(func.sum(Order.total), 0),
                func.count(Order.id),
            ),
            date_from,
            date_to,
        )
        revenue, order_count = (await self.session.execute(rev_stmt)).one()

        cost_stmt = self._scope(
            select(func.coalesce(func.sum(OrderItem.cargo_price * OrderItem.quantity), 0))
            .select_from(OrderItem)
            .join(Order, OrderItem.order_id == Order.id),
            date_from,
            date_to,
        )
        cost = (await self.session.execute(cost_stmt)).scalar_one()

        items_stmt = self._scope(
            select(func.coalesce(func.sum(OrderItem.quantity), 0))
            .select_from(OrderItem)
            .join(Order, OrderItem.order_id == Order.id),
            date_from,
            date_to,
        )
        items_sold = (await self.session.execute(items_stmt)).scalar_one()

        revenue = Decimal(revenue)
        cost = Decimal(cost)
        order_count = int(order_count)
        profit = revenue - cost

        # store expenses in the window (by expense date)
        exp_stmt = select(func.coalesce(func.sum(Expense.amount_base), 0))
        if date_from is not None:
            exp_stmt = exp_stmt.where(Expense.created_at >= date_from)
        if date_to is not None:
            exp_stmt = exp_stmt.where(Expense.created_at < date_to)
        expenses = Decimal((await self.session.execute(exp_stmt)).scalar_one())

        return {
            "revenue": revenue,
            "cost": cost,
            "profit": profit,
            "order_count": order_count,
            "items_sold": int(items_sold),
            "avg_order_value": (revenue / order_count) if order_count else Decimal(0),
            "expenses": expenses,
            "net_profit": profit - expenses,
        }

    async def timeseries(self, date_from=None, date_to=None) -> list[dict]:
        """Revenue & profit grouped by calendar day (UTC).

        Revenue and cost are summed in SEPARATE queries: joining orders to their
        items would fan out each order's total across its line rows and inflate
        revenue. We aggregate each independently by day, then merge.
        """
        day = func.date(Order.paid_at).label("day")
        rev_rows = await self.session.execute(
            self._scope(
                select(day, func.coalesce(func.sum(Order.total), 0))
                .group_by(day),
                date_from,
                date_to,
            )
        )
        cost_rows = await self.session.execute(
            self._scope(
                select(
                    day,
                    func.coalesce(
                        func.sum(OrderItem.cargo_price * OrderItem.quantity), 0
                    ),
                )
                .select_from(Order)
                .join(OrderItem, OrderItem.order_id == Order.id)
                .group_by(day),
                date_from,
                date_to,
            )
        )
        costs = {str(d): Decimal(c) for d, c in cost_rows.all()}
        out = []
        for d, revenue in rev_rows.all():
            revenue = Decimal(revenue)
            cost = costs.get(str(d), Decimal(0))
            out.append(
                {"day": str(d), "revenue": revenue, "profit": revenue - cost}
            )
        out.sort(key=lambda r: r["day"])
        return out

    async def top_products(self, date_from=None, date_to=None, limit=10) -> list[dict]:
        qty = func.sum(OrderItem.quantity).label("quantity")
        revenue = func.sum(OrderItem.price * OrderItem.quantity).label("revenue")
        profit = func.sum(
            (OrderItem.price - OrderItem.cargo_price) * OrderItem.quantity
        ).label("profit")
        stmt = self._scope(
            select(Product.id, Product.name, qty, revenue, profit)
            .select_from(OrderItem)
            .join(Order, OrderItem.order_id == Order.id)
            .join(Product, OrderItem.product_id == Product.id)
            .group_by(Product.id, Product.name)
            .order_by(qty.desc())
            .limit(limit),
            date_from,
            date_to,
        )
        rows = await self.session.execute(stmt)
        return [
            {
                "product_id": pid,
                "name": name,
                "quantity": int(q),
                "revenue": Decimal(r),
                "profit": Decimal(p),
            }
            for pid, name, q, r, p in rows.all()
        ]

    async def top_clients(self, date_from=None, date_to=None, limit=10) -> list[dict]:
        spent = func.coalesce(func.sum(Order.total), 0).label("spent")
        cnt = func.count(Order.id).label("order_count")
        stmt = self._scope(
            select(Client.id, Client.name, spent, cnt)
            .select_from(Order)
            .join(Client, Order.client_id == Client.id)
            .group_by(Client.id, Client.name)
            .order_by(spent.desc())
            .limit(limit),
            date_from,
            date_to,
        )
        rows = await self.session.execute(stmt)
        return [
            {
                "client_id": cid,
                "name": name,
                "spent": Decimal(s),
                "order_count": int(c),
            }
            for cid, name, s, c in rows.all()
        ]

    async def payment_breakdown(self, date_from=None, date_to=None) -> list[dict]:
        # Grouped by payment type only; totals in base so'm (a common unit), since
        # one type may collect across currencies. Expenses paid via a type are
        # netted out so the total reflects money in − out. Currencies have their
        # own breakdown (see currency_breakdown).
        total = func.coalesce(func.sum(OrderPayment.amount_base), 0).label("total")
        cnt = func.count(func.distinct(OrderPayment.order_id)).label("order_count")
        stmt = self._scope(
            select(PaymentType.id, PaymentType.name, PaymentType.is_debt, total, cnt)
            .select_from(OrderPayment)
            .join(Order, OrderPayment.order_id == Order.id)
            .join(PaymentType, OrderPayment.payment_type_id == PaymentType.id)
            .group_by(PaymentType.id, PaymentType.name, PaymentType.is_debt),
            date_from,
            date_to,
        )
        rows = await self.session.execute(stmt)
        agg: dict[int, dict] = {}
        for pid, name, is_debt, t, c in rows.all():
            agg[pid] = {
                "payment_type_id": pid,
                "name": name,
                "is_debt": bool(is_debt),
                "total": Decimal(t),
                "order_count": int(c),
            }
        # subtract expenses attributed to each payment type
        exp_stmt = self._expense_scope(
            select(
                PaymentType.id, PaymentType.name, PaymentType.is_debt,
                func.coalesce(func.sum(Expense.amount_base), 0),
            )
            .select_from(Expense)
            .join(PaymentType, Expense.payment_type_id == PaymentType.id)
            .group_by(PaymentType.id, PaymentType.name, PaymentType.is_debt),
            date_from,
            date_to,
        )
        for pid, name, is_debt, exp_total in (await self.session.execute(exp_stmt)).all():
            row = agg.get(pid)
            if row is None:
                row = agg[pid] = {
                    "payment_type_id": pid,
                    "name": name,
                    "is_debt": bool(is_debt),
                    "total": Decimal(0),
                    "order_count": 0,
                }
            row["total"] -= Decimal(exp_total)
        return sorted(agg.values(), key=lambda r: r["total"], reverse=True)

    async def currency_breakdown(self, date_from=None, date_to=None) -> list[dict]:
        # Per-currency × payment-method totals: original units (sum amount) + base
        # so'm. Expenses paid via a method are netted out so each bucket reflects
        # money in − out. The frontend groups these by currency to show each
        # currency split by method (Cash / Card / …).
        total = func.coalesce(func.sum(OrderPayment.amount), 0).label("total")
        total_base = func.coalesce(func.sum(OrderPayment.amount_base), 0).label("total_base")
        cnt = func.count(func.distinct(OrderPayment.order_id)).label("order_count")
        stmt = self._scope(
            select(
                Currency.id, Currency.code,
                PaymentType.id, PaymentType.name,
                total, total_base, cnt,
            )
            .select_from(OrderPayment)
            .join(Order, OrderPayment.order_id == Order.id)
            .join(Currency, OrderPayment.currency_id == Currency.id)
            .join(PaymentType, OrderPayment.payment_type_id == PaymentType.id)
            .group_by(Currency.id, Currency.code, PaymentType.id, PaymentType.name),
            date_from,
            date_to,
        )
        rows = await self.session.execute(stmt)
        agg: dict[tuple[int, int], dict] = {}
        for cid, code, pid, name, t, tb, c in rows.all():
            agg[(cid, pid)] = {
                "currency_id": cid,
                "currency_code": code,
                "payment_type_id": pid,
                "name": name,
                "total": Decimal(t),
                "total_base": Decimal(tb),
                "order_count": int(c),
            }
        # subtract expenses attributed to each (currency, payment type)
        exp_stmt = self._expense_scope(
            select(
                Currency.id, Currency.code,
                PaymentType.id, PaymentType.name,
                func.coalesce(func.sum(Expense.amount), 0),
                func.coalesce(func.sum(Expense.amount_base), 0),
            )
            .select_from(Expense)
            .join(Currency, Expense.currency_id == Currency.id)
            .join(PaymentType, Expense.payment_type_id == PaymentType.id)
            .group_by(Currency.id, Currency.code, PaymentType.id, PaymentType.name),
            date_from,
            date_to,
        )
        for cid, code, pid, name, et, etb in (await self.session.execute(exp_stmt)).all():
            row = agg.get((cid, pid))
            if row is None:
                row = agg[(cid, pid)] = {
                    "currency_id": cid,
                    "currency_code": code,
                    "payment_type_id": pid,
                    "name": name,
                    "total": Decimal(0),
                    "total_base": Decimal(0),
                    "order_count": 0,
                }
            row["total"] -= Decimal(et)
            row["total_base"] -= Decimal(etb)
        return sorted(
            agg.values(), key=lambda r: (r["currency_code"], -r["total"])
        )

    async def debt(self, date_from=None, date_to=None) -> dict:
        # Total outstanding debt is point-in-time (current balances), not windowed.
        outstanding = (
            await self.session.execute(
                select(func.coalesce(func.sum(-Client.balance), 0)).where(
                    Client.balance < 0
                )
            )
        ).scalar_one()

        # Debt issued / payments collected ARE windowed (on BalanceLog.created_at).
        def _log_scope(stmt):
            if date_from is not None:
                stmt = stmt.where(BalanceLog.created_at >= date_from)
            if date_to is not None:
                stmt = stmt.where(BalanceLog.created_at < date_to)
            return stmt

        debt_issued = (
            await self.session.execute(
                _log_scope(
                    select(func.coalesce(func.sum(-BalanceLog.change), 0)).where(
                        BalanceLog.reason == "order_debt"
                    )
                )
            )
        ).scalar_one()

        payments_collected = (
            await self.session.execute(
                _log_scope(
                    select(func.coalesce(func.sum(BalanceLog.change), 0)).where(
                        BalanceLog.reason == "payment"
                    )
                )
            )
        ).scalar_one()

        # cashback outstanding liability is point-in-time (sum of cashback balances)
        cashback_outstanding = (
            await self.session.execute(
                select(func.coalesce(func.sum(Client.cashback), 0)).where(
                    Client.cashback > 0
                )
            )
        ).scalar_one()

        # unpaid delivery orders (point-in-time) + the pending list
        delivery_outstanding = (
            await self.session.execute(
                select(func.coalesce(func.sum(Order.total), 0)).where(
                    Order.status == "delivery"
                )
            )
        ).scalar_one()
        drows = await self.session.execute(
            select(Order).where(Order.status == "delivery").order_by(Order.due_date)
        )
        deliveries = [
            {
                "order_id": o.id,
                "client_name": o.client.name,
                "total": Decimal(o.total),
                "due_date": o.due_date,
            }
            for o in drows.scalars().all()
        ]

        return {
            "outstanding_debt": Decimal(outstanding),
            "debt_issued": Decimal(debt_issued),
            "payments_collected": Decimal(payments_collected),
            "cashback_outstanding": Decimal(cashback_outstanding),
            "delivery_outstanding": Decimal(delivery_outstanding),
            "deliveries": deliveries,
        }


# ----------------------------------------------------------------------------- #
# SMS broadcasts
# ----------------------------------------------------------------------------- #
class SmsRepo(_SessionRepo):
    """Data access for `sms_broadcasts` and `sms_messages`."""

    async def create(self, **fields) -> SmsBroadcast:
        b = SmsBroadcast(**fields)
        self.session.add(b)
        await self.session.flush()
        return b

    async def list(self, limit: int = 200) -> list[SmsBroadcast]:
        rows = await self.session.execute(
            select(SmsBroadcast).order_by(SmsBroadcast.id.desc()).limit(limit)
        )
        return list(rows.scalars().all())

    async def get(self, broadcast_id: int) -> Optional[SmsBroadcast]:
        return await self.session.get(SmsBroadcast, broadcast_id)

    async def cancel(self, broadcast_id: int) -> Optional[SmsBroadcast]:
        b = await self.get(broadcast_id)
        if b is None:
            return None
        if b.status in ("scheduled", "sending"):
            b.status = "canceled"
            await self.session.flush()
        return b

    async def due(self, now: dt.datetime) -> list[SmsBroadcast]:
        """Scheduled broadcasts whose next run time has arrived."""
        rows = await self.session.execute(
            select(SmsBroadcast).where(
                SmsBroadcast.status == "scheduled",
                SmsBroadcast.scheduled_at <= now,
            )
        )
        return list(rows.scalars().all())

    async def add_messages(self, rows: list[dict]) -> None:
        self.session.add_all([SmsMessage(**r) for r in rows])

    async def recent_messages(
        self, broadcast_id: int, limit: int = 200
    ) -> list[SmsMessage]:
        rows = await self.session.execute(
            select(SmsMessage)
            .where(SmsMessage.broadcast_id == broadcast_id)
            .order_by(SmsMessage.id.desc())
            .limit(limit)
        )
        return list(rows.scalars().all())


# ----------------------------------------------------------------------------- #
# DI root
# ----------------------------------------------------------------------------- #
@dataclass
class BaseRepo:
    """DI root. Holds the session; sub-repos hang off it as properties."""

    session: AsyncSession

    async def commit(self) -> None:
        await self.session.commit()

    async def rollback(self) -> None:
        await self.session.rollback()

    @cached_property
    def admins(self) -> AdminRepo:
        return AdminRepo(self.session)

    @cached_property
    def clients(self) -> ClientRepo:
        return ClientRepo(self.session)

    @cached_property
    def products(self) -> ProductRepo:
        return ProductRepo(self.session)

    @cached_property
    def payment_types(self) -> PaymentTypeRepo:
        return PaymentTypeRepo(self.session)

    @cached_property
    def currencies(self) -> CurrencyRepo:
        return CurrencyRepo(self.session)

    @cached_property
    def orders(self) -> OrderRepo:
        return OrderRepo(self.session, self.clients, self.currencies)

    @cached_property
    def analytics(self) -> AnalyticsRepo:
        return AnalyticsRepo(self.session)

    @cached_property
    def expenses(self) -> ExpenseRepo:
        return ExpenseRepo(self.session, self.currencies)

    @cached_property
    def expense_categories(self) -> ExpenseCategoryRepo:
        return ExpenseCategoryRepo(self.session)

    @cached_property
    def sms(self) -> SmsRepo:
        return SmsRepo(self.session)


async def get_repo():
    """FastAPI dependency yielding a BaseRepo bound to a fresh session."""
    async with SessionLocal() as session:
        yield BaseRepo(session)
