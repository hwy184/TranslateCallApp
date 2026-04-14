from fastapi import APIRouter, HTTPException
from ..sessions.manager import SessionManager
from ..sessions.models import SessionState, SimulateUtteranceRequest, StartSessionRequest, StopSessionRequest


def build_router(session_manager: SessionManager) -> APIRouter:
    router = APIRouter()

    @router.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": "worker-python", "version": "v1-skeleton"}

    @router.get("/internal/sessions")
    async def list_sessions():
        items = await session_manager.list_sessions()
        return {"items": [item.model_dump() for item in items]}

    @router.post("/internal/sessions/start")
    async def start_session(payload: StartSessionRequest):
        state = await session_manager.start_session(payload)
        return {"session": state.model_dump()}

    @router.post("/internal/sessions/{session_id}/stop")
    async def stop_session(session_id: str, _payload: StopSessionRequest):
        state = await session_manager.stop_session(session_id)
        if state is None:
            raise HTTPException(status_code=404, detail="session_not_found")
        return {"session": state.model_dump()}

    @router.post("/internal/sessions/{session_id}/simulate-utterance")
    async def simulate_utterance(session_id: str, payload: SimulateUtteranceRequest):
        session, events = await session_manager.simulate_utterance(
            session_id,
            payload,
            blocking_emit=True,
        )
        if session is None:
            raise HTTPException(status_code=404, detail="session_not_found")

        state: SessionState | None = await session_manager.get_session(session_id)
        if state is None:
            raise HTTPException(status_code=404, detail="session_not_found")

        return {
            "session": state.model_dump(),
            "events": [event.model_dump() for event in events],
        }

    @router.get("/internal/sessions/{session_id}/events")
    async def get_session_events(session_id: str):
        events = await session_manager.list_session_events(session_id)
        if events is None:
            raise HTTPException(status_code=404, detail="session_not_found")
        return {"items": [event.model_dump() for event in events]}

    return router
