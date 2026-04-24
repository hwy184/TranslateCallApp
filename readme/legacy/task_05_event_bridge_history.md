# Task 05 - Contracts + Event Bridge + History Persistence

## Muc tieu

Noi kin vong event Worker -> Backend va luu transcript/history tu event realtime.

## Da lam

- Worker:
  - Them `BackendEventsClient` de push event sang backend:
    - `worker-python/app/services/backend_events.py`
  - Them config:
    - `BACKEND_EVENTS_URL`
    - `BACKEND_EVENTS_TIMEOUT_SEC`
    - `BACKEND_EVENTS_RETRIES`
  - Session manager emit event ra backend o cac diem:
    - start session (`session.state`)
    - stop session (`session.state`)
    - utterance pipeline (`subtitle.final`, `translation.final`, `warning`, `error`)

- Backend:
  - Validate payload worker event theo `type` (co conditional required fields):
    - `backend-node/src/routes/v1.route.ts`
  - Luu event vao `worker_events` va transcript vao `transcript_items`:
    - `backend-node/src/services/persistence.ts`
  - `GET /history` doc du lieu that tu DB (co filter `room_id`, `session_id`, `limit`):
    - `backend-node/src/routes/v1.route.ts`

## Ghi chu contract

- `subtitle.final`, `translation.final` bat buoc:
  - `utterance_id`
  - `speaker_identity`
  - `source_lang`
  - `target_lang`
- `translation.final` bat buoc them `translated_text`.
- `session.state` va `participant.state` khong bat buoc utterance fields.

## Test smoke de xac nhan

1. Tao room + join room (backend trigger start worker).
2. Goi worker `simulate-utterance`.
3. Kiem tra:
   - Backend `GET /api/v1/internal/worker/events` co event moi.
   - Backend `GET /api/v1/history?room_id=<roomId>` co transcript rows.
