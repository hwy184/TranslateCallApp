from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from ..config.settings import Settings
from ..sessions.models import SessionEvent
from ..sessions.room_pipeline_session import RoomPipelineSession

logger = logging.getLogger("worker.livekit-bridge")

try:
    from livekit import api, rtc  # type: ignore
except Exception:  # noqa: BLE001
    api = None
    rtc = None


@dataclass
class LiveKitRoomContext:
    worker_identity: str
    room: object


class LiveKitBridge:
    """
    LiveKit bridge scaffold.

    This class handles session lifecycle and outbound event hook points.
    Media-plane integration (track subscribe/publish + data-channel publish) will
    be attached here in the next iteration without changing SessionManager wiring.
    """

    def __init__(self, settings: Settings) -> None:
        self._enabled = settings.livekit_bridge_enabled
        self._worker_identity_prefix = settings.livekit_worker_identity_prefix
        self._livekit_url = settings.livekit_url
        self._livekit_api_key = settings.livekit_api_key
        self._livekit_api_secret = settings.livekit_api_secret
        self._active_sessions: dict[str, LiveKitRoomContext] = {}

    async def start_session(self, session: RoomPipelineSession) -> None:
        if not self._enabled:
            return
        if api is None or rtc is None:
            logger.warning("livekit_bridge_sdk_missing")
            return
        if not self._livekit_url or not self._livekit_api_key or not self._livekit_api_secret:
            logger.warning("livekit_bridge_missing_credentials", extra={"session_id": session.session_id})
            return

        worker_identity = f"{self._worker_identity_prefix}{session.session_id[:8]}"
        token = (
            api.AccessToken(self._livekit_api_key, self._livekit_api_secret)
            .with_identity(worker_identity)
            .with_name(worker_identity)
            .with_grants(
                api.VideoGrants(
                    room_join=True,
                    room=session.room_id,
                    can_publish_data=True,
                    can_subscribe=True,
                    hidden=True,
                    agent=True,
                )
            )
            .to_jwt()
        )

        room = rtc.Room()
        await room.connect(self._livekit_url, token)
        self._active_sessions[session.session_id] = LiveKitRoomContext(
            worker_identity=worker_identity,
            room=room,
        )
        logger.info(
            "livekit_bridge_session_started",
            extra={
                "session_id": session.session_id,
                "room_id": session.room_id,
                "worker_identity": worker_identity,
            },
        )

    async def stop_session(self, session: RoomPipelineSession) -> None:
        if not self._enabled:
            return
        context = self._active_sessions.pop(session.session_id, None)
        if context is not None:
            try:
                await context.room.disconnect()
            except Exception:  # noqa: BLE001
                logger.warning("livekit_bridge_disconnect_failed", extra={"session_id": session.session_id})
        logger.info(
            "livekit_bridge_session_stopped",
            extra={"session_id": session.session_id, "room_id": session.room_id},
        )

    async def publish_many(self, events: list[SessionEvent]) -> None:
        if not self._enabled or not events:
            return

        for event in events:
            context = self._active_sessions.get(event.session_id)
            if context is None:
                continue
            try:
                payload = json.dumps(event.model_dump(exclude_none=True), ensure_ascii=True)
                details = event.details if isinstance(event.details, dict) else {}
                destination = details.get("target_identity")
                destination_identities = [destination] if isinstance(destination, str) and destination else []
                await context.room.local_participant.publish_data(
                    payload,
                    reliable=True,
                    destination_identities=destination_identities,
                    topic="translation.events",
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "livekit_bridge_publish_failed",
                    extra={
                        "session_id": event.session_id,
                        "type": event.type,
                        "error": str(exc),
                    },
                )
