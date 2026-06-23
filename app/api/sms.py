"""SMS broadcast endpoints (superuser-only — gated at the router include).

Lets a superuser schedule one-off or cron-recurring SMS campaigns, preview the
audience size, cancel, send-now, and inspect delivery logs. The actual sending is
done by the background scheduler (app/services/sms_scheduler.py).
"""

import datetime as dt
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..database.models import Admin
from ..database.repo import BaseRepo, get_repo
from ..schemas import AudienceCount, SmsBroadcastIn, SmsBroadcastOut, SmsMessageOut
from ..services.security import get_current_admin
from ..services.sms_scheduler import next_cron_run, resolve_recipients

router = APIRouter(prefix="/sms", tags=["sms"])


def _serialize(b) -> SmsBroadcastOut:
    return SmsBroadcastOut(
        id=b.id, message=b.message, audience=b.audience,
        custom_numbers=b.custom_numbers, schedule_kind=b.schedule_kind, cron=b.cron,
        scheduled_at=b.scheduled_at, starts_at=b.starts_at, ends_at=b.ends_at,
        max_runs=b.max_runs, status=b.status, last_run_at=b.last_run_at,
        run_count=b.run_count, recipients_count=b.recipients_count,
        sent_count=b.sent_count, failed_count=b.failed_count,
        created_by=b.admin.login, created_at=b.created_at,
    )


@router.get("", response_model=list[SmsBroadcastOut])
async def list_broadcasts(repo: BaseRepo = Depends(get_repo)) -> list[SmsBroadcastOut]:
    return [_serialize(b) for b in await repo.sms.list()]


def _first_run(body: SmsBroadcastIn, now: dt.datetime) -> dt.datetime:
    """Compute the next run time for a broadcast (once -> scheduled_at; cron ->
    first occurrence at/after max(now, starts_at))."""
    if body.schedule_kind == "once":
        return body.scheduled_at
    base = max(now, body.starts_at) if body.starts_at else now
    scheduled_at = next_cron_run(body.cron, base - dt.timedelta(seconds=1))
    if scheduled_at is None:
        raise HTTPException(status_code=400, detail="cron yields no next run")
    return scheduled_at


@router.post("", response_model=SmsBroadcastOut, status_code=201)
async def create_broadcast(
    body: SmsBroadcastIn,
    repo: BaseRepo = Depends(get_repo),
    admin: Admin = Depends(get_current_admin),
) -> SmsBroadcastOut:
    scheduled_at = _first_run(body, dt.datetime.now(dt.timezone.utc))
    b = await repo.sms.create(
        message=body.message, audience=body.audience,
        custom_numbers=body.custom_numbers, schedule_kind=body.schedule_kind,
        cron=body.cron, scheduled_at=scheduled_at, starts_at=body.starts_at,
        ends_at=body.ends_at, max_runs=body.max_runs, status="scheduled",
        admin_id=admin.id,
    )
    await repo.commit()
    b = await repo.sms.get(b.id)
    return _serialize(b)


@router.put("/{broadcast_id}", response_model=SmsBroadcastOut)
async def update_broadcast(
    broadcast_id: int,
    body: SmsBroadcastIn,
    repo: BaseRepo = Depends(get_repo),
) -> SmsBroadcastOut:
    """Edit a still-scheduled broadcast (message, audience, schedule, …)."""
    b = await repo.sms.get(broadcast_id)
    if b is None:
        raise HTTPException(status_code=404, detail="broadcast not found")
    if b.status != "scheduled":
        raise HTTPException(
            status_code=400, detail="only scheduled broadcasts can be edited"
        )
    b.message = body.message
    b.audience = body.audience
    b.custom_numbers = body.custom_numbers
    b.schedule_kind = body.schedule_kind
    b.cron = body.cron
    b.starts_at = body.starts_at
    b.ends_at = body.ends_at
    b.max_runs = body.max_runs
    b.scheduled_at = _first_run(body, dt.datetime.now(dt.timezone.utc))
    await repo.commit()
    b = await repo.sms.get(broadcast_id)
    return _serialize(b)


@router.get("/audience-count", response_model=AudienceCount)
async def audience_count(
    audience: str = Query(...),
    custom_numbers: Optional[str] = Query(default=None),
    repo: BaseRepo = Depends(get_repo),
) -> AudienceCount:
    if audience not in {"all", "debtors", "birthdays", "custom"}:
        raise HTTPException(status_code=422, detail="invalid audience")
    today = dt.datetime.now(dt.timezone.utc)
    recipients = await resolve_recipients(repo, audience, custom_numbers, today.date())
    return AudienceCount(count=len(recipients))


@router.get("/{broadcast_id}", response_model=SmsBroadcastOut)
async def get_broadcast(
    broadcast_id: int, repo: BaseRepo = Depends(get_repo)
) -> SmsBroadcastOut:
    b = await repo.sms.get(broadcast_id)
    if b is None:
        raise HTTPException(status_code=404, detail="broadcast not found")
    return _serialize(b)


@router.get("/{broadcast_id}/messages", response_model=list[SmsMessageOut])
async def broadcast_messages(
    broadcast_id: int, repo: BaseRepo = Depends(get_repo)
) -> list[SmsMessageOut]:
    if await repo.sms.get(broadcast_id) is None:
        raise HTTPException(status_code=404, detail="broadcast not found")
    return [SmsMessageOut.model_validate(m) for m in await repo.sms.recent_messages(broadcast_id)]


@router.post("/{broadcast_id}/cancel", response_model=SmsBroadcastOut)
async def cancel_broadcast(
    broadcast_id: int, repo: BaseRepo = Depends(get_repo)
) -> SmsBroadcastOut:
    b = await repo.sms.cancel(broadcast_id)
    if b is None:
        raise HTTPException(status_code=404, detail="broadcast not found")
    await repo.commit()
    return _serialize(b)


@router.post("/{broadcast_id}/send-now", response_model=SmsBroadcastOut)
async def send_now(
    broadcast_id: int, repo: BaseRepo = Depends(get_repo)
) -> SmsBroadcastOut:
    b = await repo.sms.get(broadcast_id)
    if b is None:
        raise HTTPException(status_code=404, detail="broadcast not found")
    if b.status not in ("scheduled",):
        raise HTTPException(status_code=400, detail="only scheduled broadcasts can be sent now")
    # arm it for the next scheduler tick
    b.scheduled_at = dt.datetime.now(dt.timezone.utc)
    await repo.commit()
    return _serialize(b)
