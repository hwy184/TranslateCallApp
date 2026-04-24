# Task 02 - Backend API Core

## Muc tieu

Implement API core cho luong room va worker orchestration:

- Auth guest/login/logout (in-memory).
- Room create/join/end.
- Trigger worker start/stop qua HTTP client.
- Worker callback endpoint (`/internal/worker/events`).

## Da implement

- `POST /api/v1/auth/guest`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/rooms`
- `POST /api/v1/rooms/join`
- `POST /api/v1/rooms/{roomId}/end`
- `PATCH /api/v1/rooms/{roomId}/participants/{participantId}/settings`
- `POST /api/v1/internal/worker/events`
- `GET /api/v1/internal/worker/events` (debug in-memory)

## Dataflow quan trong

- `POST /rooms/join` se goi sang Worker: `POST /internal/sessions/start`.
- `POST /rooms/{roomId}/end` se goi sang Worker: `POST /internal/sessions/{session_id}/stop`.

## Ghi chu

- Chua su dung PostgreSQL trong task nay (se o Task 3).
- LiveKit token duoc ky HS256 neu co du `LIVEKIT_API_KEY` va `LIVEKIT_API_SECRET`; neu thieu se tra `token_status=skipped_missing_livekit_credentials`.
- Loi API da duoc chuan hoa format:
  - `{ "error": { "code": "...", "message": "...", "details": ... } }`
  - Danh sach code duoc dinh nghia tai `backend-node/src/types/api-error.ts`.
