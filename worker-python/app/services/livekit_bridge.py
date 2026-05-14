from __future__ import annotations

import asyncio
import audioop
import base64
import io
import json
import logging
import math
import struct
import wave
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import av
import httpx
import numpy as np

from ..config.settings import Settings
from ..sessions.models import SessionEvent, SimulateUtteranceRequest
from ..sessions.room_pipeline_session import RoomPipelineSession
from .google_auth import GoogleAccessTokenProvider

logger = logging.getLogger("worker.livekit-bridge")

try:
    from livekit import api, rtc  # type: ignore
except Exception:  # noqa: BLE001
    api = None
    rtc = None

try:
    import edge_tts  # type: ignore
except Exception:  # noqa: BLE001
    edge_tts = None

try:
    from faster_whisper import WhisperModel  # type: ignore
except Exception:  # noqa: BLE001
    WhisperModel = None


@dataclass
class LiveKitRoomContext:
    session_id: str
    room_id: str
    worker_identity: str
    session: RoomPipelineSession
    room: object
    output_sources: dict[str, object]
    output_tracks: dict[str, object]
    audio_tasks: set[asyncio.Task[None]]
    consumed_track_ids: set[str]
    last_stt_at_by_speaker: dict[str, float]
    last_transcript_by_speaker: dict[str, tuple[str, float]]
    echo_suppress_until_by_speaker: dict[str, float]
    last_partial_publish_at: float


class LiveKitBridge:
    def __init__(self, settings: Settings) -> None:
        self._enabled = settings.livekit_bridge_enabled
        self._worker_identity_prefix = settings.livekit_worker_identity_prefix
        self._livekit_url = settings.livekit_url
        self._livekit_api_key = settings.livekit_api_key
        self._livekit_api_secret = settings.livekit_api_secret
        self._active_sessions: dict[str, LiveKitRoomContext] = {}
        self._tts_sample_rate = 24000
        self._tts_channels = 1

        self._gemini_api_key = settings.gemini_api_key
        self._gemini_stt_model = settings.gemini_stt_model
        self._gemini_tts_model = settings.gemini_tts_model
        self._openai_api_key = settings.openai_api_key
        self._openai_stt_model = settings.openai_stt_model
        self._google_credentials_path = settings.google_application_credentials
        self._google_translate_location = settings.google_translate_location
        self._google_token_provider = GoogleAccessTokenProvider(
            credentials_path=self._google_credentials_path,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        self._stt_energy_threshold = settings.stt_energy_threshold
        self._stt_min_speech_ms = settings.stt_min_speech_ms
        self._stt_min_voiced_ms = settings.stt_min_voiced_ms
        self._stt_min_voiced_ratio = settings.stt_min_voiced_ratio
        self._stt_silence_hangover_ms = settings.stt_silence_hangover_ms
        self._stt_max_segment_ms = settings.stt_max_segment_ms
        self._stt_min_request_interval_ms = settings.stt_min_request_interval_ms
        self._stt_duplicate_suppress_window_ms = settings.stt_duplicate_suppress_window_ms
        self._stt_force_segment_peak_rms = settings.stt_force_segment_peak_rms
        self._stt_force_segment_min_voiced_ms = settings.stt_force_segment_min_voiced_ms
        self._edge_tts_voice_default = settings.edge_tts_voice_default
        self._edge_tts_rate = settings.edge_tts_rate
        self._local_stt_enabled = settings.local_stt_enabled
        self._local_stt_model_size = settings.local_stt_model_size
        self._local_stt_compute_type = settings.local_stt_compute_type
        self._local_stt_device = settings.local_stt_device
        self._local_whisper_model: object | None = None
        self._gemini_stt_blocked_until: float = 0.0
        self._gemini_tts_blocked_until: float = 0.0

        self._utterance_handler: Callable[[str, SimulateUtteranceRequest], Awaitable[None]] | None = None
        if self._google_token_provider.configured():
            logger.info("livekit_bridge_google_cloud_enabled")
        if self._local_stt_enabled and WhisperModel is None:
            logger.warning("livekit_bridge_local_stt_unavailable_missing_dependency")
        logger.info(
            "livekit_bridge_vad_config energy_threshold=%s min_speech_ms=%s min_voiced_ms=%s min_voiced_ratio=%s silence_hangover_ms=%s min_request_interval_ms=%s duplicate_window_ms=%s force_peak_rms=%s force_min_voiced_ms=%s",
            self._stt_energy_threshold,
            self._stt_min_speech_ms,
            self._stt_min_voiced_ms,
            self._stt_min_voiced_ratio,
            self._stt_silence_hangover_ms,
            self._stt_min_request_interval_ms,
            self._stt_duplicate_suppress_window_ms,
            self._stt_force_segment_peak_rms,
            self._stt_force_segment_min_voiced_ms,
        )

    def set_utterance_handler(
        self,
        handler: Callable[[str, SimulateUtteranceRequest], Awaitable[None]],
    ) -> None:
        self._utterance_handler = handler

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
                    can_publish=True,
                    can_publish_data=True,
                    can_subscribe=True,
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
            session=session,
            room=room,
            output_sources={},
            output_tracks={},
            audio_tasks=set(),
            consumed_track_ids=set(),
            last_stt_at_by_speaker={},
            last_transcript_by_speaker={},
            echo_suppress_until_by_speaker={},
            last_partial_publish_at=0.0,
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
                self._start_remote_audio_consumer(context, participant_identity, track)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "livekit_bridge_track_subscribe_hook_failed",
                    extra={"session_id": session.session_id, "error": str(exc)},
                )

        @room.on("track_published")
        def _on_track_published(publication, participant):
            try:
                participant_identity = getattr(participant, "identity", "unknown")
                logger.info(
                    "livekit_bridge_track_published session=%s participant=%s kind=%s name=%s",
                    context.session_id,
                    participant_identity,
                    getattr(publication, "kind", ""),
                    getattr(publication, "name", "") or getattr(publication, "track_name", ""),
                )
                if hasattr(publication, "set_subscribed"):
                    publication.set_subscribed(True)
                track = getattr(publication, "track", None)
                if rtc is not None and isinstance(track, rtc.RemoteAudioTrack):
                    self._start_remote_audio_consumer(context, participant_identity, track)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "livekit_bridge_track_published_hook_failed session=%s error=%s",
                    context.session_id,
                    str(exc),
                )

        @room.on("participant_connected")
        def _on_participant_connected(participant):
            try:
                logger.info(
                    "livekit_bridge_participant_connected session=%s participant=%s",
                    context.session_id,
                    getattr(participant, "identity", "unknown"),
                )
                self._scan_remote_participant_audio(context, participant)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "livekit_bridge_participant_connected_hook_failed session=%s error=%s",
                    context.session_id,
                    str(exc),
                )

        @room.on("track_subscription_failed")
        def _on_track_subscription_failed(participant, track_sid, error):
            logger.warning(
                "livekit_bridge_track_subscription_failed session=%s participant=%s track=%s error=%s",
                context.session_id,
                getattr(participant, "identity", "unknown"),
                track_sid,
                error,
            )

        self._start_existing_remote_audio_consumers(context)
        scan_task = asyncio.create_task(self._delayed_existing_track_scans(context))
        context.audio_tasks.add(scan_task)
        scan_task.add_done_callback(context.audio_tasks.discard)

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

    def _start_existing_remote_audio_consumers(self, context: LiveKitRoomContext) -> None:
        if rtc is None:
            return
        remote_participants = getattr(context.room, "remote_participants", {}) or {}
        for participant in remote_participants.values():
            self._scan_remote_participant_audio(context, participant)

    def _scan_remote_participant_audio(self, context: LiveKitRoomContext, participant: object) -> None:
        if rtc is None:
            return
        participant_identity = getattr(participant, "identity", "unknown")
        publications = getattr(participant, "track_publications", {}) or {}
        logger.info(
            "livekit_bridge_scan_participant session=%s participant=%s publications=%s",
            context.session_id,
            participant_identity,
            len(publications),
        )
        for publication in publications.values():
            try:
                if hasattr(publication, "set_subscribed"):
                    publication.set_subscribed(True)
                track = getattr(publication, "track", None)
                if isinstance(track, rtc.RemoteAudioTrack):
                    self._start_remote_audio_consumer(context, participant_identity, track)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "livekit_bridge_existing_track_scan_failed session=%s participant=%s error=%s",
                    context.session_id,
                    participant_identity,
                    str(exc),
                )

    async def _delayed_existing_track_scans(self, context: LiveKitRoomContext) -> None:
        try:
            for delay in (0.5, 2.0, 5.0):
                await asyncio.sleep(delay)
                self._start_existing_remote_audio_consumers(context)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "livekit_bridge_delayed_track_scan_failed session=%s error=%s",
                context.session_id,
                str(exc),
            )

    def _start_remote_audio_consumer(
        self,
        context: LiveKitRoomContext,
        participant_identity: str,
        track: object,
    ) -> None:
        track_id = str(getattr(track, "sid", "") or id(track))
        if track_id in context.consumed_track_ids:
            return
        context.consumed_track_ids.add(track_id)
        logger.info(
            "livekit_bridge_audio_track_subscribed session=%s participant=%s track=%s",
            context.session_id,
            participant_identity,
            track_id,
        )
        task = asyncio.create_task(self._consume_remote_audio(context, participant_identity, track))
        context.audio_tasks.add(task)
        task.add_done_callback(context.audio_tasks.discard)

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
                if event.type == "subtitle.partial":
                    now = asyncio.get_running_loop().time()
                    if now - context.last_partial_publish_at < 0.25:
                        continue
                    context.last_partial_publish_at = now
                payload = json.dumps(event.model_dump(exclude_none=True), ensure_ascii=True)
                details = event.details if isinstance(event.details, dict) else {}
                destination = details.get("target_identity")
                target_identity = destination if isinstance(destination, str) and destination else None
                await context.room.local_participant.publish_data(
                    payload,
                    reliable=True,
                    topic="translation.events",
                )

                if event.type == "translation.final" and event.translated_text and target_identity:
                    await self._publish_translated_audio(
                        context=context,
                        target_identity=target_identity,
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

        tts_provider = "none"
        target_lang_hint = self._resolve_target_lang_hint(context, target_identity)
        pcm = await self._synthesize_google_tts_pcm(translated_text, target_lang_hint)
        if pcm:
            tts_provider = "google_tts"
        else:
            pcm = await self._synthesize_gemini_tts_pcm(translated_text)
            if pcm:
                tts_provider = "gemini_tts"
        if not pcm:
            voice = self._resolve_target_voice(context, target_identity)
            pcm = await self._synthesize_edge_tts_pcm(translated_text, voice)
            if pcm:
                tts_provider = "edge_tts"
        if pcm:
            duration_sec = len(pcm) / max(1, (2 * self._tts_sample_rate * self._tts_channels))
            # Suppress STT from the listener briefly while TTS is playing
            # to reduce translation-feedback loops caused by speaker bleed.
            suppress_window_sec = min(4.0, max(0.8, duration_sec + 0.35))
            now = asyncio.get_running_loop().time()
            prev = context.echo_suppress_until_by_speaker.get(target_identity, 0.0)
            context.echo_suppress_until_by_speaker[target_identity] = max(prev, now + suppress_window_sec)
            logger.info(
                "livekit_bridge_tts_pcm_ready session=%s target=%s provider=%s text_len=%s pcm_bytes=%s",
                context.session_id,
                target_identity,
                tts_provider,
                len(translated_text),
                len(pcm),
            )
            await self._publish_pcm(source, pcm, self._tts_sample_rate, self._tts_channels)
            logger.info(
                "livekit_bridge_tts_published session=%s target=%s provider=%s",
                context.session_id,
                target_identity,
                tts_provider,
            )
            return

        logger.warning(
            "livekit_bridge_tts_unavailable",
            extra={"session_id": context.session_id, "target_identity": target_identity},
        )

    def _resolve_source_lang_hint(self, context: LiveKitRoomContext, speaker_identity: str) -> str | None:
        participant = context.session.participant_by_identity.get(speaker_identity, {})
        source_lang = participant.get("source_language") if participant else None
        if isinstance(source_lang, str) and source_lang:
            return source_lang
        return None

    def _resolve_target_lang_hint(self, context: LiveKitRoomContext, target_identity: str) -> str | None:
        participant = context.session.participant_by_identity.get(target_identity, {})
        source_lang = participant.get("source_language") if participant else None
        if isinstance(source_lang, str) and source_lang:
            return source_lang
        return None

    async def _consume_remote_audio(self, context: LiveKitRoomContext, speaker_identity: str, track: object) -> None:
        if rtc is None:
            return

        stream = rtc.AudioStream.from_track(
            track=track,
            sample_rate=16000,
            num_channels=1,
            capacity=50,
        )

        in_speech = False
        silence_ms = 0
        speech_ms = 0
        voiced_ms = 0
        buffer = bytearray()
        frame_count = 0
        peak_rms = 0
        segment_peak_rms = 0

        try:
            async for event in stream:
                frame = getattr(event, "frame", event)
                data = bytes(getattr(frame, "data", b""))
                sample_rate = int(getattr(frame, "sample_rate", 16000) or 16000)
                if not data:
                    continue

                if frame_count == 0:
                    logger.info(
                        "livekit_bridge_audio_frame_received session=%s participant=%s sample_rate=%s bytes=%s",
                        context.session_id,
                        speaker_identity,
                        sample_rate,
                        len(data),
                    )

                frame_ms = int((len(data) // 2) * 1000 / sample_rate)
                rms = audioop.rms(data, 2)
                peak_rms = max(peak_rms, rms)
                segment_peak_rms = max(segment_peak_rms, rms)
                voiced = rms >= self._stt_energy_threshold

                now = asyncio.get_running_loop().time()
                suppressed_until = context.echo_suppress_until_by_speaker.get(speaker_identity, 0.0)
                if now < suppressed_until:
                    if in_speech or buffer:
                        in_speech = False
                        silence_ms = 0
                        speech_ms = 0
                        voiced_ms = 0
                        buffer.clear()
                        segment_peak_rms = 0
                    continue

                if voiced:
                    in_speech = True
                    silence_ms = 0
                    buffer.extend(data)
                    speech_ms += frame_ms
                    voiced_ms += frame_ms
                elif in_speech:
                    buffer.extend(data)
                    silence_ms += frame_ms
                    speech_ms += frame_ms

                should_flush = in_speech and (
                    silence_ms >= self._stt_silence_hangover_ms or speech_ms >= self._stt_max_segment_ms
                )
                if should_flush:
                    segment = bytes(buffer)
                    segment_speech_ms = speech_ms
                    segment_voiced_ms = voiced_ms
                    segment_peak = segment_peak_rms
                    buffer.clear()
                    in_speech = False
                    silence_ms = 0
                    speech_ms = 0
                    voiced_ms = 0
                    segment_peak_rms = 0

                    voiced_ratio = (
                        (segment_voiced_ms / segment_speech_ms) if segment_speech_ms > 0 else 0.0
                    )
                    accept_normal = (
                        segment_speech_ms >= self._stt_min_speech_ms
                        and segment_voiced_ms >= self._stt_min_voiced_ms
                        and voiced_ratio >= self._stt_min_voiced_ratio
                    )
                    accept_peak_force = (
                        segment_speech_ms >= self._stt_min_speech_ms
                        and segment_peak >= self._stt_force_segment_peak_rms
                        and segment_voiced_ms >= self._stt_force_segment_min_voiced_ms
                    )
                    if accept_normal or accept_peak_force:
                        source_lang_hint = self._resolve_source_lang_hint(context, speaker_identity)
                        logger.info(
                            "livekit_bridge_vad_segment_accepted session=%s participant=%s speech_ms=%s voiced_ms=%s voiced_ratio=%.2f peak_rms=%s mode=%s",
                            context.session_id,
                            speaker_identity,
                            segment_speech_ms,
                            segment_voiced_ms,
                            voiced_ratio,
                            segment_peak,
                            "normal" if accept_normal else "peak_force",
                        )
                        task = asyncio.create_task(
                            self._handle_speech_segment(
                                context=context,
                                speaker_identity=speaker_identity,
                                pcm16=segment,
                                sample_rate=sample_rate,
                                source_lang_hint=source_lang_hint,
                            )
                        )
                        context.audio_tasks.add(task)
                        task.add_done_callback(context.audio_tasks.discard)
                    else:
                        logger.info(
                            "livekit_bridge_vad_segment_dropped session=%s participant=%s speech_ms=%s voiced_ms=%s voiced_ratio=%.2f peak_rms=%s threshold=%s",
                            context.session_id,
                            speaker_identity,
                            segment_speech_ms,
                            segment_voiced_ms,
                            voiced_ratio,
                            segment_peak,
                            self._stt_energy_threshold,
                        )

                frame_count += 1
                if frame_count % 200 == 0:
                    logger.info(
                        "livekit_bridge_audio_observed session=%s participant=%s frames=%s peak_rms=%s threshold=%s in_speech=%s speech_ms=%s voiced_ms=%s",
                        context.session_id,
                        speaker_identity,
                        frame_count,
                        peak_rms,
                        self._stt_energy_threshold,
                        in_speech,
                        speech_ms,
                        voiced_ms,
                    )
                    peak_rms = 0
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
            final_voiced_ratio = (voiced_ms / speech_ms) if speech_ms > 0 else 0.0
            final_accept_normal = (
                buffer
                and speech_ms >= self._stt_min_speech_ms
                and voiced_ms >= self._stt_min_voiced_ms
                and final_voiced_ratio >= self._stt_min_voiced_ratio
            )
            final_accept_peak_force = (
                buffer
                and speech_ms >= self._stt_min_speech_ms
                and segment_peak_rms >= self._stt_force_segment_peak_rms
                and voiced_ms >= self._stt_force_segment_min_voiced_ms
            )
            if final_accept_normal or final_accept_peak_force:
                source_lang_hint = self._resolve_source_lang_hint(context, speaker_identity)
                logger.info(
                    "livekit_bridge_vad_tail_accepted session=%s participant=%s speech_ms=%s voiced_ms=%s voiced_ratio=%.2f peak_rms=%s mode=%s",
                    context.session_id,
                    speaker_identity,
                    speech_ms,
                    voiced_ms,
                    final_voiced_ratio,
                    segment_peak_rms,
                    "normal" if final_accept_normal else "peak_force",
                )
                task = asyncio.create_task(
                    self._handle_speech_segment(
                        context=context,
                        speaker_identity=speaker_identity,
                        pcm16=bytes(buffer),
                        sample_rate=16000,
                        source_lang_hint=source_lang_hint,
                    )
                )
                context.audio_tasks.add(task)
                task.add_done_callback(context.audio_tasks.discard)
            await stream.aclose()

    async def _handle_speech_segment(
        self,
        *,
        context: LiveKitRoomContext,
        speaker_identity: str,
        pcm16: bytes,
        sample_rate: int,
        source_lang_hint: str | None,
    ) -> None:
        now = asyncio.get_running_loop().time()
        suppressed_until = context.echo_suppress_until_by_speaker.get(speaker_identity, 0.0)
        if now < suppressed_until:
            return
        prev = context.last_stt_at_by_speaker.get(speaker_identity, 0.0)
        min_interval = self._stt_min_request_interval_ms / 1000.0
        if min_interval > 0 and (now - prev) < min_interval:
            return
        context.last_stt_at_by_speaker[speaker_identity] = now

        text = await self._transcribe_speech(pcm16=pcm16, sample_rate=sample_rate, language=source_lang_hint)
        if not text:
            duration_ms = int((len(pcm16) // 2) * 1000 / max(1, sample_rate))
            logger.info(
                "livekit_bridge_stt_empty session=%s speaker=%s duration_ms=%s sample_rate=%s lang_hint=%s",
                context.session_id,
                speaker_identity,
                duration_ms,
                sample_rate,
                source_lang_hint or "",
            )
            return
        logger.info(
            "livekit_bridge_stt_text speaker=%s text=%s",
            speaker_identity,
            text[:160],
        )
        normalized = " ".join(text.lower().split())
        if len(normalized) < 2:
            return
        dedupe_window_sec = self._stt_duplicate_suppress_window_ms / 1000.0
        if dedupe_window_sec > 0:
            last_text, last_at = context.last_transcript_by_speaker.get(speaker_identity, ("", 0.0))
            if normalized == last_text and (now - last_at) <= dedupe_window_sec:
                logger.debug(
                    "livekit_bridge_duplicate_transcript_suppressed",
                    extra={"session_id": context.session_id, "speaker_identity": speaker_identity},
                )
                return
            context.last_transcript_by_speaker[speaker_identity] = (normalized, now)

        if self._utterance_handler is None:
            logger.warning(
                "livekit_bridge_utterance_handler_missing",
                extra={"session_id": context.session_id},
            )
            return

        try:
            request = SimulateUtteranceRequest(
                speaker_identity=speaker_identity,
                text=text,
                source_lang=source_lang_hint,
            )
            await self._utterance_handler(context.session_id, request)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "livekit_bridge_process_segment_failed",
                extra={
                    "session_id": context.session_id,
                    "speaker_identity": speaker_identity,
                    "error": str(exc),
                },
            )

    async def _transcribe_gemini_pcm16(self, *, pcm16: bytes, sample_rate: int, language: str | None) -> str:
        if not self._gemini_api_key:
            return ""
        now = asyncio.get_running_loop().time()
        if now < self._gemini_stt_blocked_until:
            return ""

        wav_bytes = self._pcm16_to_wav_bytes(pcm16=pcm16, sample_rate=sample_rate, channels=1)
        prompt = "Transcribe this speech audio exactly. Output only the transcript text."
        if language:
            prompt += f" Spoken language hint: {language}."

        retryable_statuses = {429, 500, 502, 503, 504}
        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            try:
                async with httpx.AsyncClient(timeout=35.0) as client:
                    response = await client.post(
                        (
                            f"https://generativelanguage.googleapis.com/v1beta/models/"
                            f"{self._gemini_stt_model}:generateContent?key={self._gemini_api_key}"
                        ),
                        json={
                            "contents": [
                                {
                                    "parts": [
                                        {"text": prompt},
                                        {
                                            "inlineData": {
                                                "mimeType": "audio/wav",
                                                "data": base64.b64encode(wav_bytes).decode("ascii"),
                                            }
                                        },
                                    ]
                                }
                            ],
                            "generationConfig": {"temperature": 0.0},
                        },
                    )
                    response.raise_for_status()
                    payload = response.json()
                    candidates = payload.get("candidates", [])
                    if not isinstance(candidates, list) or not candidates:
                        return ""
                    content = candidates[0].get("content", {})
                    parts = content.get("parts", []) if isinstance(content, dict) else []
                    texts = [p.get("text", "").strip() for p in parts if isinstance(p, dict) and p.get("text")]
                    return " ".join([t for t in texts if t]).strip()
            except httpx.HTTPStatusError as exc:
                body = ""
                try:
                    body = exc.response.text[:1200]
                except Exception:  # noqa: BLE001
                    body = ""
                status = exc.response.status_code
                logger.warning(
                    "livekit_bridge_stt_failed status=%s attempt=%s/%s body=%s",
                    status,
                    attempt,
                    max_attempts,
                    body,
                )
                lowered_body = body.lower()
                if status == 429 and (
                    "prepayment credits are depleted" in lowered_body
                    or "resource_exhausted" in lowered_body
                ):
                    # Avoid hammering Gemini when account credit is exhausted.
                    self._gemini_stt_blocked_until = asyncio.get_running_loop().time() + 3600.0
                    logger.warning("livekit_bridge_stt_gemini_blocked_for_1h_quota_exhausted")
                    return ""
                if status in retryable_statuses and attempt < max_attempts:
                    await asyncio.sleep(0.35 * attempt)
                    continue
                return ""
            except Exception as exc:  # noqa: BLE001
                logger.warning("livekit_bridge_stt_failed attempt=%s/%s error=%s", attempt, max_attempts, str(exc))
                if attempt < max_attempts:
                    await asyncio.sleep(0.35 * attempt)
                    continue
                return ""
        return ""

    async def _transcribe_openai_pcm16(self, *, pcm16: bytes, sample_rate: int, language: str | None) -> str:
        if not self._openai_api_key:
            return ""

        wav_bytes = self._pcm16_to_wav_bytes(pcm16=pcm16, sample_rate=sample_rate, channels=1)
        form = {"model": self._openai_stt_model}
        if language:
            form["language"] = language

        try:
            async with httpx.AsyncClient(timeout=35.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {self._openai_api_key}"},
                    data=form,
                    files={"file": ("segment.wav", wav_bytes, "audio/wav")},
                )
                response.raise_for_status()
                payload = response.json()
                return str(payload.get("text", "")).strip()
        except httpx.HTTPStatusError as exc:
            body = ""
            try:
                body = exc.response.text[:1200]
            except Exception:  # noqa: BLE001
                body = ""
            logger.warning("livekit_bridge_openai_stt_failed status=%s body=%s", exc.response.status_code, body)
            return ""
        except Exception as exc:  # noqa: BLE001
            logger.warning("livekit_bridge_openai_stt_failed error=%s", str(exc))
            return ""

    def _resolve_google_speech_language_code(self, language: str | None) -> str:
        normalized = (language or "").strip().lower()
        if normalized in {"vi", "vi-vn"}:
            return "vi-VN"
        if normalized in {"en", "en-us", "en-gb"}:
            return "en-US"
        return "en-US"

    async def _transcribe_google_pcm16(self, *, pcm16: bytes, sample_rate: int, language: str | None) -> str:
        if not self._google_token_provider.configured():
            return ""
        try:
            token = await self._google_token_provider.get_token()
        except Exception as exc:  # noqa: BLE001
            logger.warning("livekit_bridge_google_stt_token_failed error=%s", str(exc))
            return ""
        if not token:
            return ""

        request_payload = {
            "config": {
                "encoding": "LINEAR16",
                "sampleRateHertz": sample_rate,
                "languageCode": self._resolve_google_speech_language_code(language),
                "enableAutomaticPunctuation": True,
                "model": "latest_short",
            },
            "audio": {"content": base64.b64encode(pcm16).decode("ascii")},
        }
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                response = await client.post(
                    "https://speech.googleapis.com/v1/speech:recognize",
                    headers={"Authorization": f"Bearer {token}"},
                    json=request_payload,
                )
                response.raise_for_status()
                payload = response.json()
                results = payload.get("results", [])
                transcripts: list[str] = []
                if isinstance(results, list):
                    for result in results:
                        alternatives = result.get("alternatives", []) if isinstance(result, dict) else []
                        if not isinstance(alternatives, list) or not alternatives:
                            continue
                        top = alternatives[0]
                        transcript = str(top.get("transcript", "")).strip() if isinstance(top, dict) else ""
                        if transcript:
                            transcripts.append(transcript)
                return " ".join(transcripts).strip()
        except httpx.HTTPStatusError as exc:
            body = ""
            try:
                body = exc.response.text[:1200]
            except Exception:  # noqa: BLE001
                body = ""
            logger.warning("livekit_bridge_google_stt_failed status=%s body=%s", exc.response.status_code, body)
            return ""
        except Exception as exc:  # noqa: BLE001
            logger.warning("livekit_bridge_google_stt_failed error=%s", str(exc))
            return ""

    async def _transcribe_speech(self, *, pcm16: bytes, sample_rate: int, language: str | None) -> str:
        google_text = await self._transcribe_google_pcm16(
            pcm16=pcm16,
            sample_rate=sample_rate,
            language=language,
        )
        if google_text:
            return google_text

        gemini_text = await self._transcribe_gemini_pcm16(
            pcm16=pcm16,
            sample_rate=sample_rate,
            language=language,
        )
        if gemini_text:
            return gemini_text

        openai_text = await self._transcribe_openai_pcm16(
            pcm16=pcm16,
            sample_rate=sample_rate,
            language=language,
        )
        if openai_text:
            return openai_text

        return await self._transcribe_local_whisper_pcm(
            pcm16=pcm16,
            sample_rate=sample_rate,
            language=language,
        )

    async def _transcribe_local_whisper_pcm(self, *, pcm16: bytes, sample_rate: int, language: str | None) -> str:
        if not self._local_stt_enabled or WhisperModel is None:
            return ""
        try:
            model = await self._get_local_whisper_model()
            if model is None:
                return ""
            audio = np.frombuffer(pcm16, dtype=np.int16).astype(np.float32) / 32768.0
            # First pass: fast decode with light VAD.
            kwargs: dict[str, object] = {"beam_size": 3, "vad_filter": True}
            if language:
                kwargs["language"] = language
            segments, _info = model.transcribe(audio, **kwargs)
            text = " ".join(seg.text.strip() for seg in segments if getattr(seg, "text", "").strip()).strip()
            if text:
                return text

            # Second pass fallback: disable Whisper VAD but keep the selected language hint.
            # This preserves the participant's explicit language choice even on weaker input.
            retry_kwargs: dict[str, object] = {"beam_size": 3, "vad_filter": False}
            if language:
                retry_kwargs["language"] = language
            retry_segments, _retry_info = model.transcribe(audio, **retry_kwargs)
            retry_text = " ".join(
                seg.text.strip() for seg in retry_segments if getattr(seg, "text", "").strip()
            ).strip()
            if retry_text:
                logger.info("livekit_bridge_local_stt_retry_success")
                return retry_text

            logger.info(
                "livekit_bridge_local_stt_empty duration_ms=%s lang_hint=%s",
                int((len(pcm16) // 2) * 1000 / sample_rate),
                language or "",
            )
            return ""
        except Exception as exc:  # noqa: BLE001
            logger.warning("livekit_bridge_local_stt_failed error=%s", str(exc))
            return ""

    async def _get_local_whisper_model(self):
        if self._local_whisper_model is not None:
            return self._local_whisper_model
        if WhisperModel is None:
            return None
        try:
            self._local_whisper_model = WhisperModel(
                self._local_stt_model_size,
                device=self._local_stt_device,
                compute_type=self._local_stt_compute_type,
            )
            logger.info(
                "livekit_bridge_local_stt_ready model=%s device=%s compute_type=%s",
                self._local_stt_model_size,
                self._local_stt_device,
                self._local_stt_compute_type,
            )
            return self._local_whisper_model
        except Exception as exc:  # noqa: BLE001
            logger.warning("livekit_bridge_local_stt_init_failed error=%s", str(exc))
            return None

    def _pcm16_to_wav_bytes(self, *, pcm16: bytes, sample_rate: int, channels: int) -> bytes:
        with io.BytesIO() as buf:
            with wave.open(buf, "wb") as wav_file:
                wav_file.setnchannels(channels)
                wav_file.setsampwidth(2)
                wav_file.setframerate(sample_rate)
                wav_file.writeframes(pcm16)
            return buf.getvalue()

    async def _synthesize_edge_tts_pcm(self, text: str, voice: str) -> bytes | None:
        if edge_tts is None:
            return None

        try:
            communicate = edge_tts.Communicate(
                text=text,
                voice=voice or self._edge_tts_voice_default,
                rate=self._edge_tts_rate,
            )
            compressed = bytearray()
            async for chunk in communicate.stream():
                if chunk.get("type") == "audio":
                    compressed.extend(chunk.get("data", b""))
            if not compressed:
                logger.warning("livekit_bridge_edge_tts_empty_audio voice=%s", voice)
                return None
            pcm = self._decode_compressed_audio_to_pcm16(
                bytes(compressed),
                target_sample_rate=self._tts_sample_rate,
                target_channels=self._tts_channels,
            )
            if not pcm:
                logger.warning("livekit_bridge_edge_tts_decode_empty voice=%s", voice)
            return pcm
        except Exception as exc:  # noqa: BLE001
            logger.warning("livekit_bridge_edge_tts_failed error=%s voice=%s", str(exc), voice)
            return None

    def _decode_compressed_audio_to_pcm16(
        self,
        payload: bytes,
        *,
        target_sample_rate: int,
        target_channels: int,
    ) -> bytes | None:
        decoded = bytearray()
        try:
            with av.open(io.BytesIO(payload), mode="r") as container:
                audio_stream = container.streams.audio[0]
                resampler = av.audio.resampler.AudioResampler(
                    format="s16",
                    layout="mono" if target_channels == 1 else "stereo",
                    rate=target_sample_rate,
                )
                for packet in container.demux(audio_stream):
                    for frame in packet.decode():
                        for out_frame in resampler.resample(frame):
                            decoded.extend(bytes(out_frame.planes[0]))
            return bytes(decoded) if decoded else None
        except Exception as exc:  # noqa: BLE001
            logger.warning("livekit_bridge_edge_tts_decode_failed error=%s", str(exc))
            return None

    async def _synthesize_gemini_tts_pcm(self, text: str) -> bytes | None:
        if not self._gemini_api_key:
            return None
        now = asyncio.get_running_loop().time()
        if now < self._gemini_tts_blocked_until:
            return None
        try:
            async with httpx.AsyncClient(timeout=40.0) as client:
                response = await client.post(
                    (
                        f"https://generativelanguage.googleapis.com/v1beta/models/"
                        f"{self._gemini_tts_model}:generateContent?key={self._gemini_api_key}"
                    ),
                    json={
                        "contents": [{"parts": [{"text": f"Speak this naturally: {text}"}]}],
                        "generationConfig": {
                            "responseModalities": ["AUDIO"],
                        },
                    },
                )
                response.raise_for_status()
                payload = response.json()
                candidates = payload.get("candidates", [])
                if not isinstance(candidates, list) or not candidates:
                    return None
                content = candidates[0].get("content", {})
                parts = content.get("parts", []) if isinstance(content, dict) else []
                for part in parts:
                    if not isinstance(part, dict):
                        continue
                    inline_data = part.get("inline_data") or part.get("inlineData")
                    if isinstance(inline_data, dict) and inline_data.get("data"):
                        mime_type = str(inline_data.get("mime_type") or inline_data.get("mimeType") or "")
                        if "pcm" not in mime_type.lower():
                            return None
                        return base64.b64decode(str(inline_data["data"]))
        except httpx.HTTPStatusError as exc:
            body = ""
            try:
                body = exc.response.text[:1200]
            except Exception:  # noqa: BLE001
                body = ""
            lowered_body = body.lower()
            if exc.response.status_code == 429 and (
                "prepayment credits are depleted" in lowered_body
                or "resource_exhausted" in lowered_body
            ):
                self._gemini_tts_blocked_until = asyncio.get_running_loop().time() + 3600.0
                logger.warning("livekit_bridge_tts_gemini_blocked_for_1h_quota_exhausted")
                return None
            logger.warning("livekit_bridge_gemini_tts_failed status=%s body=%s", exc.response.status_code, body)
        except Exception as exc:  # noqa: BLE001
            logger.warning("livekit_bridge_gemini_tts_failed", extra={"error": str(exc)})
        return None

    def _resolve_google_tts_language_code(self, language: str | None) -> str:
        normalized = (language or "").strip().lower()
        if normalized in {"vi", "vi-vn"}:
            return "vi-VN"
        if normalized in {"en", "en-us", "en-gb"}:
            return "en-US"
        return "en-US"

    def _decode_linear16_wav_or_raw(self, payload: bytes) -> bytes:
        try:
            with io.BytesIO(payload) as buf:
                with wave.open(buf, "rb") as wav_file:
                    return wav_file.readframes(wav_file.getnframes())
        except Exception:  # noqa: BLE001
            return payload

    async def _synthesize_google_tts_pcm(self, text: str, language: str | None) -> bytes | None:
        if not self._google_token_provider.configured():
            return None
        if not text.strip():
            return None
        try:
            token = await self._google_token_provider.get_token()
        except Exception as exc:  # noqa: BLE001
            logger.warning("livekit_bridge_google_tts_token_failed error=%s", str(exc))
            return None
        if not token:
            return None

        language_code = self._resolve_google_tts_language_code(language)
        payload = {
            "input": {"text": text},
            "voice": {"languageCode": language_code},
            "audioConfig": {
                "audioEncoding": "LINEAR16",
                "sampleRateHertz": self._tts_sample_rate,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=25.0) as client:
                response = await client.post(
                    "https://texttospeech.googleapis.com/v1/text:synthesize",
                    headers={"Authorization": f"Bearer {token}"},
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
                audio_content = str(data.get("audioContent", "")).strip()
                if not audio_content:
                    return None
                decoded = base64.b64decode(audio_content)
                pcm = self._decode_linear16_wav_or_raw(decoded)
                return pcm if pcm else None
        except httpx.HTTPStatusError as exc:
            body = ""
            try:
                body = exc.response.text[:1200]
            except Exception:  # noqa: BLE001
                body = ""
            logger.warning("livekit_bridge_google_tts_failed status=%s body=%s", exc.response.status_code, body)
            return None
        except Exception as exc:  # noqa: BLE001
            logger.warning("livekit_bridge_google_tts_failed error=%s", str(exc))
            return None

    async def _publish_pcm(self, source: object, pcm16: bytes, sample_rate: int, channels: int) -> None:
        if rtc is None:
            return
        samples_per_frame = int(sample_rate * 0.02)  # 20ms
        bytes_per_frame = samples_per_frame * channels * 2
        frame_count = 0
        offset = 0
        while offset < len(pcm16):
            chunk = pcm16[offset : offset + bytes_per_frame]
            if len(chunk) < bytes_per_frame:
                chunk += b"\x00" * (bytes_per_frame - len(chunk))
            frame = rtc.AudioFrame(
                data=chunk,
                sample_rate=sample_rate,
                num_channels=channels,
                samples_per_channel=samples_per_frame,
            )
            await source.capture_frame(frame)
            offset += bytes_per_frame
            frame_count += 1
        logger.info(
            "livekit_bridge_pcm_frames_published sample_rate=%s channels=%s frames=%s pcm_bytes=%s",
            sample_rate,
            channels,
            frame_count,
            len(pcm16),
        )

    async def _publish_fallback_tone(self, source: object, translated_text: str) -> None:
        if rtc is None:
            return
        duration_sec = min(0.9, max(0.2, len(translated_text) / 60.0))
        total_samples = int(self._tts_sample_rate * duration_sec)
        chunk_samples = int(self._tts_sample_rate * 0.02)
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

    def _resolve_target_voice(self, context: LiveKitRoomContext, target_identity: str) -> str:
        participant = context.session.participant_by_identity.get(target_identity, {})
        voice_profile = str(participant.get("voice_profile", "")).strip()
        if voice_profile and self._is_valid_edge_voice_name(voice_profile):
            return voice_profile
        # We synthesize in the listener's source language.
        target_lang = str(participant.get("source_language", "")).lower()
        if target_lang.startswith("vi"):
            return "vi-VN-HoaiMyNeural"
        if target_lang.startswith("ja"):
            return "ja-JP-NanamiNeural"
        if target_lang.startswith("zh"):
            return "zh-CN-XiaoxiaoNeural"
        if target_lang.startswith("ko"):
            return "ko-KR-SunHiNeural"
        return self._edge_tts_voice_default

    def _is_valid_edge_voice_name(self, value: str) -> bool:
        # Typical format: en-US-AriaNeural
        return "-" in value and value.endswith("Neural") and len(value) >= 12
