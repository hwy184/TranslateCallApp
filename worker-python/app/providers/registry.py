from __future__ import annotations

from dataclasses import dataclass

from .base import STTProvider, TTSProvider, TranslateProvider, VADProvider
from .builtin import EchoSTTProvider, MockTTSProvider, RuleTranslateProvider, SimpleVADProvider


@dataclass
class ProviderBundle:
    profile: str
    vad_chain: list[VADProvider]
    stt_chain: list[STTProvider]
    translate_chain: list[TranslateProvider]
    tts_chain: list[TTSProvider]


class ProviderRegistry:
    def __init__(self) -> None:
        self._vad_catalog = {
            "silero": SimpleVADProvider("silero"),
        }
        self._stt_catalog = {
            "google_stt": EchoSTTProvider("google_stt"),
            "whisper_local": EchoSTTProvider("whisper_local"),
        }
        self._translate_catalog = {
            "openai_translate": RuleTranslateProvider("openai_translate"),
            "ollama_translate": RuleTranslateProvider("ollama_translate"),
        }
        self._tts_catalog = {
            "google_tts": MockTTSProvider("google_tts"),
            "edge_tts": MockTTSProvider("edge_tts"),
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
        }

    def resolve(self, profile: str) -> ProviderBundle:
        resolved_profile = profile
        if profile not in self._profiles:
            resolved_profile = "silero+google_stt+openai_translate+google_tts"

        spec = self._profiles[resolved_profile]
        return ProviderBundle(
            profile=resolved_profile,
            vad_chain=[self._vad_catalog[name] for name in spec["vad"]],
            stt_chain=[self._stt_catalog[name] for name in spec["stt"]],
            translate_chain=[self._translate_catalog[name] for name in spec["translate"]],
            tts_chain=[self._tts_catalog[name] for name in spec["tts"]],
        )
