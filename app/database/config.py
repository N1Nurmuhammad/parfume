"""Database engine and session factory.

Schema creation/migration is owned by Alembic (see alembic/ and entrypoint.sh),
not by this module — so there is no create_all here.
"""

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from ..config import DATABASE_URL

engine = create_async_engine(DATABASE_URL, echo=False, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
