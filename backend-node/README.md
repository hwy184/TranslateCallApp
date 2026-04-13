# Backend Node (Scaffold)

This service is the V1 API skeleton for room lifecycle and worker orchestration.

## Run (after installing dependencies)

```bash
npm install
npm run migrate
npm run dev
```

## Current state

- `GET /health`: implemented with DB ping.
- `POST /api/v1/auth/guest`: create guest user + local auth session.
- `POST /api/v1/auth/login`: create/reuse registered user + local auth session.
- `POST /api/v1/auth/logout`: revoke local auth session.
- `POST /api/v1/rooms`: create room with host metadata.
- `POST /api/v1/rooms/join`: add guest, then trigger worker session start via HTTP call.
- `POST /api/v1/rooms/{roomId}/end`: end room, then trigger worker session stop via HTTP call.
- `PATCH /api/v1/rooms/{roomId}/participants/{participantId}/settings`: update participant language/voice settings.
- `POST /api/v1/internal/worker/events`: receive worker status events (persisted in PostgreSQL).
- `GET /api/v1/history`: read transcript/history from `transcript_items` table (supports `room_id`, `session_id`, `limit`).
