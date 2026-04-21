from __future__ import annotations

import base64
from typing import Any

import httpx

from .base import STTProvider, STTResult, TTSProvider, TTSResult, TranslateProvider, TranslateResult


def _trim_json_text(payload: Any) -> str:
    if isinstance(payload, str):
        return payload.strip()
    return str(payload).strip()


def _extract_gemini_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return ""
    content = candidates[0].get("content", {})
    parts = content.get("parts", []) if isinstance(content, dict) else []
    text_chunks: list[str] = []
    for part in parts:
        if isinstance(part, dict):
            text = part.get("text")
            if isinstance(text, str) and text.strip():
                text_chunks.append(text.strip())
    return "\n".join(text_chunks).strip()


class OllamaTranslateProvider(TranslateProvider):
    def __init__(self, base_url: str, model: str, timeout_sec: float = 20.0):
        self.name = "ollama_translate"
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout_sec = timeout_sec

    async def translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        context: list[dict[str, str]],
    ) -> TranslateResult:
        context_lines: list[str] = []
        for item in context[-3:]:
            src = item.get("source_text", "").strip()
            dst = item.get("translated_text", "").strip()
            if src and dst:
                context_lines.append(f"- {src} => {dst}")

        prompt = (
            f"Translate from {source_lang} to {target_lang}.\n"
            "Return only the translated text, no explanation.\n"
            f"Input: {text}\n"
        )
        if context_lines:
            prompt += "Context:\n" + "\n".join(context_lines)

        async with httpx.AsyncClient(timeout=self._timeout_sec) as client:
            if self._base_url.endswith("/v1"):
                try:
                    response = await client.post(
                        f"{self._base_url}/chat/completions",
                        json={
                            "model": self._model,
                            "temperature": 0.2,
                            "messages": [
                                {"role": "system", "content": "Return only translated text."},
                                {"role": "user", "content": prompt},
                            ],
                        },
                    )
                    response.raise_for_status()
                    data = response.json()
                    translated_text = _trim_json_text(
                        data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    )
                    if not translated_text:
                        raise RuntimeError("ollama_empty_response_v1")
                    return TranslateResult(translated_text=translated_text, provider=self.name)
                except httpx.TimeoutException as exc:
                    raise RuntimeError(f"ollama_timeout_v1:{self._timeout_sec}s") from exc

            try:
                response = await client.post(
                    f"{self._base_url}/api/generate",
                    json={
                        "model": self._model,
                        "prompt": prompt,
                        "stream": False,
                        "keep_alive": "30m",
                        "options": {"temperature": 0.2},
                    },
                )
                response.raise_for_status()
                data = response.json()
                translated_text = _trim_json_text(data.get("response", ""))
                if not translated_text:
                    raise RuntimeError("ollama_empty_response")
                return TranslateResult(translated_text=translated_text, provider=self.name)
            except httpx.TimeoutException as exc:
                raise RuntimeError(f"ollama_timeout:{self._timeout_sec}s") from exc


class OpenAITranslateProvider(TranslateProvider):
    def __init__(self, api_key: str, model: str, timeout_sec: float = 20.0):
        self.name = "openai_translate"
        self._api_key = api_key
        self._model = model
        self._timeout_sec = timeout_sec

    async def translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        context: list[dict[str, str]],
    ) -> TranslateResult:
        if not self._api_key:
            raise RuntimeError("openai_api_key_missing")

        context_lines: list[str] = []
        for item in context[-3:]:
            src = item.get("source_text", "").strip()
            dst = item.get("translated_text", "").strip()
            if src and dst:
                context_lines.append(f"- {src} => {dst}")

        system_prompt = (
            "You are a real-time translation engine. "
            "Return only translated text. No commentary."
        )
        user_prompt = f"Translate from {source_lang} to {target_lang}.\nText: {text}"
        if context_lines:
            user_prompt += "\nContext:\n" + "\n".join(context_lines)

        async with httpx.AsyncClient(timeout=self._timeout_sec) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self._model,
                    "temperature": 0.2,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                },
            )
            response.raise_for_status()
            data = response.json()
            translated_text = _trim_json_text(
                data.get("choices", [{}])[0].get("message", {}).get("content", "")
            )
            if not translated_text:
                raise RuntimeError("openai_translate_empty_response")
            return TranslateResult(translated_text=translated_text, provider=self.name)


class GeminiTranslateProvider(TranslateProvider):
    def __init__(self, api_key: str, model: str, timeout_sec: float = 20.0):
        self.name = "gemini_translate"
        self._api_key = api_key
        self._model = model
        self._timeout_sec = timeout_sec

    async def translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        context: list[dict[str, str]],
    ) -> TranslateResult:
        if not self._api_key:
            raise RuntimeError("gemini_api_key_missing")

        context_lines: list[str] = []
        for item in context[-3:]:
            src = item.get("source_text", "").strip()
            dst = item.get("translated_text", "").strip()
            if src and dst:
                context_lines.append(f"- {src} => {dst}")

        prompt = (
            f"You are a real-time translator.\n"
            f"Translate from {source_lang} to {target_lang}.\n"
            "Output only translated text. No explanation.\n"
            f"Input: {text}"
        )
        if context_lines:
            prompt += "\nContext:\n" + "\n".join(context_lines)

        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/{self._model}:generateContent"
            f"?key={self._api_key}"
        )
        async with httpx.AsyncClient(timeout=self._timeout_sec) as client:
            response = await client.post(
                url,
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.2},
                },
            )
            response.raise_for_status()
            data = response.json()
            translated_text = _extract_gemini_text(data)
            if not translated_text:
                raise RuntimeError("gemini_translate_empty_response")
            return TranslateResult(translated_text=translated_text, provider=self.name)


class OpenAITextSTTProvider(STTProvider):
    """
    Transitional STT provider.
    Current pipeline feeds text input, so this provider performs lightweight cleanup.
    If payload starts with 'base64:', it will decode bytes and return marker text.
    """

    def __init__(self):
        self.name = "openai_stt"

    async def transcribe(self, utterance: str, language_hint: str | None) -> STTResult:
        text = utterance.strip()
        if utterance.startswith("base64:"):
            _ = base64.b64decode(utterance[len("base64:") :], validate=False)
            text = "[audio_payload_received]"
        if not text:
            raise RuntimeError("stt_empty_input")
        return STTResult(text=text, detected_language=language_hint or "auto", provider=self.name)


class GeminiTextSTTProvider(STTProvider):
    """
    Transitional STT provider for text-mode pipeline compatibility.
    """

    def __init__(self):
        self.name = "gemini_stt"

    async def transcribe(self, utterance: str, language_hint: str | None) -> STTResult:
        text = utterance.strip()
        if utterance.startswith("base64:"):
            _ = base64.b64decode(utterance[len("base64:") :], validate=False)
            text = "[audio_payload_received]"
        if not text:
            raise RuntimeError("stt_empty_input")
        return STTResult(text=text, detected_language=language_hint or "auto", provider=self.name)


class EdgeRefTTSProvider(TTSProvider):
    """
    Transitional TTS provider.
    Returns a provider-specific reference for downstream audio publisher.
    """

    def __init__(self):
        self.name = "edge_tts"

    async def synthesize(self, text: str, voice_profile: str) -> TTSResult:
        if not text.strip():
            raise RuntimeError("tts_empty_text")
        audio_ref = f"edge://voice={voice_profile or 'default'}&len={len(text)}"
        return TTSResult(audio_ref=audio_ref, provider=self.name)
