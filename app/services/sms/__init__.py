"""SMS provider package: abstract base + providers + a factory.

To add a provider: implement BaseSMS in a new module, then register it in
`get_sms()` keyed by the SMS_PROVIDER env var.
"""

import logging

from ...config import ESKIZ_EMAIL, ESKIZ_PASSWORD, SMS_PROVIDER
from .base import BaseSMS, normalize_phone
from .console import ConsoleSMS
from .eskiz import EskizSMS

logger = logging.getLogger("sms")


def get_sms() -> BaseSMS:
    """Return the configured SMS provider instance.

    Falls back to the console provider if Eskiz is selected but its credentials
    are missing, so the app never crashes for lack of SMS config.
    """
    if SMS_PROVIDER == "eskiz":
        if ESKIZ_EMAIL and ESKIZ_PASSWORD:
            return EskizSMS()
        logger.warning("SMS_PROVIDER=eskiz but credentials missing; using console")
        return ConsoleSMS()
    return ConsoleSMS()


__all__ = ["BaseSMS", "ConsoleSMS", "EskizSMS", "get_sms", "normalize_phone"]
