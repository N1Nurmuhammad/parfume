"""Health/meta endpoint."""

from fastapi import APIRouter

from ..config import PRODUCT_CURRENCY

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    # product_currency tells the frontend which currency product prices are in
    return {"ok": True, "service": "parfume-store", "product_currency": PRODUCT_CURRENCY}
