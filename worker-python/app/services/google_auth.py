from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone

try:
    from google.auth.transport.requests import Request  # type: ignore
    from google.oauth2 import service_account  # type: ignore
except Exception:  # noqa: BLE001
    Request = None
    service_account = None


class GoogleAccessTokenProvider:
    def __init__(self, credentials_path: str, scopes: list[str]) -> None:
        self._credentials_path = credentials_path or os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
        self._scopes = scopes
        self._credentials = None
        self._lock = asyncio.Lock()

    def configured(self) -> bool:
        return bool(self._credentials_path)

    async def get_token(self) -> str:
        async with self._lock:
            await asyncio.to_thread(self._refresh_if_needed)
            token = getattr(self._credentials, "token", "") if self._credentials is not None else ""
            return str(token or "")

    def _refresh_if_needed(self) -> None:
        if Request is None or service_account is None:
            raise RuntimeError("google_auth_dependency_missing")
        if not self._credentials_path:
            raise RuntimeError("google_credentials_path_missing")

        if self._credentials is None:
            self._credentials = service_account.Credentials.from_service_account_file(
                self._credentials_path,
                scopes=self._scopes,
            )

        token = getattr(self._credentials, "token", None)
        expiry = getattr(self._credentials, "expiry", None)
        if token and expiry:
            # google-auth may return either offset-aware or offset-naive expiry depending on runtime.
            # Normalize "now" to match expiry shape to avoid comparison TypeError.
            if getattr(expiry, "tzinfo", None) is None:
                now = datetime.utcnow()
            else:
                now = datetime.now(timezone.utc)
            try:
                if expiry > (now + timedelta(minutes=2)):
                    return
            except TypeError:
                # Fall through to refresh when datetime types are mixed unexpectedly.
                pass

        self._credentials.refresh(Request())
