"""API package: aggregates per-concern routers under the /api prefix.

Auth-protected routers are gated with a router-level dependency on
`get_current_admin`; health and auth/login stay public.
"""

from fastapi import APIRouter, Depends

from ..services.security import get_current_admin, get_current_superuser
from . import (
    admins,
    analytics,
    auth,
    clients,
    currencies,
    expenses,
    health,
    orders,
    payment_types,
    products,
    sms,
)

api_router = APIRouter(prefix="/api")

# public
api_router.include_router(health.router)
api_router.include_router(auth.router)

# protected — require a valid admin JWT
_protected = [Depends(get_current_admin)]
api_router.include_router(clients.router, dependencies=_protected)
api_router.include_router(products.router, dependencies=_protected)
api_router.include_router(payment_types.router, dependencies=_protected)
api_router.include_router(orders.router, dependencies=_protected)
api_router.include_router(currencies.router, dependencies=_protected)
api_router.include_router(expenses.router, dependencies=_protected)
api_router.include_router(expenses.categories_router, dependencies=_protected)
api_router.include_router(analytics.router, dependencies=_protected)
# admin management + SMS broadcasts are superuser-only
api_router.include_router(admins.router, dependencies=[Depends(get_current_superuser)])
api_router.include_router(sms.router, dependencies=[Depends(get_current_superuser)])

__all__ = ["api_router"]
