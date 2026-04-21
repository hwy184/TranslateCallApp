from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "voice-worker"
    port: int = Field(default=8000, gt=0)
    log_level: str = "INFO"
    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    livekit_bridge_enabled: bool = False
    livekit_worker_identity_prefix: str = "ai_worker_"
    backend_events_url: str = "http://backend:3000/api/v1/internal/worker/events"
    backend_events_timeout_sec: float = Field(default=3.0, gt=0)
    backend_events_retries: int = Field(default=2, ge=0, le=5)
    default_provider_profile: str = "google-first"
    ollama_base_url: str = "http://host.docker.internal:11434"
    ollama_translate_model: str = "gemma4:e4b"
    ollama_translate_timeout_sec: float = Field(default=75.0, ge=5.0, le=300.0)
    openai_api_key: str = ""
    openai_translate_model: str = "gpt-4o-mini"
    openai_stt_model: str = "whisper-1"
    gemini_api_key: str = ""
    gemini_translate_model: str = "gemini-2.5-flash"
    gemini_stt_model: str = "gemini-2.5-flash"
    gemini_tts_model: str = "gemini-2.5-flash-preview-tts"
    local_stt_enabled: bool = True
    local_stt_model_size: str = "base"
    local_stt_compute_type: str = "int8"
    local_stt_device: str = "cpu"
    stt_energy_threshold: int = Field(default=250, ge=50, le=5000)
    stt_min_speech_ms: int = Field(default=650, ge=100, le=3000)
    stt_min_voiced_ms: int = Field(default=100, ge=40, le=3000)
    stt_min_voiced_ratio: float = Field(default=0.18, ge=0.05, le=1.0)
    stt_silence_hangover_ms: int = Field(default=700, ge=80, le=3000)
    stt_max_segment_ms: int = Field(default=12000, ge=2000, le=30000)
    stt_min_request_interval_ms: int = Field(default=550, ge=0, le=10000)
    stt_duplicate_suppress_window_ms: int = Field(default=5000, ge=0, le=30000)
    stt_force_segment_peak_rms: int = Field(default=3000, ge=200, le=30000)
    stt_force_segment_min_voiced_ms: int = Field(default=10, ge=0, le=500)
    edge_tts_voice_default: str = "en-US-AriaNeural"
    edge_tts_rate: str = "+0%"


@lru_cache
def get_settings() -> Settings:
    return Settings()
