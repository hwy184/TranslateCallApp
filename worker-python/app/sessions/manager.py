from datetime import datetime, timezone
from threading import Lock
from .models import SessionState, StartSessionRequest


class SessionManager:
    def __init__(self) -> None:
        self._lock = Lock()
        self._sessions: dict[str, SessionState] = {}

    def start_session(self, payload: StartSessionRequest) -> SessionState:
        with self._lock:
            now = datetime.now(timezone.utc).isoformat()
            session = SessionState(
                session_id=payload.session_id,
                room_id=payload.room_id,
                provider_profile=payload.provider_profile,
                status="running",
                created_at=now,
                updated_at=now,
            )
            self._sessions[payload.session_id] = session
            return session

    def stop_session(self, session_id: str) -> SessionState | None:
        with self._lock:
            current = self._sessions.get(session_id)
            if current is None:
                return None

            stopped = current.model_copy(update={"status": "stopped", "updated_at": datetime.now(timezone.utc).isoformat()})
            self._sessions[session_id] = stopped
            return stopped

    def list_sessions(self) -> list[SessionState]:
        with self._lock:
            return list(self._sessions.values())

    def get_session(self, session_id: str) -> SessionState | None:
        with self._lock:
            return self._sessions.get(session_id)
