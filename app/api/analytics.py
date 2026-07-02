"""Analytics endpoints. Every route accepts optional date_from/date_to params."""

from fastapi import APIRouter, Depends

from ..database.repo import BaseRepo, get_repo
from ..schemas import (
    CurrencyBreakdown,
    DebtOut,
    DebtorOut,
    PaymentBreakdown,
    SummaryOut,
    TimeseriesPoint,
    TopClient,
    TopProduct,
)
from ._filters import date_range

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary", response_model=SummaryOut)
async def summary(
    window=Depends(date_range), repo: BaseRepo = Depends(get_repo)
) -> SummaryOut:
    date_from, date_to = window
    return SummaryOut(**await repo.analytics.summary(date_from, date_to))


@router.get("/timeseries", response_model=list[TimeseriesPoint])
async def timeseries(
    window=Depends(date_range), repo: BaseRepo = Depends(get_repo)
) -> list[TimeseriesPoint]:
    date_from, date_to = window
    return [
        TimeseriesPoint(**p)
        for p in await repo.analytics.timeseries(date_from, date_to)
    ]


@router.get("/top-products", response_model=list[TopProduct])
async def top_products(
    window=Depends(date_range), repo: BaseRepo = Depends(get_repo)
) -> list[TopProduct]:
    date_from, date_to = window
    return [
        TopProduct(**p)
        for p in await repo.analytics.top_products(date_from, date_to)
    ]


@router.get("/top-clients", response_model=list[TopClient])
async def top_clients(
    window=Depends(date_range), repo: BaseRepo = Depends(get_repo)
) -> list[TopClient]:
    date_from, date_to = window
    return [
        TopClient(**c)
        for c in await repo.analytics.top_clients(date_from, date_to)
    ]


@router.get("/payment-breakdown", response_model=list[PaymentBreakdown])
async def payment_breakdown(
    window=Depends(date_range), repo: BaseRepo = Depends(get_repo)
) -> list[PaymentBreakdown]:
    date_from, date_to = window
    return [
        PaymentBreakdown(**b)
        for b in await repo.analytics.payment_breakdown(date_from, date_to)
    ]


@router.get("/cashbox", response_model=list[CurrencyBreakdown])
async def cashbox(repo: BaseRepo = Depends(get_repo)) -> list[CurrencyBreakdown]:
    # Time-independent: how much money is currently held in each till,
    # per currency × method (same shape as the currency breakdown).
    return [CurrencyBreakdown(**c) for c in await repo.analytics.cashbox()]


@router.get("/currency-breakdown", response_model=list[CurrencyBreakdown])
async def currency_breakdown(
    window=Depends(date_range), repo: BaseRepo = Depends(get_repo)
) -> list[CurrencyBreakdown]:
    date_from, date_to = window
    return [
        CurrencyBreakdown(**b)
        for b in await repo.analytics.currency_breakdown(date_from, date_to)
    ]


@router.get("/debt", response_model=DebtOut)
async def debt(
    window=Depends(date_range), repo: BaseRepo = Depends(get_repo)
) -> DebtOut:
    date_from, date_to = window
    totals = await repo.analytics.debt(date_from, date_to)
    debtors = await repo.clients.debtors()
    return DebtOut(
        **totals,
        debtors=[
            DebtorOut(
                client_id=c.id,
                name=c.name,
                phone_number=c.phone_number,
                debt=-c.balance,
            )
            for c in debtors
        ],
    )
