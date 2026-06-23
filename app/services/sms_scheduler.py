"""SMS broadcast scheduler.

Runs inside the FastAPI process (started from main.py's lifespan). Every
SMS_POLL_SECONDS it picks up due broadcasts, resolves their recipients, renders
per-recipient templates, sends via the configured provider, records delivery rows,
and re-arms cron broadcasts to their next occurrence.

Cron + "today" (birthdays) resolve in APP_TIMEZONE. IMPORTANT: this assumes a
SINGLE worker process (our uvicorn entrypoint). Scaling to multiple workers would
double-send without a row-level lock.
"""

import asyncio
import datetime as dt
import logging
import re
from decimal import Decimal
from zoneinfo import ZoneInfo

from croniter import croniter

from ..config import APP_TIMEZONE, SMS_MAX_CONCURRENCY, SMS_POLL_SECONDS
from ..database.config import SessionLocal
from ..database.repo import BaseRepo
from .sms import get_sms, normalize_phone

logger = logging.getLogger("sms.scheduler")
TZ = ZoneInfo(APP_TIMEZONE)


def _fmt_amount(value) -> str:
    """Group a money amount with spaces, no decimals (so'm)."""
    return f"{Decimal(value):,.0f}".replace(",", " ")


def render_template(text: str, recipient: dict) -> str:
    """Substitute {name}/{phone}/{debt}/{balance} placeholders for one recipient."""
    bal = Decimal(recipient.get("balance") or 0)
    debt = -bal if bal < 0 else Decimal(0)
    values = {
        "name": recipient.get("name") or "",
        "phone": recipient.get("phone") or "",
        "balance": _fmt_amount(bal),
        "debt": _fmt_amount(debt),
    }
    return re.sub(
        r"\{(name|phone|debt|balance)\}", lambda m: values[m.group(1)], text
    )


def next_cron_run(cron_expr: str, after: dt.datetime) -> dt.datetime | None:
    """Next cron occurrence strictly after `after`, computed in APP_TIMEZONE (UTC)."""
    try:
        base = after.astimezone(TZ)
        nxt = croniter(cron_expr, base).get_next(dt.datetime)
        return nxt.astimezone(dt.timezone.utc)
    except (ValueError, KeyError):
        return None


async def resolve_recipients(
    repo: BaseRepo, audience: str, custom_numbers: str | None, on_date: dt.date
) -> list[dict]:
    """Return [{client_id, phone, name, balance}] for the broadcast's audience."""
    out: list[dict] = []
    if audience == "custom":
        for raw in re.split(r"[\s,;]+", custom_numbers or ""):
            phone = normalize_phone(raw)
            if phone:
                out.append({"client_id": None, "phone": phone, "name": "", "balance": 0})
        return out

    if audience == "all":
        clients = await repo.clients.list()
    elif audience == "debtors":
        clients = await repo.clients.debtors()
    elif audience == "birthdays":
        clients = await repo.clients.birthdays(on_date.month, on_date.day)
    else:
        clients = []

    for c in clients:
        if c.phone_number:
            out.append(
                {"client_id": c.id, "phone": c.phone_number, "name": c.name, "balance": c.balance}
            )
    return out


async def _send_one(sem, sms, recipient: dict, text: str) -> dict:
    async with sem:
        body = render_template(text, recipient)
        rec = {"client_id": recipient["client_id"], "phone": recipient["phone"]}
        try:
            await sms.send(recipient["phone"], body)
            return {**rec, "status": "sent", "error": None}
        except Exception as exc:  # noqa: BLE001 - record + continue
            return {**rec, "status": "failed", "error": str(exc)[:255]}


async def _run_broadcast(repo: BaseRepo, b, now: dt.datetime) -> None:
    b.status = "sending"
    await repo.commit()

    on_date = now.astimezone(TZ).date()
    recipients = await resolve_recipients(repo, b.audience, b.custom_numbers, on_date)

    sms = get_sms()
    sem = asyncio.Semaphore(SMS_MAX_CONCURRENCY)
    results = await asyncio.gather(
        *[_send_one(sem, sms, r, b.message) for r in recipients]
    )

    await repo.sms.add_messages([{"broadcast_id": b.id, **r} for r in results])
    sent = sum(1 for r in results if r["status"] == "sent")
    b.recipients_count = len(results)
    b.sent_count = sent
    b.failed_count = len(results) - sent
    b.last_run_at = now
    b.run_count = (b.run_count or 0) + 1

    # decide whether to re-arm (cron) or finish (once / window exhausted)
    if b.schedule_kind == "cron" and b.cron:
        nxt = next_cron_run(b.cron, now)
        ended = (
            nxt is None
            or (b.ends_at and nxt > b.ends_at)
            or (b.max_runs and b.run_count >= b.max_runs)
        )
        if ended:
            b.status = "done"
        else:
            b.scheduled_at = nxt
            b.status = "scheduled"
    else:
        b.status = "done"

    await repo.commit()
    logger.info(
        "broadcast %s run #%s: %s sent, %s failed (next: %s)",
        b.id, b.run_count, sent, b.failed_count,
        b.scheduled_at if b.status == "scheduled" else "—",
    )


async def run_due_broadcasts() -> int:
    """One scheduler pass. Returns the number of broadcasts run."""
    now = dt.datetime.now(dt.timezone.utc)
    async with SessionLocal() as session:
        repo = BaseRepo(session)
        due = await repo.sms.due(now)
    count = 0
    for b in due:
        # fresh session per broadcast so one failure can't poison the others
        async with SessionLocal() as session:
            repo = BaseRepo(session)
            broadcast = await repo.sms.get(b.id)
            if broadcast is None or broadcast.status != "scheduled":
                continue
            try:
                await _run_broadcast(repo, broadcast, now)
                count += 1
            except Exception:  # noqa: BLE001
                logger.exception("broadcast %s failed", b.id)
                try:
                    broadcast.status = "failed"
                    await repo.commit()
                except Exception:  # noqa: BLE001
                    await repo.rollback()
    return count


async def scheduler_loop() -> None:
    """Background loop started on app startup; cancelled on shutdown."""
    logger.info("SMS scheduler started (poll=%ss, tz=%s)", SMS_POLL_SECONDS, APP_TIMEZONE)
    while True:
        try:
            await run_due_broadcasts()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("scheduler pass error")
        await asyncio.sleep(SMS_POLL_SECONDS)
