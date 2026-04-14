from __future__ import annotations

import asyncio
import json
import logging
import math
import struct
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
    session_id: str
    room_id: str
    worker_identity: str
    room: object
    output_sources: dict[str, object]
    output_tracks: dict[str, object]
    audio_tasks: set[asyncio.Task[None]]


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
        self._tts_sample_rate = 24000
        self._tts_channels = 1

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
        context = LiveKitRoomContext(
            session_id=session.session_id,
            room_id=session.room_id,
            worker_identity=worker_identity,
            room=room,
            output_sources={},
            output_tracks={},
            audio_tasks=set(),
        )
        self._active_sessions[session.session_id] = context

        for participant in session.participants:
            identity = participant.get("identity")
            if not identity:
                continue
            await self._ensure_output_track(context, identity)

        @room.on("track_subscribed")
        def _on_track_subscribed(track, _publication, participant):
            try:
                if rtc is None or not isinstance(track, rtc.RemoteAudioTrack):
                    return
                participant_identity = getattr(participant, "identity", "unknown")
                task = asyncio.create_task(self._consume_remote_audio(context, participant_identity, track))
                context.audio_tasks.add(task)
                task.add_done_callback(context.audio_tasks.discard)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "livekit_bridge_track_subscribe_hook_failed",
                    extra={"session_id": session.session_id, "error": str(exc)},
                )

        logger.info(
            "livekit_bridge_tracks_ready",
            extra={"session_id": session.session_id, "output_tracks": len(context.output_tracks)},
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
            for task in list(context.audio_tasks):
                task.cancel()
            if context.audio_tasks:
                await asyncio.gather(*context.audio_tasks, return_exceptions=True)
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

                if event.type == "translation.final" and event.translated_text and destination_identities:
                    await self._publish_translated_audio(
                        context=context,
                        target_identity=destination_identities[0],
                        translated_text=event.translated_text,
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

    async def _ensure_output_track(self, context: LiveKitRoomContext, target_identity: str) -> None:
        if rtc is None:
            return
        if target_identity in context.output_sources:
            return
        source = rtc.AudioSource(sample_rate=self._tts_sample_rate, num_channels=self._tts_channels, queue_size_ms=2000)
        track = rtc.LocalAudioTrack.create_audio_track(f"translated_to_{target_identity}", source)
        await context.room.local_participant.publish_track(track)
        context.output_sources[target_identity] = source
        context.output_tracks[target_identity] = track

    async def _publish_translated_audio(self, context: LiveKitRoomContext, target_identity: str, translated_text: str) -> None:
        if rtc is None:
            return
        await self._ensure_output_track(context, target_identity)
        source = context.output_sources.get(target_identity)
        if source is None:
            return

        # Temporary synthesized tone as translated audio placeholder.
        # This keeps the media-plane wiring active before full TTS PCM integration.
        duration_sec = min(0.9, max(0.2, len(translated_text) / 60.0))
        total_samples = int(self._tts_sample_rate * duration_sec)
        chunk_samples = int(self._tts_sample_rate * 0.02)  # 20ms
        frequency = 440.0
        amplitude = 0.14

        index = 0
        while index < total_samples:
            size = min(chunk_samples, total_samples - index)
            pcm = bytearray()
            for i in range(size):
                t = (index + i) / self._tts_sample_rate
                sample = int(32767 * amplitude * math.sin(2.0 * math.pi * frequency * t))
                pcm.extend(struct.pack("<h", sample))
            frame = rtc.AudioFrame(
                data=bytes(pcm),
                sample_rate=self._tts_sample_rate,
                num_channels=self._tts_channels,
                samples_per_channel=size,
            )
            await source.capture_frame(frame)
            index += size

    async def _consume_remote_audio(self, context: LiveKitRoomContext, speaker_identity: str, track: object) -> None:
        if rtc is None:
            return
        stream = rtc.AudioStream.from_track(
            track=track,
            sample_rate=16000,
            num_channels=1,
            capacity=50,
        )
        frame_count = 0
        try:
            async for _event in stream:
                frame_count += 1
                if frame_count % 100 == 0:
                    logger.debug(
                        "livekit_bridge_audio_observed",
                        extra={
                            "session_id": context.session_id,
                            "speaker_identity": speaker_identity,
                            "frames": frame_count,
                        },
                    )
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "livekit_bridge_audio_consumer_failed",
                extra={
                    "session_id": context.session_id,
                    "speaker_identity": speaker_identity,
                    "error": str(exc),
                },
            )
        finally:
            await stream.aclose()
