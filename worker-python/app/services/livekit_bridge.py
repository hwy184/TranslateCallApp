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

import httpx
import numpy as np

from ..config.settings import Settings
from ..sessions.models import SessionEvent, SimulateUtteranceRequest
from ..sessions.room_pipeline_session import RoomPipelineSession

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
    last_stt_at_by_speaker: dict[str, float]
    last_transcript_by_speaker: dict[str, tuple[str, float]]


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
        self._stt_energy_threshold = settings.stt_energy_threshold
        self._stt_min_speech_ms = settings.stt_min_speech_ms
        self._stt_min_voiced_ms = settings.stt_min_voiced_ms
        self._stt_min_voiced_ratio = settings.stt_min_voiced_ratio
        self._stt_silence_hangover_ms = settings.stt_silence_hangover_ms
        self._stt_max_segment_ms = settings.stt_max_segment_ms
        self._stt_min_request_interval_ms = settings.stt_min_request_interval_ms
        self._stt_duplicate_suppress_window_ms = settings.stt_duplicate_suppress_window_ms
        self._edge_tts_voice_default = settings.edge_tts_voice_default
        self._edge_tts_rate = settings.edge_tts_rate
        self._local_stt_enabled = settings.local_stt_enabled
        self._local_stt_model_size = settings.local_stt_model_size
        self._local_stt_compute_type = settings.local_stt_compute_type
        self._local_stt_device = settings.local_stt_device
        self._local_whisper_model: object | None = None

        self._utterance_handler: Callable[[str, SimulateUtteranceRequest], Awaitable[None]] | None = None

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
            session=session,
            room=room,
            output_sources={},
            output_tracks={},
            audio_tasks=set(),
            last_stt_at_by_speaker={},
            last_transcript_by_speaker={},
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

        pcm = await self._synthesize_gemini_tts_pcm(translated_text)
        if not pcm:
            voice = self._resolve_target_voice(context, target_identity)
            pcm = await self._synthesize_edge_tts_pcm(translated_text, voice)
        if pcm:
            await self._publish_pcm(source, pcm, self._tts_sample_rate, self._tts_channels)
            return

        logger.warning(
            "livekit_bridge_tts_unavailable",
            extra={"session_id": context.session_id, "target_identity": target_identity},
        )

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

        participant = context.session.participant_by_identity.get(speaker_identity, {})
        source_lang_hint = participant.get("source_language") if participant else None

        try:
            async for event in stream:
                frame = getattr(event, "frame", event)
                data = bytes(getattr(frame, "data", b""))
                sample_rate = int(getattr(frame, "sample_rate", 16000) or 16000)
                if not data:
                    continue

                frame_ms = int((len(data) // 2) * 1000 / sample_rate)
                rms = audioop.rms(data, 2)
                voiced = rms >= self._stt_energy_threshold

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
                    buffer.clear()
                    in_speech = False
                    silence_ms = 0
                    speech_ms = 0
                    voiced_ms = 0

                    voiced_ratio = (
                        (segment_voiced_ms / segment_speech_ms) if segment_speech_ms > 0 else 0.0
                    )
                    if (
                        segment_speech_ms >= self._stt_min_speech_ms
                        and segment_voiced_ms >= self._stt_min_voiced_ms
                        and voiced_ratio >= self._stt_min_voiced_ratio
                    ):
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

                frame_count += 1
                if frame_count % 200 == 0:
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
            final_voiced_ratio = (voiced_ms / speech_ms) if speech_ms > 0 else 0.0
            if (
                buffer
                and speech_ms >= self._stt_min_speech_ms
                and voiced_ms >= self._stt_min_voiced_ms
                and final_voiced_ratio >= self._stt_min_voiced_ratio
            ):
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
        prev = context.last_stt_at_by_speaker.get(speaker_identity, 0.0)
        min_interval = self._stt_min_request_interval_ms / 1000.0
        if min_interval > 0 and (now - prev) < min_interval:
            return
        context.last_stt_at_by_speaker[speaker_identity] = now

        text = await self._transcribe_speech(pcm16=pcm16, sample_rate=sample_rate, language=source_lang_hint)
        if not text:
            return
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

    async def _transcribe_speech(self, *, pcm16: bytes, sample_rate: int, language: str | None) -> str:
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
            kwargs: dict[str, object] = {"beam_size": 1, "vad_filter": True}
            if language:
                kwargs["language"] = language
            segments, _info = model.transcribe(audio, **kwargs)
            text = " ".join(seg.text.strip() for seg in segments if getattr(seg, "text", "").strip()).strip()
            return text
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
                output_format="raw-24khz-16bit-mono-pcm",
            )
            output = bytearray()
            async for chunk in communicate.stream():
                if chunk.get("type") == "audio":
                    output.extend(chunk.get("data", b""))
            return bytes(output) if output else None
        except Exception as exc:  # noqa: BLE001
            logger.warning("livekit_bridge_edge_tts_failed", extra={"error": str(exc)})
            return None

    async def _synthesize_gemini_tts_pcm(self, text: str) -> bytes | None:
        if not self._gemini_api_key:
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
        except Exception as exc:  # noqa: BLE001
            logger.warning("livekit_bridge_gemini_tts_failed", extra={"error": str(exc)})
        return None

    async def _publish_pcm(self, source: object, pcm16: bytes, sample_rate: int, channels: int) -> None:
        if rtc is None:
            return
        samples_per_frame = int(sample_rate * 0.02)  # 20ms
        bytes_per_frame = samples_per_frame * channels * 2
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
        if voice_profile:
            return voice_profile
        target_lang = str(participant.get("target_language", "")).lower()
        if target_lang.startswith("vi"):
            return "vi-VN-HoaiMyNeural"
        return self._edge_tts_voice_default
