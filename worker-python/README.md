# Worker Python (Scaffold)

V1 worker skeleton that will host `RoomPipelineSession` and provider registry in next tasks.

## Run

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8090 --reload
```

## Current state

- `GET /health`: implemented.
- `POST /internal/sessions/start`: start `RoomPipelineSession` with provider profile.
- `POST /internal/sessions/{session_id}/stop`: stop active session.
- `GET /internal/sessions`: inspect current sessions.
- `POST /internal/sessions/{session_id}/simulate-utterance`: run pipeline with fallback/context (debug endpoint).
- `GET /internal/sessions/{session_id}/events`: inspect emitted events (`subtitle.final`, `translation.final`, `warning`, `error`, `session.state`).
- Worker auto-pushes events to backend via `BACKEND_EVENTS_URL` with retry (`BACKEND_EVENTS_RETRIES`).
- Optional LiveKit Cloud bridge can be enabled with `LIVEKIT_BRIDGE_ENABLED=true` (worker joins room as hidden participant and publishes translation events to data channel).

## Provider Profiles

- `gemini-first` (default): online-first (`gemini_translate` -> `openai_translate`), local fallback (`ollama_translate`), then `rule_translate`.
- `free-first`: `ollama_translate` first, then `openai_translate`, then `rule_translate` fallback.
- `paid-first`: prioritize OpenAI translate before Ollama.

Environment keys:

- `DEFAULT_PROVIDER_PROFILE=gemini-first`
- `OLLAMA_BASE_URL=http://host.docker.internal:11434`
- `OLLAMA_TRANSLATE_MODEL=qwen2.5:3b`
- `GEMINI_API_KEY=`
- `GEMINI_TRANSLATE_MODEL=gemini-2.5-flash`
- `GEMINI_STT_MODEL=gemini-2.5-flash`
- `GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts`
- `OPENAI_API_KEY=` (optional, used as paid fallback)
- `OPENAI_TRANSLATE_MODEL=gpt-4o-mini`
- `OPENAI_STT_MODEL=whisper-1`
- `EDGE_TTS_VOICE_DEFAULT=en-US-AriaNeural`

Realtime note:

- LiveKit bridge ingests remote audio frames, segments speech with energy-based VAD, transcribes with Gemini STT (`GEMINI_API_KEY` required), then runs translation pipeline and publishes translated audio (Gemini TTS first, Edge TTS fallback).
