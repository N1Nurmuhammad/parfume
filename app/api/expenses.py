"""Expense endpoints: record / list / delete store expenses, plus the expense
category lookup (create / list / delete)."""

from fastapi import APIRouter, Depends, HTTPException

from ..database.models import Admin
from ..database.repo import BaseRepo, get_repo
from ..database.repo import ExpenseError
from ..schemas import (
    ExpenseCategoryIn,
    ExpenseCategoryOut,
    ExpenseIn,
    ExpenseOut,
)
from ..services.security import get_current_admin
from ._filters import date_range

router = APIRouter(prefix="/expenses", tags=["expenses"])
categories_router = APIRouter(prefix="/expense-categories", tags=["expenses"])


def _serialize(e) -> ExpenseOut:
    return ExpenseOut(
        id=e.id, amount=e.amount, currency_id=e.currency_id,
        currency_code=e.currency.code, rate=e.rate, amount_base=e.amount_base,
        payment_type_id=e.payment_type_id,
        payment_type_name=e.payment_type.name if e.payment_type else None,
        category_id=e.category_id,
        category_name=e.category.name if e.category else None,
        note=e.note, created_by=e.admin.login, created_at=e.created_at,
    )


@router.get("", response_model=list[ExpenseOut])
async def list_expenses(
    window=Depends(date_range), repo: BaseRepo = Depends(get_repo)
) -> list[ExpenseOut]:
    date_from, date_to = window
    return [_serialize(e) for e in await repo.expenses.list(date_from, date_to)]


@router.post("", response_model=ExpenseOut, status_code=201)
async def create_expense(
    body: ExpenseIn,
    repo: BaseRepo = Depends(get_repo),
    admin: Admin = Depends(get_current_admin),
) -> ExpenseOut:
    try:
        exp = await repo.expenses.add(
            body.amount, body.currency_id, body.payment_type_id,
            body.note, admin.id, body.category_id,
        )
    except ExpenseError as exc:
        await repo.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    await repo.commit()
    return _serialize(await repo.expenses.get(exp.id))


@router.put("/{expense_id}", response_model=ExpenseOut)
async def update_expense(
    expense_id: int,
    body: ExpenseIn,
    repo: BaseRepo = Depends(get_repo),
) -> ExpenseOut:
    try:
        exp = await repo.expenses.update(
            expense_id, body.amount, body.currency_id, body.payment_type_id,
            body.note, body.category_id,
        )
    except ExpenseError as exc:
        await repo.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    if exp is None:
        raise HTTPException(status_code=404, detail="expense not found")
    await repo.commit()
    return _serialize(await repo.expenses.get(exp.id))


@router.delete("/{expense_id}", status_code=204)
async def delete_expense(
    expense_id: int, repo: BaseRepo = Depends(get_repo)
) -> None:
    if not await repo.expenses.delete(expense_id):
        raise HTTPException(status_code=404, detail="expense not found")
    await repo.commit()


# ---- expense categories ----

@categories_router.get("", response_model=list[ExpenseCategoryOut])
async def list_categories(
    repo: BaseRepo = Depends(get_repo),
) -> list[ExpenseCategoryOut]:
    return [
        ExpenseCategoryOut(id=c.id, name=c.name)
        for c in await repo.expense_categories.list()
    ]


@categories_router.post("", response_model=ExpenseCategoryOut, status_code=201)
async def create_category(
    body: ExpenseCategoryIn, repo: BaseRepo = Depends(get_repo)
) -> ExpenseCategoryOut:
    cat = await repo.expense_categories.add(body.name.strip())
    await repo.commit()
    return ExpenseCategoryOut(id=cat.id, name=cat.name)


@categories_router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: int, repo: BaseRepo = Depends(get_repo)
) -> None:
    if not await repo.expense_categories.delete(category_id):
        raise HTTPException(status_code=404, detail="category not found")
    await repo.commit()
