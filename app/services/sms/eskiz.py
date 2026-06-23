"""Eskiz.uz SMS provider (token API).

Auth: POST {BASE}/auth/login (email+password) -> JWT token, cached and refreshed
on 401. Send: POST {BASE}/message/sms/send with {mobile_phone, message, from}.
The API token / credentials are never put into raised error messages.

Note: Eskiz requires a pre-approved message template + sender ("from") for
production traffic; until approved only the fixed test text is delivered.
"""

import asyncio
import logging

import httpx

from ...config import ESKIZ_BASE_URL, ESKIZ_EMAIL, ESKIZ_FROM, ESKIZ_PASSWORD
from .base import BaseSMS, normalize_phone

logger = logging.getLogger("sms.eskiz")


class EskizSMS(BaseSMS):
    def __init__(
        self,
        email: str = ESKIZ_EMAIL,
        password: str = ESKIZ_PASSWORD,
        base_url: str = ESKIZ_BASE_URL,
        sender: str = ESKIZ_FROM,
    ):
        self.email = email
        self.password = password
        self.base_url = base_url.rstrip("/")
        self.sender = sender
        self._token: str | None = None
        self._lock = asyncio.Lock()

    async def _login(self, client: httpx.AsyncClient) -> str:
        resp = await client.post(
            f"{self.base_url}/auth/login",
            data={"email": self.email, "password": self.password},
            timeout=30.0,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Eskiz auth HTTP {resp.status_code}")
        token = resp.json().get("data", {}).get("token")
        if not token:
            raise RuntimeError("Eskiz auth: no token in response")
        return token

    async def _ensure_token(self, client: httpx.AsyncClient) -> str:
        async with self._lock:
            if self._token is None:
                self._token = await self._login(client)
            return self._token

    async def send(self, phone: str, text: str) -> None:
        if not self.email or not self.password:
            raise RuntimeError("Eskiz credentials are not set")

        async with httpx.AsyncClient() as client:
            token = await self._ensure_token(client)
            payload = {
                "mobile_phone": normalize_phone(phone),
                "message": text,
                "from": self.sender,
            }
            resp = await client.post(
                f"{self.base_url}/message/sms/send",
                data=payload,
                headers={"Authorization": f"Bearer {token}"},
                timeout=30.0,
            )
            if resp.status_code == 401:  # token expired -> refresh once
                async with self._lock:
                    self._token = None
                token = await self._ensure_token(client)
                resp = await client.post(
                    f"{self.base_url}/message/sms/send",
                    data=payload,
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=30.0,
                )
            if resp.status_code not in (200, 201):
                raise RuntimeError(f"Eskiz send HTTP {resp.status_code}")
