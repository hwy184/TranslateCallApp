import asyncio
from .models import SessionState, StartSessionRequest, SimulateUtteranceRequest
from .room_pipeline_session import RoomPipelineSession
from ..providers.registry import ProviderRegistry


class SessionManager:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._registry = ProviderRegistry()
        self._sessions: dict[str, RoomPipelineSession] = {}

    async def start_session(self, payload: StartSessionRequest) -> SessionState:
        async with self._lock:
            existing = self._sessions.get(payload.session_id)
            if existing and existing.status == "running":
                return self._to_state(existing)

            provider_bundle = self._registry.resolve(payload.provider_profile)
            session = RoomPipelineSession(
                session_id=payload.session_id,
                room_id=payload.room_id,
                provider_bundle=provider_bundle,
                context_window=payload.context_window,
            )
            self._sessions[payload.session_id] = session
            return self._to_state(session)

    async def stop_session(self, session_id: str) -> SessionState | None:
        async with self._lock:
            current = self._sessions.get(session_id)
            if current is None:
                return None

            current.stop()
            return self._to_state(current)

    async def list_sessions(self) -> list[SessionState]:
        async with self._lock:
            return [self._to_state(item) for item in self._sessions.values()]

    async def get_session(self, session_id: str) -> SessionState | None:
        async with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            return self._to_state(session)

    async def simulate_utterance(self, session_id: str, payload: SimulateUtteranceRequest):
        async with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None, None
            if session.status != "running":
                return session, []

        events = await session.process_utterance(payload)
        return session, events

    async def list_session_events(self, session_id: str):
        async with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            return session.list_events()

    def _to_state(self, session: RoomPipelineSession) -> SessionState:
        return SessionState(
            session_id=session.session_id,
            room_id=session.room_id,
            provider_profile=session.provider_bundle.profile,
            status=session.status,
            created_at=session.created_at,
            updated_at=session.updated_at,
        )
