"""Console SMS provider: logs the message and always succeeds.

The default provider — lets the whole SMS/scheduler flow work end-to-end without
any gateway credentials (great for demos and local dev).
"""

import logging

from .base import BaseSMS, normalize_phone

logger = logging.getLogger("sms.console")


class ConsoleSMS(BaseSMS):
    async def send(self, phone: str, text: str) -> None:
        logger.info("SMS -> %s: %s", normalize_phone(phone), text)
