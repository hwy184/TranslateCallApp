from __future__ import annotations

from dataclasses import dataclass

from .base import STTProvider, TTSProvider, TranslateProvider, VADProvider
from ..config.settings import Settings
from .ai import (
    EdgeRefTTSProvider,
    GeminiTextSTTProvider,
    GeminiTranslateProvider,
    OllamaTranslateProvider,
    OpenAITextSTTProvider,
    OpenAITranslateProvider,
)
from .builtin import EchoSTTProvider, MockTTSProvider, RuleTranslateProvider, SimpleVADProvider


@dataclass
class ProviderBundle:
    profile: str
    vad_chain: list[VADProvider]
    stt_chain: list[STTProvider]
    translate_chain: list[TranslateProvider]
    tts_chain: list[TTSProvider]


class ProviderRegistry:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._vad_catalog = {
            "silero": SimpleVADProvider("silero"),
        }
        self._stt_catalog = {
            "google_stt": EchoSTTProvider("google_stt"),
            "whisper_local": EchoSTTProvider("whisper_local"),
            "openai_stt": OpenAITextSTTProvider(),
            "gemini_stt": GeminiTextSTTProvider(),
        }
        self._translate_catalog = {
            "gemini_translate": GeminiTranslateProvider(
                api_key=settings.gemini_api_key,
                model=settings.gemini_translate_model,
            ),
            "openai_translate": OpenAITranslateProvider(
                api_key=settings.openai_api_key,
                model=settings.openai_translate_model,
            ),
            "ollama_translate": OllamaTranslateProvider(
                base_url=settings.ollama_base_url,
                model=settings.ollama_translate_model,
                timeout_sec=settings.ollama_translate_timeout_sec,
            ),
            "rule_translate": RuleTranslateProvider("rule_translate"),
        }
        self._tts_catalog = {
            "google_tts": MockTTSProvider("google_tts"),
            "edge_tts": EdgeRefTTSProvider(),
            "mock_tts": MockTTSProvider("mock_tts"),
        }

        self._profiles = {
            "silero+google_stt+openai_translate+google_tts": {
                "vad": ["silero"],
                "stt": ["google_stt", "whisper_local"],
                "translate": ["openai_translate", "ollama_translate"],
                "tts": ["google_tts", "edge_tts"],
            },
            "silero+whisper_local+ollama_translate+edge_tts": {
                "vad": ["silero"],
                "stt": ["whisper_local", "google_stt"],
                "translate": ["ollama_translate", "openai_translate"],
                "tts": ["edge_tts", "google_tts"],
            },
            "free-first": {
                "vad": ["silero"],
                "stt": ["whisper_local", "openai_stt", "google_stt"],
                "translate": ["ollama_translate", "openai_translate", "rule_translate"],
                "tts": ["edge_tts", "mock_tts"],
            },
            "gemini-first": {
                "vad": ["silero"],
                "stt": ["gemini_stt", "openai_stt", "whisper_local", "google_stt"],
                "translate": ["gemini_translate", "openai_translate", "ollama_translate", "rule_translate"],
                "tts": ["edge_tts", "mock_tts"],
            },
            "paid-first": {
                "vad": ["silero"],
                "stt": ["openai_stt", "whisper_local", "google_stt"],
                "translate": ["openai_translate", "ollama_translate", "rule_translate"],
                "tts": ["edge_tts", "mock_tts"],
            },
            "google-first": {
                "vad": ["silero"],
                "stt": ["google_stt", "openai_stt", "whisper_local"],
                "translate": ["openai_translate", "gemini_translate", "rule_translate"],
                "tts": ["google_tts", "edge_tts", "mock_tts"],
            },
        }

    def resolve(self, profile: str) -> ProviderBundle:
        resolved_profile = profile
        if profile not in self._profiles:
            resolved_profile = self._settings.default_provider_profile
            if resolved_profile not in self._profiles:
                resolved_profile = "gemini-first"

        spec = self._profiles[resolved_profile]
        return ProviderBundle(
            profile=resolved_profile,
            vad_chain=[self._vad_catalog[name] for name in spec["vad"]],
            stt_chain=[self._stt_catalog[name] for name in spec["stt"]],
            translate_chain=[self._translate_catalog[name] for name in spec["translate"]],
            tts_chain=[self._tts_catalog[name] for name in spec["tts"]],
        )
