"""Client endpoints: CRUD + balance ledger (debt repayment / adjustments)."""

from fastapi import APIRouter, Depends, HTTPException

from ..database.models import Admin
from ..database.repo import BaseRepo, get_repo
from ..schemas import (
    BalanceEntryIn,
    BalanceLogOut,
    CashbackEntryIn,
    CashbackLogOut,
    ClientIn,
    ClientOut,
)
from ..services.security import get_current_admin

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=list[ClientOut])
async def list_clients(repo: BaseRepo = Depends(get_repo)) -> list[ClientOut]:
    return [ClientOut.model_validate(c) for c in await repo.clients.list()]


@router.post("", response_model=ClientOut, status_code=201)
async def create_client(
    body: ClientIn, repo: BaseRepo = Depends(get_repo)
) -> ClientOut:
    client = await repo.clients.add(
        body.name, body.phone_number, body.birth_date
    )
    await repo.commit()
    return ClientOut.model_validate(client)


@router.get("/{client_id}", response_model=ClientOut)
async def get_client(
    client_id: int, repo: BaseRepo = Depends(get_repo)
) -> ClientOut:
    client = await repo.clients.get(client_id)
    if client is None:
        raise HTTPException(status_code=404, detail="client not found")
    return ClientOut.model_validate(client)


@router.put("/{client_id}", response_model=ClientOut)
async def update_client(
    client_id: int, body: ClientIn, repo: BaseRepo = Depends(get_repo)
) -> ClientOut:
    client = await repo.clients.update(
        client_id, body.name, body.phone_number, body.birth_date
    )
    if client is None:
        raise HTTPException(status_code=404, detail="client not found")
    await repo.commit()
    return ClientOut.model_validate(client)


@router.delete("/{client_id}", status_code=204)
async def delete_client(
    client_id: int, repo: BaseRepo = Depends(get_repo)
) -> None:
    if not await repo.clients.delete(client_id):
        raise HTTPException(status_code=404, detail="client not found")
    await repo.commit()


@router.post("/{client_id}/balance", response_model=BalanceLogOut, status_code=201)
async def add_balance_entry(
    client_id: int,
    body: BalanceEntryIn,
    repo: BaseRepo = Depends(get_repo),
    admin: Admin = Depends(get_current_admin),
) -> BalanceLogOut:
    """Record a payment / adjustment, stamped with the acting admin + time."""
    log = await repo.clients.adjust_balance(
        client_id=client_id,
        change=body.change,
        reason=body.reason,
        admin_id=admin.id,
        note=body.note,
    )
    if log is None:
        raise HTTPException(status_code=404, detail="client not found")
    await repo.commit()
    return BalanceLogOut(
        id=log.id,
        change=log.change,
        balance_after=log.balance_after,
        reason=log.reason,
        order_id=log.order_id,
        note=log.note,
        admin_id=log.admin_id,
        admin_login=admin.login,
        created_at=log.created_at,
    )


@router.get("/{client_id}/balance-logs", response_model=list[BalanceLogOut])
async def balance_logs(
    client_id: int, repo: BaseRepo = Depends(get_repo)
) -> list[BalanceLogOut]:
    if await repo.clients.get(client_id) is None:
        raise HTTPException(status_code=404, detail="client not found")
    logs = await repo.clients.balance_logs(client_id)
    return [
        BalanceLogOut(
            id=log.id,
            change=log.change,
            balance_after=log.balance_after,
            reason=log.reason,
            order_id=log.order_id,
            note=log.note,
            admin_id=log.admin_id,
            admin_login=log.admin.login,
            created_at=log.created_at,
        )
        for log in logs
    ]


@router.post("/{client_id}/cashback", response_model=CashbackLogOut, status_code=201)
async def add_cashback_entry(
    client_id: int,
    body: CashbackEntryIn,
    repo: BaseRepo = Depends(get_repo),
    admin: Admin = Depends(get_current_admin),
) -> CashbackLogOut:
    """Adjust a client's cashback, stamped with the acting admin + time."""
    log = await repo.clients.adjust_cashback(
        client_id=client_id,
        change=body.change,
        reason="adjustment",
        admin_id=admin.id,
        note=body.note,
    )
    if log is None:
        raise HTTPException(
            status_code=400,
            detail="client not found or cashback would go negative",
        )
    await repo.commit()
    return CashbackLogOut(
        id=log.id,
        change=log.change,
        cashback_after=log.cashback_after,
        reason=log.reason,
        order_id=log.order_id,
        note=log.note,
        admin_id=log.admin_id,
        admin_login=admin.login,
        created_at=log.created_at,
    )


@router.get("/{client_id}/cashback-logs", response_model=list[CashbackLogOut])
async def cashback_logs(
    client_id: int, repo: BaseRepo = Depends(get_repo)
) -> list[CashbackLogOut]:
    if await repo.clients.get(client_id) is None:
        raise HTTPException(status_code=404, detail="client not found")
    logs = await repo.clients.cashback_logs(client_id)
    return [
        CashbackLogOut(
            id=log.id,
            change=log.change,
            cashback_after=log.cashback_after,
            reason=log.reason,
            order_id=log.order_id,
            note=log.note,
            admin_id=log.admin_id,
            admin_login=log.admin.login,
            created_at=log.created_at,
        )
        for log in logs
    ]
