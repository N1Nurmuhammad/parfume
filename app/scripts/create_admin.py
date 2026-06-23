"""Bootstrap the first admin from env vars, idempotently.

Run after migrations (entrypoint.sh does this). If any admin already exists, it
does nothing. Otherwise it creates one from ADMIN_LOGIN / ADMIN_PASSWORD. Also
seeds default payment types (incl. a debt type) on first run.
"""

import asyncio

from ..config import ADMIN_LOGIN, ADMIN_PASSWORD
from ..database.config import SessionLocal
from ..database.repo import BaseRepo
from ..services.security import hash_password

# (name, is_debt, is_cashback)
_DEFAULT_PAYMENT_TYPES = [
    ("Cash", False, False),
    ("Card", False, False),
    ("Transfer", False, False),
    ("Debt", True, False),
    ("Cashback", False, True),
]

# (code, name, is_base) — UZS is the base currency.
_DEFAULT_CURRENCIES = [
    ("UZS", "Uzbek so'm", True),
    ("USD", "US Dollar", False),
    ("EUR", "Euro", False),
]


async def _bootstrap() -> None:
    async with SessionLocal() as session:
        repo = BaseRepo(session)

        if await repo.admins.count() == 0:
            await repo.admins.add(
                ADMIN_LOGIN, hash_password(ADMIN_PASSWORD), is_superuser=True
            )
            print(f"created superuser admin {ADMIN_LOGIN!r}")
        else:
            print("admin already exists; skipping")

        if not await repo.payment_types.list():
            for name, is_debt, is_cashback in _DEFAULT_PAYMENT_TYPES:
                await repo.payment_types.add(name, is_debt, is_cashback)
            print("seeded default payment types")

        if not await repo.currencies.list():
            for code, name, is_base in _DEFAULT_CURRENCIES:
                await repo.currencies.add(code, name, is_base)
            print("seeded default currencies")

        await repo.commit()


def main() -> None:
    asyncio.run(_bootstrap())


if __name__ == "__main__":
    main()
