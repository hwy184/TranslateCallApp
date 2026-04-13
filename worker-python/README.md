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
