"""Abstract SMS provider interface.

Every provider (console, Eskiz, ...) implements `BaseSMS`. The rest of the app
depends only on this interface, never on a concrete client, so swapping or adding
a provider is a one-file change (mirrors the LLM abstraction in the reference app).
"""

import re
from abc import ABC, abstractmethod


class BaseSMS(ABC):
    """Interface every SMS provider must implement."""

    @abstractmethod
    async def send(self, phone: str, text: str) -> None:
        """Send one SMS. Raise on failure WITHOUT leaking credentials in the error."""
        raise NotImplementedError


def normalize_phone(raw: str) -> str:
    """Normalize a phone to bare digits in 998XXXXXXXXX form (Uzbekistan).

    Strips spaces/+/dashes. A local 9-digit number gets the 998 country code; a
    number already starting with 998 is kept. Returns digits only.
    """
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 9:  # 901234567 -> 998901234567
        digits = "998" + digits
    elif digits.startswith("8") and len(digits) == 12:
        digits = "998" + digits[1:]
    return digits
