from fastapi import FastAPI
import asyncio
from .api.routes import build_router
from .config.settings import get_settings
from .sessions.manager import SessionManager
from .services.backend_events import BackendEventsClient
from .services.livekit_bridge import LiveKitBridge


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)
    backend_events = BackendEventsClient(settings)
    livekit_bridge = LiveKitBridge(settings)

    async def combined_event_sink(events):
        await asyncio.gather(
            backend_events.publish_many(events),
            livekit_bridge.publish_many(events),
            return_exceptions=True,
        )

    manager = SessionManager(
        event_sink=combined_event_sink,
        on_session_start=livekit_bridge.start_session,
        on_session_stop=livekit_bridge.stop_session,
    )
    app.include_router(build_router(manager))

    @app.on_event("shutdown")
    async def shutdown() -> None:
        await manager.close()
        await backend_events.aclose()

    return app


app = create_app()
