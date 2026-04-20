from datetime import datetime, timezone
from pydantic import BaseModel, Field


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class StartSessionRequest(BaseModel):
    session_id: str = Field(min_length=1)
    room_id: str = Field(min_length=1)
    provider_profile: str = Field(default="gemini-first")
    context_window: int = Field(default=5, ge=3, le=10)
    room_metadata: dict[str, object] | None = None
    participants: list[dict[str, str]] = Field(default_factory=list)
    livekit: dict[str, str] | None = None


class StopSessionRequest(BaseModel):
    reason: str = Field(default="backend_request")


class SessionState(BaseModel):
    session_id: str
    room_id: str
    provider_profile: str
    status: str
    created_at: str
    updated_at: str


class SimulateUtteranceRequest(BaseModel):
    speaker_identity: str = Field(min_length=1)
    target_identity: str | None = None
    text: str = Field(min_length=1)
    source_lang: str | None = Field(default=None, min_length=2)
    target_lang: str | None = Field(default=None, min_length=2)
    voice_profile: str | None = Field(default=None, min_length=1)
    utterance_id: str | None = None


class SessionEvent(BaseModel):
    type: str
    session_id: str
    room_id: str
    utterance_id: str | None = None
    speaker_identity: str | None = None
    source_lang: str | None = None
    target_lang: str | None = None
    timestamp: str
    text: str | None = None
    translated_text: str | None = None
    details: dict[str, str] | dict[str, object] | None = None
