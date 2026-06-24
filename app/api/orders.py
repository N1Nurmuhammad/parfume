"""Order endpoints: create a sale (snapshot + stock + debt) and read history."""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException

from typing import Optional

from ..database.models import Admin, Order
from ..database.repo import BaseRepo, OrderError, get_repo
from ..schemas import (
    OrderCreate,
    OrderItemOut,
    OrderOut,
    OrderPaymentOut,
    OrderSettle,
)
from ..services.security import get_current_admin
from ._filters import date_range

router = APIRouter(prefix="/orders", tags=["orders"])


def _serialize(order: Order) -> OrderOut:
    cost = sum(
        (Decimal(i.cargo_price) * i.quantity for i in order.items), Decimal(0)
    )
    return OrderOut(
        id=order.id,
        client_id=order.client_id,
        client_name=order.client.name,
        cashback_percent=order.cashback_percent,
        cashback_earned=(
            Decimal(order.total) * Decimal(order.cashback_percent) / Decimal(100)
        ).quantize(Decimal("0.01")),
        subtotal=order.subtotal,
        total=order.total,
        profit=Decimal(order.total) - cost,
        is_debt=any(p.payment_type.is_debt for p in order.payments),
        status=order.status,
        due_date=order.due_date,
        paid_at=order.paid_at,
        created_at=order.created_at,
        created_by=order.admin.login,
        items=[
            OrderItemOut(
                id=i.id,
                product_id=i.product_id,
                product_name=i.product.name,
                quantity=i.quantity,
                price=i.price,
                cargo_price=i.cargo_price,
            )
            for i in order.items
        ],
        payments=[
            OrderPaymentOut(
                id=p.id,
                payment_type_id=p.payment_type_id,
                payment_type_name=p.payment_type.name,
                is_debt=p.payment_type.is_debt,
                is_cashback=p.payment_type.is_cashback,
                amount=p.amount,
                currency_id=p.currency_id,
                currency_code=p.currency.code,
                rate=p.rate,
                amount_base=p.amount_base,
            )
            for p in order.payments
        ],
    )


@router.post("", response_model=OrderOut, status_code=201)
async def create_order(
    body: OrderCreate,
    repo: BaseRepo = Depends(get_repo),
    admin: Admin = Depends(get_current_admin),
) -> OrderOut:
    try:
        order = await repo.orders.create(
            client_id=body.client_id,
            cashback_percent=body.cashback_percent,
            items=[i.model_dump() for i in body.items],
            payments=[p.model_dump() for p in body.payments],
            admin_id=admin.id,
            status=body.status,
            due_date=body.due_date,
        )
    except OrderError as exc:
        await repo.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    await repo.commit()
    # re-fetch so relationships (client/payment_type/items.product) are loaded
    order = await repo.orders.get(order.id)
    return _serialize(order)


@router.post("/{order_id}/pay", response_model=OrderOut)
async def settle_order(
    order_id: int,
    body: OrderSettle,
    repo: BaseRepo = Depends(get_repo),
    admin: Admin = Depends(get_current_admin),
) -> OrderOut:
    """Mark a delivery order paid by recording its payment(s)."""
    try:
        order = await repo.orders.settle(
            order_id, [p.model_dump() for p in body.payments], admin.id
        )
    except OrderError as exc:
        await repo.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    await repo.commit()
    return _serialize(await repo.orders.get(order.id))


@router.get("", response_model=list[OrderOut])
async def list_orders(
    window=Depends(date_range),
    status: Optional[str] = None,
    repo: BaseRepo = Depends(get_repo),
) -> list[OrderOut]:
    date_from, date_to = window
    orders = await repo.orders.list(date_from=date_from, date_to=date_to, status=status)
    return [_serialize(o) for o in orders]


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: int, repo: BaseRepo = Depends(get_repo)
) -> OrderOut:
    order = await repo.orders.get(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="order not found")
    return _serialize(order)


@router.put("/{order_id}", response_model=OrderOut)
async def update_order(
    order_id: int,
    body: OrderCreate,
    repo: BaseRepo = Depends(get_repo),
    admin: Admin = Depends(get_current_admin),
) -> OrderOut:
    """Edit an order, reversing its old effects and applying the new ones."""
    try:
        order = await repo.orders.replace(
            order_id,
            client_id=body.client_id,
            cashback_percent=body.cashback_percent,
            items=[i.model_dump() for i in body.items],
            payments=[p.model_dump() for p in body.payments],
            admin_id=admin.id,
            status=body.status,
            due_date=body.due_date,
        )
    except OrderError as exc:
        await repo.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    await repo.commit()
    return _serialize(await repo.orders.get(order.id))


@router.delete("/{order_id}", status_code=204)
async def delete_order(
    order_id: int,
    repo: BaseRepo = Depends(get_repo),
    admin: Admin = Depends(get_current_admin),
) -> None:
    """Delete an order, restoring stock and returning any debt/cashback."""
    if not await repo.orders.delete(order_id):
        raise HTTPException(status_code=404, detail="order not found")
    await repo.commit()
