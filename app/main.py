"""
Perfume Store — application entrypoint.

Thin assembly layer: wires the API router and the static frontend. The DB schema
is managed by Alembic migrations (run on container start via entrypoint.sh), not
by the app at runtime. The logic lives in:
  - app/schemas/   -> request/response contract (Pydantic)
  - app/api/       -> HTTP endpoints
  - app/services/  -> auth/security
  - app/database/  -> models, engine/session config, repository layer
  - app/config.py  -> environment-driven configuration
"""

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.exc import IntegrityError

from .api import api_router
from .services.sms_scheduler import scheduler_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Background SMS scheduler. Single worker only (see sms_scheduler docstring).
    task = asyncio.create_task(scheduler_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Perfume Store", lifespan=lifespan)
app.include_router(api_router)


def _pg_code(exc: IntegrityError) -> str | None:
    """Best-effort extraction of the Postgres SQLSTATE from a wrapped error."""
    for e in (exc.orig, getattr(exc.orig, "__cause__", None)):
        code = getattr(e, "sqlstate", None) or getattr(e, "pgcode", None)
        if code:
            return code
    return None


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    """Turn DB constraint violations into clean 409s instead of 500s.

    23505 = unique violation (duplicate phone / payment-type name / login),
    23503 = foreign-key violation (deleting a record still referenced elsewhere).
    """
    code = _pg_code(exc)
    if code == "23505":
        key, detail = "duplicate", "This value already exists."
    elif code == "23503":
        key, detail = "in_use", "This record is still in use and cannot be deleted."
    else:
        key, detail = "conflict", "The request conflicts with existing data."
    # `code` lets the frontend show a translated message; `detail` is the fallback.
    return JSONResponse(status_code=409, content={"detail": detail, "code": key})

# static frontend (registered last so /api/* wins)
_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
_INDEX = os.path.join(_STATIC_DIR, "index.html")


@app.get("/{full_path:path}")
async def spa(full_path: str) -> FileResponse:
    """Serve the built SPA. Real asset files (JS/CSS) are returned directly; any
    other client-side route (e.g. /orders) falls back to index.html so the React
    router handles it on refresh / deep-link. /api/* is matched earlier."""
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="not found")
    candidate = os.path.normpath(os.path.join(_STATIC_DIR, full_path))
    # guard against path traversal, then serve the file if it exists
    if (
        full_path
        and candidate.startswith(_STATIC_DIR)
        and os.path.isfile(candidate)
    ):
        return FileResponse(candidate)
    return FileResponse(_INDEX)
