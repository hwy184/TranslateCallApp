from __future__ import annotations

from .base import STTProvider, STTResult, TTSProvider, TTSResult, TranslateProvider, TranslateResult, VADProvider


def _fail_marker(provider_name: str) -> str:
    return f"__fail_{provider_name}__"


class SimpleVADProvider(VADProvider):
    def __init__(self, name: str):
        self.name = name

    async def is_speech(self, text: str) -> bool:
        normalized = text.strip()
        return len(normalized) > 0


class EchoSTTProvider(STTProvider):
    def __init__(self, name: str):
        self.name = name

    async def transcribe(self, utterance: str, language_hint: str | None) -> STTResult:
        if _fail_marker(self.name) in utterance:
            raise RuntimeError(f"{self.name}_forced_failure")
        return STTResult(text=utterance.strip(), detected_language=language_hint or "vi", provider=self.name)


class RuleTranslateProvider(TranslateProvider):
    def __init__(self, name: str):
        self.name = name

    async def translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        context: list[dict[str, str]],
    ) -> TranslateResult:
        if _fail_marker(self.name) in text:
            raise RuntimeError(f"{self.name}_forced_failure")

        # Keep fallback output clean for end users (no debug suffixes).
        translated = text
        return TranslateResult(translated_text=translated, provider=self.name)


class MockTTSProvider(TTSProvider):
    def __init__(self, name: str):
        self.name = name

    async def synthesize(self, text: str, voice_profile: str) -> TTSResult:
        if _fail_marker(self.name) in text:
            raise RuntimeError(f"{self.name}_forced_failure")
        return TTSResult(audio_ref=f"mock://{self.name}/{voice_profile}/{len(text)}", provider=self.name)
