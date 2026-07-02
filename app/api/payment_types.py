"""Payment type endpoints: dynamic CRUD over the `payment_types` table."""

from fastapi import APIRouter, Depends, HTTPException

from ..database.repo import BaseRepo, get_repo
from ..schemas import PaymentTypeIn, PaymentTypeOut

router = APIRouter(prefix="/payment-types", tags=["payment-types"])


@router.get("", response_model=list[PaymentTypeOut])
async def list_payment_types(
    repo: BaseRepo = Depends(get_repo),
) -> list[PaymentTypeOut]:
    return [
        PaymentTypeOut.model_validate(pt)
        for pt in await repo.payment_types.list()
    ]


def _validate_flags(body: PaymentTypeIn) -> None:
    # a change/qaytim type returns money — it can't also be debt or cashback
    if body.is_change and (body.is_debt or body.is_cashback):
        raise HTTPException(
            status_code=422,
            detail="a change type cannot also be a debt or cashback type",
        )


@router.post("", response_model=PaymentTypeOut, status_code=201)
async def create_payment_type(
    body: PaymentTypeIn, repo: BaseRepo = Depends(get_repo)
) -> PaymentTypeOut:
    _validate_flags(body)
    pt = await repo.payment_types.add(
        body.name, body.is_debt, body.is_cashback, body.is_change
    )
    await repo.commit()
    return PaymentTypeOut.model_validate(pt)


@router.put("/{payment_type_id}", response_model=PaymentTypeOut)
async def update_payment_type(
    payment_type_id: int,
    body: PaymentTypeIn,
    repo: BaseRepo = Depends(get_repo),
) -> PaymentTypeOut:
    _validate_flags(body)
    pt = await repo.payment_types.update(
        payment_type_id, body.name, body.is_debt, body.is_cashback, body.is_change
    )
    if pt is None:
        raise HTTPException(status_code=404, detail="payment type not found")
    await repo.commit()
    return PaymentTypeOut.model_validate(pt)


@router.delete("/{payment_type_id}", status_code=204)
async def delete_payment_type(
    payment_type_id: int, repo: BaseRepo = Depends(get_repo)
) -> None:
    pt = await repo.payment_types.get(payment_type_id)
    if pt is None:
        raise HTTPException(status_code=404, detail="payment type not found")
    # make sure nothing still references it before deleting — otherwise we'd
    # either hit an FK error or orphan the payment history of past orders.
    refs = await repo.payment_types.reference_count(payment_type_id)
    if refs:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete '{pt.name}': {refs} record(s) still use it. "
                "It stays for historical accuracy."
            ),
        )
    await repo.payment_types.delete(payment_type_id)
    await repo.commit()
