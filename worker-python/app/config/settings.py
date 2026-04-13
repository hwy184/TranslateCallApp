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


@lru_cache
def get_settings() -> Settings:
    return Settings()
