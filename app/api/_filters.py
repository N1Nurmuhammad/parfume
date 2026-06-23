"""Shared helpers for date-range query params used across analytics/orders.

Endpoints accept optional `date_from` / `date_to` as YYYY-MM-DD (or full ISO)
strings. The window is half-open [date_from, date_to + 1 day) so that passing the
same day for both bounds includes that whole day.
"""

import datetime as dt
from typing import Optional

from fastapi import HTTPException, Query


def _parse(value: Optional[str], *, end: bool) -> Optional[dt.datetime]:
    if not value:
        return None
    try:
        # accept either a date or a full ISO datetime
        if len(value) == 10:
            d = dt.date.fromisoformat(value)
            if end:
                return dt.datetime.combine(
                    d + dt.timedelta(days=1), dt.time.min
                )
            return dt.datetime.combine(d, dt.time.min)
        return dt.datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"invalid date: {value!r}")


def date_range(
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
) -> tuple[Optional[dt.datetime], Optional[dt.datetime]]:
    """FastAPI dependency: returns a (from, to) half-open datetime window."""
    return _parse(date_from, end=False), _parse(date_to, end=True)
