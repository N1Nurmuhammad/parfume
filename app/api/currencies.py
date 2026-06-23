"""Currency endpoints: CRUD over currencies + daily exchange rate management."""

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query

from ..database.repo import BaseRepo, get_repo
from ..schemas import CurrencyIn, CurrencyOut, CurrencyRateIn, CurrencyRateOut

router = APIRouter(prefix="/currencies", tags=["currencies"])


@router.get("", response_model=list[CurrencyOut])
async def list_currencies(
    repo: BaseRepo = Depends(get_repo),
) -> list[CurrencyOut]:
    return [CurrencyOut.model_validate(c) for c in await repo.currencies.list()]


@router.post("", response_model=CurrencyOut, status_code=201)
async def create_currency(
    body: CurrencyIn, repo: BaseRepo = Depends(get_repo)
) -> CurrencyOut:
    currency = await repo.currencies.add(body.code, body.name, body.is_base)
    await repo.commit()
    return CurrencyOut.model_validate(currency)


@router.delete("/{currency_id}", status_code=204)
async def delete_currency(
    currency_id: int, repo: BaseRepo = Depends(get_repo)
) -> None:
    if not await repo.currencies.delete(currency_id):
        raise HTTPException(status_code=400, detail="cannot delete this currency")
    await repo.commit()


@router.get("/rates", response_model=list[CurrencyRateOut])
async def list_rates(
    date: str | None = Query(default=None),
    effective: bool = Query(default=False),
    repo: BaseRepo = Depends(get_repo),
) -> list[CurrencyRateOut]:
    if date is None:
        rate_date = dt.date.today()
    else:
        try:
            rate_date = dt.date.fromisoformat(date)
        except ValueError:
            raise HTTPException(status_code=422, detail="invalid date")
    # effective=True -> the rate in effect on that date (latest <= date), which is
    # how order pricing resolves rates; default -> only rows set exactly that day
    # (what the daily-rates editor edits).
    rates = (
        await repo.currencies.effective_rates_on(rate_date)
        if effective
        else await repo.currencies.rates_on(rate_date)
    )
    return [
        CurrencyRateOut(
            id=r.id,
            currency_id=r.currency_id,
            currency_code=r.currency.code,
            rate_date=r.rate_date,
            rate=r.rate,
        )
        for r in rates
    ]


@router.post("/rates", response_model=CurrencyRateOut, status_code=201)
async def set_rate(
    body: CurrencyRateIn, repo: BaseRepo = Depends(get_repo)
) -> CurrencyRateOut:
    currency = await repo.currencies.get(body.currency_id)
    if currency is None:
        raise HTTPException(status_code=404, detail="currency not found")
    if currency.is_base:
        raise HTTPException(status_code=400, detail="the base currency has no rate (always 1)")
    rate = await repo.currencies.set_rate(
        body.currency_id, body.rate_date, body.rate
    )
    await repo.commit()
    return CurrencyRateOut(
        id=rate.id,
        currency_id=rate.currency_id,
        currency_code=currency.code,
        rate_date=rate.rate_date,
        rate=rate.rate,
    )


@router.get("/{currency_id}/rates", response_model=list[CurrencyRateOut])
async def rate_history(
    currency_id: int, repo: BaseRepo = Depends(get_repo)
) -> list[CurrencyRateOut]:
    if await repo.currencies.get(currency_id) is None:
        raise HTTPException(status_code=404, detail="currency not found")
    rates = await repo.currencies.rate_history(currency_id)
    return [
        CurrencyRateOut(
            id=r.id,
            currency_id=r.currency_id,
            currency_code=r.currency.code,
            rate_date=r.rate_date,
            rate=r.rate,
        )
        for r in rates
    ]
