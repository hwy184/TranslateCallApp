# Worker Python (Scaffold)

V1 worker skeleton that will host `RoomPipelineSession` and provider registry in next tasks.

## Run

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8090 --reload
```

## Current state

- `GET /health`: implemented.
- `POST /internal/sessions/start`: in-memory session start.
- `POST /internal/sessions/{session_id}/stop`: in-memory session stop.
- `GET /internal/sessions`: inspect current in-memory sessions.
