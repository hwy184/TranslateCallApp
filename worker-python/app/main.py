from fastapi import FastAPI
from .api.routes import build_router
from .config.settings import get_settings
from .sessions.manager import SessionManager
from .services.backend_events import BackendEventsClient


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)
    backend_events = BackendEventsClient(settings)
    manager = SessionManager(event_sink=backend_events.publish_many)
    app.include_router(build_router(manager))

    @app.on_event("shutdown")
    async def shutdown() -> None:
        await manager.close()
        await backend_events.aclose()

    return app


app = create_app()
