from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass
class STTResult:
    text: str
    detected_language: str
    provider: str


@dataclass
class TranslateResult:
    translated_text: str
    provider: str


@dataclass
class TTSResult:
    audio_ref: str | None
    provider: str


class VADProvider(Protocol):
    name: str

    async def is_speech(self, text: str) -> bool:
        ...


class STTProvider(Protocol):
    name: str

    async def transcribe(self, utterance: str, language_hint: str | None) -> STTResult:
        ...


class TranslateProvider(Protocol):
    name: str

    async def translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        context: list[dict[str, str]],
    ) -> TranslateResult:
        ...


class TTSProvider(Protocol):
    name: str

    async def synthesize(self, text: str, voice_profile: str) -> TTSResult:
        ...
