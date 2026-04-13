from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from uuid import uuid4

from .models import SessionEvent, SimulateUtteranceRequest
from ..providers.fallback import FallbackExhaustedError, run_with_fallback
from ..providers.registry import ProviderBundle


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class RoomPipelineSession:
    def __init__(
        self,
        session_id: str,
        room_id: str,
        provider_bundle: ProviderBundle,
        participants: list[dict[str, str]] | None = None,
        room_metadata: dict[str, object] | None = None,
        livekit: dict[str, str] | None = None,
        context_window: int = 5,
    ) -> None:
        self.session_id = session_id
        self.room_id = room_id
        self.provider_bundle = provider_bundle
        self.context_window = context_window
        self.status = "running"
        self.room_metadata = room_metadata or {}
        self.livekit = livekit or {}
        self.created_at = utc_now_iso()
        self.updated_at = self.created_at
        self.participants = participants or []
        self.participant_by_identity = {
            participant.get("identity", ""): participant
            for participant in self.participants
            if participant.get("identity")
        }
        self.context_map: dict[tuple[str, str], deque[dict[str, str]]] = {}
        self.events: deque[SessionEvent] = deque(maxlen=200)
        self.events.append(
            SessionEvent(
                type="session.state",
                session_id=self.session_id,
                room_id=self.room_id,
                timestamp=self.created_at,
                text="running",
                details={
                    "provider_profile": self.provider_bundle.profile,
                    "participants": str(len(self.participants)),
                    "livekit_worker_identity": self.livekit.get("worker_identity", ""),
                },
            )
        )
        for participant in self.participants:
            self.events.append(
                SessionEvent(
                    type="participant.state",
                    session_id=self.session_id,
                    room_id=self.room_id,
                    speaker_identity=participant.get("identity"),
                    source_lang=participant.get("source_language"),
                    target_lang=participant.get("target_language"),
                    timestamp=self.created_at,
                    text="joined",
                    details={"role": participant.get("role", "unknown"), "voice_profile": participant.get("voice_profile", "")},
                )
            )

    def stop(self) -> None:
        self.status = "stopped"
        self.updated_at = utc_now_iso()
        self.events.append(
            SessionEvent(
                type="session.state",
                session_id=self.session_id,
                room_id=self.room_id,
                timestamp=self.updated_at,
                text="stopped",
                details={"provider_profile": self.provider_bundle.profile},
            )
        )

    def list_events(self) -> list[SessionEvent]:
        return list(self.events)

    async def process_utterance(self, request: SimulateUtteranceRequest) -> list[SessionEvent]:
        self.updated_at = utc_now_iso()
        utterance_id = request.utterance_id or f"utt_{uuid4()}"
        resolved_target_identity = self._resolve_target_identity(request.speaker_identity, request.target_identity)
        speaker_profile = self.participant_by_identity.get(request.speaker_identity, {})
        target_profile = self.participant_by_identity.get(resolved_target_identity, {})

        resolved_source_lang = request.source_lang or speaker_profile.get("source_language") or "vi"
        resolved_target_lang = request.target_lang or target_profile.get("target_language") or ("en" if resolved_source_lang == "vi" else "vi")
        resolved_voice_profile = request.voice_profile or target_profile.get("voice_profile") or "default"

        key = (request.speaker_identity, resolved_target_identity)
        context = self.context_map.setdefault(key, deque(maxlen=self.context_window))
        result_events: list[SessionEvent] = []

        try:
            stt_result, stt_warnings = await run_with_fallback(
                stage="stt",
                providers=self.provider_bundle.stt_chain,
                invoke=lambda provider: provider.transcribe(request.text, resolved_source_lang),
            )
            result_events.extend(self._warning_events(stt_warnings, utterance_id, request))

            subtitle_event = SessionEvent(
                type="subtitle.final",
                session_id=self.session_id,
                room_id=self.room_id,
                utterance_id=utterance_id,
                speaker_identity=request.speaker_identity,
                source_lang=stt_result.detected_language,
                target_lang=resolved_target_lang,
                timestamp=utc_now_iso(),
                text=stt_result.text,
                details={"provider": stt_result.provider, "target_identity": resolved_target_identity},
            )
            self.events.append(subtitle_event)
            result_events.append(subtitle_event)

            translation_result, translate_warnings = await run_with_fallback(
                stage="translate",
                providers=self.provider_bundle.translate_chain,
                invoke=lambda provider: provider.translate(
                    stt_result.text,
                    stt_result.detected_language,
                    resolved_target_lang,
                    list(context),
                ),
            )
            result_events.extend(self._warning_events(translate_warnings, utterance_id, request))

            translation_details: dict[str, str | None] = {
                "translate_provider": translation_result.provider,
                "tts_provider": None,
                "audio_ref": None,
                "target_identity": resolved_target_identity,
            }

            translation_event = SessionEvent(
                type="translation.final",
                session_id=self.session_id,
                room_id=self.room_id,
                utterance_id=utterance_id,
                speaker_identity=request.speaker_identity,
                source_lang=stt_result.detected_language,
                target_lang=resolved_target_lang,
                timestamp=utc_now_iso(),
                text=stt_result.text,
                translated_text=translation_result.translated_text,
                details=translation_details,
            )
            self.events.append(translation_event)
            result_events.append(translation_event)

            try:
                tts_result, tts_warnings = await run_with_fallback(
                    stage="tts",
                    providers=self.provider_bundle.tts_chain,
                    invoke=lambda provider: provider.synthesize(translation_result.translated_text, resolved_voice_profile),
                )
                translation_details["tts_provider"] = tts_result.provider
                translation_details["audio_ref"] = tts_result.audio_ref
                result_events.extend(self._warning_events(tts_warnings, utterance_id, request))
            except FallbackExhaustedError as exhausted:
                result_events.extend(self._warning_events(exhausted.warnings, utterance_id, request))
                result_events.extend(
                    self._warning_events(
                        [{"provider": "tts_chain", "error": str(exhausted)}],
                        utterance_id,
                        request,
                    )
                )

            context.append(
                {
                    "source_text": stt_result.text,
                    "translated_text": translation_result.translated_text,
                }
            )
            return result_events
        except FallbackExhaustedError as exhausted:
            result_events.extend(self._warning_events(exhausted.warnings, utterance_id, request))
            error_event = SessionEvent(
                type="error",
                session_id=self.session_id,
                room_id=self.room_id,
                utterance_id=utterance_id,
                speaker_identity=request.speaker_identity,
                source_lang=resolved_source_lang,
                target_lang=resolved_target_lang,
                timestamp=utc_now_iso(),
                details={"stage": exhausted.stage, "error": str(exhausted), "target_identity": resolved_target_identity},
            )
            self.events.append(error_event)
            result_events.append(error_event)
            return result_events
        except Exception as exc:  # noqa: BLE001
            error_event = SessionEvent(
                type="error",
                session_id=self.session_id,
                room_id=self.room_id,
                utterance_id=utterance_id,
                speaker_identity=request.speaker_identity,
                source_lang=resolved_source_lang,
                target_lang=resolved_target_lang,
                timestamp=utc_now_iso(),
                details={"error": str(exc), "target_identity": resolved_target_identity},
            )
            self.events.append(error_event)
            result_events.append(error_event)
            return result_events

    def _warning_events(
        self,
        warnings: list[dict[str, str]],
        utterance_id: str,
        request: SimulateUtteranceRequest,
    ) -> list[SessionEvent]:
        events: list[SessionEvent] = []
        for warning in warnings:
            event = SessionEvent(
                type="warning",
                session_id=self.session_id,
                room_id=self.room_id,
                utterance_id=utterance_id,
                speaker_identity=request.speaker_identity,
                source_lang=request.source_lang or "vi",
                target_lang=request.target_lang or "en",
                timestamp=utc_now_iso(),
                details={
                    **warning,
                    "target_identity": request.target_identity or self._resolve_target_identity(request.speaker_identity, request.target_identity),
                },
            )
            self.events.append(event)
            events.append(event)
        return events

    def _resolve_target_identity(self, speaker_identity: str, target_identity: str | None) -> str:
        if target_identity:
            return target_identity
        for identity in self.participant_by_identity:
            if identity != speaker_identity:
                return identity
        return "listener_unknown"
