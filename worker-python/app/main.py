from fastapi import FastAPI
from .api.routes import build_router
from .config.settings import get_settings
from .sessions.manager import SessionManager


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)
    manager = SessionManager()
    app.include_router(build_router(manager))
    return app


app = create_app()
