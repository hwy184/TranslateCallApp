from __future__ import annotations

import asyncio
import logging
from typing import Iterable

import httpx

from ..config.settings import Settings
from ..sessions.models import SessionEvent

logger = logging.getLogger("worker.backend-events")


class BackendEventsClient:
    def __init__(self, settings: Settings) -> None:
        self._url = settings.backend_events_url
        self._timeout = settings.backend_events_timeout_sec
        self._retries = settings.backend_events_retries
        self._client = httpx.AsyncClient(timeout=self._timeout)

    async def publish_many(self, events: Iterable[SessionEvent]) -> None:
        tasks = [self.publish(event) for event in events]
        if not tasks:
            return
        await asyncio.gather(*tasks, return_exceptions=True)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def publish(self, event: SessionEvent) -> None:
        try:
            self._validate_contract(event)
        except ValueError as exc:
            logger.warning("invalid_worker_event_contract", extra={"event_type": event.type, "error": str(exc)})
            return

        payload = event.model_dump(exclude_none=True)
        last_error: Exception | None = None
        for attempt in range(self._retries + 1):
            try:
                response = await self._client.post(self._url, json=payload)
                response.raise_for_status()
                return
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                # 4xx means payload contract or caller input is invalid; retrying is wasteful.
                if status < 500:
                    logger.warning(
                        "worker_event_rejected",
                        extra={"event_type": event.type, "status": status, "error": str(exc)},
                    )
                    return
                last_error = exc
            except Exception as exc:  # noqa: BLE001
                last_error = exc

            if attempt < self._retries:
                await asyncio.sleep(0.15 * (attempt + 1))

        logger.warning("failed_to_publish_worker_event", extra={"event_type": event.type, "error": str(last_error)})

    def _validate_contract(self, event: SessionEvent) -> None:
        needs_utterance_fields = event.type in {"subtitle.final", "translation.final"}
        if needs_utterance_fields:
            missing = []
            if not event.utterance_id:
                missing.append("utterance_id")
            if not event.speaker_identity:
                missing.append("speaker_identity")
            if not event.source_lang:
                missing.append("source_lang")
            if not event.target_lang:
                missing.append("target_lang")
            if missing:
                raise ValueError(f"missing_required_fields:{','.join(missing)}")

        if event.type == "translation.final" and not event.translated_text:
            raise ValueError("missing_required_field:translated_text")
