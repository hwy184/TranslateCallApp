# Task 04 - Worker Pipeline Session + Provider Registry

## Muc tieu

Nang cap worker tu session memory don gian thanh `RoomPipelineSession` co pipeline va fallback theo provider profile.

## Da implement

- Provider contracts:
  - `app/providers/base.py`
- Built-in scaffold providers:
  - `app/providers/builtin.py`
- Provider registry + profile resolution:
  - `app/providers/registry.py`
- Fallback executor:
  - `app/providers/fallback.py`
- Room pipeline session:
  - `app/sessions/room_pipeline_session.py`
  - context key theo `(speaker_identity, target_identity)` voi window 3-10 (default 5)
  - events: `session.state`, `subtitle.final`, `translation.final`, `warning`, `error`
- Session manager async:
  - `app/sessions/manager.py`
- Internal API bo sung:
  - `POST /internal/sessions/{session_id}/simulate-utterance`
  - `GET /internal/sessions/{session_id}/events`

## Fallback behavior

- STT chain: provider dau fail -> provider tiep theo.
- Translate chain: provider dau fail -> provider tiep theo.
- TTS chain: provider dau fail -> provider tiep theo.
- Moi lan fallback tao `warning` event de de quan sat.

## Cách test nhanh

1. Start session profile production:
```bash
POST /internal/sessions/start
{
  "session_id":"session_demo",
  "room_id":"room_demo",
  "provider_profile":"silero+google_stt+openai_translate+google_tts"
}
```

2. Simulate utterance:
```bash
POST /internal/sessions/session_demo/simulate-utterance
{
  "speaker_identity":"host_device_001",
  "target_identity":"guest_device_001",
  "text":"Xin chao ban",
  "source_lang":"vi",
  "target_lang":"en",
  "voice_profile":"guest-default"
}
```

3. Test forced fallback:
- Chen marker `__fail_google_stt__` hoac `__fail_openai_translate__` vao `text`.
- Kiem tra `warning` events trong response va `GET /internal/sessions/session_demo/events`.
