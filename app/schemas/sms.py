"""Schemas for SMS broadcasts."""

import datetime as dt
from typing import Optional

from croniter import croniter
from pydantic import BaseModel, Field, field_validator, model_validator


class SmsBroadcastIn(BaseModel):
    message: str = Field(min_length=1)
    audience: str  # all | debtors | birthdays | custom
    custom_numbers: Optional[str] = None
    schedule_kind: str  # once | cron
    scheduled_at: Optional[dt.datetime] = None  # required for "once"
    cron: Optional[str] = None  # required for "cron"
    starts_at: Optional[dt.datetime] = None
    ends_at: Optional[dt.datetime] = None
    max_runs: Optional[int] = Field(default=None, ge=1)

    @field_validator("audience")
    @classmethod
    def _aud(cls, v: str) -> str:
        if v not in {"all", "debtors", "birthdays", "custom"}:
            raise ValueError("invalid audience")
        return v

    @field_validator("schedule_kind")
    @classmethod
    def _kind(cls, v: str) -> str:
        if v not in {"once", "cron"}:
            raise ValueError("invalid schedule_kind")
        return v

    @model_validator(mode="after")
    def _check(self):
        if self.audience == "custom" and not (self.custom_numbers or "").strip():
            raise ValueError("custom_numbers required for the custom audience")
        if self.schedule_kind == "once" and self.scheduled_at is None:
            raise ValueError("scheduled_at required for a one-time broadcast")
        if self.schedule_kind == "cron":
            if not self.cron or not croniter.is_valid(self.cron):
                raise ValueError("a valid cron expression is required")
        return self


class SmsBroadcastOut(BaseModel):
    id: int
    message: str
    audience: str
    custom_numbers: Optional[str] = None
    schedule_kind: str
    cron: Optional[str] = None
    scheduled_at: dt.datetime
    starts_at: Optional[dt.datetime] = None
    ends_at: Optional[dt.datetime] = None
    max_runs: Optional[int] = None
    status: str
    last_run_at: Optional[dt.datetime] = None
    run_count: int
    recipients_count: int
    sent_count: int
    failed_count: int
    created_by: str
    created_at: dt.datetime


class SmsMessageOut(BaseModel):
    id: int
    phone: str
    status: str
    error: Optional[str] = None
    created_at: dt.datetime

    model_config = {"from_attributes": True}


class AudienceCount(BaseModel):
    count: int
