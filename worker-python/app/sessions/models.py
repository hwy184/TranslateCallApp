from datetime import datetime, timezone
from pydantic import BaseModel, Field


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class StartSessionRequest(BaseModel):
    session_id: str = Field(min_length=1)
    room_id: str = Field(min_length=1)
    provider_profile: str = Field(default="production-default")


class StopSessionRequest(BaseModel):
    reason: str = Field(default="backend_request")


class SessionState(BaseModel):
    session_id: str
    room_id: str
    provider_profile: str
    status: str
    created_at: str
    updated_at: str
