# Task 01 - Scaffold Kien Truc V1

## Muc tieu

Dat khung ky thuat de trien khai cac task sau theo `readme/plan.md`:

- Tach service backend Node.js va worker Python.
- Dat contract chung cho metadata/data-channel.
- Co docker-compose baseline voi PostgreSQL.
- Bao toan PoC cu o `sandbox/reference`.

## Pham vi da lam

- Tao `backend-node/` voi route scaffold theo API list V1.
- Tao `worker-python/` voi internal session API (in-memory).
- Tao `shared/contracts/` (JSON Schema + TypeScript interfaces).
- Tao `infra/docker-compose.yml`.
- Copy `main.py`, `server.py`, `pipeline.py` sang `sandbox/reference`.

## Chua lam trong task nay

- Chua implement nghiep vu auth/room/history/settings.
- Chua tich hop LiveKit token va DB.
- Chua chay E2E test vi la skeleton phase.

## Review fixes (sau feedback)

- Backend bo route `/internal/worker/sessions/start` va `/internal/worker/sessions/{sessionId}/stop`.
- Schema data-channel bo `required` cung cho moi event, doi sang rang buoc theo `type` bang `if/then`.
- Docker compose override `DATABASE_URL` backend ve host `postgres` trong network container.
