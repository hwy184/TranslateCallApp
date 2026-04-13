from fastapi import APIRouter, HTTPException
from ..sessions.manager import SessionManager
from ..sessions.models import StartSessionRequest, StopSessionRequest


def build_router(session_manager: SessionManager) -> APIRouter:
    router = APIRouter()

    @router.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": "worker-python", "version": "v1-skeleton"}

    @router.get("/internal/sessions")
    async def list_sessions():
        return {"items": [item.model_dump() for item in session_manager.list_sessions()]}

    @router.post("/internal/sessions/start")
    async def start_session(payload: StartSessionRequest):
        state = session_manager.start_session(payload)
        return {"session": state.model_dump()}

    @router.post("/internal/sessions/{session_id}/stop")
    async def stop_session(session_id: str, _payload: StopSessionRequest):
        state = session_manager.stop_session(session_id)
        if state is None:
            raise HTTPException(status_code=404, detail="session_not_found")
        return {"session": state.model_dump()}

    return router
