from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "voice-worker"
    port: int = Field(default=8090, gt=0)
    log_level: str = "INFO"
    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    backend_events_url: str = "http://backend:8080/api/v1/internal/worker/events"
    backend_events_timeout_sec: float = Field(default=3.0, gt=0)
    backend_events_retries: int = Field(default=2, ge=0, le=5)


@lru_cache
def get_settings() -> Settings:
    return Settings()
