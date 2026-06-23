"""Centralized configuration, all from environment variables."""

import os

# --- database ---
# Async SQLAlchemy URL. In Docker this points at the "db" service.
DATABASE_URL: str = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://parfume:parfume@db:5432/parfume",
)

# --- auth / JWT ---
# Used to sign access tokens. MUST be overridden in production via .env.
JWT_SECRET: str = os.environ.get("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM: str = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
    os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "720")  # 12h
)

# --- admin bootstrap ---
# entrypoint.sh / app.scripts.create_admin seeds this admin if none exists.
ADMIN_LOGIN: str = os.environ.get("ADMIN_LOGIN", "admin")
ADMIN_PASSWORD: str = os.environ.get("ADMIN_PASSWORD", "admin")

# --- SMS ---
# Which provider to use: "console" (logs only, default) or "eskiz".
SMS_PROVIDER: str = os.environ.get("SMS_PROVIDER", "console")
ESKIZ_EMAIL: str = os.environ.get("ESKIZ_EMAIL", "")
ESKIZ_PASSWORD: str = os.environ.get("ESKIZ_PASSWORD", "")
ESKIZ_BASE_URL: str = os.environ.get("ESKIZ_BASE_URL", "https://notify.eskiz.uz/api")
ESKIZ_FROM: str = os.environ.get("ESKIZ_FROM", "4546")
# Scheduler: how often to poll for due broadcasts, and per-broadcast send fan-out.
SMS_POLL_SECONDS: int = int(os.environ.get("SMS_POLL_SECONDS", "30"))
SMS_MAX_CONCURRENCY: int = int(os.environ.get("SMS_MAX_CONCURRENCY", "5"))

# --- scheduling ---
# All cron schedules and "today" (birthdays) resolve in this timezone.
APP_TIMEZONE: str = os.environ.get("APP_TIMEZONE", "Asia/Tashkent")

# --- pricing ---
# Currency code that product prices are entered/stored in. At sale time each
# line is converted to the base currency (so'm) at that day's rate, so the books
# stay in so'm. Set to the base code (UZS) to price products directly in so'm.
PRODUCT_CURRENCY: str = os.environ.get("PRODUCT_CURRENCY", "USD")

# --- domain constants ---
# Reasons recorded on every balance change (see BalanceLog).
BALANCE_REASONS = {"order_debt", "payment", "adjustment"}
SMS_AUDIENCES = {"all", "debtors", "birthdays", "custom"}
SMS_SCHEDULE_KINDS = {"once", "cron"}
